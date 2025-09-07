// Enhanced confidence scoring with semantic analysis and concept matching
// Factors: coverage (OCR vs summary keywords), concept overlap, length fit, structure, repetition penalty, OCR quality

export type ConfidenceMeta = {
  coverage: number;
  conceptOverlap: number;
  lengthFit: number;
  structure: number;
  repetitionPenalty: number; // already inverted (1 - repetition)
  ocrQuality: number; // 0..1
  final: number;
};

export type KeywordAnalysis = {
  ocrKeywords: Set<string>;
  summaryKeywords: Set<string>;
  missingKeywords: string[];
  commonKeywords: string[];
  coverage: number;
};

export type ConceptAnalysis = {
  extractedConcepts: string[];
  missingConcepts: string[];
  conceptOverlap: number;
};

const STOPWORDS_EN = new Set([
  'the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','as','is','are','was','were','be','been','being','from','that','this','these','those','it','its','into','about','over','under','after','before','between','through','will','would','could','should','may','might','can','must','shall','do','does','did','has','have','had','one','two','three','first','second','third','also','just','only','each','every','some','any','all','most','many','much','more','less','than','very','quite','rather','too','so','such','well','now','then','here','there','where','when','why','how','what','which','who','whom','whose'
]);
const STOPWORDS_AR = new Set([
  'ال','و','في','من','على','إلى','عن','أن','إن','كان','كانت','هو','هي','هم','هن','كما','كما','ما','لا','لم','لن','قد','ثم','أو','بل','كل','هذه','هذا','ذلك','تلك','التي','الذي','التي','اللذان','اللتان','الذين','اللذين','اللواتي','اللاتي','عند','عندما','كيف','أين','متى','لماذا','ماذا','أي','بعض','جميع','كثير','قليل','أكثر','أقل','جدا','فقط','أيضا','كذلك','هكذا','هناك','هنا','الآن','بعد','قبل','خلال','أثناء','حول','نحو','ضد','مع','بدون','سوف','قد','ربما','لعل','كأن','لكن','غير','سوى','إلا'
]);

// Enhanced synonyms for better coverage matching
const CHEMISTRY_SYNONYMS: Record<string, string[]> = {
  'حمض': ['أحماض', 'حمضي', 'حامض', 'حوامض'],
  'قاعدة': ['قواعد', 'قاعدي', 'قلوي', 'قلويات'],
  'محلول': ['محاليل', 'مذاب', 'إذابة', 'ذوبان'],
  'تفاعل': ['تفاعلات', 'يتفاعل', 'متفاعل', 'تفاعلي'],
  'جزيء': ['جزيئات', 'جزيئي', 'جزيئية'],
  'ذرة': ['ذرات', 'ذري', 'ذرية'],
  'عنصر': ['عناصر', 'عنصري'],
  'مركب': ['مركبات', 'تركيب'],
  'كتلة': ['كتل', 'كتلي'],
  'حجم': ['أحجام', 'حجمي'],
  'ضغط': ['ضغوط', 'انضغاط'],
  'درجة': ['درجات', 'حرارة'],
  'غاز': ['غازات', 'غازي', 'غازية'],
  'سائل': ['سوائل', 'سائلة'],
  'صلب': ['صلبة', 'جامد', 'جامدة'],
  'تركيز': ['تراكيز', 'مركز', 'مركزة'],
  'معادلة': ['معادلات', 'معادل'],
  'نسبة': ['نسب', 'نسبي', 'نسبية']
};

