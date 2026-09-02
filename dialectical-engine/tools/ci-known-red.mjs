#!/usr/bin/env node
// tools/ci-known-red.mjs — B31 recorded known-red CI gate.
//
// Runs `pnpm exec vitest run <dirs…> --reporter=json` and compares the failing full test
// names against tests/ci-known-red.txt:
//   - a failure that is NOT on the list        -> printed, exit 1 (a NEW failure)
//   - a failure that IS on the list            -> counted as "known red"
//   - a listed test that ran and PASSED        -> warning "stale known-red entry", exit 0
//   - vitest did not produce a report          -> exit 1 (a broken invocation is never green)
//   - an unparseable allowlist entry or report -> exit 2
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
        ran.push(name);
      }
    }
    if (String(file?.status ?? "") === "failed" && failedHere === 0) {
      failed.push(rel);
      messages[rel] = String(file?.message ?? "the test file failed without reporting a failed test (collection or import error)");
    }
  }
  return { failed, ran, messages };
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

function summary(decision) {
  return `CI_KNOWN_RED_GATE new=${decision.newFailures.length} known=${decision.knownFailures.length} stale=${decision.stale.length}`;
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
    const run = spawnSync("pnpm", ["exec", "vitest", "run", ...dirs, "--reporter=json", `--outputFile=${reportPath}`], {
      cwd: PRODUCT_ROOT,
      stdio: "inherit"
    });
    if (run.error) {
      console.error(`could not start vitest: ${run.error.message}`);
      return 1;
    }
    if (!existsSync(reportPath)) {
      console.error(`vitest wrote no JSON report (exit ${run.status}); refusing to report a green gate`);
      return 1;
    }
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch (error) {
      console.error(`could not parse the vitest JSON report: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }

    const { failed, ran, messages } = failedNamesFromReport(report, PRODUCT_ROOT);
    const decision = decide({ failed, allowlist, ran });

    if (report?.success === false && failed.length === 0) {
      console.error("vitest reported failure but named no failing test; refusing to report a green gate");
      console.log(summary(decision));
      return 1;
    }

    if (decision.knownFailures.length > 0) {
      console.log(`known red (${decision.knownFailures.length}) — recorded in tests/ci-known-red.txt:`);
      for (const name of decision.knownFailures) console.log(`  ${name}`);
    }
    for (const name of decision.stale) {
      console.log(`warning: stale known-red entry, remove it: ${name}`);
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
    return decision.exitCode;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
