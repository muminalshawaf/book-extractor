import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to call other edge functions
async function callEdgeFunction(functionName: string, payload: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey
    },
    body: JSON.stringify(payload)
  })
  
  if (!response.ok) {
    throw new Error(`${functionName} function failed: ${response.statusText}`)
  }
  
  return await response.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Process complete book function started')
    
    const requestBody = await req.json()
    console.log('Request body received:', JSON.stringify(requestBody))
    
    const { book_id, total_pages, base_page_url, title } = requestBody

    // Validate required fields
    if (!book_id || !total_pages || !base_page_url) {
      throw new Error('Missing required fields: book_id, total_pages, and base_page_url are required')
    }

    console.log(`Processing complete book: ${book_id} with ${total_pages} pages`)

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
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

    // Start background task for processing all pages with OCR and summaries
    const backgroundProcessing = async () => {
      const batchSize = 3 // Smaller batches for OCR processing
      const totalBatches = Math.ceil(total_pages / batchSize)
      let processedPages = 0
      let errors = 0

      console.log(`Starting background OCR processing: ${totalBatches} batches of ${batchSize} pages each`)

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startPage = batchIndex * batchSize + 1
        const endPage = Math.min(startPage + batchSize - 1, total_pages)
        
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: pages ${startPage}-${endPage}`)
        
        // Process each page in the batch
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          try {
            console.log(`Processing page ${pageNum}/${total_pages}`)
            
            // Generate page URL (zero-padded webp format)
            const pageNumber = (pageNum - 1).toString().padStart(5, '0')
            const pageUrl = `${base_page_url}/${pageNumber}.webp`
            
            // Step 1: OCR the page
            let ocrResult
            try {
              ocrResult = await callEdgeFunction('ocr-gemini', {
                imageUrl: pageUrl,
                language: 'ar'
              })
            } catch (ocrError) {
              console.log(`OCR Gemini failed for page ${pageNum}, trying fallback...`)
              ocrResult = await callEdgeFunction('ocr-fallback', {
                imageUrl: pageUrl,
                language: 'ar'
              })
            }
            
            const ocrText = ocrResult.text || ''
            const ocrConfidence = ocrResult.confidence || 0.8
            
            console.log(`Page ${pageNum}: OCR completed (${ocrText.length} chars)`)
            
            // Step 2: Generate summary if OCR was successful
            let summary = ''
            if (ocrText && ocrText.length > 50) {
              try {
                const summaryResult = await callEdgeFunction('summarize', {
                  text: ocrText,
                  lang: 'ar',
                  page: pageNum,
                  title: title || book_id,
                  ocrData: ocrResult
                })
                summary = summaryResult.summary || ''
                console.log(`Page ${pageNum}: Summary generated (${summary.length} chars)`)
              } catch (summaryError) {
                console.error(`Page ${pageNum}: Summary generation failed:`, summaryError)
              }
            }
            
            // Step 3: Save to database
            const { error: upsertError } = await supabaseAdmin
              .from('page_summaries')
              .upsert({
                book_id,
                page_number: pageNum,
                ocr_text: ocrText,
                summary_md: summary,
                ocr_confidence: ocrConfidence,
                confidence: summary ? 0.8 : 0.0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { 
                onConflict: 'book_id,page_number',
                ignoreDuplicates: false 
              })

            if (upsertError) {
              console.error(`Page ${pageNum}: Database save failed:`, upsertError)
              errors++
            } else {
              processedPages++
              console.log(`Page ${pageNum}: Successfully processed and saved`)
            }
            
          } catch (pageError) {
            console.error(`Page ${pageNum}: Processing failed:`, pageError)
            errors++
          }
          
          // Add delay between pages to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        
        // Longer delay between batches
        await new Promise(resolve => setTimeout(resolve, 5000))
      }

      console.log(`Background processing completed: ${processedPages} pages processed, ${errors} errors`)
      
      // Update book with final processing status
      await supabaseAdmin
        .from('books')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', book_id)
    }

    // Start background processing using EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(backgroundProcessing())

    // Create initial empty page summary entries for immediate availability
    const batchSize = 10
    const totalBatches = Math.ceil(total_pages / batchSize)
    let initialEntries = 0

    console.log(`Creating initial entries: ${totalBatches} batches of ${batchSize} pages each`)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startPage = batchIndex * batchSize + 1
      const endPage = Math.min(startPage + batchSize - 1, total_pages)
      
      const pageSummaryData = []
      
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        pageSummaryData.push({
          book_id,
          page_number: pageNum,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }

      const { error: insertError } = await supabaseAdmin
        .from('page_summaries')
        .upsert(pageSummaryData, { 
          onConflict: 'book_id,page_number',
          ignoreDuplicates: true 
        })

      if (!insertError) {
        initialEntries += (endPage - startPage + 1)
      }
    }

    console.log(`Complete book processing initiated: ${initialEntries} initial entries created, background processing started`)

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Book ${book_id} processing started`,
      total_pages: total_pages,
      initial_entries: initialEntries,
      background_processing: true,
      note: 'Pages will be processed with OCR and summaries in the background'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in process-complete-book function:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Complete book processing failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})