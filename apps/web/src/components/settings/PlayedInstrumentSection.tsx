import { PLAYED_INSTRUMENTS, type PlayedInstrument } from "@keyboard-sensei/shared-types";
import { useInstrument } from "../../contexts/InstrumentContext";
import { INSTRUMENT_LABEL } from "../../utils/playedInstrument";

/** "What do you play?": any number of instruments, one active (it scopes Learn and Today). */
export function InstrumentChoice({ onDone }: { onDone?: () => void }) {
  const { played, active, choose } = useInstrument();
  const selected = played.length > 0 ? played : [active];

  const toggle = (instrument: PlayedInstrument) => {
    const next = selected.includes(instrument) ? selected.filter((item) => item !== instrument) : [...selected, instrument];
    if (next.length === 0) return;
    choose(next, next.includes(active) ? active : next[0]!);
  };

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-3">
        {PLAYED_INSTRUMENTS.map((instrument) => {
          const isOn = selected.includes(instrument);
          const isActive = active === instrument;
          return (
            <li key={instrument} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                <input type="checkbox" checked={isOn} onChange={() => toggle(instrument)} />
                {INSTRUMENT_LABEL[instrument]}
              </label>
              {isOn && selected.length > 1 && (
                <button
                  type="button"
                  className="secondary-button min-h-11"
                  aria-pressed={isActive}
                  onClick={() => choose(selected, instrument)}
                >
                  {isActive ? "Learning now" : "Switch to this"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {onDone && (
        <button type="button" className="primary-button" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}

export default function PlayedInstrumentSection() {
  return (
    <section className="card space-y-3 p-5" aria-labelledby="played-instrument-heading">
      <div>
        <h3 id="played-instrument-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          What do you play?
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Pick every instrument you learn. The one you are learning now sets the lessons on Learn and Today. Your streak and XP stay shared.
        </p>
      </div>
      <InstrumentChoice />
    </section>
  );
}
