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
        "numeric_data": {
          "series": [
            {
              "label": "series name (e.g., NO, Ar, O2, CH4, H2, N2, NaClO3, KNO3, KBr, NaCl, CaCl2, KCl, Ce2(SO4)3)",
              "points": [
                {"x": 2, "y": 14, "units": {"x": "atm", "y": "mg/100g"}},
                {"x": 4, "y": 28, "units": {"x": "atm", "y": "mg/100g"}},
                {"x": 6, "y": 42, "units": {"x": "atm", "y": "mg/100g"}},
                {"x": 8, "y": 56, "units": {"x": "atm", "y": "mg/100g"}},
                {"x": 10, "y": 70, "units": {"x": "atm", "y": "mg/100g"}}
              ],
              "slope": 7.0,
              "intercept": 0,
              "relationship": "linear|exponential|logarithmic|curved",
              "trend_description": "increasing linearly with slope 7",
              "data_extraction_method": "grid_intersection_analysis"
            }
          ],
          "axis_ranges": {
            "x_min": 0, "x_max": 10, "x_unit": "atm|°C",
            "y_min": 0, "y_max": 70, "y_unit": "mg/100g|g/100g"
          },
          "grid_analysis": {
            "major_grid_spacing": {"x": 2, "y": 10},
            "minor_grid_visible": true,
            "coordinate_precision": "high"
          },
          "confidence": 0.95,
          "extraction_method": "precise_visual_coordinate_analysis"
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
            "content": "Question Text: [complete question text]\nOptions:\na. [COMPLETE option text with ALL details, numbers, units, formulas]\nb. [COMPLETE option text with ALL details, numbers, units, formulas]\nc. [COMPLETE option text with ALL details, numbers, units, formulas]\nd. [COMPLETE option text with ALL details, numbers, units, formulas]"
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

4. **FIGURE ٢٦-١ SPECIFIC REQUIREMENTS** (Must be captured):
   ✓ **COMPLETE DESCRIPTION**: "بيان دائري يوضح النسب المئوية لغازات الهواء"
   ✓ **ALL PERCENTAGES**: نيتروجين ٧٨٪، أكسجين ٢١٪، أرجون ١٪
   ✓ **EDUCATIONAL CONTEXT**: How this relates to question 106 about mole fractions
   ✓ **VISUAL DETAILS**: Color coding, sector sizes, any additional labels

5. **MISSING QUESTIONS RECOVERY** (Questions 103-106 often missed):
   ✓ **QUESTION 103**: About polarity and solubility using Table 9-1
   ✓ **QUESTION 104**: About saturated KCl solution temperature changes
   ✓ **QUESTION 105**: About calculating mass of Ca(NO₃)₂ needed
   ✓ **QUESTION 106**: About mole fractions using Figure 26-1 data
   ✓ **CHECK CONTINUATION**: These questions might be split across sections

6. **ENHANCED TABLE EXTRACTION** (Table 9-1 requirements):
   ✓ **COMPLETE HEADERS**: "مذاب" and "مذيب" columns
   ✓ **ALL ROWS**: MgCl₂ صلب/H₂O سائل، NH₃ سائل/C₆H₆ سائل، etc.
   ✓ **EXACT FORMULAS**: Preserve chemical formulas with correct subscripts
   ✓ **CONTEXT**: How table relates to question 103

7. **DOUBLE-CHECK VALIDATION**:
   ✓ **QUESTION COUNT**: Ensure questions 93-106 are all captured (14 questions total)
   ✓ **VISUAL COUNT**: Verify Table 9-1 and Figure 26-1 are both documented
   ✓ **CONTENT COMPLETENESS**: No truncated sentences or incomplete formulas
   ✓ **ARABIC ACCURACY**: Proper Arabic text recognition and diacritics

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
    ✓ Multiple Choice Options: detect a), b), c), d) or أ), ب), ج), د) with answer values
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

