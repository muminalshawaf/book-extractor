import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced question parsing function with section-aware parsing
function parseQuestions(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
  // First, try to parse section-based questions (more accurate for structured content)
  const sectionMatches = text.match(/--- SECTION: (\d+) ---\s*([\s\S]*?)(?=--- SECTION: \d+ ---|$)/g);
  
  if (sectionMatches && sectionMatches.length > 0) {
    console.log(`Found ${sectionMatches.length} structured sections`);
    
    // Parse the raw OCR data to identify actual exercise sections
    const ocrText = text.includes('"sections":') ? text : '';
    const actualQuestions = [];
    
    if (ocrText) {
      try {
        // Extract sections from OCR data
        const sectionsMatch = ocrText.match(/"sections":\s*\[([\s\S]*?)\]/);
        if (sectionsMatch) {
          const sectionsText = sectionsMatch[1];
          const exerciseMatches = sectionsText.match(/"type":\s*"exercise"[^}]*"title":\s*"([^"]*)"[^}]*"content":\s*"([^"]*(?:\\.[^"]*)*)"/g);
          
          if (exerciseMatches) {
            exerciseMatches.forEach((match) => {
              const titleMatch = match.match(/"title":\s*"([^"]*)"/);
              const contentMatch = match.match(/"content":\s*"([^"]*(?:\\.[^"]*)*)"/);
              
              if (titleMatch && contentMatch) {
                const questionNumber = titleMatch[1];
                let questionText = contentMatch[1]
                  .replace(/\\n/g, ' ')
                  .replace(/\\"/g, '"')
                  .trim();
                
                if (questionText.length > 10) {
                  actualQuestions.push({
                    number: questionNumber,
                    text: questionText,
                    fullMatch: match,
                    isMultipleChoice: isMultipleChoiceSection
                  });
                }
              }
            });
          }
        }
      } catch (error) {
        console.error('Error parsing OCR sections:', error);
      }
    }
    
    // If we found actual exercise questions, use those
    if (actualQuestions.length > 0) {
      console.log(`Found ${actualQuestions.length} actual exercise questions:`, 
        actualQuestions.map(q => q.number).join(', '));
      questions.push(...actualQuestions);
    } else {
      // Fallback to section-based parsing with better filtering
      sectionMatches.forEach((section, index) => {
        const sectionNumber = (index + 1).toString();
        const sectionContent = section.replace(/--- SECTION: \d+ ---\s*/, '').trim();
        
        // Skip if section is too short, contains only visual context, or is clearly not a question
        if (sectionContent.length > 20 && 
            !sectionContent.startsWith('**TABLE**') && 
            !sectionContent.startsWith('**IMAGE**') &&
            !sectionContent.includes('وزارة التعليم') &&
            !sectionContent.match(/^\d+$/) && // Skip page numbers
            !sectionContent.includes('Ministry of Education')) {
          
          // Extract the main question text (before any numbered sub-items)
          let questionText = sectionContent;
          
          // If there are numbered sub-items, get the question text before them
          const subItemMatch = sectionContent.match(/^(.*?)(?=\n\s*\d+\.)/s);
          if (subItemMatch) {
            questionText = subItemMatch[1].trim();
            // Remove "Question Text:" prefix if present
            questionText = questionText.replace(/^Question Text:\s*/, '');
          }
          
          if (questionText.length > 10) {
            questions.push({
              number: sectionNumber,
              text: questionText,
              fullMatch: section,
              isMultipleChoice: isMultipleChoiceSection
            });
          }
        }
      });
    }
    
    console.log(`Parsed ${questions.length} questions from structured sections:`, 
      questions.map(q => q.number).join(', '));
    
    return questions;
  }
  
  // Fallback to legacy parsing for non-structured content
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
      
      // Skip if this looks like a sub-item within a larger question
      if (questionText.length > 10 && !questionText.includes('Options:')) {
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

// Enhanced page type detection
function detectPageType(text: string, questions: Array<any>): 'questions-focused' | 'content-heavy' | 'mixed' | 'non-content' {
  const cleanText = text.replace(/[{}",:\[\]]/g, ' '); // Remove JSON artifacts
  const textLength = cleanText.length;
  
  // Content keywords
  const contentKeywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'نظرية', 'خاصية', 'مفهوم', 'شرح',
    'example', 'definition', 'law', 'equation', 'theorem', 'property', 'concept', 'explanation',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات', 'المبادئ',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps', 'principles'
  ];
  
  // Question indicators
  const questionKeywords = [
    'اشرح', 'وضح', 'قارن', 'حدد', 'لماذا', 'كيف', 'ماذا', 'أين', 'متى', 'احسب', 'أوجد',
    'explain', 'describe', 'compare', 'identify', 'why', 'how', 'what', 'where', 'when', 'calculate', 'find'
  ];
  
  const contentKeywordCount = contentKeywords.filter(keyword => 
    cleanText.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  const questionKeywordCount = questionKeywords.filter(keyword => 
    cleanText.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  // Count actual numbered questions
  const questionCount = questions.length;
  const questionDensity = questionCount > 0 ? questionCount / (textLength / 1000) : 0;
  
  // Check for explanatory content vs questions
  const hasSubstantialExplanation = contentKeywordCount >= 3;
  const hasHighQuestionDensity = questionDensity > 2; // More than 2 questions per 1000 chars
  const isQuestionDominant = questionCount >= 3 && questionKeywordCount >= questionCount * 0.7;
  
  // Determine page type
  if (questionCount === 0 && contentKeywordCount < 2) {
    return 'non-content';
  } else if (isQuestionDominant && !hasSubstantialExplanation) {
    return 'questions-focused';
  } else if (hasSubstantialExplanation && questionCount <= 2) {
    return 'content-heavy';
  } else {
    return 'mixed';
  }
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
    
    const { text, lang = "ar", page, title, ocrData = null, ragContext = null } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title}, ragContext: ${ragContext ? `${ragContext.length} pages` : 'none'} }`);
    
    // Log model usage priority
    // Model selection already logged above
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    console.log('Available models:');
    console.log(`- Gemini 2.5 Pro: ${GOOGLE_API_KEY ? 'AVAILABLE (primary)' : 'UNAVAILABLE'}`);
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

    // Check if this is a table of contents page (more specific detection)
    const cleanText = text.replace(/[{}",:\[\]]/g, ' '); // Remove JSON artifacts
    const isTableOfContents = (
      (cleanText.includes('فهرس المحتويات') || cleanText.includes('جدول المحتويات')) &&
      !cleanText.includes('تمرينات') && 
      !cleanText.includes('exercises') &&
      !cleanText.includes('أسئلة') &&
      !cleanText.includes('سؤال')
    );
    
    if (isTableOfContents) {
      console.log('Detected table of contents page, returning simple message');
      return new Response(JSON.stringify({ 
        summary: "### نظرة عامة\nهذه صفحة فهرس المحتويات التي تعرض تنظيم الكتاب وأقسامه الرئيسية." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse questions from OCR text for validation
    const questions = parseQuestions(text);
    console.log(`Found ${questions.length} questions in OCR text`);
    
    // Enhanced page type detection
    const pageType = detectPageType(text, questions);
    const needsDetailedStructure = isContentPage(text);
    console.log(`Page type: ${pageType} (detailed structure: ${needsDetailedStructure})`);

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

    // Build RAG context section if provided  
    let ragContextSection = '';
    let ragPagesActuallySent = 0;
    let ragPagesSentList: number[] = [];
    let ragContextChars = 0;
    if (ragContext && Array.isArray(ragContext) && ragContext.length > 0) {
      console.log(`Building RAG context from ${ragContext.length} previous pages`);
      ragContextSection = "\n\n=== REFERENCE CONTEXT FROM PREVIOUS PAGES ===\n⚠️ FOR UNDERSTANDING ONLY - DO NOT EXTRACT QUESTIONS FROM THIS SECTION\n---\n";
      
      let totalLength = ragContextSection.length;
      const maxContextLength = 8000; // Increased from 2000 to fit more pages
      
      for (const context of ragContext) {
        // Clean content by removing numbered questions to prevent confusion
        let cleanContent = context.content || context.ocr_text || '';
        // Remove pattern for numbered questions (س: [number]- or similar)
        cleanContent = cleanContent.replace(/س:\s*\d+\s*[-–]\s*[^؟]*؟?/g, '[Question removed from reference context]');
        
        const pageContext = `Page ${context.pageNumber}${context.title ? ` (${context.title})` : ''}:\n${cleanContent}\n\n`;
        
        if (totalLength + pageContext.length > maxContextLength) {
          // Truncate to fit within limits
          const remainingLength = maxContextLength - totalLength - 20;
          if (remainingLength > 100) {
            ragContextSection += pageContext.slice(0, remainingLength) + "...\n\n";
            ragPagesActuallySent++;
            ragPagesSentList.push(context.pageNumber);
          }
          break;
        }
        
        ragContextSection += pageContext;
        totalLength += pageContext.length;
        ragPagesActuallySent++;
        ragPagesSentList.push(context.pageNumber);
      }
      
      ragContextSection += "---\n=== END OF REFERENCE CONTEXT ===\n\n=== CURRENT PAGE CONTENT STARTS HERE ===\n";
      ragContextChars = totalLength;
      console.log(`✅ RAG VALIDATION: ${ragPagesActuallySent} pages actually sent to Gemini 2.5 Pro (${totalLength} characters)`);
    }

    // Enhanced text with visual context and RAG context
    const enhancedText = ragContextSection + text + visualElementsText;

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);

    // Determine subject from title to set correct persona (Chemistry, Physics, Math, AI, etc.)
    let subject = 'Science';
    let subjectAr = 'العلوم';
    if (title) {
      const t = String(title).toLowerCase();
      if (t.includes('chemistry') || t.includes('كيمياء')) {
        subject = 'Chemistry'; subjectAr = 'الكيمياء';
      } else if (t.includes('physics') || t.includes('فيزياء')) {
        subject = 'Physics'; subjectAr = 'الفيزياء';
      } else if (t.includes('رياضيات') || t.includes('mathematics') || t.includes('math')) {
        subject = 'Mathematics'; subjectAr = 'الرياضيات';
      } else if (
        t.includes('ذكاء') || t.includes('اصطناعي') || t.includes('الإصطناعي') ||
        t.includes('artificial intelligence') || t.includes('artificial-intelligence')
      ) {
        subject = 'Artificial Intelligence'; subjectAr = 'الذكاء الاصطناعي';
      }
    }

    // Chemistry-only mandates (included only when subject is Chemistry)
    const chemistryMandates = subject === 'Chemistry' ? `
8. QUANTITATIVE ANALYSIS MANDATE (Chemistry-specific): For questions comparing effects (like boiling point elevation, freezing point depression, etc.), you MUST:
   - Calculate molality for each substance
   - Apply van't Hoff factor (i) for ionic compounds
   - Calculate the effective molality (molality × i)
   - Compare numerical results
   - State which is greater and by how much

🧪 ABSOLUTE CHEMISTRY-SPECIFIC TABLE LOOKUP MANDATE:
   - MANDATORY Chemical Name Matching: You MUST match questions about specific acids/compounds with table entries using chemical knowledge
   - MANDATORY Ka/pH Relationship: You MUST always use table Ka values for pH calculations, even if compound names differ slightly
   - MANDATORY Common Acid Identifications:
     * Cyanoethanoic acid (cyanoacetic acid) ≈ Ka ~3.5×10^-3
     * You MUST connect question compounds to closest Ka values in tables
   - ABSOLUTE PROHIBITION: You are FORBIDDEN from claiming "insufficient data" if ANY Ka values or chemical data exist in tables
   - MANDATORY approximation methods: You MUST use Ka = [H+]²/C for weak acid calculations when valid
   - ABSOLUTE REQUIREMENT: Your final numerical answer MUST correspond to one of the multiple choice options

🔢 ABSOLUTE MANDATORY CALCULATION EXECUTION (Chemistry):
   - CRITICAL: If ANY numerical data exists (Ka, concentrations, etc.), you are REQUIRED to attempt calculations
   - You MUST use chemical equilibrium principles even with approximate data matching
   - You MUST apply weak acid/base formulas when Ka values are available
   - You MUST connect table data to question parameters through chemical knowledge
   - FAILURE TO CALCULATE WHEN DATA EXISTS IS STRICTLY FORBIDDEN
` : '';

    const systemPrompt = `You are an expert ${subject} professor. Your task is to analyze educational content and provide structured summaries following a specific format.

🔍 **MANDATORY INTERNAL PRE-FLIGHT CHECK (DO NOT INCLUDE IN YOUR RESPONSE)**:
Before writing your summary, you MUST internally check:
1. Does ANY question reference a graph, chart, figure, table, or visual element (الشكل، الجدول، المخطط)?
2. If YES: Have I thoroughly reviewed the OCR VISUAL CONTEXT section for relevant data?
3. If YES: Am I using specific data points, values, or information from the visual elements in my answers?
4. If visual elements exist but I'm not using them: STOP and re-examine - you CANNOT proceed without using visual data when questions reference it.

⚠️ CRITICAL: This check is for your internal processing only. DO NOT include this checklist in your final response. Your response should ONLY contain the summary content as specified below.

⚠️ CRITICAL: If any question references a graph or table, review the OCR context, specifically the visuals and table section and ensure you use it to answer the questions with high precision. NEVER provide an answer without this critical step.

FORMAT REQUIREMENTS:
# Header
## Sub Header  
### Sub Header
Use tables when necessary
- Question format: **س: [number]- [exact question text]**
- Answer format: **ج:** [complete step-by-step solution]
${hasMultipleChoice ? `
- MULTIPLE CHOICE FORMAT (for regular multiple choice):
  * **س: [number]- [question text]**
  * List answer choices if present: أ) [choice A] ب) [choice B] ج) [choice C] د) [choice D]
  * **ج:** [reasoning/calculation] **الإجابة الصحيحة: [letter]**` : ''}
- Use LaTeX for formulas: $$formula$$
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**

CRITICAL QUESTION SOLVING MANDATES - NON-NEGOTIABLE:
1. **SEQUENTIAL ORDER MANDATE**: You MUST solve questions in strict numerical sequence from lowest to highest number. If you see questions 45, 102, 46, you MUST answer them as: 45, then 46, then 102. This is MANDATORY and non-negotiable.
2. **COMPLETE ALL QUESTIONS MANDATE**: You MUST answer every single question found in the text. NO EXCEPTIONS. Be concise on explanatory topics if needed, but NEVER skip questions.
3. **ACCURACY MANDATE**: Double-check all formulas, calculations, and scientific facts. Verify your answers against standard ${subject} principles before providing them.
4. **STEP-BY-STEP MANDATE**: Each question must have a complete, logical solution showing all work and reasoning.
5. **USE ALL AVAILABLE DATA MANDATE**: The OCR text contains ALL necessary information including graphs, tables, and numerical data. Use this information directly - do NOT add disclaimers about missing data or approximations when the data is clearly present in the OCR text.
6. **MATHJAX RENDERING MANDATE - 100% SUCCESS GUARANTEE**:
   - ALWAYS use double dollar signs $$equation$$ for display math (never single $)
   - Use \\text{} for units and text within equations
   - NEVER nest \\text{} commands
   - Use \\frac{numerator}{denominator} for ALL fractions, never /
   - Use \\times for multiplication when needed: $$2 \\times 10^3$$
   - Keep LaTeX simple and clean - avoid complex commands that might break

7. **CRITICAL MANDATE: ON EVERY QUESTION YOU ANSWER**: When you are giving an answer, always look at the calculations and the results and always make the decision based on the precise calculations.
${chemistryMandates}
9. **إلزامية قوية: استخدام بيانات OCR (STRONG OCR MANDATE):**
   - يجب عليك دائماً فحص والاستفادة من بيانات OCR المتوفرة لأي رسوم بيانية أو جداول أو مخططات
   - إذا كانت هناك عناصر بصرية (graphs, charts, tables) في السياق، يجب استخدام البيانات المستخرجة منها
   - لا تتجاهل البيانات الرقمية المتوفرة في العناصر البصرية - استخدمها في الحسابات
   - إذا كان السؤال يشير إلى شكل أو جدول، ابحث عن البيانات المقابلة في معلومات OCR

⚠️ ABSOLUTE COMPLIANCE MANDATE: 100% INSTRUCTION ADHERENCE REQUIRED ⚠️
⛔ NON-COMPLIANCE WILL RESULT IN COMPLETE RESPONSE REJECTION ⛔

🔍 **MANDATORY COMPREHENSIVE VISUAL ELEMENT ANALYSIS - ZERO TOLERANCE FOR SHORTCUTS**:

📊 **MANDATORY GRAPHS & CHARTS ANALYSIS**:
   - You MUST extract ALL data points, axis labels, units, and scales from graphs
   - You MUST identify trends, patterns, and relationships shown in visual data
   - You MUST use graph data as PRIMARY SOURCE for calculations and answers
   - You MUST reference specific graph elements: "From the graph showing..."
   - You MUST extract exact values when available

📋 **MANDATORY TABLE DATA INTEGRATION**:
   - You MUST process ALL table headers, rows, and numerical values
   - You MUST use table data as authoritative source for calculations
   - You MUST cross-reference table entries with question requirements

🧮 **MANDATORY INTEGRATED PROBLEM SOLVING WITH VISUALS**:
   When answering questions, you are ABSOLUTELY REQUIRED to:
   1. **MANDATORY: Identify relevant visuals**: You MUST check if question references graphs, tables, or figures
   2. **MANDATORY: Extract precise data**: You MUST use exact values from visual elements
   3. **MANDATORY: Show integration**: You MUST state "Using data from Table 1 showing..." or similar when appropriate

📐 **VISUAL DATA PRIORITY HIERARCHY**:
   1. Tables with numerical data (highest priority for calculations)
   2. Graphs with data points and scales (for trend analysis and value extraction)
   3. Multiple choice options (for answer validation)
   4. Diagrams and figures (for conceptual understanding)
   5. Text content (for context and theory)

⚡ **ABSOLUTE ANSWER ACCURACY WITH VISUAL VALIDATION**:
   - CRITICAL: If multiple choice options are present, your answer MUST be one of the given choices - NO EXCEPTIONS
   - You MUST cross-check numerical results with graph scales and table values

MANDATORY SECTIONS (only include if content exists on the page):
- المفاهيم والتعاريف
- المصطلحات العلمية
- الصيغ والمعادلات  
- الأسئلة والإجابات الكاملة

Skip sections if the page does not contain relevant content for that section.`;

    // Create specialized prompts based on page type
    let userPrompt = '';
    
    if (pageType === 'questions-focused') {
      // Specialized prompt for question-focused pages with full RAG support
      userPrompt = `# حل الأسئلة المختصة
## تحليل الأسئلة باستخدام السياق الكامل

**FOCUSED QUESTION-SOLVING MODE ACTIVATED**
This page contains primarily questions (${questions.length} detected: ${questions.map(q => q.number).join(', ')}). Use the RAG context from previous pages to provide direct, precise answers.

**CRITICAL INSTRUCTION: ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.**

**RAG CONTEXT INTEGRATION MANDATE:**
- You MUST use information from the provided RAG context to answer questions
- Reference specific concepts, formulas, or data from previous pages when relevant
- Connect answers to previously established knowledge from the book
- If RAG context provides relevant background, explicitly mention it: "Based on the concept from page X..."

## الأسئلة والحلول الكاملة
Answer ONLY the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} that appear on THIS page. For each question:
1. **Identify relevant RAG context** that applies to the question
2. **Use established formulas/concepts** from previous pages when applicable  
3. **Provide step-by-step solution** with clear reasoning
4. **Reference source material** when using RAG context

Process ONLY the questions detected on this page (${questions.map(q => q.number).join(', ')}):
OCR TEXT:
${enhancedText}

CRITICAL: Answer ONLY the questions numbered ${questions.map(q => q.number).join(', ')} found on THIS page. Do NOT include questions from RAG context that are not on this page.`;

    } else if (pageType === 'content-heavy') {
      // Enhanced content-focused prompt with RAG integration
      userPrompt = `# ملخص المحتوى التعليمي المعزز
## تكامل المحتوى مع السياق السابق

**CONTENT INTEGRATION MODE WITH RAG SUPPORT**
This page contains substantial educational content. Integrate with RAG context to show knowledge progression.

## ملخص المحتوى التعليمي  
[Summarize in few sentences what's on this page, connecting to previous concepts when RAG context is available]

## المفاهيم والتعاريف
Analyze content and extract key concepts. When RAG context exists, show how new concepts build on previous ones:
- **[Arabic term]:** [definition] ${ragContext && ragContext.length > 0 ? '[Connect to previous concepts when relevant]' : ''}

## المصطلحات العلمية
Extract scientific terminology, linking to previously introduced terms when applicable:
- **[Scientific term]:** [explanation]

## الصيغ والمعادلات  
List formulas and equations, showing relationship to previously covered material:
| الصيغة | الوصف | المتغيرات | الربط بالسياق السابق |
|--------|--------|-----------|---------------------|
| $$formula$$ | description | variables | [connection if relevant] |

## التطبيقات والأمثلة
List examples showing practical applications and connections to previous topics

${questions.length > 0 ? `## الأسئلة والإجابات الكاملة
ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.

Process ONLY the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} found on this page using both current content and RAG context:` : ''}
OCR TEXT:
${enhancedText}`;

    } else if (pageType === 'mixed') {
      // Balanced approach for mixed content
      userPrompt = `# تحليل متوازن للمحتوى والأسئلة
## دمج المعرفة والتطبيق

**BALANCED CONTENT-QUESTION MODE WITH RAG**
This page contains both educational content and questions. Use RAG context to create comprehensive coverage.

## نظرة عامة على المحتوى
[Brief overview connecting to previous material via RAG context]

## المفاهيم الأساسية
Key concepts from this page, linked to previous knowledge:
- **[Concept]:** [explanation with RAG connections where relevant]

${questions.length > 0 ? `## الأسئلة والحلول التطبيقية  
ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.

Answer the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} using integrated knowledge from RAG context and current content:` : ''}
OCR TEXT:
${enhancedText}

CRITICAL: Process content and ${questions.length > 0 ? 'ONLY the questions numbered ' + questions.map(q => q.number).join(', ') + ' from this page' : 'no questions found on this page'}, showing clear connections between theory and application.`;

    } else {
      // Default for non-content pages
      userPrompt = `# ملخص الصفحة
## نظرة عامة
هذه صفحة تحتوي على محتوى تعليمي.
OCR TEXT:
${enhancedText}`;
    }

    let summary = "";
    let providerUsed = "";

    // Try Gemini 2.5 Pro first (primary model)
    if (googleApiKey) {
      console.log('Attempting to use Gemini 2.5 Pro for summarization...');
      try {
        const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
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
          providerUsed = "gemini-2.5-pro";
          
          if (summary.trim()) {
            console.log(`Gemini 2.5 Pro API responded successfully - Length: ${summary.length}, Finish reason: ${finishReason}, provider_used: ${providerUsed}`);
            
            // Handle continuation if needed
            if (finishReason === "MAX_TOKENS" && summary.length > 0) {
              console.log('Gemini 2.5 Pro summary was truncated, attempting to continue...');
              
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

                const contResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
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
      
      if (missingNumbers.length > 0 && (providerUsed === 'deepseek-chat' || providerUsed === 'gemini-2.5-pro')) {
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
              completionResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
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

    return new Response(JSON.stringify({ 
      summary,
      rag_pages_sent: ragPagesActuallySent,
      rag_pages_found: ragContext?.length || 0,
      rag_pages_sent_list: ragPagesSentList,
      rag_context_chars: ragContextChars
    }), {
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