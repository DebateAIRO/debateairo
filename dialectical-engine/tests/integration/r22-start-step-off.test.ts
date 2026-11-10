// V4 start step, Task 89 (plan 2026-11-03, Global Constraints: "absent switch = R22 byte for byte"): with the register's
// start-step switch absent, R22 path 1's question runs as R22 against the REAL API of tests/support/r22-world.ts, sending
// what the page sends over real HTTP. The step itself is wired as on the test site (a preview gate and 0158's writer), so
// only the switch keeps it off: the lists answer none OFF, the run's receipt is not v2, R22's map step opens the debate
// (MAP:angles) and the start step's (START:) never runs, the answer carries no `branches` and the classic map view answers.
// No vendor is contacted; all data is made up. Integration suites are skipped by the CI gate: run this file by hand, alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartListsEvent } from "@debateai/contract";
import { preStartChargeWriterPresent } from "@debateai/budget";
import { DEBATE_SHAPE_V2_FORMULA_VERSION, debateShapeStartStepOf, isShapeReceiptV2, readDebateShapePolicy } from "@debateai/register";
import { startStepRouteOf } from "../../apps/api/src/start-step/step.js";
import { loadV4 } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { pathWebOf } from "../../apps/ui/lib/v4/web.js";
import { composeQuestion, purposeLinesOfGoal } from "../../apps/ui/lib/v4/askText.js";
import { stubJudgement } from "../support/preview-gate-stubs.js";
import { ask, newDebateCatalog, panelAgrees } from "../support/r22-pages.js";
import { startR22World, type R22Account, type R22Script, type R22World } from "../support/r22-world.js";

let world: R22World;
beforeAll(async () => { world = await startR22World({ startStep: "OFF" }); }, 900_000);
afterAll(async () => { await world?.stop(); });

const opening = (text: string): string => text.slice(0, text.indexOf(".") + 1);
const pagesOf = (field: (name: string) => string | undefined) => JSON.parse(field("pages") ?? "[]") as { page_id: string; text?: string }[];
/** R22 path 1's search replies (tests/integration/r22-end-to-end.test.ts): a pair of searches per path, readers quoting each page's first sentence. */
const webReplies: R22Script = (contract, request, _chat, field) => {
  if (request.kind === "JUDGE") {
    const id = /S[1-9][0-9]*-[1-9][0-9]*/u.exec(field("sources") ?? "")?.[0];
    if (id !== undefined) return { content: JSON.stringify({ ...JSON.parse(stubJudgement("A point the page reports, with its figure.")) as object, way_of_knowing: "LOOKED_UP", locator: id }) };
  }
  if (contract === null) return null;
  if (contract.startsWith("web.plan.")) {
    const answers = JSON.parse(field("answers") ?? "[]") as { answer_id: string }[];
    return { content: JSON.stringify({ country: null, answers: answers.map((answer, index) => ({ answer_id: answer.answer_id, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: `harbour pier evidence for ${String(index)}` }, { side: "against", local: false, query: `harbour pier evidence against ${String(index)}` }] })) }) };
  }
  if (contract.startsWith("web.read-all")) return { content: JSON.stringify({ pages: pagesOf(field).map((page) => ({ page_id: page.page_id, grade: 2, adds: "It adds a figure.", note: "The page reports one figure.", extracts: [opening(page.text ?? "")] })) }) };
  if (contract.startsWith("web.read-top")) return { content: JSON.stringify({ pages: pagesOf(field).map((page) => ({ page_id: page.page_id, grade: 3, extracts: [opening(page.text ?? "")] })), worth_looking_into: ["Winter ridership numbers."] }) };
  return null;
};
const webScript: R22Script = (contract, request, chat, field) => panelAgrees(contract, request, chat, field) ?? webReplies(contract, request, chat, field);

/** Every model call's site key on the run, in the ledger's order. */
const runSites = async (runId: string): Promise<readonly string[]> => (await world.database.pool.query<{ call_site_key: string }>(
  "SELECT call_site_key FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence", [runId])).rows.map((row) => row.call_site_key);

