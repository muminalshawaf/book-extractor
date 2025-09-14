import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateEmbedding(text: string): Promise<number[]> {
  const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedText?key=${googleApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, 20000)
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Google Embedding API error:', error);
    throw new Error(`Embedding generation failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      book_id, 
      current_page, 
      query_text, 
      max_pages = 3, 
      similarity_threshold = 0.3 
    } = await req.json();
    
    if (!book_id || !current_page || !query_text) {
      return new Response(JSON.stringify({ 
        error: 'book_id, current_page, and query_text are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate embedding for the query text
    const queryEmbedding = await generateEmbedding(query_text);

    // Call the database function to find similar pages
    const { data, error } = await supabase.rpc('match_pages_for_book', {
      target_book_id: book_id,
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: similarity_threshold,
      match_count: max_pages,
      current_page_number: current_page
    });

    if (error) {
      console.error('Error retrieving RAG context:', error);
      return new Response(JSON.stringify({ 
        context: [],
        error: 'Failed to retrieve context'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Transform results for easier consumption
    const context = (data || []).map((row: any) => ({
      pageNumber: row.page_number,
      title: row.title,
      content: row.ocr_text,
      summary: row.summary_md,
      similarity: row.similarity
    }));

    return new Response(JSON.stringify({ context }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in get-rag-context function:', error);
    return new Response(JSON.stringify({ 
      context: [],
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});