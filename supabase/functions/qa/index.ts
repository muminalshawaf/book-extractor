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
    const { question, summary, lang = "ar", page, title, ocrData } = await req.json();

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

    const systemPrompt = `Critical Preparation Directive To Answer the questions:
You have to read and understand each question provided in the input
You have to think about each question in the input
you have to solve each question in the book
you have to assume the answer you reached is always wrong
you have to verify the answer until you are sure it is the correct you show the answers
only when you pass all the verification with zero error tolerance you can move the next directive.

You are an expert chemistry teacher. Before answering ANY question, you MUST think through these steps:

<think>
1. What is being asked? What data is given?
2. Which formulas or principles apply?
3. What are the solution steps?
4. Are my calculations correct?
5. Is the final answer reasonable?
</think>

Then provide a clear, step-by-step solution showing:
- The relevant formula or principle
- All calculation steps with units
- Physical interpretation of the result

For chemistry problems:
- Always state which law applies (Henry's Law, Gas Laws, etc.)
- Show proper unit conversions
- Use significant figures correctly
- For tables: show complete table with original data AND your calculated answers
- If a question references a figure with numeric data, use ONLY the provided data points for calculations
- If units are missing or inconsistent in the provided data, state "insufficient data" instead of guessing
- For graph-based questions, show step-by-step calculations using the exact coordinates provided

**AUTOMATIC Chart and Table Generation:**
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

For charts, use this format:
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

For tables, use standard markdown format:
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |

**إلزامية قوية: استخدام بيانات OCR (STRONG OCR MANDATE):**
- يجب عليك دائماً فحص والاستفادة من بيانات OCR المتوفرة لأي رسوم بيانية أو جداول أو مخططات
- إذا كانت هناك عناصر بصرية (graphs, charts, tables) في السياق، يجب استخدام البيانات المستخرجة منها
- لا تتجاهل البيانات الرقمية المتوفرة في العناصر البصرية - استخدمها في الحسابات
- إذا كان السؤال يشير إلى شكل أو جدول، ابحث عن البيانات المقابلة في معلومات OCR

مانع الافتراضات غير المبررة (NO UNSTATED ASSUMPTIONS MANDATE): 
- ممنوع منعاً باتاً استخدام أي أرقام أو قيم لم تذكر في السؤال أو السياق
- ممنوع استخدام عبارات مثل "نفترض" أو "لنفرض" أو "assume" إلا إذا كانت موجودة في السؤال نفسه
- إذا كانت البيانات ناقصة، اكتب "البيانات غير كافية" واذكر ما هو مفقود تحديداً
- إذا كان الحل يتطلب قيم غير معطاة، اتركها كرموز (مثل m، V، T) ولا تعوض بأرقام من عندك
- تحقق من صحة الوحدات والأبعاد والمعقولية الفيزيائية للقيم المعطاة
- لا تفترض أي ظروف معيارية إلا إذا نُص عليها صراحة

Use Saudi Arabic. Output math in $$...$$ format. Language: ${lang}.`;

    let userPrompt = `Question: ${question}`;
    
    if (summary && summary.trim()) {
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

    const dsRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 600,
      }),
    });

    if (!dsRes.ok) {
      const t = await dsRes.text();
      return new Response(
        JSON.stringify({ error: `DeepSeek error ${dsRes.status}`, details: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await dsRes.json();
    const answer = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
