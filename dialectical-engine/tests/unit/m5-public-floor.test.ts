import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  loadKek,
  type CryptoEnvelope
} from "../../packages/crypto/src/index.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID } from "../support/storyApiFixtures.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.4), TASK M5 — the public snapshot
 * carries the FLOOR of a components-only answer: its label and its leading
 * position, copied at publish time from the owner's disclosure record, the way
 * R2 copied the question's language. `PublicDebateSchema` stays strict, every
 * snapshot published before stays readable, and the floor never blocks a
 * publish. The public page's words for it are Task M6.
 */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = `request:${randomUUID()}`;

const OLD_SNAPSHOT = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Name",
  question: "Should the public see this?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "COMPONENTS_ONLY",
    verdict: null,
    verdict_available: false,
    confidence_band: null,
    summary_segments: [],
    badges: [], residual_objections: [], reversal_point: "Contrary public evidence",
    as_of: "2026-08-24T00:00:00.000Z"
  }
} as const;

const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:44444444-4444-4444-8444-444444444444",
    session_id: "55555555-5555-4555-8555-555555555555",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "66666666-6666-4666-8666-666666666666",
  ownerRef: "44444444-4444-4444-8444-444444444444",
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

type FloorReader = (input: Readonly<{ runId: string; answerId: string; userId: string; ownerRef: string }>) =>
  Promise<Readonly<{ verdictState: string; leadingNodeId: string; basisIncomplete: boolean | null }> | null>;

/** The engine's node ids are UUIDs (the record's column is `uuid`); the fixture's first node takes one. */
const LEADING = "33333333-3333-4333-8333-333333333333";

function componentsOnlyAnswer(): Answer {
  const served = buildFairShapedAnswer({ run_ref: RUN_ID, answer_id: STORY_TEST_ANSWER_ID });
  return {
    ...served,
    nodes: served.nodes.map((node, index) => index === 0 ? { ...node, node_id: LEADING } : node),
    terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY", verdict_state: null,
    verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" }, composed_text: [],
    confidence_band: null, band_ceiling: null
  };
}

async function publishWith(answer: Answer, readAnswerFloor: FloorReader) {
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd5))));
  let stored: Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }> | null = null;
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    readArgumentLanguageTag: async () => "ro",
    readAnswerFloor,
    prepareKeyProvision: async () => true,
    publish: async (input: Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }>) => {
      stored = { publicationRef: input.publicationRef, runId: input.runId, contentCiphertext: input.contentCiphertext };
      return true;
    },
    abandonKeyProvision: async () => true,
    readPublic: async () => null
  } as unknown as PostgresPublicationRepository;
  const application = new PostgresPublicationApplication(repository, cipher, () => new Date("2026-09-27T12:00:00.000Z"));
  const transition = await application.publish({
    runId: RUN_ID,
    answer,
    authenticated,
    grantToken: "g".repeat(43),
    source: { ip: "192.0.2.1", userAgent: "floor test", requestId: REQUEST_ID }
  });
  expect(transition?.state).toBe("PUBLISHED");
  const snapshot = stored as Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }> | null;
  if (snapshot === null) throw new TypeError("FLOOR_TEST_SNAPSHOT_MISSING");
  const prepared = await cipher.open(snapshot.publicationRef, snapshot.runId);
  try {
    return PublicDebateSchema.parse(prepared.decrypt(snapshot.contentCiphertext));
  } finally {
    prepared.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M5 · the public snapshot's floor, in the contract", () => {
  it("still parses every snapshot published before the floor existed", () => {
    expect(PublicDebateSchema.parse(OLD_SNAPSHOT).floor).toBeUndefined();
  });

  it("parses a snapshot that carries a floor, with its thin-basis flag", () => {
    const floor = { verdict_state: "SUPPORTED", leading_node_id: "33333333-3333-4333-8333-333333333333", basis_incomplete: true } as const;
    expect(PublicDebateSchema.parse({ ...OLD_SNAPSHOT, floor }).floor).toEqual(floor);
  });

  it("refuses a floor with a member the contract does not name, a label outside the three, a leading node that is not an id, or no basis flag", () => {
    const floor = { verdict_state: "SUPPORTED", leading_node_id: "33333333-3333-4333-8333-333333333333", basis_incomplete: false } as const;
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: { ...floor, reason: "ENVELOPE_EXHAUSTED" } }).success).toBe(false);
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: { ...floor, floor_reason: "ENVELOPE_EXHAUSTED" } }).success).toBe(false);
    const { basis_incomplete: _dropped, ...withoutBasis } = floor;
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: withoutBasis }).success).toBe(false);
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: { ...floor, verdict_state: "LIKELY" } }).success).toBe(false);
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: { ...floor, leading_node_id: "node:1" } }).success).toBe(false);
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, floor: null }).success).toBe(false);
  });
});

