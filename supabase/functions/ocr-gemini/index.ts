import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to post-process text and identify/format multiple choice questions
function postProcessMultipleChoice(rawText: string, sections: any[]): string {
  console.log('Starting post-processing for multiple choice questions...')
  
  // Combine all text from sections to work with
  const allText = sections.map(section => section.content || '').join('\n')
  
  // Try to identify multiple choice patterns in the entire text
  const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  const processedSections: string[] = []
  let i = 0
  
  while (i < sections.length) {
    const section = sections[i]
    
    if (section.type === 'exercise' && section.content) {
      // Look for MC options in the raw text around this question
      const questionText = section.content.trim()
      
      // Search for MC options in subsequent text
      const mcOptions = findMultipleChoiceOptions(allText, questionText)
      
      if (mcOptions.length >= 3) { // Consider it MC if we find at least 3 options
        // Format as multiple choice
        let formattedSection = `--- SECTION: ${section.title} ---\n`
        formattedSection += `Question Text: ${questionText}\n`
        formattedSection += `Options:\n`
        mcOptions.forEach(option => {
          formattedSection += `${option}\n`
        })
        processedSections.push(formattedSection)
        console.log(`Found MC question: ${section.title} with ${mcOptions.length} options`)
      } else {
        // Regular question format
        let sectionText = ''
        if (section.title && section.type !== 'title') {
          sectionText += `--- SECTION: ${section.title} ---\n`
        }
        sectionText += section.content
        processedSections.push(sectionText)
      }
    } else if (section.content && section.content.trim()) {
      // Non-exercise sections
      let sectionText = ''
      if (section.title && section.type !== 'title') {
        sectionText += `--- SECTION: ${section.title} ---\n`
      }
      sectionText += section.content
      processedSections.push(sectionText)
    }
    i++
  }
  
  return processedSections.join('\n\n')
}

// Function to find multiple choice options related to a question
function findMultipleChoiceOptions(fullText: string, questionText: string): string[] {
  const options: string[] = []
  
  // Pattern to match MC options: a. some text, b. some text, etc.
  const englishMcRegex = /^[a-d]\.\s*(.+)$/gm
  const arabicMcRegex = /^[أابجد]\.\s*(.+)$/gm
  
  // Try to find the question in the full text
  const questionIndex = fullText.indexOf(questionText)
  if (questionIndex === -1) return options
  
  // Look for options in the text after the question (next 500 characters)
  const searchText = fullText.substring(questionIndex, questionIndex + 500)
  
  // Find English options
  let match
  while ((match = englishMcRegex.exec(searchText)) !== null) {
    const optionText = match[0].trim()
    if (optionText && !options.includes(optionText)) {
      options.push(optionText)
    }
  }
  
  // Find Arabic options if no English ones found
  if (options.length === 0) {
    while ((match = arabicMcRegex.exec(searchText)) !== null) {
      const optionText = match[0].trim()
      if (optionText && !options.includes(optionText)) {
        options.push(optionText)
      }
    }
  }
  
  return options.slice(0, 4) // Return max 4 options
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

    // Clean, simple prompt for text extraction
    const prompt = isArabic 
      ? `Extract all text from this educational page accurately. Return valid JSON in this format:

{
  "language": "ar",
  "direction": "rtl",
  "page_context": {
    "page_title": "main page title",
    "page_type": "lesson_content|exercises|examples",
    "main_topics": ["topic1", "topic2"],
    "headers": ["header1", "header2"],
    "has_questions": true,
    "has_formulas": false,
    "has_examples": false,
    "has_visual_elements": false
  },
  "sections": [
    {
      "order": 1,
      "type": "title|header|main_content|exercise|formula",
      "title": "section title or null",
      "content": "exact text content"
    }
  ],
  "visual_elements": [
    {
      "type": "graph|chart|diagram|table",
      "title": "figure title",
      "description": "visual description",
      "key_values": ["value1", "value2"],
      "educational_context": "purpose of visual"
    }
  ]
}

Instructions:
1. Extract ALL visible text exactly as it appears
2. Identify questions by number (1., 2., 3., etc.)
3. For multiple choice questions, include all options (a., b., c., d. or أ., ب., ج., د.)
4. Capture table data and visual elements
5. Preserve mathematical formulas and Arabic text
6. Maintain proper order and structure

Return only clean, valid JSON.`
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
    "has_examples": true/false,
    "has_visual_elements": true/false
  },
  "sections": [
    {
      "order": 1,
      "type": "main_content|sidebar|header|title|example|exercise|formula|definition",
      "title": "section title if present",
      "content": "full text content of this section"
    }
  ],
  "visual_elements": [
    {
      "type": "graph|chart|diagram|figure|image|table",
      "title": "figure title or caption if visible",
      "description": "detailed description of visual content",
      "axes_labels": {
        "x_axis": "x-axis label and units if applicable",
        "y_axis": "y-axis label and units if applicable"
      },
      "data_description": "description of data points, trends, patterns",
      "key_values": ["important values, ranges, or measurements shown"],
      "educational_context": "how this visual relates to the lesson/question",
      "estimated": true/false
    }
  ]
}

