import { Chip } from "../ui";
import { STATUS_LABEL, type CurationStatus, type Tier } from "./CatalogueApi";

/** Text input / select look shared by every catalogue screen (44px tall for touch). */
export const fieldClass =
  "min-h-[44px] w-full rounded-lg border border-separator bg-cell px-3 py-2 text-[15px] text-label placeholder:text-label-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tint";

export function TierChip({ tier, overridden = false }: { tier: Tier; overridden?: boolean }) {
  const tone = tier === "verified" ? "success" : tier === "good" ? "tint" : "neutral";
  return (
    <Chip tone={tone}>
      {tier[0]!.toUpperCase() + tier.slice(1)}
      {overridden ? " (set by hand)" : ""}
    </Chip>
  );
}

export function StatusChip({ status }: { status: CurationStatus | null }) {
  if (!status) return <Chip>No Work</Chip>;
  return <Chip tone={status === "published" ? "success" : "neutral"}>{STATUS_LABEL[status]}</Chip>;
}

export const formatDuration = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** "7 minutes ago" style is overkill for an audit log; an absolute local time is unambiguous. */
export const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
