import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log('Summarize-stream function started');
    // Support GET (EventSource) and POST (fetch streaming)
    let text = "";
    let lang = "en";
    let page: number | undefined = undefined;
    let title = "";

    if (req.method === "GET") {
      const url = new URL(req.url);
      const b64 = url.searchParams.get("text_b64");
      if (b64) {
        try {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          text = new TextDecoder().decode(bytes);
        } catch (_) {
          text = "";
        }
      } else {
        text = url.searchParams.get("text") ?? "";
      }
      lang = url.searchParams.get("lang") ?? "en";
      const pg = url.searchParams.get("page");
      page = pg ? Number(pg) : undefined;
      title = url.searchParams.get("title") ?? "";
    } else {
      const body = await req.json();
      text = body?.text ?? "";
      lang = body?.lang ?? "en";
      page = body?.page;
      title = body?.title ?? "";
    }

    console.log(`Processing streaming summary - Page: ${page}, Lang: ${lang}, Text length: ${text?.length}`);

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing DEEPSEEK_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notStated = lang === "ar" ? "غير واضح في النص" : "Not stated in text";

    const prompt = `أريد ملخصًا شاملاً للطلاب من هذا النص (صفحة واحدة فقط):
"""
${text}
"""

المطلوب: ملخص شامل ومفيد للطالب باللغة العربية، يغطي فقط المحتوى الموجود في النص. استخدم تنسيق Markdown مع عناوين H3 (###). 

**مهم جداً**: إذا احتوى النص على مسائل رياضية أو علمية مرقمة (مثل "13. ما النسبة المئوية..." أو "14. احسب...")، يجب حلها خطوة بخطوة في قسم مخصص.

اتبع هذه القواعد:
- اكتب فقط الأقسام التي لها محتوى فعلي من النص
- لا تكتب أقسام فارغة أو "غير واضح في النص"
- اجعل الملخص شاملاً بما يكفي ليشعر الطالب بالثقة أنه يعرف محتوى الصفحة دون قراءتها
- استخدم اللغة العربية فقط مع علامات الترقيم العربية
- احتفظ بالمعادلات والرموز كما هي

الأقسام المحتملة (اكتب فقط ما ينطبق):

### نظرة عامة
- وضح الهدف والمحتوى الرئيسي للصفحة في 2-3 جمل

### المفاهيم الأساسية  
- قائمة شاملة بالمفاهيم مع شرح مختصر لكل منها

### التعاريف والمصطلحات
- قاموس شامل بالصيغة: **المصطلح** — التعريف (مع الوحدات والرموز إن وجدت)

### الصيغ والقوانين
- استخدم LaTeX للمعادلات ($$...$$ للكتل). اذكر المتغيرات ومعانيها والوحدات

### حلول المسائل
**اكتب هذا القسم فقط إذا وجدت مسائل رياضية مرقمة في النص.**
لكل مسألة:
- أعد صياغة السؤال بوضوح
- اعرض الحل خطوة بخطوة مع الحسابات
- اذكر الجواب النهائي مع الوحدات المناسبة
- استخدم LaTeX للمعادلات: $$...$$ للمعادلات المنفصلة، $...$ للمعادلات ضمن السطر

### الخطوات والإجراءات
- قائمة مرقمة بالخطوات إن وجدت

### أمثلة وتطبيقات
- أمثلة محددة من النص فقط

### أخطاء شائعة ونصائح
- أخطاء يجب تجنبها أو نصائح مهمة

### أسئلة سريعة
إذا كان هناك محتوى كافٍ، أنشئ 3-5 أسئلة وأجوبة من النص في جدول:

| السؤال | الجواب |
|---|---|
| ... | ... |

قيود:
- 300-600 كلمة إجمالاً (أكثر إذا كنت تحل مسائل)
- تجنب المبالغة في التنسيق والزخرفة
- احتفظ بالمعادلات والرموز من النص الأصلي
- عند حل المسائل، أظهر جميع خطوات الحساب بوضوح`;

    // Use Arabic prompt if language is Arabic
    const finalPrompt = (lang === "ar" || lang === "arabic") ? prompt : 
      `Book: ${title || "the book"} • Page: ${page ?? "?"} • Language: ${lang}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Create a comprehensive student-focused summary in ${lang}. Use clean Markdown with H3 headings (###). 

**IMPORTANT**: If the text contains numbered mathematical/scientific problems (like "13. Calculate..." or "14. Find..."), you MUST solve them step-by-step in a dedicated section.

Rules:
- ONLY include sections that have actual content from the text
- Do NOT write empty sections or "${notStated}"
- Make the summary comprehensive enough that a student feels confident knowing the page content without reading it
- Use ${lang} throughout with appropriate punctuation
- Preserve equations/symbols as they appear

Potential sections (include only if applicable):

### 1) Overview
- 2–3 sentences covering the page's purpose and main content

### 2) Key Concepts
- Comprehensive bullet list; each concept with 1–2 sentence explanation

### 3) Definitions & Terms
- Complete glossary: **Term** — definition (include symbols/units)

### 4) Formulas & Units
- Use LaTeX ($$...$$ for blocks). List variables with meanings and units

### 5) Problem Solutions
**ONLY include this section if there are numbered mathematical problems in the text.**
For each problem found:
- Restate the problem clearly
- Show step-by-step solution with calculations
- Provide final answer with proper units
- Use LaTeX for equations: $$...$$ for display math, $...$ for inline

### 6) Procedures/Steps
- Numbered list if applicable

### 7) Examples/Applications
- Concrete examples from the text only

### 8) Misconceptions/Pitfalls
- Common errors to avoid or important tips

### 9) Quick Q&A
If sufficient content exists, create 3–5 Q&A pairs from the text:

| Question | Answer |
|---|---|
| ... | ... |

Constraints:
- 300-600 words total (more if solving problems)
- Avoid excessive formatting
- Preserve equations/symbols from original text
- When solving problems, show ALL calculation steps clearly`;

    console.log('Making streaming request to DeepSeek API...');
    const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: (lang === "ar" || lang === "arabic") ? 
            "أنت خبير في تلخيص الكتب المدرسية لصفحة واحدة. كن دقيقًا وشاملاً ومنظمًا. ركز على التغطية الكاملة للتعاريف والمصطلحات والمفاهيم الأساسية. استخدم فقط النص المقدم. احتفظ بالرياضيات في LaTeX. عند وجود مسائل رياضية، احلها خطوة بخطوة مع إظهار جميع الخطوات. قسم 'الأسئلة السريعة' يجب أن يكون جدول Markdown يتضمن أسئلة واضحة وأجوبتها المباشرة من النص." : 
            "You are an expert textbook summarizer for a single page. Be accurate, comprehensive, and structured. Prioritize complete coverage of Definitions & Terms and Key Concepts. Only use the provided text. Preserve math in LaTeX. When mathematical problems are present, solve them step-by-step showing all work. The 'Quick Q&A' section MUST be a Markdown table that includes both clear questions and their direct answers from the text." },
          { role: "user", content: finalPrompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!dsRes.ok || !dsRes.body) {
      const t = await dsRes.text();
      console.error('DeepSeek streaming API error:', dsRes.status, t);
      return new Response(
        JSON.stringify({ error: `DeepSeek error ${dsRes.status}`, details: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('DeepSeek streaming API connected successfully');

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = dsRes.body!.getReader();
        let buffer = "";

        controller.enqueue(encoder.encode(`event: open\ndata: ok\n\n`));
        const ping = setInterval(() => {
          try { controller.enqueue(encoder.encode(`:ping\n\n`)); } catch (_) {}
        }, 15000);

        let chunkCount = 0;
        let totalContentReceived = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log(`Stream completed after ${chunkCount} chunks. Total content length: ${totalContentReceived.length}`);
              break;
            }
            
            chunkCount++;
            const chunk = decoder.decode(value, { stream: true });
            console.log(`Received chunk ${chunkCount}, size: ${chunk.length}`);
            
            buffer += chunk;

            const parts = buffer.split(/\r?\n\r?\n/);
            buffer = parts.pop() || "";

            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith("data:")) continue;
              const dataStr = line.slice(5).trim();

              if (dataStr === "[DONE]") {
                console.log('Received [DONE] signal from DeepSeek');
                controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
                controller.close();
                return;
              }

              try {
                const json = JSON.parse(dataStr);
                const delta = json?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  console.log(`Forwarding delta content: "${delta.substring(0, 50)}${delta.length > 50 ? '...' : ''}"`);
                  totalContentReceived += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
                }
              } catch (parseErr) {
                console.log('Failed to parse JSON data:', dataStr.substring(0, 100));
              }
            }
          }
        } catch (err) {
          console.error('Streaming error:', err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${String(err)}\n\n`));
        } finally {
          console.log('Stream cleanup: clearing ping interval and closing controller');
          clearInterval(ping);
          controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error('Unexpected error in summarize-stream function:', e);
    console.error('Error stack:', e.stack);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
