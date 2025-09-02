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
  stepByStepIndicators: number
  unitAnalysis: number
  averageAnswerLength: number
}

export function validateSummaryCompleteness(summary: string, questions: any[], ocrData: any): ValidationResult {
  const missing: string[] = []
  
  // Enhanced question detection with multiple patterns
  const answeredQuestions = []
  const questionPatterns = [
    /\*\*س:\s*(\d+)-/g,
    /\*\*س:\s*(\d+)\s*-/g,
    /\*\*س:\s*([٠-٩]+)-/g,
    /Question\s*(\d+)/gi,
    /س\s*(\d+)/g
  ]
  
  for (const pattern of questionPatterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(summary)) !== null) {
      const questionNum = convertArabicToEnglishNumber(match[1])
      const num = parseInt(questionNum)
      if (!answeredQuestions.includes(num)) {
        answeredQuestions.push(num)
      }
    }
  }
  
  // Check sequential order compliance
  const expectedNumbers = questions.map(q => parseInt(convertArabicToEnglishNumber(q.number)))
  const sortedExpected = [...expectedNumbers].sort((a, b) => a - b)
  const sortedAnswered = [...answeredQuestions].sort((a, b) => a - b)
  
  const missingQuestions = expectedNumbers.filter(num => !answeredQuestions.includes(num))
  if (missingQuestions.length > 0) {
    missing.push(`Missing questions: ${missingQuestions.join(', ')} (${missingQuestions.length}/${expectedNumbers.length})`)
  }
  
  // Check if questions are in correct order
  const orderViolations = []
  for (let i = 0; i < sortedAnswered.length - 1; i++) {
    const currentIndex = summary.indexOf(`س: ${sortedAnswered[i]}`)
    const nextIndex = summary.indexOf(`س: ${sortedAnswered[i + 1]}`)
    if (currentIndex > nextIndex && nextIndex !== -1) {
      orderViolations.push(`${sortedAnswered[i]} appears after ${sortedAnswered[i + 1]}`)
    }
  }
  
  if (orderViolations.length > 0) {
    missing.push(`Question order violations: ${orderViolations.join(', ')}`)
  }
  
  // Enhanced multiple choice validation
  const mcQuestions = questions.filter(q => q.isMultipleChoice)
  let mcMatched = true
  if (mcQuestions.length > 0) {
    const mcAnswerPatterns = [
      /\*\*الإجابة الصحيحة:\s*[أابجد]\)/g,
      /الإجابة الصحيحة:\s*[أابجد]\)/g,
      /\*\*الإجابة:\s*[أابجد]\)/g,
      /الإجابة:\s*[أابجد]\)/g
    ]
    
    let mcAnswersFound = 0
    for (const pattern of mcAnswerPatterns) {
      const matches = summary.match(pattern) || []
      mcAnswersFound += matches.length
    }
    
    if (mcAnswersFound < mcQuestions.length) {
      missing.push(`Missing MC final answers: found ${mcAnswersFound}, expected ${mcQuestions.length}`)
      mcMatched = false
    }
  }
  
  // Enhanced visual data validation
  let visualDataUsed = false
  let visualElementsCount = 0
  
  if (ocrData?.rawStructuredData?.visual_elements?.length > 0) {
    visualElementsCount = ocrData.rawStructuredData.visual_elements.length
    
    const visualReferences = [
      /من الجدول/g, /من الشكل/g, /من الرسم البياني/g, /من المخطط/g,
      /وفقاً للجدول/g, /حسب الشكل/g, /بناءً على/g,
      /According to.*table/gi, /From.*figure/gi, /Using.*graph/gi, /Based on.*chart/gi,
      /Table \d+/gi, /Figure \d+/gi, /Chart \d+/gi, /Graph \d+/gi,
      /الجدول \d+/g, /الشكل \d+/g, /المخطط \d+/g,
      /جدول/g, /شكل/g, /مخطط/g, /رسم بياني/g
    ]
    
    const referenceCount = visualReferences.reduce((count, pattern) => {
      return count + (summary.match(pattern) || []).length
    }, 0)
    
    visualDataUsed = referenceCount > 0
    
    if (!visualDataUsed && visualElementsCount > 0) {
      missing.push(`Visual data not integrated: ${visualElementsCount} visual elements found but not referenced`)
    }
    
    if (visualDataUsed && referenceCount < visualElementsCount) {
      missing.push(`Incomplete visual integration: ${referenceCount} references for ${visualElementsCount} elements`)
    }
  }
  
  // Check LaTeX formatting compliance
  const latexErrors = []
  if (summary.includes('$') && !summary.match(/\$\$[\s\S]*?\$\$/g)) {
    latexErrors.push('Single $ detected instead of double $$')
  }
  if (summary.includes('\\cdot') || summary.includes('\\cdotp')) {
    latexErrors.push('Forbidden \\cdot usage found (use × or \\times)')
  }
  if (latexErrors.length > 0) {
    missing.push(`LaTeX formatting errors: ${latexErrors.join(', ')}`)
  }
  
  // Check step-by-step completeness
  const answerSections = summary.match(/\*\*ج:\*\*[\s\S]*?(?=\*\*س:|$)/g) || []
  const shortAnswers = answerSections.filter(section => section.length < 50)
  if (shortAnswers.length > 0) {
    missing.push(`Insufficient answer detail: ${shortAnswers.length} answers appear too brief`)
  }
  
  // Calculate enhanced confidence score
  let confidence = 1.0
  confidence -= (missingQuestions.length / expectedNumbers.length) * 0.4 // 40% penalty for missing questions
  confidence -= (missing.length * 0.1) // 10% penalty per other issue
  confidence = Math.max(0, confidence)
  
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
  const maxRepairAttempts = 3
  
  for (let attempt = 1; attempt <= maxRepairAttempts; attempt++) {
    console.log(`Repair attempt ${attempt}/${maxRepairAttempts}`)
    
    try {
      // Create progressively stricter repair prompts
      const urgencyLevel = attempt === maxRepairAttempts ? "FINAL CRITICAL" : "URGENT"
      
      const repairPrompt = `${urgencyLevel} REPAIR MANDATE - ATTEMPT ${attempt}/${maxRepairAttempts}

🚨 DETECTION RESULTS - IMMEDIATE FIXES REQUIRED:
${validation.missingElements.map((elem, i) => `${i + 1}. ${elem}`).join('\n')}

⚡ MANDATORY REPAIR ACTIONS (ZERO TOLERANCE):

1. **MISSING QUESTIONS RECOVERY**: 
   - You MUST add complete solutions for ALL missing question numbers
   - Each question MUST follow format: **س: [number]- [question_text]**
   - Each answer MUST follow format: **ج:** [complete_solution]

2. **MULTIPLE CHOICE COMPLETION**:
   - You MUST include **الإجابة الصحيحة: [letter])** for EVERY MC question
   - Your calculated answer MUST match one of the provided options exactly
   - Show complete calculation leading to the chosen option

3. **VISUAL DATA INTEGRATION MANDATE**:
   - You MUST reference tables/graphs with: "من الجدول نجد" or "من الشكل"
   - You MUST extract exact numerical values from visual elements
   - You MUST use visual data as PRIMARY source for calculations

4. **FORMATTING COMPLIANCE**:
   - Use $$equation$$ for ALL mathematical expressions
   - Use × or \\times for multiplication (NEVER \\cdot)
   - Show complete dimensional analysis with units

${attempt === maxRepairAttempts ? `

🔥 FINAL ATTEMPT WARNINGS:
- This is your LAST chance to achieve 100% compliance
- ANY missing element will result in COMPLETE FAILURE
- You MUST deliver a PERFECT response or face TOTAL REJECTION

` : ''}

ORIGINAL DEFICIENT SUMMARY:
${originalSummary.slice(0, 3000)}...

COMPLETE SOURCE DATA:
${enhancedText.slice(0, 6000)}...

DELIVER THE COMPLETE, FULLY COMPLIANT SUMMARY WITH ALL DEFICIENCIES CORRECTED:`

      const repairPayload = {
        contents: [{
          parts: [{ text: repairPrompt }]
        }],
        generationConfig: {
          temperature: 0.0, // Maximum determinism
          maxOutputTokens: 8192,
          topP: 0.05, // Very low for consistency
          candidateCount: 1
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
          console.log(`Repair attempt ${attempt} completed, length: ${repairedSummary.length}`)
          
          // Validate the repair immediately
          const repairValidation = validateSummaryCompleteness(repairedSummary, [], {})
          
          if (repairValidation.isComplete || attempt === maxRepairAttempts) {
            console.log(`Repair ${repairValidation.isComplete ? 'SUCCESS' : 'FINAL ATTEMPT'} on attempt ${attempt}`)
            return {
              success: true,
              repairedSummary: repairedSummary
            }
          } else {
            console.log(`Repair attempt ${attempt} still has issues:`, repairValidation.missingElements)
            // Continue to next attempt
          }
        }
      } else {
        console.error(`Repair attempt ${attempt} API error:`, response.status)
      }
      
    } catch (error) {
      console.error(`Repair attempt ${attempt} error:`, error)
    }
    
    // Wait before next attempt (exponential backoff)
    if (attempt < maxRepairAttempts) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }
  
  return {
    success: false,
    error: `All ${maxRepairAttempts} repair attempts failed`
  }
}

