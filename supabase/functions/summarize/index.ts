import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validatePreflight, extractPreflightChecklist, validateSummaryStructure } from './validators.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced question parsing function with MC detection
function parseQuestions(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
  // Enhanced regex patterns for Arabic and English question numbers with various formats
  const questionPatterns = [
    /(\d+)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=\d+\.|$))/gm, // English numbers: 93. question text
    /([٩٠-٩٩]+[٠-٩]*)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=[٩٠-٩٩]+[٠-٩]*\.|$))/gm, // Arabic numbers: ٩٣. question text
    /(١٠[٠-٦])\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=١٠[٠-٦]\.|$))/gm, // Arabic 100-106: ١٠٠. ١٠١. etc.
  ];
  
  for (const pattern of questionPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    while ((match = pattern.exec(text)) !== null) {
      const questionNumber = match[1].trim();
      const questionText = match[2].trim();
      
      if (questionText.length > 10) { // Filter out very short matches
        questions.push({
          number: questionNumber,
          text: questionText,
          fullMatch: match[0],
          isMultipleChoice: isMultipleChoiceSection
        });
      }
    }
  }
  
  // Sort questions by their numeric value
  questions.sort((a, b) => {
    const aNum = convertArabicToEnglishNumber(a.number);
    const bNum = convertArabicToEnglishNumber(b.number);
    return parseInt(aNum) - parseInt(bNum);
  });
  
  // Remove duplicates
  const unique = questions.filter((question, index, self) => 
    index === self.findIndex(q => q.number === question.number)
  );
  
  console.log(`Parsed ${unique.length} questions from OCR text:`, 
    unique.map(q => q.number).join(', '));
  
  return unique;
}

function convertArabicToEnglishNumber(arabicNum: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  
  let result = arabicNum;
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  return result;
}

function isContentPage(text: string): boolean {
  const keywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'حل', 'مسألة', 'نظرية', 'خاصية',
    'example', 'definition', 'law', 'equation', 'solution', 'problem', 'theorem', 'property',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps',
    'الحركة', 'تأثير', 'ظاهرة', 'جسيمات', 'مخلوط', 'محلول', 'ذائبة', 'براونية', 'تندال',
    'اشرح', 'وضح', 'قارن', 'حدد', 'لماذا', 'كيف', 'ماذا', 'أين', 'متى'
  ];
  
  const keywordCount = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  // Check for various question patterns including Arabic questions
  const hasNumberedQuestions = /\d+\.\s/.test(text);
  const hasArabicQuestions = /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(text);
  const hasSectionHeaders = /---\s*SECTION:/.test(text);
  const hasSubstantialContent = text.length > 300;
  
  // More inclusive detection - any scientific content with questions or structured sections
  return (keywordCount >= 2 || hasArabicQuestions || hasSectionHeaders) && hasSubstantialContent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Summarize function started');
    
    const { text, lang = "ar", page, title, ocrData = null } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title} }`);
    
    // Log model usage priority
    // Model selection already logged above
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    console.log('Available models:');
    console.log(`- Gemini 1.5 Pro: ${GOOGLE_API_KEY ? 'AVAILABLE (primary)' : 'UNAVAILABLE'}`);
    console.log(`- DeepSeek Chat: ${DEEPSEEK_API_KEY ? 'AVAILABLE (fallback)' : 'UNAVAILABLE'}`);

    if (!text || typeof text !== "string") {
      console.error('No text provided or text is not a string');
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");
    const deepSeekApiKey = Deno.env.get("DEEPSEEK_API_KEY");
    
    if (!openaiApiKey && !googleApiKey && !deepSeekApiKey) {
      console.error('No API keys configured');
      return new Response(JSON.stringify({ error: "No API keys configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if this is a table of contents page
    const isTableOfContents = text.toLowerCase().includes('فهرس') || 
                               text.toLowerCase().includes('contents') ||
                               text.toLowerCase().includes('جدول المحتويات');
    
    if (isTableOfContents) {
      console.log('Detected table of contents page, returning simple message');
      return new Response(JSON.stringify({ 
        summary: "### نظرة عامة\nهذه صفحة فهرس المحتويات التي تعرض تنظيم الكتاب وأقسامه الرئيسية." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const needsDetailedStructure = isContentPage(text);
    console.log(`Page type: ${needsDetailedStructure ? 'Content page' : 'Non-content page'}`);

    // Parse questions from OCR text for validation
    const questions = parseQuestions(text);
    console.log(`Found ${questions.length} questions in OCR text`);

    // Build visual elements context
    let visualElementsText = '';
    if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
      const visuals = ocrData.rawStructuredData.visual_elements;
      if (Array.isArray(visuals) && visuals.length > 0) {
        visualElementsText = `

