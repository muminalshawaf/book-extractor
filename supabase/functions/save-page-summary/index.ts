import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars');
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const book_id = String(body?.book_id || '').trim();
    const page_number = Number(body?.page_number);
    const ocr_text = typeof body?.ocr_text === 'string' ? body.ocr_text : null;
    const summary_md = typeof body?.summary_md === 'string' ? body.summary_md : null;
    const confidence = typeof body?.confidence === 'number' ? body.confidence : null;
    const ocr_confidence = typeof body?.ocr_confidence === 'number' ? body.ocr_confidence : null;
    const confidence_meta = body?.confidence_meta && typeof body.confidence_meta === 'object' ? body.confidence_meta : null;

    if (!book_id || !Number.isFinite(page_number) || page_number < 1) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: Record<string, any> = { book_id, page_number, ocr_text, summary_md };
    if (confidence !== null) payload.confidence = confidence;
    if (ocr_confidence !== null) payload.ocr_confidence = ocr_confidence;
    if (confidence_meta !== null) payload.confidence_meta = confidence_meta;

    const { data, error } = await supabase
      .from('page_summaries')
      .upsert(payload, { onConflict: 'book_id,page_number' })
      .select()
      .single();

    if (error) {
      console.error('Upsert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, record: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('save-page-summary failed:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
