import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side RAG retrieval as fallback when no context is provided
async function fetchRagContextServer(bookId: string, currentPage: number, queryText: string, maxPages = 3, similarityThreshold = 0.3) {
  try {
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!googleApiKey || !supabaseUrl || !serviceKey) {
      console.warn('RAG fallback disabled: missing GOOGLE_API_KEY or SUPABASE env');
      return [];
    }

    // Generate query embedding
    const embResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: String(queryText).slice(0, 20000) }] }
        })
      }
    );

    if (!embResp.ok) {
      console.error('RAG embedding API failed:', await embResp.text());
      return [];
    }

    const embData = await embResp.json();
    const values: number[] = embData?.embedding?.values || [];
    if (!values.length) return [];

    // Query similar pages via RPC
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase.rpc('match_pages_for_book', {
      target_book_id: bookId,
      query_embedding: `[${values.join(',')}]`,
      match_threshold: similarityThreshold,
      match_count: maxPages,
      current_page_number: currentPage
    });

    if (error) {
      console.error('RAG RPC error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      pageNumber: row.page_number,
      title: row.title,
      content: row.ocr_text,
      summary: row.summary_md,
      similarity: row.similarity
    }));
  } catch (err) {
    console.error('RAG fallback error:', err);
    return [];
  }
}

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
        // Extract actual section number from header instead of using sequential index
        const sectionHeaderMatch = section.match(/--- SECTION: (\d+) ---/);
        const sectionNumber = sectionHeaderMatch ? sectionHeaderMatch[1] : (index + 1).toString();
        const sectionContent = section.replace(/--- SECTION: \d+ ---\s*/, '').trim();
        
        // Skip if section is too short, contains only visual context, publisher info, or is clearly not a question
        if (sectionContent.length > 20 && 
            !sectionContent.startsWith('**TABLE**') && 
            !sectionContent.startsWith('**IMAGE**') &&
            !sectionContent.includes('وزارة التعليم') &&
            !sectionContent.includes('معلومات الجهة الناشرة') &&
            !sectionContent.match(/^\d+$/) && // Skip page numbers
            !sectionContent.match(/^\d{4}\s*-\s*\d{4}$/) && // Skip years like "2023 - 1447"
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

// Tolerant answered question detection with multiple patterns
function detectAnsweredQuestions(summaryText: string): Set<string> {
  const answeredQuestionNumbers = new Set<string>();
  
  // Multiple patterns to catch various question answer formats
  const questionPatterns = [
    /\*\*س:\s*(\d+)[.-]/g,           // **س: 45- or **س: 45.
    /\*\*س:\s*([٠-٩]+)[.-]/g,        // **س: ٤٥- (Arabic numerals) 
    /سؤال\s*(\d+)/g,                // سؤال 4
    /سؤال\s*([٠-٩]+)/g,             // سؤال ٤ (Arabic numerals)
    /س:\s*(\d+)/g,                  // س: 4
    /س:\s*([٠-٩]+)/g,               // س: ٤ (Arabic numerals)
    /Question\s*(\d+)/g,            // Question 4
    /\*\*Question\s*(\d+)/g,        // **Question 4
    /^(\d+)[.-]\s/gm,               // 4. or 4- at start of line
    /^([٠-٩]+)[.-]\s/gm             // ٤. or ٤- at start of line (Arabic numerals)
  ];
  
  for (const pattern of questionPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(summaryText)) !== null) {
      const num = convertArabicToEnglishNumber(match[1]);
      answeredQuestionNumbers.add(num);
    }
  }
  
  return answeredQuestionNumbers;
}

