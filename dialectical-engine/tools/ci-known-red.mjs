#!/usr/bin/env node
// tools/ci-known-red.mjs — B31 recorded known-red CI gate.
//
// Runs `pnpm exec vitest run <dirs…> --reporter=json` and compares the failing full test
// names against tests/ci-known-red.txt:
//   - a failure that is NOT on the list        -> printed, exit 1 (a NEW failure)
//   - a failure that IS on the list            -> counted as "known red"
//   - a listed test that ran and PASSED        -> its file is re-run twice more (see below)
//   - vitest did not produce a report          -> exit 1 (a broken invocation is never green)
//   - an unparseable allowlist entry or report -> exit 2
//
// V-4 (ruled 2026-09-21, follow-up included): the list may only SHRINK, so a listed test that has
// started passing must fail the gate until its entry is deleted. The owner's wording was "three
// consecutive default-branch runs"; the coordinator ruled the same intent without cross-run state.
// When a listed test passes, this tool re-runs just that test's FILE twice more in the same job:
//   - passed all three executions -> CONFIRMED stale, printed by name, exit 1 (delete the entry)
//   - passed once but not thrice  -> flaky, warning only, the entry stays, exit 0
// A flake therefore has to pass three times running to be named, while a test that was genuinely
// fixed is named in the very change that fixed it.
//
// Plain Node ESM, no dependencies beyond the Node standard library.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const ALLOWLIST_PATH = resolve(PRODUCT_ROOT, "tests/ci-known-red.txt");
const NAME_SEPARATOR = " > ";
const TEST_FILE_PATTERN = /^tests\/[\w.-]+\/[\w.-]+\.test\.tsx?$/;
/** V-4: how many extra executions confirm a listed test that passed. Two, so a confirmed entry
 * passed three times running counting the sweep that found it. */
export const STALE_CONFIRMATION_RERUNS = 2;

/**
 * Split the allowlist file into entries and unparseable lines.
 * An entry is `<test file path> > <describe…> > <it>` exactly as vitest prints it.
 */
export function parseAllowlist(text) {
  const entries = [];
  const invalid = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(NAME_SEPARATOR);
    const file = parts[0] ?? "";
    if (parts.length < 3 || !TEST_FILE_PATTERN.test(file) || (parts.at(-1) ?? "") === "") {
      invalid.push(line);
      continue;
    }
    entries.push(line);
  }
  return { entries, invalid };
}

/**
 * Rebuild vitest's printed full name for every assertion in a JSON report:
 * `<file path relative to the product root> > <ancestor titles…> > <title>`.
 * A file that failed without producing a single failed assertion (a collection or import
 * error) is reported under its bare path so it can never be mistaken for a green run.
 */
export function failedNamesFromReport(report, rootDir) {
  const failed = [];
  const passed = [];
  const ran = [];
  const messages = {};
  const files = Array.isArray(report?.testResults) ? report.testResults : [];
  for (const file of files) {
    const rel = relative(rootDir, String(file?.name ?? "")).split(sep).join("/");
    const assertions = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
    let failedHere = 0;
    for (const assertion of assertions) {
      const titles = Array.isArray(assertion?.ancestorTitles) ? assertion.ancestorTitles.map(String) : [];
      const name = [rel, ...titles, String(assertion?.title ?? "")].join(NAME_SEPARATOR);
      const status = String(assertion?.status ?? "");
      if (status === "failed") {
        failed.push(name);
        failedHere += 1;
        ran.push(name);
        const message = Array.isArray(assertion?.failureMessages) ? assertion.failureMessages.join("\n") : "";
        messages[name] = message;
      } else if (status === "passed") {
        passed.push(name);
        ran.push(name);
      }
    }
    if (String(file?.status ?? "") === "failed" && failedHere === 0) {
      failed.push(rel);
      messages[rel] = String(file?.message ?? "the test file failed without reporting a failed test (collection or import error)");
    }
  }
  return { failed, passed, ran, messages };
}

/**
 * The gate's decision. `ran` is the set of test names vitest actually reported; when it is
 * omitted every allowlisted entry is assumed to have run (the two-argument contract).
 */
export function decide({ failed, allowlist, ran }) {
  const allowed = new Set(allowlist);
  const failedSet = new Set(failed);
  const ranSet = ran === undefined || ran === null ? null : new Set(ran);
  const newFailures = failed.filter((name) => !allowed.has(name));
  const knownFailures = failed.filter((name) => allowed.has(name));
  const stale = allowlist.filter((name) => !failedSet.has(name) && (ranSet === null || ranSet.has(name)));
  return { newFailures, knownFailures, stale, exitCode: newFailures.length > 0 ? 1 : 0 };
}

/**
 * The test FILES that must be re-run to confirm the stale entries, each named once, in the order
 * the entries first mention them. An entry is `<file> > <describe…> > <it>`, so the file is the
 * part before the first separator.
 */
export function rerunTargets(stale) {
  return [...new Set(stale.map((name) => name.split(NAME_SEPARATOR)[0] ?? name))];
}

/**
 * V-4: a stale entry is CONFIRMED only when its test passed in every re-run, and only when there
 * were as many re-runs as the rule asks for — a run that never happened can never fail the gate.
 * `rerunPasses` holds one array of passing test names per re-run execution.
 */
export function confirmStale({ stale, rerunPasses }) {
  const enough = rerunPasses.length >= STALE_CONFIRMATION_RERUNS;
  const passSets = rerunPasses.map((names) => new Set(names));
  const confirmed = [];
  const cleared = [];
  for (const name of stale) {
    if (enough && passSets.every((names) => names.has(name))) confirmed.push(name);
    else cleared.push(name);
  }
  return { confirmed, cleared };
}

