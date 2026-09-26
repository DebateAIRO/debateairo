import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import { readPanelWeightingControls } from "@debateai/register";
import { acceptanceServiceRequestHeaders, createAcceptanceRuntime } from "./main.js";
import { ACCEPTANCE_REGISTER_VERSION, seedAcceptanceRegister } from "./seed-register.js";
import { bearingsForRequest } from "../tests/support/reviewBearings.js";
import { evaluatorSatisfied, isEvaluatorPacket } from "./test-fixtures/evaluator-double.js";
import { argumentLanguageDirective } from "@debateai/kernel";
import { buildFramedPrompt, type PromptContract } from "@debateai/providers";
import { PANEL_PROMPT_CONTRACT, judgePromptContract, reviewPromptContract } from "@debateai/judgement";
import { SYNTHESIZER_PROMPT_CONTRACT } from "@debateai/serve";
import { EVALUATOR_PROMPT_CONTRACT } from "@debateai/runner";

/**
 * T3 / S2-2 — the ACCEPTANCE-path receipt for the wired judge panel.
 *
 * Every authored node is assessed by every OTHER healthy maker; the author's
 * own assessment is one member. This test drives a real M=2 run through the
 * real API and runner over two provider doubles (no live provider calls), then
 * re-reads `ledger.reduced_judgement` and proves the panel is LIVE in the
 * persisted receipt: >= 2 panel contract hashes and a non-null dispersion on
 * every authored node, plus the family discount recorded in the receipt.
 *
 * RED on the unmodified base: the single-judge skeleton persists
 * `dispersion: null` and a one-element `panel_contract_hashes`.
 */

let database: StandingDatabase;
let dataDirectory: string;
let primaryProvider: ProviderDouble;
let secondProvider: ProviderDouble;

interface ProviderDouble {
  readonly endpoint: string;
  readonly assessCallCount: () => number;
  readonly unclassifiedCalls: () => readonly string[];
  /** confirm-item 5: make this maker refuse every PANEL leg it is asked for. */
  readonly failAssessCalls: (enabled: boolean) => void;
  stop(): Promise<void>;
}

/**
 * The candidate confidence band the acceptance runtime boots with
 * (`createAcceptanceRuntime` → servePolicy.candidateConfidenceBand). Named here
 * so the downgrade assertion below can ask T16's own map what one step down
 * from it is, instead of restating the answer.
 */
const ACCEPTANCE_CANDIDATE_BAND = "FULL";

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PORT_RESOLUTION_FAILED");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

/** Scores are per-maker so the panel's members genuinely disagree (dispersion > 0). */
interface DoubleScores {
  readonly fidelity: number;
  readonly counterargumentStrength: number;
  readonly quality: number;
  readonly severity: number;
}

function assessmentBody(scores: DoubleScores): Record<string, unknown> {
  return {
    steelman: { summary: "The strongest reading of the supplied statement.", fidelity: scores.fidelity },
    critic: {
      summary: "A plausible counter to the supplied statement.",
      counterargumentStrength: scores.counterargumentStrength,
      basis: "PLAUSIBLE_COUNTER"
    },
    evidence: { quality: scores.quality, relevance: scores.quality },
    context: { fit: scores.quality, ambiguityFlags: [] },
    fallacy: { severity: scores.severity, fatalFlags: [] }
  };
}

function judgementBody(statement: string, scores: DoubleScores): string {
  return JSON.stringify({
    statement,
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: statement,
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    ...assessmentBody(scores)
  });
}

/**
 * S-LANG (as `tests/integration/database.test.ts` and `t17-envelope-ledger.test.ts`
 * do): every packet's instruction now ends with the argument-language directive,
 * which NAMES the machine-consumed identifiers it protects (`fatalFlags[].type`,
 * `served_number_refs`, …). Those bare identifiers are exactly what the
 * discriminators below key on, so the directive — whatever language it names —
 * is removed from the body before any branch reads it. The directive has no
 * character JSON escapes, so it appears in the raw body byte-for-byte.
 */
