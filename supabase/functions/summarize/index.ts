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
    
    const { text, lang = "ar", page, title, ocrData = null, strictMode = true } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title}, strictMode: ${strictMode} }`);
    
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

    // Create STRICT MANDATE SYSTEM PROMPT
    const systemPrompt = `You are an expert chemistry professor. Your task is to analyze educational content and provide structured summaries following STRICT MANDATES.

🚨 CRITICAL MANDATES - ZERO TOLERANCE FOR VIOLATIONS:

1. **MATHJAX MANDATE - 100% COMPLIANCE REQUIRED:**
   - Use ONLY $$equation$$ format for ALL math (never single $)
   - Use \\cdot with proper spacing: $$a \\cdot b$$  
   - Wrap ALL units in \\text{}: $$\\frac{4.0 \\text{ atm}}{0.12 \\text{ mol/L}}$$
   - Use \\times for multiplication: $$2 \\times 10^3$$
   - Chemical formulas: $$\\text{H}_2\\text{O}$$, $$\\text{CO}_2$$
   - NEVER write raw equations - always wrap in $$ $$

2. **OCR DATA USAGE MANDATE - MANDATORY:**
   - You MUST examine and use ALL visual elements in OCR data
   - If tables exist in OCR, you MUST reference them in calculations
   - NEVER say "data not provided" when OCR contains the data
   - Extract and use ALL numerical data from tables and graphs

3. **NO ASSUMPTIONS MANDATE - ABSOLUTELY FORBIDDEN:**
   - NEVER use "نفترض", "لنفرض", "assume" unless stated in the question
   - If data is missing, write "البيانات غير كافية" and specify what's missing
   - Use ONLY values explicitly given in the text or OCR data
   - NEVER substitute assumed values for missing data

4. **COMPLETE QUESTION COVERAGE MANDATE:**
   - Answer EVERY numbered question found in the text
   - Process questions in numerical order (lowest to highest)
   - Never skip questions due to complexity or length
   - Show complete step-by-step solutions for ALL calculations

${strictMode ? `
5. **STRICT VALIDATION MANDATE:**
   - Your response will be automatically validated
   - Failures will trigger automatic retry (max 2 attempts)
   - Score must be ≥90/100 to be accepted
   - Non-compliance will result in rejection
` : ''}

FORMAT REQUIREMENTS:
- Use H3 headers: ### Section Name
- Question format: **س: [number]- [exact question text]**
- Answer format: **ج:** [complete solution]
- Use tables when necessary`;

    // Create the user prompt with enhanced OCR integration
    const userPrompt = needsDetailedStructure ? 
      `Book: ${title || "Chemistry"} • Page: ${page ?? "?"} • Language: ${lang}

ENHANCED OCR TEXT WITH ALL DATA:
${enhancedText}

TASK: Create comprehensive summary with MANDATORY sections:

### نظرة عامة / Overview
Brief overview of page content and purpose.

### المفاهيم والتعاريف / Concepts & Definitions  
Key concepts with explanations.

### المصطلحات العلمية / Scientific Terms
Terminology with definitions.

### الصيغ والمعادلات / Formulas & Equations
All formulas in $$LaTeX$$ format with variable definitions.

### حلول الأسئلة / Question Solutions
**MANDATORY: Answer EVERY numbered question with complete solutions.**
Process questions in numerical order. Show all calculation steps.

### السياق البصري / Visual Context
**If OCR visual elements exist, describe and use them.**

VALIDATION TARGETS:
- Questions answered: ${questions.length}/${questions.length} (100% required)
- OCR data usage: ${visualElementsText ? 'REQUIRED' : 'N/A'}
- Math format: $$LaTeX$$ only
- No assumptions: Strict enforcement` :
      `Simple summary for non-educational page.
      
