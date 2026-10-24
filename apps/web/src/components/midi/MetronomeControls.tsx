import { metronome, type MetronomeSound } from "../../utils/metronome";

export interface MetronomeSettings {
  sound: MetronomeSound;
  volume: number;
}

export const DEFAULT_METRONOME_SETTINGS: MetronomeSettings = { sound: "click", volume: 0.7 };
const METRONOME_SETTINGS_KEY = "ks-metronome-settings";
const SOUNDS: MetronomeSound[] = ["click", "wood", "beep", "cowbell"];
const SOUND_LABELS: Record<MetronomeSound, string> = {
  click: "Click",
  wood: "Wood block",
  beep: "Beep",
  cowbell: "Cowbell",
};

export function loadMetronomeSettings(): MetronomeSettings {
  try {
    const raw = localStorage.getItem(METRONOME_SETTINGS_KEY);
    if (!raw) return DEFAULT_METRONOME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<MetronomeSettings>;
    return {
      sound: SOUNDS.includes(parsed.sound as MetronomeSound) ? (parsed.sound as MetronomeSound) : "click",
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 0.7,
    };
  } catch {
    return DEFAULT_METRONOME_SETTINGS;
  }
}

export function saveMetronomeSettings(settings: MetronomeSettings): void {
  try {
    localStorage.setItem(METRONOME_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the settings last for this visit only.
  }
}

interface Props {
  settings: MetronomeSettings;
  onChange: (settings: MetronomeSettings) => void;
}

/** Sound picker + volume slider + a 4-click preview, reused in Settings (persisted default) and inline during exercises (session override). */
export default function MetronomeControls({ settings, onChange }: Props) {
  function preview() {
    metronome.start({
      bpm: 100,
      countInBeats: 4,
      sound: settings.sound,
      volume: settings.volume,
      onGo: () => metronome.stop(),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        Sound
        <select
          value={settings.sound}
          onChange={(e) => onChange({ ...settings, sound: e.target.value as MetronomeSound })}
          className="input py-1 text-xs"
        >
          {SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {SOUND_LABELS[sound]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) })}
        />
      </label>
      <button type="button" className="secondary-button px-2 py-1 text-xs" onClick={preview}>
        ▶ Preview
      </button>
    </div>
  );
}
