import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  AnswerDisclosureSchema,
  AnswerStorySchema,
  contractInventory,
  type Answer,
  type AnswerDisclosure
} from "@debateai/contract";
import type { ServeDisclosureModel, ServeDisclosureRead, StoredServeDisclosure } from "@debateai/db";
import { answerCarriesStoryLabel } from "@debateai/story";
import {
  RepositoryAnswerDisclosureApplication,
  buildAnswerDisclosure,
  type AnswerDisclosureApplication
} from "../../apps/api/src/disclosures.js";
import type { AnswerStoryApplication } from "../../apps/api/src/stories.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_RUN_ID, storedStoryRecord } from "../support/storyApiFixtures.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.4 and §14.4.5), TASK M5 — the
 * owner's read of the disclosure record, GET /v1/answers/{id}/disclosure, and
 * the story route treating a floor answer like a served one. The same gate as
 * the story: the answer read is the ownership check, and "not yours",
 * "malformed", "not composed" and "no record" are one closed 404.
 *
 * Over the real database (ownership predicate, latest version with a record,
 * models read from the run's calls): tests/integration/database.test.ts
 * ("Engine money rule M5 …") and tests/integration/story-api.test.ts.
 */

const CREATED_AT = "2026-09-26T10:00:00.000Z";
const OWNER = testHttpIdentity("disclosure-owner");
const HEADERS = testSessionHeaders(OWNER);
const URL_OF = `/v1/answers/${STORY_TEST_ANSWER_ID}/disclosure`;
const LEADING = "33333333-3333-4333-8333-333333333333";

function answerOf(overrides: Partial<Answer> = {}): Answer {
  return buildFairShapedAnswer({ answer_id: STORY_TEST_ANSWER_ID, relevant_as_of: CREATED_AT, ...overrides });
}

const FLOOR_ANSWER_OVERRIDES: Partial<Answer> = {
  terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY", verdict_state: null,
  verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" }, composed_text: []
};

function application(answer: Answer | null, reads: unknown[] = []): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async (answerId, _session, version, ownership) => {
      reads.push({ answerId, version, ownership });
      return answer;
    },
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

const MODEL_A: ServeDisclosureModel = Object.freeze({
  providerRef: "provider:a", maker: "Maker A", modelId: "maker-a/model-1", transport: "openai-compatible-http"
});
const MODEL_C: ServeDisclosureModel = Object.freeze({
  providerRef: "provider:c", maker: "Maker C", modelId: "maker-c/model-2", transport: "openai-compatible-http"
});

function storedRow(overrides: Partial<StoredServeDisclosure> = {}): StoredServeDisclosure {
  return Object.freeze({
    answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, runId: STORY_TEST_RUN_ID,
    writerPlannedRef: "provider:a", checkerPlannedRef: "provider:a",
    writerServedRef: null, checkerServedRef: null,
    writerFallback: false, checkerFallback: false, fallbackReason: null, checkerSameAsWriter: false,
    bodyStop: null, pointsWithoutReview: null, serveStop: "MONEY",
    digestRung: 0, digestPointsOmitted: 0,
    floorVerdictState: "SUPPORTED", floorLeadingNodeId: LEADING, floorReason: "ENVELOPE_EXHAUSTED",
    createdAt: new Date(CREATED_AT), floorBasisIncomplete: false,
    ...overrides
  });
}

/** The no-floor overrides: the three stored fields and the receipt's flag, together. */
const NO_FLOOR = Object.freeze({
  floorVerdictState: null, floorLeadingNodeId: null, floorReason: null, floorBasisIncomplete: null
});

const FLOOR_READ: ServeDisclosureRead = Object.freeze({
  row: storedRow(),
  models: Object.freeze({ writerPlanned: MODEL_A, writerServed: null, checkerPlanned: MODEL_A, checkerServed: null })
});

const FALLBACK_READ: ServeDisclosureRead = Object.freeze({
  row: storedRow({
    writerServedRef: "provider:c", checkerServedRef: "provider:c",
    writerFallback: true, checkerFallback: true, fallbackReason: "MONEY", checkerSameAsWriter: true,
    bodyStop: "MONEY", pointsWithoutReview: 2, serveStop: null, digestRung: 7, digestPointsOmitted: 140,
    ...NO_FLOOR
  }),
  models: Object.freeze({ writerPlanned: MODEL_A, writerServed: MODEL_C, checkerPlanned: MODEL_A, checkerServed: MODEL_C })
});

function disclosures(read: AnswerDisclosure | null, calls: unknown[] = [], floorCalls: unknown[] = []): AnswerDisclosureApplication {
  return {
    readDisclosure: async (input) => {
      calls.push(input);
      return read;
    },
    readFloor: async (input) => {
      floorCalls.push(input);
      return read?.floor ?? null;
    }
  };
}

function api(input: {
  answer: Answer | null;
  disclosures?: AnswerDisclosureApplication;
  stories?: AnswerStoryApplication;
  now?: string;
  reads?: unknown[];
}) {
  return buildApi({
    application: application(input.answer, input.reads),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.disclosures === undefined ? {} : { disclosures: input.disclosures }),
    ...(input.stories === undefined ? {} : { stories: input.stories }),
    ...(input.now === undefined ? {} : { storyClock: () => new Date(input.now!) })
  });
}

