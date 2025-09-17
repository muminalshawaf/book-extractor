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
      current_page_number: currentPage,
      max_page_distance: 10
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

// Enhanced content classification with two-stage filtering
function parseQuestions(text: string, ocrData?: any): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // PRIORITY 1: Use structured OCR data if available
  if (ocrData?.rawStructuredData?.sections) {
    console.log(`Using structured OCR data: found ${ocrData.rawStructuredData.sections.length} sections`);
    return processEnhancedOcrSections(ocrData.rawStructuredData.sections);
  }
  
  // STAGE 2: Extract content from enhanced OCR classification in text
  const ocrSections = extractOcrSections(text);
  if (ocrSections.length > 0) {
    console.log(`Using enhanced OCR classification: found ${ocrSections.length} sections`);
    return processEnhancedOcrSections(ocrSections);
  }
  
  // STAGE 2: Fallback to intelligent content analysis
  console.log('Falling back to intelligent content analysis');
  return processLegacyContent(text);
}

// Extract sections from enhanced OCR output
function extractOcrSections(text: string): Array<any> {
  try {
    // Try to parse structured OCR output
    const ocrMatch = text.match(/"sections":\s*\[([\s\S]*?)\]/);
    if (!ocrMatch) return [];
    
    const sectionsText = ocrMatch[1];
    const sections = [];
    
    // Parse each section object
    const sectionMatches = sectionsText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (!sectionMatches) return [];
    
    for (const sectionMatch of sectionMatches) {
      try {
        const sectionObj = JSON.parse(sectionMatch);
        if (sectionObj.content_classification && sectionObj.question_indicators) {
          sections.push(sectionObj);
        }
      } catch (e) {
        // Skip malformed JSON
        continue;
      }
    }
    
    return sections;
  } catch (e) {
    console.error('Error extracting OCR sections:', e);
    return [];
  }
}

// Process enhanced OCR sections with intelligent filtering
function processEnhancedOcrSections(sections: Array<any>): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  for (const section of sections) {
    const classification = section.content_classification;
    const indicators = section.question_indicators || {};
    const content = section.content || '';
    const title = section.title || '';
    
    // ONLY process sections classified as QUESTION
    if (classification === 'QUESTION') {
      // Apply Arabic-specific validation
      if (isDefiniteQuestion(content, indicators)) {
        const questionNumber = extractQuestionNumber(title, content) || (questions.length + 1).toString();
        questions.push({
          number: questionNumber,
          text: content,
          fullMatch: JSON.stringify(section),
          isMultipleChoice: indicators.has_multiple_choice || false
        });
        console.log(`✅ Confirmed question ${questionNumber}: ${content.substring(0, 50)}...`);
      } else {
        console.log(`❌ Rejected false question: "${title}" - failed validation`);
      }
    } else {
      console.log(`📚 Educational content: "${title}" - classified as ${classification}`);
    }
  }
  
  return questions;
}

// Arabic-specific question validation
function isDefiniteQuestion(content: string, indicators: any): boolean {
  // Definite question patterns (Arabic)
  const questionWords = /\b(اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى|احسب|اذكر|عين|بين|استنتج|علل)\b/i;
  const questionNumbering = /^\d+[.-]\s*[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى|احسب]/i;
  
  // Definite NON-question patterns (Arabic)
  const definitionWords = /\b(تعريف|مفهوم|خصائص|أنواع|مثال|شرح|توضيح)\b/i;
  const figureReferences = /شكل\s*\d+[.-]\d+|جدول\s*\d+[.-]\d+|مخطط\s*\d+[.-]\d+/i;
  const instructionWords = /\b(اختر|أكمل|ضع دائرة|املأ)\b/i; // Instructions, not questions to answer
  
  // Must have question indicators
  const hasQuestionMarkers = questionWords.test(content) || 
                           questionNumbering.test(content) || 
                           indicators.has_question_words;
  
  // Must NOT be educational content
  const isEducationalContent = definitionWords.test(content) || 
                              figureReferences.test(content);
  
  // Must NOT be instructions (these are for students, not questions to answer)
  const isInstruction = instructionWords.test(content) || indicators.has_instruction_words;
  
  return hasQuestionMarkers && !isEducationalContent && !isInstruction;
}

