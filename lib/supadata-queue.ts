// Supadata's API rejects concurrent requests with 429 even across different
// videoIds, so every Supadata fetch must be serialized through this queue.
// All Supadata-backed providers (transcript, video-info, ...) must wrap their
// outbound fetches in `runSerial`. State lives on globalThis so Next.js dev /
// Turbopack module reloads don't reset the chain mid-flight.

const STATE_KEY = '__vidinsight_supadata_queue__';
const g = globalThis as unknown as Record<string, { tail: Promise<unknown> }>;
const state = g[STATE_KEY] ?? { tail: Promise.resolve() };
g[STATE_KEY] = state;

export function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const next = state.tail.then(task, task);
  state.tail = next.catch(() => undefined);
  return next;
}