// Enhanced tokenization with stemming and normalization
function tokenize(input: string, rtl = false, enableStemming = false): string[] {
  const clean = (input || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean ? clean.split(' ') : [];
  const stop = rtl ? STOPWORDS_AR : STOPWORDS_EN;
  let filtered = words.filter(w => w && w.length > 1 && !stop.has(w));
  
  // Apply basic stemming for Arabic if enabled
  if (enableStemming && rtl) {
    filtered = filtered.map(word => {
      // Remove common Arabic suffixes
      return word
        .replace(/ات$/, '') // plural suffix
        .replace(/ان$/, '') // dual suffix
        .replace(/ين$/, '') // masculine plural
        .replace(/ون$/, '') // masculine plural
        .replace(/ها$/, '') // possessive
        .replace(/هم$/, '') // possessive
        .replace(/هن$/, '') // possessive
        .replace(/كم$/, '') // possessive
        .replace(/ني$/, '') // possessive
        .replace(/ية$/, '') // adjective suffix
        .replace(/تم$/, '') // passive voice
        .trim();
    }).filter(w => w.length > 1);
  }
  
  return filtered;
}

// Generate bigrams for better content matching
function generateBigrams(words: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

// Enhanced keyword extraction with synonym expansion
function topKeywords(words: string[], k = 20, expandSynonyms = false): Set<string> {
  const freq = new Map<string, number>();
  
  // Count base frequencies
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
    
    // Add synonym frequencies if enabled
    if (expandSynonyms) {
      for (const [base, synonyms] of Object.entries(CHEMISTRY_SYNONYMS)) {
        if (synonyms.includes(w)) {
          freq.set(base, (freq.get(base) || 0) + 0.5); // Lower weight for synonyms
        }
      }
    }
  }
  
  return new Set(
    [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([w]) => w)
  );
}

// Enhanced Jaccard with synonym matching
function enhancedJaccard(a: Set<string>, b: Set<string>, enableSynonyms = false): number {
  if (a.size === 0 && b.size === 0) return 1;
  
  let inter = 0;
  const aArray = Array.from(a);
  const bArray = Array.from(b);
  
  // Direct matches
  for (const x of aArray) {
    if (b.has(x)) {
      inter++;
    } else if (enableSynonyms) {
      // Check for synonym matches
      for (const [base, synonyms] of Object.entries(CHEMISTRY_SYNONYMS)) {
        if ((x === base || synonyms.includes(x))) {
          const hasMatch = bArray.some(y => y === base || synonyms.includes(y));
          if (hasMatch) {
            inter += 0.7; // Partial credit for synonym matches
            break;
          }
        }
      }
    }
  }
  
  const uni = a.size + b.size - Math.floor(inter);
  return uni === 0 ? 1 : inter / uni;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  return enhancedJaccard(a, b, false);
}

function lengthFit(wordsCount: number): number {
  // Ideal summary length ~120–350 words
  if (wordsCount <= 0) return 0;
  if (wordsCount >= 120 && wordsCount <= 350) return 1;
  if (wordsCount < 120) return wordsCount / 120;
  // beyond 350, decay gently
  const over = wordsCount - 350;
  return Math.max(0, 1 - over / 350);
}

function structureScore(text: string): number {
  const sentences = (text.match(/[.!؟?؛]+\s|\n/g) || []).length + 1;
  const headings = (text.match(/^\s*#+\s/mg) || []).length;
  const lists = (text.match(/^\s*[-*•]\s/mg) || []).length;
  const punctuationOk = Math.min(1, sentences / Math.max(1, (text.split(/\n|\./).length)) + 0.1);
  const structureBits = Math.min(1, (headings > 0 ? 0.2 : 0) + (lists > 0 ? 0.2 : 0));
  return Math.min(1, punctuationOk + structureBits);
}

function repetitionPenalty(text: string): number {
  const words = tokenize(text);
  if (words.length < 6) return 1;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = words[i] + ' ' + words[i + 1];
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  const repeats = [...bigrams.values()].filter(v => v > 2).length; // allow up to two repeats
  const ratio = repeats / Math.max(1, bigrams.size);
  return Math.max(0, 1 - ratio * 2); // stronger penalty
}

// Enhanced keyword analysis with detailed insights
export function analyzeKeywords(
  ocrText: string,
  summaryMd: string,
  rtl = false,
  topK = 20,
  enableStemming = false,
  enableSynonyms = false
): KeywordAnalysis {
  const ocrTokens = tokenize(ocrText, rtl, enableStemming);
  const sumTokens = tokenize(summaryMd, rtl, enableStemming);
  
  const ocrKeywords = topKeywords(ocrTokens, topK, enableSynonyms);
  const summaryKeywords = topKeywords(sumTokens, topK, enableSynonyms);
  
  const commonKeywords = Array.from(ocrKeywords).filter(k => summaryKeywords.has(k));
  const missingKeywords = Array.from(ocrKeywords).filter(k => !summaryKeywords.has(k));
  
  const coverage = enhancedJaccard(ocrKeywords, summaryKeywords, enableSynonyms);
  
  return {
    ocrKeywords,
    summaryKeywords,
    missingKeywords,
    commonKeywords,
    coverage
  };
}

// Extract key concepts from text (simplified approach)
export function extractConcepts(text: string, rtl = false): string[] {
  const concepts = [];
  
  // Chemistry-specific concept patterns
  const conceptPatterns = [
    // Arabic patterns
    /(?:قانون|نظرية|مبدأ|خاصية|ظاهرة)\s+([^.،]+)/g,
    /(?:تعريف|تعرف)\s+([^.،]+)/g,
    /(?:معادلة|صيغة)\s+([^.،]+)/g,
    /(?:تفاعل|عملية)\s+([^.،]+)/g,
    // English patterns  
    /(?:law|theory|principle|property|phenomenon)\s+(?:of\s+)?([^.]+)/gi,
    /(?:definition|define)\s+([^.]+)/gi,
    /(?:equation|formula)\s+(?:of\s+)?([^.]+)/gi,
    /(?:reaction|process)\s+(?:of\s+)?([^.]+)/gi
  ];
  
  for (const pattern of conceptPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const concept = match[1].trim();
      if (concept.length > 3 && concept.length < 100) {
        concepts.push(concept);
      }
    }
  }
  
  return concepts.slice(0, 10); // Limit to top 10 concepts
}

// Analyze concept overlap between OCR and summary
export function analyzeConcepts(
  ocrText: string,
  summaryMd: string,
  rtl = false
): ConceptAnalysis {
  const ocrConcepts = extractConcepts(ocrText, rtl);
  const summaryConcepts = extractConcepts(summaryMd, rtl);
  
  const missingConcepts = ocrConcepts.filter(concept => 
    !summaryConcepts.some(sConcept => 
      concept.toLowerCase().includes(sConcept.toLowerCase()) ||
      sConcept.toLowerCase().includes(concept.toLowerCase())
    )
  );
  
  const conceptOverlap = ocrConcepts.length > 0 
    ? (ocrConcepts.length - missingConcepts.length) / ocrConcepts.length 
    : 0;
  
  return {
    extractedConcepts: ocrConcepts,
    missingConcepts,
    conceptOverlap
  };
}

export function calculateSummaryConfidence(
  ocrText: string,
  summaryMd: string,
  ocrQuality0to1?: number,
  rtl?: boolean,
  options: {
    topK?: number;
    enableStemming?: boolean;
    enableSynonyms?: boolean;
    enableConcepts?: boolean;
  } = {}
): { score: number; meta: ConfidenceMeta; keywordAnalysis: KeywordAnalysis; conceptAnalysis?: ConceptAnalysis } {
  const { topK = 20, enableStemming = false, enableSynonyms = false, enableConcepts = false } = options;
  
  const ocrTokens = tokenize(ocrText, rtl, enableStemming);
  const sumTokens = tokenize(summaryMd, rtl, enableStemming);
  
  // Enhanced coverage calculation
  const keywordAnalysis = analyzeKeywords(ocrText, summaryMd, rtl, topK, enableStemming, enableSynonyms);
  const cov = keywordAnalysis.coverage;
  
  // Concept analysis if enabled
  let conceptAnalysis: ConceptAnalysis | undefined;
  let conceptOverlap = 0;
  if (enableConcepts) {
    conceptAnalysis = analyzeConcepts(ocrText, summaryMd, rtl);
    conceptOverlap = conceptAnalysis.conceptOverlap;
  }
  
  const lenFit = lengthFit(sumTokens.length);
  const struct = structureScore(summaryMd);
  const rep = repetitionPenalty(summaryMd);
  const ocrQ = Math.max(0, Math.min(1, ocrQuality0to1 ?? 0.7));

  // Enhanced blend with concept overlap
  const score = Math.max(0, Math.min(1,
    0.35 * cov +
    (enableConcepts ? 0.15 * conceptOverlap : 0) +
    0.15 * lenFit +
    0.15 * struct +
    0.10 * rep +
    0.20 * ocrQ +
    (enableConcepts ? 0 : 0.15) // Redistribute concept weight if disabled
  ));

  const meta: ConfidenceMeta = {
    coverage: cov,
    conceptOverlap,
    lengthFit: lenFit,
    structure: struct,
    repetitionPenalty: rep,
    ocrQuality: ocrQ,
    final: score,
  };

  return { score, meta, keywordAnalysis, conceptAnalysis };
}
