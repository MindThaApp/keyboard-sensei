/**
 * Import a source pack (piano-midi.de / Mutopia / authored scores) into the catalogue as DRAFTS.
 *
 *   pnpm --filter @keyboard-sensei/api exec tsx scripts/import-pack.ts batch-a [--dry-run]
 *
 * Fetches each piece's pinned file (sha256-checked, cached under
 * data/midi-library/packs/<pack>/), checks its opening notes against the
 * second source, classifies it and creates a draft Work and Song with the
 * credit its licence requires. Nothing is published; a reviewer publishes
 * (a song marked public-eligible only becomes visible to a public build once
 * its Work is published). Re-running changes nothing.
 * --dry-run fetches and checks but writes nothing to the database.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { BATCH_A } from "../src/catalogue/packs/batch-a.js";
import { BATCH_B } from "../src/catalogue/packs/batch-b.js";
import { BATCH_C } from "../src/catalogue/packs/batch-c.js";
import { BATCH_D } from "../src/catalogue/packs/batch-d.js";
import { importPack, type PieceReport } from "../src/catalogue/packs/import.js";
import type { Pack } from "../src/catalogue/packs/pack.js";

const PACKS: Record<string, Pack> = { [BATCH_A.id]: BATCH_A, [BATCH_B.id]: BATCH_B, [BATCH_C.id]: BATCH_C, [BATCH_D.id]: BATCH_D };

function describeIncipit(report: PieceReport): string {
  const incipit = report.incipit;
  if (!incipit) return "";
  if (incipit.result === "none") return "incipit: not machine-checked";
  return `incipit: ${incipit.result} (${incipit.matched} leading, ${incipit.lcs}/16 shared, ${incipit.note})`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args.find((arg) => !arg.startsWith("--"));
  const pack = name ? PACKS[name] : undefined;
  if (!pack) {
    console.error(`Usage: import-pack.ts <${Object.keys(PACKS).join("|")}> [--dry-run]`);
    process.exit(2);
  }

  const report = await importPack(prisma, pack, { dryRun: args.includes("--dry-run") });
  for (const piece of report.pieces) {
    const tier = piece.tier ? `${piece.tier}${piece.tierReasons?.length ? ` [${piece.tierReasons.join(", ")}]` : ""}` : "";
    console.log(`${piece.status.padEnd(9)} ${piece.slug.padEnd(34)} ${tier}`);
    if (piece.reason) console.log(`          reason: ${piece.reason}`);
    else console.log(`          ${describeIncipit(piece)}`);
  }
  const { counts } = report;
  console.log(
    `\n${pack.id}: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.checked} checked, ${counts.rejected} rejected ` +
      `(all drafts; ${report.publicEligible} of them public-eligible once published)`,
  );
  if (counts.rejected > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