describe("M5 · the disclosure contract", () => {
  it("is a declared route and resource of the contract inventory", () => {
    expect(contractInventory.routes).toContain("GET /v1/answers/{id}/disclosure");
    expect(contractInventory.resources.AnswerDisclosureSchema).toBe(AnswerDisclosureSchema);
  });

  it("parses a floor answer's record: the floor, its owner-only cause, no roles, what cut it short", () => {
    const disclosure = buildAnswerDisclosure(FLOOR_READ);
    expect(AnswerDisclosureSchema.parse(disclosure)).toEqual({
      answer_id: STORY_TEST_ANSWER_ID,
      answer_version: 1,
      floor: { verdict_state: "SUPPORTED", leading_node_id: LEADING, basis_incomplete: false },
      floor_reason: "ENVELOPE_EXHAUSTED",
      writer: null,
      checker: null,
      checker_same_as_writer: false,
      digest: { compacted: false, points_left_out: 0 },
      cut_short: { arguing: null, answer_writing: "MONEY" }
    });
  });

  it("names the planned and the served model the way the story's 'Written by' does, and the lower-cost swap", () => {
    const disclosure = AnswerDisclosureSchema.parse(buildAnswerDisclosure(FALLBACK_READ));
    expect(disclosure).toMatchObject({ floor: null, floor_reason: null });
    const lineageA = { maker: "Maker A", model_id: "maker-a/model-1", transport: "openai-compatible-http", provider_ref: "provider:a" };
    const lineageC = { maker: "Maker C", model_id: "maker-c/model-2", transport: "openai-compatible-http", provider_ref: "provider:c" };
    expect(disclosure).toMatchObject({
      floor: null,
      writer: { planned_model: lineageA, served_model: lineageC, lower_cost: true },
      checker: { planned_model: lineageA, served_model: lineageC, lower_cost: true },
      checker_same_as_writer: true,
      digest: { compacted: true, points_left_out: 140 },
      cut_short: { arguing: "MONEY", answer_writing: null }
    });
    // Never an address, a credential or a price: only the four lineage members.
    const text = JSON.stringify(disclosure);
    for (const forbidden of ["http://", "https://", "authorization", "price", "base_url"]) expect(text).not.toContain(forbidden);
  });

  it("keeps a planned model it cannot name as null, and returns no digest when none was handed to the writer", () => {
    const disclosure = buildAnswerDisclosure({
      row: storedRow({
        writerServedRef: "provider:a", checkerServedRef: "provider:a", checkerSameAsWriter: true, serveStop: null,
        digestRung: null, digestPointsOmitted: null, ...NO_FLOOR
      }),
      models: { writerPlanned: null, writerServed: MODEL_A, checkerPlanned: null, checkerServed: MODEL_A }
    });
    // M5 review, M2: no rung means no digest, not a whole one.
    expect(AnswerDisclosureSchema.parse(disclosure)).toMatchObject({
      writer: { planned_model: null, lower_cost: false },
      digest: null
    });
    expect(buildAnswerDisclosure({ ...FALLBACK_READ, row: storedRow({ ...FALLBACK_READ.row, digestRung: 3, digestPointsOmitted: 0 }) }).digest)
      .toEqual({ compacted: true, points_left_out: 0 });
    expect(buildAnswerDisclosure({ ...FALLBACK_READ, row: storedRow({ ...FALLBACK_READ.row, digestRung: 0, digestPointsOmitted: 0 }) }).digest)
      .toEqual({ compacted: false, points_left_out: 0 });
  });

  it("says when a floor's label was derived on a thin basis (M5 review, I2)", () => {
    const thin = buildAnswerDisclosure({ ...FLOOR_READ, row: storedRow({ floorBasisIncomplete: true }) });
    expect(AnswerDisclosureSchema.parse(thin).floor).toEqual({
      verdict_state: "SUPPORTED", leading_node_id: LEADING, basis_incomplete: true
    });
  });

  it("names each sealed cause as the owner-only floor_reason, and refuses one it does not know", () => {
    for (const reason of ["ENVELOPE_EXHAUSTED", "DIGEST_CANNOT_EXIST", "TRANSPORT_DEATH", "NO_ARTIFACT"] as const) {
      expect(buildAnswerDisclosure({ ...FLOOR_READ, row: storedRow({ floorReason: reason }) }).floor_reason).toBe(reason);
    }
    expect(() => buildAnswerDisclosure({ ...FLOOR_READ, row: storedRow({ floorReason: "COMPONENTS_ONLY" }) })).toThrow();
    // A floor names its cause, and only a floor has one.
    const disclosure = buildAnswerDisclosure(FLOOR_READ);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, floor_reason: null }).success).toBe(false);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, floor: null }).success).toBe(false);
  });

  it("stays strict: an unknown member, a label outside the three, or a leading node that is not an id is refused", () => {
    const disclosure = buildAnswerDisclosure(FLOOR_READ);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, reason: "ENVELOPE_EXHAUSTED" }).success).toBe(false);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, floor: { ...disclosure.floor, verdict_state: "MAYBE" } }).success).toBe(false);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, floor: { ...disclosure.floor, leading_node_id: "node:1" } }).success).toBe(false);
    expect(AnswerDisclosureSchema.safeParse({
      ...disclosure, floor: { verdict_state: "SUPPORTED", leading_node_id: LEADING }
    }).success).toBe(false);
    expect(AnswerDisclosureSchema.safeParse({ ...disclosure, cut_short: { arguing: "BUDGET", answer_writing: null } }).success).toBe(false);
  });
});

