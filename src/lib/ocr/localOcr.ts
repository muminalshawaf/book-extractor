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
  const onProgress = options?.onProgress;
  
  console.log('OCR: Starting with language:', lang);
  onProgress?.(10);

  // Simple approach - no complex preprocessing
  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m && typeof m.progress === 'number' && onProgress) {
        const pct = Math.max(15, Math.min(90, Math.round(m.progress * 100)));
        onProgress(pct);
      }
    },
  } as any);

  try {
    console.log('OCR: Worker created, starting recognition...');
    
    // Use the most basic recognition with minimal options
    const { data } = await worker.recognize(input, {
      tessedit_pageseg_mode: '6', // Uniform block of text
      preserve_interword_spaces: '1',
    } as any);
    
    const text = (data.text || '').trim();
    const confidence = data.confidence || 0;
    
    console.log('OCR: Result length:', text.length, 'Confidence:', confidence);
    console.log('OCR: First 100 chars:', text.substring(0, 100));
    
    onProgress?.(100);
    return { text, confidence };
    
  } catch (error) {
    console.error('OCR: Recognition failed:', error);
    return { text: '', confidence: 0 };
  } finally {
    await worker.terminate();
  }
}
