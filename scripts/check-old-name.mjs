#!/usr/bin/env node
// Fails when the old product name "Midivory" appears in a tracked file outside the
// allow-list. The product is Music Portal; only identifiers that stored data and installed
// apps depend on keep the old name (docs/specs/MUSIC-PORTAL.md, section 1.2), plus the
// "formerly Midivory" notes that help existing users recognise the app.
// Usage: node scripts/check-old-name.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Whole files that may mention the old name. */
const ALLOWED_FILES = [
  /^docs\/specs\//, // the plan describes the rename itself
  /^docs\/store\//, // Store listing and policy drafts: old answer vs new, "Midivory is now Music Portal"
  /^docs\/WHATS-NEW\.md$/, // release notes that announce the rename to existing users
  /^brand\/midivory-icon\.svg$/, // the previous mark, kept until the new one has shipped everywhere
  /^scripts\/check-old-name\.mjs$/,
  /\.(png|jpg|jpeg|webp|ico|jks|keystore|mid|midi|wav|mp3|ogg|sf2|pdf|zip|gz)$/i,
];

/** Spans that are fine wherever they appear; everything else on the line is still checked. */
const ALLOWED_SPANS = [
  /com[./]midivory[./]app/gi, // Android applicationId, namespace, Kotlin package and its paths
  /MIDIVORY_HOME_CA/g, // build variable for the home build's CA certificate
  /midivory-icon\.svg/g, // file name of the previous mark
  /formerly \**Midivory\**/gi, // rename notes for existing users
  /was called Midivory/g,
  /\bused Midivory\b/g, // user guide: "If you (already) used Midivory", existing users keep their account
  /from the Midivory days/g,
];

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
for (const file of files) {
  if (ALLOWED_FILES.some((pattern) => pattern.test(file))) continue;
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    continue; // deleted in the working tree, or not a regular file
  }
  if (!/midivory/i.test(text)) continue;
  text.split("\n").forEach((line, index) => {
    const rest = ALLOWED_SPANS.reduce((acc, pattern) => acc.replace(pattern, ""), line);
    if (/midivory/i.test(rest)) problems.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`);
  });
}

if (problems.length > 0) {
  console.error(`The old name "Midivory" is still used (product name is "Music Portal"):\n  ${problems.join("\n  ")}`);
  console.error("Rename it, or, if it is an identifier stored data depends on, add it to the allow-list in scripts/check-old-name.mjs.");
  process.exit(1);
}
console.log("check-old-name: ok");
