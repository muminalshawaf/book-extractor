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
- 300-500 كلمة إجمالاً
- تجنب المبالغة في التنسيق والزخرفة
- احتفظ بالمعادلات والرموز من النص الأصلي`;

    // Use Arabic prompt if language is Arabic
    const finalPrompt = (lang === "ar" || lang === "arabic") ? prompt : 
      `Book: ${title || "the book"} • Page: ${page ?? "?"} • Language: ${lang}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Create a comprehensive student-focused summary in ${lang}. Use clean Markdown with H3 headings (###). 

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

### 5) Procedures/Steps
- Numbered list if applicable

### 6) Examples/Applications
- Concrete examples from the text only

### 7) Misconceptions/Pitfalls
- Common errors to avoid or important tips

### 8) Quick Q&A
If sufficient content exists, create 3–5 Q&A pairs from the text:

| Question | Answer |
|---|---|
| ... | ... |

Constraints:
- 300-500 words total
- Avoid excessive formatting
- Preserve equations/symbols from original text`;

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
            "أنت خبير في تلخيص الكتب المدرسية لصفحة واحدة. كن دقيقًا وشاملاً ومنظمًا. ركز على التغطية الكاملة للتعاريف والمصطلحات والمفاهيم الأساسية. استخدم فقط النص المقدم. احتفظ بالرياضيات في LaTeX. قسم 'الأسئلة السريعة' يجب أن يكون جدول Markdown يتضمن أسئلة واضحة وأجوبتها المباشرة من النص." : 
            "You are an expert textbook summarizer for a single page. Be accurate, comprehensive, and structured. Prioritize complete coverage of Definitions & Terms and Key Concepts. Only use the provided text. Preserve math in LaTeX. The 'Quick Q&A' section MUST be a Markdown table that includes both clear questions and their direct answers from the text." },
          { role: "user", content: finalPrompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1100,
        stream: true,
      }),
    });

    if (!dsRes.ok || !dsRes.body) {
      const t = await dsRes.text();
      return new Response(
        JSON.stringify({ error: `DeepSeek error ${dsRes.status}`, details: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split(/\r?\n\r?\n/);
            buffer = parts.pop() || "";

            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith("data:")) continue;
              const dataStr = line.slice(5).trim();

              if (dataStr === "[DONE]") {
                controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
                controller.close();
                return;
              }

              try {
                const json = JSON.parse(dataStr);
                const delta = json?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
                }
              } catch (_) {
                // ignore
              }
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${String(err)}\n\n`));
        } finally {
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
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