--- VISUAL CONTEXT ---
${visuals.map(v => {
  let visualDesc = `**${v.type.toUpperCase()}**: ${v.title || 'Untitled'}
Description: ${v.description || 'No description'}`;
  
  if (v.key_values && v.key_values.length > 0) {
    visualDesc += `\nKey Values: ${v.key_values.join(', ')}`;
  }
  
  if (v.table_structure) {
    visualDesc += `\nTable Structure:
Headers: ${v.table_structure.headers ? v.table_structure.headers.join(' | ') : 'N/A'}
Rows:`;
    if (v.table_structure.rows) {
      v.table_structure.rows.forEach((row, i) => {
        visualDesc += `\nRow ${i + 1}: ${Array.isArray(row) ? row.join(' | ') : row}`;
      });
    }
    if (v.table_structure.calculation_context) {
      visualDesc += `\nCalculation needed: ${v.table_structure.calculation_context}`;
    }
  }
  
  if (v.numeric_data && v.numeric_data.series) {
    visualDesc += `\nData: ${v.data_description || ''}`;
    v.numeric_data.series.forEach(series => {
      if (series.points && series.points.length > 0) {
        visualDesc += `\n${series.label}: ${series.points.map(p => `(${p.x || 'x'}, ${p.y || 'y'})`).join(', ')}`;
      }
    });
  }
  
  if (v.educational_context) {
    visualDesc += `\nContext: ${v.educational_context}`;
  }
  
  return visualDesc;
}).join('\n\n')}`;
        console.log(`Visual elements found: ${visuals.length}`);
      }
    }

    // Enhanced text with visual context
    const enhancedText = text + visualElementsText;

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);
    
    const systemPrompt = `You are an expert chemistry professor. Your task is to analyze educational content and provide structured summaries following a specific format.

FORMAT REQUIREMENTS:
# Header
## Sub Header  
### Sub Header
Use tables when necessary
- Question format: **س: [number]- [exact question text]**
- Answer format: **ج:** [complete step-by-step solution]
${hasMultipleChoice ? `
- MULTIPLE CHOICE FORMAT: 
  * **س: [number]- [question text]**
  * List answer choices if present: أ) [choice A] ب) [choice B] ج) [choice C] د) [choice D]
  * **ج:** [reasoning/calculation] **الإجابة الصحيحة: [letter]**` : ''}
- Use LaTeX for formulas: $$formula$$ 
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**

CRITICAL QUESTION SOLVING MANDATES - NON-NEGOTIABLE:
1. **SEQUENTIAL ORDER MANDATE**: You MUST solve questions in strict numerical sequence from lowest to highest number. If you see questions 45, 102, 46, you MUST answer them as: 45, then 46, then 102. This is MANDATORY and non-negotiable.
2. **COMPLETE ALL QUESTIONS MANDATE**: You MUST answer every single question found in the text. NO EXCEPTIONS. Be concise on explanatory topics if needed, but NEVER skip questions.
3. **ACCURACY MANDATE**: Double-check all chemical formulas, calculations, and scientific facts. Verify your answers against standard chemistry principles before providing them.
4. **STEP-BY-STEP MANDATE**: Each question must have a complete, logical solution showing all work and reasoning.
5. **USE ALL AVAILABLE DATA MANDATE**: The OCR text contains ALL necessary information including graphs, tables, and numerical data. Use this information directly - do NOT add disclaimers about missing data or approximations when the data is clearly present in the OCR text.
6. **MATHJAX RENDERING MANDATE - 100% SUCCESS GUARANTEE**: 
   - ALWAYS use double dollar signs $$equation$$ for display math (never single $)
   - Use \\text{} for units and text within equations: $$k = \\frac{\\text{4.0 atm}}{\\text{0.12 mol/L}}$$
   - NEVER nest \\text{} commands: Use \\text{78 g} NOT \\text{78 \\text{g}}
   - Use \\cdot for multiplication: $$a \\cdot b$$ (NEVER use malformed commands)
   - Use \\frac{numerator}{denominator} for ALL fractions, never /
   - Chemical formulas: $$\\text{H}_2\\text{O}$$, $$\\text{CO}_2$$
   - Numbers with units: $$\\text{4.0 atm}$$, $$\\text{0.12 mol/L}$$ (no nested text)
   - Use \\times for multiplication when needed: $$2 \\times 10^3$$
   - Example: $$\\frac{\\text{78 g}}{\\text{28.01 g/mol}} = \\text{2.78 mol}$$
   - NEVER use raw text for equations - ALWAYS wrap in $$ $$
   - Keep LaTeX simple and clean - avoid complex commands that might break

