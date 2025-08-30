import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, language = 'ar' } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    if (!DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create language-specific OCR prompt
    const prompt = language === 'ar' 
      ? `استخرج النص من هذه الصورة بدقة تامة. اكتب النص العربي بوضوح مع الحفاظ على التنسيق والبنية الأصلية. إذا كان هناك نص إنجليزي أو أرقام، اكتبها كما هي. لا تضيف أي تفسيرات أو تعليقات، فقط النص المستخرج.`
      : `Extract all text from this image accurately. Preserve the original formatting and structure. Include any numbers, punctuation, and special characters exactly as they appear. Do not add any explanations or comments, just the extracted text.`;

    console.log('Starting DeepSeek OCR for image:', imageUrl);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [imageUrl]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `DeepSeek API error: ${response.status}` }), 
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('DeepSeek OCR completed successfully');

    if (!data.choices || !data.choices[0]?.message?.content) {
      return new Response(
        JSON.stringify({ error: 'Invalid response from DeepSeek API' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedText = data.choices[0].message.content.trim();
    
    // Calculate a confidence score based on text quality
    const confidence = calculateTextConfidence(extractedText);

    return new Response(
      JSON.stringify({ 
        text: extractedText,
        confidence: confidence,
        source: 'deepseek'
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR DeepSeek function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateTextConfidence(text: string): number {
  if (!text || text.length < 3) return 0.1;
  
  // Basic quality indicators
  const hasReasonableLength = text.length > 10;
  const hasWords = /\s/.test(text);
  const notJustSymbols = /[a-zA-Z\u0600-\u06FF\u0750-\u077F]/.test(text);
  const notTooManySpecialChars = (text.match(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F0-9\s.,!?؟،]/g) || []).length < text.length * 0.3;
  
  let score = 0.5; // Base confidence for DeepSeek
  
  if (hasReasonableLength) score += 0.2;
  if (hasWords) score += 0.1;
  if (notJustSymbols) score += 0.15;
  if (notTooManySpecialChars) score += 0.05;
  
  return Math.min(score, 0.95); // Cap at 95%
}