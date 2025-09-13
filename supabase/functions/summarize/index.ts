import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  MANDATORY_SECTIONS, 
  TEMPLATE_FORMATS, 
  detectPageType, 
  parseQuestions, 
  convertArabicToEnglishNumber, 
  validateSummaryCompliance, 
  buildSystemPrompt, 
  createEmergencyPrompt,
  detectHasFormulasInOCR,
  detectHasExamplesInOCR
} from "../_shared/templates.ts";
import { 
  callGeminiAPI, 
  callDeepSeekAPI, 
  handleAutoContinuation, 
  handleEmergencyRegeneration 
} from "../_shared/apiClients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.log('🚨 EXTREME STRICT COMPLIANCE SUMMARIZE FUNCTION STARTED 🚨');
    
    const { text, lang = "ar", page, title, ocrData = null, ragContext = null, strictMode = false } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title}, ragContext: ${ragContext ? `${ragContext.length} pages` : 'none'}, strictMode: ${strictMode} }`);
    
    // API Key validation
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

    if (!GOOGLE_API_KEY && !DEEPSEEK_API_KEY) {
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

    // Parse questions and detect page type using shared utilities
    const questions = parseQuestions(text);
    console.log(`Found ${questions.length} questions in OCR text`);
    
    const pageType = detectPageType(text, questions);
    const needsDetailedStructure = isContentPage(text);
    const hasFormulasOCR = detectHasFormulasInOCR(text);
    const hasExamplesOCR = detectHasExamplesInOCR(text);
    console.log(`📊 Page Analysis: Type=${pageType}, Questions=${questions.length}, DetailedStructure=${needsDetailedStructure}`);
    console.log('🔎 OCR Anti-hallucination flags:', { hasFormulasOCR, hasExamplesOCR });

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
      console.log(`✅ RAG VALIDATION: ${ragPagesActuallySent} pages actually sent to AI (${totalLength} characters)`);
    }

    // Enhanced text with visual context and RAG context
    const enhancedText = ragContextSection + text + visualElementsText;

    // Determine subject from title to set correct persona
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

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);

    // Build system prompt using shared utility with strict mode if enabled
    const systemPrompt = buildSystemPrompt(subject, hasMultipleChoice, strictMode);

    // Create specialized prompts based on page type
    let userPrompt = '';
    
    if (pageType === 'questions-focused') {
      // Specialized prompt for question-focused pages with full RAG support
      userPrompt = `# حل الأسئلة المختصة
## تحليل الأسئلة باستخدام السياق الكامل

**FOCUSED QUESTION-SOLVING MODE ACTIVATED**
This page contains primarily questions (${questions.length} detected: ${questions.map(q => q.number).join(', ')}). Use the RAG context from previous pages to provide direct, precise answers.

**CRITICAL INSTRUCTION: ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.**

**STRICT OUTPUT FORMAT**: Do NOT include any overview ("نظرة عامة") or content sections. Output ONLY the following section and nothing else.

**RAG CONTEXT INTEGRATION MANDATE:**
- You MUST use information from the provided RAG context to answer questions
- Reference specific concepts, formulas, or data from previous pages when relevant
- Connect answers to previously established knowledge from the book
- If RAG context provides relevant background, explicitly mention it: "Based on the concept from page X..."

${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}
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

ANTI-HALLUCINATION RULES:
- لا تضف قسم ${MANDATORY_SECTIONS.FORMULAS_EQUATIONS} إذا لم تُكتشف صيغ/معادلات في OCR.
- لا تضف قسم ${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES} إذا لم تُكتشف أمثلة/تطبيقات في OCR.
- Flags: formulas_in_ocr=${hasFormulasOCR ? 'YES' : 'NO'}, examples_in_ocr=${hasExamplesOCR ? 'YES' : 'NO'}

