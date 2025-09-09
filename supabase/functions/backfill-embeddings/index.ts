import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingResponse {
  embedding: number[];
}

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
        content: {
          parts: [{ text: text.slice(0, 20000) }] // Limit text length
        }
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

async function addJitteredDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { book_id, force_regenerate = false, batch_size = 5 } = await req.json();
    
    if (!book_id) {
      return new Response(JSON.stringify({ error: 'book_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting embedding backfill for book: ${book_id}`);

    // Get pages that need embeddings
    const { data: pages, error: fetchError } = await supabase
      .from('page_summaries')
      .select('id, page_number, ocr_text, embedding')
      .eq('book_id', book_id)
      .not('ocr_text', 'is', null)
      .order('page_number');

    if (fetchError) {
      console.error('Error fetching pages:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch pages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const pagesToProcess = pages?.filter(page => 
      force_regenerate || !page.embedding
    ) || [];

    if (pagesToProcess.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No pages need embedding generation',
        total_pages: pages?.length || 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing ${pagesToProcess.length} pages in batches of ${batch_size}`);

    let processed = 0;
    let errors = 0;

    // Process in batches to manage rate limits
    for (let i = 0; i < pagesToProcess.length; i += batch_size) {
      const batch = pagesToProcess.slice(i, i + batch_size);
      
      await Promise.all(batch.map(async (page) => {
        try {
          // Generate embedding
          const embedding = await generateEmbedding(page.ocr_text);
          
          // Update page with embedding
          const { error: updateError } = await supabase
            .from('page_summaries')
            .update({
              embedding,
              embedding_model: 'text-embedding-004',
              embedding_updated_at: new Date().toISOString()
            })
            .eq('id', page.id);

          if (updateError) {
            console.error(`Error updating page ${page.page_number}:`, updateError);
            errors++;
          } else {
            processed++;
            console.log(`✅ Generated embedding for page ${page.page_number}`);
          }
        } catch (error) {
          console.error(`Error processing page ${page.page_number}:`, error);
          errors++;
        }
      }));

      // Rate limiting delay between batches
      if (i + batch_size < pagesToProcess.length) {
        await addJitteredDelay(1000, 2000); // 1-2 second delay
      }
    }

    const response = {
      message: 'Embedding backfill completed',
      book_id,
      total_pages: pages?.length || 0,
      pages_processed: processed,
      errors,
      success_rate: processed / (processed + errors)
    };

    console.log('Backfill summary:', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in backfill-embeddings function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});