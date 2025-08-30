import { createWorker } from 'tesseract.js';
import { preprocessImageBlob, type PreprocessOptions } from '@/lib/image-preprocess';

export type LocalOcrOptions = {
  lang?: string; // e.g., 'eng', 'ara+eng'
  psm?: number | string; // page segmentation mode
  preprocess?: boolean | PreprocessOptions;
  autoRotate?: boolean; // try OSD to auto-rotate (0/90/180/270)
  onProgress?: (pct: number) => void; // 0-100
};

export type LocalOcrResult = {
  text: string;
  confidence?: number;
};

async function rotateImageBlob(input: string | Blob, angleDeg: number): Promise<Blob> {
  if (angleDeg % 360 === 0) {
    return typeof input === 'string' ? await (await fetch(input)).blob() : input;
  }
  const blob = typeof input === 'string' ? await (await fetch(input)).blob() : input;
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  URL.revokeObjectURL(url);
  const angle = (angleDeg * Math.PI) / 180;
  const w = img.naturalWidth, h = img.naturalHeight;
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const cw = Math.round(w * cos + h * sin);
  const ch = Math.round(w * sin + h * cos);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rotate failed'))), 'image/png', 0.95)
  );
}

export async function runLocalOcr(input: string | Blob, options?: LocalOcrOptions): Promise<LocalOcrResult> {
  const lang = options?.lang || 'ara+eng';
  const primaryPsm = options?.psm ?? 6; // default: uniform block of text
  const onProgress = options?.onProgress;

  let image: string | Blob = input;
  const shouldPreprocess =
    options?.preprocess === false ? false : Boolean(options?.preprocess) || lang.includes('ara');
  try {
    if (shouldPreprocess) {
      const preOptions =
        typeof options?.preprocess === 'object'
          ? options.preprocess
          : (lang.includes('ara')
              ? ({ adaptiveBinarization: true, deskew: true, contrastNormalize: true } as any)
              : undefined);
      const preBlob = await preprocessImageBlob(
        typeof input === 'string' ? await (await fetch(input)).blob() : input,
        preOptions
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
  } as any);

  async function recognizeWith(psm: number | string) {
    const { data } = await worker.recognize(image, {
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessjs_create_pdf: '0',
      // Enhanced Arabic OCR settings
      tessedit_char_whitelist: lang.includes('ara') ? 
        'ابتثجحخدذرزسشصضطظعغفقكلمنهوياًإآأؤئءةى٠١٢٣٤٥٦٧٨٩0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?()[]{}:;"\'-+=/\\<>@#$%^&*_~ ' :
        undefined,
      tessedit_ocr_engine_mode: '2', // Use LSTM OCR engine
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      load_unambig_dawg: '0',
      load_bigram_dawg: '0',
      load_fixed_length_dawgs: '0',
    } as any);
    return data as any;
  }

  try {
    // Auto-rotate using Tesseract OSD if enabled
    if (options?.autoRotate ?? lang.includes('ara')) {
      try {
        const det: any = await (worker as any).detect(image as any);
        const angle = Math.round(det?.data?.orientation?.degrees ?? det?.data?.orientation?.angle ?? 0);
        const norm = ((angle % 360) + 360) % 360;
        if (norm === 90 || norm === 180 || norm === 270) {
          const rotateBy = (360 - norm) % 360;
          image = await rotateImageBlob(image, rotateBy);
        }
      } catch {
        // ignore OSD errors
      }
    }

    // Try comprehensive PSM strategies optimized for Arabic textbooks
    const tried = new Set<string>();
    const psmCandidates: (number | string)[] = [
      primaryPsm,
      ...(lang.includes('ara') ? [3, 4, 6, 7, 8, 11, 12, 13] : [3, 4, 6, 11]),
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
