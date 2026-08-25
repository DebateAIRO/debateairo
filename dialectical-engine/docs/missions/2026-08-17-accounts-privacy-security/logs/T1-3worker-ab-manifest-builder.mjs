// T1 three-worker A/B — deterministic manifest builder.
//
// AUTHORING STATUS: design evidence for `T1-claude-3worker-ab-draft-packet.md`,
// authored under `T1-claude-3worker-ab-artifact-correction1-packet.md`. Never
// executed by the authoring seat.
//
// WHY THIS EXISTS
// The first draft had the seat "assemble the manifest". That is the whole
// problem: a hand-assembled manifest is an operator's account of the run, and
// the adjudicator would then be checking the account rather than the evidence.
// Every gate downstream could be satisfied by writing `true` in a file.
//
// So this builder accepts NO scientific, custody, restoration or mutant truth as
// an operator-provided boolean. It accepts exactly two inputs — the mission logs
// directory and the externally approved launch-authority file — plus the
// wrapper-owned literal carrier, and derives everything else by reading raw
// receipts, raw status bytes and file hashes:
//
//   * cell presence, order, worker count, pair and arm come from the FROZEN
//     schedule below, not from the manifest it writes;
//   * each report's own `cellId`, `workerCount`, pair/arm and process/PostgreSQL
//     identity are cross-checked against the filename and the frozen schedule,
//     so a receipt cannot be relabelled after execution;
//   * raw statuses must be exactly their permitted values; missing, empty,
//     malformed or non-integer is a receipt failure, never "assume 0";
//   * artifact, patch, helper, builder, wrapper, packet and governed-file hashes
//     are compared to the exact values in the V-approved launch authority, not
//     merely to a 64-hex shape;
//   * mutant selection counts, named intended failures, anchor replacement
//     counts, temporary-copy use and restoration are read out of the mutants'
//     own raw receipts and out of the helper's own report lines.
//
// It writes exactly one file: the manifest named by `--out`. It never edits a
// receipt, and the raw generated literals never enter it — the durable manifest
// records only their count and a cryptographic commitment, because a manifest
// that listed every generated address would itself be the leak the secret scan
// exists to find.
//
// CORRECTION 3 ADDITIONS
//   * every receipt lives in ONE uniquely created run directory, and every
//     status/report pair carries this run's 64-hex commitment, so a receipt
//     from an earlier run cannot be replayed into this one;
//   * no receipt may predate the run's own preflight instant;
//   * the cell finalization order is a total order compared to the frozen one;
//   * the CLOSED inventory is derived from the frozen schedule and the exact
//     required lifecycle receipts, then compared against a separate directory
//     listing — omissions and extras are both failures. The old prefix-wide
//     `T1-3worker-ab-*` sweep is gone: it swallowed support sources, patches,
//     packets and author transcripts as if they were run evidence.
//
// USAGE
//   node T1-3worker-ab-manifest-builder.mjs \
//     --run-dir <this run's unique receipt directory> \
//     --artifacts <mission logs dir holding the eight artifacts> \
//     --launch-authority <approved authority json> \
//     --literal-carrier <wrapper-owned mode-0600 carrier> \
//     --run-commitment <64-hex run commitment> \
//     --out <manifest name inside the run directory>
//
// EXIT STATUS
//   0  a complete manifest was written
//   2  the evidence is incomplete or contradicts the frozen schedule/authority;
//      a secret-free named-problem list is printed and NO manifest is written
//   3  bad invocation or unreadable authority

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve, sep } from "node:path";

const PREFIX = "T1-3worker-ab-";

/** The frozen counterbalanced order. Owned here, never read from an input. */
const PAIRED_ORDER = Object.freeze(Array.from({ length: 10 }, (_unused, index) =>
  Object.freeze(index % 2 === 0 ? [2, 3] : [3, 2])
));

const ARCHITECTURE_RESOURCE_CELLS = Object.freeze([
  Object.freeze({ cellId: "architecture-r1-a0-w2", workers: 2 }),
  Object.freeze({ cellId: "architecture-r1-a1-w3", workers: 3 }),
  Object.freeze({ cellId: "architecture-r2-a0-w3", workers: 3 }),
  Object.freeze({ cellId: "architecture-r2-a1-w2", workers: 2 })
]);

const FAULT_CELLS = Object.freeze([
  "fault-unconfirmed-death",
  "fault-late-exit-before-close",
  "fault-close-time-termination-retry-fulfilled"
]);

const POSITIVE_CONTROL_CELL_ID = "positive-control-retain-4mib";

/**
 * Mutants 1-7 mutate an installed temporary governed test; 8-10 mutate a
 * temporary copy of the adjudicator. `intendedFailure` is the exact text the
 * mutant's own receipt must contain — a mutant that failed for some other
 * reason has not demonstrated that its gate is alive.
 */
const VITEST_MUTANTS = Object.freeze([
  Object.freeze({
    name: "mutant-01-enqueue-reported-as-dispatch", workers: 2,
    intendedFailure: "T1_N3_AB_QUEUE_OBSERVED_BUT_NO_DWELL"
  }),
  Object.freeze({
    name: "mutant-02-settlement-reported-as-dispatch", workers: 2,
    intendedFailure: "T1_N3_AB_SERVICE_ENVELOPE_POSITIVE"
  }),
  Object.freeze({
    name: "mutant-03-omit-one-credential-job-from-ordinal-map", workers: 2,
    intendedFailure: "T1_N3_AB_ORDINAL_MAP_COVERS_EVERY_CREDENTIAL_JOB"
  }),
  Object.freeze({
    name: "mutant-04-secretly-keep-two-workers-in-three-worker-cell", workers: 3,
    intendedFailure: "T1_N3_AB_WORKER_COUNT_NOT_HONOURED"
  }),
  Object.freeze({
    name: "mutant-05-harness-control-physical-alive-four", workers: 3,
    intendedFailure: "T1_N3_AB_PHYSICAL_ALIVE_NEVER_EXCEEDS_THREE"
  }),
  Object.freeze({
    name: "mutant-06-sample-rss-only-after-settlement", workers: 3,
    intendedFailure: "T1_N3_AB_RSS_SAMPLED_IN_FLIGHT"
  }),
  Object.freeze({
    name: "mutant-07-skip-one-worker-warm-up", workers: 3,
    intendedFailure: "T1_N3_AB_WARM_UP_COVERED_EVERY_WORKER"
  })
]);