Text: ${enhancedText}`;

    let summary = "";
    let providerUsed = "";
    let attempts = 0;
    const maxAttempts = strictMode ? 3 : 1;

    // Try with validation loop
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts}/${maxAttempts}`);

      // Try Gemini first
      if (googleApiKey && !summary.trim()) {
        console.log('Attempting Gemini 1.5 Flash...');
        try {
          const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 16000,
              }
            }),
          });

          if (geminiResp.ok) {
            const geminiData = await geminiResp.json();
            summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            providerUsed = "gemini-1.5-flash";
            
            if (summary.trim()) {
              console.log(`Gemini attempt ${attempts} - Length: ${summary.length}`);
            }
          }
        } catch (error) {
          console.error(`Gemini attempt ${attempts} failed:`, error);
        }
      }

      // Try DeepSeek if Gemini failed
      if (deepSeekApiKey && !summary.trim()) {
        console.log('Attempting DeepSeek...');
        try {
          const deepSeekResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
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
              temperature: 0,
              max_tokens: 12000,
            }),
          });

          if (deepSeekResp.ok) {
            const data = await deepSeekResp.json();
            summary = data.choices?.[0]?.message?.content ?? "";
            providerUsed = "deepseek-chat";
            
            if (summary.trim()) {
              console.log(`DeepSeek attempt ${attempts} - Length: ${summary.length}`);
            }
          }
        } catch (error) {
          console.error(`DeepSeek attempt ${attempts} failed:`, error);
        }
      }

      if (!summary.trim()) {
        console.error(`No summary generated on attempt ${attempts}`);
        continue;
      }

      // Strict Mode Validation
      if (strictMode && summary.trim()) {
        console.log(`Validating response for attempt ${attempts}...`);
        
        // Basic validation checks
        const summaryQuestionCount = (summary.match(/\*\*س:/g) || []).length;
        const originalQuestionCount = questions.length;
        const hasProperMath = /\$\$[^$]+\$\$/.test(summary);
        const hasAssumptions = /نفترض|لنفرض|assume/i.test(summary);
        
        const validationScore = calculateValidationScore({
          questionCoverage: summaryQuestionCount / Math.max(originalQuestionCount, 1),
          mathFormatting: hasProperMath ? 1 : 0.5,
          noAssumptions: hasAssumptions ? 0 : 1,
          ocrUsage: visualElementsText && summary.includes('جدول') ? 1 : 0.8,
        });

        console.log(`Validation Score: ${validationScore}/100`);
        console.log(`Questions: ${summaryQuestionCount}/${originalQuestionCount}`);
        console.log(`Math Format: ${hasProperMath}`);
        console.log(`Has Assumptions: ${hasAssumptions}`);

        if (validationScore >= 90) {
          console.log('✅ Validation passed');
          break;
        } else if (attempts < maxAttempts) {
          console.log('⚠️ Validation failed, retrying...');
          
          // Create retry prompt
          const retryPrompt = `VALIDATION FAILED (Score: ${validationScore}/100) - RETRY WITH CORRECTIONS:

ISSUES FOUND:
${summaryQuestionCount < originalQuestionCount ? `- Missing ${originalQuestionCount - summaryQuestionCount} questions` : ''}
${!hasProperMath ? '- Improper math formatting (use $$formula$$)' : ''}
${hasAssumptions ? '- Contains forbidden assumptions' : ''}
${!summary.includes('جدول') && visualElementsText ? '- OCR table data not used' : ''}

ORIGINAL REQUEST: ${userPrompt}

FIX ALL ISSUES AND PROVIDE COMPLETE RESPONSE.`;

          userPrompt = retryPrompt;
          summary = ""; // Reset for retry
          continue;
        } else {
          console.log('❌ Validation failed after max attempts');
          return new Response(JSON.stringify({
            error: "Response validation failed",
            details: `Score: ${validationScore}/100. Issues: Question coverage, math formatting, or mandate compliance.`,
            validationScore,
          }), {
            status: 422,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } else {
        break; // Non-strict mode or no summary
      }
    }

    if (!summary.trim()) {
      return new Response(JSON.stringify({ 
        error: "Failed to generate summary",
        attempts,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`✅ Final summary generated - Length: ${summary.length}, Provider: ${providerUsed}, Attempts: ${attempts}`);

    return new Response(JSON.stringify({ 
      summary,
      metadata: {
        provider: providerUsed,
        attempts,
        questionsFound: questions.length,
        strictMode,
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: "Unexpected error", 
      details: String(error) 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

// Helper function to calculate validation score
function calculateValidationScore(metrics: {
  questionCoverage: number;
  mathFormatting: number;
  noAssumptions: number;
  ocrUsage: number;
}): number {
  return Math.round(
    metrics.questionCoverage * 40 + 
    metrics.mathFormatting * 25 + 
    metrics.noAssumptions * 25 + 
    metrics.ocrUsage * 10
  );
}
