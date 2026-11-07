/*
 * V4 start step, Task 80b (saved questions spec 2026-11-04 §3.3-§3.6, §3.14; owner answers S3 A and S4 A; the owner card "Where shown"):
 * THE QUESTIONS NOT STARTED YET, kept by the mock for the click-test. Plain words:
 *  - The real API's five routes (Task 39e) for the mock's one person: GET /v1/account/saved-questions (the list, newest first), POST (a
 *    first save), PUT …/{id} (a later save over the revision the page last had; another revision answers 409), GET …/{id} (Pick up) and
 *    DELETE …/{id} (204, also for an id that is not there, which destroys nothing).
 *  - At most 20 (S3 A): a 21st first save answers 409 SAVED_QUESTIONS_FULL. A document is kept as the JSON text the page sent, and Pick
 *    up answers that text's JSON.parse, never a schema parse (which would trim signed words).
 *  - The mock keeps no keys (S4 A's question keys are the API's alone, Tasks 39d and 39e): its made-up documents live in memory, and
 *    Delete simply takes one out. It checks no signature: Pick up answers NEEDS_READING when a reference in the reading is not one the
 *    mock wrote, or the mock wrote it for the other plan (start-step.ts), else READY.
 *  - The #pickup scene (switch `saved=PICKUP`: the list is read on step 1, before any question is typed, so a scene named in the
 *    question could not start it): two made-up questions, one read for Plus with five shaped paths (one combined, one of the person's
 *    own, two answers in the question box, Thorough), and one read for Free, which a Plus person must read again. Pick up asks no AI.
 *  - POST /v1/asks takes out the copy its `saved_question_id` names once the ask is accepted, as the API does (server.ts).
 * Every body is the contract's (packages/contract) and is checked before it is sent; server.ts checks savedQuestionSamples at its start.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CRISIS_SUPPORT_OFFERED, SAVED_QUESTION_LIMITS, SavedQuestionCreateSchema, SavedQuestionDocSchema, SavedQuestionIdSchema, SavedQuestionListSchema,
  SavedQuestionReadSchema, SavedQuestionSaveSchema, SavedQuestionWrittenSchema, detectCrisis, savedQuestionDocFits, savedQuestionOwnWords,
  savedQuestionTitleOf, type AskClarifyResponse, type ClarifyQuestion, type SavedQuestionDoc, type SavedQuestionList, type SavedQuestionRead,
  type SavedQuestionWritten, type SignedStartMenu
} from "../../packages/contract/src/index.js";
import { pathPlanCombineMembers, pathPlanFromMenu, pathPlanReduce, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { mockStartCombine, mockStartListsScript, mockStartMenu, mockStartRefOf, type StartMockPlan } from "./start-step.js";

/** The scenes of the questions not started yet, as the click-test names them. */
export const MOCK_SAVED_SCENES = Object.freeze(["#pickup"] as const);
/** The switch `saved=`: PICKUP seeds the #pickup scene's two questions (again, as they were); NONE keeps none. */
export const MOCK_SAVED_SWITCH = Object.freeze(["NONE", "PICKUP"] as const);
export type MockSavedScene = typeof MOCK_SAVED_SWITCH[number];
/** The #pickup scene's two made-up questions. */
export const MOCK_PICKUP_IDS = Object.freeze({
  ready: "5ab0e000-0000-4000-8000-000000000001",
  needsReading: "5ab0e000-0000-4000-8000-000000000002"
});

const ROOT = "/v1/account/saved-questions";
const S = SAVED_QUESTION_LIMITS;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------
// The kept questions: the mock's one person's, in memory
// ---------------------------------------------------------------------------------------------------------------

/** One kept question: its revision, when it was last saved, the list's title and the document as the JSON text sent. */
type Kept = Readonly<{ id: string; revision: number; savedAt: number; order: number; title: string; text: string }>;
type Store = Map<string, Kept>;

const kept: Store = new Map();
/** Breaks a tie between two saves in the same millisecond: the later one is the newer. */
let writes = 0;
let scene: MockSavedScene = "NONE";
const counters = { creates: 0, saves: 0, reads: 0, deletes: 0 };

