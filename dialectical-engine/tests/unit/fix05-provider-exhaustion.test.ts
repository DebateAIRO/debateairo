import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  declaredRef,
  installCaptureEmitter,
  runWithObsContext,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";
import {
  OpenAICompatibleProviderGateway,
  ProviderCallFailedError,
  type ProviderCallRequest,
} from "@debateai/providers";

const AMBIENT_RUN_ID = "550e8400-e29b-41d4-a716-446655440000";
const REQUEST_RUN_ID = "550e8400-e29b-41d4-a716-446655440010";
const AMBIENT_WORK_ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const LEDGER_IDS = Object.freeze([
  "550e8400-e29b-41d4-a716-446655440101",
  "550e8400-e29b-41d4-a716-446655440102",
  "550e8400-e29b-41d4-a716-446655440103",
]);
const QUESTION_CANARY = "CANARY-QUESTION-4419";
const PAYLOAD_CANARY = "PRIVATE-PROVIDER-PAYLOAD-2201";
const PARSE_CANARY = "PRIVATE-PARSE-TEXT-2202";

function request(maxAttempts = 3): ProviderCallRequest {
  return Object.freeze({
    runId: REQUEST_RUN_ID,
    subjectItemId: "request-subject-must-not-become-work-context",
    callSiteKey: "fix05.provider.exhaustion",
    role: "JUDGE",
    lane: "served",
    bound: Object.freeze({ maxAttempts, tokenCeiling: 64, deadlineMs: 1_000 }),
    contractHash: "contract:fix05",
    providerRef: "provider:fix05",
    packet: Object.freeze({
      messages: Object.freeze([{ role: "user" as const, content: QUESTION_CANARY }]),
    }),
  });
}

function captureEntries(): CaptureQueueEntry[] {
  const entries: CaptureQueueEntry[] = [];
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: Object.freeze({
      offer(entry: CaptureQueueEntry): boolean {
        entries.push(entry);
        return true;
      },
    }),
    health,
    gaps: createCaptureGapCounter({ health }),
  }));
  return entries;
}

function captureOff(): void {
  installCaptureEmitter(Object.freeze({ emit() {}, captureHandled() {} }));
}

function callInAmbientContext(
  gateway: OpenAICompatibleProviderGateway,
  providerRequest: ProviderCallRequest,
) {
  return runWithObsContext(Object.freeze({
    run_ref: declaredRef("run", AMBIENT_RUN_ID),
    work_item_ref: declaredRef("work_item", AMBIENT_WORK_ITEM_ID),
  }), () => gateway.call(providerRequest));
}

function gatewayWith(input: {
  readonly fetchImplementation: typeof fetch;
  readonly ledgerAttempts: string[];
  readonly ledgerRefs?: readonly string[];
}): OpenAICompatibleProviderGateway {
  const ledgerRefs = input.ledgerRefs ?? LEDGER_IDS;
  return new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture.invalid/v1",
    model: "fixture/model",
    maker: "fixture-maker",
    fetchImplementation: input.fetchImplementation,
    persistRawArtifact: async (artifact) => `artifact:${artifact.attemptId}`,
    appendLedgerEntry: async (entry) => {
      input.ledgerAttempts.push(entry.attemptId);
      return ledgerRefs[input.ledgerAttempts.length - 1] ?? ledgerRefs.at(-1)!;
    },
    assertNoOpenWriteTransaction: () => undefined,
  });
}

function successfulResponse(content = "accepted"): Response {
  return new Response(JSON.stringify({
    id: "fixture-call",
    model: "fixture/model",
    choices: [{ message: { content } }],
  }), { status: 200 });
}

afterEach(captureOff);

