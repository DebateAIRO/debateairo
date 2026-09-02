import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { RunRepository, migrate } from "@debateai/db";
import { CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY } from "@debateai/register";
import { computeStructuralCeilingBasis } from "@debateai/register";
import {
  createPostgresProviderGateway,
  WalkingSkeletonRunner,
  type WalkingSkeletonSettings
} from "@debateai/runner";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { withRequestDerivedBearings } from "../support/reviewBearings.js";

/**
 * T17 · the DoD's maximum-path LEDGER-COUNT test (codex r1 B1).
 *
 * The unit test in `tests/unit/t17-envelope.test.ts` enumerates call sites in
 * memory and compares that sum to the closed form — it proves the formula
 * against a second model of the same topology, never against a run. This file
 * closes that gap: it drives a real M=2 debate to completion through controlled
 * providers, then reads the OBSERVED attempt count out of `ledger.ledger_entry`
 * and asserts the recomputed ceiling covers it — panel attempts included,
 * counted from the same ledger by their own `PANEL:` call-site namespace.
 *
 * MAXIMUM PATH, and every reachable namespace is in it. Each site is driven to
 * the LAST provider attempt it is allowed and succeeds there:
 *
 *   author + reviewer (cooldown-wrapped judge sites): 4 attempts each.
 *     `withCooldownRetry` runs two sequences, but the gateway counts attempts
 *     CUMULATIVELY per call-site key and passes `remaining = maxAttempts -
 *     consumed` (apps/runner/src/index.ts:3565-3577), so the two sequences
 *     share ONE allowance: judgeMaxAttempts (3) + finalRetry (1). An earlier
 *     draft modelled this site at 7 and THIS TEST measured 4, refuting it.
 *   panel: 3 attempts each — one sequence, judgeMaxAttempts, no cooldown wrap.
 *   serve: 3 attempts at EVERY reachable site. Round 1's conformance is driven
 *     to a valid-but-false verdict so the recompose loop runs a SECOND round,
 *     which then passes. That is what makes this the maximum rather than a
 *     bracketing run: an earlier draft gave the serve organs a zero failure
 *     budget and always answered `conforms: true`, so one composition round ran
 *     and four serve calls answered first time (92 attempts total). 92 sits
 *     above the old ceiling and below the new one — it proves the old ceiling
 *     would have refused a lawful run, which stands — but it is NOT a maximum
 *     and is not quoted as one.
 *
 * The serve topology this run MEASURES is the second correction: the chain
 * (packages/serve/src/index.ts:505-580) calls composer + conformance inside the
 * recompose loop and post-compose R9 ONCE AFTER it, so the maximum is
 * 2 composers + 4 conformance + 1 R9 = SEVEN sites — not the eight that
 * `maxRecompose * ENGINE_FIXED_ORGANS_PER_COMPOSITION` bills by multiplying a
 * per-run organ across rounds.
 */

let database: TestDatabase;

const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:t17" });

/** The ruled bounds this run is driven under. Mirrored into the ceiling below. */
const JUDGE_MAX_ATTEMPTS = 3;
const ORGAN_MAX_ATTEMPTS = 3;
const FINAL_RETRY_ATTEMPTS = 1;
/** Cumulative per call-site key: sequence 2 gets only the final retry. */
const ATTEMPTS_PER_COOLDOWN_SITE = JUDGE_MAX_ATTEMPTS + FINAL_RETRY_ATTEMPTS;
/** A panel member call is one sequence, not cooldown-wrapped. */
const ATTEMPTS_PER_PANEL_SITE = JUDGE_MAX_ATTEMPTS;
/** Serve organs are not cooldown-wrapped either: one sequence, organ bound. */
const ATTEMPTS_PER_SERVE_SITE = ORGAN_MAX_ATTEMPTS;
/** 2 composers + (2 rounds x 2 segments) conformance + 1 post-compose R9. */
const SERVE_SITES = 2 + 2 * 2 + 1;

/** M=2, depth=1: 2 roots + 4 expansion children + 2 cross-root exchange nodes. */
const MATERIALIZED_NODES = 8;
const PANEL_SIZE = 2;

