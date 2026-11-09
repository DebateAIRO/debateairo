// tests/integration/v2-paths-report.test.ts (V4 start step, Task 55b; spec 2026-11-03 §4.4 and §4.6, the owner's request for report-f4).
// "Write my report" and the automatic main-answer updates on a path debate, end to end: the REAL runner composed as main.ts composes it
// on the preview (the path rewrite and its climb switched on), scripted gates, a migrated embedded PostgreSQL, one encrypted owner. The
// parent is a Plus path debate on three paths, b2 the person's own; the report is written through the real closing sources over the
// stored rows, Haiku writing and GLM checking (scripted). The dossier names b1..b3 by their answers so far, the own words beside the
// outcome's verdict; each stored version keeps every first-level path's id and trust word, and the own path's words and verdict (the
// newest dig's once a dig wrote one). A dig under b2 rewrites b2 from b2's answer so far, then the main answer updates over every path.
// A dig of a path left out before Start ("+ N more") is a new first-level path. An R22 debate's dossier keeps its shape.
// Task 55e (spec §4.4): that dig updates the main answer (trigger PATH_ADDED), a deeper dig under the new path climbs to the main
// answer, and the tree's sweep writes the update a runner left undone.
// Review of Task 50c: the ROOT's care mark, read from the database, makes the update a dig causes and the next report ask the goal drafts.
// Integration suites are skipped by the CI gate: run this file by hand, alone. Every name, question and page is made up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StoryBodySchema, type PathOutcome, type PurposeLines } from "@debateai/contract";
import {
  MAIN_ANSWER_UPDATE_CARRIER, PostgresDigPicksRepository, PostgresInvestigationReportRunnerRepository, PostgresInvestigationRepository,
  PostgresPathResultsRepository, PostgresStartPathsStore, PostgresTreeUpdateRunnerRepository, decryptContentForRun, migrate, withRunContentLease,
  type CryptoEnvelope, type Pool, type StoredPathViewpoint, type StoredStartPathSet
} from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import {
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { serveMainAnswer } from "@debateai/serve";
import { postgresPurposeLines } from "../../apps/api/src/purpose-lines.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { closeInvestigation, type InvestigationReportContent } from "../../apps/runner/src/investigation-close.js";
import { composeInvestigationClose, postgresInvestigationCloseSources } from "../../apps/runner/src/investigation-close-sources.js";
import { buildInvestigationDossier, dossierFieldsOf, type DossierInput } from "../../apps/runner/src/investigation-dossier.js";
import { TREE_SWEEP_DEFAULTS, sweepTreeUpdates } from "../../apps/runner/src/path-climb.js";
import { postgresTreeUpdatePorts, readRecentTreeDigs } from "../../apps/runner/src/path-climb-sources.js";
import { PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL, composePathRewrite } from "../../apps/runner/src/path-rewrite-composition.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { CLOSING_RESERVES, contractOf, fieldsOf, team } from "../support/investigation-close-world.js";
import { FIVE_MAKER_REFS, OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { PATHS_SETTINGS, materialOf, pathsShapeOf, storedPathsOf } from "../support/paths-run-harness.js";
import type { GateOverride, GateRecord, GateRequest } from "../support/preview-gate-stubs.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, database: () => database, stubClosers });
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); vi.restoreAllMocks(); });
afterAll(async () => {
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
  await database?.stop();
});

const own = (): StoryEncryptedOwner => owner!;
const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const fieldOf = (request: GateRecord, name: string): string | undefined => materialOf(request).fields.find((field) => field.name === name)?.content;

/** The person's own words on their own path b2. */
const OWN_WORDS = Object.freeze(["Cernavodă jobs matter more than the bills."]);
/** Each path's answer so far names its path (the stand-in's line is the same for all): "On path T<n> the answer holds so far." */
const outcomeLineOf = (title: string): string => `On path ${title} the answer holds so far.`;
const OUTCOME_VIEW = "The person's words were weighed against the points argued on this path.";
/** What the stand-in rewrite writes (tests/support/gate-later-steps.ts). */
const REWRITE_LINE = "This path holds up for now.";
const REWRITE_VIEW = "The person's view was weighed against the follow-up debate.";

/** Each path's answer so far, as the stand-in writes it, but naming its path's title in its line and summary. */
const namedOutcomes = (request: GateRequest): GateOverride | null => {
  if (request.kind !== "PATH_OUTCOME_WRITER") return null;
  const field = (name: string) => materialOf(request).fields.find((entry) => entry.name === name)?.content;
  const title = (JSON.parse(field("path") ?? "{}") as { title?: string }).title ?? "?";
  const ref = (JSON.parse(field("points") ?? "[]") as { ref: string }[])[0]?.ref;
  const words = JSON.parse(field("own_words") ?? "[]") as string[];
  return { content: JSON.stringify({ line: outcomeLineOf(title), summary: `The arguing on path ${title} supported its answer.`, fate: "HELD_UP",
    what_changed: [{ text: `Path ${title} gained a reason.`, rests_on: ref === undefined ? [] : [ref] }],
    view: words.length > 0 ? { outcome: "NOT_SETTLED", scope: "PATH", reason: OUTCOME_VIEW } : null }) };
};