// Extract question number from title or content
function extractQuestionNumber(title: string, content: string): string | null {
  // Try title first
  const titleMatch = title.match(/(\d+)/);
  if (titleMatch) return titleMatch[1];
  
  // Try content
  const contentMatch = content.match(/^(\d+)[.-]/);
  if (contentMatch) return contentMatch[1];
  
  return null;
}

// Legacy processing for non-enhanced OCR
function processLegacyContent(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
  // Check if this content contains actual questions vs educational content
  const hasQuestionWords = /\b(اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى|احسب|اذكر|عين|بين|استنتج|علل)\b/i.test(text);
  const hasExerciseMarkers = /\b(تمرين|سؤال|مسألة|exercise|question|problem)\b/i.test(text);
  
  // Educational content indicators (NOT questions)
  const hasDataStructureContent = /\b(هياكل البيانات|البيانات الأولية|المصفوفات|القوائم|data structures|arrays|lists)\b/i.test(text);
  const hasEducationalKeywords = /\b(تعريف|مفهوم|خصائص|أنواع|مثال|شرح|توضيح)\b/i.test(text);
  
  // If this is clearly educational content without question markers, don't parse as questions
  if (hasDataStructureContent && hasEducationalKeywords && !hasQuestionWords && !hasExerciseMarkers) {
    console.log('Detected educational content (not exercises) - skipping question parsing');
    return questions;
  }
  
  // Try to parse section-based content 
  const sectionMatches = text.match(/--- SECTION: ([^-]+) ---\s*([\s\S]*?)(?=--- SECTION: [^-]+ ---|$)/g);
  
  if (sectionMatches && sectionMatches.length > 0) {
    console.log(`Found ${sectionMatches.length} sections to analyze`);
    
    // Apply Arabic-specific patterns for validation
    sectionMatches.forEach((section) => {
      const sectionHeaderMatch = section.match(/--- SECTION: ([^-]+) ---/);
      if (!sectionHeaderMatch) return;
      
      const sectionId = sectionHeaderMatch[1].trim();
      const sectionContent = section.replace(/--- SECTION: [^-]+ ---\s*/, '').trim();
      
      // Apply two-stage validation
      if (isDefiniteQuestion(sectionContent, { has_question_words: hasQuestionWords })) {
        const questionNumber = extractQuestionNumber(sectionId, sectionContent) || (questions.length + 1).toString();
        questions.push({
          number: questionNumber,
          text: sectionContent,
          fullMatch: section,
          isMultipleChoice: isMultipleChoiceSection
        });
        console.log(`✅ Legacy: Confirmed question ${questionNumber}`);
      } else {
        console.log(`❌ Legacy: Rejected section "${sectionId}" - not a question`);
      }
    });
  }
  
  // Sort questions by their numeric value
  questions.sort((a, b) => {
    const aNum = convertArabicToEnglishNumber(a.number);
    const bNum = convertArabicToEnglishNumber(b.number);
    return parseInt(aNum) - parseInt(bNum);
  });
  
  console.log(`Legacy processing found ${questions.length} valid questions`);
  return questions;
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
  // Educational content keywords
  const educationalKeywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'حل', 'مسألة', 'نظرية', 'خاصية',
    'example', 'definition', 'law', 'equation', 'solution', 'problem', 'theorem', 'property',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps',
    'الحركة', 'تأثير', 'ظاهرة', 'جسيمات', 'مخلوط', 'محلول', 'ذائبة', 'براونية', 'تندال',
    'هياكل البيانات', 'البيانات الأولية', 'المصفوفات', 'القوائم'
  ];
  
  // Question/exercise keywords (actual questions, not educational content)
  const questionKeywords = [
    'اشرح', 'وضح', 'قارن', 'حدد', 'لماذا', 'كيف', 'ماذا', 'أين', 'متى', 
    'احسب', 'اذكر', 'عين', 'بين', 'استنتج', 'علل',
    'تمرين', 'سؤال', 'مسألة', 'exercise', 'question'
  ];
  
  const educationalKeywordCount = educationalKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  const questionKeywordCount = questionKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  // Check for various question patterns including Arabic questions
  const hasNumberedQuestions = /\d+\.\s/.test(text);
  const hasArabicQuestions = /\b(اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى|احسب|اذكر|عين|بين|استنتج|علل)\b/.test(text);
  const hasSectionHeaders = /---\s*SECTION:/.test(text);
  const hasSubstantialContent = text.length > 300;
  
  // Check if this is educational content about data structures (not exercises)
  const isDataStructureEducational = (
    text.includes('هياكل البيانات الأولية') ||
    text.includes('Data Structures') ||
    text.includes('المصفوفات') ||
    text.includes('Arrays')
  ) && educationalKeywordCount > 0 && questionKeywordCount === 0;
  
  if (isDataStructureEducational) {
    console.log('Detected data structures educational content (not exercises)');
    return true; // It's content, but educational content, not exercises
  }
  
  // More precise detection - distinguish between educational content and exercises
  const hasActualQuestions = hasArabicQuestions || hasNumberedQuestions || questionKeywordCount > 0;
  
  // Return true if it has educational content OR actual questions with substantial content
  return (educationalKeywordCount >= 2 || hasActualQuestions || hasSectionHeaders) && hasSubstantialContent;
}