/** The gate fails on a failure nobody recorded, and on an entry that has outlived its defect. */
export function gateExitCode({ newFailures, confirmedStale }) {
  return newFailures.length > 0 || confirmedStale.length > 0 ? 1 : 0;
}

/**
 * The recorded report line. Its shape is quoted in the mission records (DEV-SYNC-2026-09-18 §4
 * among others) and is pinned by ci-known-red-gate.test.ts — `stale` keeps its original meaning,
 * the number of listed tests that passed in the sweep, whether or not a re-run confirmed them.
 */
export function summary(decision) {
  return `CI_KNOWN_RED_GATE new=${decision.newFailures.length} known=${decision.knownFailures.length} stale=${decision.stale.length}`;
}

/**
 * One vitest sweep over `targets`, its JSON report parsed. Returns the report, or a `problem`
 * string naming what went wrong — a sweep that produced no readable report is never green.
 */
function sweep(targets, reportPath) {
  const run = spawnSync("pnpm", ["exec", "vitest", "run", ...targets, "--reporter=json", `--outputFile=${reportPath}`], {
    cwd: PRODUCT_ROOT,
    stdio: "inherit"
  });
  if (run.error) return { problem: `could not start vitest: ${run.error.message}` };
  if (!existsSync(reportPath)) return { problem: `vitest wrote no JSON report (exit ${run.status})` };
  try {
    return { report: JSON.parse(readFileSync(reportPath, "utf8")) };
  } catch (error) {
    return { problem: `could not parse the vitest JSON report: ${error instanceof Error ? error.message : String(error)}`, unparseable: true };
  }
}

function main(dirs) {
  if (dirs.length === 0) {
    console.error("usage: node tools/ci-known-red.mjs <test dir> [<test dir>…]");
    return 2;
  }
  if (!existsSync(ALLOWLIST_PATH)) {
    console.error(`allowlist missing: ${relative(PRODUCT_ROOT, ALLOWLIST_PATH)}`);
    return 2;
  }
  const { entries: allowlist, invalid } = parseAllowlist(readFileSync(ALLOWLIST_PATH, "utf8"));
  if (invalid.length > 0) {
    console.error(`unparseable known-red entries in tests/ci-known-red.txt (want "<file> > <describe> > <it>"):`);
    for (const line of invalid) console.error(`  ${line}`);
    return 2;
  }

  const scratch = mkdtempSync(join(tmpdir(), "ci-known-red-"));
  const reportPath = join(scratch, "vitest.json");
  try {
    const first = sweep(dirs, reportPath);
    if (first.problem !== undefined) {
      console.error(`${first.problem}; refusing to report a green gate`);
      return first.unparseable === true ? 2 : 1;
    }
    const report = first.report;

    const { failed, ran, messages } = failedNamesFromReport(report, PRODUCT_ROOT);
    const decision = decide({ failed, allowlist, ran });

    if (report?.success === false && failed.length === 0) {
      console.error("vitest reported failure but named no failing test; refusing to report a green gate");
      console.log(summary(decision));
      return 1;
    }

    // V-4: a listed test that passed is not judged on one execution. Re-run its file twice more
    // in this same job; an entry that passed all three times has outlived its defect and fails
    // the gate, while one that fails again is flaky and keeps its place on the list.
    let confirmedStale = [];
    if (decision.stale.length > 0) {
      const targets = rerunTargets(decision.stale);
      console.log(`listed tests that passed (${decision.stale.length}) — re-running ${targets.length} file(s) ${STALE_CONFIRMATION_RERUNS} more times to confirm (V-4):`);
      for (const name of decision.stale) console.log(`  ${name}`);
      const rerunPasses = [];
      for (let attempt = 1; attempt <= STALE_CONFIRMATION_RERUNS; attempt += 1) {
        const rerun = sweep(targets, join(scratch, `vitest-rerun-${attempt}.json`));
        if (rerun.problem !== undefined) {
          console.error(`re-run ${attempt} of ${STALE_CONFIRMATION_RERUNS}: ${rerun.problem}; refusing to report a green gate`);
          console.log(summary(decision));
          return rerun.unparseable === true ? 2 : 1;
        }
        rerunPasses.push(failedNamesFromReport(rerun.report, PRODUCT_ROOT).passed);
      }
      const outcome = confirmStale({ stale: decision.stale, rerunPasses });
      confirmedStale = outcome.confirmed;
      for (const name of outcome.cleared) {
        console.log(`warning: listed test passed once but not ${STALE_CONFIRMATION_RERUNS + 1} times running — flaky, entry kept: ${name}`);
      }
    }

    if (decision.knownFailures.length > 0) {
      console.log(`known red (${decision.knownFailures.length}) — recorded in tests/ci-known-red.txt:`);
      for (const name of decision.knownFailures) console.log(`  ${name}`);
    }
    if (confirmedStale.length > 0) {
      console.error(`STALE known-red entries (${confirmedStale.length}) — each passed ${STALE_CONFIRMATION_RERUNS + 1} consecutive times. Delete the entry and its source comment from tests/ci-known-red.txt (the list may only shrink, V-4):`);
      for (const name of confirmedStale) console.error(`  ${name}`);
    }
    if (decision.newFailures.length > 0) {
      console.error(`NEW failures (${decision.newFailures.length}) — not in tests/ci-known-red.txt:`);
      for (const name of decision.newFailures) {
        console.error(`  ${name}`);
        const message = (messages[name] ?? "").split("\n").slice(0, 4).join("\n");
        if (message.trim() !== "") console.error(message.replace(/^/gm, "      "));
      }
    }
    console.log(summary(decision));
    return gateExitCode({ newFailures: decision.newFailures, confirmedStale });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
