import { lazy, Suspense, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  difficultyMultiplier,
  handsMultiplier,
  lookaheadMultiplier,
  MAX_SCORE_MULTIPLIER,
  practiceMultiplier,
  PRACTICE_LEVELS,
  tempoMultiplier,
  type PracticeHands,
  type PracticeLevel,
} from "@keyboard-sensei/midi-engine";
import type { LoopRange } from "@keyboard-sensei/playalong-core";
import { CLICK_LEVELS, type ClickLevel } from "../../utils/playalongMetronome";
import { METRONOME_SOUNDS, type MetronomeSound } from "../../utils/clickTimbres";
import MidiStatusBar from "../midi/MidiStatusBar";
import { KeyboardSizingControls } from "../piano/VirtualPiano";
import type { KeyboardSizing } from "../piano/useKeyboardSizing";
import { Button, InfoTip, ListGroup, ListRow, SegmentedControl, Sheet, Slider, Stepper, Toggle } from "../ui";
import LoopBarStrip from "./LoopBarStrip";
import { LEVEL_DESCRIPTIONS, LEVEL_LABELS } from "./practiceSession";
import { LOOKAHEAD_MAX_S, LOOKAHEAD_MIN_S, TEMPO_MAX_PCT, TEMPO_MIN_PCT, type Settings, type ViewMode } from "./practiceSettings";
import { NOTES_STYLES } from "./renderers";
import type { NotesStyle } from "./renderers/types";
import type { VisibilityMode } from "./stageLayout";

interface Props {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  level: PracticeLevel;
  onLevel: (level: PracticeLevel) => void;
  hands: PracticeHands;
  /** Level, hands and the loop shape the run itself, so they wait for the run to end. */
  practiceLocked: boolean;
  /** Speed and look-ahead can change while paused, not while notes are falling. */
  settingsLocked: boolean;
  authoredLevel: boolean;
  steadyBpm: number | null;
  clickSafe: boolean;
  barCount: number;
  loopOn: boolean;
  onLoopOn: (on: boolean) => void;
  loopRange: LoopRange;
  onLoopRange: (range: LoopRange) => void;
  sizing: KeyboardSizing;
  /** Phone landscape has no room for sheet music above the falling notes. */
  notationFits: boolean;
  /** About the song: stars so far, length, edition credit. */
  header?: ReactNode;
  /** The tab showing; kept by the page so the sheet reopens where it was left. */
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
}

export type SettingsTab = "play" | "loop" | "look" | "sound";

export const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
  { value: "play", label: "Play" },
  { value: "loop", label: "Loop" },
  { value: "look", label: "Look" },
  { value: "sound", label: "Sound" },
];

// The FX look controls are only needed once FX is the chosen style, so they load then.
const FxLookSettings = lazy(() => import("./FxLookSettings"));

const VERSION_OPTIONS = [...PRACTICE_LEVELS].map((level) => ({ value: level, label: LEVEL_LABELS[level] }));
export const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "falling", label: "Notes" },
  { value: "notation", label: "Sheet" },
  { value: "both", label: "Both" },
];
const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string }[] = [
  { value: "note-size", label: "Smaller notes" },
  { value: "window-size", label: "Taller area" },
];
const CLICK_LABELS: Record<ClickLevel, string> = { bar: "Every bar", beat: "Every beat", subdivision: "Half-beats" };

/**
 * Practice settings, as a floating sheet in four tabs: Play, Loop, Look and Sound.
 * Nothing is folded away: every setting is the gear, a tab, and the control.
 */
