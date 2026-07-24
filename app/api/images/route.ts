import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { broadcastUpdate } from '@/server/realtime';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isVisible = searchParams.get('isVisible');
    const limit = searchParams.get('limit');
    const where = isVisible === null ? {} : { isVisible: isVisible === 'true' };

    const images = await prisma.eventImage.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit ? Number.parseInt(limit, 10) : undefined,
    });

    return NextResponse.json(images);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, groupName, timestamp, isVisible } = body;

    if (!url || !groupName) {
      return NextResponse.json({ error: 'Url and groupName are required' }, { status: 400 });
    }

    const image = await prisma.eventImage.create({
      data: {
        url,
        groupName: String(groupName).trim(),
        timestamp: timestamp || Date.now(),
        isVisible: isVisible !== undefined ? Boolean(isVisible) : true,
      },
    });

    broadcastUpdate('content-updated', { action: 'image-created' });
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
