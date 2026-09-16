import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  ProviderContentUnacceptedError,
  type ProviderCallRequest,
  type RawArtifactInput
} from "@debateai/providers";
// The module that OWNS these symbols, exactly as `tests/integration/
// t16-algorithm-register.test.ts:64` reaches them: the register barrel's export
// list is not this seat's surface, so the test reads the owner directly.
import {
  ALGORITHM_REGISTER_ROW_KEYS,
  buildAlgorithmRegisterRows,
  readSynthesisRoleControls
} from "../../packages/register/src/algorithm-policy.js";
// The JUDGE's clock read from the row that DECLARES it, never restated here:
// the whole defect is two numbers that were supposed to relate and did not.
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
// W10 fix round 1 / F1-F2 class member C: the support relay adapter, whose
// failure vocabulary is declared in ONE place and sealed by nothing.
import { RelayAdapter, SupportModelError } from "../../apps/api/src/support/model.js";

/**
 * W10 (`board/W10-call-budget-truthfulness.md`, audit
 * `audits/token-budget-reasoning.md`) — a length failure must say it was a
 * length failure.
 *
 * At the base every one of these three charges was invisible:
 * `finish_reason` appeared nowhere in the repository, so a response cut off at
 * `max_tokens` arrived as a partial `content` string, failed the contract
 * classifier and was recorded as `PARSE_FAILED` — indistinguishable from a
 * model that wrote bad JSON.
 */

/** One attempt as the gateway offered it to its two recording ports. */
interface RecordedAttempt {
  readonly body: {
    readonly model: string;
    readonly max_tokens: number;
    readonly messages: readonly { readonly role: string; readonly content: string }[];
  };
  readonly artifact: RawArtifactInput;
}

/**
 * A provider double that answers from a SCRIPT of `finish_reason`/content
 * pairs, one per attempt, and records what the gateway asked for. It is a fake
 * `fetch`, not an HTTP server: a double that throws inside a real handler
 * reports as `TRANSPORT_DEATH` and wears the product's costume
 * (`.hermes/TOOLING-TRAPS.md:5136`).
 */
function scriptedGateway(script: readonly { finish_reason: string; content: string }[]): {
  readonly gateway: OpenAICompatibleProviderGateway;
  readonly attempts: RecordedAttempt[];
} {
  const attempts: RecordedAttempt[] = [];
  const bodies: RecordedAttempt["body"][] = [];
  let index = 0;
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1",
    model: "fixture/model",
    maker: "fixture",
    fetchImplementation: async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as RecordedAttempt["body"];
      bodies.push(body);
      const scripted = script[Math.min(index, script.length - 1)]!;
      index += 1;
      return new Response(JSON.stringify({
        id: `fixture-${String(index)}`,
        model: "fixture/model",
        choices: [{ message: { content: scripted.content }, finish_reason: scripted.finish_reason }]
      }));
    },
    persistRawArtifact: async (artifact) => {
      attempts.push({ body: bodies[attempts.length]!, artifact });
      return `artifact:${String(attempts.length)}`;
    },
    appendLedgerEntry: async () => "ledger:w10",
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, attempts };
}

/** The contract classifier the runner installs: JSON or it is a parse failure. */
function jsonClassifier(content: string): { parseStatus: "PARSED" | "PARSE_FAILED"; parseError: string | null } {
  try {
    JSON.parse(content);
    return { parseStatus: "PARSED", parseError: null };
  } catch (error) {
    return { parseStatus: "PARSE_FAILED", parseError: error instanceof Error ? error.message : String(error) };
  }
}

function w10Request(overrides: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return {
    runId: null,
    subjectItemId: "node:w10",
    callSiteKey: "fixture:synthesizer",
    role: "SYNTHESIZER",
    lane: "served",
    bound: { maxAttempts: 1, tokenCeiling: 2_048, deadlineMs: 180_000 },
    contractHash: "contract:w10",
    providerRef: "provider:w10",
    packet: { messages: [{ role: "user", content: "compose the served answer" }] },
    classifyContent: (content) => jsonClassifier(content) as never,
    ...overrides
  };
}

/** The shape a provider cut off at `max_tokens` actually returns: partial JSON. */
const TRUNCATED_JSON = '{"segments":[{"segment_id":"s1","text":"the answer begins';

