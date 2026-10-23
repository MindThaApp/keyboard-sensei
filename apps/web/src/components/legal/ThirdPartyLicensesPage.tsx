import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../../services/api";
import PublicPageLayout, { Prose } from "./PublicPageLayout";

/** Shape of public/third-party-licenses.json, written at build time by scripts/third-party-licenses.ts. */
interface ThirdPartyLicenses {
  generatedAt: string;
  packages: { name: string; version: string; license: string; author: string | null; homepage: string | null; licenseText: string | null }[];
  assets: { name: string; usedFor: string; license: string; attribution: string; url: string; licenseUrl: string }[];
  music: { title: string; composer: string; license: string; attribution: string; attributionRequired: boolean; url: string }[];
}

/** One row of GET /credits: a shared song served under a Creative Commons licence. */
interface SongCredit {
  song_id: string;
  title: string;
  artist: string;
  level: string | null;
  licence: string;
  licence_url: string | null;
  attribution: string | null;
  source_url: string | null;
}

/** The versions of one piece share a credit line; show it once. */
function groupCredits(credits: SongCredit[]) {
  const groups = new Map<string, { key: string; title: string; artist: string; licence: string; licence_url: string | null; attribution: string | null; source_url: string | null }>();
  for (const credit of credits) {
    // Derived versions are titled "Canon in D (Beginner)"; the credit is for the piece.
    const title = credit.title.replace(/ \((Beginner|Intermediate|Full)\)$/, "");
    const key = `${title}|${credit.artist}|${credit.licence}|${credit.attribution ?? ""}`;
    if (!groups.has(key)) groups.set(key, { ...credit, title, key });
  }
  return [...groups.values()];
}

const spdxUrl = (license: string) =>
  /^[A-Za-z0-9.+-]+$/.test(license) ? `https://spdx.org/licenses/${license}.html` : null;

export default function ThirdPartyLicensesPage() {
  const [data, setData] = useState<ThirdPartyLicenses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // The server's own list of the Creative Commons songs it serves: the one source of truth for credits.
  const [credits, setCredits] = useState<SongCredit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/third-party-licenses.json")
      .then((response) => {
        if (!response.ok) throw new Error(`The licence list isn't available (${response.status}).`);
        return response.json() as Promise<ThirdPartyLicenses>;
      })
      .then((json) => !cancelled && setData(json))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "The licence list isn't available."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/credits`)
      .then((response) => {
        if (!response.ok) throw new Error(`credits ${response.status}`);
        return response.json() as Promise<{ credits: SongCredit[] }>;
      })
      .then((json) => !cancelled && setCredits(json.credits))
      // Offline or an older server: the static list below carries the attribution lines instead.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const creditGroups = useMemo(() => groupCredits(credits ?? []), [credits]);

  const packages = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (data?.packages ?? []).filter((pkg) => !query || pkg.name.toLowerCase().includes(query) || pkg.license.toLowerCase().includes(query));
  }, [data, filter]);

  return (
    <PublicPageLayout title="Third-party licences" wide>
      <Prose>
        <p>
          Keyboard Sensei is built on other people's generous work. This page credits the music editions, sounds and
          open-source software it uses, with their licences. It is generated from the app's own dependency and content
          lists each time the app is built.
        </p>
      </Prose>

      {error && (
        <p role="alert" className="mt-6 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="mt-6 text-sm text-slate-500">
          Loading…
        </p>
      )}

      {data && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="music-heading">
            <h2 id="music-heading" className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Music
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The Essentials pieces are public-domain compositions. Most editions come from the{" "}
              <a className="text-felt-700 underline dark:text-felt-300" href="https://www.mutopiaproject.org/" target="_blank" rel="noreferrer">
                Mutopia Project
              </a>
              ; the beginner and intermediate versions are simplified from them. Where an edition is ShareAlike, the
              simplified versions are shared under the same licence.
              {credits && credits.length > 0 && " Credit lines for the Creative Commons editions are under Song credits below."}
            </p>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {data.music.map((piece) => (
                <li key={`${piece.title}-${piece.composer}`} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {piece.title} <span className="font-normal text-slate-500">· {piece.composer}</span>
                    </span>
                    <span className={`text-xs ${piece.attributionRequired ? "text-brass-700 dark:text-brass-300" : "text-slate-500"}`}>{piece.license}</span>
                  </div>
                  {piece.attributionRequired && !(credits && credits.length > 0) && <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{piece.attribution}</p>}
                  <a className="mt-1 inline-block break-all text-xs text-felt-700 underline dark:text-felt-300" href={piece.url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {credits && credits.length > 0 && (
            <section aria-labelledby="credits-heading">
              <h2 id="credits-heading" className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                Song credits
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Songs this server plays under a Creative Commons licence, with the credit each one asks for. The list comes
                straight from the song library, so it always matches what you can play.
              </p>
              <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800" data-testid="song-credits">
                {creditGroups.map((group) => (
                  <li key={group.key} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {group.title} <span className="font-normal text-slate-500">· {group.artist}</span>
                      </span>
                      {group.licence_url ? (
                        <a className="text-xs text-slate-500 underline" href={group.licence_url} target="_blank" rel="noreferrer">
                          {group.licence}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">{group.licence}</span>
                      )}
                    </div>
                    {group.attribution && <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{group.attribution}</p>}
                    {group.source_url && (
                      <a className="mt-1 inline-block break-all text-xs text-felt-700 underline dark:text-felt-300" href={group.source_url} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="sounds-heading">
            <h2 id="sounds-heading" className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Sounds
            </h2>
            <ul className="mt-4 space-y-4">
              {data.assets.map((asset) => (
                <li key={asset.name} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <a className="font-medium text-felt-700 underline dark:text-felt-300" href={asset.url} target="_blank" rel="noreferrer">
                      {asset.name}
                    </a>
                    <a className="text-xs text-slate-500 underline" href={asset.licenseUrl} target="_blank" rel="noreferrer">
                      {asset.license}
                    </a>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{asset.usedFor}.</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{asset.attribution}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="software-heading">
            <h2 id="software-heading" className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Software
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {data.packages.length} open-source packages used by the app and its server. Open one to read its licence.
            </p>
            <input
              aria-label="Filter packages"
              className="input mt-3 max-w-sm"
              placeholder="Filter by name or licence"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {packages.map((pkg) => (
                <li key={`${pkg.name}@${pkg.version}`} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="break-all font-medium text-slate-900 dark:text-slate-100">
                        {pkg.name} <span className="font-normal text-slate-500">{pkg.version}</span>
                      </span>
                      <span className="text-xs text-slate-500">{pkg.license}</span>
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      {pkg.author && <p>By {pkg.author}</p>}
                      {pkg.homepage && (
                        <a className="break-all text-felt-700 underline dark:text-felt-300" href={pkg.homepage} target="_blank" rel="noreferrer">
                          {pkg.homepage}
                        </a>
                      )}
                      {pkg.licenseText ? (
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 font-mono text-[11px] leading-snug dark:bg-slate-900">
                          {pkg.licenseText}
                        </pre>
                      ) : (
                        spdxUrl(pkg.license) && (
                          <p>
                            Licence text:{" "}
                            <a className="text-felt-700 underline dark:text-felt-300" href={spdxUrl(pkg.license)!} target="_blank" rel="noreferrer">
                              {pkg.license}
                            </a>
                          </p>
                        )
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-slate-500">Generated {new Date(data.generatedAt).toLocaleDateString()}.</p>
        </div>
      )}
    </PublicPageLayout>
  );
}
