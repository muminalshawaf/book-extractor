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

    const prompt = `Book: ${title || "the book"} • Page: ${page ?? "?"} • Language: ${lang}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Task: Produce a comprehensive study summary in ${lang}, strictly from the text. Output as clean Markdown using H3 headings (###) with localized section titles. Sections and exact formats:

### 1) ${lang === "ar" ? "نظرة عامة" : "Overview"}
- 2–3 sentences covering the page's purpose and scope.

### 2) ${lang === "ar" ? "المفاهيم الأساسية" : "Key Concepts"}
- Exhaustive bullet list; each concept with a 1–2 sentence explanation. Do NOT bold the whole bullet; keep bold only for key terms if needed.

### 3) ${lang === "ar" ? "التعاريف والمصطلحات" : "Definitions & Terms"}
- Exhaustive glossary in the format: **Term** — definition. Include symbols and units where relevant.

### 4) ${lang === "ar" ? "الصيغ والوحدات" : "Formulas & Units"}
- Use LaTeX ($$...$$ for blocks). List variables with meanings and typical units.

### 5) ${lang === "ar" ? "الخطوات/الإجراءات" : "Procedures/Steps"}
- Numbered list if applicable.

### 6) ${lang === "ar" ? "أمثلة وتطبيقات" : "Examples/Applications"}
- Concrete examples from the text only.

### 7) ${lang === "ar" ? "أخطاء شائعة/ملابسات" : "Misconceptions/Pitfalls"}
- Bullets indicating common errors to avoid.

### 8) ${lang === "ar" ? "أسئلة سريعة" : "Quick Q&A"}
Provide 3–5 question–answer pairs strictly from the text as a Markdown table:

| ${lang === "ar" ? "السؤال" : "Question"} | ${lang === "ar" ? "الجواب" : "Answer"} |
|---|---|
| … | … |

Constraints:
- Use ${lang} throughout. Use Arabic punctuation if ${lang} = ar.
- No external knowledge or hallucinations; if something is missing, write "${notStated}".
- 250–450 words total. Prefer concise bullets. Preserve equations/symbols. Avoid decorative characters and excessive bolding.`;

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
          { role: "system", content: "You are an expert textbook summarizer for a single page. Be accurate, comprehensive, and structured. Prioritize complete coverage of Definitions & Terms and Key Concepts. Only use the provided text. Preserve math in LaTeX. The 'Quick Q&A' section MUST be a Markdown table that includes both clear questions and their direct answers from the text." },
          { role: "user", content: prompt },
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
