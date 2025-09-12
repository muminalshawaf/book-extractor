import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced question detection with improved accuracy
function parseQuestionsFromCurrentPage(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
  // Enhanced question patterns for better detection
  const questionPatterns = [
    /س:\s*(\d+)\s*[-–]\s*([^؟]*؟)/g,           // Arabic س: 1- question?
    /السؤال\s*(\d+)\s*:?\s*([^؟]*؟)/g,         // السؤال 1: question?
    /(\d+)\.\s*([^٠-٩\d][^.]*?؟)/g,            // 1. question?
    /([٠-٩]+)\.\s*([^٠-٩\d][^.]*?؟)/g,         // Arabic numbers
    /(\d+)\s*[-–]\s*([^٠-٩\d][^.]*?؟)/g,       // 1- question?
    /السؤال\s*([٠-٩]+)\s*:?\s*([^؟]*؟)/g       // السؤال with Arabic numbers
  ];
  
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
                
                if (questionText.length > 10 && questionText.includes('؟')) {
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
        
        // Check if this section contains a question (must have question mark)
        if (sectionContent.length > 20 && 
            sectionContent.includes('؟') &&
            !sectionContent.startsWith('**TABLE**') && 
            !sectionContent.startsWith('**IMAGE**') &&
            !sectionContent.includes('وزارة التعليم') &&
            !sectionContent.match(/^\d+$/) &&
            !sectionContent.includes('Ministry of Education')) {
          
          // Extract the main question text
          let questionText = sectionContent;
          
          // Clean up the question text
          questionText = questionText.replace(/^Question Text:\s*/, '');
          
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
  } else {
    // Use pattern-based parsing for non-structured content
    for (const pattern of questionPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const questionNumber = match[1].trim();
        const questionText = match[2].trim();
        
        if (questionText.length > 10 && questionText.includes('؟')) {
          questions.push({
            number: questionNumber,
            text: questionText,
            fullMatch: match[0],
            isMultipleChoice: isMultipleChoiceSection
          });
        }
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
  
  console.log(`Parsed ${unique.length} questions from current page:`, 
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

    // Parse questions from OCR text using improved detection
    const questions = parseQuestionsFromCurrentPage(text);
    console.log(`Found ${questions.length} questions in current page OCR text`);
    
    // Determine processing mode based on questions found
    const processingMode = questions.length > 0 ? 'question-answer' : 'content-summary';
    console.log(`Processing mode: ${processingMode}`);
    
    // Enhanced page type detection for logging
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

    // Build RAG context section with improved cleaning
    let ragContextSection = '';
    let ragPagesActuallySent = 0;
    let ragPagesSentList: number[] = [];
    let ragContextChars = 0;
    if (ragContext && Array.isArray(ragContext) && ragContext.length > 0) {
      console.log(`Building RAG context from ${ragContext.length} previous pages`);
      ragContextSection = "\n\n=== مرجع من الصفحات السابقة (للفهم فقط - لا تستخرج أسئلة من هذا القسم) ===\n";
      
      let totalLength = ragContextSection.length;
      const maxContextLength = 6000;
      
      for (const context of ragContext) {
        // Thoroughly clean content by removing all question patterns
        let cleanContent = context.content || context.ocr_text || '';
        
        // Remove various question patterns more comprehensively
        cleanContent = cleanContent
          .replace(/س:\s*\d+\s*[-–]\s*[^؟]*؟?/g, '[سؤال محذوف من المرجع]')
          .replace(/السؤال\s*\d+\s*:?[^؟]*؟?/g, '[سؤال محذوف من المرجع]')
          .replace(/\d+\.\s*[^.]*؟/g, '[سؤال محذوف من المرجع]')
          .replace(/[٠-٩]+\.\s*[^.]*؟/g, '[سؤال محذوف من المرجع]')
          .replace(/\d+\s*[-–]\s*[^.]*؟/g, '[سؤال محذوف من المرجع]')
          .replace(/أسئلة الاختيار من متعدد.*?(?=\n\n|\n---|$)/gs, '[قسم أسئلة محذوف من المرجع]');
        
        const pageContext = `الصفحة ${context.pageNumber}${context.title ? ` (${context.title})` : ''}:\n${cleanContent}\n---\n\n`;
        
        if (totalLength + pageContext.length > maxContextLength) {
          const remainingLength = maxContextLength - totalLength - 50;
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
      
      ragContextSection += "=== انتهاء المرجع ===\n\n=== محتوى الصفحة الحالية يبدأ هنا ===\n";
      ragContextChars = totalLength;
      console.log(`✅ RAG VALIDATION: ${ragPagesActuallySent} pages actually sent to AI (${totalLength} characters)`);
    }

    // Enhanced text with visual context and RAG context
    const enhancedText = ragContextSection + text + visualElementsText;

    // Create optimized prompts based on processing mode
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);
    
    let systemPrompt = '';
    let userPrompt = '';

    if (processingMode === 'question-answer') {
      // Mode A: Question-Answer Mode - Answer existing questions from current page
      const questionNumbers = questions.map(q => q.number).join(', ');
      
      systemPrompt = `أنت أستاذ متخصص في الكيمياء. مهمتك هي الإجابة على الأسئلة الموجودة في الصفحة الحالية فقط باستخدام المعرفة من السياق المرجعي.

⚠️ تعليمات حاسمة:
- أجب فقط على الأسئلة الموجودة في الصفحة الحالية (أرقام: ${questionNumbers})
- استخدم السياق المرجعي للفهم والتأسيس النظري فقط
- لا تستخرج أو تجيب على أسئلة من السياق المرجعي
- قدم إجابات مفصلة وشاملة لكل سؤال

تنسيق الإجابة:
# الأسئلة والإجابات الكاملة

لكل سؤال من الأسئلة المرقمة (${questionNumbers}):
**س: [رقم]- [نص السؤال الكامل]**
**ج:** [الإجابة المفصلة مع الخطوات والتبرير]

${hasMultipleChoice ? `
تنسيق الأسئلة متعددة الاختيارات:
- **س: [رقم]- [نص السؤال]**
- أ) [الخيار الأول] ب) [الخيار الثاني] ج) [الخيار الثالث] د) [الخيار الرابع]
- **ج:** [التبرير والحسابات] **الإجابة الصحيحة: [الحرف]**` : ''}

استخدم المعادلات الرياضية: $$معادلة$$
تأكد من الدقة العلمية والتسلسل المنطقي في الحلول.`;

      userPrompt = `قم بالإجابة على الأسئلة المرقمة التالية فقط: ${questionNumbers}

${enhancedText}

تذكير: أجب فقط على الأسئلة المرقمة ${questionNumbers} الموجودة في الصفحة الحالية.`;

    } else {
      // Mode B: Content Summary Mode - Summarize content and generate new questions
      systemPrompt = `أنت أستاذ متخصص في الكيمياء. مهمتك هو تلخيص المحتوى التعليمي وإنشاء أسئلة جديدة للاختبار.

⚠️ تعليمات حاسمة:
- لخص المحتوى الموجود في الصفحة الحالية فقط
- استخدم السياق المرجعي للفهم والربط فقط
- أنشئ أسئلة جديدة مبنية على محتوى الصفحة الحالية
- لا تنسخ أسئلة من السياق المرجعي

تنسيق الملخص الإلزامي:
# نظرة عامة
[ملخص شامل لمحتوى الصفحة]

# المصطلحات العلمية
[المصطلحات الموجودة في هذه الصفحة]

# المفاهيم والتعاريف
[المفاهيم والتعاريف من هذه الصفحة]

# شرح المفاهيم
[شرح مفصل للمفاهيم الموجودة في الصفحة]

# الأسئلة والإجابات
[أسئلة جديدة مبنية على محتوى هذه الصفحة لاختبار فهم الطالب]

استخدم المعادلات الرياضية: $$معادلة$$
تأكد من أن جميع الأسئلة المُنشأة مبنية على المحتوى الفعلي لهذه الصفحة.`;

      userPrompt = `قم بتلخيص المحتوى التعليمي التالي وإنشاء أسئلة جديدة مناسبة:

${enhancedText}

تذكير: أنشئ أسئلة جديدة مبنية على محتوى هذه الصفحة فقط، ولا تنسخ أسئلة من المراجع.`;
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