function keep(store: Store, id: string, revision: number, savedAt: number, title: string, raw: unknown): SavedQuestionWritten {
  writes += 1;
  store.set(id, Object.freeze({ id, revision, savedAt, order: writes, title, text: JSON.stringify(raw) }));
  return Object.freeze({ id, revision });
}

function listOf(store: Store): SavedQuestionList {
  const newest = [...store.values()].sort((a, b) => b.savedAt - a.savedAt || b.order - a.order).slice(0, S.kept);
  return { questions: newest.map((row) => ({ id: row.id, question: row.title, saved_at: new Date(row.savedAt).toISOString() })) };
}

/** NEEDS_READING unless every reference in the reading is one the mock wrote for this plan (no signature is checked). */
function stateOf(doc: unknown, plan: StartMockPlan): SavedQuestionRead["state"] {
  const parsed = SavedQuestionDocSchema.safeParse(doc);
  if (!parsed.success) return "NEEDS_READING";
  const { reading } = parsed.data;
  const refs = [reading.check.ref, ...(reading.menu === null ? [] : [reading.menu.ref]), ...reading.late_lists.map((one) => one.ref)];
  return refs.every((ref) => mockStartRefOf(ref)?.plan === plan) ? "READY" : "NEEDS_READING";
}

/** Pick up's answer: the stored text's JSON.parse as `doc`, never a schema parse. */
function readOf(row: Kept, plan: StartMockPlan): SavedQuestionRead {
  const doc: unknown = JSON.parse(row.text);
  return { id: row.id, revision: row.revision, saved_at: new Date(row.savedAt).toISOString(), state: stateOf(doc, plan), doc };
}

/** The calls each route got (refused ones too): a first save, a later save, a Pick up, a Delete. The list is not counted. */
export function savedQuestionCounters(): Readonly<{ creates: number; saves: number; reads: number; deletes: number }> {
  return Object.freeze({ ...counters });
}

/** How many questions the mock's person keeps now. */
export function savedQuestionsKept(): number {
  return kept.size;
}

/** The removal at Start (POST /v1/asks, once the ask is accepted): the copy the ask names leaves the list. No other call is made. */
export function removeSavedQuestionAtStart(id: string): void {
  kept.delete(id);
}

// ---------------------------------------------------------------------------------------------------------------
// The #pickup scene
// ---------------------------------------------------------------------------------------------------------------

const PICKUP_LINE = "Should Romania build new nuclear plants?";
const PICKUP_FREE_LINE = "Should my town close its centre to cars at weekends?";
const PICKUP_OWN_PATH = "What happens to the people who work at the old plants?";
const WHEN: ClarifyQuestion = { text: "Over what time?", answers: ["The next 5 years", "The next 25 years", "To 2035"],
  sentences: ["I mean the next 5 years.", "I mean the next 25 years.", "I mean up to 2035."] };
const PURPOSE: ClarifyQuestion = { text: "What do you want the answer for?", answers: ["To decide how to vote", "To explain it to someone", "To write about it"],
  sentences: ["I want it to decide how to vote.", "I want to explain it to someone.", "I want to write about it."] };
const PICKUP_CLARIFY: AskClarifyResponse = { source: "AI", questions: [WHEN], purpose: PURPOSE };
/** The two answers she tapped: each question with its answer and the sentence it put into the question box. */
const PICKUP_ANSWERS = Object.freeze([
  { question: WHEN, at: 1 },
  { question: PURPOSE, at: 0 }
].map(({ question, at }) => ({ question: question.text, answer: question.answers[at]!, sentence: question.sentences![at]! })));

