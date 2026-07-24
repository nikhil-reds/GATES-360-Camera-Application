import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { broadcastUpdate } from '@/server/realtime';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { showOnDisplay, groupName } = await request.json();
    const data: { showOnDisplay?: boolean; groupName?: string } = {};

    if (showOnDisplay !== undefined) data.showOnDisplay = showOnDisplay;
    if (groupName !== undefined) data.groupName = groupName;

    const certificate = await prisma.certificate.update({ where: { id }, data });
    broadcastUpdate('content-updated', { action: 'cert-updated' });
    return NextResponse.json(certificate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update certificate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id?.trim()) {
      return NextResponse.json({ error: 'Certificate id is required' }, { status: 400 });
    }

    const deleted = await prisma.certificate.deleteMany({ where: { id: id.trim() } });
    broadcastUpdate('content-updated', { action: 'cert-deleted' });
    return NextResponse.json({ success: true, deleted: deleted.count > 0, count: deleted.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete certificate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
