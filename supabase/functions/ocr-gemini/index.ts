import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { imageUrl, language = 'en' } = await req.json()
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing imageUrl parameter' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      console.error('GOOGLE_API_KEY not found in environment')
      return new Response(
        JSON.stringify({ error: 'Google API key not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing OCR request for image: ${imageUrl.substring(0, 100)}...`)
    console.log(`Language: ${language}`)

    // Fetch the image
    let imageResponse
    try {
      imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`)
      }
    } catch (error) {
      console.error('Image fetch error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image from URL' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert image to base64
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'

    // Prepare the prompt based on language
    const isArabic = language === 'ar'
    const prompt = isArabic 
      ? `Extract all text from this image with high accuracy. This image contains Arabic text. Please:
1. Preserve the original text layout and structure
2. Maintain proper Arabic text direction (right-to-left)
3. Keep mathematical formulas, equations, and symbols intact
4. Include any English text or numbers that appear
5. Preserve paragraph breaks and formatting
6. Only return the extracted text, nothing else

Focus on accuracy and completeness. If there are equations or formulas, preserve them exactly as they appear.`
      : `Extract all text from this image with high accuracy. Please:
1. Preserve the original text layout and structure
2. Keep mathematical formulas, equations, and symbols intact
3. Include any Arabic or other non-English text that appears
4. Preserve paragraph breaks and formatting
5. Only return the extracted text, nothing else

Focus on accuracy and completeness. If there are equations or formulas, preserve them exactly as they appear.`

    // Call Google Gemini API
    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 32,
              topP: 1,
              maxOutputTokens: 8192,
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
              }
            ]
          })
        }
      )

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text()
        console.error('Gemini API error:', geminiResponse.status, errorText)
        return new Response(
          JSON.stringify({ error: `Gemini API error: ${geminiResponse.status}` }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const geminiResult = await geminiResponse.json()
      console.log('Gemini API response structure:', JSON.stringify(geminiResult, null, 2))

      if (!geminiResult.candidates || geminiResult.candidates.length === 0) {
        console.error('No candidates in Gemini response')
        return new Response(
          JSON.stringify({ error: 'No text extraction results from Gemini' }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const candidate = geminiResult.candidates[0]
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        console.error('Invalid candidate structure:', candidate)
        return new Response(
          JSON.stringify({ error: 'Invalid response structure from Gemini' }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const extractedText = candidate.content.parts[0].text || ''
      
      // Calculate confidence based on text quality
      let confidence = 0.85 // Base confidence for Gemini
      
      // Adjust confidence based on text characteristics
      const textLength = extractedText.length
      if (textLength > 100) confidence += 0.05
      if (textLength > 500) confidence += 0.05
      
      // Check for Arabic text if Arabic language was requested
      if (isArabic) {
        const arabicChars = (extractedText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
        if (arabicChars > 10) confidence += 0.05
      }
      
      // Cap confidence at 0.95
      confidence = Math.min(confidence, 0.95)

      console.log(`OCR completed successfully. Text length: ${textLength}, Confidence: ${confidence}`)

      return new Response(
        JSON.stringify({
          text: extractedText,
          confidence: confidence,
          source: 'gemini',
          language: language
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } catch (error) {
      console.error('Error calling Gemini API:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to process with Gemini API' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})