// **COVERAGE VALIDATION FUNCTIONS**
function validateCoverageCompleteness(
  summary: string, 
  questions: any[], 
  educationalSections: any[], 
  codeExamples: any[], 
  visualElements: any[],
  language: string
): { isComplete: boolean; missingItems: string[] } {
  const missingItems: string[] = [];
  
  // Check educational content coverage
  const educationalKeywords = educationalSections
    .filter(section => section.content && section.content.trim().length > 10)
    .map(section => section.content.substring(0, 50).trim());
    
  for (const keyword of educationalKeywords) {
    if (!summary.includes(keyword.substring(0, 20))) {
      missingItems.push(`Educational content: ${keyword}`);
    }
  }
  
  // Check code example coverage
  const codeKeywords = codeExamples
    .filter(code => code.content && (code.content.includes('class ') || code.content.includes('def ') || code.content.includes('#')))
    .map(code => code.content.substring(0, 30).trim());
    
  for (const codeSnippet of codeKeywords) {
    if (!summary.includes(codeSnippet.substring(0, 15))) {
      missingItems.push(`Code example: ${codeSnippet}`);
    }
  }
  
  // Check visual element integration
  for (const visual of visualElements) {
    if (visual.title && !summary.includes(visual.title.substring(0, 20))) {
      missingItems.push(`Visual element: ${visual.title}`);
    }
  }
  
  return {
    isComplete: missingItems.length === 0,
    missingItems
  };
}

