import { useId, useState } from "react";
import { Button, Card } from "../ui";

/** Where to look for a qualified technician (national associations list members by area). */
export const TECHNICIAN_LINKS = [
  { label: "Piano Technicians Guild (North America)", href: "https://www.ptg.org/" },
  { label: "Pianoforte Tuners' Association (UK)", href: "https://www.pianotuner.org.uk/" },
] as const;

export function TechnicianRecommendation({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-sm" data-testid="technician-recommendation">
      <p className={compact ? "" : "font-semibold"}>
        For most pianos the best choice is a qualified piano technician.
      </p>
      {!compact && (
        <p className="mt-1 opacity-80">
          A technician can also fix loose pins, broken strings and regulation problems the tuning aid cannot see.
        </p>
      )}
      <p className="mt-1">
        Find one through your country's piano technicians' association, for example{" "}
        {TECHNICIAN_LINKS.map((l, i) => (
          <span key={l.href}>
            {i > 0 && " or "}
            <a className="underline" href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}

/** Safety note from spec 6.3; guidance starts only after the explicit "I understand". */
export default function SafetyNote({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const checkId = useId();
  return (
    <Card as="section" aria-labelledby={`${checkId}-title`} className="space-y-4">
      <h2 id={`${checkId}-title`} className="text-lg font-semibold">
        Before you start: tuning safely
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" data-testid="safety-note">
        <p>
          Turning tuning pins changes the tension on strings that together hold many tonnes of load. Use a proper{" "}
          <strong>piano tuning lever (tuning hammer)</strong> with a tip that fits the pins exactly; never use pliers,
          wrenches or socket sets, which damage pins and the pin block. Make very small movements, set the pin rather
          than bending it, and never raise a string far above its target pitch.
        </p>
        <p>
          Old or rusty strings can break and cause injury: wear eye protection, keep your face away from the strings,
          and stop if a string or pin feels wrong. Loose pins, cracked pin blocks, very old pianos and pianos far below
          pitch need a professional.
        </p>
        <p>
          <strong>For most pianos the best choice is a qualified piano technician.</strong> Music Portal's Piano check
          helps you know when to call one and what to tell them; the tuning aid is for people who accept the risks
          above.
        </p>
      </div>
      <TechnicianRecommendation compact />
      <label htmlFor={checkId} className="flex items-start gap-2 text-sm">
        <input id={checkId} type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>I understand the risks and will use a proper tuning lever.</span>
      </label>
      <Button variant="filled" size="lg" disabled={!understood} onClick={onAcknowledge}>
        I understand, continue
      </Button>
    </Card>
  );
}