/** A whole reading of `line` as the mock's lists stream and merge make it for `plan`: the check, every list merged into the menu, READY. */
function readingOf(line: string, plan: StartMockPlan, clarify: AskClarifyResponse | null, now: number) {
  const script = mockStartListsScript(line, plan, now);
  const check = script[0]!.event;
  if (check.event !== "check") throw new Error("MOCK_SEED_INVALID: the #pickup scene's lists stream starts without its check");
  let menu: SignedStartMenu = mockStartMenu(script.flatMap((one) => (one.event.event === "list" ? [one.event.data.list] : [])), null).menu;
  for (const one of script) if (one.event.event === "late_list") menu = mockStartMenu([one.event.data.list], menu).menu;
  return { read_line: line, reading_level: "plain" as const, check: { ref: check.data.check_ref }, language: check.data.language,
    seats: check.data.seats, clarify, menu, late_lists: [], end: "READY" as const };
}

/**
 * The page's own plan of the READY question, made by the page's own reducer: the menu's first five paths, the second and third
 * combined (in the mock combine's words, with its reference), and her own path added: five paths, with their Undo steps.
 */
function shapedPlan(reading: ReturnType<typeof readingOf>): PathPlan {
  let plan = pathPlanFromMenu(reading.menu.menu, 5, false);
  const act = (action: PathPlanAction): void => {
    const result = pathPlanReduce(plan, action);
    if (result.refusal !== null) throw new Error(`MOCK_SEED_INVALID: the #pickup plan refused ${action.type} (${result.refusal})`);
    plan = result.plan;
  };
  act({ type: "SELECT", key: plan.paths[1]!.key });
  act({ type: "SELECT", key: plan.paths[2]!.key });
  act({ type: "COMBINE_SELECTED" });
  const writing = plan.paths.find((path) => path.wording === "WRITING");
  if (writing === undefined) throw new Error("MOCK_SEED_INVALID: the #pickup plan has no combined path");
  const combined = mockStartCombine({ context: { kind: "MENU", question_line: reading.read_line, check_ref: reading.check.ref, menu_id: reading.menu.menu.menu_id },
    reading_level: "plain", members: [...pathPlanCombineMembers(writing)] }, "PLUS");
  if (combined.source !== "AI") throw new Error("MOCK_SEED_INVALID: the #pickup plan's combine has no words");
  act({ type: "COMBINE_WRITTEN", key: writing.key, title: combined.title, question: combined.question, combineRef: combined.combine_ref });
  act({ type: "ADD_OWN", text: PICKUP_OWN_PATH, intoPathKey: null });
  return plan;
}

/** The scene's two documents, as the page saves them: the READY one (Plus) and one read for Free (Quick look, its three paths untouched). */
function pickUpDocs(now: number): Readonly<{ ready: unknown; needsReading: unknown }> {
  const reading = readingOf(PICKUP_LINE, "PLUS", PICKUP_CLARIFY, now);
  const ready = {
    v: 1,
    reading,
    page: {
      box: { text: `${PICKUP_LINE}\n\n${PICKUP_ANSWERS.map((one) => one.sentence).join("\n")}`,
        placed: PICKUP_ANSWERS.map((one) => ({ key: one.question, text: one.sentence })) },
      sent_goal: { answers: PICKUP_ANSWERS.map((one) => ({ question: one.question, answer: one.answer, other: false })), matters: "" },
      plan: shapedPlan(reading), width: 5, mode: "thorough", carry_on: true
    }
  };
  const freeReading = readingOf(PICKUP_FREE_LINE, "FREE", null, now);
  const needsReading = {
    v: 1,
    reading: freeReading,
    page: { box: { text: PICKUP_FREE_LINE, placed: [] }, sent_goal: { answers: [], matters: "" }, plan: pathPlanFromMenu(freeReading.menu.menu, 3, true),
      width: 3, mode: "quick", carry_on: false }
  };
  return Object.freeze({ ready, needsReading });
}