describe("GET /v1/answers/{id}/disclosure (spec §14.4.5)", () => {
  it("refuses an anonymous caller before anything is read", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({ answer: answerOf(), disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls), reads });
    const response = await server.inject({ method: "GET", url: URL_OF });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(reads).toEqual([]);
    expect(calls).toEqual([]);
    await server.close();
  });

  it("answers the closed 404 when the read is not composed, and never reads", async () => {
    const reads: unknown[] = [];
    const server = api({ answer: answerOf(), reads });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "DISCLOSURE_NOT_FOUND" });
    expect(reads).toEqual([]);
    await server.close();
  });

  it("answers the same closed 404 for a malformed id and never reads", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({ answer: answerOf(), disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls), reads });
    const response = await server.inject({ method: "GET", url: "/v1/answers/not-a-uuid/disclosure", headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "DISCLOSURE_NOT_FOUND" });
    expect(reads).toEqual([]);
    expect(calls).toEqual([]);
    await server.close();
  });

  it("answers the same closed 404 for an answer that is not the caller's, without touching the record", async () => {
    const calls: unknown[] = [];
    const server = api({ answer: null, disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "DISCLOSURE_NOT_FOUND" });
    expect(calls).toEqual([]);
    await server.close();
  });

  it("answers the same closed 404 for the caller's own answer that has no record", async () => {
    const server = api({ answer: answerOf(), disclosures: disclosures(null) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "DISCLOSURE_NOT_FOUND" });
    await server.close();
  });

  it("returns the owner's record under the caller's ownership, uncached", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({
      answer: answerOf(FLOOR_ANSWER_OVERRIDES), disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls), reads
    });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(AnswerDisclosureSchema.parse(response.json())).toMatchObject({
      answer_id: STORY_TEST_ANSWER_ID,
      floor: { verdict_state: "SUPPORTED", leading_node_id: LEADING, basis_incomplete: false },
      floor_reason: "ENVELOPE_EXHAUSTED"
    });
    const ownership = { ownerRef: OWNER.authenticated.ownerRef, legacyAskerId: null };
    expect(reads).toEqual([{ answerId: STORY_TEST_ANSWER_ID, version: undefined, ownership }]);
    expect(calls).toEqual([{ answerId: STORY_TEST_ANSWER_ID, ownership }]);
    await server.close();
  });

  it("hands the repository the ownership exactly as the API resolved it, and builds the contract from its read", async () => {
    const received: unknown[] = [];
    const floorReceived: unknown[] = [];
    const reader = new RepositoryAnswerDisclosureApplication({
      readLatestForAnswer: async (input) => {
        received.push(input);
        return FALLBACK_READ;
      },
      readLatestFloorForAnswer: async (input) => {
        floorReceived.push(input);
        return {
          answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, runId: STORY_TEST_RUN_ID, verdictState: "UNSUPPORTED",
          leadingNodeId: LEADING, reason: "DIGEST_CANNOT_EXIST", basisIncomplete: true
        };
      }
    });
    await expect(reader.readDisclosure({
      answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "asker:legacy" }
    })).resolves.toEqual(buildAnswerDisclosure(FALLBACK_READ));
    expect(received).toEqual([{ answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "asker:legacy" } }]);
    // The floor-only read (M5 review, M6): the floor and nothing else, no cause.
    await expect(reader.readFloor({
      answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "asker:legacy" }
    })).resolves.toEqual({ verdict_state: "UNSUPPORTED", leading_node_id: LEADING, basis_incomplete: true });
    expect(floorReceived).toEqual(received);
    const absent = new RepositoryAnswerDisclosureApplication({
      readLatestForAnswer: async () => null, readLatestFloorForAnswer: async () => null
    });
    await expect(absent.readDisclosure({
      answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "asker:legacy" }
    })).resolves.toBeNull();
    await expect(absent.readFloor({
      answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "asker:legacy" }
    })).resolves.toBeNull();
  });
});

