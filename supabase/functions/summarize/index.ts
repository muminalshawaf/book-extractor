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

    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");
    const deepSeekApiKey = Deno.env.get("DEEPSEEK_API_KEY");
    
    if (!googleApiKey && !deepSeekApiKey) {
      console.error('Neither GOOGLE_API_KEY nor DEEPSEEK_API_KEY found in environment variables');
      return new Response(JSON.stringify({ error: "No API keys configured" }), {
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
    let visualContext = ''
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
- Contains Visual Elements: ${ctx.has_visual_elements ? 'Yes' : 'No'}

Use this context to understand the page structure and provide detailed, contextual summaries that preserve all educational content.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas, 'Visuals:', ctx.has_visual_elements)
    }
    
    // Extract visual elements if available
    if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
      const visuals = ocrData.rawStructuredData.visual_elements
      if (Array.isArray(visuals) && visuals.length > 0) {
        visualContext = `
**VISUAL ELEMENTS DETECTED:**
${visuals.map((v, i) => `${i+1}. ${v.type}: ${v.title || 'Untitled'} - ${v.description || 'No description'}`).join('\n')}

When summarizing, include a "Visual Context" section describing these elements and their educational significance.
`
        console.log('Visual elements found:', visuals.length)
      }
    }

    const prompt = `🎯 **CRITICAL MISSION: COMPREHENSIVE OCR TEXT ANALYSIS & VERIFICATION**

You are an expert educational content analyst and chemistry professor with ZERO TOLERANCE for incomplete or inaccurate content analysis. This is a HIGH-PRIORITY educational mission requiring PERFECT accuracy.

${ocrData && ocrData.rawStructuredData ? 
`**🔍 COMPLETE OCR VISUAL CONTEXT FOR VERIFICATION:**
Page Structure Analysis: ${ocrData.rawStructuredData.page_context ? JSON.stringify(ocrData.rawStructuredData.page_context, null, 2) : 'Not available'}

**📊 COMPREHENSIVE VISUAL DATA & CALCULATIONS:**
${ocrData.rawStructuredData.visual_elements && ocrData.rawStructuredData.visual_elements.length > 0 ? 
ocrData.rawStructuredData.visual_elements.map((ve, i) => {
  let output = `${i+1}. ${ve.type}: ${ve.title || 'Untitled'}\n   Description: ${ve.description || 'No description'}`;
  
  if (ve.numeric_data && ve.numeric_data.series) {
    output += `\n   📈 PRECISE NUMERIC DATA:`;
    ve.numeric_data.series.forEach(series => {
      output += `\n   - Series "${series.label}": ${series.points.length} data points`;
      output += `\n     Points: ${series.points.map(p => `(${p.x} ${p.units?.x || ''}, ${p.y} ${p.units?.y || ''})`).join(', ')}`;
      if (series.slope !== undefined) output += `\n     Linear relationship: slope=${series.slope}, intercept=${series.intercept}`;
    });
    output += `\n   - Axis ranges: X: ${ve.numeric_data.axis_ranges?.x_min}-${ve.numeric_data.axis_ranges?.x_max} ${ve.numeric_data.axis_ranges?.x_unit || ''}`;
    output += `\n                  Y: ${ve.numeric_data.axis_ranges?.y_min}-${ve.numeric_data.axis_ranges?.y_max} ${ve.numeric_data.axis_ranges?.y_unit || ''}`;
  }
  
  if (ve.key_values && ve.key_values.length > 0) {
    output += `\n   🔑 Key Values: ${ve.key_values.join(', ')}`;
  }
  
  output += `\n   📚 Educational Context: ${ve.educational_context || 'Not specified'}`;
  return output;
}).join('\n\n') : 'No visual elements detected'}`
: 'No OCR context available'}

**⚠️ CRITICAL VERIFICATION PROTOCOL:**

**ASSUMPTION: ALL EXISTING ANSWERS ARE INCORRECT UNTIL PROVEN OTHERWISE**
- Treat every solution as potentially wrong
- Re-verify ALL calculations from scratch using visual data
- Double-check ALL numerical values against OCR visual elements
- Cross-reference ALL formulas with provided chart data
- Validate ALL units, conversions, and measurements

**🔬 MANDATORY ANALYSIS REQUIREMENTS:**

1. **EXHAUSTIVE OCR TEXT COVERAGE**: Process EVERY single character, number, symbol, and word from the OCR text
2. **VISUAL ELEMENT INTEGRATION**: Incorporate ALL visual data (graphs, tables, diagrams) into calculations
3. **ZERO OMISSION POLICY**: Include EVERY question, formula, example, and concept mentioned
4. **ACCURACY VERIFICATION**: Re-solve ALL problems using provided visual data and OCR context
5. **COMPLETE FORMATTING FIDELITY**: Maintain exact numbering, spacing, and structure from source

**🎯 ENHANCED VERIFICATION CHECKLIST:**
✅ Every OCR text segment accounted for
✅ All visual elements incorporated into analysis
✅ Every question number preserved exactly
✅ All calculations verified against visual data
✅ Complete cross-reference with structured OCR
✅ Perfect formatting and student readability
✅ Zero content gaps or omissions

**📋 SYSTEMATIC CONTENT VERIFICATION:**
1. **TEXT PARSING**: Read EVERY word from OCR - missing nothing
2. **VISUAL ANALYSIS**: Extract ALL data from charts, graphs, tables
3. **CALCULATION VERIFICATION**: Re-solve using visual element data
4. **CROSS-REFERENCE**: Validate against structured OCR context  
5. **COMPLETENESS CHECK**: Ensure 100% coverage of source material
6. **ACCURACY VALIDATION**: Verify all answers using chemistry expertise
7. **FORMAT PERFECTION**: Student-optimized layout and presentation

**🚨 CRITICAL QUALITY STANDARDS:**
- NEVER skip or summarize content - include EVERYTHING
- ALWAYS verify calculations using provided visual data
- NEVER trust existing answers - recalculate from scratch
- ALWAYS cross-reference with OCR structured data for completeness
- NEVER add external knowledge not present in source material
- ALWAYS maintain exact question numbering from source

**📐 FORMATTING EXCELLENCE REQUIREMENTS:**
- Use proper Arabic numbering exactly as in OCR (٩٣، ٩٤، ٩٥، etc.)
- Bold ALL section titles and question numbers
- Double spacing between question-answer pairs
- LaTeX formatting for ALL mathematical expressions
- Markdown tables for ALL tabular OCR data
- Clear visual hierarchy for student comprehension

Content requiring COMPLETE analysis:

${title ?? "Textbook"} - Page ${page ?? "?"} (${lang})
"""
${text}
"""

${needsDetailedStructure ? `
Create a concise educational summary in ${lang} with these sections:

### **${lang === "ar" ? "المحتوى الأساسي" : "Key Content"}**
- Main concepts and definitions from the text
- Important facts, measurements, and examples mentioned

**IMPORTANT:** Only include additional sections if they actually exist in the content. Do NOT mention missing sections or explain why they are not included.

If questions exist, add:
### **${lang === "ar" ? "الأسئلة والإجابات" : "Questions & Answers"}**

**CRITICAL NUMBERING RULE:** Use the EXACT question numbers as they appear in the OCR text. Do NOT renumber them.

For each question found (maintain original numbering like ٩٣, ٩٤, ٩٥, ٩٦, ٩٧, ٩٨, ٩٩, ١٠٠, ١٠١, ١٠٢, ١٠٣, ١٠٤, ١٠٥, ١٠٦):

**${lang === "ar" ? "س" : "Q"}:** **[Question number as in source]- [exact question text]**

**${lang === "ar" ? "ج" : "A"}:** [complete detailed answer using chemistry expertise and visual data]


**ENHANCED FORMATTING REQUIREMENTS:**
- Add double line spacing between each question-answer pair
- Use proper Arabic numerals as they appear in the source material
- Include all mathematical formulas in LaTeX format
- Show complete step-by-step calculations for numerical problems
- Reference visual elements (tables, graphs) with exact data when mentioned in questions
- **Make all section titles bold using double asterisks**
- **Make all questions bold for better readability**
- **Create markdown tables when OCR data contains tabular information**

**TABLE CREATION INSTRUCTIONS:**
When the OCR data contains table information (like "جدول 9-1"), create proper markdown tables:

| ${lang === "ar" ? "العمود الأول" : "Column 1"} | ${lang === "ar" ? "العمود الثاني" : "Column 2"} |
|---|---|
| Data 1 | Data 2 |
| Data 3 | Data 4 |

Include table titles as bold headings: **${lang === "ar" ? "جدول" : "Table"} [Number]: [Title]**

**CRITICAL FOR GRAPH-BASED QUESTIONS:** When a question references a specific figure/graph (like "الشكل 27-1"), you MUST:
1. Use the provided visual element data to extract numerical relationships and data points
2. Apply the graph's axes labels, key values, and data descriptions to solve calculations
3. Reference specific values from the graph description to perform mathematical operations
4. Show step-by-step calculations using the graph data