🔥 **CRITICAL GRAPH DATA EXTRACTION PROTOCOL** (MANDATORY FOR CHEMISTRY GRAPHS):

**STEP 1: GRAPH IDENTIFICATION & SETUP**
✓ Identify graph type: solubility vs pressure, solubility vs temperature, concentration curves
✓ Read graph title: "الذائبية بدلالة ضغط الغاز", "الذائبية بدلالة درجة الحرارة", etc.
✓ Extract axis labels with EXACT units: "atm ضغط الغاز", "°C درجة الحرارة", "mg/100g الذائبية"
✓ Identify all data series labels: NO, Ar, O2, CH4, H2, N2, NaClO3, KNO3, KBr, NaCl, CaCl2, KCl, Ce2(SO4)3

**STEP 2: COORDINATE SYSTEM ANALYSIS**
✓ **AXIS RANGES**: Read min/max values from both axes precisely
  - X-axis: 0-10 atm, 0-100°C, etc.
  - Y-axis: 0-70 mg/100g, 0-240 g/100g, etc.
✓ **GRID ANALYSIS**: Identify major grid line spacing
  - Major gridlines every 2 atm, 5°C, 10 mg/100g, etc.
  - Minor gridlines if visible
✓ **SCALE VERIFICATION**: Ensure coordinate system accuracy

**STEP 3: DATA POINT EXTRACTION (MINIMUM 5 POINTS PER SERIES)**
For EACH data series/line, extract coordinates using grid intersection method:

✓ **LINEAR SERIES** (NO, Ar, O2, CH4, H2, N2 in pressure graphs):
  - Point 1: (2, y1) - read y-value at x=2
  - Point 2: (4, y2) - read y-value at x=4  
  - Point 3: (6, y3) - read y-value at x=6
  - Point 4: (8, y4) - read y-value at x=8
  - Point 5: (10, y5) - read y-value at x=10
  - Calculate slope: (y5-y1)/(10-2)
  - Verify linearity and relationship

✓ **CURVED SERIES** (NaClO3, KNO3, CaCl2 in temperature graphs):
  - Point 1: (0°C, y1) - initial solubility
  - Point 2: (20°C, y2) - solubility at 20°C
  - Point 3: (40°C, y3) - solubility at 40°C
  - Point 4: (60°C, y4) - solubility at 60°C
  - Point 5: (80°C, y5) - solubility at 80°C
  - Point 6: (100°C, y6) - final solubility
  - Describe curve type: exponential, logarithmic, steep increase, etc.

**STEP 4: PRECISION TECHNIQUES**
✓ **GRID INTERSECTION METHOD**: 
  - Follow data line to nearest grid intersection
  - Read coordinates at major gridline crossings
  - Interpolate between gridlines for precision
✓ **VISUAL ESTIMATION**: 
  - Estimate fractional values between gridlines
  - Use proportional spacing for accuracy
✓ **TREND VERIFICATION**: 
  - Verify data trends make chemical sense
  - Check for monotonic increases/decreases
  - Validate against chemical principles

**STEP 5: MATHEMATICAL ANALYSIS**
✓ **LINEAR RELATIONSHIPS**: Calculate slope, intercept, R² if applicable
✓ **NON-LINEAR RELATIONSHIPS**: Describe trend (exponential growth, saturation curve, etc.)
✓ **COMPARATIVE ANALYSIS**: Rank series by solubility at specific conditions
✓ **UNITS PRESERVATION**: Maintain exact units throughout

**STEP 6: VALIDATION & QUALITY CONTROL**
✓ **COORDINATE ACCURACY**: ±2% tolerance for visual extraction
✓ **CHEMICAL LOGIC**: Verify trends align with solubility principles
✓ **COMPLETENESS CHECK**: Ensure all visible data series captured
✓ **CROSS-REFERENCE**: Match data to any referenced questions

