// Supabase Edge Function: summarize
// Summarizes given text using DeepSeek API
// Deployed at: /functions/v1/summarize

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const { text, lang = "en", page, title } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing DEEPSEEK_API_KEY secret" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const notStated = lang === "ar" ? "غير واضح في النص" : "Not stated in text";

    const prompt = `Book: ${title ?? "the book"} • Page: ${page ?? "?"} • Language: ${lang}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Task: Produce a comprehensive study summary in ${lang}, strictly from the text. Output as clean Markdown using H3 headings (###) with localized section titles. 

**IMPORTANT**: If the text contains numbered mathematical/scientific problems (like "13. ما النسبة المئوية..." or "14. احسب..."), you MUST solve them step-by-step in a dedicated section.

Sections and exact formats:

### 1) ${lang === "ar" ? "نظرة عامة" : "Overview"}
- 2–3 sentences covering the page's purpose and scope.

### 2) ${lang === "ar" ? "المفاهيم الأساسية" : "Key Concepts"}
- Exhaustive bullet list; each concept with a 1–2 sentence explanation. Do NOT bold the whole bullet; keep bold only for key terms if needed.

### 3) ${lang === "ar" ? "التعاريف والمصطلحات" : "Definitions & Terms"}
- Exhaustive glossary in the format: **Term** — definition. Include symbols and units where relevant.

### 4) ${lang === "ar" ? "الصيغ والوحدات" : "Formulas & Units"}
- Use LaTeX ($$...$$ for blocks). List variables with meanings and typical units.

### 5) ${lang === "ar" ? "حلول المسائل" : "Problem Solutions"}
**ONLY include this section if there are numbered mathematical problems in the text.**
For each problem found:
- Restate the problem clearly
- Show step-by-step solution with calculations
- Provide final answer with proper units
- Use LaTeX for equations: $$...$$ for display math, $...$ for inline

### 6) ${lang === "ar" ? "الخطوات/الإجراءات" : "Procedures/Steps"}
- Numbered list if applicable.

### 7) ${lang === "ar" ? "أمثلة وتطبيقات" : "Examples/Applications"}
- Concrete examples from the text only.

### 8) ${lang === "ar" ? "أخطاء شائعة/ملابسات" : "Misconceptions/Pitfalls"}
- Bullets indicating common errors to avoid.

### 9) ${lang === "ar" ? "أسئلة سريعة" : "Quick Q&A"}
Provide 3–5 question–answer pairs strictly from the text as a Markdown table:

| ${lang === "ar" ? "السؤال" : "Question"} | ${lang === "ar" ? "الجواب" : "Answer"} |
|---|---|
| … | … |

Constraints:
- Use ${lang} throughout. Use Arabic punctuation if ${lang} = ar.
- No external knowledge or hallucinations; if something is missing, write "${notStated}".
- 300–600 words total (more if solving problems). Prefer concise bullets. Preserve equations/symbols. Avoid decorative characters and excessive bolding.
- When solving problems, show ALL calculation steps clearly.`;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are an expert textbook summarizer for a single page. Be accurate, comprehensive, and structured. Prioritize complete coverage of Definitions & Terms and Key Concepts. Only use the provided text. Preserve math in LaTeX. When mathematical problems are present, solve them step-by-step showing all work. The 'Quick Q&A' section MUST be a Markdown table that includes both clear questions and their direct answers from the text." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1100,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: "DeepSeek error", details: txt }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const data = await resp.json();
    const summary = data.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
