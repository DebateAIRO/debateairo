#!/usr/bin/env node
// tools/n1-baseline.mjs — the N-1 compatibility baseline reader (side-by-side spec 2026-10-21 §5; plan A, task A10).
//
// tests/n1-baseline.json names the release that is live (`commit`, 40 hex, set by the release guide each time a
// release goes live; null with a `reason` until a release is fenced) and the database suites (`suites`) the CI job
// .github/workflows/n1-compatibility.yml runs from that commit against a schema migrated by HEAD.
//
// Two optional lists, each entry `{ "name", "reason" }`, keep that job honest about the OLD commit's tests, whose files
// and whose own tests/ci-known-red.txt can never change (added at r20, PR #209):
//   - `setAside`  what can never run on a database migrated ahead because it tests the migration chain itself. A bare
//                 suite path names a whole suite (it is then not in `suites`); a full test name
//                 (`<suite> > <describe…> > <it>`, of a listed suite) names one test. Kept from baseline to baseline.
//   - `knownRed`  full test names of listed suites that are red AT THAT COMMIT on its own schema too (a stale test fixed
//                 on dev later). They belong to that commit only: the release guide empties the list when it moves
//                 `commit` on.
// The job appends every listed TEST name to the old checkout's own known-red list (in CI only, never committed), so
// the old gate still fails on any other failure, and still names an entry whose test has started to pass (V-4).
//
//   node tools/n1-baseline.mjs commit      prints the commit, or `none`
//   node tools/n1-baseline.mjs suites      prints the suites, one per line
//   node tools/n1-baseline.mjs known-red   prints the listed test names as tests/ci-known-red.txt lines, each
//                                          followed by its `# source:` reason
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
const OPTIONAL_KEYS = Object.freeze(["knownRed", "setAside"]);
const ENTRY_KEYS = Object.freeze(["name", "reason"]);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SUITE_PATTERN = /^tests\/integration\/[\w.-]+\.test\.ts$/u;
const NAME_SEPARATOR = " > ";
/** One printable line: no line break or other control character, no leading `#` (it is written into a list file). */
const ONE_LINE = /^[^\p{Cc}#][^\p{Cc}]*$/u;
/** A suite that tests the migration chain itself (or the preview's auth layout) cannot run on a database migrated ahead. */
export const N1_EXCLUDED_SUITE = /migration|lineage|forward|upgrade|preview-auth/u;

const refuse = (detail) => {
  throw Object.assign(new Error(`N1_BASELINE_INVALID: ${detail}`), { code: "N1_BASELINE_INVALID" });
};

/** A full vitest test name `<suite> > <describe…> > <it>` whose suite is listed; returns its suite, or refuses. */
function testNameSuite(name, suites, list) {
  const parts = name.split(NAME_SEPARATOR);
  if (parts.length < 3 || parts.some((part) => part.trim() === "")) refuse(`${list}: ${name} is not "<suite> > <describe> > <it>"`);
  if (!suites.includes(parts[0])) refuse(`${list}: ${name} names a suite that is not in suites`);
  return parts[0];
}

/** Check one optional list (`setAside` or `knownRed`); returns frozen `{ name, reason }` entries. */
function parseEntries(value, list, suites) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) refuse(`${list} must be a list`);
  return Object.freeze(value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) refuse(`${list}: an entry is not an object`);
    if (Object.keys(entry).sort().join() !== ENTRY_KEYS.join()) refuse(`${list}: an entry must have exactly name, reason`);
    const { name, reason } = entry;
    if (typeof name !== "string" || !ONE_LINE.test(name)) refuse(`${list}: a name is not one printable line`);
    if (typeof reason !== "string" || reason.trim() === "" || !ONE_LINE.test(reason)) refuse(`${list}: ${name} needs a one-line reason`);
    if (list === "setAside" && SUITE_PATTERN.test(name)) {
      if (suites.includes(name)) refuse(`setAside: suite ${name} is also in suites`);
    } else {
      testNameSuite(name, suites, list);
    }
    return Object.freeze({ name, reason });
  }));
}

/** Parse and check the baseline file's text; returns a frozen copy or refuses N1_BASELINE_INVALID. */
export function parseN1Baseline(text) {
  let value;
  try { value = JSON.parse(text); } catch { refuse("not JSON"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse("not an object");
  const keys = Object.keys(value).sort();
  const required = keys.filter((key) => !OPTIONAL_KEYS.includes(key));
  if (required.join() !== KEYS.join()) refuse(`keys must be exactly ${KEYS.join(", ")} (and optionally ${OPTIONAL_KEYS.join(", ")})`);
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
  const setAside = parseEntries(value.setAside, "setAside", suites);
  const knownRed = parseEntries(value.knownRed, "knownRed", suites);
  const names = [...setAside, ...knownRed].map((entry) => entry.name);
  if (new Set(names).size !== names.length) refuse("a setAside or knownRed name is listed twice");
  return Object.freeze({
    schema: value.schema, commit: value.commit, reason: value.reason, suites: Object.freeze([...suites]), setAside, knownRed
  });
}

/** The listed TEST names (set-aside tests, then known reds) as tests/ci-known-red.txt lines, each with its source. */
export function knownRedLines(baseline) {
  const lines = [`# N-1 job only (appended in CI from HEAD's tests/n1-baseline.json; never committed): ${baseline.commit ?? "none"}`];
  for (const [list, entries] of [["setAside", baseline.setAside], ["knownRed", baseline.knownRed]]) {
    for (const entry of entries) {
      if (SUITE_PATTERN.test(entry.name)) continue;
      lines.push(entry.name, `# source: tests/n1-baseline.json ${list}: ${entry.reason}`);
    }
  }
  return lines;
}

export function main(args, readText = () => readFileSync(BASELINE_PATH, "utf8")) {
  try {
    if (args.length !== 1 || !["commit", "suites", "known-red"].includes(args[0])) {
      refuse("usage: n1-baseline.mjs commit|suites|known-red");
    }
    const baseline = parseN1Baseline(readText());
    if (args[0] === "commit") console.log(baseline.commit ?? "none");
    else if (args[0] === "suites") console.log(baseline.suites.join("\n"));
    else console.log(knownRedLines(baseline).join("\n"));
    return 0;
  } catch (error) {
    console.error(error?.code === "N1_BASELINE_INVALID" ? error.message : "N1_BASELINE_INVALID: unreadable baseline");
    return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