/** The parent's set as Start seals it: b1 and b3 menu paths, b2 the person's own path with their own words. */
function parentSet(runId: string): StoredStartPathSet {
  const menu = storedPathsOf(runId, 3);
  const question = "Do the jobs at Cernavodă outweigh the bills?";
  return Object.freeze({ ...menu, paths: Object.freeze(menu.paths.map((path) => path.pathId !== "b2" ? path : Object.freeze({
    ...path, author: "PERSON_OWN_VIEW" as const, question,
    viewpoints: Object.freeze([Object.freeze({ viewpointId: null, pickNo: null, title: null, question, own: true })]), ownWords: OWN_WORDS }))) });
}

type DigPick = Readonly<{ kind: "OWN_VIEW" | "NEEDS_MORE_WEB" | "HELPS_MAIN_QUESTION"; suggestionId: string | null; place: string;
  author: "AI_SUGGESTION" | "PERSON_OWN_VIEW"; text: string }>;
/** A dig's set as Start seals it: one path per pick, in order. */
function digSetOf(picks: readonly DigPick[], titleOf: (at: number) => string) {
  return (runId: string): StoredStartPathSet => Object.freeze({ runId, source: "DIG_PICKS", width: picks.length, chosenBy: "PERSON", carryOnToReport: false,
    menu: null, paths: Object.freeze(picks.map((pick, at) => {
      const viewpoint: StoredPathViewpoint = Object.freeze({ viewpointId: null, pickNo: at + 1, title: null, question: pick.text, own: pick.author !== "AI_SUGGESTION" });
      return Object.freeze({ pathId: `b${String(at + 1)}` as "b1", pathNo: at + 1, author: pick.author, title: titleOf(at), question: pick.text,
        viewpoints: Object.freeze([viewpoint]), ownWords: Object.freeze(pick.author === "AI_SUGGESTION" ? [] : [pick.text]) });
    })) });
}
/** The dig under b2: the person's own view, and one suggestion of the parent's. */
const B2_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "OWN_VIEW", suggestionId: null, place: "path:b2", author: "PERSON_OWN_VIEW", text: "The plant's jobs pay for the town's school." },
  { kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: "path:b2", author: "AI_SUGGESTION", text: "How many jobs does the plant keep?" }
]);
/** A dig of a path the person left out before Start: "+ N more", under the main question. */
const MORE_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "HELPS_MAIN_QUESTION", suggestionId: "more-kp07", place: "more-kp07", author: "AI_SUGGESTION", text: "Q7?" }
]);
/** Review of Task 55b: a second path left out before Start, dug while the reports and answer updates keep reading the investigation. */
const LATER_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "HELPS_MAIN_QUESTION", suggestionId: "more-kp08", place: "more-kp08", author: "AI_SUGGESTION", text: "Q8?" }
]);
/** Task 55e: a dig under the new path more-kp07 (the "+ N more" dig's own path b1): the person's own view there. */
const DEEPER_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "OWN_VIEW", suggestionId: null, place: "path:b1", author: "PERSON_OWN_VIEW", text: "Q7 matters most in the winter months." }
]);
/** Task 55e: a third path left out before Start, argued by a runner without the tree's hook, so only the sweep updates the answer. */
const SWEPT_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "HELPS_MAIN_QUESTION", suggestionId: "more-kp09", place: "more-kp09", author: "AI_SUGGESTION", text: "Q9?" }
]);
/** Review of Task 50c: a fourth path left out before Start, dug once the person's goal is in play. */
const GOAL_PICKS: readonly DigPick[] = Object.freeze([
  { kind: "HELPS_MAIN_QUESTION", suggestionId: "more-kp10", place: "more-kp10", author: "AI_SUGGESTION", text: "Q10?" }
]);
/** Review of Task 50c: step 2's lines with the answer the page marked as the answer to "What do you care about most?" (Task 50b). */
const CARE_LINES: PurposeLines = Object.freeze({ answers: [Object.freeze({ question: "What do you care about most?", answer: "Keeping bills low", cares: true as const })] });

/**
 * One path debate on the five companies (GLM by its writer ref beside the four, so the rewrite's Haiku and GLM are the run's own),
 * its set sealed as Start seals it; a dig first joins its parent's investigation and keeps its picks, as the asks route does at start.
 * The runner is composed with the path rewrite (and its climb) switched on.
 */
