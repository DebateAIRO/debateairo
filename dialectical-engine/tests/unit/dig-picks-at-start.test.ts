import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { AskParent } from "@debateai/contract";
import {
  digAnchorOf, digPathIndexOf, digPickAuthorOf, recordDigPicksAtStart, type DigPicksPort
} from "../../apps/api/src/dig-admission.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Dig-model revision task W3-7 — A DIG'S PICKS ARE STORED AT START. The asks route keeps what a dig was made of (0135),
 * right after the dig joined its parent's investigation: the path of the parent's map its picks are on (owner Q-D1: one
 * path; null when they hang under the main question itself), each pick's kind, suggestion, place and text, and who wrote
 * it: the person's own view is theirs; a chosen suggestion is the AI's only when its text is the stored suggestion's,
 * word for word; edited, or with no stored suggestion to compare with, it is the person's (PERSON_EDITED).
 */

const IDENTITY = testHttpIdentity("dig-picks-at-start");
const OWNER_REF = IDENTITY.authenticated.ownerRef;
const HEADERS = testSessionHeaders(IDENTITY, true);
const PARENT = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const INDEX = digPathIndexOf([
  { position_ref: "pos-a", node_refs: ["n1", "n2"] },
  { position_ref: "pos-b", node_refs: ["n2", "n3"] }
]);

const parentOf = (overrides: Partial<AskParent> = {}): AskParent => ({
  parent_run_id: PARENT, places: [], mode: "quick",
  picks: [
    { kind: "OWN_VIEW", suggestion_id: null, place: "p:n1", text: "Rent in Munich eats most of the difference." },
    { kind: "NEEDS_MORE_WEB", suggestion_id: "sg-1", place: "p:n1", text: "What does a nurse earn in Munich?" }
  ],
  ...overrides
});

describe("the path a dig's picks are on", () => {
  it("is the one path every place shares, the first in the story's order when a point is on two", () => {
    expect(digAnchorOf(parentOf(), INDEX)).toBe("pos-a");
    expect(digAnchorOf(parentOf({ places: ["path:pos-b"], picks: undefined }), INDEX)).toBe("pos-b");
    expect(digAnchorOf(parentOf({ places: ["p:n2"], picks: undefined }), INDEX)).toBe("pos-a");
    expect(digAnchorOf(parentOf({ places: ["p:n3"], picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "p:n2", text: "x" }] }), INDEX))
      .toBe("pos-b");
  });

  it("is none when the places hang under the main question, or name nothing", () => {
    expect(digAnchorOf(parentOf({ places: ["w"], picks: undefined }), INDEX)).toBeNull();
    expect(digAnchorOf(parentOf({ places: ["o:1"], picks: undefined }), null)).toBeNull();
    expect(digAnchorOf(parentOf({ places: [], picks: undefined }), INDEX)).toBeNull();
    // Without a story a node names no path; a path named outright is that path.
    expect(digAnchorOf(parentOf(), null)).toBeNull();
    expect(digAnchorOf(parentOf({ places: ["path:pos-a"], picks: undefined }), null)).toBe("pos-a");
  });
});

describe("who wrote a pick", () => {
  it("the person's own view is theirs; a suggestion is the AI's only word for word", () => {
    const [own, suggestion] = parentOf().picks!;
    expect(digPickAuthorOf(own!, null)).toBe("PERSON_OWN_VIEW");
    expect(digPickAuthorOf(own!, "anything")).toBe("PERSON_OWN_VIEW");
    expect(digPickAuthorOf(suggestion!, "What does a nurse earn in Munich?")).toBe("AI_SUGGESTION");
    expect(digPickAuthorOf(suggestion!, "  What does a nurse earn in Munich?  ")).toBe("AI_SUGGESTION");
    expect(digPickAuthorOf(suggestion!, "What does a nurse earn in Berlin?")).toBe("PERSON_EDITED");
    // No stored suggestion to compare with: the text is what the person sent, never passed off as an AI's.
    expect(digPickAuthorOf(suggestion!, null)).toBe("PERSON_EDITED");
  });
});

function picksPort(outcome: Awaited<ReturnType<DigPicksPort["record"]>> | Error = "RECORDED") {
  const recorded: Parameters<DigPicksPort["record"]>[0][] = [];
  const port: DigPicksPort = {
    record: async (input) => { recorded.push(input); if (outcome instanceof Error) throw outcome; return outcome; }
  };
  return { port, recorded };
}

