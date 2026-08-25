// T1 three-worker A/B — receipt adjudicator and linter.
//
// AUTHORING STATUS: design evidence for `T1-claude-3worker-ab-draft-packet.md`,
// corrected under `T1-claude-3worker-ab-artifact-correction1-packet.md` after
// two independent GPT-5.6 Sol xHigh reviews returned CHANGES REQUESTED.
// Never executed. Requires dual Sol xHigh approval of this exact source and a
// separate V execution approval before any run.
//
// CORRECTIONS IN THIS FILE
//   * `H` and `Q` are RECOMPUTED from the anonymous arm maxima and the eight
//     per-wave queue-dwell maxima; a reported endpoint summary is a claim to be
//     checked, never a value to be used.
//   * the architecture plateau verdict is recomputed from all eight wave
//     readings rather than trusted.
//   * the full-receipt scan covers every stream in the mission logs directory,
//     derived from the directory itself so a manifest cannot omit the stream
//     that leaked.
//   * raw generated literals arrive on a wrapper-owned mode-0600 carrier and
//     never enter a durable manifest; the manifest carries a count and a
//     commitment, both of which must match the carrier.
//   * the SHA whitelist is a frozen list of exact named header lines, not a
//     manifest-expandable shape family.
//   * artifact hashes are bound to the V-approved launch authority for all
//     eight artifacts, including the wrapper and this file.
//
// WHAT THIS PROGRAM IS FOR
// The experiment produces ~50 receipts across four provenance classes. A human
// reading them in order will accept a plausible-looking set: that is exactly how
// the 368.7 MiB Vitest-provenance figure became a policy number, and how a
// queue-signature observation could become a causal claim about the historical
// 973.0/1,264.7 ms runs. So the conclusion is not written by a reader. It is
// computed here, from the receipts, under gates that must all pass BEFORE any
// scientific marker can be emitted, and the gates are themselves mutation-tested.
//
// WHAT IT IS NOT
// It has no bypass flag. There is deliberately no `--force`, no `--skip`, no
// `--only`, no environment escape and no way to downgrade a guard: a guard that
// can be turned off is not a guard, and mutants 8-10 exist precisely to prove
// that removing one is detectable.
//
// It never writes. The only filesystem capability imported below is
// `readFileSync`/`realpathSync`; no write, append, truncate, rename or unlink
// API is in scope anywhere in this file, so "it must never edit inputs" is a
// property of the import list rather than a promise in a comment.
//
// USAGE
//   node <this file> <manifest.json> --literal-carrier <carrier>
//                                        adjudicate one complete evidence set
//   node <this file> --self-test         run in-memory guard fixtures, no I/O
//
// EXIT STATUS
//   0  one lawful scientific marker was emitted (including MIXED/INCONCLUSIVE)
//   2  one lawful `CODEX BLOCKED (...)` marker was emitted
//   3  the adjudicator itself could not run (bad invocation, unreadable input)

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The commitment the manifest records instead of the literals themselves.
 *
 * Computed here from the carrier the wrapper handed us, and compared to the
 * value the manifest builder recorded. Equal means the literal set being
 * scanned is exactly the set this evidence was assembled against; unequal means
 * someone shortened the list between build and adjudication.
 */
