// Quality Gate with Repair Mechanism for Summary Processing

import { calculateSummaryConfidence, type ConfidenceMeta } from '@/lib/confidence';
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

export interface RepairContext {
  originalText: string;
  originalSummary: string;
  ocrData?: any;
  pageNumber: number;
  bookTitle: string;
  language: string;
  confidenceMeta: ConfidenceMeta;
}

const DEFAULT_OPTIONS: QualityGateOptions = {
  minOcrConfidence: 0.3, // Very lenient OCR threshold
  minSummaryConfidence: 0.4, // Lower threshold for acceptance
  enableRepair: false, // Disabled for better performance
  repairThreshold: 0.35, // Lower threshold for triggering repair
  maxRepairAttempts: 0 // No repair attempts for better performance
};

function generateRepairPrompt(context: RepairContext): string {
  const { originalText, originalSummary, confidenceMeta, pageNumber, bookTitle, language } = context;
  
  const issues: string[] = [];
  
  if (confidenceMeta.coverage < 0.6) {
    issues.push("المحتوى المستخرج لا يغطي النص الأصلي بشكل كافٍ");
  }
  
  if (confidenceMeta.lengthFit < 0.5) {
    if (originalSummary.split(/\s+/).length < 50) {
      issues.push("الملخص قصير جداً ولا يشمل التفاصيل المهمة");
    } else {
      issues.push("الملخص طويل جداً ويحتاج إلى تركيز أكثر");
    }
  }
  
  if (confidenceMeta.structure < 0.5) {
    issues.push("تنسيق الملخص يحتاج إلى تحسين (عناوين، نقاط، ترقيم)");
  }
  
  if (confidenceMeta.repetitionPenalty < 0.7) {
    issues.push("يوجد تكرار مفرط في المحتوى");
  }
  
  const issueDescription = issues.length > 0 
    ? `\n\nالمشاكل المحددة في الملخص الحالي:\n${issues.map(issue => `- ${issue}`).join('\n')}`
    : '';

  if (language === 'ar') {
    return `أنت محرر خبير للمحتوى التعليمي. المهمة: تحسين ملخص صفحة من كتاب مدرسي.

معلومات الصفحة:
- الكتاب: ${bookTitle}
- رقم الصفحة: ${pageNumber}
- جودة النص الأصلي: ${(confidenceMeta.ocrQuality * 100).toFixed(1)}%
- تقييم التغطية: ${(confidenceMeta.coverage * 100).toFixed(1)}%${issueDescription}

النص الأصلي المستخرج:
${originalText}

الملخص الحالي (يحتاج تحسين):
${originalSummary}

المطلوب: إنتاج ملخص محسّن يلتزم بالمعايير التالية:
1. تغطية شاملة للمفاهيم الرئيسية من النص الأصلي
2. طول مناسب (150-300 كلمة)
3. تنسيق واضح مع عناوين فرعية ونقاط
4. استخدام المصطلحات العلمية الصحيحة
5. تجنب التكرار
6. شرح الأمثلة والتمارين بوضوح
7. استخراج وشرح جميع الأسئلة المرقمة

تنسيق الإخراج:
- استخدم العناوين (##) للمواضيع الرئيسية
- استخدم النقاط (-) للتفاصيل
- اكتب الأسئلة في قسم منفصل
- استخدم **النص العريض** للمصطلحات المهمة

الملخص المحسّن:`;
  } else {
    return `You are an expert educational content editor. Task: Improve a textbook page summary.

Page Information:
- Book: ${bookTitle}
- Page: ${pageNumber}  
- Original text quality: ${(confidenceMeta.ocrQuality * 100).toFixed(1)}%
- Coverage assessment: ${(confidenceMeta.coverage * 100).toFixed(1)}%${issueDescription}

Original extracted text:
${originalText}

Current summary (needs improvement):
${originalSummary}

Required: Produce an improved summary that meets these standards:
1. Comprehensive coverage of key concepts from the original text
2. Appropriate length (150-300 words)
3. Clear formatting with subheadings and bullet points
4. Correct scientific terminology usage
5. Avoid repetition
6. Clear explanation of examples and exercises
7. Extract and explain all numbered questions

Output format:
- Use headings (##) for main topics
- Use bullet points (-) for details
- Write questions in a separate section
- Use **bold text** for important terms

Improved summary:`;
  }
}

export async function runQualityGate(
  ocrText: string,
  summaryMd: string,
  ocrConfidence: number,
  context: Omit<RepairContext, 'originalSummary' | 'confidenceMeta'>,
  options: Partial<QualityGateOptions> = {}
): Promise<QualityResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logs: string[] = [];
  
  // Calculate initial confidence
  const { score: summaryConfidence, meta: confidenceMeta } = calculateSummaryConfidence(
    ocrText,
    summaryMd,
    ocrConfidence,
    context.language === 'ar'
  );
  
  logs.push(`Initial confidence: OCR ${(ocrConfidence * 100).toFixed(1)}%, Summary ${(summaryConfidence * 100).toFixed(1)}%`);
  logs.push(`Confidence breakdown: Coverage ${(confidenceMeta.coverage * 100).toFixed(1)}%, Length ${(confidenceMeta.lengthFit * 100).toFixed(1)}%, Structure ${(confidenceMeta.structure * 100).toFixed(1)}%`);
  
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
      ...context,
      originalSummary: summaryMd,
      confidenceMeta
    };
    
    const repairPrompt = generateRepairPrompt(repairContext);
    logs.push(`Generated repair prompt (${repairPrompt.length} chars)`);
    
    // Use shorter timeout to prevent hanging
    const repairResult = await Promise.race([
      callFunction('summarize', {
        text: repairPrompt,
        lang: context.language,
        page: context.pageNumber,
        title: context.bookTitle,
        ocrData: context.ocrData,
        isRepair: true // Signal this is a repair attempt
      }, { timeout: 20000, retries: 0 }), // Much shorter timeout for better performance
      
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Repair timeout after 20 seconds')), 20000)
      )
    ]);
    
    logs.push(`Repair call completed, checking result...`);
    const repairedSummary = repairResult.summary || '';
    
    if (!repairedSummary || repairedSummary.length < 50) {
      logs.push(`Repair failed: empty or too short result (${repairedSummary.length} chars)`);
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
      context.language === 'ar'
    );
    
    logs.push(`Repair completed: ${(repairedConfidence * 100).toFixed(1)}% confidence (was ${(summaryConfidence * 100).toFixed(1)}%)`);
    
    const repairSuccessful = repairedConfidence > summaryConfidence + 0.05; // More lenient improvement threshold
    
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
    
    // Handle timeout specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('Repair timeout')) {
      logs.push('Repair timed out - proceeding with original summary');
      return {
        passed: summaryConfidence >= opts.minSummaryConfidence * 0.9, // Slightly lower bar for timeouts
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
    
    // For network failures, we should still allow processing to continue
    // Check both the main error and nested context errors (Supabase structure)
    if (fullErrorInfo.includes('failed to send a request') || 
        fullErrorInfo.includes('failed to fetch') ||
        fullErrorInfo.includes('network') ||
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