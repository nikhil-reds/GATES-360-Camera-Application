import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';

export const uploadDir = path.join(process.cwd(), 'public', 'uploads');

type UploadFolder = 'content' | 'certificates' | string;

const bucketName =
  process.env.GCS_BUCKET_NAME ||
  process.env.GOOGLE_CLOUD_BUCKET ||
  process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
  process.env.GOOGLE_STORAGE_BUCKET;

const clientEmail =
  process.env.GCS_CLIENT_EMAIL ||
  process.env.GOOGLE_CLIENT_EMAIL ||
  process.env.GOOGLE_CLOUD_CLIENT_EMAIL;

const privateKey = (
  process.env.GCS_PRIVATE_KEY ||
  process.env.GOOGLE_PRIVATE_KEY ||
  process.env.GOOGLE_CLOUD_PRIVATE_KEY ||
  ''
).replace(/\\n/g, '\n');

const projectId =
  process.env.GCS_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GOOGLE_PROJECT_ID;

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const fileCredentials =
  credentialsPath && fs.existsSync(credentialsPath)
    ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    : null;

const fileAuthClient = fileCredentials
  ? new GoogleAuth({
      credentials: fileCredentials,
      scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
    })
  : null;

const envAuthClient =
  !fileAuthClient && clientEmail && privateKey
    ? new GoogleAuth({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
      })
    : null;

const authClient = fileAuthClient || envAuthClient;

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';

const publicUrlForObject = (objectName: string) => {
  const baseUrl = process.env.GCS_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (baseUrl) return `${baseUrl}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
  return `https://storage.googleapis.com/${bucketName}/${objectName
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
};

function objectNameFromStorageUrl(url: string) {
  if (!bucketName) return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'storage.googleapis.com') {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts[0] === bucketName && parts.length > 1) {
        return parts.slice(1).map(decodeURIComponent).join('/');
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchStoredObject(url: string) {
  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME is required to read files from Google Cloud Storage');
  }

  const objectName = objectNameFromStorageUrl(url);
  if (!objectName) return null;

  if (!authClient) {
    throw new Error('Google Cloud credentials are required to read files from Google Cloud Storage');
  }

  const accessToken = await authClient.getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get Google Cloud access token');
  }

  const objectUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(objectName)}?alt=media`;

  return fetch(objectUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function saveUploadedFile(file: File, folder: UploadFolder = 'uploads', uid?: string) {
  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME is required to upload files to Google Cloud Storage');
  }

  if (!authClient) {
    throw new Error('Google Cloud credentials are required to upload files to Google Cloud Storage');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const cleanFolder = sanitizePathPart(folder);
  const cleanName = sanitizePathPart(file.name);
  const prefix = uid ? sanitizePathPart(uid) : Date.now().toString();
  const filename = `${prefix}_${Date.now()}_${cleanName}`;
  const objectName = `${cleanFolder}/${filename}`;
  const contentType = file.type || 'application/octet-stream';

  const accessToken = await authClient.getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get Google Cloud access token');
  }

  const boundary = `gcs-upload-${Date.now()}`;
  const metadata = JSON.stringify({
    name: objectName,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const uploadBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o?uploadType=multipart`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(uploadBody.length),
    },
    body: uploadBody,
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.error?.message || `Google Cloud Storage upload failed with status ${response.status}`
    );
  }

  await response.json().catch(() => null);

  return {
    filename,
    objectName,
    url: publicUrlForObject(objectName),
    contentType,
    size: bytes.length,
  };
}

export async function saveUploadedFileWithStorageClient(
  file: File,
  folder: UploadFolder = 'uploads',
  uid?: string
) {
  return saveUploadedFile(file, folder, uid);
}

export function mimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}
