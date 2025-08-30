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
    console.log('OCR Gemini function started')
    
    const { imageUrl, language = 'en' } = await req.json()
    console.log('Request parsed successfully:', { imageUrl: imageUrl?.substring(0, 100) + '...', language })
    
    if (!imageUrl) {
      console.error('Missing imageUrl parameter')
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
    
    console.log('Google API key found, length:', apiKey.length)

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
    console.log('Converting image to base64...')
    const imageBuffer = await imageResponse.arrayBuffer()
    console.log('Image buffer size:', imageBuffer.byteLength)
    
    // Use TextEncoder and btoa for large images
    const uint8Array = new Uint8Array(imageBuffer)
    let binary = ''
    const len = uint8Array.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const base64Image = btoa(binary)
    
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'
    console.log('Base64 conversion complete, mime type:', mimeType)

    // Prepare the prompt based on language
    const isArabic = language === 'ar'
    const prompt = isArabic 
      ? `Analyze this image and extract all text with high accuracy. This image contains Arabic text and may have multiple columns. Please return a JSON response with the following structure:

{
  "language": "ar",
  "direction": "rtl",
  "columns": [
    {"order": 1, "text": "content of first column to read"},
    {"order": 2, "text": "content of second column to read"}
  ]
}

Instructions:
1. If the page has multiple columns, read them in the correct Arabic reading order (right-to-left)
2. For single column pages, still use the JSON format with one column
3. Preserve mathematical formulas, equations, and symbols exactly as they appear
4. Include problem numbers (13., 14., 15., etc.) and maintain their sequence
5. Keep units (ml, L, %, etc.) exactly as written
6. Ignore headers, footers, page numbers, and navigation elements
7. Maintain paragraph breaks within each column
8. Include any English text or numbers that appear
9. DO NOT summarize or modify the content - extract exactly as written

Focus on accuracy and completeness. The order field should reflect the correct reading sequence for Arabic (rightmost column = order 1).`
      : `Analyze this image and extract all text with high accuracy. Please return a JSON response with the following structure:

{
  "language": "en",
  "direction": "ltr",
  "columns": [
    {"order": 1, "text": "content of first column to read"},
    {"order": 2, "text": "content of second column to read"}
  ]
}

Instructions:
1. If the page has multiple columns, read them in left-to-right order
2. For single column pages, still use the JSON format with one column
3. Preserve mathematical formulas, equations, and symbols exactly as they appear
4. Keep problem numbers and maintain their sequence
5. Ignore headers, footers, page numbers, and navigation elements
6. Maintain paragraph breaks within each column
7. Include any Arabic or other non-English text that appears
8. DO NOT summarize or modify the content - extract exactly as written

Focus on accuracy and completeness.`

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
              response_mime_type: "application/json"
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

      const rawResponse = candidate.content.parts[0].text || ''
      
      // Try to parse JSON response
      let parsedData
      let extractedText = ''
      let columnsDetected = 0
      let direction = isArabic ? 'rtl' : 'ltr'
      
      try {
        parsedData = JSON.parse(rawResponse)
        console.log('Successfully parsed JSON response:', parsedData)
        
        if (parsedData.columns && Array.isArray(parsedData.columns)) {
          // Sort columns by order
          const sortedColumns = parsedData.columns.sort((a, b) => a.order - b.order)
          columnsDetected = sortedColumns.length
          direction = parsedData.direction || direction
          
          // Join column texts with double line breaks
          extractedText = sortedColumns.map(col => col.text).join('\n\n')
          
          console.log(`Multi-column layout detected: ${columnsDetected} columns, direction: ${direction}`)
        } else {
          // Fallback to treating as single text block
          extractedText = parsedData.text || rawResponse
          columnsDetected = 1
        }
      } catch (jsonError) {
        console.log('Failed to parse JSON, treating as plain text:', jsonError.message)
        // Fallback to plain text
        extractedText = rawResponse
        columnsDetected = 1
      }
      
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

      console.log(`OCR completed successfully. Text length: ${textLength}, Confidence: ${confidence}, Columns: ${columnsDetected}`)

      return new Response(
        JSON.stringify({
          text: extractedText,
          confidence: confidence,
          source: 'gemini',
          language: language,
          columnsDetected: columnsDetected,
          direction: direction
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
    console.error('Unexpected error in OCR function:', error)
    console.error('Error stack:', error.stack)
    console.error('Error message:', error.message)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack 
      }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})