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
      }).filter(num => num > 0 && num < 100).sort((a, b) => a - b);
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
      `استخرج المفاهيم الرئيسية وحل الأسئلة المرقمة بإيجاز. استخدم النص المقدم فقط.

تنسيق الإجابة:
**ملخص المفاهيم الرئيسية:**
- [3-5 نقاط مستخرجة، بحد أقصى 120 كلمة]

**حلول الأسئلة المرقمة:**
- السؤال [رقم]: [إجابة مباشرة]

النص:
${text}

قيود:
- لا تحيات أو مقدمات أو تعريفات أو خلفية
- احذف المعلومات المفقودة تماماً
- استخدم البيانات البصرية عند الحاجة` :
      `لخص المحتوى بإيجاز. استخدم المعلومات الموجودة فقط.

النص:
${text}

اكتب ملخصاً مختصراً للصفحة.`;

    // Use Arabic prompt if language preference is Arabic or use appropriate English structure
    const finalPrompt = (lang === "ar" || lang === "arabic") ? prompt : 
      needsDetailedStructure ? 
        `Extract main concepts and solve numbered questions concisely.

Format:
**Key Concepts:**
- [3-5 bullet points, max 120 words]

**Question Solutions:**
- Q[#]: [direct answer]

Text:
${text}

Constraints: No greetings, introductions, or background. Use visual data when referenced.` :
        `Summarize page content concisely.

Text:
${text}`;

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
            content: 'Create concise summaries. Follow format constraints exactly.'
          },
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        stream: true,
        temperature: 0,
        top_p: 0.2,
        max_tokens: 900,
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
