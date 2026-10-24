import { useState } from "react";
import { Link } from "react-router-dom";
import type { Song } from "../../services/api";
import { useServerConfig } from "../../services/serverConfig";
import { BrowseArchiveDialog, ImportFromUrlDialog, UploadDialog } from "../settings/SongLibrarySection";
import ScanSheetMusicDialog, { BetaBadge } from "../settings/ScanSheetMusicDialog";
import { Card, ListGroup, ListRow } from "../ui";
import { importSources, type ImportSourceId } from "./importSources";

/**
 * Import: one place to add a song, whatever it comes from. It is a top-level tab so adding
 * your own music is one tap from anywhere; the old home for these (Settings > Library) still
 * lists, edits and deletes what has been added.
 */
export default function ImportPage() {
  const config = useServerConfig();
  const [active, setActive] = useState<ImportSourceId | null>(null);
  const [added, setAdded] = useState<Song[]>([]);

  const sources = importSources({
    archiveAvailable: config !== null && !config.publicCatalogue,
    scanAvailable: config?.sheetMusicRecognition === true,
  });

  const done = (song: Song, close = true) => {
    setAdded((current) => [song, ...current.filter((s) => s.id !== song.id)]);
    if (close) setActive(null);
  };
  const cancel = () => setActive(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-large-title text-label">Import</h1>
        <p className="mt-1 text-subhead text-label-2a">Add your own music to play along with.</p>
      </div>

      {added.length > 0 && (
        <Card as="section" aria-label="Added songs" role="status">
          <h2 className="text-headline text-label">Added to your library</h2>
          <ul className="mt-2 space-y-1">
            {added.map((song) => (
              <li key={song.id} className="flex flex-wrap items-center gap-x-3 text-subhead text-label-2">
                <span className="min-w-0 flex-1 truncate">
                  {song.title}
                  {song.artist && song.artist !== "Unknown" ? ` · ${song.artist}` : ""}
                </span>
                <Link to={`/play/${song.id}`} className="min-h-[44px] content-center font-semibold text-tint">
                  Play
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ListGroup header="Choose a source" aria-label="Import sources">
        {sources.map((source) => (
          <ListRow
            key={source.id}
            icon={source.icon}
            iconColor="var(--tint)"
            title={
              <span className="flex items-center gap-2">
                {source.title}
                {source.beta && <BetaBadge />}
              </span>
            }
            subtitle={source.subtitle}
            accessory={active === source.id ? "Open" : "chevron"}
            onClick={() => setActive((current) => (current === source.id ? null : source.id))}
          />
        ))}
      </ListGroup>

      {active === "file" && <UploadDialog onDone={done} onCancel={cancel} />}
      {active === "url" && <ImportFromUrlDialog onDone={done} onCancel={cancel} />}
      {active === "scan" && <ScanSheetMusicDialog onDone={done} onCancel={cancel} />}
      {active === "archive" && <BrowseArchiveDialog onDone={(song) => done(song, false)} onCancel={cancel} />}

      <p className="text-footnote text-label-2a">
        Songs you add are private to your account.{" "}
        <Link to="/settings?tab=library" className="underline">
          Edit or delete your songs
        </Link>
      </p>
    </div>
  );
}