describe("R22 on the real API with the start-step switch absent", () => {
  const QUESTION = "Should Harbour Town build a second ferry pier?";
  let ana: R22Account;

  it("path 1's question: the lists answer none OFF, then the debate runs as R22 (receipt not v2, MAP:angles and no START:, no branches, the classic map view)", async () => {
    world.setScript(webScript);
    ana = await world.account("ana", "PLUS");
    // Next: the lists before Start answer none OFF (and end NONE); nothing is asked or charged.
    const events: StartListsEvent[] = [];
    await ana.client.startPathLists({ question_line: QUESTION, reading_level: "plain" }, (event) => { events.push(event); }, new AbortController().signal);
    expect(events).toEqual([{ event: "none", data: { reason: "OFF" } }, { event: "end", data: { reason: "NONE" } }]);
    expect((await world.database.pool.query("SELECT 1 FROM identity.pre_start_charge WHERE owner_ref=$1", [ana.ownerRef])).rows).toEqual([]);
    // Why: the switch is absent from the active version's shape row, while the step is wired as on the test site (a preview gate and
    // 0158's writer), so only the switch keeps it off.
    const shape = await readDebateShapePolicy(world.database.pool, world.nextVersion);
    expect(shape).not.toBeNull();
    expect(shape).not.toHaveProperty("startStep");
    expect(debateShapeStartStepOf(shape, "plus")).toBeNull();
    expect(startStepRouteOf({ previewGate: world.environment.PREVIEW_GATE_SETTINGS, writerPresent: await preStartChargeWriterPresent(world.runtimePool) })).toBe("PREVIEW");

    // Start as R22's page sends it: path 1's clarify answer in the question line, no paths.
    const clarify = await ana.client.clarifyAsk({ question_line: QUESTION });
    if (clarify.source !== "AI") throw new Error(`clarify answered ${clarify.source}`);
    const purpose = clarify.purpose!;
    const chosen = purpose.answers[0]!;
    const goal = { answers: [{ question: purpose.text, answer: chosen }], matters: "", angles: [] } as never;
    const started = await ask(ana, composeQuestion(QUESTION, goal, newDebateCatalog), { purposeLines: purposeLinesOfGoal(goal)! });
    const runId = started.id;
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    expect(world.stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);

    // The receipt is not v2: no path debate was priced, and no chosen paths were sealed for the run.
    const basis = (await world.database.pool.query<{ envelope_basis: Record<string, unknown> }>("SELECT envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0]!.envelope_basis;
    expect(basis.formula_version).not.toBe(DEBATE_SHAPE_V2_FORMULA_VERSION);
    expect(isShapeReceiptV2(basis)).toBe(false);
    expect((basis.shape as { version?: number } | undefined)?.version).not.toBe(2);
    expect((basis.web as { version?: number } | undefined)?.version).not.toBe(2);
    // Task 91k: every kind now mints web version 3, so "no path debate priced" is read from the web part's kind.
    expect((basis.web as { kind?: string } | undefined)?.kind).not.toBe("PATHS");
    expect((await world.database.pool.query<{ ids: string[] | null }>("SELECT core.read_start_path_ids($1) AS ids", [runId])).rows[0]!.ids).toBeNull();

    // R22's map step opened the debate; the start step's never ran.
    const sites = await runSites(runId);
    expect(sites).toContain("MAP:angles");
    expect(sites.filter((site) => site.startsWith("START:"))).toEqual([]);

    // No `branches`: on the wire (the answer as the API sends it) and as the page reads it; the R22 paths are the story's, each searched.
    const wire = await (await ana.send(`${world.base}/v1/runs/${encodeURIComponent(runId)}/answer`)).json() as Record<string, unknown>;
    expect(wire).toHaveProperty("answer_id");
    expect(wire).not.toHaveProperty("branches");
    const load = await loadV4(runId, ana.client);
    if (load.kind !== "SERVED") throw new Error(`page still waiting: ${load.run.state} ${String(load.run.terminal_reason)}`);
    expect(load.answer).not.toHaveProperty("branches");
    const map = buildV4Map({ runId, answer: load.answer, story: load.story });
    expect(map.paths.length).toBeGreaterThanOrEqual(2);
    for (const path of map.paths) expect(pathWebOf(load.answer, path.id)?.search.status, path.id).toBe("SEARCHED");

    // The classic map view answers, on nodes the answer holds.
    const view = await ana.client.readAnswerMapView(load.answer.answer_id);
    expect(view.positions.length).toBeGreaterThan(0);
    const nodeIds = new Set(load.answer.nodes.map((node) => node.node_id));
    for (const position of view.positions) expect(nodeIds.has(position.node_id), position.node_id).toBe(true);
    const webPart = basis.web === undefined ? "no web part" : `web v${String((basis.web as { version?: number }).version)}`;
    console.info(`SEEN off: lists none OFF (route PREVIEW, no pre-Start charge); receipt ${String(basis.formula_version)}, ${webPart}; `
      + `${String(sites.length)} model calls, MAP:angles present, no START:; no branches; ${String(map.paths.length)} paths SEARCHED; classic map view ${String(view.positions.length)} positions`);
  }, 300_000);
});
