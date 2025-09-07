// Processing Utilities for Improved Batch Processing

export interface ProcessingConfig {
  enableOcrCleaning: boolean;
  enableQualityGate: boolean;
  enableJitteredDelay: boolean;
  minDelayMs: number;
  maxDelayMs: number;
  alternativeOcrMode: boolean;
  ocrModeThreshold: number; // Switch to alternative OCR if confidence below this
  skipNonContentPages: boolean;
  richLogging: boolean;
}

export interface ProcessingStats {
  totalPages: number;
  contentPages: number;
  nonContentPages: number;
  ocrSuccessRate: number;
  summarySuccessRate: number;
  repairAttempts: number;
  repairSuccesses: number;
  averageOcrConfidence: number;
  averageSummaryConfidence: number;
  totalProcessingTime: number;
}

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  enableOcrCleaning: true,
  enableQualityGate: true,
  enableJitteredDelay: true,
  minDelayMs: 800,
  maxDelayMs: 1500,
  alternativeOcrMode: true,
  ocrModeThreshold: 0.6,
  skipNonContentPages: true,
  richLogging: true
};

/**
 * Add jittered delay to prevent API rate limiting and reduce server load
 */
export async function addJitteredDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Detect if a page is likely to be non-content (TOC, cover, etc.)
 */
export function detectNonContentPage(text: string): {
  isNonContent: boolean;
  pageType: string;
  confidence: number;
  reason: string;
} {
  const lowerText = text.toLowerCase();
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Too short to be meaningful content
  if (text.length < 50) {
    return {
      isNonContent: true,
      pageType: 'empty',
      confidence: 0.9,
      reason: 'Text too short (< 50 characters)'
    };
  }
  
  // Table of contents patterns
  const tocPatterns = [
    /فهرس|المحتويات|contents|table of contents/i,
    /الفصل\s*\d+.*\d+/g, // Chapter X ... page Y
    /الوحدة\s*\d+.*\d+/g, // Unit X ... page Y
  ];
  
  const tocMatches = tocPatterns.reduce((count, pattern) => {
    return count + (text.match(pattern) || []).length;
  }, 0);
  
  if (tocMatches > 2 || (tocMatches > 0 && lines.length < 15)) {
    return {
      isNonContent: true,
      pageType: 'toc',
      confidence: 0.8 + (tocMatches * 0.05),
      reason: `${tocMatches} TOC pattern matches detected`
    };
  }
  
  // Cover page patterns
  const coverPatterns = [
    /وزارة التعليم|ministry of education/i,
    /المملكة العربية السعودية|kingdom of saudi arabia/i,
    /الطبعة.*\d+|edition.*\d+/i,
    /\d{4}\s*هـ|\d{4}\s*AD/
  ];
  
  const coverMatches = coverPatterns.reduce((count, pattern) => {
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
  
  if (coverMatches >= 2 && lines.length < 10) {
    return {
      isNonContent: true,
      pageType: 'cover',
      confidence: 0.7 + (coverMatches * 0.1),
      reason: `${coverMatches} cover page indicators found`
    };
  }
  
  // Index/glossary patterns
  const indexPatterns = [
    /فهرس الموضوعات|فهرس المصطلحات|index|glossary/i,
    /أ\s*-\s*.*\d+/g, // Alphabetical entries with page numbers
    /ب\s*-\s*.*\d+/g,
    /ج\s*-\s*.*\d+/g
  ];
  
  const indexMatches = indexPatterns.reduce((count, pattern) => {
    return count + (text.match(pattern) || []).length;
  }, 0);
  
  if (indexMatches > 3) {
    return {
      isNonContent: true,
      pageType: 'index',
      confidence: 0.75,
      reason: `${indexMatches} index pattern matches found`
    };
  }
  
  // References/bibliography patterns
  if ((lowerText.includes('مراجع') || lowerText.includes('references')) && 
      (text.match(/\d{4}/g) || []).length > 3) {
    return {
      isNonContent: true,
      pageType: 'references',
      confidence: 0.7,
      reason: 'References section detected'
    };
  }
  
  // Content page indicators (positive signals)
  const contentIndicators = {
    hasQuestions: (text.match(/\d+[.\-)\]]\s*[ا-ي]/g) || []).length > 0,
    hasExplanations: /شرح|تفسير|explanation|definition/i.test(text),
    hasExamples: /مثال|example/i.test(text),
    hasSubstantialArabic: (text.replace(/[^\u0600-\u06FF]/g, '').length > 100),
    hasStructuredContent: (text.match(/[.!؟?]/g) || []).length > 3
  };
  
  const contentScore = Object.values(contentIndicators).filter(Boolean).length;
  
  if (contentScore >= 3) {
    return {
      isNonContent: false,
      pageType: 'content',
      confidence: 0.6 + (contentScore * 0.1),
      reason: `${contentScore} content indicators found`
    };
  }
  
  // Default: assume content if not clearly non-content
  return {
    isNonContent: false,
    pageType: 'unknown',
    confidence: 0.5,
    reason: 'No strong indicators either way, defaulting to content'
  };
}

