import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { book_id, page_number } = await req.json();
    
    if (!book_id || !page_number) {
      return new Response(JSON.stringify({ error: 'book_id and page_number are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Regenerating summary for book ${book_id}, page ${page_number}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete the incorrect summary
    const { error: deleteError } = await supabase
      .from('page_summaries')
      .delete()
      .eq('book_id', book_id)
      .eq('page_number', page_number);

    if (deleteError) {
      console.error('Error deleting summary:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete incorrect summary' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully deleted incorrect summary for book ${book_id}, page ${page_number}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Cleared summary for page ${page_number}. It will be regenerated on next view.` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in regenerate-page-summary function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});