describe("W10 C1 · a length failure is classified as a length failure", () => {
  it("records finish_reason length as LENGTH_EXCEEDED, never as PARSE_FAILED", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "length", content: TRUNCATED_JSON }
    ]);
    const rejection = await gateway.call(w10Request()).then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(ProviderContentUnacceptedError);
    expect((rejection as ProviderContentUnacceptedError).lastParseStatus).toBe("LENGTH_EXCEEDED");
    expect((rejection as ProviderContentUnacceptedError).lastParseStatus).not.toBe("PARSE_FAILED");
    expect(attempts).toHaveLength(1);
  });

  it("carries finish_reason through the response schema onto every recorded attempt", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "length", content: TRUNCATED_JSON }
    ]);
    await gateway.call(w10Request()).catch(() => undefined);
    expect(attempts.map((attempt) => attempt.artifact.metadata.finish_reason)).toEqual(["length"]);
  });

  it("D71 boundary — finish_reason stop with bad JSON stays PARSE_FAILED", async () => {
    const { gateway } = scriptedGateway([
      { finish_reason: "stop", content: "this is not json at all" }
    ]);
    const rejection = await gateway.call(w10Request()).then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(ProviderContentUnacceptedError);
    expect((rejection as ProviderContentUnacceptedError).lastParseStatus).toBe("PARSE_FAILED");
  });
});

/**
 * The schema-repair packet the runner installs (`apps/runner/src/index.ts`
 * `buildSchemaRepairPacket`): it APPENDS a correction to the existing messages
 * and reuses the same bound. For a truncation that makes attempt 2 strictly
 * worse — longer input, identical `max_tokens`, the same schema to satisfy.
 */
function appendingRepairPacket(packet: ProviderCallRequest["packet"], parseError: string): ProviderCallRequest["packet"] {
  return {
    messages: [...packet.messages, {
      role: "user",
      content: `The previous response violated the declared JSON contract. Machine parse error: ${parseError}`
    }]
  };
}

describe("W10 C2 · a truncation is not retried into the identical truncation", () => {
  it("raises the attempt's bound after a length failure instead of re-asking under the same one", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "length", content: TRUNCATED_JSON }
    ]);
    const packet = { messages: [{ role: "user" as const, content: "compose the served answer" }] };
    await gateway.call(w10Request({
      bound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
      packet,
      buildRepairPacket: ({ parseError }) => appendingRepairPacket(packet, parseError)
    })).catch(() => undefined);
    expect(attempts).toHaveLength(3);
    // Asserted from the RECORDED attempts, not from the fixture's own bookkeeping.
    expect(attempts.map((attempt) => attempt.artifact.metadata.token_ceiling))
      .toEqual([2_048, 4_096, 6_144]);
    expect(attempts.map((attempt) => attempt.body.max_tokens)).toEqual([2_048, 4_096, 6_144]);
  });

  it("never repeats a byte-identical attempt while the provider keeps truncating", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "length", content: TRUNCATED_JSON }
    ]);
    const packet = { messages: [{ role: "user" as const, content: "compose the served answer" }] };
    await gateway.call(w10Request({
      bound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
      packet,
      buildRepairPacket: ({ parseError }) => appendingRepairPacket(packet, parseError)
    })).catch(() => undefined);
    const rendered = attempts.map((attempt) => JSON.stringify(attempt.body));
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("stops appending on a truncation retry — the input the model must re-read never grows", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "length", content: TRUNCATED_JSON }
    ]);
    const packet = { messages: [{ role: "user" as const, content: "compose the served answer" }] };
    await gateway.call(w10Request({
      bound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
      packet,
      buildRepairPacket: ({ parseError }) => appendingRepairPacket(packet, parseError)
    })).catch(() => undefined);
    for (const attempt of attempts) {
      expect(attempt.body.messages).toEqual(packet.messages);
    }
  });

  it("D71 boundary — a SCHEMA failure keeps the appending repair path and the sealed bound", async () => {
    const { gateway, attempts } = scriptedGateway([
      { finish_reason: "stop", content: "this is not json at all" }
    ]);
    const packet = { messages: [{ role: "user" as const, content: "compose the served answer" }] };
    await gateway.call(w10Request({
      bound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
      packet,
      buildRepairPacket: ({ parseError }) => appendingRepairPacket(packet, parseError)
    })).catch(() => undefined);
    expect(attempts.map((attempt) => attempt.body.max_tokens)).toEqual([2_048, 2_048, 2_048]);
    expect(attempts.map((attempt) => attempt.body.messages.length)).toEqual([1, 2, 2]);
  });
});

/**
 * A pool that answers the ONE query `readFamily` makes, from a row set the test
 * controls. `register.register_row` is APPEND-ONLY and a seeder re-reads what it
 * wrote (`.hermes/TOOLING-TRAPS.md:1759`), so "the deployment never sealed this
 * row" is modelled at the READ, not by mutating a seeded register.
 */
