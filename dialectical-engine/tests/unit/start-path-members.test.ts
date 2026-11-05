// tests/unit/start-path-members.test.ts
// V4 start step, Task 92a (owner, 4 Nov, page "AI Instructions, Batch 1"; spec 2026-11-03 §6 item 3, §4.3): A MERGED PATH OF ANY SIZE.
// "Of at most four" is gone from both merges, so a group the AI makes by following the owner's words is taken whole, never refused and
// never broken up: the menu, the chosen path, the combine, the answer's branches and the public snapshot hold up to every suggestion one
// merge is given (START_STEP_LIMITS.pathMembersMax = viewpointsMax, 54), a technical bound no reply that follows the words can pass. The
// person's own words and a dig's picks stay at most 4 in a path, counted together, as every member counted against 4 before. The root
// writer's material keeps its cut at the new size. Every question, path and figure here is made up.
import { describe, expect, it } from "vitest";
import {
  ANSWER_BRANCH_LIMITS, AnswerBranchesSchema, PublicBranchesSchema, START_STEP_LIMITS, StartCombineRequestSchema, StartMenuPathSchema,
  StartMenuSchema, StartPathChoiceSchema, publicBranchesOf, type StartListViewpoint, type StartMenu
} from "@debateai/contract";
import { TypedDomainError, replyLanguageExpectation, type PathId } from "@debateai/kernel";
import { startCombineSpec, startMergeLateSpec, startMergeSpec, type StartSpecContext } from "@debateai/map";
import { PATH_ROOT_LIMITS, pathRootLegMaterial, type PathsRunPath } from "../../apps/runner/src/path-plan.js";
import { branchFixture } from "../support/branchesFixture.js";

const Q = "Should Harbour Town build a second ferry pier before next summer?";
const CTX_EN: StartSpecContext = { questionLine: Q, languageName: "English", languageTag: "und", replyLanguage: replyLanguageExpectation(Q), readingLevel: null };
const REF = "eyJhIjoxfQ.c2lnbmF0dXJl";
const MENU_ID = "A".repeat(22);
const OWN_WORDS_AND_PICKS = "a path holds at most 4 own words and picks";

/** The viewpoint of list `list`, item `item`: pt<list><item>, every one of them its own idea. */
const viewpointOf = (list: number, item: number): StartListViewpoint => ({ viewpoint_id: `pt${String(list)}${String(item)}`,
  title: `Pier idea ${String(list)}${String(item)}`, question: `Would pier idea ${String(list)}${String(item)} change the answer?`,
  why: "It could change whether the pier is worth it.", angle_id: "g1" });
/** Every suggestion one merge can be given: 9 lists of 6, pt11..pt96. */
const ALL: readonly StartListViewpoint[] = Array.from({ length: START_STEP_LIMITS.viewpointsMax }, (_, at) => viewpointOf(Math.floor(at / 6) + 1, (at % 6) + 1));
const IDS = ALL.map((one) => one.viewpoint_id);
const WORDS = { title: "Everything the pier touches", question: "What would the pier change across the town's whole year?" };

/** A menu of every viewpoint, put together by the merge into one path. */
const WHOLE_MENU = {
  menu_id: MENU_ID, revision: 1, language: { code: "en", name: "English" }, angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: ALL.map((one) => ({ ...one, repeat_ids: [] })), repeats: [],
  paths: [{ path_ref: "kp01", ...WORDS, viewpoint_ids: IDS, put_together: true, is_new: false }], cards: [], suggestions: []
} as StartMenu;

const issuesOf = (parsed: { success: boolean; error?: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } }) =>
  parsed.success ? "accepted" : parsed.error!.issues.map((issue) => ({ code: issue.code, path: [...issue.path] }));
const messagesOf = (parsed: { success: boolean; error?: { issues: readonly { message: string }[] } }) =>
  parsed.success ? "accepted" : parsed.error!.issues.map((issue) => issue.message);

const viewpointMembers = (count: number) => IDS.slice(0, count).map((viewpoint_id) => ({ viewpoint_id }));
const ownMembers = (count: number) => Array.from({ length: count }, (_, at) => ({ own_text: `My own worry number ${String(at + 1)} about the pier.` }));
const pickMembers = (count: number) => Array.from({ length: count }, (_, at) => ({ pick_no: at + 1 }));
const chosen = (members: readonly unknown[]) => ({ ...WORDS, members });

