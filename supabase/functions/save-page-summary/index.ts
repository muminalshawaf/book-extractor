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
      ocr_json,
      summary_json
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

    const upsertData = {
      book_id,
      page_number,
      ocr_text,
      summary_md,
      ocr_confidence: ocr_confidence || 0.8,
      confidence: confidence || 0.8,
      ocr_json: ocr_json || null,
      summary_json: summary_json || null,
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

    return new Response(JSON.stringify({ success: true, data }), {
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