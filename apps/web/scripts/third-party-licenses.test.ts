import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ESSENTIALS } from "../../api/src/essentials/manifest.ts";
import { collectMusicLicenses, collectPackageLicenses, hasKnownLicense, type PackageLicense } from "./third-party-licenses.ts";
import { THIRD_PARTY_ASSETS } from "./third-party-assets.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The direct runtime dependencies every workspace package declares (not workspace links). */
function declaredRuntimeDependencies(): string[] {
  const dirs = ["apps/web", "apps/api", ...readdirSync(path.join(REPO_ROOT, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}`)];
  const names = new Set<string>();
  for (const dir of dirs) {
    const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, dir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (!spec.startsWith("workspace:")) names.add(name);
    }
  }
  return [...names].sort();
}

describe("third-party licences", () => {
  let packages: PackageLicense[];
  beforeAll(() => {
    packages = collectPackageLicenses();
  }, 60_000);

  it("lists every runtime dependency of the web app, the API and the shared packages", () => {
    const listed = new Set(packages.map((pkg) => pkg.name));
    const missing = declaredRuntimeDependencies().filter((name) => !listed.has(name));
    expect(missing).toEqual([]);
    // Transitive dependencies are included, not just the declared ones.
    expect(packages.length).toBeGreaterThan(declaredRuntimeDependencies().length);
  });

  it("has a licence for every runtime dependency", () => {
    const unlicensed = packages.filter((pkg) => !hasKnownLicense(pkg.license)).map((pkg) => `${pkg.name}@${pkg.version}`);
    expect(unlicensed).toEqual([]);
  });

  it("credits every Essentials edition, with attribution wherever the licence requires it", () => {
    const music = collectMusicLicenses();
    expect(music).toHaveLength(ESSENTIALS.length);
    for (const piece of music) {
      expect(piece.license, piece.title).toMatch(/^(Public Domain|Creative Commons Attribution)/);
      if (piece.license.startsWith("Creative Commons")) {
        expect(piece.attributionRequired, piece.title).toBe(true);
        expect(piece.attribution, piece.title).toContain(piece.license);
        expect(piece.attribution, piece.title).toContain("Mutopia");
      }
    }
    expect(music.some((piece) => piece.attributionRequired)).toBe(true);
  });

  it("credits the media sets, starting with the FluidR3 instruments", () => {
    const fluid = THIRD_PARTY_ASSETS.find((asset) => asset.name.includes("FluidR3"));
    expect(fluid?.license).toBe("CC-BY-3.0");
    for (const asset of THIRD_PARTY_ASSETS) {
      expect(hasKnownLicense(asset.license), asset.name).toBe(true);
      expect(asset.attribution.length, asset.name).toBeGreaterThan(20);
    }
  });

  it("treats a missing licence field as unknown", () => {
    expect(hasKnownLicense("Unknown")).toBe(false);
    expect(hasKnownLicense("")).toBe(false);
    expect(hasKnownLicense(undefined)).toBe(false);
    expect(hasKnownLicense("UNLICENSED")).toBe(false);
    expect(hasKnownLicense("MIT")).toBe(true);
  });
});
