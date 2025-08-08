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

    const prompt = `Book: ${title ?? "the book"} • Page: ${page ?? "?"} • Language: ${lang}\nText to summarize (single page, do not infer beyond it):\n"""\n${text}\n"""\n\nTask: Produce a comprehensive study summary in ${lang}, strictly from the text. Output as Markdown with these sections:\n1) Overview: 2–3 sentences covering the page's purpose and scope.\n2) Key Concepts: exhaustive bullet list; each concept with a 1–2 sentence explanation.\n3) Definitions & Terms: exhaustive glossary; format "Term — definition"; include symbols and units where relevant.\n4) Formulas & Units: LaTeX ($$...$$ for blocks); list variables with meanings and typical units.\n5) Procedures/Steps: numbered list if applicable.\n6) Examples/Applications: concrete examples from the text only.\n7) Misconceptions/Pitfalls: bullets indicating common errors to avoid.\n8) Quick Q&A: 3–5 question–answer pairs strictly from the text.\n\nConstraints:\n- Use ${lang} throughout.\n- No external knowledge or hallucinations; if something is missing, write "${notStated}".\n- 250–450 words total. Prefer concise bullets. Preserve equations/symbols.`;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are an expert textbook summarizer for a single page. Be accurate, comprehensive, and structured. Prioritize complete coverage of Definitions & Terms and Key Concepts. Only use the provided text. Preserve math in LaTeX." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 900,
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