/** Keeps one of the scene's documents at revision 1, as of `savedAt`, once it passes the contract's schema. */
function keepSeed(store: Store, id: string, doc: unknown, savedAt: number): void {
  const parsed = SavedQuestionDocSchema.safeParse(doc);
  if (!parsed.success) throw new Error(`MOCK_SEED_INVALID: #pickup question ${id} does not pass SavedQuestionDocSchema:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  keep(store, id, 1, savedAt, savedQuestionTitleOf(parsed.data), doc);
}

function seedInto(store: Store, now: number): void {
  const docs = pickUpDocs(now);
  keepSeed(store, MOCK_PICKUP_IDS.needsReading, docs.needsReading, now - 14 * DAY_MS);
  keepSeed(store, MOCK_PICKUP_IDS.ready, docs.ready, now - 2 * DAY_MS);
}

/**
 * The #pickup scene: two made-up questions not started yet, saved two and fourteen days ago. The newer one was read for Plus: five
 * paths (one combined, one of her own), two answers in the question box, Thorough. The older one was read for Free, so on Plus Pick
 * up says it needs a new reading (and on `plan=FREE` the two swap). Kept beside any other, each at revision 1 again. No AI call.
 */
export function seedPickUpScene(): void {
  seedInto(kept, Date.now());
}

/** The switch `saved=`: PICKUP seeds the #pickup scene; NONE keeps none (every question kept so far goes). */
export function setSavedQuestionsScene(next: MockSavedScene): void {
  scene = next;
  if (next === "PICKUP") seedPickUpScene();
  else kept.clear();
}

export function savedQuestionsScene(): MockSavedScene {
  return scene;
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------------

type Schema = { safeParse(value: unknown): { success: boolean } };
type Refused = Readonly<{ status: 400 | 404 | 409 | 413 | 422; error: string; extra?: Readonly<Record<string, unknown>> }>;

function logRequest(method: string, path: string, status: number): void {
  if (process.env.MOCK_QUIET === "1") return;
  process.stderr.write(`[mock] ${method} ${path} ${String(status)}\n`);
}

/** Answers JSON (or 204 with nothing), `cache-control: no-store` always, as the API's saved-question routes do. */
function send(res: ServerResponse, method: string, path: string, status: number, body?: unknown, schema?: Schema): void {
  if (body === undefined) {
    res.writeHead(status, { "cache-control": "no-store" });
    res.end();
    logRequest(method, path, status);
    return;
  }
  let finalStatus = status;
  let finalBody = body;
  if (schema !== undefined && !schema.safeParse(body).success) {
    process.stderr.write(`[mock] RESPONSE FAILED ITS SCHEMA for ${method} ${path}\n`);
    finalStatus = 500;
    finalBody = { error: "MOCK_RESPONSE_INVALID", message: "The mock built a body that fails the contract schema; see the mock's log." };
  }
  const text = JSON.stringify(finalBody);
  res.writeHead(finalStatus, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(text)) });
  res.end(text);
  logRequest(method, path, finalStatus);
}

const refuse = (res: ServerResponse, method: string, path: string, refused: Refused): void => {
  send(res, method, path, refused.status, { error: refused.error, message: refused.error, ...refused.extra });
};

/** The body as JSON, at most the API's save limit (SAVED_QUESTION_LIMITS.saveBodyMaxBytes). */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > S.saveBodyMaxBytes) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolveBody(text.trim() === "" ? null : JSON.parse(text));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * A first or later save's checks, in the API's order: the shape, the size, crisis words in the person's own words (422, nothing kept).
 * The mock is always signed in with consent given, on the preview team, and its start step is on; it checks no signature.
 */
async function admitted(req: IncomingMessage, first: boolean): Promise<Readonly<{ raw: SavedQuestionDoc; title: string; revision: number }> | Refused> {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (failure) {
    const tooLarge = failure instanceof Error && failure.message === "PAYLOAD_TOO_LARGE";
    return { status: tooLarge ? 413 : 400, error: tooLarge ? "PAYLOAD_TOO_LARGE" : "MALFORMED_REQUEST" };
  }
  const created = first ? SavedQuestionCreateSchema.safeParse(body) : null;
  const later = first ? null : SavedQuestionSaveSchema.safeParse(body);
  const parsed = created?.success === true ? created.data.doc : later?.success === true ? later.data.doc : null;
  if (parsed === null) return { status: 400, error: "MALFORMED_REQUEST" };
  // The document as received: what is kept and what is measured (a parse is a check, never the stored value).
  const raw = (body as Readonly<{ doc: SavedQuestionDoc }>).doc;
  if (savedQuestionDocFits(raw) !== "FITS") return { status: 400, error: "SAVED_QUESTION_TOO_LARGE" };
  if (savedQuestionOwnWords(parsed).some((text) => detectCrisis(text).crisis)) {
    return { status: 422, error: CRISIS_SUPPORT_OFFERED, extra: { country: null } };
  }
  return Object.freeze({ raw, title: savedQuestionTitleOf(parsed), revision: later?.success === true ? later.data.revision : 1 });
}

const isRefused = (value: object): value is Refused => "error" in value;

async function create(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  counters.creates += 1;
  const admission = await admitted(req, true);
  if (isRefused(admission)) return refuse(res, "POST", path, admission);
  if (kept.size >= S.kept) return refuse(res, "POST", path, { status: 409, error: "SAVED_QUESTIONS_FULL" });
  send(res, "POST", path, 201, keep(kept, randomUUID(), 1, Date.now(), admission.title, admission.raw), SavedQuestionWrittenSchema);
}

async function save(req: IncomingMessage, res: ServerResponse, path: string, id: string): Promise<void> {
  counters.saves += 1;
  const admission = await admitted(req, false);
  if (isRefused(admission)) return refuse(res, "PUT", path, admission);
  const row = kept.get(id);
  if (row === undefined) return refuse(res, "PUT", path, { status: 404, error: "SAVED_QUESTION_GONE" });
  if (admission.revision !== row.revision) return refuse(res, "PUT", path, { status: 409, error: "SAVED_QUESTION_REVISION", extra: { revision: row.revision } });
  send(res, "PUT", path, 200, keep(kept, id, row.revision + 1, Date.now(), admission.title, admission.raw), SavedQuestionWrittenSchema);
}

/**
 * The five routes, for the mock's person on `context.plan` (which decides READY or NEEDS_READING at Pick up). True when the route was
 * one of them (answered, or refused); false for anything else, which server.ts answers. Signed out is server.ts's (401).
 */
export async function routeSavedQuestions(req: IncomingMessage, res: ServerResponse, path: string, method: string,
  context: Readonly<{ plan: StartMockPlan }> = { plan: "PLUS" }): Promise<boolean> {
  if (path === ROOT) {
    if (method === "GET") send(res, method, path, 200, listOf(kept), SavedQuestionListSchema);
    else if (method === "POST") await create(req, res, path);
    else return false;
    return true;
  }
  const rawId = path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : null;
  if (rawId === null || rawId.includes("/") || !["GET", "PUT", "DELETE"].includes(method)) return false;
  // A lowercase uuid, as the API makes them (Task 39c's ruling); anything else is refused and touches nothing.
  const id = SavedQuestionIdSchema.safeParse(rawId);
  if (!id.success) {
    refuse(res, method, path, { status: 400, error: "MALFORMED_REQUEST" });
    return true;
  }
  if (method === "PUT") {
    await save(req, res, path, id.data);
    return true;
  }
  const row = kept.get(id.data);
  if (method === "GET") {
    counters.reads += 1;
    if (row === undefined) refuse(res, method, path, { status: 404, error: "SAVED_QUESTION_GONE" });
    else send(res, method, path, 200, readOf(row, context.plan), SavedQuestionReadSchema);
    return true;
  }
  counters.deletes += 1;
  kept.delete(id.data);
  send(res, method, path, 204);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The startup check (server.ts): the routes' answers over the #pickup scene, built aside (nothing kept, nothing counted)
// ---------------------------------------------------------------------------------------------------------------

/** The list, a save's answer and every Pick up (on Plus and on Free) of the #pickup scene, built on a store of their own. */
export function savedQuestionSamples(now = Date.now()): Readonly<{ list: SavedQuestionList; written: SavedQuestionWritten; reads: readonly SavedQuestionRead[] }> {
  const store: Store = new Map();
  seedInto(store, now);
  const reads = (["PLUS", "FREE"] as const).flatMap((plan) => [...store.values()].map((row) => readOf(row, plan)));
  return Object.freeze({ list: listOf(store), written: Object.freeze({ id: MOCK_PICKUP_IDS.ready, revision: 2 }), reads: Object.freeze(reads) });
}
