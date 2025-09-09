import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      rag_context_chars
    } = requestBody

    console.log(`Saving summary for book ${book_id}, page ${page_number}`)

    // Validate required fields
    if (!book_id || !page_number) {
      throw new Error('Missing required fields: book_id and page_number are required')
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

    const upsertData = {
      book_id,
      page_number,
      ocr_text,
      summary_md,
      ocr_confidence: ocr_confidence || 0.8,
      confidence: confidence || 0.8,
      summary_json: rag_metadata || null,
      rag_pages_sent: rag_pages_sent || 0,
      rag_pages_found: rag_pages_found || 0,
      rag_pages_sent_list: rag_pages_sent_list || [],
      rag_context_chars: rag_context_chars || 0,
      updated_at: new Date().toISOString()
    }
    
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
      embedding: embeddingResult
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