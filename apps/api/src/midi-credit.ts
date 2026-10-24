/**
 * Embed a credit line in a Standard MIDI File as a Copyright Notice meta event (FF 02 len text).
 *
 * This edits the file at chunk/event level instead of decoding and re-encoding it, so every
 * other byte of the file survives: note events, tempo map, running status, delta times, other
 * meta events, unknown chunks and trailing bytes. What changes: the event itself, the length of
 * the track chunk that holds it, and (only if an existing copyright event was removed from
 * somewhere other than tick 0) the delta time of the event after it, which absorbs the removed
 * event's delta so nothing after it moves in time.
 *
 * Rules:
 *   - Any existing Copyright Notice events (in any track) are removed; the new one is the only one.
 *   - The new event is the first event of the first track (delta 0, i.e. tick 0).
 *   - Text encoding: 7-bit ASCII. The meta event is raw bytes with no declared charset, and
 *     players disagree about Latin-1 vs UTF-8, so the text is transliterated to ASCII
 *     (accents stripped, (c) for the copyright sign, quotes and dashes flattened, anything else
 *     becomes "?"), which reads the same under every interpretation. Control characters become
 *     spaces. Meta lengths are variable-length quantities, so long credit lines are written whole.
 */

export class MidiStructureError extends Error {}

const ASCII_MAP: Record<string, string> = {
  "©": "(c)", "®": "(R)", "™": "(TM)", "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "…": "...", " ": " ", "ß": "ss", "æ": "ae", "Æ": "AE", "ø": "o", "Ø": "O", "œ": "oe", "Œ": "OE",
};

/** Transliterate to printable 7-bit ASCII (see the encoding note above). */
export function toAscii(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const mapped = ASCII_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    for (const c of base) {
      const code = c.codePointAt(0)!;
      if (code < 0x20 || code === 0x7f) out += " ";
      else out += code < 0x7f ? c : "?";
    }
  }
  return out.replace(/ {2,}/g, " ").trim();
}

const encodeVlq = (value: number): number[] => {
  const bytes = [value & 0x7f];
  for (let v = value >>> 7; v > 0; v >>>= 7) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
};

interface Cursor {
  pos: number;
}

function readVlq(buf: Buffer, cur: Cursor, end: number): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    if (cur.pos >= end) throw new MidiStructureError("Truncated variable-length quantity");
    const byte = buf[cur.pos++];
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new MidiStructureError("Variable-length quantity too long");
}

const DATA_BYTES: Record<number, number> = { 0x80: 2, 0x90: 2, 0xa0: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2 };

/** One parsed event: byte range of the whole event including its delta, plus what we need to find copyrights. */
interface TrackEvent {
  start: number; // start of the delta time
  eventStart: number; // start of the status byte (after delta)
  end: number;
  delta: number;
  copyright: boolean;
}

function parseTrackEvents(buf: Buffer, from: number, to: number): TrackEvent[] {
  const events: TrackEvent[] = [];
  const cur: Cursor = { pos: from };
  let running = 0;
  while (cur.pos < to) {
    const start = cur.pos;
    const delta = readVlq(buf, cur, to);
    const eventStart = cur.pos;
    if (cur.pos >= to) throw new MidiStructureError("Track ends after a delta time");
    let status = buf[cur.pos];
    let copyright = false;
    if (status === 0xff) {
      cur.pos++;
      if (cur.pos >= to) throw new MidiStructureError("Truncated meta event");
      const type = buf[cur.pos++];
      const len = readVlq(buf, cur, to);
      if (cur.pos + len > to) throw new MidiStructureError("Meta event overruns its track");
      cur.pos += len;
      copyright = type === 0x02;
      running = 0;
    } else if (status === 0xf0 || status === 0xf7) {
      cur.pos++;
      const len = readVlq(buf, cur, to);
      if (cur.pos + len > to) throw new MidiStructureError("SysEx event overruns its track");
      cur.pos += len;
      running = 0;
    } else {
      if (status & 0x80) {
        running = status;
        cur.pos++;
      } else if (!running) {
        throw new MidiStructureError("Data byte with no running status");
      } else {
        status = running;
      }
      const need = DATA_BYTES[running & 0xf0];
      if (need === undefined) throw new MidiStructureError("Unsupported status byte");
      cur.pos += need;
      if (cur.pos > to) throw new MidiStructureError("Channel event overruns its track");
    }
    events.push({ start, eventStart, end: cur.pos, delta, copyright });
  }
  return events;
}

