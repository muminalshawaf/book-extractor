// Image preprocessing utilities for enhancing OCR quality without external dependencies
// Techniques: upsample, grayscale, median denoise, Otsu binarization, margin crop

export type PreprocessOptions = {
  upsample?: boolean; // upscale low-res pages for sharper text
  targetMinWidth?: number; // minimum working width before OCR
  denoise?: boolean; // 3x3 median filter
  binarize?: boolean; // Otsu thresholding to black/white
  cropMargins?: boolean; // auto-trim white margins
  deskew?: boolean; // enable simple small-angle deskew
};

const defaultOptions: Required<PreprocessOptions> = {
  upsample: true,
  targetMinWidth: 1200,
  denoise: true,
  binarize: true,
  cropMargins: true,
  deskew: false,
};

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function createCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return { canvas, ctx } as const;
}

function upscaleIfNeeded(src: HTMLImageElement | HTMLCanvasElement, minWidth: number) {
  const w = (src as any).naturalWidth ?? (src as HTMLCanvasElement).width;
  const h = (src as any).naturalHeight ?? (src as HTMLCanvasElement).height;
  if (w >= minWidth) return src;
  const scale = Math.min(2, Math.max(1.25, minWidth / w));
  const { canvas, ctx } = createCanvas(Math.round(w * scale), Math.round(h * scale));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toGrayscale(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = data[i + 1] = data[i + 2] = y;
  }
}

function median3x3(data: Uint8ClampedArray, width: number, height: number) {
  const get = (x: number, y: number) => data[(y * width + x) * 4];
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const windowVals = [
        get(x - 1, y - 1), get(x, y - 1), get(x + 1, y - 1),
        get(x - 1, y),     get(x, y),     get(x + 1, y),
        get(x - 1, y + 1), get(x, y + 1), get(x + 1, y + 1),
      ].sort((a, b) => a - b);
      const m = windowVals[4];
      const idx = (y * width + x) * 4;
      out[idx] = out[idx + 1] = out[idx + 2] = m;
    }
  }
  // copy edges from original
  for (let i = 0; i < data.length; i += 4) {
    if (out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0) {
      out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2];
    }
  }
  data.set(out);
}

function otsuThreshold(hist: number[], total: number) {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) {
      varMax = between;
      threshold = t;
    }
  }
  return threshold;
}

function applyBinarization(data: Uint8ClampedArray, width: number, height: number) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const T = otsuThreshold(hist, (data.length / 4) | 0);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] >= T ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

function cropWhiteMargins(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = data[i];
      if (v < 250) { // consider anything not pure white as content
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return canvas; // nothing to crop
  const w = Math.max(1, maxX - minX + 1);
  const h = Math.max(1, maxY - minY + 1);
  const { canvas: c2, ctx: c2ctx } = createCanvas(w, h);
  c2ctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return c2;
}

function rotateCanvas(src: HTMLCanvasElement, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const w = src.width, h = src.height;
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const nw = Math.round(w * cos + h * sin);
  const nh = Math.round(w * sin + h * cos);
  const { canvas, ctx } = createCanvas(nw, nh);
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(angle);
  ctx.drawImage(src, -w / 2, -h / 2);
  return canvas;
}

function horizontalProjectionScore(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  let score = 0;
  for (let y = 0; y < height; y++) {
    let transitions = 0;
    let prev = d[y * width * 4] > 127 ? 255 : 0;
    for (let x = 1; x < width; x++) {
      const v = d[(y * width + x) * 4] > 127 ? 255 : 0;
      if (v !== prev) transitions++;
      prev = v;
    }
    score += transitions * transitions;
  }
  return score / Math.max(1, height);
}

function deskewSmallAngles(canvas: HTMLCanvasElement) {
  let best = canvas;
  let bestScore = horizontalProjectionScore(canvas);
  for (let a = -3; a <= 3; a += 0.5) {
    if (a === 0) continue;
    const rotated = rotateCanvas(canvas, a);
    const s = horizontalProjectionScore(rotated);
    if (s > bestScore) {
      bestScore = s;
      best = rotated;
    }
  }
  return best;
}

export async function preprocessImageBlob(blob: Blob, options?: PreprocessOptions): Promise<Blob> {
  const opt = { ...defaultOptions, ...(options || {}) };
  const img = await blobToImage(blob);

  // Step 1: upscale low-res images
  let work: HTMLImageElement | HTMLCanvasElement = img;
  if (opt.upsample) {
    work = upscaleIfNeeded(img, opt.targetMinWidth);
  }

  // Step 2: draw and fetch pixels
  const { canvas, ctx } = createCanvas((work as any).width ?? (work as HTMLCanvasElement).width, (work as any).height ?? (work as HTMLCanvasElement).height);
  ctx.drawImage(work as CanvasImageSource, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Step 3: grayscale
  toGrayscale(imgData.data);

  // Step 4: denoise (median filter)
  if (opt.denoise) median3x3(imgData.data, canvas.width, canvas.height);

  // Step 5: binarize
  if (opt.binarize) applyBinarization(imgData.data, canvas.width, canvas.height);

  ctx.putImageData(imgData, 0, 0);

  // Step 6: crop margins
  let processedCanvas = canvas;
  if (opt.cropMargins) processedCanvas = cropWhiteMargins(canvas);

  // Step 7: deskew
  if (opt.deskew) {
    processedCanvas = deskewSmallAngles(processedCanvas);
  }

  return await new Promise<Blob>((resolve, reject) => {
    processedCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))), 'image/png', 0.95);
  });
}
