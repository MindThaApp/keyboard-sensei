import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ESSENTIALS } from "../../api/src/essentials/manifest.ts";
import { collectLgplNotices, collectMusicLicenses, collectPackageLicenses, hasKnownLicense, HOMR_COMMIT, isLgpl, SERVICES, type PackageLicense } from "./third-party-licenses.ts";
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
    const vcsl = THIRD_PARTY_ASSETS.find((asset) => asset.name.includes("VCSL"));
    expect(vcsl?.license).toBe("CC0-1.0");
    expect(vcsl?.attribution).toContain("Versilian");
    for (const asset of THIRD_PARTY_ASSETS) {
      expect(hasKnownLicense(asset.license), asset.name).toBe(true);
      expect(asset.attribution.length, asset.name).toBeGreaterThan(20);
    }
  });

  it("gives every LGPL package (Verovio) its notice, with the source of the shipped version", () => {
    const notices = collectLgplNotices(packages);
    expect(notices.map((notice) => notice.name)).toEqual(packages.filter((pkg) => isLgpl(pkg.license)).map((pkg) => pkg.name));
    const verovio = notices.find((notice) => notice.name === "verovio");
    expect(verovio?.license).toMatch(/^LGPL-3\.0/);
    expect(verovio?.sourceUrl).toBe(`https://github.com/rism-digital/verovio/releases/tag/version-${verovio?.version}`);
    expect(verovio?.licenseUrls).toEqual(["https://www.gnu.org/licenses/lgpl-3.0.html", "https://www.gnu.org/licenses/gpl-3.0.html"]);
    // A new LGPL dependency without a notice fails the build instead of shipping silently.
    expect(() => collectLgplNotices([{ name: "some-lgpl-lib", version: "1.0.0", license: "LGPL-2.1", author: null, homepage: null, licenseText: null }])).toThrow(/LGPL_PACKAGES/);
  });

  it("credits the sheet-music recognition service at the exact commit its container installs", () => {
    const dockerfile = readFileSync(path.join(REPO_ROOT, "services/omr/Dockerfile"), "utf8");
    expect(dockerfile).toContain(`ARG HOMR_COMMIT=${HOMR_COMMIT}`);
    const homr = SERVICES.find((service) => service.name === "homr");
    expect(homr).toMatchObject({ license: "AGPL-3.0", sourceUrl: `https://github.com/liebharc/homr/tree/${HOMR_COMMIT}` });
  });

  it("treats a missing licence field as unknown", () => {
    expect(hasKnownLicense("Unknown")).toBe(false);
    expect(hasKnownLicense("")).toBe(false);
    expect(hasKnownLicense(undefined)).toBe(false);
    expect(hasKnownLicense("UNLICENSED")).toBe(false);
    expect(hasKnownLicense("MIT")).toBe(true);
  });
});
