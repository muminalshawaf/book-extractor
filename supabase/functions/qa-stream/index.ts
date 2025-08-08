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
    // Support both POST (JSON) and GET (query params) for SSE via EventSource
    let question = "";
    let summary = "";
    let lang = "ar";
    let page: number | undefined = undefined;
    let title = "";

    if (req.method === "GET") {
      const url = new URL(req.url);
      question = url.searchParams.get("question") ?? url.searchParams.get("q") ?? "";
      const b64 = url.searchParams.get("summary_b64");
      if (b64) {
        try {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          summary = new TextDecoder().decode(bytes);
        } catch (_) {
          summary = "";
        }
      } else {
        summary = url.searchParams.get("summary") ?? "";
      }
      lang = url.searchParams.get("lang") ?? "ar";
      const pg = url.searchParams.get("page");
      page = pg ? Number(pg) : undefined;
      title = url.searchParams.get("title") ?? "";
    } else {
      const body = await req.json();
      question = body?.question ?? "";
      summary = body?.summary ?? "";
      lang = body?.lang ?? "ar";
      page = body?.page;
      title = body?.title ?? "";
    }

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Missing 'question' in body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing DEEPSEEK_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a teacher helping students understand topics. Follow these rules:
- Assume the student needs step-by-step explanations
- Respond ONLY to the user's LAST request
- Use context when needed for clarity
- Output equations in single-line $$...$$ format
- Separate concepts with new lines
- Use Saudi dialect Arabic (اللهجة السعودية)
- Never mention DeepSeek - say developed by IDROS.AI team
- Use tabular format for tables
You can answer any question the student asks. If page context is provided, use it when relevant. Language: ${lang}.`;

    let userPrompt = `Question: ${question}`;
    if (summary && String(summary).trim()) {
      userPrompt = `Book Title: ${title ?? "Untitled"}\nPage: ${page ?? "?"}\n\nPage Context:\n${summary}\n\nQuestion: ${question}`;
    }

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
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

        // Optional: notify client stream opened
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
                // ignore non-JSON lines
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