## ملخص المحتوى التعليمي  
[Summarize in few sentences what's on this page, connecting to previous concepts when RAG context is available]

${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
Analyze content and extract key concepts. When RAG context exists, show how new concepts build on previous ones:
- **[Arabic term]:** [definition] ${ragContext && ragContext.length > 0 ? '[Connect to previous concepts when relevant]' : ''}

${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}
Extract scientific terminology, linking to previously introduced terms when applicable:
- **[Scientific term]:** [explanation]

${hasFormulasOCR ? `${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}  
List formulas and equations, showing relationship to previously covered material:
| الصيغة | الوصف | المتغيرات | الربط بالسياق السابق |
|--------|--------|-----------|---------------------|
| $$formula$$ | description | variables | [connection if relevant] |` : ''}

${hasExamplesOCR ? `${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES}
List examples showing practical applications and connections to previous topics` : ''}

${questions.length > 0 ? `${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}
ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.

Process ONLY the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} found on this page using both current content and RAG context:` : ''}
OCR TEXT:
${enhancedText}`;


    } else if (pageType === 'mixed') {
      // Mixed content — enforce mandated sections only (no extra headers)
      userPrompt = `# ملخص المحتوى والأسئلة

ANTI-HALLUCINATION RULES:
- لا تضف قسم ${MANDATORY_SECTIONS.FORMULAS_EQUATIONS} إذا لم تُكتشف صيغ/معادلات في OCR.
- لا تضف قسم ${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES} إذا لم تُكتشف أمثلة/تطبيقات في OCR.
- Flags: formulas_in_ocr=${hasFormulasOCR ? 'YES' : 'NO'}, examples_in_ocr=${hasExamplesOCR ? 'YES' : 'NO'}

**STRICT OUTPUT FORMAT**
Use ONLY the following sections in this exact order. Do NOT add any other sections (no "نظرة عامة" or meta text).

${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
- [استخرج المفاهيم والتعاريف الأساسية واربطها بسياق RAG عند اللزوم]

${MANDATORY_SECTIONS.CONCEPT_EXPLANATIONS}
- [شرح تفصيلي للمفاهيم الأساسية مع الأمثلة والتطبيقات]

${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}
- [سرد المصطلحات مع شرح موجز]

${hasExamplesOCR ? `${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES}
- [أمثلة وتطبيقات موجزة فقط إذا كانت موجودة في OCR]` : ''}

${hasFormulasOCR ? `${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}
| الصيغة | الوصف | المتغيرات | الربط بالسياق السابق |
|--------|--------|-----------|---------------------|
| $$formula$$ | description | variables | [connection if relevant] |` : ''}

${questions.length > 0 ? `${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}
ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from RAG context.

Answer the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} using integrated knowledge from RAG context and current content:` : ''}
OCR TEXT:
${enhancedText}`;


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
    if (GOOGLE_API_KEY) {
      console.log('🧠 Attempting to use Gemini 2.5 Pro for summarization...');
      const geminiResponse = await callGeminiAPI(GOOGLE_API_KEY, systemPrompt + "\n\n" + userPrompt, 16000);
      
      if (geminiResponse.success) {
        summary = geminiResponse.content;
        providerUsed = "gemini-2.5-pro";
        console.log(`✅ Gemini 2.5 Pro succeeded - Length: ${summary.length}, Finish reason: ${geminiResponse.finishReason}`);
        
        // Handle continuation if needed
        if (geminiResponse.finishReason === "MAX_TOKENS" && summary.length > 0 && questions.length > 0) {
          console.log('🔄 Gemini response truncated, attempting auto-continuation...');
          const continuationResult = await handleAutoContinuation(
            summary, questions, enhancedText, systemPrompt, 'gemini', GOOGLE_API_KEY, convertArabicToEnglishNumber
          );
          summary = continuationResult.finalContent;
          console.log(`✅ Auto-continuation completed after ${continuationResult.attempts} attempts`);
        }
      } else {
        console.error('Gemini 2.5 Pro failed:', geminiResponse.error);
      }
    }

    // Fallback to DeepSeek Chat if Gemini failed or not available
    if (!summary.trim() && DEEPSEEK_API_KEY) {
      console.log('🤖 Using DeepSeek Chat as fallback...');
      const deepSeekResponse = await callDeepSeekAPI(DEEPSEEK_API_KEY, systemPrompt, userPrompt, 12000);
      
      if (deepSeekResponse.success) {
        summary = deepSeekResponse.content;
        providerUsed = "deepseek-chat";
        console.log(`✅ DeepSeek Chat succeeded - Length: ${summary.length}, Finish reason: ${deepSeekResponse.finishReason}`);
        
        // Handle continuation if needed
        if (deepSeekResponse.finishReason === "length" && summary.length > 0 && questions.length > 0) {
          console.log('🔄 DeepSeek response truncated, attempting auto-continuation...');
          const continuationResult = await handleAutoContinuation(
            summary, questions, enhancedText, systemPrompt, 'deepseek', DEEPSEEK_API_KEY, convertArabicToEnglishNumber
          );
          summary = continuationResult.finalContent;
          console.log(`✅ Auto-continuation completed after ${continuationResult.attempts} attempts`);
        }
      } else {
        console.error('DeepSeek Chat failed:', deepSeekResponse.error);
      }
    }

    if (!summary.trim()) {
      console.error('🚨 No valid summary generated from any API');
      return new Response(JSON.stringify({ error: "Failed to generate summary from any API" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ANTI-HALLUCINATION AUTO-SANITIZATION
    console.log('🛡️ Auto-sanitization step: checking for ungrounded content...');
    const { sanitizeSummary } = await import('../_shared/sanitizer.ts');
    
    const sanitizationResult = sanitizeSummary(summary, text);
    if (sanitizationResult.wasSanitized) {
      summary = sanitizationResult.sanitizedContent;
      console.log(`🧹 Auto-sanitized summary - removed: ${sanitizationResult.removedSections.join(', ')}`);
    }

    // EXTREME STRICT COMPLIANCE VALIDATION (with OCR awareness)
    const compliance = validateSummaryCompliance(
      summary, 
      pageType, 
      questions.length > 0,
      { hasFormulasOCR, hasExamplesOCR }
    );
    console.log(`📊 COMPLIANCE SCORE: ${compliance.score}% - Missing sections: ${compliance.missing.join(', ')}`);
    
    // Emergency regeneration if compliance is poor
    if (!compliance.isValid && compliance.score < 80) {
      const emergencyPrompt = createEmergencyPrompt(questions, enhancedText);
      const regeneratedSummary = await handleEmergencyRegeneration(
        summary, compliance, pageType, questions, enhancedText, systemPrompt, emergencyPrompt,
        providerUsed === 'gemini-2.5-pro' ? 'gemini' : 'deepseek',
        providerUsed === 'gemini-2.5-pro' ? GOOGLE_API_KEY : DEEPSEEK_API_KEY,
        (s, pt, hq) => validateSummaryCompliance(s, pt, hq, { hasFormulasOCR, hasExamplesOCR })
      );
      
      if (regeneratedSummary !== summary) {
        summary = regeneratedSummary;
        console.log('✅ Emergency regeneration improved compliance');
        
        // Re-sanitize after emergency regeneration
        const finalSanitization = sanitizeSummary(summary, text);
        if (finalSanitization.wasSanitized) {
          summary = finalSanitization.sanitizedContent;
          console.log(`🧹 Final sanitization - removed: ${finalSanitization.removedSections.join(', ')}`);
        }
      }
    }

    // Final validation and logging
    const finalCompliance = validateSummaryCompliance(
      summary, 
      pageType, 
      questions.length > 0,
      { hasFormulasOCR, hasExamplesOCR }
    );
    const summaryQuestionCount = (summary.match(/\*\*س:/g) || []).length;
    console.log(`🎯 FINAL RESULTS: Compliance=${finalCompliance.score}%, Questions=${summaryQuestionCount}/${questions.length}, Provider=${providerUsed}`);

    // Additional validation metadata
    const validationMeta = {
      pageType,
      questionsDetected: questions.length,
      questionsAnswered: summaryQuestionCount,
      missingSections: finalCompliance.missing,
      hasQuestions: questions.length > 0,
      complianceDetails: finalCompliance
    };

    return new Response(JSON.stringify({ 
      summary,
      rag_pages_sent: ragPagesActuallySent,
      rag_pages_found: ragContext?.length || 0,
      rag_pages_sent_list: ragPagesSentList,
      rag_context_chars: ragContextChars,
      compliance_score: finalCompliance.score,
      validation_meta: validationMeta,
      provider_used: providerUsed
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error('🚨 Unexpected error in EXTREME STRICT COMPLIANCE summarize function:', e);
    console.error('Error stack:', e.stack);
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});