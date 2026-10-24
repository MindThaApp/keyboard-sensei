import { describe, expect, it } from "vitest";
import {
  asciiFilename,
  availableDownloads,
  contentDispositionFor,
  downloadCredit,
  exportFileFor,
  isRedistributable,
  mayDownloadSong,
  sanitiseFilename,
  type ExportSong,
} from "./song-export.js";

const base: ExportSong = {
  title: "Song",
  uploader_id: null,
  public_eligible: false,
  file_licence: null,
  source_kind: null,
  file_path: "/data/x.mid",
  notation_path: null,
  score_path: null,
  artist: "Composer",
  attribution: null,
};
const upload: ExportSong = { ...base, uploader_id: "owner", source_kind: "upload", file_licence: "unknown" };
const scoreImport: ExportSong = { ...upload, notation_path: "/data/score-1.mei", score_path: "/data/score-1.mxl" };
const libraryFree: ExportSong = { ...base, public_eligible: true, source_kind: "essentials", file_licence: "cc-by-sa-2.5" };
const libraryRestricted: ExportSong = { ...base, public_eligible: false, source_kind: "adl", file_licence: "unknown" };

describe("mayDownloadSong: who x which song", () => {
  const cases: [string, ExportSong, { owner: boolean; other: boolean; admin: boolean }][] = [
    ["own upload", upload, { owner: true, other: false, admin: true }],
    ["score import", scoreImport, { owner: true, other: false, admin: true }],
    ["library, redistributable", libraryFree, { owner: true, other: true, admin: true }],
    ["library, restricted", libraryRestricted, { owner: false, other: false, admin: true }],
  ];
  for (const [name, song, expected] of cases) {
    it(name, () => {
      expect(mayDownloadSong(song, "owner", false), "uploader/any user").toBe(expected.owner);
      expect(mayDownloadSong(song, "other", false), "other user").toBe(expected.other);
      expect(mayDownloadSong(song, "other", true), "admin").toBe(expected.admin);
    });
  }
});

describe("licence gate", () => {
  const lib = (over: Partial<ExportSong>): ExportSong => ({ ...libraryFree, ...over });
  it("allows public domain and CC BY / BY-SA files from cleared sources", () => {
    for (const file_licence of ["public-domain", "cc-by-4.0", "cc-by-sa-2.5", "cc-by-sa-3.0-de"]) {
      expect(isRedistributable(lib({ file_licence })), file_licence).toBe(true);
    }
  });
  it("refuses non-commercial, unknown and missing licences even when flagged eligible", () => {
    for (const file_licence of ["cc-by-nc-4.0", "cc-by-nc-sa-4.0", "unknown", "all-rights-reserved", null]) {
      expect(isRedistributable(lib({ file_licence })), String(file_licence)).toBe(false);
    }
  });
  it("refuses sources that are never redistributed, and anything the catalogue did not clear", () => {
    for (const source_kind of ["adl", "archive", "upload", "recording", "unknown", null]) {
      expect(isRedistributable(lib({ source_kind })), String(source_kind)).toBe(false);
    }
    expect(isRedistributable(lib({ public_eligible: false }))).toBe(false);
  });
  it("never treats an uploaded song as redistributable (only its owner and admins may download)", () => {
    expect(isRedistributable({ ...libraryFree, uploader_id: "owner" })).toBe(false);
  });
});

describe("exportFileFor", () => {
  it("always has MIDI; score formats need a stored score", () => {
    expect(exportFileFor(upload, "midi")).toMatchObject({ file: "/data/x.mid", contentType: "audio/midi", extension: "mid" });
    expect(exportFileFor(upload, "musicxml")).toBeNull();
    expect(exportFileFor(upload, "mei")).toBeNull();
    // An archive import has MusicXML for viewing but no stored score.
    expect(exportFileFor({ ...upload, notation_path: "/data/a.mxl" }, "musicxml")).toBeNull();
  });
  it("serves the original MXL as MusicXML and Verovio's MEI as MEI", () => {
    expect(exportFileFor(scoreImport, "musicxml")).toMatchObject({ file: "/data/score-1.mxl", extension: "mxl", contentType: "application/vnd.recordare.musicxml" });
    expect(exportFileFor(scoreImport, "mei")).toMatchObject({ file: "/data/score-1.mei", extension: "mei", contentType: "application/mei+xml" });
  });
  it("handles uncompressed MusicXML and MEI originals", () => {
    const xml = { ...scoreImport, score_path: "/data/score-2.musicxml" };
    expect(exportFileFor(xml, "musicxml")).toMatchObject({ extension: "musicxml", contentType: "application/vnd.recordare.musicxml+xml" });
    const mei = { ...scoreImport, score_path: "/data/score-3.mei", notation_path: "/data/score-3.mei" };
    expect(exportFileFor(mei, "mei")?.file).toBe("/data/score-3.mei");
    expect(exportFileFor(mei, "musicxml")).toBeNull();
  });
});

