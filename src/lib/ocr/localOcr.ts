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

const psmCache = new Map<string, number | string>();
function keyFromInput(inp: string | Blob) {
  if (typeof inp === 'string') return `url:${inp}`;
  const b = inp as Blob;
  return `blob:${b.type}:${b.size}`;
}

export async function runLocalOcr(input: string | Blob, options?: LocalOcrOptions): Promise<LocalOcrResult> {
  const lang = options?.lang || 'ara';
  const primaryPsm = options?.psm ?? 6; // default: uniform block of text
  const onProgress = options?.onProgress;
  const cacheKey = keyFromInput(input);
  const cachedPsm = psmCache.get(cacheKey);

  let image: string | Blob = input;
  const variantImages: (string | Blob)[] = [];
  const shouldPreprocess =
    options?.preprocess === false ? false : Boolean(options?.preprocess) || lang.includes('ara');
  try {
    const origBlob = typeof input === 'string' ? await (await fetch(input)).blob() : input;
    if (shouldPreprocess) {
      const baseOptions: PreprocessOptions =
        typeof options?.preprocess === 'object'
          ? options.preprocess
          : (lang.includes('ara')
              ? ({
                  adaptiveBinarization: true,
                  deskew: true,
                  contrastNormalize: true,
                  targetMinWidth: 2200,
                  upsample: true,
                  denoise: true,
                  binarize: true,
                  cropMargins: true,
                } as PreprocessOptions)
              : ({} as PreprocessOptions));
      if (lang.includes('ara') && typeof options?.preprocess !== 'object') {
        const preAdaptive = await preprocessImageBlob(origBlob, {
          ...baseOptions,
          adaptiveBinarization: true,
          binarize: true,
          targetMinWidth: 2200,
        });
        const preOtsu = await preprocessImageBlob(origBlob, {
          ...baseOptions,
          adaptiveBinarization: false,
          binarize: true,
          targetMinWidth: 2200,
        });
        variantImages.push(preAdaptive, preOtsu);
      } else {
        const preBlob = await preprocessImageBlob(origBlob, baseOptions);
        variantImages.push(preBlob);
      }
    } else {
      variantImages.push(input);
    }
    image = variantImages[0];
  } catch (e) {
    // If preprocessing fails, fallback to raw input
    console.warn('Preprocessing failed, falling back to original image:', e);
    image = input;
    variantImages.length = 0;
    variantImages.push(input);
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
    } as any);
    return data as any;
  }

  try {
    // Build PSM candidates with cached best first and extended set
    const baseCandidates: (number | string)[] = lang.includes('ara') ? [4, 3, 6, 7, 11, 12, 13] : [11, 12, 13];
    const psmCandidates: (number | string)[] = [];
    const seen = new Set<string>();
    const add = (v?: number | string) => {
      if (v === undefined) return;
      const k = String(v);
      if (!seen.has(k)) {
        seen.add(k);
        psmCandidates.push(v);
      }
    };
    add(cachedPsm as any);
    add(primaryPsm as any);
    for (const c of baseCandidates) add(c);

    let best: any | null = null;
    let bestPsmUsed: number | string | undefined;

    for (const variant of variantImages) {
      image = variant;

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

      const tried = new Set<string>();
      for (const psm of psmCandidates) {
        const key = String(psm);
        if (tried.has(key)) continue;
        tried.add(key);
        try {
          const result = await recognizeWith(psm);
          if (!best) {
            best = result;
            bestPsmUsed = psm;
            continue;
          }
          const bConf = Number((best as any).confidence ?? 0);
          const rConf = Number((result as any).confidence ?? 0);
          const bLen = (best?.text || '').trim().length;
          const rLen = (result?.text || '').trim().length;
          if (rConf > bConf || (rConf === bConf && rLen > bLen)) {
            best = result;
            bestPsmUsed = psm;
          }
        } catch {
          // ignore errors per PSM
        }
      }
    }

    const data = best ?? { text: '', confidence: 0 };
    onProgress?.(100);
    if (bestPsmUsed !== undefined) {
      psmCache.set(cacheKey, bestPsmUsed);
    }
    return { text: data.text || '', confidence: (data as any).confidence };
  } finally {
    await worker.terminate();
  }
}
