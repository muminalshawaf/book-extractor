import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Process complete book function started')
    
    const requestBody = await req.json()
    console.log('Request body received:', JSON.stringify(requestBody))
    
    const { book_id, total_pages, base_page_url } = requestBody

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

    // Start batch processing for all pages
    const batchSize = 5 // Process in small batches to avoid timeouts
    const totalBatches = Math.ceil(total_pages / batchSize)
    let processedPages = 0
    let errors = 0

    console.log(`Starting batch processing: ${totalBatches} batches of ${batchSize} pages each`)

    // Process pages in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startPage = batchIndex * batchSize + 1
      const endPage = Math.min(startPage + batchSize - 1, total_pages)
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: pages ${startPage}-${endPage}`)
      
      // Create initial page summary entries for this batch
      const pageSummaryData = []
      
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        pageSummaryData.push({
          book_id,
          page_number: pageNum,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }

      // Insert initial page summaries (will be processed later by admin interface)
      const { error: insertError } = await supabaseAdmin
        .from('page_summaries')
        .upsert(pageSummaryData, { 
          onConflict: 'book_id,page_number',
          ignoreDuplicates: true 
        })

      if (insertError) {
        console.error(`Batch ${batchIndex + 1} insertion error:`, insertError)
        errors += (endPage - startPage + 1)
      } else {
        processedPages += (endPage - startPage + 1)
        console.log(`Batch ${batchIndex + 1} completed: ${processedPages}/${total_pages} pages`)
      }

      // Small delay between batches to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Update book with processing status
    const { error: updateError } = await supabaseAdmin
      .from('books')
      .update({ 
        updated_at: new Date().toISOString(),
        // Add a processing status field if needed
      })
      .eq('id', book_id)

    if (updateError) {
      console.error('Error updating book processing status:', updateError)
    }

    console.log(`Complete book processing finished: ${processedPages} pages processed, ${errors} errors`)

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Book ${book_id} processing started`,
      total_pages: total_pages,
      processed_pages: processedPages,
      errors: errors,
      batches_processed: totalBatches
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