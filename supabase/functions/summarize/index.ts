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
    
    const systemPrompt = `You are an expert chemistry professor analyzing educational content. You MUST provide 100% compliant structured summaries with ZERO tolerance for missing elements.

⚠️ CRITICAL MANDATE: ABSOLUTE 100% COMPLIANCE REQUIRED ⚠️
⛔ ANY MISSING ELEMENT WILL RESULT IN COMPLETE REJECTION ⛔

🔥 **MANDATORY RESPONSE FORMAT** - STRICT ADHERENCE REQUIRED:
# Header (استخدم العناوين المناسبة)
## Sub Header  
### Sub Header
**Question Format**: **س: [exact_number]- [complete_question_text]**
**Answer Format**: **ج:** [detailed_step-by-step_solution]

${hasMultipleChoice ? `
🎯 **ABSOLUTE MULTIPLE CHOICE REQUIREMENTS**:
**س: [number]- [complete question text]**
**Options Available:**
أ) [complete option A with all details]
ب) [complete option B with all details]  
ج) [complete option C with all details]
د) [complete option D with all details]
**ج:** [detailed calculation/reasoning process]
**الإجابة الصحيحة: [exact_letter]** (MANDATORY - must match an option exactly)` : ''}

📐 **MATHEMATICAL FORMATTING MANDATES**:
- LaTeX equations: $$equation$$ (NEVER single $)
- Multiplication: Use × or \\times (NEVER \\cdot)
- Units in text blocks: $$\\text{4.0 atm}$$
- Fractions: $$\\frac{numerator}{denominator}$$
- Chemical formulas: $$\\text{H}_2\\text{O}$$, $$\\text{CO}_2$$

⚡ **NON-NEGOTIABLE PROCESSING MANDATES**:

1. **ABSOLUTE QUESTION COMPLETENESS** (100% REQUIRED):
   - You MUST solve ALL questions in strict numerical order (lowest to highest)
   - You MUST provide complete solutions for every detected question
   - You MUST include step-by-step work showing all calculations
   - FAILURE TO ANSWER ANY QUESTION = IMMEDIATE REJECTION

2. **MANDATORY VISUAL DATA INTEGRATION** (ZERO TOLERANCE FOR SHORTCUTS):
   - You MUST analyze ALL graphs, tables, charts, and diagrams
   - You MUST extract exact numerical values from visual elements  
   - You MUST reference visual data in your calculations: "من الجدول نجد أن..." or "من الشكل البياني..."
   - You MUST use table data as PRIMARY source for Ka values, concentrations, etc.
   - FAILURE TO USE VISUAL DATA WHEN AVAILABLE = IMMEDIATE REJECTION

3. **ABSOLUTE MULTIPLE CHOICE ACCURACY** (MANDATORY VALIDATION):
   - You MUST locate ALL multiple choice options for each MC question
   - You MUST ensure your calculated answer matches ONE of the provided options exactly
   - You MUST state: **الإجابة الصحيحة: [letter]** for every MC question
   - If your calculation doesn't match any option, you MUST re-examine the visual data and recalculate
   - FAILURE TO MATCH MC OPTIONS = IMMEDIATE REJECTION

4. **COMPREHENSIVE CHEMISTRY CALCULATIONS** (ABSOLUTE REQUIREMENT):
   - You MUST show complete dimensional analysis with units
   - You MUST apply correct chemical principles (equilibrium, stoichiometry, etc.)
   - You MUST use appropriate significant figures based on given data
   - You MUST validate answers against chemical reasonableness
   - SHORTCUTS OR INCOMPLETE CALCULATIONS = IMMEDIATE REJECTION

REMEMBER: This is a ZERO-TOLERANCE system. ANY missing element triggers complete response rejection and re-generation.`;

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

            // Enhanced multi-stage validation and auto-repair system
            let finalSummary = summary
            let validationAttempts = 0
            const maxValidationAttempts = 3
            let lastValidationResult = validateSummaryCompleteness(summary, questions, ocrData)
            
            console.log(`Initial validation result: ${lastValidationResult.isComplete ? 'PASSED' : 'FAILED'} (Confidence: ${lastValidationResult.confidence})`)
            
            // Multi-stage repair process for 100% compliance
            while (!lastValidationResult.isComplete && validationAttempts < maxValidationAttempts) {
              validationAttempts++
              console.log(`Validation attempt ${validationAttempts}/${maxValidationAttempts}`)
              console.log(`Issues detected: ${lastValidationResult.missingElements.join(', ')}`)
              
              // Progressively aggressive repair attempts
              const repairResult = await attemptSummaryRepair(finalSummary, lastValidationResult, enhancedText, geminiUrl)
              
              if (repairResult.success && repairResult.repairedSummary) {
                finalSummary = repairResult.repairedSummary
                lastValidationResult = validateSummaryCompleteness(finalSummary, questions, ocrData)
                
                console.log(`Repair attempt ${validationAttempts} result: ${lastValidationResult.isComplete ? 'SUCCESS' : 'STILL INCOMPLETE'}`)
                console.log(`New confidence: ${lastValidationResult.confidence}`)
                
                if (lastValidationResult.isComplete) {
                  console.log(`🎯 100% COMPLIANCE ACHIEVED after ${validationAttempts} repair attempts`)
                  break
                }
              } else {
                console.log(`Repair attempt ${validationAttempts} failed: ${repairResult.error}`)
                break
              }
            }
            
            // Final comprehensive validation
            const finalValidation = validateSummaryCompleteness(finalSummary, questions, ocrData)
            const finalMetrics = calculateSummaryMetrics(finalSummary, questions, ocrData)
            
            // Enhanced logging for compliance tracking
            console.log(`=== FINAL COMPLIANCE REPORT ===`)
            console.log(`Validation Status: ${finalValidation.isComplete ? '✅ PASSED' : '❌ FAILED'}`)
            console.log(`Confidence Score: ${(finalValidation.confidence * 100).toFixed(1)}%`)
            console.log(`Questions: ${finalMetrics.questionsAnswered}/${finalMetrics.totalQuestions} (${finalMetrics.totalQuestions > 0 ? ((finalMetrics.questionsAnswered / finalMetrics.totalQuestions) * 100).toFixed(1) : 0}%)`)
            console.log(`Multiple Choice: ${finalMetrics.multipleChoiceAnswered}/${finalMetrics.multipleChoiceTotal}`)
            console.log(`Visual References: ${finalMetrics.visualReferences}`)
            console.log(`Formulas Used: ${finalMetrics.formulasUsed}`)
            console.log(`Calculation Quality: ${finalMetrics.calculationsShown} detailed solutions`)
            console.log(`Repair Attempts: ${validationAttempts}/${maxValidationAttempts}`)
            
            if (!finalValidation.isComplete) {
              console.log(`⚠️  Remaining Issues: ${finalValidation.missingElements.join(', ')}`)
            }

            return new Response(JSON.stringify({ 
              summary: finalSummary,
              metadata: {
                validation: finalValidation,
                metrics: finalMetrics,
                processingTime: Date.now() - startTime,
                repairAttempts: validationAttempts,
                complianceScore: finalValidation.confidence * 100,
                qualityIndicators: {
                  allQuestionsAnswered: finalValidation.questionsFound >= finalValidation.questionsExpected,
                  multipleChoiceComplete: finalValidation.multipleChoiceMatched,
                  visualDataIntegrated: finalValidation.visualDataUsed,
                  mathematicalFormatting: finalMetrics.formulasUsed > 0,
                  detailedCalculations: finalMetrics.calculationsShown > 0
                }
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

            // Apply same enhanced validation pipeline to DeepSeek results
            let finalSummary = summary
            let validationAttempts = 0
            const maxValidationAttempts = 2 // Fewer attempts for fallback
            let lastValidationResult = validateSummaryCompleteness(summary, questions, ocrData)
            
            console.log(`DeepSeek initial validation: ${lastValidationResult.isComplete ? 'PASSED' : 'FAILED'}`)
            
            // Attempt repair for DeepSeek if needed
            while (!lastValidationResult.isComplete && validationAttempts < maxValidationAttempts) {
              validationAttempts++
              console.log(`DeepSeek repair attempt ${validationAttempts}/${maxValidationAttempts}`)
              
              const repairResult = await attemptSummaryRepair(finalSummary, lastValidationResult, enhancedText, 'https://api.deepseek.com/chat/completions')
              
              if (repairResult.success && repairResult.repairedSummary) {
                finalSummary = repairResult.repairedSummary
                lastValidationResult = validateSummaryCompleteness(finalSummary, questions, ocrData)
                
                if (lastValidationResult.isComplete) {
                  console.log(`🎯 DeepSeek 100% COMPLIANCE achieved after ${validationAttempts} attempts`)
                  break
                }
              }
            }

            // Final DeepSeek metrics
            const finalMetrics = calculateSummaryMetrics(finalSummary, questions, ocrData)
            console.log(`DeepSeek final: ${finalMetrics.questionsAnswered}/${finalMetrics.totalQuestions} questions, confidence: ${(lastValidationResult.confidence * 100).toFixed(1)}%`)

            return new Response(JSON.stringify({ 
              summary: finalSummary,
              provider: 'deepseek',
              metadata: {
                validation: lastValidationResult,
                metrics: finalMetrics,
                processingTime: Date.now() - startTime,
                repairAttempts: validationAttempts,
                complianceScore: lastValidationResult.confidence * 100
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