function literalCommitment(literals) {
  return createHash("sha256").update(literals.join("\n"), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Frozen design constants.
//
// Every one of these is owned by the adjudicator, not by the manifest. A
// manifest that could declare its own cell order, its own thresholds or its own
// marker mapping would be able to declare its own conclusion.
// ---------------------------------------------------------------------------

/** SHA-256 of the design-stage-approved packet. Also embedded in the harness. */
const EXPECTED_PACKET_SHA256 =
  "a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503";

/** Required HEAD and governed-file custody from packet section 2. */
const EXPECTED_HEAD_COMMIT = "9801f85d97e4263a7c8311304e29d6a03c4a6d15";

const GOVERNED_HASHES = Object.freeze({
  "apps/api/src/index.ts":
    "0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a",
  "apps/api/src/main.ts":
    "4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f",
  "apps/api/src/registration.ts":
    "0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7",
  "packages/crypto/src/index.ts":
    "66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6",
  "packages/crypto/src/argon2-worker.ts":
    "c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b",
  "packages/crypto/src/argon2-worker-pool.ts":
    "b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d",
  "packages/db/src/identity.ts":
    "2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f",
  "packages/register/src/auth-policy.ts":
    "06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52",
  "tests/integration/registration-database.test.ts":
    "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58",
  "tests/unit/registration.test.ts":
    "ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b",
  "tests/unit/argon2-worker-pool.test.ts":
    "93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b",
  "tests/architecture/t1-argon2-worker-contract.test.ts":
    "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1"
});

/**
 * Every artifact the run depends on, including this adjudicator and the wrapper
 * that drove it. A receipt set adjudicated by an unhashed linter, or produced by
 * an unhashed wrapper, proves nothing about which components produced it.
 */
const GOVERNED_ARTIFACT_NAMES = Object.freeze([
  "T1-3worker-ab-booted-rss-harness.mjs",
  "T1-3worker-ab-adjudicator.mjs",
  "T1-3worker-ab-command-matrix.md",
  "T1-3worker-ab-integration.patch",
  "T1-3worker-ab-architecture.patch",
  "T1-3worker-ab-mutation-helper.mjs",
  "T1-3worker-ab-manifest-builder.mjs",
  "run-claude-T1-3worker-ab-diagnostic.sh"
]);

/** The two files the experiment may temporarily edit, and must restore. */
const TEMPORARY_TEST_PATHS = Object.freeze([
  "tests/integration/registration-database.test.ts",
  "tests/architecture/t1-argon2-worker-contract.test.ts"
]);

/**
 * The frozen counterbalanced order. Ten adjacent pairs, alternating which arm
 * runs first, so a monotone host drift (thermal, page-cache, background load)
 * cannot masquerade as a worker-count effect.
 */
const PAIRED_ORDER = Object.freeze(Array.from({ length: 10 }, (_unused, index) =>
  Object.freeze(index % 2 === 0 ? [2, 3] : [3, 2])
));

/** Architecture resource cells: two non-statistical adjacent pairs, 2,3 then 3,2. */
const ARCHITECTURE_RESOURCE_ORDER = Object.freeze([2, 3, 3, 2]);

/** The exact frozen cell identifiers, owned here and never read from input. */
const ARCHITECTURE_RESOURCE_CELL_IDS = Object.freeze([
  "architecture-r1-a0-w2", "architecture-r1-a1-w3",
  "architecture-r2-a0-w3", "architecture-r2-a1-w2"
]);
const POSITIVE_CONTROL_CELL_ID = "positive-control-retain-4mib";

/** The named deterministic three-worker fault cells from packet section 6. */
const FAULT_CELL_NAMES = Object.freeze([
  "fault-unconfirmed-death",
  "fault-late-exit-before-close",
  "fault-close-time-termination-retry-fulfilled"
]);

/** Mutants 1-7 mutate the temporary Vitest sources. */
const VITEST_MUTANT_NAMES = Object.freeze([
  "mutant-01-enqueue-reported-as-dispatch",
  "mutant-02-settlement-reported-as-dispatch",
  "mutant-03-omit-one-credential-job-from-ordinal-map",
  "mutant-04-secretly-keep-two-workers-in-three-worker-cell",
  "mutant-05-harness-control-physical-alive-four",
  "mutant-06-sample-rss-only-after-settlement",
  "mutant-07-skip-one-worker-warm-up"
]);

/** Mutants 8-10 mutate a temporary copy of THIS file at the anchors below. */
const ADJUDICATOR_MUTANT_NAMES = Object.freeze([
  "mutant-08-label-candidate-rss-bound-ratified",
  "mutant-09-map-not-reproduced-to-causal-marker",
  "mutant-10-disable-full-receipt-secret-scan"
]);

/**
 * Stable, unique mutation anchors.
 *
 * Assembled from a prefix rather than written whole, so each complete anchor
 * literal occurs exactly ONCE in this source: in the comment that marks the
 * guarded line. `--self-test` asserts that uniqueness, which is what lets the
 * command matrix perform a byte-exact single-site replacement on a temporary
 * copy without a regex that could silently hit two places.
 */
const ANCHOR_PREFIX = "T1-N3-AB-ANCHOR-";
const ANCHOR_M8 = `${ANCHOR_PREFIX}M8-RSS-LABEL`;
const ANCHOR_M9 = `${ANCHOR_PREFIX}M9-CAUSAL-MARKER`;
const ANCHOR_M10 = `${ANCHOR_PREFIX}M10-SECRET-SCAN`;

/** Published N=3 gate. RED at H > 430 ms, equivalently clamp headroom < 35 ms. */
const PUBLISHED_RED_H_MS = 430;
const PUBLISHED_RED_HEADROOM_MS = 35;

/**
 * Historical severity. STRICTLY stronger than the published gate, and the only
 * condition that licenses talking about the historical 973.0/1,264.7 ms runs.
 * Equivalent to negative clamp headroom under the 600 ms clamp and 3x45 ms
 * cadence: 600 - (465 + 135) = 0.
 */
const HISTORICAL_SEVERITY_H_MS = 465;

/** Co-primary endpoints, Bonferroni-corrected. Both must pass, at 9/10 wins. */
const REQUIRED_WINS = 9;
const BONFERRONI_ALPHA = 0.025;
const CLOPPER_PEARSON_CONFIDENCE = 0.975;

/** Diagnostic abort ceiling ruled by V. A safety stop, not an operator bound. */
const RSS_SAFETY_LIMIT_BYTES = 512 * 1024 * 1024;

/** The only RSS bound label this adjudicator will accept from any receipt. */
const REQUIRED_RSS_BOUND_LABEL = "UNRATIFIED_CANDIDATE";

/** Architecture resource-cell shape from packet section 6. */
const ARCHITECTURE_JOBS_PER_WAVE = 8;
const ARCHITECTURE_WAVE_COUNT = 8;
const PLATEAU_TRIPWIRE_MIB = 2;
const POSITIVE_CONTROL_RETAINED_MIB_PER_WAVE = 4;

/** Standalone limiter geometry, from the governed rate-limit policy. */
const STANDALONE_SLOT_CAPACITY = 1_572_864;
const STANDALONE_SENTINEL_EXPIRY_ENTRIES = 17_301_504;
const STANDALONE_OCCUPANCY_LABELS = Object.freeze(["0", "25", "50", "100"]);
const STANDALONE_REGISTRATIONS = 10;
const STANDALONE_MAX_COST_JOBS = 8;

/** Integration cell shape from packet section 4. */
const INTEGRATION_EXPECTED_OUTCOMES = 24;
const INTEGRATION_MEASURED_WAVES = 8;
const INTEGRATION_SPAN_IDENTITY_TOLERANCE_MS = 2;

/** Receipt markers. One line each, located by prefix. */
const MARKERS = Object.freeze({
  integration: "[T1_N3_AB_INTEGRATION_REPORT]",
  architecture: "[T1_N3_AB_ARCHITECTURE_REPORT]",
  fault: "[T1_N3_AB_FAULT_REPORT]",
  standalone: "[T1_N3_AB_STANDALONE_REPORT]"
});

/** The exactly-four lawful scientific conclusions, verbatim from the packet. */
const SCIENTIFIC_MARKERS = Object.freeze({
  reproduced: "THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS",
  ordinary: "THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED",
  contradicts: "THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS",
  mixed: "THREE-WORKER A/B MIXED OR INCONCLUSIVE"
});

/**
 * Blocked marker precedence, most authoritative first.
 *
 * The order is a dependency order, not a severity ranking. Custody comes first
 * because a receipt from the wrong tree is not evidence of anything. The secret
 * scan comes next because a leak is a fact about the artifacts that survives
 * whatever the science says. Safety precedes science because a breached ceiling
 * invalidates the remaining three-worker cells by rule. Restoration precedes the
 * cell gates because an unrestored governed test poisons every later reading.
 * Receipt completeness precedes normal-cell status because a status cannot be
 * read out of a receipt that is missing, and mutants come last because a mutant
 * verdict is only meaningful once the normal cells are known good.
 */
const BLOCKED_PRECEDENCE = Object.freeze([
  "custody", "secret", "rss-safety", "restoration", "receipt", "normal-cell", "mutant"
]);

function blockedMarker(kind) {
  return `CODEX BLOCKED (${kind})`;
}

// ---------------------------------------------------------------------------
// Failure collection.
//
// A failure carries a guard NAME and a structured, secret-free detail. Detail
// values are numbers, booleans and adjudicator-owned enum strings only: nothing
// read out of a receipt body is ever echoed, because echoing a receipt fragment
// to explain a failure is itself a plausible way to leak the thing the secret
// scan exists to catch.
// ---------------------------------------------------------------------------

function createFailures() {
  const entries = [];
  const seen = new Set();
  return {
    entries,
    add(markerClass, guard, detail = null) {
      if (!BLOCKED_PRECEDENCE.includes(markerClass)) {
        throw new Error("ADJUDICATOR_UNKNOWN_MARKER_CLASS");
      }
      const key = `${markerClass}:${guard}:${JSON.stringify(detail)}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(Object.freeze({ markerClass, guard, detail: sanitizeDetail(detail) }));
    },
    has(guard) {
      return entries.some((entry) => entry.guard === guard);
    },
    dominantClass() {
      for (const markerClass of BLOCKED_PRECEDENCE) {
        if (entries.some((entry) => entry.markerClass === markerClass)) return markerClass;
      }
      return null;
    }
  };
}

/** Numbers, booleans, null and short SCREAMING_SNAKE/kebab labels only. */
function sanitizeDetail(detail) {
  if (detail === null || detail === undefined) return null;
  if (typeof detail === "number" || typeof detail === "boolean") return detail;
  if (typeof detail === "string") {
    return /^[A-Za-z0-9_.:-]{1,64}$/.test(detail) ? detail : "UNPRINTABLE_DETAIL";
  }
  if (Array.isArray(detail)) return detail.map(sanitizeDetail);
  if (typeof detail === "object") {
    return Object.fromEntries(
      Object.entries(detail)
        .filter(([key]) => /^[A-Za-z0-9_]{1,40}$/.test(key))
        .map(([key, value]) => [key, sanitizeDetail(value)])
    );
  }
  return "UNPRINTABLE_DETAIL";
}

// ---------------------------------------------------------------------------
// Exact statistics, implemented here rather than imported.
//
// A third-party statistics package would be an unreviewed dependency inside the
// one component whose whole purpose is to be reviewable. All four quantities the
// packet requires are elementary: a binomial tail, a median, a ratio, and a Beta
// quantile.
// ---------------------------------------------------------------------------

/** Exact integer binomial coefficient. Each division is exact by construction. */
function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0n;
  const smaller = BigInt(Math.min(k, n - k));
  let result = 1n;
  const bigN = BigInt(n);
  for (let step = 0n; step < smaller; step += 1n) {
    result = (result * (bigN - step)) / (step + 1n);
  }
  return result;
}

/**
 * Exact one-sided sign-test probability: P(X >= wins) for X ~ Binomial(n, 1/2).
 *
 * Computed in exact integer arithmetic and divided once, so the canonical
 * 11/1024 = 0.0107421875 for 9 of 10 is reproduced bit-for-bit rather than
 * accumulated through ten floating-point additions.
 */
function oneSidedSignProbability(wins, trials) {
  let tail = 0n;
  for (let k = wins; k <= trials; k += 1) tail += binomialCoefficient(trials, k);
  return Number(tail) / Number(2n ** BigInt(trials));
}

/** Lanczos log-gamma, sufficient for the Beta quantiles used below. */
function logGamma(value) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (value < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let series = 0.99999999999980993;
  for (let index = 0; index < coefficients.length; index += 1) {
    series += coefficients[index] / (shifted + index + 1);
  }
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Modified Lentz continued fraction for the incomplete beta. */
function betaContinuedFraction(a, b, x) {
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;
    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 3e-16) break;
  }
  return result;
}

/** Regularized incomplete beta I_x(a,b). */
function regularizedIncompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Beta quantile by bisection. Monotone, so bisection is exact to 1e-12 here. */
function betaQuantile(probability, a, b) {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    if (regularizedIncompleteBeta(a, b, middle) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Exact Clopper-Pearson interval for a binomial proportion.
 *
 * Exact in the sense that matters: it inverts the binomial tail rather than
 * approximating it normally, so it never produces a two-sided interval that
 * excludes an observed 10/10 or includes a negative lower bound.
 */
function clopperPearsonInterval(successes, trials, confidence) {
  const alpha = 1 - confidence;
  return Object.freeze({
    confidence,
    lower: successes === 0 ? 0 : betaQuantile(alpha / 2, successes, trials - successes + 1),
    upper: successes === trials ? 1 : betaQuantile(1 - alpha / 2, successes + 1, trials - successes)
  });
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[Math.floor(middle)];
}

// ---------------------------------------------------------------------------
// The secret scan.
//
// Scans the COMPLETE captured stdout and stderr of every receipt, ANSI-stripped
// first so a colour escape cannot split a forbidden literal across the pattern.
// Two independent things are looked for: the exact literals the run generated
// (supplied by the wrapper, which is the only component that knows them) and the
// shape-based patterns that catch a leak the wrapper did not anticipate.
// ---------------------------------------------------------------------------

/**
 * CSI and single-character ANSI escape sequences.
 *
 * Written with explicit \u escapes rather than literal control bytes: a raw
 * ESC in this source would trip the repository text-control-byte audit, and a
 * reviewer cannot inspect a control byte they cannot see.
 */
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nqry=><]/g;

function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * The only whitelistable shape: a declared temporary SHA header.
 *
 * Nothing else may be whitelisted, and a whitelist entry that does not match one
 * of these two forms is itself a custody failure rather than a silently ignored
 * line. Without this restriction a wrapper could whitelist an address and the
 * scan would report clean.
 */
/**
 * Site-verified hash normalization. There is no whitelist.
 *
 * A legitimate digest is normalized ONLY where all three of these hold at the
 * exact site it appears: the line matches an approved grammar, the identity in
 * that line is one this adjudicator expects, and the digest equals the exact
 * authority-bound value for that identity. Anything else — including a 64-hex
 * string that merely looks like a hash — survives into the generic scans below
 * and is reported.
 *
 * The previous "declared SHA header" whitelist was the wrong shape: it exempted
 * a FORM, so any line wearing that form passed, and a leaked digest of the same
 * length was indistinguishable from an approved one.
 */
const NORMALIZED = "[T1_N3_AB_APPROVED_DIGEST]";

function normalizeApprovedDigests(text, approvals, failures, label) {
  const lines = text.split("\n");
  const output = lines.map((line) => {
    // `<sha>  <path>` — a shasum receipt line. The path must be an identity we
    // expect, and the digest must be its exact approved value.
    const shasum = /^([0-9a-f]{64})  (\S.*)$/.exec(line);
    if (shasum !== null) {
      const [, digest, identity] = shasum;
      const approved = approvals.digestByIdentity.get(identity)
        ?? approvals.digestByIdentity.get(identity.split("/").pop() ?? "");
      if (approved === undefined) {
        failures.add("custody", "digest-line-names-an-unexpected-identity", {
          cell: label, identity: shortLabel(identity)
        });
        return line;
      }
      if (approved !== digest) {
        failures.add("custody", "digest-line-does-not-match-approved-value", {
          cell: label, identity: shortLabel(identity)
        });
        return line;
      }
      return `${NORMALIZED}  ${identity}`;
    }
    // `<status> <run commitment>` — the exact status grammar.
    const status = /^(\d{1,3}) ([0-9a-f]{64})$/.exec(line);
    if (status !== null) {
      if (status[2] !== approvals.runCommitment) {
        failures.add("receipt", "status-line-not-bound-to-this-run", { cell: label });
        return line;
      }
      return `${status[1]} ${NORMALIZED}`;
    }
    if (line === `RUN_ID=${approvals.runId}`) return `RUN_ID=${NORMALIZED}`;
    if (line === `GENERATED_LITERAL_COMMITMENT=${approvals.literalCommitment}`) {
      return `GENERATED_LITERAL_COMMITMENT=${NORMALIZED}`;
    }
    return line;
  });
  let body = output.join("\n");
  // Structured report fields are checked structurally against the exact
  // approved value before they are normalized, never normalized on shape.
  body = body.split(`"packetSha256":"${approvals.packetSha256}"`)
    .join(`"packetSha256":"${NORMALIZED}"`);
  body = body.split(`"runCommitment":"${approvals.runCommitment}"`)
    .join(`"runCommitment":"${NORMALIZED}"`);
  if (/"packetSha256":"[0-9a-f]{64}"/.test(body)) {
    failures.add("custody", "report-packet-sha-does-not-match-approved-value", { cell: label });
  }
  if (/"runCommitment":"[0-9a-f]{64}"/.test(body)) {
    failures.add("receipt", "report-run-commitment-does-not-match-this-run", { cell: label });
  }
  return body;
}

/**
 * Shape-based forbidden identifier patterns.
 *
 * Each entry is named, so a hit is reported as a guard name and a count and the
 * matched text is never printed.
 */
const FORBIDDEN_PATTERNS = Object.freeze([
  Object.freeze({ name: "email-address", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g }),
  Object.freeze({ name: "request-identifier", pattern: /request[:=][A-Za-z0-9:_-]{2,}/gi }),
  Object.freeze({ name: "job-identifier", pattern: /\bjob[:=][A-Za-z0-9_-]{2,}/gi }),
  Object.freeze({ name: "correlation-identifier", pattern: /correlation[:=][0-9a-f-]{8,}/gi }),
  Object.freeze({ name: "uuid", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi }),
  Object.freeze({ name: "long-hex-digest", pattern: /\b[0-9a-f]{32,}\b/g }),
  Object.freeze({ name: "argon2-encoding", pattern: /\$argon2[id]{1,2}\$/g }),
  Object.freeze({ name: "ipv4-literal", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g }),
  Object.freeze({ name: "ipv6-documentation-literal", pattern: /\b2001:db8:[0-9a-f:]{2,}/gi }),
  Object.freeze({ name: "user-agent-field", pattern: /"?userAgent"?\s*[:=]\s*"[^"]{1,}"/gi }),
  Object.freeze({ name: "verification-token-field", pattern: /"?token"?\s*[:=]\s*"[^"]{1,}"/gi }),
  Object.freeze({ name: "known-test-password", pattern: /correct horse battery staple/g }),
  Object.freeze({ name: "secret-root-path", pattern: /\/[^\s"']*(?:t1-n3-ab-standalone|debateai-s3-registration|secrets)[^\s"']*/g })
]);

/**
 * Scans one receipt body.
 *
 * The whitelist is applied by deleting whole declared header occurrences BEFORE
 * scanning, never by exempting a pattern. That distinction matters: exempting
 * `long-hex-digest` because the packet SHA is legitimately printed would also
 * exempt a leaked password hash of the same shape.
 */
function scanReceiptBody(rawBody, generatedLiterals, normalize) {
  let body = normalize(stripAnsi(rawBody));
  const hits = [];
  for (const literal of generatedLiterals) {
    if (literal.length === 0) continue;
    const occurrences = body.split(literal).length - 1;
    if (occurrences > 0) hits.push(Object.freeze({ kind: "generated-literal", occurrences }));
  }
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    const matches = body.match(new RegExp(pattern.source, pattern.flags));
    if (matches !== null) {
      hits.push(Object.freeze({ kind: "forbidden-pattern", name, occurrences: matches.length }));
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Structural helpers used by the gates.
// ---------------------------------------------------------------------------

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/** Every required field present and of the right primitive kind. */
function missingFields(object, specification) {
  const missing = [];
  for (const [field, kind] of Object.entries(specification)) {
    const value = object?.[field];
    const ok = kind === "number"
      ? isFiniteNumber(value)
      : kind === "integer"
        ? Number.isInteger(value)
        : kind === "boolean"
          ? typeof value === "boolean"
          : kind === "string"
            ? typeof value === "string" && value.length > 0
            : kind === "array"
              ? Array.isArray(value)
              : value !== undefined && value !== null;
    if (!ok) missing.push(field);
  }
  return missing;
}

/** Complete header requirements, identical for every executed cell class. */
const REQUIRED_HEADER_FIELDS = Object.freeze({
  nodeVersion: "string",
  platform: "string",
  arch: "string",
  cpuModel: "string",
  cpuCount: "integer",
  processPid: "integer",
  loadAverageAtStart: "array",
  loadAverageAtEnd: "array",
  swapDelta: "integer",
  majorPageFaultDelta: "integer",
  eventLoopDelayP99Ms: "number",
  eventLoopDelayMaxMs: "number"
});

// ---------------------------------------------------------------------------
// Gate: custody.
// ---------------------------------------------------------------------------

function gateCustody(bundle, failures) {
  const custody = bundle.custody ?? {};
  if (bundle.packetSha256 !== EXPECTED_PACKET_SHA256) {
    failures.add("custody", "packet-sha256-matches-approved-design");
  }
  if (custody.headCommit !== EXPECTED_HEAD_COMMIT) {
    failures.add("custody", "head-commit-frozen");
  }
  if (custody.indexEmpty !== true) {
    failures.add("custody", "git-index-empty");
  }
  const declared = custody.governedHashes ?? {};
  for (const [path, expected] of Object.entries(GOVERNED_HASHES)) {
    if (declared[path] !== expected) {
      failures.add("custody", "governed-file-hash-unchanged", { file: shortLabel(path) });
    }
  }
  if (Object.keys(declared).length !== Object.keys(GOVERNED_HASHES).length) {
    failures.add("custody", "governed-hash-set-complete", {
      declared: Object.keys(declared).length, required: Object.keys(GOVERNED_HASHES).length
    });
  }
  // Every artifact the experiment depends on must be hashed, including this
  // adjudicator: a receipt set adjudicated by an unhashed linter proves nothing
  // about which linter produced the verdict.
  const artifacts = custody.artifactHashes ?? {};
  for (const artifact of GOVERNED_ARTIFACT_NAMES) {
    if (!/^[0-9a-f]{64}$/.test(artifacts[artifact] ?? "")) {
      failures.add("custody", "artifact-hash-recorded", { artifact: shortLabel(artifact) });
    }
  }
  if (Object.keys(artifacts).length !== GOVERNED_ARTIFACT_NAMES.length) {
    failures.add("custody", "artifact-hash-set-complete", {
      declared: Object.keys(artifacts).length, required: GOVERNED_ARTIFACT_NAMES.length
    });
  }
  // The builder is what compares each artifact's recomputed hash to the exact
  // value V approved externally; this records that the comparison happened
  // against a named authority rather than against a 64-hex shape.
  if (!/^[0-9a-f]{64}$/.test(custody.launchAuthoritySha256 ?? "")) {
    failures.add("custody", "launch-authority-hash-recorded");
  }
  if (!/^[0-9a-f]{64}$/.test(bundle.launchAuthority?.authoritySha256 ?? "")
    || bundle.launchAuthority.authoritySha256 !== custody.launchAuthoritySha256) {
    failures.add("custody", "launch-authority-bound-to-this-evidence-set");
  }
  if (custody.processTreeClean !== true) {
    failures.add("custody", "no-surviving-descendant-process");
  }
  if (custody.wrapperBackupsTaken !== true) {
    failures.add("custody", "wrapper-took-cp-p-backups-after-preflight");
  }
}

/** Last path segment only, so a guard detail can never carry a directory. */
function shortLabel(path) {
  const segment = String(path).split("/").pop() ?? "";
  return /^[A-Za-z0-9_.-]{1,64}$/.test(segment) ? segment : "UNPRINTABLE_DETAIL";
}

// ---------------------------------------------------------------------------
// Gate: secret scan over the complete receipt set.
// ---------------------------------------------------------------------------

function gateSecrets(bundle, failures) {
  const scan = bundle.secretScan ?? {};
  // The literals arrive on the mode-0600 wrapper-owned carrier, never from the
  // durable manifest. The manifest carries only a count and a commitment, and
  // both must match the carrier: otherwise the scan could be handed a shorter
  // literal set than the run actually generated and still report clean.
  const literals = bundle.generatedLiterals;
  if (!Array.isArray(literals) || literals.length === 0) {
    failures.add("secret", "generated-literal-carrier-supplied");
    return;
  }
  if (scan.generatedLiteralCount !== literals.length) {
    failures.add("secret", "generated-literal-count-matches-carrier", {
      manifest: scan.generatedLiteralCount ?? -1, carrier: literals.length
    });
  }
  if (scan.generatedLiteralCommitmentSha256 !== bundle.generatedLiteralCommitmentSha256) {
    failures.add("secret", "generated-literal-commitment-matches-carrier");
  }

  // There is no whitelist to validate any more. Approved digests are
  // normalized at their exact verified sites by `normalizeApprovedDigests`,
  // which is built here from the authority-bound identities.
  const approvals = Object.freeze({
    packetSha256: EXPECTED_PACKET_SHA256,
    runCommitment: bundle.runCommitment,
    runId: bundle.runId,
    literalCommitment: bundle.generatedLiteralCommitmentSha256,
    digestByIdentity: new Map([
      ...Object.entries(bundle.custody?.governedHashes ?? {}),
      ...Object.entries(bundle.custody?.artifactHashes ?? {}),
      ...Object.entries(bundle.custody?.artifactHashes ?? {})
        .map(([name, digest]) => [`${MISSION_LOGS_DIR}/${name}`, digest]),
      ...Object.entries(bundle.custody?.governedHashes ?? {})
        .map(([path, digest]) => [path.split("/").pop() ?? path, digest])
    ])
  });

  // EVERY captured stream: preflight, Vitest help, patch and diff, backups,
  // normal cells, faults, the positive control, every mutant, the mutation
  // helper, restoration, final custody, the manifest builder and the manifest's
  // own bytes. The one deliberate exclusion is the literal carrier itself,
  // which by construction contains every literal and is destroyed after
  // adjudication.
  const receipts = bundle.receiptSources;
  const scannable = receipts.filter((receipt) =>
    typeof receipt.stdout === "string" && typeof receipt.stderr === "string");
  let scanned = 0;
  for (const receipt of receipts) {
    // Both streams, complete, every time. Scanning stdout alone is how a leak
    // printed by a failing assertion — which lands on stderr — stays invisible.
    if (typeof receipt.stdout !== "string" || typeof receipt.stderr !== "string") {
      failures.add("receipt", "complete-stdout-and-stderr-captured", {
        cell: shortLabel(receipt.cellId)
      });
      continue;
    }
    const normalize = (text) =>
      normalizeApprovedDigests(text, approvals, failures, shortLabel(receipt.cellId));
    // T1-N3-AB-ANCHOR-M10-SECRET-SCAN
    const hits = scanReceiptBody(`${receipt.stdout}\n${receipt.stderr}`, literals, normalize);
    scanned += 1;
    for (const hit of hits) {
      // A hit is reported by generic guard name and count only. Echoing the
      // matched text to "explain" the failure would publish the very literal
      // the scan exists to keep out of a durable receipt.
      failures.add("secret", hit.kind === "generated-literal"
        ? "no-generated-literal-in-receipt"
        : `no-forbidden-${hit.name}-in-receipt`, {
        cell: shortLabel(receipt.cellId), occurrences: hit.occurrences
      });
    }
  }
  // Integrity of the loop itself: every scannable stream must have been
  // visited. This catches a `continue`, an early `break` or a sliced receipt
  // list. It does NOT catch mutant 10, which leaves the loop intact and empties
  // the hit list — that one is caught by the self-test fixtures, where the
  // planted leak stops being reported and `guard-fires:` fails.
  if (scanned !== scannable.length) {
    failures.add("secret", "full-receipt-secret-scan-executed", {
      scanned, available: scannable.length
    });
  }
  if (bundle.expectedScannableStreams !== undefined
    && scannable.length < bundle.expectedScannableStreams) {
    failures.add("secret", "every-run-stream-present-in-the-scan-set", {
      scanned: scannable.length, available: bundle.expectedScannableStreams
    });
  }
}

// ---------------------------------------------------------------------------
// Gate: RSS safety and the unratified-candidate label.
// ---------------------------------------------------------------------------

function gateRssSafety(bundle, failures) {
  // EVERY actual three-worker Node process: integration cells, architecture
  // resource cells, all three fault cells, the positive control and the
  // standalone series. The previous version validated three of the five
  // classes, so a breach in an integration or fault cell had no gate at all.
  const rssCells = [
    ...bundle.integrationCells,
    ...bundle.architectureResourceCells,
    ...bundle.architectureFaultCells,
    ...bundle.standaloneCells,
    ...(bundle.retainedAllocationControl === null ? [] : [bundle.retainedAllocationControl])
  ];
  for (const cell of rssCells) {
    const report = cell.report ?? {};
    const safety = report.rssSafety ?? {};
    // The observation itself must be provable: which PID was measured, at what
    // cadence, and with what evidence. A breach flag from a cell that never
    // sampled is not a safety verdict.
    if (!isNonNegativeInteger(safety.measuredPid) || safety.measuredPid <= 0) {
      failures.add("rss-safety", "rss-observer-identifies-the-measured-pid", {
        cell: shortLabel(cell.cellId)
      });
    }
    if (!isFiniteNumber(safety.sampleIntervalMs) || safety.sampleIntervalMs > 5) {
      failures.add("rss-safety", "rss-observed-at-five-millisecond-cadence-or-faster", {
        cell: shortLabel(cell.cellId)
      });
    }
    if (!Array.isArray(safety.peakSampleBytes) || safety.peakSampleBytes.length === 0) {
      failures.add("rss-safety", "rss-peak-samples-preserved", { cell: shortLabel(cell.cellId) });
    }
    if (safety.limitBytes !== RSS_SAFETY_LIMIT_BYTES) {
      failures.add("rss-safety", "safety-ceiling-is-the-ruled-512-mib", {
        cell: shortLabel(cell.cellId)
      });
    }
    if (safety.rssSafetyExceeded === true) {
      failures.add("rss-safety", "no-cell-crossed-the-512-mib-ceiling", {
        cell: shortLabel(cell.cellId)
      });
    }
    if (isFiniteNumber(safety.peakBytes) && safety.peakBytes > RSS_SAFETY_LIMIT_BYTES) {
      failures.add("rss-safety", "no-cell-peak-crossed-the-512-mib-ceiling", {
        cell: shortLabel(cell.cellId)
      });
    }
    // T1-N3-AB-ANCHOR-M8-RSS-LABEL
    if (report.rssBoundStatus !== REQUIRED_RSS_BOUND_LABEL) {
      failures.add("rss-safety", "every-rss-bound-labelled-unratified-candidate", {
        cell: shortLabel(cell.cellId)
      });
    }
  }
  if (bundle.candidateRssBound?.status !== undefined
    && bundle.candidateRssBound.status !== REQUIRED_RSS_BOUND_LABEL) {
    failures.add("rss-safety", "aggregate-candidate-bound-labelled-unratified-candidate");
  }
}

// ---------------------------------------------------------------------------
// Gate: restoration of the two temporarily edited governed tests.
// ---------------------------------------------------------------------------

function gateRestoration(bundle, failures) {
  const restorations = bundle.custody?.temporaryTests ?? {};
  for (const path of TEMPORARY_TEST_PATHS) {
    const record = restorations[path];
    if (record === undefined) {
      failures.add("restoration", "temporary-test-restoration-recorded", { file: shortLabel(path) });
      continue;
    }
    if (record.restoredSha256 !== GOVERNED_HASHES[path]) {
      failures.add("restoration", "temporary-test-restored-to-governed-hash", {
        file: shortLabel(path)
      });
    }
    if (record.backupSha256 !== GOVERNED_HASHES[path]) {
      failures.add("restoration", "temporary-test-backup-taken-from-governed-source", {
        file: shortLabel(path)
      });
    }
    if (record.cmpIdentical !== true) {
      failures.add("restoration", "temporary-test-cmp-byte-identical", { file: shortLabel(path) });
    }
    if (!isNonNegativeInteger(record.sizeBytes) || typeof record.mtimeIso !== "string") {
      failures.add("restoration", "temporary-test-size-and-mtime-recorded", {
        file: shortLabel(path)
      });
    }
    if (!/^[0-9a-f]{64}$/.test(record.temporaryDiffSha256 ?? "")) {
      failures.add("restoration", "temporary-diff-preserved-and-hashed", { file: shortLabel(path) });
    }
  }
}

// ---------------------------------------------------------------------------
// Gate: the closed inventory and the cell finalization order.
// ---------------------------------------------------------------------------

function gateInventory(bundle, failures) {
  const inventory = bundle.inventory;
  if (inventory === undefined) {
    failures.add("receipt", "closed-inventory-present");
    return;
  }
  const expected = new Set(inventory.expected);
  const declaredExpected = new Set(inventory.declaredExpected);
  const declaredObserved = new Set(inventory.declaredObserved);
  const deferred = new Set(inventory.deferred);

  // Two independent derivations of the expected set must agree exactly.
  for (const name of expected) {
    if (!declaredExpected.has(name)) {
      failures.add("receipt", "builder-expected-inventory-omits-a-required-stream",
        { receipt: shortLabel(name) });
    }
  }
  for (const name of declaredExpected) {
    if (!expected.has(name)) {
      failures.add("receipt", "builder-expected-inventory-adds-an-unknown-stream",
        { receipt: shortLabel(name) });
    }
  }

  // The observed set must be the expected set, less only the two streams that
  // could not exist while the builder was running.
  for (const name of expected) {
    if (deferred.has(name)) continue;
    if (!declaredObserved.has(name)) {
      failures.add("receipt", "observed-inventory-missing-a-required-stream",
        { receipt: shortLabel(name) });
    }
  }
  for (const name of declaredObserved) {
    if (!expected.has(name)) {
      failures.add("receipt", "observed-inventory-contains-an-unexpected-stream",
        { receipt: shortLabel(name) });
    }
  }

  // The deferred streams DO have to exist by now: this adjudicator runs after
  // the builder finished, so their absence is a receipt failure, not a race.
  // It is lawful for the builder to have labelled its own status and the
  // manifest deferred — neither existed while it ran. It is NOT lawful for them
  // to be missing now: this adjudicator runs after the builder exited, so both
  // must be present, fresh and run-bound.
  for (const name of deferred) {
    if (name === `${RECEIPT_PREFIX}manifest.json`) continue;
    const entry = bundle.auxiliaryReceipts.find((candidate) => candidate.cellId === name);
    if (entry === undefined || entry.missing === true) {
      failures.add("receipt", "deferred-inventory-stream-never-appeared",
        { receipt: shortLabel(name) });
      continue;
    }
    if (name.endsWith(".status")
      && !new RegExp(`^\\d{1,3} ${bundle.runCommitment}\\s*$`).test(entry.stdout ?? "")) {
      failures.add("receipt", "deferred-status-not-complete-and-run-bound",
        { receipt: shortLabel(name) });
    }
  }
  if (bundle.preBuilderFinalizationOrder.length !== frozenCellOrder().length) {
    failures.add("receipt", "pre-builder-order-is-the-frozen-cell-order", {
      observed: bundle.preBuilderFinalizationOrder.length
    });
  }
  for (const entry of bundle.auxiliaryReceipts) {
    if (entry.missing === true && !deferred.has(entry.cellId)) {
      failures.add("receipt", "inventory-stream-unreadable", { receipt: shortLabel(entry.cellId) });
    }
  }

  // Finalization order: a total order over the run, compared to the frozen one
  // plus the manifest-builder step the wrapper appends after the builder exits.
  const expectedOrder = [...frozenCellOrder(), "manifest-build"];
  const observedOrder = bundle.finalizationOrder;
  if (observedOrder.length !== expectedOrder.length) {
    failures.add("receipt", "finalization-order-length", {
      observed: observedOrder.length, expected: expectedOrder.length
    });
    return;
  }
  expectedOrder.forEach((cell, index) => {
    if (observedOrder[index] !== cell) {
      failures.add("receipt", "finalization-order-mismatch", { position: index });
    }
  });
}

// ---------------------------------------------------------------------------
// Gate: receipt completeness and exact cell order.
// ---------------------------------------------------------------------------

function gateReceiptCompleteness(bundle, failures) {
  // Twenty integration cells, ten adjacent pairs, alternating first arm.
  const integration = bundle.integrationCells;
  if (integration.length !== 20) {
    failures.add("receipt", "twenty-integration-cells-present", { present: integration.length });
  }
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      const position = pairIndex * 2 + armIndex;
      const cell = integration[position];
      if (cell === undefined) return;
      if (cell.workers !== workers || cell.pairIndex !== pairIndex + 1 || cell.armIndex !== armIndex) {
        failures.add("receipt", "integration-cells-in-frozen-counterbalanced-order", {
          position, expectedWorkers: workers
        });
      }
    });
  });

  // Four architecture resource cells in exact order 2,3,3,2.
  const architecture = bundle.architectureResourceCells;
  if (architecture.length !== ARCHITECTURE_RESOURCE_ORDER.length) {
    failures.add("receipt", "four-architecture-resource-cells-present", {
      present: architecture.length
    });
  }
  ARCHITECTURE_RESOURCE_ORDER.forEach((workers, position) => {
    const cell = architecture[position];
    if (cell !== undefined && cell.workers !== workers) {
      failures.add("receipt", "architecture-resource-cells-in-exact-2-3-3-2-order", {
        position, expectedWorkers: workers
      });
    }
  });

  // Twenty standalone RSS cells in the same ten-pair AB/BA order.
  const standalone = bundle.standaloneCells;
  if (standalone.length !== 20) {
    failures.add("receipt", "twenty-standalone-rss-cells-present", { present: standalone.length });
  }
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      const position = pairIndex * 2 + armIndex;
      const cell = standalone[position];
      if (cell === undefined) return;
      if (cell.workers !== workers || cell.pairIndex !== pairIndex + 1 || cell.armIndex !== armIndex) {
        failures.add("receipt", "standalone-cells-in-frozen-ab-ba-x5-order", {
          position, expectedWorkers: workers
        });
      }
    });
  });

  // Named fault cells, all present, none renamed.
  const faultNames = bundle.architectureFaultCells.map((cell) => cell.faultName);
  for (const name of FAULT_CELL_NAMES) {
    if (!faultNames.includes(name)) {
      failures.add("receipt", "named-fault-cell-present", { fault: name });
    }
  }
  if (faultNames.length !== FAULT_CELL_NAMES.length) {
    failures.add("receipt", "exactly-the-named-fault-cells-present", { present: faultNames.length });
  }

  // Retained-allocation positive control.
  if (bundle.retainedAllocationControl === null) {
    failures.add("receipt", "retained-allocation-positive-control-present");
  }

  // Mutants 1-10 and the clean adjudicator control.
  const vitestNames = bundle.vitestMutants.map((mutant) => mutant.name);
  for (const name of VITEST_MUTANT_NAMES) {
    if (!vitestNames.includes(name)) failures.add("receipt", "vitest-mutant-present", { mutant: name });
  }
  const adjudicatorNames = bundle.adjudicatorMutants.map((mutant) => mutant.name);
  for (const name of ADJUDICATOR_MUTANT_NAMES) {
    if (!adjudicatorNames.includes(name)) {
      failures.add("receipt", "adjudicator-mutant-present", { mutant: name });
    }
  }
  if (bundle.adjudicatorCleanControl === null) {
    failures.add("receipt", "clean-adjudicator-control-present");
  }

  // Every executed cell must carry a complete header and a raw status byte.
  for (const cell of bundle.allExecutedCells) {
    if (!isNonNegativeInteger(cell.rawStatus)) {
      failures.add("receipt", "raw-exit-status-captured", { cell: shortLabel(cell.cellId) });
    }
    if (cell.report === null || cell.report === undefined) {
      failures.add("receipt", "exactly-one-report-marker-line-in-stdout", {
        cell: shortLabel(cell.cellId)
      });
      continue;
    }
    const missing = missingFields(cell.report.header, REQUIRED_HEADER_FIELDS);
    if (missing.length > 0) {
      failures.add("receipt", "complete-cell-header-captured", {
        cell: shortLabel(cell.cellId), missing: missing.length
      });
    }
    if (cell.report.packetSha256 !== EXPECTED_PACKET_SHA256) {
      failures.add("custody", "cell-embedded-packet-token-matches", {
        cell: shortLabel(cell.cellId)
      });
    }
    // Supervised identity binding. `process.pid` alone proves nothing — any
    // process can print one. These three came from the wrapper's setsid()
    // through inherited environment, so a report cannot claim membership of a
    // group it was never placed in, and the wrapper's own process-identity
    // receipt (parsed by the builder) must name the same triple for this cell.
    const supervised = {
      pid: cell.report.supervisedPid,
      pgid: cell.report.supervisedPgid,
      sid: cell.report.supervisedSid
    };
    if (!isNonNegativeInteger(supervised.pid) || supervised.pid <= 0
      || supervised.pgid !== supervised.pid || supervised.sid !== supervised.pid) {
      failures.add("custody", "cell-report-carries-supervised-identity", {
        cell: shortLabel(cell.cellId)
      });
    } else if (cell.report.header?.processPid !== supervised.pid) {
      failures.add("custody", "cell-report-process-is-the-supervised-leader", {
        cell: shortLabel(cell.cellId)
      });
    }
    const recorded = bundle.custody?.processIdentity?.[cell.cellId];
    if (recorded === undefined) {
      failures.add("custody", "wrapper-recorded-an-identity-for-this-cell", {
        cell: shortLabel(cell.cellId)
      });
    } else if (recorded.pid !== supervised.pid || recorded.pgid !== supervised.pgid
      || recorded.sid !== supervised.sid) {
      failures.add("custody", "cell-report-identity-matches-wrapper-receipt", {
        cell: shortLabel(cell.cellId)
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoint recomputation.
//
// The first draft read `endpoints.H` and `endpoints.Q` out of the receipt. That
// makes the two numbers the entire conclusion turns on operator-writable: a cell
// could report component maxima that say one thing and a summary that says
// another, and only the summary would ever be read. So both are recomputed here
// from the anonymous components, and the reported summary is treated as a claim
// to be checked rather than a value to be used.
//
//   H = max(existing-arm provision maximum, missing-arm provision maximum)
//   Q = median of the eight N=3 per-wave credential queue-dwell maxima
//
// A receipt that carries the components and disagrees with its own summary is a
// normal-cell failure, not a rounding difference to be tolerated.
// ---------------------------------------------------------------------------

const ENDPOINT_SUMMARY_TOLERANCE_MS = 0.01;

function recomputedEndpoints(report, failures, label) {
  const arms = report.arms ?? {};
  const existing = arms.existingProvisionMaxMs;
  const missing = arms.missingProvisionMaxMs;
  if (!isFiniteNumber(existing) || !isFiniteNumber(missing)) {
    failures.add("normal-cell", "arm-provision-maxima-present-for-h-recomputation", { cell: label });
    return null;
  }
  const waves = report.spans?.perWave;
  if (!Array.isArray(waves) || waves.length !== INTEGRATION_MEASURED_WAVES) {
    failures.add("normal-cell", "eight-measured-n3-wave-summaries-present", { cell: label });
    return null;
  }
  const dwellMaxima = waves.map((wave) => wave?.maxQueueDwellMs);
  if (!dwellMaxima.every(isFiniteNumber)) {
    failures.add("normal-cell", "per-wave-queue-dwell-maxima-present-for-q-recomputation", {
      cell: label
    });
    return null;
  }
  const H = Math.max(existing, missing);
  const Q = median(dwellMaxima);
  const clampHeadroomMs = 600 - (H + 3 * 45);

  const reported = report.endpoints ?? {};
  for (const [field, recomputed] of [["H", H], ["Q", Q], ["clampHeadroomMs", clampHeadroomMs]]) {
    if (!isFiniteNumber(reported[field])) {
      failures.add("normal-cell", "co-primary-endpoints-reported", { cell: label, field });
      continue;
    }
    if (Math.abs(reported[field] - recomputed) > ENDPOINT_SUMMARY_TOLERANCE_MS) {
      failures.add("normal-cell", "reported-endpoint-matches-recomputed-components", {
        cell: label, field
      });
    }
  }
  return Object.freeze({ H, Q, clampHeadroomMs });
}

// ---------------------------------------------------------------------------
// Gate: normal-cell status, non-vacuity, functional and opacity invariants.
// ---------------------------------------------------------------------------

function gateNormalCells(bundle, failures) {
  // 1. Raw status. Every NORMAL cell must have exited 0. Mutants are handled
  //    separately, because a mutant that exits 0 is the failure there.
  for (const cell of bundle.allExecutedCells) {
    if (cell.rawStatus !== 0) {
      failures.add("normal-cell", "normal-cell-raw-status-zero", {
        cell: shortLabel(cell.cellId), status: cell.rawStatus
      });
    }
  }

  // 2. Distinct process and PostgreSQL evidence. Twenty integration cells that
  //    shared a process or a database are twenty readings of one experiment.
  assertDistinctProcessEvidence(bundle.integrationCells, "integration", failures);
  assertDistinctProcessEvidence(bundle.standaloneCells, "standalone", failures);

  // 3. Integration cells: worker-count honesty, queue/active non-vacuity,
  //    drains, functional outcomes and opacity.
  for (const cell of bundle.integrationCells) {
    const report = cell.report;
    if (report === null || report === undefined) continue;
    const label = shortLabel(cell.cellId);
    const pool = report.pool ?? {};
    if (pool.requestedWorkers !== cell.workers
      || pool.readyWorkers !== cell.workers
      || pool.distinctNonMainThreadCount !== cell.workers
      || pool.maxActive !== cell.workers) {
      failures.add("normal-cell", "requested-workers-equal-ready-threads-and-max-active", {
        cell: label, expected: cell.workers
      });
    }
    if (pool.mainThreadFallback !== false) {
      failures.add("normal-cell", "no-main-thread-kdf-fallback", { cell: label });
    }
    // Two-worker N=3 waves must show three outstanding credential jobs AND at
    // least one queued credential; three-worker waves must show three active.
    // Without this the sign test could be comparing two pools that never queued.
    if (cell.workers === 2) {
      if (pool.maxOutstandingCredential !== 3 || pool.maxQueuedCredential < 1) {
        failures.add("normal-cell", "two-worker-n3-wave-reaches-three-outstanding-and-a-queue", {
          cell: label
        });
      }
    } else if (pool.maxActiveCredential !== 3) {
      failures.add("normal-cell", "three-worker-n3-wave-reaches-three-active-credentials", {
        cell: label
      });
    }
    const outcomes = report.outcomes ?? {};
    if (outcomes.expected !== INTEGRATION_EXPECTED_OUTCOMES
      || outcomes.observed !== INTEGRATION_EXPECTED_OUTCOMES) {
      failures.add("normal-cell", "exact-24-of-24-registration-outcomes", { cell: label });
    }
    const errors = report.gates?.errors ?? {};
    for (const kind of [
      "timeout", "capacity", "worker", "unhandled", "postgres", "secretCapture", "custody"
    ]) {
      if (errors[kind] !== 0) {
        failures.add("normal-cell", "zero-classified-errors-in-normal-cell", {
          cell: label, kind
        });
      }
    }
    for (const gate of ["opacity", "response", "durableRows", "drain"]) {
      if (report.gates?.[gate] !== true) {
        failures.add("normal-cell", "functional-and-opacity-gates-green", { cell: label, gate });
      }
    }
    const drains = report.drains ?? {};
    if (drains.mail !== true || drains.refusal !== true || drains.ordinalMapEmptyAfterDrain !== true) {
      failures.add("normal-cell", "mail-refusal-and-ordinal-map-drained", { cell: label });
    }
    // The three spans are one arithmetic identity. If enqueue-to-settle is not
    // queue dwell plus the dispatch-to-settle service envelope, one of the three
    // seams stamped the wrong instant, and mutants 1 and 2 are exactly that.
    const skew = report.spans?.identityMaxSkewMs;
    if (!isFiniteNumber(skew) || Math.abs(skew) > INTEGRATION_SPAN_IDENTITY_TOLERANCE_MS) {
      failures.add("normal-cell", "enqueue-dispatch-settle-arithmetic-identity-within-2ms", {
        cell: label
      });
    }
    if (report.spans?.creditedJobsWithExactlyOneEnqueueDispatchSettle !== true) {
      failures.add("normal-cell", "every-credential-job-enqueued-dispatched-and-settled-once", {
        cell: label
      });
    }
    // Recomputed from components, then written back onto the cell so the
    // comparison below reads the derived value and never the reported summary.
    const derived = recomputedEndpoints(report, failures, label);
    if (derived === null) continue;
    cell.derivedEndpoints = derived;
  }

  // 4. Architecture resource cells: eight jobs, eight waves, plateau tripwire,
  //    lifecycle truthfulness.
  for (const cell of bundle.architectureResourceCells) {
    gateArchitectureResourceCell(cell, failures, { positiveControl: false });
  }
  if (bundle.retainedAllocationControl !== null) {
    gateArchitectureResourceCell(bundle.retainedAllocationControl, failures, {
      positiveControl: true
    });
  }

  // 5. Named fault cells: the split conclusions of packet section 6.
  for (const cell of bundle.architectureFaultCells) {
    gateFaultCell(cell, failures);
  }

  // 6. Standalone cells: exact occupancy and RSS provenance.
  for (const cell of bundle.standaloneCells) {
    gateStandaloneCell(cell, failures);
  }
}

function assertDistinctProcessEvidence(cells, className, failures) {
  const pids = new Set();
  const postgresPorts = new Set();
  for (const cell of cells) {
    const header = cell.report?.header;
    if (header === undefined) continue;
    if (pids.has(header.processPid)) {
      failures.add("normal-cell", "every-cell-is-a-distinct-fresh-process", {
        class: className, cell: shortLabel(cell.cellId)
      });
    }
    pids.add(header.processPid);
    const port = header.postgresPort;
    if (port !== undefined) {
      if (postgresPorts.has(port)) {
        failures.add("normal-cell", "every-cell-owns-a-distinct-embedded-postgres", {
          class: className, cell: shortLabel(cell.cellId)
        });
      }
      postgresPorts.add(port);
    } else {
      failures.add("normal-cell", "embedded-postgres-evidence-recorded", {
        class: className, cell: shortLabel(cell.cellId)
      });
    }
  }
}

function gateArchitectureResourceCell(cell, failures, options) {
  const report = cell.report;
  const label = shortLabel(cell.cellId);
  if (report === null || report === undefined) {
    failures.add("normal-cell", "architecture-resource-report-present", { cell: label });
    return;
  }
  if (report.jobsPerWave !== ARCHITECTURE_JOBS_PER_WAVE) {
    failures.add("normal-cell", "eight-maximum-cost-jobs-per-wave", { cell: label });
  }
  if (!Array.isArray(report.perWave) || report.perWave.length !== ARCHITECTURE_WAVE_COUNT) {
    failures.add("normal-cell", "eight-identical-waves-recorded", { cell: label });
  }
  const warmUp = report.warmUp ?? {};
  if (warmUp.warmedWorkers !== cell.workers || warmUp.maxActiveDuringWarmUp !== cell.workers) {
    failures.add("normal-cell", "every-worker-warmed-before-baseline", {
      cell: label, expected: cell.workers
    });
  }
  const threads = report.threads ?? {};
  if (threads.distinctNonMainThreadCount !== cell.workers || threads.mainThreadFallback !== false) {
    failures.add("normal-cell", "exact-distinct-thread-ids-and-no-fallback", {
      cell: label, expected: cell.workers
    });
  }
  // In-flight sampling at 5 ms. A cell that only sampled after settlement (mutant
  // 6) reports a peak that is indistinguishable from its quiescent reading.
  const inFlight = report.inFlight ?? {};
  if (inFlight.sampleIntervalMs !== 5 || !isNonNegativeInteger(inFlight.sampleCount)
    || inFlight.sampleCount < 1) {
    failures.add("normal-cell", "rss-sampled-every-5ms-while-jobs-in-flight", { cell: label });
  }
  // The whole-process RSS story must be complete: a baseline to compare
  // against, a settled reading, a post-close reading and a measured close
  // latency. A cell missing any of them is not a resource observation.
  for (const field of [
    "baselineRssBytes", "settledRssBytes", "postCloseRssBytes", "closeLatencyMs"
  ]) {
    if (!isFiniteNumber(report[field])) {
      failures.add("normal-cell", "complete-rss-and-close-latency-evidence", {
        cell: label, field
      });
    }
  }
  const quiescentReadings = [];
  if (Array.isArray(report.perWave)) {
    for (const wave of report.perWave) {
      if (!isFiniteNumber(wave?.inFlightPeakRssBytes) || !isFiniteNumber(wave?.quiescentRssBytes)) {
        failures.add("normal-cell", "per-wave-in-flight-peak-and-quiescent-rss-recorded", {
          cell: label
        });
        break;
      }
      quiescentReadings.push(wave.quiescentRssBytes);
      if (wave.jobCount !== ARCHITECTURE_JOBS_PER_WAVE) {
        failures.add("normal-cell", "identical-eight-job-work-in-every-wave", { cell: label });
        break;
      }
      if (!isFiniteNumber(wave.eventLoopProgressTicks) || wave.eventLoopProgressTicks <= 0) {
        failures.add("normal-cell", "event-loop-progressed-during-every-wave", { cell: label });
        break;
      }
      if (wave.maxActive !== cell.workers
        || wave.maxOutstanding !== ARCHITECTURE_JOBS_PER_WAVE
        || wave.maxQueued < ARCHITECTURE_JOBS_PER_WAVE - cell.workers) {
        failures.add("normal-cell", "wave-reaches-full-occupancy-and-expected-queue", {
          cell: label, expectedWorkers: cell.workers
        });
        break;
      }
    }
  }
  const plateau = report.plateau ?? {};
  if (plateau.tripwireMib !== PLATEAU_TRIPWIRE_MIB) {
    failures.add("normal-cell", "unchanged-2-mib-last-four-wave-plateau-tripwire", { cell: label });
  }
  // The plateau verdict is RECOMPUTED from all eight quiescent readings. The
  // reported spread and the reported RED are claims: a cell that measured a
  // growing working set and reported `red: false` is exactly the failure the
  // positive control exists to make visible, and trusting the flag would make
  // that control decorative.
  if (quiescentReadings.length === ARCHITECTURE_WAVE_COUNT) {
    const lastFour = quiescentReadings.slice(-4);
    const spreadMib = (Math.max(...lastFour) - Math.min(...lastFour)) / 1048576;
    if (!isFiniteNumber(plateau.lastFourWaveSpreadMib)
      || Math.abs(plateau.lastFourWaveSpreadMib - spreadMib) > 0.01) {
      failures.add("normal-cell", "reported-plateau-spread-matches-recomputed-waves", {
        cell: label
      });
    }
    if (plateau.red !== (spreadMib > PLATEAU_TRIPWIRE_MIB)) {
      failures.add("normal-cell", "reported-plateau-verdict-matches-recomputed-waves", {
        cell: label
      });
    }
  }
  if (options.positiveControl) {
    // The positive control exists to prove the detector can still go RED. A
    // control that stays green means the tripwire is measuring nothing.
    if (report.retainedMibPerWave !== POSITIVE_CONTROL_RETAINED_MIB_PER_WAVE) {
      failures.add("normal-cell", "positive-control-retains-4-mib-per-wave", { cell: label });
    }
    if (plateau.red !== true) {
      failures.add("normal-cell", "positive-control-drives-plateau-detector-red", { cell: label });
    }
    return;
  }
  if (plateau.red !== false) {
    failures.add("normal-cell", "ordinary-resource-cell-plateau-not-red", { cell: label });
  }
  const lifecycle = report.lifecycle ?? {};
  if (lifecycle.state !== "CLOSED" || lifecycle.liveHandles !== 0 || lifecycle.retiringHandles !== 0
    || lifecycle.queued !== 0 || lifecycle.outstanding !== 0) {
    failures.add("normal-cell", "ordinary-resource-cell-closes-with-zero-handles", { cell: label });
  }
  if (lifecycle.restarts !== 0) {
    failures.add("normal-cell", "no-restart-in-an-ordinary-resource-cell", { cell: label });
  }
  // Close-initiation to teardown-complete is REPORTED, not thresholded. The
  // previous version derived a "prompt exit" from whole-workload elapsed time,
  // which measured the workload rather than the exit, and then compared it to a
  // bound V has never ratified. A hang is caught by the wrapper's bounded cell
  // timeout and custody path; this adjudicator invents no scientific threshold.
  if (!isFiniteNumber(lifecycle.closeInitiationToTeardownCompleteMs)) {
    failures.add("normal-cell", "close-initiation-duration-measured", { cell: label });
  }
}

function gateFaultCell(cell, failures) {
  const report = cell.report;
  const label = shortLabel(cell.faultName ?? cell.cellId);
  if (report === null || report === undefined) {
    failures.add("normal-cell", "fault-cell-report-present", { fault: label });
    return;
  }
  // Common to every fault cell: the pool never owns a fourth handle, and the
  // fixture never observes a fourth physically alive thread.
  if (!isNonNegativeInteger(report.maxLiveHandles) || report.maxLiveHandles > 3
    || !isNonNegativeInteger(report.maxPhysicallyAlive) || report.maxPhysicallyAlive > 3) {
    failures.add("normal-cell", "live-and-physical-handles-never-exceed-three", { fault: label });
  }
  if (report.settledExactlyOnce !== true) {
    failures.add("normal-cell", "timeout-breaker-and-close-settle-once", { fault: label });
  }
  // Fixture integrity. A fault cell that pre-completed its job, cleaned up by
  // hand after `close()`, rewrote its own outcome or manufactured a count is
  // reporting a scenario it never ran. Each of these is asserted by the fixture
  // and checked here, because a vacuous fixture passes every other gate.
  if (report.jobHeldAcrossFaultAndClose !== true) {
    failures.add("normal-cell", "fault-job-held-across-fault-and-close", { fault: label });
  }
  if (report.precompletedJob !== false) {
    failures.add("normal-cell", "fault-does-not-substitute-a-precompleted-job", { fault: label });
  }
  if (report.manualPostCloseCleanup !== false) {
    failures.add("normal-cell", "fault-does-not-clean-up-by-hand-after-close", { fault: label });
  }
  if (report.outcomeRewritten !== false) {
    failures.add("normal-cell", "fault-does-not-rewrite-its-own-close-outcome", { fault: label });
  }
  if (!isNonNegativeInteger(report.terminationAttempts)) {
    failures.add("normal-cell", "fault-records-termination-attempt-count", { fault: label });
  }
  if (!isNonNegativeInteger(report.restartsInWindow)) {
    failures.add("normal-cell", "fault-records-restart-count", { fault: label });
  }
  switch (cell.faultName) {
    case "fault-unconfirmed-death":
      // Unconfirmed death is a statement about the OBSERVATION, not the thread.
      // It must fail closed and keep counting the handle it could not account
      // for; a cell that reports a clean close here is claiming zero handles for
      // a thread that may still hold a 64 MiB arena.
      if (report.breakerTripped !== true || report.closeRejectedTyped !== true
        || report.replacementsSpawned !== 0
        || !(report.retainedLiveHandles > 0 || report.retainedRetiringHandles > 0)) {
        failures.add("normal-cell", "unconfirmed-death-fails-closed-and-retains-custody", {
          fault: label
        });
      }
      break;
    case "fault-late-exit-before-close":
      if (report.replacementsSpawned !== 1 || report.finalLiveHandles !== 0
        || report.finalRetiringHandles !== 0) {
        failures.add("normal-cell", "late-exit-permits-exactly-one-replacement-then-zero-handles", {
          fault: label
        });
      }
      break;
    case "fault-close-time-termination-retry-fulfilled":
      if (report.closeRejectedTyped !== false || report.finalLiveHandles !== 0
        || report.finalRetiringHandles !== 0 || report.replacementsSpawned !== 0) {
        failures.add("normal-cell", "fulfilled-close-retry-permits-clean-close-then-zero-handles", {
          fault: label
        });
      }
      break;
    default:
      failures.add("receipt", "fault-cell-name-recognised", { fault: label });
  }
}

function gateStandaloneCell(cell, failures) {
  const report = cell.report;
  const label = shortLabel(cell.cellId);
  if (report === null || report === undefined) {
    failures.add("normal-cell", "standalone-report-present", { cell: label });
    return;
  }
  // Provenance is the entire point of this cell class. A Vitest-process or
  // pool-only number cannot substitute for it, so a mislabelled provenance is a
  // hard failure rather than a note.
  if (report.provenanceClass !== "STANDALONE_BOOTED_PROCESS") {
    failures.add("normal-cell", "standalone-cell-declares-booted-process-provenance", {
      cell: label
    });
  }
  if (report.outcome !== "COMPLETE") {
    failures.add("normal-cell", "standalone-cell-completed", { cell: label });
  }
  if (report.workerCount !== cell.workers) {
    failures.add("normal-cell", "standalone-cell-selected-count-matches-order", {
      cell: label, expected: cell.workers
    });
  }
  // Every RSS number this class contributes must be a finite measurement. A
  // missing field would otherwise arrive at `Math.max(...)` as `undefined` and
  // silently become the candidate bound.
  for (const field of [
    "baselineRssBytes", "settledRssBytes", "postCloseRssBytes", "peakRssBytes"
  ]) {
    if (!isFiniteNumber(report[field])) {
      failures.add("normal-cell", "standalone-rss-readings-finite", { cell: label, field });
    }
  }
  if (report.cleanupOk !== true) {
    failures.add("normal-cell", "standalone-cleanup-reported-successful", { cell: label });
  }
  if (report.durablePendingUsers !== STANDALONE_REGISTRATIONS
    || report.verificationMailCount !== STANDALONE_REGISTRATIONS) {
    failures.add("normal-cell", "ten-durable-pending-users-and-ten-mails", { cell: label });
  }
  if (report.sharedPoolIdentityProven !== true) {
    failures.add("normal-cell", "one-pool-object-reaches-repository-and-service", { cell: label });
  }
  if (report.warmUpJobCount !== cell.workers || report.warmUpMaxActive !== cell.workers) {
    failures.add("normal-cell", "standalone-warm-up-covered-every-worker", {
      cell: label, expected: cell.workers
    });
  }
  const threads = report.threadsAtReady ?? {};
  if (threads.distinctNonMainThreadCount !== cell.workers || threads.mainThreadFallback !== false) {
    failures.add("normal-cell", "standalone-distinct-thread-evidence", {
      cell: label, expected: cell.workers
    });
  }
  const inFlight = report.inFlight ?? {};
  if (inFlight.sampleIntervalMs !== 5 || !(inFlight.sampleCount > 0)) {
    failures.add("normal-cell", "standalone-rss-sampled-every-5ms-in-flight", { cell: label });
  }
  if (inFlight.maxActive !== cell.workers
    || inFlight.maxOutstandingTotal !== STANDALONE_MAX_COST_JOBS
    || inFlight.maxQueuedCredential < STANDALONE_MAX_COST_JOBS - cell.workers) {
    failures.add("normal-cell", "standalone-eight-job-load-non-vacuity", {
      cell: label, expectedWorkers: cell.workers
    });
  }
  // Exact occupancy. The scanned count is what proves the expiry pages were
  // touched; a counter-only sweep reports full occupancy with zero sentinels.
  const occupancy = report.occupancy;
  if (!Array.isArray(occupancy)
    || occupancy.length !== STANDALONE_OCCUPANCY_LABELS.length) {
    failures.add("normal-cell", "standalone-records-0-25-50-100-occupancy", { cell: label });
    return;
  }
  STANDALONE_OCCUPANCY_LABELS.forEach((expectedLabel, index) => {
    const point = occupancy[index];
    if (point?.occupancyPercent !== expectedLabel) {
      failures.add("normal-cell", "standalone-occupancy-points-in-exact-order", {
        cell: label, position: index
      });
    }
    if (!isFiniteNumber(point?.rssBytes)) {
      failures.add("normal-cell", "standalone-rss-recorded-at-each-occupancy-point", {
        cell: label, position: index
      });
    }
    if (point?.slotCapacity !== STANDALONE_SLOT_CAPACITY) {
      failures.add("normal-cell", "standalone-slot-capacity-is-1572864", {
        cell: label, position: index
      });
    }
    // Exact counts, not merely "some occupancy". 0/25/50/100% of 1,572,864 is
    // 0 / 393,216 / 786,432 / 1,572,864, and the sentinel expiry entries scale
    // with them. A sweep that bumped a counter without touching the expiry
    // pages reports the slot count and a sentinel count of zero.
    const exactSlots = (STANDALONE_SLOT_CAPACITY * index) / 4;
    if (point?.occupiedSlots !== exactSlots) {
      failures.add("normal-cell", "standalone-occupancy-slot-count-is-exact", {
        cell: label, position: index, expected: exactSlots
      });
    }
    const exactSentinels = (STANDALONE_SENTINEL_EXPIRY_ENTRIES * index) / 4;
    if (point?.sentinelExpiryEntries !== exactSentinels) {
      failures.add("normal-cell", "standalone-occupancy-expiry-pages-touched-exactly", {
        cell: label, position: index, expected: exactSentinels
      });
    }
  });
  const full = occupancy[occupancy.length - 1];
  if (full?.occupiedSlots !== STANDALONE_SLOT_CAPACITY) {
    failures.add("normal-cell", "standalone-100-percent-is-1572864-of-1572864-slots", {
      cell: label
    });
  }
  if (full?.sentinelExpiryEntries !== STANDALONE_SENTINEL_EXPIRY_ENTRIES) {
    failures.add("normal-cell", "standalone-100-percent-touched-every-expiry-page", { cell: label });
  }
  const cleanup = report.cleanup ?? {};
  // One exact cleanup order, agreed with the harness, INCLUDING the truthful
  // buffer-zeroing event. The harness pushes that event only after the key and
  // salt buffers were actually zeroed, so its presence here is a fact about the
  // process rather than a label.
  const expectedOrder = [
    "service-drain", "hasher-close", "pool-close", "database-stop",
    "secret-root-removal", "buffer-zeroing"
  ];
  if (JSON.stringify(cleanup.order) !== JSON.stringify(expectedOrder)) {
    failures.add("normal-cell", "standalone-cleanup-in-truthful-order", { cell: label });
  }
  if (cleanup.poolTerminationConfirmed !== true) {
    failures.add("normal-cell", "standalone-pool-termination-confirmed", { cell: label });
  }
  if (cleanup.buffersZeroed !== true) {
    failures.add("normal-cell", "standalone-key-and-salt-buffers-zeroed", { cell: label });
  }
}

// ---------------------------------------------------------------------------
// Gate: mutants.
// ---------------------------------------------------------------------------

function gateMutants(bundle, failures) {
  for (const mutant of bundle.vitestMutants) {
    const label = shortLabel(mutant.name);
    if (mutant.rawStatus === 0) {
      failures.add("mutant", "vitest-mutant-exits-nonzero", { mutant: label });
    }
    if (!isNonNegativeInteger(mutant.selectedTests) || mutant.selectedTests < 1) {
      failures.add("mutant", "vitest-mutant-selected-at-least-one-test", { mutant: label });
    }
    if (mutant.failedForIntendedReason !== true) {
      failures.add("mutant", "vitest-mutant-failed-for-its-intended-named-reason", { mutant: label });
    }
    if (mutant.restoredSha256 !== mutant.expectedRestoredSha256
      || !/^[0-9a-f]{64}$/.test(mutant.restoredSha256 ?? "")) {
      failures.add("mutant", "vitest-mutant-source-restored-byte-identically", { mutant: label });
    }
  }
  for (const mutant of bundle.adjudicatorMutants) {
    const label = shortLabel(mutant.name);
    if (mutant.rawStatus === 0) {
      failures.add("mutant", "adjudicator-mutant-exits-nonzero", { mutant: label });
    }
    if (mutant.namedAssertionFailed !== true) {
      failures.add("mutant", "adjudicator-mutant-failed-one-named-assertion", { mutant: label });
    }
    if (mutant.anchorReplacementCount !== 1) {
      failures.add("mutant", "adjudicator-mutant-replaced-exactly-one-anchor-site", {
        mutant: label, replacements: mutant.anchorReplacementCount ?? -1
      });
    }
    if (mutant.mutatedTemporaryCopy !== true) {
      failures.add("mutant", "adjudicator-mutant-ran-against-a-temporary-copy", { mutant: label });
    }
  }
  const control = bundle.adjudicatorCleanControl;
  if (control !== null && control.rawStatus !== 0) {
    failures.add("mutant", "clean-adjudicator-self-test-exits-zero", {
      status: control.rawStatus
    });
  }
}

// ---------------------------------------------------------------------------
// The comparison.
//
// Only reached when every gate above passed. Both co-primary endpoints are
// computed from the paired cells in the frozen order, and the marker mapping is
// the packet's, applied exactly.
// ---------------------------------------------------------------------------

function compare(bundle) {
  const pairs = [];
  for (let pairIndex = 0; pairIndex < PAIRED_ORDER.length; pairIndex += 1) {
    const first = bundle.integrationCells[pairIndex * 2];
    const second = bundle.integrationCells[pairIndex * 2 + 1];
    const twoWorker = first.workers === 2 ? first : second;
    const threeWorker = first.workers === 3 ? first : second;
    // `derivedEndpoints`, never `report.endpoints`: the comparison is computed
    // from the anonymous components, so a receipt that reported a flattering
    // summary alongside honest components has already failed above and can
    // never reach this arithmetic.
    pairs.push(Object.freeze({
      pair: pairIndex + 1,
      twoWorkerH: twoWorker.derivedEndpoints.H,
      threeWorkerH: threeWorker.derivedEndpoints.H,
      twoWorkerQ: twoWorker.derivedEndpoints.Q,
      threeWorkerQ: threeWorker.derivedEndpoints.Q,
      twoWorkerHeadroomMs: twoWorker.derivedEndpoints.clampHeadroomMs,
      threeWorkerHeadroomMs: threeWorker.derivedEndpoints.clampHeadroomMs
    }));
  }

  const endpoint = (twoKey, threeKey) => {
    const differences = pairs.map((pair) => pair[twoKey] - pair[threeKey]);
    const ratios = pairs.map((pair) => (pair[threeKey] === 0 ? null : pair[twoKey] / pair[threeKey]))
      .filter((ratio) => ratio !== null);
    // Strictly greater. A tie is not an improvement, so it costs a win.
    const wins = pairs.filter((pair) => pair[twoKey] > pair[threeKey]).length;
    const reversals = pairs.filter((pair) => pair[threeKey] > pair[twoKey]).length;
    return Object.freeze({
      pairedValues: pairs.map((pair) => Object.freeze({
        pair: pair.pair, twoWorker: pair[twoKey], threeWorker: pair[threeKey]
      })),
      wins,
      reversals,
      trials: pairs.length,
      medianDifference: median(differences),
      medianRatio: median(ratios),
      oneSidedSignProbability: oneSidedSignProbability(wins, pairs.length),
      reversalSignProbability: oneSidedSignProbability(reversals, pairs.length),
      clopperPearson: clopperPearsonInterval(wins, pairs.length, CLOPPER_PEARSON_CONFIDENCE),
      passes: wins >= REQUIRED_WINS
        && oneSidedSignProbability(wins, pairs.length) <= BONFERRONI_ALPHA,
      reverses: reversals >= REQUIRED_WINS
    });
  };

  const H = endpoint("twoWorkerH", "threeWorkerH");
  const Q = endpoint("twoWorkerQ", "threeWorkerQ");

  const twoWorkerCells = bundle.integrationCells.filter((cell) => cell.workers === 2);
  const threeWorkerCells = bundle.integrationCells.filter((cell) => cell.workers === 3);

  // Published RED is the operator gate. Historical severity is strictly stronger
  // and is the ONLY thing that licenses a causal claim about the 973.0/1,264.7 ms
  // history. Conflating them is the error this block exists to prevent.
  const publishedRedControls = twoWorkerCells.filter((cell) =>
    cell.derivedEndpoints.H > PUBLISHED_RED_H_MS
    || cell.derivedEndpoints.clampHeadroomMs < PUBLISHED_RED_HEADROOM_MS).length;
  const historicalSeverityControls = twoWorkerCells.filter((cell) =>
    cell.derivedEndpoints.H > HISTORICAL_SEVERITY_H_MS).length;
  const historicalRedReproduced = historicalSeverityControls >= REQUIRED_WINS;

  const threeWorkerAllGreen = threeWorkerCells.every((cell) =>
    cell.derivedEndpoints.H <= PUBLISHED_RED_H_MS
    && cell.derivedEndpoints.clampHeadroomMs >= PUBLISHED_RED_HEADROOM_MS);

  const ordinarySignature = H.passes && Q.passes && threeWorkerAllGreen;

  let marker;
  // T1-N3-AB-ANCHOR-M9-CAUSAL-MARKER
  if (ordinarySignature && historicalRedReproduced) marker = SCIENTIFIC_MARKERS.reproduced;
  else if (ordinarySignature) marker = SCIENTIFIC_MARKERS.ordinary;
  else if (H.reverses && Q.reverses) marker = SCIENTIFIC_MARKERS.contradicts;
  else marker = SCIENTIFIC_MARKERS.mixed;

  const rssPeaks = bundle.standaloneCells.map((cell) => Object.freeze({
    workers: cell.workers, peakBytes: cell.report.peakRssBytes
  }));
  const threeWorkerPeak = Math.max(
    0, ...rssPeaks.filter((entry) => entry.workers === 3).map((entry) => entry.peakBytes)
  );
  const twoWorkerPeak = Math.max(
    0, ...rssPeaks.filter((entry) => entry.workers === 2).map((entry) => entry.peakBytes)
  );
  const roundedCandidateMib = Math.ceil(threeWorkerPeak / 1024 / 1024 / 32) * 32;

  return Object.freeze({
    marker,
    endpoints: Object.freeze({ H, Q }),
    bonferroniAlpha: BONFERRONI_ALPHA,
    requiredWins: REQUIRED_WINS,
    publishedRed: Object.freeze({
      thresholdH: PUBLISHED_RED_H_MS,
      thresholdHeadroom: PUBLISHED_RED_HEADROOM_MS,
      twoWorkerControlsAtOrBeyondRed: publishedRedControls,
      threeWorkerCellsAllGreen: threeWorkerAllGreen
    }),
    historicalSeverity: Object.freeze({
      thresholdH: HISTORICAL_SEVERITY_H_MS,
      twoWorkerControlsMeetingSeverity: historicalSeverityControls,
      reproduced: historicalRedReproduced
    }),
    queueCollapseIsDescriptiveOnly: true,
    rss: Object.freeze({
      provenanceClass: "STANDALONE_BOOTED_PROCESS",
      status: REQUIRED_RSS_BOUND_LABEL,
      twoWorkerPeakBytes: twoWorkerPeak,
      threeWorkerPeakBytes: threeWorkerPeak,
      candidateNext32MibRoundedMib: roundedCandidateMib,
      safetyCeilingBytes: RSS_SAFETY_LIMIT_BYTES,
      vitestProvenanceComparable: false
    }),
    authorizesProduction: false,
    requalifiesNStar3: false
  });
}

// ---------------------------------------------------------------------------
// Top-level adjudication over an in-memory bundle. Pure: no I/O, no globals.
// ---------------------------------------------------------------------------

/**
 * Every executed cell, derived HERE rather than carried in the bundle.
 *
 * A bundle that also carried a flattened copy would be two representations of
 * the same evidence, and a gate reading the stale one would silently miss a
 * corruption applied to the other. Deriving on entry makes that impossible.
 */
function executedCells(bundle) {
  return [
    ...bundle.integrationCells,
    ...bundle.architectureResourceCells,
    ...bundle.architectureFaultCells,
    ...bundle.standaloneCells,
    ...(bundle.retainedAllocationControl ? [bundle.retainedAllocationControl] : [])
  ];
}

/**
 * Every captured stream the run produced.
 *
 * Not just the cells: the preflight, the Vitest help capture, the patch and
 * diff receipts, the backup receipts, every mutant, the mutation helper's own
 * output, the restoration receipts, the final custody receipts, the manifest
 * builder's output and the manifest's own bytes. Scanning only the cells is how
 * a leak printed by a preflight or a restoration step stays invisible.
 */
function receiptSources(bundle) {
  return [
    ...executedCells(bundle),
    ...bundle.vitestMutants,
    ...bundle.adjudicatorMutants,
    ...(bundle.adjudicatorCleanControl ? [bundle.adjudicatorCleanControl] : []),
    ...(Array.isArray(bundle.auxiliaryReceipts) ? bundle.auxiliaryReceipts : [])
  ];
}

function adjudicate(rawBundle) {
  const bundle = {
    ...rawBundle,
    get allExecutedCells() { return executedCells(rawBundle); },
    get receiptSources() { return receiptSources(rawBundle); }
  };
  const failures = createFailures();
  gateCustody(bundle, failures);
  gateSecrets(bundle, failures);
  gateRssSafety(bundle, failures);
  gateRestoration(bundle, failures);
  gateInventory(bundle, failures);
  gateReceiptCompleteness(bundle, failures);
  gateNormalCells(bundle, failures);
  gateMutants(bundle, failures);

  const dominant = failures.dominantClass();
  if (dominant !== null) {
    return Object.freeze({
      blocked: true,
      marker: blockedMarker(dominant),
      failures: Object.freeze([...failures.entries]),
      summary: null
    });
  }
  return Object.freeze({
    blocked: false,
    marker: null,
    failures: Object.freeze([]),
    summary: compare(bundle)
  });
}

// ---------------------------------------------------------------------------
// Manifest loading.
//
// Path handling is deliberately hostile: absolute paths, traversal segments and
// symlinks that resolve outside the mission logs directory are all rejected
// before a single byte is read.
// ---------------------------------------------------------------------------

const ADJUDICATOR_PATH = fileURLToPath(import.meta.url);
const MISSION_LOGS_DIR = dirname(ADJUDICATOR_PATH);

class InvocationError extends Error {
  constructor(code) {
    super(code);
    this.name = "InvocationError";
  }
}

/** Resolves one manifest-declared path, or throws with a secret-free code. */
function resolveReceiptPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new InvocationError("T1_N3_AB_RECEIPT_PATH_INVALID");
  }
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new InvocationError("T1_N3_AB_RECEIPT_PATH_TRAVERSAL_REJECTED");
  }
  const resolved = resolve(MISSION_LOGS_DIR, relativePath);
  let real;
  try {
    real = realpathSync(resolved);
  } catch {
    throw new InvocationError("T1_N3_AB_RECEIPT_UNREADABLE");
  }
  const realRoot = realpathSync(MISSION_LOGS_DIR);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    throw new InvocationError("T1_N3_AB_RECEIPT_OUTSIDE_MISSION_LOGS");
  }
  return real;
}

function readReceiptText(relativePath) {
  return readFileSync(resolveReceiptPath(relativePath), "utf8");
}

/** Extracts the single marker line's JSON payload, or null if not exactly one. */
function extractReport(stdout, marker) {
  const lines = stripAnsi(stdout).split("\n").filter((line) => line.startsWith(marker));
  if (lines.length !== 1) return null;
  try {
    return JSON.parse(lines[0].slice(marker.length));
  } catch {
    return null;
  }
}

/** Set from the manifest; every receipt path is resolved beneath it. */
let RUN_DIR_NAME = "";
const RECEIPT_PREFIX = "T1-3worker-ab-";

function loadCell(entry, markerName) {
  const stdout = readReceiptText(`${RUN_DIR_NAME}/${entry.stdoutPath}`);
  const stderr = readReceiptText(`${RUN_DIR_NAME}/${entry.stderrPath}`);
  const statusText = readReceiptText(`${RUN_DIR_NAME}/${entry.statusPath}`).trim();
  // Exact grammar: one integer, one space, this run's commitment. A bare
  // integer is no longer a lawful status, so a receipt copied from an earlier
  // run cannot be read as one from this run.
  const statusMatch = /^(\d{1,3}) ([0-9a-f]{64})$/.exec(statusText);
  const rawStatus = statusMatch === null ? -1 : Number(statusMatch[1]);
  const statusCommitment = statusMatch === null ? null : statusMatch[2];
  return {
    cellId: entry.cellId ?? entry.name,
    workers: entry.workers,
    pairIndex: entry.pairIndex,
    armIndex: entry.armIndex,
    faultName: entry.faultName,
    name: entry.name,
    rawStatus,
    statusCommitment,
    stdout,
    stderr,
    report: markerName === null ? null : extractReport(stdout, MARKERS[markerName])
  };
}

/**
 * This adjudicator's OWN derivation of the closed pre-adjudication inventory.
 *
 * Deliberately duplicated from the manifest builder rather than imported or
 * read from the manifest: two independent derivations that must agree is the
 * whole point. If they ever drift, the run blocks rather than adjudicating a
 * set neither component fully understands.
 */
function frozenCellOrder() {
  const cells = [];
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      cells.push(`integration-p${String(pairIndex + 1).padStart(2, "0")}-a${armIndex}-w${workers}`);
    });
  });
  for (const cellId of ARCHITECTURE_RESOURCE_CELL_IDS) cells.push(cellId);
  for (const fault of FAULT_CELL_NAMES) cells.push(fault);
  cells.push(POSITIVE_CONTROL_CELL_ID);
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      cells.push(`standalone-p${String(pairIndex + 1).padStart(2, "0")}-a${armIndex}-w${workers}`);
    });
  });
  for (const name of VITEST_MUTANT_NAMES) cells.push(name);
  cells.push("adjudicator-clean-self-test");
  for (const name of ADJUDICATOR_MUTANT_NAMES) cells.push(name);
  return cells;
}

function expectedInventory() {
  const names = new Set();
  const add = (name) => names.add(`${RECEIPT_PREFIX}${name}`);
  for (const name of [
    "run-preflight-epoch.out", "run-identity.out", "process-identity.out",
    "finalization-order.out", "block-reasons.out", "preflight-authority.out",
    "preflight-checkout.out", "trap-arming.out", "installed-source-hashes.out",
    "carrier-gate.out", "carrier-gate.status"
  ]) add(name);
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
  for (const cell of frozenCellOrder()) {
    add(`${cell}.out`);
    add(`${cell}.err`);
    add(`${cell}.status`);
    add(`${cell}-timeout.out`);
    add(`${cell}-close-to-reap.out`);
  }
  for (const name of VITEST_MUTANT_NAMES) {
    add(`${name}-preimage-hash.out`);
    add(`${name}-mutate.out`);
    add(`${name}-mutate.err`);
    add(`${name}-mutate.status`);
    add(`${name}-restore.status`);
    add(`${name}-restore-hash.out`);
    add(`${name}-restore-stat.out`);
  }
  for (const name of ADJUDICATOR_MUTANT_NAMES) {
    add(`${name}-mutate.out`);
    add(`${name}-mutate.err`);
    add(`${name}-mutate.status`);
    add(`${name}-governed-untouched.out`);
    add(`${name}-governed-untouched.status`);
  }
  for (const name of [
    "final-head.out", "final-index.out", "final-hashes.out", "final-whitespace.out",
    "final-worktree.out", "final-descendants.out",
    "manifest-build.out", "manifest-build.err", "manifest-build.status", "manifest.json"
  ]) add(name);
  return [...names].sort();
}

/**
 * The closed pre-adjudication inventory, read by NAME.
 *
 * The previous version enumerated `T1-3worker-ab-*` across the whole mission
 * logs directory. That was wrong twice over: it swept support sources, both
 * patches, the design packet and this seat's own author transcripts into the
 * "evidence" it scanned, and it derived its own completeness check from the
 * same listing it was checking. Here the expected set is recomputed
 * independently below, every name is read explicitly, and nothing outside the
 * run directory is opened at all.
 */
function inventoryReceipts(runDirName, expected, deferred) {
  const deferredSet = new Set(deferred);
  const entries = [];
  for (const name of expected) {
    // The manifest is not scanned as arbitrary text; it is structured evidence
    // that has already been parsed, and re-scanning it would re-report every
    // value it legitimately contains.
    if (name === `${RECEIPT_PREFIX}manifest.json`) continue;
    const relative = `${runDirName}/${name}`;
    let body;
    try {
      body = readFileSync(resolveReceiptPath(relative), "utf8");
    } catch {
      entries.push({ cellId: name, stdout: null, stderr: null, report: null, missing: true });
      continue;
    }
    entries.push({
      cellId: name,
      stdout: body,
      stderr: "",
      report: null,
      deferred: deferredSet.has(name)
    });
  }
  return entries;
}

function loadBundle(manifestPath, carrierReal, literals, expectedRunCommitment) {
  const manifestReal = resolveReceiptPath(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestReal, "utf8"));
  const list = (value) => (Array.isArray(value) ? value : []);
  if (typeof manifest.runDirectoryName !== "string"
    || !/^T1-3worker-ab-run-[0-9a-f]{32}$/.test(manifest.runDirectoryName)) {
    throw new InvocationError("T1_N3_AB_RUN_DIRECTORY_NAME_INVALID");
  }
  if (manifest.runCommitment !== expectedRunCommitment
    || !/^[0-9a-f]{64}$/.test(expectedRunCommitment)) {
    throw new InvocationError("T1_N3_AB_RUN_COMMITMENT_MISMATCH");
  }
  RUN_DIR_NAME = manifest.runDirectoryName;

  const integrationCells = list(manifest.integrationCells).map((entry) => loadCell(entry, "integration"));
  const architectureResourceCells = list(manifest.architectureResourceCells)
    .map((entry) => loadCell(entry, "architecture"));
  const architectureFaultCells = list(manifest.architectureFaultCells)
    .map((entry) => loadCell(entry, "fault"));
  const standaloneCells = list(manifest.standaloneCells).map((entry) => loadCell(entry, "standalone"));
  const retainedAllocationControl = manifest.retainedAllocationControl
    ? loadCell(manifest.retainedAllocationControl, "architecture")
    : null;
  const vitestMutants = list(manifest.vitestMutants).map((entry) => ({
    ...entry, ...loadCell(entry, null)
  }));
  const adjudicatorMutants = list(manifest.adjudicatorMutants).map((entry) => ({
    ...entry, ...loadCell(entry, null)
  }));
  const adjudicatorCleanControl = manifest.adjudicatorCleanControl
    ? { ...manifest.adjudicatorCleanControl, ...loadCell(manifest.adjudicatorCleanControl, null) }
    : null;

  // The expected inventory is recomputed HERE, from this adjudicator's own
  // frozen schedule, and then compared to the two lists the builder shipped.
  // Neither side derives its completeness from the other's listing.
  const expected = expectedInventory();
  const declaredExpected = list(manifest.inventory?.expected);
  const declaredObserved = list(manifest.inventory?.observed);
  const deferred = list(manifest.inventory?.deferred);
  const auxiliary = inventoryReceipts(RUN_DIR_NAME, expected, deferred);
  return Object.freeze({
    packetSha256: manifest.packetSha256,
    runCommitment: manifest.runCommitment,
    runId: RUN_DIR_NAME.slice("T1-3worker-ab-run-".length),
    launchAuthority: manifest.launchAuthority ?? null,
    custody: manifest.custody,
    secretScan: manifest.secretScan,
    generatedLiterals: literals,
    generatedLiteralCommitmentSha256: literalCommitment(literals),
    inventory: Object.freeze({
      expected, declaredExpected, declaredObserved, deferred
    }),
    // Read from the DURABLE receipt, after the builder exited, not from the
    // manifest's pre-builder snapshot. By now it must be the frozen cell order
    // plus the builder's own entry.
    finalizationOrder: (() => {
      try {
        return readFileSync(
          resolveReceiptPath(`${RUN_DIR_NAME}/${RECEIPT_PREFIX}finalization-order.out`), "utf8"
        ).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
      } catch {
        return [];
      }
    })(),
    preBuilderFinalizationOrder: list(manifest.preBuilderFinalizationOrder),
    auxiliaryReceipts: auxiliary,
    expectedScannableStreams: auxiliary.filter((entry) => entry.missing !== true).length,
    candidateRssBound: manifest.candidateRssBound ?? null,
    integrationCells,
    architectureResourceCells,
    architectureFaultCells,
    standaloneCells,
    retainedAllocationControl,
    vitestMutants,
    adjudicatorMutants,
    adjudicatorCleanControl
  });
}

// ---------------------------------------------------------------------------
// Self-test.
//
// Dependency-free and filesystem-free apart from reading this file's own source
// to verify the mutation anchors. It builds a clean synthetic bundle, proves the
// adjudicator returns a lawful scientific marker for it, and then corrupts that
// bundle once per guard and proves the named guard fires. A mutated copy of this
// file fails here, which is what makes mutants 8-10 executable without needing
// the real receipt set.
// ---------------------------------------------------------------------------

/**
 * A clean synthetic receipt body.
 *
 * Deliberately contains the declared SHA header, so the self-test also proves
 * that the ONE whitelisted shape survives the `long-hex-digest` pattern. A
 * fixture with empty bodies would pass a scan that had been removed entirely.
 */
const SELF_TEST_CLEAN_RECEIPT_STDOUT =
  `${GOVERNED_HASHES["apps/api/src/main.ts"]}  apps/api/src/main.ts\n`
  + "cell completed, no identifiers printed\n";
const SELF_TEST_CLEAN_RECEIPT_STDERR = "no diagnostics\n";

/** The synthetic run's generated literals, standing in for the real carrier. */
const SELF_TEST_LITERALS = Object.freeze(["self-test-generated-literal@example.test"]);

/** A synthetic run identity, so the run-binding gates are exercised too. */
const SELF_TEST_RUN_ID = "0123456789abcdef0123456789abcdef";
const SELF_TEST_RUN_COMMITMENT = "b".repeat(64);

/** The supervised triple a cell inherits: pid == pgid == sid, by setsid(). */
function syntheticSupervised(pid) {
  return { supervisedPid: pid, supervisedPgid: pid, supervisedSid: pid };
}

function syntheticHeader(pid, port) {
  return {
    nodeVersion: "v22.23.1",
    platform: "darwin",
    arch: "arm64",
    cpuModel: "synthetic-self-test-cpu",
    cpuCount: 8,
    processPid: pid,
    postgresPort: port,
    loadAverageAtStart: [1, 1, 1],
    loadAverageAtEnd: [1, 1, 1],
    swapDelta: 0,
    majorPageFaultDelta: 0,
    eventLoopDelayP99Ms: 1,
    eventLoopDelayMaxMs: 2
  };
}

function syntheticIntegrationCell(pairIndex, armIndex, workers, index) {
  // Two-worker arms are deliberately worse on both endpoints so the clean
  // fixture lands on a determinate marker rather than on MIXED.
  const H = workers === 2 ? 500 : 300;
  const Q = workers === 2 ? 200 : 20;
  return {
    cellId: `integration-p${pairIndex + 1}-a${armIndex}-w${workers}`,
    workers,
    pairIndex: pairIndex + 1,
    armIndex,
    rawStatus: 0,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: {
      packetSha256: EXPECTED_PACKET_SHA256,
      ...syntheticSupervised(1000 + index),
      header: syntheticHeader(1000 + index, 6000 + index),
      pool: {
        requestedWorkers: workers,
        readyWorkers: workers,
        distinctNonMainThreadCount: workers,
        mainThreadFallback: false,
        maxActive: workers,
        maxActiveCredential: workers === 3 ? 3 : 2,
        maxQueuedCredential: workers === 2 ? 1 : 0,
        maxOutstandingCredential: 3
      },
      outcomes: { expected: 24, observed: 24 },
      drains: { mail: true, refusal: true, ordinalMapEmptyAfterDrain: true },
      spans: {
        identityMaxSkewMs: 0.5,
        creditedJobsWithExactlyOneEnqueueDispatchSettle: true,
        perWave: Array.from({ length: INTEGRATION_MEASURED_WAVES }, () => ({
          maxQueueDwellMs: Q, maxDispatchToSettleMs: 100, maxEnqueueToSettleMs: Q + 100
        }))
      },
      // The components the endpoints are RECOMPUTED from. The summary below is
      // written to agree with them; the self-test corruption case proves a
      // disagreement is caught rather than silently preferred.
      rssBoundStatus: REQUIRED_RSS_BOUND_LABEL,
      rssSafety: {
        rssSafetyExceeded: false,
        limitBytes: RSS_SAFETY_LIMIT_BYTES,
        peakBytes: 300 * 1024 * 1024,
        measuredPid: 1000 + index,
        sampleIntervalMs: 5,
        samples: 900,
        peakSampleBytes: [300 * 1024 * 1024]
      },
      arms: { existingProvisionMaxMs: H, missingProvisionMaxMs: H - 10 },
      endpoints: { H, Q, clampHeadroomMs: 600 - (H + 135) },
      gates: {
        opacity: true, response: true, durableRows: true, drain: true,
        errors: {
          timeout: 0, capacity: 0, worker: 0, unhandled: 0,
          postgres: 0, secretCapture: 0, custody: 0
        }
      }
    }
  };
}

function syntheticArchitectureCell(workers, index, options = {}) {
  return {
    cellId: `architecture-${index}-w${workers}`,
    workers,
    rawStatus: 0,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: {
      packetSha256: EXPECTED_PACKET_SHA256,
      ...syntheticSupervised(2000 + index),
      header: syntheticHeader(2000 + index, 6100 + index),
      rssBoundStatus: REQUIRED_RSS_BOUND_LABEL,
      jobsPerWave: ARCHITECTURE_JOBS_PER_WAVE,
      warmUp: { warmedWorkers: workers, maxActiveDuringWarmUp: workers },
      threads: { distinctNonMainThreadCount: workers, mainThreadFallback: false },
      inFlight: { sampleIntervalMs: 5, sampleCount: 400 },
      baselineRssBytes: 290 * 1024 * 1024,
      settledRssBytes: 305 * 1024 * 1024,
      postCloseRssBytes: 240 * 1024 * 1024,
      closeLatencyMs: 40,
      // The control's working set grows by exactly 4 MiB a wave, so the last
      // four quiescent readings span 12 MiB and the recomputed 2 MiB tripwire
      // must be RED. The ordinary fixture is flat, so it must be green.
      perWave: Array.from({ length: ARCHITECTURE_WAVE_COUNT }, (_unused, wave) => ({
        waveIndex: wave,
        jobCount: ARCHITECTURE_JOBS_PER_WAVE,
        sampleCount: 50,
        eventLoopProgressTicks: 400,
        inFlightPeakRssBytes: 380 * 1024 * 1024,
        quiescentRssBytes: (300 + (options.positiveControl ? wave * 4 : 0)) * 1024 * 1024,
        maxActive: workers,
        maxQueued: ARCHITECTURE_JOBS_PER_WAVE - workers,
        maxOutstanding: ARCHITECTURE_JOBS_PER_WAVE
      })),
      plateau: {
        tripwireMib: PLATEAU_TRIPWIRE_MIB,
        lastFourWaveSpreadMib: options.positiveControl ? 12 : 0,
        red: options.positiveControl === true
      },
      ...(options.positiveControl
        ? { retainedMibPerWave: POSITIVE_CONTROL_RETAINED_MIB_PER_WAVE }
        : {
          lifecycle: {
            state: "CLOSED", liveHandles: 0, retiringHandles: 0, queued: 0, outstanding: 0,
            closeMs: 40, restarts: 0, closeInitiationToTeardownCompleteMs: 120
          }
        }),
      rssSafety: {
        rssSafetyExceeded: false, limitBytes: RSS_SAFETY_LIMIT_BYTES,
        peakBytes: 390 * 1024 * 1024, measuredPid: 2000 + index,
        sampleIntervalMs: 5, samples: 700, peakSampleBytes: [390 * 1024 * 1024]
      }
    }
  };
}

function syntheticFaultCell(faultName, index) {
  const base = {
    packetSha256: EXPECTED_PACKET_SHA256,
    ...syntheticSupervised(3000 + index),
    header: syntheticHeader(3000 + index, 6200 + index),
    maxLiveHandles: 3,
    maxPhysicallyAlive: 3,
    settledExactlyOnce: true,
    jobHeldAcrossFaultAndClose: true,
    precompletedJob: false,
    manualPostCloseCleanup: false,
    outcomeRewritten: false,
    terminationAttempts: 1,
    restartsInWindow: 0,
    rssSafety: {
      rssSafetyExceeded: false,
      limitBytes: RSS_SAFETY_LIMIT_BYTES,
      peakBytes: 120 * 1024 * 1024,
      measuredPid: 3000 + index,
      sampleIntervalMs: 5,
      samples: 40,
      peakSampleBytes: [120 * 1024 * 1024]
    },
    rssBoundStatus: REQUIRED_RSS_BOUND_LABEL,
    replacementsSpawned: 0,
    closeRejectedTyped: false,
    breakerTripped: false,
    retainedLiveHandles: 0,
    retainedRetiringHandles: 0,
    finalLiveHandles: 0,
    finalRetiringHandles: 0
  };
  const report = faultName === "fault-unconfirmed-death"
    ? { ...base, breakerTripped: true, closeRejectedTyped: true, retainedRetiringHandles: 1 }
    : faultName === "fault-late-exit-before-close"
      ? { ...base, replacementsSpawned: 1 }
      : base;
  return {
    cellId: faultName,
    faultName,
    workers: 3,
    rawStatus: 0,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report
  };
}

function syntheticStandaloneCell(pairIndex, armIndex, workers, index) {
  const occupancy = STANDALONE_OCCUPANCY_LABELS.map((label, position) => ({
    occupancyPercent: label,
    slotCapacity: STANDALONE_SLOT_CAPACITY,
    occupiedSlots: position === 3 ? STANDALONE_SLOT_CAPACITY : (STANDALONE_SLOT_CAPACITY * position) / 4,
    sentinelExpiryEntries: position === 3
      ? STANDALONE_SENTINEL_EXPIRY_ENTRIES
      : (STANDALONE_SENTINEL_EXPIRY_ENTRIES * position) / 4,
    rssBytes: (300 + position) * 1024 * 1024
  }));
  return {
    cellId: `standalone-p${pairIndex + 1}-a${armIndex}-w${workers}`,
    workers,
    pairIndex: pairIndex + 1,
    armIndex,
    rawStatus: 0,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: {
      packetSha256: EXPECTED_PACKET_SHA256,
      ...syntheticSupervised(4000 + index),
      header: syntheticHeader(4000 + index, 6300 + index),
      provenanceClass: "STANDALONE_BOOTED_PROCESS",
      rssBoundStatus: REQUIRED_RSS_BOUND_LABEL,
      outcome: "COMPLETE",
      workerCount: workers,
      durablePendingUsers: STANDALONE_REGISTRATIONS,
      verificationMailCount: STANDALONE_REGISTRATIONS,
      sharedPoolIdentityProven: true,
      warmUpJobCount: workers,
      warmUpMaxActive: workers,
      threadsAtReady: { distinctNonMainThreadCount: workers, mainThreadFallback: false },
      inFlight: {
        sampleIntervalMs: 5,
        sampleCount: 500,
        maxActive: workers,
        maxQueuedCredential: STANDALONE_MAX_COST_JOBS - workers,
        maxOutstandingTotal: STANDALONE_MAX_COST_JOBS
      },
      occupancy,
      baselineRssBytes: 300 * 1024 * 1024,
      settledRssBytes: 320 * 1024 * 1024,
      postCloseRssBytes: 250 * 1024 * 1024,
      cleanupOk: true,
      peakRssBytes: (workers === 3 ? 400 : 330) * 1024 * 1024,
      cleanup: {
        order: [
          "service-drain", "hasher-close", "pool-close", "database-stop",
          "secret-root-removal", "buffer-zeroing"
        ],
        poolTerminationConfirmed: true,
        buffersZeroed: true
      },
      rssSafety: {
        rssSafetyExceeded: false, limitBytes: RSS_SAFETY_LIMIT_BYTES,
        peakBytes: (workers === 3 ? 400 : 330) * 1024 * 1024,
        measuredPid: 4000 + index, sampleIntervalMs: 5, samples: 800,
        peakSampleBytes: [(workers === 3 ? 400 : 330) * 1024 * 1024]
      }
    }
  };
}

function cleanSyntheticBundle() {
  const integrationCells = [];
  const standaloneCells = [];
  PAIRED_ORDER.forEach((pair, pairIndex) => {
    pair.forEach((workers, armIndex) => {
      const index = pairIndex * 2 + armIndex;
      integrationCells.push(syntheticIntegrationCell(pairIndex, armIndex, workers, index));
      standaloneCells.push(syntheticStandaloneCell(pairIndex, armIndex, workers, index));
    });
  });
  const architectureResourceCells = ARCHITECTURE_RESOURCE_ORDER
    .map((workers, index) => syntheticArchitectureCell(workers, index));
  const architectureFaultCells = FAULT_CELL_NAMES.map(syntheticFaultCell);
  const retainedAllocationControl = syntheticArchitectureCell(2, 99, { positiveControl: true });
  const vitestMutants = VITEST_MUTANT_NAMES.map((name, index) => ({
    name,
    cellId: name,
    rawStatus: 1,
    selectedTests: 1,
    failedForIntendedReason: true,
    restoredSha256: GOVERNED_HASHES[TEMPORARY_TEST_PATHS[index % 2]],
    expectedRestoredSha256: GOVERNED_HASHES[TEMPORARY_TEST_PATHS[index % 2]],
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: null
  }));
  const adjudicatorMutants = ADJUDICATOR_MUTANT_NAMES.map((name) => ({
    name,
    cellId: name,
    rawStatus: 1,
    namedAssertionFailed: true,
    anchorReplacementCount: 1,
    mutatedTemporaryCopy: true,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: null
  }));
  const adjudicatorCleanControl = {
    name: "adjudicator-clean-self-test",
    cellId: "adjudicator-clean-self-test",
    rawStatus: 0,
    stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
    stderr: SELF_TEST_CLEAN_RECEIPT_STDERR,
    report: null
  };
  // A consistent synthetic inventory, derived the same way the real one is, so
  // `--self-test` exercises the closed-inventory gate rather than skipping it.
  const inventoryExpected = expectedInventory();
  const inventoryDeferred = [`${RECEIPT_PREFIX}manifest-build.status`, `${RECEIPT_PREFIX}manifest.json`];
  const deferredSet = new Set(inventoryDeferred);
  const inventoryReceiptEntries = inventoryExpected
    .filter((name) => name !== `${RECEIPT_PREFIX}manifest.json`)
    .map((name) => ({
      cellId: name,
      stdout: SELF_TEST_CLEAN_RECEIPT_STDOUT,
      stderr: "",
      report: null,
      deferred: deferredSet.has(name)
    }));

  return {
    packetSha256: EXPECTED_PACKET_SHA256,
    runCommitment: SELF_TEST_RUN_COMMITMENT,
    runId: SELF_TEST_RUN_ID,
    inventory: {
      expected: inventoryExpected,
      declaredExpected: inventoryExpected,
      declaredObserved: inventoryExpected.filter((name) => !deferredSet.has(name)),
      deferred: inventoryDeferred
    },
    finalizationOrder: [...frozenCellOrder(), "manifest-build"],
    preBuilderFinalizationOrder: frozenCellOrder(),
    auxiliaryReceipts: inventoryReceiptEntries,
    launchAuthority: { approvedAtUtc: "2026-08-22T00:00:00.000Z", authoritySha256: "a".repeat(64) },
    custody: {
      headCommit: EXPECTED_HEAD_COMMIT,
      indexEmpty: true,
      processTreeClean: true,
      wrapperBackupsTaken: true,
      governedHashes: { ...GOVERNED_HASHES },
      launchAuthoritySha256: "a".repeat(64),
      // Derived from the same synthetic cells, so the identity-binding gate is
      // exercised rather than skipped.
      processIdentity: Object.fromEntries([
        ...integrationCells.map((cell) => [cell.cellId, cell.report.supervisedPid]),
        ...architectureResourceCells.map((cell) => [cell.cellId, cell.report.supervisedPid]),
        ...architectureFaultCells.map((cell) => [cell.cellId, cell.report.supervisedPid]),
        ...standaloneCells.map((cell) => [cell.cellId, cell.report.supervisedPid]),
        [retainedAllocationControl.cellId, retainedAllocationControl.report.supervisedPid]
      ].map(([cellId, pid]) => [cellId, { pid, pgid: pid, sid: pid, wrapperPgid: 99 }])),
      artifactHashes: Object.fromEntries(GOVERNED_ARTIFACT_NAMES.map((name, index) =>
        [name, String(index % 10).repeat(64)])),
      temporaryTests: Object.fromEntries(TEMPORARY_TEST_PATHS.map((path) => [path, {
        backupSha256: GOVERNED_HASHES[path],
        restoredSha256: GOVERNED_HASHES[path],
        temporaryDiffSha256: "3".repeat(64),
        cmpIdentical: true,
        sizeBytes: 1,
        mtimeIso: "2026-08-22T00:00:00.000Z"
      }]))
    },
    generatedLiterals: [...SELF_TEST_LITERALS],
    generatedLiteralCommitmentSha256: literalCommitment(SELF_TEST_LITERALS),
    secretScan: {
      generatedLiteralCount: SELF_TEST_LITERALS.length,
      generatedLiteralCommitmentSha256: literalCommitment(SELF_TEST_LITERALS)
    },
    candidateRssBound: { status: REQUIRED_RSS_BOUND_LABEL },
    integrationCells,
    architectureResourceCells,
    architectureFaultCells,
    standaloneCells,
    retainedAllocationControl,
    vitestMutants,
    adjudicatorMutants,
    adjudicatorCleanControl
  };
}

function clone(bundle) {
  return JSON.parse(JSON.stringify(bundle));
}

/**
 * One corruption per guard family. Each entry names the guard that MUST fire and
 * the blocked class that must dominate. If a mutation of this file weakens a
 * guard, the corresponding entry stops firing and `--self-test` exits nonzero.
 */
const SELF_TEST_CASES = Object.freeze([
  Object.freeze({
    guard: "packet-sha256-matches-approved-design", markerClass: "custody",
    corrupt: (bundle) => { bundle.packetSha256 = "0".repeat(64); }
  }),
  Object.freeze({
    guard: "head-commit-frozen", markerClass: "custody",
    corrupt: (bundle) => { bundle.custody.headCommit = "0".repeat(40); }
  }),
  Object.freeze({
    guard: "governed-file-hash-unchanged", markerClass: "custody",
    corrupt: (bundle) => { bundle.custody.governedHashes["apps/api/src/main.ts"] = "0".repeat(64); }
  }),
  Object.freeze({
    // An identity nobody approved, carrying a plausible digest. Under the old
    // whitelist this passed because it wore the right SHAPE.
    guard: "digest-line-names-an-unexpected-identity", markerClass: "custody",
    corrupt: (bundle) => {
      bundle.integrationCells[0].stdout += `${"c".repeat(64)}  some/unapproved/file.ts\n`;
    }
  }),
  Object.freeze({
    guard: "digest-line-does-not-match-approved-value", markerClass: "custody",
    corrupt: (bundle) => {
      bundle.integrationCells[0].stdout += `${"d".repeat(64)}  apps/api/src/main.ts\n`;
    }
  }),
  Object.freeze({
    guard: "status-line-not-bound-to-this-run", markerClass: "receipt",
    corrupt: (bundle) => {
      bundle.integrationCells[0].stdout += `0 ${"e".repeat(64)}\n`;
    }
  }),
  Object.freeze({
    guard: "report-packet-sha-does-not-match-approved-value", markerClass: "custody",
    corrupt: (bundle) => {
      bundle.integrationCells[0].stdout += `{"packetSha256":"${"f".repeat(64)}"}\n`;
    }
  }),
  Object.freeze({
    guard: "observed-inventory-contains-an-unexpected-stream", markerClass: "receipt",
    corrupt: (bundle) => {
      bundle.inventory.declaredObserved.push("T1-3worker-ab-something-nobody-declared.out");
    }
  }),
  Object.freeze({
    guard: "observed-inventory-missing-a-required-stream", markerClass: "receipt",
    corrupt: (bundle) => { bundle.inventory.declaredObserved.pop(); }
  }),
  Object.freeze({
    guard: "builder-expected-inventory-omits-a-required-stream", markerClass: "receipt",
    corrupt: (bundle) => { bundle.inventory.declaredExpected.pop(); }
  }),
  Object.freeze({
    guard: "finalization-order-mismatch", markerClass: "receipt",
    corrupt: (bundle) => {
      const swap = bundle.finalizationOrder[0];
      bundle.finalizationOrder[0] = bundle.finalizationOrder[1];
      bundle.finalizationOrder[1] = swap;
    }
  }),
  Object.freeze({
    guard: "generated-literal-count-matches-carrier", markerClass: "secret",
    corrupt: (bundle) => { bundle.secretScan.generatedLiteralCount = 99; }
  }),
  Object.freeze({
    guard: "generated-literal-commitment-matches-carrier", markerClass: "secret",
    corrupt: (bundle) => {
      bundle.secretScan.generatedLiteralCommitmentSha256 = "0".repeat(64);
    }
  }),
  Object.freeze({
    guard: "generated-literal-carrier-supplied", markerClass: "secret",
    corrupt: (bundle) => { bundle.generatedLiterals = []; }
  }),
  Object.freeze({
    guard: "no-generated-literal-in-receipt", markerClass: "secret",
    corrupt: (bundle) => {
      bundle.integrationCells[0].stdout += "leaked self-test-generated-literal@example.test\n";
    }
  }),
  Object.freeze({
    guard: "no-forbidden-uuid-in-receipt", markerClass: "secret",
    corrupt: (bundle) => {
      bundle.standaloneCells[0].stderr += "ref 123e4567-e89b-12d3-a456-426614174000\n";
    }
  }),
  Object.freeze({
    guard: "no-forbidden-known-test-password-in-receipt", markerClass: "secret",
    corrupt: (bundle) => {
      bundle.vitestMutants[0].stderr += "correct horse battery staple\n";
    }
  }),
  Object.freeze({
    guard: "no-cell-crossed-the-512-mib-ceiling", markerClass: "rss-safety",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.rssSafety.rssSafetyExceeded = true; }
  }),
  Object.freeze({
    guard: "every-rss-bound-labelled-unratified-candidate", markerClass: "rss-safety",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.rssBoundStatus = "RATIFIED"; }
  }),
  Object.freeze({
    guard: "temporary-test-restored-to-governed-hash", markerClass: "restoration",
    corrupt: (bundle) => {
      bundle.custody.temporaryTests[TEMPORARY_TEST_PATHS[0]].restoredSha256 = "0".repeat(64);
    }
  }),
  Object.freeze({
    guard: "twenty-integration-cells-present", markerClass: "receipt",
    corrupt: (bundle) => { bundle.integrationCells.pop(); }
  }),
  Object.freeze({
    guard: "integration-cells-in-frozen-counterbalanced-order", markerClass: "receipt",
    corrupt: (bundle) => {
      const swap = bundle.integrationCells[0];
      bundle.integrationCells[0] = bundle.integrationCells[1];
      bundle.integrationCells[1] = swap;
    }
  }),
  Object.freeze({
    guard: "architecture-resource-cells-in-exact-2-3-3-2-order", markerClass: "receipt",
    corrupt: (bundle) => { bundle.architectureResourceCells[1].workers = 2; }
  }),
  Object.freeze({
    guard: "standalone-cells-in-frozen-ab-ba-x5-order", markerClass: "receipt",
    corrupt: (bundle) => { bundle.standaloneCells[3].pairIndex = 9; }
  }),
  Object.freeze({
    guard: "named-fault-cell-present", markerClass: "receipt",
    corrupt: (bundle) => { bundle.architectureFaultCells.pop(); }
  }),
  Object.freeze({
    guard: "complete-cell-header-captured", markerClass: "receipt",
    corrupt: (bundle) => { delete bundle.integrationCells[0].report.header.cpuModel; }
  }),
  Object.freeze({
    guard: "normal-cell-raw-status-zero", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].rawStatus = 1; }
  }),
  Object.freeze({
    guard: "every-cell-is-a-distinct-fresh-process", markerClass: "normal-cell",
    corrupt: (bundle) => {
      bundle.integrationCells[1].report.header.processPid =
        bundle.integrationCells[0].report.header.processPid;
    }
  }),
  Object.freeze({
    guard: "every-cell-owns-a-distinct-embedded-postgres", markerClass: "normal-cell",
    corrupt: (bundle) => {
      bundle.standaloneCells[1].report.header.postgresPort =
        bundle.standaloneCells[0].report.header.postgresPort;
    }
  }),
  Object.freeze({
    guard: "requested-workers-equal-ready-threads-and-max-active", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].report.pool.distinctNonMainThreadCount = 1; }
  }),
  Object.freeze({
    guard: "two-worker-n3-wave-reaches-three-outstanding-and-a-queue", markerClass: "normal-cell",
    corrupt: (bundle) => {
      const cell = bundle.integrationCells.find((candidate) => candidate.workers === 2);
      cell.report.pool.maxQueuedCredential = 0;
    }
  }),
  Object.freeze({
    guard: "enqueue-dispatch-settle-arithmetic-identity-within-2ms", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].report.spans.identityMaxSkewMs = 40; }
  }),
  Object.freeze({
    guard: "every-credential-job-enqueued-dispatched-and-settled-once", markerClass: "normal-cell",
    corrupt: (bundle) => {
      bundle.integrationCells[0].report.spans.creditedJobsWithExactlyOneEnqueueDispatchSettle = false;
    }
  }),
  Object.freeze({
    guard: "reported-endpoint-matches-recomputed-components", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].report.endpoints.clampHeadroomMs = 999; }
  }),
  Object.freeze({
    // The flattering-summary attack: honest components, a better H reported.
    guard: "reported-endpoint-matches-recomputed-components", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].report.endpoints.H = 1; }
  }),
  Object.freeze({
    guard: "arm-provision-maxima-present-for-h-recomputation", markerClass: "normal-cell",
    corrupt: (bundle) => { delete bundle.integrationCells[0].report.arms; }
  }),
  Object.freeze({
    guard: "per-wave-queue-dwell-maxima-present-for-q-recomputation", markerClass: "normal-cell",
    corrupt: (bundle) => { delete bundle.integrationCells[0].report.spans.perWave[3].maxQueueDwellMs; }
  }),
  Object.freeze({
    guard: "functional-and-opacity-gates-green", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.integrationCells[0].report.gates.opacity = false; }
  }),
  Object.freeze({
    guard: "every-worker-warmed-before-baseline", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.architectureResourceCells[0].report.warmUp.maxActiveDuringWarmUp = 1; }
  }),
  Object.freeze({
    guard: "rss-sampled-every-5ms-while-jobs-in-flight", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.architectureResourceCells[0].report.inFlight.sampleCount = 0; }
  }),
  Object.freeze({
    guard: "positive-control-drives-plateau-detector-red", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.retainedAllocationControl.report.plateau.red = false; }
  }),
  Object.freeze({
    // A flat working set reported as RED: the verdict must come from the waves.
    guard: "reported-plateau-verdict-matches-recomputed-waves", markerClass: "normal-cell",
    corrupt: (bundle) => {
      for (const wave of bundle.retainedAllocationControl.report.perWave) {
        wave.quiescentRssBytes = 300 * 1024 * 1024;
      }
    }
  }),
  Object.freeze({
    guard: "identical-eight-job-work-in-every-wave", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.architectureResourceCells[0].report.perWave[2].jobCount = 7; }
  }),
  Object.freeze({
    guard: "complete-rss-and-close-latency-evidence", markerClass: "normal-cell",
    corrupt: (bundle) => { delete bundle.architectureResourceCells[0].report.postCloseRssBytes; }
  }),
  Object.freeze({
    guard: "event-loop-progressed-during-every-wave", markerClass: "normal-cell",
    corrupt: (bundle) => {
      bundle.architectureResourceCells[0].report.perWave[1].eventLoopProgressTicks = 0;
    }
  }),
  Object.freeze({
    guard: "standalone-occupancy-slot-count-is-exact", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.occupancy[1].occupiedSlots = 7; }
  }),
  Object.freeze({
    guard: "standalone-rss-readings-finite", markerClass: "normal-cell",
    corrupt: (bundle) => { delete bundle.standaloneCells[0].report.baselineRssBytes; }
  }),
  Object.freeze({
    guard: "artifact-hash-set-complete", markerClass: "custody",
    corrupt: (bundle) => {
      delete bundle.custody.artifactHashes["run-claude-T1-3worker-ab-diagnostic.sh"];
    }
  }),
  Object.freeze({
    guard: "launch-authority-bound-to-this-evidence-set", markerClass: "custody",
    corrupt: (bundle) => { bundle.launchAuthority.authoritySha256 = "0".repeat(64); }
  }),
  Object.freeze({
    guard: "ordinary-resource-cell-closes-with-zero-handles", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.architectureResourceCells[0].report.lifecycle.liveHandles = 1; }
  }),
  Object.freeze({
    guard: "unconfirmed-death-fails-closed-and-retains-custody", markerClass: "normal-cell",
    corrupt: (bundle) => {
      const cell = bundle.architectureFaultCells
        .find((candidate) => candidate.faultName === "fault-unconfirmed-death");
      cell.report.closeRejectedTyped = false;
      cell.report.retainedRetiringHandles = 0;
    }
  }),
  Object.freeze({
    guard: "live-and-physical-handles-never-exceed-three", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.architectureFaultCells[0].report.maxPhysicallyAlive = 4; }
  }),
  Object.freeze({
    guard: "standalone-100-percent-is-1572864-of-1572864-slots", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.occupancy[3].occupiedSlots = 1000; }
  }),
  Object.freeze({
    guard: "standalone-100-percent-touched-every-expiry-page", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.occupancy[3].sentinelExpiryEntries = 0; }
  }),
  Object.freeze({
    guard: "standalone-cleanup-in-truthful-order", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.cleanup.order = ["pool-close"]; }
  }),
  Object.freeze({
    guard: "one-pool-object-reaches-repository-and-service", markerClass: "normal-cell",
    corrupt: (bundle) => { bundle.standaloneCells[0].report.sharedPoolIdentityProven = false; }
  }),
  Object.freeze({
    guard: "vitest-mutant-exits-nonzero", markerClass: "mutant",
    corrupt: (bundle) => { bundle.vitestMutants[0].rawStatus = 0; }
  }),
  Object.freeze({
    guard: "vitest-mutant-selected-at-least-one-test", markerClass: "mutant",
    corrupt: (bundle) => { bundle.vitestMutants[0].selectedTests = 0; }
  }),
  Object.freeze({
    guard: "vitest-mutant-source-restored-byte-identically", markerClass: "mutant",
    corrupt: (bundle) => { bundle.vitestMutants[0].restoredSha256 = "0".repeat(64); }
  }),
  Object.freeze({
    guard: "adjudicator-mutant-replaced-exactly-one-anchor-site", markerClass: "mutant",
    corrupt: (bundle) => { bundle.adjudicatorMutants[0].anchorReplacementCount = 2; }
  }),
  Object.freeze({
    guard: "clean-adjudicator-self-test-exits-zero", markerClass: "mutant",
    corrupt: (bundle) => { bundle.adjudicatorCleanControl.rawStatus = 1; }
  })
]);

function runSelfTest() {
  const problems = [];
  const exercised = [];

  // 1. The mutation anchors must each occur exactly once in this source.
  const source = readFileSync(ADJUDICATOR_PATH, "utf8");
  for (const anchor of [ANCHOR_M8, ANCHOR_M9, ANCHOR_M10]) {
    const occurrences = source.split(anchor).length - 1;
    if (occurrences !== 1) {
      problems.push(`anchor-occurs-exactly-once:${anchor}:${occurrences}`);
    }
  }

  // 2. The published sign-test arithmetic must reproduce the packet's constants.
  const nineOfTen = oneSidedSignProbability(9, 10);
  if (nineOfTen !== 0.0107421875) problems.push("sign-test-9-of-10-is-11-over-1024");
  if (!(nineOfTen <= BONFERRONI_ALPHA)) problems.push("sign-test-satisfies-bonferroni-alpha");
  const interval = clopperPearsonInterval(9, 10, CLOPPER_PEARSON_CONFIDENCE);
  if (!(interval.lower > 0.4 && interval.lower < 0.6 && interval.upper > 0.99)) {
    problems.push("clopper-pearson-9-of-10-interval-plausible");
  }
  if (clopperPearsonInterval(10, 10, CLOPPER_PEARSON_CONFIDENCE).upper !== 1) {
    problems.push("clopper-pearson-upper-bound-at-full-count");
  }

  // 3. The clean bundle must produce a lawful scientific marker and no failures.
  const cleanVerdict = adjudicate(cleanSyntheticBundle());
  if (cleanVerdict.blocked) {
    problems.push(`clean-bundle-unblocked:${cleanVerdict.failures.map((f) => f.guard).join("|")}`);
  } else if (!Object.values(SCIENTIFIC_MARKERS).includes(cleanVerdict.summary.marker)) {
    problems.push("clean-bundle-emits-a-lawful-scientific-marker");
  } else if (cleanVerdict.summary.marker !== SCIENTIFIC_MARKERS.reproduced) {
    // The clean fixture is built with two-worker H at 500 ms (historical
    // severity) and every three-worker cell green, so the strongest marker is
    // the expected one. Anything else means the mapping moved.
    problems.push(`clean-bundle-marker-mapping:${cleanVerdict.summary.marker}`);
  }

  // 4. The NOT-REPRODUCED path must NOT reach the causal marker. This is the
  //    fixture that mutant 9 has to fail.
  const notReproduced = clone(cleanSyntheticBundle());
  for (const cell of notReproduced.integrationCells) {
    if (cell.workers === 2) {
      cell.report.arms = { existingProvisionMaxMs: 440, missingProvisionMaxMs: 430 };
      cell.report.endpoints.H = 440;
      cell.report.endpoints.clampHeadroomMs = 600 - (440 + 135);
    }
  }
  const notReproducedVerdict = adjudicate(notReproduced);
  if (notReproducedVerdict.blocked
    || notReproducedVerdict.summary.marker !== SCIENTIFIC_MARKERS.ordinary) {
    problems.push("not-reproduced-maps-to-ordinary-not-causal-marker");
  }
  exercised.push("not-reproduced-maps-to-ordinary-not-causal-marker");

  // 5. A reversal on both endpoints must reach the contradiction marker.
  const contradicting = clone(cleanSyntheticBundle());
  for (const cell of contradicting.integrationCells) {
    const worse = cell.workers === 3;
    const H = worse ? 500 : 300;
    const Q = worse ? 200 : 20;
    cell.report.arms = { existingProvisionMaxMs: H, missingProvisionMaxMs: H - 10 };
    for (const wave of cell.report.spans.perWave) wave.maxQueueDwellMs = Q;
    cell.report.endpoints.H = H;
    cell.report.endpoints.Q = Q;
    cell.report.endpoints.clampHeadroomMs = 600 - (H + 135);
  }
  const contradictingVerdict = adjudicate(contradicting);
  if (contradictingVerdict.blocked
    || contradictingVerdict.summary.marker !== SCIENTIFIC_MARKERS.contradicts) {
    problems.push("both-endpoints-reversed-maps-to-contradiction-marker");
  }
  exercised.push("both-endpoints-reversed-maps-to-contradiction-marker");

  // 6. Every named guard fires on its own corruption, under the right class.
  for (const testCase of SELF_TEST_CASES) {
    const bundle = clone(cleanSyntheticBundle());
    testCase.corrupt(bundle);
    const verdict = adjudicate(bundle);
    if (!verdict.blocked) {
      problems.push(`guard-fires:${testCase.guard}`);
      continue;
    }
    const fired = verdict.failures.some((failure) => failure.guard === testCase.guard);
    if (!fired) problems.push(`guard-named:${testCase.guard}`);
    if (verdict.marker !== blockedMarker(testCase.markerClass)) {
      problems.push(`guard-marker-class:${testCase.guard}`);
    }
    exercised.push(testCase.guard);
  }

  process.stdout.write(`[T1_N3_AB_SELF_TEST] ${JSON.stringify({
    anchors: [ANCHOR_M8, ANCHOR_M9, ANCHOR_M10],
    guardsExercised: exercised,
    guardCount: exercised.length,
    problems
  })}\n`);
  if (problems.length > 0) {
    process.stdout.write(`${blockedMarker("mutant")}\n`);
    return 2;
  }
  process.stdout.write("T1 THREE-WORKER A/B ADJUDICATOR SELF-TEST CLEAN\n");
  return 0;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") return runSelfTest();
  if (argv.length !== 5 || argv[1] !== "--literal-carrier" || argv[3] !== "--run-commitment") {
    process.stderr.write(
      "T1_N3_AB_USAGE: node T1-3worker-ab-adjudicator.mjs <manifest.json> "
      + "--literal-carrier <carrier> --run-commitment <64hex> | --self-test\n"
    );
    return 3;
  }

  // The carrier is the only place raw generated literals exist at adjudication
  // time. It is wrapper-owned, mode 0600, excluded from the scan set and
  // destroyed by the wrapper afterwards; nothing here copies it anywhere.
  let carrierReal;
  let literals;
  try {
    carrierReal = realpathSync(resolve(argv[2]));
    literals = readFileSync(carrierReal, "utf8")
      .split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    process.stdout.write(`[T1_N3_AB_FAILED_ASSERTIONS] ${JSON.stringify([
      { markerClass: "secret", guard: "generated-literal-carrier-readable", detail: null }
    ])}\n`);
    process.stdout.write(`${blockedMarker("secret")}\n`);
    return 2;
  }

  let bundle;
  try {
    bundle = loadBundle(argv[0], carrierReal, literals, argv[4]);
  } catch (error) {
    const code = error instanceof InvocationError ? error.message : "T1_N3_AB_MANIFEST_UNREADABLE";
    process.stdout.write(`[T1_N3_AB_FAILED_ASSERTIONS] ${JSON.stringify([
      { markerClass: "custody", guard: "manifest-readable-and-contained", detail: code }
    ])}\n`);
    process.stdout.write(`${blockedMarker("custody")}\n`);
    return 2;
  }

  const verdict = adjudicate(bundle);
  if (verdict.blocked) {
    process.stdout.write(`[T1_N3_AB_FAILED_ASSERTIONS] ${JSON.stringify(verdict.failures)}\n`);
    process.stdout.write(`${verdict.marker}\n`);
    return 2;
  }
  process.stdout.write(`[T1_N3_AB_ADJUDICATION] ${JSON.stringify(verdict.summary)}\n`);
  process.stdout.write(`${verdict.summary.marker}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
