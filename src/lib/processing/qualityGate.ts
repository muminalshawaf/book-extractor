// Quality Gate with Repair Mechanism for Summary Processing

import { calculateSummaryConfidence, type ConfidenceMeta, type KeywordAnalysis, type ConceptAnalysis, analyzeKeywords, analyzeConcepts } from '@/lib/confidence';
import { callFunction } from '@/lib/functionsClient';

export interface QualityGateOptions {
  minOcrConfidence: number; // 0-1, minimum OCR confidence to proceed
  minSummaryConfidence: number; // 0-1, minimum summary confidence to accept
  enableRepair: boolean; // whether to attempt repair for low-confidence summaries
  repairThreshold: number; // 0-1, threshold below which repair is attempted
  maxRepairAttempts: number; // maximum number of repair attempts
}

export interface QualityResult {
  passed: boolean;
  ocrConfidence: number;
  summaryConfidence: number;
  confidenceMeta: ConfidenceMeta;
  needsRepair: boolean;
  repairAttempted: boolean;
  repairSuccessful?: boolean;
  repairedSummary?: string;
  repairedConfidence?: number;
  logs: string[];
  networkError?: boolean; // Flag for network-related failures
}

interface RepairContext {
  originalText: string;
  originalSummary: string;
  confidenceMeta: ConfidenceMeta;
  keywordAnalysis: KeywordAnalysis;
  conceptAnalysis?: ConceptAnalysis;
  ocrData?: any;
  pageNumber?: number;
  bookTitle?: string;
  language?: string;
}

const DEFAULT_OPTIONS: QualityGateOptions = {
  minOcrConfidence: 0.3, // Very lenient OCR threshold
  minSummaryConfidence: 0.6, // Moderate summary quality threshold
  enableRepair: true,
  repairThreshold: 0.7, // Repair summaries below 70% confidence
  maxRepairAttempts: 1 // One repair attempt to avoid API cost spiral
};

function generateRepairPrompt(context: RepairContext): string {
  const { originalText, originalSummary, confidenceMeta, keywordAnalysis, conceptAnalysis, ocrData, pageNumber, bookTitle, language } = context;
  
  // Analyze what's missing or problematic
  const issues = [];
  if (confidenceMeta.coverage < 0.6) issues.push('خطف المحتوى الأساسي من النص (coverage too low)');
  if (confidenceMeta.lengthFit < 0.7) issues.push('طول الملخص غير مناسب (length issues)');
  if (confidenceMeta.structure < 0.6) issues.push('بنية الملخص تحتاج تحسين (structure needs improvement)');
  if (confidenceMeta.repetitionPenalty < 0.8) issues.push('تكرار مفرط في المحتوى (too much repetition)');
  if (confidenceMeta.conceptOverlap < 0.5 && conceptAnalysis) issues.push('مفاهيم أساسية مفقودة (missing key concepts)');
  
  const lang = language || 'ar';
  const isArabic = lang === 'ar';
  
  // Build missing content guidance
  const missingKeywords = keywordAnalysis.missingKeywords.slice(0, 10);
  const missingConcepts = conceptAnalysis?.missingConcepts.slice(0, 5) || [];
  
  let contentGuidance = '';
  if (missingKeywords.length > 0) {
    contentGuidance += `\n\n**مصطلحات مفقودة يجب تضمينها (Missing Keywords to Include):**\n${missingKeywords.join(', ')}`;
  }
  if (missingConcepts.length > 0) {
    contentGuidance += `\n\n**مفاهيم مفقودة يجب شرحها (Missing Concepts to Explain):**\n${missingConcepts.join(', ')}`;
  }

  return `You are an expert Arabic chemistry professor. The following summary has quality issues that need immediate repair.

**IDENTIFIED ISSUES:**
${issues.join('\n- ')}

**COVERAGE ANALYSIS:**
- Keyword coverage: ${(confidenceMeta.coverage * 100).toFixed(1)}% (target: >60%)
- Concept coverage: ${(confidenceMeta.conceptOverlap * 100).toFixed(1)}% (target: >50%)
- Length fitness: ${(confidenceMeta.lengthFit * 100).toFixed(1)}% (target: >70%)
- Structure quality: ${(confidenceMeta.structure * 100).toFixed(1)}% (target: >60%)
- Content uniqueness: ${(confidenceMeta.repetitionPenalty * 100).toFixed(1)}% (target: >80%)

${contentGuidance}

**REPAIR INSTRUCTIONS:**
1. **MANDATORY COVERAGE IMPROVEMENT**: Include MORE terms and concepts from the original OCR text, especially: ${missingKeywords.slice(0, 5).join(', ')}
2. **MANDATORY CONCEPT INTEGRATION**: Explain these missing concepts: ${missingConcepts.slice(0, 3).join(', ')}
3. **MANDATORY COMPLETENESS**: Answer ALL questions found in the OCR text - NO EXCEPTIONS
4. **MANDATORY STRUCTURE**: Use clear headers (##, ###) and bullet points for organization
5. **MANDATORY PRECISION**: All chemistry formulas, calculations, and facts must be accurate
6. **MANDATORY INTEGRATION**: If visual elements exist (graphs, tables), use their data actively
7. **PROHIBITED**: Do not add disclaimers about "insufficient data" - use all available information
8. **PROHIBITED**: Do not skip or summarize questions - provide complete step-by-step solutions

**FOCUS AREAS FOR IMPROVEMENT:**
${confidenceMeta.coverage < 0.6 ? '- **CRITICAL**: Increase keyword coverage by including more OCR terms\n' : ''}${confidenceMeta.conceptOverlap < 0.5 ? '- **CRITICAL**: Add missing concept explanations\n' : ''}${confidenceMeta.structure < 0.6 ? '- **IMPORTANT**: Improve structure with clear headers and organization\n' : ''}${confidenceMeta.repetitionPenalty < 0.8 ? '- **IMPORTANT**: Eliminate repetitive content\n' : ''}

**VISUAL ELEMENTS CONTEXT:**
${ocrData?.rawStructuredData?.visual_elements ? 
  JSON.stringify(ocrData.rawStructuredData.visual_elements, null, 2) : 
  'No visual elements detected'}

**ORIGINAL OCR TEXT:**
${originalText.substring(0, 2000)}${originalText.length > 2000 ? '...' : ''}

**CURRENT SUMMARY (TO BE IMPROVED):**
${originalSummary}

**OUTPUT REQUIREMENTS:**
- Respond ONLY with the improved summary in markdown format
- NO explanations, NO meta-commentary, NO justifications
- Start directly with the improved content
- Ensure the improved summary addresses ALL identified issues above`;
}

