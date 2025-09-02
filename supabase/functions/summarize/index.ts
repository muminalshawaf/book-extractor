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
    
    // Log model usage priority
    // Model selection already logged above
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    console.log('Available models:');
    console.log(`- Gemini 1.5 Flash: ${GOOGLE_API_KEY ? 'AVAILABLE (primary)' : 'UNAVAILABLE'}`);
    console.log(`- DeepSeek Chat: ${DEEPSEEK_API_KEY ? 'AVAILABLE (fallback)' : 'UNAVAILABLE'}`);

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
    const systemPrompt = `You are an expert chemistry professor. Your task is to analyze educational content and provide structured summaries following a specific format.

FORMAT REQUIREMENTS:
# Header
## Sub Header  
### Sub Header
Use tables when necessary
- Question format: **س: [number]- [exact question text]**
- Answer format: **ج:** [complete step-by-step solution]
- Use LaTeX for formulas: $$formula$$ 
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**

QUESTION SOLVING DIRECTIVES:
1. When solving questions, solve them in sequence from the least to the most. Start from question 45, then 46, etc.
2. Ensure that you answer all the questions despite the maximum tokens and characters. This means be concise on the topics you need to be concise on. Remember, this is a summary of all the important topics on the page.

MANDATORY SECTIONS (only include if content exists on the page):
- المفاهيم والتعاريف
- المصطلحات العلمية
- الصيغ والمعادلات  
- الأسئلة والإجابات الكاملة

Skip sections if the page does not contain relevant content for that section.`;

    const userPrompt = `${needsDetailedStructure ? `# ملخص المحتوى التعليمي
## المفاهيم والتعاريف
Analyze the content and extract key concepts and definitions. Format as:
- **[Arabic term]:** [definition]
## المصطلحات العلمية
Extract scientific terminology if present:
- **[Scientific term]:** [explanation]
## الصيغ والمعادلات
List formulas and equations if present:
| الصيغة | الوصف | المتغيرات |
|--------|--------|-----------|
| $$formula$$ | description | variables |
## الأسئلة والإجابات الكاملة
Process ALL questions from the OCR text with complete step-by-step solutions:
OCR TEXT:
${enhancedText}
CRITICAL: Answer EVERY question found. Do not skip any questions.` : `# ملخص الصفحة
## نظرة عامة
هذه صفحة تحتوي على محتوى تعليمي.
OCR TEXT:
${enhancedText}`}`;

    let summary = "";
    let providerUsed = "";

    // Try Gemini first (best available model)
    if (googleApiKey) {
      console.log('Attempting to use Gemini 1.5 Flash for summarization...');
      try {
        const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
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
          providerUsed = "gemini-1.5-flash";
          
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

                const contResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
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

    // Fallback to DeepSeek if Gemini failed or not available
    if (!summary.trim() && deepSeekApiKey) {
      console.log('Using DeepSeek as fallback...');
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

    // Validate question completion and trigger auto-continuation if needed
    const summaryQuestionCount = (summary.match(/\*\*س:/g) || []).length;
    const originalQuestionCount = questions.length;
    
    console.log(`Final summary length: ${summary.length}, Questions processed: ${summaryQuestionCount}/${originalQuestionCount}, Provider: ${providerUsed}`);
    
    // Auto-continuation check: if we're missing questions and have space for more content
    if (originalQuestionCount > 0 && summaryQuestionCount < originalQuestionCount && summary.length < 14000) {
      console.log(`⚠️ Missing ${originalQuestionCount - summaryQuestionCount} questions, attempting auto-continuation...`);
      
      const missingNumbers = questions
        .map(q => q.number)
        .filter(num => !summary.includes(`**س: ${num}-`));
      
      if (missingNumbers.length > 0 && providerUsed === 'gemini-1.5-flash') {
        console.log(`🔄 Auto-continuing to complete missing questions: ${missingNumbers.join(', ')}`);
        
        const completionPrompt = `COMPLETE THE MISSING QUESTIONS - This is a quality check continuation.

Previous summary is missing these question numbers: ${missingNumbers.join(', ')}

REQUIREMENTS:
- Process ONLY the missing questions: ${missingNumbers.join(', ')}
- Use EXACT formatting: **س: [number]- [question text]** and **ج:** [complete answer]
- Use $$formula$$ for math, × for multiplication
- Provide complete step-by-step solutions
- Do NOT repeat questions already answered

Missing questions from OCR text:
${enhancedText.split('\n').filter(line => 
  missingNumbers.some(num => line.includes(`${num}.`) || line.includes(`${num}-`))
).join('\n')}`;

        try {
          const completionResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + "\n\n" + completionPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 8000 }
            }),
          });

          if (completionResp.ok) {
            const completionData = await completionResp.json();
            const completion = completionData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            
            if (completion.trim()) {
              summary += "\n\n" + completion;
              const finalQuestionCount = (summary.match(/\*\*س:/g) || []).length;
              console.log(`✅ Auto-continuation completed. Final question count: ${finalQuestionCount}/${originalQuestionCount}`);
            }
          }
        } catch (completionError) {
          console.error('Auto-continuation failed:', completionError);
        }
      }
    } else if (summaryQuestionCount >= originalQuestionCount) {
      console.log('✅ All questions appear to be processed successfully');
    }

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