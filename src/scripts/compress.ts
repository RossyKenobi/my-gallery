/**
 * compress-worker.ts — OffscreenCanvas image compression in a Web Worker.
 * Falls back to main-thread canvas when OffscreenCanvas is unavailable.
 */

const MAX_IMAGE_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;

/**
 * Compress an image blob off the main thread using OffscreenCanvas.
 * Falls back to main-thread <canvas> if OffscreenCanvas or createImageBitmap is not supported.
 */
export async function compressImage(file: Blob, maxDim = MAX_IMAGE_DIMENSION, quality = JPEG_QUALITY): Promise<Blob> {
  // Fast path: OffscreenCanvas + createImageBitmap (Chrome, Edge, Firefox 105+)
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
    }

    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality });
    if (!blob) throw new Error('OffscreenCanvas compression failed');
    return blob;
  }

  // Fallback: main-thread <canvas> (Safari < 16.4, older browsers)
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        quality
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate main, thumbnail, and lqip versions of an image.
 */
export async function generateImageVersions(file: Blob): Promise<{ main: Blob, thumbnail: Blob, lqip: string }> {
  // 1. Main image (max 2400px)
  const main = await compressImage(file, MAX_IMAGE_DIMENSION, JPEG_QUALITY);
  
  // 2. Thumbnail (max 640px)
  const thumbnail = await compressImage(file, 640, 0.80);

  // 3. LQIP (max 20px, high compression base64)
  const lqipStr = await generateLQIP(file);

  return { main, thumbnail, lqip: lqipStr };
}

async function generateLQIP(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const maxDim = 360;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.4));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Failed to load image for LQIP'));
    img.src = URL.createObjectURL(file);
  });
}
