import type { LessonDetail, LessonListItem, MidiExercise, OfflineContentBundle, UserProgress } from "@keyboard-sensei/shared-types";
import { offlineStore } from "./kvStore";

/**
 * Offline lesson content (spec 8.5). The bundle (every live lesson and its
 * exercises) is shared by all accounts on the device; lesson lists, progress and
 * lesson details carry per-account progress, so they are cached per user scope.
 */
const BUNDLE_KEY = "content:bundle";
const listKey = (scope: string) => `user:${scope}:lessons`;
const progressKey = (scope: string) => `user:${scope}:progress`;
const detailKey = (scope: string, lessonId: string) => `user:${scope}:lesson:${lessonId}`;

export const cachedBundle = () => offlineStore().get<OfflineContentBundle>(BUNDLE_KEY);

/**
 * Downloads the bundle unless the cached copy has the server's content hash.
 * `fetchBundle(hash)` returns null for a 304 (unchanged). Returns true when a new
 * bundle was stored.
 */
export async function syncContentBundle(
  fetchBundle: (knownHash: string | undefined) => Promise<OfflineContentBundle | null>,
): Promise<boolean> {
  const known = await cachedBundle();
  const fresh = await fetchBundle(known?.contentHash);
  if (!fresh || fresh.contentHash === known?.contentHash) return false;
  await offlineStore().set(BUNDLE_KEY, fresh);
  return true;
}

export const rememberLessonList = (scope: string, lessons: LessonListItem[]) => offlineStore().set(listKey(scope), lessons);
export const rememberProgress = (scope: string, progress: UserProgress) => offlineStore().set(progressKey(scope), progress);
export const rememberLessonDetail = (scope: string, detail: LessonDetail) =>
  offlineStore().set(detailKey(scope, detail.lesson.id), detail);

export async function cachedLessonList(scope: string): Promise<LessonListItem[] | undefined> {
  const list = await offlineStore().get<LessonListItem[]>(listKey(scope));
  if (list) return list;
  // Never listed online on this device, but content was downloaded: show it with
  // only the first lesson open, as for a brand-new account.
  const bundle = await cachedBundle();
  if (!bundle) return undefined;
  return bundle.lessons.map(({ lesson, order }) => ({
    ...lesson,
    order,
    progress: { lessonId: lesson.id, status: order === bundle.lessons[0]?.order ? "unlocked" : "locked", bestScore: 0, completedAt: null },
  })) as LessonListItem[];
}

export const cachedProgress = (scope: string) => offlineStore().get<UserProgress>(progressKey(scope));

/** The lesson as last opened online, else assembled from the bundle and the cached list. */
export async function cachedLessonDetail(scope: string, lessonId: string): Promise<LessonDetail | undefined> {
  const stored = await offlineStore().get<LessonDetail>(detailKey(scope, lessonId));
  const bundle = await cachedBundle();
  const entry = bundle?.lessons.find((item) => item.lesson.id === lessonId);
  // Prefer the newer content when the bundle was refreshed after the detail was cached.
  if (stored && !entry) return stored;
  if (!entry) return undefined;
  const listed = (await cachedLessonList(scope))?.find((item) => item.id === lessonId);
  return {
    lesson: entry.lesson,
    progress: listed?.progress ?? stored?.progress ?? null,
    exercises: entry.exercises,
    exerciseBests: stored?.exerciseBests ?? {},
  };
}

/** Finds an exercise for offline scoring: bundle first, then any cached lesson detail. */
export async function cachedExercise(scope: string, exerciseId: string): Promise<MidiExercise | undefined> {
  const bundle = await cachedBundle();
  for (const entry of bundle?.lessons ?? []) {
    const found = entry.exercises.find((item) => item.exerciseId === exerciseId);
    if (found) return found;
  }
  for (const key of await offlineStore().keys(`user:${scope}:lesson:`)) {
    const detail = await offlineStore().get<LessonDetail>(key);
    const found = detail?.exercises.find((item) => item.exerciseId === exerciseId);
    if (found) return found;
  }
  return undefined;
}
