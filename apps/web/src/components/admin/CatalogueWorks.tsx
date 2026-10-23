import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ErrorState, Sheet, Skeleton, useToast } from "../ui";
import { editCatalogueWork, getCatalogueWorks, mergeCatalogueWorks, type CatalogueWork } from "./CatalogueApi";
import { StatusChip, fieldClass } from "./CatalogueUi";
import CatalogueWorkPicker from "./CatalogueWorkPicker";

const aliasesToText = (work: CatalogueWork): string => work.aliases.map((alias) => alias.alias).join("\n");

function EditSheet({ work, onClose, onSaved }: { work: CatalogueWork | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [catalogue, setCatalogue] = useState("");
  const [era, setEra] = useState("");
  const [rank, setRank] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!work) return;
    setTitle(work.title);
    setCatalogue(work.catalogue ?? "");
    setEra(work.era ?? "");
    setRank(work.featured_rank === null ? "" : String(work.featured_rank));
    setAliases(aliasesToText(work));
    setError(null);
  }, [work]);

  const save = async () => {
    if (!work) return;
    setBusy(true);
    setError(null);
    try {
      const kindOf = new Map(work.aliases.map((alias) => [alias.alias, alias.kind]));
      const names = [...new Set(aliases.split("\n").map((line) => line.trim()).filter(Boolean))];
      await editCatalogueWork(work.id, {
        title: title.trim(),
        catalogue: catalogue.trim() || null,
        era: era.trim() || null,
        featured_rank: rank.trim() === "" ? null : Number(rank),
        aliases: names.map((alias) => ({ alias, kind: kindOf.get(alias) ?? "nickname" })),
      });
      toast.show({ tone: "info", title: "Work saved" });
      onClose();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={work !== null}
      onClose={onClose}
      detents={["large"]}
      title="Edit Work"
      leading={<Button variant="plain" onClick={onClose}>Cancel</Button>}
      trailing={<Button variant="filled" disabled={!title.trim()} loading={busy} onClick={() => void save()}>Save</Button>}
    >
      <div className="space-y-3 p-4">
        <label className="block text-sm text-label-2">Title<input className={`${fieldClass} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block text-sm text-label-2">Catalogue number<input className={`${fieldClass} mt-1`} value={catalogue} onChange={(e) => setCatalogue(e.target.value)} placeholder="Op. 28 No. 4" /></label>
        <label className="block text-sm text-label-2">Era<input className={`${fieldClass} mt-1`} value={era} onChange={(e) => setEra(e.target.value)} placeholder="romantic" /></label>
        <label className="block text-sm text-label-2">Featured rank (blank = not featured)<input className={`${fieldClass} mt-1`} inputMode="numeric" value={rank} onChange={(e) => setRank(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="block text-sm text-label-2">
          Other names people search for (one per line)
          <textarea className={`${fieldClass} mt-1 min-h-[96px]`} value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function MergeSheet({ from, onClose, onMerged }: { from: CatalogueWork | null; onClose: () => void; onMerged: () => void }) {
  const toast = useToast();
  const [into, setInto] = useState<CatalogueWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInto(null);
    setError(null);
  }, [from]);

  const merge = async () => {
    if (!from || !into) return;
    if (!window.confirm(`Move everything from "${from.title}" into "${into.title}"? "${from.title}" is then retired. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await mergeCatalogueWorks(from.id, into.id);
      toast.show({ tone: "info", title: `Merged: ${result.songs_moved} song(s) moved` });
      onClose();
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={from !== null}
      onClose={onClose}
      detents={["large"]}
      title="Merge Work"
      leading={<Button variant="plain" onClick={onClose}>Cancel</Button>}
      trailing={<Button variant="filled" disabled={!into} loading={busy} onClick={() => void merge()}>Merge</Button>}
    >
      <div className="space-y-3 p-4">
        <p className="text-sm text-label-2">
          Duplicate: <strong className="text-label">{from?.title}</strong>. Choose the Work to keep. Its songs, names and tags move there, and the duplicate is retired.
        </p>
        <CatalogueWorkPicker onPick={setInto} excludeId={from?.id} selectedId={into?.id} />
        {into && <p className="text-sm text-label">Keeping: {into.title}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

/** Find a Work, edit its name and aliases, or merge a duplicate into it. */
export default function CatalogueWorks({ readOnly }: { readOnly: boolean }) {
  const [q, setQ] = useState("");
  const [works, setWorks] = useState<CatalogueWork[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogueWork | null>(null);
  const [merging, setMerging] = useState<CatalogueWork | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      getCatalogueWorks(q.trim(), 50)
        .then((response) => {
          if (!cancelled) {
            setWorks(response.works);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load Works");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return (
    <div className="space-y-4">
      <label className="block max-w-md text-xs text-label-2">
        Search Works
        <input type="search" className={`${fieldClass} mt-1`} placeholder="Title, composer, alias or catalogue number" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error ? (
        <ErrorState title="Could not load Works" message={error} action={<Button onClick={reload}>Try again</Button>} />
      ) : !works ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={12} />)}</div>
      ) : works.length === 0 ? (
        <EmptyState title="No Work matches" />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-separator">
            {works.map((work) => (
              <li key={work.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-label">{work.title}</p>
                  <p className="truncate text-xs text-label-2a">
                    {[work.composer, work.catalogue, `${work.song_count} song${work.song_count === 1 ? "" : "s"}`, work.aliases.length ? `${work.aliases.length} alias${work.aliases.length === 1 ? "" : "es"}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <StatusChip status={work.curation_status} />
                {!readOnly && (
                  <>
                    <Button size="sm" onClick={() => setEditing(work)}>Edit</Button>
                    <Button size="sm" onClick={() => setMerging(work)}>Merge into…</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <EditSheet work={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <MergeSheet from={merging} onClose={() => setMerging(null)} onMerged={reload} />
    </div>
  );
}
