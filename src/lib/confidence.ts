// Lightweight heuristic to score summary confidence (0..1)
// Factors: coverage (OCR vs summary keywords), length fit, structure, repetition penalty, OCR quality

export type ConfidenceMeta = {
  coverage: number;
  lengthFit: number;
  structure: number;
  repetitionPenalty: number; // already inverted (1 - repetition)
  ocrQuality: number; // 0..1
  final: number;
};

const STOPWORDS_EN = new Set([
  'the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','as','is','are','was','were','be','been','being','from','that','this','these','those','it','its','into','about','over','under','after','before','between','through'
]);
const STOPWORDS_AR = new Set([
  'ال','و','في','من','على','إلى','عن','أن','إن','كان','كانت','هو','هي','هم','هن','كما','كما','ما','لا','لم','لن','قد','ثم','أو','بل','كل','هذه','هذا','ذلك','تلك'
]);

function tokenize(input: string, rtl = false): string[] {
  const clean = (input || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean ? clean.split(' ') : [];
  const stop = rtl ? STOPWORDS_AR : STOPWORDS_EN;
  return words.filter(w => w && w.length > 1 && !stop.has(w));
}

function topKeywords(words: string[], k = 30): Set<string> {
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return new Set(
    [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([w]) => w)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  
  // Boost coverage for educational content by checking partial matches
  let partialMatches = 0;
  for (const wordA of a) {
    for (const wordB of b) {
      if (wordA.length > 3 && wordB.length > 3 && 
          (wordA.includes(wordB) || wordB.includes(wordA))) {
        partialMatches++;
        break;
      }
    }
  }
  
  const adjustedInter = inter + (partialMatches * 0.3);
  return uni === 0 ? 1 : Math.min(1, adjustedInter / uni);
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

export function calculateSummaryConfidence(
  ocrText: string,
  summaryMd: string,
  ocrQuality0to1?: number,
  rtl?: boolean
): { score: number; meta: ConfidenceMeta } {
  const ocrTokens = tokenize(ocrText, rtl);
  const sumTokens = tokenize(summaryMd, rtl);
  const cov = jaccard(topKeywords(ocrTokens), topKeywords(sumTokens));
  const lenFit = lengthFit(sumTokens.length);
  const struct = structureScore(summaryMd);
  const rep = repetitionPenalty(summaryMd);
  const ocrQ = Math.max(0, Math.min(1, ocrQuality0to1 ?? 0.7));

  // Blend
  const score = Math.max(0, Math.min(1,
    0.40 * cov +
    0.15 * lenFit +
    0.15 * struct +
    0.10 * rep +
    0.20 * ocrQ
  ));

  const meta: ConfidenceMeta = {
    coverage: cov,
    lengthFit: lenFit,
    structure: struct,
    repetitionPenalty: rep,
    ocrQuality: ocrQ,
    final: score,
  };

  return { score, meta };
}
