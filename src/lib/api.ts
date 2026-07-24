export type SummaryRecord = {
  id: string;
  name: string;
  email: string;
  team: string;
  imageUrl: string;
  certificateGenerated: boolean;
};

export interface EventImage {
  id: string;
  url: string;
  groupName: string;
  timestamp: number;
  isVisible: boolean;
}

export interface CertificateRecord {
  id: string;
  userName: string;
  userEmail: string;
  groupName: string;
  imageUrl: string;
  teamName?: string;
  designation?: string;
  certificateUrl?: string;
  feedback?: string;
  showOnDisplay?: boolean;
  gradient?: string;
  createdAt: number;
}

// Fetch the summary matching the expected ServerDetails structure
export const fetchSummary = async (): Promise<{ totalSubmissions: number; submissions: SummaryRecord[] }> => {
  const resp = await fetch('/api/summary');
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Failed to fetch summary');
  }
  return await resp.json();
};

// Upload file locally (with progress reporting)
export const uploadFile = async (
  file: File | Blob,
  uid: string,
  folder: string = 'certificates',
  onProgress?: (pct: number) => void
): Promise<string> => {
  const formData = new FormData();
  const originalName = file instanceof File ? file.name : `file_${Date.now()}.pdf`;
  formData.append('file', file, originalName);
  formData.append('folder', folder);
  formData.append('uid', uid);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onProgress(pct);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.url);
        } catch (e) {
          reject(new Error('Invalid upload response'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload network error'));
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
};

// Fetch images (optionally filter by isVisible)
export const fetchImages = async (isVisible?: boolean, limit?: number): Promise<EventImage[]> => {
  const params = new URLSearchParams();
  if (isVisible !== undefined) params.append('isVisible', String(isVisible));
  if (limit !== undefined) params.append('limit', String(limit));
  const queryString = params.toString();
  const url = queryString ? `/api/images?${queryString}` : '/api/images';
  
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error('Failed to fetch images');
  }
  return await resp.json();
};

// Create new image record
export const createImage = async (data: { url: string; groupName: string; timestamp: number }): Promise<EventImage> => {
  const resp = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Failed to create image');
  }
  return await resp.json();
};

// Upload image file and save record directly into DB
export const uploadImageToDB = async (file: File | Blob, groupName: string): Promise<EventImage> => {
  const formData = new FormData();
  const originalName = file instanceof File ? file.name : `image_${Date.now()}.jpg`;
  formData.append('file', file, originalName);
  formData.append('groupName', groupName);

  const resp = await fetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => null);
    throw new Error(err?.error || 'Failed to upload and save image to database');
  }
  return await resp.json();
};

// Update image visibility
export const updateImageVisibility = async (id: string, isVisible: boolean): Promise<EventImage> => {
  const resp = await fetch(`/api/images/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isVisible }),
  });
  if (!resp.ok) {
    throw new Error('Failed to update image visibility');
  }
  return await resp.json();
};

// Download the original group image through the API.
export const downloadGroupImage = async (id: string): Promise<{ blob: Blob; filename: string }> => {
  const resp = await fetch(`/api/images/${encodeURIComponent(id)}/download`);
  if (!resp.ok) {
    const result = await resp.json().catch(() => null);
    throw new Error(result?.error || 'Failed to download group image');
  }

  const disposition = resp.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);

  return {
    blob: await resp.blob(),
    filename: filenameMatch?.[1] || 'group_image.jpg',
  };
};

// Delete image
export const deleteImage = async (id: string): Promise<void> => {
  const resp = await fetch(`/api/images/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    throw new Error('Failed to delete image');
  }
};

// Fetch certificates (optionally filter by showOnDisplay)
export const fetchCertificates = async (showOnDisplay?: boolean, limit?: number): Promise<CertificateRecord[]> => {
  const params = new URLSearchParams();
  if (showOnDisplay !== undefined) params.append('showOnDisplay', String(showOnDisplay));
  if (limit !== undefined) params.append('limit', String(limit));
  const queryString = params.toString();
  const url = queryString ? `/api/certificates?${queryString}` : '/api/certificates';
  
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error('Failed to fetch certificates');
  }
  return await resp.json();
};

// Create new certificate
export const createCertificate = async (data: Omit<CertificateRecord, 'id'>): Promise<CertificateRecord> => {
  const resp = await fetch('/api/certificates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Failed to create certificate');
  }
  return await resp.json();
};

// Update certificate fields (like display status or group name)
export const updateCertificate = async (id: string, data: { showOnDisplay?: boolean; groupName?: string }): Promise<CertificateRecord> => {
  const resp = await fetch(`/api/certificates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    throw new Error('Failed to update certificate');
  }
  return await resp.json();
};

// Update certificate display status
export const updateCertificateDisplay = async (id: string, showOnDisplay: boolean): Promise<CertificateRecord> => {
  return updateCertificate(id, { showOnDisplay });
};

// Delete single certificate
export const deleteCertificate = async (id: string): Promise<void> => {
  const resp = await fetch(`/api/certificates/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    const result = await resp.json().catch(() => null);
    throw new Error(result?.error || 'Failed to delete certificate');
  }
};

// Bulk delete certificates (or clear all if ids is omitted)
export const bulkDeleteCertificates = async (ids?: string[]): Promise<void> => {
  const resp = await fetch('/api/certificates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!resp.ok) {
    throw new Error('Failed to delete certificates');
  }
};
