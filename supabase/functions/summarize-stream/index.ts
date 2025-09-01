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

    const needsDetailedStructure = isContentPage(text);
    console.log(`Page type: ${needsDetailedStructure ? 'Content page' : 'Non-content page'}`);

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

استخدم هذا السياق لفهم محتوى الصفحة بشكل أفضل وتقديم ملخصات دقيقة ومناسبة للسياق.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas)
    }

    // Create appropriate prompt based on page type
    const prompt = needsDetailedStructure ? 
      `الكتاب: ${title || "الكتاب"} • الصفحة: ${page ?? "؟"} • اللغة: ${lang}
${contextPrompt}

**قواعد منع التكرار الصارمة:**
1. لا تكرر أبداً نفس المسألة أو نوع السؤال أكثر من مرة
2. إذا ظهر نفس السؤال في أقسام مختلفة، ضعه مرة واحدة فقط
3. اجمع المسائل المتشابهة واعرض مثالاً تمثيلياً واحداً لكل نوع
4. ركز على تعليم المفاهيم وليس حل كل مسألة فردية
5. أعط الأولوية للمعلومات الفريدة على المحتوى المتكرر

النص المطلوب تلخيصه:
"""
${text}
"""

المهمة: إنشاء ملخص تعليمي مركز باللغة العربية بدون أي تكرار.

**الأقسام (فقط إذا وُجد محتوى فعلي):**

### المحتوى التفصيلي
- المعلومات الأساسية والقياسات والأمثلة من النص
- الملاحظات المهمة والتطبيقات المذكورة

### المفاهيم والتعاريف
- المصطلحات العلمية والتعاريف من النص
- الوحدات والرموز وأنظمة الترميز

### نماذج الأسئلة والحلول
**هام جداً: اجمع المسائل المتشابهة. احلل مثالاً واحداً فقط لكل نوع مسألة.**
- إذا وُجدت أسئلة متشابهة متعددة، اختر الأكثر تمثيلاً
- اعرض طريقة الحل التي تنطبق على جميع المسائل المشابهة
- لا تحل أبداً نفس نوع المسألة مرتين

### الصيغ والمعادلات
- الصيغ الرياضية من النص باستخدام LaTeX
- تعاريف المتغيرات والوحدات

**متطلبات الجودة:**
- احذف كل تكرار وتداخل
- ركز على تعليم المنهجية وليس حلول المسائل الفردية
- اجمع المحتوى المشابه بكفاءة` :
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
            content: 'You are an educational content analyzer. CRITICAL RULES: Be concise and focused. Avoid all repetition. Don\'t solve the same problem type multiple times. Group similar content together. Answer questions directly without over-explaining. Prioritize unique, essential information only. Quality over quantity always.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: true,
        temperature: 0.2,
        top_p: 0.9,
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
