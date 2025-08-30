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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create language-specific OCR prompt
    const prompt = language === 'ar' 
      ? `استخرج جميع النص من هذه الصورة بدقة تامة. اكتب النص العربي بوضوح مع الحفاظ على التنسيق والبنية الأصلية. إذا كان هناك نص إنجليزي أو أرقام، اكتبها كما هي. لا تضيف أي تفسيرات أو تعليقات، فقط النص المستخرج بالضبط كما يظهر في الصورة.`
      : `Extract all text from this image accurately. Preserve the original formatting and structure. Include any numbers, punctuation, and special characters exactly as they appear. Do not add any explanations or comments, just the extracted text exactly as it appears in the image.`;

    console.log('Starting OpenAI Vision OCR for image:', imageUrl);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }), 
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('OpenAI Vision OCR completed successfully');

    if (!data.choices || !data.choices[0]?.message?.content) {
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedText = data.choices[0].message.content.trim();
    
    // Check if the response indicates inability to process images
    const errorIndicators = [
      'لا أستطيع رؤية',
      'لا أملك القدرة',
      'cannot see',
      'cannot process',
      'unable to see',
      'cannot view'
    ];
    
    const hasErrorIndicator = errorIndicators.some(indicator => 
      extractedText.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (hasErrorIndicator || extractedText.length < 10) {
      return new Response(
        JSON.stringify({ error: 'AI model could not extract text from image' }), 
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Calculate a confidence score based on text quality
    const confidence = calculateTextConfidence(extractedText);

    return new Response(
      JSON.stringify({ 
        text: extractedText,
        confidence: confidence,
        source: 'openai-vision'
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Vision OCR function error:', error);
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
  
  let score = 0.6; // Base confidence for AI vision
  
  if (hasReasonableLength) score += 0.2;
  if (hasWords) score += 0.1;
  if (notJustSymbols) score += 0.1;
  if (notTooManySpecialChars) score += 0.05;
  
  return Math.min(score, 0.95); // Cap at 95%
}