const ADJUDICATOR_MUTANTS = Object.freeze([
  Object.freeze({
    name: "mutant-08-label-candidate-rss-bound-ratified",
    intendedFailure: "guard-fires:every-rss-bound-labelled-unratified-candidate"
  }),
  Object.freeze({
    name: "mutant-09-map-not-reproduced-to-causal-marker",
    intendedFailure: "not-reproduced-maps-to-ordinary-not-causal-marker"
  }),
  Object.freeze({
    name: "mutant-10-disable-full-receipt-secret-scan",
    intendedFailure: "guard-fires:no-generated-literal-in-receipt"
  })
]);

/** Artifacts whose bytes must match the launch authority exactly. */
const GOVERNED_ARTIFACTS = Object.freeze([
  "T1-3worker-ab-booted-rss-harness.mjs",
  "T1-3worker-ab-adjudicator.mjs",
  "T1-3worker-ab-command-matrix.md",
  "T1-3worker-ab-integration.patch",
  "T1-3worker-ab-architecture.patch",
  "T1-3worker-ab-mutation-helper.mjs",
  "T1-3worker-ab-manifest-builder.mjs",
  "run-claude-T1-3worker-ab-diagnostic.sh"
]);

const TEMPORARY_TEST_PATHS = Object.freeze([
  "tests/integration/registration-database.test.ts",
  "tests/architecture/t1-argon2-worker-contract.test.ts"
]);

const MARKERS = Object.freeze({
  integration: "[T1_N3_AB_INTEGRATION_REPORT]",
  architecture: "[T1_N3_AB_ARCHITECTURE_REPORT]",
  fault: "[T1_N3_AB_FAULT_REPORT]",
  standalone: "[T1_N3_AB_STANDALONE_REPORT]"
});

/**
 * CSI and single-character ANSI escapes.
 *
 * Assembled from character codes rather than typed as literal control bytes: a
 * raw ESC in this source would trip the repository text-control-byte audit, and
 * a reviewer cannot inspect a control byte they cannot see.
 */
