import { describe, expect, it } from "vitest";
import { MidiEventHub, MockMidiAdapter, dispatchMidiMessage } from "./adapters.js";

describe("MockMidiAdapter", () => {
  it("delivers every event to every subscriber, and stops after unsubscribe", () => {
    const adapter = new MockMidiAdapter(() => 42);
    const a: number[] = [];
    const b: number[] = [];
    const offA = adapter.onNoteOn((note) => a.push(note));
    adapter.onNoteOn((note) => b.push(note));

    adapter.triggerNoteOn(60);
    offA();
    adapter.triggerNoteOn(62);

    expect(a).toEqual([60]);
    expect(b).toEqual([60, 62]);
  });

  it("stamps events with the owner's clock unless a timestamp is given", () => {
    const adapter = new MockMidiAdapter(() => 1234.5);
    const stamps: number[] = [];
    adapter.onNoteOff((_note, timestampMs) => stamps.push(timestampMs));
    adapter.onControlChange((_controller, _value, timestampMs) => stamps.push(timestampMs));

    adapter.triggerNoteOff(60);
    adapter.triggerNoteOff(60, 99);
    adapter.triggerControlChange(64, 127);

    expect(stamps).toEqual([1234.5, 99, 1234.5]);
  });

  it("a StrictMode-style subscribe, unsubscribe, subscribe cycle leaves exactly one live registration", () => {
    const adapter = new MockMidiAdapter(() => 0);
    const seen: number[] = [];
    const listener = (note: number) => seen.push(note);
    const first = adapter.onNoteOn(listener);
    first();
    adapter.onNoteOn(listener);
    adapter.triggerNoteOn(60);
    expect(seen).toEqual([60]);
  });
});

describe("dispatchMidiMessage", () => {
  const collect = () => {
    const hub = new MidiEventHub();
    const events: string[] = [];
    hub.onNoteOn((note, velocity, t) => events.push(`on ${note} ${velocity} @${t}`));
    hub.onNoteOff((note, t) => events.push(`off ${note} @${t}`));
    hub.onControlChange((controller, value, t) => events.push(`cc ${controller}=${value} @${t}`));
    return { hub, events };
  };

  it("decodes note-on, note-off, velocity-0 note-on and control change on any channel", () => {
    const { hub, events } = collect();
    dispatchMidiMessage(hub, [0x90, 60, 100], 1);
    dispatchMidiMessage(hub, [0x80, 60, 0], 2);
    dispatchMidiMessage(hub, [0x93, 62, 0], 3);
    dispatchMidiMessage(hub, [0xb0, 64, 127], 4);
    expect(events).toEqual(["on 60 100 @1", "off 60 @2", "off 62 @3", "cc 64=127 @4"]);
  });

  it("ignores other message types", () => {
    const { hub, events } = collect();
    dispatchMidiMessage(hub, [0xe0, 0, 64], 1); // pitch bend
    dispatchMidiMessage(hub, [0xf8], 2); // clock
    expect(events).toEqual([]);
  });
});
