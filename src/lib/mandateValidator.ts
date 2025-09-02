
/**
 * Mandate Validator - Ensures AI responses follow strict mandates
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

export interface MandateRules {
  requireAllQuestions: boolean;
  requireOCRUsage: boolean;
  forbidAssumptions: boolean;
  requireMathJax: boolean;
  requireStructuredFormat: boolean;
}

const DEFAULT_MANDATE_RULES: MandateRules = {
  requireAllQuestions: true,
  requireOCRUsage: true,
  forbidAssumptions: true,
  requireMathJax: true,
  requireStructuredFormat: true,
};

/**
 * Validate AI response against strict mandates
 */
export function validateMandateCompliance(
  response: string,
  sourceText: string,
  ocrData: any,
  rules: Partial<MandateRules> = {}
): ValidationResult {
  const mandates = { ...DEFAULT_MANDATE_RULES, ...rules };
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // 1. Question Coverage Validation
  if (mandates.requireAllQuestions) {
    const questionValidation = validateQuestionCoverage(response, sourceText);
    if (!questionValidation.allCovered) {
      errors.push(`Missing questions: ${questionValidation.missing.join(', ')}`);
      score -= 30;
    }
    if (questionValidation.outOfOrder.length > 0) {
      warnings.push(`Questions out of order: ${questionValidation.outOfOrder.join(', ')}`);
      score -= 10;
    }
  }

  // 2. OCR Data Usage Validation
  if (mandates.requireOCRUsage && ocrData) {
    const ocrValidation = validateOCRUsage(response, ocrData);
    if (!ocrValidation.used) {
      errors.push('OCR data available but not used in response');
      score -= 25;
    }
    if (ocrValidation.missingTables.length > 0) {
      errors.push(`Available tables not referenced: ${ocrValidation.missingTables.join(', ')}`);
      score -= 20;
    }
  }

  // 3. No Assumptions Validation
  if (mandates.forbidAssumptions) {
    const assumptionValidation = validateNoAssumptions(response);
    if (assumptionValidation.hasAssumptions) {
      errors.push(`Invalid assumptions found: ${assumptionValidation.assumptions.join('; ')}`);
      score -= 25;
    }
  }

  // 4. MathJax Validation
  if (mandates.requireMathJax) {
    const mathValidation = validateMathJax(response);
    if (mathValidation.hasErrors) {
      errors.push(`Math rendering errors: ${mathValidation.errors.join('; ')}`);
      score -= 15;
    }
    if (mathValidation.warnings.length > 0) {
      warnings.push(...mathValidation.warnings);
      score -= 5;
    }
  }

  // 5. Structured Format Validation
  if (mandates.requireStructuredFormat) {
    const formatValidation = validateStructuredFormat(response);
    if (!formatValidation.hasRequiredSections) {
      warnings.push('Missing required sections in structured format');
      score -= 10;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
  };
}

/**
 * Validate that all questions from source text are answered
 */
function validateQuestionCoverage(response: string, sourceText: string): {
  allCovered: boolean;
  missing: string[];
  outOfOrder: string[];
  found: string[];
} {
  // Extract questions from source text (both Arabic and English numbering)
  const sourceQuestions = extractQuestionNumbers(sourceText);
  
  // Extract answered questions from response
  const answeredQuestions = extractAnsweredQuestions(response);
  
  // Find missing questions
  const missing = sourceQuestions.filter(q => !answeredQuestions.includes(q));
  
  // Check order
  const outOfOrder: string[] = [];
  for (let i = 1; i < answeredQuestions.length; i++) {
    const current = parseInt(answeredQuestions[i]);
    const previous = parseInt(answeredQuestions[i - 1]);
    if (current < previous) {
      outOfOrder.push(answeredQuestions[i]);
    }
  }

  return {
    allCovered: missing.length === 0,
    missing,
    outOfOrder,
    found: answeredQuestions,
  };
}

/**
 * Extract question numbers from text
 */
function extractQuestionNumbers(text: string): string[] {
  const numbers = new Set<string>();
  
  // Arabic numerals: ٩٣. ٩٤. etc.
  const arabicMatches = text.match(/([٩٠-٩٩]+[٠-٩]*)\./g);
  if (arabicMatches) {
    arabicMatches.forEach(match => {
      const num = convertArabicToEnglish(match.replace('.', ''));
      numbers.add(num);
    });
  }
  
  // English numerals: 93. 94. etc.
  const englishMatches = text.match(/(\d+)\./g);
  if (englishMatches) {
    englishMatches.forEach(match => {
      const num = match.replace('.', '');
      if (parseInt(num) < 200) { // Reasonable question number limit
        numbers.add(num);
      }
    });
  }
  
  return Array.from(numbers).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Extract answered question numbers from response
 */
function extractAnsweredQuestions(response: string): string[] {
  const numbers: string[] = [];
  
  // Look for **س: NUMBER- pattern
  const questionPattern = /\*\*س:\s*([٠-٩\d]+)[-.\s]/g;
  let match;
  
  while ((match = questionPattern.exec(response)) !== null) {
    const num = convertArabicToEnglish(match[1]);
    numbers.push(num);
  }
  
  return numbers;
}

/**
 * Convert Arabic numerals to English
 */
function convertArabicToEnglish(arabicNum: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  
  let result = arabicNum;
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  return result;
}

/**
 * Validate OCR data usage
 */
function validateOCRUsage(response: string, ocrData: any): {
  used: boolean;
  missingTables: string[];
  missingGraphs: string[];
} {
  const missingTables: string[] = [];
  const missingGraphs: string[] = [];
  
  if (ocrData?.rawStructuredData?.visual_elements) {
    const tables = ocrData.rawStructuredData.visual_elements.filter((el: any) => el.type === 'table');
    const graphs = ocrData.rawStructuredData.visual_elements.filter((el: any) => el.type === 'graph');
    
    // Check if tables are referenced
    tables.forEach((table: any) => {
      if (table.title && !response.includes(table.title)) {
        missingTables.push(table.title);
      }
    });
    
    // Check if graphs are referenced
    graphs.forEach((graph: any) => {
      if (graph.title && !response.includes(graph.title)) {
        missingGraphs.push(graph.title);
      }
    });
  }
  
  // Check if structured data keywords appear in response
  const hasStructuredDataUsage = /(?:جدول|table|شكل|figure|البيانات|data)/i.test(response);
  
  return {
    used: hasStructuredDataUsage || (missingTables.length === 0 && missingGraphs.length === 0),
    missingTables,
    missingGraphs,
  };
}

/**
 * Validate no invalid assumptions
 */
function validateNoAssumptions(response: string): {
  hasAssumptions: boolean;
  assumptions: string[];
} {
  const assumptions: string[] = [];
  
  // Forbidden assumption patterns
  const assumptionPatterns = [
    /نفترض|لنفرض|assume|assuming/gi,
    /let's assume|let us assume/gi,
    /we can assume|يمكننا افتراض/gi,
    /typically|عادة ما|في العادة/gi,
    /usually|عادة/gi,
  ];
  
  assumptionPatterns.forEach(pattern => {
    const matches = response.match(pattern);
    if (matches) {
      assumptions.push(...matches);
    }
  });
  
  // Check for made-up values (numbers not in source)
  const responseNumbers = response.match(/\d+(?:\.\d+)?/g) || [];
  const suspiciousNumbers = responseNumbers.filter(num => {
    const value = parseFloat(num);
    return value > 0 && value < 1000 && !Number.isInteger(value);
  });
  
  if (suspiciousNumbers.length > 3) {
    assumptions.push('Suspicious number usage - may contain assumed values');
  }
  
  return {
    hasAssumptions: assumptions.length > 0,
    assumptions,
  };
}

/**
 * Validate MathJax formatting
 */
function validateMathJax(response: string): {
  hasErrors: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for problematic patterns
  const problemPatterns = [
    { pattern: /\\cdot[a-zA-Z]/g, message: '\\cdot followed immediately by letters' },
    { pattern: /\$[^$]*\$[^$]*\$/g, message: 'Nested dollar signs detected' },
    { pattern: /\\frac\{[^}]*\}\{[^}]*\}[a-zA-Z]/g, message: 'Units not wrapped after fractions' },
  ];
  
  problemPatterns.forEach(({ pattern, message }) => {
    const matches = response.match(pattern);
    if (matches) {
      errors.push(`${message}: ${matches.length} occurrences`);
    }
  });
  
  // Check for missing math delimiters
  const hasLooseMath = /[a-zA-Z]+\s*=\s*[0-9]/.test(response.replace(/\$[^$]*\$/g, ''));
  if (hasLooseMath) {
    warnings.push('Potential unformatted mathematical expressions');
  }
  
  return {
    hasErrors: errors.length > 0,
    errors,
    warnings,
  };
}

