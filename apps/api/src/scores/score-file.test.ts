import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeScoreFile, MAX_SCORE_TEXT_BYTES } from "./score-file.js";

const PARTWISE = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<!-- a comment -->\n<score-partwise version="4.0"/>`;
const CONTAINER = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="music/score.xml"/></rootfiles></container>`;

describe("decodeScoreFile", () => {
  it("reads plain MusicXML by its root element, past the prolog", () => {
    expect(decodeScoreFile(strToU8(PARTWISE))).toMatchObject({ kind: "musicxml", format: "musicxml" });
  });

  it("reads MEI", () => {
    expect(decodeScoreFile(strToU8(`<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei"/>`))).toMatchObject({ kind: "mei", format: "mei" });
  });

  it("reads UTF-16 MusicXML with a byte-order mark", () => {
    const text = `﻿${PARTWISE}`;
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      bytes[i * 2] = text.charCodeAt(i) & 0xff;
      bytes[i * 2 + 1] = text.charCodeAt(i) >> 8;
    }
    expect(decodeScoreFile(bytes).format).toBe("musicxml");
  });

  it("unzips an .mxl to the root file its container names", () => {
    const mxl = zipSync({ "META-INF/container.xml": strToU8(CONTAINER), "music/score.xml": strToU8(PARTWISE) });
    const decoded = decodeScoreFile(mxl);
    expect(decoded).toMatchObject({ kind: "mxl", format: "musicxml" });
    expect(decoded.text).toContain("<score-partwise");
  });

  it("refuses an .mxl that would expand past the limit, before inflating it", () => {
    // Zeros compress to almost nothing: a tiny upload declaring a huge file.
    const bomb = zipSync({ "META-INF/container.xml": strToU8(CONTAINER), "music/score.xml": new Uint8Array(MAX_SCORE_TEXT_BYTES + 1) });
    expect(bomb.length).toBeLessThan(100_000);
    expect(() => decodeScoreFile(bomb)).toThrow(/20 MB/);
  });

  it("refuses timewise MusicXML, other XML, binary and broken zips", () => {
    expect(() => decodeScoreFile(strToU8(`<score-timewise/>`))).toThrow(/Timewise/);
    expect(() => decodeScoreFile(strToU8(`<svg/>`))).toThrow("This isn't a MusicXML or MEI score");
    expect(() => decodeScoreFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x80]))).toThrow("This isn't a MusicXML or MEI score");
    expect(() => decodeScoreFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(/zip/);
  });
});
