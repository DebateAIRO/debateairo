#!/usr/bin/env node
// tools/n1-baseline.mjs — the N-1 compatibility baseline reader (side-by-side spec 2026-10-21 §5; plan A, task A10).
//
// tests/n1-baseline.json names the release that is live (`commit`, 40 hex, set by the release guide each time a
// release goes live; null with a `reason` until a release is fenced) and the database suites (`suites`) the CI job
// .github/workflows/n1-compatibility.yml runs from that commit against a schema migrated by HEAD.
//
//   node tools/n1-baseline.mjs commit   prints the commit, or `none`
//   node tools/n1-baseline.mjs suites   prints the suites, one per line
//
// Any shape error, or any other argument, refuses with N1_BASELINE_INVALID and exit 2: a broken baseline never lets
// the job stop green. Plain Node ESM, standard library only: the workflow runs it before any install.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const BASELINE_PATH = resolve(PRODUCT_ROOT, "tests/n1-baseline.json");
export const N1_BASELINE_SCHEMA = "debateai-n1-baseline-v1";
const KEYS = Object.freeze(["commit", "reason", "schema", "suites"]);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SUITE_PATTERN = /^tests\/integration\/[\w.-]+\.test\.ts$/u;
/** A suite that tests the migration chain itself (or the preview's auth layout) cannot run on a database migrated ahead. */
export const N1_EXCLUDED_SUITE = /migration|lineage|forward|upgrade|preview-auth/u;

const refuse = (detail) => {
  throw Object.assign(new Error(`N1_BASELINE_INVALID: ${detail}`), { code: "N1_BASELINE_INVALID" });
};

/** Parse and check the baseline file's text; returns a frozen copy or refuses N1_BASELINE_INVALID. */
export function parseN1Baseline(text) {
  let value;
  try { value = JSON.parse(text); } catch { refuse("not JSON"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse("not an object");
  const keys = Object.keys(value).sort();
  if (keys.join() !== KEYS.join()) refuse(`keys must be exactly ${KEYS.join(", ")}`);
  if (value.schema !== N1_BASELINE_SCHEMA) refuse(`schema must be ${N1_BASELINE_SCHEMA}`);
  if (value.commit !== null && !(typeof value.commit === "string" && COMMIT_PATTERN.test(value.commit))) {
    refuse("commit must be null or 40 lowercase hex");
  }
  if (typeof value.reason !== "string") refuse("reason must be a string");
  if (value.commit === null && value.reason.trim() === "") refuse("a null commit needs its reason");
  const { suites } = value;
  if (!Array.isArray(suites) || suites.length === 0) refuse("suites must be a non-empty list");
  for (const suite of suites) {
    if (typeof suite !== "string" || !SUITE_PATTERN.test(suite)) refuse("a suite is not a tests/integration/*.test.ts path");
    if (N1_EXCLUDED_SUITE.test(suite)) refuse(`excluded suite ${suite}`);
  }
  if (new Set(suites).size !== suites.length) refuse("a suite is listed twice");
  return Object.freeze({ schema: value.schema, commit: value.commit, reason: value.reason, suites: Object.freeze([...suites]) });
}

export function main(args, readText = () => readFileSync(BASELINE_PATH, "utf8")) {
  try {
    if (args.length !== 1 || !["commit", "suites"].includes(args[0])) refuse("usage: n1-baseline.mjs commit|suites");
    const baseline = parseN1Baseline(readText());
    console.log(args[0] === "commit" ? (baseline.commit ?? "none") : baseline.suites.join("\n"));
    return 0;
  } catch (error) {
    console.error(error?.code === "N1_BASELINE_INVALID" ? error.message : "N1_BASELINE_INVALID: unreadable baseline");
    return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