function registerPoolWithout(omitted: readonly string[]): Pool {
  const sealed: Readonly<Record<string, unknown>> = {
    synthesizerRoleRef: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true },
    evaluatorRoleRef: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-cli", provisional: true },
    evaluatorLoopMaxRounds: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 },
    synthesizerCallBound: {
      kind: "SYNTHESIZER_CALL_BOUND", maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000
    },
    evaluatorCallBound: {
      kind: "EVALUATOR_CALL_BOUND", maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000
    }
  };
  return {
    query: async (_text: string, values: readonly unknown[]) => ({
      rows: (values[1] as readonly string[])
        .filter((rowKey) => !omitted.includes(rowKey) && sealed[rowKey] !== undefined)
        .map((rowKey) => ({ row_key: rowKey, value_json: sealed[rowKey], source_ref: "w10-test:scratch" }))
    })
  } as unknown as Pool;
}

const W10_ROWS_INPUT = {
  deploymentSourceRef: "W10-TEST-algorithm-register.md#w10",
  synthesizerRoleRef: "development:codex-cli",
  evaluatorRoleRef: "development:claude-cli",
  providerFamilies: [{ familyRef: "openai", providerRefs: ["development:codex-cli", "development:claude-cli"] }]
} as const;

function mintedRow(
  rowKey: string,
  input: Parameters<typeof buildAlgorithmRegisterRows>[0] = W10_ROWS_INPUT
): { readonly maxAttempts: number; readonly tokenCeiling: number; readonly deadlineMs: number } {
  const row = buildAlgorithmRegisterRows(input).find((candidate) => candidate.rowKey === rowKey);
  if (row === undefined) throw new Error(`no ${rowKey} row was minted`);
  return row.value as { maxAttempts: number; tokenCeiling: number; deadlineMs: number };
}

describe("W10 C3 · the synthesizer and the evaluator have bounds of their own", () => {
  it("mints sealed SYNTHESIZER and EVALUATOR cost rows in the T16 manifest", () => {
    expect(ALGORITHM_REGISTER_ROW_KEYS).toContain("synthesizerCallBound");
    expect(ALGORITHM_REGISTER_ROW_KEYS).toContain("evaluatorCallBound");
  });

  it("gives both roles a deadline no shorter than the judge's", () => {
    // The two hardest calls in the system had the shortest clock, because they
    // borrowed COMPOSER and CONFORMANCE — two organs T9 retired, both at 60_000,
    // while the JUDGE — which answers about a SINGLE node — carried 180_000.
    const judgeDeadlineMs = DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.deadlineMs;
    expect(judgeDeadlineMs).toBeGreaterThan(DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER.deadlineMs);
    expect(mintedRow("synthesizerCallBound").deadlineMs).toBeGreaterThanOrEqual(judgeDeadlineMs);
    expect(mintedRow("evaluatorCallBound").deadlineMs).toBeGreaterThanOrEqual(judgeDeadlineMs);
  });

  it("rises with a deployment whose judge clock is longer than the sealed floor", () => {
    const longerJudge = { ...W10_ROWS_INPUT, judgeDeadlineMs: 240_000 };
    expect(mintedRow("synthesizerCallBound", longerJudge).deadlineMs).toBe(240_000);
    expect(mintedRow("evaluatorCallBound", longerJudge).deadlineMs).toBe(240_000);
  });

  it("D71 boundary — tokenCeiling stays 2048 and is not set from an estimate", () => {
    expect(mintedRow("synthesizerCallBound").tokenCeiling).toBe(2_048);
    expect(mintedRow("evaluatorCallBound").tokenCeiling).toBe(2_048);
    expect(mintedRow("synthesizerCallBound").maxAttempts).toBe(3);
    expect(mintedRow("evaluatorCallBound").maxAttempts).toBe(3);
  });

  it("fails loudly at startup when a register never sealed the SYNTHESIZER row", async () => {
    const rejection = await readSynthesisRoleControls(registerPoolWithout(["synthesizerCallBound"]), 5)
      .then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as { code?: string }).code).toBe("SYNTHESIS_ROLE_CONTROLS_UNRESOLVED");
    expect(String((rejection as Error).message)).toContain("synthesizerCallBound");
  });

  it("fails loudly at startup when a register never sealed the EVALUATOR row", async () => {
    const rejection = await readSynthesisRoleControls(registerPoolWithout(["evaluatorCallBound"]), 5)
      .then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as { code?: string }).code).toBe("SYNTHESIS_ROLE_CONTROLS_UNRESOLVED");
    expect(String((rejection as Error).message)).toContain("evaluatorCallBound");
  });

  it("hands both sealed bounds to the deployment that read the family", async () => {
    const controls = await readSynthesisRoleControls(registerPoolWithout([]), 5);
    expect(controls.synthesizerBound).toEqual({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 });
    expect(controls.evaluatorBound).toEqual({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 });
  });

  it("declares both rows in the migration that seals them", async () => {
    // The number is MEASURED at write time, never predicted
    // (`.hermes/TOOLING-TRAPS.md:4963`): 0063 was the highest on this branch.
    const migration = await readFile("migrations/0064_synthesis_role_cost_rows.sql", "utf8");
    expect(migration).toContain("('synthesizerCallBound',");
    expect(migration).toContain("('evaluatorCallBound',");
    expect(migration).toContain("'synthesisRoles'");
  });

  it("seeds both rows from the development deployment's own judge clock", async () => {
    const seeder = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(seeder).toContain("judgeDeadlineMs: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.deadlineMs");
  });
});