// De-duplicate answers by keeping only one answer per question number
function deduplicateAnswers(summaryText: string, questionNumbers: string[]): string {
  if (questionNumbers.length === 0) return summaryText;
  
  // Split into sections based on question markers
  const sections = summaryText.split(/(?=\*\*س:\s*[٠-٩\d]+[.-])/);
  const firstSection = sections[0]; // Keep the intro/concept summary
  const questionSections = sections.slice(1);
  
  // Group by question number, keeping the best formatted one
  const questionMap = new Map<string, string>();
  
  questionSections.forEach(section => {
    const numberMatch = section.match(/\*\*س:\s*([٠-٩\d]+)[.-]/);
    if (numberMatch) {
      const questionNum = convertArabicToEnglishNumber(numberMatch[1]);
      
      // Prefer the section with standard **س:** format
      if (!questionMap.has(questionNum) || section.includes('**ج:**')) {
        questionMap.set(questionNum, section);
      }
    }
  });
  
  // Reconstruct with deduplicated questions in order
  let result = firstSection;
  
  // Sort question numbers numerically and append
  const sortedNums = Array.from(questionMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
  sortedNums.forEach(num => {
    result += questionMap.get(num);
  });
  
  return result.trim();
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
    
    const { text, lang = "ar", page, title, book_id = null, ocrData = null, ragContext = null } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title}, book_id: ${book_id}, ragContext: ${ragContext ? `${ragContext.length} pages` : 'none'} }`);
    
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
      console.log('Detected table of contents page, letting AI summarize naturally');
      // Let AI handle table of contents naturally instead of hardcoded response
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

    // Build RAG context section with server-side fallback
    let ragContextSection = '';
    let ragPagesActuallySent = 0;
    let ragPagesSentList: number[] = [];
    let ragContextChars = 0;

    // Prefer provided context; if missing, fetch on the server using book_id
    let effectiveRag = Array.isArray(ragContext) ? ragContext : [];
    if ((!effectiveRag || effectiveRag.length === 0) && book_id && page && text) {
      console.log('⚙️ RAG: No client context provided; fetching on server...');
      effectiveRag = await fetchRagContextServer(String(book_id), Number(page), String(text), 3, 0.3);
      console.log(`RAG server fetch returned ${effectiveRag.length} pages`);
    }

    if (effectiveRag && effectiveRag.length > 0) {
      console.log(`Building RAG context from ${effectiveRag.length} previous pages`);
      ragContextSection = "\n\nContext from previous pages in the book:\n---\n";
      
      let totalLength = ragContextSection.length;
      const maxContextLength = 8000; // Increased from 2000 to fit more pages
      
      for (const context of effectiveRag) {
        const pageContext = `Page ${context.pageNumber}${context.title ? ` (${context.title})` : ''}:\n${context.content || context.ocr_text || ''}\n\n`;
        
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
      
      ragContextSection += "---\n\n";
      ragContextChars = totalLength;
      console.log(`✅ RAG VALIDATION: ${ragPagesActuallySent} pages actually sent to Gemini 2.5 Pro (${totalLength} characters)`);
    } else {
      console.log('⚠️ RAG CONTEXT: No context provided or found');
    }
    // Enhanced text with visual context and RAG context
    const enhancedText = ragContextSection + text + visualElementsText;

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);
    
    // Skip general concept summary if there are numbered questions (exercise pages)
    const skipConceptSummary = questions.length > 0;
    
    const systemPrompt = `Create clear, comprehensive educational summaries. Do not include any introductions, pleasantries, or self-references.

**Your main tasks:**
${skipConceptSummary ? 
`1. Answer ALL numbered questions with complete accuracy and detail - DO NOT include a general concept summary
2. Use visual data (graphs, tables, diagrams) when available and relevant  
3. Provide step-by-step solutions for calculation problems
4. Connect concepts logically for better understanding` :
`1. Summarize the key concepts from the provided text clearly
2. Answer ALL numbered questions with complete accuracy and detail
3. Use visual data (graphs, tables, diagrams) when available and relevant
4. Provide step-by-step solutions for calculation problems
5. Connect concepts logically for better understanding`}

