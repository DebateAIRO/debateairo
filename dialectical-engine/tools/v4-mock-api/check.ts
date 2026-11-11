/*
 * Proves the mock through the WEBSITE'S OWN CODE, without starting the website: every read goes through the website's
 * /api proxy route handler (apps/ui/app/api/[...path]/route.ts, called in-process) and the website's typed contract
 * client (which parses every answer with the contract schemas), and the seeded debate is drawn with the V4 map
 * builder (apps/ui/lib/v4/mapModel.ts) to show it covers every case the map shows.
 *
 * With the mock running, from the repository's dialectical-engine/apps/ui folder (so the "@/..." imports resolve):
 *   ../../node_modules/.bin/tsx ../../tools/v4-mock-api/check.ts
 * MOCK_URL overrides http://127.0.0.1:4011. It posts three asks (real new runs in the mock), records a last visit and
 * a dig link, saves the reading level, and switches the plan and the room and back. Exit code 1 on any failure.
 *
 * Perplexity plan W1-7 (2026-10-30): it also reads the DRAFT web fields (web-draft.ts) at /__mock/draft/v1/..., the
 * account memory of migration 0131, the investigations, a Free person, and the "blocked until reset" room.
 *
 * Plan 2026-10-30-dig-model-revision.md, task W2-7: it also reads the dig model's rewritten paths, the verdict on the
 * person's point of view and the dig trail three levels down, and the money rule's words: a new question's share of today,
 * new starts waiting for the reset, the borrow notice and the debate paused at the month wall with Continue.
 * Task W4-6: it draws the first debate's map with its four rewrite states, and a dig's map from its rewrite's own paths
 * with no story, through the website's own map builder.
 *
 * Owner's screen review (3 Nov 2026, journey-d2): it reads the draft start time of a running question (`started_at`).
 * dig-d1 B and dig-f2: a running dig's draft progress read through the website's own reader (switch live=), and the played
 * climb of the seeded level-3 dig up to the first debate (switch climb=; it waits 31 s for it).
 * V4 start step, Task 80b: the questions not started yet (saved-questions.ts) on the #pickup scene (switch saved=): the list,
 * Pick up with no AI call, a first and a later save (and an old revision refused), and Delete. It leaves the scene seeded.
 * V4 start step, Task 81 (branches.ts): a new question is a path debate. It sends three paths at Start (a menu the mock's own merge writes,
 * in this process) and reads them filling in one by one, drawn by the website's own run map builder; asks with no paths and `#carryon`
 * (the AIs choose for 8 s, the carry-on on its answer from the first read); and presses a report that waits for the reset (#reportwaits).
 * It waits 30 s for them.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { FAILED_DIGS } from "./failed-seed.js";
import { MOCK_PICKUP_IDS } from "./saved-questions.js";
import { mockStartListsScript, mockStartMenu } from "./start-step.js";

const ROUTE = join("app", "api", "[...path]", "route.ts");
function findUiDir(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ROUTE)) && existsSync(join(dir, "lib", "v4", "mapModel.ts"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("UI_DIR_NOT_FOUND: run this from the repository's dialectical-engine/apps/ui folder");
    dir = parent;
  }
}

const UI = findUiDir();
process.env.DIALECTICAL_API_BASE = process.env.MOCK_URL ?? "http://127.0.0.1:4011";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const route: any = await import(pathToFileURL(join(UI, ROUTE)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const contract: any = await import(pathToFileURL(join(UI, "..", "..", "packages", "contract", "generated", "client.ts")).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapModel: any = await import(pathToFileURL(join(UI, "lib", "v4", "mapModel.ts")).href);

/** What the browser does: a same-origin request to /api/<path>, answered by the proxy route handler. */
const viaProxy = (async (input: unknown, init: RequestInit = {}) => {
  const target = new URL(String(input));
  const path = target.pathname.split("/").filter((part) => part.length > 0).map((part) => decodeURIComponent(part));
  const { cache: _cache, credentials: _credentials, ...rest } = init;
  const request = new Request(`http://127.0.0.1:3011/api${target.pathname}${target.search}`, rest);
  const handler = route[(init.method ?? "GET").toUpperCase()];
  return handler(request, { params: Promise.resolve({ path }) });
}) as typeof fetch;

const client = contract.createContractClient("http://127.0.0.1:3011", viaProxy, { mode: "cookie" });

let failures = 0;
async function step<T>(label: string, run: () => Promise<T>, show: (value: T) => string = () => "ok"): Promise<T | undefined> {
  try {
    const value = await run();
    console.log(`PASS  ${label}: ${show(value)}`);
    return value;
  } catch (failure) {
    failures += 1;
    console.log(`FAIL  ${label}: ${failure instanceof Error ? failure.message : String(failure)}`);
    return undefined;
  }
}
async function expectCode(label: string, run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
    failures += 1;
    console.log(`FAIL  ${label}: expected ${code}, got a body`);
  } catch (failure) {
    const got = (failure as { code?: string }).code;
    if (got === code) console.log(`PASS  ${label}: ${code} (as the website expects)`);
    else { failures += 1; console.log(`FAIL  ${label}: expected ${code}, got ${got ?? String(failure)}`); }
  }
}

