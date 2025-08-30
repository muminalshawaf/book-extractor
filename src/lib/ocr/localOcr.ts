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

  // Enhanced preprocessing for Arabic text
  const preprocessOptions: PreprocessOptions = {
    upsample: true,              // Upscale for better resolution
    targetMinWidth: 1400,        // Higher resolution target
    denoise: true,               // Remove noise
    contrastNormalize: true,     // Improve contrast for Arabic text
    binarize: true,              // Apply thresholding
    adaptiveBinarization: true,  // Better for Arabic text with uneven lighting
    cropMargins: true,           // Remove white margins
    deskew: true,                // Correct slight rotation
  };

  let processedBlob: Blob;
  try {
    console.log('OCR: Preprocessing image...');
    // Convert string to blob if needed
    const inputBlob = typeof input === 'string' ? await (await fetch(input)).blob() : input;
    processedBlob = await preprocessImageBlob(inputBlob, preprocessOptions);
    onProgress?.(25);
  } catch (error) {
    console.warn('OCR: Preprocessing failed, using original:', error);
    processedBlob = typeof input === 'string' ? await (await fetch(input)).blob() : input;
    onProgress?.(20);
  }

  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m && typeof m.progress === 'number' && onProgress) {
        const pct = Math.max(30, Math.min(90, Math.round(30 + m.progress * 60)));
        onProgress(pct);
      }
    },
  } as any);

  try {
    console.log('OCR: Worker created, trying multiple recognition strategies...');
    
    // Strategy 1: PSM 3 (Fully automatic page segmentation, no OSD)
    let bestResult: any = null;
    let bestScore = 0;

    try {
      const result1 = await worker.recognize(processedBlob, {
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوياىءآأإئؤة٠١٢٣٤٥٦٧٨٩abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?()[]{}":;-+=*/\\|\u060C\u061B\u061F\u060D',
      } as any);
      
      const text1 = (result1.data.text || '').trim();
      const conf1 = result1.data.confidence || 0;
      const score1 = text1.length > 5 ? conf1 + (text1.length * 0.1) : conf1 * 0.5;
      
      console.log('OCR Strategy 1 (PSM 3):', { length: text1.length, confidence: conf1, score: score1 });
      
      if (score1 > bestScore) {
        bestResult = result1;
        bestScore = score1;
      }
    } catch (e) {
      console.warn('OCR Strategy 1 failed:', e);
    }

    // Strategy 2: PSM 6 (Uniform block of text) - good for textbooks
    try {
      const result2 = await worker.recognize(processedBlob, {
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوياىءآأإئؤة٠١٢٣٤٥٦٧٨٩abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?()[]{}":;-+=*/\\|\u060C\u061B\u061F\u060D',
      } as any);
      
      const text2 = (result2.data.text || '').trim();
      const conf2 = result2.data.confidence || 0;
      const score2 = text2.length > 5 ? conf2 + (text2.length * 0.1) : conf2 * 0.5;
      
      console.log('OCR Strategy 2 (PSM 6):', { length: text2.length, confidence: conf2, score: score2 });
      
      if (score2 > bestScore) {
        bestResult = result2;
        bestScore = score2;
      }
    } catch (e) {
      console.warn('OCR Strategy 2 failed:', e);
    }

    if (!bestResult) {
      throw new Error('All OCR strategies failed');
    }
    
    const text = (bestResult.data.text || '').trim();
    const confidence = bestResult.data.confidence || 0;
    
    // Clean the text
    const cleanText = text
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s.,!?()[\]{}":;=+\-*/\\|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('OCR: Best result - Length:', cleanText.length, 'Confidence:', confidence);
    console.log('OCR: First 100 chars:', cleanText.substring(0, 100));
    
    onProgress?.(100);
    return { 
      text: cleanText, 
      confidence: confidence > 1 ? confidence / 100 : confidence 
    };
    
  } catch (error) {
    console.error('OCR: Recognition failed:', error);
    return { text: '', confidence: 0 };
  } finally {
    await worker.terminate();
  }
}
