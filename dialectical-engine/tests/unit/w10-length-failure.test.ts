import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  ProviderContentUnacceptedError,
  type ProviderCallRequest,
  type RawArtifactInput
} from "@debateai/providers";

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
