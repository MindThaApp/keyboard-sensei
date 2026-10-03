/**
 * Award XP, practice days and achievements from existing history (see
 * src/progression/backfill.ts). Safe to re-run: it only adds what is missing.
 *
 *   pnpm exec tsx scripts/backfill-progression.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillAll } from "../src/progression/backfill.js";

const prisma = new PrismaClient();

backfillAll(prisma)
  .then((report) => {
    console.log(`Backfilled ${report.users} users: ${report.xpAwarded} XP awarded, ${report.achievements} achievements unlocked`);
  })
  .finally(() => prisma.$disconnect());
