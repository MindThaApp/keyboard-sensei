import { describe, expect, it } from "vitest";
import { importSources } from "./importSources";

const ids = (archiveAvailable: boolean, scanAvailable: boolean) =>
  importSources({ archiveAvailable, scanAvailable }).map((source) => source.id);

describe("importSources", () => {
  it("always offers file upload and link import", () => {
    expect(ids(false, false)).toEqual(["file", "url"]);
  });

  it("adds scanning and the archive only when the server supports them", () => {
    expect(ids(false, true)).toEqual(["file", "url", "scan"]);
    expect(ids(true, false)).toEqual(["file", "url", "archive"]);
    expect(ids(true, true)).toEqual(["file", "url", "scan", "archive"]);
  });

  it("marks only the scan option as beta", () => {
    const beta = importSources({ archiveAvailable: true, scanAvailable: true }).filter((s) => s.beta);
    expect(beta.map((s) => s.id)).toEqual(["scan"]);
  });
});