function judgementDouble(statement: string, fidelity = 0.72): string {
  return JSON.stringify({
    statement,
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: statement,
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    steelman: { summary: statement, fidelity },
    critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 },
    context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}

const PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: 0 },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 },
  context: { fit: 0, ambiguityFlags: [] },
  fallacy: { severity: 1, fatalFlags: [] }
});

const COMPOSITION = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "The judged position survives.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });

type RequestKind = "PANEL" | "REVIEW" | "JUDGE" | "CONFORMANCE" | "R9" | "COMPOSE";

function classify(body: string): RequestKind {
  if (body.includes("Assess an existing debate node authored by another maker")) return "PANEL";
  if (body.includes("Review an existing debate node")) return "REVIEW";
  if (body.includes("restatement_text")) return "JUDGE";
  if (body.includes("conforms,findings")) return "CONFORMANCE";
  if (body.includes("{pass}")) return "R9";
  if (body.includes("served_number_refs")) return "COMPOSE";
  return "JUDGE";
}

/**
 * A provider double that drives EVERY reachable namespace to its maximum.
 *
 * Each site fails to its last allowed attempt and succeeds there: cooldown-
 * wrapped judge sites at 4 (the two sequences share one cumulative allowance),
 * panel sites at 3, and serve sites at 3. Failures are counted PER SITE, keyed
 * by the request packet and reset on that site's success, because a single
 * global counter cannot survive the interleaving. Round 1's conformance also
 * returns a VALID but false verdict so the recompose loop runs a second round
 * — that verdict, not a transport failure, is what makes the serve leg maximal.
 */
async function startMaximumPathProvider(label: string): Promise<{
  readonly endpoint: string;
  counts(): Readonly<Record<RequestKind, number>>;
  /** Per-packet attempt totals, for diagnosing a run that did not take the max path. */
  attempts(): readonly number[];
  stop(): Promise<void>;
}> {
  const counts: Record<RequestKind, number> = {
    PANEL: 0, REVIEW: 0, JUDGE: 0, CONFORMANCE: 0, R9: 0, COMPOSE: 0
  };
  /**
   * Failures are counted PER SITE, keyed by the request packet itself, and the
   * count RESETS on that site's success. A single global counter cannot survive
   * the interleaving: panel and serve legs land between a judge site's two
   * sequences, and two sites can legitimately send identical packets.
   */
  const failuresByPacket = new Map<string, number>();
  const attemptsByPacket = new Map<string, number>();
  const contentResponsesByPacket = new Map<string, number>();
  /**
   * The recompose loop breaks as soon as every segment conforms, so a maximum
   * path needs round 1 to fail on a real verdict — not on transport. Each
   * segment's FIRST content response is round 1 and returns `conforms: false`;
   * its second is round 2 and passes.
   */
  const conformanceVerdict = (packetKey: string): { conforms: boolean; findings: string[] } => {
    const seen = (contentResponsesByPacket.get(packetKey) ?? 0) + 1;
    contentResponsesByPacket.set(packetKey, seen);
    return seen === 1
      ? { conforms: false, findings: ["test-layer: first composition round is rejected"] }
      : { conforms: true, findings: [] };
  };
  let served = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const kind = classify(body);
      counts[kind] += 1;
      served += 1;
      // EVERY reachable namespace is driven to its final allowed attempt.
      const failureBudget = kind === "PANEL" ? ATTEMPTS_PER_PANEL_SITE - 1
        : kind === "COMPOSE" || kind === "CONFORMANCE" || kind === "R9"
          ? ATTEMPTS_PER_SERVE_SITE - 1
          : ATTEMPTS_PER_COOLDOWN_SITE - 1;
      const packetKey = `${kind}:${createHash("sha256").update(body).digest("hex")}`;
      attemptsByPacket.set(packetKey, (attemptsByPacket.get(packetKey) ?? 0) + 1);
      if (failureBudget > 0) {
        const failures = failuresByPacket.get(packetKey) ?? 0;
        if (failures < failureBudget) {
          failuresByPacket.set(packetKey, failures + 1);
          response.writeHead(503, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "test-layer transport failure" }));
          return;
        }
        failuresByPacket.set(packetKey, 0);
      }
      const content = kind === "PANEL" ? PANEL_ASSESSMENT
        : kind === "REVIEW"
          // T5/S3-1: a review artifact carries one bearing per edge THAT CALL
          // offered, so the policy is expanded against the live request body.
          ? withRequestDerivedBearings(
            JSON.stringify({
              outcome: "agree",
              reasons: [`${label} review`],
              edge_bearings: { __policy: "cannot-assess" }
            }),
            body
          )
          : kind === "COMPOSE" ? COMPOSITION
            : kind === "CONFORMANCE"
              // Round 1 returns a VALID but false verdict, so the chain
              // recomposes; round 2 passes and the run still completes. Counted
              // per packet, so each segment's first content response is round 1.
              ? JSON.stringify(conformanceVerdict(packetKey))
              : kind === "R9" ? JSON.stringify({ pass: true })
                : judgementDouble(`${label} position ${served}`);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `t17-${label}-${served}`,
        model: "test-layer/model",
        choices: [{ message: { content } }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T17_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    counts: () => Object.freeze({ ...counts }),
    attempts: () => Object.freeze([...attemptsByPacket.values()].sort((a, b) => a - b)),
    async stop() { server.close(); await once(server, "close"); }
  };
}