export async function runQualityGate(
  ocrText: string,
  summaryMd: string,
  ocrConfidence: number,
  context: Omit<RepairContext, 'originalSummary' | 'confidenceMeta' | 'keywordAnalysis' | 'conceptAnalysis'>,
  options: Partial<QualityGateOptions> = {}
): Promise<QualityResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logs: string[] = [];
  
  console.log('🛡️ Quality Gate: Starting enhanced analysis...');
  logs.push('Starting enhanced quality gate analysis with keyword and concept analysis');
  
  // Calculate initial confidence with enhanced analysis
  const { score: summaryConfidence, meta: confidenceMeta, keywordAnalysis, conceptAnalysis } = calculateSummaryConfidence(
    ocrText,
    summaryMd,
    ocrConfidence,
    context.language === 'ar',
    {
      topK: 25, // Analyze more keywords
      enableStemming: true,
      enableSynonyms: true,
      enableConcepts: true
    }
  );
  
  console.log(`🛡️ Quality Gate: Enhanced scores - OCR: ${(ocrConfidence * 100).toFixed(1)}%, Summary: ${(summaryConfidence * 100).toFixed(1)}%, Concepts: ${(confidenceMeta.conceptOverlap * 100).toFixed(1)}%`);
  logs.push(`Enhanced quality scores: OCR ${(ocrConfidence * 100).toFixed(1)}%, Summary ${(summaryConfidence * 100).toFixed(1)}%, Concept overlap ${(confidenceMeta.conceptOverlap * 100).toFixed(1)}%`);
  logs.push(`Keyword analysis: ${keywordAnalysis.commonKeywords.length}/${keywordAnalysis.ocrKeywords.size} keywords matched, ${keywordAnalysis.missingKeywords.length} missing`);
  if (conceptAnalysis) {
    logs.push(`Concept analysis: ${conceptAnalysis.extractedConcepts.length} concepts found, ${conceptAnalysis.missingConcepts.length} missing`);
  }
  
  // Check if OCR quality is too low to proceed
  if (ocrConfidence < opts.minOcrConfidence) {
    logs.push(`OCR confidence ${(ocrConfidence * 100).toFixed(1)}% below threshold ${(opts.minOcrConfidence * 100).toFixed(1)}%`);
    return {
      passed: false,
      ocrConfidence,
      summaryConfidence,
      confidenceMeta,
      needsRepair: false,
      repairAttempted: false,
      logs
    };
  }
  
  // Check if summary meets minimum quality
  if (summaryConfidence >= opts.minSummaryConfidence) {
    logs.push(`Summary quality ${(summaryConfidence * 100).toFixed(1)}% meets threshold ${(opts.minSummaryConfidence * 100).toFixed(1)}%`);
    return {
      passed: true,
      ocrConfidence,
      summaryConfidence,
      confidenceMeta,
      needsRepair: false,
      repairAttempted: false,
      logs
    };
  }
  
  // Summary quality is below threshold
  const needsRepair = opts.enableRepair && summaryConfidence < opts.repairThreshold;
  
  if (!needsRepair) {
    logs.push(`Summary quality ${(summaryConfidence * 100).toFixed(1)}% below threshold but repair disabled`);
    return {
      passed: false,
      ocrConfidence,
      summaryConfidence,
      confidenceMeta,
      needsRepair: false,
      repairAttempted: false,
      logs
    };
  }
  
  // Attempt repair
  logs.push(`Attempting repair for summary with ${(summaryConfidence * 100).toFixed(1)}% confidence`);
  
  try {
    const repairContext: RepairContext = {
      originalText: context.originalText,
      originalSummary: summaryMd,
      confidenceMeta,
      keywordAnalysis,
      conceptAnalysis,
      ocrData: context.ocrData,
      pageNumber: context.pageNumber,
      bookTitle: context.bookTitle,
      language: context.language
    };
    
    const repairPrompt = generateRepairPrompt(repairContext);
    
    // Use the same summarization function but with repair prompt
    const repairResult = await callFunction('summarize', {
      text: repairPrompt,
      lang: context.language,
      page: context.pageNumber,
      title: context.bookTitle,
      ocrData: context.ocrData,
      isRepair: true // Signal this is a repair attempt
    }, { timeout: 180000, retries: 1 });
    
    const repairedSummary = repairResult.summary || '';
    
    if (!repairedSummary || repairedSummary.length < 50) {
      logs.push('Repair failed: empty or too short result');
      return {
        passed: false,
        ocrConfidence,
        summaryConfidence,
        confidenceMeta,
        needsRepair: true,
        repairAttempted: true,
        repairSuccessful: false,
        logs
      };
    }
    
    // Calculate confidence of repaired summary
    const { score: repairedConfidence } = calculateSummaryConfidence(
      ocrText,
      repairedSummary,
      ocrConfidence,
      context.language === 'ar',
      {
        topK: 25,
        enableStemming: true,
        enableSynonyms: true,
        enableConcepts: true
      }
    );
    
    logs.push(`Repair completed: ${(repairedConfidence * 100).toFixed(1)}% confidence (was ${(summaryConfidence * 100).toFixed(1)}%)`);
    
    const repairSuccessful = repairedConfidence > summaryConfidence + 0.1; // Require meaningful improvement
    
    return {
      passed: repairedConfidence >= opts.minSummaryConfidence,
      ocrConfidence,
      summaryConfidence,
      confidenceMeta,
      needsRepair: true,
      repairAttempted: true,
      repairSuccessful,
      repairedSummary: repairSuccessful ? repairedSummary : undefined,
      repairedConfidence: repairSuccessful ? repairedConfidence : undefined,
      logs
    };
    
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const contextError = error?.context?.value?.message || error?.value?.context?.value?.message || '';
    const fullErrorInfo = `${errorMessage} ${contextError}`.toLowerCase();
    
    logs.push(`Repair failed with error: ${errorMessage}`);
    
    // For network failures, we should still allow processing to continue
    // Check both the main error and nested context errors (Supabase structure)
    if (fullErrorInfo.includes('failed to send a request') || 
        fullErrorInfo.includes('failed to fetch') ||
        fullErrorInfo.includes('network') ||
        fullErrorInfo.includes('timeout') ||
        fullErrorInfo.includes('functionsfetcherror')) {
      logs.push('Network error detected - allowing processing to continue with original summary');
      return {
        passed: summaryConfidence >= opts.minSummaryConfidence * 0.8, // Lower bar for network failures
        ocrConfidence,
        summaryConfidence,
        confidenceMeta,
        needsRepair: true,
        repairAttempted: true,
        repairSuccessful: false,
        logs,
        networkError: true
      };
    }
    
    return {
      passed: false,
      ocrConfidence,
      summaryConfidence,
      confidenceMeta,
      needsRepair: true,
      repairAttempted: true,
      repairSuccessful: false,
      logs
    };
  }
}