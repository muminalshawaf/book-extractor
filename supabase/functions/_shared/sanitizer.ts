// Anti-hallucination content sanitizer
// Removes ungrounded sections from summaries to ensure content is grounded in OCR

import { MANDATORY_SECTIONS, detectHasFormulasInOCR, detectHasExamplesInOCR } from './templates.ts';

export interface SanitizationResult {
  sanitizedContent: string;
  wasSanitized: boolean;
  removedSections: string[];
  violations: string[];
}

export function sanitizeSummary(
  summary: string, 
  ocrText: string,
  violations?: string[]
): SanitizationResult {
  if (!summary || !ocrText) {
    return {
      sanitizedContent: summary || '',
      wasSanitized: false,
      removedSections: [],
      violations: violations || []
    };
  }

  let sanitizedContent = summary;
  const removedSections: string[] = [];
  const detectedViolations = violations || [];
  
  // Detect OCR capabilities
  const hasFormulasOCR = detectHasFormulasInOCR(ocrText);
  const hasExamplesOCR = detectHasExamplesInOCR(ocrText);
  
  console.log('Sanitizer OCR analysis:', { hasFormulasOCR, hasExamplesOCR });
  
  // Remove formulas section if not grounded in OCR
  if (!hasFormulasOCR || violations?.includes('FORMULAS_NOT_IN_OCR')) {
    const formulasSectionRegex = new RegExp(
      `${escapeRegExp(MANDATORY_SECTIONS.FORMULAS_EQUATIONS)}[\\s\\S]*?(?=##|$)`,
      'g'
    );
    
    if (formulasSectionRegex.test(sanitizedContent)) {
      sanitizedContent = sanitizedContent.replace(formulasSectionRegex, '').trim();
      removedSections.push('الصيغ والمعادلات');
      console.log('Sanitizer: Removed ungrounded formulas section');
    }
  }
  
  // Remove applications section if not grounded in OCR
  if (!hasExamplesOCR || violations?.includes('APPLICATIONS_NOT_IN_OCR')) {
    const applicationsRegex = new RegExp(
      `${escapeRegExp(MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES)}[\\s\\S]*?(?=##|$)`,
      'g'
    );
    
    if (applicationsRegex.test(sanitizedContent)) {
      sanitizedContent = sanitizedContent.replace(applicationsRegex, '').trim();
      removedSections.push('التطبيقات والأمثلة');
      console.log('Sanitizer: Removed ungrounded applications section');
    }
  }
  
  // Clean up any double newlines
  sanitizedContent = sanitizedContent.replace(/\n{3,}/g, '\n\n').trim();
  
  const wasSanitized = removedSections.length > 0;
  
  console.log('Sanitization result:', {
    wasSanitized,
    removedSections,
    originalLength: summary.length,
    sanitizedLength: sanitizedContent.length
  });
  
  return {
    sanitizedContent,
    wasSanitized,
    removedSections,
    violations: detectedViolations
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractViolationsFromError(errorMessage: string): string[] {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(errorMessage);
    if (parsed.violations && Array.isArray(parsed.violations)) {
      return parsed.violations;
    }
  } catch {
    // If not JSON, look for violation patterns in text
    const violations: string[] = [];
    if (errorMessage.includes('FORMULAS_NOT_IN_OCR')) {
      violations.push('FORMULAS_NOT_IN_OCR');
    }
    if (errorMessage.includes('APPLICATIONS_NOT_IN_OCR')) {
      violations.push('APPLICATIONS_NOT_IN_OCR');
    }
    return violations;
  }
  
  return [];
}