import { useState } from "react";
import { Link } from "react-router-dom";
import type { PracticeHands } from "@keyboard-sensei/midi-engine";
import type { Song } from "../../services/api";
import { practicePresetSearch } from "../play/practiceSession";
import { ListGroup, SegmentedControl } from "../ui";
import { SettingsRow } from "../settings/SettingsRow";

const DEFAULT_BAR_COUNT = 8;
const MAX_BAR_COUNT = 32;

const HAND_OPTIONS: { value: PracticeHands; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "both", label: "Both" },
];

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
    <ListGroup header={song.title} footer={song.artist} aria-label="Practice excerpt">
      <SettingsRow title="Start bar">
        <input
          type="number"
          min={1}
          aria-label="Start bar"
          value={startBar}
          onChange={(e) => setStartBar(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          className="settings-field"
          style={{ width: "6rem" }}
        />
      </SettingsRow>
      <SettingsRow title="How many bars">
        <input
          type="number"
          min={1}
          max={MAX_BAR_COUNT}
          aria-label="How many bars"
          value={barCount}
          onChange={(e) => setBarCount(Math.max(1, Math.min(MAX_BAR_COUNT, Math.floor(Number(e.target.value)) || 1)))}
          className="settings-field"
          style={{ width: "6rem" }}
        />
      </SettingsRow>
      <SettingsRow title="Hand">
        <SegmentedControl aria-label="Hand" options={HAND_OPTIONS} value={hand} onChange={setHand} />
      </SettingsRow>
      <SettingsRow>
        <Link to={to} className="ks-btn ks-btn--filled ks-btn--lg" style={{ textDecoration: "none" }}>
          Practise these bars
        </Link>
      </SettingsRow>
    </ListGroup>
  );
}
