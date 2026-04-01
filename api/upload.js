import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = 'my-gallery-images';

export const config = {
  api: {
    bodyParser: false, // We'll parse the multipart form data ourselves
  },
};

// Simple multipart parser for Vercel serverless
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';

      // Check if it's JSON (fallback for small files)
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(buffer.toString('utf-8'));
          const fileBuffer = Buffer.from(json.fileData, 'base64');
          resolve({ filename: json.filename, contentType: json.contentType, buffer: fileBuffer });
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
        return;
      }

      // Parse multipart/form-data
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        reject(new Error('No boundary found'));
        return;
      }

      const parts = buffer.toString('binary').split('--' + boundary);
      let filename = '';
      let fileContentType = 'image/jpeg';
      let fileBuffer = null;

      for (const part of parts) {
        if (part.includes('name="file"')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;

          const headers = part.substring(0, headerEnd);
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          if (filenameMatch) filename = filenameMatch[1];

          const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
          if (ctMatch) fileContentType = ctMatch[1].trim();

          const body = part.substring(headerEnd + 4);
          // Remove trailing \r\n
          const cleaned = body.replace(/\r\n$/, '');
          fileBuffer = Buffer.from(cleaned, 'binary');
        } else if (part.includes('name="filename"')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            filename = part.substring(headerEnd + 4).replace(/\r\n$/, '').trim();
          }
        }
      }

      if (!fileBuffer) {
        reject(new Error('No file found in upload'));
        return;
      }

      resolve({ filename, contentType: fileContentType, buffer: fileBuffer });
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, contentType, buffer } = await parseMultipart(req);

    if (!filename || !buffer) {
      return res.status(400).json({ error: 'filename and file data are required' });
    }

    const key = `posts/${filename}`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'image/jpeg',
    }));

    const finalImageUrl = `https://img.nitakupenda.eu.cc/${key}`;

    return res.status(200).json({ finalImageUrl });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