7. **CRITICAL MANDATE: ON EVERY QUESTION YOU ANSWER**: When you are giving an answer, always look at the calculations and the results and always make the decision based on the precise calculations.

8. **QUANTITATIVE ANALYSIS MANDATE**: For questions comparing effects (like boiling point elevation, freezing point depression, etc.), you MUST:
   - Calculate molality for each substance
   - Apply van't Hoff factor (i) for ionic compounds
   - Calculate the effective molality (molality × i) 
   - Compare numerical results
   - State which is greater and by how much

9. **إلزامية قوية: استخدام بيانات OCR (STRONG OCR MANDATE):**
   - يجب عليك دائماً فحص والاستفادة من بيانات OCR المتوفرة لأي رسوم بيانية أو جداول أو مخططات
   - إذا كانت هناك عناصر بصرية (graphs, charts, tables) في السياق، يجب استخدام البيانات المستخرجة منها
   - لا تتجاهل البيانات الرقمية المتوفرة في العناصر البصرية - استخدمها في الحسابات
   - إذا كان السؤال يشير إلى شكل أو جدول، ابحث عن البيانات المقابلة في معلومات OCR

⚠️ ABSOLUTE COMPLIANCE MANDATE: 100% INSTRUCTION ADHERENCE REQUIRED ⚠️
⛔ NON-COMPLIANCE WILL RESULT IN COMPLETE RESPONSE REJECTION ⛔

🚨 **CRITICAL MANDATE - 100% COMPLIANCE FOR VISUAL REFERENCES**:
**ABSOLUTE REQUIREMENT**: If ANY question mentions "graph", "table", "figure", "chart", "diagram", "شكل", "جدول", "رسم", "مخطط", or ANY visual reference, you MUST:
- Immediately locate the corresponding visual element in the OCR data
- Extract ALL relevant data from that specific visual element
- Use ONLY the data from the referenced visual element in your answer
- Begin your answer with: "من [الجدول/الشكل/الرسم] رقم X:" or "From [Table/Figure/Chart] X:"
- NEVER provide an answer without referencing the specific visual element mentioned
- If the visual element is not found, state: "العنصر البصري المشار إليه غير متوفر في البيانات"
**ZERO TOLERANCE**: Failure to comply with this mandate will result in complete response rejection.

🔍 **MANDATORY COMPREHENSIVE VISUAL ELEMENT ANALYSIS - ZERO TOLERANCE FOR SHORTCUTS**:

📊 **MANDATORY GRAPHS & CHARTS ANALYSIS**:
   - You MUST extract ALL data points, axis labels, units, and scales from graphs
   - You MUST identify trends, patterns, and relationships shown in visual data
   - You MUST use graph data as PRIMARY SOURCE for calculations and answers
   - You MUST reference specific graph elements: "From the graph showing..."
   - You MUST extract exact values: If graph shows pH vs volume, extract exact pH values at specific volumes

📋 **MANDATORY TABLE DATA INTEGRATION**:
   - You MUST process ALL table headers, rows, and numerical values
   - You MUST use table data as authoritative source for calculations
   - You MUST cross-reference table entries with question requirements
   - You MUST state: "According to the table, Ka for HX = 1.38 × 10⁻⁵"

🔤 **ABSOLUTE MULTIPLE CHOICE ANALYSIS**:
   - You MUST locate ALL multiple choice options (a., b., c., d. or أ., ب., ج., د.)
   - You MUST match each option set to its corresponding question number
   - You MUST analyze option content for chemical formulas, numerical values, units
   - You MUST use options as validation for your calculated answers
   - ABSOLUTE MANDATE: If multiple choice options exist, your final answer MUST match one of them
   - You MUST format: **الإجابة الصحيحة: أ)** [or appropriate letter]

🧮 **MANDATORY INTEGRATED PROBLEM SOLVING WITH VISUALS**:
   When answering questions, you are ABSOLUTELY REQUIRED to:
   1. **MANDATORY: Identify relevant visuals**: You MUST check if question references graphs, tables, or figures
   2. **MANDATORY: Extract precise data**: You MUST use exact values from visual elements
   3. **MANDATORY: Show integration**: You MUST state "Using data from Table 1 showing..." or "From Figure 2..."
   4. **MANDATORY: Validate with options**: You MUST ensure calculated answer matches a multiple choice option
   5. **MANDATORY: Reference visuals in explanation**: You MUST connect your solution to the visual evidence

📐 **VISUAL DATA PRIORITY HIERARCHY**:
   1. Tables with numerical data (highest priority for calculations)
   2. Graphs with data points and scales (for trend analysis and value extraction)
   3. Multiple choice options (for answer validation)
   4. Diagrams and figures (for conceptual understanding)
   5. Text content (for context and theory)

