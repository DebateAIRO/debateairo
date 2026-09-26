import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicDebateSchema,
  PublicStoryShortSchema,
  StoryBodySchema,
  type PublicStoryShort,
  type StoryBody
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
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
  reviewer_note: null
};

const REQUEST_ID = `request:${randomUUID()}`;

afterEach(() => {
  vi.restoreAllMocks();
});

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
    source: { ip: "192.0.2.1", userAgent: "story test", requestId: REQUEST_ID }
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

  it("refuses the checker's reservation: it stays owner-only", () => {
    expect(PublicStoryShortSchema.safeParse({ ...SHORT, reservation: null }).success).toBe(false);
    expect(PublicStoryShortSchema.safeParse({ ...SHORT, reservation: "P7 comes from one source." }).success).toBe(false);
  });
});

/**
 * The public limits mirror the story body's (fix round 1, minor 2). A
 * published snapshot is parsed on every public read, so the two must never
 * drift: each probe sits at a limit or one past it, and the public schema and
 * the body schema must agree on it, at the spec's own limits.
 */
describe("public short story limits", () => {
  const at = (length: number): string => "x".repeat(length);
  const refs = (count: number): string[] => Array.from({ length: count }, (_, index) => `node:${String(index)}`);
  const path = STORY_TEST_BODY.short.paths[0]!;
  const paths = (count: number): PublicStoryShort["paths"] =>
    Array.from({ length: count }, (_, index) => ({ ...path, position_ref: `node:position-${String(index)}` }));
  const probes: readonly (readonly [string, Partial<PublicStoryShort>, boolean])[] = [
    ["a headline of 160 characters", { headline: at(160) }, true],
    ["a headline of 161 characters", { headline: at(161) }, false],
    ["a blank headline", { headline: "   " }, false],
    ["a summary of 900 characters", { summary: at(900) }, true],
    ["a summary of 901 characters", { summary: at(901) }, false],
    ["no path", { paths: [] }, false],
    ["8 paths", { paths: paths(8) }, true],
    ["9 paths", { paths: paths(9) }, false],
    ["a path line of 240 characters", { paths: [{ ...path, line: at(240) }] }, true],
    ["a path line of 241 characters", { paths: [{ ...path, line: at(241) }] }, false],
    ["a path citing 40 points", { paths: [{ ...path, node_refs: refs(40) }] }, true],
    ["a path citing 41 points", { paths: [{ ...path, node_refs: refs(41) }] }, false],
    ["a fate outside the four", { paths: [{ ...path, fate: "MAYBE" as never }] }, false],
    ["a change text of 400 characters", { change: { text: at(400), node_refs: [] } }, true],
    ["a change text of 401 characters", { change: { text: at(401), node_refs: [] } }, false],
    ["a reviewer's note of 1200 characters", { reviewer_note: { text: at(1200), node_refs: [] } }, true],
    ["a reviewer's note of 1201 characters", { reviewer_note: { text: at(1201), node_refs: [] } }, false]
  ];

  it.each(probes)("agrees with the story body on %s", (_name, change, accepted) => {
    const probe = { ...SHORT, ...change };
    const body: StoryBody = {
      ...STORY_TEST_BODY,
      short: { headline: probe.headline, summary: probe.summary, paths: probe.paths, change: probe.change },
      reviewer_note: probe.reviewer_note
    };
    expect(StoryBodySchema.safeParse(body).success).toBe(accepted);
    expect(PublicStoryShortSchema.safeParse(probe).success).toBe(accepted);
  });
});

describe("toPublicStoryShort", () => {
  it("copies only the short fields of a READY story, with no reservation", () => {
    expect(toPublicStoryShort(storedStoryRecord())).toEqual(SHORT);
  });

  it("carries the reviewer's note and no owner-only field: no reservation, lineage, point numbers, verdict basis or pack", () => {
    const note = { text: "The rent could be lower in a cheaper district.", node_refs: ["node:defeater"] };
    const stored = storedStoryRecord({ body: { ...STORY_TEST_BODY, reviewer_note: note } });
    const short = toPublicStoryShort(stored);
    expect(short?.reviewer_note).toEqual(note);
    expect(Object.keys(short ?? {}).sort()).toEqual(["change", "headline", "paths", "reviewer_note", "summary"]);
    const text = JSON.stringify(short);
    expect(text).not.toContain(stored.packFingerprint!);
    expect(text).not.toContain(stored.storytellerLineage!.model_id);
    expect(text).not.toContain(stored.checkerLineage!.model_id);
    expect(text).not.toContain("\"P1\"");
    expect(text).not.toContain(stored.verdictBasis!.trigger);
  });

  it("publishes a READY_WITH_RESERVATION story without the checker's reservation", () => {
    const short = toPublicStoryShort(storedStoryRecord({
      outcome: "READY_WITH_RESERVATION", reservation: "P7, the rent figure, comes from one source."
    }));
    expect(short).toEqual(SHORT);
    expect(JSON.stringify(short)).not.toContain("the rent figure");
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

  it("logs nothing when there is simply no ready story", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await publishWith({ readStoryShort: async () => null });
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    ["a typed error logs its code", new TypedDomainError("STORY_ROW_INVALID", "row for question about my rent"), "STORY_ROW_INVALID"],
    ["an untyped error logs its class name", new TypeError("story store down reading my rent question"), "TypeError"],
    ["a thrown non-error logs a fixed code", "my rent question", "UNEXPECTED_ERROR"],
    ["an error named with free text logs a fixed code", Object.assign(new Error("x"), { name: "about my rent" }), "UNEXPECTED_ERROR"]
  ])("never lets a story read failure block publishing: %s, never the message", async (_name, thrown, diagnostic) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const debate = await publishWith({ readStoryShort: async () => { throw thrown; } });
    expect("story_short" in debate).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain("rent");
    expect(JSON.parse(line)).toEqual({
      event: "api.publication.story_not_published", requestId: REQUEST_ID, diagnostic
    });
  });

  it("publishes without a story when the reader answers with something the public schema refuses", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const malformed = { ...SHORT, reservation: "P7, the rent figure, comes from one source." } as unknown as PublicStoryShort;
    const debate = await publishWith({ readStoryShort: async () => malformed });
    expect("story_short" in debate).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain("rent");
    expect(JSON.parse(line)).toEqual({
      event: "api.publication.story_not_published", requestId: REQUEST_ID, diagnostic: "STORY_PUBLIC_SHORT_REFUSED"
    });
  });

  it("publishes exactly as before when no reader is composed", async () => {
    const debate = await publishWith(undefined);
    expect("story_short" in debate).toBe(false);
  });
});

describe("story words", () => {
  it("counts positions the way the story does: nodes with no outgoing edge of any kind", () => {
    // Pre-flight ruling (2026-09-26), self-loop exemption confirmed in fix
    // round 1: a position is a maker root. `b` argues about `a`, `c` undercuts
    // an arrow, and `e` argues about a point the snapshot does not carry, so
    // none of them is a position. `d`'s only edge refers to itself, which is
    // not an argument about another point, so `d` still is one.
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
