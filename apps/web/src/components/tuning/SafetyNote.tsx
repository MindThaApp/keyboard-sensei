import { useId, useState } from "react";
import { Button, Card } from "../ui";
import { t, tRich } from "../../i18n";

/** Where to look for a qualified technician (national associations list members by area). */
export const TECHNICIAN_LINKS = [
  { get label() { return t("tuningAid.link.ptg"); }, href: "https://www.ptg.org/" },
  { get label() { return t("tuningAid.link.pta"); }, href: "https://www.pianotuner.org.uk/" },
] as const;

export function TechnicianRecommendation({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-sm" data-testid="technician-recommendation">
      <p className={compact ? "" : "font-semibold"}>
        {t("tuningAid.technician.best")}
      </p>
      {!compact && (
        <p className="mt-1 opacity-80">
          {t("tuningAid.technician.alsoFix")}
        </p>
      )}
      <p className="mt-1">
        {t("tuningAid.technician.findVia")}{" "}
        {TECHNICIAN_LINKS.map((l, i) => (
          <span key={l.href}>
            {i > 0 && ` ${t("tuningAid.technician.or")} `}
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
        {t("tuningAid.safety.title")}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" data-testid="safety-note">
        <p>{tRich("tuningAid.safety.tools", { strong: (c) => <strong>{c}</strong> })}</p>
        <p>{t("tuningAid.safety.strings")}</p>
        <p>{tRich("tuningAid.safety.technician", { strong: (c) => <strong>{c}</strong> })}</p>
      </div>
      <TechnicianRecommendation compact />
      <label htmlFor={checkId} className="flex items-start gap-2 text-sm">
        <input id={checkId} type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>{t("tuningAid.safety.check")}</span>
      </label>
      <Button variant="filled" size="lg" disabled={!understood} onClick={onAcknowledge}>
        {t("tuningAid.safety.continue")}
      </Button>
    </Card>
  );
}
