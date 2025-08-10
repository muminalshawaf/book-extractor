import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js behavior
env.allowLocalModels = false;
env.useBrowserCache = true; // cache in browser to avoid re-downloads between pages

const MAX_IMAGE_DIMENSION = 1024;

function resizeImageIfNeeded(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0);
  return false;
}

export const loadImageFromBlob = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

let segPipelinePromise: Promise<any> | null = null;
async function getSegmentationPipeline() {
  if (!segPipelinePromise) {
    segPipelinePromise = pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
      device: 'webgpu',
    });
  }
  return segPipelinePromise;
}

let captionPipelinePromise: Promise<any> | null = null;
async function getCaptionPipeline() {
  if (!captionPipelinePromise) {
    captionPipelinePromise = pipeline('image-to-text', 'Xenova/blip-image-captioning-base', {
      device: 'webgpu',
    });
  }
  return captionPipelinePromise;
}

export const removeBackgroundFromBlob = async (blob: Blob): Promise<Blob> => {
  const image = await loadImageFromBlob(blob);
  const segmenter = await getSegmentationPipeline();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  resizeImageIfNeeded(canvas, ctx, image);
  const imageData = canvas.toDataURL('image/jpeg', 0.9);
  const result = await segmenter(imageData);
  if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
    throw new Error('Invalid segmentation result');
  }
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('Could not get output canvas context');
  outputCtx.drawImage(canvas, 0, 0);
  const outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = outputImageData.data;
  for (let i = 0; i < result[0].mask.data.length; i++) {
    const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
    data[i * 4 + 3] = alpha;
  }
  outputCtx.putImageData(outputImageData, 0, 0);
  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((out) => (out ? resolve(out) : reject(new Error('Failed to create blob'))), 'image/png', 1.0);
  });
};

export const captionImageFromBlob = async (blob: Blob): Promise<string> => {
  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  resizeImageIfNeeded(canvas, ctx, image);
  const dataUrl = canvas.toDataURL('image/png', 0.95);
  const captioner = await getCaptionPipeline();
  const out = await captioner(dataUrl);
  if (!out) return '';
  // transformers.js returns array with generated_text or text
  const text = Array.isArray(out) ? (out[0]?.generated_text || out[0]?.text) : (out.generated_text || out.text);
  return (text || '').toString().trim();
};
