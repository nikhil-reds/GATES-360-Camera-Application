import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { broadcastUpdate } from '@/server/realtime';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showOnDisplay = searchParams.get('showOnDisplay');
    const limit = searchParams.get('limit');
    const where = showOnDisplay === null ? {} : { showOnDisplay: showOnDisplay === 'true' };

    const certificates = await prisma.certificate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? Number.parseInt(limit, 10) : undefined,
    });

    return NextResponse.json(certificates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch certificates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userName, userEmail, teamName, designation, groupName, imageUrl, certificateUrl, feedback, showOnDisplay, createdAt } = body;

    if (!userName || !userEmail || !groupName) {
      return NextResponse.json({ error: 'userName, userEmail, and groupName are required' }, { status: 400 });
    }

    const certificate = await prisma.certificate.create({
      data: {
        userName,
        userEmail,
        teamName,
        designation,
        groupName,
        imageUrl,
        certificateUrl,
        feedback,
        showOnDisplay: showOnDisplay ?? true,
        createdAt: createdAt || Date.now(),
      },
    });

    broadcastUpdate('certificate-submitted', { action: 'cert-created' });
    return NextResponse.json(certificate, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create certificate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json().catch(() => ({ ids: undefined }));

    if (ids && Array.isArray(ids)) {
      await prisma.certificate.deleteMany({ where: { id: { in: ids } } });
      broadcastUpdate('content-updated', { action: 'cert-bulk-deleted' });
      return NextResponse.json({ success: true, count: ids.length });
    }

    const deleted = await prisma.certificate.deleteMany({});
    broadcastUpdate('content-updated', { action: 'cert-cleared' });
    return NextResponse.json({ success: true, count: deleted.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete certificates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
