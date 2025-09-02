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

// JSON Schema validation function
function validateOCRResult(result: any, schema: any): boolean {
  try {
    if (!result || typeof result !== 'object') return false
    
    // Check required fields
    const requiredFields = ['language', 'direction', 'page_context', 'sections', 'visual_elements']
    for (const field of requiredFields) {
      if (!(field in result)) {
        console.error(`Missing required field: ${field}`)
        return false
      }
    }
    
    // Validate page_context
    if (!result.page_context || typeof result.page_context !== 'object') return false
    const requiredPageFields = ['page_title', 'page_type', 'has_questions', 'has_visual_elements']
    for (const field of requiredPageFields) {
      if (!(field in result.page_context)) {
        console.error(`Missing required page_context field: ${field}`)
        return false
      }
    }
    
    // Validate sections array
    if (!Array.isArray(result.sections)) return false
    for (const section of result.sections) {
      if (!section || typeof section !== 'object' || 
          typeof section.order !== 'number' || 
          typeof section.type !== 'string') {
        console.error('Invalid section structure')
        return false
      }
    }
    
    // Validate visual_elements array
    if (!Array.isArray(result.visual_elements)) return false
    
    console.log('OCR result passed validation')
    return true
    
  } catch (error) {
    console.error('Validation error:', error)
    return false
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Enhanced OCR Gemini function started with validation pipeline')
    
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

    // Prepare the prompt based on language with enforced JSON schema
    const isArabic = language === 'ar'
    
    // JSON Schema for validation
    const jsonSchema = {
      type: "object",
      required: ["language", "direction", "page_context", "sections", "visual_elements"],
      properties: {
        language: { type: "string" },
        direction: { type: "string" },
        page_context: {
          type: "object",
          required: ["page_title", "page_type", "has_questions", "has_visual_elements"],
          properties: {
            page_title: { type: "string" },
            page_type: { type: "string" },
            main_topics: { type: "array", items: { type: "string" } },
            headers: { type: "array", items: { type: "string" } },
            has_questions: { type: "boolean" },
            has_formulas: { type: "boolean" },
            has_examples: { type: "boolean" },
            has_visual_elements: { type: "boolean" }
          }
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            required: ["order", "type"],
            properties: {
              order: { type: "number" },
              type: { type: "string" },
              title: { type: ["string", "null"] },
              content: { type: ["string", "null"] }
            }
          }
        },
        visual_elements: {
          type: "array",
          items: { type: "object" }
        }
      }
    }
    
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
       "numeric_data": {
         "series": [
           {
             "label": "series name (e.g., Ar, O2, NO)",
             "points": [
               {"x": 5, "y": 0.7, "units": {"x": "atm", "y": "mg/100g"}},
               {"x": 10, "y": 1.4, "units": {"x": "atm", "y": "mg/100g"}},
               {"x": 15, "y": 2.1, "units": {"x": "atm", "y": "mg/100g"}}
             ],
             "slope": 0.14,
             "intercept": 0,
             "relationship": "linear"
           }
         ],
         "axis_ranges": {
           "x_min": 0, "x_max": 20, "x_unit": "atm",
           "y_min": 0, "y_max": 3, "y_unit": "mg/100g"
         },
         "confidence": 0.95,
         "extraction_method": "visual_analysis"
       },
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

⚠️ CRITICAL MANDATE: ABSOLUTE 100% COMPLIANCE REQUIRED ⚠️
⛔ FAILURE TO FOLLOW ANY INSTRUCTION WILL RESULT IN COMPLETE REJECTION ⛔

🔥 MASTER OCR INSTRUCTIONS - ZERO TOLERANCE FOR MISSED CONTENT:

1. **MANDATORY COMPLETE PAGE SCANNING** (NON-NEGOTIABLE - scan EVERY pixel):
   ⚡ **SYSTEMATIC SCANNING**: You MUST scan the entire image systematically from top-right to bottom-left (Arabic RTL)
   ⚡ **QUESTION COMPLETENESS**: You MUST extract ALL question numbers that exist on the page - verify each number exists
   ⚡ **VISUAL ELEMENTS**: You MUST document EVERY graph, chart, table, diagram, and figure with complete descriptions
   ⚡ **TEXT IN MARGINS**: You MUST check corners, margins, headers, footers for any text content
   ⚡ **OVERLAPPING CONTENT**: You MUST identify questions that continue across columns or sections

2. **MANDATORY QUESTION DETECTION** (ABSOLUTE - Zero tolerance for missing questions):
   ⚡ **ARABIC NUMERALS**: You MUST find ALL: ٩٣، ٩٤، ٩٥، ٩٦، ٩٧، ٩٨، ٩٩، ١٠٠، ١٠١، ١٠٢، ١٠٣، ١٠٤، ١٠٥، ١٠٦
   ⚡ **ENGLISH NUMERALS**: You MUST find ALL: 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106
   ⚡ **QUESTION PATTERNS**: You MUST detect: اشرح، وضح، قارن، حدد، احسب، ما المقصود، لماذا، كيف
    ⚡ **ABSOLUTE MULTIPLE CHOICE DETECTION** (MANDATORY - REJECTION IF ANY OPTION MISSED): 
        - **MANDATORY EXHAUSTIVE PAGE SCANNING**: You MUST scan EVERY pixel of the image systematically:
          * You MUST scan top-right to bottom-left for Arabic RTL layout
          * You MUST scan top-left to bottom-right for English LTR layout  
          * You MUST use grid-by-grid analysis: divide page into 6x6 grid sections, scan each section thoroughly
          * You MUST pay special attention to white spaces, margins, and areas between visual elements
        - **MANDATORY COMPREHENSIVE OPTION PATTERN DETECTION**: You MUST search for ALL possible formats:
          * You MUST find English: a., b., c., d. | a) b) c) d) | (a) (b) (c) (d) | A. B. C. D. | A) B) C) D)
          * You MUST find Arabic: أ., ب., ج., د. | أ) ب) ج) د) | (أ) (ب) (ج) (د) | ا., ب., ت., ث.
          * You MUST find Numbers: 1., 2., 3., 4. | 1) 2) 3) 4) | (1) (2) (3) (4) | ١., ٢., ٣., ٤.
          * You MUST handle mixed formats within same question set
        - **AGGRESSIVE VISUAL SEPARATION HANDLING**: Options can be ANYWHERE:
          * Several centimeters away from question text
          * In completely different columns or page sections
          * Below graphs, charts, tables, or diagrams
          * In margins, corners, or footer areas
          * Arranged in horizontal rows across page width
          * Clustered together without nearby question reference
          * Separated by page borders, lines, or visual dividers
        - **INTELLIGENT OPTION-QUESTION MATCHING**: For orphaned option sets:
          * Scan 360° around options for nearest question numbers
          * Look for numerical sequences (if options near "4)" then look for question 4)
          * Match content themes (chemistry options → chemistry questions)
          * Use spatial proximity but allow for large distances
          * Consider reading flow patterns and page layout logic
        - **MANDATORY EXTRACTION REQUIREMENTS**: For EVERY question with options found:
          {
            "order": X,
            "type": "exercise", 
            "title": "question_number",
            "content": "Question Text: [complete question text]\\nOptions:\\na. [COMPLETE option text with ALL details, numbers, units, formulas]\\nb. [COMPLETE option text with ALL details, numbers, units, formulas]\\nc. [COMPLETE option text with ALL details, numbers, units, formulas]\\nd. [COMPLETE option text with ALL details, numbers, units, formulas]"
          }
        - **OPTION CONTENT COMPLETENESS** (CRITICAL):
          * Preserve EXACT option prefixes: "a. 55.63 mL" NOT "55.63 mL"  
          * Include ALL numerical values with proper units
          * Maintain chemical formulas with correct subscripts/superscripts
          * Capture mathematical expressions completely
          * Include parenthetical clarifications and sub-text
          * Don't truncate multi-line options - get complete text
        - **TRIPLE-VERIFICATION PROTOCOL**:
          * First pass: systematic grid scanning for any a/b/c/d or أ/ب/ج/د patterns
          * Second pass: contextual matching of found options to questions  
          * Third pass: completeness check - ensure each question has all options
          * FAIL if ANY multiple choice question lacks its complete option set
          * Mark questions as "MULTIPLE CHOICE" in the type field if options are found
   ✓ **CONTINUATION QUESTIONS**: Questions that span multiple lines or sections
   ✓ **SUB-QUESTIONS**: Parts (أ)، (ب)، (ج) or (a), (b), (c)

