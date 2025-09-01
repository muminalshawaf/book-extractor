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

    // Extract subject and grade from book title for dynamic prompt
    let subject = "science";
    let grade = "12";
    
    if (title) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes("chemistry") || titleLower.includes("كيمياء")) {
        subject = "Chemistry";
      } else if (titleLower.includes("physics") || titleLower.includes("فيزياء")) {
        subject = "Physics";
      } else if (titleLower.includes("math") || titleLower.includes("رياضيات")) {
        subject = "Mathematics";
      }
      
      // Extract grade number from title
      const gradeMatch = title.match(/(\d+)/);
      if (gradeMatch) {
        grade = gradeMatch[1];
      }
    }

    const systemPrompt = `You are an expert ${subject} teacher for grade ${grade} students. MANDATORY REASONING PROCESS:

🧠 **STEP-BY-STEP REASONING (REQUIRED):**
1. **ANALYZE**: What exactly is being asked? What data is given?
2. **IDENTIFY**: Which scientific principles/formulas apply?
3. **PLAN**: Outline solution steps before calculating
4. **SOLVE**: Execute each step with clear explanations
5. **VERIFY**: Check answer reasonableness and units

📚 **TEACHING EXCELLENCE:**
- Answer ALL questions using your full educational expertise
- NEVER say "لم يتم تحديد" or "not mentioned" - always provide complete answers
- When page context provided, use as reference but supplement with your knowledge
- Show ALL calculation steps with proper units and significant figures
- Explain WHY each step is necessary for student understanding
- Output equations in single-line $$...$$ format
- Use Saudi dialect Arabic (اللهجة السعودية)
- Never mention DeepSeek - say developed by IDROS.AI team

🧪 **FOR CHEMISTRY PROBLEMS:**
- State which law applies (Henry's Law, Gas Laws, etc.)
- Show formula derivation when helpful
- Explain physical significance of results
- Include proper unit conversions if needed

📊 **TABLE COMPLETION PROTOCOL:**
  1. Show complete table with original data AND calculated answers
  2. Use proper Arabic formatting: | الضغط (kPa) | الذائبية (g/L) |
  3. Replace "?" with calculated values showing work
  4. For Henry's Law: Show P₁/C₁ = P₂/C₂ calculation steps
  5. For dilutions: Show M₁V₁ = M₂V₂ calculation steps

Your mission: Teach thoroughly with complete reasoning. Language: ${lang}.`;

    let userPrompt = `Question: ${question}`;
    if (summary && String(summary).trim()) {
      let contextText = summary;
      
      // Check if question references visual elements (شكل, Figure, graph, chart)
      const referencesVisual = /شكل|figure|graph|chart|رسم|مخطط/i.test(question);
      if (referencesVisual && summary.includes('--- VISUAL CONTEXT ---')) {
        // Extract and prioritize visual context for questions about figures
        const visualSectionMatch = summary.match(/--- VISUAL CONTEXT ---([\s\S]*?)(?=---|$)/);
        if (visualSectionMatch) {
          const visualInfo = visualSectionMatch[1].trim();
          contextText = `**VISUAL CONTEXT (Referenced in Question):**\n${visualInfo}\n\n**Full Page Context:**\n${summary}`;
        }
      }
      
      userPrompt = `Book Title: ${title ?? "Untitled"}\nPage: ${page ?? "?"}\n\nPage Context:\n${contextText}\n\nQuestion: ${question}${referencesVisual ? '\n\n**Note: This question references a visual element (graph/figure). Use the visual context above to answer accurately.**' : ''}`;
    }

    const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        model: "deepseek-reasoner",
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