const ANSI_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}]`
  + "[[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nqry=><]",
  "g"
);

// ---------------------------------------------------------------------------
// Problem collection. Named, secret-free, and fatal in aggregate.
// ---------------------------------------------------------------------------

const problems = [];
function problem(name, detail = null) {
  problems.push(detail === null ? { problem: name } : { problem: name, detail });
}

// ---------------------------------------------------------------------------
// Filesystem access, confined to the logs directory.
// ---------------------------------------------------------------------------

/**
 * Two roots, deliberately separate.
 *
 * `runDir` is this execution's own uniquely created directory: every receipt
 * this builder reads lives there, and nothing outside it can be replayed in.
 * `artifactsDir` is the mission logs directory holding the eight approved
 * support artifacts, which are hashed but never read as run evidence.
 */
let runDir = "";
let artifactsDir = "";
let runCommitment = "";
let preflightEpochNs = 0n;

function inRun(relative) {
  if (typeof relative !== "string" || relative.length === 0 || isAbsolute(relative)
    || relative.split(/[\\/]/).includes("..")) {
    return null;
  }
  const resolved = resolve(runDir, relative);
  if (resolved !== runDir && !resolved.startsWith(runDir + sep)) return null;
  return resolved;
}

function readText(relative) {
  const path = inRun(relative);
  if (path === null) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Freshness. A receipt that predates this run's preflight instant is a receipt
 * from some other run, however plausible its contents look.
 */
function assertFresh(relative) {
  const path = inRun(relative);
  if (path === null) return false;
  try {
    const stats = statSync(path);
    if (BigInt(Math.floor(stats.mtimeMs)) * 1000000n < preflightEpochNs - 2000000000n) {
      problem("receipt-predates-run-preflight", { receipt: basename(relative) });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sha256OfArtifact(name) {
  try {
    return createHash("sha256").update(readFileSync(resolve(artifactsDir, name))).digest("hex");
  } catch {
    return null;
  }
}

function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, "");
}

/** First 64-hex token in a `shasum -a 256` style receipt, or null. */
function firstHash(text) {
  if (text === null) return null;
  return /\b([0-9a-f]{64})\b/.exec(text)?.[1] ?? null;
}

/**
 * A raw status byte, read as bytes and validated as bytes.
 *
 * Missing, empty, whitespace-only and non-integer are all receipt failures with
 * distinct names — an absent status is never quietly equivalent to a valid
 * nonzero mutant failure, which is precisely the substitution that would let a
 * crashed mutant pass as a killed one.
 */
function rawStatus(relative, kind) {
  const text = readText(relative);
  if (text === null) {
    problem("raw-status-missing", { receipt: basename(relative), kind });
    return null;
  }
  if (text.trim().length === 0) {
    problem("raw-status-empty", { receipt: basename(relative), kind });
    return null;
  }
  // Exact grammar: one integer, one space, this run's 64-hex commitment. The
  // commitment is what makes a status file belong to THIS run — a copied
  // receipt from an earlier run parses as a status but fails the binding.
  const match = /^(\d{1,3}) ([0-9a-f]{64})\s*$/.exec(text);
  if (match === null) {
    problem("raw-status-grammar-invalid", { receipt: basename(relative), kind });
    return null;
  }
  if (match[2] !== runCommitment) {
    problem("raw-status-not-bound-to-this-run", { receipt: basename(relative), kind });
    return null;
  }
  assertFresh(relative);
  return Number(match[1]);
}

function extractReport(stdoutText, marker, label) {
  const lines = stripAnsi(stdoutText).split("\n").filter((line) => line.startsWith(marker));
  if (lines.length !== 1) {
    problem("exactly-one-report-marker-line", { cell: label, lines: lines.length });
    return null;
  }
  try {
    return JSON.parse(lines[0].slice(marker.length));
  } catch {
    problem("report-marker-line-unparseable", { cell: label });
    return null;
  }
}

// ---------------------------------------------------------------------------
// One executed cell: raw bytes in, cross-checked entry out.
// ---------------------------------------------------------------------------

function loadCell(cellId, markerName, expectation) {
  const stdoutPath = `${PREFIX}${cellId}.out`;
  const stderrPath = `${PREFIX}${cellId}.err`;
  const statusPath = `${PREFIX}${cellId}.status`;
  const stdoutText = readText(stdoutPath);
  const stderrText = readText(stderrPath);
  if (stdoutText === null) problem("receipt-stdout-missing", { cell: cellId });
  if (stderrText === null) problem("receipt-stderr-missing", { cell: cellId });
  const status = rawStatus(statusPath, "normal-cell");
  if (status !== null && status !== 0) {
    problem("normal-cell-raw-status-not-zero", { cell: cellId, status });
  }
  const report = stdoutText === null
    ? null
    : extractReport(stdoutText, MARKERS[markerName], cellId);

  // The receipt must say it is the cell its filename claims to be. Without this
  // any twenty receipts could be relabelled into the frozen order after the run.
  if (report !== null) {
    if (report.cellId !== cellId) problem("report-cell-id-matches-filename", { cell: cellId });
    if (expectation.workers !== undefined && report.workerCount !== expectation.workers) {
      problem("report-worker-count-matches-frozen-schedule", {
        cell: cellId, expected: expectation.workers
      });
    }
    if (expectation.faultName !== undefined && report.faultName !== expectation.faultName) {
      problem("report-fault-name-matches-frozen-schedule", { cell: cellId });
    }
    if (report.packetSha256 !== expectation.packetSha256) {
      problem("report-embedded-packet-token-matches-authority", { cell: cellId });
    }
    // The report half of the report/status pair carries the same run binding.
    if (report.runCommitment !== runCommitment) {
      problem("report-not-bound-to-this-run", { cell: cellId });
    }
  }
  assertFresh(stdoutPath);
  assertFresh(stderrPath);

  return {
    cellId,
    ...(expectation.workers === undefined ? {} : { workers: expectation.workers }),
    ...(expectation.pairIndex === undefined ? {} : { pairIndex: expectation.pairIndex }),
    ...(expectation.armIndex === undefined ? {} : { armIndex: expectation.armIndex }),
    ...(expectation.faultName === undefined ? {} : { faultName: expectation.faultName }),
    stdoutPath,
    stderrPath,
    statusPath,
    rawStatus: status,
    reportProcessPid: report?.header?.processPid ?? null,
    reportPostgresPort: report?.header?.postgresPort ?? null
  };
}

/** Distinct process and PostgreSQL identity across a whole cell class. */
function assertDistinctIdentity(entries, className) {
  const pids = new Set();
  const ports = new Set();
  for (const entry of entries) {
    if (!Number.isInteger(entry.reportProcessPid)) {
      problem("cell-process-identity-missing", { class: className, cell: entry.cellId });
    } else if (pids.has(entry.reportProcessPid)) {
      problem("cell-process-identity-not-distinct", { class: className, cell: entry.cellId });
    } else {
      pids.add(entry.reportProcessPid);
    }
    if (!Number.isInteger(entry.reportPostgresPort) || entry.reportPostgresPort <= 0) {
      problem("cell-postgres-identity-missing", { class: className, cell: entry.cellId });
    } else if (ports.has(entry.reportPostgresPort)) {
      problem("cell-postgres-identity-not-distinct", { class: className, cell: entry.cellId });
    } else {
      ports.add(entry.reportPostgresPort);
    }
  }
}

// ---------------------------------------------------------------------------
// Mutants: every field derived from the mutant's own raw evidence.
// ---------------------------------------------------------------------------

/** Vitest's own summary line is the only lawful source of the selected count. */
function selectedTestCount(strippedText) {
  const summary = /Tests\s+[^\n]*?\((\d+)\)/.exec(strippedText);
  if (summary !== null) return Number(summary[1]);
  const alternative = /Tests\s+(\d+)\s+(?:failed|passed)/.exec(strippedText);
  return alternative === null ? null : Number(alternative[1]);
}

/** The helper's own report line is the only source of the anchor evidence. */
function mutationEvidence(name) {
  const mutateText = readText(`${PREFIX}${name}-mutate.out`) ?? "";
  const mutation = /\[T1_N3_AB_MUTATION\](\{.*\})/.exec(stripAnsi(mutateText));
  if (mutation === null) {
    problem("mutant-mutation-report-missing", { mutant: name });
    return { anchorReplacementCount: null, mutatedTemporaryCopy: false };
  }
  try {
    const parsed = JSON.parse(mutation[1]);
    return {
      anchorReplacementCount: parsed.replacements ?? null,
      mutatedTemporaryCopy: parsed.mutatedTemporaryCopy === true
    };
  } catch {
    problem("mutant-mutation-report-unparseable", { mutant: name });
    return { anchorReplacementCount: null, mutatedTemporaryCopy: false };
  }
}

function loadVitestMutant(spec) {
  const stdoutPath = `${PREFIX}${spec.name}.out`;
  const stderrPath = `${PREFIX}${spec.name}.err`;
  const statusPath = `${PREFIX}${spec.name}.status`;
  const stdoutText = readText(stdoutPath);
  const stderrText = readText(stderrPath);
  if (stdoutText === null) problem("mutant-stdout-missing", { mutant: spec.name });
  if (stderrText === null) problem("mutant-stderr-missing", { mutant: spec.name });

  const status = rawStatus(statusPath, "mutant");
  if (status === 0) problem("mutant-survived", { mutant: spec.name });

  const combined = stripAnsi(`${stdoutText ?? ""}\n${stderrText ?? ""}`);
  const selectedTests = selectedTestCount(combined);
  if (selectedTests === null || selectedTests < 1) {
    problem("mutant-selected-no-test", { mutant: spec.name });
  }
  const failedForIntendedReason = combined.includes(spec.intendedFailure);
  if (!failedForIntendedReason) {
    problem("mutant-did-not-fail-for-its-intended-named-reason", { mutant: spec.name });
  }

  // Restoration is derived from the mutant's own restore receipts: a `cmp`
  // status of 0 against the pre-mutation copy, plus recomputed hashes.
  const restoreStatus = rawStatus(`${PREFIX}${spec.name}-restore.status`, "restoration");
  if (restoreStatus !== 0) problem("mutant-restore-cmp-not-identical", { mutant: spec.name });
  const restoredSha256 = firstHash(readText(`${PREFIX}${spec.name}-restore-hash.out`));
  if (restoredSha256 === null) problem("mutant-restored-hash-missing", { mutant: spec.name });
  const expectedRestoredSha256 = firstHash(readText(`${PREFIX}${spec.name}-preimage-hash.out`));
  if (expectedRestoredSha256 === null) {
    problem("mutant-preimage-hash-missing", { mutant: spec.name });
  }
  if (restoredSha256 !== expectedRestoredSha256) {
    problem("mutant-source-not-restored-byte-identically", { mutant: spec.name });
  }

  const evidence = mutationEvidence(spec.name);
  if (evidence.anchorReplacementCount !== 1) {
    problem("mutant-did-not-replace-exactly-one-anchor-site", { mutant: spec.name });
  }
  if (!evidence.mutatedTemporaryCopy) {
    problem("mutant-did-not-run-against-a-temporary-copy", { mutant: spec.name });
  }

  return {
    name: spec.name,
    cellId: spec.name,
    workers: spec.workers,
    stdoutPath,
    stderrPath,
    statusPath,
    rawStatus: status,
    selectedTests,
    failedForIntendedReason,
    intendedFailure: spec.intendedFailure,
    restoredSha256,
    expectedRestoredSha256,
    anchorReplacementCount: evidence.anchorReplacementCount,
    mutatedTemporaryCopy: evidence.mutatedTemporaryCopy
  };
}

function loadAdjudicatorMutant(spec) {
  const stdoutPath = `${PREFIX}${spec.name}.out`;
  const stderrPath = `${PREFIX}${spec.name}.err`;
  const statusPath = `${PREFIX}${spec.name}.status`;
  const stdoutText = readText(stdoutPath);
  const stderrText = readText(stderrPath);
  if (stdoutText === null) problem("mutant-stdout-missing", { mutant: spec.name });
  if (stderrText === null) problem("mutant-stderr-missing", { mutant: spec.name });
  const status = rawStatus(statusPath, "mutant");
  if (status === 0) problem("mutant-survived", { mutant: spec.name });
  const combined = stripAnsi(`${stdoutText ?? ""}\n${stderrText ?? ""}`);
  const namedAssertionFailed = combined.includes(spec.intendedFailure);
  if (!namedAssertionFailed) {
    problem("mutant-did-not-fail-for-its-intended-named-reason", { mutant: spec.name });
  }
  const evidence = mutationEvidence(spec.name);
  if (evidence.anchorReplacementCount !== 1) {
    problem("mutant-did-not-replace-exactly-one-anchor-site", { mutant: spec.name });
  }
  if (!evidence.mutatedTemporaryCopy) {
    problem("mutant-did-not-run-against-a-temporary-copy", { mutant: spec.name });
  }
  // The governed adjudicator itself must be byte-unchanged: the run mutated a
  // copy, so `cmp` against the governed file must report DIFFERENT (status 1).
  const untouched = rawStatus(`${PREFIX}${spec.name}-governed-untouched.status`, "custody");
  if (untouched !== 1) {
    problem("governed-adjudicator-was-not-left-untouched", { mutant: spec.name });
  }
  return {
    name: spec.name,
    cellId: spec.name,
    stdoutPath,
    stderrPath,
    statusPath,
    rawStatus: status,
    namedAssertionFailed,
    intendedFailure: spec.intendedFailure,
    anchorReplacementCount: evidence.anchorReplacementCount,
    mutatedTemporaryCopy: evidence.mutatedTemporaryCopy
  };
}

// ---------------------------------------------------------------------------
// The closed receipt inventory.
//
// Built from the FROZEN schedule and the exact required lifecycle receipts,
// independently of what happens to be on disk. The observed set is a separate
// directory listing of the run directory. Deriving the expected count from the
// same enumeration that produced the observed set would make the comparison a
// tautology — which is exactly the defect this replaces, along with the old
// prefix-wide `T1-3worker-ab-*` sweep that also swallowed support sources,
// patches, packets and author transcripts.
//
// Two names are DEFERRED: the manifest-builder status and the manifest itself
// do not exist while this builder is running. They are part of the expected
// pre-adjudication inventory, and the adjudicator — which runs later — is what
// confirms them.
// ---------------------------------------------------------------------------

const DEFERRED_INVENTORY_NAMES = Object.freeze([
  `${PREFIX}manifest-build.status`,
  `${PREFIX}manifest.json`
]);

/** Every cell that goes through the wrapper's supervised launcher, in order. */
function frozenCellOrder() {
  const cells = [];
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      cells.push(`integration-p${String(pairIndex + 1).padStart(2, "0")}-a${armIndex}-w${workers}`);
    });
  });
  for (const cell of ARCHITECTURE_RESOURCE_CELLS) cells.push(cell.cellId);
  for (const fault of FAULT_CELLS) cells.push(fault);
  cells.push(POSITIVE_CONTROL_CELL_ID);
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      cells.push(`standalone-p${String(pairIndex + 1).padStart(2, "0")}-a${armIndex}-w${workers}`);
    });
  });
  for (const mutant of VITEST_MUTANTS) cells.push(mutant.name);
  cells.push("adjudicator-clean-self-test");
  for (const mutant of ADJUDICATOR_MUTANTS) cells.push(mutant.name);
  return cells;
}

function expectedInventory() {
  const names = new Set();
  const add = (name) => names.add(`${PREFIX}${name}`);

  // Run identity, freshness and custody-of-process streams.
  for (const name of [
    "run-preflight-epoch.out", "run-identity.out", "process-identity.out",
    "finalization-order.out", "block-reasons.out", "preflight-authority.out",
    "preflight-checkout.out", "trap-arming.out", "installed-source-hashes.out",
    "carrier-gate.out", "carrier-gate.status"
  ]) add(name);

  // Preflight, help and syntax gates, each an `.out` plus a raw `.status`.
  for (const name of [
    "preflight-packet", "preflight-artifacts", "preflight-toplevel", "preflight-head",
    "preflight-index", "preflight-hashes", "preflight-whitespace",
    "entry-worktree-baseline", "preflight-node", "preflight-vitest-flags",
    "preflight-wrapper-syntax"
  ]) { add(`${name}.out`); add(`${name}.status`); }
  for (const source of [
    "T1-3worker-ab-booted-rss-harness.mjs", "T1-3worker-ab-adjudicator.mjs",
    "T1-3worker-ab-mutation-helper.mjs", "T1-3worker-ab-manifest-builder.mjs"
  ]) { add(`preflight-syntax-${source}.out`); add(`preflight-syntax-${source}.status`); }

  // Backups and the two temporary patch installations.
  add("backup-integration.status");
  add("backup-architecture.status");
  for (const slug of ["registration-database", "t1-argon2-worker-contract"]) {
    add(`backup-hash-${slug}.out`);
    add(`backup-stat-${slug}.out`);
    add(`temp-patch-hash-${slug}.out`);
    add(`restore-hash-${slug}.out`);
    add(`restore-stat-${slug}.out`);
    add(`restore-cmp-${slug}.status`);
  }
  for (const name of [
    "apply-check-integration", "apply-check-architecture",
    "apply-integration", "apply-architecture"
  ]) { add(`${name}.out`); add(`${name}.status`); }

  // Every supervised cell: stdout, stderr and raw status.
  for (const cell of frozenCellOrder()) {
    add(`${cell}.out`);
    add(`${cell}.err`);
    add(`${cell}.status`);
    add(`${cell}-timeout.out`);
    add(`${cell}-close-to-reap.out`);
  }

  // Mutation streams. Vitest mutants additionally carry pre-image and
  // restoration evidence; adjudicator mutants carry the inverted `cmp`.
  for (const mutant of VITEST_MUTANTS) {
    add(`${mutant.name}-preimage-hash.out`);
    add(`${mutant.name}-mutate.out`);
    add(`${mutant.name}-mutate.err`);
    add(`${mutant.name}-mutate.status`);
    add(`${mutant.name}-restore.status`);
    add(`${mutant.name}-restore-hash.out`);
    add(`${mutant.name}-restore-stat.out`);
  }
  for (const mutant of ADJUDICATOR_MUTANTS) {
    add(`${mutant.name}-mutate.out`);
    add(`${mutant.name}-mutate.err`);
    add(`${mutant.name}-mutate.status`);
    add(`${mutant.name}-governed-untouched.out`);
    add(`${mutant.name}-governed-untouched.status`);
  }

  // Final custody, written after restoration and before this builder runs.
  for (const name of [
    "final-head.out", "final-index.out", "final-hashes.out", "final-whitespace.out",
    "final-worktree.out", "final-descendants.out",
    "manifest-build.out", "manifest-build.err"
  ]) add(name);

  for (const deferred of DEFERRED_INVENTORY_NAMES) names.add(deferred);
  return [...names].sort();
}

function observedInventory() {
  try {
    return readdirSync(runDir).sort();
  } catch {
    problem("run-directory-unreadable");
    return [];
  }
}

function checkInventory() {
  const expected = expectedInventory();
  const observed = observedInventory();
  const observedSet = new Set(observed);
  const expectedSet = new Set(expected);
  const deferred = new Set(DEFERRED_INVENTORY_NAMES);
  for (const name of expected) {
    if (deferred.has(name)) continue;
    if (!observedSet.has(name)) {
      problem("expected-receipt-missing", { receipt: name });
      continue;
    }
    // Freshness applies to EVERY expected pre-adjudication receipt — preflight,
    // help, apply, backup, restoration, process, final-custody, mutant and
    // builder streams alike — not only to statuses and normal-cell streams. A
    // stale receipt is another run's receipt whatever its name says.
    assertFresh(name);
  }
  for (const name of observed) {
    if (!expectedSet.has(name)) problem("unexpected-durable-runtime-stream", { receipt: name });
  }
  return Object.freeze({ expected, observed, deferred: [...deferred] });
}

/**
 * Cell finalization order.
 *
 * The wrapper appends each cell the instant its status is written, so this file
 * is a total order over the run. It must equal the frozen order exactly: a
 * reordered run is a different experiment, and a missing entry is a cell whose
 * status was never finalized.
 */
function checkFinalizationOrder() {
  const text = readText(`${PREFIX}finalization-order.out`);
  if (text === null) {
    problem("finalization-order-receipt-missing");
    return [];
  }
  const observed = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const expected = frozenCellOrder();
  if (observed.length !== expected.length) {
    problem("finalization-order-length", { observed: observed.length, expected: expected.length });
    return observed;
  }
  expected.forEach((cell, index) => {
    if (observed[index] !== cell) {
      problem("finalization-order-mismatch", { position: index, expected: cell });
    }
  });
  return observed;
}

// ---------------------------------------------------------------------------
// Custody, derived from raw receipts rather than declared.
// ---------------------------------------------------------------------------

function deriveCustody(authority, authorityPath) {
  const headText = readText(`${PREFIX}final-head.out`);
  const headCommit = headText === null ? null : headText.trim();
  if (headCommit !== authority.headCommit) problem("final-head-does-not-match-authority");

  const indexText = readText(`${PREFIX}final-index.out`);
  if (indexText === null) problem("final-index-receipt-missing");
  const indexEmpty = indexText !== null && indexText.trim().length === 0;
  if (!indexEmpty) problem("git-index-not-empty");

  // Twelve governed hashes, parsed out of the final `shasum -a 256` receipt and
  // compared to the authority's own twelve. Both the values and the cardinality
  // matter: eleven matching lines is not twelve.
  const hashText = readText(`${PREFIX}final-hashes.out`) ?? "";
  const governedHashes = {};
  for (const line of hashText.split("\n")) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match !== null) governedHashes[match[2]] = match[1];
  }
  const expectedGoverned = authority.governedHashes ?? {};
  for (const [path, expected] of Object.entries(expectedGoverned)) {
    if (governedHashes[path] !== expected) {
      problem("governed-file-hash-changed", { file: basename(path) });
    }
  }
  if (Object.keys(governedHashes).length !== Object.keys(expectedGoverned).length) {
    problem("governed-hash-set-incomplete", {
      observed: Object.keys(governedHashes).length,
      required: Object.keys(expectedGoverned).length
    });
  }

  // Artifact hashes are RECOMPUTED here and compared to the exact authority
  // values. A 64-hex shape check would accept any file at all.
  const artifactHashes = {};
  for (const artifact of GOVERNED_ARTIFACTS) {
    const observed = sha256OfArtifact(artifact);
    const expected = authority.artifactSha256?.[artifact];
    if (observed === null) {
      problem("artifact-unreadable", { artifact });
      continue;
    }
    if (typeof expected !== "string" || expected !== observed) {
      problem("artifact-hash-does-not-match-authority", { artifact });
      continue;
    }
    artifactHashes[artifact] = observed;
  }

  // Restoration, from the restore receipts and the wrapper's backup hashes.
  const temporaryTests = {};
  for (const path of TEMPORARY_TEST_PATHS) {
    const slug = basename(path).replace(/\.test\.ts$/, "");
    const cmpStatus = rawStatus(`${PREFIX}restore-cmp-${slug}.status`, "restoration");
    const backupSha256 = firstHash(readText(`${PREFIX}backup-hash-${slug}.out`));
    const restoredSha256 = firstHash(readText(`${PREFIX}restore-hash-${slug}.out`));
    const temporaryDiffSha256 = firstHash(readText(`${PREFIX}temp-patch-hash-${slug}.out`));
    const statText = readText(`${PREFIX}restore-stat-${slug}.out`);
    const sizeMatch = statText === null ? null : /size=(\d+)/.exec(statText);
    const mtimeMatch = statText === null ? null : /mtime=(\d+)/.exec(statText);
    if (cmpStatus !== 0) problem("temporary-test-cmp-not-identical", { file: basename(path) });
    if (restoredSha256 !== authority.governedHashes?.[path]) {
      problem("temporary-test-not-restored-to-governed-hash", { file: basename(path) });
    }
    if (backupSha256 !== authority.governedHashes?.[path]) {
      problem("temporary-test-backup-not-from-governed-source", { file: basename(path) });
    }
    if (temporaryDiffSha256 !== authority.temporaryPatchSha256?.[path]) {
      problem("temporary-patch-hash-does-not-match-authority", { file: basename(path) });
    }
    if (sizeMatch === null || mtimeMatch === null) {
      problem("temporary-test-size-or-mtime-not-recorded", { file: basename(path) });
    }
    temporaryTests[path] = {
      backupSha256,
      restoredSha256,
      temporaryDiffSha256,
      cmpIdentical: cmpStatus === 0,
      sizeBytes: sizeMatch === null ? null : Number(sizeMatch[1]),
      mtimeIso: mtimeMatch === null ? null : new Date(Number(mtimeMatch[1]) * 1000).toISOString()
    };
  }

  // Descendant custody. The wrapper writes the exact tracked PIDs/PGIDs it
  // owned and the result of checking each one; a host-wide pattern sweep is
  // explicitly NOT what this reads, because such a sweep matches the wrapper
  // itself and every unrelated editor, shell and test on the machine.
  // The wrapper's process-identity receipt, parsed into a per-cell triple. The
  // adjudicator compares each report's inherited supervised identity against
  // this, so a report cannot name a group the wrapper never recorded for it.
  const processIdentity = {};
  for (const line of (readText(`${PREFIX}process-identity.out`) ?? "").split("\n")) {
    const match = /^CELL=(\S+) PID=(\d+) PGID=(\S+) SID=(\S+) WRAPPERPGID=(\d+) RUN=([0-9a-f]{64})$/
      .exec(line.trim());
    if (match === null) continue;
    if (match[6] !== runCommitment) {
      problem("process-identity-line-not-bound-to-this-run", { cell: match[1] });
      continue;
    }
    if (match[3] === "UNVERIFIED" || match[4] === "UNVERIFIED") {
      problem("process-identity-unverified", { cell: match[1] });
      continue;
    }
    processIdentity[match[1]] = {
      pid: Number(match[2]),
      pgid: Number(match[3]),
      sid: Number(match[4]),
      wrapperPgid: Number(match[5])
    };
    if (Number(match[3]) === Number(match[5])) {
      problem("process-identity-group-is-the-wrapper-group", { cell: match[1] });
    }
  }

  const descendantText = readText(`${PREFIX}final-descendants.out`);
  const processTreeClean = descendantText !== null
    && /^TRACKED_DESCENDANTS_GONE=\d+$/m.test(descendantText.trim())
    && !/ALIVE/.test(descendantText);
  if (!processTreeClean) problem("tracked-descendants-not-confirmed-gone");

  const wrapperBackupsTaken = rawStatus(`${PREFIX}backup-integration.status`, "custody") === 0
    && rawStatus(`${PREFIX}backup-architecture.status`, "custody") === 0;
  if (!wrapperBackupsTaken) problem("wrapper-backups-not-taken-after-preflight");

  // The worktree is compared to the wrapper's captured authorized entry
  // baseline plus the explicitly named new run receipts — never to emptiness,
  // because this mission's tree legitimately carries prior unstaged work.
  const entryBaseline = (readText(`${PREFIX}entry-worktree-baseline.out`) ?? "").split("\n")
    .map((line) => line.trimEnd()).filter((line) => line.length > 0);
  const finalWorktree = (readText(`${PREFIX}final-worktree.out`) ?? "").split("\n")
    .map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (finalWorktree.length === 0) problem("final-worktree-receipt-missing");
  const baselineSet = new Set(entryBaseline);
  const unexplained = finalWorktree.filter((line) => {
    if (baselineSet.has(line)) return false;
    const match = /^\?\?\s+(.*)$/.exec(line);
    if (match === null) return true;
    const path = match[1];
    return !(path.includes("/2026-08-17-accounts-privacy-security/logs/")
      && basename(path).startsWith("T1-3worker-ab-"));
  });
  if (unexplained.length > 0) {
    problem("worktree-contains-unexplained-changes", { lines: unexplained.length });
  }

  return {
    headCommit,
    indexEmpty,
    governedHashes,
    artifactHashes,
    temporaryTests,
    processIdentity,
    processTreeClean,
    wrapperBackupsTaken,
    launchAuthoritySha256: createHash("sha256").update(readFileSync(authorityPath)).digest("hex"),
    entryBaselineLines: entryBaseline.length,
    finalWorktreeLines: finalWorktree.length,
    unexplainedWorktreeLines: unexplained.length
  };
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

const FLAGS = Object.freeze([
  "--run-dir", "--artifacts", "--launch-authority", "--literal-carrier",
  "--run-commitment", "--out"
]);

function parseArguments(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.includes(flag) || value === undefined || parsed.has(flag)) return null;
    parsed.set(flag, value);
  }
  return FLAGS.every((flag) => parsed.has(flag)) ? parsed : null;
}

function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed === null) {
    process.stderr.write(
      "T1_N3_AB_BUILDER_USAGE: --run-dir <dir> --artifacts <dir> "
      + "--launch-authority <file> --literal-carrier <file> "
      + "--run-commitment <64hex> --out <manifest>\n"
    );
    return 3;
  }

  runDir = resolve(parsed.get("--run-dir"));
  artifactsDir = resolve(parsed.get("--artifacts"));
  try {
    if (!statSync(runDir).isDirectory() || !statSync(artifactsDir).isDirectory()) {
      throw new Error("not-a-directory");
    }
  } catch {
    process.stderr.write("T1_N3_AB_BUILDER_DIRECTORIES_UNREADABLE\n");
    return 3;
  }

  runCommitment = parsed.get("--run-commitment");
  if (!/^[0-9a-f]{64}$/.test(runCommitment)) {
    process.stderr.write("T1_N3_AB_BUILDER_RUN_COMMITMENT_MALFORMED\n");
    return 3;
  }
  const epochText = readText(`${PREFIX}run-preflight-epoch.out`);
  if (epochText === null || !/^\d{10,25}\s*$/.test(epochText)) {
    process.stderr.write("T1_N3_AB_BUILDER_RUN_PREFLIGHT_EPOCH_MISSING\n");
    return 3;
  }
  preflightEpochNs = BigInt(epochText.trim());

  const authorityPath = resolve(parsed.get("--launch-authority"));
  let authority;
  try {
    authority = JSON.parse(readFileSync(authorityPath, "utf8"));
  } catch {
    process.stderr.write("T1_N3_AB_BUILDER_LAUNCH_AUTHORITY_UNREADABLE\n");
    return 3;
  }
  if (typeof authority.packetSha256 !== "string" || !/^[0-9a-f]{64}$/.test(authority.packetSha256)) {
    process.stderr.write("T1_N3_AB_BUILDER_LAUNCH_AUTHORITY_MALFORMED\n");
    return 3;
  }

  // The carrier holds the raw generated literals. The builder never copies them
  // into the manifest: it commits to them, so the adjudicator can prove the
  // literal set it was handed is the set this evidence was built against.
  let carrierLiterals = [];
  try {
    carrierLiterals = readFileSync(resolve(parsed.get("--literal-carrier")), "utf8")
      .split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    process.stderr.write("T1_N3_AB_BUILDER_LITERAL_CARRIER_UNREADABLE\n");
    return 3;
  }
  if (carrierLiterals.length === 0) problem("generated-literal-carrier-empty");
  const literalCommitment = createHash("sha256")
    .update(carrierLiterals.join("\n"), "utf8").digest("hex");

  const packetSha256 = authority.packetSha256;
  const integrationCells = [];
  const standaloneCells = [];
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      const suffix = `p${String(pairIndex + 1).padStart(2, "0")}-a${armIndex}-w${workers}`;
      integrationCells.push(loadCell(`integration-${suffix}`, "integration", {
        workers, pairIndex: pairIndex + 1, armIndex, packetSha256
      }));
      standaloneCells.push(loadCell(`standalone-${suffix}`, "standalone", {
        workers, pairIndex: pairIndex + 1, armIndex, packetSha256
      }));
    });
  });
  if (integrationCells.length !== 20) {
    problem("integration-cell-cardinality", { present: integrationCells.length, required: 20 });
  }
  if (standaloneCells.length !== 20) {
    problem("standalone-cell-cardinality", { present: standaloneCells.length, required: 20 });
  }
  assertDistinctIdentity(integrationCells, "integration");
  assertDistinctIdentity(standaloneCells, "standalone");

  const architectureResourceCells = ARCHITECTURE_RESOURCE_CELLS.map((cell) =>
    loadCell(cell.cellId, "architecture", { workers: cell.workers, packetSha256 }));
  const architectureFaultCells = FAULT_CELLS.map((faultName) =>
    loadCell(faultName, "fault", { workers: 3, faultName, packetSha256 }));
  const retainedAllocationControl = loadCell(POSITIVE_CONTROL_CELL_ID, "architecture", {
    workers: 2, packetSha256
  });

  const vitestMutants = VITEST_MUTANTS.map(loadVitestMutant);
  const adjudicatorMutants = ADJUDICATOR_MUTANTS.map(loadAdjudicatorMutant);
  if (vitestMutants.length !== 7) {
    problem("vitest-mutant-cardinality", { present: vitestMutants.length, required: 7 });
  }
  if (adjudicatorMutants.length !== 3) {
    problem("adjudicator-mutant-cardinality", { present: adjudicatorMutants.length, required: 3 });
  }

  const cleanControlStatus = rawStatus(`${PREFIX}adjudicator-clean-self-test.status`, "mutant");
  if (cleanControlStatus !== 0) problem("clean-adjudicator-self-test-did-not-exit-zero");
  const adjudicatorCleanControl = {
    name: "adjudicator-clean-self-test",
    cellId: "adjudicator-clean-self-test",
    stdoutPath: `${PREFIX}adjudicator-clean-self-test.out`,
    stderrPath: `${PREFIX}adjudicator-clean-self-test.err`,
    statusPath: `${PREFIX}adjudicator-clean-self-test.status`,
    rawStatus: cleanControlStatus
  };

  const custody = deriveCustody(authority, authorityPath);
  const inventory = checkInventory();
  const finalizationOrder = checkFinalizationOrder();

  if (problems.length > 0) {
    process.stdout.write(`[T1_N3_AB_MANIFEST_PROBLEMS]${JSON.stringify(problems)}\n`);
    process.stdout.write("CODEX BLOCKED (receipt)\n");
    return 2;
  }

  const manifest = {
    artifact: "T1-3worker-ab-manifest",
    schemaVersion: 2,
    builtBy: "T1-3worker-ab-manifest-builder.mjs",
    packetSha256,
    runCommitment,
    runPreflightEpochNs: preflightEpochNs.toString(),
    runDirectoryName: basename(runDir),
    // Both derivations travel with the evidence: `expected` came from the
    // frozen schedule, `observed` from a directory listing. The adjudicator
    // recomputes `expected` for itself and compares all three.
    inventory: {
      expected: inventory.expected,
      observed: inventory.observed,
      deferred: inventory.deferred
    },
    // Labelled for what it is: the order as it stood BEFORE this builder
    // finished. The adjudicator re-reads the durable order after the builder
    // exits and requires `frozenCellOrder() + manifest-build`; comparing this
    // pre-builder array against that post-builder length would always be off by
    // exactly the builder's own entry.
    preBuilderFinalizationOrder: finalizationOrder,
    launchAuthority: {
      approvedAtUtc: authority.approvedAtUtc ?? null,
      authoritySha256: custody.launchAuthoritySha256
    },
    custody,
    secretScan: {
      // Deliberately NOT the literals. A count and a commitment are enough to
      // bind the adjudicator's carrier to this evidence set without making the
      // durable manifest itself the leak.
      generatedLiteralCount: carrierLiterals.length,
      generatedLiteralCommitmentSha256: literalCommitment
    },
    candidateRssBound: { status: "UNRATIFIED_CANDIDATE" },
    integrationCells,
    architectureResourceCells,
    architectureFaultCells,
    standaloneCells,
    retainedAllocationControl,
    vitestMutants,
    adjudicatorMutants,
    adjudicatorCleanControl
  };

  const outPath = inRun(parsed.get("--out"));
  if (outPath === null) {
    process.stderr.write("T1_N3_AB_BUILDER_OUT_PATH_OUTSIDE_RUN_DIRECTORY\n");
    return 3;
  }
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`[T1_N3_AB_MANIFEST_BUILT]${JSON.stringify({
    manifest: basename(outPath),
    integrationCells: integrationCells.length,
    architectureResourceCells: architectureResourceCells.length,
    architectureFaultCells: architectureFaultCells.length,
    standaloneCells: standaloneCells.length,
    vitestMutants: vitestMutants.length,
    adjudicatorMutants: adjudicatorMutants.length,
    generatedLiteralCount: carrierLiterals.length,
    generatedLiteralCommitmentSha256: literalCommitment
  })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
