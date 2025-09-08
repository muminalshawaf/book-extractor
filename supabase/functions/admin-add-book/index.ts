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
    console.log('Admin add book function started')
    
    const requestBody = await req.json()
    console.log('Request body received:', JSON.stringify(requestBody))
    
    const { 
      book_id, 
      title,
      subject,
      grade,
      semester_range,
      description,
      base_page_url,
      total_pages
    } = requestBody

    console.log(`Adding book: ${book_id}`)

    // Validate required fields
    if (!book_id || !title || !subject || !grade || !semester_range) {
      throw new Error('Missing required fields: book_id, title, subject, grade, and semester_range are required')
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

    const bookData = {
      id: book_id,
      title,
      subject,
      grade: parseInt(grade),
      semester_range,
      description,
      base_page_url,
      total_pages: total_pages ? parseInt(total_pages) : null,
      updated_at: new Date().toISOString()
    }
    
    console.log('Attempting upsert with data:', JSON.stringify(bookData))

    const { data, error } = await supabaseAdmin
      .from('books')
      .upsert(bookData, { 
        onConflict: 'id',
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

    console.log(`Successfully added/updated book: ${book_id}`, data)

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in admin-add-book function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})