import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { fetchStoredObject, mimeTypeFromPath, uploadDir } from '@/server/uploads';

type Params = { params: Promise<{ id: string }> };

const imageExtensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function safeDownloadName(groupName: string, mimeType: string) {
  const baseName = groupName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'group_image';
  const extension = imageExtensionByMimeType[mimeType] || 'jpg';
  return baseName + '.' + extension;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(_request.url);
    const isInline = searchParams.get('inline') === '1';
    const image = await prisma.eventImage.findUnique({ where: { id } });

    if (!image) {
      return NextResponse.json({ error: 'Group image not found' }, { status: 404 });
    }

    let imageBuffer: Buffer;
    let mimeType = 'image/jpeg';

    if (image.url.startsWith('data:')) {
      const dataUrlMatch = image.url.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
      if (!dataUrlMatch) {
        return NextResponse.json({ error: 'Stored group image is invalid' }, { status: 422 });
      }
      mimeType = dataUrlMatch[1] || mimeType;
      imageBuffer = dataUrlMatch[2]
        ? Buffer.from(dataUrlMatch[3], 'base64')
        : Buffer.from(decodeURIComponent(dataUrlMatch[3]), 'utf8');
    } else if (image.url.startsWith('/uploads/')) {
      const uploadPath = path.join(uploadDir, path.basename(image.url));
      imageBuffer = await fs.readFile(uploadPath);
      mimeType = mimeTypeFromPath(uploadPath);
    } else {
      const remoteUrl = new URL(image.url);
      if (!['http:', 'https:'].includes(remoteUrl.protocol)) {
        return NextResponse.json({ error: 'Stored image URL is not downloadable' }, { status: 422 });
      }
      const remoteResponse = (await fetchStoredObject(image.url)) || (await fetch(remoteUrl));
      if (!remoteResponse.ok) {
        return NextResponse.json({ error: 'Unable to retrieve the stored group image' }, { status: 502 });
      }
      mimeType = remoteResponse.headers.get('content-type')?.split(';')[0] || mimeType;
      imageBuffer = Buffer.from(await remoteResponse.arrayBuffer());
    }

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(imageBuffer.length),
        'Content-Disposition':
          (isInline ? 'inline' : 'attachment') +
          '; filename="' +
          safeDownloadName(image.groupName, mimeType) +
          '"',
        'Cache-Control': isInline ? 'private, max-age=60' : 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download group image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