async function runOnFive(label: string, options: Readonly<{ count: number; set: (runId: string) => StoredStartPathSet;
  /** Task 55e: `level` is the dig's level (absent: 1, a dig of the first debate). */
  dig?: Readonly<{ parentRunId: string; positionRef: string | null; places: readonly string[]; picks: readonly DigPick[]; level?: number }>;
  /** Review of Task 55b: called once the dig joined and kept its picks, before any of it is argued. */
  beforeRun?: (debate: Readonly<{ runId: string }>) => Promise<void>;
  /** Task 55e: false composes the runner without the path rewrite and the tree's hooks (absent: with them, as main.ts on the preview). */
  pathRewrite?: boolean }>) {
  const source = options.dig === undefined ? "MENU" : "DIG_PICKS";
  const shape = pathsShapeOf("plus", options.count, source, FIVE_MAKER_REFS.length);
  const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "plus", answerLength: PATHS_SETTINGS.answerLength });
  const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: FIVE_MAKER_REFS.length, mapOpening: false });
  const debate = await harness.admittedRun(label, { panelRefs: FIVE_MAKER_REFS, depth: 1, shapeV2: shape, settings: PATHS_SETTINGS, length, engine,
    owner: own() });
  expect(await new PostgresStartPathsStore(database.pool).recordStartPaths(options.set(debate.runId))).toBe("RECORDED");
  if (options.dig !== undefined) {
    expect(await new PostgresInvestigationRepository(database.pool).join({ ownerRef: own().ownerRef, parentRunId: options.dig.parentRunId,
      childRunId: debate.runId, places: options.dig.places, mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: options.dig.level ?? 1 });
    expect(await new PostgresDigPicksRepository(database.pool).record({ ownerRef: own().ownerRef, runId: debate.runId,
      parentRunId: options.dig.parentRunId, positionRef: options.dig.positionRef, picks: options.dig.picks })).toBe("RECORDED");
  }
  await options.beforeRun?.(debate);
  const scripted = scriptedShapeAnswers(debate.question);
  const gates = await harness.startGates({}, { unbilled: [] }, (request, chat) => namedOutcomes(request) ?? scripted(request, chat));
  const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
    debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() }, pathRewrite: options.pathRewrite ?? true });
  await harness.completedRun(composed, debate, gates);
  return { debate, gates };
}

/** Task 55e: the root's main-answer versions, oldest first: each row's trigger, the run that triggered it, and its outcome. */
const versionsOf = (root: string) => q(database.pool, `SELECT trigger_kind, trigger_id::text AS trigger_id, trigger_run_id::text AS trigger_run_id, outcome
  FROM identity.main_answer_update WHERE run_id=$1 ORDER BY answer_seq`, root);

/** Task 55e: the root's main answer as serve hands it to the page, each version opened under the root's key. */
async function servedVersions(root: string) {
  const rows = (await new PostgresTreeUpdateRunnerRepository(database.pool).readMainAnswers(root)) ?? [];
  const opened: { row: (typeof rows)[number]; opened: unknown }[] = [];
  await withRunContentLease(database.pool, [root], async () => {
    for (const row of rows) {
      opened.push({ row, opened: row.content === null ? null
        : await decryptContentForRun<unknown>(database.pool, root, MAIN_ANSWER_UPDATE_CARRIER, row.update_id, row.content, null) });
    }
  });
  return serveMainAnswer(opened, false)?.history ?? [];
}

/** The answer update a dig's run started: the one REPORT_ANSWER whose material has digs to follow (a path run's own main answer has none). */
const answerUpdateOf = (gates: Readonly<{ requests: readonly GateRecord[] }>) =>
  gates.requests.find((request) => request.kind === "REPORT_ANSWER" && request.answer === "OK" && fieldOf(request, "follow_ups") !== "[]");

/** "Write my report" (closed already): the real closing over the real sources, Haiku and GLM scripted, the version opened as sealed. */
async function writeReport(root: string, investigationId: string) {
  const vendors = team();
  const contents = new Map<string, InvestigationReportContent>();
  const composed = composeInvestigationClose({ pool: database.pool,
    targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }],
    members: [{ provider: vendors.haiku.provider, providerRef: "ref-haiku", maker: "Anthropic" }, { provider: vendors.glm.provider, providerRef: "ref-glm", maker: "Z.AI" }],
    priceOf: () => null, reserveMicros: CLOSING_RESERVES, log: () => undefined });
  if (composed === undefined) throw new Error("test: no Haiku or no GLM for the closing");
  const settings = { ...composed, seal: async (rootRunId: string, reportId: string, content: InvestigationReportContent) => {
    contents.set(reportId, content);
    return composed.seal(rootRunId, reportId, content);
  } };
  const closing = (await composed.reports.readUnreported(100)).find((candidate) => candidate.investigationId === investigationId);
  expect(closing).toBeDefined();
  expect(await closeInvestigation(settings, closing!)).toBe("RECORDED");
  const read = (await new PostgresInvestigationReportRunnerRepository(database.pool).readOfRun(root))!;
  const row = read.reports.find((entry) => entry.report_version === closing!.reportVersion)!;
  expect(row.outcome).toBe("READY");
  const writer = vendors.haiku.requests.find((request) => fieldsOf(request.packet).has("answer_length"))!;
  return { closing: closing!, content: contents.get(row.report_id)!, writer: fieldsOf(writer.packet), read, vendors };
}

type FirstDebate = { paths: { ref: string; line: string; story_line?: string }[] };
const pathLines = (first: FirstDebate): string[][] => first.paths.map((path) => [path.ref, path.line]);