Instructions:
1. Identify main page title and page type
2. Extract main topics and all headers
3. Detect questions, formulas, examples, and visual elements
4. Classify each visual section by type
5. If the page has multiple columns, read them in left-to-right order
6. Preserve mathematical formulas, equations, and symbols exactly as they appear
7. Keep problem numbers and maintain their sequence
8. Include any Arabic or other non-English text that appears
9. For graphs/charts/visual elements: describe axes, data points, trends, and educational purpose
10. DO NOT summarize or modify the content - extract exactly as written

Focus on accuracy and structured context metadata.`

    // Call Google Gemini API with 2.0 Flash for better visual understanding
    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
              temperature: 0.01,
              topK: 1,
              topP: 0.85,
              maxOutputTokens: 32768, // Maintained for comprehensive extraction
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
      
      // Check if response was truncated due to token limits
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn('OCR response was truncated due to token limit. Consider splitting the image or using a higher token limit.')
        // Continue processing but flag as potentially incomplete
      }
      
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        console.error('Invalid candidate structure:', candidate)
        return new Response(
          JSON.stringify({ error: 'Invalid response structure from Gemini' }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let rawResponse = candidate.content.parts[0].text || ''
      
      // Clean up any thinking process content that might be included
      // Look for JSON structure and extract only that part
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        rawResponse = jsonMatch[0]
      }
      
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
          
          // First, get all the raw text combined
          let rawText = sortedSections.map(section => section.content || '').join('\n')
          
          // NEW APPROACH: Post-process the entire text to identify and format multiple choice questions
          extractedText = postProcessMultipleChoice(rawText, sortedSections)
          
           // Append visual context if visual elements exist
           if (parsedData.visual_elements && Array.isArray(parsedData.visual_elements) && parsedData.visual_elements.length > 0) {
             const visualContext = parsedData.visual_elements.map(element => {
               let desc = `**${element.type.toUpperCase()}**: ${element.title || 'Untitled'}\n`
               desc += `Description: ${element.description || 'No description'}\n`
               
               // Handle table structure
               if (element.table_structure) {
                 desc += `Table Structure:\n`
                 desc += `Headers: ${element.table_structure.headers?.join(' | ') || 'N/A'}\n`
                 if (element.table_structure.rows) {
                   desc += `Rows:\n`
                   element.table_structure.rows.forEach((row, i) => {
                     desc += `Row ${i + 1}: ${row.join(' | ')}\n`
                   })
                 }
                 if (element.table_structure.empty_cells?.length > 0) {
                   desc += `Empty cells: ${element.table_structure.empty_cells.join(', ')}\n`
                 }
                 if (element.table_structure.calculation_context) {
                   desc += `Calculation needed: ${element.table_structure.calculation_context}\n`
                 }
               }
               
               // Handle chart/graph elements  
               if (element.axes_labels) {
                 if (element.axes_labels.x_axis) desc += `X-axis: ${element.axes_labels.x_axis}\n`
                 if (element.axes_labels.y_axis) desc += `Y-axis: ${element.axes_labels.y_axis}\n`
               }
               if (element.data_description) desc += `Data: ${element.data_description}\n`
               if (element.key_values && element.key_values.length > 0) {
                 desc += `Key Values: ${element.key_values.join(', ')}\n`
               }
               if (element.educational_context) desc += `Context: ${element.educational_context}\n`
               if (element.estimated) desc += `(Note: Some details are estimated)\n`
               return desc
             }).join('\n')
             
             extractedText += `\n\n--- VISUAL CONTEXT ---\n${visualContext}`
           }
          
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
      
      // Check if extraction might be incomplete
      const wasIncomplete = candidate.finishReason === 'MAX_TOKENS'
      if (wasIncomplete) {
        console.warn('Warning: OCR extraction may be incomplete due to token limit truncation')
      }

      return new Response(
        JSON.stringify({
          text: extractedText,
          confidence: confidence,
          source: 'gemini',
          language: language,
          columnsDetected: columnsDetected,
          direction: direction,
          pageContext: pageContext, // Include structured page context
          rawStructuredData: parsedData, // Include full structured data for debugging
          incomplete: wasIncomplete // Flag if extraction was truncated
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