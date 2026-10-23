import { useEffect, useRef, useState } from "react";
import { parsePlayAlongSong } from "@keyboard-sensei/playalong-core";
import { playSequence } from "../../audio/noteSequence";
import { getSongFile } from "../../services/api";
import { Button, Card, Chip } from "../ui";
import { REASON_LABEL, type CatalogueSong } from "./CatalogueApi";
import { StatusChip, TierChip, formatDuration } from "./CatalogueUi";

export interface CatalogueSongTableProps {
  songs: CatalogueSong[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** Phone: no selection, no actions. */
  readOnly: boolean;
  /** Import queue layout: tier reasons and a preview player instead of source and licence. */
  variant?: "table" | "queue";
}

/** One song at a time can be previewed; starting another stops the first. */
function useSongPreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(null);
  };
  useEffect(() => () => stopRef.current?.(), []);

  const toggle = async (id: string) => {
    const wasPlaying = playing === id;
    stop();
    if (wasPlaying) return;
    setError(null);
    setPlaying(id);
    try {
      const parsed = parsePlayAlongSong(await getSongFile(id));
      stopRef.current = playSequence(parsed.notes, {
        onEnd: () => {
          stopRef.current = null;
          setPlaying((current) => (current === id ? null : current));
        },
      });
    } catch (e) {
      setPlaying(null);
      setError(e instanceof Error ? e.message : "Could not play this file");
    }
  };
  return { playing, error, toggle };
}

const sourceText = (song: CatalogueSong): string =>
  [song.source_kind ?? "unknown", song.file_licence ?? "licence unknown"].join(" · ");

function Signals({ song }: { song: CatalogueSong }) {
  const signals = song.quality_signals;
  if (!signals) return <p className="text-xs text-label-2a">No measurements stored</p>;
  const incipit = typeof signals.incipit === "string" ? signals.incipit : null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-label-2a">
      <dt>Quantised</dt>
      <dd>{Math.round(Number(signals.quant) * 100)}%</dd>
      <dt>Hands</dt>
      <dd>{signals.handSplit ? "split" : "not split"} · {String(signals.noteTracks)} track(s)</dd>
      <dt>Length</dt>
      <dd>{formatDuration(Number(signals.durationSec))} · {String(signals.noteCount)} notes</dd>
      <dt>Opening check</dt>
      <dd>{incipit ?? "not recorded"}</dd>
    </dl>
  );
}

export default function CatalogueSongTable({ songs, selected, onSelectedChange, readOnly, variant = "table" }: CatalogueSongTableProps) {
  const preview = useSongPreview();
  const allSelected = songs.length > 0 && songs.every((song) => selected.has(song.id));

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleAll = () => onSelectedChange(allSelected ? new Set() : new Set(songs.map((song) => song.id)));

  const checkbox = (song: CatalogueSong) => (
    <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        className="h-5 w-5 accent-[rgb(var(--tint-fill-rgb))]"
        checked={selected.has(song.id)}
        onChange={() => toggleOne(song.id)}
        aria-label={`Select ${song.title}`}
      />
    </label>
  );

  const title = (song: CatalogueSong) => (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-medium text-label">
        {song.title}
        {song.arrangement_level ? <span className="font-normal text-label-2a"> · {song.arrangement_level}</span> : null}
      </p>
      <p className="truncate text-xs text-label-2a">
        {song.artist}
        {song.work ? ` · ${song.work.title}` : ""}
      </p>
    </div>
  );

  const previewButton = (song: CatalogueSong) => (
    <Button size="sm" variant="tinted" onClick={() => void preview.toggle(song.id)} aria-label={`${preview.playing === song.id ? "Stop" : "Play"} ${song.title}`}>
      {preview.playing === song.id ? "Stop" : "Play"}
    </Button>
  );

  if (readOnly) {
    return (
      <Card padding="none">
        <ul className="divide-y divide-separator">
          {songs.map((song) => (
            <li key={song.id} className="space-y-1 px-4 py-3">
              {title(song)}
              <div className="flex flex-wrap items-center gap-1.5">
                <TierChip tier={song.effective_tier} overridden={song.tier_override !== null} />
                <StatusChip status={song.work?.curation_status ?? null} />
                {song.retired_at && <Chip>Retired</Chip>}
                <span className="text-xs text-label-2a">{sourceText(song)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t border-separator px-4 py-3 text-xs text-label-2a">Open this page on a tablet or laptop to make changes.</p>
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-x-auto">
      {preview.error && <p role="alert" className="px-4 pt-3 text-sm text-danger">{preview.error}</p>}
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-separator text-xs uppercase tracking-wide text-label-2a">
            <th scope="col" className="w-12 px-1">
              <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[rgb(var(--tint-fill-rgb))]"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </label>
            </th>
            <th scope="col" className="px-2 py-2 font-medium">Song</th>
            <th scope="col" className="px-2 py-2 font-medium">Tier</th>
            <th scope="col" className="px-2 py-2 font-medium">Status</th>
            {variant === "table" ? (
              <>
                <th scope="col" className="px-2 py-2 font-medium">Source</th>
                <th scope="col" className="px-2 py-2 font-medium">Plays</th>
              </>
            ) : (
              <>
                <th scope="col" className="px-2 py-2 font-medium">Signals</th>
                <th scope="col" className="px-2 py-2 font-medium">Why not Verified</th>
              </>
            )}
            <th scope="col" className="px-2 py-2"><span className="sr-only">Preview</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {songs.map((song) => (
            <tr key={song.id} className={song.retired_at ? "opacity-60" : undefined} aria-selected={selected.has(song.id)}>
              <td className="px-1 align-top">{checkbox(song)}</td>
              <td className="max-w-[260px] px-2 py-2 align-top">{title(song)}</td>
              <td className="px-2 py-2 align-top">
                <TierChip tier={song.effective_tier} overridden={song.tier_override !== null} />
                {song.tier_override_reason && <p className="mt-1 max-w-[180px] text-xs text-label-2a">{song.tier_override_reason}</p>}
              </td>
              <td className="px-2 py-2 align-top">
                <div className="flex flex-wrap gap-1">
                  <StatusChip status={song.work?.curation_status ?? null} />
                  {song.retired_at && <Chip>Song retired</Chip>}
                </div>
              </td>
              {variant === "table" ? (
                <>
                  <td className="px-2 py-2 align-top text-xs text-label-2a">
                    {sourceText(song)}
                    <br />
                    {song.public_eligible ? "public-eligible" : "not public-eligible"}
                  </td>
                  <td className="px-2 py-2 align-top text-xs text-label-2a">{song.attempt_count}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-2 align-top"><Signals song={song} /></td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {song.reasons.length === 0 ? <Chip tone="success">Nothing flagged</Chip> : song.reasons.map((reason) => <Chip key={reason}>{REASON_LABEL[reason] ?? reason}</Chip>)}
                    </div>
                  </td>
                </>
              )}
              <td className="px-2 py-1 align-top">{previewButton(song)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
