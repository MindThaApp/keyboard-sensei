/**
 * Builds the data behind /third-party-licenses from the real sources, so it can't drift:
 *
 * - npm: every production dependency (transitive) of every workspace package, as pnpm
 *   resolves it (`pnpm licenses list --prod -r`), with the licence text from the
 *   package's own LICENSE file where it has one;
 * - media: ./third-party-assets.ts (sample sets etc.);
 * - music: the Essentials manifest (apps/api/src/essentials/manifest.ts), with the
 *   attribution line each CC edition requires.
 *
 * Run by `pnpm build` and `pnpm dev`; writes public/third-party-licenses.json, which is
 * gitignored and served as a static file. Fails (non-zero exit) if any dependency has no
 * licence, so an unlicensed package can't ship silently.
 *
 *   pnpm --filter @keyboard-sensei/web licenses
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESSENTIALS, attribution, isAuthored } from "../../api/src/essentials/manifest.ts";
import { THIRD_PARTY_ASSETS, type ThirdPartyAsset } from "./third-party-assets.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
export const OUTPUT_PATH = path.resolve(SCRIPT_DIR, "../public/third-party-licenses.json");

export interface PackageLicense {
  name: string;
  version: string;
  license: string;
  author: string | null;
  homepage: string | null;
  /** The package's LICENSE/COPYING file, when it ships one. */
  licenseText: string | null;
}

export interface MusicLicense {
  title: string;
  composer: string;
  license: string;
  /** Credit line; required for CC BY and CC BY-SA editions. */
  attribution: string;
  attributionRequired: boolean;
  url: string;
}

export interface ThirdPartyLicenses {
  generatedAt: string;
  packages: PackageLicense[];
  assets: ThirdPartyAsset[];
  music: MusicLicense[];
}

interface PnpmLicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license?: string;
  author?: string;
  homepage?: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

function readLicenseText(dir: string | undefined): string | null {
  if (!dir) return null;
  // pnpm 10 reports store paths without their node_modules/.pnpm segment
  // (<root>/<name>@<version>/node_modules/<name>), so try the real location too.
  const candidates = [path.join(REPO_ROOT, "node_modules/.pnpm", path.relative(REPO_ROOT, dir)), dir];
  for (const candidate of candidates) {
    try {
      const file = readdirSync(candidate).find((name) => LICENSE_FILE.test(name));
      if (file) return readFileSync(path.join(candidate, file), "utf8").trim();
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/** Licence is "known" when it names something; pnpm reports a missing field as "Unknown". */
export const hasKnownLicense = (license: string | undefined | null): boolean =>
  Boolean(license && license.trim() && !/^unknown$/i.test(license.trim()) && !/^UNLICENSED$/.test(license.trim()));

/** Production dependencies of every workspace package, one entry per name@version. */
export function collectPackageLicenses(): PackageLicense[] {
  const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json", "--recursive"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(raw) as Record<string, PnpmLicenseEntry[]>;
  const packages: PackageLicense[] = [];
  for (const [group, entries] of Object.entries(byLicense)) {
    for (const entry of entries) {
      if (entry.name.startsWith("@keyboard-sensei/")) continue;
      entry.versions.forEach((version, index) => {
        packages.push({
          name: entry.name,
          version,
          license: entry.license ?? group,
          author: entry.author ?? null,
          homepage: entry.homepage ?? null,
          licenseText: readLicenseText(entry.paths[index]),
        });
      });
    }
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function collectMusicLicenses(): MusicLicense[] {
  return [...ESSENTIALS]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((piece) => {
      const { source } = piece;
      const license = isAuthored(source) ? "Public Domain" : source.licence;
      return {
        title: piece.title,
        composer: piece.composer,
        license,
        attribution: attribution(piece),
        attributionRequired: license.startsWith("Creative Commons"),
        url: isAuthored(source) ? source.verifiedAgainst[0]!.url : source.infoUrl,
      };
    });
}

export function buildThirdPartyLicenses(): ThirdPartyLicenses {
  return {
    generatedAt: new Date().toISOString(),
    packages: collectPackageLicenses(),
    assets: THIRD_PARTY_ASSETS,
    music: collectMusicLicenses(),
  };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const data = buildThirdPartyLicenses();
  const missing = data.packages.filter((pkg) => !hasKnownLicense(pkg.license));
  if (missing.length > 0) {
    console.error(`Dependencies with no licence: ${missing.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(data));
  console.log(
    `Third-party licences: ${data.packages.length} packages, ${data.assets.length} media sets, ${data.music.length} pieces -> ${path.relative(REPO_ROOT, OUTPUT_PATH)}`,
  );
}
