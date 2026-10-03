/**
 * src/config.ts validates the environment with Zod AT IMPORT TIME, so merely
 * importing anything that reaches it (auth.ts -> config.ts) throws when these are
 * absent. CI sets none of them, which made every API suite fail on import before a
 * single test ran — CI had been red for this reason independently of any code change.
 *
 * These are dummy values for unit tests only; the suites mock Prisma and never open
 * a real connection.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-jwt-secret-not-used-for-anything-real";
process.env.ELEVENLABS_API_KEY ??= "test-elevenlabs-key";

/**
 * Real-database integration tests (src/*.db.test.ts) run only when TEST_DATABASE_URL is
 * set, and then the whole process must talk to that database — db.ts reads DATABASE_URL
 * when PrismaClient is constructed, so point it there before any module loads.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
