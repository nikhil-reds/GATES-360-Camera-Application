import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { broadcastUpdate } from '@/server/realtime';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { isVisible } = await request.json();
    const image = await prisma.eventImage.update({
      where: { id },
      data: { isVisible },
    });

    broadcastUpdate('content-updated', { action: 'image-updated' });
    return NextResponse.json(image);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.eventImage.delete({ where: { id } });
    broadcastUpdate('content-updated', { action: 'image-deleted' });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