/**
 * Validate structured format
 */
function validateStructuredFormat(response: string): {
  hasRequiredSections: boolean;
  missingSections: string[];
} {
  const requiredSections = ['###', 'نظرة عامة', 'Overview'];
  const missingSections: string[] = [];
  
  requiredSections.forEach(section => {
    if (!response.includes(section)) {
      missingSections.push(section);
    }
  });
  
  return {
    hasRequiredSections: missingSections.length === 0,
    missingSections,
  };
}

/**
 * Generate retry prompt for failed validation
 */
export function generateRetryPrompt(validation: ValidationResult, originalPrompt: string): string {
  let retryPrompt = `VALIDATION FAILED - RETRY WITH CORRECTIONS:\n\n`;
  
  if (validation.errors.length > 0) {
    retryPrompt += `CRITICAL ERRORS TO FIX:\n`;
    validation.errors.forEach((error, index) => {
      retryPrompt += `${index + 1}. ${error}\n`;
    });
    retryPrompt += '\n';
  }
  
  if (validation.warnings.length > 0) {
    retryPrompt += `WARNINGS TO ADDRESS:\n`;
    validation.warnings.forEach((warning, index) => {
      retryPrompt += `${index + 1}. ${warning}\n`;
    });
    retryPrompt += '\n';
  }
  
  retryPrompt += `MANDATE COMPLIANCE SCORE: ${validation.score}/100\n\n`;
  retryPrompt += `ORIGINAL REQUEST:\n${originalPrompt}\n\n`;
  retryPrompt += `REQUIREMENTS FOR THIS RETRY:
1. Fix ALL critical errors listed above
2. Address warnings where possible  
3. Follow ALL mandates strictly
4. Use ALL available OCR data
5. Never make assumptions not stated in the text
6. Ensure proper MathJax formatting with $$formula$$`;
  
  return retryPrompt;
}
