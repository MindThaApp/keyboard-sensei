#!/usr/bin/env node
// Fails when two Prisma migrations share a timestamp prefix. Prisma applies them in
// name order, so a shared prefix leaves the order to the suffix alone. Migrations that
// are already deployed cannot be renamed (Prisma checks the names), so the existing
// pair is allowlisted. Usage: node scripts/check-migration-prefixes.mjs [migrations-dir]
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] ?? join(root, "apps/api/prisma/migrations");

const ALLOWED_SHARED_PREFIXES = {
  "20261025000000": ["20261025000000_daily_challenge", "20261025000000_game_round"],
};

const byPrefix = new Map();
for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const prefix = entry.name.split("_")[0];
  byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), entry.name].sort());
}

const problems = [];
for (const [prefix, names] of byPrefix) {
  if (names.length < 2) continue;
  const allowed = ALLOWED_SHARED_PREFIXES[prefix];
  if (!allowed || allowed.join() !== names.join()) {
    problems.push(`${prefix} is shared by: ${names.join(", ")}`);
  }
}

if (problems.length > 0) {
  console.error("Duplicate migration timestamp prefixes:\n  " + problems.join("\n  "));
  console.error("Give the new migration a unique, later timestamp.");
  process.exit(1);
}
console.log(`Migration prefixes are unique (${byPrefix.size} prefixes).`);