⚡ **ABSOLUTE ANSWER ACCURACY WITH VISUAL VALIDATION**:
   - CRITICAL: If multiple choice options are present, your answer MUST be one of the given choices - NO EXCEPTIONS
   - You MUST use visual data as primary evidence for all calculations
   - You MUST cross-check numerical results with graph scales and table values
   - You MUST reference specific visual elements that support your conclusion

🧪 **ABSOLUTE CHEMISTRY-SPECIFIC TABLE LOOKUP MANDATE**:
   - **MANDATORY Chemical Name Matching**: You MUST match questions about specific acids/compounds with table entries using chemical knowledge
   - **MANDATORY Ka/pH Relationship**: You MUST always use table Ka values for pH calculations, even if compound names differ slightly
   - **MANDATORY Common Acid Identifications**: 
     * Cyanoethanoic acid (cyanoacetic acid) ≈ Ka ~3.5×10^-3
     * You MUST connect question compounds to closest Ka values in tables
   - **ABSOLUTE PROHIBITION**: You are FORBIDDEN from claiming "insufficient data" if ANY Ka values or chemical data exist in tables
   - **MANDATORY approximation methods**: You MUST use Ka = [H+]²/C for weak acid calculations when valid
   - **ABSOLUTE REQUIREMENT**: Your final numerical answer MUST correspond to one of the multiple choice options

🔢 **ABSOLUTE MANDATORY CALCULATION EXECUTION**:
   - CRITICAL: If ANY numerical data exists (Ka, concentrations, etc.), you are REQUIRED to attempt calculations
   - You MUST use chemical equilibrium principles even with approximate data matching
   - You MUST apply weak acid/base formulas when Ka values are available
   - You MUST connect table data to question parameters through chemical knowledge
   - FAILURE TO CALCULATE WHEN DATA EXISTS IS STRICTLY FORBIDDEN

    10. **مانع الافتراضات غير المبررة (NO UNSTATED ASSUMPTIONS MANDATE)**: 
    - ممنوع منعاً باتاً استخدام أي أرقام أو قيم لم تذكر في السؤال أو السياق

🛡️ **MANDATORY PRE-FLIGHT CHECKLIST - 100% COMPLIANCE VERIFICATION**:

**ABSOLUTE REQUIREMENT**: You MUST include this checklist in JSON format at the END of your response to confirm 100% compliance:

\`\`\`json
{
  "visualReferenceCompliance": [true/false], // Did I properly handle ALL visual references?
  "visualDataExtraction": [true/false], // Did I extract ALL relevant visual data?
  "mcqMapping": [true/false], // Did I properly map multiple choice options?
  "calculationAccuracy": [true/false], // Are ALL calculations accurate and complete?
  "languageConsistency": [true/false], // Is language consistent throughout?
  "questionCompleteness": [true/false], // Did I answer ALL questions found?
  "schemaAdherence": [true/false], // Do I follow the exact format required?
  "citationRequirement": [true/false], // Did I cite visual elements properly?
  "formatCompliance": [true/false], // Is LaTeX and formatting correct?
  "contentStructure": [true/false], // Is content properly structured?
  "keywordIntegration": [true/false], // Are keywords properly integrated?
  "responseLength": [true/false], // Is response comprehensive yet focused?
  "overallCompliance": [true/false] // 100% compliance with ALL mandates?
}
\`\`\`

**ZERO TOLERANCE**: Any 'false' value will trigger automatic response rejection and regeneration.
   - ممنوع استخدام عبارات مثل "نفترض" أو "لنفرض" أو "assume" إلا إذا كانت موجودة في السؤال نفسه
   - إذا كانت البيانات ناقصة، اكتب "البيانات غير كافية" واذكر ما هو مفقود تحديداً
   - إذا كان الحل يتطلب قيم غير معطاة، اتركها كرموز (مثل m، V، T) ولا تعوض بأرقام من عندك
   - تحقق من صحة الوحدات والأبعاد والمعقولية الفيزيائية للقيم المعطاة
   - لا تفترض أي ظروف معيارية إلا إذا نُص عليها صراحة

11. **إلزامية الدقة العلمية المطلقة - ZERO TOLERANCE (ABSOLUTE SCIENTIFIC ACCURACY MANDATE)**:
   - ❌ CRITICAL ERROR: ممنوع تماماً تحويل النسب المئوية إلى كتل بالجرام مباشرة (مثل 78% ≠ 78 جرام)
   - ❌ CRITICAL ERROR: لا تقل "نيتروجين: 78 جرام" - هذا خطأ علمي فادح
   - ✅ CORRECT: النسب المئوية للغازات تعني نسبة حجمية أو كتلية نسبية، وليس كتلة مطلقة
   - ✅ لحساب الكسر المولي من النسب المئوية: 
     * إذا كانت نسب حجمية (الأشيع للغازات): الكسر المولي = النسبة المئوية/100
     * إذا كانت نسب كتلية: حول إلى مولات باستخدام الكتل المولية ثم احسب الكسر المولي
   - لا تفترض كتلة عينة إجمالية (مثل 100 جرام) إلا إذا كانت معطاة صراحة
   - تأكد من الوحدات والأبعاد الفيزيائية لكل كمية قبل التعويض

MANDATORY SECTIONS (only include if content exists on the page):
- المفاهيم والتعاريف
- المصطلحات العلمية
- الصيغ والمعادلات  
- الأسئلة والإجابات الكاملة

Skip sections if the page does not contain relevant content for that section.`;

    const userPrompt = `${needsDetailedStructure ? `# ملخص المحتوى التعليمي
