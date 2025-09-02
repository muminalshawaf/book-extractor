// Enhanced validation and repair functions for 100% compliance

export interface ValidationResult {
  isComplete: boolean
  missingElements: string[]
  questionsFound: number
  questionsExpected: number
  multipleChoiceMatched: boolean
  visualDataUsed: boolean
  confidence: number
}

export interface RepairResult {
  success: boolean
  repairedSummary?: string
  error?: string
}

export interface SummaryMetrics {
  questionsAnswered: number
  totalQuestions: number
  multipleChoiceAnswered: number
  multipleChoiceTotal: number
  visualReferences: number
  formulasUsed: number
  calculationsShown: number
}

export function validateSummaryCompleteness(summary: string, questions: any[], ocrData: any): ValidationResult {
  const missing: string[] = []
  
  // Extract answered question numbers
  const answeredQuestions = []
  const questionPattern = /\*\*س:\s*(\d+)-/g
  let match
  while ((match = questionPattern.exec(summary)) !== null) {
    answeredQuestions.push(parseInt(match[1]))
  }
  
  // Check question completeness
  const expectedNumbers = questions.map(q => parseInt(convertArabicToEnglishNumber(q.number)))
  const missingQuestions = expectedNumbers.filter(num => !answeredQuestions.includes(num))
  
  if (missingQuestions.length > 0) {
    missing.push(`Missing questions: ${missingQuestions.join(', ')}`)
  }
  
  // Check multiple choice validation
  const mcQuestions = questions.filter(q => q.isMultipleChoice)
  let mcMatched = true
  if (mcQuestions.length > 0) {
    const mcAnswerPattern = /\*\*الإجابة الصحيحة:\s*[أابجد]\)/g
    const mcAnswersFound = (summary.match(mcAnswerPattern) || []).length
    if (mcAnswersFound < mcQuestions.length) {
      missing.push(`Missing MC answers: found ${mcAnswersFound}, expected ${mcQuestions.length}`)
      mcMatched = false
    }
  }
  
  // Check visual data usage
  let visualDataUsed = false
  if (ocrData?.rawStructuredData?.visual_elements?.length > 0) {
    const visualReferences = [
      /من الجدول/g, /من الشكل/g, /من الرسم البياني/g,
      /According to.*table/gi, /From.*figure/gi, /Using.*graph/gi,
      /Table \d+/gi, /Figure \d+/gi, /الجدول \d+/g, /الشكل \d+/g
    ]
    
    visualDataUsed = visualReferences.some(pattern => pattern.test(summary))
    if (!visualDataUsed) {
      missing.push('Visual data not referenced in calculations')
    }
  }
  
  const confidence = Math.max(0, 1 - (missing.length * 0.2))
  
  return {
    isComplete: missing.length === 0,
    missingElements: missing,
    questionsFound: answeredQuestions.length,
    questionsExpected: expectedNumbers.length,
    multipleChoiceMatched: mcMatched,
    visualDataUsed: visualDataUsed,
    confidence: confidence
  }
}

export async function attemptSummaryRepair(
  originalSummary: string, 
  validation: ValidationResult, 
  enhancedText: string, 
  geminiUrl: string
): Promise<RepairResult> {
  try {
    // Create targeted repair prompt
    const repairPrompt = `CRITICAL REPAIR TASK: The following summary is INCOMPLETE and must be fixed immediately.

MISSING ELEMENTS DETECTED:
${validation.missingElements.map(elem => `- ${elem}`).join('\n')}

REPAIR INSTRUCTIONS:
1. Add the missing questions with complete solutions
2. Ensure all multiple choice questions have final answers in format: **الإجابة الصحيحة: أ)**
3. Reference visual data from tables/graphs in your calculations
4. Show complete step-by-step work for all calculations

ORIGINAL INCOMPLETE SUMMARY:
${originalSummary}

COMPLETE SOURCE TEXT WITH VISUAL DATA:
${enhancedText.slice(0, 8000)}

PROVIDE THE COMPLETE CORRECTED SUMMARY WITH ALL MISSING ELEMENTS ADDED:`

    const repairPayload = {
      contents: [{
        parts: [{ text: repairPrompt }]
      }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 8192,
        topP: 0.1
      }
    }

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repairPayload)
    })

    if (response.ok) {
      const data = await response.json()
      if (data.candidates && data.candidates.length > 0) {
        const repairedSummary = data.candidates[0].content.parts[0].text
        console.log(`Repair attempt completed, length: ${repairedSummary.length}`)
        
        return {
          success: true,
          repairedSummary: repairedSummary
        }
      }
    }
    
    return {
      success: false,
      error: 'Repair API call failed'
    }
    
  } catch (error) {
    console.error('Summary repair error:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export function calculateSummaryMetrics(summary: string, questions: any[], ocrData: any): SummaryMetrics {
  // Count answered questions
  const questionPattern = /\*\*س:\s*(\d+)-/g
  const answeredQuestions = (summary.match(questionPattern) || []).length
  
  // Count multiple choice answers
  const mcAnswerPattern = /\*\*الإجابة الصحيحة:\s*[أابجد]\)/g
  const mcAnswered = (summary.match(mcAnswerPattern) || []).length
  const mcTotal = questions.filter(q => q.isMultipleChoice).length
  
  // Count visual references
  const visualPatterns = [
    /من الجدول/g, /من الشكل/g, /من الرسم البياني/g,
    /Table \d+/gi, /Figure \d+/gi, /الجدول \d+/g, /الشكل \d+/g
  ]
  const visualReferences = visualPatterns.reduce(
    (count, pattern) => count + (summary.match(pattern) || []).length, 0
  )
  
  // Count formulas
  const formulaPattern = /\$\$[\s\S]*?\$\$/g
  const formulasUsed = (summary.match(formulaPattern) || []).length
  
  // Count calculation steps
  const calculationPattern = /\*\*ج:\*\*[\s\S]*?(?=\*\*س:|$)/g
  const calculationsShown = (summary.match(calculationPattern) || []).length
  
  return {
    questionsAnswered: answeredQuestions,
    totalQuestions: questions.length,
    multipleChoiceAnswered: mcAnswered,
    multipleChoiceTotal: mcTotal,
    visualReferences: visualReferences,
    formulasUsed: formulasUsed,
    calculationsShown: calculationsShown
  }
}

function convertArabicToEnglishNumber(arabicNum: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩'
  const englishDigits = '0123456789'
  
  let result = arabicNum
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i])
  }
  return result
}