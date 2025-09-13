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
    console.log('OCR Fallback function started');
    console.log(`Processing image: ${imageUrl}, language: ${language}`);

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using Gemini 1.5 Flash Vision as fallback OCR model');

    // Fetch and convert image to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to fetch image: ${imageResponse.status}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    
    // Use Deno's standard base64 encoding, handling large images properly
    const bytes = new Uint8Array(imageBuffer);
    
    // Handle large images by chunking to avoid "too many arguments" error
    let binaryString = '';
    const chunkSize = 32768; // 32KB chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const imageBase64 = btoa(binaryString);
    
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Create language-specific OCR prompt for Gemini Pro Vision
    const prompt = language === 'ar' 
      ? `استخرج جميع النص من هذه الصورة بدقة تامة. اكتب النص العربي بوضوح مع الحفاظ على التنسيق والبنية الأصلية. إذا كان هناك نص إنجليزي أو أرقام، اكتبها كما هي. احتفظ بالهيكل والتسلسل المنطقي للمحتوى. لا تضيف أي تفسيرات أو تعليقات، فقط النص المستخرج بالضبط كما يظهر في الصورة.`
      : `Extract all text from this image with complete accuracy. Preserve the original formatting, structure, and logical sequence of content. Include any numbers, punctuation, and special characters exactly as they appear. Maintain proper paragraph breaks and content hierarchy. Do not add any explanations or comments, just the extracted text exactly as it appears in the image.`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          }
        ]
      }],
      generationConfig: {
        maxOutputTokens: 8000, // Reduced for fallback to prevent timeouts
        temperature: 0.1
      }
    };

    console.log('Making request to Gemini Pro Vision API...');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}` }), 
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Gemini Pro Vision OCR completed successfully');

    // Handle various response scenarios
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const extractedText = data.candidates[0].content.parts[0].text.trim();
      
      // Check for error indicators in the response
      const errorIndicators = [
        'لا أستطيع رؤية',
        'لا أملك القدرة',
        'cannot see',
        'cannot process',
        'unable to see',
        'cannot view',
        'no text visible',
        'unclear image'
      ];
      
      const hasErrorIndicator = errorIndicators.some(indicator => 
        extractedText.toLowerCase().includes(indicator.toLowerCase())
      );
      
      if (hasErrorIndicator || extractedText.length < 10) {
        console.log('Gemini indicated inability to process image or text too short');
        return new Response(
          JSON.stringify({ error: 'Gemini model could not extract text from image' }), 
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Calculate confidence score for fallback OCR
      const confidence = calculateTextConfidence(extractedText);
      console.log(`OCR fallback completed with confidence: ${(confidence * 100).toFixed(1)}%`);

      return new Response(
        JSON.stringify({ 
          text: extractedText,
          confidence: confidence,
          source: 'gemini-pro-vision-fallback',
          model_used: 'gemini-1.5-flash'
        }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      console.log('Gemini blocked content due to safety filters');
      return new Response(
        JSON.stringify({ error: 'Content blocked by safety filters' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      console.error('Invalid Gemini API response structure:', JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({ error: 'Invalid response from Gemini API' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('OCR fallback function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateTextConfidence(text: string): number {
  if (!text || text.length < 3) return 0.1;
  
  // Quality indicators for extracted text
  const hasReasonableLength = text.length > 20;
  const hasWords = /\s/.test(text);
  const notJustSymbols = /[a-zA-Z\u0600-\u06FF\u0750-\u077F]/.test(text);
  const notTooManySpecialChars = (text.match(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F0-9\s.,!?؟،]/g) || []).length < text.length * 0.3;
  const hasStructure = /\n/.test(text) || /\./.test(text); // Has line breaks or sentences
  
  let score = 0.5; // Base confidence for fallback OCR
  
  if (hasReasonableLength) score += 0.2;
  if (hasWords) score += 0.15;
  if (notJustSymbols) score += 0.1;
  if (notTooManySpecialChars) score += 0.1;
  if (hasStructure) score += 0.05;
  
  return Math.min(score, 0.9); // Cap at 90% for fallback
}