function buildContinuationPrompt(coverageCheck: any, language: string): string {
  const missingContent = coverageCheck.missingItems.join('\n- ');
  
  if (language === 'ar') {
    return `المحتوى التالي لم يتم تغطيته بشكل كامل في الملخص السابق. يجب إضافة شرح مفصل لكل عنصر:

المحتوى المفقود:
- ${missingContent}

يرجى إضافة شرح شامل ومفصل لكل عنصر مفقود مع تضمين جميع أمثلة الكود والشروحات البرمجية والعناصر البصرية ذات الصلة.`;
  }
  
  return `The following content was not fully covered in the previous summary. Please provide detailed explanations for each missing element:

Missing content:
- ${missingContent}

Please add comprehensive and detailed explanations for each missing item, including all code examples, programming explanations, and relevant visual elements.`;
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

  // Enhanced content classification with two-stage filtering
  console.log('📊 ENHANCED CLASSIFICATION: Starting two-stage question parsing...');
  
  // PRIORITY 1: Use structured OCR data if available
  const questions = parseQuestions(text, ocrData);
  console.log(`📊 ENHANCED CLASSIFICATION: Found ${questions.length} questions in OCR text`);

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

    // ====== STRATEGY 4: SMART RAG CONTEXT BUILDING WITH TOPIC COHERENCE ======
    
    // Helper function to extract key topics from text
    function extractTopics(text: string): Set<string> {
      const topics = new Set<string>();
      const cleanText = text.toLowerCase();
      
      // Educational topics in Arabic and English
      const topicPatterns = [
        // Data Structures
        /هياكل البيانات|data structures/g,
        /القائمة المترابطة|linked list/g,
        /المصفوفات|arrays/g,
        /الطابور|queue/g,
        /المكدس|stack/g,
        /الأشجار|trees/g,
        /العقدة|node/g,
        
        // Chemistry
        /الكيمياء|chemistry/g,
        /الأحماض|acids/g,
        /القواعد|bases/g,
        /التفاعلات|reactions/g,
        /المحاليل|solutions/g,
        
        // Physics
        /الفيزياء|physics/g,
        /الحركة|motion/g,
        /القوة|force/g,
        /الطاقة|energy/g,
        /الموجات|waves/g,
        
        // Math
        /الرياضيات|mathematics/g,
        /الجبر|algebra/g,
        /الهندسة|geometry/g,
        /التفاضل|calculus/g,
        
        // Programming
        /البرمجة|programming/g,
        /الخوارزميات|algorithms/g,
        /الكود|code/g,
        /البايثون|python/g,
      ];
      
      topicPatterns.forEach(pattern => {
        const matches = cleanText.match(pattern);
        if (matches) {
          matches.forEach(match => topics.add(match));
        }
      });
      
      return topics;
    }
    
    // Helper function to check if current page is continuation of previous content
    function isContinuation(currentText: string): boolean {
      const cleanText = currentText.trim();
      
      // Check for continuation indicators
      const continuationPatterns = [
        /تابع|continued?|continuing/i,
        /^\s*[0-9]+\./m, // Starts with numbered item (likely continuation of list)
        /^\s*[أ-ي]\)/m, // Starts with Arabic lettered option
        /^\s*[a-z]\)/m, // Starts with lettered option
        /^[^.!?]*[,،]/m, // Starts mid-sentence (contains comma but no sentence ending)
      ];
      
      return continuationPatterns.some(pattern => pattern.test(cleanText));
    }
    
    // Helper function to check for explicit references to previous content
    function hasExplicitReferences(currentText: string): boolean {
      const referencePatterns = [
        /كما ذكرنا|as mentioned|as discussed|previously|earlier|سابقاً|في السابق/i,
        /الشكل السابق|المثال السابق|previous figure|previous example/i,
        /في الصفحة السابقة|on the previous page/i,
        /كما رأينا|as we saw|as shown/i,
      ];
      
      return referencePatterns.some(pattern => pattern.test(currentText));
    }

    // Build RAG context section with SMART filtering and topic coherence
    let ragContextSection = '';
    let ragPagesActuallySent = 0;
    let ragPagesSentList: number[] = [];
    let ragContextChars = 0;
    let ragDecisionLog = '';

    // Prefer provided context; if missing, fetch on the server using book_id
    let effectiveRag = Array.isArray(ragContext) ? ragContext : [];
    if ((!effectiveRag || effectiveRag.length === 0) && book_id && page && text) {
      console.log('⚙️ RAG: No client context provided; fetching on server...');
      effectiveRag = await fetchRagContextServer(String(book_id), Number(page), String(text), 3, 0.3);
      console.log(`RAG server fetch returned ${effectiveRag.length} pages`);
    }

    if (effectiveRag && effectiveRag.length > 0) {
      console.log(`🧠 STRATEGY 4: Analyzing RAG context with topic coherence...`);
      
      // Extract topics from current page
      const currentTopics = extractTopics(text);
      const isCurrentContinuation = isContinuation(text);
      const hasExplicitRefs = hasExplicitReferences(text);
      
      console.log(`📊 Current page topics: ${Array.from(currentTopics).join(', ') || 'none detected'}`);
      console.log(`📊 Page is continuation: ${isCurrentContinuation}`);
      console.log(`📊 Has explicit references: ${hasExplicitRefs}`);
      
      // Filter RAG pages based on topic coherence and relevance
      const filteredRag = [];
      const ragDecisions = [];
      
      for (const context of effectiveRag) {
        const contextContent = context.content || context.ocr_text || '';
        const contextTopics = extractTopics(contextContent);
        
        // Calculate topic overlap
        const topicOverlap = [...currentTopics].filter(topic => contextTopics.has(topic));
        const hasTopicMatch = topicOverlap.length > 0;
        
        // Decision logic for including RAG context
        let shouldInclude = false;
        let reason = '';
        
        if (hasExplicitRefs) {
          shouldInclude = true;
          reason = 'Current page has explicit references to previous content';
        } else if (isCurrentContinuation && hasTopicMatch) {
          shouldInclude = true;
          reason = `Continuation page with topic match: ${topicOverlap.join(', ')}`;
        } else if (hasTopicMatch && topicOverlap.length >= 2) {
          shouldInclude = true;
          reason = `Strong topic match: ${topicOverlap.join(', ')}`;
        } else if (!currentTopics.size && !contextTopics.size) {
          shouldInclude = false;
          reason = 'No clear topics detected in either page - likely miscellaneous content';
        } else {
          shouldInclude = false;
          reason = `Topic mismatch - Current: [${Array.from(currentTopics).join(', ')}], RAG: [${Array.from(contextTopics).join(', ')}]`;
        }
        
        ragDecisions.push({
          page: context.pageNumber,
          included: shouldInclude,
          reason: reason,
          topicOverlap: topicOverlap
        });
        
        if (shouldInclude) {
          filteredRag.push(context);
        }
      }
      
      // Log RAG decisions
      ragDecisionLog = ragDecisions.map(d => 
        `Page ${d.page}: ${d.included ? '✅ INCLUDED' : '❌ EXCLUDED'} - ${d.reason}`
      ).join('\n');
      
      console.log(`🎯 RAG FILTERING DECISIONS:\n${ragDecisionLog}`);
      console.log(`📈 RAG pages filtered: ${effectiveRag.length} → ${filteredRag.length}`);
      
      // Build context section only from filtered pages
      if (filteredRag.length > 0) {
        console.log(`Building RAG context from ${filteredRag.length} relevant pages`);
        ragContextSection = "\n\nContext from previous pages in the book:\n---\n";
        
        let totalLength = ragContextSection.length;
        const maxContextLength = 8000;
        
        for (const context of filteredRag) {
          // Clean contextContent of visual elements to prevent cross-page confusion
          let contextContent = context.content || context.ocr_text || '';
          
          // Remove visual element descriptions from RAG context
          contextContent = contextContent.replace(/--- VISUAL CONTEXT ---[\s\S]*?(?=---|\n\n|$)/g, '');
          contextContent = contextContent.replace(/\*\*DIAGRAM\*\*:[\s\S]*?(?=\*\*|---|\n\n|$)/g, '');
          contextContent = contextContent.replace(/\*\*TABLE\*\*:[\s\S]*?(?=\*\*|---|\n\n|$)/g, '');
          contextContent = contextContent.replace(/\*\*FIGURE\*\*:[\s\S]*?(?=\*\*|---|\n\n|$)/g, '');
          
          const pageContext = `Page ${context.pageNumber}${context.title ? ` (${context.title})` : ''}:\n${contextContent}\n\n`;
          
          if (totalLength + pageContext.length > maxContextLength) {
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
        console.log(`✅ SMART RAG: ${ragPagesActuallySent} relevant pages sent to AI (${totalLength} characters)`);
      } else {
        console.log('🚫 SMART RAG: No relevant pages found - RAG context filtered out completely');
        ragContextSection = '';
      }
    } else {
      console.log('⚠️ RAG CONTEXT: No context provided or found');
    }
    // Enhanced text with visual context and RAG context
    // Use structured OCR data if available, otherwise fallback to raw text
    let mainContent = text;
    
    if (ocrData?.rawStructuredData?.sections) {
      console.log(`Using structured OCR data: found ${ocrData.rawStructuredData.sections.length} sections`);
      
      // Build text from classified sections with their tags
      const structuredSections = ocrData.rawStructuredData.sections.map((section: any, index: number) => {
        const classification = section.content_classification || 'UNKNOWN';
        const content = section.content || '';
        
        // Log each section for debugging
        console.log(`📚 Educational content: "${content.slice(0, 50)}" - classified as ${classification}`);
        
        // Format section with classification tag for AI processing
        return `--- SECTION ${index + 1} [${classification}] ---\n${content}`;
      }).join('\n\n');
      
      mainContent = structuredSections;
    } else {
      console.log('Using raw OCR text (structured data not available)');
    }
    
    // Visual elements are handled separately in the new structure

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);
    
    // Skip general concept summary if there are numbered questions (exercise pages)
    const skipConceptSummary = questions.length > 0;
    
    // Simple system prompt - removed complex rules
    const systemPrompt = "";

    const userPrompt = `
Context:
-=-=-=-=-=-
${ragContextSection}

Current page:
-=-=-=-=-=-=-
${mainContent}

Mandate:
- Summarize the current page to help students understand the concepts on this page
- Do not summarize the Context only use it when needed to help you answer a question or craft a better summary
- All questions need to be answered step by step and tag them with the righ question number form the current page
- visuals are referenced correctly and used to produce accurate answers
- No unstated assumptions, scientific accuracy requirements

Other Rules:
Must use LaTeX format for equations: $$equation$$
The reader will read Arabic. Avoid explaining in English 
Must validate answers against multiple choice options
Must show complete calculations with exact values from tables/graphs
Forbidden to skip content due to space constraints
${needsDetailedStructure ? `

Questions found: ${questions.map(q => q.number).join(', ')}` : ''}
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

Original content:
Context: ${ragContextSection}
Current page: ${mainContent}`;

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

Original content:
Context: ${ragContextSection}
Current page: ${mainContent}`;

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
${mainContent.split('\n').filter(line => 
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

    // **POST-CHECK COVERAGE VALIDATION**
    // Normalize structured OCR sections and variables used in coverage checks
    const parsedSections = (ocrData?.rawStructuredData?.sections as any[]) || extractOcrSections(text) || [];
    const parsedQuestions = questions;
    const language = lang;
    const visualElements = (ocrData?.rawStructuredData?.visual_elements as any[]) || [];

    const educationalSections = parsedSections.filter(s => s.content_classification === 'EDUCATIONAL_CONTENT');
    const codeExamples = parsedSections.filter(s => s.content && (s.content.includes('class ') || s.content.includes('def ') || s.content.includes('#')));
    
    const coverageCheck = validateCoverageCompleteness(
      summary, 
      parsedQuestions, 
      educationalSections, 
      codeExamples, 
      visualElements,
      language
    );
    
    let finalSummary = summary;
    
    if (!coverageCheck.isComplete) {
      console.log(`⚠️ COVERAGE GAP DETECTED: ${coverageCheck.missingItems.join(', ')}`);
      console.log(`🔄 AUTO-CONTINUING to address missing content...`);
      
      // Generate continuation prompt for missing content
      const continuationPrompt = buildContinuationPrompt(coverageCheck, language);
      
      try {
        let continuationResponseText = '';
        if (googleApiKey) {
          const contResp2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + "\n\n" + continuationPrompt }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 2000 }
            }),
          });
          if (contResp2.ok) {
            const contJson2 = await contResp2.json();
            continuationResponseText = contJson2.candidates?.[0]?.content?.parts?.[0]?.text || '';
          } else {
            console.error('Gemini continuation error:', await contResp2.text());
          }
        }
        if (!continuationResponseText && deepSeekApiKey) {
          const dsResp2 = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${deepSeekApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: continuationPrompt },
              ],
              temperature: 0,
              max_tokens: 2000,
            }),
          });
          if (dsResp2.ok) {
            const dsJson2 = await dsResp2.json();
            continuationResponseText = dsJson2.choices?.[0]?.message?.content || '';
          } else {
            console.error('DeepSeek continuation error:', await dsResp2.text());
          }
        }
        if (continuationResponseText && continuationResponseText.trim()) {
          console.log(`✅ CONTINUATION SUCCESS: Added ${continuationResponseText.length} characters`);
          finalSummary = summary + "\n\n" + continuationResponseText.trim();
        }
      } catch (continuationError) {
        console.error('Coverage continuation failed, proceeding with original summary:', continuationError);
      }
    } else {
      console.log('✅ COVERAGE VALIDATION PASSED: All content appears to be covered');
    }

    // **PROCEDURAL STEPS COVERAGE CHECK**
    console.log('🔍 PROCEDURAL STEPS: Starting coverage check...');
    
    // Unified extractor for procedural step numbers from text/summary
    // Detects both explicit Arabic markers ("الخطوة 1") and numbered lists at line starts ("1.", "٢)", "3-", etc.)
    function extractStepNumbers(source: string): string[] {
      const found = new Set<string>();
      // Pattern 1: explicit Arabic step marker
      const arabicStepPattern = /الخطوة\s*(\d+|[٠-٩]+)[:\-\s]/g;
      let match1: RegExpExecArray | null;
      while ((match1 = arabicStepPattern.exec(source)) !== null) {
        const num = convertArabicToEnglishNumber(match1[1]);
        found.add(num);
      }
      // Pattern 2: enumerated list at start of line (Arabic or Western digits)
      // Accept separators: . - : ) Arabic comma "،" and Arabic semicolon \u061B
      const enumeratedPattern = /^(?:\s*)(\d+|[٠-٩]+)[\.\-:\)\u061B،]\s+/gm;
      let match2: RegExpExecArray | null;
      while ((match2 = enumeratedPattern.exec(source)) !== null) {
        const num = convertArabicToEnglishNumber(match2[1]);
        found.add(num);
      }
      return Array.from(found).sort((a, b) => parseInt(a) - parseInt(b));
    }
    
    // Helper function to extract Arabic step markers from original OCR text
    function extractProcedureStepsFromText(text: string): string[] {
      return extractStepNumbers(text);
    }
    
    // Helper function to extract procedure steps from generated summary
    function extractProcedureStepsFromSummary(summary: string): string[] {
      return extractStepNumbers(summary);
    }
    
    // Extract expected and found steps
    const expectedSteps = extractProcedureStepsFromText(text);
    const stepsFound = extractProcedureStepsFromSummary(finalSummary);
    
    console.log(`📊 PROCEDURAL STEPS: Expected: [${expectedSteps.join(', ')}], Found: [${stepsFound.join(', ')}]`);
    
    let proceduralStepsMetadata = {
      expected_steps: expectedSteps,
      steps_found: stepsFound,
      is_complete: true,
      continuation_attempts: 0
    };
    
    // Check for incomplete procedural sequences
    if (expectedSteps.length > 0) {
      const missingSteps = expectedSteps.filter(step => !stepsFound.includes(step));
      
      if (missingSteps.length > 0) {
        console.log(`⚠️ PROCEDURAL STEPS: Missing steps [${missingSteps.join(', ')}], attempting continuation...`);
        proceduralStepsMetadata.is_complete = false;
        
        // Generate targeted continuation prompt for missing steps
        const stepsPrompt = lang === 'ar' ? 
          `المحتوى السابق يحتوي على خطوات إجرائية غير مكتملة. يرجى إكمال الخطوات المفقودة:

الخطوات المتوقعة: ${expectedSteps.join('، ')}
الخطوات الموجودة: ${stepsFound.join('، ')}
الخطوات المفقودة: ${missingSteps.join('، ')}

يرجى إكمال جميع الخطوات المفقودة بنفس التنسيق والأسلوب المستخدم في الخطوات الموجودة. تأكد من تضمين جميع التفاصيل والشروحات اللازمة لكل خطوة.

النص الأصلي:
${text}` :
          `The previous content contains incomplete procedural steps. Please complete the missing steps:

Expected steps: ${expectedSteps.join(', ')}
Found steps: ${stepsFound.join(', ')}
Missing steps: ${missingSteps.join(', ')}

Please complete all missing steps using the same format and style as the existing steps. Ensure all necessary details and explanations are included for each step.

Original text:
${text}`;

        // Attempt continuation for missing procedural steps (up to 2 attempts)
        const maxStepAttempts = 2;
        let currentStepSummary = finalSummary;
        
        for (let attempt = 1; attempt <= maxStepAttempts; attempt++) {
          proceduralStepsMetadata.continuation_attempts = attempt;
          console.log(`🔄 PROCEDURAL STEPS: Continuation attempt ${attempt}/${maxStepAttempts}...`);
          
          try {
            let stepContinuationText = '';
            
            // Try Gemini first
            if (googleApiKey) {
              const stepResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: systemPrompt + "\n\n" + stepsPrompt }] }],
                  generationConfig: { temperature: 0, maxOutputTokens: 4000 }
                }),
              });
              
              if (stepResp.ok) {
                const stepData = await stepResp.json();
                stepContinuationText = stepData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              } else {
                console.error('Gemini steps continuation error:', await stepResp.text());
              }
            }
            
            // Fallback to DeepSeek
            if (!stepContinuationText && deepSeekApiKey) {
              const stepResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${deepSeekApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "deepseek-chat",
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: stepsPrompt },
                  ],
                  temperature: 0,
                  max_tokens: 4000,
                }),
              });
              
              if (stepResp.ok) {
                const stepData = await stepResp.json();
                stepContinuationText = stepData.choices?.[0]?.message?.content || '';
              } else {
                console.error('DeepSeek steps continuation error:', await stepResp.text());
              }
            }
            
            if (stepContinuationText && stepContinuationText.trim()) {
              currentStepSummary += "\n\n" + stepContinuationText.trim();
              
              // Check if missing steps were completed
              const newStepsFound = extractProcedureStepsFromSummary(currentStepSummary);
              const stillMissing = expectedSteps.filter(step => !newStepsFound.includes(step));
              
              console.log(`✅ PROCEDURAL STEPS: Attempt ${attempt} - Now found [${newStepsFound.join(', ')}], still missing [${stillMissing.join(', ')}]`);
              
              proceduralStepsMetadata.steps_found = newStepsFound;
              
              if (stillMissing.length === 0) {
                console.log('🎉 PROCEDURAL STEPS: All steps completed successfully!');
                proceduralStepsMetadata.is_complete = true;
                finalSummary = currentStepSummary;
                break;
              } else if (stillMissing.length < missingSteps.length) {
                // Some progress made, continue with remaining steps
                finalSummary = currentStepSummary;
              }
            } else {
              console.log(`PROCEDURAL STEPS: Attempt ${attempt} returned empty continuation`);
              break;
            }
          } catch (stepError) {
            console.error(`PROCEDURAL STEPS: Attempt ${attempt} error:`, stepError);
            break;
          }
        }
        
        const finalMissing = expectedSteps.filter(step => !proceduralStepsMetadata.steps_found.includes(step));
        if (finalMissing.length === 0) {
          console.log('✅ PROCEDURAL STEPS: Final check - all steps completed');
        } else {
          console.log(`⚠️ PROCEDURAL STEPS: Final check - still missing [${finalMissing.join(', ')}]`);
        }
      } else {
        console.log('✅ PROCEDURAL STEPS: All expected steps found in summary');
      }
    } else {
      console.log('ℹ️ PROCEDURAL STEPS: No procedural steps detected in content');
    }

    return new Response(JSON.stringify({ 
      summary: finalSummary,
      rag_pages_sent: ragPagesActuallySent,
      rag_pages_found: ragContext?.length || 0,
      rag_pages_sent_list: ragPagesSentList,
      rag_context_chars: ragContextChars,
      rag_filtering_decisions: ragDecisionLog,
      procedural_steps_metadata: proceduralStepsMetadata,
      provider_used: providerUsed
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