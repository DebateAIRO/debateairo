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
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

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
  paused: "e1000000-0000-4000-8000-000000000001",
  // W3-4: a dig at the deepest level (10).
  deepest: "d1000000-0000-4000-8000-000000000010"
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
    return "room plan FREE, usage plan FREE";
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

await step("investigation of the first debate, reserve kept (draft)", async () => {
  const investigation: Loose = await mock(`/v1/runs/${RUNS.settled}/investigation`);
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
  const investigation: Loose = await mock(`/v1/runs/${sent.run_ref}/investigation`);
  must(links.children.some((link: Loose) => link.child_run_id === sent.run_ref && link.mode === "thorough"), "the link was recorded");
  must(investigation.root_run_id === RUNS.settled, "it joined the first debate's investigation");
  return `${sent.run_ref} joined ${investigation.root_run_id}`;
}, (value: string) => value);
await step("a dig linked after start (the page's call today) joins too", async () => {
  const sent: Loose = await client.submitAsk({ ...ask, question_line: "How strong is this objection, and does it change the answer?" });
  await client.recordDigLink(RUNS.searchFailed, { child_run_id: sent.run_ref, places: ["o:0"], mode: "quick" });
  const investigation: Loose = await mock(`/v1/runs/${sent.run_ref}/investigation`);
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
  must(rewrites.changed_since.count === 2 && rewrites.changed_since.since_report_version === 1, "2 paths changed since report version 1");
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
  const investigation: Loose = await mock(`/v1/runs/${RUNS.digLevelThree}/investigation`);
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

// The sign-in helper's cookies must survive the proxy's cookie rules.
await step("sign-in cookies pass the proxy", async () => {
  const response: Response = await route.GET(new Request("http://127.0.0.1:3011/api/__mock/sign-in"), { params: Promise.resolve({ path: ["__mock", "sign-in"] }) });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split("=", 1)[0] ?? "");
  if (response.status !== 200 || cookies.length !== 2) throw new Error(`status ${response.status}, cookies ${cookies.join(",")}`);
  return cookies;
}, (cookies: string[]) => cookies.join(" + "));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
