import { t, useT } from "../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchString, midiToFrequency } from "@keyboard-sensei/audio-analysis";
import {
  REFERENCE_PITCH,
  applyCapo,
  clampReferencePitch,
  tuningPresetsFor,
  validateCustomTuning,
  type TuningInstrument,
} from "@keyboard-sensei/music-theory";
import { useMicSession } from "../../audio/mic/useMicSession";
import { startReferenceTone, type ReferenceTone } from "../../audio/referenceTone";
import { MicPermissionNotice } from "../mic/MicPermissionNotice";
import { DriftTrace, StrobeBand, TunerNeedle } from "./TunerDisplay";
import { activeStrings, saveTunerSettings, useTunerSettings, type TunerSettings } from "./tunerSettings";
import { useTuner, type TunerSignal } from "./useTuner";

const INSTRUMENT_LABELS: Record<TuningInstrument, string> = {
  get guitar() { return t("tuner.instrument.guitar"); },
  get violin() { return t("tuner.instrument.violin"); },
  get piano() { return t("tuner.instrument.piano"); },
};
const SIGNAL_TEXT: Record<TunerSignal, string> = {
  get listening() { return t("tuner.signal.listening"); },
  get "too-quiet"() { return t("tuner.signal.tooQuiet"); },
  get "too-noisy"() { return t("tuner.signal.tooNoisy"); },
};

/** Preset names come from music-theory in English; "guitar-drop-d" reads tuner.preset.dropD. */
function presetName(preset: { id: string; name: string }): string {
  const key = `tuner.preset.${preset.id.replace(/^(guitar|violin|piano)-/, "").replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`;
  const text = t(key);
  return text === key ? preset.name : text;
}

/** validateCustomTuning's messages are English; shown through the catalogue. */
function tuningError(error: string): string {
  if (error === "Give the tuning a name.") return t("tuner.error.noName");
  if (error === "A tuning has 1 to 12 strings.") return t("tuner.error.stringCount");
  const range = /^(.*) is outside the tuner's range\.$/.exec(error);
  if (range) return t("tuner.error.outOfRange", { note: range[1] });
  const bad = /^"(.*)" is not a note/.exec(error);
  if (bad) return t("tuner.error.notANote", { note: bad[1] });
  return error;
}

/**
 * The tuner (spec section 5): chromatic mode, guitar/violin/piano presets,
 * adjustable A4 and a reference tone. Works offline and without an account.
 */
