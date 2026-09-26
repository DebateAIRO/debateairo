import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, PublicStoryShortSchema, type PublicStoryShort } from "@debateai/contract";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  loadKek,
  type CryptoEnvelope
} from "../../packages/crypto/src/index.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import {
  PostgresPublicationApplication,
  type PublicationStoryReader
} from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { toPublicStoryShort } from "../../packages/story/src/public.js";
import { countStoryPositions, morePathsWords } from "../../apps/ui/lib/v3/storyWords.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_BODY, storedStoryRecord } from "../support/storyApiFixtures.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

const OLD_SNAPSHOT = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Name",
  question: "Should the public see this?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "FULL",
    summary_segments: [{ text: "Only presentation text crosses the boundary." }],
    badges: [], residual_objections: [], reversal_point: "Contrary public evidence",
    as_of: "2026-08-24T00:00:00.000Z"
  }
} as const;

const SHORT: PublicStoryShort = {
  headline: STORY_TEST_BODY.short.headline,
  summary: STORY_TEST_BODY.short.summary,
  paths: STORY_TEST_BODY.short.paths,
  change: STORY_TEST_BODY.short.change,
  reviewer_note: null,
  reservation: null
};

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

async function publishWith(stories: PublicationStoryReader | undefined) {
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd3))));
  let stored: Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }> | null = null;
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async (input: Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }>) => {
      stored = { publicationRef: input.publicationRef, runId: input.runId, contentCiphertext: input.contentCiphertext };
      return true;
    },
    abandonKeyProvision: async () => true,
    readPublic: async () => null
  } as unknown as PostgresPublicationRepository;
  const application = stories === undefined
    ? new PostgresPublicationApplication(repository, cipher, () => new Date("2026-09-26T12:00:00.000Z"))
    : new PostgresPublicationApplication(repository, cipher, () => new Date("2026-09-26T12:00:00.000Z"), repository, stories);
  const transition = await application.publish({
    runId: RUN_ID,
    answer: buildFairShapedAnswer({ run_ref: RUN_ID, answer_id: STORY_TEST_ANSWER_ID }),
    authenticated,
    grantToken: "g".repeat(43),
    source: { ip: "192.0.2.1", userAgent: "story test", requestId: `request:${randomUUID()}` }
  });
  expect(transition?.state).toBe("PUBLISHED");
  const snapshot = stored as Readonly<{ publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }> | null;
  if (snapshot === null) throw new TypeError("STORY_TEST_SNAPSHOT_MISSING");
  const prepared = await cipher.open(snapshot.publicationRef, snapshot.runId);
  try {
    return PublicDebateSchema.parse(prepared.decrypt(snapshot.contentCiphertext));
  } finally {
    prepared.close();
  }
}

describe("public short story contract (spec §10)", () => {
  it("still parses every snapshot published before the story existed", () => {
    expect(PublicDebateSchema.parse(OLD_SNAPSHOT).story_short).toBeUndefined();
  });

  it("parses a snapshot that carries a short story", () => {
    expect(PublicDebateSchema.parse({ ...OLD_SNAPSHOT, story_short: SHORT }).story_short).toEqual(SHORT);
  });

  it("refuses a short story with a field the contract does not name", () => {
    expect(PublicStoryShortSchema.safeParse({ ...SHORT, long: STORY_TEST_BODY.long }).success).toBe(false);
    expect(PublicDebateSchema.safeParse({ ...OLD_SNAPSHOT, story_short: { ...SHORT, answer_id: "x" } }).success).toBe(false);
  });
});