/**
 * Generate processing statistics from accumulated data
 */
export function generateProcessingStats(
  processedPages: Array<{
    pageNumber: number;
    isContent: boolean;
    ocrSuccess: boolean;
    ocrConfidence: number;
    summarySuccess: boolean;
    summaryConfidence: number;
    repairAttempted: boolean;
    repairSuccessful: boolean;
    processingTimeMs: number;
  }>
): ProcessingStats {
  const contentPages = processedPages.filter(p => p.isContent);
  const ocrSuccesses = processedPages.filter(p => p.ocrSuccess);
  const summarySuccesses = processedPages.filter(p => p.summarySuccess);
  const repairAttempts = processedPages.filter(p => p.repairAttempted);
  const repairSuccesses = processedPages.filter(p => p.repairSuccessful);
  
  const avgOcrConfidence = ocrSuccesses.length > 0 
    ? ocrSuccesses.reduce((sum, p) => sum + p.ocrConfidence, 0) / ocrSuccesses.length
    : 0;
    
  const avgSummaryConfidence = summarySuccesses.length > 0
    ? summarySuccesses.reduce((sum, p) => sum + p.summaryConfidence, 0) / summarySuccesses.length
    : 0;
    
  const totalTime = processedPages.length > 0 
    ? processedPages.reduce((sum, p) => sum + Math.max(0, p.processingTimeMs), 0)
    : 0;
  
  return {
    totalPages: processedPages.length,
    contentPages: contentPages.length,
    nonContentPages: processedPages.length - contentPages.length,
    ocrSuccessRate: processedPages.length > 0 ? ocrSuccesses.length / processedPages.length : 0,
    summarySuccessRate: contentPages.length > 0 ? summarySuccesses.length / contentPages.length : 0,
    repairAttempts: repairAttempts.length,
    repairSuccesses: repairSuccesses.length,
    averageOcrConfidence: avgOcrConfidence,
    averageSummaryConfidence: avgSummaryConfidence,
    totalProcessingTime: totalTime
  };
}

/**
 * Format processing statistics for display
 */
export function formatProcessingStats(stats: ProcessingStats): string {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };
  
  return [
    `📊 Processing Summary:`,
    `• Total pages: ${stats.totalPages} (${stats.contentPages} content, ${stats.nonContentPages} non-content)`,
    `• OCR success rate: ${formatPercent(stats.ocrSuccessRate)} (avg confidence: ${formatPercent(stats.averageOcrConfidence)})`,
    `• Summary success rate: ${formatPercent(stats.summarySuccessRate)} (avg confidence: ${formatPercent(stats.averageSummaryConfidence)})`,
    `• Repair attempts: ${stats.repairAttempts} (${stats.repairSuccesses} successful)`,
    `• Total processing time: ${formatTime(stats.totalProcessingTime)}`
  ].join('\n');
}