import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced question parsing function
function parseQuestions(text: string): Array<{number: string, text: string, fullMatch: string}> {
  const questions = [];
  
  // Enhanced regex patterns for Arabic and English question numbers with various formats
  const questionPatterns = [
    /(\d+)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=\d+\.|$))/gm, // English numbers: 93. question text
    /([٩٠-٩٩]+[٠-٩]*)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=[٩٠-٩٩]+[٠-٩]*\.|$))/gm, // Arabic numbers: ٩٣. question text
    /(١٠[٠-٦])\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=١٠[٠-٦]\.|$))/gm, // Arabic 100-106: ١٠٠. ١٠١. etc.
  ];
  
  for (const pattern of questionPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    while ((match = pattern.exec(text)) !== null) {
      const questionNumber = match[1].trim();
      const questionText = match[2].trim();
      
      if (questionText.length > 10) { // Filter out very short matches
        questions.push({
          number: questionNumber,
          text: questionText,
          fullMatch: match[0]
        });
      }
    }
  }
  
  // Sort questions by their numeric value
  questions.sort((a, b) => {
    const aNum = convertArabicToEnglishNumber(a.number);
    const bNum = convertArabicToEnglishNumber(b.number);
    return parseInt(aNum) - parseInt(bNum);
  });
  
  // Remove duplicates
  const unique = questions.filter((question, index, self) => 
    index === self.findIndex(q => q.number === question.number)
  );
  
  console.log(`Parsed ${unique.length} questions from OCR text:`, 
    unique.map(q => q.number).join(', '));
  
  return unique;
}

function convertArabicToEnglishNumber(arabicNum: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  
  let result = arabicNum;
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  return result;
}

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

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");
    const deepSeekApiKey = Deno.env.get("DEEPSEEK_API_KEY");
    
    if (!openaiApiKey && !googleApiKey && !deepSeekApiKey) {
      console.error('No API keys configured');
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

    // Parse questions from OCR text for validation
    const questions = parseQuestions(text);
    console.log(`Found ${questions.length} questions in OCR text`);

    // Build visual elements context
    let visualElementsText = '';
    if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
      const visuals = ocrData.rawStructuredData.visual_elements;
      if (Array.isArray(visuals) && visuals.length > 0) {
        visualElementsText = `

--- VISUAL CONTEXT ---
${visuals.map(v => {
  let visualDesc = `**${v.type.toUpperCase()}**: ${v.title || 'Untitled'}
Description: ${v.description || 'No description'}`;
  
  if (v.key_values && v.key_values.length > 0) {
    visualDesc += `\nKey Values: ${v.key_values.join(', ')}`;
  }
  
  if (v.table_structure) {
    visualDesc += `\nTable Structure:
Headers: ${v.table_structure.headers ? v.table_structure.headers.join(' | ') : 'N/A'}
Rows:`;
    if (v.table_structure.rows) {
      v.table_structure.rows.forEach((row, i) => {
        visualDesc += `\nRow ${i + 1}: ${Array.isArray(row) ? row.join(' | ') : row}`;
      });
    }
    if (v.table_structure.calculation_context) {
      visualDesc += `\nCalculation needed: ${v.table_structure.calculation_context}`;
    }
  }
  
  if (v.numeric_data && v.numeric_data.series) {
    visualDesc += `\nData: ${v.data_description || ''}`;
    v.numeric_data.series.forEach(series => {
      if (series.points && series.points.length > 0) {
        visualDesc += `\n${series.label}: ${series.points.map(p => `(${p.x || 'x'}, ${p.y || 'y'})`).join(', ')}`;
      }
    });
  }
  
  if (v.educational_context) {
    visualDesc += `\nContext: ${v.educational_context}`;
  }
  
  return visualDesc;
}).join('\n\n')}`;
        console.log(`Visual elements found: ${visuals.length}`);
      }
    }

    // Enhanced text with visual context
    const enhancedText = text + visualElementsText;

    // Create optimized prompt for question processing
    const systemPrompt = `You are an expert chemistry professor specializing in solution chemistry, colligative properties, and Henry's Law. Your task is to process educational content and provide complete solutions to ALL questions with perfect formatting.

CRITICAL FORMATTING RULES:
- Question format: **س: ٩٣- [exact question text]**
- Answer format: **ج:** [complete step-by-step solution]
- Use LaTeX for formulas: $$formula$$ 
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**
- Include complete calculations with units
- Reference visual data when mentioned in questions

MANDATORY: Process EVERY question from 93-106. DO NOT skip any questions.`;

    const userPrompt = `${needsDetailedStructure ? `