describe("FIX-05 C1 provider exhaustion capture", () => {
  it("emits once after three transport failures with the last declared attempt and ledger refs", async () => {
    const captured = captureEntries();
    const ledgerAttempts: string[] = [];
    const fetchImplementation = vi.fn(async () => {
      throw new Error("fixture transport closed");
    });
    const gateway = gatewayWith({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      ledgerAttempts,
    });

    await expect(callInAmbientContext(gateway, request())).rejects.toMatchObject({
      code: "PROVIDER_CALL_FAILED",
      attempts: 3,
      lastLedgerEntryRef: LEDGER_IDS[2],
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(ledgerAttempts).toHaveLength(3);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "PROVIDER_CALL_FAILED",
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        disposition: "THROWN",
        source: "first_party",
        template_parameters: { attempt_count: 3 },
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: AMBIENT_RUN_ID },
        work_item_ref: { kind: "work_item", value: AMBIENT_WORK_ITEM_ID },
        attempt_ref: { kind: "attempt", value: ledgerAttempts[2] },
        ledger_ref: { kind: "ledger_entry", value: LEDGER_IDS[2] },
      },
    });
    expect(Object.keys(captured[0]?.payload_ref as object).sort()).toEqual([
      "capture_point",
      "code",
      "disposition",
      "source",
      "taxonomy_class",
      "template_parameters",
    ]);
    expect(Object.keys(
      (captured[0]?.payload_ref as { template_parameters: object }).template_parameters,
    )).toEqual(["attempt_count"]);
    expect(Object.keys(captured[0]?.ambient_context_ref ?? {}).sort()).toEqual([
      "attempt_ref",
      "ledger_ref",
      "run_ref",
      "work_item_ref",
    ]);
    expect(JSON.stringify(captured)).not.toContain(QUESTION_CANARY);

    const durable = createSharedRedactor({
      environment: "test",
      build_ref: "UNTRACKED-DEV:fix05",
      build_dirty: true,
      runtime: "runner",
      component: { process: "runner", package: "@debateai/providers" },
      writer_identity: "fix05-test",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
    }).redact(captured[0]!);
    expect(durable).toMatchObject({
      capture_point: "self",
      taxonomy_class: "CAPTURE_SELF",
      code: "OBS_CAPTURE_SELF",
      fallback_minimized: true,
      run_ref: AMBIENT_RUN_ID,
      work_item_ref: AMBIENT_WORK_ITEM_ID,
      attempt_ref: ledgerAttempts[2],
      ledger_ref: LEDGER_IDS[2],
      template_parameters: {},
    });
  });

  it("emits nothing when a retry succeeds", async () => {
    const captured = captureEntries();
    const ledgerAttempts: string[] = [];
    let attempt = 0;
    const fetchImplementation = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("first attempt failed");
      return successfulResponse();
    });
    const gateway = gatewayWith({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      ledgerAttempts,
    });

    const result = await callInAmbientContext(gateway, request());

    expect(result.content).toBe("accepted");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(ledgerAttempts).toHaveLength(2);
    expect(captured).toEqual([]);
  });

  it("emits one content-exhaustion envelope without prompt, payload, or parse text", async () => {
    const captured = captureEntries();
    const ledgerAttempts: string[] = [];
    const fetchImplementation = vi.fn(async () => successfulResponse(PAYLOAD_CANARY));
    const gateway = gatewayWith({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      ledgerAttempts,
    });
    const rejectedRequest = Object.freeze({
      ...request(),
      classifyContent: () => ({
        parseStatus: "SCHEMA_FAILED" as const,
        parseError: PARSE_CANARY,
      }),
    });

    await expect(callInAmbientContext(gateway, rejectedRequest)).rejects.toMatchObject({
      code: "PROVIDER_CONTENT_UNACCEPTED",
      attempts: 3,
      lastLedgerEntryRef: LEDGER_IDS[2],
      lastParseError: PARSE_CANARY,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      payload_ref: {
        code: "PROVIDER_CONTENT_UNACCEPTED",
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        template_parameters: { attempt_count: 3 },
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: AMBIENT_RUN_ID },
        work_item_ref: { kind: "work_item", value: AMBIENT_WORK_ITEM_ID },
        attempt_ref: { kind: "attempt", value: ledgerAttempts[2] },
        ledger_ref: { kind: "ledger_entry", value: LEDGER_IDS[2] },
      },
    });
    expect(Object.keys(captured[0]?.payload_ref as object).sort()).toEqual([
      "capture_point",
      "code",
      "disposition",
      "source",
      "taxonomy_class",
      "template_parameters",
    ]);
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(QUESTION_CANARY);
    expect(serialized).not.toContain(PAYLOAD_CANARY);
    expect(serialized).not.toContain(PARSE_CANARY);
  });

  it("preserves failure and success semantics when capture is off or rejects the emission", async () => {
    const runFailure = async (mode: "off" | "rejecting") => {
      if (mode === "off") {
        captureOff();
      } else {
        installCaptureEmitter(Object.freeze({
          emit() { throw new Error("capture unavailable"); },
          captureHandled() {},
        }));
      }
      const ledgerAttempts: string[] = [];
      const fetchImplementation = vi.fn(async () => {
        throw new Error("same product failure");
      });
      const gateway = gatewayWith({
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
        ledgerAttempts,
      });
      try {
        await callInAmbientContext(gateway, request(2));
        throw new Error("EXPECTED_PROVIDER_FAILURE");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderCallFailedError);
        const failure = error as ProviderCallFailedError;
        return Object.freeze({
          code: failure.code,
          attempts: failure.attempts,
          lastOutcome: failure.lastOutcome,
          lastLedgerEntryRef: failure.lastLedgerEntryRef,
          fetchCalls: fetchImplementation.mock.calls.length,
        });
      }
    };

    expect(await runFailure("rejecting")).toEqual(await runFailure("off"));

    const runSuccess = async (mode: "off" | "rejecting") => {
      if (mode === "off") {
        captureOff();
      } else {
        installCaptureEmitter(Object.freeze({
          emit() { throw new Error("capture unavailable"); },
          captureHandled() {},
        }));
      }
      const ledgerAttempts: string[] = [];
      let attempt = 0;
      const fetchImplementation = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("retry first");
        return successfulResponse("same success");
      });
      const gateway = gatewayWith({
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
        ledgerAttempts,
      });
      const result = await callInAmbientContext(gateway, request(2));
      return Object.freeze({
        content: result.content,
        provider: result.provider,
        model: result.model,
        maker: result.maker,
        modelVersion: result.modelVersion,
        fetchCalls: fetchImplementation.mock.calls.length,
      });
    };

    expect(await runSuccess("rejecting")).toEqual(await runSuccess("off"));
  });
});
