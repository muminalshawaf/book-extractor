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

Use Saudi Arabic. Output math in $$...$$ format. Language: ${lang}.`;

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
        model: "deepseek-chat",
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