describe("M5 · publishing copies the floor from the owner's record", () => {
  it("copies a components-only answer's floor, read for this run, answer and owner", async () => {
    const answer = componentsOnlyAnswer();
    const leading = answer.nodes[0]!.node_id;
    expect(leading).toBe(LEADING);
    const reader = vi.fn<FloorReader>(async () => ({ verdictState: "CONTESTED", leadingNodeId: leading, basisIncomplete: true }));
    const debate = await publishWith(answer, reader);
    // M5 review, I2: the thin-basis flag travels; the cause never does.
    expect(debate.floor).toEqual({ verdict_state: "CONTESTED", leading_node_id: leading, basis_incomplete: true });
    expect(debate.answer).toMatchObject({ terminal: "COMPONENTS_ONLY", verdict: null, verdict_available: false });
    expect(reader).toHaveBeenCalledWith({
      runId: RUN_ID, answerId: STORY_TEST_ANSWER_ID, userId: authenticated.userId, ownerRef: authenticated.ownerRef
    });
  });

  it("publishes no floor for an answer with no record or no floor", async () => {
    const debate = await publishWith(componentsOnlyAnswer(), async () => null);
    expect("floor" in debate).toBe(false);
  });

  it("never reads a floor for a served answer: it carries its own label", async () => {
    const reader = vi.fn<FloorReader>(async () => ({ verdictState: "CONTESTED", leadingNodeId: randomUUID(), basisIncomplete: false }));
    const debate = await publishWith(buildFairShapedAnswer({ run_ref: RUN_ID, answer_id: STORY_TEST_ANSWER_ID }), reader);
    expect("floor" in debate).toBe(false);
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    ["the record cannot be read", async () => { throw new TypedDomainError("SERVE_DISCLOSURE_ROW_INVALID", "row 7 near SELECT floor"); }, "SERVE_DISCLOSURE_ROW_INVALID"],
    ["the record's label is not one the contract names", async () => ({ verdictState: "LIKELY", leadingNodeId: LEADING, basisIncomplete: false }), "FLOOR_REFUSED"],
    ["the floor's label receipt is missing, so its basis is unknown", async () => ({ verdictState: "SUPPORTED", leadingNodeId: LEADING, basisIncomplete: null }), "FLOOR_REFUSED"],
    ["its leading position is not a published node", async () => ({ verdictState: "SUPPORTED", leadingNodeId: randomUUID(), basisIncomplete: false }), "FLOOR_NODE_NOT_PUBLISHED"]
  ] as const)("never blocks the publish when %s: no floor, one bounded log line", async (_name, reader, diagnostic) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const debate = await publishWith(componentsOnlyAnswer(), reader as FloorReader);
    expect("floor" in debate).toBe(false);
    const lines = logged.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
      .filter((line) => line.event === "api.publication.floor_not_published");
    expect(lines).toEqual([{ event: "api.publication.floor_not_published", requestId: REQUEST_ID, diagnostic }]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("near SELECT");
  });
});