### **المحتوى الأساسي**

يتناول هذا الفصل مفاهيم أساسية في كيمياء المحاليل، مع التركيز على الخواص الجامعة للمحاليل وقانون هنري. الخواص الجامعة هي الخواص الفيزيائية التي تعتمد على عدد جسيمات المذاب في كمية معينة من المذيب، وليس على طبيعة هذه الجسيمات.

**المفاهيم الأساسية:**
*   **قانون هنري:** يصف العلاقة بين ذائبية غاز في سائل والضغط الجزئي لذلك الغاز فوق السائل.
*   **الخواص الجامعة (Colligative Properties):** تشمل الانخفاض في الضغط البخاري، والارتفاع في درجة الغليان، والانخفاض في درجة التجمد، والضغط الأسموزي.
*   **الذائبية والقطبية:** المبدأ الأساسي هو "الشّبيه يذيب الشّبيه"، حيث تميل المذيبات القطبية إلى إذابة المذابات القطبية، والمذيبات غير القطبية تذيب المذابات غير القطبية.
*   **التركيز:** يتم التعبير عنه بطرق مختلفة مثل المولالية (mol/kg)، والمولارية (mol/L)، والكسر المولي.

**الصيغ والمعادلات الرئيسية:**
*   **قانون هنري:** $$\\frac{S_1}{P_1} = \\frac{S_2}{P_2}$$
*   **الانخفاض في درجة التجمد:** $$\\Delta T_f = i \\times K_f \\times m$$
*   **الارتفاع في درجة الغليان:** $$\\Delta T_b = i \\times K_b \\times m$$
*   **المولالية (m):** $$m = \\frac{\\text{مولات المذاب}}{\\text{كتلة المذيب (kg)}}$$
*   **المولارية (M):** $$M = \\frac{\\text{مولات المذاب}}{\\text{حجم المحلول (L)}}$$
*   **الكسر المولي (X):** $$X_A = \\frac{\\text{مولات المكون A}}{\\text{مجموع مولات جميع المكونات}}$$
حيث $$i$$ هو معامل فانت هوف (عدد الجسيمات الناتجة عن تفكك وحدة صيغة واحدة من المذاب).

---

### **الأسئلة والإجابات**

Process ALL questions from the following OCR text. Use the EXACT question numbers as they appear (93-106). Provide complete step-by-step solutions using chemistry expertise.

OCR TEXT:
${enhancedText}

CRITICAL: Answer EVERY question found. Do not skip any questions or stop early.` : `
### ${lang === "ar" ? "نظرة عامة" : "Overview"}
هذه صفحة تحتوي على محتوى تعليمي في الكيمياء.