const ARGUMENT_LANGUAGE_DIRECTIVE_PATTERN = new RegExp(
  argumentLanguageDirective("\u0000")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\u0000", "[^.]+?"),
  "gu"
);

type RequestClass = "PANEL" | "REVIEW" | "EVALUATOR" | "COMPOSE" | "JUDGE" | "HEALTH" | "UNCLASSIFIED";

/**
 * Signals are chosen to survive JSON escaping of the rendered packet: a
 * quoted fragment appears as \" in the wire body and would never match.
 *
 * W7 / V-BLIND-CONTEXT: they are also STRUCTURAL now — keys of each
 * organ's JSON contract rather than sentences of its prompt. The prose
 * these replace was changed by a ruling, both branches went dead, and the
 * panel silently ran with one member. Measured on the shipped prompts:
 * `edge_bearings` is the review prompt alone, while every assessment key
 * is in the JUDGE prompt too (judge embeds the whole assessment schema),
 * so the panel is the assessment WITHOUT the judge's `restatement_text` —
 * a negative pinned by `tests/unit/t03-judge-panel.test.ts`.
 */
function classifyRequest(rawBody: string): RequestClass {
  const body = rawBody.replace(ARGUMENT_LANGUAGE_DIRECTIVE_PATTERN, "");
  if (body.includes("fatalFlags") && !body.includes("restatement_text")) return "PANEL";
  if (body.includes("edge_bearings")) return "REVIEW";
  if (isEvaluatorPacket(body)) return "EVALUATOR";
  if (body.includes("served_number_refs")) return "COMPOSE";
  if (body.includes("restatement_text")) return "JUDGE";
  if (body.includes("discovery health probe")) return "HEALTH";
  return "UNCLASSIFIED";
}

/**
 * A GENERATIVE double: it classifies each request by the contract the runner
 * renders and answers in kind. Fixed FIFO queues would have to be re-sized by
 * hand for every extra panel leg; classifying is what keeps this honest.
 */
