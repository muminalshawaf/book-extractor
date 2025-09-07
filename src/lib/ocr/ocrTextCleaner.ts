// OCR Text Cleaning Utility - Improve OCR quality before summarization

export interface CleaningOptions {
  fixHyphenation: boolean;
  mergeFragmentedLines: boolean;
  normalizeNumerals: boolean;
  stripHeadersFooters: boolean;
  removeExcessWhitespace: boolean;
  detectLanguage?: 'ar' | 'en' | 'auto';
}

export interface CleaningResult {
  cleanedText: string;
  originalLength: number;
  cleanedLength: number;
  improvements: string[];
  confidence: number; // 0-1 based on cleaning success
}

// Arabic numeral to English numeral mapping
const ARABIC_TO_ENGLISH_NUMERALS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

// Common Arabic/English headers and footers to remove
const HEADER_FOOTER_PATTERNS = [
  /^(الفصل|Chapter)\s*\d+.*$/gim,
  /^(صفحة|Page)\s*\d+.*$/gim,
  /^\d+\s*$/gm, // Standalone page numbers
  /^.*وزارة التعليم.*$/gim,
  /^.*Ministry of Education.*$/gim,
  /^.*الطبعة.*\d+.*$/gim,
  /^.*Edition.*\d+.*$/gim,
  /^.*\d{4}هـ.*$/gm, // Hijri years
  /^.*\d{4}\s*(م|AD).*$/gm, // Gregorian years
];

// Patterns for fragmented lines that should be merged
const LINE_MERGE_PATTERNS = [
  // Arabic text that ends without punctuation and next line starts with continuation
  /([ا-ي])\s*\n\s*([ا-ي])/g,
  // English text fragments
  /([a-z])\s*\n\s*([a-z])/gi,
  // Mathematical expressions split across lines
  /([=+\-*/])\s*\n\s*([0-9ا-ي])/g,
];

// Common hyphenation patterns in Arabic OCR
const HYPHENATION_PATTERNS = [
  // Arabic words split by hyphens
  /([ا-ي])-\s*\n\s*([ا-ي])/g,
  // English words split by hyphens
  /([a-z])-\s*\n\s*([a-z])/gi,
  // Split mathematical terms
  /([0-9])-\s*\n\s*([0-9])/g,
];

function detectContentType(text: string): { 
  isContentPage: boolean; 
  pageType: 'content' | 'toc' | 'index' | 'cover' | 'unknown';
  confidence: number;
} {
  const lowerText = text.toLowerCase();
  const arabicText = text.replace(/[^\u0600-\u06FF]/g, '');
  
  // Table of contents indicators
  const tocIndicators = [
    'فهرس', 'المحتويات', 'contents', 'index', 'table of contents',
    /الفصل\s*\d+/g, /chapter\s*\d+/gi, /الوحدة\s*\d+/g, /unit\s*\d+/gi
  ];
  
  const isToc = tocIndicators.some(indicator => 
    typeof indicator === 'string' ? lowerText.includes(indicator) : indicator.test(text)
  );
  
  if (isToc) {
    return { isContentPage: false, pageType: 'toc', confidence: 0.9 };
  }
  
  // Cover page indicators
  const coverIndicators = [
    'وزارة التعليم', 'ministry of education', 'الطبعة', 'edition',
    'الصف', 'grade', 'الفصل الدراسي', 'semester'
  ];
  
  const isCover = coverIndicators.some(indicator => lowerText.includes(indicator)) &&
                  text.split('\n').length < 10; // Cover pages are usually short
  
  if (isCover) {
    return { isContentPage: false, pageType: 'cover', confidence: 0.8 };
  }
  
  // Content page indicators
  const hasSubstantialText = text.length > 100;
  const hasArabicContent = arabicText.length > 50;
  const hasSentences = (text.match(/[.!؟?]/g) || []).length > 2;
  const hasQuestions = (text.match(/\d+[.\-)\]]\s*[ا-ي]/g) || []).length > 0;
  
  const contentScore = [
    hasSubstantialText ? 0.3 : 0,
    hasArabicContent ? 0.3 : 0,
    hasSentences ? 0.2 : 0,
    hasQuestions ? 0.2 : 0
  ].reduce((a, b) => a + b, 0);
  
  if (contentScore > 0.6) {
    return { isContentPage: true, pageType: 'content', confidence: contentScore };
  }
  
  return { isContentPage: false, pageType: 'unknown', confidence: 0.3 };
}

function normalizeArabicNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (match) => ARABIC_TO_ENGLISH_NUMERALS[match] || match);
}

function fixHyphenation(text: string): string {
  let result = text;
  
  for (const pattern of HYPHENATION_PATTERNS) {
    result = result.replace(pattern, '$1$2');
  }
  
  return result;
}

function mergeFragmentedLines(text: string): string {
  let result = text;
  
  for (const pattern of LINE_MERGE_PATTERNS) {
    result = result.replace(pattern, '$1 $2');
  }
  
  return result;
}

function stripHeadersFooters(text: string): string {
  let result = text;
  
  for (const pattern of HEADER_FOOTER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  
  return result;
}

function removeExcessWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .replace(/\n\s*\n\s*\n+/g, '\n\n') // Multiple newlines to double newline max
    .replace(/^\s+|\s+$/gm, '') // Trim each line
    .trim();
}

export function cleanOcrText(
  text: string, 
  options: Partial<CleaningOptions> = {}
): CleaningResult {
  const opts: CleaningOptions = {
    fixHyphenation: true,
    mergeFragmentedLines: true,
    normalizeNumerals: true,
    stripHeadersFooters: true,
    removeExcessWhitespace: true,
    detectLanguage: 'auto',
    ...options
  };
  
  const originalLength = text.length;
  let cleanedText = text;
  const improvements: string[] = [];
  
  // Detect content type first
  const contentType = detectContentType(text);
  
  if (!contentType.isContentPage) {
    return {
      cleanedText: text,
      originalLength,
      cleanedLength: text.length,
      improvements: [`Detected ${contentType.pageType} page, minimal cleaning applied`],
      confidence: contentType.confidence
    };
  }
  
  // Apply cleaning steps
  if (opts.stripHeadersFooters) {
    const beforeLength = cleanedText.length;
    cleanedText = stripHeadersFooters(cleanedText);
    if (cleanedText.length < beforeLength) {
      improvements.push(`Removed ${beforeLength - cleanedText.length} chars of headers/footers`);
    }
  }
  
  if (opts.fixHyphenation) {
    const beforeHyphens = (cleanedText.match(/-\s*\n/g) || []).length;
    cleanedText = fixHyphenation(cleanedText);
    if (beforeHyphens > 0) {
      improvements.push(`Fixed ${beforeHyphens} hyphenation breaks`);
    }
  }
  
  if (opts.mergeFragmentedLines) {
    const beforeLines = cleanedText.split('\n').length;
    cleanedText = mergeFragmentedLines(cleanedText);
    const afterLines = cleanedText.split('\n').length;
    if (beforeLines > afterLines) {
      improvements.push(`Merged ${beforeLines - afterLines} fragmented lines`);
    }
  }
  
  if (opts.normalizeNumerals) {
    const arabicNumerals = (cleanedText.match(/[٠-٩]/g) || []).length;
    cleanedText = normalizeArabicNumerals(cleanedText);
    if (arabicNumerals > 0) {
      improvements.push(`Normalized ${arabicNumerals} Arabic numerals`);
    }
  }
  
  if (opts.removeExcessWhitespace) {
    const beforeWhitespace = (cleanedText.match(/\s+/g) || []).join('').length;
    cleanedText = removeExcessWhitespace(cleanedText);
    const afterWhitespace = (cleanedText.match(/\s+/g) || []).join('').length;
    if (beforeWhitespace > afterWhitespace) {
      improvements.push(`Cleaned ${beforeWhitespace - afterWhitespace} excess whitespace chars`);
    }
  }
  
  // Calculate confidence based on improvements made and content quality
  const improvementScore = Math.min(1, improvements.length / 3); // Max confidence from improvements
  const lengthScore = Math.min(1, cleanedText.length / 200); // Prefer substantial content
  const structureScore = Math.min(1, (cleanedText.match(/[.!؟?]/g) || []).length / 5); // Prefer structured text
  
  const confidence = (contentType.confidence + improvementScore + lengthScore + structureScore) / 4;
  
  return {
    cleanedText,
    originalLength,
    cleanedLength: cleanedText.length,
    improvements,
    confidence: Math.min(1, Math.max(0, confidence))
  };
}