If formulas or equations exist, add:
### **${lang === "ar" ? "الصيغ والمعادلات" : "Formulas & Equations"}**
- Include formulas using LaTeX: $$formula$$ or $formula$
- Explain variables and conditions` : `
Create a simple summary in ${lang} using clean Markdown with H3 headings (###).

### ${lang === "ar" ? "نظرة عامة" : "Overview"}
2-3 sentences describing the page content and purpose.

Constraints:
- Use ${lang} throughout
- Focus on simple description of content`}`;

    // Try Gemini first, then DeepSeek as fallback
    let summary = "";
    let useDeepSeek = false;

    if (googleApiKey) {
      console.log('Attempting to use Gemini 2.5 Pro for summarization...');
      try {
        const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an expert chemistry teacher. Create concise but complete summaries in ${lang}. Answer all questions using your expertise. Use LaTeX for formulas.\n\n${prompt}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4000,
            }
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const finishReason = geminiData.candidates?.[0]?.finishReason;
          
          if (summary.trim()) {
            console.log(`Gemini 2.5 Pro API responded successfully - Length: ${summary.length}, Finish reason: ${finishReason}, provider_used: gemini-2.5-pro`);
            
            // Check if Gemini response was truncated due to token limit
            if (finishReason === "MAX_TOKENS" && summary.length > 0) {
              console.log('Gemini summary was truncated, attempting to continue...');
              
              // Try up to 2 continuation rounds for Gemini
              for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`Gemini continuation attempt ${attempt}...`);
                
                const continuationPrompt = `Continue the summary from where it left off. Here's what was generated so far:

${summary}

Please continue and complete the summary, ensuring all sections are included and complete. Pick up exactly where the previous response ended. Remember: ONLY include content that is explicitly written in the original source text.`;

                const contResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        parts: [
                          {
                            text: `You are continuing a summary that was previously cut off. Complete it with all remaining content and sections. CRITICAL: Only include content that is explicitly present in the original source text. Do not add any external knowledge.\n\n${continuationPrompt}`
                          }
                        ]
                      }
                    ],
                    generationConfig: {
                      temperature: 0.3,
                      maxOutputTokens: 4000,
                    }
                  }),
                });

                if (contResp.ok) {
                  const contData = await contResp.json();
                  const continuation = contData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                  const contFinishReason = contData.candidates?.[0]?.finishReason;
                  
                  if (continuation.trim()) {
                    summary += "\n" + continuation;
                    console.log(`Gemini continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
                    
                    // If this continuation completed normally, stop trying
                    if (contFinishReason !== "MAX_TOKENS") {
                      break;
                    }
                  } else {
                    console.log(`Gemini continuation ${attempt} returned empty content`);
                    break;
                  }
                } else {
                  console.error(`Gemini continuation attempt ${attempt} failed:`, await contResp.text());
                  break;
                }
              }
            }
          } else {
            throw new Error("Gemini returned empty content");
          }
        } else {
          const errorText = await geminiResp.text();
          console.error('Gemini API error:', geminiResp.status, errorText);
          throw new Error(`Gemini API error: ${geminiResp.status}`);
        }
      } catch (geminiError) {
        console.error('Gemini failed, falling back to DeepSeek:', geminiError);
        useDeepSeek = true;
      }
    } else {
      console.log('No Google API key found, using DeepSeek');
      useDeepSeek = true;
    }

    // DeepSeek fallback
    if (useDeepSeek && deepSeekApiKey) {
      console.log('Using DeepSeek for summarization...');
      try {
        const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${deepSeekApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "You are an expert chemistry teacher. Create concise but complete summaries. Answer all questions using your expertise. Use LaTeX for formulas." },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
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
        summary = data.choices?.[0]?.message?.content ?? "";
        const finishReason = data.choices?.[0]?.finish_reason;
        
        console.log(`DeepSeek summary generated - Length: ${summary.length}, Finish reason: ${finishReason}`);

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
                "Authorization": `Bearer ${deepSeekApiKey}`,
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
                max_tokens: 4000,
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
      } catch (deepSeekError) {
        console.error('DeepSeek API failed:', deepSeekError);
        return new Response(JSON.stringify({ error: "Both Gemini and DeepSeek failed", details: String(deepSeekError) }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (!summary.trim()) {
      console.error('No summary generated from any API');
      return new Response(JSON.stringify({ error: "Failed to generate summary from any API" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
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