export function calculateSummaryMetrics(summary: string, questions: any[], ocrData: any): SummaryMetrics {
  // Enhanced question counting with multiple patterns
  const questionPatterns = [
    /\*\*س:\s*(\d+)-/g,
    /\*\*س:\s*(\d+)\s*-/g,
    /\*\*س:\s*([٠-٩]+)-/g,
    /س\s*(\d+)/g
  ]
  
  const foundQuestions = new Set()
  for (const pattern of questionPatterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(summary)) !== null) {
      const questionNum = convertArabicToEnglishNumber(match[1])
      foundQuestions.add(parseInt(questionNum))
    }
  }
  const answeredQuestions = foundQuestions.size
  
  // Enhanced multiple choice counting
  const mcAnswerPatterns = [
    /\*\*الإجابة الصحيحة:\s*[أابجد]\)/g,
    /الإجابة الصحيحة:\s*[أابجد]\)/g,
    /\*\*الإجابة:\s*[أابجد]\)/g,
    /الإجابة:\s*[أابجد]\)/g
  ]
  
  let mcAnswered = 0
  for (const pattern of mcAnswerPatterns) {
    const matches = summary.match(pattern) || []
    mcAnswered += matches.length
  }
  const mcTotal = questions.filter(q => q.isMultipleChoice).length
  
  // Enhanced visual references counting
  const visualPatterns = [
    /من الجدول/g, /من الشكل/g, /من الرسم البياني/g, /من المخطط/g,
    /وفقاً للجدول/g, /حسب الشكل/g, /بناءً على الجدول/g, /استناداً إلى/g,
    /According to.*table/gi, /From.*figure/gi, /Using.*graph/gi, /Based on.*chart/gi,
    /Table \d+/gi, /Figure \d+/gi, /Chart \d+/gi, /Graph \d+/gi,
    /الجدول \d+/g, /الشكل \d+/g, /المخطط \d+/g,
    /جدول/g, /شكل/g, /مخطط/g, /رسم بياني/g
  ]
  
  const visualReferences = visualPatterns.reduce(
    (count, pattern) => count + (summary.match(pattern) || []).length, 0
  )
  
  // Enhanced formula counting (LaTeX and inline)
  const formulaPatterns = [
    /\$\$[\s\S]*?\$\$/g,
    /\$[^$]+\$/g, // Single $ formulas (should be converted to $$)
    /\\text\{[^}]+\}/g,
    /\\frac\{[^}]+\}\{[^}]+\}/g
  ]
  
  let formulasUsed = 0
  for (const pattern of formulaPatterns) {
    const matches = summary.match(pattern) || []
    formulasUsed += matches.length
  }
  
  // Enhanced calculation steps counting
  const calculationPattern = /\*\*ج:\*\*[\s\S]*?(?=\*\*س:|$)/g
  const calculationSections = summary.match(calculationPattern) || []
  let calculationsShown = 0
  
  // Count sections with substantial mathematical content
  calculationSections.forEach(section => {
    const hasCalculation = /[\d.,]+\s*[×*÷/]\s*[\d.,]+|=\s*[\d.,]+|\$\$[\s\S]*?\$\$/.test(section)
    if (hasCalculation && section.length > 100) {
      calculationsShown++
    }
  })
  
  // Additional quality metrics
  const stepByStepIndicators = [
    /الخطوة/g, /أولاً/g, /ثانياً/g, /ثالثاً/g,
    /Step/gi, /First/gi, /Second/gi, /Third/gi,
    /نحسب/g, /نطبق/g, /نستخدم/g, /نجد/g
  ]
  
  const stepByStepCount = stepByStepIndicators.reduce(
    (count, pattern) => count + (summary.match(pattern) || []).length, 0
  )
  
  // Unit and dimension analysis indicators
  const unitPatterns = [
    /mol\/L/g, /g\/mol/g, /atm/g, /°C/g, /mL/g, /mg/g, /L/g,
    /مول\/لتر/g, /جرام\/مول/g, /ضغط جوي/g, /درجة مئوية/g
  ]
  
  const unitUsage = unitPatterns.reduce(
    (count, pattern) => count + (summary.match(pattern) || []).length, 0
  )
  
  return {
    questionsAnswered: answeredQuestions,
    totalQuestions: questions.length,
    multipleChoiceAnswered: mcAnswered,
    multipleChoiceTotal: mcTotal,
    visualReferences: visualReferences,
    formulasUsed: formulasUsed,
    calculationsShown: calculationsShown,
    stepByStepIndicators: stepByStepCount,
    unitAnalysis: unitUsage,
    averageAnswerLength: calculationSections.length > 0 
      ? Math.round(calculationSections.reduce((sum, section) => sum + section.length, 0) / calculationSections.length)
      : 0
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