async function startProviderDouble(input: {
  readonly label: string;
  readonly scores: DoubleScores;
}): Promise<ProviderDouble> {
  let assessCalls = 0;
  let calls = 0;
  let failAssess = false;
  const unclassified: string[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      calls += 1;
      // Classification: `classifyRequest` (directive-stripped, structural keys).
      const requestClass = classifyRequest(body);
      let content: string;
      if (requestClass === "PANEL") {
        assessCalls += 1;
        if (failAssess) {
          // A member that answers with prose is a PARSE_FAILURE, not a
          // transport fault: it exercises the parse leg of confirm-item 5
          // without spending the run's transport-retry envelope.
          content = "I decline to assess another maker's node.";
        } else {
          content = JSON.stringify(assessmentBody(input.scores));
        }
      } else if (requestClass === "REVIEW") {
        // T5/S3-1: one bearing per edge THIS call offered, read off the wire.
        // This double does not assess bearings, so every offered edge comes
        // back cannot-assess (null) and stays UNKNOWN — which is why T3's panel
        // numbers below are byte-identical to the day this lane landed.
        content = JSON.stringify({
          outcome: "agree",
          reasons: [`${input.label} review ${calls}`],
          edge_bearings: bearingsForRequest(body)
        });
      } else if (requestClass === "EVALUATOR") {
        // F-SEALEDROWS-B: T9 replaced the retired `{conforms,findings}` and
        // `{pass}` branches that stood here with ONE evaluator verdict. Both
        // retired branches were dead: measured before this repair, the
        // evaluator call matched no branch at all and this double refused it
        // with `PANEL_DOUBLE_UNCLASSIFIED_CALL`, printing the packet verbatim.
        // The discriminator is the SHIPPED prompt (see
        // `test-fixtures/evaluator-double.ts`), so it cannot go stale silently.
        content = evaluatorSatisfied();
      } else if (requestClass === "COMPOSE") {
        content = JSON.stringify({
          segments: [
            {
              segment_id: "segment:verdict",
              text: "A panel-assessed acceptance answer.",
              node_refs: ["primary"],
              served_number_refs: ["number:final-strength"]
            },
            { segment_id: "segment:next", text: "Seek a third independent lineage.", node_refs: [], served_number_refs: [] }
          ]
        });
      } else if (requestClass === "JUDGE") {
        content = judgementBody(`${input.label} position ${calls}.`, input.scores);
      } else if (requestClass === "HEALTH") {
        content = "panel-health-probe";
      } else {
        // Never guess: an unclassified call names itself so a fixture gap can
        // never masquerade as a production failure.
        unclassified.push(body.slice(0, 300));
        response.writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "PANEL_DOUBLE_UNCLASSIFIED_CALL" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `${input.label}-${calls}`,
        model: "test-layer/model",
        choices: [{ message: { content } }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    assessCallCount: () => assessCalls,
    unclassifiedCalls: () => Object.freeze([...unclassified]),
    failAssessCalls: (enabled: boolean) => { failAssess = enabled; },
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-panel-"));
  database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
  primaryProvider = await startProviderDouble({
    label: "OpenAI",
    scores: { fidelity: 0.72, counterargumentStrength: 0.28, quality: 0.72, severity: 0.28 }
  });
  // The second maker genuinely disagrees, so the measured dispersion is a real
  // spread and not an artefact of two identical doubles.
  secondProvider = await startProviderDouble({
    label: "Anthropic",
    scores: { fidelity: 0.4, counterargumentStrength: 0.55, quality: 0.4, severity: 0.5 }
  });
  await seedAcceptanceRegister(database.pool);
});

afterAll(async () => {
  await secondProvider?.stop();
  await primaryProvider?.stop();
  await database?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("T3 / S2-2 — the judge panel is live on the acceptance path (author != judge)", () => {
  it("persists one reduced judgement per node carrying >= 2 panel members and a measured dispersion", async () => {
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      serviceCredential: "p".repeat(43),
      environment: {
        DATABASE_URL: database.connectionString,
        API_HOST: "127.0.0.1",
        API_PORT: 8_000,
        STRANGER_SAMPLE_RATE: 1,
        BATTERY_VERSION: "acceptance:panel",
        SETTLEMENT_WATCH_HANDLE: "acceptance:panel:watch",
        MODEL_BASE_URL: primaryProvider.endpoint
      },
      makerRelays: [
        {
          providerRef: "acceptance:codex-cli",
          baseUrl: primaryProvider.endpoint,
          model: "test-layer/model",
          authorizationHeader: "Bearer test-panel-primary"
        },
        {
          providerRef: "acceptance:claude-cli",
          baseUrl: secondProvider.endpoint,
          model: "test-layer/model",
          authorizationHeader: "Bearer test-panel-second"
        }
      ]
    });
    try {
      const origin = "http://127.0.0.1:8000";
      const ask = await runtime.api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, true),
        payload: {
          question_line: "Should a software company adopt a four-day workweek?",
          risk_tier: "standard",
          tier_source: "ASKER",
          tier_provenance_ref: "acceptance:panel:asker",
          composition_budget_tier: "low",
          depth_params: { depth: 1 },
          decision_scope: "acceptance-test",
          as_of: "2026-09-01T00:00:00.000Z",
          steering_presets: [],
          steering_annotations: []
        }
      });
      if (ask.statusCode !== 202) throw new Error(`PANEL_ASK_REJECTED:${ask.statusCode}:${ask.body}`);
      const runId = (ask.json() as { run_ref: string }).run_ref;
      await vi.waitFor(async () => {
        const work = await database.pool.query<{ state: string; terminal_reason: string | null }>(
          "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1",
          [runId]
        );
        if (work.rows[0]?.state === "FAILED") {
          throw new Error(`PANEL_WORK_FAILED:${work.rows[0].terminal_reason}:unclassified=`
            + JSON.stringify([...primaryProvider.unclassifiedCalls(), ...secondProvider.unclassifiedCalls()]));
        }
        expect(work.rows[0]?.state).toBe("DONE");
      });

      // The RECEIPT, re-read from the ledger: one reduced judgement per node,
      // each naming >= 2 panel members with a measured dispersion.
      const receipts = await database.pool.query<{
        node_id: string;
        dispersion: number | null;
        panel_member_count: number;
        disagreement: Record<string, unknown>;
      }>(
        `SELECT node_id, dispersion,
                jsonb_array_length(panel_contract_hashes) AS panel_member_count,
                disagreement
         FROM ledger.reduced_judgement WHERE run_id = $1 ORDER BY at_seq`,
        [runId]
      );
      expect(receipts.rows.length).toBeGreaterThan(0);

      // One reduced judgement per node (never two rows racing for one node).
      expect(new Set(receipts.rows.map((row) => row.node_id)).size).toBe(receipts.rows.length);

      for (const row of receipts.rows) {
        expect(Number(row.panel_member_count)).toBeGreaterThanOrEqual(2);
        expect(row.dispersion).not.toBeNull();
      }

      // The panel really ran: the non-author makers were called to assess.
      expect(primaryProvider.assessCallCount() + secondProvider.assessCallCount())
        .toBe(receipts.rows.length);

      // The family discount is LIVE, not merely importable: each receipt
      // records the effective weight the correlated-error discount produced
      // and the family ordinal it was derived from. The multiplier is READ
      // from the seeded T16 row — never restated here.
      const controls = await readPanelWeightingControls(database.pool, ACCEPTANCE_REGISTER_VERSION);
      const sealedMultiplier = controls.repeatedFamilyMultiplier;
      const weighted = receipts.rows.map((row) => row.disagreement.panel as {
        readonly members: readonly {
          readonly familyRef: string | null;
          readonly familyOrdinal: number | null;
          readonly earnedWeight: number;
          readonly effectiveWeight: number;
        }[];
      });
      const sealedFamilyRefs = new Set(controls.providerFamilies.map((family) => family.familyRef));
      for (const panel of weighted) {
        expect(panel.members.length).toBeGreaterThanOrEqual(2);
        for (const member of panel.members) {
          // The family was RESOLVED off the sealed provider→family map, not
          // left UNKNOWN: an UNKNOWN family is exempt from the discount, so a
          // panel that silently failed to map its providers would skip the
          // discount stage entirely and still look self-consistent.
          expect(member.familyRef).not.toBeNull();
          expect(sealedFamilyRefs).toContain(member.familyRef);
          // `familyOrdinal` is produced by applyCorrelatedErrorDiscount and by
          // nothing else — a recorded ordinal is proof the discount stage ran
          // on this acceptance path, not merely that it is importable.
          expect(member.familyOrdinal).toBeGreaterThanOrEqual(1);
          expect(member.effectiveWeight).toBe(
            member.familyOrdinal === 1
              ? member.earnedWeight
              : member.earnedWeight * sealedMultiplier
          );
        }
        // Every acceptance provider sits in its own sealed family, so first
        // appearance is the only ordinal reachable on this deployment's map.
        // The repeated-family MULTIPLIER branch is therefore unreachable here
        // and is pinned at the s04 surface instead (a finding, not a fake).
        expect(new Set(panel.members.map((member) => member.familyRef)).size)
          .toBe(panel.members.length);
      }
    } finally {
      await runtime.api.close();
    }
  });

  it("confirm-item 5 — marks PANEL-DEGRADED-SINGLE-VOICE and steps the band down when every non-author member fails", async () => {
    primaryProvider.failAssessCalls(true);
    secondProvider.failAssessCalls(true);
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      serviceCredential: "d".repeat(43),
      environment: {
        DATABASE_URL: database.connectionString,
        API_HOST: "127.0.0.1",
        API_PORT: 8_000,
        STRANGER_SAMPLE_RATE: 1,
        BATTERY_VERSION: "acceptance:panel-degraded",
        SETTLEMENT_WATCH_HANDLE: "acceptance:panel-degraded:watch",
        MODEL_BASE_URL: primaryProvider.endpoint
      },
      makerRelays: [
        {
          providerRef: "acceptance:codex-cli",
          baseUrl: primaryProvider.endpoint,
          model: "test-layer/model",
          authorizationHeader: "Bearer test-panel-primary"
        },
        {
          providerRef: "acceptance:claude-cli",
          baseUrl: secondProvider.endpoint,
          model: "test-layer/model",
          authorizationHeader: "Bearer test-panel-second"
        }
      ]
    });
    try {
      const origin = "http://127.0.0.1:8000";
      const ask = await runtime.api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, true),
        payload: {
          question_line: "Should a software company adopt a four-day workweek?",
          risk_tier: "standard",
          tier_source: "ASKER",
          tier_provenance_ref: "acceptance:panel-degraded:asker",
          composition_budget_tier: "low",
          depth_params: { depth: 1 },
          decision_scope: "acceptance-test",
          as_of: "2026-09-01T00:00:00.000Z",
          steering_presets: [],
          steering_annotations: []
        }
      });
      if (ask.statusCode !== 202) throw new Error(`PANEL_DEGRADED_ASK_REJECTED:${ask.statusCode}:${ask.body}`);
      const runId = (ask.json() as { run_ref: string }).run_ref;
      await vi.waitFor(async () => {
        const work = await database.pool.query<{ state: string; terminal_reason: string | null }>(
          "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1",
          [runId]
        );
        if (work.rows[0]?.state === "FAILED") throw new Error(`PANEL_DEGRADED_WORK_FAILED:${work.rows[0].terminal_reason}`);
        expect(work.rows[0]?.state).toBe("DONE");
      });

      const receipts = await database.pool.query<{
        dispersion: number | null;
        panel_member_count: number;
        disagreement: {
          readonly marks: readonly string[];
          readonly certaintyBand: string | null;
          readonly certaintyEffect: string;
          readonly dispersionAbsentReason: string | null;
          readonly panel: { readonly nonAuthorVoiceCount: number; readonly notes: readonly { readonly failureKind: string }[] };
        };
      }>(
        `SELECT dispersion, jsonb_array_length(panel_contract_hashes) AS panel_member_count, disagreement
         FROM ledger.reduced_judgement WHERE run_id = $1 ORDER BY at_seq`,
        [runId]
      );
      expect(receipts.rows.length).toBeGreaterThan(0);

      // The sealed band vocabulary decides the step down; the test reads it.
      const controls = await readPanelWeightingControls(database.pool, ACCEPTANCE_REGISTER_VERSION);

      for (const row of receipts.rows) {
        // Never a silent self-grade: the author is the only surviving voice and
        // the receipt says so, in the mark AND in the panel's own notes.
        expect(row.disagreement.marks).toContain("PANEL-DEGRADED-SINGLE-VOICE");
        expect(row.disagreement.panel.nonAuthorVoiceCount).toBe(0);
        expect(row.disagreement.panel.notes.map((note) => note.failureKind)).toContain("PARSE_FAILURE");
        // Never components-only: dispersion is typed-absent with its reason,
        // not quietly zero.
        expect(row.dispersion).toBeNull();
        expect(row.disagreement.dispersionAbsentReason).toBe("FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS");
        expect(Number(row.panel_member_count)).toBe(1);
        // One band step down, taken from T16's own map.
        expect(row.disagreement.certaintyEffect).toBe("DOWNGRADED");
        expect(row.disagreement.certaintyBand)
          .toBe(controls.oneStepDown[ACCEPTANCE_CANDIDATE_BAND]);
        // The step is a real move, not the identity: the recorded band is NOT
        // the candidate band the runtime started from.
        expect(row.disagreement.certaintyBand).not.toBe(ACCEPTANCE_CANDIDATE_BAND);
      }

      /**
       * S08 / board F30 — the END-TO-END leg: the step-down above is RECORDED
       * on every receipt, and the SERVED ANSWER must now carry it too.
       *
       * Before S08 this assertion failed: `ledger.reduced_judgement` said
       * `certaintyEffect: DOWNGRADED` while `serve.answer.confidence_band` was
       * still the candidate band, because nothing consumed T3's record. A
       * downgrade that is recorded and never applied is the silent degradation
       * the goal repeals, so the served band is the assertion that matters.
       *
       * The expectation is read from T16's sealed row through the same
       * `controls` the receipt assertions use — never a band literal.
       */
      const served = await runtime.api.inject({
        method: "GET",
        url: `/v1/runs/${runId}/answer`,
        headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, false)
      });
      expect(served.statusCode).toBe(200);
      const servedPayload = served.json() as {
        confidence_band: string;
        condition_marks: readonly string[];
      };
      expect(servedPayload.confidence_band)
        .toBe(controls.oneStepDown[ACCEPTANCE_CANDIDATE_BAND]);
      expect(servedPayload.confidence_band).not.toBe(ACCEPTANCE_CANDIDATE_BAND);
      // The band the asker sees and the mark that explains it agree.
      expect(servedPayload.condition_marks).toContain("PANEL-DEGRADED-SINGLE-VOICE");
    } finally {
      primaryProvider.failAssessCalls(false);
      secondProvider.failAssessCalls(false);
      await runtime.api.close();
    }
  });
});

