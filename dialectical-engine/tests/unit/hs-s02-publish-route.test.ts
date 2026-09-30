import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  installPublicationJudgeSwitchSignal,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import { PublicDebateSchema, type Answer, type PublicDebate, type PublicStoryShort } from "@debateai/contract";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  loadKek,
  type CryptoEnvelope
} from "../../packages/crypto/src/index.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";
import {
  createPublicationContentCheck,
  PUBLICATION_CHECK_DEADLINE_MS,
  PublicationJudgeFailure,
  type PublicationCheckRecord,
  type PublicationContentCheck,
  type PublicationJudgePort
} from "../../apps/api/src/publication-check/check.js";
import { createPublicationJudgeSwitch } from "../../apps/api/src/publication-check/judge-transport.js";
import { extractCheckedText } from "../../apps/api/src/publication-check/material.js";
import { STORY_TEST_BODY } from "../support/storyApiFixtures.js";
import { createJudgeStub, type JudgeStubStep } from "../support/hs-s02-judge-stub.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * hate-speech S02-C4 (PLAN S02-10 … S02-12): the publish path runs the content
 * check on the snapshot BEFORE any key provision, encryption or transition, and
 * the route maps the three outcomes to 201 / 409 / 503 (SPEC-v2 R1, R6, R8, R9,
 * R13). The judge is the only scripted part; framing, validation, combination
 * and the statement are the real C2 code.
 */

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PSEUDONYM = "Stable Public Name";
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");

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

const ALLOW = JSON.stringify({ verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false });
const BLOCK_ILLEGAL = JSON.stringify({ verdict: "BLOCK", rules: [1, 2], parts: ["arguments", "question"], possibly_illegal: true });
const BLOCK_TERMS = JSON.stringify({ verdict: "BLOCK", rules: [1], parts: ["reviews"], possibly_illegal: false });
const UNSURE_NO_PARTS = JSON.stringify({ verdict: "UNSURE", rules: [], parts: [], possibly_illegal: false });
const UNSURE_PARTS = JSON.stringify({ verdict: "UNSURE", rules: [], parts: ["summary"], possibly_illegal: false });

const REFUSED_MESSAGE = "The content check refused to publish this debate. It stays private.";
const UNAVAILABLE_BODY = { error: "PUBLICATION_CHECK_UNAVAILABLE", message: "PUBLICATION_CHECK_UNAVAILABLE" };

function servedAnswer(overrides: Partial<Answer> = {}): Answer {
  return buildFairShapedAnswer({ run_ref: RUN_ID, ...overrides });
}

/** Every text the fixture answer publishes: none of them may appear in a refusal body. */
function publishedTexts(answer: Answer): string[] {
  return [
    answer.question_line,
    ...answer.composed_text.map((segment) => segment.text),
    ...answer.badges,
    ...answer.residual_objections,
    ...(answer.reversal_point === null ? [] : [answer.reversal_point]),
    ...answer.nodes.map((node) => node.claim),
    ...answer.nodes.flatMap((node) => node.review?.reasons ?? [])
  ];
}

/** Memory fakes in the `publicationHarness` shape (s8-publication.test.ts), counting every side effect. */
function publicationFakes(options: { preflight?: boolean; story?: PublicStoryShort } = {}) {
  const counts = { prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 };
  const stored: { publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }[] = [];
  const repository = {
    preflightGrant: async () => options.preflight ?? true,
    auditAuthenticatedPreflightDenial: async () => true,
    readAuthorPseudonym: async () => PSEUDONYM,
    readArgumentLanguageTag: async () => null,
    prepareKeyProvision: async () => { counts.prepareKeyProvision += 1; return true; },
    publish: async (input: { publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope }) => {
      counts.publish += 1; stored.push(input); return true;
    },
    abandonKeyProvision: async () => { counts.abandonKeyProvision += 1; return true; },
    claimKeyProvisionCleanup: async () => [],
    claimKeyCleanup: async () => [],
    readOwnedVisibility: async () => ({ state: "PRIVATE", publicRef: null }),
    withContentLease: async <T>(_ref: string, use: () => Promise<T>) => use(),
    readPublic: async () => null
  } as unknown as PostgresPublicationRepository;
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc4))));
  const create = cipher.create.bind(cipher);
  cipher.create = (async (...args: Parameters<PublicationCipher["create"]>) => {
    counts.cipherCreate += 1;
    return create(...args);
  }) as PublicationCipher["create"];
  const application = new PostgresPublicationApplication(repository, cipher, () => new Date("2026-09-29T12:00:00.000Z"),
    repository, options.story === undefined ? undefined : { readStoryShort: async () => options.story! });
  /** The snapshot that was encrypted and handed to the repository, decrypted back. */
  const decryptStored = async (): Promise<PublicDebate> => {
    const last = stored.at(-1)!;
    const prepared = await cipher.open(last.publicationRef, last.runId);
    try { return PublicDebateSchema.parse(prepared.decrypt(last.contentCiphertext)); } finally { prepared.close(); }
  };
  return { application, counts, stored, decryptStored };
}

