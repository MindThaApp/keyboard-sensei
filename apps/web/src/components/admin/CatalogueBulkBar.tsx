import { useEffect, useState } from "react";
import { Button, Sheet, useToast } from "../ui";
import {
  TIERS,
  bulkCatalogue,
  getCatalogueTags,
  type BulkRequest,
  type CatalogueTag,
  type CatalogueWork,
  type CurationStatus,
  type Tier,
} from "./CatalogueApi";
import { fieldClass } from "./CatalogueUi";
import CatalogueWorkPicker from "./CatalogueWorkPicker";

export type BulkActionKey = "publish" | "in_review" | "hide" | "retire" | "unretire" | "tier" | "tag" | "assign";

export interface CatalogueBulkBarProps {
  selected: string[];
  actions: BulkActionKey[];
  onClear: () => void;
  /** Called after a bulk request finished, so the screen reloads. */
  onDone: () => void;
}

type Dialog = "tier" | "tag" | "assign" | null;

const LABEL: Record<Exclude<BulkActionKey, "tier" | "tag" | "assign">, string> = {
  publish: "Publish",
  in_review: "Mark in review",
  hide: "Hide",
  retire: "Retire",
  unretire: "Restore",
};

const STATUS_FOR: Record<"publish" | "in_review" | "hide", CurationStatus> = {
  publish: "published",
  in_review: "in_review",
  hide: "hidden",
};

/** Sticky action bar for the selected songs. Dialogs collect the extra input (reason, tag, Work). */
export default function CatalogueBulkBar({ selected, actions, onClear, onDone }: CatalogueBulkBarProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tier, setTier] = useState<Tier | "clear">("verified");
  const [reason, setReason] = useState("");
  const [tags, setTags] = useState<CatalogueTag[]>([]);
  const [tagId, setTagId] = useState("");
  const [tagMode, setTagMode] = useState<"add_tag" | "remove_tag">("add_tag");
  const [work, setWork] = useState<CatalogueWork | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dialog !== "tag" || tags.length > 0) return;
    getCatalogueTags()
      .then((response) => {
        setTags(response.tags);
        setTagId((current) => current || response.tags[0]?.id || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load tags"));
  }, [dialog, tags.length]);

  const run = async (request: BulkRequest) => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkCatalogue(request);
      const skippedNote = result.skipped > 0 ? `, ${result.skipped} skipped` : "";
      toast.show({ tone: "info", title: `${result.ok} changed${skippedNote}` });
      setDialog(null);
      setReason("");
      onClear();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change failed");
    } finally {
      setBusy(false);
    }
  };

  const simple = (key: keyof typeof LABEL) => {
    if (key === "retire" && !window.confirm(`Retire ${selected.length} song${selected.length === 1 ? "" : "s"}? Play history is kept, and Restore brings them back.`)) return;
    if (key === "publish" || key === "in_review" || key === "hide") {
      void run({ action: "set_status", ids: selected, status: STATUS_FOR[key] });
    } else {
      void run({ action: key, ids: selected });
    }
  };

  const reasonOk = reason.trim().length >= 3;
  const close = () => {
    setDialog(null);
    setError(null);
  };

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-separator bg-cell px-4 py-3 shadow-lg"
      >
        <p className="mr-auto text-[15px] font-medium text-label" aria-live="polite">
          {selected.length} selected
        </p>
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((key) => actions.includes(key)).map((key) => (
          <Button key={key} variant={key === "publish" ? "filled" : "gray"} loading={busy} onClick={() => simple(key)}>
            {LABEL[key]}
          </Button>
        ))}
        {actions.includes("tier") && <Button onClick={() => setDialog("tier")}>Set tier…</Button>}
        {actions.includes("tag") && <Button onClick={() => setDialog("tag")}>Tags…</Button>}
        {actions.includes("assign") && <Button onClick={() => setDialog("assign")}>Assign Work…</Button>}
        <Button variant="plain" onClick={onClear}>Clear</Button>
      </div>

      <Sheet
        open={dialog === "tier"}
        onClose={close}
        title="Set tier"
        leading={<Button variant="plain" onClick={close}>Cancel</Button>}
        trailing={<Button variant="filled" disabled={tier !== "clear" && !reasonOk} loading={busy} onClick={() => void run({ action: "set_tier", ids: selected, tier, reason: tier === "clear" ? "Override removed" : reason })}>Apply</Button>}
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-label-2a">Sets the tier by hand for {selected.length} song(s). The measured tier is kept underneath.</p>
          <label className="block text-sm text-label-2">
            Tier
            <select className={`${fieldClass} mt-1`} value={tier} onChange={(e) => setTier(e.target.value as Tier | "clear")}>
              {TIERS.map((value) => <option key={value} value={value}>{value}</option>)}
              <option value="clear">Remove the override</option>
            </select>
          </label>
          {tier !== "clear" && (
            <label className="block text-sm text-label-2">
              Reason (required)
              <input className={`${fieldClass} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Checked against the score" />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Sheet>

      <Sheet
        open={dialog === "tag"}
        onClose={close}
        title="Tags"
        leading={<Button variant="plain" onClick={close}>Cancel</Button>}
        trailing={<Button variant="filled" disabled={!tagId} loading={busy} onClick={() => void run({ action: tagMode, ids: selected, tag_id: tagId })}>Apply</Button>}
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-label-2a">Tags belong to the Work, so every version of a piece gets them.</p>
          <label className="block text-sm text-label-2">
            Action
            <select className={`${fieldClass} mt-1`} value={tagMode} onChange={(e) => setTagMode(e.target.value as "add_tag" | "remove_tag")}>
              <option value="add_tag">Add tag</option>
              <option value="remove_tag">Remove tag</option>
            </select>
          </label>
          <label className="block text-sm text-label-2">
            Tag
            <select className={`${fieldClass} mt-1`} value={tagId} onChange={(e) => setTagId(e.target.value)}>
              {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label} ({tag.kind})</option>)}
            </select>
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Sheet>

      <Sheet
        open={dialog === "assign"}
        onClose={close}
        detents={["large"]}
        title="Assign Work"
        leading={<Button variant="plain" onClick={close}>Cancel</Button>}
        trailing={<Button variant="filled" disabled={!work} loading={busy} onClick={() => work && void run({ action: "assign_work", ids: selected, work_id: work.id })}>Assign</Button>}
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-label-2a">Links {selected.length} song(s) to one Work. Publishing needs every song to have one.</p>
          <CatalogueWorkPicker onPick={setWork} selectedId={work?.id} />
          {work && <p className="text-sm text-label">Chosen: {work.title}</p>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}
