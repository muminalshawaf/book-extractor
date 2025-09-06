import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Handle CORS preflight requests
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let text = '';
    let lang = 'ar';
    let page: number | undefined;
    let title = '';
    let ocrData = null;

    // Handle both GET and POST requests
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const encodedText = url.searchParams.get('text');
      text = encodedText ? atob(encodedText) : '';
      lang = url.searchParams.get('lang') || 'ar';
      const pageParam = url.searchParams.get('page');
      page = pageParam ? parseInt(pageParam) : undefined;
      title = url.searchParams.get('title') || '';
      // Note: ocrData not supported via GET for now
    } else {
      const body = await req.json();
      text = body.text || '';
      lang = body.lang || 'ar';
      page = body.page;
      title = body.title || '';
      ocrData = body.ocrData || null;
    }

    console.log(`Processing text: ${text.length} characters, lang: ${lang}, page: ${page}, title: ${title}`);

    if (!text) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check if this is a table of contents page
    const isTableOfContents = text.toLowerCase().includes('فهرس') || 
                               text.toLowerCase().includes('contents') ||
                               text.toLowerCase().includes('جدول المحتويات');
    
    if (isTableOfContents) {
      console.log('Detected table of contents page, returning simple message');
      const simpleMessage = "### نظرة عامة\nهذه صفحة فهرس المحتويات التي تعرض تنظيم الكتاب وأقسامه الرئيسية.";
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { content: simpleMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders
        }
      });
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'DeepSeek API key not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Helper function to determine if content is educational
    function isContentPage(text: string): boolean {
      const keywords = [
        'مثال', 'تعريف', 'قانون', 'معادلة', 'حل', 'مسألة', 'نظرية', 'خاصية',
        'example', 'definition', 'law', 'equation', 'solution', 'problem', 'theorem', 'property',
        'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات',
        'objectives', 'concepts', 'definitions', 'formulas', 'steps'
      ];
      
      const keywordCount = keywords.filter(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      
      const hasNumberedQuestions = /\d+\.\s/.test(text);
      const hasSubstantialContent = text.length > 300;
      
      return keywordCount >= 2 && hasSubstantialContent;
    }

    // Helper function to extract question numbers from text
    function extractQuestionNumbers(text: string): number[] {
      const matches = text.match(/(\d+)\.\s/g);
      if (!matches) return [];
      
      return matches.map(match => {
        const num = parseInt(match.replace('.', '').trim());
        return num;
      }).filter(num => num > 0 && num < 1000).sort((a, b) => a - b); // Increased upper limit to handle OCR numbers like 93-99
    }

    const needsDetailedStructure = isContentPage(text);
    const requiredQuestionIds = extractQuestionNumbers(text);
    console.log(`Page type: ${needsDetailedStructure ? 'Content page' : 'Non-content page'}, Questions: [${requiredQuestionIds.join(', ')}]`);

    // Extract page context if available from OCR data
    let contextPrompt = ''
    if (ocrData && ocrData.pageContext) {
      const ctx = ocrData.pageContext
      contextPrompt = `
**السياق من تحليل OCR:**
- عنوان الصفحة: ${ctx.page_title || 'غير محدد'}
- نوع الصفحة: ${ctx.page_type || 'غير محدد'}
- المواضيع الرئيسية: ${ctx.main_topics ? ctx.main_topics.join('، ') : 'غير محددة'}
- العناوين الموجودة: ${ctx.headers ? ctx.headers.join('، ') : 'غير محددة'}
- يحتوي على أسئلة: ${ctx.has_questions ? 'نعم' : 'لا'}
- يحتوي على صيغ: ${ctx.has_formulas ? 'نعم' : 'لا'}  
- يحتوي على أمثلة: ${ctx.has_examples ? 'نعم' : 'لا'}
- يحتوي على عناصر بصرية: ${ctx.has_visual_elements ? 'نعم' : 'لا'}

استخدم هذا السياق لفهم محتوى الصفحة بشكل أفضل وتقديم ملخصات دقيقة ومناسبة للسياق.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas, 'Visuals:', ctx.has_visual_elements)
    }
    
    // Check for visual elements to include in summary
    let visualPromptAddition = '';
    if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
      const visuals = ocrData.rawStructuredData.visual_elements;
      if (Array.isArray(visuals) && visuals.length > 0) {
        visualPromptAddition = `

**مهم:** تم اكتشاف عناصر بصرية (رسوم بيانية/مخططات/أشكال) في هذه الصفحة. يجب تضمين قسم "السياق البصري / Visual Context" في الملخص لوصف هذه العناصر وأهميتها التعليمية.`;
        console.log('Visual elements found for summarization:', visuals.length);
      }
    }

    // Create appropriate prompt based on page type
    const prompt = needsDetailedStructure ? 
      `الكتاب: ${title || "الكتاب"} • الصفحة: ${page ?? "؟"} • اللغة: ${lang}
${contextPrompt}
النص المطلوب تلخيصه (صفحة واحدة فقط):
"""
${text}
"""

المهمة: إنشاء ملخص شامل مفيد للطلاب باللغة العربية يساعدهم على فهم جميع النقاط المهمة والإجابة على جميع الأسئلة في الصفحة. استخدم Markdown نظيف مع عناوين H3 (###) بعناوين الأقسام ثنائية اللغة.

**مهم جداً:** يجب الإجابة على جميع الأسئلة المرقمة والأسئلة الفرعية الموجودة في النص. هذا هو المطلب الأهم.

**اكتب فقط الأقسام التي تحتوي على محتوى فعلي من النص. لا تكتب أقسام فارغة.**

### 1) نظرة عامة / Overview
2-3 جمل تغطي المحتوى الرئيسي والغرض من الصفحة.

### 2) المفاهيم الأساسية / Key Concepts
قائمة نقاط مع توضيحات مختصرة. اكتب فقط إذا كانت موجودة في النص.

### 3) التعاريف والمصطلحات / Definitions & Terms
نموذج المسرد: **المصطلح** — التعريف (اشمل الرموز/الوحدات). اكتب فقط إذا كانت موجودة.

### 4) الصيغ والوحدات / Formulas & Units
استخدم LaTeX ($$..$$). اكتب المتغيرات مع معانيها/وحداتها. اكتب فقط إذا كانت موجودة.

### 5) حلول الأسئلة / Questions & Solutions
**اكتب هذا القسم فقط إذا كانت هناك أسئلة مرقمة (مفاهيمية أو حسابية).**
**CRITICAL: احتفظ بأرقام الأسئلة الأصلية كما هي في النص - لا تعيد ترقيمها إلى 1,2,3...**
لكل سؤال مرقم:
- أعد كتابة السؤال بوضوح مع الرقم الأصلي (مثل "س: 93-" بدلاً من "س: 1-")
- إذا كان له أسئلة فرعية (أ/ب/ج، a/b/c، i/ii/iii...)، أجب على كل سؤال فرعي منفصلاً
- إذا كان حسابياً: اعرض الحل خطوة بخطوة مع المعادلات في LaTeX والجواب النهائي الرقمي مع الوحدات
- إذا كان مفاهيمياً: قدم إجابة واضحة ومباشرة من النص
- استخدم LaTeX للمعادلات: $$...$$ للعرض، $...$ للسطر

### 6) الخطوات/الإجراءات / Procedures/Steps
قائمة مرقمة. اكتب فقط إذا كانت موجودة.

### 7) أمثلة وتطبيقات / Examples/Applications
اكتب فقط إذا كانت موجودة.

### 8) أخطاء شائعة/ملابسات / Misconceptions/Pitfalls
اكتب فقط إذا كانت موجودة.

### 9) السياق البصري / Visual Context
**اكتب هذا القسم فقط إذا تم اكتشاف رسوم بيانية أو مخططات أو أشكال في الصفحة.**
- وصف كل عنصر بصري وغرضه التعليمي
- شرح كيف تدعم الرسوم البيانية/المخططات مفاهيم الدرس
- تضمين النقاط الرئيسية أو الاتجاهات أو الأنماط المعروضة
- ربط المعلومات البصرية بالأسئلة التي تشير إليها

القيود:
- استخدم العربية مع علامات الترقيم المناسبة
- ركز على مساعدة الطلاب للحصول على جميع النقاط المهمة والإجابة على جميع الأسئلة
- احتفظ بالمعادلات/الرموز من النص الأصلي
- اعرض جميع خطوات الحساب بوضوح عند حل المسائل
- كن شاملاً بما يكفي ليشعر الطلاب بالثقة حول محتوى الصفحة${visualPromptAddition}` :
      `الكتاب: ${title || "الكتاب"} • الصفحة: ${page ?? "؟"}
${contextPrompt}
النص المطلوب تلخيصه (صفحة غير تعليمية):
"""
${text}
"""

المهمة: إنشاء ملخص بسيط باللغة العربية باستخدام Markdown نظيف مع عناوين H3 (###).

### نظرة عامة / Overview
2-3 جمل تصف محتوى الصفحة والغرض منها.

القيود:
- استخدم العربية
- ركز على وصف بسيط للمحتوى`;

    // Use Arabic prompt if language preference is Arabic or use appropriate English structure
    const finalPrompt = (lang === "ar" || lang === "arabic") ? prompt : 
      needsDetailedStructure ? 
        `Book: ${title || "the book"} • Page: ${page ?? "?"} • Language: ${lang}
${contextPrompt ? contextPrompt.replace(/السياق من تحليل OCR:/, 'PAGE CONTEXT (from OCR analysis):').replace(/عنوان الصفحة:/, 'Page Title:').replace(/نوع الصفحة:/, 'Page Type:').replace(/المواضيع الرئيسية:/, 'Main Topics:').replace(/العناوين الموجودة:/, 'Headers Found:').replace(/يحتوي على أسئلة:/, 'Contains Questions:').replace(/يحتوي على صيغ:/, 'Contains Formulas:').replace(/يحتوي على أمثلة:/, 'Contains Examples:').replace(/نعم/g, 'Yes').replace(/لا/g, 'No').replace(/غير محدد/g, 'Unknown').replace(/غير محددة/g, 'None identified') : ''}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Create a comprehensive student-focused summary in ${lang}. Use clean Markdown with H3 headings (###). 

**IMPORTANT**: If the text contains numbered questions or problems, you MUST answer ALL of them in a dedicated section.

Rules:
- ONLY include sections that have actual content from the text
- Do NOT write empty sections
- Make the summary comprehensive enough that a student feels confident knowing the page content without reading it
- Use ${lang} throughout with appropriate punctuation
- Preserve equations/symbols as they appear

Potential sections (include only if applicable):

### 1) Overview
2–3 sentences covering the page's purpose and main content

### 2) Key Concepts
Comprehensive bullet list; each concept with 1–2 sentence explanation

### 3) Definitions & Terms
Complete glossary: **Term** — definition (include symbols/units)

### 4) Formulas & Units
Use LaTeX ($$...$$ for blocks). List variables with meanings and units

### 5) Questions & Solutions
**ONLY include this section if there are numbered questions or problems in the text.**
**CRITICAL: Preserve original question numbers from text - do NOT renumber them to 1,2,3...**
For each question or problem found:
- Restate the question clearly with original number (e.g., "Q: 93-" instead of "Q: 1-")
- If it has sub-questions (a/b/c, i/ii/iii...), answer each sub-question separately
- If conceptual question: provide comprehensive, detailed answer
- If calculation problem: show step-by-step solution with calculations
- Provide final answer with proper units (for calculation problems)
- Use LaTeX for equations: $$...$$ for display math, $...$ for inline

### 6) Procedures/Steps
Numbered list if applicable

### 7) Examples/Applications
Concrete examples from the text only

### 8) Misconceptions/Pitfalls
Common errors to avoid or important tips

### 9) Visual Context
**ONLY include this section if graphs, charts, diagrams, or figures are detected in the page.**
- Describe each visual element and its educational purpose
- Explain how graphs/charts support the lesson concepts
- Include key data points, trends, or patterns shown
- Connect visual information to questions that reference them

Constraints:
- Avoid excessive formatting
- Preserve equations/symbols from original text
- When solving problems, show ALL calculation steps clearly` :
        `Book: ${title || "the book"} • Page: ${page ?? "?"} • Language: ${lang}
${contextPrompt ? contextPrompt.replace(/السياق من تحليل OCR:/, 'PAGE CONTEXT (from OCR analysis):').replace(/عنوان الصفحة:/, 'Page Title:').replace(/نوع الصفحة:/, 'Page Type:').replace(/المواضيع الرئيسية:/, 'Main Topics:').replace(/العناوين الموجودة:/, 'Headers Found:').replace(/يحتوي على أسئلة:/, 'Contains Questions:').replace(/يحتوي على صيغ:/, 'Contains Formulas:').replace(/يحتوي على أمثلة:/, 'Contains Examples:').replace(/نعم/g, 'Yes').replace(/لا/g, 'No').replace(/غير محدد/g, 'Unknown').replace(/غير محددة/g, 'None identified') : ''}
Text to summarize (non-educational page):
"""
${text}
"""

Create a simple summary in ${lang} using clean Markdown with H3 headings (###).

### Overview
Brief description of the page content and purpose

Constraints:
- Don't add unnecessary sections
- Focus on simple description of content`;

    console.log('Making streaming request to DeepSeek API...');

    // Make the streaming request to DeepSeek
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educational teacher and content analyzer. CRITICAL: You MUST answer every single question found in the text. NO EXCEPTIONS. NEVER MAKE UP QUESTIONS that are not strictly in the text. Answer ALL questions using your full educational knowledge. NEVER say content is "not mentioned" - always provide complete educational answers. When text content is provided, use it as reference but supplement with your teaching expertise to give comprehensive answers to all questions.'
          },
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        stream: true,
        temperature: 0.0,
        top_p: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'DeepSeek API error', details: errorText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Create a readable stream to handle the SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.error(new Error('No response body'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`));
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }

            // Send a ping to keep the connection alive
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error in summarize-stream function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