const combineViewpoints = (count: number) => ALL.slice(0, count).map((one) => ({ viewpoint_id: one.viewpoint_id, pick_no: null, title: one.title,
  question: one.question }));
const combineOwn = (count: number) => Array.from({ length: count }, (_, at) => ({ viewpoint_id: null, pick_no: null, title: null,
  question: `My own worry number ${String(at + 1)} about the pier?` }));
const combine = (members: readonly unknown[]) => ({ context: { kind: "MENU", question_line: Q, check_ref: REF, menu_id: MENU_ID },
  reading_level: "plain", members });

describe("a merged path of any size (Task 92a)", () => {
  it("a path's members may number every suggestion one merge is given", () => {
    expect(START_STEP_LIMITS.pathMembersMax).toBe(START_STEP_LIMITS.viewpointsMax);
    expect(ANSWER_BRANCH_LIMITS.viewpointsMax).toBe(START_STEP_LIMITS.pathMembersMax);
    expect(START_STEP_LIMITS.ownWordsAndPicksPerPathMax).toBe(4);
    // What the person puts together on step 2 stays four (spec §2 item 5; Task 92c asks the owner).
    expect(START_STEP_LIMITS.viewpointsPerPathMax).toBe(4);
  });

  it("a menu path holds every viewpoint of its menu, not one more", () => {
    expect(issuesOf(StartMenuSchema.safeParse(WHOLE_MENU))).toBe("accepted");
    expect(issuesOf(StartMenuPathSchema.safeParse({ ...WHOLE_MENU.paths[0]!, viewpoint_ids: [...IDS, "cd1"] })))
      .toEqual([{ code: "too_big", path: ["viewpoint_ids"] }]);
  });

  it("a chosen path takes a merged group whole, with at most 4 own words and picks", () => {
    expect(messagesOf(StartPathChoiceSchema.safeParse(chosen(viewpointMembers(54))))).toBe("accepted");
    expect(messagesOf(StartPathChoiceSchema.safeParse(chosen([...viewpointMembers(50), ...ownMembers(4)])))).toBe("accepted");
    expect(messagesOf(StartPathChoiceSchema.safeParse(chosen(ownMembers(5))))).toEqual([OWN_WORDS_AND_PICKS]);
    // A dig's path: its picks and the person's own words count together.
    expect(messagesOf(StartPathChoiceSchema.safeParse(chosen([...pickMembers(3), ...ownMembers(2)])))).toEqual([OWN_WORDS_AND_PICKS]);
    expect(issuesOf(StartPathChoiceSchema.safeParse(chosen([...viewpointMembers(54), { viewpoint_id: "cd1" }]))))
      .toEqual([{ code: "too_big", path: ["members"] }]);
  });

  it("the AI combine takes up to 54 points, at most 4 of them own words or picks", () => {
    expect(messagesOf(StartCombineRequestSchema.safeParse(combine(combineViewpoints(5))))).toBe("accepted");
    expect(messagesOf(StartCombineRequestSchema.safeParse(combine(combineViewpoints(54))))).toBe("accepted");
    expect(issuesOf(StartCombineRequestSchema.safeParse(combine([...combineViewpoints(54), ...combineOwn(1)]))))
      .toEqual([{ code: "too_big", path: ["members"] }]);
    expect(messagesOf(StartCombineRequestSchema.safeParse(combine(combineOwn(5))))).toEqual([OWN_WORDS_AND_PICKS]);
    expect(messagesOf(StartCombineRequestSchema.safeParse(combine([...combineViewpoints(50), ...combineOwn(4)])))).toBe("accepted");
  });

  it("the merge keeps every group whole, up to every suggestion it was given", () => {
    const whole = startMergeSpec(CTX_EN, { said: [], viewpoints: ALL }).read(JSON.stringify({ repeats: [], paths: [{ ids: IDS, ...WORDS }],
      cards: [], suggestions: [] }));
    expect(whole.paths).toEqual([{ ids: IDS, ...WORDS }]);
    const prior: StartMenu = {
      menu_id: MENU_ID, revision: 1, language: { code: "en", name: "English" }, angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
      viewpoints: [{ ...viewpointOf(1, 1), repeat_ids: [] }, { ...viewpointOf(1, 2), repeat_ids: [] }], repeats: [],
      paths: [{ path_ref: "kp00", title: "Pier idea 11", question: "Would pier idea 11 change the answer?", viewpoint_ids: ["pt11"], put_together: false, is_new: false },
        { path_ref: "kp01", title: "Pier idea 12", question: "Would pier idea 12 change the answer?", viewpoint_ids: ["pt12"], put_together: false, is_new: false }],
      cards: [], suggestions: []
    };
    const fresh = [1, 2, 3, 4, 5].map((item) => viewpointOf(2, item));
    const late = startMergeLateSpec(CTX_EN, { said: [], prior, viewpoints: fresh }).read(JSON.stringify({ repeats: [],
      paths: [{ ids: fresh.map((one) => one.viewpoint_id), ...WORDS }], fits: [] }));
    expect(late.paths).toEqual([{ ids: ["pt21", "pt22", "pt23", "pt24", "pt25"], ...WORDS }]);
  });

  it("a combine is given 2 to 54 points", () => {
    const points = (count: number) => ALL.slice(0, count).map((one) => ({ title: one.title, question: one.question }));
    expect(startCombineSpec(CTX_EN, points(5)).step).toBe("START_COMBINE");
    expect(startCombineSpec(CTX_EN, points(54)).step).toBe("START_COMBINE");
    const tooMany = [...points(54), { title: null, question: "My own worry about the pier?" }];
    let refused: unknown = null;
    try { startCombineSpec(CTX_EN, tooMany); } catch (error) { refused = error; }
    expect(refused).toBeInstanceOf(TypedDomainError);
    expect((refused as TypedDomainError).code).toBe("START_COMBINE_INVALID");
    expect((refused as TypedDomainError).message).toContain("a combine is given 2 to 54 points");
  });

  it("a path debate's branch lists every viewpoint of its path", () => {
    const viewpoints = (count: number) => Array.from({ length: count }, (_, at) => ({ title: `Viewpoint ${String(at + 1)}`,
      question: `What does viewpoint ${String(at + 1)} add?`, own: false }));
    const branches = (count: number) => ({ source: "MENU", width: 5, paths: [{ ...branchFixture(1), viewpoints: viewpoints(count) }], more: [],
      also_raised: [], main_trust: "SURE_FOR_CASE", carry_on_to_report: false });
    const six = AnswerBranchesSchema.safeParse(branches(6));
    expect(messagesOf(six)).toBe("accepted");
    expect(PublicBranchesSchema.parse(publicBranchesOf(six.data!)).paths[0]!.viewpoints).toHaveLength(6);
    expect(messagesOf(AnswerBranchesSchema.safeParse(branches(54)))).toBe("accepted");
    expect(AnswerBranchesSchema.safeParse(branches(55)).success).toBe(false);
  });

  it("the root writer's material stays within its limit at 54 viewpoints", () => {
    // A guard (Task 46's cut, at the new size): every viewpoint still reaches the writer, each line cut to fit.
    const C = "中";
    const path: PathsRunPath = { pathNo: 1, pathId: "b1" as PathId, title: C.repeat(START_STEP_LIMITS.pathTitleMaxChars),
      question: C.repeat(START_STEP_LIMITS.pathQuestionMaxChars), ownWords: [],
      viewpoints: IDS.map((viewpointId) => ({ viewpointId, pickNo: null, title: C.repeat(START_STEP_LIMITS.titleMaxChars),
        question: C.repeat(START_STEP_LIMITS.questionMaxChars), own: false })),
      gapPoints: Array.from({ length: PATH_ROOT_LIMITS.gapPointsPerPathMax }, () => C.repeat(400)) };
    const material = pathRootLegMaterial(path);
    expect(material.pathTitle.length + material.pathQuestion.length + material.viewpoints.length + material.pointsRaised.length)
      .toBeLessThanOrEqual(PATH_ROOT_LIMITS.materialMaxChars);
    expect(material.viewpoints.split("\n")).toHaveLength(IDS.length);
  });
});