**Important guidelines:**
- Write naturally and organize information in the most logical way
- Use visual elements data when questions reference them (الشكل، الجدول، المخطط)
- For math equations, use LaTeX format: $$equation$$ 
- For calculations, show clear step-by-step work
- Base all answers on precise calculations and data provided

${hasMultipleChoice ? `**For multiple choice questions:** Present choices clearly, explain reasoning, and identify the correct answer.` : ''}
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

`;

    const userPrompt = `
${lang === "ar" || lang === "arabic" ? 
  `الكتاب: ${title || "الكتاب"} • الصفحة: ${page ?? "؟"}

المحتوى التعليمي:
---
${enhancedText}
---

لخص هذا المحتوى بطريقة تساعد الطلاب على الفهم. أجب على جميع الأسئلة المرقمة بدقة وتفصيل.
${needsDetailedStructure ? `الأسئلة المرقمة الموجودة: ${questions.map(q => q.number).join('، ')}` : ''}`
  :
  `Book: ${title || "Book"} • Page: ${page ?? "?"}

Educational content:
---
${enhancedText}
---

Summarize this content in a way that helps students understand. Answer all numbered questions with accuracy and detail.
${needsDetailedStructure ? `Numbered questions found: ${questions.map(q => q.number).join(', ')}` : ''}`
}
    `;





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
    const originalQuestionCount = questions.length;
    
    // Use tolerant detection to find answered questions
    const answeredQuestionNumbers = detectAnsweredQuestions(summary);
    const summaryQuestionCount = answeredQuestionNumbers.size;
    
    console.log(`Final summary length: ${summary.length}, Questions processed: ${summaryQuestionCount}/${originalQuestionCount}, Provider: ${providerUsed}`);
    console.log(`📊 TOLERANT DETECTION - Expected questions: ${questions.map(q => q.number).join(', ')}`);
    console.log(`📊 TOLERANT DETECTION - Detected answers: ${Array.from(answeredQuestionNumbers).join(', ')}`);
    
    // Robust continuation logic - ensure ALL questions are answered regardless of summary length
    if (originalQuestionCount > 0 && summaryQuestionCount < originalQuestionCount) {
      console.log(`⚠️ Missing ${originalQuestionCount - summaryQuestionCount} questions, attempting auto-continuation...`);
      
      let missingNumbers = questions
        .map(q => convertArabicToEnglishNumber(q.number))
        .filter(num => !answeredQuestionNumbers.has(num));
      
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
                
                // Check how many questions were completed in this attempt using tolerant detection
                const newAnsweredQuestions = detectAnsweredQuestions(currentSummary);
                const newlyAnswered = [];
                for (const num of missingNumbers) {
                  if (newAnsweredQuestions.has(num)) {
                    newlyAnswered.push(num);
                  }
                }
                
                console.log(`✅ Attempt ${attempt} completed ${newlyAnswered.length} questions: ${newlyAnswered.join(', ')}`);
                
                // Update missing numbers
                missingNumbers = missingNumbers.filter(num => !newAnsweredQuestions.has(num));
                
                if (missingNumbers.length === 0) {
                  console.log(`🎉 All questions completed successfully!`);
                  break;
                }
              } else {
                console.log(`Attempt ${attempt} returned empty completion, stopping auto-continuation`);
                break;
              }
            } else {
              console.error(`Auto-continuation attempt ${attempt} failed:`, await completionResp.text());
              break;
            }
          } catch (contError) {
            console.error(`Auto-continuation attempt ${attempt} error:`, contError);
            break;
          }
        }
        
        // Apply de-duplication after all continuation attempts
        const questionNums = questions.map(q => convertArabicToEnglishNumber(q.number));
        currentSummary = deduplicateAnswers(currentSummary, questionNums);
        
        summary = currentSummary;
        console.log(`Still missing: ${missingNumbers.join(', ')}`);
        console.log(`✅ Auto-continuation finished after ${attempt} attempts. Final question count: ${detectAnsweredQuestions(summary).size}/${originalQuestionCount}`);
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