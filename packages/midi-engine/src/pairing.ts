import type { PerformedNote, RawMidiEvent } from "@keyboard-sensei/shared-types";

export function pairRawMidiEvents(events: RawMidiEvent[]): PerformedNote[] {
  const ordered = events.map((event, index) => ({ event, index })).sort((a, b) => a.event.timestampMs - b.event.timestampMs || a.index - b.index);
  const active = new Map<number, PerformedNote[]>();
  const result: PerformedNote[] = [];
  for (const { event } of ordered) {
    const isOn = event.type === "noteon" && event.velocity > 0;
    if (isOn) {
      const note: PerformedNote = { note: event.note, velocity: event.velocity, startTimestampMs: event.timestampMs, endTimestampMs: null, durationMs: null };
      result.push(note);
      const queue = active.get(event.note) ?? [];
      queue.push(note);
      active.set(event.note, queue);
      continue;
    }
    const queue = active.get(event.note);
    const note = queue?.shift();
    if (!note) continue;
    note.endTimestampMs = Math.max(event.timestampMs, note.startTimestampMs);
    note.durationMs = note.endTimestampMs - note.startTimestampMs;
    if (queue?.length === 0) active.delete(event.note);
  }
  return result.sort((a, b) => a.startTimestampMs - b.startTimestampMs);
}