export default function TunerPage({ hideTitle = false }: { hideTitle?: boolean }) {
  useT();
  const settings = useTunerSettings();
  const mic = useMicSession("tuner");
  const session = mic.state.status === "listening" ? mic.state.session : null;
  const [hold, setHold] = useState(false);
  const [lockedIndex, setLockedIndex] = useState<number | null>(null);
  const tuning = activeStrings(settings);
  const strings = useMemo(
    () => (tuning ? (settings.instrument === "guitar" ? applyCapo(tuning.strings, settings.capo) : tuning.strings) : null),
    [tuning, settings.instrument, settings.capo],
  );
  const preferFlats = !!strings?.some(s => s.label.includes("b"));
  const view = useTuner(session, { a4: settings.a4Hz, preferFlats, hold });
  const reading = view.reading;

  useEffect(() => setLockedIndex(null), [settings.tuningId, settings.capo]);

  // Against a preset string (auto-detected or locked), or chromatic against the nearest note.
  const match = reading && strings ? matchString(reading.frequency, strings, { a4: settings.a4Hz, lockedIndex }) : null;
  const cents = match ? match.cents : reading ? reading.cents : null;
  const targetLabel = match ? match.string.label : reading ? reading.name : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      {!hideTitle && <h1 className="text-2xl font-semibold">{t("tuner.title")}</h1>}

      {!session && (
        <MicPermissionNotice
          purpose={t("tuner.micPurpose")}
          onAllow={() => void mic.start()}
          busy={mic.state.status === "starting"}
          error={mic.state.status === "error" ? mic.state : null}
        />
      )}

      <section className="card space-y-3 p-4 text-center" aria-label={t("tuner.reading")}>
        <div className="flex items-center justify-between text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800" data-testid="tuner-status" role="status">
            {session ? (hold ? t("tuner.hold") : SIGNAL_TEXT[view.signal]) : t("tuner.micOff")}
          </span>
          <span className="tabular-nums text-slate-500">{t("tuner.a4Value", { hz: settings.a4Hz.toFixed(1) })}</span>
        </div>
        <div className="text-6xl font-bold tabular-nums" data-testid="tuner-note" aria-live="polite">
          {targetLabel ?? "–"}
        </div>
        <div className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
          <span data-testid="tuner-frequency">{t("tuner.hz", { hz: reading ? reading.frequency.toFixed(1) : "–" })}</span>
          {" · "}
          <span data-testid="tuner-cents">{t("tuner.cents", { cents: cents === null ? "–" : `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` })}</span>
        </div>
        {match && reading && reading.name !== match.string.label && (
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="tuner-playing">
            {t(match.cents < 0 ? "tuner.playingTuneUp" : "tuner.playingTuneDown", { played: reading.name, target: match.string.label })}
          </p>
        )}
        <TunerNeedle cents={cents} greenZone={settings.greenZoneCents} active={reading !== null} />
        <StrobeBand cents={cents} />
        <DriftTrace history={view.history} now={view.history[view.history.length - 1]?.time ?? 0} greenZone={settings.greenZoneCents} />
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="secondary-button" aria-pressed={hold} onClick={() => setHold(h => !h)} disabled={!session}>
            {hold ? t("tuner.releaseHold") : t("tuner.hold")}
          </button>
          <ReferenceToneButton
            frequency={midiToFrequency(
              match ? match.targetMidi : strings && lockedIndex !== null ? strings[lockedIndex]!.midi : reading?.midi ?? 69,
              settings.a4Hz,
            )}
            label={match ? match.string.label : strings && lockedIndex !== null ? strings[lockedIndex]!.label : reading?.name ?? "A4"}
            timbre={settings.referenceTimbre}
          />
          {session && (
            <button type="button" className="secondary-button" onClick={mic.stop}>
              {t("tuner.stopListening")}
            </button>
          )}
        </div>
      </section>

      <TuningPicker settings={settings} />

      {strings && (
        <section className="card space-y-2 p-4" aria-label={t("tuner.strings")}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("tuner.pickString")}>
            <button type="button" className="secondary-button" aria-pressed={lockedIndex === null} onClick={() => setLockedIndex(null)}>
              {t("tuner.auto")}
            </button>
            {strings.map((s, i) => (
              <button
                key={`${s.label}-${i}`}
                type="button"
                className={`secondary-button tabular-nums ${match?.index === i ? "border-felt-600 dark:border-felt-400" : ""}`}
                aria-pressed={lockedIndex === i}
                data-detected={match?.index === i ? "true" : undefined}
                onClick={() => setLockedIndex(lockedIndex === i ? null : i)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {settings.instrument === "guitar" && (
            <label className="flex items-center gap-2 text-sm">
              {t("tuner.capo")}
              <select value={settings.capo} onChange={e => saveTunerSettings({ capo: Number(e.target.value) })} aria-label={t("tuner.capoFretLabel")}>
                {Array.from({ length: 13 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? t("tuner.capoNone") : t("tuner.capoFret", { n: i })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <ReferencePitchControl a4={settings.a4Hz} />

      <section className="card grid gap-3 p-4 text-sm sm:grid-cols-2" aria-label={t("tuner.display")}>
        <label className="flex items-center gap-2">
          {t("tuner.inTuneZone")}
          <select value={settings.greenZoneCents} onChange={e => saveTunerSettings({ greenZoneCents: Number(e.target.value) })} aria-label={t("tuner.inTuneZoneCents")}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(c => (
              <option key={c} value={c}>
                {t("tuner.plusMinusCents", { cents: c })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          {t("tuner.referenceSound")}
          <select value={settings.referenceTimbre} onChange={e => saveTunerSettings({ referenceTimbre: e.target.value === "warm" ? "warm" : "sine" })}>
            <option value="sine">{t("tuner.timbre.sine")}</option>
            <option value="warm">{t("tuner.timbre.warm")}</option>
          </select>
        </label>
      </section>

      <CustomTuningEditor settings={settings} />
    </div>
  );
}

function TuningPicker({ settings }: { settings: TunerSettings }) {
  const presets = tuningPresetsFor(settings.instrument);
  const customs = settings.customTunings.filter(t => t.instrument === settings.instrument);
  return (
    <section className="card space-y-3 p-4" aria-label={t("tuner.instrumentAndTuning")}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("tuner.instrumentLabel")}>
        {(Object.keys(INSTRUMENT_LABELS) as TuningInstrument[]).map(instrument => (
          <button
            key={instrument}
            type="button"
            className="secondary-button"
            aria-pressed={settings.instrument === instrument}
            onClick={() =>
              saveTunerSettings({
                instrument,
                tuningId: tuningPresetsFor(instrument)[0]?.id ?? "chromatic",
              })
            }
          >
            {INSTRUMENT_LABELS[instrument]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        {t("tuner.tuning")}
        <select value={settings.tuningId} onChange={e => saveTunerSettings({ tuningId: e.target.value })} aria-label={t("tuner.tuning")}>
          <option value="chromatic">{t("tuner.chromaticAny")}</option>
          {presets.map(p => (
            <option key={p.id} value={p.id}>
              {presetName(p)} ({p.strings.map(s => s.label).join(" ")})
            </option>
          ))}
          {customs.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.strings.map(s => s.label).join(" ")})
            </option>
          ))}
        </select>
      </label>
      {settings.instrument === "piano" && (
        <p className="text-xs text-slate-500">
          {t("tuner.pianoHint")}
        </p>
      )}
    </section>
  );
}

/** A4 control: ± 0.5 Hz per tap, hold a button for 0.1 Hz fine steps; quick picks (spec 5.3). */
function ReferencePitchControl({ a4 }: { a4: number }) {
  const set = (hz: number) => saveTunerSettings({ a4Hz: clampReferencePitch(hz) });
  return (
    <section className="card space-y-2 p-4" aria-label={t("tuner.referencePitchLabel")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("tuner.referenceA4")}</span>
        <StepButton label={t("tuner.lowerA4")} text="−" onStep={fine => set(a4 - (fine ? REFERENCE_PITCH.fineStepHz : REFERENCE_PITCH.stepHz))} />
        <strong className="w-24 text-center tabular-nums" data-testid="tuner-a4">
          {t("tuner.hz", { hz: a4.toFixed(1) })}
        </strong>
        <StepButton label={t("tuner.raiseA4")} text="+" onStep={fine => set(a4 + (fine ? REFERENCE_PITCH.fineStepHz : REFERENCE_PITCH.stepHz))} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("tuner.commonPitches")}>
        {REFERENCE_PITCH.quickPicksHz.map(hz => (
          <button key={hz} type="button" className="secondary-button text-xs" aria-pressed={a4 === hz} onClick={() => set(hz)}>
            {hz}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{t("tuner.a4Help")}</p>
    </section>
  );
}

function StepButton({ label, text, onStep }: { label: string; text: string; onStep: (fine: boolean) => void }) {
  const timer = useRef<number | null>(null);
  const repeating = useRef(false);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const repeat = () => {
    repeating.current = true;
    stepRef.current(true);
    timer.current = window.setTimeout(repeat, 150);
  };
  return (
    <button
      type="button"
      className="secondary-button w-10"
      aria-label={label}
      onPointerDown={() => {
        repeating.current = false;
        clear();
        timer.current = window.setTimeout(repeat, 450);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onClick={() => {
        clear();
        if (!repeating.current) stepRef.current(false);
        repeating.current = false;
      }}
    >
      {text}
    </button>
  );
}

function ReferenceToneButton({ frequency, label, timbre }: { frequency: number; label: string; timbre: "sine" | "warm" }) {
  const tone = useRef<ReferenceTone | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => tone.current?.setFrequency(frequency), [frequency]);
  useEffect(() => () => tone.current?.stop(), []);
  useEffect(() => {
    // A timbre change restarts a sounding tone.
    if (tone.current) {
      tone.current.stop();
      tone.current = startReferenceTone(frequency, timbre);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timbre]);
  return (
    <button
      type="button"
      className="secondary-button"
      aria-pressed={playing}
      onClick={() => {
        if (tone.current) {
          tone.current.stop();
          tone.current = null;
          setPlaying(false);
        } else {
          tone.current = startReferenceTone(frequency, timbre);
          setPlaying(true);
        }
      }}
    >
      {playing ? t("tuner.stopToneNote", { note: label }) : t("tuner.playToneNote", { note: label })}
    </button>
  );
}

function CustomTuningEditor({ settings }: { settings: TunerSettings }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mine = settings.customTunings.filter(t => t.instrument === settings.instrument);
  if (settings.instrument === "piano") return null;
  return (
    <section className="card space-y-2 p-4 text-sm" aria-label={t("tuner.customTunings")}>
      <h2 className="font-semibold">{t("tuner.yourTunings")}</h2>
      {mine.length > 0 && (
        <ul className="space-y-1">
          {mine.map(tuning => (
            <li key={tuning.id} className="flex items-center justify-between gap-2">
              <span>
                {tuning.name}: {tuning.strings.map(s => s.label).join(" ")}
              </span>
              <button
                type="button"
                className="secondary-button text-xs"
                onClick={() =>
                  saveTunerSettings({
                    customTunings: settings.customTunings.filter(x => x.id !== tuning.id),
                    ...(settings.tuningId === tuning.id ? { tuningId: tuningPresetsFor(settings.instrument)[0]?.id ?? "chromatic" } : {}),
                  })
                }
              >
                {t("tuner.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={e => {
          e.preventDefault();
          const result = validateCustomTuning(name, notes.split(/[\s,]+/).filter(Boolean));
          if (!result.ok) {
            setError(tuningError(result.error));
            return;
          }
          const id = `custom-${Date.now().toString(36)}`;
          saveTunerSettings({
            customTunings: [...settings.customTunings, { id, name: name.trim(), instrument: settings.instrument, strings: result.strings }],
            tuningId: id,
          });
          setName("");
          setNotes("");
          setError(null);
        }}
      >
        <label className="flex flex-col">
          {t("tuner.nameLabel")}
          <input value={name} onChange={e => setName(e.target.value)} className="rounded border px-2 py-1 dark:bg-slate-900" />
        </label>
        <label className="flex flex-col">
          {t("tuner.notesLowToHigh")}
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="D2 A2 D3 G3 B3 E4" className="rounded border px-2 py-1 dark:bg-slate-900" />
        </label>
        <button type="submit" className="secondary-button">
          {t("tuner.saveTuning")}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
}