OCR TEXT:
${enhancedText}`}`;

    let summary = "";
    let providerUsed = "";

    // Try OpenAI first (best for complex reasoning)
    if (openaiApiKey) {
      console.log('Attempting to use OpenAI GPT-4.1 for summarization...');
      try {
        const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-2025-04-14",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.2,
            max_completion_tokens: 16000,
          }),
        });

        if (openaiResp.ok) {
          const openaiData = await openaiResp.json();
          summary = openaiData.choices?.[0]?.message?.content ?? "";
          const finishReason = openaiData.choices?.[0]?.finish_reason;
          providerUsed = "openai-gpt-4.1";
          
          if (summary.trim()) {
            console.log(`OpenAI API responded successfully - Length: ${summary.length}, Finish reason: ${finishReason}, provider_used: ${providerUsed}`);
            
            // Handle continuation if needed
            if (finishReason === "length" && summary.length > 0) {
              console.log('OpenAI summary was truncated, attempting to continue...');
              
              for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`OpenAI continuation attempt ${attempt}...`);
                
                const continuationPrompt = `CONTINUE THE SUMMARY - Complete all remaining questions.

Previous response ended with:
${summary.slice(-500)}

REQUIREMENTS:
- Continue from exactly where you left off
- Process ALL remaining questions (93-106 if not covered)
- Use EXACT formatting: **س: ٩٣- [question]** and **ج:** [answer]
- Use $$formula$$ for math, × for multiplication
- Complete ALL questions until finished

Original OCR text: ${enhancedText}`;

                const contResp = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${openaiApiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-4.1-2025-04-14",
                    messages: [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: continuationPrompt }
                    ],
                    temperature: 0.2,
                    max_completion_tokens: 12000,
                  }),
                });

                if (contResp.ok) {
                  const contData = await contResp.json();
                  const continuation = contData.choices?.[0]?.message?.content ?? "";
                  const contFinishReason = contData.choices?.[0]?.finish_reason;
                  
                  if (continuation.trim()) {
                    summary += "\n\n" + continuation;
                    console.log(`OpenAI continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
                    
                    if (contFinishReason !== "length") {
                      break;
                    }
                  } else {
                    console.log(`OpenAI continuation ${attempt} returned empty content`);
                    break;
                  }
                } else {
                  console.error(`OpenAI continuation attempt ${attempt} failed:`, await contResp.text());
                  break;
                }
              }
            }
          } else {
            throw new Error("OpenAI returned empty content");
          }
        } else {
          const errorText = await openaiResp.text();
          console.error('OpenAI API error:', openaiResp.status, errorText);
          throw new Error(`OpenAI API error: ${openaiResp.status}`);
        }
      } catch (openaiError) {
        console.error('OpenAI failed, trying Gemini...', openaiError);
      }
    }

    // Fallback to Gemini if OpenAI failed or not available
    if (!summary.trim() && googleApiKey) {
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
                parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 16000,
            }
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const finishReason = geminiData.candidates?.[0]?.finishReason;
          providerUsed = "gemini-2.5-pro";
          
          if (summary.trim()) {
            console.log(`Gemini API responded successfully - Length: ${summary.length}, Finish reason: ${finishReason}, provider_used: ${providerUsed}`);
            
            // Handle continuation if needed
            if (finishReason === "MAX_TOKENS" && summary.length > 0) {
              console.log('Gemini summary was truncated, attempting to continue...');
              
              for (let attempt = 1; attempt <= 2; attempt++) {
                console.log(`Gemini continuation attempt ${attempt}...`);
                
                const continuationPrompt = `CONTINUE THE SUMMARY - Complete all remaining questions.

Previous response ended with:
${summary.slice(-500)}

REQUIREMENTS:
- Continue from exactly where you left off
- Process ALL remaining questions (93-106 if not covered)
- Use EXACT formatting: **س: ٩٣- [question]** and **ج:** [answer]
- Use $$formula$$ for math, × for multiplication
- Complete ALL questions until finished

Original OCR text: ${enhancedText}`;

                const contResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        parts: [{ text: systemPrompt + "\n\n" + continuationPrompt }]
                      }
                    ],
                    generationConfig: {
                      temperature: 0.2,
                      maxOutputTokens: 12000,
                    }
                  }),
                });

                if (contResp.ok) {
                  const contData = await contResp.json();
                  const continuation = contData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                  const contFinishReason = contData.candidates?.[0]?.finishReason;
                  
                  if (continuation.trim()) {
                    summary += "\n\n" + continuation;
                    console.log(`Gemini continuation ${attempt} added - New length: ${summary.length}, Finish reason: ${contFinishReason}`);
                    
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
        console.error('Gemini failed, trying DeepSeek...', geminiError);
      }
    }

    // Final fallback to DeepSeek
    if (!summary.trim() && deepSeekApiKey) {
      console.log('Using DeepSeek as final fallback...');
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
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 12000,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          summary = data.choices?.[0]?.message?.content ?? "";
          providerUsed = "deepseek-chat";
          console.log(`DeepSeek API responded successfully - Length: ${summary.length}, provider_used: ${providerUsed}`);
        } else {
          const txt = await resp.text();
          console.error('DeepSeek API error:', resp.status, txt);
          throw new Error(`DeepSeek API error: ${resp.status}`);
        }
      } catch (deepSeekError) {
        console.error('DeepSeek API failed:', deepSeekError);
      }
    }

    if (!summary.trim()) {
      console.error('No valid summary generated from any API');
      return new Response(JSON.stringify({ error: "Failed to generate summary from any API" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Validate question completion
    const summaryQuestionCount = (summary.match(/\*\*س:/g) || []).length;
    console.log(`Final summary length: ${summary.length}, Questions processed: ${summaryQuestionCount}/${questions.length}, Provider: ${providerUsed}`);

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