## ملخص المحتوى التعليمي
[summrize in few sentances what on this page for the student]
## المفاهيم والتعاريف
Analyze the content and extract key concepts and definitions. Format as:
- **[Arabic term]:** [definition]
## المصطلحات العلمية
Extract scientific terminology if present:
- **[Scientific term]:** [explanation]
## الصيغ والمعادلات
List formulas and equations if present:
| الصيغة | الوصف | المتغيرات |
|--------|--------|-----------|
| $$formula$$ | description | variables |
## مفاتيح و أفكار رئيسية
Summarize the main ideas and concepts from the page in bullet points:
- **[Key concept/idea]:** [brief explanation]
- **[Another key concept]:** [brief explanation]
## أمثلة توضيحية
[list examples so the students can relate to the concepts]
## الأسئلة والإجابات الكاملة
Process ALL questions from the OCR text with complete step-by-step solutions:
OCR TEXT:
${enhancedText}
CRITICAL: Answer EVERY question found. Do not skip any questions.` : `# ملخص الصفحة
## نظرة عامة
هذه صفحة تحتوي على محتوى تعليمي.
OCR TEXT:
${enhancedText}`}`;

    let summary = "";
    let providerUsed = "";

    // Try Gemini 1.5 Pro first (primary model)
    if (googleApiKey) {
      console.log('Attempting to use Gemini 1.5 Pro for summarization...');
      try {
        const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleApiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
              }
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 16000,
            }
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const finishReason = geminiData.candidates?.[0]?.finishReason;
          providerUsed = "gemini-1.5-pro";
          
          if (summary.trim()) {
            console.log(`Gemini 1.5 Pro API responded successfully - Length: ${summary.length}, Finish reason: ${finishReason}, provider_used: ${providerUsed}`);
            
            // Handle continuation if needed
            if (finishReason === "MAX_TOKENS" && summary.length > 0) {
              console.log('Gemini 1.5 Pro summary was truncated, attempting to continue...');
              
              for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`Gemini 1.5 Pro continuation attempt ${attempt}...`);
                
                const continuationPrompt = `CONTINUE THE SUMMARY - Complete all remaining questions.

Previous response ended with:
${summary.slice(-500)}

REQUIREMENTS:
- Continue from exactly where you left off
- Process ALL remaining questions (93-106 if not covered)
- Use EXACT formatting: **س: ٩٣- [question]** and **ج:** [answer]
- Use $$formula$$ for math, × for multiplication
- Complete ALL questions until finished

Original OCR text: ${enhancedText}`;

                const contResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleApiKey}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        parts: [{ text: systemPrompt + "\n\n" + continuationPrompt }]
                      }
                    ],
                    generationConfig: {
                      temperature: 0,
                      maxOutputTokens: 12000,
                    }
                  }),
                });

                if (contResp.ok) {
                  const contData = await contResp.json();
                  const continuation = contData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                  const contFinishReason = contData.candidates?.[0]?.finishReason;
                  
                  if (continuation.trim()) {
                    summary += "\n\n" + continuation;
                    console.log(`Gemini 1.5 Pro continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
                    
                    if (contFinishReason !== "MAX_TOKENS") {
                      break;
                    }
                  } else {
                    console.log(`Gemini 1.5 Pro continuation ${attempt} returned empty content`);
                    break;
                  }
                } else {
                  console.error(`Gemini 1.5 Pro continuation attempt ${attempt} failed:`, await contResp.text());
                  break;
                }
              }
            }
          } else {
            throw new Error("Gemini 1.5 Pro returned empty content");
          }
        } else {
          const errorText = await geminiResp.text();
          console.error('Gemini 1.5 Pro API error:', geminiResp.status, errorText);
          throw new Error(`Gemini 1.5 Pro API error: ${geminiResp.status}`);
        }
      } catch (geminiError) {
        console.error('Gemini 1.5 Pro failed, trying DeepSeek...', geminiError);
      }
    }

    // Fallback to DeepSeek Chat if Gemini failed or not available
    if (!summary.trim() && deepSeekApiKey) {
      console.log('Using DeepSeek Chat as fallback...');
      try {
        const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${deepSeekApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0,
            top_p: 0.9,
            max_tokens: 12000,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          summary = data.choices?.[0]?.message?.content ?? "";
          providerUsed = "deepseek-chat";
          console.log(`DeepSeek Chat API responded successfully - Length: ${summary.length}, provider_used: ${providerUsed}`);
          
          if (summary.trim()) {
            // Handle continuation if needed for DeepSeek Chat
            const finishReason = data.choices?.[0]?.finish_reason;
            if (finishReason === "length" && summary.length > 0) {
              console.log('DeepSeek Chat summary was truncated, attempting to continue...');
              
              for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`DeepSeek Chat continuation attempt ${attempt}...`);
                
                const continuationPrompt = `CONTINUE THE SUMMARY - Complete all remaining questions.

Previous response ended with:
${summary.slice(-500)}

REQUIREMENTS:
- Continue from exactly where you left off
- Process ALL remaining questions (93-106 if not covered)
- Use EXACT formatting: **س: ٩٣- [question]** and **ج:** [answer]
- Use $$formula$$ for math, × for multiplication
- Complete ALL questions until finished

Original OCR text: ${enhancedText}`;

                const contResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${deepSeekApiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: continuationPrompt },
                    ],
                    temperature: 0,
                    max_tokens: 8000,
                  }),
                });

                if (contResp.ok) {
                  const contData = await contResp.json();
                  const continuation = contData.choices?.[0]?.message?.content ?? "";
                  const contFinishReason = contData.choices?.[0]?.finish_reason;
                  
                  if (continuation.trim()) {
                    summary += "\n\n" + continuation;
                    console.log(`DeepSeek Chat continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
                    
                    if (contFinishReason !== "length") {
                      break;
                    }
                  } else {
                    console.log(`DeepSeek Chat continuation ${attempt} returned empty content`);
                    break;
                  }
                } else {
                  console.error(`DeepSeek Chat continuation attempt ${attempt} failed:`, await contResp.text());
                  break;
                }
              }
            }
          } else {
            throw new Error("DeepSeek Chat returned empty content");
          }
        } else {
          const txt = await resp.text();
          console.error('DeepSeek Chat API error:', resp.status, txt);
          throw new Error(`DeepSeek Chat API error: ${resp.status}`);
        }
      } catch (deepSeekError) {
        console.error('DeepSeek Chat API failed:', deepSeekError);
      }
    }

    if (!summary.trim()) {
      console.error('No valid summary generated from any API');
      return new Response(JSON.stringify({ error: "Failed to generate summary from any API" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Validate question completion and trigger auto-continuation if needed
    const summaryQuestionCount = (summary.match(/\*\*س:/g) || []).length;
    const originalQuestionCount = questions.length;
    
    console.log(`Final summary length: ${summary.length}, Questions processed: ${summaryQuestionCount}/${originalQuestionCount}, Provider: ${providerUsed}`);
    
    // Robust continuation logic - ensure ALL questions are answered regardless of summary length
    if (originalQuestionCount > 0 && summaryQuestionCount < originalQuestionCount) {
      console.log(`⚠️ Missing ${originalQuestionCount - summaryQuestionCount} questions, attempting auto-continuation...`);
      
      // Improved missing question detection - check for both Arabic and English patterns
      const answeredQuestionNumbers = new Set();
      const questionPatterns = [
        /\*\*س:\s*(\d+)[.-]/g,  // **س: 45- or **س: 45.
        /\*\*س:\s*([٠-٩]+)[.-]/g  // **س: ٤٥- (Arabic numerals)
      ];
      
      for (const pattern of questionPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(summary)) !== null) {
          const num = convertArabicToEnglishNumber(match[1]);
          answeredQuestionNumbers.add(num);
        }
      }
      
      let missingNumbers = questions
        .map(q => convertArabicToEnglishNumber(q.number))
        .filter(num => !answeredQuestionNumbers.has(num));
      
      console.log(`Detected questions: ${questions.map(q => q.number).join(', ')}`);
      console.log(`Answered questions: ${Array.from(answeredQuestionNumbers).join(', ')}`);
      console.log(`Missing questions: ${missingNumbers.join(', ')}`);
      
      if (missingNumbers.length > 0 && (providerUsed === 'deepseek-chat' || providerUsed === 'gemini-1.5-pro')) {
        // Multi-attempt continuation with safety limit
        const maxAttempts = 4;
        let attempt = 0;
        let currentSummary = summary;
        
        while (missingNumbers.length > 0 && attempt < maxAttempts) {
          attempt++;
          console.log(`🔄 Auto-continuation attempt ${attempt}/${maxAttempts} for questions: ${missingNumbers.join(', ')}`);
          
          const completionPrompt = `COMPLETE THE MISSING QUESTIONS - Continuation ${attempt}/${maxAttempts}

Previous summary is incomplete. Missing these question numbers: ${missingNumbers.join(', ')}

REQUIREMENTS:
1. When solving questions, solve them in sequence from the least to the most. Start from question ${Math.min(...missingNumbers.map(n => parseInt(n)))}, then continue sequentially.
2. Ensure that you answer all the questions despite token limits. Be concise on topics but complete on question solutions.
- Process ONLY the missing questions: ${missingNumbers.join(', ')}
- Use EXACT formatting: **س: [number]- [question text]** and **ج:** [complete answer]
- Use $$formula$$ for math, × for multiplication
- Provide complete step-by-step solutions
- Do NOT repeat questions already answered

Missing questions from OCR text:
${enhancedText.split('\n').filter(line => 
  missingNumbers.some(num => line.includes(`${num}.`) || line.includes(`${num}-`) || line.includes(`${num} `))
).join('\n')}

If you cannot fit all questions in one response, prioritize the lowest numbered questions first.`;

          try {
            let completionResp;
            
            if (providerUsed === 'deepseek-chat') {
              completionResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${deepSeekApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "deepseek-chat",
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: completionPrompt },
                  ],
                  temperature: 0,
                  max_tokens: 8000,
                }),
              });
            } else {
              completionResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: systemPrompt + "\n\n" + completionPrompt }] }],
                  generationConfig: { temperature: 0, maxOutputTokens: 8000 }
                }),
              });
            }

            if (completionResp.ok) {
              let completion = "";
              
              if (providerUsed === 'deepseek-chat') {
                const completionData = await completionResp.json();
                completion = completionData.choices?.[0]?.message?.content ?? "";
              } else {
                const completionData = await completionResp.json();
                completion = completionData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              }
              
              if (completion.trim()) {
                currentSummary += "\n\n" + completion;
                
                // Re-check what questions are now answered
                const newAnsweredNumbers = new Set();
                for (const pattern of questionPatterns) {
                  let match;
                  pattern.lastIndex = 0;
                  while ((match = pattern.exec(currentSummary)) !== null) {
                    const num = convertArabicToEnglishNumber(match[1]);
                    newAnsweredNumbers.add(num);
                  }
                }
                
                // Update missing numbers list
                const stillMissing = questions
                  .map(q => convertArabicToEnglishNumber(q.number))
                  .filter(num => !newAnsweredNumbers.has(num));
                
                const answeredThisRound = missingNumbers.filter(num => newAnsweredNumbers.has(num));
                
                console.log(`✅ Attempt ${attempt} completed ${answeredThisRound.length} questions: ${answeredThisRound.join(', ')}`);
                console.log(`Still missing: ${stillMissing.join(', ')}`);
                
                // Update for next iteration
                missingNumbers.splice(0, missingNumbers.length, ...stillMissing);
                
                if (stillMissing.length === 0) {
                  console.log('🎉 All questions completed successfully!');
                  break;
                }
              } else {
                console.log(`⚠️ Attempt ${attempt} returned empty completion`);
                break;
              }
            } else {
              console.error(`Completion attempt ${attempt} failed:`, await completionResp.text());
              break;
            }
          } catch (completionError) {
            console.error(`Auto-continuation attempt ${attempt} failed:`, completionError);
            break;
          }
        }
        
        summary = currentSummary;
        const finalQuestionCount = (summary.match(/\*\*س:/g) || []).length;
        console.log(`✅ Auto-continuation finished after ${attempt} attempts. Final question count: ${finalQuestionCount}/${originalQuestionCount}`);
        
        if (missingNumbers.length > 0) {
          console.log(`⚠️ Still missing ${missingNumbers.length} questions after all attempts: ${missingNumbers.join(', ')}`);
        }
      }
    } else if (summaryQuestionCount >= originalQuestionCount) {
      console.log('✅ All questions appear to be processed successfully');
    }

    // ========== PRE-FLIGHT CHECKLIST VALIDATION & AUTO-REPAIR ==========
    console.log('🛡️ Starting Pre-flight Checklist Validation...');
    
    let finalSummary = summary;
    let validationAttempt = 0;
    const maxValidationAttempts = 3;
    
    while (validationAttempt < maxValidationAttempts) {
      validationAttempt++;
      console.log(`🔍 Validation attempt ${validationAttempt}/${maxValidationAttempts}`);
      
      // Extract pre-flight checklist from AI response
      const checklist = extractPreflightChecklist(finalSummary);
      
      if (!checklist) {
        console.log('⚠️ No pre-flight checklist found in AI response - triggering repair');
        
        const repairPrompt = `🚨 CRITICAL REPAIR REQUIRED - MISSING PRE-FLIGHT CHECKLIST

Your response is missing the mandatory pre-flight checklist. You MUST add this checklist at the end of your response:

\`\`\`json
{
  "visualReferenceCompliance": true/false,
  "visualDataExtraction": true/false, 
  "mcqMapping": true/false,
  "calculationAccuracy": true/false,
  "languageConsistency": true/false,
  "questionCompleteness": true/false,
  "schemaAdherence": true/false,
  "citationRequirement": true/false,
  "formatCompliance": true/false,
  "contentStructure": true/false,
  "keywordIntegration": true/false,
  "responseLength": true/false,
  "overallCompliance": true/false
}
\`\`\`

Current response without checklist:
${finalSummary}

Add the checklist and ensure all values are accurate.`;
        
        finalSummary = await attemptRepair(repairPrompt, providerUsed, googleApiKey, deepSeekApiKey, systemPrompt);
        continue;
      }
      
      // Validate the checklist
      const validation = validatePreflight(checklist, questions, finalSummary);
      
      if (validation.isValid) {
        console.log('✅ Pre-flight checklist validation PASSED');
        console.log('📊 Compliance Status: ALL MANDATES SATISFIED');
        break;
      } else {
        console.log(`❌ Pre-flight checklist validation FAILED: ${validation.failedChecks.join(', ')}`);
        
        if (validation.repairPrompt && validationAttempt < maxValidationAttempts) {
          console.log(`🔧 Attempting targeted repair for attempt ${validationAttempt}...`);
          finalSummary = await attemptRepair(validation.repairPrompt, providerUsed, googleApiKey, deepSeekApiKey, systemPrompt);
        } else {
          console.log('🚨 Maximum validation attempts reached - proceeding with current response');
          break;
        }
      }
    }
    
    // Final validation and logging
    const finalChecklist = extractPreflightChecklist(finalSummary);
    if (finalChecklist) {
      const finalValidation = validatePreflight(finalChecklist, questions, finalSummary);
      console.log('📋 FINAL COMPLIANCE REPORT:');
      console.log(`- Visual Reference Compliance: ${finalChecklist.visualReferenceCompliance ? '✅' : '❌'}`);
      console.log(`- Visual Data Extraction: ${finalChecklist.visualDataExtraction ? '✅' : '❌'}`);
      console.log(`- MCQ Mapping: ${finalChecklist.mcqMapping ? '✅' : '❌'}`);
      console.log(`- Question Completeness: ${finalChecklist.questionCompleteness ? '✅' : '❌'}`);
      console.log(`- Overall Compliance: ${finalChecklist.overallCompliance ? '✅' : '❌'}`);
      console.log(`- Validation Attempts Used: ${validationAttempt}/${maxValidationAttempts}`);
    } else {
      console.log('🚨 CRITICAL: Final response still missing pre-flight checklist');
    }
    
    summary = finalSummary;

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error('Unexpected error in summarize function:', e);
    console.error('Error stack:', e.stack);
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