interface Chunk {
  type: string;
  start: number; // chunk header start
  bodyStart: number;
  bodyEnd: number;
}

function readChunks(buf: Buffer): Chunk[] {
  if (buf.length < 14 || buf.toString("latin1", 0, 4) !== "MThd") throw new MidiStructureError("Not a Standard MIDI File");
  const chunks: Chunk[] = [];
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos + 4);
    const bodyEnd = pos + 8 + len;
    if (bodyEnd > buf.length) throw new MidiStructureError("Chunk overruns the file");
    chunks.push({ type: buf.toString("latin1", pos, pos + 4), start: pos, bodyStart: pos + 8, bodyEnd });
    pos = bodyEnd;
  }
  return chunks;
}

/** Every Copyright Notice (FF 02) text in the file, in file order, decoded as Latin-1. */
export function readCopyrightNotices(buf: Buffer): string[] {
  const notices: string[] = [];
  for (const chunk of readChunks(buf).filter((c) => c.type === "MTrk")) {
    for (const ev of parseTrackEvents(buf, chunk.bodyStart, chunk.bodyEnd)) {
      if (!ev.copyright) continue;
      const cur: Cursor = { pos: ev.eventStart + 2 };
      const len = readVlq(buf, cur, ev.end);
      notices.push(buf.toString("latin1", cur.pos, cur.pos + len));
    }
  }
  return notices;
}

/** Return `buf` with `credit` as the file's only Copyright Notice, at tick 0 of the first track. */
export function embedCopyright(buf: Buffer, credit: string): Buffer {
  const chunks = readChunks(buf);
  const tracks = chunks.filter((c) => c.type === "MTrk");
  if (tracks.length === 0) throw new MidiStructureError("MIDI file has no tracks");
  const text = Buffer.from(toAscii(credit), "latin1");
  const meta = Buffer.from([0x00, 0xff, 0x02, ...encodeVlq(text.length), ...text]);

  const parts: Buffer[] = [];
  let pos = 0;
  for (const chunk of chunks) {
    if (chunk.type !== "MTrk") continue;
    parts.push(buf.subarray(pos, chunk.start));
    const events = parseTrackEvents(buf, chunk.bodyStart, chunk.bodyEnd);
    const pieces: Buffer[] = chunk === tracks[0] ? [meta] : [];
    let carry = 0; // delta of removed events, added to the next kept event
    for (const ev of events) {
      if (ev.copyright) {
        carry += ev.delta;
        continue;
      }
      if (carry > 0) {
        pieces.push(Buffer.from(encodeVlq(ev.delta + carry)), buf.subarray(ev.eventStart, ev.end));
        carry = 0;
      } else {
        pieces.push(buf.subarray(ev.start, ev.end));
      }
    }
    // A removed event at the very end of the track (no following event): keep its delta on the end-of-track only
    // if there was one; a track always ends with FF 2F, so carry is only left over for malformed input.
    if (carry > 0) throw new MidiStructureError("Track ends with a copyright event and no end-of-track");
    const body = Buffer.concat(pieces);
    const header = Buffer.alloc(8);
    header.write("MTrk", 0, "latin1");
    header.writeUInt32BE(body.length, 4);
    parts.push(header, body);
    pos = chunk.bodyEnd;
  }
  parts.push(buf.subarray(pos));
  return Buffer.concat(parts);
}
