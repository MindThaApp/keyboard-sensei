import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "../ui";
import { getCatalogueQueue, type CatalogueSong } from "./CatalogueApi";
import CatalogueBulkBar from "./CatalogueBulkBar";
import CatalogueSongTable from "./CatalogueSongTable";

/** Draft and in-review songs, with what the classifier measured, ready to publish as a batch. */
export default function CatalogueQueue({ readOnly }: { readOnly: boolean }) {
  const [songs, setSongs] = useState<CatalogueSong[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getCatalogueQueue()
      .then((response) => {
        if (!cancelled) setSongs(response.songs);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the queue");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  if (error) return <ErrorState title="Could not load the import queue" message={error} action={<Button onClick={reload}>Try again</Button>} />;
  if (!songs) return <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} height={72} radius={12} />)}</div>;
  if (songs.length === 0) return <EmptyState title="The queue is empty" message="Songs arrive here as drafts when an import pack is run. Nothing goes live until you publish it." />;

  const unpublishable = songs.filter((song) => !song.work_id).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-label-2" aria-live="polite">
        {songs.length} song{songs.length === 1 ? "" : "s"} waiting for review.
        {unpublishable > 0 ? ` ${unpublishable} have no Work yet and cannot be published until one is assigned.` : ""}
      </p>
      <CatalogueSongTable songs={songs} selected={selected} onSelectedChange={setSelected} readOnly={readOnly} variant="queue" />
      {!readOnly && selected.size > 0 && (
        <CatalogueBulkBar
          selected={[...selected]}
          actions={["publish", "in_review", "hide", "retire", "tier", "assign"]}
          onClear={() => setSelected(new Set())}
          onDone={reload}
        />
      )}
    </div>
  );
}
