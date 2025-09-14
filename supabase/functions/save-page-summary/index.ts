import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { detectHasFormulasInOCR, detectHasExamplesInOCR, detectFormulasInSummary, detectApplicationsInSummary } from '../_shared/templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate embedding by calling the existing generate-embedding function
async function generateEmbedding(text: string): Promise<number[]> {
  console.log('Starting embedding generation...');
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  console.log('Environment check for embedding:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseKey,
    urlLength: supabaseUrl?.length,
    keyLength: supabaseKey?.length
  });
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables not configured for embedding generation');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ text: text.slice(0, 20000) }),
  });

  console.log('Embedding API response status:', response.status);

  if (!response.ok) {
    const error = await response.text();
    console.error('Generate embedding function error:', error);
    throw new Error(`Embedding generation failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('Embedding response data:', { 
    hasEmbedding: !!data.embedding, 
    embeddingLength: data.embedding?.length 
  });
  
  return data.embedding || [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Save page summary function started')
    
    const requestBody = await req.json()
    console.log('Request body received:', JSON.stringify(requestBody))
    
    const { 
      book_id, 
      page_number, 
      ocr_text, 
      summary_md, 
      ocr_confidence, 
      confidence,
      rag_metadata,
      rag_pages_sent,
      rag_pages_found,
      rag_pages_sent_list,
      rag_context_chars,
      // NEW VALIDATION PARAMETERS
      compliance_score,
      validation_meta,
      strict_validated,
      provider_used
    } = requestBody

    console.log(`Saving summary for book ${book_id}, page ${page_number}`)

    // Validate required fields
    if (!book_id || !page_number) {
      throw new Error('Missing required fields: book_id and page_number are required')
    }

    // Server-side anti-hallucination auto-sanitization
    let finalSummaryMd = summary_md;
    let wasSanitized = false;
    let removedSections: string[] = [];
    
    try {
      const ocr = (ocr_text || '').toString();
      let sum = (summary_md || '').toString();
      const hasFormulasOCR = detectHasFormulasInOCR(ocr);
      const hasExamplesOCR = detectHasExamplesInOCR(ocr);
      const hasFormulasSummary = detectFormulasInSummary(sum);
      const hasApplicationsSummary = detectApplicationsInSummary(sum);

      console.log('Anti-hallucination flags:', { hasFormulasOCR, hasExamplesOCR, hasFormulasSummary, hasApplicationsSummary });
      const violations: string[] = [];
      if (hasFormulasSummary && !hasFormulasOCR) violations.push('FORMULAS_NOT_IN_OCR');
      if (hasApplicationsSummary && !hasExamplesOCR) violations.push('APPLICATIONS_NOT_IN_OCR');

      if (violations.length > 0) {
        console.warn('Anti-hallucination violations detected - auto-sanitizing...', { violations });
        
        const { sanitizeSummary } = await import('./_shared/sanitizer.ts');
        const sanitizationResult = sanitizeSummary(sum, ocr, violations);
        
        finalSummaryMd = sanitizationResult.sanitizedContent;
        wasSanitized = sanitizationResult.wasSanitized;
        removedSections = sanitizationResult.removedSections;
        
        console.log('✅ Auto-sanitization completed:', {
          wasSanitized,
          removedSections,
          originalLength: sum.length,
          sanitizedLength: finalSummaryMd.length
        });
      }
    } catch (gateError) {
      console.error('Anti-hallucination gate error (non-fatal):', gateError);
      // Continue with original content if sanitization fails
      finalSummaryMd = summary_md;
    }

    // Create Supabase client with service role key for database writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
      urlLength: supabaseUrl?.length,
      keyLength: serviceRoleKey?.length
    })

    const supabaseAdmin = createClient(
      supabaseUrl ?? '',
      serviceRoleKey ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        }
      }
    )

    // Ensure book exists before creating page summary
    const { error: bookError } = await supabaseAdmin
      .from('books')
      .upsert({
        id: book_id,
        title: `كتاب ${book_id}`, // Default title, can be updated later
        subject: book_id.includes('chemistry') ? 'Chemistry' : 
                 book_id.includes('physics') ? 'Physics' : 
                 book_id.includes('artificialintelligence') || book_id.includes('ai') ? 'Artificial Intelligence' : 
                 book_id.includes('math') ? 'Mathematics' : 'Unknown',
        grade: parseInt(book_id.match(/(\d+)/)?.[1] || '12'),
        semester_range: book_id.includes('-') ? book_id.split('-').pop() || '1' : '1'
      }, { 
        onConflict: 'id',
        ignoreDuplicates: true 
      })

    if (bookError && !bookError.message.includes('duplicate key')) {
      console.error('Error ensuring book exists:', bookError)
      // Continue anyway - the book might already exist
    }

    const upsertData: any = {
      book_id,
      page_number,
      ocr_text,
      summary_md: finalSummaryMd, // Use sanitized content
      ocr_confidence: ocr_confidence || 0.8,
      confidence: confidence || 0.8,
      summary_json: rag_metadata || null,
      updated_at: new Date().toISOString(),
      sanitized: wasSanitized,
      validation_meta: wasSanitized ? { removedSections, violations: removedSections } : null
    }

    // Only include RAG fields if they are provided (not undefined)
    if (rag_pages_sent !== undefined) {
      upsertData.rag_pages_sent = rag_pages_sent;
    }
    if (rag_pages_found !== undefined) {
      upsertData.rag_pages_found = rag_pages_found;
    }
    if (rag_pages_sent_list !== undefined) {
      upsertData.rag_pages_sent_list = rag_pages_sent_list;
    }
    if (rag_context_chars !== undefined) {
      upsertData.rag_context_chars = rag_context_chars;
    }

    // Add validation metadata fields
    if (compliance_score !== undefined) {
      upsertData.compliance_score = compliance_score;
    }
    if (validation_meta !== undefined) {
      upsertData.validation_meta = validation_meta;
    }
    if (strict_validated !== undefined) {
      upsertData.strict_validated = strict_validated;
    }
    if (provider_used !== undefined) {
      upsertData.provider_used = provider_used;
    }

    console.log('RAG fields being saved:', {
      rag_pages_sent: rag_pages_sent,
      rag_pages_found: rag_pages_found,
      rag_pages_sent_list: rag_pages_sent_list?.length,
      rag_context_chars: rag_context_chars
    });
    
    console.log('Attempting upsert with data:', JSON.stringify(upsertData))

    const { data, error } = await supabaseAdmin
      .from('page_summaries')
      .upsert(upsertData, { 
        onConflict: 'book_id,page_number',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error('Database error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`Successfully saved page summary for page ${page_number}`, data)

    // Generate and save embedding if OCR text exists
    let embeddingResult = null;
    if (ocr_text && ocr_text.trim().length > 0) {
      try {
        console.log('Generating embedding for OCR text...');
        const embedding = await generateEmbedding(ocr_text);
        
        if (embedding && embedding.length > 0) {
          console.log(`Generated embedding with ${embedding.length} dimensions`);
          
          // Update the page summary with the embedding
          const { error: embeddingError } = await supabaseAdmin
            .from('page_summaries')
            .update({
              embedding: `[${embedding.join(',')}]`,
              embedding_model: 'text-embedding-004',
              embedding_updated_at: new Date().toISOString()
            })
            .eq('book_id', book_id)
            .eq('page_number', page_number);

          if (embeddingError) {
            console.error('Error saving embedding:', embeddingError);
            // Don't throw - embedding is optional
          } else {
            console.log('Successfully saved embedding');
            embeddingResult = { 
              dimensions: embedding.length, 
              model: 'text-embedding-004' 
            };
          }
        }
      } catch (embeddingError) {
        console.error('Error generating embedding:', embeddingError);
        // Don't throw - embedding is optional, continue with main operation
      }
    } else {
      console.log('No OCR text available for embedding generation');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data,
      embedding: embeddingResult,
      sanitized: wasSanitized,
      removedSections: wasSanitized ? removedSections : []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in save-page-summary function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})