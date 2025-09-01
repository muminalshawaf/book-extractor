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
      ? `Analyze this image and extract ALL text content with maximum accuracy. This image contains Arabic educational content with distinct visual sections. Please return a JSON response with the following structure:

{
  "language": "ar",
  "direction": "rtl",
  "page_context": {
    "page_title": "main page title or chapter name",
    "page_type": "table_of_contents|chapter_intro|lesson_content|exercises|examples|summary",
    "main_topics": ["topic1", "topic2", "topic3"],
    "headers": ["header1", "header2", "header3"],
    "has_questions": true/false,
    "has_formulas": true/false,
    "has_examples": true/false
  },
  "sections": [
    {
      "order": 1,
      "type": "main_content|sidebar|header|title|example|exercise|formula|definition",
      "title": "section title if present",
      "content": "full text content of this section"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR CONTENT ANALYSIS AND EXTRACTION:

1. **PAGE CONTEXT ANALYSIS** (Required for page_context):
   - Identify the main page title or chapter name (e.g., "قائمة المحتويات", "الفصل الأول: المخاليط والمحاليل")
   - Determine page type: table_of_contents, chapter_intro, lesson_content, exercises, examples, summary
   - Extract main topics/concepts discussed on the page
   - List all section headers and subheaders found
   - Detect presence of questions (numbered problems, "ماذا قرأت؟", exercises)
   - Detect presence of formulas (mathematical equations, chemical formulas)
   - Detect presence of examples ("مثال", worked problems)

2. **SECTION IDENTIFICATION** (Required for sections array):
   - Classify each distinct visual section by type:
     * "title" - main page titles and chapter headings
     * "header" - section headers and subheaders  
     * "main_content" - primary educational content, paragraphs
     * "sidebar" - boxed content, highlighted areas, supplementary info
     * "example" - worked examples, "مثال" sections
     * "exercise" - practice problems, "مسائل تدريبية"
     * "formula" - mathematical formulas, equations
     * "definition" - vocabulary, key terms, definitions
   - Extract section title if present (header text, example number, etc.)
   - Include complete content for each section

3. **TEXT EXTRACTION REQUIREMENTS**:
   - Preserve exact Arabic text and mathematical formulas
   - Maintain problem numbering and step sequences  
   - Include ALL visible text: titles, headers, content, formulas, questions
   - Use visual cues (fonts, colors, borders, spacing) to identify sections
   - Read multiple columns in correct Arabic order (right to left)
   - Keep mathematical expressions and chemical formulas exactly as written

4. **CONTENT COMPLETENESS**:
   - Extract page titles, chapter names, section headers
   - Capture main educational content and explanations
   - Include all numbered questions and sub-questions
   - Preserve worked examples with step-by-step solutions
   - Extract formulas, equations, and chemical symbols
   - Include boxed text, highlighted content, sidebars
   - Capture vocabulary terms and definitions

Focus on providing rich context metadata while maintaining 100% text accuracy.`
      : `Analyze this image and extract all text with high accuracy. Please return a JSON response with the following structure:

{
  "language": "en",
  "direction": "ltr",
  "page_context": {
    "page_title": "main page title or chapter name",
    "page_type": "table_of_contents|chapter_intro|lesson_content|exercises|examples|summary",
    "main_topics": ["topic1", "topic2", "topic3"],
    "headers": ["header1", "header2", "header3"],
    "has_questions": true/false,
    "has_formulas": true/false,
    "has_examples": true/false
  },
  "sections": [
    {
      "order": 1,
      "type": "main_content|sidebar|header|title|example|exercise|formula|definition",
      "title": "section title if present",
      "content": "full text content of this section"
    }
  ]
}

Instructions:
1. Identify main page title and page type
2. Extract main topics and all headers
3. Detect questions, formulas, and examples
4. Classify each visual section by type
5. If the page has multiple columns, read them in left-to-right order
6. Preserve mathematical formulas, equations, and symbols exactly as they appear
7. Keep problem numbers and maintain their sequence
8. Include any Arabic or other non-English text that appears
9. DO NOT summarize or modify the content - extract exactly as written

Focus on accuracy and structured context metadata.`

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
                threshold: "BLOCK_ONLY_HIGH"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_ONLY_HIGH"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_ONLY_HIGH"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_ONLY_HIGH"
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
      
      // Check if content was blocked by safety filters
      if (candidate.finishReason === 'SAFETY') {
        console.error('Content blocked by safety filters:', candidate.safetyRatings)
        return new Response(
          JSON.stringify({ 
            error: 'Content blocked by safety filters. This appears to be educational chemistry content that was mistakenly flagged.',
            details: 'Safety filters blocked educational chemistry content'
          }), 
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
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
      let pageContext = null
      
      try {
        parsedData = JSON.parse(rawResponse)
        console.log('Successfully parsed JSON response:', parsedData)
        
        // Handle new structured format with sections and page_context
        if (parsedData.sections && Array.isArray(parsedData.sections)) {
          // Sort sections by order
          const sortedSections = parsedData.sections.sort((a, b) => a.order - b.order)
          columnsDetected = sortedSections.length
          direction = parsedData.direction || direction
          pageContext = parsedData.page_context || null
          
          // Join section contents with section headers
          extractedText = sortedSections.map(section => {
            let sectionText = ''
            if (section.title && section.type !== 'title') {
              sectionText += `--- SECTION: ${section.title} ---\n`
            }
            sectionText += section.content
            return sectionText
          }).join('\n\n')
          
          console.log(`Structured layout detected: ${columnsDetected} sections, page type: ${pageContext?.page_type || 'unknown'}`)
        } 
        // Handle legacy format with columns
        else if (parsedData.columns && Array.isArray(parsedData.columns)) {
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
          direction: direction,
          pageContext: pageContext, // Include structured page context
          rawStructuredData: parsedData // Include full structured data for debugging
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