function contentCheck(judge: PublicationJudgePort | null) {
  const records: PublicationCheckRecord[] = [];
  const check = createPublicationContentCheck({
    judge: () => judge,
    recorder: { record: async (row) => { records.push(row); } },
    clock: () => new Date("2026-09-29T12:00:00.000Z")
  });
  return { check, records };
}

/** Wraps a check so the test learns the snapshot's public ref (a fresh uuid per attempt). */
function observed(check: PublicationContentCheck) {
  const publicRefs: string[] = [];
  return {
    publicRefs,
    check: { check: async (input) => { publicRefs.push(input.snapshot.public_ref); return check.check(input); } } as PublicationContentCheck
  };
}

/** FIX-HS2-p1 sd-B1: counts how many content leases are open, so a judge can assert it runs outside all of them. */
type LeaseProbe = { held: number; opened: number; answerReads: number; answers?: readonly (Answer | null)[] };
function askApplication(answer: Answer, runRequests: LeaseProbe = { held: 0, opened: 0, answerReads: 0 }): AskApplication {
  return {
    withContentLease: async (_runId, use) => {
      runRequests.held += 1; runRequests.opened += 1;
      try { return await use(); } finally { runRequests.held -= 1; }
    },
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => {
      const index = runRequests.answerReads++;
      return runRequests.answers === undefined ? answer : runRequests.answers[Math.min(index, runRequests.answers.length - 1)]!;
    },
    readRun: async (runId) => ({
      run_ref: runId, question_line: "Owned run", state: "SETTLED",
      terminal_reason: null, hold_until: null
    }),
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

function sessions(): SessionApplication {
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: authenticated.session
    }),
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: vi.fn<SessionApplication["stepUp"]>(async () => ({
      sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, grantToken: GRANT_TOKEN,
      grantExpiresAt: new Date("2026-09-29T12:05:00.000Z")
    }))
  };
}

const mutationHeaders = Object.freeze({
  cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
  origin: ORIGIN,
  "x-csrf-token": CSRF_TOKEN,
  "user-agent": "hs-s02-test-browser"
});

function routeApi(input: {
  answer?: Answer;
  publicationContentCheck?: PublicationContentCheck;
  preflight?: boolean;
  leases?: LeaseProbe;
}) {
  const fakes = publicationFakes(input.preflight === undefined ? {} : { preflight: input.preflight });
  const api = buildApi({
    application: askApplication(input.answer ?? servedAnswer(), input.leases),
    sessions: sessions(),
    publications: fakes.application,
    allowedOrigin: ORIGIN,
    ...(input.publicationContentCheck === undefined ? {} : { publicationContentCheck: input.publicationContentCheck })
  });
  const publish = () => api.inject({
    method: "POST", url: `/v1/runs/${RUN_ID}/publish`, headers: mutationHeaders,
    payload: { step_up_grant: GRANT_TOKEN, warning_acknowledged: true }
  });
  return { api, publish, counts: fakes.counts, fakes };
}

async function attempt(judge: PublicationJudgePort, answer: Answer = servedAnswer()) {
  const { check, records } = contentCheck(judge);
  const seen = observed(check);
  const { api, publish, counts } = routeApi({ answer, publicationContentCheck: seen.check });
  const response = await publish();
  await api.close();
  return { response, records, counts, publicRefs: seen.publicRefs };
}

function expectNoTextOrIdentifier(body: string, answer: Answer, publicRefs: readonly string[]) {
  for (const forbidden of [...publishedTexts(answer), RUN_ID, PSEUDONYM, ...publicRefs]) {
    expect(body).not.toContain(forbidden);
  }
}

