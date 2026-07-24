type Client = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();
const clients = new Set<Client>();

export function addSseClient(controller: Client) {
  clients.add(controller);
  controller.enqueue(encoder.encode(': connected\n\n'));
  return () => clients.delete(controller);
}

export function broadcastUpdate(type: string, payload: Record<string, unknown> = {}) {
  const message = encoder.encode(
    `event: update\ndata: ${JSON.stringify({ type, ...payload })}\n\n`
  );

  for (const client of Array.from(clients)) {
    try {
      client.enqueue(message);
    } catch {
      clients.delete(client);
    }
  }
}

setInterval(() => {
  const ping = encoder.encode(': ping\n\n');
  for (const client of Array.from(clients)) {
    try {
      client.enqueue(ping);
    } catch {
      clients.delete(client);
    }
  }
}, 30000);