describe("availableDownloads", () => {
  it("offers score formats only to those allowed and only when stored", () => {
    expect(availableDownloads(scoreImport, "owner", false)).toEqual({ midi: true, musicxml: true, mei: true });
    expect(availableDownloads(upload, "owner", false)).toEqual({ midi: true, musicxml: false, mei: false });
    expect(availableDownloads(scoreImport, "other", false)).toEqual({ midi: false, musicxml: false, mei: false });
    expect(availableDownloads(libraryRestricted, "other", false).midi).toBe(false);
    expect(availableDownloads(libraryRestricted, "other", true).midi).toBe(true);
  });
});

describe("sanitiseFilename", () => {
  it("strips path separators, control characters and quotes", () => {
    expect(sanitiseFilename("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitiseFilename("a\\b/c")).toBe("abc");
    expect(sanitiseFilename('He said "hi"\r\nX-Evil: 1')).toBe("He said hi X-Evil 1");
    expect(sanitiseFilename("nul\u0000byte\u007f")).toBe("nul byte");
    expect(sanitiseFilename("it's `x`")).toBe("its x");
  });
  it("trims dots and spaces, and collapses whitespace", () => {
    expect(sanitiseFilename("  ..hidden..  ")).toBe("hidden");
    expect(sanitiseFilename("a    b\t c")).toBe("a b c");
  });
  it("falls back to 'song' when nothing is left", () => {
    for (const t of ["", "   ", "...", "///", '"""', "\u0000\u0001"]) expect(sanitiseFilename(t), JSON.stringify(t)).toBe("song");
  });
  it("limits length by code points without splitting a character", () => {
    const long = sanitiseFilename("x".repeat(500));
    expect(long).toHaveLength(100);
    const emoji = sanitiseFilename("\u{1F3B9}".repeat(300));
    expect(Array.from(emoji)).toHaveLength(100);
    expect(emoji).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
  it("keeps Unicode letters", () => {
    expect(sanitiseFilename("Für Elise")).toBe("Für Elise");
  });
});

describe("asciiFilename", () => {
  it("transliterates accents and drops the rest", () => {
    expect(asciiFilename("Für Elise")).toBe("Fur Elise");
    expect(asciiFilename("Nocturne – Op. 9")).toBe("Nocturne Op. 9");
  });
  it("falls back to 'song' for names with no ASCII letters", () => {
    expect(asciiFilename("月の光")).toBe("song");
    expect(asciiFilename("..")).toBe("song");
  });
});

describe("contentDispositionFor", () => {
  it("emits an attachment with ASCII filename and RFC 5987 filename*", () => {
    expect(contentDispositionFor("Für Elise", "mid")).toBe(
      `attachment; filename="Fur Elise.mid"; filename*=UTF-8''F%C3%BCr%20Elise.mid`,
    );
  });
  it("percent-encodes the marks encodeURIComponent leaves bare", () => {
    expect(contentDispositionFor("Prelude (No. 1) *", "mei")).toBe(
      `attachment; filename="Prelude (No. 1).mei"; filename*=UTF-8''Prelude%20%28No.%201%29.mei`,
    );
  });
  it("cannot be used to inject header parameters or newlines", () => {
    const header = contentDispositionFor('x"; filename="evil.exe\r\nSet-Cookie: a=b', "mid");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/filename="/g)).toHaveLength(1);
    expect(header).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''[A-Za-z0-9%._~!-]*$/);
  });
  it("uses the fallback name for an empty title", () => {
    expect(contentDispositionFor("", "mxl")).toBe(`attachment; filename="song.mxl"; filename*=UTF-8''song.mxl`);
  });
});

describe("downloadCredit", () => {
  const cc: ExportSong = { ...libraryFree, artist: "Bach", attribution: "Prelude (Bach), typeset by Ann." };
  it("builds the credit from the catalogue for CC songs", () => {
    const credit = downloadCredit(cc, "u", false)!;
    expect(credit).toMatchObject({ required: true, summary: "by Bach, licence cc-by-sa-2.5", licence: "cc-by-sa-2.5" });
    expect(credit.text).toBe("Prelude (Bach), typeset by Ann. Licence: cc-by-sa-2.5, https://creativecommons.org/licenses/by-sa/2.5/");
  });
  it("falls back to title and artist without a stored attribution", () => {
    expect(downloadCredit({ ...cc, attribution: null }, "u", false)!.text).toMatch(/^Song by Bach\. Licence: cc-by-sa-2\.5/);
  });
  it("says Public domain without requiring a credit, and nothing for unlicensed or undownloadable songs", () => {
    expect(downloadCredit({ ...libraryFree, file_licence: "public-domain" }, "u", false)).toMatchObject({ required: false, summary: "Public domain" });
    expect(downloadCredit({ ...upload }, "owner", false)).toBeNull();
    expect(downloadCredit({ ...cc, public_eligible: false }, "u", false)).toBeNull();
  });
});
