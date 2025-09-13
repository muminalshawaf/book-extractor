// Shared API client utilities for both summarize functions
// Handles Gemini and DeepSeek API calls with unified error handling

export interface APIResponse {
  success: boolean;
  content: string;
  finishReason?: string;
  error?: string;
}

export interface ContinuationResult {
  success: boolean;
  content: string;
  finalContent: string;
  attempts: number;
}

// Gemini API client
export async function callGeminiAPI(
  apiKey: string, 
  prompt: string, 
  maxTokens: number = 16000
): Promise<APIResponse> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens,
        }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const finishReason = data.candidates?.[0]?.finishReason;
      
      return {
        success: content.trim().length > 0,
        content,
        finishReason,
        error: content.trim().length === 0 ? "Empty content returned" : undefined
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        content: "",
        error: `Gemini API error: ${response.status} - ${errorText}`
      };
    }
  } catch (error) {
    return {
      success: false,
      content: "",
      error: `Gemini API exception: ${error.message}`
    };
  }
}

// DeepSeek API client
export async function callDeepSeekAPI(
  apiKey: string, 
  systemPrompt: string, 
  userPrompt: string, 
  maxTokens: number = 12000
): Promise<APIResponse> {
  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
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
        temperature: 0,
        top_p: 0.9,
        max_tokens: maxTokens,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      const finishReason = data.choices?.[0]?.finish_reason;
      
      return {
        success: content.trim().length > 0,
        content,
        finishReason,
        error: content.trim().length === 0 ? "Empty content returned" : undefined
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        content: "",
        error: `DeepSeek API error: ${response.status} - ${errorText}`
      };
    }
  } catch (error) {
    return {
      success: false,
      content: "",
      error: `DeepSeek API exception: ${error.message}`
    };
  }
}

// DeepSeek streaming API client
export async function callDeepSeekStreamingAPI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2000
): Promise<Response> {
  return await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      stream: true,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: maxTokens,
    }),
  });
}

