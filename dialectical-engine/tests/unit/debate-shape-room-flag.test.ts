import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { AskRoomResponseSchema } from "@debateai/contract";
import { debateShapePolicyStartValues, lengthGuidancePolicyStartValues } from "@debateai/register";
import type { AskRoomReader } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Debate shape P2c (Contract deviation 7; P2a final review row "P2c:85"): with no debateShapePolicy row in force, the
 * API drops depth_mode, scrutiny and answer_length without a word. So the room read says, with one optional member,
 * whether they are in force, and /new offers them only then. Without the row the member is never written: today's
 * room body, byte for byte.
 */

const CUSTOMER_FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null } as const;
const INTERNAL_FITS = { ...CUSTOMER_FITS, funding: { kind: "INTERNAL", expires_at: "2026-10-14T00:00:00.000Z" } } as const;
const ROOM_URL = "/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=2";

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" as const }),
    readAnswer: async () => null,
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

async function roomBody(input: Readonly<{ policy: boolean; length?: boolean; internal?: boolean; noReader?: boolean }>): Promise<string> {
  const identity = testHttpIdentity("shape-room-flag");
  const askRoom: AskRoomReader = {
    readRoom: async () => ({
      room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null,
      ...(input.internal === true ? { funding: { kind: "INTERNAL" as const, expiresAt: new Date(INTERNAL_FITS.funding.expires_at) } } : {})
    })
  };
  const api = buildApi({
    application: fixtureApplication(), sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
    ...(input.noReader === true ? {} : { askRoom }),
    ...(input.policy ? { debateShapePolicy: debateShapePolicyStartValues() } : {}),
    ...(input.length === true ? { lengthGuidancePolicy: lengthGuidancePolicyStartValues() } : {})
  });
  try {
    const response = await api.inject({ method: "GET", url: ROOM_URL, headers: testSessionHeaders(identity) });
    expect(response.statusCode).toBe(200);
    return response.body;
  } finally {
    await api.close();
  }
}

describe("debate shape P2c — the room says whether the shape settings are in force", () => {
  it.each([["customer", CUSTOMER_FITS], ["internal", INTERNAL_FITS]] as const)(
    "the %s room: the member absent parses, true parses, false is refused", (_kind, room) => {
      expect("shape_settings" in AskRoomResponseSchema.parse(room)).toBe(false);
      expect(AskRoomResponseSchema.parse({ ...room, shape_settings: true })).toMatchObject({ shape_settings: true });
      expect(AskRoomResponseSchema.safeParse({ ...room, shape_settings: false }).success).toBe(false);
    }
  );

  it("keeps today's room body when no shape row is in force", async () => {
    expect(await roomBody({ policy: false })).toBe(JSON.stringify(CUSTOMER_FITS));
    expect(await roomBody({ policy: false, internal: true })).toBe(JSON.stringify(INTERNAL_FITS));
  });

  // LG-C Task 5 (INTERFACE §5.8, ruling Q9): the answer words ride the room after shape_settings; the length switch last.
  const SHAPE_START = debateShapePolicyStartValues();
  const SHAPE_WORDS = { short: SHAPE_START.answerLength.short.words, standard: SHAPE_START.answerLength.standard.words,
    detailed: SHAPE_START.answerLength.detailed.words };
  const LENGTH_WORDS = { short: 200, standard: 350, detailed: 1000 };

  it("says shape_settings: true, then the shape row's answer words, on the customer and the internal room when the row is in force", async () => {
    expect(SHAPE_WORDS).toEqual({ short: 200, standard: 350, detailed: 1000 });
    expect(await roomBody({ policy: true })).toBe(JSON.stringify({ ...CUSTOMER_FITS, shape_settings: true, answer_words: SHAPE_WORDS }));
    expect(await roomBody({ policy: true, internal: true }))
      .toBe(JSON.stringify({ ...INTERNAL_FITS, shape_settings: true, answer_words: SHAPE_WORDS }));
  });

  it("with the length row alone: the length row's words and length_settings: true, no shape_settings", async () => {
    expect(await roomBody({ policy: false, length: true })).toBe(JSON.stringify({ ...CUSTOMER_FITS, answer_words: LENGTH_WORDS, length_settings: true }));
    expect(await roomBody({ policy: false, length: true, internal: true }))
      .toBe(JSON.stringify({ ...INTERNAL_FITS, answer_words: LENGTH_WORDS, length_settings: true }));
  });

  it("with no room reader (FITS for the query's own tier): the length row's words and length_settings: true", async () => {
    expect(await roomBody({ policy: false, length: true, noReader: true }))
      .toBe(JSON.stringify({ ...CUSTOMER_FITS, answer_words: LENGTH_WORDS, length_settings: true }));
    expect(await roomBody({ policy: false, noReader: true })).toBe(JSON.stringify(CUSTOMER_FITS));
  });

  it("with both rows: shape_settings, the length row's words (they win), then length_settings", async () => {
    expect(await roomBody({ policy: true, length: true }))
      .toBe(JSON.stringify({ ...CUSTOMER_FITS, shape_settings: true, answer_words: LENGTH_WORDS, length_settings: true }));
  });
});
