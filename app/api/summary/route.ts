import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

export async function GET() {
  try {
    const certificates = await prisma.certificate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const submissions = certificates.map((c) => ({
      id: c.id,
      name: c.userName,
      email: c.userEmail,
      team: c.teamName || '',
      imageUrl: c.imageUrl,
      certificateGenerated: Boolean(c.certificateUrl),
    }));

    return NextResponse.json({ totalSubmissions: certificates.length, submissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
