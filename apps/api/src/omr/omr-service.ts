/**
 * Client for the sheet-music recognition service (services/omr): PDF or image bytes in,
 * MusicXML out. The service runs homr (AGPL-3.0) as a separate program in its own
 * container; this side only speaks HTTP to it.
 */

export class OmrError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** The status the API answers with when this ends a request directly. */
    readonly status = 422,
  ) {
    super(message);
  }
}

export interface Recognised {
  musicXml: Uint8Array;
  pages: number;
}

/** The service's own limit is 240 s of recognition; allow for the upload and model loading. */
const REQUEST_TIMEOUT_MS = 300_000;

const UNAVAILABLE = "Sheet-music recognition is unavailable right now. Try again later.";

export async function recognizeSheetMusic(serviceUrl: string, bytes: Uint8Array): Promise<Recognised> {
  let response: Response;
  try {
    response = await fetch(new URL("/recognize", serviceUrl), {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Blob([new Uint8Array(bytes)]),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new OmrError("timeout", "Recognition took too long. Try fewer pages, or one page at a time.", 504);
    }
    throw new OmrError("omr_unavailable", UNAVAILABLE, 503);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    // The service's own messages are written for the uploader (see services/omr/server.py).
    if (body?.error?.message && response.status < 500) {
      throw new OmrError(body.error.code ?? "omr_failed", body.error.message, response.status);
    }
    if (response.status === 504) throw new OmrError("timeout", body?.error?.message ?? "Recognition took too long.", 504);
    throw new OmrError("omr_unavailable", UNAVAILABLE, 503);
  }
  return {
    musicXml: new Uint8Array(await response.arrayBuffer()),
    pages: Number(response.headers.get("x-omr-pages") ?? 1),
  };
}

/** What the uploaded bytes are, by their magic bytes; the service checks again. */
export function sheetMusicKind(bytes: Uint8Array): "pdf" | "png" | "jpeg" | null {
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head.length === 8 && head.readUInt32BE(0) === 0x89504e47 && head.readUInt32BE(4) === 0x0d0a1a0a) return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  return null;
}
