/**
 * Integration tests against a REAL Postgres, through the real Express app over HTTP.
 * Every other API suite mocks Prisma; this one exists because the bugs that matter here
 * (unique-constraint ordering, unlock chain writes, conditional atomic updates) are
 * database semantics that a mock cannot exhibit.
 *
 * Runs only when TEST_DATABASE_URL is set (vitest.setup.ts points DATABASE_URL at it),
 * otherwise skips. It TRUNCATES every table, so it refuses to run unless the database
 * name contains "test". Kept in ONE file on purpose: vitest runs files in parallel,
 * and two files truncating the same database would race.
 *
 *   export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/keyboard_sensei_test
 *   DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @keyboard-sensei/api exec prisma migrate deploy
 *   pnpm --filter @keyboard-sensei/api test
 */
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@keyboard-sensei/shared-types";
import { Midi } from "@tonejs/midi";
import bcrypt from "bcryptjs";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

if (enabled && !/test/i.test(new URL(TEST_DATABASE_URL!).pathname)) {
  throw new Error(`TEST_DATABASE_URL must name a database containing "test" — this suite truncates every table`);
}

// Loaded lazily so that, when skipped, nothing here constructs a PrismaClient.
type Modules = {
  app: typeof import("./app.js").app;
  prisma: typeof import("./db.js").prisma;
  createAccessToken: typeof import("./auth.js").createAccessToken;
  content: typeof import("./content.js");
  seedContent: typeof import("./seed-content.js").seedContent;
  tts: typeof import("./tts.js");
  env: typeof import("./config.js").env;
  mailer: typeof import("./mailer.js");
  google: typeof import("./google.js");
  songs: typeof import("./songs.js");
  feedback: typeof import("./feedback.js");
  instruments: typeof import("./instruments.js");
};
let m: Modules;
let server: ReturnType<Modules["app"]["listen"]>;
let baseUrl = "";

