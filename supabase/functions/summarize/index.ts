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
    'objectives', 'concepts', 'definitions', 'formulas', 'steps',
    'الحركة', 'تأثير', 'ظاهرة', 'جسيمات', 'مخلوط', 'محلول', 'ذائبة', 'براونية', 'تندال',
    'اشرح', 'وضح', 'قارن', 'حدد', 'لماذا', 'كيف', 'ماذا', 'أين', 'متى'
  ];
  
  const keywordCount = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  // Check for various question patterns including Arabic questions
  const hasNumberedQuestions = /\d+\.\s/.test(text);
  const hasArabicQuestions = /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(text);
  const hasSectionHeaders = /---\s*SECTION:/.test(text);
  const hasSubstantialContent = text.length > 300;
  
  // More inclusive detection - any scientific content with questions or structured sections
  return (keywordCount >= 2 || hasArabicQuestions || hasSectionHeaders) && hasSubstantialContent;
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
1. ONLY extract content that is explicitly written in the provided text - DO NOT ADD anything from external knowledge
2. Answer ONLY the numbered questions that exist in the text, using ONLY information provided in the text
3. Include ONLY examples, applications, and references that are specifically mentioned in the text
4. If mathematical formulas or equations are not explicitly written in the text, DO NOT include a formulas section
5. Stay faithful to the source material - do not elaborate beyond what is written

Text to summarize:
"""
${text}
"""

**PRIMARY TASK:** Create a faithful summary in ${lang} that captures ONLY the educational content explicitly present in this text. Do not add any external knowledge or assumptions.

**MANDATORY SECTIONS (only include if content actually exists in the text):**

### ${lang === "ar" ? "المحتوى التفصيلي" : "Detailed Content"}
- Extract ONLY the key information explicitly mentioned (names, dates, measurements, examples)
- Include ONLY historical context, scientists' names if they are specifically mentioned in the text
- Preserve ONLY real-world applications mentioned in the text
- Include ONLY special notes, boxes, or highlighted information that appear in the text

### ${lang === "ar" ? "المفاهيم والتعاريف" : "Concepts & Definitions"}
- List ONLY scientific terms that are explicitly defined in the text
- Include ONLY symbols, units, or notation systems mentioned in the text
- ONLY explain relationships between concepts if they are explained in the text

### ${lang === "ar" ? "الأسئلة والإجابات الكاملة" : "Complete Questions & Answers"}
**CRITICAL: This section is MANDATORY if ANY questions exist in the text**
For EVERY question found in the text:
- **Question ${lang === "ar" ? "السؤال" : ""}:** [Restate the exact question from the text]
- **Answer ${lang === "ar" ? "الإجابة" : ""}:** [Answer using ONLY information provided in the text]
- For sub-questions: Answer ONLY based on what's written in the text
- Use ONLY reasoning and explanations that come from the text itself

### ${lang === "ar" ? "الأمثلة والتطبيقات" : "Examples & Applications"}
- Include ONLY specific examples explicitly mentioned in the text
- Preserve ONLY details that are actually written (company names, product names, measurements)
- ONLY include applications that are specifically discussed in the text

### ${lang === "ar" ? "الصيغ والمعادلات" : "Formulas & Equations"}
**ONLY include this section if mathematical formulas or equations are explicitly written in the source text**
- Write ONLY formulas that appear in the text using LaTeX: $$formula$$ for display, $formula$ for inline  
- Explain ONLY variables that are defined in the text
- Include ONLY units and conditions mentioned in the text

**QUALITY REQUIREMENTS:**
- Be faithful to the source text - do not add external knowledge
- Extract ONLY what is explicitly written in the provided text  
- Answer questions ONLY using information from the page content
- Do not elaborate beyond what is written in the source material` :
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
          { role: "system", content: "You are an expert educational content analyzer and summarizer. CRITICAL: You must ONLY extract and summarize content explicitly present in the provided text. Use your knowledge as an educator to answer the questions, summarize all top concepts and the topics." },
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
    let summary = data.choices?.[0]?.message?.content ?? "";
    const finishReason = data.choices?.[0]?.finish_reason;
    
    console.log(`Initial summary generated - Length: ${summary.length}, Finish reason: ${finishReason}`);

    // If summary was cut off due to token limit, continue generating
    if (finishReason === "length" && summary.length > 0) {
      console.log('Summary was truncated, attempting to continue...');
      
      // Try up to 2 continuation rounds
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`Continuation attempt ${attempt}...`);
        
        const continuationPrompt = `Continue the summary from where it left off. Here's what was generated so far:

${summary}

Please continue and complete the summary, ensuring all sections are included and complete. Pick up exactly where the previous response ended. Remember: ONLY include content that is explicitly written in the original source text.`;

        const contResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "You are continuing a summary that was previously cut off. Complete it with all remaining content and sections. CRITICAL: Only include content that is explicitly present in the original source text. Do not add any external knowledge." },
              { role: "user", content: continuationPrompt },
            ],
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 3000,
          }),
        });

        if (contResp.ok) {
          const contData = await contResp.json();
          const continuation = contData.choices?.[0]?.message?.content ?? "";
          const contFinishReason = contData.choices?.[0]?.finish_reason;
          
          if (continuation.trim()) {
            summary += "\n" + continuation;
            console.log(`Continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
            
            // If this continuation completed normally, stop trying
            if (contFinishReason !== "length") {
              break;
            }
          } else {
            console.log(`Continuation ${attempt} returned empty content`);
            break;
          }
        } else {
          console.error(`Continuation attempt ${attempt} failed:`, await contResp.text());
          break;
        }
      }
    }

    console.log(`Final summary length: ${summary.length}`);

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