// Auto-continuation logic for handling truncated responses
export async function handleAutoContinuation(
  initialContent: string,
  questions: Array<any>,
  enhancedText: string,
  systemPrompt: string,
  provider: 'gemini' | 'deepseek',
  apiKey: string,
  convertArabicToEnglishNumber: (num: string) => string
): Promise<ContinuationResult> {
  const originalQuestionCount = questions.length;
  let currentContent = initialContent;
  let attempt = 0;
  const maxAttempts = 4;

  // Detect what questions are currently answered
  const getAnsweredQuestions = (content: string): Set<string> => {
    const answeredQuestionNumbers = new Set<string>();
    const questionPatterns = [
      /\*\*س:\s*(\d+)[.-]/g,  // **س: 45- or **س: 45.
      /\*\*س:\s*([٠-٩]+)[.-]/g  // **س: ٤٥- (Arabic numerals)
    ];
    
    for (const pattern of questionPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const num = convertArabicToEnglishNumber(match[1]);
        answeredQuestionNumbers.add(num);
      }
    }
    
    return answeredQuestionNumbers;
  };

  let answeredQuestions = getAnsweredQuestions(currentContent);
  let missingNumbers = questions
    .map(q => convertArabicToEnglishNumber(q.number))
    .filter(num => !answeredQuestions.has(num));

  console.log(`Initial questions status: ${answeredQuestions.size}/${originalQuestionCount} answered, missing: ${missingNumbers.join(', ')}`);

  while (missingNumbers.length > 0 && attempt < maxAttempts) {
    attempt++;
    console.log(`🔄 Auto-continuation attempt ${attempt}/${maxAttempts} for questions: ${missingNumbers.join(', ')}`);
    
    const completionPrompt = `COMPLETE THE MISSING QUESTIONS - Continuation ${attempt}/${maxAttempts}

Previous summary is incomplete. Missing these question numbers: ${missingNumbers.join(', ')}

REQUIREMENTS:
1. When solving questions, solve them in sequence from the least to the most. Start from question ${Math.min(...missingNumbers.map(n => parseInt(n)))}, then continue sequentially.
2. Ensure that you answer all the questions despite token limits. Be concise on topics but complete on question solutions.
- Process ONLY the missing questions: ${missingNumbers.join(', ')}
- Use EXACT formatting: **س: [number]- [question text]** and **ج:** [complete answer]
- Use $$formula$$ for math, × for multiplication
- Provide complete step-by-step solutions
- Do NOT repeat questions already answered

Missing questions from OCR text:
${enhancedText.split('\n').filter(line => 
  missingNumbers.some(num => line.includes(`${num}.`) || line.includes(`${num}-`) || line.includes(`${num} `))
).join('\n')}

If you cannot fit all questions in one response, prioritize the lowest numbered questions first.`;

    try {
      let response: APIResponse;
      
      if (provider === 'gemini') {
        response = await callGeminiAPI(apiKey, systemPrompt + "\n\n" + completionPrompt, 8000);
      } else {
        response = await callDeepSeekAPI(apiKey, systemPrompt, completionPrompt, 8000);
      }

      if (response.success && response.content.trim()) {
        currentContent += "\n\n" + response.content;
        
        // Re-check what questions are now answered
        const newAnsweredQuestions = getAnsweredQuestions(currentContent);
        const stillMissing = questions
          .map(q => convertArabicToEnglishNumber(q.number))
          .filter(num => !newAnsweredQuestions.has(num));
        
        const answeredThisRound = missingNumbers.filter(num => newAnsweredQuestions.has(num));
        
        console.log(`✅ Attempt ${attempt} completed ${answeredThisRound.length} questions: ${answeredThisRound.join(', ')}`);
        console.log(`Still missing: ${stillMissing.join(', ')}`);
        
        // Update for next iteration
        missingNumbers = stillMissing;
        
        if (stillMissing.length === 0) {
          console.log('🎉 All questions completed successfully!');
          break;
        }
      } else {
        console.log(`⚠️ Attempt ${attempt} failed: ${response.error}`);
        break;
      }
    } catch (error) {
      console.error(`Auto-continuation attempt ${attempt} failed:`, error);
      break;
    }
  }

  const finalQuestionCount = getAnsweredQuestions(currentContent).size;
  console.log(`✅ Auto-continuation finished after ${attempt} attempts. Final question count: ${finalQuestionCount}/${originalQuestionCount}`);
  
  if (missingNumbers.length > 0) {
    console.log(`⚠️ Still missing ${missingNumbers.length} questions after all attempts: ${missingNumbers.join(', ')}`);
  }

  return {
    success: finalQuestionCount >= originalQuestionCount,
    content: currentContent,
    finalContent: currentContent,
    attempts: attempt
  };
}

// Emergency regeneration with extreme strict compliance
export async function handleEmergencyRegeneration(
  originalSummary: string,
  compliance: { isValid: boolean; missing: string[]; score: number },
  pageType: string,
  questions: Array<any>,
  enhancedText: string,
  systemPrompt: string,
  emergencyPrompt: string,
  provider: 'gemini' | 'deepseek',
  apiKey: string,
  validateSummaryCompliance: (summary: string, pageType: string, hasQuestions: boolean) => { isValid: boolean; missing: string[]; score: number }
): Promise<string> {
  if (compliance.isValid || compliance.score >= 80) {
    return originalSummary; // No need for emergency regeneration
  }

  console.log(`🚨 COMPLIANCE FAILURE - Regenerating with extreme strict prompt. Missing: ${compliance.missing.join(', ')}`);
  
  try {
    let response: APIResponse;
    
    if (provider === 'gemini') {
      response = await callGeminiAPI(apiKey, systemPrompt + "\n\n" + emergencyPrompt, 16000);
    } else {
      response = await callDeepSeekAPI(apiKey, systemPrompt, emergencyPrompt, 12000);
    }

    if (response.success && response.content.trim()) {
      const newCompliance = validateSummaryCompliance(response.content, pageType, questions.length > 0);
      console.log(`📊 Emergency Regeneration Score: ${newCompliance.score}%`);
      
      if (newCompliance.score > compliance.score) {
        console.log('✅ Emergency regeneration improved compliance');
        return response.content;
      }
    }
  } catch (error) {
    console.error('Emergency regeneration failed:', error);
  }
  
  return originalSummary; // Return original if emergency failed
}