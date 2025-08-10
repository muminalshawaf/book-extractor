import { createWorker } from 'tesseract.js';
import { preprocessImageBlob, type PreprocessOptions } from '@/lib/image-preprocess';

export type LocalOcrOptions = {
  lang?: string; // e.g., 'eng', 'ara+eng'
  psm?: number | string; // page segmentation mode
  preprocess?: boolean | PreprocessOptions;
  onProgress?: (pct: number) => void; // 0-100
};

export type LocalOcrResult = {
  text: string;
  confidence?: number;
};

export async function runLocalOcr(input: string | Blob, options?: LocalOcrOptions): Promise<LocalOcrResult> {
  const lang = options?.lang || 'ara+eng';
  const primaryPsm = options?.psm ?? 6; // default: uniform block of text
  const onProgress = options?.onProgress;

  let image: string | Blob = input;
  const shouldPreprocess =
    options?.preprocess === false ? false : Boolean(options?.preprocess) || lang.includes('ara');
  try {
    if (shouldPreprocess) {
      const preBlob = await preprocessImageBlob(
        typeof input === 'string' ? await (await fetch(input)).blob() : input,
        typeof options?.preprocess === 'object' ? options.preprocess : undefined
      );
      image = preBlob;
    }
  } catch (e) {
    // If preprocessing fails, fallback to raw input
    console.warn('Preprocessing failed, falling back to original image:', e);
    image = input;
  }
  const worker = await createWorker(lang, 1, {
    // logger provides progress: { progress, status }
    logger: (m) => {
      if (m && typeof m.progress === 'number' && onProgress) {
        // map [0,1] to [10,95] to keep UI lively
        const pct = Math.max(10, Math.min(95, Math.round(m.progress * 100)));
        onProgress(pct);
      }
    },
  });

  async function recognizeWith(psm: number | string) {
    const { data } = await worker.recognize(image, {
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessjs_create_pdf: '0',
    } as any);
    return data as any;
  }

  try {
    // Try multiple PSM strategies (optimized for Arabic)
    const tried = new Set<string>();
    const psmCandidates: (number | string)[] = [
      primaryPsm,
      ...(lang.includes('ara') ? [4, 3, 6, 7, 11] : [11]),
    ];

    let best: any | null = null;
    for (const psm of psmCandidates) {
      const key = String(psm);
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        const result = await recognizeWith(psm);
        if (!best) {
          best = result;
          continue;
        }
        const bConf = Number((best as any).confidence ?? 0);
        const rConf = Number((result as any).confidence ?? 0);
        const bLen = (best?.text || '').trim().length;
        const rLen = (result?.text || '').trim().length;
        if (rConf > bConf || (rConf === bConf && rLen > bLen)) {
          best = result;
        }
      } catch {
        // ignore errors per PSM
      }
    }

    const data = best ?? { text: '', confidence: 0 };
    onProgress?.(100);
    return { text: data.text || '', confidence: (data as any).confidence };
  } finally {
    await worker.terminate();
  }
}
