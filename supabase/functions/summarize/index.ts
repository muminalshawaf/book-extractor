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

Use this context to understand the page structure and provide detailed, contextual summaries that preserve all educational content.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas)
    }

    const prompt = needsDetailedStructure ? 
      `Book: ${title ?? "the book"} • Page: ${page ?? "?"} • Language: ${lang}
${contextPrompt}

**CRITICAL INSTRUCTIONS:**
1. Extract and preserve ALL specific details: names, dates, exact numbers, scientific terms, historical references
2. Answer EVERY numbered question found in the text with complete, detailed responses
3. Include ALL real examples, applications, and practical references mentioned
4. Preserve the educational richness - don't simplify or generalize
5. Use the OCR context to understand the page structure and content type

Text to summarize:
"""
${text}
"""

**PRIMARY TASK:** Create a comprehensive, detail-rich summary in ${lang} that captures ALL educational content from this page. Students should be able to learn everything important just from your summary.

**MANDATORY SECTIONS (only include if content exists):**

### ${lang === "ar" ? "المحتوى التفصيلي" : "Detailed Content"}
- Extract ALL key information with specific details (names, dates, measurements, examples)
- Include historical context, scientists' names with dates if mentioned
- Preserve all real-world applications and practical examples
- Maintain scientific precision and technical terminology
- Include any special notes, boxes, or highlighted information

### ${lang === "ar" ? "المفاهيم والتعاريف" : "Concepts & Definitions"}
- List ALL scientific terms with their complete definitions
- Include any symbols, units, or notation systems
- Explain the relationship between different concepts
- Preserve exact wording for important definitions

### ${lang === "ar" ? "الأسئلة والإجابات الكاملة" : "Complete Questions & Answers"}
**CRITICAL: This section is MANDATORY if ANY questions exist in the text**
For EVERY question found:
- **Question ${lang === "ar" ? "السؤال" : ""}:** [Restate the exact question]
- **Answer ${lang === "ar" ? "الإجابة" : ""}:** [Provide complete, detailed answer based on the text content]
- For sub-questions (أ، ب، ج or a, b, c): Answer each one separately and thoroughly
- Use step-by-step explanations when needed
- Include reasoning and scientific explanations, not just facts

### ${lang === "ar" ? "الأمثلة والتطبيقات" : "Examples & Applications"}
- Include ALL specific examples mentioned in the text
- Preserve exact details (company names, product names, measurements)
- Explain how concepts apply to real life
- Include any historical or contemporary references

### ${lang === "ar" ? "الصيغ والمعادلات" : "Formulas & Equations"}
- Write all formulas using LaTeX: $$formula$$ for display, $formula$ for inline
- Explain what each variable represents
- Include units and conditions for use

**QUALITY REQUIREMENTS:**
- Be comprehensive and detailed, not brief or generic
- Preserve the educational value and richness of the original text
- Use specific examples, names, dates, and numbers from the text
- Answer questions completely based on the page content
- Write as if tutoring a student who needs to fully understand this topic` :
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
          { role: "system", content: "You are an expert educational content analyzer and summarizer. Your primary goal is to preserve ALL educational content from the source text with maximum precision and detail. Never generalize or simplify - extract every specific detail including names, dates, examples, and technical terms. When questions exist in the text, you MUST answer all of them completely using the information provided. Focus on creating comprehensive, tutorial-style content that teaches students everything from the page." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 3000,
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