describe("recording the picks at start", () => {
  it("writes the set once with every pick in order, its author decided by the stored suggestion", async () => {
    const { port, recorded } = picksPort();
    const lines: string[] = [];
    expect(await recordDigPicksAtStart({ ownerRef: OWNER_REF, parent: parentOf(), childRunId: CHILD, positionRef: "pos-a" }, port,
      async (_owner, parentRunId, suggestionId) => (parentRunId === PARENT && suggestionId === "sg-1" ? "What does a nurse earn in Munich?" : null),
      (line) => lines.push(line))).toBe("RECORDED");
    expect(recorded).toEqual([{ ownerRef: OWNER_REF, runId: CHILD, parentRunId: PARENT, positionRef: "pos-a", picks: [
      { kind: "OWN_VIEW", suggestionId: null, place: "p:n1", author: "PERSON_OWN_VIEW", text: "Rent in Munich eats most of the difference." },
      { kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: "p:n1", author: "AI_SUGGESTION", text: "What does a nurse earn in Munich?" }
    ] }]);
    expect(lines).toEqual([]);
  });

  it("a dig of a page that sends no picks keeps an empty set; a write that does not take is logged by its code only", async () => {
    const { port, recorded } = picksPort("NOT_A_DIG");
    const lines: string[] = [];
    expect(await recordDigPicksAtStart({ ownerRef: OWNER_REF, parent: parentOf({ places: ["path:pos-a"], picks: undefined }), childRunId: CHILD,
      positionRef: "pos-a" }, port, undefined, (line) => lines.push(line))).toBe("NOT_A_DIG");
    expect(recorded[0]!.picks).toEqual([]);
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_DIG_PICKS", code: "DIG_PICKS_NOT_A_DIG" })]);
  });

  it("never throws: a store that fails is one code line, never the question or a pick", async () => {
    const { port } = picksPort(Object.assign(new Error("Rent in Munich eats most of the difference."), { code: "57P01" }));
    const lines: string[] = [];
    expect(await recordDigPicksAtStart({ ownerRef: OWNER_REF, parent: parentOf(), childRunId: CHILD, positionRef: "pos-a" }, port,
      undefined, (line) => lines.push(line))).toBe("FAILED");
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_DIG_PICKS", code: "DIG_PICKS_FAILED" })]);
    expect(lines.join("")).not.toContain("Munich");
  });
});

describe("the asks route keeps the picks after the join", () => {
  const askOf = (parent: AskParent) => ({
    question_line: "Should I move from Cluj to Munich as a nurse? Dig: rent in Munich.",
    risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
    composition_budget_tier: "low", plan_tier: "premium", depth_params: { depth: 1 },
    decision_scope: "test-layer scope", as_of: "2026-10-31T00:00:00.000Z", steering_presets: [], steering_annotations: [], parent
  });
  function apiWith(joined: "JOINED" | "TOO_DEEP", picks: DigPicksPort) {
    const application = {
      submit: async () => ({ run_ref: CHILD, status: "QUEUED" as const })
    } as unknown as AskApplication;
    return buildApi({
      application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
      questionCheck: { check: async () => ({ outcome: "PASS" as const }) },
      digModel: { readDigLevel: async () => 0, readPause: async () => null, resume: async () => "NOT_OWNED" as const },
      investigations: {
        join: async () => ({ outcome: joined, investigationId: "inv-1", digLevel: joined === "JOINED" ? 1 : null }),
        reopen: async () => "REOPENED" as const
      },
      digPicks: picks
    });
  }

  it("a dig that joined has its picks stored, on the path its places share", async () => {
    const { port, recorded } = picksPort();
    const api = apiWith("JOINED", port);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS,
      payload: askOf(parentOf({ places: ["path:pos-a"], picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:pos-a", text: "Rent is high." }] })) });
    expect(response.statusCode).toBe(202);
    expect(recorded).toEqual([{ ownerRef: OWNER_REF, runId: CHILD, parentRunId: PARENT, positionRef: "pos-a",
      picks: [{ kind: "OWN_VIEW", suggestionId: null, place: "path:pos-a", author: "PERSON_OWN_VIEW", text: "Rent is high." }] }]);
    await api.close();
  });

  it("a dig whose join did not take stores none, and the ask still starts", async () => {
    const { port, recorded } = picksPort();
    const api = apiWith("TOO_DEEP", port);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf({ places: ["path:pos-a"],
      picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:pos-a", text: "Rent is high." }] })) });
    expect(response.statusCode).toBe(202);
    expect(recorded).toEqual([]);
    await api.close();
  });
});
