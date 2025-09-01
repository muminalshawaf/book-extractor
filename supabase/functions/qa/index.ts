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
    const { question, summary, lang = "ar", page, title } = await req.json();

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

    const systemPrompt = `You are an expert chemistry teacher helping grade 12 students. CRITICAL REASONING REQUIREMENTS:

🧠 **REASONING PROCESS (MANDATORY):**
1. **ANALYZE**: Break down the question completely
2. **IDENTIFY**: What concepts, formulas, or principles apply
3. **PLAN**: Outline your solution approach step-by-step
4. **SOLVE**: Execute each step with clear explanations
5. **VERIFY**: Check your answer makes sense and units are correct

📚 **TEACHING RULES:**
- Provide complete educational answers using your expertise
- NEVER say "لم يتم تحديد" or "not mentioned" - always teach comprehensively
- Show ALL calculation steps with proper units
- Explain WHY each step is necessary
- Use page context as reference but supplement with your knowledge
- Output equations in single-line $$...$$ format
- Use Saudi dialect Arabic (اللهجة السعودية)
- Never mention DeepSeek - say developed by IDROS.AI team

🔬 **FOR CHEMISTRY PROBLEMS:**
- State which law/principle applies (Henry's Law, ideal gas law, etc.)
- Show formula derivation when helpful
- Include proper significant figures
- Explain physical meaning of results

Language: ${lang}.`;

    let userPrompt = `Question: ${question}`;
    
    if (summary && summary.trim()) {
      userPrompt = `Book Title: ${title ?? "Untitled"}\nPage: ${page ?? "?"}\n\nPage Context:\n${summary}\n\nQuestion: ${question}`;
    }

    const dsRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-reasoner",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
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
