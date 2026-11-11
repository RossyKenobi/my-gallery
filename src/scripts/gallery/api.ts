import { generateImageVersions } from '../compress';

const UPLOAD_API = '/api/upload';
const POSTS_API = '/api/posts';

export async function uploadToR2(file: Blob, filename: string, onProgress?: (percent: number) => void): Promise<{ finalImageUrl: string, thumbnailUrl?: string, lqip?: string }> {
  const { main, thumbnail, lqip } = await generateImageVersions(file);

  const formData = new FormData();
  formData.append('filename', filename);
  formData.append('file', main, filename);
  formData.append('thumbnail', thumbnail, 'thumb_' + filename);
  formData.append('lqip', lqip);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_API);
    
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      };
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {}
      
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve({
          finalImageUrl: data.finalImageUrl,
          thumbnailUrl: data.thumbnailUrl,
          lqip: data.lqip
        });
      } else {
        reject(new Error((data && data.error) || `Upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)![1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

export async function savePostsToR2(posts: any[], scope?: string) {
  let url = POSTS_API;
  if (scope) url += `?scope=${scope}`;
  // Send only lightweight ordering & visibility metadata — never bulk-rewrite photos (GA-07)
  const payload = posts.map((p: any) => ({
    id: p.id,
    is_hidden_from_global: Boolean(p.is_hidden_from_global),
  }));
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save posts');
}

export async function updateStackInR2(
  stackId: string,
  payload: { caption: string; author: string; images: any[] }
): Promise<{ images?: any[] }> {
  const res = await fetch(`/api/stacks/${encodeURIComponent(stackId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let errMsg = 'Failed to update album';
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}
