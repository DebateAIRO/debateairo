/**
 * A21.2 · owner decision O4 (2026-09-28): the model-strength control on /new is SHOWN but greyed
 * out and marked "not in effect" while no VALID model scorecard is in force. The one server signal
 * for it rides on the response /new already reads, GET /v1/session, as a single yes/no:
 * `model_scorecard_in_force`. It must reveal nothing else — no version, no source, no state name,
 * no refusal reason. The page's half is tests/render/tier01-new-plan-tier.test.tsx (S01-41, S01-42,
 * A21-O4a, A21-O4b) and apps/ui/lib/modelStrength.test.mjs.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildApi, SESSION_COOKIE_NAME, type AskApplication } from "@debateai/api";
import { SessionSchema } from "@debateai/contract";
import { testHttpIdentity, testSessionApplication } from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {}
  };
}

async function readSessionBody(modelScorecardInForce: unknown): Promise<Record<string, unknown>> {
  const identity = testHttpIdentity("a21-model-strength-signal");
  const api = buildApi({
    application: application(),
    sessions: testSessionApplication([identity]),
    ...(modelScorecardInForce === undefined ? {} : { modelScorecardInForce: modelScorecardInForce as boolean })
  });
  try {
    const response = await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${identity.rawSessionToken}`, "user-agent": "a21-test-browser" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    // The rest of the body is the asker's own session, exactly as before.
    expect(body).toMatchObject(identity.authenticated.session);
    return body;
  } finally {
    await api.close();
  }
}

const VALID_READ = Object.freeze({
  state: "VALID",
  sourceRef: "operator: scorecards/next.json | modelScorecard v7 sha256:abc",
  scorecard: Object.freeze({ scorecardVersion: 7 })
});

describe("A21.2 O4 · GET /v1/session says whether a scored model list is in force", () => {
  it.each([
    { composed: true, says: true },
    { composed: false, says: false },
    { composed: undefined, says: false }
  ])("answers $says when the composition says $composed", async ({ composed, says }) => {
    const body = await readSessionBody(composed);
    expect(body.model_scorecard_in_force).toBe(says);
  });

  it("carries the one boolean and nothing else, and the contract reads it back", async () => {
    const identity = testHttpIdentity("a21-model-strength-signal");
    const body = await readSessionBody(true);
    expect(Object.keys(body).sort()).toEqual(
      [...Object.keys(identity.authenticated.session), "model_scorecard_in_force"].sort()
    );
    expect(SessionSchema.parse(body).model_scorecard_in_force).toBe(true);
  });

  it("never passes on more than yes or no, even when a composition hands it the whole scorecard read", async () => {
    const body = await readSessionBody(VALID_READ);
    expect(body.model_scorecard_in_force).toBe(false);
    const text = JSON.stringify(body);
    for (const leaked of ["VALID", "scorecardVersion", "sourceRef", "operator", "sha256", "next.json"]) {
      expect(text).not.toContain(leaked);
    }
  });
});

describe("A21.2 O4 · the contract carries the signal as an optional boolean", () => {
  const session = Object.freeze({
    asker_id: "owner:11111111-1111-4111-8111-111111111111",
    session_id: "22222222-2222-4222-8222-222222222222",
    caller_scope: "ASKER",
    ownership_provenance: "server_session",
    provisional_identity_model: false
  });

  it("reads a session without it exactly as before, and with a yes or a no", () => {
    expect(SessionSchema.parse(session)).toEqual(session);
    expect(SessionSchema.parse({ ...session, model_scorecard_in_force: true }).model_scorecard_in_force).toBe(true);
    expect(SessionSchema.parse({ ...session, model_scorecard_in_force: false }).model_scorecard_in_force).toBe(false);
  });

  it("refuses anything but a boolean, and still refuses any other extra key", () => {
    for (const value of ["VALID", "true", 1, 0, null, {}, { state: "VALID" }]) {
      expect(SessionSchema.safeParse({ ...session, model_scorecard_in_force: value }).success).toBe(false);
    }
    expect(SessionSchema.safeParse({ ...session, model_scorecard_version: 7 }).success).toBe(false);
  });
});

/*
 * Both run-creation compositions answer from the scorecard their admission runs under (source
 * pins, the precedent of tests/unit/model-picker-composition.test.ts): the production API from
 * the picker it hands admission, the acceptance runtime from the read it builds that picker on.
 */
/** The text of one `buildApi({ … })` call: from its opener to the first closer after it. */
function buildApiCall(source: string, opener: string, closer: string): string {
  const start = source.indexOf(opener);
  expect(start, `missing ${opener}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(closer, start);
  expect(end, `missing the end of ${opener}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("A21.2 O4 · both compositions tell /new what their admission runs under", () => {
  it("the production API answers from the picker admission asks", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(buildApiCall(source, "const api = buildApi({", "\n});\n")).toContain(
      '\n  modelScorecardInForce: modelPicker.scorecard.state === "VALID",\n'
    );
  });

  it("the acceptance runtime answers from the scorecard its picker is built on", async () => {
    const source = await readFile("acceptance/main.ts", "utf8");
    expect(source).toContain("modelPicker: askModelPickerSettings({\n      scorecard: modelScorecard,");
    expect(buildApiCall(source, "const api=buildApi({", "\n  });\n")).toContain(
      '\n    modelScorecardInForce:modelScorecard.state==="VALID",\n'
    );
  });
});