describe("hate-speech S02 publish path", () => {
  describe("application", () => {
    const refusals: readonly [string, JudgeStubStep, object][] = [
      ["BLOCK", BLOCK_ILLEGAL, {
        state: "REFUSED",
        statement: { outcome: "BLOCK", parts: ["QUESTION", "ARGUMENTS"], ground: "TERMS_AND_POSSIBLY_ILLEGAL", automated: true, visibility: "PRIVATE" }
      }],
      ["UNSURE", UNSURE_PARTS, {
        state: "REFUSED",
        statement: { outcome: "UNSURE", parts: ["SUMMARY"], ground: "TERMS", automated: true, visibility: "PRIVATE" }
      }],
      ["UNAVAILABLE", new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED"), { state: "CHECK_UNAVAILABLE" }]
    ];
    for (const [outcome, step, expected] of refusals) {
      it(`${outcome}: returns ${JSON.stringify(expected).slice(0, 40)}… and provisions, encrypts and publishes nothing`, async () => {
        const judge = createJudgeStub([step]);
        const { check } = contentCheck(judge);
        const { application, counts } = publicationFakes();
        const answer = servedAnswer();
        const result = await application.publish({
          runId: RUN_ID, answer, authenticated, grantToken: GRANT_TOKEN,
          source: { ip: "192.0.2.1", userAgent: "hs-s02", requestId: "request:hs-s02" },
          contentCheck: check
        });
        expect(result).toEqual(expected);
        expect(judge.packets.length).toBe(1);
        expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
      });
    }

    it("ALLOW: publishes exactly as today — one provision, one cipher, one transition", async () => {
      const judge = createJudgeStub([ALLOW]);
      const { check } = contentCheck(judge);
      const { application, counts } = publicationFakes();
      const result = await application.publish({
        runId: RUN_ID, answer: servedAnswer(), authenticated, grantToken: GRANT_TOKEN,
        source: { ip: "192.0.2.1", userAgent: "hs-s02", requestId: "request:hs-s02" },
        contentCheck: check
      });
      expect(result).toEqual({ state: "PUBLISHED", public_ref: expect.stringMatching(/^[0-9a-f-]{36}$/u) });
      expect(Object.keys(result ?? {}).sort()).toEqual(["public_ref", "state"]);
      expect(judge.packets.length).toBe(1);
      expect(counts).toEqual({ prepareKeyProvision: 1, publish: 1, abandonKeyProvision: 0, cipherCreate: 1 });
    });

    it("a BLOCKED answer and a failed preflight return null before the judge is called", async () => {
      for (const [preflight, answer] of [
        [true, servedAnswer({ terminal: "BLOCKED" })],
        [false, servedAnswer()]
      ] as const) {
        const judge = createJudgeStub([ALLOW]);
        const { check, records } = contentCheck(judge);
        const { application, counts } = publicationFakes({ preflight });
        await expect(application.publish({
          runId: RUN_ID, answer, authenticated, grantToken: GRANT_TOKEN,
          source: { ip: "192.0.2.1", userAgent: "hs-s02", requestId: "request:hs-s02" },
          contentCheck: check
        })).resolves.toBeNull();
        expect(judge.packets.length).toBe(0);
        expect(records).toEqual([]);
        expect(counts.prepareKeyProvision).toBe(0);
      }
    });
  });

  describe("R2 + R3 at the publish path (FIX-HS2-p1 ct-B1, ct-B2)", () => {
    const SOURCE = Object.freeze({ ip: "198.51.100.77", userAgent: "hs-s02-agent-CANARY-UA", requestId: "request:hs-s02-CANARY-REQ" });
    const STORY: PublicStoryShort = {
      headline: STORY_TEST_BODY.short.headline, summary: STORY_TEST_BODY.short.summary, confidence: STORY_TEST_BODY.short.confidence,
      paths: [...STORY_TEST_BODY.short.paths, { ...STORY_TEST_BODY.short.paths[0]!, line: "STORY-PATH-TWO-MARK" }],
      change: STORY_TEST_BODY.short.change, reviewer_note: null
    };
    /** Two members in every array the answer carries, so a first-member-only extraction is visible. */
    function wideAnswer(): Answer {
      const served = servedAnswer();
      return {
        ...served,
        composed_text: [...served.composed_text, { ...served.composed_text[0]!, text: "SECOND-SEGMENT-MARK" }],
        badges: ["BADGE-ONE-MARK", "BADGE-TWO-MARK"],
        residual_objections: ["OBJECTION-ONE-MARK", "OBJECTION-TWO-MARK"],
        nodes: served.nodes.map((node, i) => ({
          ...node, claim: `${node.claim} CLAIM-${i}-MARK`,
          review: node.review === null ? null : { ...node.review, reasons: [`REASON-${i}a-MARK`, `REASON-${i}b-MARK`] }
        }))
      };
    }
    // Property: every checked leaf of the snapshot that was ENCRYPTED reached the judge — all members, the story included.
    // Property: no user, owner, session, run, publication, IP, user-agent, request or token identifier reached it.
    it("the judge read every checked leaf of the encrypted snapshot and no identifier", async () => {
      expect(STORY.paths.length).toBeGreaterThanOrEqual(2);
      const judge = createJudgeStub([ALLOW, ALLOW, ALLOW, ALLOW]);
      const { check } = contentCheck(judge);
      const { application, decryptStored } = publicationFakes({ story: STORY });
      const answer = wideAnswer();
      const result = await application.publish({
        runId: RUN_ID, answer, authenticated, grantToken: GRANT_TOKEN, source: SOURCE, contentCheck: check
      });
      expect(result?.state).toBe("PUBLISHED");
      const snapshot = await decryptStored();
      expect(snapshot.story_short).toBeDefined();
      const leaves = extractCheckedText(snapshot);
      for (const kind of ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS", "STORY"]) expect(leaves.some(l => l.kind === kind), kind).toBe(true);
      for (const marker of ["SECOND-SEGMENT-MARK", "BADGE-TWO-MARK", "OBJECTION-TWO-MARK", "CLAIM-1-MARK", "REASON-1b-MARK", "STORY-PATH-TWO-MARK"]) {
        expect(leaves.some(l => l.text.includes(marker)), marker).toBe(true);
      }
      const material = judge.packets.map(packet => JSON.parse(packet.messages[1]!.content.split("\n").slice(1, -1).join("\n"))
        .fields.map((field: { content: string }) => field.content).join("\n\n")).join("\n\n");
      for (const leaf of leaves) expect(material, leaf.text).toContain(leaf.text);
      const wire = JSON.stringify(judge.packets);
      for (const identifier of [RUN_ID, authenticated.userId, authenticated.ownerRef, authenticated.session.session_id,
        authenticated.tokenHash, authenticated.csrfTokenHash, GRANT_TOKEN, SOURCE.ip, SOURCE.userAgent, SOURCE.requestId,
        PSEUDONYM, snapshot.public_ref, snapshot.published_at]) {
        expect(wire, identifier).not.toContain(identifier);
      }
    });
  });

  describe("pool safety (FIX-HS2-p1 sd-B1, R-P) and a failing check (sd-N4)", () => {
    // Property: the judge is awaited while NO content lease is open; the snapshot is built under one and the
    // publication is committed under another.
    it("the route awaits the judge outside every content lease, and commits under a fresh one", async () => {
      const leases: LeaseProbe = { held: 0, opened: 0, answerReads: 0 };
      const heldAtJudge: number[] = [];
      const judge = createJudgeStub([async () => { heldAtJudge.push(leases.held); return { text: ALLOW }; }]);
      const { check } = contentCheck(judge);
      const { api, publish, counts } = routeApi({ publicationContentCheck: check, leases });
      const response = await publish();
      await api.close();
      expect(response.statusCode).toBe(201);
      expect(heldAtJudge).toEqual([0]);
      expect(leases.opened).toBeGreaterThanOrEqual(2);
      expect(counts.publish).toBe(1);
    });
    // Property: an answer that changed while the judge was working is not published under the old check.
    it("an answer version that changed during the check publishes nothing and answers 503", async () => {
      const first = servedAnswer();
      const leases: LeaseProbe = { held: 0, opened: 0, answerReads: 0, answers: [first, { ...first, answer_version: first.answer_version + 1 }] };
      const { check, records } = contentCheck(createJudgeStub([ALLOW]));
      const { api, publish, counts } = routeApi({ publicationContentCheck: check, leases });
      const response = await publish();
      await api.close();
      expect(response.statusCode).toBe(503);
      expect(response.json()).toStrictEqual(UNAVAILABLE_BODY);
      expect(records.map(r => r.outcome)).toEqual(["ALLOW"]);
      expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
    });
    // Property: an answer erased during the check is not found, and nothing is published.
    it("an answer that is gone at commit answers 404 and publishes nothing", async () => {
      const first = servedAnswer();
      const leases: LeaseProbe = { held: 0, opened: 0, answerReads: 0, answers: [first, null] };
      const { check } = contentCheck(createJudgeStub([ALLOW]));
      const { api, publish, counts } = routeApi({ publicationContentCheck: check, leases });
      const response = await publish();
      await api.close();
      expect(response.statusCode).toBe(404);
      expect(counts.publish).toBe(0);
    });
    // Property (sd-N4): a check that cannot record its attempt is UNAVAILABLE — the typed 503, one content-free
    // log line, nothing provisioned — never a 500 the UI reads as a wrong password.
    it("a record write that fails is 503 PUBLICATION_CHECK_UNAVAILABLE with one content-free log line", async () => {
      const failing = createPublicationContentCheck({
        judge: () => createJudgeStub([ALLOW]),
        recorder: { record: async () => { throw new Error(`relation serve.publication_check_record: ${servedAnswer().question_line}`); } },
        clock: () => new Date("2026-09-29T12:00:00.000Z")
      });
      const lines: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...values: unknown[]) => { lines.push(values.map(String).join(" ")); });
      try {
        const { api, publish, counts } = routeApi({ publicationContentCheck: failing });
        const response = await publish();
        await api.close();
        expect(response.statusCode).toBe(503);
        expect(response.json()).toStrictEqual(UNAVAILABLE_BODY);
        expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
      } finally { spy.mockRestore(); }
      const checkLines = lines.filter(line => line.includes("api.publication.check_failed"));
      expect(checkLines).toHaveLength(1);
      expect(JSON.parse(checkLines[0]!)).toEqual({ event: "api.publication.check_failed", requestId: expect.any(String), diagnostic: "Error" });
      expect(lines.join("\n")).not.toContain(servedAnswer().question_line);
    });
  });

  describe("route", () => {
    it("ALLOW → 201 with exactly state and public_ref", async () => {
      const { response, counts, publicRefs } = await attempt(createJudgeStub([ALLOW]));
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ state: "PUBLISHED", public_ref: publicRefs[0] });
      expect(Object.keys(response.json()).sort()).toEqual(["public_ref", "state"]);
      expect(counts.publish).toBe(1);
    });

    it("BLOCK with possibly_illegal → 409 EXACT, ground TERMS_AND_POSSIBLY_ILLEGAL, parts in §2 order", async () => {
      const answer = servedAnswer();
      const { response, counts, publicRefs } = await attempt(createJudgeStub([BLOCK_ILLEGAL]), answer);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toStrictEqual({
        error: "PUBLICATION_CONTENT_REFUSED",
        message: REFUSED_MESSAGE,
        statement: { outcome: "BLOCK", parts: ["QUESTION", "ARGUMENTS"], ground: "TERMS_AND_POSSIBLY_ILLEGAL", automated: true, visibility: "PRIVATE" }
      });
      expectNoTextOrIdentifier(response.body, answer, publicRefs);
      expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
    });

    it("BLOCK without possibly_illegal → 409 with ground TERMS", async () => {
      const answer = servedAnswer();
      const { response, publicRefs } = await attempt(createJudgeStub([BLOCK_TERMS]), answer);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toStrictEqual({
        error: "PUBLICATION_CONTENT_REFUSED",
        message: REFUSED_MESSAGE,
        statement: { outcome: "BLOCK", parts: ["REVIEWS"], ground: "TERMS", automated: true, visibility: "PRIVATE" }
      });
      expectNoTextOrIdentifier(response.body, answer, publicRefs);
    });

    it("UNSURE with parts [] → 409 naming every kind that was sent, ground TERMS", async () => {
      const answer = servedAnswer();
      const { response, publicRefs } = await attempt(createJudgeStub([UNSURE_NO_PARTS]), answer);
      expect(response.statusCode).toBe(409);
      // The fixture publishes a question, a summary, two claims and two review reasons, and no story.
      expect(response.json()).toStrictEqual({
        error: "PUBLICATION_CONTENT_REFUSED",
        message: REFUSED_MESSAGE,
        statement: { outcome: "UNSURE", parts: ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS"], ground: "TERMS", automated: true, visibility: "PRIVATE" }
      });
      expectNoTextOrIdentifier(response.body, answer, publicRefs);
    });

    for (const [label, step] of [
      ["a thrown transport failure", new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED")],
      ["an answer that is not JSON", "I cannot help with that."]
    ] as const) {
      it(`UNAVAILABLE (${label}) → 503 EXACT and nothing published`, async () => {
        const answer = servedAnswer();
        const { response, counts, publicRefs, records } = await attempt(createJudgeStub([step]), answer);
        expect(response.statusCode).toBe(503);
        expect(response.json()).toStrictEqual(UNAVAILABLE_BODY);
        expectNoTextOrIdentifier(response.body, answer, publicRefs);
        expect(records.map((row) => row.outcome)).toEqual(["UNAVAILABLE"]);
        expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
      });
    }

    it("a route composed without publicationContentCheck answers 503 EXACT and publishes nothing", async () => {
      const { api, publish, counts } = routeApi({});
      const response = await publish();
      await api.close();
      expect(response.statusCode).toBe(503);
      expect(response.json()).toStrictEqual(UNAVAILABLE_BODY);
      expect(counts).toEqual({ prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 });
    });

    it("the judge switch, passed as a DETACHED `current` supplier, turns publishing into 503 and back", async () => {
      const judge = createJudgeStub([ALLOW, ALLOW]);
      const dir = mkdtempSync(join(tmpdir(), "hs-s02-route-switch-"));
      const flag = join(dir, "off");
      const judgeSwitch = createPublicationJudgeSwitch(judge, { offFlagPath: flag });
      const { current, switchOff } = judgeSwitch;
      const records: PublicationCheckRecord[] = [];
      const check = createPublicationContentCheck({
        judge: current,
        recorder: { record: async (row) => { records.push(row); } },
        clock: () => new Date("2026-09-29T12:00:00.000Z")
      });
      const { api, publish } = routeApi({ publicationContentCheck: check });
      expect((await publish()).statusCode).toBe(201);
      expect(switchOff()).toBe(false);
      const off = await publish();
      expect(off.statusCode).toBe(503);
      expect(off.json()).toStrictEqual(UNAVAILABLE_BODY);
      rmSync(flag);
      expect((await publish()).statusCode).toBe(201);
      await api.close();
      rmSync(dir, { recursive: true, force: true });
      expect(judge.packets.length).toBe(2);
      expect(records.map((row) => [row.outcome, row.failure_cause])).toEqual([
        ["ALLOW", null], ["UNAVAILABLE", "JUDGE_NOT_CONFIGURED"], ["ALLOW", null]
      ]);
    });
  });

  describe("R1 counter", () => {
    it("no route but a publish that passes preflight calls the judge", async () => {
      let calls = 0;
      const counting: PublicationJudgePort = {
        providerRef: "test:judge", modelId: "test-model",
        complete: async () => { calls += 1; return { text: ALLOW }; }
      };
      const { check } = contentCheck(counting);
      const blocked = servedAnswer({ terminal: "BLOCKED" });
      const lifecycle = routeApi({ publicationContentCheck: check });
      const inject = (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
        lifecycle.api.inject({ method, url, headers: mutationHeaders, ...(payload === undefined ? {} : { payload }) });
      await inject("POST", "/v1/asks", { question: "Should the test question stand?" });
      await inject("GET", `/v1/runs/${RUN_ID}`);
      await inject("GET", `/v1/runs/${RUN_ID}/answer`);
      await inject("GET", `/v1/runs/${RUN_ID}/visibility`);
      await inject("POST", `/v1/runs/${RUN_ID}/unpublish`, { step_up_grant: GRANT_TOKEN });
      await inject("DELETE", `/v1/debates/${RUN_ID}`, {});
      await lifecycle.api.close();
      const refusedPreflight = routeApi({ publicationContentCheck: check, preflight: false });
      expect((await refusedPreflight.publish()).statusCode).toBe(404);
      await refusedPreflight.api.close();
      const blockedAnswer = routeApi({ publicationContentCheck: check, answer: blocked });
      expect((await blockedAnswer.publish()).statusCode).toBe(404);
      await blockedAnswer.api.close();
      expect(calls).toBe(0);
      const passing = routeApi({ publicationContentCheck: check });
      expect((await passing.publish()).statusCode).toBe(201);
      await passing.api.close();
      expect(calls).toBeGreaterThanOrEqual(1);
    });
  });

  describe("R13 source scan", () => {
    function sourceFiles(directory: string): string[] {
      const found: string[] = [];
      for (const entry of readdirSync(directory)) {
        if (entry === "node_modules" || entry === ".next" || entry === "generated" || entry.startsWith(".")) continue;
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
        else if (/\.(ts|tsx|mjs|js)$/u.test(entry)) found.push(path);
      }
      return found;
    }
    const IMPORTS_CHECK = /from\s+["'][^"']*publication-check\/[^"']*["']|import\(\s*["'][^"']*publication-check\//u;

    it("only the publish path, its composition and the evaluation CLI import the check", () => {
      const importers = ["apps", "packages", "acceptance", "scripts", "deploy"]
        .flatMap((root) => {
          try { return sourceFiles(join(REPOSITORY_ROOT, root)); } catch { return []; }
        })
        .map((path) => relative(REPOSITORY_ROOT, path))
        .filter((path) => !path.startsWith("apps/api/src/publication-check/"))
        .filter((path) => !/\.test\.[a-z]+$/u.test(path))
        .filter((path) => IMPORTS_CHECK.test(readFileSync(join(REPOSITORY_ROOT, path), "utf8")))
        .sort();
      expect(importers).toEqual([
        "acceptance/hs-eval-s02.ts",
        "apps/api/src/index.ts",
        "apps/api/src/main.ts",
        "apps/api/src/publications.ts"
      ]);
      expect(importers.filter((path) =>
        path.startsWith("apps/api/src/support/") || path.startsWith("apps/runner/") || path.startsWith("packages/")
      )).toEqual([]);
    });
  });

  describe("composition", () => {
    const main = readFileSync(join(REPOSITORY_ROOT, "apps/api/src/main.ts"), "utf8");

    /** The object literal passed to the ONE `createPublicationContentCheck(` call of main.ts. */
    function checkComposition(): string {
      const calls = main.split("createPublicationContentCheck(").length - 1;
      expect(calls).toBe(1);
      const start = main.indexOf("createPublicationContentCheck(");
      return main.slice(start, main.indexOf("});", start) + 3);
    }
    // FIX-HS2-p1 ct-B4: the RUNNING deployment's D is the constant — a wired literal, or no deadline, is red.
    it("main.ts wires D = PUBLICATION_CHECK_DEADLINE_MS into the composed check, and nothing else", () => {
      const composition = checkComposition();
      expect(composition.match(/deadlineMs\s*:\s*([^,\n}]+)/gu)).toEqual(["deadlineMs: PUBLICATION_CHECK_DEADLINE_MS"]);
      expect(main).toMatch(/import \{[^}]*\bPUBLICATION_CHECK_DEADLINE_MS\b[^}]*\} from "\.\/publication-check\/check\.js"/u);
      expect(composition).not.toMatch(/\b\d[\d_]*\b/u);
    });
    // R-D: the UI proxy lifts its 30 s ceiling for the publish route ONLY, above the API's whole publish budget.
    it("the UI proxy's publish ceiling exceeds D by at least 20 s, and every other route keeps 30 s", () => {
      const route = readFileSync(join(REPOSITORY_ROOT, "apps/ui/app/api/[...path]/route.ts"), "utf8");
      const constant = (name: string) => Number(new RegExp(`const ${name} = ([\\d_]+);`, "u").exec(route)?.[1]?.replaceAll("_", ""));
      expect(constant("UPSTREAM_TIMEOUT_MS")).toBe(30_000);
      expect(constant("PUBLISH_UPSTREAM_TIMEOUT_MS")).toBeGreaterThanOrEqual(PUBLICATION_CHECK_DEADLINE_MS + 20_000);
    });

    it("main.ts composes the check from the support target, the record repository and the local-only switch", () => {
      expect(main).toContain("createPublicationContentCheck(");
      expect(main).toContain("createPublicationJudgeTransport(supportModelTarget");
      expect(main).toContain("new PostgresPublicationCheckRecordRepository(pool)");
      // The boot script owns no process signal (tests/architecture/t1-argon2-worker-contract.test.ts:495,
      // :706-707): it hands the real process to the installer, which the next test drives.
      // FIX-HS2-p1 sd-N5: only a LOCAL deployment has the switch — its flag path and its signal.
      expect(main).toMatch(/const publicationJudgeOffFlag = environment\.DEPLOYMENT_MODE === "hosted"\s*\?\s*null\s*:\s*publicationJudgeOffFlagPath\(environment\.API_PORT\);/u);
      expect(main).toContain("createPublicationJudgeSwitch(");
      expect(main).toMatch(/\{ offFlagPath: publicationJudgeOffFlag \}\)/u);
      expect(main).toMatch(/if \(publicationJudgeOffFlag !== null\) installPublicationJudgeSwitchSignal\(process, publicationJudgeSwitch\);/u);
      expect(main.split("installPublicationJudgeSwitchSignal(process").length - 1).toBe(1);
      expect(main).not.toMatch(/process\.(on|once|addListener)\(\s*["']SIG/u);
      const start = main.indexOf("const api = buildApi({");
      expect(start).toBeGreaterThan(-1);
      const argument = main.slice(start, main.indexOf("\n});", start));
      expect(argument).toMatch(/^\s+publicationContentCheck,?$/mu);
      // The check reads the switch through its detached supplier, and the switch exists before the check.
      expect(main).toMatch(/judge:\s*publicationJudgeSwitch\.current\b/u);
      expect(main.indexOf("createPublicationJudgeSwitch(")).toBeLessThan(main.indexOf("createPublicationContentCheck("));
    });

    // FIX-HS2-p2 api-N2: the signal listener never throws into the process — a failing switch logs a content-free code.
    it("SIGUSR2 never throws: a directory at the flag path, and a switch that throws, each log one content-free line", async () => {
      const signals = new EventEmitter();
      const lines: string[] = [];
      const dir = mkdtempSync(join(tmpdir(), "hs-s02-signal-n2-"));
      try {
        const flag = join(dir, "off");
        mkdirSync(flag);
        installPublicationJudgeSwitchSignal(signals, createPublicationJudgeSwitch(createJudgeStub([ALLOW]), { offFlagPath: flag }), (line) => lines.push(line));
        expect(() => signals.emit("SIGUSR2")).not.toThrow();
        const throwing = new EventEmitter();
        installPublicationJudgeSwitchSignal(throwing, { switchOff: () => { throw Object.assign(new Error("secret /home/owner path"), { code: "EISDIR" }); } }, (line) => lines.push(line));
        expect(() => throwing.emit("SIGUSR2")).not.toThrow();
        expect(lines).toEqual([
          "{\"event\":\"api.publication_check.switch\",\"configured\":false}",
          "{\"event\":\"api.publication_check.switch\",\"error\":\"PUBLICATION_JUDGE_SWITCH_FAILED\"}"
        ]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });

    it("SIGUSR2 switches the judge OFF idempotently and logs one content-free line per signal; removing the flag restores it", async () => {
      const signals = new EventEmitter();
      const lines: string[] = [];
      const judge = createJudgeStub([ALLOW, ALLOW]);
      const dir = mkdtempSync(join(tmpdir(), "hs-s02-signal-"));
      const flag = join(dir, "off");
      const judgeSwitch = createPublicationJudgeSwitch(judge, { offFlagPath: flag });
      installPublicationJudgeSwitchSignal(signals, judgeSwitch, (line) => lines.push(line));
      expect(signals.listenerCount("SIGUSR2")).toBe(1);
      const records: PublicationCheckRecord[] = [];
      const check = createPublicationContentCheck({
        judge: judgeSwitch.current,
        recorder: { record: async (row) => { records.push(row); } },
        clock: () => new Date("2026-09-29T12:00:00.000Z")
      });
      const { api, publish } = routeApi({ publicationContentCheck: check });
      signals.emit("SIGUSR2");
      expect((await publish()).statusCode).toBe(503);
      signals.emit("SIGUSR2");
      expect((await publish()).statusCode).toBe(503);
      rmSync(flag);
      expect((await publish()).statusCode).toBe(201);
      await api.close();
      rmSync(dir, { recursive: true, force: true });
      expect(lines).toEqual([
        "{\"event\":\"api.publication_check.switch\",\"configured\":false}",
        "{\"event\":\"api.publication_check.switch\",\"configured\":false}"
      ]);
      expect(records.map((row) => row.failure_cause)).toEqual(["JUDGE_NOT_CONFIGURED", "JUDGE_NOT_CONFIGURED", null]);
    });
  });
});
