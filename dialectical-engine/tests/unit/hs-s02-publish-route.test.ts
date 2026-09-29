import { readdirSync, readFileSync, statSync } from "node:fs";
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
import type { Answer } from "@debateai/contract";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  loadKek
} from "../../packages/crypto/src/index.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";
import {
  createPublicationContentCheck,
  PublicationJudgeFailure,
  type PublicationCheckRecord,
  type PublicationContentCheck,
  type PublicationJudgePort
} from "../../apps/api/src/publication-check/check.js";
import { createPublicationJudgeSwitch } from "../../apps/api/src/publication-check/judge-transport.js";
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
function publicationFakes(options: { preflight?: boolean } = {}) {
  const counts = { prepareKeyProvision: 0, publish: 0, abandonKeyProvision: 0, cipherCreate: 0 };
  const repository = {
    preflightGrant: async () => options.preflight ?? true,
    auditAuthenticatedPreflightDenial: async () => true,
    readAuthorPseudonym: async () => PSEUDONYM,
    readArgumentLanguageTag: async () => null,
    prepareKeyProvision: async () => { counts.prepareKeyProvision += 1; return true; },
    publish: async () => { counts.publish += 1; return true; },
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
  const application = new PostgresPublicationApplication(repository, cipher, () => new Date("2026-09-29T12:00:00.000Z"));
  return { application, counts };
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

function askApplication(answer: Answer, runRequests: { answerReads: number } = { answerReads: 0 }): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => { runRequests.answerReads += 1; return answer; },
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
}) {
  const fakes = publicationFakes(input.preflight === undefined ? {} : { preflight: input.preflight });
  const api = buildApi({
    application: askApplication(input.answer ?? servedAnswer()),
    sessions: sessions(),
    publications: fakes.application,
    allowedOrigin: ORIGIN,
    ...(input.publicationContentCheck === undefined ? {} : { publicationContentCheck: input.publicationContentCheck })
  });
  const publish = () => api.inject({
    method: "POST", url: `/v1/runs/${RUN_ID}/publish`, headers: mutationHeaders,
    payload: { step_up_grant: GRANT_TOKEN, warning_acknowledged: true }
  });
  return { api, publish, counts: fakes.counts };
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
      const judgeSwitch = createPublicationJudgeSwitch(judge);
      const { current, toggle } = judgeSwitch;
      const records: PublicationCheckRecord[] = [];
      const check = createPublicationContentCheck({
        judge: current,
        recorder: { record: async (row) => { records.push(row); } },
        clock: () => new Date("2026-09-29T12:00:00.000Z")
      });
      const { api, publish } = routeApi({ publicationContentCheck: check });
      expect((await publish()).statusCode).toBe(201);
      expect(toggle()).toBe(false);
      const off = await publish();
      expect(off.statusCode).toBe(503);
      expect(off.json()).toStrictEqual(UNAVAILABLE_BODY);
      expect(toggle()).toBe(true);
      expect((await publish()).statusCode).toBe(201);
      await api.close();
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

    it("main.ts composes the check from the support target, the record repository and the SIGUSR2 switch", () => {
      expect(main).toContain("createPublicationContentCheck(");
      expect(main).toContain("createPublicationJudgeTransport(supportModelTarget");
      expect(main).toContain("new PostgresPublicationCheckRecordRepository(pool)");
      // The boot script owns no process signal (tests/architecture/t1-argon2-worker-contract.test.ts:495,
      // :706-707): it hands the real process to the installer, which the next test drives.
      expect(main).toContain("installPublicationJudgeSwitchSignal(process, publicationJudgeSwitch)");
      expect(main).not.toMatch(/process\.(on|once|addListener)\(\s*["']SIG/u);
      const start = main.indexOf("const api = buildApi({");
      expect(start).toBeGreaterThan(-1);
      const argument = main.slice(start, main.indexOf("\n});", start));
      expect(argument).toMatch(/^\s+publicationContentCheck,?$/mu);
      // The check reads the switch through its detached supplier, and the switch exists before the check.
      expect(main).toMatch(/judge:\s*publicationJudgeSwitch\.current\b/u);
      expect(main.indexOf("createPublicationJudgeSwitch(")).toBeLessThan(main.indexOf("createPublicationContentCheck("));
    });

    it("SIGUSR2 toggles the judge and logs one content-free line per toggle (SPEC-v2 §6 step 9, D-S02-21)", async () => {
      const signals = new EventEmitter();
      const lines: string[] = [];
      const judge = createJudgeStub([ALLOW, ALLOW]);
      const judgeSwitch = createPublicationJudgeSwitch(judge);
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
      expect((await publish()).statusCode).toBe(201);
      await api.close();
      expect(lines).toEqual([
        "{\"event\":\"api.publication_check.switch\",\"configured\":false}",
        "{\"event\":\"api.publication_check.switch\",\"configured\":true}"
      ]);
      expect(records.map((row) => row.failure_cause)).toEqual(["JUDGE_NOT_CONFIGURED", null]);
    });
  });
});
