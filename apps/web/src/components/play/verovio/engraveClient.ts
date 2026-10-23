import type { EngraveRequest, EngraveResponse, Engraving } from "./engraveProtocol";

/**
 * Engraves MEI in a Web Worker, created on first use. One worker for the page; it
 * handles requests in order, so a newer request for the same panel simply queues
 * behind an older one (callers drop results they no longer want).
 */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (engraving: Engraving) => void; reject: (error: Error) => void }>();

const failAll = (error: Error) => {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
  worker?.terminate();
  worker = null;
};

const workerInstance = (): Worker => {
  if (worker) return worker;
  const created = new Worker(new URL("./verovioWorker.ts", import.meta.url), { type: "module" });
  created.addEventListener("message", (event: MessageEvent<EngraveResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve({ pages: response.pages, timemap: response.timemap });
    else request.reject(new Error(response.message));
  });
  // A crashed or unloadable worker fails every waiting request; the next call starts a new one.
  created.addEventListener("error", () => failAll(new Error("The engraver stopped unexpectedly")));
  worker = created;
  return created;
};

export function engrave(options: Omit<EngraveRequest, "id">): Promise<Engraving> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      workerInstance().postMessage({ id, ...options } satisfies EngraveRequest);
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