/** The ceiling this run is admitted under — the same function admission calls. */
const ceilingBasis = computeStructuralCeilingBasis({
  panelSize: PANEL_SIZE,
  depth: 1,
  judgeMaxAttempts: JUDGE_MAX_ATTEMPTS,
  organMaxAttempts: ORGAN_MAX_ATTEMPTS,
  maxRecompose: 2,
  maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: FINAL_RETRY_ATTEMPTS,
  branchingFactor: 2,
  compositionSegmentCap: 2,
  fixedOrgansPerComposition: 4,
  reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3,
  evaluatorMaxRounds: 3,
  maxDepth: 5
});

function runnerSettings(): WalkingSkeletonSettings {
  return {
    workerId: "runner:t17", claimMs: 1_204_000, claimMarginMs: 1_000,
    judgeBound: { maxAttempts: JUDGE_MAX_ATTEMPTS, tokenCeiling: 256, deadlineMs: 2_000 },
    composerBound: { maxAttempts: ORGAN_MAX_ATTEMPTS, tokenCeiling: 256, deadlineMs: 2_000 },
    conformanceBound: { maxAttempts: ORGAN_MAX_ATTEMPTS, tokenCeiling: 256, deadlineMs: 2_000 },
    providerRef: "provider:test-layer", maker: "test-layer",
    judgeContractHash: "contract:judge:t17", composerContractHash: "contract:composer:t17",
    conformanceContractHash: "contract:conformance:t17",
    propagationContractHash: "contract:propagation:t17", serveContractHash: "contract:serve:t17",
    maxRecompose: 2, factBundleVersion: 1, judgementNumberKind: "base-probability",
    judgementProducer: "judgement:t17", propagationNumberKind: "propagated-probability",
    propagationProducer: "propagation:t17",
    compositionRow: {
      rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, registerVersion: 1, sourceRef: "test-layer:S04",
      value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: {
        unknown: {
          branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1,
          terms: [{ metric: "steelman_fidelity", coefficient: 1 }], caps: [],
          uncertaintyLadder: [{ atMost: 1, label: "TEST_LAYER" }]
        }
      } }
    },
    servePolicy: {
      compositionBudgets: {
        low: { tier: "low", bound: 10_000, registerRowKey: "compositionBundleBudget.low", registerVersion: 1, sourceRef: "test-layer:DR-078" },
        medium: { tier: "medium", bound: 20_000, registerRowKey: "compositionBundleBudget.medium", registerVersion: 1, sourceRef: "test-layer:DR-078" },
        high: { tier: "high", bound: 30_000, registerRowKey: "compositionBundleBudget.high", registerVersion: 1, sourceRef: "test-layer:DR-078" }
      },
      candidateConfidenceBand: "TEST_TOP_BAND",
      bandCeiling: {
        rowKey: "wayOfKnowingCeiling", registerVersion: 1, sourceRef: "test-layer:DR-086",
        value: {
          bandOrder: ["TEST_CAPPED_BAND", "TEST_TOP_BAND"],
          ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_LOOKED_UP_CEILING"],
          defaultCeiling: { label: "TEST_DEFAULT_CEILING", ceilingBand: "TEST_TOP_BAND", liftPath: "test-layer:retain-band" },
          cuts: [{
            minimumShares: { LOOKED_UP: 0.5 },
            label: "TEST_LOOKED_UP_CEILING", ceilingBand: "TEST_CAPPED_BAND",
            liftPath: "test-layer:improve-way-of-knowing"
          }]
        }
      }
    },
    judgementPolicy: {
      selectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "test-layer:selection-rule",
        registerVersion: 1, sourceRef: "test-layer:DR-077"
      },
      earnedWeight: 1, judgeWeightVersion: "test-layer:weight-v1", reducerVersion: "test-layer:reducer-v1"
    },
    panelPolicy: {
      registerVersion: 1, dispersionScale: 1, repeatedFamilyMultiplier: 0.5, disagreementThreshold: 0.25,
      oneStepDown: { TEST_CAPPED_BAND: "TEST_CAPPED_BAND", TEST_TOP_BAND: "TEST_CAPPED_BAND" },
      providerFamilies: [
        { familyRef: "test-layer:family:primary", providerRefs: ["provider:test-layer"] },
        { familyRef: "test-layer:family:secondary", providerRefs: ["provider:test-layer:secondary"] }
      ],
      unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
      sourceRefs: {
        dispersionScale: "test-layer:J1", repeatedFamilyMultiplier: "test-layer:J1",
        disagreementThreshold: "test-layer:J1", downgradeBands: "test-layer:J1",
        providerFamilyMap: "test-layer:J1"
      }
    },
    verdictLabelPolicy: {
      registerVersion: 1, gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25,
      sourceRefs: {
        verdictMarginGamma: "test-layer:goal-v4:80-96", verdictHighCut: "test-layer:goal-v4:80-96",
        verdictLowCut: "test-layer:goal-v4:80-96", disagreementThreshold: "test-layer:J1",
        disagreementQuantity: "test-layer:goal-v4:80-96"
      }
    },
    scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
    // Fixture provisioning only: run completion refuses to manufacture results
    // for outstanding WAIT rows, so the terminal evaluator is supplied exactly
    // as the sibling integration fixtures supply it.
    resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
      batteryRowId,
      state: "INACTIVE" as const,
      predicateInputs: {
        kind: "PRESENT" as const,
        values: { fixture: "T17", predicateResult: false, terminalEvaluation: true }
      },
      skipEvidence: {
        kind: "PRESENT" as const,
        evidenceType: "TEST_LAYER_TERMINAL_PREDICATE_RESULT",
        result: "FALSE_AT_COMPLETION"
      }
    }))
  };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

