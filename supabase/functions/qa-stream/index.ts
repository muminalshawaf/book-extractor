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

    let ocrData;
    
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
      
      // Parse ocrData from query params if available
      const ocrDataParam = url.searchParams.get("ocrData");
      if (ocrDataParam) {
        try {
          ocrData = JSON.parse(ocrDataParam);
        } catch (_) {
          ocrData = null;
        }
      }
    } else {
      const body = await req.json();
      question = body?.question ?? "";
      summary = body?.summary ?? "";
      lang = body?.lang ?? "ar";
      page = body?.page;
      title = body?.title ?? "";
      ocrData = body?.ocrData;
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

    const systemPrompt = `You are an expert ${subject} teacher specialized in providing clear, step-by-step solutions.

Core Teaching Principles:
- Read and understand each question thoroughly
- Apply the correct formulas and principles 
- Show all calculation steps with proper units
- Verify answers for physical reasonableness

For chemistry problems:
- Always state which law applies (Henry's Law, Gas Laws, etc.)
- Show proper unit conversions
- Use significant figures correctly
- For tables: show complete table with original data AND your calculated answers
- If a question references a figure with numeric data, use ONLY the provided data points for calculations
- For graph-based questions, show step-by-step calculations using the exact coordinates provided

**MANDATORY Chart and Table Generation - NO EXCEPTIONS:**
You MUST automatically generate visual representations when questions ask for them. NEVER say "I cannot draw" or "I cannot create graphs". You CAN and MUST create charts using the chart-json format below.

You MUST automatically detect and generate visual representations when questions contain these indicators:

CHART GENERATION TRIGGERS:
- Arabic: "ارسم", "اعمل رسم", "مثل بيانياً", "اعمل مخطط", "ارسم منحنى", "مثل في رسم بياني", "وضح بالرسم", "بين بالرسم", "مثل", "اعرض بيانياً", "ارسم مخطط"
- English: "plot", "graph", "draw", "sketch", "show graphically", "create a chart", "make a diagram", "illustrate", "represent graphically"
- Questions about trends, relationships, comparisons, or data visualization
- Chemical equilibrium changes, reaction rates over time, concentration profiles
- Chemistry: Questions about oxidation number changes, electron flow, reaction mechanisms, pH changes
- When question asks to show changes in values over time or conditions
- Questions comparing multiple data points or showing progression
- Physics problems involving motion graphs, force diagrams, energy plots
- Mathematical functions, equations with variables

TABLE GENERATION TRIGGERS:  
- Arabic: "اعمل جدول", "نظم في جدول", "رتب البيانات"
- English: "make a table", "organize data", "tabulate", "create a table"
- Questions asking for systematic organization of values, comparisons, or data sets

**CRITICAL: When any question asks for a graph/chart, you MUST generate it using this exact format:**
\`\`\`chart-json
{
  "type": "line|bar|scatter|area",
  "title": "Descriptive Chart Title in Arabic",
  "xAxis": {"label": "X-axis label", "unit": "optional unit", "scale": "linear|log"},
  "yAxis": {"label": "Y-axis label", "unit": "optional unit", "scale": "linear|log"}, 
  "data": [{"x": value, "y": value}, ...],
  "series": [{"key": "y", "name": "Series Name", "color": "#3b82f6"}]
}
\`\`\`

NEVER respond with "I cannot draw" - you CAN and MUST create charts when requested.

For tables, use standard markdown format:
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |

**OCR Data Usage (STRONG MANDATE):**
- Always examine and utilize available OCR data for any graphs, tables, or charts
- If there are visual elements (graphs, charts, tables) in context, use the extracted data from them
- Do not ignore numerical data available in visual elements - use them in calculations
- If a question refers to a figure or table, look for corresponding data in OCR information

**No Unstated Assumptions Mandate:** 
- Never use any numbers or values not mentioned in the question or context
- If data is incomplete, state what specific information is missing
- If solution requires unstated values, leave them as symbols (like m, V, T) rather than substituting arbitrary numbers
- Verify units, dimensions, and physical reasonableness of given values
- Do not assume standard conditions unless explicitly stated

Use Saudi Arabic. Output math in $$...$$ format. Language: ${lang}.`;

    let userPrompt = `Question: ${question}`;
    if (summary && String(summary).trim()) {
      let contextText = summary;
      
      // Add structured visual data if available and relevant to the question
      if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
        const referencesVisual = /شكل|figure|graph|chart|رسم|مخطط|جدول|table/i.test(question);
        
        if (referencesVisual) {
          // Extract figure number from question (e.g., "الشكل 27-1" or "Figure 27-1")
          const figureMatch = question.match(/(?:الشكل|figure)\s*(\d+-?\d*)/i);
          const figureNumber = figureMatch ? figureMatch[1] : null;
          
          const relevantVisuals = ocrData.rawStructuredData.visual_elements.filter(ve => {
            if (figureNumber && ve.title) {
              return ve.title.includes(figureNumber);
            }
            return ve.type === 'graph' || ve.type === 'chart' || ve.type === 'table';
          });
          
          if (relevantVisuals.length > 0) {
            let visualDataText = "\n\n**STRUCTURED DATA FOR CALCULATION:**\n";
            
            relevantVisuals.forEach(ve => {
              visualDataText += `\nFigure: ${ve.title || 'Untitled'}\n`;
              visualDataText += `Description: ${ve.description || 'No description'}\n`;
              
              if (ve.numeric_data && ve.numeric_data.series) {
                visualDataText += `NUMERIC DATA POINTS:\n`;
                ve.numeric_data.series.forEach(series => {
                  visualDataText += `- ${series.label}: `;
                  const points = series.points.map(p => 
                    `(${p.x} ${p.units?.x || ''}, ${p.y} ${p.units?.y || ''})`
                  ).join(', ');
                  visualDataText += `${points}\n`;
                  if (series.slope !== undefined) {
                    visualDataText += `  Linear relationship: y = ${series.slope}x + ${series.intercept}\n`;
                  }
                });
                
                if (ve.numeric_data.axis_ranges) {
                  const ar = ve.numeric_data.axis_ranges;
                  visualDataText += `Axis ranges: X(${ar.x_min}-${ar.x_max} ${ar.x_unit}), Y(${ar.y_min}-${ar.y_max} ${ar.y_unit})\n`;
                }
              }
              
              if (ve.key_values && ve.key_values.length > 0) {
                visualDataText += `Key values: ${ve.key_values.join(', ')}\n`;
              }
            });
            
            contextText += visualDataText;
          }
        }
      }
      
      userPrompt = `Book Title: ${title ?? "Untitled"}\nPage: ${page ?? "?"}\n\nPage Context:\n${contextText}\n\nQuestion: ${question}`;
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
        temperature: 0,
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
