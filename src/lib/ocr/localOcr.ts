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
  const lang = options?.lang || 'eng';
  const psm = options?.psm ?? 6; // Assume a single uniform block of text
  const onProgress = options?.onProgress;

  let image: string | Blob = input;
  try {
    if (options?.preprocess) {
      const preBlob = await preprocessImageBlob(
        typeof input === 'string' ? await (await fetch(input)).blob() : input,
        typeof options.preprocess === 'boolean' ? undefined : options.preprocess
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

  try {
    // Recognize with inline parameters to avoid strict PSM typing
    const { data } = await worker.recognize(image, {
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessjs_create_pdf: '0',
    } as any);
    onProgress?.(100);
    return { text: data.text || '', confidence: (data as any).confidence };
  } finally {
    await worker.terminate();
  }
}