describe("M5 · the story route treats a floor answer like a served one", () => {
  function stories(stored: ReturnType<typeof storedStoryRecord> | null): AnswerStoryApplication {
    return {
      readStory: async () => stored,
      readStoryAnchor: async () => ({ answerVersion: 1, storedAt: new Date(CREATED_AT) })
    };
  }

  it("names a served verdict or a floor as a label a story is written for, and nothing else", () => {
    expect(answerCarriesStoryLabel({ verdictState: "CONTESTED", floorVerdictState: null })).toBe(true);
    expect(answerCarriesStoryLabel({ verdictState: null, floorVerdictState: "SUPPORTED" })).toBe(true);
    expect(answerCarriesStoryLabel({ verdictState: null, floorVerdictState: null })).toBe(false);
  });

  it("says WRITING, not NO_VERDICT, for a floor answer whose story is not stored yet, through the floor-only read", async () => {
    const calls: unknown[] = [];
    const floorCalls: unknown[] = [];
    const server = api({
      answer: answerOf(FLOOR_ANSWER_OVERRIDES), stories: stories(null),
      disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls, floorCalls), now: "2026-09-26T10:05:00.000Z"
    });
    const body = AnswerStorySchema.parse((await server.inject({
      method: "GET", url: `/v1/answers/${STORY_TEST_ANSWER_ID}/story`, headers: HEADERS
    })).json());
    expect(body).toMatchObject({ status: "WRITING", unavailable_reason: null, story: null });
    // M5 review, M6: the floor alone, never the full record with its model lookups.
    expect(floorCalls).toHaveLength(1);
    expect(calls).toEqual([]);
    await server.close();
  });

  it("says UNAVAILABLE / STORY_WINDOW_PASSED, never NO_VERDICT, once a floor answer's window has passed", async () => {
    const server = api({
      answer: answerOf(FLOOR_ANSWER_OVERRIDES), stories: stories(null),
      disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ)), now: "2026-09-26T10:41:00.000Z"
    });
    const body = AnswerStorySchema.parse((await server.inject({
      method: "GET", url: `/v1/answers/${STORY_TEST_ANSWER_ID}/story`, headers: HEADERS
    })).json());
    expect(body).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "STORY_WINDOW_PASSED" });
    await server.close();
  });

  it("returns a floor answer's stored story, READY, without reading the record at all", async () => {
    const calls: unknown[] = [];
    const floorCalls: unknown[] = [];
    const server = api({
      answer: answerOf(FLOOR_ANSWER_OVERRIDES), stories: stories(storedStoryRecord()),
      disclosures: disclosures(buildAnswerDisclosure(FLOOR_READ), calls, floorCalls)
    });
    const response = await server.inject({ method: "GET", url: `/v1/answers/${STORY_TEST_ANSWER_ID}/story`, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(AnswerStorySchema.parse(response.json()).status).toBe("READY");
    expect(calls).toEqual([]);
    expect(floorCalls).toEqual([]);
    await server.close();
  });

  it("keeps NO_VERDICT for a components-only answer with no floor, or with no record, and never reads it for a served one", async () => {
    const noFloor = buildAnswerDisclosure({ ...FLOOR_READ, row: storedRow(NO_FLOOR) });
    for (const record of [noFloor, null]) {
      const server = api({
        answer: answerOf(FLOOR_ANSWER_OVERRIDES), stories: stories(null),
        disclosures: disclosures(record), now: "2026-09-26T10:01:00.000Z"
      });
      const body = AnswerStorySchema.parse((await server.inject({
        method: "GET", url: `/v1/answers/${STORY_TEST_ANSWER_ID}/story`, headers: HEADERS
      })).json());
      expect(body).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "NO_VERDICT" });
      await server.close();
    }
    const calls: unknown[] = [];
    const floorCalls: unknown[] = [];
    const served = api({
      answer: answerOf(), stories: stories(null), disclosures: disclosures(noFloor, calls, floorCalls), now: "2026-09-26T10:01:00.000Z"
    });
    const body = AnswerStorySchema.parse((await served.inject({
      method: "GET", url: `/v1/answers/${STORY_TEST_ANSWER_ID}/story`, headers: HEADERS
    })).json());
    expect(body.status).toBe("WRITING");
    expect(calls).toEqual([]);
    expect(floorCalls).toEqual([]);
    await served.close();
  });
});
