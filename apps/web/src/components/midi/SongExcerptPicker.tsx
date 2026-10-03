import { useState } from "react";
import { Link } from "react-router-dom";
import type { PracticeHands } from "@keyboard-sensei/midi-engine";
import type { Song } from "../../services/api";
import { practicePresetSearch } from "../play/practiceSession";

const DEFAULT_BAR_COUNT = 8;
const MAX_BAR_COUNT = 32;

const HAND_OPTIONS: { value: PracticeHands; label: string }[] = [
  { value: "right", label: "Right hand" },
  { value: "left", label: "Left hand" },
  { value: "both", label: "Both hands" },
];

const fieldClass = "rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";

/**
 * Picks a few bars and a hand of a library song, then opens the song practice
 * screen with them preset: looped, with the other hand as accompaniment. All the
 * practising (wait mode, slowing down, making it easier) happens there.
 */
export default function SongExcerptPicker({ song }: { song: Song }) {
  const [startBar, setStartBar] = useState(1);
  const [barCount, setBarCount] = useState(DEFAULT_BAR_COUNT);
  const [hand, setHand] = useState<PracticeHands>("right");

  const to = `/play/${encodeURIComponent(song.id)}${practicePresetSearch({ hands: hand, firstBar: startBar, lastBar: startBar + barCount - 1 })}`;

  return (
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <div className="w-full">
        <p className="font-medium text-slate-900 dark:text-slate-100">{song.title}</p>
        <p className="text-xs text-slate-500">{song.artist}</p>
      </div>
      <label className="text-xs text-slate-500 dark:text-slate-400">
        Start bar
        <input
          type="number"
          min={1}
          value={startBar}
          onChange={(e) => setStartBar(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          className={`mt-1 block w-20 ${fieldClass}`}
        />
      </label>
      <label className="text-xs text-slate-500 dark:text-slate-400">
        How many bars
        <input
          type="number"
          min={1}
          max={MAX_BAR_COUNT}
          value={barCount}
          onChange={(e) => setBarCount(Math.max(1, Math.min(MAX_BAR_COUNT, Math.floor(Number(e.target.value)) || 1)))}
          className={`mt-1 block w-20 ${fieldClass}`}
        />
      </label>
      <label className="text-xs text-slate-500 dark:text-slate-400">
        Hand
        <select value={hand} onChange={(e) => setHand(e.target.value as PracticeHands)} className={`mt-1 block ${fieldClass}`}>
          {HAND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      <Link to={to} className="primary-button ml-auto">
        Practise these bars ▶
      </Link>
    </div>
  );
}
