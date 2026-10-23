import { API_URL, ApiError, getToken } from "../../services/api";

export type Tier = "verified" | "good" | "unrated" | "low";
export type CurationStatus = "draft" | "in_review" | "published" | "hidden" | "retired";

export const TIERS: Tier[] = ["verified", "good", "unrated", "low"];
export const STATUSES: CurationStatus[] = ["draft", "in_review", "published", "hidden", "retired"];

export const STATUS_LABEL: Record<CurationStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  hidden: "Hidden",
  retired: "Retired",
};

export interface CatalogueSong {
  id: string;
  title: string;
  artist: string;
  arrangement_level: string | null;
  duration_sec: number;
  note_count: number;
  difficulty: number;
  source_kind: string | null;
  source_ref: string | null;
  file_licence: string | null;
  public_eligible: boolean;
  quality_tier: Tier;
  tier_override: Tier | null;
  tier_override_reason: string | null;
  effective_tier: Tier;
  quality_score: number | null;
  quality_signals: Record<string, number | boolean | string> | null;
  grade_band: string | null;
  hands: string | null;
  retired_at: string | null;
  work_id: string | null;
  work: { id: string; title: string; curation_status: CurationStatus } | null;
  attempt_count: number;
  reasons: string[];
}

export interface CatalogueWork {
  id: string;
  title: string;
  catalogue: string | null;
  curation_status: CurationStatus;
  genre: string;
  era: string | null;
  featured_rank: number | null;
  pd_status: string;
  composer: string | null;
  aliases: { alias: string; kind: string }[];
  tags: string[];
  song_count: number;
}

export interface CatalogueTag {
  id: string;
  label: string;
  kind: string;
}

export interface CatalogueEvent {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  work_id: string | null;
  work_title: string | null;
  song_id: string | null;
  song_title: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  at: string;
}

export interface SongFilters {
  tier?: Tier;
  status?: CurationStatus | "none";
  source?: string;
  licence?: string;
  eligible?: boolean;
  nowork?: boolean;
  retired?: "hide" | "only" | "all";
  q?: string;
  limit?: number;
  offset?: number;
}

export type BulkRequest =
  | { action: "set_status"; ids: string[]; status: CurationStatus; reason?: string }
  | { action: "retire" | "unretire"; ids: string[]; reason?: string }
  | { action: "set_tier"; ids: string[]; tier: Tier | "clear"; reason: string }
  | { action: "add_tag" | "remove_tag"; ids: string[]; tag_id: string; reason?: string }
  | { action: "assign_work"; ids: string[]; work_id: string; reason?: string };

export interface BulkResponse {
  results: { id: string; outcome: "ok" | "skipped"; reason?: string }[];
  ok: number;
  skipped: number;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`, response.status, body?.error?.code);
  return body as T;
}

const query = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const getCatalogueSongs = (filters: SongFilters) =>
  call<{ songs: CatalogueSong[]; total: number }>(`/admin/catalogue/songs${query({ ...filters })}`);

export const getCatalogueQueue = () => call<{ songs: CatalogueSong[] }>("/admin/catalogue/queue");

export const bulkCatalogue = (request: BulkRequest) =>
  call<BulkResponse>("/admin/catalogue/bulk", { method: "POST", body: JSON.stringify(request) });

export const getCatalogueWorks = (q: string, limit = 20) =>
  call<{ works: CatalogueWork[] }>(`/admin/catalogue/works${query({ q, limit })}`);

export const getCatalogueTags = () => call<{ tags: CatalogueTag[] }>("/admin/catalogue/tags");

export interface WorkEdit {
  title?: string;
  catalogue?: string | null;
  era?: string | null;
  genre?: string;
  featured_rank?: number | null;
  aliases?: { alias: string; kind: string }[];
  reason?: string;
}

export const editCatalogueWork = (id: string, edit: WorkEdit) =>
  call<{ work: unknown }>(`/admin/catalogue/works/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(edit) });

export const mergeCatalogueWorks = (from_id: string, into_id: string, reason?: string) =>
  call<{ songs_moved: number; aliases_added: number; tags_moved: number }>("/admin/catalogue/works/merge", {
    method: "POST",
    body: JSON.stringify({ from_id, into_id, reason }),
  });

export const getCatalogueEvents = (filters: { song_id?: string; work_id?: string; actor_id?: string; action?: string; limit?: number; offset?: number }) =>
  call<{ events: CatalogueEvent[]; total: number }>(`/admin/catalogue/events${query(filters)}`);

export const undoCatalogueEvent = (id: string) =>
  call<{ ok: true }>(`/admin/catalogue/events/${encodeURIComponent(id)}/undo`, { method: "POST" });

/** The licence report, fetched with the sign-in token (a plain link cannot send it). */
export async function downloadLicenceCsv(): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_URL}/admin/catalogue/licences.csv`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(`Could not export licences (${response.status})`, response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "keyboard-sensei-licences.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const REASON_LABEL: Record<string, string> = {
  "performance-timing": "Performance timing (not quantised)",
  "partly-unquantised": "Partly unquantised",
  fragment: "Too short",
  "very-long": "Very long",
  "single-track": "Single track",
  "no-hand-split": "No hand split",
  "no-work": "No Work",
  "licence-unknown": "Licence unknown",
  "not-public-eligible": "Not public-eligible",
  "no-measurement": "Not measured",
};

/** Undo is offered for what the server can reverse (everything except a merge). */
export const isUndoable = (event: CatalogueEvent): boolean =>
  event.action !== "merge" && event.action !== "import" && event.action !== "classify" && event.before !== null;