async function truncateAll(): Promise<void> {
  const tables = await m.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await m.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

async function api(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let userCounter = 0;
const nextEmail = () => {
  userCounter += 1;
  return `user${userCounter}-${Date.now()}@test.local`;
};

/** Through the real route. Rate-limited per IP, so only the auth tests use it. */
async function registerUser(): Promise<{ id: string; token: string; email: string }> {
  const email = nextEmail();
  const res = await api("POST", "/auth/register", {
    body: { email, password: "correct-horse-battery", display_name: "Registered user" },
  });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, token: res.body.accessToken, email };
}

/** Straight into the database, with a real signed token. */
async function createUser(): Promise<{ id: string; token: string; email: string }> {
  const email = nextEmail();
  const user = await m.prisma.user.create({ data: { email, display_name: "Test user", password_hash: "x" } });
  return { id: user.id, token: m.createAccessToken({ sub: user.id, email }), email };
}

const PASSWORD = "correct-horse-battery";
/** Like createUser, with a real password hash (cost 4 keeps the suite fast). */
async function createUserWithPassword(role: "user" | "admin" = "user"): Promise<{ id: string; token: string; email: string }> {
  const email = nextEmail();
  const user = await m.prisma.user.create({
    data: { email, display_name: "Test user", password_hash: await bcrypt.hash(PASSWORD, 4), role },
  });
  return { id: user.id, token: m.createAccessToken({ sub: user.id, email }), email };
}

/** Captures outgoing email instead of logging it. */
type Mail = { to: string; subject: string; text: string };
const outbox: Mail[] = [];
const captureTransport = { name: "capture", send: async (message: Mail) => void outbox.push(message) };
async function waitForMail(to: string, subject: RegExp): Promise<Mail> {
  for (let i = 0; i < 100; i += 1) {
    const found = outbox.find((mail) => mail.to === to && subject.test(mail.subject));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No email "${subject}" to ${to}`);
}
const tokenFrom = (text: string): string => text.match(/token=([A-Za-z0-9_-]+)/)![1]!;

/** Every row in any table that references this user, found by column name rather than a hand-kept list. */
async function rowsReferencing(userId: string): Promise<Record<string, number>> {
  const columns = await m.prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('user_id', 'uploader_id')`;
  const counts: Record<string, number> = {};
  for (const { table_name, column_name } of columns) {
    const [row] = await m.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "public"."${table_name}" WHERE "${column_name}" = $1`,
      userId,
    );
    counts[`${table_name}.${column_name}`] = Number(row!.n);
  }
  return counts;
}

const midiBytes = (): Buffer => {
  const midi = new Midi();
  const track = midi.addTrack();
  for (let i = 0; i < 64; i += 1) track.addNote({ midi: 60 + (i % 12), time: i * 0.5, duration: 0.4 });
  return Buffer.from(midi.toArray());
};
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const statusOf = async (token: string, lessonId: string): Promise<string> => {
  const res = await api("GET", "/lessons", { token });
  expect(res.status).toBe(200);
  return res.body.find((item: { id: string }) => item.id === lessonId).progress.status;
};

/** exercise-01 is untimed: C3, C4, C5 in order passes; wrong pitches fail. */
const exerciseOneNotes = (pitches: number[]) =>
  pitches.map((note, index) => ({
    note,
    velocity: 80,
    startTimestampMs: index * 750,
    endTimestampMs: index * 750 + 600,
    durationMs: 600,
  }));

/** A note-perfect, perfectly timed performance of any content exercise. */
const perfectRun = (exerciseId: string) => {
  const exercise = m.content.exercises.find((item) => item.exerciseId === exerciseId)!;
  const msPerBeat = 60_000 / exercise.tempoBpm;
  return exercise.expected.map((note) => ({
    note: note.note,
    velocity: 80,
    startTimestampMs: 1_000 + note.startBeat * msPerBeat,
    endTimestampMs: 1_000 + (note.startBeat + note.durationBeats) * msPerBeat,
    durationMs: note.durationBeats * msPerBeat,
  }));
};

const exerciseIdsOf = (lessonId: string) =>
  m.content.lessons
    .find((lesson) => lesson.id === lessonId)!
    .sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []));

async function passEveryExercise(token: string, lessonId: string): Promise<void> {
  for (const exerciseId of exerciseIdsOf(lessonId)) {
    const res = await api("POST", `/exercises/${exerciseId}/attempts`, { token, body: { performedNotes: perfectRun(exerciseId) } });
    expect(res.status).toBe(201);
    expect(res.body.score, exerciseId).toBeGreaterThanOrEqual(70);
  }
}

const quizQuestions = (lessonId: string) =>
  m.content.lessons
    .find((lesson) => lesson.id === lessonId)!
    .sections.flatMap((section) => (section.type === "quiz" ? section.questions : []));

describe.skipIf(!enabled)("API against a real Postgres", () => {
  beforeAll(async () => {
    m = {
      app: (await import("./app.js")).app,
      prisma: (await import("./db.js")).prisma,
      createAccessToken: (await import("./auth.js")).createAccessToken,
      content: await import("./content.js"),
      seedContent: (await import("./seed-content.js")).seedContent,
      tts: await import("./tts.js"),
      env: (await import("./config.js")).env,
      mailer: await import("./mailer.js"),
      google: await import("./google.js"),
      songs: await import("./songs.js"),
      feedback: await import("./feedback.js"),
      instruments: await import("./instruments.js"),
    };
    await truncateAll();
    server = m.app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await m.prisma.$disconnect();
  });

  beforeEach(async () => {
    // Every test starts from exactly the shipped content.
    await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
  });

  describe("public catalogue (PUBLIC_CATALOGUE)", () => {
    it("serves only Essentials, the beginner pack and the user's own songs; admins see everything", async () => {
      const dir = await mkdtemp(join(tmpdir(), "ks-catalogue-"));
      await mkdir(join(dir, "essentials"));
      const write = async (name: string) => {
        const file = join(dir, name);
        await writeFile(file, midiBytes());
        return file;
      };
      const owner = await createUser();
      const stranger = await createUser();
      const admin = await createUserWithPassword("admin");
      const base = { artist: "x", genre: "classical", difficulty: 1, duration_sec: 4, note_count: 8 };
      const songs = {
        library: await m.prisma.song.create({ data: { ...base, title: "ADL cover", content_rights: "cover-arrangement", file_path: await write("seed-cover.mid") } }),
        essentials: await m.prisma.song.create({
          data: { ...base, id: "essentials-test-piece-full", title: "Essential", content_rights: "cc-by-sa-2.5", file_licence: "cc-by-sa-2.5", source_kind: "essentials", public_eligible: true, attribution: "Typeset by someone, CC BY-SA", file_path: await write("essentials/test-piece-full.mid") },
        }),
        beginner: await m.prisma.song.create({ data: { ...base, title: "Beginner tune", content_rights: "public-domain", file_licence: "public-domain", source_kind: "beginner", public_eligible: true, file_path: await write("beginner-test-tune.mid") } }),
        // Looks like a pack file but the catalogue never cleared it: the column decides, not the path.
        uncleared: await m.prisma.song.create({
          data: { ...base, title: "Uncleared", content_rights: "cc-by-nc-sa-4.0", file_licence: "cc-by-nc-sa-4.0", source_kind: "essentials", public_eligible: false, attribution: "Not for the public build", file_path: await write("essentials/uncleared-full.mid") },
        }),
        upload: await m.prisma.song.create({ data: { ...base, title: "Owner upload", content_rights: "user-upload", file_path: await write("upload-owner.mid"), uploader_id: owner.id } }),
        archive: await m.prisma.song.create({
          data: { ...base, title: "Owner archive import", content_rights: "archive-import", file_path: await write("archive-owner.mid"), notation_path: await write("archive-owner.mxl"), uploader_id: owner.id },
        }),
      };
      const listed = async (token: string) =>
        new Set(((await api("GET", "/songs", { token })).body.songs as { id: string }[]).map((song) => song.id));
      const ids = (...keys: (keyof typeof songs)[]) => new Set(keys.map((key) => songs[key].id));
      const attempt = { score: 80, accuracy: 90, tempo_pct: 100, lookahead_s: 3, wait_mode: false };

      try {
        // Off (the default): the LAN behaviour, unchanged.
        expect(m.env.PUBLIC_CATALOGUE).toBe(false);
        expect(await listed(stranger.token)).toEqual(ids("library", "essentials", "beginner", "uncleared"));
        expect((await api("GET", `/songs/${songs.library.id}/file`, { token: stranger.token })).status).toBe(200);

        // Credits (no sign-in): every shared CC-licensed song, with its attribution.
        const credits = async () => (await api("GET", "/credits")).body.credits as { song_id: string; attribution: string; licence: string; licence_url: string }[];
        const offCredits = await credits();
        expect(offCredits.map((c) => c.song_id)).toEqual(expect.arrayContaining([songs.essentials.id, songs.uncleared.id]));
        expect(offCredits.map((c) => c.song_id)).not.toContain(songs.beginner.id);
        expect(offCredits.map((c) => c.song_id)).not.toContain(songs.library.id);

        m.env.PUBLIC_CATALOGUE = true;
        expect(await listed(stranger.token)).toEqual(ids("essentials", "beginner"));
        expect(await listed(owner.token)).toEqual(ids("essentials", "beginner", "upload", "archive"));
        expect(await listed(admin.token)).toEqual(ids("library", "essentials", "beginner", "uncleared", "upload", "archive"));
        expect((await api("GET", `/songs/${songs.uncleared.id}/file`, { token: stranger.token })).status).toBe(404);

        const onCredits = await credits();
        expect(onCredits.map((c) => c.song_id)).toContain(songs.essentials.id);
        expect(onCredits.map((c) => c.song_id)).not.toContain(songs.uncleared.id);
        const credit = onCredits.find((c) => c.song_id === songs.essentials.id)!;
        expect(credit).toMatchObject({ attribution: "Typeset by someone, CC BY-SA", licence: "cc-by-sa-2.5", licence_url: "https://creativecommons.org/licenses/by-sa/2.5/" });

        // The attribution CC BY-SA requires travels with the song.
        const listing = (await api("GET", "/songs", { token: stranger.token })).body.songs as { id: string; attribution: string | null }[];
        expect(listing.find((song) => song.id === songs.essentials.id)?.attribution).toBe("Typeset by someone, CC BY-SA");

        // Hidden library songs are indistinguishable from missing ones.
        for (const path of [`/songs/${songs.library.id}/file`, `/songs/${songs.library.id}/notation`]) {
          expect((await api("GET", path, { token: stranger.token })).status, path).toBe(404);
        }
        expect((await api("POST", `/songs/${songs.library.id}/attempts`, { token: stranger.token, body: attempt })).status).toBe(404);
        // Private songs stay private.
        expect((await api("GET", `/songs/${songs.archive.id}/notation`, { token: stranger.token })).status).toBe(404);
        expect((await api("GET", `/songs/${songs.upload.id}/file`, { token: stranger.token })).status).toBe(404);
        // Allowed ones still work.
        expect((await api("GET", `/songs/${songs.essentials.id}/file`, { token: stranger.token })).status).toBe(200);
        expect((await api("GET", `/songs/${songs.beginner.id}/file`, { token: stranger.token })).status).toBe(200);
        expect((await api("POST", `/songs/${songs.essentials.id}/attempts`, { token: stranger.token, body: attempt })).status).toBe(201);
        expect((await api("GET", `/songs/${songs.archive.id}/notation`, { token: owner.token })).status).toBe(200);
        expect((await api("GET", `/songs/${songs.library.id}/file`, { token: admin.token })).status).toBe(200);

        // The PianoCoRe archive is non-commercial: no search or import on a public catalogue, for anyone.
        expect((await api("GET", "/archive/search?q=bach", { token: stranger.token })).status).toBe(404);
        expect((await api("POST", "/archive/any-id/import", { token: admin.token })).status).toBe(404);
        expect((await api("GET", "/config")).body).toMatchObject({ publicCatalogue: true });

        // Today, the shelves and achievements read only from what exists, and still answer.
        for (const path of ["/users/me/today", "/songs/stars/me", "/users/me/progression", "/users/me/summary"]) {
          expect((await api("GET", path, { token: stranger.token })).status, path).toBe(200);
        }
      } finally {
        m.env.PUBLIC_CATALOGUE = false;
        const songIds = Object.values(songs).map((song) => song.id);
        await m.prisma.playAlongAttempt.deleteMany({ where: { song_id: { in: songIds } } });
        await m.prisma.song.deleteMany({ where: { id: { in: songIds } } });
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("account deletion", () => {
    /** A user with something in every per-user table, and a file in every data folder. */
    async function userWithEverything() {
      const user = await createUserWithPassword();
      const other = await createUser();
      // Exercise + quiz attempts, lesson progress, XP and practice days (via rewards).
      const exerciseId = exerciseIdsOf("lesson-01")[0]!;
      expect((await api("POST", `/exercises/${exerciseId}/attempts`, { token: user.token, body: { performedNotes: perfectRun(exerciseId) } })).status).toBe(201);
      const question = quizQuestions("lesson-01")[0] ?? m.content.lessons.flatMap((lesson) => lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions : [])))[0]!;
      expect((await api("POST", `/quiz-questions/${question.id}/answer`, { token: user.token, body: { selectedAnswer: 0 } })).status).toBe(200);
      // An upload (a real file through the real route) that another user has played too.
      const upload = await fetch(`${baseUrl}/songs/upload?title=Mine&artist=Me`, {
        method: "POST",
        headers: { authorization: `Bearer ${user.token}`, "content-type": "application/octet-stream" },
        body: new Uint8Array(midiBytes()),
      });
      expect(upload.status).toBe(201);
      const uploaded = (await upload.json()) as { id: string };
      const attempt = { score: 80, accuracy: 90, tempo_pct: 100, lookahead_s: 3, wait_mode: false };
      expect((await api("POST", `/songs/${uploaded.id}/attempts`, { token: user.token, body: attempt })).status).toBe(201);
      await m.prisma.playAlongAttempt.create({ data: { user_id: other.id, song_id: uploaded.id, ...attempt } });
      // An archive import: MIDI + MusicXML on disk.
      const archive = await m.prisma.song.create({
        data: { title: "Archive", artist: "x", genre: "classical", difficulty: 1, duration_sec: 4, note_count: 8, content_rights: "archive-import", file_path: "pending", uploader_id: user.id },
      });
      const archiveMidi = join(m.songs.MIDI_LIBRARY_DIR, `archive-${archive.id}.mid`);
      const archiveXml = join(m.songs.MIDI_LIBRARY_DIR, `archive-${archive.id}.mxl`);
      await writeFile(archiveMidi, midiBytes());
      await writeFile(archiveXml, "<score/>");
      await m.prisma.song.update({ where: { id: archive.id }, data: { file_path: archiveMidi, notation_path: archiveXml } });
      // Feedback with a screenshot, through the real routes.
      const feedback = await api("POST", "/feedback", { token: user.token, body: { type: "bug", message: "It broke", page_path: "/" } });
      expect(feedback.status).toBe(201);
      const shot = await fetch(`${baseUrl}/feedback/${feedback.body.id}/screenshot`, {
        method: "POST",
        headers: { authorization: `Bearer ${user.token}`, "content-type": "image/png" },
        body: new Uint8Array(PNG_BYTES),
      });
      expect(shot.status).toBe(201);
      // An uploaded instrument pack.
      const instrument = await m.prisma.instrument.create({
        data: { name: "Mine", description: "x", category: "piano", pack_path: "pending", content_rights: "user-upload", uploader_id: user.id },
      });
      const packDir = join(m.instruments.INSTRUMENT_LIBRARY_DIR, `upload-${instrument.id}`);
      await mkdir(packDir, { recursive: true });
      await writeFile(join(packDir, "layout.json"), "{}");
      await m.prisma.instrument.update({ where: { id: instrument.id }, data: { pack_path: packDir } });
      // The rest of the per-user tables.
      await m.prisma.userAchievement.upsert({
        where: { user_id_achievement_key: { user_id: user.id, achievement_key: "test-achievement" } },
        create: { user_id: user.id, achievement_key: "test-achievement" },
        update: {},
      });
      await m.prisma.ttsUserUsage.create({ data: { user_id: user.id, day: "2026-10-23", charactersUsed: 5 } });
      await m.prisma.authToken.create({ data: { user_id: user.id, purpose: "password_reset", token_hash: `hash-${user.id}`, expires_at: new Date(Date.now() + 60_000) } });

      const files = [
        (await m.prisma.song.findUniqueOrThrow({ where: { id: uploaded.id } })).file_path,
        archiveMidi,
        archiveXml,
        join(m.feedback.FEEDBACK_SCREENSHOT_DIR, `feedback-${feedback.body.id}.png`),
        packDir,
      ];
      for (const file of files) expect(existsSync(file), file).toBe(true);
      const before = await rowsReferencing(user.id);
      // Every table that can hold this user's data has some, so "zero after" proves something.
      for (const table of ["ExerciseAttempt", "QuizAttempt", "UserProgress", "XpEvent", "PracticeDay", "UserAchievement", "Song", "Instrument", "PlayAlongAttempt", "Feedback", "TtsUserUsage", "AuthToken"]) {
        expect(Object.entries(before).some(([key, n]) => key.startsWith(`${table}.`) && n > 0), table).toBe(true);
      }
      return { user, other, files, uploadedId: uploaded.id };
    }

    async function expectGone(subject: Awaited<ReturnType<typeof userWithEverything>>) {
      expect(await m.prisma.user.findUnique({ where: { id: subject.user.id } })).toBeNull();
      const after = await rowsReferencing(subject.user.id);
      expect(Object.values(after).reduce((sum, n) => sum + n, 0), JSON.stringify(after)).toBe(0);
      // Other users' runs on the deleted upload go with it; the other user is untouched.
      expect(await m.prisma.playAlongAttempt.count({ where: { song_id: subject.uploadedId } })).toBe(0);
      expect(await m.prisma.user.findUnique({ where: { id: subject.other.id } })).not.toBeNull();
      for (const file of subject.files) expect(existsSync(file), file).toBe(false);
    }

    it("in-app: requires the password, then removes every row and file", async () => {
      const subject = await userWithEverything();
      const wrong = await api("DELETE", "/users/me", { token: subject.user.token, body: { password: "not-the-password" } });
      expect(wrong.status).toBe(401);
      expect(await m.prisma.user.findUnique({ where: { id: subject.user.id } })).not.toBeNull();

      const res = await api("DELETE", "/users/me", { token: subject.user.token, body: { password: PASSWORD } });
      expect(res.status).toBe(200);
      await expectGone(subject);
    });

    it("signed out (the public page): email + password", async () => {
      const subject = await userWithEverything();
      expect((await api("POST", "/auth/delete-account", { body: { email: subject.user.email, password: "wrong-password" } })).status).toBe(401);
      expect((await api("POST", "/auth/delete-account", { body: { email: "nobody@test.local", password: PASSWORD } })).status).toBe(401);
      const res = await api("POST", "/auth/delete-account", { body: { email: subject.user.email.toUpperCase(), password: PASSWORD } });
      expect(res.status).toBe(200);
      await expectGone(subject);
    });

    it("refuses to delete the shared demo account", async () => {
      await m.prisma.user.create({ data: { email: "demo@keyboardsensei.local", display_name: "Demo", password_hash: await bcrypt.hash("demo-password", 4) } });
      const res = await api("POST", "/auth/delete-account", { body: { email: "demo@keyboardsensei.local", password: "demo-password" } });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("demo_account");
      expect(await m.prisma.user.count({ where: { email: "demo@keyboardsensei.local" } })).toBe(1);
      await m.prisma.user.delete({ where: { email: "demo@keyboardsensei.local" } });
    });
  });

  describe("password reset and email verification", () => {
    beforeAll(() => {
      m.mailer.setMailTransport(captureTransport);
    });

    it("answers identically for known and unknown addresses, stores only a hash, and the token works once", async () => {
      const user = await createUserWithPassword();
      const known = await api("POST", "/auth/forgot-password", { body: { email: user.email } });
      const unknown = await api("POST", "/auth/forgot-password", { body: { email: "nobody-here@test.local" } });
      expect(known).toEqual(unknown);
      expect(known.status).toBe(202);

      const mail = await waitForMail(user.email, /reset/i);
      expect(outbox.some((item) => item.to === "nobody-here@test.local")).toBe(false);
      const token = tokenFrom(mail.text);
      const [row] = await m.prisma.authToken.findMany({ where: { user_id: user.id, purpose: "password_reset" } });
      expect(row!.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(await m.prisma.authToken.count({ where: { token_hash: token } })).toBe(0);
      const ttl = row!.expires_at.getTime() - row!.created_at.getTime();
      expect(ttl).toBeGreaterThan(29 * 60_000);
      expect(ttl).toBeLessThanOrEqual(30 * 60_000 + 1_000);

      expect((await api("POST", "/auth/reset-password", { body: { token, password: "short" } })).status).toBe(400);
      expect((await api("POST", "/auth/reset-password", { body: { token, password: "a-brand-new-password" } })).status).toBe(200);
      expect((await api("POST", "/auth/reset-password", { body: { token, password: "another-new-password" } })).status).toBe(400);
      expect((await api("POST", "/auth/login", { body: { email: user.email, password: "a-brand-new-password" } })).status).toBe(200);
      // Receiving the email proved the address.
      expect((await m.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email_verified_at).not.toBeNull();
    });

    it("rejects an expired token, and a newer request voids the older link", async () => {
      const user = await createUserWithPassword();
      await api("POST", "/auth/forgot-password", { body: { email: user.email } });
      const first = tokenFrom((await waitForMail(user.email, /reset/i)).text);
      outbox.length = 0;
      await api("POST", "/auth/forgot-password", { body: { email: user.email } });
      const second = tokenFrom((await waitForMail(user.email, /reset/i)).text);
      expect(second).not.toBe(first);
      expect((await api("POST", "/auth/reset-password", { body: { token: first, password: "a-brand-new-password" } })).status).toBe(400);
      await m.prisma.authToken.updateMany({ where: { user_id: user.id }, data: { expires_at: new Date(Date.now() - 1_000) } });
      expect((await api("POST", "/auth/reset-password", { body: { token: second, password: "a-brand-new-password" } })).status).toBe(400);
    });

    it("with REQUIRE_EMAIL_VERIFICATION, sign-up waits for the emailed link", async () => {
      m.env.REQUIRE_EMAIL_VERIFICATION = true;
      try {
        const email = nextEmail();
        const reg = await api("POST", "/auth/register", { body: { email, password: PASSWORD, display_name: "Verifier" } });
        expect(reg.status).toBe(201);
        expect(reg.body).toEqual({ verificationRequired: true, email });
        const blocked = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
        expect(blocked.status).toBe(403);
        expect(blocked.body.error.code).toBe("email_not_verified");

        const token = tokenFrom((await waitForMail(email, /confirm/i)).text);
        const verified = await api("POST", "/auth/verify-email", { body: { token } });
        expect(verified.status).toBe(200);
        expect(verified.body.accessToken).toEqual(expect.any(String));
        expect((await api("POST", "/auth/verify-email", { body: { token } })).status).toBe(400);
        expect((await api("POST", "/auth/login", { body: { email, password: PASSWORD } })).status).toBe(200);
      } finally {
        m.env.REQUIRE_EMAIL_VERIFICATION = false;
      }
    });
  });

  describe("Google sign-in (mocked verifier)", () => {
    type Identity = { sub: string; email: string | null; emailVerified: boolean; name: string | null };
    const identities: Record<string, Identity> = {};
    let restore: ReturnType<Modules["google"]["setGoogleVerifier"]>;
    beforeAll(() => {
      restore = m.google.setGoogleVerifier(async (token) => {
        const identity = identities[token];
        if (!identity) throw new m.google.GoogleTokenError("bad token");
        return identity;
      });
    });
    afterAll(() => {
      m.google.setGoogleVerifier(restore);
      m.env.GOOGLE_CLIENT_IDS = [];
    });

    it("is off until GOOGLE_CLIENT_IDS is set", async () => {
      m.env.GOOGLE_CLIENT_IDS = [];
      expect((await api("POST", "/auth/google", { body: { credential: "anything" } })).status).toBe(503);
    });

    it("creates, then signs in by google_sub; links a verified matching email; refuses unverified and mismatched", async () => {
      m.env.GOOGLE_CLIENT_IDS = ["web-client.apps.googleusercontent.com", "android-client.apps.googleusercontent.com"];
      expect((await api("POST", "/auth/google", { body: { credential: "forged" } })).status).toBe(401);

      const newEmail = nextEmail();
      identities["new"] = { sub: "sub-new", email: newEmail, emailVerified: true, name: "New Pianist" };
      const created = await api("POST", "/auth/google", { body: { credential: "new" } });
      expect(created.status).toBe(201);
      expect(created.body.created).toBe(true);
      const createdRow = await m.prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
      expect(createdRow).toMatchObject({ google_sub: "sub-new", display_name: "New Pianist" });
      expect(createdRow.email_verified_at).not.toBeNull();
      const me = await api("GET", "/users/me", { token: created.body.accessToken });
      expect(me.body).toMatchObject({ email: newEmail, google_linked: true });
      expect(me.body.google_sub).toBeUndefined();

      // Same Google account again (even if its email changed): same user.
      identities["again"] = { sub: "sub-new", email: "changed@test.local", emailVerified: true, name: null };
      const again = await api("POST", "/auth/google", { body: { credential: "again" } });
      expect(again.status).toBe(200);
      expect(again.body.user.id).toBe(createdRow.id);

      // An existing password account with the same verified email is linked, not duplicated.
      const existing = await createUserWithPassword();
      identities["link"] = { sub: "sub-link", email: existing.email, emailVerified: true, name: "Whoever" };
      const linked = await api("POST", "/auth/google", { body: { credential: "link" } });
      expect(linked.status).toBe(200);
      expect(linked.body.user.id).toBe(existing.id);
      expect((await m.prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).google_sub).toBe("sub-link");
      expect(await m.prisma.user.count({ where: { email: existing.email } })).toBe(1);
      // The password still works too.
      expect((await api("POST", "/auth/login", { body: { email: existing.email, password: PASSWORD } })).status).toBe(200);

      // Unverified Google email: no linking, no account.
      const victim = await createUserWithPassword();
      identities["unverified"] = { sub: "sub-unverified", email: victim.email, emailVerified: false, name: null };
      expect((await api("POST", "/auth/google", { body: { credential: "unverified" } })).status).toBe(403);
      expect((await m.prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).google_sub).toBeNull();

      // The address is already linked to a different Google account.
      identities["other"] = { sub: "sub-other", email: existing.email, emailVerified: true, name: null };
      expect((await api("POST", "/auth/google", { body: { credential: "other" } })).status).toBe(409);

      // A Google-only account can delete itself by confirming with Google (its own account only).
      expect((await api("DELETE", "/users/me", { token: created.body.accessToken, body: { google_credential: "link" } })).status).toBe(401);
      expect((await api("DELETE", "/users/me", { token: created.body.accessToken, body: { google_credential: "new" } })).status).toBe(200);
      expect(await m.prisma.user.findUnique({ where: { id: createdRow.id } })).toBeNull();
    });
  });

  describe("session revocation (token_version)", () => {
    const probe = (token: string) => api("GET", "/lessons", { token });

    it("sign out everywhere voids old tokens and returns a working fresh one", async () => {
      const user = await createUserWithPassword();
      expect((await probe(user.token)).status).toBe(200);
      const res = await api("POST", "/auth/sign-out-all", { token: user.token });
      expect(res.status).toBe(200);
      expect((await probe(user.token)).status).toBe(401);
      expect((await probe(res.body.accessToken)).status).toBe(200);
      expect((await api("POST", "/auth/sign-out-all", { token: user.token })).status).toBe(401);
    });

    it("a password change voids old tokens and returns a fresh one", async () => {
      const user = await createUserWithPassword();
      const res = await api("POST", "/users/me/password", {
        token: user.token,
        body: { currentPassword: PASSWORD, newPassword: "a-brand-new-password" },
      });
      expect(res.status).toBe(200);
      expect((await probe(user.token)).status).toBe(401);
      expect((await probe(res.body.accessToken)).status).toBe(200);
      const login = await api("POST", "/auth/login", { body: { email: user.email, password: "a-brand-new-password" } });
      expect((await probe(login.body.accessToken)).status).toBe(200);
    });

    it("a password reset voids old tokens", async () => {
      m.mailer.setMailTransport(captureTransport);
      const user = await createUserWithPassword();
      await api("POST", "/auth/forgot-password", { body: { email: user.email } });
      const token = tokenFrom((await waitForMail(user.email, /reset/i)).text);
      expect((await api("POST", "/auth/reset-password", { body: { token, password: "a-brand-new-password" } })).status).toBe(200);
      expect((await probe(user.token)).status).toBe(401);
      const login = await api("POST", "/auth/login", { body: { email: user.email, password: "a-brand-new-password" } });
      expect((await probe(login.body.accessToken)).status).toBe(200);
    });

    it("account deletion voids the token", async () => {
      const user = await createUserWithPassword();
      expect((await probe(user.token)).status).toBe(200);
      expect((await api("DELETE", "/users/me", { token: user.token, body: { password: PASSWORD } })).status).toBe(200);
      expect((await probe(user.token)).status).toBe(401);
    });

    it("tokens from before the claim existed still work until the version is bumped", async () => {
      const user = await createUserWithPassword();
      const jwt = (await import("jsonwebtoken")).default;
      const legacy = jwt.sign({ sub: user.id, email: user.email }, m.env.JWT_SECRET, { expiresIn: "1h" });
      expect((await probe(legacy)).status).toBe(200);
      await api("POST", "/auth/sign-out-all", { token: user.token });
      expect((await probe(legacy)).status).toBe(401);
    });
  });

  describe("auth", () => {
    it("registers, logs in, and rejects a wrong password", async () => {
      const user = await registerUser();
      const login = await api("POST", "/auth/login", { body: { email: user.email, password: "correct-horse-battery" } });
      expect(login.status).toBe(200);
      expect(login.body.user.id).toBe(user.id);
      const me = await api("GET", "/users/me", { token: login.body.accessToken });
      expect(me.body.email).toBe(user.email);
      const wrong = await api("POST", "/auth/login", { body: { email: user.email, password: "not-the-password" } });
      expect(wrong.status).toBe(401);
    });

    it("rate-limits repeated failed logins from one client", async () => {
      const user = await registerUser();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        statuses.push((await api("POST", "/auth/login", { body: { email: user.email, password: "wrong-password" } })).status);
      }
      // 10 failures allowed per window (one was spent by the previous test).
      expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(10);
      expect(statuses.at(-1)).toBe(429);
    });
  });

  describe("quiz answers", () => {
    it("a wrong answer reveals nothing about the correct one", async () => {
      const user = await createUser();
      const [question] = quizQuestions("lesson-02");
      const wrongIndex = (question!.correctIndex! + 1) % question!.options.length;
      const res = await api("POST", `/quiz-questions/${question!.id}/answer`, {
        token: user.token,
        body: { selectedAnswer: wrongIndex },
      });
      expect(res.status).toBe(200);
      expect(res.body.correct).toBe(false);
      // The progress rewards ride along, but nothing about the answer does.
      expect(Object.keys(res.body).sort()).toEqual(["correct", "rewards"]);
    });

    it("an out-of-range answer index is a 400, not a 500", async () => {
      const user = await createUser();
      const [question] = quizQuestions("lesson-02");
      const res = await api("POST", `/quiz-questions/${question!.id}/answer`, {
        token: user.token,
        body: { selectedAnswer: question!.options.length },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_answer");
    });
  });

  describe("unlock chain", () => {
    it("a lesson completes only when every exercise is passed, and nothing is ever downgraded", async () => {
      const user = await createUser();
      expect(await statusOf(user.token, "lesson-01")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-02")).toBe("locked");

      // The original exercise alone no longer passes the lesson.
      const pass = await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([48, 60, 72]) },
      });
      expect(pass.status).toBe(201);
      expect(pass.body.score).toBeGreaterThanOrEqual(70);
      expect(await statusOf(user.token, "lesson-01")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-02")).toBe("locked");

      const detail = await api("GET", "/lessons/lesson-01", { token: user.token });
      expect(detail.body.exerciseBests).toEqual({ "exercise-01": pass.body.score });

      await passEveryExercise(user.token, "lesson-01");
      expect(await statusOf(user.token, "lesson-01")).toBe("completed");
      expect(await statusOf(user.token, "lesson-02")).toBe("unlocked");
      const afterAll = await api("GET", "/lessons/lesson-01", { token: user.token });
      expect(Object.keys(afterAll.body.exerciseBests).sort()).toEqual(exerciseIdsOf("lesson-01").sort());

      // Lesson 2 now has exercises, so answering its quiz no longer completes it.
      for (const question of quizQuestions("lesson-02")) {
        const res = await api("POST", `/quiz-questions/${question.id}/answer`, {
          token: user.token,
          body: { selectedAnswer: question.correctIndex },
        });
        expect(res.body.correct).toBe(true);
      }
      expect(await statusOf(user.token, "lesson-02")).toBe("unlocked");
      await passEveryExercise(user.token, "lesson-02");
      expect(await statusOf(user.token, "lesson-02")).toBe("completed");
      expect(await statusOf(user.token, "lesson-03")).toBe("unlocked");

      // A later failing attempt must not demote anything.
      const fail = await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([49, 61, 73]) },
      });
      expect(fail.body.score).toBeLessThan(70);
      expect(await statusOf(user.token, "lesson-01")).toBe("completed");
      expect(await statusOf(user.token, "lesson-02")).toBe("completed");
      expect(await statusOf(user.token, "lesson-03")).toBe("unlocked");
      const progress = await m.prisma.userProgress.findUniqueOrThrow({
        where: { user_id_lesson_id: { user_id: user.id, lesson_id: "lesson-01" } },
      });
      expect(progress.best_score).toBeGreaterThanOrEqual(70);
    });

    it("finishing a lesson opens the next lesson AND any path that branches from it", async () => {
      const user = await createUser();
      const course = m.content.lessons.map((lesson) => lesson.id);
      // Lessons 1–10 already done (written directly; their unlock writes are not under test here).
      await m.prisma.userProgress.createMany({
        data: course.slice(0, 10).map((lessonId) => ({ user_id: user.id, lesson_id: lessonId, status: "completed" as const, best_score: 90 })),
      });
      expect(await statusOf(user.token, "lesson-11")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-reading-c-position")).toBe("locked");

      await passEveryExercise(user.token, "lesson-11");
      expect(await statusOf(user.token, "lesson-11")).toBe("completed");
      expect(await statusOf(user.token, "lesson-12")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-reading-c-position")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-chords-major-symbols")).toBe("locked");
      // The branch's unlock was written, not just inferred.
      const written = await m.prisma.userProgress.findUnique({
        where: { user_id_lesson_id: { user_id: user.id, lesson_id: "lesson-reading-c-position" } },
      });
      expect(written?.status).toBe("unlocked");

      // Completing lesson 12 behind the API's back (as if the Modern Chords path had been
      // added after the learner finished it) writes no unlock row, yet its first lesson
      // opens at read time.
      await m.prisma.userProgress.update({
        where: { user_id_lesson_id: { user_id: user.id, lesson_id: "lesson-12" } },
        data: { status: "completed", best_score: 90 },
      });
      expect(await statusOf(user.token, "lesson-chords-major-symbols")).toBe("unlocked");
      const detail = await api("GET", "/lessons/lesson-chords-major-symbols", { token: user.token });
      expect(detail.body.progress.status).toBe("unlocked");
      // A reading lesson with an extra classical prerequisite stays locked until both are met.
      expect(await statusOf(user.token, "lesson-reading-sharp-keys")).toBe("locked");
    });
  });

  describe("song attempts", () => {
    it("a user cannot log attempts on another user's private song", async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const privateSong = await m.prisma.song.create({
        data: {
          title: "Private upload",
          artist: "Owner",
          genre: "other",
          difficulty: 1,
          duration_sec: 10,
          note_count: 10,
          content_rights: "user-upload",
          file_path: "/nonexistent/private.mid",
          uploader_id: owner.id,
        },
      });
      const publicSong = await m.prisma.song.create({
        data: {
          title: "Library song",
          artist: "Public",
          genre: "classical",
          difficulty: 1,
          duration_sec: 10,
          note_count: 10,
          content_rights: "public-domain",
          file_path: "/nonexistent/public.mid",
        },
      });
      const attempt = { score: 80, accuracy: 90, tempo_pct: 100, lookahead_s: 3, wait_mode: false };

      const strangerRes = await api("POST", `/songs/${privateSong.id}/attempts`, { token: stranger.token, body: attempt });
      expect(strangerRes.status).toBe(404);
      expect(await m.prisma.playAlongAttempt.count({ where: { song_id: privateSong.id } })).toBe(0);

      const ownerRes = await api("POST", `/songs/${privateSong.id}/attempts`, { token: owner.token, body: attempt });
      expect(ownerRes.status).toBe(201);
      const publicRes = await api("POST", `/songs/${publicSong.id}/attempts`, { token: stranger.token, body: attempt });
      expect(publicRes.status).toBe(201);
    });
  });

  describe("narration", () => {
    it("rejects a voice id outside the allow-list before any synthesis", async () => {
      const user = await createUser();
      const res = await api("POST", "/lessons/lesson-01/sections/0/narrate", {
        token: user.token,
        body: { voiceId: "21m00Tcm4TlvDq8ikWAM" },
      });
      expect(res.status).toBe(400);
      expect(await m.prisma.ttsUsage.count()).toBe(0);
    });

    it("reserves quota atomically: concurrent requests never overshoot the monthly pool", async () => {
      const user = await createUser();
      const cacheDir = await mkdtemp(join(tmpdir(), "ks-tts-"));
      try {
        const now = new Date("2031-05-10T12:00:00Z");
        // Pool has room for exactly 3 of the 10 concurrent 1,000-char requests.
        await m.prisma.ttsUsage.create({ data: { period: "2031-05", charactersUsed: m.tts.TTS_LIMIT - 3_000 } });
        const synthesize = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Uint8Array([1, 2, 3]);
        });
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_, sectionIndex) =>
            m.tts.getOrCreateNarration(m.prisma, {
              userId: user.id,
              lessonId: "lesson-atomic",
              sectionIndex,
              voiceId: "Xb7hH8MSUJpSbSDYk0k2",
              text: "x".repeat(1_000),
              userDailyLimit: 1_000_000,
              now,
              cacheDir,
              synthesize,
            }),
          ),
        );
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(3);
        expect(synthesize).toHaveBeenCalledTimes(3);
        for (const result of rejected) {
          expect((result as PromiseRejectedResult).reason).toBeInstanceOf(m.tts.TtsLimitError);
        }
        const usage = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2031-05" } });
        expect(usage.charactersUsed).toBe(m.tts.TTS_LIMIT);
      } finally {
        await rm(cacheDir, { recursive: true, force: true });
      }
    });

    it("enforces the per-user daily cap without consuming the shared pool, and cache hits are free", async () => {
      const user = await createUser();
      const cacheDir = await mkdtemp(join(tmpdir(), "ks-tts-"));
      try {
        const now = new Date("2032-01-15T08:00:00Z");
        const synthesize = vi.fn(async () => new Uint8Array([1]));
        const narrate = (sectionIndex: number) =>
          m.tts.getOrCreateNarration(m.prisma, {
            userId: user.id,
            lessonId: "lesson-daily",
            sectionIndex,
            voiceId: "Xb7hH8MSUJpSbSDYk0k2",
            text: "y".repeat(600),
            userDailyLimit: 1_000,
            now,
            cacheDir,
            synthesize,
          });

        expect((await narrate(0)).cached).toBe(false);
        expect((await narrate(0)).cached).toBe(true); // cache hit: no synthesis, no charge
        await expect(narrate(1)).rejects.toMatchObject({ scope: "user-daily" });
        expect(synthesize).toHaveBeenCalledTimes(1);

        const pool = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2032-01" } });
        expect(pool.charactersUsed).toBe(600); // the refused request's monthly bump rolled back
        const daily = await m.prisma.ttsUserUsage.findUniqueOrThrow({
          where: { user_id_day: { user_id: user.id, day: "2032-01-15" } },
        });
        expect(daily.charactersUsed).toBe(600);
      } finally {
        await rm(cacheDir, { recursive: true, force: true });
      }
    });

    it("refunds the reservation when synthesis fails", async () => {
      const user = await createUser();
      const now = new Date("2033-03-03T00:00:00Z");
      await expect(
        m.tts.getOrCreateNarration(m.prisma, {
          userId: user.id,
          lessonId: "lesson-refund",
          sectionIndex: 0,
          voiceId: "Xb7hH8MSUJpSbSDYk0k2",
          text: "z".repeat(500),
          userDailyLimit: 1_000,
          now,
          synthesize: async () => {
            throw new Error("ElevenLabs is down");
          },
        }),
      ).rejects.toThrow("ElevenLabs is down");
      const pool = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2033-03" } });
      expect(pool.charactersUsed).toBe(0);
    });
  });

  describe("content seeding", () => {
    const dummyLesson = (id: string): Lesson => ({
      ...m.content.lessons[0]!,
      id,
      title: `Dummy ${id}`,
      sections: [{ type: "markdown", title: "Dummy", body: "Temporary lesson for the seeding test." }],
    });
    const insertAt = (lessons: Lesson[], index: number, lesson: Lesson) => [
      ...lessons.slice(0, index),
      lesson,
      ...lessons.slice(index),
    ];
    const orders = async () =>
      Object.fromEntries(
        (await m.prisma.lesson.findMany({ select: { id: true, order: true } })).map((row) => [row.id, row.order]),
      );

    it("inserting a lesson mid-sequence reseeds cleanly and existing progress still points at the right lessons", async () => {
      const user = await createUser();
      await passEveryExercise(user.token, "lesson-01");
      const before = await m.prisma.userProgress.findMany({ where: { user_id: user.id }, orderBy: { lesson_id: "asc" } });
      expect(before.map((row) => [row.lesson_id, row.status])).toEqual([
        ["lesson-01", "completed"],
        ["lesson-02", "unlocked"],
      ]);

      const withDummy = insertAt(m.content.lessons, 1, dummyLesson("lesson-dummy-insert"));
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });

      const after = await orders();
      expect(after["lesson-01"]).toBe(1);
      expect(after["lesson-dummy-insert"]).toBe(2);
      expect(after["lesson-02"]).toBe(3);
      expect(after["lesson-34"]).toBe(35);
      // Progress rows are keyed by id, so they still describe the same lessons.
      const progressAfter = await m.prisma.userProgress.findMany({
        where: { user_id: user.id },
        include: { lesson: { select: { lesson_json: true } } },
        orderBy: { lesson_id: "asc" },
      });
      expect(progressAfter.map((row) => [row.lesson_id, row.status])).toEqual([
        ["lesson-01", "completed"],
        ["lesson-02", "unlocked"],
      ]);
      expect((progressAfter[1]!.lesson.lesson_json as { title: string }).title).toBe("Finger numbers and hand position");

      // A locked, unscored placeholder row (what the seed creates for the demo user) is
      // not user data and must not keep a removed lesson alive.
      await m.prisma.userProgress.create({
        data: { user_id: user.id, lesson_id: "lesson-dummy-insert", status: "locked" },
      });

      // Revert: the dummy has no user data, so it is deleted, and orders return to 1..34.
      const report = await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      expect(report.deletedLessonIds).toEqual(["lesson-dummy-insert"]);
      const reverted = await orders();
      expect(reverted["lesson-02"]).toBe(2);
      expect(Object.keys(reverted)).toHaveLength(m.content.lessons.length);
    });

    it("a removed lesson that users have touched is retired (kept, hidden, outside the chain), not deleted", async () => {
      const user = await createUser();
      const withDummy = insertAt(m.content.lessons, 2, dummyLesson("lesson-dummy-retire"));
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });
      await m.prisma.userProgress.create({
        data: { user_id: user.id, lesson_id: "lesson-dummy-retire", status: "completed", best_score: 90 },
      });

      const warn = vi.fn();
      const report = await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn });
      expect(report.retiredLessonIds).toEqual(["lesson-dummy-retire"]);
      expect(warn).toHaveBeenCalledOnce();

      const row = await m.prisma.lesson.findUniqueOrThrow({ where: { id: "lesson-dummy-retire" } });
      expect(row.retired_at).not.toBeNull();
      expect(row.order).toBeLessThan(0);
      expect(await m.prisma.userProgress.count({ where: { lesson_id: "lesson-dummy-retire" } })).toBe(1);

      const list = await api("GET", "/lessons", { token: user.token });
      expect(list.body.map((item: { id: string }) => item.id)).not.toContain("lesson-dummy-retire");
      expect(list.body).toHaveLength(m.content.lessons.length);
      expect((await api("GET", "/lessons/lesson-dummy-retire", { token: user.token })).status).toBe(404);

      // Bringing it back into content revives it with a normal order.
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });
      const revived = await m.prisma.lesson.findUniqueOrThrow({ where: { id: "lesson-dummy-retire" } });
      expect(revived.retired_at).toBeNull();
      expect(revived.order).toBe(3);

      // Leave the database as the shipped content again (the row stays retired: it has data).
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      await m.prisma.userProgress.deleteMany({ where: { lesson_id: "lesson-dummy-retire" } });
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      expect(await m.prisma.lesson.count({ where: { id: "lesson-dummy-retire" } })).toBe(0);
    });

    it("stores tier and skills on the lesson row and returns them from GET /lessons", async () => {
      const user = await createUser();
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      const res = await api("GET", "/lessons", { token: user.token });
      expect(res.status).toBe(200);
      const perTier = new Map<number, number>();
      for (const item of res.body as Array<{ id: string; tier: number; skills: string[] }>) {
        const expected = m.content.lessons.find((lesson) => lesson.id === item.id)!;
        expect(item.tier, item.id).toBe(expected.tier);
        expect(item.skills, item.id).toEqual(expected.skills);
        perTier.set(item.tier, (perTier.get(item.tier) ?? 0) + 1);
      }
      expect([...perTier.entries()].sort()).toEqual([[0, 6], [1, 6], [2, 9], [3, 10], [4, 15], [5, 13]]);
      const detail = await api("GET", "/lessons/lesson-25", { token: user.token });
      expect(detail.body.lesson).toMatchObject({ tier: 3, skills: ["repertoire"] });
    });

    it("keeps every lesson a learner earned under the old chain and stores newly earned ones", async () => {
      const { backfillUnlocks } = await import("./progress.js");
      const { LEGACY_PREREQUISITES } = await import("./content/legacy-prerequisites.js");
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      const statuses = async (token: string) => {
        const res = await api("GET", "/lessons", { token });
        const items = res.body as Array<{ id: string; progress: { status: string } }>;
        return new Map(items.map((item) => [item.id, item.progress.status]));
      };
      const complete = (userId: string, ids: string[]) =>
        m.prisma.userProgress.createMany({
          data: ids.map((lesson_id) => ({ user_id: userId, lesson_id, status: "completed" as const, best_score: 90, completed_at: new Date() })),
        });

      // Finished lessons 01-16 under the old order, with no stored row for lesson-17 (its
      // old prerequisite was lesson-16; now it waits for lesson-32).
      const veteran = await createUser();
      const oldChain = Array.from({ length: 16 }, (_, index) => `lesson-${String(index + 1).padStart(2, "0")}`);
      await complete(veteran.id, oldChain);
      // Finished lessons 01-06 only: lesson-08 now follows lesson-06 directly.
      const beginner = await createUser();
      await complete(beginner.id, oldChain.slice(0, 6));

      const before = await statuses(veteran.token);
      expect(before.get("lesson-17")).toBe("locked");
      expect((await statuses(beginner.token)).get("lesson-08")).toBe("unlocked"); // read time

      const report = await backfillUnlocks(m.prisma, m.content.lessons, LEGACY_PREREQUISITES);
      expect(report.unlocked).toBeGreaterThan(0);

      const after = await statuses(veteran.token);
      expect(after.get("lesson-17")).toBe("unlocked");
      for (const id of oldChain) expect(after.get(id), id).toBe("completed");
      // Nothing that was open before the backfill is closed after it.
      for (const [id, status] of before) if (status !== "locked") expect(after.get(id), id).not.toBe("locked");
      const stored = await m.prisma.userProgress.findUnique({
        where: { user_id_lesson_id: { user_id: beginner.id, lesson_id: "lesson-08" } },
      });
      expect(stored?.status).toBe("unlocked");
      // lesson-07 was open under the old chain (after lesson-06), so it stays open; a lesson
      // the beginner has not earned under either chain stays locked.
      const beginnerAfter = await statuses(beginner.token);
      expect(beginnerAfter.get("lesson-07")).toBe("unlocked");
      expect(beginnerAfter.get("lesson-11")).toBe("locked");

      // Idempotent: a second run changes nothing.
      expect(await backfillUnlocks(m.prisma, m.content.lessons, LEGACY_PREREQUISITES)).toEqual({ users: 0, unlocked: 0 });
    });
  });

  describe("Essentials replacements", () => {
    const song = (id: string, file_path: string, uploader_id: string | null = null) =>
      m.prisma.song.create({
        data: { id, title: id, artist: "x", genre: "classical", difficulty: 1, duration_sec: 30, note_count: 30, content_rights: "public-domain", file_path, uploader_id },
      });

    it("deletes unplayed superseded songs, retires played ones, never touches uploads, and is idempotent", async () => {
      const { applyEssentialsReplacements } = await import("./essentials/replacements.js");
      const user = await createUser();
      await song("seed-ludwig-van-beethoven-fur-elise", "/lib/fur.mid"); // played → retired
      await song("seed-frederic-chopin-minute-waltz", "/lib/minute.mid"); // unplayed → deleted
      await song("seed-scott-joplin-entertainer", "/lib/ent.mid"); // its Full version is missing → untouched
      const beginner = await song("beginner-silent-night-row", "/lib/beginner-silent-night.mid"); // beginner pack → retired
      const upload = await song("upload-elise", "/lib/beginner-amazing-grace.mid", user.id); // an upload → untouched
      await m.prisma.playAlongAttempt.create({
        data: { user_id: user.id, song_id: "seed-ludwig-van-beethoven-fur-elise", score: 80, accuracy: 0.8, tempo_pct: 100, lookahead_s: 4, wait_mode: false },
      });

      const index = [
        { slug: "fur-elise", level: "full" as const, file: "fur-elise-full.mid", noteCount: 1, durationSec: 30, transpose: 0, shiftSec: 0, timeScale: 1 as const },
        { slug: "minute-waltz", level: "full" as const, file: "minute-waltz-full.mid", noteCount: 1, durationSec: 30, transpose: 0, shiftSec: 0, timeScale: 1 as const },
        { slug: "silent-night", level: "beginner" as const, file: "silent-night-beginner.mid", noteCount: 1, durationSec: 30, transpose: 0, shiftSec: 0, timeScale: 1 as const },
        { slug: "amazing-grace", level: "beginner" as const, file: "amazing-grace-beginner.mid", noteCount: 1, durationSec: 30, transpose: 0, shiftSec: 0, timeScale: 1 as const },
      ];
      const report = await applyEssentialsReplacements(m.prisma, index);
      expect(report.deleted).toEqual(["seed-frederic-chopin-minute-waltz (seed-frederic-chopin-minute-waltz)"]);
      expect(report.retired).toHaveLength(2);

      const rows = await m.prisma.song.findMany({ select: { id: true, retired_at: true } });
      const state = Object.fromEntries(rows.map((row) => [row.id, row.retired_at ? "retired" : "live"]));
      expect(state).toMatchObject({
        "seed-ludwig-van-beethoven-fur-elise": "retired",
        "seed-scott-joplin-entertainer": "live",
        [beginner.id]: "retired",
        [upload.id]: "live",
      });
      expect(state["seed-frederic-chopin-minute-waltz"]).toBeUndefined();
      expect(await m.prisma.playAlongAttempt.count({ where: { song_id: "seed-ludwig-van-beethoven-fur-elise" } })).toBe(1);

      // The song list hides retired rows; the history still has the attempt.
      const list = await api("GET", "/songs", { token: user.token });
      const ids = list.body.songs.map((s: { id: string }) => s.id);
      expect(ids).not.toContain("seed-ludwig-van-beethoven-fur-elise");
      expect(ids).toContain("seed-scott-joplin-entertainer");
      const history = await api("GET", "/songs/attempts/me", { token: user.token });
      expect(history.status).toBe(200);

      // Idempotent: a second run changes nothing.
      const again = await applyEssentialsReplacements(m.prisma, index);
      expect(again).toEqual({ deleted: [], retired: [], restored: [] });

      // If the Essentials version goes away, the retired song comes back.
      const restored = await applyEssentialsReplacements(m.prisma, []);
      expect(restored.restored).toHaveLength(2);
      expect((await m.prisma.song.findUniqueOrThrow({ where: { id: "seed-ludwig-van-beethoven-fur-elise" } })).retired_at).toBeNull();

      await m.prisma.playAlongAttempt.deleteMany({ where: { user_id: user.id } });
      await m.prisma.song.deleteMany({ where: { id: { in: ["seed-ludwig-van-beethoven-fur-elise", "seed-scott-joplin-entertainer", beginner.id, upload.id] } } });
    });
  });

  describe("progression", () => {
    const ledgerTotal = async (userId: string) =>
      (await m.prisma.xpEvent.aggregate({ where: { user_id: userId }, _sum: { amount: true } }))._sum.amount ?? 0;

    const makeSong = (id: string, overrides: Record<string, unknown> = {}) =>
      m.prisma.song.upsert({
        where: { id },
        update: {},
        create: {
          id,
          title: `Song ${id}`,
          artist: "Composer",
          genre: "classical",
          difficulty: 1,
          duration_sec: 120,
          note_count: 50,
          content_rights: "public-domain",
          file_path: `/nonexistent/essentials/${id}.mid`,
          ...overrides,
        },
      });

    /** A play-along attempt with the practice-screen fields set, rewarded the way the route does it. */
    async function playWith(userId: string, songId: string, accuracy: number, extras: Record<string, unknown>) {
      const { id } = await m.prisma.playAlongAttempt.create({
        data: {
          user_id: userId,
          song_id: songId,
          score: accuracy,
          accuracy,
          tempo_pct: 100,
          lookahead_s: 3,
          wait_mode: false,
          arrangement_level: (extras.arrangement_level as string | undefined) ?? null,
          hands: (extras.hands as string | undefined) ?? null,
          loop_start_bar: (extras.loop_start_bar as number | undefined) ?? null,
          loop_end_bar: (extras.loop_end_bar as number | undefined) ?? null,
          is_loop: (extras.is_loop as boolean | undefined) ?? false,
        },
      });
      const { rewardPlayAlongAttempt } = await import("./progression/rewards.js");
      return rewardPlayAlongAttempt(m.prisma, { userId, attemptId: id });
    }

    it("awards XP into an auditable ledger, with diminishing returns for repeats", async () => {
      const user = await createUser();
      const gains: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        const res = await api("POST", "/exercises/exercise-01/attempts", { token: user.token, body: { performedNotes: perfectRun("exercise-01") } });
        expect(res.status).toBe(201);
        gains.push(res.body.rewards.xpGained);
      }
      // 20 + 25 first pass; then mastered (½): 10, 10; 4th–6th ½ again: 5; then a fifth: 2.
      expect(gains).toEqual([45, 10, 10, 5, 5, 5, 2, 2]);
      const total = gains.reduce((sum, gain) => sum + gain, 0);
      expect(await ledgerTotal(user.id)).toBe(total);
      const summary = await api("GET", "/users/me/summary", { token: user.token });
      expect(summary.body.level.totalXp).toBe(total);
      expect(await m.prisma.xpEvent.count({ where: { user_id: user.id, dedupe_key: "first-pass:exercise-01" } })).toBe(1);

      // A real improvement earns the new-best bonus.
      const second = exerciseIdsOf("lesson-01").find((id) => id !== "exercise-01")!;
      const offKey = perfectRun(second).map((note) => ({ ...note, note: note.note + 1 }));
      const weak = await api("POST", `/exercises/${second}/attempts`, { token: user.token, body: { performedNotes: offKey } });
      expect(weak.status).toBe(201);
      expect(weak.body.rewards.items.some((item: { reason: string }) => item.reason.startsWith("First pass"))).toBe(false);
      const strong = await api("POST", `/exercises/${second}/attempts`, { token: user.token, body: { performedNotes: perfectRun(second) } });
      expect(strong.body.rewards.items.map((item: { reason: string }) => item.reason).join("|")).toMatch(/First pass.*New best/);

      // Re-running the backfill over this history adds nothing: every award is keyed.
      const { backfillUser } = await import("./progression/backfill.js");
      const before = await ledgerTotal(user.id);
      await backfillUser(m.prisma, user.id);
      expect(await ledgerTotal(user.id)).toBe(before);
    });

    it("backfills XP, practice days and achievements from existing history", async () => {
      const user = await createUser();
      await passEveryExercise(user.token, "lesson-01");
      // Pretend that history predates the ledger.
      await m.prisma.xpEvent.deleteMany({ where: { user_id: user.id } });
      await m.prisma.practiceDay.deleteMany({ where: { user_id: user.id } });
      await m.prisma.userAchievement.deleteMany({ where: { user_id: user.id } });

      const { backfillUser } = await import("./progression/backfill.js");
      const first = await backfillUser(m.prisma, user.id);
      expect(first.xp).toBeGreaterThan(200);
      expect(await ledgerTotal(user.id)).toBe(first.xp);
      expect(await m.prisma.xpEvent.count({ where: { user_id: user.id, dedupe_key: "lesson-complete:lesson-01" } })).toBe(1);
      expect((await m.prisma.practiceDay.findMany({ where: { user_id: user.id } })).length).toBe(1);
      const keys = (await m.prisma.userAchievement.findMany({ where: { user_id: user.id } })).map((row) => row.achievement_key);
      expect(keys).toEqual(expect.arrayContaining(["first_lesson_completed", "perfect_exercise"]));

      const second = await backfillUser(m.prisma, user.id);
      expect(second).toEqual({ xp: 0, achievements: 0 });
    });

    it("caps song stars by practice level, hands and loops, at each threshold", async () => {
      const user = await createUser();
      const cases: [Record<string, unknown>, number, number][] = [
        [{}, 69, 0],
        [{}, 70, 1],
        [{}, 85, 2],
        [{}, 95, 3], // null level = Full, both hands
        [{ arrangement_level: "full", hands: "both" }, 99, 3],
        [{ arrangement_level: "simplified", hands: "both" }, 99, 2],
        [{ arrangement_level: "easy" }, 99, 1],
        [{ arrangement_level: "melody" }, 99, 1],
        [{ arrangement_level: "full", hands: "right" }, 99, 2],
        [{ is_loop: true, loop_start_bar: 1, loop_end_bar: 4 }, 99, 0],
      ];
      for (const [index, [extras, accuracy, expected]] of cases.entries()) {
        const songId = `stars-song-${index}`;
        await makeSong(songId);
        const rewards = await playWith(user.id, songId, accuracy, extras);
        const res = await api("GET", `/songs/${songId}/stars`, { token: user.token });
        expect(res.body.best, JSON.stringify(extras) + accuracy).toBe(expected);
        expect(rewards.newStars.find((star) => star.id === songId)?.stars ?? 0).toBe(expected);
      }
      // Stars are kept per level: an Easy 1★ does not hide a Full 3★ on the same song.
      await playWith(user.id, "stars-song-4", 99, { arrangement_level: "easy" });
      const levels = await api("GET", "/songs/stars-song-4/stars", { token: user.token });
      expect(levels.body).toMatchObject({ best: 3, byLevel: { full: 3, easy: 1 } });

      // Loops earn a small, capped amount: at most 5 per attempt, 25 per song per day.
      await makeSong("loop-song");
      let loopXp = 0;
      for (let i = 0; i < 7; i += 1) {
        const rewards = await playWith(user.id, "loop-song", 100, { is_loop: true, loop_start_bar: 1, loop_end_bar: 2 });
        loopXp += rewards.items.filter((item) => item.reason.startsWith("Looped")).reduce((sum, item) => sum + item.amount, 0);
      }
      expect(loopXp).toBe(25);
    });

    it("fills the daily goal from practice time and keeps a streak with a freeze", async () => {
      const user = await createUser();
      await api("PATCH", "/users/me", { token: user.token, body: { daily_goal_minutes: 5 } });
      await makeSong("goal-song", { duration_sec: 200 });
      const first = await playWith(user.id, "goal-song", 80, {});
      expect(first.dailyGoal).toMatchObject({ goalMinutes: 5, met: false });
      expect(first.dailyGoal.minutesToday).toBeCloseTo(3.3, 1);
      const second = await playWith(user.id, "goal-song", 80, {});
      expect(second.dailyGoal).toMatchObject({ met: true, justMet: true });
      expect(second.items.map((item) => item.reason)).toContain("Daily goal met");
      expect(second.newAchievements.map((a) => a.key)).toContain("daily_goal_first");
      const third = await playWith(user.id, "goal-song", 80, {});
      expect(third.dailyGoal.justMet).toBe(false);
      expect(third.items.map((item) => item.reason)).not.toContain("Daily goal met");

      // History (server-side dates): 7 goal days ending the day before yesterday,
      // yesterday missed. The banked freeze covers yesterday; today extends it to 8.
      const today = (await api("GET", "/users/me/summary", { token: user.token })).body.today as string;
      const { addDays } = await import("./progression/days.js");
      await m.prisma.practiceDay.createMany({
        data: [-8, -7, -6, -5, -4, -3, -2].map((offset) => ({
          user_id: user.id,
          day: addDays(today, offset),
          seconds: 600,
          goal_minutes: 5,
          goal_met_at: new Date(),
        })),
      });
      const summary = await api("GET", "/users/me/summary", { token: user.token });
      expect(summary.body.streak).toMatchObject({ current: 8, longest: 8, freezesAvailable: 0, frozenDays: [addDays(today, -1)] });

      // The next save pays the milestones the streak has reached.
      const fourth = await playWith(user.id, "goal-song", 80, {});
      expect(fourth.items.map((item) => item.reason)).toEqual(expect.arrayContaining(["3-day streak", "7-day streak"]));
      expect(fourth.newAchievements.map((a) => a.key)).toEqual(expect.arrayContaining(["streak_3", "streak_7"]));

      // Without the freeze (two days missed), the streak is today alone.
      await m.prisma.practiceDay.deleteMany({ where: { user_id: user.id, day: addDays(today, -2) } });
      const broken = await api("GET", "/users/me/summary", { token: user.token });
      expect(broken.body.streak.current).toBe(1);
    });

    it("evaluates achievements on save, once, and only for content that exists", async () => {
      const user = await createUser();
      const unlockedBy: string[][] = [];
      for (const exerciseId of exerciseIdsOf("lesson-01")) {
        const res = await api("POST", `/exercises/${exerciseId}/attempts`, { token: user.token, body: { performedNotes: perfectRun(exerciseId) } });
        unlockedBy.push(res.body.rewards.newAchievements.map((a: { key: string }) => a.key));
      }
      expect(unlockedBy[0]).toContain("perfect_exercise");
      expect(unlockedBy.at(-1)).toEqual(expect.arrayContaining(["first_lesson_completed", "lesson_three_star"]));
      expect(unlockedBy.flat().filter((key) => key === "perfect_exercise")).toHaveLength(1);

      const quiz = await api("POST", `/quiz-questions/${quizQuestions("lesson-02")[0]!.id}/answer`, { token: user.token, body: { selectedAnswer: 99 } });
      expect(quiz.status).toBe(400);
      const [question] = quizQuestions("lesson-02");
      const answered = await api("POST", `/quiz-questions/${question!.id}/answer`, { token: user.token, body: { selectedAnswer: question!.correctIndex } });
      expect(answered.body.rewards.newAchievements.map((a: { key: string }) => a.key)).toContain("first_quiz_attempt");

      const progression = await api("GET", "/users/me/progression", { token: user.token });
      const byKey = new Map(progression.body.achievements.map((a: { key: string }) => [a.key, a]));
      expect(byKey.get("first_lesson_completed")).toMatchObject({ unlocked: true });
      expect(byKey.get("lessons_5")).toMatchObject({ unlocked: false, progress: { current: 1, target: 5 } });
      // Levels with no lessons, and Essentials goals with no Essentials songs, are not offered.
      expect(byKey.has("level_complete_foundation")).toBe(true);
      expect(byKey.has("level_complete_advanced")).toBe(false);
      expect(byKey.has("essentials_master")).toBe(false);
      expect(progression.body.achievements.length).toBeGreaterThan(30);
      expect(progression.body.skills.find((s: { id: string }) => s.id === "reading").points).toBe((2 + 1) * 10 * 3);
    });

    it("unlocks an Essentials Beginner song when its lesson is completed", async () => {
      const user = await createUser();
      await makeSong("essentials-ode-to-joy-beginner", { title: "Ode to Joy (Beginner)", arrangement_group: "ode-to-joy", arrangement_level: "beginner" });
      let unlocked: { id: string; title: string }[] = [];
      for (const exerciseId of exerciseIdsOf("lesson-05")) {
        const res = await api("POST", `/exercises/${exerciseId}/attempts`, { token: user.token, body: { performedNotes: perfectRun(exerciseId) } });
        unlocked = unlocked.concat(res.body.rewards.unlockedSongs);
      }
      expect(unlocked).toEqual([{ id: "essentials-ode-to-joy-beginner", title: "Ode to Joy (Beginner)", lessonTitle: expect.any(String) }]);
      const today = await api("GET", "/users/me/today", { token: user.token });
      expect(today.body.readyForYou.map((song: { songId: string }) => song.songId)).toEqual(["essentials-ode-to-joy-beginner"]);
      expect(today.body.song).toMatchObject({ songId: "essentials-ode-to-joy-beginner", hands: "right", level: "full" });
    });
  });

  describe("catalogue backfill", () => {
    /** Two hands, every onset on the beat: a score-like file. */
    const twoHandMidi = (): Buffer => {
      const midi = new Midi();
      const right = midi.addTrack();
      right.name = "Right hand";
      const left = midi.addTrack();
      left.name = "Left hand";
      for (let i = 0; i < 64; i += 1) {
        right.addNote({ midi: 72 + (i % 8), time: i * 0.5, duration: 0.45 });
        if (i % 2 === 0) left.addNote({ midi: 48 + (i % 5), time: i * 0.5, duration: 0.9 });
      }
      return Buffer.from(midi.toArray());
    };

    /** Every pre-existing Song column, every attempt and XP row: what the backfill must never change. */
    const protectedState = async () => ({
      songs: await m.prisma.song.findMany({
        select: {
          id: true, title: true, artist: true, genre: true, difficulty: true, duration_sec: true, note_count: true, content_rights: true,
          source_url: true, notation_path: true, file_path: true, uploader_id: true, created_at: true, arrangement_group: true,
          arrangement_level: true, attribution: true, retired_at: true,
        },
        orderBy: { id: "asc" },
      }),
      attempts: await m.prisma.playAlongAttempt.findMany({ orderBy: { id: "asc" } }),
      xp: await m.prisma.xpEvent.findMany({ orderBy: { id: "asc" } }),
    });

    it("groups songs into Works without touching ids or history, and a second run changes nothing", async () => {
      const { backfillCatalogue, isNoOp } = await import("./catalogue/backfill.js");
      const dir = await mkdtemp(join(tmpdir(), "ks-backfill-"));
      await mkdir(join(dir, "essentials"));
      const bytes = twoHandMidi();
      const user = await createUser();
      const owner = await createUser();
      const ids: string[] = [];
      const song = async (id: string | undefined, file: string, data: Record<string, unknown> = {}) => {
        const file_path = join(dir, file);
        await writeFile(file_path, bytes);
        const created = await m.prisma.song.create({
          data: { id, title: id ?? file, artist: "Ludwig van Beethoven", genre: "classical", difficulty: 2, duration_sec: 32, note_count: 96, content_rights: "public-domain", file_path, ...data },
        });
        ids.push(created.id);
        return created.id;
      };
      for (const level of ["beginner", "intermediate", "full"]) {
        await song(`essentials-fur-elise-${level}`, `essentials/fur-elise-${level}.mid`, { arrangement_group: "fur-elise", arrangement_level: level, content_rights: "cc-by-sa-3.0" });
      }
      const libraryFurElise = await song("seed-ludwig-van-beethoven-fur-elise", "ludwig-van-beethoven-fur-elise.mid", { retired_at: new Date() });
      const bethena = await song("seed-scott-joplin-bethena", "scott-joplin-bethena.mid", { artist: "Scott Joplin" });
      const silentNight = await song(undefined, "beginner-silent-night.mid", { artist: "Franz Xaver Gruber", title: "Silent Night", retired_at: new Date() });
      const hotCrossBuns = await song(undefined, "beginner-hot-cross-buns.mid", { artist: "Traditional", title: "Hot Cross Buns" });
      const upload = await song(undefined, "upload-mine.mid", { uploader_id: owner.id, content_rights: "user-upload" });
      const missing = await song(undefined, "beginner-gone.mid", { artist: "Traditional", title: "Gone" });
      await rm(join(dir, "beginner-gone.mid"));

      for (const [songId, score] of [[libraryFurElise, 81], [libraryFurElise, 64], ["essentials-fur-elise-full", 92], [bethena, 55], [upload, 70], [silentNight, 40]] as const) {
        await m.prisma.playAlongAttempt.create({ data: { user_id: user.id, song_id: songId, score, accuracy: score, tempo_pct: 100, lookahead_s: 4, wait_mode: false } });
      }
      await m.prisma.xpEvent.create({ data: { user_id: user.id, source: "playalong", amount: 25, reason: "test", dedupe_key: `playalong:${libraryFurElise}` } });

      const before = await protectedState();
      const bestsBefore = (await api("GET", "/songs/attempts/me", { token: user.token })).body.bests;

      const first = await backfillCatalogue(m.prisma, { year: 2026 });
      expect(first.worksCreated).toBeGreaterThanOrEqual(3);
      // Other suites leave rows with made-up paths behind, so only check ours.
      expect(first.unreadable).toContain(missing);

      expect(await protectedState()).toEqual(before);
      expect((await api("GET", "/songs/attempts/me", { token: user.token })).body.bests).toEqual(bestsBefore);

      const rows = new Map((await m.prisma.song.findMany({ where: { id: { in: ids } } })).map((row) => [row.id, row]));
      // Every song has a source and a tier.
      for (const row of rows.values()) {
        expect(row.source_kind, row.id).not.toBeNull();
        expect(row.quality_tier, row.id).toBeTruthy();
      }
      // One Work holds all three Essentials levels and the retired library copy.
      const furElise = await m.prisma.work.findUniqueOrThrow({ where: { id: "fur-elise" }, include: { songs: { select: { id: true } }, aliases: true, composer: true } });
      expect(furElise.songs.map((s) => s.id).sort()).toEqual(["essentials-fur-elise-beginner", "essentials-fur-elise-full", "essentials-fur-elise-intermediate", libraryFurElise].sort());
      expect(furElise).toMatchObject({ composer_id: "ludwig-van-beethoven", catalogue: "WoO 59", pd_status: "pd-worldwide", curation_status: "published", recognisability: 1 });
      expect(furElise.aliases.map((alias) => alias.alias)).toContain("Fuer Elise");
      expect(furElise.search_text).toContain("woo59");
      // The superseded beginner-pack row joins the Essentials Work; another tune gets its own.
      expect(rows.get(silentNight)).toMatchObject({ work_id: "silent-night", source_kind: "beginner", source_ref: "beginner-pack:silent-night" });
      expect(rows.get(hotCrossBuns)).toMatchObject({ work_id: "hot-cross-buns", source_kind: "beginner", public_eligible: true, quality_tier: "verified" });
      expect(await m.prisma.work.findUniqueOrThrow({ where: { id: "hot-cross-buns" } })).toMatchObject({ genre: "childrens", composer_id: "traditional", curation_status: "published" });
      // Sources, licences and eligibility.
      expect(rows.get("essentials-fur-elise-full")).toMatchObject({ source_kind: "essentials", file_licence: "cc-by-sa-3.0", public_eligible: true, quality_tier: "verified" });
      expect(rows.get(libraryFurElise)).toMatchObject({ source_kind: "adl", file_licence: "unknown", public_eligible: false, quality_tier: "low" });
      expect(rows.get(bethena)).toMatchObject({ source_kind: "adl", work_id: null, source_ref: "scott-joplin-bethena", public_eligible: false });
      expect(rows.get(upload)).toMatchObject({ source_kind: "upload", work_id: null, public_eligible: false });
      expect(await m.prisma.tag.findMany({ where: { works: { some: { work_id: "fur-elise" } } } })).toEqual([expect.objectContaining({ id: "essentials" })]);

      // Search goes through ks_unaccent and the indexed expressions (unaccent + pg_trgm installed).
      const search = (q: string) =>
        m.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Work"
          WHERE to_tsvector('simple', ks_unaccent("search_text")) @@ websearch_to_tsquery('simple', ks_unaccent(${q}))
             OR word_similarity(ks_unaccent(lower(${q})), ks_unaccent(lower("search_text"))) > 0.6
          ORDER BY id`;
      expect((await search("fur elise")).map((r) => r.id)).toContain("fur-elise");
      expect((await search("Für Elise")).map((r) => r.id)).toContain("fur-elise");
      expect((await search("fuer elise")).map((r) => r.id)).toContain("fur-elise");
      expect((await search("woo59")).map((r) => r.id)).toEqual(["fur-elise"]);

      // Idempotent: the second run writes nothing at all.
      const updatedAt = (await m.prisma.song.findMany({ where: { id: { in: ids } }, select: { id: true, quality_checked_at: true }, orderBy: { id: "asc" } }));
      const second = await backfillCatalogue(m.prisma, { year: 2026 });
      expect(isNoOp(second)).toBe(true);
      expect(await m.prisma.song.findMany({ where: { id: { in: ids } }, select: { id: true, quality_checked_at: true }, orderBy: { id: "asc" } })).toEqual(updatedAt);
      expect(await protectedState()).toEqual(before);

      // Curated choices made later are kept: a song moved to another Work stays there.
      await m.prisma.song.update({ where: { id: bethena }, data: { work: { connect: { id: "hot-cross-buns" } } } });
      await backfillCatalogue(m.prisma, { year: 2026 });
      expect((await m.prisma.song.findUniqueOrThrow({ where: { id: bethena } })).work_id).toBe("hot-cross-buns");

      await m.prisma.playAlongAttempt.deleteMany({ where: { user_id: user.id } });
      await m.prisma.xpEvent.deleteMany({ where: { user_id: user.id } });
      await m.prisma.song.deleteMany({ where: { id: { in: ids } } });
      await m.prisma.work.deleteMany({});
      await m.prisma.composer.deleteMany({});
      await m.prisma.tag.deleteMany({});
      await m.prisma.catalogueEvent.deleteMany({});
      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("song practice attempts", () => {
    it("stores the practice fields, keeps loop runs out of bests, and tracks bests per level", async () => {
      const user = await createUser();
      await m.prisma.song.create({
        data: { id: "practice-song", title: "Practice", artist: "x", genre: "classical", difficulty: 2, duration_sec: 60, note_count: 100, content_rights: "public-domain", file_path: "/lib/practice.mid" },
      });
      const base = { accuracy: 90, tempo_pct: 70, lookahead_s: 4, wait_mode: false };
      const post = (body: Record<string, unknown>) => api("POST", "/songs/practice-song/attempts", { token: user.token, body: { ...base, ...body } });

      // An old client: no practice fields at all.
      expect((await post({ score: 50 })).status).toBe(201);
      const easy = await post({ score: 30, arrangement_level: "easy", hands: "right", multiplier: 0.3, is_loop: false });
      expect(easy.status).toBe(201);
      const loop = await post({ score: 99, arrangement_level: "easy", hands: "right", loop_start_bar: 5, loop_end_bar: 8, multiplier: 0.3, is_loop: true });
      expect(loop.status).toBe(201);

      const stored = await m.prisma.playAlongAttempt.findUniqueOrThrow({ where: { id: loop.body.id } });
      expect(stored).toMatchObject({ arrangement_level: "easy", hands: "right", loop_start_bar: 5, loop_end_bar: 8, multiplier: 0.3, is_loop: true });

      // Validation.
      expect((await post({ score: 10, arrangement_level: "impossible" })).status).toBe(400);
      expect((await post({ score: 10, loop_start_bar: 8, loop_end_bar: 5 })).status).toBe(400);
      expect((await post({ score: 10, loop_start_bar: 5 })).status).toBe(400);
      expect((await post({ score: 10, is_loop: true })).status).toBe(400);
      expect((await post({ score: 10, multiplier: 2 })).status).toBe(400);

      const history = await api("GET", "/songs/attempts/me", { token: user.token });
      expect(history.status).toBe(200);
      // The loop's 99 is practice: the best stays 50.
      expect(history.body.bests["practice-song"].score).toBe(50);
      expect(history.body.bests_by_level["practice-song"]).toEqual({
        full: { score: 50, accuracy: 90 },
        easy: { score: 30, accuracy: 90 },
      });
      const recentLoop = history.body.recent.find((row: { id: string }) => row.id === loop.body.id);
      expect(recentLoop).toMatchObject({ arrangement_level: "easy", hands: "right", loop_start_bar: 5, loop_end_bar: 8, is_loop: true });
      const recentOld = history.body.recent.find((row: { score: number }) => row.score === 50);
      expect(recentOld).toMatchObject({ arrangement_level: "full", hands: "both", is_loop: false, multiplier: null });

      await m.prisma.playAlongAttempt.deleteMany({ where: { user_id: user.id } });
      await m.prisma.song.delete({ where: { id: "practice-song" } });
    });
  });
});