/**
 * W10 fix round 1 · F7 — C1's own missing boundary, and F1/F2's class member C.
 */
describe("W10 F7 · LENGTH_EXCEEDED wins when the strict response schema also fails", () => {
  it("names the truncation even though the body is unusable to the strict parse", async () => {
    // `choices[0].message.content` is absent, so `responseSchema` REJECTS this
    // body and the strict parse throws — the exact case the lenient
    // `observedFinishReason` read exists for. The finish reason must still
    // reach the artifact, and the call must still fail as a length failure.
    const artifacts: RawArtifactInput[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1",
      model: "fixture/model",
      maker: "fixture",
      fetchImplementation: async () => new Response(JSON.stringify({
        id: "fixture-strict-reject",
        model: "fixture/model",
        choices: [{ message: {}, finish_reason: "length" }]
      })),
      persistRawArtifact: async (artifact) => { artifacts.push(artifact); return "artifact:strict"; },
      appendLedgerEntry: async () => "ledger:w10",
      assertNoOpenWriteTransaction: () => undefined
    });
    const rejection = await gateway.call(w10Request()).then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(ProviderContentUnacceptedError);
    expect((rejection as ProviderContentUnacceptedError).lastParseStatus).toBe("LENGTH_EXCEEDED");
    expect(artifacts.map((artifact) => artifact.metadata.finish_reason)).toEqual(["length"]);
  });

  it("D71 boundary — the same unusable body WITHOUT a length finish stays a call failure", async () => {
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1",
      model: "fixture/model",
      maker: "fixture",
      fetchImplementation: async () => new Response(JSON.stringify({
        id: "fixture-strict-reject",
        model: "fixture/model",
        choices: [{ message: {}, finish_reason: "stop" }]
      })),
      persistRawArtifact: async () => "artifact:strict",
      appendLedgerEntry: async () => "ledger:w10",
      assertNoOpenWriteTransaction: () => undefined
    });
    const rejection = await gateway.call(w10Request()).then(() => null, (error: unknown) => error);
    expect(rejection).not.toBeInstanceOf(ProviderContentUnacceptedError);
    expect((rejection as { code?: string }).code).toBe("PROVIDER_CALL_FAILED");
  });
});

describe("W10 F1/F2 class member C · the support model refuses a truncated completion", () => {
  function relayAnswering(body: unknown): RelayAdapter {
    return new RelayAdapter({
      baseUrl: "http://127.0.0.1:8000/v1",
      authorizationHeader: "Bearer test-layer-token",
      model: "fixture/model",
      fetchImplementation: async () => new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });
  }

  const ASK = { system: "be brief", messages: [{ role: "user" as const, content: "hello" }] };

  it("refuses a completion cut off at the limit instead of serving the fragment", async () => {
    // At the base this adapter sets NO `max_tokens` and never reads
    // `finish_reason`, so a server-side cap produced a truncated answer that
    // passed every check here and was served as if it were complete.
    const relay = relayAnswering({
      id: "support-1",
      choices: [{ message: { content: "The first half of the answer" }, finish_reason: "length" }]
    });
    const rejection = await relay.complete(ASK).then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(SupportModelError);
    expect((rejection as SupportModelError).code).toBe("SUPPORT_MODEL_LENGTH_EXCEEDED");
  });

  it("D71 boundary — finish_reason stop still answers, and an unusable body stays UNAVAILABLE", async () => {
    await expect(relayAnswering({
      id: "support-2",
      choices: [{ message: { content: "A complete answer." }, finish_reason: "stop" }]
    }).complete(ASK)).resolves.toMatchObject({ text: "A complete answer." });

    const rejection = await relayAnswering({
      id: "support-3",
      choices: [{ message: { content: "   " }, finish_reason: "stop" }]
    }).complete(ASK).then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(SupportModelError);
    expect((rejection as SupportModelError).code).toBe("SUPPORT_MODEL_UNAVAILABLE");
  });
});
