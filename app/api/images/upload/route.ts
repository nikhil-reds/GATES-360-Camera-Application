import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { broadcastUpdate } from '@/server/realtime';
import { saveUploadedFile } from '@/server/uploads';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const groupName = String(formData.get('groupName') || '').trim() || 'General';
    const { url } = await saveUploadedFile(file, 'content');
    const image = await prisma.eventImage.create({
      data: { url, groupName, timestamp: Date.now(), isVisible: true },
    });

    broadcastUpdate('content-updated', { action: 'image-created' });
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save image to database';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