/** The parent path debate, argued once for the file, with its investigation open. */
let parentMade: Promise<Readonly<{ rootId: string; investigationId: string; outcomes: ReadonlyMap<string, PathOutcome> }>> | null = null;
const parentDebate = () => parentMade ??= (async () => {
  const { debate } = await runOnFive("v2-report-parent", { count: 3, set: parentSet });
  const investigationId = (await new PostgresInvestigationRepository(database.pool).open(own().ownerRef, debate.runId))!;
  return { rootId: debate.runId, investigationId, outcomes: await new PostgresPathResultsRepository(database.pool).readPathOutcomes(debate.runId) };
})();
const investigations = () => new PostgresInvestigationRepository(database.pool);
/** Task 55e: the "+ N more" dig of place more-kp07 (its run and its gates), once its case has run. */
let moreDig: Readonly<{ runId: string; gates: Readonly<{ requests: readonly GateRecord[] }> }> | null = null;
/** Opens the investigation again when a dig or a report closed it, then closes it: the next report version. */
async function closeAgain(investigationId: string): Promise<number> {
  await investigations().reopen(own().ownerRef, investigationId);
  const closed = await investigations().close(own().ownerRef, investigationId);
  expect(closed.outcome).toBe("CLOSED");
  return closed.reportVersion!;
}