// Helper function for repair attempts
async function attemptRepair(
  repairPrompt: string, 
  providerUsed: string, 
  googleApiKey: string, 
  deepSeekApiKey: string, 
  systemPrompt: string
): Promise<string> {
  try {
    console.log(`🔧 Attempting repair using ${providerUsed}...`);
    
    let repairResp;
    
    if (providerUsed === 'gemini-1.5-pro' && googleApiKey) {
      repairResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + repairPrompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 16000 }
        }),
      });
      
      if (repairResp.ok) {
        const repairData = await repairResp.json();
        const repairedContent = repairData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (repairedContent.trim()) {
          console.log('✅ Repair successful with Gemini');
          return repairedContent;
        }
      }
    } else if (providerUsed === 'deepseek-chat' && deepSeekApiKey) {
      repairResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${deepSeekApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: repairPrompt },
          ],
          temperature: 0,
          max_tokens: 12000,
        }),
      });
      
      if (repairResp.ok) {
        const repairData = await repairResp.json();
        const repairedContent = repairData.choices?.[0]?.message?.content ?? "";
        if (repairedContent.trim()) {
          console.log('✅ Repair successful with DeepSeek');
          return repairedContent;
        }
      }
    }
    
    console.log('⚠️ Repair attempt failed - returning original content');
    return repairPrompt; // Return original content if repair fails
    
  } catch (error) {
    console.error('🚨 Repair attempt error:', error);
    return repairPrompt; // Return original content if repair fails
  }
}