**EXAMPLE OUTPUT FORMAT FOR CHEMISTRY GRAPHS**:
{
  "type": "graph",
  "title": "الذائبية بدلالة ضغط الغاز",
  "description": "Graph showing gas solubility vs pressure for 6 different gases",
  "axes_labels": {
    "x_axis": "ضغط الغاز atm",
    "y_axis": "الذائبية mg/100g من الماء"
  },
  "numeric_data": {
    "series": [
      {
        "label": "NO",
        "points": [
          {"x": 2, "y": 14, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 4, "y": 28, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 6, "y": 42, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 8, "y": 56, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 10, "y": 70, "units": {"x": "atm", "y": "mg/100g"}}
        ],
        "slope": 7.0,
        "intercept": 0,
        "relationship": "linear",
        "trend_description": "highest solubility, increases linearly with pressure"
      },
      {
        "label": "Ar", 
        "points": [
          {"x": 2, "y": 12, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 4, "y": 24, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 6, "y": 36, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 8, "y": 48, "units": {"x": "atm", "y": "mg/100g"}},
          {"x": 10, "y": 60, "units": {"x": "atm", "y": "mg/100g"}}
        ],
        "slope": 6.0,
        "intercept": 0,
        "relationship": "linear",
        "trend_description": "second highest solubility"
      }
    ],
    "axis_ranges": {
      "x_min": 0, "x_max": 10, "x_unit": "atm",
      "y_min": 0, "y_max": 70, "y_unit": "mg/100g"
    },
    "grid_analysis": {
      "major_grid_spacing": {"x": 2, "y": 10},
      "coordinate_precision": "high",
      "extraction_method": "grid_intersection_analysis"
    },
    "confidence": 0.95
  },
  "educational_context": "Demonstrates Henry's Law - gas solubility increases linearly with pressure"
}

**CHEMISTRY-SPECIFIC REQUIREMENTS**:
✓ **CHEMICAL FORMULAS**: Preserve exact subscripts/superscripts (H₂, O₂, CO₂, CaCl₂, etc.)
✓ **UNITS**: Maintain precise scientific units (atm, °C, mg/100g, g/100g, mol/L)
✓ **TEMPERATURE CURVES**: Recognize typical solubility patterns (most salts increase with T)
✓ **PRESSURE RELATIONSHIPS**: Apply Henry's Law understanding for gas solubility
✓ **COMPARATIVE RANKINGS**: Order compounds by solubility at standard conditions

**CRITICAL SUCCESS METRICS FOR GRAPHS**:
- Extract minimum 5 coordinate points per data series
- Calculate slopes/trends with ±5% accuracy
- Preserve all chemical formulas and units exactly
- Identify all visible data series (typically 3-6 per graph)
- Cross-reference with any questions mentioning the graph
- Provide educational context linking to chemistry principles

10. **QUALITY ASSURANCE CHECKS**:
     ✓ Verify no text elements were skipped or overlooked
     ✓ Ensure mathematical formulas are complete and accurate
     ✓ Confirm all section headers and titles are captured
     ✓ Double-check example numbers and problem sequences
     ✓ Validate that boxed/highlighted content is included
     ✓ Verify visual elements are described if present
     ✓ **QUESTION COMPLETENESS**: Ensure ALL questions 93-106 are extracted (14 questions total)
     ✓ **VISUAL COMPLETENESS**: Verify Table 9-1 AND Figure 26-1 are both captured with full details
     ✓ **NO TRUNCATION**: Ensure no content is cut off or incomplete

CRITICAL SUCCESS METRICS:
- 100% text capture rate (no missing words, symbols, or numbers)
- Perfect preservation of mathematical and chemical notation  
- Complete section identification and classification
- Accurate Arabic text with proper technical terminology
- Full extraction of educational structure (examples, exercises, definitions)
- Comprehensive visual element documentation for educational context
- **MANDATORY**: All questions 93-106 must be captured (14 questions total)
- **MANDATORY**: Table 9-1 and Figure 26-1 must be fully documented with complete descriptions

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