describe("S-LANG — the panel provider double classifies a packet the same with or without the argument-language directive", () => {
  // This file's end-to-end rows are red on clean origin/dev for dev's own
  // reason (the ask is refused 400 MALFORMED_REQUEST before any provider call),
  // so the double's routing is proven HERE, on real framed packets of every
  // shipped contract it serves, built exactly as the gateway sends them.
  const CONTRACTS: readonly (readonly [RequestClass, PromptContract])[] = [
    ["PANEL", PANEL_PROMPT_CONTRACT],
    ["REVIEW", reviewPromptContract(1)],
    ["JUDGE", judgePromptContract("primary-root", "unknown")],
    ["COMPOSE", SYNTHESIZER_PROMPT_CONTRACT],
    ["EVALUATOR", EVALUATOR_PROMPT_CONTRACT]
  ];
  const LANGUAGES = ["English", "Romanian", "română", "the same language as the question"] as const;
  const wireBody = (contract: PromptContract, directive: string | null): string => JSON.stringify({
    model: "test-layer/model",
    max_tokens: 1,
    messages: buildFramedPrompt({
      contract: directive === null ? contract : { ...contract, instruction: `${contract.instruction} ${directive}` },
      material: [{ name: "question_line", content: "Should the proposal stand?" }]
    }).packet.messages
  });

  it.each(CONTRACTS)("classifies a %s packet identically with and without the directive", (expected, contract) => {
    expect(classifyRequest(wireBody(contract, null))).toBe(expected);
    for (const language of LANGUAGES) {
      const body = wireBody(contract, argumentLanguageDirective(language));
      expect(body, `${language}: the directive is on the wire`).toContain(argumentLanguageDirective(language));
      expect(classifyRequest(body), language).toBe(expected);
    }
  });

  it("is not vacuous: unstripped, the directive alone would route a REVIEW packet to the PANEL branch", () => {
    const body = wireBody(reviewPromptContract(1), argumentLanguageDirective("Romanian"));
    expect(body.includes("fatalFlags") && !body.includes("restatement_text")).toBe(true);
    expect(classifyRequest(body)).toBe("REVIEW");
  });
});
