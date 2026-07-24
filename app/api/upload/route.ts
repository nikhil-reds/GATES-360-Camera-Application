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

    const folder = String(formData.get('folder') || 'uploads');
    const uid = formData.get('uid');
    const { url } = await saveUploadedFile(file, folder, uid ? String(uid) : undefined);
    const groupNameValue = formData.get('groupName');
    const saveToDb = formData.get('saveToDb');

    if (groupNameValue || saveToDb === 'true') {
      const groupName = String(groupNameValue || '').trim() || 'Uploaded Image';
      const image = await prisma.eventImage.create({
        data: { url, groupName, timestamp: Date.now(), isVisible: true },
      });
      broadcastUpdate('content-updated', { action: 'image-created' });
      return NextResponse.json({ url, image }, { status: 201 });
    }

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
