import { rm, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db.js";
import { FEEDBACK_SCREENSHOT_DIR } from "./feedback.js";
import { INSTRUMENT_LIBRARY_DIR } from "./instruments.js";
import { MIDI_LIBRARY_DIR } from "./songs.js";

/** The shared "Start Demo" account. Deleting it would break the demo for everyone. */
export const DEMO_EMAIL = "demo@keyboardsensei.local";

export class AccountDeletionRefused extends Error {
  constructor(
    readonly code: "demo_account" | "last_admin",
    message: string,
  ) {
    super(message);
  }
}

export interface AccountDeletionReport {
  userId: string;
  /** Files removed from disk (uploads, archive imports, instrument packs, screenshots). */
  filesRemoved: number;
  /** Files that should have been removed but could not be (logged; rows are gone regardless). */
  filesFailed: string[];
}

/** True when `candidate` is strictly inside `dir`: never delete outside the data folders. */
const isInside = (dir: string, candidate: string): boolean => {
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(dir) + path.sep);
};

/**
 * Deletes a user and everything that belongs to them.
 *
 * Rows: every per-user table cascades from User (exercise/quiz/play-along attempts,
 * lesson progress, XP ledger, practice days, achievements, TTS usage, emailed tokens,
 * uploaded songs and instruments -- and other users' attempts on those songs). Feedback
 * would only be detached (SetNull), so it is deleted explicitly: it holds the user's
 * words, page paths, user agent and screenshots.
 *
 * Files: uploads and archive imports (MIDI + MusicXML), uploaded instrument packs and
 * feedback screenshots. Paths are collected before the rows go, and removed only after
 * the database commit, so a failed transaction never leaves rows pointing at deleted
 * files. Only paths inside the app's own data folders are touched.
 */
export async function deleteUserAccount(
  userId: string,
  options: { allowDemo?: boolean } = {},
): Promise<AccountDeletionReport> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  if (user.email === DEMO_EMAIL && !options.allowDemo) {
    throw new AccountDeletionRefused("demo_account", "The shared demo account can't be deleted.");
  }
  if (user.role === "admin" && (await prisma.user.count({ where: { role: "admin" } })) <= 1) {
    throw new AccountDeletionRefused("last_admin", "This is the only admin account. Make someone else an admin first.");
  }

  const [songs, instruments, feedback] = await Promise.all([
    prisma.song.findMany({ where: { uploader_id: userId }, select: { file_path: true, notation_path: true } }),
    prisma.instrument.findMany({ where: { uploader_id: userId }, select: { pack_path: true } }),
    prisma.feedback.findMany({ where: { user_id: userId, screenshot: { not: null } }, select: { screenshot: true } }),
  ]);
  const files = [
    ...songs.flatMap((song) => [song.file_path, song.notation_path]).filter((file): file is string => Boolean(file) && isInside(MIDI_LIBRARY_DIR, file!)),
    ...feedback
      .map((row) => path.join(FEEDBACK_SCREENSHOT_DIR, path.basename(row.screenshot!)))
      .filter((file) => isInside(FEEDBACK_SCREENSHOT_DIR, file)),
  ];
  const directories = instruments.map((row) => row.pack_path).filter((dir) => isInside(INSTRUMENT_LIBRARY_DIR, dir));

  await prisma.$transaction([
    prisma.feedback.deleteMany({ where: { user_id: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  const filesFailed: string[] = [];
  let filesRemoved = 0;
  for (const file of files) {
    try {
      await unlink(file);
      filesRemoved += 1;
    } catch (error) {
      // Already gone is fine; anything else is reported.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") filesFailed.push(file);
    }
  }
  for (const dir of directories) {
    try {
      await rm(dir, { recursive: true, force: true });
      filesRemoved += 1;
    } catch {
      filesFailed.push(dir);
    }
  }
  if (filesFailed.length) console.error(`Account ${userId} deleted, but these files could not be removed:`, filesFailed);
  return { userId, filesRemoved, filesFailed };
}