describe("toPublicStoryShort", () => {
  it("copies only the short fields of a READY story, with no reservation", () => {
    expect(toPublicStoryShort(storedStoryRecord())).toEqual(SHORT);
  });

  it("carries the reviewer's note and no owner-only field: no lineage, point numbers, verdict basis or pack", () => {
    const note = { text: "The rent could be lower in a cheaper district.", node_refs: ["node:defeater"] };
    const stored = storedStoryRecord({ body: { ...STORY_TEST_BODY, reviewer_note: note } });
    const short = toPublicStoryShort(stored);
    expect(short?.reviewer_note).toEqual(note);
    expect(Object.keys(short ?? {}).sort()).toEqual(
      ["change", "headline", "paths", "reservation", "reviewer_note", "summary"]
    );
    const text = JSON.stringify(short);
    expect(text).not.toContain(stored.packFingerprint!);
    expect(text).not.toContain(stored.storytellerLineage!.model_id);
    expect(text).not.toContain(stored.checkerLineage!.model_id);
    expect(text).not.toContain("\"P1\"");
    expect(text).not.toContain(stored.verdictBasis!.trigger);
  });

  it("carries the checker's reservation only with READY_WITH_RESERVATION", () => {
    expect(toPublicStoryShort(storedStoryRecord({
      outcome: "READY_WITH_RESERVATION", reservation: "The rent figure comes from one source."
    }))?.reservation).toBe("The rent figure comes from one source.");
    expect(toPublicStoryShort(storedStoryRecord({ reservation: "ignored for READY" }))?.reservation).toBeNull();
  });

  it("publishes nothing for a FAILED story", () => {
    expect(toPublicStoryShort(storedStoryRecord({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", body: null }))).toBeNull();
  });
});

describe("publish copies the short story", () => {
  it("copies a ready story into the snapshot and asks for the published answer's own version", async () => {
    const readStoryShort = vi.fn(async () => SHORT);
    const debate = await publishWith({ readStoryShort });
    expect(debate.story_short).toEqual(SHORT);
    expect(readStoryShort).toHaveBeenCalledWith({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, ownerRef: authenticated.ownerRef
    });
  });

  it("keeps today's snapshot when there is no ready story", async () => {
    const debate = await publishWith({ readStoryShort: async () => null });
    expect("story_short" in debate).toBe(false);
    expect(debate.answer.summary_segments).toEqual([{ text: "The served answer prose." }]);
  });

  it("never lets a story read failure block publishing", async () => {
    const debate = await publishWith({ readStoryShort: async () => { throw new Error("story store down"); } });
    expect("story_short" in debate).toBe(false);
  });

  it("publishes without a story when the reader answers with something the public schema refuses", async () => {
    const malformed = { ...SHORT, point_numbers: { "node:position": "P1" } } as unknown as PublicStoryShort;
    const debate = await publishWith({ readStoryShort: async () => malformed });
    expect("story_short" in debate).toBe(false);
  });

  it("publishes exactly as before when no reader is composed", async () => {
    const debate = await publishWith(undefined);
    expect("story_short" in debate).toBe(false);
  });
});

describe("story words", () => {
  it("counts positions the way the story does: nodes with no outgoing edge of any kind", () => {
    // Pre-flight ruling (2026-09-26): a position is a maker root. `b` argues
    // about `a`, `c` undercuts an arrow, and `e` argues about a point the
    // snapshot does not carry, so none of them is a position; a self-loop
    // points at no other point, so `d` still is one.
    const nodes = [{ node_id: "a" }, { node_id: "b" }, { node_id: "c" }, { node_id: "d" }, { node_id: "e" }];
    const edges = [
      { from_node_ref: "b", target_kind: "NODE" as const, target_ref: "a" },
      { from_node_ref: "c", target_kind: "EDGE" as const, target_ref: "edge:1" },
      { from_node_ref: "d", target_kind: "NODE" as const, target_ref: "d" },
      { from_node_ref: "e", target_kind: "NODE" as const, target_ref: "gone" }
    ];
    expect(countStoryPositions(nodes, edges)).toBe(2);
  });

  it("says how many positions the short version left out", () => {
    expect(morePathsWords(0)).toBeNull();
    expect(morePathsWords(1)).toBe("and 1 more position");
    expect(morePathsWords(4)).toBe("and 4 more positions");
  });
});