describe("reports and answer updates on a path debate (Task 55b)", () => {
  it("Write my report on a v2 Plus debate completes: its dossier lists b1..b3 by their answers so far, the own words beside the outcome's view; the version keeps each path's id and trust word, and b2's own words and view", async () => {
    const parent = await parentDebate();
    expect(await closeAgain(parent.investigationId)).toBe(1);
    const report = await writeReport(parent.rootId, parent.investigationId);
    // The dossier: the paths the person chose, each by its answer so far.
    expect(pathLines(JSON.parse(report.writer.get("first_debate")!) as FirstDebate)).toEqual([
      ["A1", outcomeLineOf("T1")], ["A2", outcomeLineOf("T2")], ["A3", outcomeLineOf("T3")]]);
    expect(JSON.parse(report.writer.get("views")!)).toEqual([{ path: "A2", words: [...OWN_WORDS], marked: "PERSON",
      verdict: { outcome: "NOT_SETTLED", scope: "PATH", reason: OUTCOME_VIEW } }]);
    // The version: each first-level path's id and trust word, b2's own words and view.
    const first = report.content.paths.filter((path) => path.level === 0);
    expect(first.map((path) => [path.path_id, path.trust, path.line])).toEqual(["b1", "b2", "b3"].map((pathId, at) =>
      [pathId, parent.outcomes.get(pathId)?.trust ?? null, outcomeLineOf(`T${String(at + 1)}`)]));
    expect(first.map((path) => path.own ?? null)).toEqual([null,
      { own_words: [...OWN_WORDS], view: { outcome: "NOT_SETTLED", scope: "PATH", reason: OUTCOME_VIEW } }, null]);
    // Storage only: the dossier's fingerprint is the same with and without what each version stores.
    const input = (await postgresInvestigationCloseSources(database.pool).inputOf(report.closing, report.read))!.input;
    expect(input.first.paths.map((path) => path.stored?.pathId)).toEqual(["b1", "b2", "b3"]);
    const stripped: DossierInput = { ...input, first: { ...input.first, paths: input.first.paths.map(({ stored: _stored, ...rest }) => rest) } };
    const [withIt, without] = [buildInvestigationDossier(input), buildInvestigationDossier(stripped)];
    if (withIt.kind !== "BUILT" || without.kind !== "BUILT") throw new Error("test: the dossier did not fit");
    expect(withIt.fingerprint).toBe(without.fingerprint);
    expect(dossierFieldsOf(withIt)).toEqual(dossierFieldsOf(without));
  }, 1_800_000);

  it("a dig under b2 rewrites b2 from b2's answer so far, then the main answer updates over every path; the next version's b2 view is the dig's", async () => {
    const parent = await parentDebate();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const dig = await runOnFive("v2-report-dig-b2", { count: 2, set: digSetOf(B2_PICKS, (at) => `D${String(at + 1)}`),
      dig: { parentRunId: parent.rootId, positionRef: "b2", places: ["path:b2"], picks: B2_PICKS } });
    const digId = dig.debate.runId;
    // The rewrite was written on b2's answer so far, not on the story's line.
    const writers = dig.gates.requests.filter((request) => request.kind === "PATH_REWRITE_WRITER" && request.answer === "OK");
    expect(writers.length).toBeGreaterThan(0);
    expect((JSON.parse(fieldOf(writers[0]!, "path") ?? "{}") as { line?: string }).line).toBe(outcomeLineOf("T2"));
    // Then the main answer updated, once, on the dig's rewrite, over every path: b2 at its new text, its answer so far beside it.
    const updates = await q(database.pool, `SELECT trigger_kind, trigger_run_id::text AS trigger_run_id, outcome FROM identity.main_answer_update
      WHERE run_id=$1 ORDER BY answer_seq`, parent.rootId);
    expect(updates).toEqual([{ trigger_kind: "PATH_REWRITE", trigger_run_id: digId.toLowerCase(), outcome: "READY" }]);
    const update = dig.gates.requests.find((request) => request.kind === "REPORT_ANSWER" && request.answer === "OK" && fieldOf(request, "follow_ups") !== "[]");
    expect(update).toBeDefined();
    const first = JSON.parse(fieldOf(update!, "first_debate")!) as FirstDebate;
    expect(pathLines(first)).toEqual([["A1", outcomeLineOf("T1")], ["A2", REWRITE_LINE], ["A3", outcomeLineOf("T3")]]);
    expect(first.paths[1]!.story_line).toBe(outcomeLineOf("T2"));
    // The next version: b2's view is the dig's.
    expect(await closeAgain(parent.investigationId)).toBeGreaterThan(1);
    const report = await writeReport(parent.rootId, parent.investigationId);
    const b2 = report.content.paths.find((path) => path.path_id === "b2")!;
    expect(b2).toMatchObject({ level: 0, line: REWRITE_LINE, own: { own_words: [...OWN_WORDS], view: { outcome: "NOT_SETTLED", scope: "PATH", reason: REWRITE_VIEW } } });
  }, 1_800_000);

  it("a dig of a path left out before Start (place more-kp07) is a new first-level path: the answer updates read it, and the next version lists it", async () => {
    const parent = await parentDebate();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const more = await runOnFive("v2-report-more", { count: 1, set: digSetOf(MORE_PICKS, () => "T7"),
      dig: { parentRunId: parent.rootId, positionRef: null, places: ["more-kp07"], picks: MORE_PICKS } });
    const moreId = more.debate.runId;
    moreDig = Object.freeze({ runId: moreId, gates: more.gates });
    // Under the main question: no rewrite, its own story.
    expect(await q(database.pool, `SELECT run_id FROM identity.path_rewrite_turn WHERE run_id=$1`, moreId)).toEqual([]);
    expect((await q(database.pool, `SELECT story_id FROM serve.answer_story WHERE run_id=$1`, moreId)).length).toBeGreaterThan(0);
    // What every answer update and report reads: the chosen paths, then the new one, by its place; no card for it.
    const read = (await postgresInvestigationCloseSources(database.pool).investigationInputOf(parent.rootId, null))!.input;
    expect(read.first.paths.map((path) => [path.ref, path.current?.line ?? path.storyLine])).toEqual([
      ["b1", outcomeLineOf("T1")], ["b2", REWRITE_LINE], ["b3", outcomeLineOf("T3")], ["more-kp07", outcomeLineOf("T7")]]);
    expect(read.digs.map((dig) => dig.runId.toLowerCase())).not.toContain(moreId.toLowerCase());
    // The next version lists it as a first-level path (it has no path id of the debate's own).
    expect(await closeAgain(parent.investigationId)).toBeGreaterThan(2);
    const report = await writeReport(parent.rootId, parent.investigationId);
    expect((JSON.parse(report.writer.get("first_debate")!) as FirstDebate).paths.map((path) => path.line)).toContain(outcomeLineOf("T7"));
    const added = report.content.paths.find((path) => path.line === outcomeLineOf("T7"));
    expect(added).toMatchObject({ level: 0 });
    expect(added?.path_id).toBeUndefined();
  }, 1_800_000);

  /**
   * Task 55e (spec §4.4, held by Task 55b as `it.fails`): a dig under the main question writes no rewrite, so nothing climbs; once its
   * story is written the runner updates the main answer with the dig itself as the trigger (0164's PATH_ADDED), over every path, the new
   * one named by its place. One version per trigger.
   */
  it("the dig of more-kp07 records a main-answer update", async () => {
    const parent = await parentDebate();
    expect(moreDig).not.toBeNull();
    const moreId = moreDig!.runId.toLowerCase();
    // 0164: the CHECK on what made a version lists exactly three kinds.
    const [check] = await q(database.pool, `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'identity.main_answer_update'::regclass AND conname = $1`, "main_answer_update_trigger_check");
    expect([...String(check?.definition).matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1])).toEqual(["PATH_REWRITE", "PATH_UPDATE", "PATH_ADDED"]);
    const updates = await versionsOf(parent.rootId);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ trigger_kind: "PATH_ADDED", trigger_id: moreId, trigger_run_id: moreId, outcome: "READY" });
    // As the page reads it: the dig's version is the newest, named by the new path.
    expect((await servedVersions(parent.rootId)).map((version) => [version.version, version.trigger, version.position_ref])).toEqual([
      [1, "PATH_REWRITE", "b2"], [2, "PATH_ADDED", "more-kp07"]]);
    // Written over every path: the chosen ones at their newest text, then the new one by its answer so far.
    const update = answerUpdateOf(moreDig!.gates);
    expect(update).toBeDefined();
    expect(pathLines(JSON.parse(fieldOf(update!, "first_debate")!) as FirstDebate)).toEqual([
      ["A1", outcomeLineOf("T1")], ["A2", REWRITE_LINE], ["A3", outcomeLineOf("T3")], ["A4", outcomeLineOf("T7")]]);
  });

  it("an R22 debate's dossier is unchanged: its paths by the story's own ids, nothing stored beside them, no path id, trust word or own words in its version", async () => {
    const settings = PATHS_SETTINGS;
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "plus", answerLength: settings.answerLength });
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL_REFS.length, mapOpening: true });
    const debate = await harness.admittedRun("v2-report-r22", { panelRefs: PANEL_REFS, depth: 1,
      shape: shapeForTest({ plan: "plus", makers: PANEL_REFS.length, settings }), settings, length, engine, owner: own() });
    const gates = await harness.startGates({}, { unbilled: [] }, scriptedShapeAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
      debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() }, pathRewrite: true });
    await harness.completedRun(composed, debate, gates);
    expect(await new PostgresStartPathsStore(database.pool).readStartPathIds(debate.runId)).toBeNull();
    expect(await investigations().open(own().ownerRef, debate.runId)).not.toBeNull();
    const input = (await postgresInvestigationCloseSources(database.pool).investigationInputOf(debate.runId, null))!.input;
    // The story's own paths, by its ids, with exactly R22's members.
    const row = (await database.pool.query<{ story_id: string; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
      `SELECT story_id::text AS story_id, content, content_ciphertext FROM serve.answer_story WHERE run_id=$1 ORDER BY answer_version DESC LIMIT 1`,
      [debate.runId])).rows[0]!;
    const story = StoryBodySchema.parse((await withRunContentLease(database.pool, [debate.runId], () => decryptContentForRun<unknown>(
      database.pool, debate.runId, "serve.answer_story", row.story_id, row.content_ciphertext, row.content)) as { body: unknown }).body);
    const seen = new Map<string, number>();
    expect(input.first.paths.map((path) => path.ref)).toEqual(story.short.paths.map((path) => {
      const times = (seen.get(path.position_ref) ?? 0) + 1;
      seen.set(path.position_ref, times);
      return times === 1 ? path.position_ref : `${path.position_ref}#${String(times)}`;
    }));
    for (const path of input.first.paths) expect(Object.keys(path)).toEqual(["ref", "storyLine", "storyFate", "points", "sources", "current"]);
    const built = buildInvestigationDossier(input);
    if (built.kind !== "BUILT") throw new Error("test: the dossier did not fit");
    for (const path of built.paths) expect(Object.keys(path).filter((key) => ["path_id", "trust", "own"].includes(key))).toEqual([]);
  }, 1_800_000);

  /**
   * Review of Task 55b (last in the file: its dig waits, admitted, while the first read runs). A "+ N more" dig still being argued has no
   * path with its answer so far: none of its points, which no AI has checked yet, are weighed; it stays a card, picks only, as a running
   * dig is on R22. Once every path of it has its answer so far it is a new first-level path. The runner keeps one reader for its whole
   * life (main.ts composes it once), so the second read, on the same reader, must see the dig's paths as they are now.
   */
  it("a '+ N more' dig still being argued stays a card until each of its paths has its answer so far, then it is a first-level path, on the same reader", async () => {
    const parent = await parentDebate();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const sources = postgresInvestigationCloseSources(database.pool);
    const readNow = async () => {
      const read = (await sources.investigationInputOf(parent.rootId, null))!.input;
      return { paths: read.first.paths.map((path) => [path.ref, path.current?.line ?? path.storyLine]),
        cards: read.digs.map((dig) => dig.runId.toLowerCase()) };
    };
    // Review of Task 55e: the tree's own read (path-climb-sources.ts addedPathOf, which the hook and the sweep both ask) follows the same
    // rule, so nothing buys the main-answer update of a dig whose paths are still argued (the sweep lists a dig once one path's answer so
    // far stood still, while another may still be argued); once each has its answer so far, it is the new path, named by its place.
    const tree = postgresTreeUpdatePorts(database.pool);
    const addedNow = async (runId: string) => {
      const added = await tree.addedPathOf!(runId, null);
      return added === null ? null : { ...added, rootRunId: added.rootRunId.toLowerCase() };
    };
    let laterId = "";
    await runOnFive("v2-report-more-later", { count: 1, set: digSetOf(LATER_PICKS, () => "T8"),
      dig: { parentRunId: parent.rootId, positionRef: null, places: ["more-kp08"], picks: LATER_PICKS },
      beforeRun: async (debate) => {
        laterId = debate.runId.toLowerCase();
        const before = await readNow();
        expect(before.paths.map(([ref]) => ref)).toEqual(["b1", "b2", "b3", "more-kp07"]);
        expect(before.cards).toContain(laterId);
        expect(await addedNow(laterId)).toBeNull();
      } });
    expect(laterId).not.toBe("");
    const after = await readNow();
    expect(after.paths).toEqual([["b1", outcomeLineOf("T1")], ["b2", REWRITE_LINE], ["b3", outcomeLineOf("T3")], ["more-kp07", outcomeLineOf("T7")],
      ["more-kp08", outcomeLineOf("T8")]]);
    expect(after.cards).not.toContain(laterId);
    expect(await addedNow(laterId)).toEqual({ rootRunId: parent.rootId.toLowerCase(), positionRef: "more-kp08", free: false });
  }, 1_800_000);

  /**
   * Task 55e (spec §4.4): the path a "+ N more" dig added is a first-level path, so a dig under it is a change one level down: its rewrite
   * of the new path climbs to the main answer (it used to stop at PATH_CLIMB_UNDER_THE_QUESTION). One more version, on that rewrite.
   */
  it("a dig under the new path more-kp07 climbs to the main answer: one more version, on its rewrite, named by the new path", async () => {
    const parent = await parentDebate();
    expect(moreDig).not.toBeNull();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const before = await versionsOf(parent.rootId);
    const deeper = await runOnFive("v2-report-more-deeper", { count: 1, set: digSetOf(DEEPER_PICKS, () => "E1"),
      dig: { parentRunId: moreDig!.runId, positionRef: "b1", places: ["path:b1"], picks: DEEPER_PICKS, level: 2 } });
    const deeperId = deeper.debate.runId.toLowerCase();
    // The new path was rewritten from its answer so far.
    const writers = deeper.gates.requests.filter((request) => request.kind === "PATH_REWRITE_WRITER" && request.answer === "OK");
    expect(writers.length).toBeGreaterThan(0);
    expect((JSON.parse(fieldOf(writers[0]!, "path") ?? "{}") as { line?: string }).line).toBe(outcomeLineOf("T7"));
    // Then the main answer updated once more, on that rewrite (a first-level path's change), named by the new path.
    const after = await versionsOf(parent.rootId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map(({ trigger_kind, trigger_run_id, outcome }) => ({ trigger_kind, trigger_run_id, outcome }))).toEqual([
      { trigger_kind: "PATH_REWRITE", trigger_run_id: deeperId, outcome: "READY" }]);
    expect((await servedVersions(parent.rootId)).at(-1)).toMatchObject({ version: after.length, trigger: "PATH_REWRITE", position_ref: "more-kp07" });
    // Written over every path, the new one at its rewritten text.
    const update = answerUpdateOf(deeper.gates);
    expect(update).toBeDefined();
    expect(pathLines(JSON.parse(fieldOf(update!, "first_debate")!) as FirstDebate)).toEqual([["A1", outcomeLineOf("T1")], ["A2", REWRITE_LINE],
      ["A3", outcomeLineOf("T3")], ["A4", REWRITE_LINE], ["A5", outcomeLineOf("T8")]]);
  }, 1_800_000);

  /**
   * Task 55e: an update left undone (here: a runner composed without the tree's hook) is the tree's sweep's. It lists the "+ N more" dig
   * that has no version yet, though the dig made no rewrite, climb or update call, writes its version once, and lists it no more; a
   * second pass buys nothing.
   */
  it("the sweep writes the update a runner left undone: a '+ N more' dig with no version yet is listed, and gets its version once", async () => {
    const parent = await parentDebate();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const swept = await runOnFive("v2-report-more-swept", { count: 1, set: digSetOf(SWEPT_PICKS, () => "T9"), pathRewrite: false,
      dig: { parentRunId: parent.rootId, positionRef: null, places: ["more-kp09"], picks: SWEPT_PICKS } });
    const sweptId = swept.debate.runId.toLowerCase();
    const before = await versionsOf(parent.rootId);
    expect(before.map((row) => row.trigger_run_id)).not.toContain(sweptId);
    // What the sweep lists once the dig stood still past the sweep's wait: that dig, though it made no rewrite, climb or update call.
    const now = Date.now() + TREE_SWEEP_DEFAULTS.staleMs + 60_000;
    const listedNow = async () => (await readRecentTreeDigs(database.pool, new Date(now - TREE_SWEEP_DEFAULTS.windowMs),
      new Date(now - TREE_SWEEP_DEFAULTS.staleMs), TREE_SWEEP_DEFAULTS.limit)).map((runId) => runId.toLowerCase());
    expect(await q(database.pool, `SELECT entry.call_site_key FROM ledger.ledger_entry AS entry WHERE entry.run_id=$1 AND (entry.call_site_key LIKE 'PATH\\_REWRITE:%'
      OR entry.call_site_key LIKE 'PATH\\_CLIMB:%' OR entry.call_site_key LIKE 'ANSWER\\_UPDATE:%')`, sweptId)).toEqual([]);
    expect(await listedNow()).toContain(sweptId);
    // The sweep as main.ts composes it (Haiku writes, GLM checks; scripted).
    const vendors = team();
    const composed = composePathRewrite({ pool: database.pool,
      targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }],
      members: [{ provider: vendors.haiku.provider, providerRef: "ref-haiku", maker: "Anthropic" }, { provider: vendors.glm.provider, providerRef: "ref-glm", maker: "Z.AI" }],
      log: () => undefined });
    if (composed === undefined) throw new Error("test: no Haiku or no GLM for the tree's sweep");
    const sweep = { ...composed.treeSweep, now: () => new Date(now) };
    expect((await sweepTreeUpdates(sweep)).listed).toBeGreaterThan(0);
    const after = await versionsOf(parent.rootId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([{ trigger_kind: "PATH_ADDED", trigger_id: sweptId, trigger_run_id: sweptId, outcome: "READY" }]);
    expect((await servedVersions(parent.rootId)).at(-1)).toMatchObject({ trigger: "PATH_ADDED", position_ref: "more-kp09" });
    // Once its version is written it is not listed again (its update's calls went to the scripted vendors here, never the ledger).
    expect(await listedNow()).not.toContain(sweptId);
    // Only that dig's update was bought; a second pass buys nothing and writes nothing.
    expect(vendors.haiku.requests.map((request) => request.runId?.toLowerCase())).toEqual(vendors.haiku.requests.map(() => sweptId));
    const calls = vendors.haiku.requests.length + vendors.glm.requests.length;
    await sweepTreeUpdates(sweep);
    expect(vendors.haiku.requests.length + vendors.glm.requests.length).toBe(calls);
    expect(await versionsOf(parent.rootId)).toEqual(after);
  }, 1_800_000);

  /**
   * Review of Task 50c (the builder's coverage gap 4: the read of the root's mark was proven only by a source scan). Over the real database:
   * a care mark on a dig's own purpose lines (copies, Task 35) is not read; the ROOT's is. Then the main-answer update the dig causes (the
   * sweep's, as main.ts composes it) asks the draft report.answer.later.v5 checked by report.answer-check.v4, and so does the next report
   * version, its story and the story's check as today. The care answer reaches the AIs as words only, never its mark. LAST in the file:
   * from here on the parent states a goal.
   */
  it("a root whose purpose lines carry the care mark: the update a dig causes and the next report ask report.answer.later.v5, checked by report.answer-check.v4", async () => {
    const parent = await parentDebate();
    await investigations().reopen(own().ownerRef, parent.investigationId);
    const goal = await runOnFive("v2-report-goal", { count: 1, set: digSetOf(GOAL_PICKS, () => "T10"), pathRewrite: false,
      dig: { parentRunId: parent.rootId, positionRef: null, places: ["more-kp10"], picks: GOAL_PICKS } });
    const goalId = goal.debate.runId.toLowerCase();
    const lines = postgresPurposeLines(database.pool);
    const tree = postgresTreeUpdatePorts(database.pool);
    // The dig's own lines are copies: a mark there alone is not read.
    expect(await lines.record(own().ownerRef, goalId, CARE_LINES)).toBe("RECORDED");
    expect(await tree.answerInputOf(parent.rootId, null)).not.toHaveProperty("goalStated");
    // The root's lines with the mark: read, by the tree's reader and the closing's alike; the care answer is in the question's words only.
    expect(await lines.record(own().ownerRef, parent.rootId, CARE_LINES)).toBe("RECORDED");
    const read = (await tree.answerInputOf(parent.rootId, null))!;
    expect(read.goalStated).toBe(true);
    expect(read.input.question.purpose).toContain("Keeping bills low");
    expect(JSON.stringify(read.input)).not.toContain("\"cares\"");
    // The update the dig causes, as the sweep writes it (Haiku writes, GLM checks; scripted): a later version (versions are stored already).
    const before = await versionsOf(parent.rootId);
    expect(before.length).toBeGreaterThan(0);
    const now = Date.now() + TREE_SWEEP_DEFAULTS.staleMs + 60_000;
    const update = team();
    const composed = composePathRewrite({ pool: database.pool,
      targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }],
      members: [{ provider: update.haiku.provider, providerRef: "ref-haiku", maker: "Anthropic" }, { provider: update.glm.provider, providerRef: "ref-glm", maker: "Z.AI" }],
      log: () => undefined });
    if (composed === undefined) throw new Error("test: no Haiku or no GLM for the tree's sweep");
    await sweepTreeUpdates({ ...composed.treeSweep, now: () => new Date(now) });
    expect(update.haiku.requests.map((request) => [request.runId?.toLowerCase(), request.callSiteKey, contractOf(request.packet)]))
      .toEqual([[goalId, "ANSWER_UPDATE:ANSWER:1", "report.answer.later.v5"]]);
    expect(update.glm.requests.map((request) => [request.callSiteKey, contractOf(request.packet)])).toEqual([["ANSWER_UPDATE:ANSWER_CHECK:1", "report.answer-check.v4"]]);
    expect(fieldsOf(update.haiku.requests[0]!.packet).has("earlier_report")).toBe(true);
    const after = await versionsOf(parent.rootId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([{ trigger_kind: "PATH_ADDED", trigger_id: goalId, trigger_run_id: goalId, outcome: "READY" }]);
    // The next report version: the answer asks the goal drafts, the story and its check are today's.
    expect(await closeAgain(parent.investigationId)).toBeGreaterThan(1);
    const report = await writeReport(parent.rootId, parent.investigationId);
    expect(report.vendors.haiku.requests.map((request) => contractOf(request.packet))).toEqual(["report.answer.later.v5", "report.story.v1"]);
    expect(report.vendors.glm.requests.map((request) => contractOf(request.packet))).toEqual(["report.answer-check.v4", "report.story-check.v1"]);
    // Every AI read the care answer's words, and none read its mark.
    for (const request of [update.haiku, update.glm, report.vendors.haiku, report.vendors.glm].flatMap((vendor) => vendor.requests)) {
      const contents = [...fieldsOf(request.packet).values()];
      expect(contents.some((content) => content.includes("Keeping bills low")), request.callSiteKey).toBe(true);
      for (const content of contents) expect(content, request.callSiteKey).not.toContain("\"cares\"");
    }
  }, 1_800_000);
});
