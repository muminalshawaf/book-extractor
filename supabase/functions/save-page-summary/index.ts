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
    
    const { 
      book_id, 
      page_number, 
      ocr_text, 
      summary_md, 
      ocr_confidence, 
      confidence 
    } = await req.json()

    console.log(`Saving summary for book ${book_id}, page ${page_number}`)

    // Create Supabase client with service role key for database writes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseAdmin
      .from('page_summaries')
      .upsert({
        book_id,
        page_number,
        ocr_text,
        summary_md,
        ocr_confidence: ocr_confidence || 0.8,
        confidence: confidence || 0.8,
        updated_at: new Date().toISOString()
      })
      .select()

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log(`Successfully saved page summary for page ${page_number}`)

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