export default function PracticeSettingsSheet(props: Props) {
  const { settings, setSettings, level, hands, practiceLocked, settingsLocked, tab } = props;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const rate = settings.tempoPct / 100;
  const bonus = practiceMultiplier({ rate, lookaheadS: settings.lookaheadS, level, hands });
  const uncapped = tempoMultiplier(rate) * lookaheadMultiplier(settings.lookaheadS) * difficultyMultiplier(level) * handsMultiplier(hands);

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Practice settings"
      detents={["large"]}
      className="ks-practice-sheet"
      leading={
        <Button variant="plain" onClick={props.onReset} disabled={practiceLocked}>
          Reset
        </Button>
      }
      trailing={
        <Button variant="plain" onClick={props.onClose} data-autofocus>
          Done
        </Button>
      }
    >
      <div className="ks-practice-sheet__tabs">
        <SegmentedControl aria-label="Settings group" options={SETTINGS_TABS} value={tab} onChange={props.onTab} block />
      </div>

      {tab === "play" && (
        <div role="group" aria-label="Play settings">
          {props.header && <div className="ks-practice-sheet__about">{props.header}</div>}
          <ListGroup header="Song" footer={LEVEL_DESCRIPTIONS[level] + (props.authoredLevel ? " This piece has a hand-checked version for it." : "")}>
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title" id="ks-version-label">
                  Version
                </span>
                <SegmentedControl
                  aria-labelledby="ks-version-label"
                  options={VERSION_OPTIONS.map((option) => ({ ...option, disabled: practiceLocked }))}
                  value={level}
                  onChange={props.onLevel}
                  block
                />
              </div>
            </li>
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title" id="ks-speed-label">
                  Speed
                  {props.steadyBpm !== null && (
                    <span className="ks-practice-row__hint"> · about {Math.round((props.steadyBpm * settings.tempoPct) / 100)} beats a minute</span>
                  )}
                </span>
                <Slider
                  aria-labelledby="ks-speed-label"
                  min={TEMPO_MIN_PCT}
                  max={TEMPO_MAX_PCT}
                  step={5}
                  value={settings.tempoPct}
                  disabled={settingsLocked}
                  formatValue={(value) => `${value}%`}
                  onChange={(value) => set("tempoPct", value)}
                />
              </div>
            </li>
            <ListRow
              title="Wait for me"
              subtitle="The song waits until you press the right key. Not scored."
              accessory={<Toggle label="Wait for me" hideLabel checked={settings.waitMode} disabled={settingsLocked} onChange={(on) => set("waitMode", on)} />}
            />
            <ListRow
              title="Play the other hand for me"
              subtitle={hands === "both" ? "Pick one hand first." : undefined}
              accessory={
                <Toggle
                  label="Play the other hand for me"
                  hideLabel
                  checked={!settings.accompanimentMute.otherHand}
                  disabled={hands === "both"}
                  onChange={(on) => setSettings((s) => ({ ...s, accompanimentMute: { ...s.accompanimentMute, otherHand: !on } }))}
                />
              }
            />
          </ListGroup>

          <ListGroup header="Keyboard">
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <MidiStatusBar />
              </div>
            </li>
          </ListGroup>

          <ListGroup
            header="Difficulty boost"
            footer="Faster, and seeing less far ahead, boost your score; easier versions and one hand boost it less. Loops are saved as practice, not as your best."
          >
            <ListRow
              title={`×${bonus.toFixed(2)}${settings.waitMode ? " (Wait for me isn't scored)" : ""}`}
              subtitle={`speed ×${tempoMultiplier(rate).toFixed(2)} · seeing ahead ×${lookaheadMultiplier(settings.lookaheadS).toFixed(2)} · ${LEVEL_LABELS[level]} ×${difficultyMultiplier(level).toFixed(1)} · ${
                hands === "both" ? "both hands" : "one hand"
              } ×${handsMultiplier(hands).toFixed(1)}${uncapped > MAX_SCORE_MULTIPLIER ? ` (capped at ×${MAX_SCORE_MULTIPLIER})` : ""}`}
            />
          </ListGroup>
        </div>
      )}

      {tab === "loop" && (
        <div role="group" aria-label="Loop settings">
          <ListGroup header="Loop practice" footer={props.loopOn ? "Each time round starts with a count-in. Loops are practice: they don't change your best." : "Loop a few bars to practise a tricky part."}>
            <ListRow
              title="Loop a few bars"
              accessory={<Toggle label="Loop a few bars" hideLabel checked={props.loopOn} disabled={practiceLocked} onChange={props.onLoopOn} />}
            />
            {props.loopOn && (
              <>
                <li className="ks-row ks-practice-row--stack">
                  <div className="ks-row__main">
                    <LoopBarStrip barCount={props.barCount} range={props.loopRange} onChange={props.onLoopRange} disabled={practiceLocked} />
                  </div>
                </li>
                <ListRow
                  title="Repeat until I get it right"
                  accessory={<Toggle label="Repeat until I get it right" hideLabel checked={settings.untilClean} onChange={(on) => set("untilClean", on)} />}
                />
                <ListRow
                  title="Speed up when I get it right"
                  subtitle={settings.autoSpeedUp ? `Starts at ${settings.speedUpStartPct}%, +5% each clean time round, up to 100%.` : undefined}
                  accessory={<Toggle label="Speed up when I get it right" hideLabel checked={settings.autoSpeedUp} onChange={(on) => set("autoSpeedUp", on)} />}
                />
                <ListRow
                  title="Speed-up starts at"
                  accessory={
                    <Stepper
                      aria-label="Speed-up starting speed"
                      min={25}
                      max={95}
                      step={5}
                      value={settings.speedUpStartPct}
                      formatValue={(value) => `${value}%`}
                      onChange={(value) => set("speedUpStartPct", value)}
                    />
                  }
                />
                <ListRow
                  title="Right means at least"
                  subtitle="Notes hit in a time round"
                  accessory={
                    <Stepper
                      aria-label="Notes hit that count as right"
                      min={50}
                      max={100}
                      step={5}
                      value={settings.cleanAccuracyPct}
                      formatValue={(value) => `${value}%`}
                      onChange={(value) => set("cleanAccuracyPct", value)}
                    />
                  }
                />
                {settings.waitMode && (settings.untilClean || settings.autoSpeedUp) && (
                  <li className="ks-row">
                    <p className="ks-row__main ks-practice-row__note">Wait for me isn't scored, so the loop just repeats. Turn it off to repeat until right or speed up.</p>
                  </li>
                )}
              </>
            )}
          </ListGroup>
        </div>
      )}

      {tab === "look" && (
        <div role="group" aria-label="Look settings">
          <ListGroup header="Screen">
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title" id="ks-show-label">
                  Show
                  {!props.notationFits && <span className="ks-practice-row__hint"> · turn the phone upright for sheet music</span>}
                </span>
                <SegmentedControl aria-labelledby="ks-show-label" options={VIEW_OPTIONS} value={settings.viewMode} onChange={(value) => set("viewMode", value)} block />
              </div>
            </li>
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title" id="ks-style-label">
                  Notes style
                </span>
                <SegmentedControl
                  aria-labelledby="ks-style-label"
                  options={NOTES_STYLES.map((style) => ({ value: style.value, label: style.label }))}
                  value={settings.notesStyle}
                  onChange={(value: NotesStyle) => set("notesStyle", value)}
                  block
                />
              </div>
            </li>
            <ListRow title="Note names on the keys" accessory={<Toggle label="Note names on the keys" hideLabel checked={settings.showLabels} onChange={(on) => set("showLabels", on)} />} />
          </ListGroup>

          {settings.notesStyle === "fx" && (
            <Suspense fallback={null}>
              <FxLookSettings />
            </Suspense>
          )}

          <ListGroup header="Seeing ahead">
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title">
                  {/* The id is on the text alone, so the slider's name leaves out the tip button. */}
                  <span id="ks-lookahead-label">How far ahead you see</span>
                  <InfoTip>Seconds of upcoming notes shown. More is easier to read, with a slightly lower score.</InfoTip>
                </span>
                <Slider
                  aria-labelledby="ks-lookahead-label"
                  min={LOOKAHEAD_MIN_S}
                  max={LOOKAHEAD_MAX_S}
                  step={0.5}
                  value={settings.lookaheadS}
                  disabled={settingsLocked}
                  formatValue={(value) => `${value.toFixed(1)} s`}
                  onChange={(value) => set("lookaheadS", value)}
                />
              </div>
            </li>
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <span className="ks-row__title" id="ks-visibility-label">
                  Seeing further makes
                </span>
                <SegmentedControl
                  aria-labelledby="ks-visibility-label"
                  options={VISIBILITY_OPTIONS.map((option) => ({ ...option, disabled: settingsLocked }))}
                  value={settings.visibilityMode}
                  onChange={(value) => set("visibilityMode", value)}
                  block
                />
              </div>
            </li>
          </ListGroup>

          <ListGroup header="Keys">
            <li className="ks-row ks-practice-row--stack">
              <div className="ks-row__main">
                <KeyboardSizingControls sizing={props.sizing} />
              </div>
            </li>
          </ListGroup>
        </div>
      )}

      {tab === "sound" && (
        <div role="group" aria-label="Sound settings">
          <ListGroup header="Music">
            <ListRow
              title="Play my part along with me"
              accessory={<Toggle label="Play my part along with me" hideLabel checked={settings.guideAudio} disabled={settingsLocked} onChange={(on) => set("guideAudio", on)} />}
            />
            <ListRow
              title="Play the left-out notes quietly"
              subtitle={level === "full" ? "Only for easier versions." : "So the song still sounds full."}
              accessory={
                <Toggle
                  label="Play the left-out notes quietly"
                  hideLabel
                  checked={!settings.accompanimentMute.removed}
                  disabled={level === "full"}
                  onChange={(on) => setSettings((s) => ({ ...s, accompanimentMute: { ...s.accompanimentMute, removed: !on } }))}
                />
              }
            />
          </ListGroup>

          <ListGroup header="Metronome" footer={props.clickSafe ? undefined : "This recording's speed drifts too much for a steady click."}>
            <ListRow
              title="Metronome"
              accessory={
                <Toggle label="Metronome" hideLabel checked={settings.metronome && props.clickSafe} disabled={!props.clickSafe} onChange={(on) => set("metronome", on)} />
              }
            />
            {settings.metronome && props.clickSafe && (
              <>
                <li className="ks-row ks-practice-row--stack">
                  <div className="ks-row__main">
                    <span className="ks-row__title" id="ks-click-label">
                      Click
                    </span>
                    <SegmentedControl
                      aria-labelledby="ks-click-label"
                      options={CLICK_LEVELS.map((option) => ({ value: option.value, label: CLICK_LABELS[option.value] }))}
                      value={settings.clickLevel}
                      onChange={(value: ClickLevel) => set("clickLevel", value)}
                      block
                    />
                  </div>
                </li>
                <li className="ks-row ks-practice-row--stack">
                  <div className="ks-row__main">
                    <span className="ks-row__title" id="ks-sound-label">
                      Sound
                    </span>
                    <SegmentedControl
                      aria-labelledby="ks-sound-label"
                      options={METRONOME_SOUNDS.map((option) => ({ value: option.value, label: option.label }))}
                      value={settings.metronomeSound}
                      onChange={(value: MetronomeSound) => set("metronomeSound", value)}
                      block
                    />
                  </div>
                </li>
              </>
            )}
          </ListGroup>
        </div>
      )}
    </Sheet>
  );
}
