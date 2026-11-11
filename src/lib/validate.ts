// Server-side validation for user-supplied gallery data (GA-04).
// Everything here ends up in HTML attributes / CSS on every visitor's page.

const PUBLIC_IMAGE_PREFIX = 'https://img.penumbrae.uk/';
const LEGACY_IMAGE_PREFIX = '/images/posts/';
const LQIP_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidStackId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (url.startsWith(LEGACY_IMAGE_PREFIX)) return !url.includes('..') && /^[A-Za-z0-9_./%-]+$/.test(url);
  if (!url.startsWith(PUBLIC_IMAGE_PREFIX)) return false;
  try {
    return new URL(url).hostname === 'img.penumbrae.uk';
  } catch {
    return false;
  }
}

export interface CleanImage {
  url: string;
  thumbnail_url: string | null;
  lqip: string | null;
  isPortrait: boolean | null;
}

/**
 * Normalises one image entry (string URL or object). Returns null if the main URL is not acceptable.
 * Optional fields that fail validation are dropped rather than rejected.
 */
export function cleanImage(img: unknown): CleanImage | null {
  const obj: any = typeof img === 'string' ? { url: img } : img;
  if (!obj || typeof obj !== 'object' || !isValidImageUrl(obj.url)) return null;
  return {
    url: obj.url,
    thumbnail_url: isValidImageUrl(obj.thumbnail_url) ? obj.thumbnail_url : null,
    lqip: typeof obj.lqip === 'string' && LQIP_RE.test(obj.lqip) ? obj.lqip : null,
    isPortrait: typeof obj.isPortrait === 'boolean' ? obj.isPortrait : null,
  };
}

/** All-or-nothing: returns null if any entry is invalid, so a stack is never partially rewritten. */
export function cleanImages(images: unknown): CleanImage[] | null {
  if (!Array.isArray(images)) return null;
  const out: CleanImage[] = [];
  for (const img of images) {
    const c = cleanImage(img);
    if (!c) return null;
    out.push(c);
  }
  return out;
}