3. **COMPREHENSIVE VISUAL ANALYSIS** (Critical for educational context):
   ✓ **GRAPHS & CHARTS**: Extract titles, axis labels, data points, legends, scales
   ✓ **PIE CHARTS**: Capture all percentages, labels, and sector descriptions
   ✓ **TABLES**: Extract complete structure including headers, all data cells, empty cells
   ✓ **DIAGRAMS**: Describe all components, labels, arrows, and relationships
   ✓ **FIGURES**: Include figure numbers, captions, and detailed descriptions
   ✓ **CHEMICAL STRUCTURES**: Document molecular diagrams, formulas, bonds

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

    // Enhanced OCR processing with retry and validation
    let ocrResult = null
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts && !ocrResult) {
      attempts++
      console.log(`OCR attempt ${attempts}/${maxAttempts}`)
      
      try {
        // Call Gemini 2.5 Flash (upgraded model for better accuracy)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`
        
        const requestBody = {
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.0, // Deterministic output for consistency
            maxOutputTokens: 8192,
            topP: 0.1, // Low for deterministic results
            candidateCount: 1
          }
        }

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`OCR attempt ${attempts} failed:`, response.status, errorText)
          
          if (attempts === maxAttempts) {
            return new Response(
              JSON.stringify({ error: `Gemini API error after ${maxAttempts} attempts: ${response.status}` }), 
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          continue
        }

        const data = await response.json()
        console.log('Gemini API response received, processing...')

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
          let textContent = data.candidates[0].content.parts[0].text
          console.log(`Raw Gemini text response length: ${textContent.length}`)

          // Enhanced JSON parsing with validation
          let parsedResult
          try {
            // Clean the text content - remove any markdown formatting
            textContent = textContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
            parsedResult = JSON.parse(textContent)
            
            // Validate against schema
            if (!validateOCRResult(parsedResult, jsonSchema)) {
              console.error('OCR result failed schema validation')
              if (attempts === maxAttempts) {
                throw new Error('OCR result validation failed after all attempts')
              }
              continue
            }
            
            console.log('Successfully parsed and validated JSON response')
            ocrResult = parsedResult
            break
            
          } catch (parseError) {
            console.error(`JSON parse error on attempt ${attempts}:`, parseError)
            
            // Try to extract JSON from the response
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsedResult = JSON.parse(jsonMatch[0])
                if (validateOCRResult(parsedResult, jsonSchema)) {
                  console.log('Extracted and validated JSON successfully from match')
                  ocrResult = parsedResult
                  break
                }
              } catch (extractError) {
                console.error('Failed to parse extracted JSON:', extractError)
              }
            }
            
            if (attempts === maxAttempts) {
              return new Response(
                JSON.stringify({ error: 'Failed to parse and validate OCR response as JSON after all attempts' }), 
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          }
        } else {
          console.error(`No valid response content on attempt ${attempts}`)
          if (attempts === maxAttempts) {
            return new Response(
              JSON.stringify({ error: 'No valid response from Gemini API after all attempts' }), 
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      } catch (error) {
        console.error(`OCR attempt ${attempts} error:`, error)
        if (attempts === maxAttempts) {
          return new Response(
            JSON.stringify({ error: `OCR processing failed after ${maxAttempts} attempts` }), 
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      // Wait before retry (exponential backoff)
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }

    // Process successful result
    if (ocrResult) {
      // Enhanced post-processing with multiple choice detection
      const processedText = postProcessMultipleChoice('', ocrResult.sections || [])
      console.log('Post-processing completed for multiple choice questions')

      // Enhanced metrics collection
      const totalSections = ocrResult.sections ? ocrResult.sections.length : 0
      const pageType = ocrResult.page_context ? ocrResult.page_context.page_type : 'unknown'
      const visualElements = ocrResult.visual_elements ? ocrResult.visual_elements.length : 0
      const questions = ocrResult.sections ? ocrResult.sections.filter(s => s.type === 'exercise').length : 0
      const multipleChoiceCount = processedText.split('Options:').length - 1
      
      console.log(`OCR Metrics: ${totalSections} sections, ${visualElements} visuals, ${questions} questions, ${multipleChoiceCount} MC questions`)
      console.log(`Structured layout detected: ${totalSections} sections, page type: ${pageType}`)

      // Calculate enhanced confidence score
      let confidence = 0.85
      if (visualElements > 0) confidence += 0.05
      if (questions > 0) confidence += 0.05
      if (multipleChoiceCount > 0) confidence += 0.03
      if (totalSections >= 10) confidence += 0.02
      confidence = Math.min(0.98, confidence)
      
      const detectedLanguage = ocrResult.language || language
      const columnCount = totalSections
      const direction = ocrResult.direction || (isArabic ? 'rtl' : 'ltr')

      console.log(`OCR completed successfully. Text length: ${processedText.length}, Confidence: ${confidence}, Columns: ${columnCount}`)

      return new Response(JSON.stringify({
        text: processedText,
        confidence: confidence,
        language: detectedLanguage,
        columns: columnCount,
        direction: direction,
        rawStructuredData: ocrResult,
        metrics: {
          attempts: attempts,
          sections: totalSections,
          visuals: visualElements,
          questions: questions,
          multipleChoice: multipleChoiceCount
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fallback error response
    return new Response(
      JSON.stringify({ error: 'OCR processing failed after all attempts' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in OCR processing:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error in OCR processing',
        details: error.message 
      }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})