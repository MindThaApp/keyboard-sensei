export type ImportSourceId = "file" | "url" | "scan" | "archive";

export interface ImportSource {
  id: ImportSourceId;
  title: string;
  subtitle: string;
  icon: string;
  beta?: boolean;
}

export interface ImportAvailability {
  /** The public deployment cannot redistribute the (non-commercial) archive. */
  archiveAvailable: boolean;
  /** Server has sheet-music recognition configured. */
  scanAvailable: boolean;
}

const SOURCES: Record<ImportSourceId, ImportSource> = {
  file: {
    id: "file",
    title: "Upload a file",
    subtitle: "MIDI, MusicXML, MEI, ABC or Humdrum **kern from this device",
    icon: "↑",
  },
  url: {
    id: "url",
    title: "Import from a link",
    subtitle: "Paste the address of a MIDI file or a score",
    icon: "↗",
  },
  scan: {
    id: "scan",
    title: "Photo or PDF of sheet music",
    subtitle: "Read the notes from a picture or a scanned page",
    icon: "▣",
    beta: true,
  },
  archive: {
    id: "archive",
    title: "Browse the archive",
    subtitle: "Pick from a large public collection of MIDI files",
    icon: "≡",
  },
};

/** The import options on offer, in display order. Unavailable ones are left out, never greyed. */
export function importSources({ archiveAvailable, scanAvailable }: ImportAvailability): ImportSource[] {
  const ids: ImportSourceId[] = ["file", "url"];
  if (scanAvailable) ids.push("scan");
  if (archiveAvailable) ids.push("archive");
  return ids.map((id) => SOURCES[id]);
}
