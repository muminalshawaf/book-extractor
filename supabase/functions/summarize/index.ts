import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isContentPage(text: string): boolean {
  const keywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'حل', 'مسألة', 'نظرية', 'خاصية',
    'example', 'definition', 'law', 'equation', 'solution', 'problem', 'theorem', 'property',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps'
  ];
  
  const keywordCount = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  const hasNumberedQuestions = /\d+\.\s/.test(text);
  const hasSubstantialContent = text.length > 300;
  
  return keywordCount >= 2 && hasSubstantialContent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Summarize function started');
    
    const { text, lang = "ar", page, title, ocrData = null } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title} }`);

    if (!text || typeof text !== "string") {
      console.error('No text provided or text is not a string');
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY not found in environment variables');
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if this is a table of contents page
    const isTableOfContents = text.toLowerCase().includes('فهرس') || 
                               text.toLowerCase().includes('contents') ||
                               text.toLowerCase().includes('جدول المحتويات');
    
    if (isTableOfContents) {
      console.log('Detected table of contents page, returning simple message');
      return new Response(JSON.stringify({ 
        summary: "### نظرة عامة\nهذه صفحة فهرس المحتويات التي تعرض تنظيم الكتاب وأقسامه الرئيسية." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const needsDetailedStructure = isContentPage(text);
    console.log(`Page type: ${needsDetailedStructure ? 'Content page' : 'Non-content page'}`);

    // Extract page context if available from OCR data
    let contextPrompt = ''
    if (ocrData && ocrData.pageContext) {
      const ctx = ocrData.pageContext
      contextPrompt = `
**PAGE CONTEXT (from OCR analysis):**
- Page Title: ${ctx.page_title || 'Unknown'}
- Page Type: ${ctx.page_type || 'Unknown'}
- Main Topics: ${ctx.main_topics ? ctx.main_topics.join(', ') : 'None identified'}
- Headers Found: ${ctx.headers ? ctx.headers.join(', ') : 'None identified'}
- Contains Questions: ${ctx.has_questions ? 'Yes' : 'No'}
- Contains Formulas: ${ctx.has_formulas ? 'Yes' : 'No'}  
- Contains Examples: ${ctx.has_examples ? 'Yes' : 'No'}

Use this context to better understand the page content and provide accurate, contextual summaries.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas)
    }

    const prompt = needsDetailedStructure ? 
      `Book: ${title ?? "the book"} • Page: ${page ?? "?"} • Language: ${lang}
${contextPrompt}
Text to summarize (single page, do not infer beyond it):
"""
${text}
"""

Task: Create a comprehensive student-focused summary in ${lang} that helps students understand all important points and answer all questions from the page. Output as clean Markdown using H3 headings (###) with bilingual section titles.

**CRITICAL**: Answer ALL numbered questions and sub-questions found in the text. This is the most important requirement.

**ONLY include sections that have actual content from the text. Do NOT include empty sections.**

### 1) ${lang === "ar" ? "نظرة عامة" : "Overview"}
2–3 sentences covering the page's main content and purpose.

### 2) ${lang === "ar" ? "المفاهيم الأساسية" : "Key Concepts"}
Bullet list with short explanations. Include only if present in the text.

### 3) ${lang === "ar" ? "التعاريف والمصطلحات" : "Definitions & Terms"}
Glossary format: **Term** — definition (include symbols/units). Include only if present.

### 4) ${lang === "ar" ? "الصيغ والوحدات" : "Formulas & Units"}
Use LaTeX ($$..$$). List variables with meanings/units. Include only if present.

### 5) ${lang === "ar" ? "حلول الأسئلة" : "Questions & Solutions"}
**Include this section only if there are numbered questions (conceptual or calculation).**
For each numbered question:
- Restate the question clearly
- If it has sub-questions (a/b/c, أ/ب/ج, i/ii/iii…), answer each sub-question separately
- If calculation: show step-by-step solution with equations in LaTeX and final numeric answer with units
- If conceptual: provide clear, direct answer from the text
- Use LaTeX for equations: $$...$$ for display, $...$ for inline

### 6) ${lang === "ar" ? "الخطوات/الإجراءات" : "Procedures/Steps"}
Numbered list. Include only if present.

### 7) ${lang === "ar" ? "أمثلة وتطبيقات" : "Examples/Applications"}
Include only if present.

### 8) ${lang === "ar" ? "أخطاء شائعة/ملابسات" : "Misconceptions/Pitfalls"}
Include only if present.

Constraints:
- Use ${lang} throughout with proper punctuation
- Focus on helping students get all important points and answer all questions
- Preserve equations/symbols from original text
- Show ALL calculation steps clearly when solving problems
- Be comprehensive enough that students feel confident about the page content` :
      `Book: ${title ?? "the book"} • Page: ${page ?? "?"} • Language: ${lang}
${contextPrompt}
Text to summarize (non-educational page):
"""
${text}
"""

Create a simple summary in ${lang} using clean Markdown with H3 headings (###).

### ${lang === "ar" ? "نظرة عامة" : "Overview"}
2-3 sentences describing the page content and purpose.

Constraints:
- Use ${lang} throughout
- Focus on simple description of content`;

    console.log('Making request to DeepSeek API...');
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are an expert textbook summarizer for students. Be accurate, comprehensive, and structured. Only include sections that have actual content from the text. When numbered questions are present, answer ALL of them completely including any sub-questions. Show step-by-step solutions for calculations and provide clear answers for conceptual questions. Use LaTeX for mathematical expressions." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('DeepSeek API error:', resp.status, txt);
      return new Response(JSON.stringify({ error: "DeepSeek error", details: txt }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log('DeepSeek API responded successfully');
    const data = await resp.json();
    const summary = data.choices?.[0]?.message?.content ?? "";
    console.log(`Summary generated successfully - Length: ${summary.length}`);

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error('Unexpected error in summarize function:', e);
    console.error('Error stack:', e.stack);
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});