const RUNS = {
  settled: "11111111-1111-4111-8111-111111111111",
  running: "22222222-2222-4222-8222-222222222222",
  waiting: "33333333-3333-4333-8333-333333333333",
  failed: "44444444-4444-4444-8444-444444444444",
  storyWriting: "55555555-5555-4555-8555-555555555555",
  free: "66666666-6666-4666-8666-666666666666",
  searchFailed: "77777777-7777-4777-8777-777777777777",
  dig: "88888888-8888-4888-8888-888888888888",
  // W2-7: the dig trail (own view at level 1, then levels 2 and 3) and the debate paused at the month wall.
  digOwnView: "d1000000-0000-4000-8000-000000000001",
  digLevelTwo: "d2000000-0000-4000-8000-000000000002",
  digLevelThree: "d3000000-0000-4000-8000-000000000003",
  // W4-6: a dig whose rewrite failed, and one whose rewrite changed nothing.
  digFailed: "d4000000-0000-4000-8000-000000000004",
  digNoChange: "d5000000-0000-4000-8000-000000000005",
  paused: "e1000000-0000-4000-8000-000000000001",
  // W3-4: a dig at the deepest level (10).
  deepest: "d1000000-0000-4000-8000-000000000010",
  // The owner's answers of 5 Nov (failed-seed.ts): the debate with a failed dig per reason group, and the failed question
  // whose draft view says it used some of the quota.
  failedDigs: "f0000000-0000-4000-8000-000000000000",
  failedSome: "45000000-0000-4000-8000-000000000045",
  // V4 start step, Task 57j: a question an update set aside, which can continue (failed-seed.ts RUN_FAILED_SET_ASIDE).
  failedSetAside: "46000000-0000-4000-8000-000000000046",
  // V4 start step, Task 57m: a question whose two continues failed again (failed-seed.ts RUN_FAILED_KEEPS_FAILING).
  failedKeepsFailing: "47000000-0000-4000-8000-000000000047"
};
const MOCK = process.env.DIALECTICAL_API_BASE!;
/** A mock control or a draft read, straight from the mock (not part of the real API). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mock(path: string): Promise<any> {
  const response = await fetch(`${MOCK}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
function must(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

await step("session", () => client.readSession(), (s: { asker_id: string }) => s.asker_id);
// ask-d6 A: the V4 header's round account button reads the account's address for its initial.
await step("account address (the header's initial)", () => client.readAccountEmail(), (a: { email: string }) => a.email.slice(0, 1).toUpperCase());
await step("age confirmation", () => client.readAgeConfirmation(), (s: { status: string }) => s.status);
await step("sensitive-data consent", () => client.readSensitiveDataConsent(), (s: { status: string }) => s.status);
await step("legal status", () => client.getLegalStatus("en"), (s: { must_accept: unknown[] }) => `must_accept=${s.must_accept.length}`);
await step("ask room", () => client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, answer_length: "standard" }),
  (r: { room: string; plan_id: string; settings_version?: number }) => `${r.room} plan=${r.plan_id} settings_version=${r.settings_version}`);
await step("billing usage", () => client.getBillingUsage(),
  (u: { windows: { scope: string; percent: number }[] }) => u.windows.map((w) => `${w.scope} ${w.percent}%`).join(", "));
await step("answer index", () => client.readAnswerIndex(50, 0),
  (i: { items: unknown[]; open_runs: { state: string }[] }) => `${i.items.length} served, open: ${i.open_runs.map((r) => r.state).join(" ")}`);

for (const [name, id] of Object.entries(RUNS)) {
  await step(`run ${name}`, () => client.readRun(id),
    (r: { state: string; terminal_reason: string | null; waits_until?: string | null }) =>
      `${r.state}${r.terminal_reason ? ` (${r.terminal_reason})` : ""}${r.waits_until ? ` waits until ${r.waits_until}` : ""}`);
}
await expectCode("run answer of the running run", () => client.readRunAnswer(RUNS.running), "NOT_FOUND");
// V4 screen review (wait-f1): a sign-in that ended reads as SESSION_REQUIRED (the page then asks to sign in again).
await fetch(`${MOCK}/__mock/set?session=OUT`);
try {
  await expectCode("a debate read after the sign-in ended", () => client.readRun(RUNS.running), "SESSION_REQUIRED");
  // A stranger has no quota: the room and usage reads are signed-in only, as in the real API.
  await expectCode("the room read of a stranger", () => client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, answer_length: "standard" }), "SESSION_REQUIRED");
  await expectCode("the usage read of a stranger", () => client.getBillingUsage(), "SESSION_REQUIRED");
  await expectCode("the subscription read of a stranger", () => client.getBillingSubscription(), "SESSION_REQUIRED");
  await expectCode("the invoices read of a stranger", () => client.getBillingInvoices(), "SESSION_REQUIRED");
  await expectCode("the withdrawal of a stranger", () => client.withdrawSubscription(), "SESSION_REQUIRED");
} finally {
  await fetch(`${MOCK}/__mock/set?session=IN`);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const answer: any = await step("run answer (settled)", () => client.readRunAnswer(RUNS.settled), (a: { answer_id: string; nodes: unknown[] }) => `${a.answer_id}, ${a.nodes.length} points`);
if (answer !== undefined) {
  await step("answer by id", () => client.readAnswer(answer.answer_id), (a: { question_line: string }) => a.question_line);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const story: any = await step("story (settled)", () => client.readAnswerStory(answer.answer_id), (s: { status: string }) => s.status);
  await step("disclosure", () => client.readAnswerDisclosure(answer.answer_id), (d: { floor: unknown }) => `floor=${d.floor}`);
  await expectCode("map view", () => client.readAnswerMapView(answer.answer_id), "NOT_FOUND");
  await step("inspection", () => client.readInspection(answer.answer_id), (i: { conformance: { outcome: string } }) => i.conformance.outcome);
  await step("ledger digest", () => client.readLedgerDigest(answer.answer_id), (d: { work_items: unknown[] }) => `${d.work_items.length} work items`);
  await step("recorded events (settled)", () => client.readEvents(RUNS.settled), (e: { event_type: string }[]) => e.map((x) => x.event_type).join(" "));

  if (story !== undefined) {
    const map = mapModel.buildV4Map({ runId: RUNS.settled, answer, story });
    console.log("\nV4 map of the seeded debate (lib/v4/mapModel.ts):");
    console.log(`  story: ${map.storyState}; headline: ${map.headline}`);
    for (const path of map.paths) {
      console.log(`  path ${path.id} — ${path.fate}`);
      for (const point of path.points) console.log(`      ${point.id.padEnd(16)} ${String(point.trust ?? "(not checked yet)").padEnd(18)} ${point.basis ?? ""}${point.answeredBy ? `  answered by: ${point.answeredBy.slice(0, 50)}…` : ""}${point.asOf ? `  as of ${point.asOf}` : ""}`);
      for (const open of path.open) console.log(`      open: ${open.id}${open.star ? " ★" : ""}`);
    }
    for (const open of map.open) console.log(`  open on the question: ${open.kind} ${open.id}${open.star ? " ★" : ""}`);
    console.log(`  counts: ${JSON.stringify(map.counts)}, not checked yet: ${map.unchecked}`);
    const fates = new Set(map.paths.map((p: { fate: string }) => p.fate));
    const bases = new Set(map.points.map((p: { basis: string | null }) => p.basis));
    const missing = [
      ...["HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE"].filter((fate) => !fates.has(fate)),
      // "ANSWERED" is in the word list but lib/v4/trust.ts gives it to no point today; a FELL path's position reads "FELL".
      // W2-6: "Sure" rests on a checked page (WEB_CHECKED_AND_AGREED); a remembered citation is LOOKED_UP_AND_AGREED.
      ...["WEB_CHECKED_AND_AGREED", "LOOKED_UP_AND_AGREED", "ARGUED_AND_AGREED", "AGREED_BUT_DATED", "DISPUTED", "COULD_NOT_CHECK", "FELL", null].filter((basis) => !bases.has(basis)),
      ...(map.objections.length === 2 ? [] : ["two objections"]),
      ...(map.wouldChange === null ? ["reversal point"] : [])
    ];
    if (missing.length === 0) console.log("PASS  the seeded debate covers every V4 map case\n");
    else { failures += 1; console.log(`FAIL  the seeded debate misses: ${missing.join(", ")}\n`); }
  }
}
await step("story (run 5555, first 40 s after start)", async () => {
  const a = await client.readRunAnswer(RUNS.storyWriting);
  return (await client.readAnswerStory(a.answer_id)).status;
}, (status: string) => status);

// A live stream: the open runs keep the stream open (cut here after 1.5 s).
await step("live event stream (running run)", async () => {
  const seen: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await client.streamEvents(RUNS.running, (event: { event_type: string }) => seen.push(event.event_type), controller.signal);
  } catch (failure) {
    if (!controller.signal.aborted) throw failure;
  } finally {
    clearTimeout(timer);
  }
  return seen;
}, (seen: string[]) => `still open after 1.5 s, saw: ${seen.join(" ")}`);

// The ask, as lib/api.ts createDebate builds it.
const ask = {
  question_line: "Should our school switch to a four-day week?",
  risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "check:v4-mock",
  composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" },
  decision_scope: "personal", as_of: new Date().toISOString(), steering_presets: [], plan_tier: "premium",
  steering_annotations: [], site_language: "en", settings_version: 20
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const accepted: any = await step("submit ask", () => client.submitAskOrLanguageChoice(ask), (o: { kind: string; accepted?: { run_ref: string; status: string } }) => `${o.kind} ${o.accepted?.status} ${o.accepted?.run_ref}`);
if (accepted?.accepted !== undefined) {
  await step("new run right after the ask", () => client.readRun(accepted.accepted.run_ref), (r: { state: string }) => r.state);
}
await step("ask with #mix in it", () => client.submitAskOrLanguageChoice({ ...ask, question_line: "Should our school #mix switch to a four-day week?" }),
  (o: { kind: string; offer?: { proposed_question: string } }) => `${o.kind}: "${o.offer?.proposed_question}"`);

// ---- Perplexity plan W1-7: the draft web fields, the account memory (0131), investigations, Free and a blocked room ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const draftAnswer = async (runId: string): Promise<Loose> => {
  const served = await client.readRunAnswer(runId);
  return mock(`/__mock/draft/v1/answers/${served.answer_id}`);
};
const state: Loose = await step("mock state", () => mock("/__mock/state"),
  (value: Loose) => `draft fields sent to the website: answer ${value.draft_fields_sent.answer}, room ${value.draft_fields_sent.room}`);
await step("contract read holds back what the contract does not know yet", async () => {
  const served: Loose = await client.readRunAnswer(RUNS.settled);
  must(("web" in served) === state.draft_fields_sent.answer, "web sent although the contract does not know it");
  return served.nodes.some((node: Loose) => "sources" in node) ? "sources sent" : "sources held back";
}, (value: string) => value);

await step("paid debate: sources, other pages, no search planned, every outcome (draft)", async () => {
  const answer = await draftAnswer(RUNS.settled);
  const paths: Loose[] = answer.web.paths;
  must(paths.map((path) => path.search.status).join(" ") === "SEARCHED SEARCHED SEARCHED NO_SEARCH_PLANNED", "path statuses");
  const sources: Loose[] = answer.nodes.flatMap((node: Loose) => node.sources);
  must(sources.length > 0 && sources.every((source) => source.quote.length <= 120), "quotes of at most 120 characters");
  must(new Set(sources.map((source) => source.read_depth)).size === 3, "whole, preview only and abstract only");
  must(sources.some((source) => source.fewer_readers === true), "a page with fewer readers");
  const remembered = answer.nodes.find((node: Loose) => node.node_id === "n-mix-cost");
  must(remembered.way_of_knowing === "LOOKED_UP" && remembered.looked_up_checked === false, "a remembered citation is not checked");
  const suggestions: Loose[] = paths.flatMap((path) => path.suggestions);
  const kinds = new Set(suggestions.map((suggestion) => `${suggestion.kind}${suggestion.side === null ? "" : `.${suggestion.side}`}`));
  const states = new Set(paths.flatMap((path) => path.other_pages.filter((page: Loose) => page.researched !== undefined).map((page: Loose) => page.researched.state)));
  must(kinds.size === 5 && states.size === 4, "every suggestion kind and side, and every researched outcome");
  return `${sources.length} sources, ${paths.flatMap((path) => path.other_pages).length} other pages, no search on ${paths[3].position_ref}: "${paths[3].search.reason}"`;
}, (value: string) => value);
await step("debate whose search failed (draft)", async () => {
  const answer = await draftAnswer(RUNS.searchFailed);
  must(answer.web.paths.every((path: Loose) => path.search.status === "FAILED"), "every path FAILED");
  must(answer.nodes.every((node: Loose) => node.sources.length === 0), "no sources");
  return "every path FAILED, no sources";
}, (value: string) => value);
await step("Free debate (draft)", async () => {
  const answer = await draftAnswer(RUNS.free);
  must(answer.web.paths.every((path: Loose) => path.search.status === "NOT_ON_PLAN"), "every path NOT_ON_PLAN");
  must(answer.nodes.every((node: Loose) => node.sources.length === 0 && node.looked_up_checked === false), "no sources, nothing checked");
  return "every path NOT_ON_PLAN, no sources";
}, (value: string) => value);
for (const [name, id] of [["search failed", RUNS.searchFailed], ["free", RUNS.free], ["dig", RUNS.dig]] as const) {
  await step(`V4 map of the ${name} debate`, async () => {
    const answer = await client.readRunAnswer(id);
    const story = await client.readAnswerStory(answer.answer_id);
    return mapModel.buildV4Map({ runId: id, answer, story });
  }, (map: Loose) => `${map.paths.length} paths, story ${map.storyState}`);
}

await step("Free person: room and usage", async () => {
  await mock("/__mock/set?plan=FREE");
  try {
    const room: Loose = await client.getAskRoom({ plan_tier: "free", composition_budget_tier: "medium", depth: 1, answer_length: "short" });
    const usage: Loose = await client.getBillingUsage();
    must(room.plan_id === "FREE" && usage.plan_id === "FREE", `room ${room.plan_id}, usage ${usage.plan_id}`);
    // Free counts the month alone (plan-windows.ts), so the header's circle opens one bar.
    must(usage.windows.map((window: Loose) => window.scope).join() === "PERSON_MONTH", "Free's usage names the month alone");
    return "room plan FREE, usage plan FREE, the month alone";
  } finally {
    await mock("/__mock/set?plan=PLUS");
  }
}, (value: string) => value);

await step("reading level (0131)", async () => {
  const before: Loose = await client.readReadingLevel();
  const saved: Loose = await client.saveReadingLevel("expert");
  const after: Loose = await client.readReadingLevel();
  must(saved.reading_level === "expert" && after.reading_level === "expert", "saved level read back");
  return `${before.reading_level} -> ${after.reading_level}`;
}, (value: string) => value);
await step("last visit (0131)", async () => {
  await client.recordLastVisit(RUNS.settled, { "path:n-mix": "HELD_UP", "point:n-renew-storage": "STILL_ARGUED" });
  const visit: Loose = await client.readLastVisit(RUNS.settled);
  must(visit.items?.["path:n-mix"] === "HELD_UP", "the visit read back");
  const never: Loose = await client.readLastVisit(RUNS.searchFailed);
  must(never.seen_at === null && never.items === null, "a debate never visited");
  return `seen at ${visit.seen_at}`;
}, (value: string) => value);
await expectCode("last visit of an unknown debate", () => client.readLastVisit("99999999-9999-4999-8999-999999999999"), "NOT_FOUND");
await step("dig links (0131)", async () => {
  const parent: Loose = await client.readDigLinks(RUNS.settled);
  const child: Loose = await client.readDigLinks(RUNS.dig);
  must(parent.children.some((link: Loose) => link.child_run_id === RUNS.dig), "the seeded dig is a child");
  must(child.parent?.parent_run_id === RUNS.settled, "the seeded dig names its parent");
  return `${parent.children.length} dig(s) from the first debate`;
}, (value: string) => value);

// ---- V4 start step, Task 80b (saved-questions.ts): the questions not started yet, on the #pickup scene ----
await mock("/__mock/set?saved=pickup");
await step("saved questions: the list (saved=pickup)", async () => {
  const list: Loose = await client.listSavedQuestions();
  const ids = list.questions.map((one: Loose) => one.id);
  must(ids[0] === MOCK_PICKUP_IDS.ready && ids.includes(MOCK_PICKUP_IDS.needsReading), "the two seeded questions, the newer first");
  return list.questions.map((one: Loose) => `"${one.question}" (${String(one.saved_at).slice(0, 10)})`).join(", ");
}, (value: string) => value);
const pickedUp: Loose = await step("saved questions: Pick up asks no AI", async () => {
  const before: Loose = (await mock("/__mock/state")).start_step;
  const ready: Loose = await client.readSavedQuestion(MOCK_PICKUP_IDS.ready);
  const other: Loose = await client.readSavedQuestion(MOCK_PICKUP_IDS.needsReading);
  const after: Loose = (await mock("/__mock/state")).start_step;
  must(ready.state === "READY" && ready.doc.page.plan.paths.length === 5, "the Plus one is READY with its five paths");
  must(other.state === "NEEDS_READING", "the one read for Free must be read again on Plus");
  must(JSON.stringify(after) === JSON.stringify(before), "no lists, merge, combine or fit was asked");
  return ready;
}, (ready: Loose) => `${ready.state}, ${ready.doc.page.plan.paths.map((path: Loose) => path.wording).join(" ")}`);
if (pickedUp !== undefined) {
  const written: Loose = await step("saved questions: a first save", () => client.createSavedQuestion(pickedUp.doc),
    (value: Loose) => `${value.id} revision ${value.revision}`);
  if (written !== undefined) {
    await step("saved questions: a later save, and one over an old revision refused", async () => {
      const later: Loose = await client.saveSavedQuestion(written.id, written.revision, pickedUp.doc);
      let refused: Loose = null;
      try {
        await client.saveSavedQuestion(written.id, written.revision, pickedUp.doc);
      } catch (failure) {
        refused = failure;
      }
      must(later.revision === written.revision + 1, "the later save's revision");
      must(refused?.status === 409 && refused?.serverCode === "SAVED_QUESTION_REVISION", "an old revision is refused 409");
      return `revision ${later.revision}; the old one ${refused.serverCode}`;
    }, (value: string) => value);
    await step("saved questions: Delete", async () => {
      await client.deleteSavedQuestion(written.id);
      const list: Loose = await client.listSavedQuestions();
      must(!list.questions.some((one: Loose) => one.id === written.id), "gone from the list");
      return "gone from the list";
    }, (value: string) => value);
  }
}

// ---- V4 start step, Task 81 (branches.ts): a new question is a path debate; its paths fill in one by one ----
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
await step("the AIs choose the paths, with the carry-on (#carryon)", async () => {
  const sent: Loose = await client.submitAsk({ ...ask, question_line: "Should our town plant a tree on every street? #carryon" });
  const choosing: Loose = await client.readRun(sent.run_ref);
  must(choosing.branches === undefined && Array.isArray(choosing.path_progress) && choosing.path_progress.length === 0, "no paths while the AIs choose");
  must(choosing.carry_on_part === "ANSWER", "the carry-on line is on its answer from the first read (Task 57b)");
  await sleep(9_000);
  const named: Loose = await client.readRun(sent.run_ref);
  must(named.branches?.source === "RUN_BUILT" && named.branches.paths.length === 5 && named.path_progress.length === 5, "five paths named after 8 s");
  must(named.branches.paths.every((path: Loose) => path.state === "LOOKING" && path.author === "AI_SUGGESTION"), "each the AIs', still looked into");
  must(named.carry_on_part === "ANSWER" && named.branches.carry_on_to_report === true, "the carry-on still on its answer");
  return named.branches.paths.map((path: Loose, at: number) => `${String(path.title)} ${String(named.path_progress[at].step)}`).join(", ");
}, (value: string) => value);
await step("one path per path sent at Start, filling in one by one", async () => {
  // Sent as the page sends them after Start, from a menu the mock's own merge writes (start-step.ts, in this process: the mock's references
  // are its own and not secret): a menu path as written, one viewpoint as written, the person's own words.
  const question = "Should towns close their centres to cars at weekends?";
  const script = mockStartListsScript(question, "PLUS");
  const checkRef: string = (script.find((one) => one.event.event === "check")!.event as Loose).data.check_ref;
  const menu = mockStartMenu(script.flatMap((one) => (one.event.event === "list" ? [one.event.data.list] : [])), null).menu;
  const first = menu.menu.paths[0]!;
  const single = menu.menu.viewpoints.find((one) => !first.viewpoint_ids.includes(one.viewpoint_id))!;
  const own = "Shops on the square would lose their weekend customers.";
  const startPaths = { source: "MENU", menu, width: 3, chosen_by: "PERSON", paths: [
    { title: first.title, question: first.question, members: first.viewpoint_ids.map((id) => ({ viewpoint_id: id })) },
    { title: single.title, question: single.question, members: [{ viewpoint_id: single.viewpoint_id }] },
    { title: "Shops on the square", question: own, members: [{ own_text: own }] }
  ] };
  const sent: Loose = await client.submitAsk({ ...ask, question_line: question, start_check: { ref: checkRef }, start_paths: startPaths });
  const atStart: Loose = await client.readRun(sent.run_ref);
  must(atStart.branches.paths.map((path: Loose) => path.author).join() === "AI_SUGGESTION,AI_SUGGESTION,PERSON_OWN_VIEW", "each path with who wrote it");
  must(atStart.branches.paths.every((path: Loose) => path.state === "LOOKING"), "all three looked into");
  must(atStart.path_progress.every((entry: Loose) => entry.step === "FINDING_SOURCES"), "each finding sources");
  await sleep(21_000);
  const later: Loose = await client.readRun(sent.run_ref);
  must(later.branches.paths.map((path: Loose) => path.state).join() === "ARGUED,LOOKING,LOOKING", "b1 argued, b2 and b3 still looked into");
  must(later.path_progress[0].findings.length > 0 && later.path_progress.every((entry: Loose) => entry.points.length <= 6), "b1's findings; never more than 6 dots");
  const map: Loose = mapModel.buildV4RunMap({ runId: sent.run_ref, run: later });
  must(map !== null && map.paths.length === 3 && map.paths[0].points.length > 0, "the website's run map draws b1's findings");
  return later.branches.paths.map((path: Loose, at: number) => `${String(path.path_id)} ${String(path.state)}${later.path_progress[at].step === null ? "" : ` ${String(later.path_progress[at].step)}`}`).join(", ");
}, (value: string) => value);
await step("a report that waits for the reset (#reportwaits)", async () => {
  const sent: Loose = await client.submitAsk({ ...ask, question_line: "Should our library open on Sundays? #reportwaits" });
  const read: Loose = await client.readInvestigation(sent.run_ref);
  must(read.first_closing_left === false, "its next report is not its first");
  let refused: Loose = null;
  try {
    await client.writeReport(sent.run_ref);
  } catch (failure) {
    refused = failure;
  }
  must(refused?.status === 409 && refused?.serverCode === "PUBLIC_DEBATE_WAITS_FOR_RESET", "the press waits for the reset; nothing starts");
  must((await client.readInvestigation(RUNS.storyWriting)).first_closing_left === true, "no version yet elsewhere: the first report is left");
  must((await client.readInvestigation(RUNS.settled)).first_closing_left === false, "a version stands on the first debate");
  return `refused ${String(refused.serverCode)}`;
}, (value: string) => value);

await step("investigation of the first debate, reserve kept (draft)", async () => {
  const investigation: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.settled}/investigation`);
  const room: Loose = await mock("/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=2&answer_length=standard");
  must(investigation.state === "OPEN" && investigation.closings.length >= 1, "open again, with an earlier report");
  must(investigation.digs.some((link: Loose) => link.child_run_id === RUNS.dig), "the dig is in it");
  must(room.reserve === "KEPT", "the room says the reserve is kept");
  return `OPEN, ${investigation.digs.length} dig(s), ${investigation.closings.length} earlier report(s), room reserve ${room.reserve}`;
}, (value: string) => value);
await step("a dig's share of today (draft room read for a dig)", async () => {
  const quick: Loose = await mock(`/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=1&answer_length=short&dig_parent=${RUNS.settled}&dig_mode=quick&dig_picks=1`);
  const thorough: Loose = await mock(`/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=2&answer_length=standard&dig_parent=${RUNS.settled}&dig_mode=thorough&dig_picks=2`);
  const served: Loose = await client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 1, answer_length: "short" });
  must(served.dig_share_percent === undefined, "a read for a new question carries no share");
  return `quick ${quick.dig_share_percent}%, thorough ${thorough.dig_share_percent}%`;
}, (value: string) => value);
await step("blocked until reset (draft), read as FULL by today's contract", async () => {
  await mock("/__mock/set?room=BLOCKED");
  try {
    const draft: Loose = await mock("/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=2&answer_length=standard");
    const served: Loose = await client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, answer_length: "standard" });
    must(draft.room === "FULL" && draft.reserve === "BLOCKED" && draft.resets_at !== null, "draft room FULL, reserve BLOCKED");
    must(served.room === "FULL" && (served.reserve === "BLOCKED") === state.draft_fields_sent.room, `served room ${served.room} ${served.reserve}`);
    return `draft BLOCKED until ${draft.resets_at}; website reads ${served.room}${served.reserve === undefined ? "" : ` ${served.reserve}`}`;
  } finally {
    await mock("/__mock/set?room=FITS");
  }
}, (value: string) => value);

await step("a dig sent with its parent (draft) joins the investigation", async () => {
  const sent: Loose = await client.submitAsk({
    ...ask, question_line: "Does this hold up, and when? Storage that lasts several days is cheap enough.",
    parent: {
      parent_run_id: RUNS.settled, places: ["p:n-renew-storage", "path:n-renew"], mode: "thorough",
      picks: [
        { kind: "CONTRADICTING", suggestion_id: "renew-contradicting", place: "p:n-renew-storage", text: "Can batteries cover several windless days?" },
        { kind: "OWN_VIEW", suggestion_id: null, place: "path:n-renew", text: "What would pumped hydro add?" }
      ]
    }
  });
  const links: Loose = await client.readDigLinks(RUNS.settled);
  const investigation: Loose = await mock(`/__mock/draft/v1/runs/${sent.run_ref}/investigation`);
  must(links.children.some((link: Loose) => link.child_run_id === sent.run_ref && link.mode === "thorough"), "the link was recorded");
  must(investigation.root_run_id === RUNS.settled, "it joined the first debate's investigation");
  return `${sent.run_ref} joined ${investigation.root_run_id}`;
}, (value: string) => value);
await step("a dig linked after start (the page's call today) joins too", async () => {
  const sent: Loose = await client.submitAsk({ ...ask, question_line: "How strong is this objection, and does it change the answer?" });
  await client.recordDigLink(RUNS.searchFailed, { child_run_id: sent.run_ref, places: ["o:0"], mode: "quick" });
  const investigation: Loose = await mock(`/__mock/draft/v1/runs/${sent.run_ref}/investigation`);
  must(investigation.root_run_id === RUNS.searchFailed, "it joined the parent's investigation");
  return `${sent.run_ref} joined ${investigation.root_run_id}`;
}, (value: string) => value);
await step("Write my report closes the investigation (draft)", async () => {
  const response = await fetch(`${MOCK}/v1/runs/${RUNS.searchFailed}/investigation/close`, { method: "POST" });
  const closed: Loose = await response.json();
  must(response.ok && closed.state === "CLOSED" && closed.closings.length === 1, `HTTP ${response.status}, ${closed.state}`);
  return `CLOSED, report version ${closed.closings.at(-1).report_version}`;
}, (value: string) => value);

// ---- W2-7: the new dig model (rewritten paths, the verdict, nesting) and the money rule ----

await step("rewritten paths of the first debate, through the website's client", async () => {
  const served: Loose = await client.readRunAnswer(RUNS.settled);
  must(state.draft_fields_sent.answer === ("path_rewrites" in served), "path_rewrites sent exactly when the contract knows them");
  const rewrites: Loose = (await draftAnswer(RUNS.settled)).path_rewrites;
  const byPath = Object.fromEntries(rewrites.paths.map((path: Loose) => [path.position_ref, path]));
  must(byPath["n-mix"].current.line === byPath["n-mix"].history.at(-1).text.line, "the current text is the newest rewrite's");
  must(byPath["n-mix"].history.at(-1).view.outcome === "HELPED" && byPath["n-mix"].history.at(-1).view.scope === "MAIN_QUESTION", "a verdict");
  must(byPath["n-renew"].changed_below === true && byPath["n-renew"].history.at(-1).view === null, "changed further down; an AI pick has no verdict");
  // As the server counts (packages/serve path-rewrites.ts): every finished rewrite since the report, n-smr's confirmation too.
  must(rewrites.changed_since.count === 3 && rewrites.changed_since.since_report_version === 1, "3 paths changed since report version 1");
  return `${rewrites.paths.length} paths rewritten, ${rewrites.changed_since.count} changed since report version ${rewrites.changed_since.since_report_version}`;
}, (value: string) => value);
await step("the dig trail three levels down (draft)", async () => {
  const trail: string[] = [];
  for (const [id, level, parent] of [[RUNS.dig, 1, RUNS.settled], [RUNS.digLevelTwo, 2, RUNS.dig], [RUNS.digLevelThree, 3, RUNS.digLevelTwo]] as const) {
    const dig: Loose = (await draftAnswer(id)).dig;
    must(dig.level === level && dig.parent_run_id === parent, `level ${level} under its parent`);
    trail.push(`level ${dig.level} ${dig.rewrite.state}${dig.rewrite.view ? ` (${dig.rewrite.view.outcome})` : ""}`);
  }
  const own: Loose = (await draftAnswer(RUNS.digOwnView)).dig;
  must(own.picks.some((pick: Loose) => pick.by === "PERSON_OWN_VIEW") && own.rewrite.view !== null, "the own-view dig carries its verdict");
  const links: Loose = await client.readDigLinks(RUNS.digLevelTwo);
  must(links.parent?.parent_run_id === RUNS.dig && links.children.some((link: Loose) => link.child_run_id === RUNS.digLevelThree), "the dig links nest");
  const investigation: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.digLevelThree}/investigation`);
  must(investigation.root_run_id === RUNS.settled, "a dig of a dig is in the first debate's investigation");
  return trail.join(" › ");
}, (value: string) => value);
await step("the deepest level, and a dig past it refused before it starts (W3-4)", async () => {
  const deepest: Loose = (await draftAnswer(RUNS.deepest)).dig;
  must(deepest.level === 10 && deepest.parent_run_id === RUNS.digLevelThree, "the deepest dig says level 10");
  const refused = await fetch(`${MOCK}/v1/asks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ask, question_line: "Look into this: one level more", parent: { parent_run_id: RUNS.deepest, places: ["path:n-mix"], mode: "quick" } })
  });
  const body: Loose = await refused.json();
  must(refused.status === 409 && body.error === "DIG_TOO_DEEP" && body.level_max === 10, "a dig at level 11 is refused 409 DIG_TOO_DEEP");
  return `level ${deepest.level}; one more: ${refused.status} ${body.error}`;
}, (value: string) => value);
// ---- W4-6: the map of rewritten paths and of a dig, drawn by the website's own map builder ----
await step("the four rewrite states on the first debate's map, through the website's map builder (W4-6)", async () => {
  const served = await client.readRunAnswer(RUNS.settled);
  const map = mapModel.buildV4Map({ runId: RUNS.settled, answer: served, story: await client.readAnswerStory(served.answer_id) });
  const states = Object.fromEntries(map.paths.map((path: Loose) => [path.id, mapModel.rewriteStateOf(path.rewrites?.history.at(-1))]));
  must(states["n-mix"] === "REWRITTEN" && states["n-renew"] === "REWRITTEN", "two paths rewritten");
  must(states["n-nuclear"] === "FAILED" && states["n-smr"] === "NO_CHANGE", "one failed, one not changed");
  for (const [id, state] of [[RUNS.digFailed, "FAILED"], [RUNS.digNoChange, "READY"]] as const) {
    const own: Loose = (await client.readRunAnswer(id)).dig;
    must(own?.rewrite?.state === state && own.parent_run_id === RUNS.settled, `the dig ${id} says its rewrite is ${state}`);
  }
  const level2 = mapModel.buildV4Map({ runId: RUNS.digLevelTwo, answer: await client.readRunAnswer(RUNS.digLevelTwo), story: null });
  must(level2.paths.some((path: Loose) => mapModel.rewriteStateOf(path.rewrites?.history.at(-1)) === "REWRITING"), "a path still being rewritten one level down");
  return Object.entries(states).map(([id, state]) => `${id} ${state}`).join(", ") + "; d200's n-nuclear REWRITING";
}, (value: string) => value);
await step("a dig's map is drawn from its rewrite's own paths, with no story (W4-6, Q-D13)", async () => {
  const dug = await client.readRunAnswer(RUNS.dig);
  const map = mapModel.buildV4Map({ runId: RUNS.dig, answer: dug, story: await client.readAnswerStory(dug.answer_id) });
  must(map.storyState === "NONE" && map.headline === null && map.fallbackText !== null, "no story; its answer text stays");
  must(map.paths.map((path: Loose) => path.fate).join(" ") === "HELD_UP FELL PARTLY_HELD SET_ASIDE", "the rewrite's own fates");
  return `${map.paths.length} paths, level ${map.dig?.level}, story ${map.storyState}`;
}, (value: string) => value);
await step("a new question's estimate, as a share of today", async () => {
  const room: Loose = await client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, answer_length: "standard" });
  must((room.start_share_percent === 15) === state.draft_fields_sent.room, `start share ${room.start_share_percent}`);
  return `${room.start_share_percent ?? "(held back)"}%`;
}, (value: string) => value);
await step("new starts wait for the day's reset (room=WAIT_RESET)", async () => {
  await mock("/__mock/set?room=WAIT_RESET");
  try {
    const draft: Loose = await mock("/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=2&answer_length=standard");
    must(draft.room === "FULL" && draft.new_starts === "BLOCKED_UNTIL_RESET" && draft.resets_at !== null, "FULL, new starts blocked until the reset");
    return `new starts wait until ${draft.resets_at}`;
  } finally {
    await mock("/__mock/set?room=FITS");
  }
}, (value: string) => value);
await step("running work borrowed from tomorrow (usage=BORROWED)", async () => {
  await mock("/__mock/set?usage=BORROWED");
  try {
    const usage: Loose = await client.getBillingUsage();
    must(usage.windows[0].percent > 100, "the day reads over 100%");
    must((usage.borrowed?.[0]?.percent === 4) === state.draft_fields_sent.usage, "the borrow notice sent exactly when the contract knows it");
    return `day ${usage.windows[0].percent}%, borrowed ${usage.borrowed?.[0]?.percent ?? "(held back)"}% of tomorrow`;
  } finally {
    await mock("/__mock/set?usage=NORMAL");
  }
}, (value: string) => value);
await step("a debate paused at the month wall, then Continue", async () => {
  await mock("/__mock/set?pause=UNTIL_RESET");
  const continueRun = () => fetch(`${MOCK}/v1/runs/${RUNS.paused}/continue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const before: Loose = await client.readRun(RUNS.paused);
  must(before.state === "RUNNING" && (before.month_pause?.can_continue === false) === state.draft_fields_sent.run, "paused until the reset");
  const early = await continueRun();
  must(early.status === 409 && (await early.json()).error === "RUN_PAUSED_UNTIL_RESET", "Continue before the reset is refused");
  await mock("/__mock/set?pause=CAN_CONTINUE");
  const ready: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.paused}`);
  must(ready.month_pause.can_continue === true, "Continue offered once the month reset");
  const resumed = await continueRun();
  must(resumed.status === 200 && (await resumed.json()).state === "CONTINUING", "Continue resumes it");
  const after: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.paused}`);
  must(after.month_pause === undefined, "no pause after Continue");
  await mock("/__mock/set?pause=UNTIL_RESET");
  return `paused until ${before.month_pause?.until ?? ready.month_pause.until}; Continue refused early, then resumed`;
}, (value: string) => value);
// Owner review 3 Nov (wait-f11, wait-f18): a failed run's `quota_used` (on the draft view until the contract carries it), and
// the switch that makes new digs fail or pause, for the click-test of "Try this dig again" and the paused dig.
await step("a failed debate's quota_used, and the dig= switch", async () => {
  const today: Loose = await client.readRun(RUNS.failed);
  must(today.state === "FAILED" && (today.quota_used === undefined || today.quota_used === "NONE"), "today's run read stays valid");
  const draft: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.failed}`);
  must(draft.quota_used === "NONE", "the draft view says nothing was taken");
  for (const dig of ["FAIL", "PAUSE", "SETTLE"]) must((await mock(`/__mock/set?dig=${dig}`)).dig === dig, `dig=${dig} is taken`);
  return `draft quota_used ${String(draft.quota_used)}; dig= FAIL, PAUSE, SETTLE`;
}, (value: string) => value);
// The owner's answers of 5 Nov (questions 3 A and 20 A): one failed dig per reason group on its own debate's map, sorted by
// the website's own reason groups, and a failed question whose draft view says it used some of the quota.
await step("a failed dig per reason group, and a failed question that used some (5 Nov answers)", async () => {
  const failure: Loose = await import(pathToFileURL(join(UI, "lib", "v3", "runFailure.ts")).href);
  const links: Loose = await client.readDigLinks(RUNS.failedDigs);
  const kinds = new Set<string>();
  for (const link of links.children) {
    const run: Loose = await client.readRun(link.child_run_id);
    must(run.state === "FAILED", `${link.child_run_id} failed`);
    kinds.add(failure.runFailureKind(run.terminal_reason));
    const draft: Loose = await mock(`/__mock/draft/v1/runs/${link.child_run_id}`);
    must(draft.quota_used === "NONE" || draft.quota_used === "SOME", `${link.child_run_id}: the draft view says what it took`);
  }
  must(failure.RUN_FAILURE_KINDS.every((kind: string) => kinds.has(kind)), `every reason group has a failed dig (${[...kinds].join(", ")})`);
  // The wave-4 browser check (5 Nov): each digs its own place, so none reads as one dig that failed twice.
  must(new Set(links.children.map((link: Loose) => [...link.places].sort().join(" "))).size === links.children.length, "each failed dig digs its own place");
  const some: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.failedSome}`);
  must(some.state === "FAILED" && some.quota_used === "SOME", "the second failed question's draft view says it used some");
  // V4 start step, Task 57g (Task 57e's `reusable`, renamed): the contract's run read says it can continue; so does the first failed
  // question's (its models gone at claim is a stop of ours, which the API continues: review of 57g), with nothing used.
  const someRead: Loose = await client.readRun(RUNS.failedSome);
  must(someRead.continuable === true, "the second failed question's run read says it can continue where it stopped");
  const firstRead: Loose = await client.readRun(RUNS.failed);
  must(firstRead.continuable === true && firstRead.quota_used === "NONE", "the first failed question can continue too, with nothing used");
  // V4 start step, Task 57j: a question an update set aside continues too, with nothing used (what ran before the set-aside is the site's).
  const setAsideRead: Loose = await client.readRun(RUNS.failedSetAside);
  must(setAsideRead.state === "FAILED" && failure.runFailureKind(setAsideRead.terminal_reason) === "SET_ASIDE"
    && setAsideRead.continuable === true && setAsideRead.quota_used === "NONE", "the question an update set aside can continue, with nothing used");
  // V4 start step, Task 57m: a question, and the failed dig 1, whose two continues failed again: they keep failing, and never continue.
  for (const id of [RUNS.failedKeepsFailing, FAILED_DIGS.find((dig) => dig.keepsFailing === true)!.runRef]) {
    const keepsRead: Loose = await client.readRun(id);
    must(keepsRead.state === "FAILED" && keepsRead.keeps_failing === true && keepsRead.continuable === undefined, `${id} keeps failing`);
  }
  return `${links.children.length} failed digs (${[...kinds].join(", ")}); failed question quota_used ${String(some.quota_used)}, continuable ${String(someRead.continuable)}`;
}, (value: string) => value);
// V4 start step, Task 57g (the owner's 7 Nov answers): "Continue where it stopped". A failed run the API refuses too (the dig an update set
// aside) is refused; the second failed question runs again (a second press while it runs is CONTINUING too), then finishes; failed=RESET
// puts it back as seeded, for the click-test.
await step("a failed question continues where it stopped, then finishes (Task 57g; failed=RESET)", async () => {
  const press = (id: string) => fetch(`${MOCK}/v1/runs/${id}/continue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const refused = await press(FAILED_DIGS.find((dig) => dig.kind === "SET_ASIDE")!.runRef);
  must(refused.status === 409 && (await refused.json()).error === "RUN_NOT_CONTINUABLE", "a debate an update set aside cannot continue");
  // Task 57m: nor a question that keeps failing after two continues.
  const keeps = await press(RUNS.failedKeepsFailing);
  must(keeps.status === 409 && (await keeps.json()).error === "RUN_NOT_CONTINUABLE", "a question that keeps failing cannot continue");
  const first = await press(RUNS.failedSome);
  must(first.status === 200 && (await first.json()).state === "CONTINUING", "Continue continues the second one");
  const running: Loose = await client.readRun(RUNS.failedSome);
  must(running.state === "RUNNING" && running.continuable === undefined && running.quota_used === undefined, "it runs again");
  const again = await press(RUNS.failedSome);
  must(again.status === 200 && (await again.json()).state === "CONTINUING", "a second press while it runs is CONTINUING");
  let state: string = running.state;
  for (let waited = 0; state !== "SETTLED" && waited < 90; waited += 1) {
    await sleep(1_000);
    state = (await client.readRun(RUNS.failedSome) as Loose).state;
  }
  must(state === "SETTLED", "then it finishes");
  await mock("/__mock/set?failed=RESET");
  const reset: Loose = await client.readRun(RUNS.failedSome);
  must(reset.state === "FAILED" && reset.continuable === true, "failed=RESET puts it back as seeded");
  return `refused the set-aside dig, continued 4500…45 to ${state}, reset to ${String(reset.state)}`;
}, (value: string) => value);

// Owner's screen review, 3 Nov 2026 (journey-d2, journey-f16, wait-f7): when a question started, for "Started 14:31" on any
// device. A DRAFT field: on the draft view now; the website gets it only once the contract's run read knows `started_at`.
await step("when a question started (draft started_at)", async () => {
  const draft: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.running}`);
  must(typeof draft.started_at === "string" && !Number.isNaN(Date.parse(draft.started_at)), "the draft view says when it started");
  const waiting: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.waiting}`);
  must(waiting.state === "WAITING" && waiting.started_at === undefined, "a question waiting to start has no start time");
  const today: Loose = await client.readRun(RUNS.running);
  must(today.started_at === undefined || today.started_at === draft.started_at, "the website gets the same time, once the contract knows it");
  return `started ${draft.started_at}${today.started_at === undefined ? " (held back from the website until the contract knows it)" : ""}`;
}, (value: string) => value);

// Owner's screen review, 3 Nov 2026 (read-f19, public-f14, map-f33, map-f9): the window a share is of, and what a question
// has used of it. DRAFT fields: on the draft view now; the website reads them once the contract's reads know them.
await step("the quota's windows (draft share_scope and question_share)", async () => {
  const room: Loose = await mock(`/__mock/draft/v1/asks/room?plan_tier=premium&composition_budget_tier=medium&depth=1&answer_length=short&dig_parent=${RUNS.settled}&dig_mode=quick`);
  must(room.share_scope === "PERSON_DAY" || room.share_scope === "PERSON_MONTH", "a dig's room read names the window of its share");
  const run: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.settled}`);
  must(run.question_share !== undefined && Number.isInteger(run.question_share.percent), "a settled run says what it used");
  const today: Loose = await client.readRun(RUNS.settled);
  must(today.month_pause === undefined || typeof today.month_pause === "object", "the website's run read stays valid");
  return `share of ${String(room.share_scope)}; this question ${String(run.question_share.percent)}% of ${String(run.question_share.scope)}`;
}, (value: string) => value);

// Decision 13: the public-debates lane. It runs last among the asks: it adds two digs and one report to the mock.
const PUBLIC = { debate: "f1000000-0000-4000-8000-000000000001", authorGone: "f1000000-0000-4000-8000-000000000002", update: "f2000000-0000-4000-8000-000000000001" };
const CONTRIBUTION_DIGS = { CHECKING: "c1000000-0000-4000-8000-000000000001", ON_THE_PAGE: "c1000000-0000-4000-8000-000000000002", KEPT_PRIVATE: "c1000000-0000-4000-8000-000000000003", REMOVED_AFTER_REVIEW: "c1000000-0000-4000-8000-000000000004" };
const publicAsk = (publicParent: Loose | null, extra: Loose = {}): Loose => ({
  question_line: "Look deeper into this part of the answer: free fares.", plan_tier: "free", risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "mock-check",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "personal", as_of: new Date().toISOString(), steering_presets: [], steering_annotations: [],
  ...(publicParent === null ? {} : { public_parent: publicParent }), ...extra
});
const ownView = (place: string, count = 1): Loose[] => Array.from({ length: count }, (_, at) => ({ kind: "OWN_VIEW", suggestion_id: null, place, text: `My own view ${String(at + 1)}` }));
await step("a public debate with one contribution, a changed main answer, one report", async () => {
  const debate: Loose = await client.readPublicDebate(PUBLIC.debate);
  must(debate.contributions.length >= 1 && debate.contributions[0].dig_paths.length === 1, "one contribution with its dig's paths");
  must(debate.main_answer_update !== undefined, "the main answer changed");
  must(debate.reports.length >= 1 && debate.reports[0].writer !== null, "one report, with its writer as a reference");
  const gone: Loose = await client.readPublicDebate(PUBLIC.authorGone);
  must(gone.author_name_gone === true, "the author's name went");
  // public-d1 A: the tree is published, so the page has each path's trust word and bar; every point carries a review, one rests on a checked page.
  must(debate.answer.tree_included === true && debate.answer.nodes.every((node: Loose) => node.review !== null), "a published tree, every point reviewed");
  must(debate.answer.nodes.some((node: Loose) => node.looked_up_checked === true), "one point on a checked page");
  return `${String(debate.contributions.length)} contribution(s), ${String(debate.reports.length)} report(s), ${String(debate.answer.nodes.length)} points`;
}, (value: string) => value);
await expectCode("a public debate nobody published", () => client.readPublicDebate("f1000000-0000-4000-8000-00000000ffff"), "NOT_FOUND");
await step("the digger's four states", async () => {
  for (const [state, runId] of Object.entries(CONTRIBUTION_DIGS)) {
    const answer: Loose = await client.readRunAnswer(runId);
    must(answer.contribution.state === state && answer.contribution.public_ref === PUBLIC.debate, `${state}: ${JSON.stringify(answer.contribution)}`);
  }
  return Object.keys(CONTRIBUTION_DIGS).join(", ");
}, (value: string) => value);
await step("a dig on a public page: its refusals, then it starts and checks", async () => {
  await expectCode("nobody's page", () => client.submitAsk(publicAsk({ public_ref: "f1000000-0000-4000-8000-00000000ffff", places: ["path:p-fares"], mode: "quick", picks: ownView("path:p-fares") })), "NOT_FOUND");
  await expectCode("a path the page does not show", () => client.submitAsk(publicAsk({ public_ref: PUBLIC.debate, places: ["path:not-here"], mode: "quick", picks: ownView("path:not-here") })), "MALFORMED_REQUEST");
  await expectCode("too many views on Free", () => client.submitAsk(publicAsk({ public_ref: PUBLIC.debate, places: ["path:p-fares"], mode: "quick", picks: ownView("path:p-fares", 4) })), "MALFORMED_REQUEST");
  await mock("/__mock/set?room=FULL");
  try {
    await expectCode("a used-up limit", () => client.submitAsk(publicAsk({ public_ref: PUBLIC.debate, places: ["path:p-fares"], mode: "quick", picks: ownView("path:p-fares") })), "SERVER_FAILURE"); // A 409's own word is in serverCode; the website's tests read it.
  } finally {
    await mock("/__mock/set?room=FITS");
  }
  const onDigPath: Loose = await client.submitAsk(publicAsk({ public_ref: PUBLIC.debate, dig_ref: PUBLIC.update, places: ["path:p-towns"], mode: "quick", picks: ownView("path:p-towns") }));
  const accepted: Loose = await client.submitAsk(publicAsk({ public_ref: PUBLIC.debate, places: ["path:p-fares"], mode: "quick", picks: ownView("path:p-fares") }));
  return `started ${String(accepted.run_ref)} and ${String(onDigPath.run_ref)}`;
}, (value: string) => value);
await step("the Free notice: a Free room says so, and an ask that showed it is counted", async () => {
  await mock("/__mock/set?plan=FREE");
  try {
    const room: Loose = await client.getAskRoom({ plan_tier: "free", composition_budget_tier: "low", depth: 1 });
    must(room.plan_id === "FREE", `plan ${String(room.plan_id)}`);
    const before: Loose = await (await fetch(`${process.env.DIALECTICAL_API_BASE}/__mock/state`)).json();
    await client.submitAsk(publicAsk(null, { free_public_notice: true }));
    const after: Loose = await (await fetch(`${process.env.DIALECTICAL_API_BASE}/__mock/state`)).json();
    must(after.free_notices === before.free_notices + 1, "counted");
  } finally {
    await mock("/__mock/set?plan=PLUS");
  }
  return "counted";
}, (value: string) => value);
// Owner screen review (public-f26, public-d2 A): the public state of the asker's own debate, and the chips' draft field.
await step("the public state of your debate: PUBLISHED with its page; the stages before it on the draft view only", async () => {
  try {
    await mock("/__mock/set?publicstate=PUBLISHED");
    const published: Loose = await client.readRunVisibility(RUNS.settled);
    must(published.state === "PUBLISHED" && published.public_ref === PUBLIC.debate, `published: ${JSON.stringify(published)}`);
    await mock("/__mock/set?publicstate=BEING_CHECKED");
    const checking: Loose = await client.readRunVisibility(RUNS.settled);
    must(checking.state === "PRIVATE" && checking.public_ref === null, `the website's read: ${JSON.stringify(checking)}`);
    const draft: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.settled}/visibility`);
    must(draft.public_stage === "BEING_CHECKED", `draft: ${JSON.stringify(draft)}`);
  } finally {
    await mock("/__mock/set?publicstate=PRIVATE");
  }
  const page: Loose = await mock(`/__mock/draft/v1/public/debates/${PUBLIC.debate}`);
  must(Array.isArray(page.dig_suggestions) && page.dig_suggestions.length === 2, `draft chips: ${JSON.stringify(page.dig_suggestions)}`);
  return "PUBLISHED, BEING_CHECKED (draft), chips (draft)";
}, (value: string) => value);
await step("Write a report: 202 and its refusals", async () => {
  // Task 56h: the author gone and no dig on it: the report is written from what the page holds (no "Dig into a path first").
  const fromTheCopy: Loose = await client.writePublicReport(PUBLIC.authorGone);
  must(fromTheCopy.state === "WRITING" && fromTheCopy.report_version === 1, `author gone: ${JSON.stringify(fromTheCopy)}`);
  await mock("/__mock/set?public=ONGOING");
  try {
    const ongoing: Loose = await client.writePublicReport(PUBLIC.debate);
    must(ongoing.error === "PUBLIC_DEBATE_ONGOING", `ongoing: ${JSON.stringify(ongoing)}`);
  } finally {
    await mock("/__mock/set?public=OPEN");
  }
  await mock("/__mock/set?room=FULL");
  try {
    const waits: Loose = await client.writePublicReport(PUBLIC.debate);
    must(waits.error === "PUBLIC_DEBATE_WAITS_FOR_RESET", `used up: ${JSON.stringify(waits)}`);
  } finally {
    await mock("/__mock/set?room=FITS");
  }
  const accepted: Loose = await client.writePublicReport(PUBLIC.debate);
  must(accepted.state === "WRITING" && accepted.report_version >= 2, `written: ${JSON.stringify(accepted)}`);
  return `version ${String(accepted.report_version)} writing`;
}, (value: string) => value);
// public-f9: a report the click-test can watch wait: accepted, and its version never arrives.
await step("Write a report that never arrives (public=REPORT_STUCK)", async () => {
  await mock("/__mock/set?public=REPORT_STUCK");
  try {
    const stuck: Loose = await client.writePublicReport(PUBLIC.debate);
    must(stuck.state === "WRITING", `accepted: ${JSON.stringify(stuck)}`);
    const page: Loose = await client.readPublicDebate(PUBLIC.debate);
    must(!(page.reports ?? []).some((report: Loose) => report.report_version >= stuck.report_version), "its version is not on the page");
    return `version ${String(stuck.report_version)} stays being written`;
  } finally {
    await mock("/__mock/set?public=OPEN");
  }
}, (value: string) => value);
// Decision 35: the Report button, through the website's own client, and the queue through the contract's schema. It hides the first public debate, so it reads the 410 and puts it back.
await step("Report: not found, with a person, hidden (the page answers 410), and the queue holds them", async () => {
  const report = (claim: string, ref: string = PUBLIC.debate) => client.flagPublicDebate(ref, { where: "The main answer.", claim, good_faith: true });
  const plain: Loose = await report("A plain claim about the answer.");
  must(plain.state === "NOT_FOUND", `plain: ${JSON.stringify(plain)}`);
  const person: Loose = await report("Someone should read this #person.");
  must(person.state === "WITH_A_PERSON", `person: ${JSON.stringify(person)}`);
  const nobody: Loose = await report("A claim about a page nobody published.", "f1000000-0000-4000-8000-00000000ffff");
  must(nobody.state === "NOT_FOUND", `nobody's page: ${JSON.stringify(nobody)}`);
  const hidden: Loose = await report("This text should hide at once.");
  must(hidden.state === "HIDDEN", `hidden: ${JSON.stringify(hidden)}`);
  try {
    const page = await fetch(`${MOCK}/v1/public/debates/${PUBLIC.debate}`);
    must(page.status === 410, `the page while hidden: ${String(page.status)}`);
    const queue = contract.PublicFlagQueueSchema.parse(await (await fetch(`${MOCK}/v1/admin/public-reports`)).json());
    must(queue.reports.filter((row: Loose) => row.publication_ref === PUBLIC.debate).map((row: Loose) => row.state).join() === "NOT_FOUND,QUEUED,HIDDEN", `queue: ${JSON.stringify(queue.reports.map((row: Loose) => row.state))}`);
  } finally {
    await mock(`/__mock/review?ref=${PUBLIC.debate}&step=REPUBLISH`);
  }
  await client.readPublicDebate(PUBLIC.debate);
  return "three answers, 410 while hidden, the queue, and back";
}, (value: string) => value);

// The sign-in helper's cookies must survive the proxy's cookie rules.
await step("Add to researched: READING, then the outcome; the same page again changes nothing; Free refused", async () => {
  const answer = await draftAnswer(RUNS.settled);
  const path = answer.web.paths.find((candidate: Loose) => candidate.other_pages.some((page: Loose) => page.researched === undefined));
  const page = path.other_pages.find((candidate: Loose) => candidate.researched === undefined);
  const added = { position_ref: path.position_ref, page_ref: page.page_ref };
  await mock("/__mock/set?plan=FREE");
  try {
    const refused: Loose = await client.addToResearched(RUNS.settled, added);
    must(refused.error === "WEB_RESEARCHED_NOT_ON_PLAN", `Free: ${String(refused.error)}`);
  } finally {
    await mock("/__mock/set?plan=PLUS");
  }
  const first: Loose = await client.addToResearched(RUNS.settled, added);
  must(first.state === "READING", "READING");
  const again: Loose = await client.addToResearched(RUNS.settled, added);
  must(again.state === "READING", "READING again");
  const reading = (await draftAnswer(RUNS.settled)).web.paths.find((candidate: Loose) => candidate.position_ref === path.position_ref)
    .other_pages.find((candidate: Loose) => candidate.page_ref === page.page_ref);
  must(reading.researched.state === "READING", "the answer says READING");
  return `page ${page.page_ref} reading`;
}, (value: string) => value);
await step("sign-in cookies pass the proxy", async () => {
  const response: Response = await route.GET(new Request("http://127.0.0.1:3011/api/__mock/sign-in"), { params: Promise.resolve({ path: ["__mock", "sign-in"] }) });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split("=", 1)[0] ?? "");
  if (response.status !== 200 || cookies.length !== 2) throw new Error(`status ${response.status}, cookies ${cookies.join(",")}`);
  return cookies;
}, (cookies: string[]) => cookies.join(" + "));

// R22 W5-1: the report's versions, as the website reads them; "Write my report", its failed case, "Keep digging", and the Arabic debate's language.
await step("report versions: write, finish, keep digging, a failed one", async () => {
  const seeded: Loose = await client.readInvestigation(RUNS.settled);
  must(seeded.current === 1 && seeded.versions[0].paths.some((path: Loose) => path.dig !== undefined), "the first debate has report version 1, with its paths");
  must((await client.writeReport(RUNS.free)).error === "INVESTIGATION_CLOSED", "a finished version stands: Keep digging first");
  must((await client.reopenInvestigation(RUNS.free)).state === "OPEN", "Keep digging opens it");
  const writing: Loose = await client.writeReport(RUNS.free);
  must(writing.state === "WRITING" && writing.report_version === 2, "the next version is being written");
  must((await client.readInvestigation(RUNS.free)).versions.at(-1).state === "WRITING", "it reads as being written");
  must((await client.reopenInvestigation(RUNS.free)).error === "INVESTIGATION_REPORT_WRITING", "no Keep digging while it is written");
  await new Promise((done) => setTimeout(done, 9_000));
  const finished: Loose = await client.readInvestigation(RUNS.free);
  must(finished.current === 2 && finished.versions[1].sources.length === 0, "version 2 is current, with no sources on Free");
  await fetch(`${MOCK}/__mock/set?report=FAIL`);
  await client.reopenInvestigation(RUNS.free);
  await client.writeReport(RUNS.free);
  await new Promise((done) => setTimeout(done, 9_000));
  await fetch(`${MOCK}/__mock/set?report=OK`);
  const failed: Loose = await client.readInvestigation(RUNS.free);
  must(failed.versions[2].state === "FAILED" && failed.current === 2, "a failed version leaves the current one");
  return `versions ${failed.versions.map((version: Loose) => version.state).join(" ")}`;
}, (value: string) => value);
await step("the Arabic debate says its language, and its report is in Arabic", async () => {
  const ref = "a2000000-0000-4000-8000-000000000001";
  must((await client.readRun(ref)).argument_language.tag === "ar", "the question's language");
  const read: Loose = await client.readInvestigation(ref);
  must(/[\u0600-\u06FF]/u.test(read.versions[0].story.short_answer), "the report's words");
  return read.versions[0].story.short_answer;
}, (value: string) => value);

// ---- The owner's screen review (3 Nov): "Your maps" on the ask page, read by the website's own shelf reader ----
await step("Your maps: digs left out by their dig links and hung under their question; the server's extra parts held back", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shelfModule: any = await import(pathToFileURL(join(UI, "lib", "v4", "mapShelf.ts")).href);
  const { readFileSync } = await import("node:fs");
  const v4Catalog = JSON.parse(readFileSync(join(UI, "messages", "en", "v4.json"), "utf8"));
  const shelf: Loose = await shelfModule.readMapShelf(5, v4Catalog, { client });
  const seededDigs = [RUNS.dig, RUNS.digOwnView, RUNS.digLevelTwo, RUNS.digLevelThree, RUNS.digFailed, RUNS.digNoChange, RUNS.deepest,
    // The owner's answers of 5 Nov (failed-seed.ts): the seven failed digs hang under their debate, never as questions.
    ...FAILED_DIGS.map((dig) => dig.runRef)];
  must(shelf.maps.length === 5 && shelf.maps.every((map: Loose) => !seededDigs.includes(map.runId)), "five real questions, no dig among them");
  const first: Loose = shelf.maps.find((map: Loose) => map.runId === RUNS.settled);
  must(first === undefined || first.digs.length > 0, "the first debate carries its digs");
  must(shelf.maps.every((map: Loose) => map.bar === null && map.startedAt === null), "the draft parts are held back from today's contract");
  const draft: Loose = await mock("/__mock/draft/v1/answers?limit=50&offset=0");
  must(draft.open_runs.some((run: Loose) => typeof run.started_at === "string"), "a running question says when it started");
  must(draft.items.some((item: Loose) => item.map_bar !== undefined && typeof item.changed_since_visit === "boolean"), "an answer carries its bar and its New dot");
  must(draft.items.some((item: Loose) => item.run_ref === RUNS.dig && item.dug_from === RUNS.settled), "a dig names the debate it was dug from");
  return shelf.maps.map((map: Loose) => `${map.state}${map.digs.length > 0 ? ` (+digs)` : ""}`).join(", ");
}, (value: string) => value);

// ---- The owner's screen review (3 Nov): a running dig's progress read (dig-d1 B) and the played climb (dig-f2), drafts ----
await step("a running dig's steps and findings: none with live=OFF (as today's API), read by the website with live=ON", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadModule: any = await import(pathToFileURL(join(UI, "lib", "v4", "load.ts")).href);
  const sent: Loose = await client.submitAsk({
    ...ask, question_line: "Does this hold up? Pumped hydro could carry a windless week.",
    parent: { parent_run_id: RUNS.settled, places: ["path:n-renew"], mode: "quick" }
  });
  await fetch(`${MOCK}/__mock/set?live=OFF`);
  must((await loadModule.loadDigProgress(sent.run_ref, viaProxy)).kind === "ABSENT", "no progress read with live=OFF");
  await fetch(`${MOCK}/__mock/set?live=ON`);
  const on: Loose = await loadModule.loadDigProgress(sent.run_ref, viaProxy);
  must(on.kind === "SHOWN" && on.progress.steps[0] === "FINDING_SOURCES" && on.progress.now !== null, "the web steps, one working now");
  must((await loadModule.loadDigProgress(RUNS.settled, viaProxy)).kind === "ABSENT", "a first debate has none");
  await fetch(`${MOCK}/__mock/set?live=OFF`);
  return `${String(on.progress.now)}, ${String(on.progress.findings.length)} finding(s) so far`;
}, (value: string) => value);
await step("the played climb of the level-3 dig reaches the first debate (climb=PLAY)", async () => {
  await fetch(`${MOCK}/__mock/set?climb=PLAY`);
  await new Promise((done) => setTimeout(done, 31_000));
  const renew: Loose = (await client.readRunAnswer(RUNS.settled)).path_rewrites.paths.find((path: Loose) => path.position_ref === "n-renew");
  must(renew.history.at(-1).dig_run_id === RUNS.digLevelThree && renew.history.at(-1).state === "READY", "the climbed row is done on the first debate");
  must((await client.readRunAnswer(RUNS.digLevelThree)).dig.rewrite.state === "READY", "the level-3 dig's own rewrite is done");
  await fetch(`${MOCK}/__mock/set?climb=SEED`);
  return `${String(renew.history.at(-1).cause)} row on n-renew`;
}, (value: string) => value);

// ---- The owner's screen review (3 Nov): the report from the map (report-d1 A, report-f15) ----
await step("the report's share of today is held back from the website; a Free question reads public", async () => {
  // An open paid investigation (5555) says the report's share on the draft view only; the website's read has no share.
  const draft: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.storyWriting}/investigation?shape=reports`);
  const read: Loose = await client.readInvestigation(RUNS.storyWriting);
  must(draft.report_share_percent === 5, "the draft view says the report's share");
  must(!("report_share_percent" in read), "the strict contract's read carries no share");
  // On Free, no share (its report comes from the reserve); a finished Free question (6666) is public.
  await mock("/__mock/set?plan=FREE");
  try {
    const free: Loose = await mock(`/__mock/draft/v1/runs/${RUNS.storyWriting}/investigation?shape=reports`);
    must(!("report_share_percent" in free), "no share on Free");
  } finally {
    await mock("/__mock/set?plan=PLUS");
  }
  const visibility: Loose = await client.readRunVisibility(RUNS.free);
  must(visibility.state === "PUBLISHED" && typeof visibility.public_ref === "string", "the Free question is public");
  must((await client.readRunVisibility(RUNS.settled)).state === "PRIVATE", "a paid question stays private");
  return `share ${draft.report_share_percent}% (draft only), Free question ${visibility.state}`;
}, (value: string) => value);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