describe("T17 · the recomputed ceiling covers a maximum-path run's OBSERVED ledger attempts", () => {
  it("covers the attempt count read from the run's own ledger, panel attempts included", async () => {
    const primary = await startMaximumPathProvider("primary");
    const secondary = await startMaximumPathProvider("secondary");
    try {
      const question = `t17-envelope-max-path-${randomUUID()}`;
      const runRepository = new RunRepository(database.pool);
      const runId = await runRepository.startRun({
        questionLine: question, principal: { kind: "legacy", legacyAskerId: `asker:${question}` },
        sessionId: `session:${question}`, callerScope: "ASKER",
        asOf: new Date("2026-09-02T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
        tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${question}`,
        compositionBudgetTier: "low", depthParams: { depth: 1 },
        discoveredPanel: fixtureDiscoveredPanel(PANEL_SIZE), strangerSampleRate: 1,
        // THE POINT: the run head is pinned with the basis the recomputed
        // formula mints, so the ledger below is measured against the ceiling
        // this lane produces — not a fixture number chosen to fit.
        envelopeBasis: ceilingBasis,
        registerVersion: 1, batteryVersion: "s00", batteryRows
      });
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: `t17:${runId}`
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
      }), {
        ...runnerSettings(),
        runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: FINAL_RETRY_ATTEMPTS, maxCooldownHoldsPerRun: 2 },
        hiddenNodeScoreThreshold: { value: 0.35, sourceRef: "acceptance:DR-176:V-approved" },
        holdRecorder: {
          countCooldownHolds: (candidate) => runRepository.countCooldownHolds(candidate),
          record: (event) => runRepository.recordRunLifecycleEvent({
            runId: event.runId, kind: event.kind,
            value: {
              state: event.state, call_site_key: event.callSiteKey, parent_node_ref: event.parentNodeId,
              hold_ms: event.holdMs, hold_until: event.holdUntil, attempts_spent: event.attemptsSpent,
              transport_outcome: event.transportOutcome, planned_leg_count: event.plannedLegCount
            }
          }),
          wait: async () => undefined
        },
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint, model: "test-layer/secondary-model", maker: "Secondary test maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        }
      });

      let result: Awaited<ReturnType<WalkingSkeletonRunner["executeWorkItem"]>>;
      try {
        result = await runner.executeWorkItem(workItemId);
      } catch (error) {
        const diag = await database.pool.query<{ call_site_key: string; attempts: string; outcomes: string }>(
          `SELECT call_site_key, count(*)::text AS attempts,
                  string_agg(DISTINCT outcome, ',') AS outcomes
           FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'
           GROUP BY call_site_key ORDER BY call_site_key`,
          [runId]
        );
        console.error("T17 DIAG ledger:", JSON.stringify(diag.rows));
        console.error("T17 DIAG primary packet attempts:", JSON.stringify(primary.attempts()));
        console.error("T17 DIAG primary counts:", JSON.stringify(primary.counts()));
        console.error("T17 DIAG secondary counts:", JSON.stringify(secondary.counts()));
        throw error;
      }
      expect(result.kind).toBe("COMPLETED");

      // ---- everything below is read from THE SAME LEDGER -------------------
      const ledger = await database.pool.query<{
        total: string; panel: string; distinct_panel_sites: string;
      }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE call_site_key LIKE 'PANEL:%')::text AS panel,
                count(DISTINCT call_site_key) FILTER (WHERE call_site_key LIKE 'PANEL:%')::text
                  AS distinct_panel_sites
         FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='MODEL_CALL'`,
        [runId]
      );
      const observed = Number(ledger.rows[0]!.total);
      const panelAttempts = Number(ledger.rows[0]!.panel);
      const panelSites = Number(ledger.rows[0]!.distinct_panel_sites);
      const ceiling = ceilingBasis.max_model_attempts;

      // (1) PANEL ATTEMPTS ARE IN THIS COUNT. The panel leg has its own
      //     call-site namespace, so it is counted, not assumed: one call per
      //     non-author member at every materialized node.
      expect({ panelSites, panelAttempts }).toEqual({
        panelSites: (PANEL_SIZE - 1) * MATERIALIZED_NODES,
        panelAttempts: (PANEL_SIZE - 1) * MATERIALIZED_NODES * ATTEMPTS_PER_PANEL_SITE
      });

      // (2) The run really did take the maximum path: every cooldown-wrapped
      //     judge site spent BOTH sequences. Read off the ledger by call site.
      const perSite = await database.pool.query<{ call_site_key: string; attempts: string }>(
        `SELECT call_site_key, count(*)::text AS attempts
         FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'JUDGE:%'
         GROUP BY call_site_key ORDER BY call_site_key`,
        [runId]
      );
      expect(perSite.rows.length).toBeGreaterThan(0);
      expect(perSite.rows.every((row) => Number(row.attempts) === ATTEMPTS_PER_COOLDOWN_SITE)).toBe(true);

      // (2b) THE SERVE LEG, MEASURED per namespace from the same ledger. This
      //      is the second correction: R9 appears ONCE for the run, not once
      //      per recompose round, so the maximum is SEVEN sites and not the
      //      eight `maxRecompose * fixedOrgansPerComposition` bills.
      const serve = await database.pool.query<{ call_site_key: string; attempts: string }>(
        `SELECT call_site_key, count(*)::text AS attempts
         FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='MODEL_CALL'
           AND (call_site_key LIKE 'COMPOSER:%' OR call_site_key LIKE 'CONFORMANCE:%'
                OR call_site_key LIKE 'POST_COMPOSE_R9:%')
         GROUP BY call_site_key ORDER BY call_site_key`,
        [runId]
      );
      expect(serve.rows.map((row) => `${row.call_site_key}=${row.attempts}`)).toEqual([
        "COMPOSER:1=3", "COMPOSER:2=3",
        "CONFORMANCE:1:0=3", "CONFORMANCE:1:1=3",
        "CONFORMANCE:2:0=3", "CONFORMANCE:2:1=3",
        // Keyed by the LAST composition round, not by a round of its own —
        // which is itself the evidence that R9 runs once AFTER the loop.
        "POST_COMPOSE_R9:2=3"
      ]);
      expect(serve.rows).toHaveLength(SERVE_SITES);
      // BOTH composition rounds ran: round 2's sites exist at all.
      expect(serve.rows.some((row) => row.call_site_key === "COMPOSER:2")).toBe(true);
      // The receipt's own composition count agrees with what the run opened.
      expect(ceilingBasis.serve_leg).toMatchObject({
        composition_sites: SERVE_SITES,
        composition_sites_per_round: 3,
        post_compose_sites_per_run: 1
      });

      // (3) THE DoD: the recomputed ceiling COVERS the observed attempt count.
      //     The total is pinned EXACTLY, not merely compared — a comparison any
      //     state satisfies is not evidence (D27 ADDENDUM).
      expect(observed).toBe(8 * ATTEMPTS_PER_COOLDOWN_SITE
        + 8 * ATTEMPTS_PER_COOLDOWN_SITE
        + 8 * ATTEMPTS_PER_PANEL_SITE
        + SERVE_SITES * ATTEMPTS_PER_SERVE_SITE);
      expect(observed).toBe(109);
      expect(observed).toBeLessThanOrEqual(ceiling);
      // The ceiling is TIGHT: at the true maximum path it is spent exactly.
      expect(ceiling).toBe(109);

      // (4) …and the DR-184-v2 ceiling for this exact topology would have been
      //     BREACHED by this same run. Without this arm, (3) is satisfiable by
      //     any ceiling large enough, and the undercount stays a derivation.
      // v2 = (authored + reviews) * (judge + final) + fixedSites * organ, with
      // NO panel term. Every attempt this run spent above it is a panel attempt.
      const dr184v2Ceiling = (MATERIALIZED_NODES + MATERIALIZED_NODES)
        * (JUDGE_MAX_ATTEMPTS + FINAL_RETRY_ATTEMPTS)
        + 2 * 4 * ORGAN_MAX_ATTEMPTS;
      expect(dr184v2Ceiling).toBe(88);
      expect(observed).toBeGreaterThan(dr184v2Ceiling);

      // (5) THE BOUNDARY, measured — and under J28 it is WITHIN.
      //     `assertModelAttemptAllowed` PERMITS exactly `max` attempts (it
      //     refuses at `consumed >= max`), so this run spent exactly what the
      //     structure allows and exceeded nothing. J28 rules the REPORTING
      //     comparison to follow the PERMISSION comparison: WITHIN while
      //     `consumed <= max`. Before that ruling this state reported
      //     EXHAUSTED, which fired the envelope terminal and REPLACED the
      //     answer the chain had just served — a lawful run losing its answer
      //     for spending its whole envelope. V-S09-8 records the alternative.
      const envelopeState = await database.pool.query<{ value_json: unknown }>(
        `SELECT DISTINCT ON (kind) value_json
         FROM core.run_progress_event
         WHERE run_id=$1 AND kind='ENVELOPE_STATE' ORDER BY kind, at_seq DESC`,
        [runId]
      );
      expect(envelopeState.rows[0]?.value_json).toBe("WITHIN");
      expect(observed).toBe(ceiling);

      // (6) THE ANSWER SURVIVES. The served answer is the one the chain
      //     produced, not an envelope terminal that replaced it.
      expect(result.kind).toBe("COMPLETED");
      const answer = await database.pool.query<{ terminal: string; condition_marks: readonly string[] }>(
        `SELECT terminal, condition_marks FROM serve.answer
         WHERE run_id=$1 ORDER BY answer_version DESC LIMIT 1`,
        [runId]
      );
      // Non-vacuous: the row must EXIST before its marks mean anything. An
      // assertion over `rows[0]?.x ?? []` passes when the query found nothing.
      expect(answer.rows).toHaveLength(1);
      const marks = answer.rows[0]!.condition_marks;
      expect(Array.isArray(marks)).toBe(true);
      expect(marks).not.toContain("ENVELOPE_EXHAUSTED");
      // The terminal is the chain's own, not the envelope's. These nodes are all
      // REASONING, so the ruled terminal is DOWNGRADED (GATE4_Q51_DOWNGRADE).
      expect(answer.rows[0]!.terminal).toBe("DOWNGRADED");
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  }, 240_000);
});
