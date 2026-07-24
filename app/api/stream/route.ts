import { addSseClient } from '@/server/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let removeClient: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      removeClient = addSseClient(controller);
    },
    cancel() {
      removeClient?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
