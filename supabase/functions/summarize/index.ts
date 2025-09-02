import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateSummaryCompleteness, attemptSummaryRepair, calculateSummaryMetrics, ValidationResult, RepairResult, SummaryMetrics } from './validators.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced question parsing function with MC detection
function parseQuestions(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
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
          fullMatch: match[0],
          isMultipleChoice: isMultipleChoiceSection
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

  const startTime = Date.now()
  
  try {
    console.log('Enhanced Summarize function started with validation pipeline');
    
    const { text, lang = "ar", page, title, ocrData = null } = await req.json();
    console.log(`Request body received: { text: ${text ? `${text.length} chars` : 'null'}, lang: ${lang}, page: ${page}, title: ${title} }`);
    
    // Log model usage priority
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    console.log('Available models:');
    console.log(`- Gemini 1.5 Pro: ${GOOGLE_API_KEY ? 'AVAILABLE (primary)' : 'UNAVAILABLE'}`);
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

    // Enhanced text with visual context and chunking for dense pages
    const enhancedText = text + visualElementsText
    const isVeryDense = enhancedText.length > 15000
    
    if (isVeryDense) {
      console.log(`Dense page detected (${enhancedText.length} chars), implementing chunking strategy`)
    }

    // Create optimized prompt for question processing with enhanced detection
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice)
    console.log(`Multiple choice detected: ${hasMultipleChoice}, Processing ${questions.length} total questions`)
    
    const systemPrompt = `You are an expert chemistry professor. Your task is to analyze educational content and provide structured summaries following a specific format.

FORMAT REQUIREMENTS:
# Header
## Sub Header  
### Sub Header
Use tables when necessary
- Question format: **س: [number]- [exact question text]**
- Answer format: **ج:** [complete step-by-step solution]
${hasMultipleChoice ? `
- MULTIPLE CHOICE FORMAT: 
  * **س: [number]- [question text]**
  * List answer choices if present: أ) [choice A] ب) [choice B] ج) [choice C] د) [choice D]
  * **ج:** [reasoning/calculation] **الإجابة الصحيحة: [letter]**` : ''}
- Use LaTeX for formulas: $$formula$$ 
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**

⚠️ ABSOLUTE COMPLIANCE MANDATE: 100% INSTRUCTION ADHERENCE REQUIRED ⚠️
⛔ NON-COMPLIANCE WILL RESULT IN COMPLETE RESPONSE REJECTION ⛔

CRITICAL QUESTION SOLVING MANDATES - NON-NEGOTIABLE:
1. **SEQUENTIAL ORDER MANDATE**: You MUST solve questions in strict numerical sequence.
2. **COMPLETE ALL QUESTIONS MANDATE**: You MUST answer every single question found. NO EXCEPTIONS.
3. **VISUAL DATA INTEGRATION MANDATE**: You MUST use all graph, table, and visual data in calculations.
4. **MULTIPLE CHOICE VALIDATION MANDATE**: Your answers MUST match provided options exactly.
5. **STEP-BY-STEP MANDATE**: Each question must have complete, logical solutions.

ENHANCED PROCESSING:
- MANDATORY visual element analysis and data integration  
- ABSOLUTE multiple choice answer matching
- REQUIRED chemistry calculation verification
- AUTOMATIC completeness validation`;

    // Try Gemini 1.5 Pro first with enhanced configuration
    if (googleApiKey) {
      console.log('Attempting with Gemini 1.5 Pro (enhanced validation)...')
      
      // Enhanced generation config for deterministic results
      const geminiPayload = {
        contents: [{
          parts: [{ text: `${systemPrompt}\n\n${enhancedText}` }]
        }],
        generationConfig: {
          temperature: 0.0, // Fully deterministic
          maxOutputTokens: 8192,
          topP: 0.1, // Low for consistency
          candidateCount: 1
        }
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${googleApiKey}`
      
      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload)
        })

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json()
          
          if (geminiData.candidates && geminiData.candidates.length > 0) {
            let summary = geminiData.candidates[0].content.parts[0].text
            console.log(`Gemini response length: ${summary.length} characters`)

            // Enhanced validation and auto-repair system
            const validationResult = validateSummaryCompleteness(summary, questions, ocrData)
            console.log(`Validation result: ${validationResult.isComplete ? 'PASSED' : 'FAILED'}`)
            
            if (!validationResult.isComplete && validationResult.missingElements.length > 0) {
              console.log(`Missing elements detected: ${validationResult.missingElements.join(', ')}`)
              
              // Auto-repair attempt
              const repairResult = await attemptSummaryRepair(summary, validationResult, enhancedText, geminiUrl)
              if (repairResult.success) {
                summary = repairResult.repairedSummary || summary
                console.log(`Auto-repair successful, final length: ${summary.length}`)
              } else {
                console.log('Auto-repair failed, returning original summary with warnings')
              }
            }

            // Final validation metrics
            const finalMetrics = calculateSummaryMetrics(summary, questions, ocrData)
            console.log(`Final metrics: Questions ${finalMetrics.questionsAnswered}/${finalMetrics.totalQuestions}, MC ${finalMetrics.multipleChoiceAnswered}/${finalMetrics.multipleChoiceTotal}, Visual references: ${finalMetrics.visualReferences}`)

            return new Response(JSON.stringify({ 
              summary: summary,
              metadata: {
                validation: validationResult,
                metrics: finalMetrics,
                processingTime: Date.now() - startTime
              }
            }), {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            })
          }
        }
      } catch (geminiError) {
        console.error('Gemini API error:', geminiError)
      }
    }

    // Enhanced fallback to DeepSeek Chat with validation
    if (deepSeekApiKey) {
      console.log('Falling back to DeepSeek Chat (enhanced with validation)...')
      
      try {
        const deepSeekPayload = {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: enhancedText }
          ],
          temperature: 0.0, // Deterministic for consistency
          max_tokens: 8192
        }

        const deepSeekResponse = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepSeekApiKey}`
          },
          body: JSON.stringify(deepSeekPayload)
        })

        if (deepSeekResponse.ok) {
          const deepSeekData = await deepSeekResponse.json()
          if (deepSeekData.choices && deepSeekData.choices.length > 0) {
            let summary = deepSeekData.choices[0].message.content
            console.log(`DeepSeek response length: ${summary.length} characters`)

            // Apply same validation pipeline to DeepSeek results
            const validationResult = validateSummaryCompleteness(summary, questions, ocrData)
            console.log(`DeepSeek validation result: ${validationResult.isComplete ? 'PASSED' : 'FAILED'}`)

            // Calculate final metrics
            const finalMetrics = calculateSummaryMetrics(summary, questions, ocrData)
            console.log(`DeepSeek final metrics: Questions ${finalMetrics.questionsAnswered}/${finalMetrics.totalQuestions}`)

            return new Response(JSON.stringify({ 
              summary: summary,
              provider: 'deepseek',
              metadata: {
                validation: validationResult,
                metrics: finalMetrics,
                processingTime: Date.now() - startTime
              }
            }), {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            })
          }
        }
      } catch (deepSeekError) {
        console.error('DeepSeek API error:', deepSeekError)
      }
    }

    return new Response(JSON.stringify({ 
      error: "No API response received from any provider" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })

  } catch (error) {
    console.error('Error in summarize function:', error)
    return new Response(JSON.stringify({ 
      error: "Internal server error" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })
  }
})