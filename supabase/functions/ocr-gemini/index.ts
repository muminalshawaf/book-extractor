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
      ? `You are an expert OCR analyst specializing in Arabic educational textbooks. Analyze this chemistry textbook page with MAXIMUM precision and extract EVERY visible text element without exception.

RETURN THIS EXACT JSON STRUCTURE:
{
  "language": "ar",
  "direction": "rtl", 
  "page_context": {
    "page_title": "exact main page title or chapter name",
    "page_type": "table_of_contents|chapter_intro|lesson_content|exercises|examples|summary|career_info",
    "main_topics": ["topic1", "topic2"],
    "headers": ["all headers found"],
    "has_questions": true/false,
    "has_formulas": true/false,
    "has_examples": true/false,
    "has_visual_elements": true/false
  },
  "sections": [
    {
      "order": 1,
      "type": "title|header|main_content|sidebar|example|exercise|formula|definition|career_box|highlight_box",
      "title": "section title if present", 
      "content": "complete text content"
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
      "table_structure": {
        "headers": ["column 1 header", "column 2 header"],
        "rows": [
          ["cell 1,1", "cell 1,2"],
          ["cell 2,1", "EMPTY or missing value"]
        ],
        "empty_cells": ["description of which cells need to be filled"],
        "calculation_context": "what type of calculation is needed to fill empty cells"
      },
      "educational_context": "how this visual relates to the lesson/question",
      "estimated": true/false
    }
  ]
}

🔥 MASTER OCR INSTRUCTIONS - LEAVE NOTHING BEHIND:

1. **QUESTION EXTRACTION PRIORITY** (Critical for Q92 and all numbered questions):
   ✓ **QUESTION NUMBERING**: Extract EXACT question numbers as they appear on the page - DO NOT add non-existent questions
   ✓ **COMPLETE QUESTION TEXT**: Extract the FULL question statement including all parts  
   ✓ **TABLE REFERENCES**: If question mentions "الجدول", "Table", "جدول ٧-١", extract complete table
   ✓ **MULTIPLE PARTS**: Questions may have parts (أ), (ب), (ج) or (a), (b), (c) - capture ALL parts
   ✓ **ANSWER SPACES**: Look for blank lines, underscores, or "?" symbols where answers go
   ✓ **CONTEXT CLUES**: Include any explanatory text or formulas near the question
   ✓ **NUMBERING VALIDATION**: Only extract questions that are actually visible - verify each number exists on the page

2. **TABLE STRUCTURE DETECTION** (Essential for calculation questions):
   ✓ **HEADERS IDENTIFICATION**: Extract exact column and row headers with units
   ✓ **EMPTY CELL DETECTION**: Mark cells with "?", blanks, or missing values as "EMPTY"
   ✓ **VALUE EXTRACTION**: Record all numerical values with proper units (M, mL, kPa, etc.)
   ✓ **TABLE BORDERS**: Identify table boundaries even if lines are faint
   ✓ **CALCULATION CONTEXT**: Determine what formula/law applies (dilution, Henry's law, etc.)

3. **VISUAL LAYOUT ANALYSIS** (Scan the ENTIRE image systematically):
   ✓ Scan top-to-bottom, right-to-left for Arabic content
   ✓ Identify EVERY text element by visual prominence: titles, headers, body text, captions
   ✓ Detect text formatting: bold, italic, underlined, colored text, different font sizes
   ✓ Map visual hierarchy: main title → section headers → subheaders → body content
   ✓ Locate bordered boxes, highlighted areas, margin notes, sidebars
   ✓ Find text in corners, margins, footers, page numbers

4. **ARABIC TEXTBOOK STRUCTURE RECOGNITION**:
   ✓ Page titles: "مهن في الكيمياء", "الفصل الأول", chapter names
   ✓ Career sections: "فنيو الصيدلة", professional roles, job descriptions  
   ✓ Examples: "مثال ٢-١", "مثال ١-٢", with numbers in Arabic or English
   ✓ Calculations: "حساب المولارية", "الحل", step-by-step solutions
   ✓ Questions: "ماذا قرأت؟", numbered problems, exercise sections
   ✓ Definitions: key terms in bold, vocabulary boxes
   ✓ Formulas: mathematical equations, chemical formulas, units

5. **TYPOGRAPHY & FORMATTING PRESERVATION**:
   ✓ Distinguish between different text weights (bold vs regular)
   ✓ Preserve mathematical notation: subscripts, superscripts, fractions
   ✓ Maintain chemical formulas exactly: H₂O, CO₂, NaCl, etc.
   ✓ Keep equation formatting: = signs, division bars, parentheses
   ✓ Preserve Arabic numbers vs English numbers in context
   ✓ Maintain units and symbols: mol/L, °C, %, etc.

6. **SECTION CLASSIFICATION** (Critical - identify each visual block):
   • "title" → Page headers, chapter titles (large bold text at top)
   • "header" → Section headers, subsection titles (medium bold text)
   • "main_content" → Primary educational paragraphs and explanations
   • "sidebar" → Boxed content, highlighted info panels, margin notes
   • "example" → "مثال" sections with worked problems and solutions
   • "exercise" → Practice problems, "مسائل تدريبية", questions
   • "formula" → Mathematical equations, chemical formulas (standalone)
   • "definition" → Key terms, vocabulary, bolded concepts
   • "career_box" → Professional information, job descriptions
   • "highlight_box" → Important notes, tips, warnings in colored boxes

7. **CONTENT COMPLETENESS VERIFICATION** (Zero tolerance for missing text):
   ✓ Every Arabic word and phrase visible in the image
   ✓ All English text, numbers, and symbols
   ✓ Mathematical expressions with proper formatting
   ✓ Chemical formulas with correct subscripts/superscripts  
   ✓ Units, measurements, and scientific notation
   ✓ Page numbers, section numbers, example numbers
   ✓ Text in boxes, sidebars, margins, and corners
   ✓ Captions for figures, diagrams, or images

8. **ARABIC TEXT HANDLING**:
   ✓ Preserve exact Arabic spelling and diacritics
   ✓ Maintain proper Arabic sentence structure and punctuation
   ✓ Keep Arabic-English mixed text in correct order
   ✓ Preserve technical Arabic chemistry terminology
   ✓ Maintain number formatting (Arabic numerals vs English numerals)

9. **VISUAL ELEMENTS ANALYSIS** (Critical - analyze ALL graphs, charts, figures, tables):
   ✓ Detect graphs, charts, diagrams, figures, images, and TABLES with educational content
   ✓ Identify axis labels, units, scales, legends for graphs/charts
   ✓ **TABLE EXTRACTION**: For tables, extract complete structure:
     - Column headers (exactly as written) 
     - Row data (all filled cells with exact values)
     - Empty/missing cells: Mark cells with "?" symbols or blank spaces as "EMPTY"
     - For question marks (?): Record as "EMPTY - needs calculation"
     - Units or context for calculations needed (e.g., Henry's law, dilution formula)
   ✓ Describe data trends, patterns, relationships shown visually
   ✓ Extract key values, measurements, ranges from visual data
   ✓ Note figure captions, titles, or reference numbers (Figure 1, شكل ٢، جدول ٧-١، etc.)
   ✓ Describe the educational purpose of each visual element
   ✓ For questions referencing "الشكل", "الجدول", "Table", or "Figure", ensure visual is documented
   ✓ Mark uncertain interpretations with "estimated": true

10. **QUALITY ASSURANCE CHECKS**:
    ✓ Verify no text elements were skipped or overlooked
    ✓ Ensure mathematical formulas are complete and accurate
    ✓ Confirm all section headers and titles are captured
    ✓ Double-check example numbers and problem sequences
    ✓ Validate that boxed/highlighted content is included
    ✓ Verify visual elements are described if present
    ✓ **QUESTION COMPLETENESS**: Ensure ONLY questions that exist on the page are extracted - verify each number
    ✓ **NO HALLUCINATION**: Do not extract question numbers that don't exist on the page (e.g., don't add Q93 if only Q92 exists)

CRITICAL SUCCESS METRICS:
- 100% text capture rate (no missing words, symbols, or numbers)
- Perfect preservation of mathematical and chemical notation  
- Complete section identification and classification
- Accurate Arabic text with proper technical terminology
- Full extraction of educational structure (examples, exercises, definitions)
- Comprehensive visual element documentation for educational context

ANALYZE SYSTEMATICALLY - EXTRACT COMPREHENSIVELY - MISS NOTHING!`
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
              temperature: 0.01,
              topK: 1,
              topP: 0.85,
              maxOutputTokens: 32768, // Increased from 20480 for full page extraction
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