/**
 * V4 start step, Task 33 (spec 2026-11-03 §4.2; read-d2, choose-d2; owner answer Q8 of 4 Nov): VERIFICATION AT START
 * AND THE AUTHOR RULE. `POST /v1/asks` carries the paths the person chose with the references signed at Next. The
 * verifier reads them back from the signed menu (or a dig's picks), checks every reference through Task 26b's
 * StartRefCheck, enforces How wide and Free's 3, and records who wrote each path: an AI's suggestion, an AI's combined
 * question, the person's edit or the person's own view.
 *
 * read-d2: the person may change the question on step 2 (answers flown in, words typed). Nothing is read again and the
 * paths are kept: the references are verified without comparing the question, all from one reading, and the verified set
 * says the question was edited, so the whole line is checked once at Start (Task 36). Answer Q8 ("Your rule, no time
 * limit"): nothing expires, and paths signed under an older settings version are kept as signed; only fewer allowed
 * paths are refused (START_PATHS_NARROWED) so the page can ask to combine or remove. A dig's picks become one path each.
 * Every question, path, pick and figure here is made up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AskRequestSchema, StartListSchema, StartMenuSchema, type AskRequest, type DigPick, type DigSuggestion, type SignedStartList, type SignedStartMenu,
  type StartList, type StartMenu, type StartPathChoice, type StartPaths
} from "@debateai/contract";
import { digPathPlanOf, digStartPaths } from "../../apps/ui/lib/v4/digPathPlan.js";
import { suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import { TypedDomainError, joinedPathWords } from "@debateai/kernel";
import type { DebateShapePlanKey, DebateShapeWidths } from "@debateai/register";
import { pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import type { DigPickAuthor } from "../../apps/api/src/dig-admission.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import {
  digPathTitleOf, storedSetOf, verifyStartCheckAtAsk, verifyStartPathsAtAsk
} from "../../apps/api/src/start-paths-at-ask.js";
import {
  newStartStepKey, signStartCheck, signStartCombine, signStartList, signStartMenu, startMembersHash, type StartStepKey
} from "../../apps/api/src/start-step/signing.js";

const KEY = newStartStepKey();
const NOW = new Date("2026-11-04T10:00:00.000Z");
const FORTY_DAYS = 40 * 86_400_000;
const OWNER = "owner:44444444-4444-4444-8444-444444444444";
const OTHER_OWNER = "owner:55555555-5555-4555-8555-555555555555";
const BINDING = Object.freeze({ ownerScope: OWNER, planKey: "premium" as const, settingsVersion: 31 });
const WIDTHS: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5, 7]), default: 5 });
const PARENT_RUN_ID = "77777777-7777-4777-8777-777777777777";

const Q = "Should Romania build new nuclear plants?";
const OTHER_Q = "Should Romania close its nuclear plants?";
const Q_EDITED = `${Q}\n\nUp to 2050.\nAnd what about jobs?`;

const LOCK: QuestionLanguageLock = Object.freeze({
  language: Object.freeze({ code: "en", name: "English" }), source: "ELD_SITE", siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "ELD_SITE", localReason: null
});

/* The made-up nuclear reading: two lists merged into one menu, a third list late. */
const WHY = "Made-up reason.";
const ANGLES = [
  { angle_id: "g1", kind: "ASKER_WORRY", label: "Costs to households" },
  { angle_id: "g2", kind: "PRACTICAL", label: "Keeping the lights on" },
  { angle_id: "g3", kind: "SPECIFIC", label: "Security" },
  { angle_id: "g4", kind: "GENERAL", label: "The wider energy plan" }
] as const;
const PT11_Q = "What would new nuclear plants cost households once the whole power system is counted?";
const vp = (viewpoint_id: string, title: string, question: string, angle_id: string) => ({ viewpoint_id, title, question, why: WHY, angle_id });
const PT11 = vp("pt11", "Whole-system costs", PT11_Q, "g1");
const PT12 = vp("pt12", "A calm winter week", "What happens to Romania's power in a cold winter week with little wind or sun?", "g2");
const PT13 = vp("pt13", "Grid reserves", "Does Romania hold enough reserve power for its hardest weeks?", "g2");
const PT14 = vp("pt14", "Imports of fuel", "Would new plants make Romania depend on imported fuel?", "g3");
const PT21 = vp("pt21", "Using less power first", "Would using less power first do more good than building new plants?", "g4");
const PT22 = vp("pt22", "Unproven designs", "Are the new reactor designs proven enough to build?", "g3");
const PT23 = vp("pt23", "Building delays", "How likely are long building delays, and who would pay for them?", "g1");
const PT24 = vp("pt24", "Jobs in the regions", "What would new plants mean for jobs in Romania's regions?", "g4");
const LIST1: StartList = StartListSchema.parse({ list_no: 1, angles: ANGLES, viewpoints: [PT11, PT12, PT13, PT14] });
const LIST2: StartList = StartListSchema.parse({ list_no: 2, angles: ANGLES, viewpoints: [PT21, PT22, PT23, PT24] });
const LIST3: StartList = StartListSchema.parse({ list_no: 3, angles: [ANGLES[1]], viewpoints: [
  vp("pt31", "Cooling water in hot summers", "Will rivers stay cool enough in hot summers to cool the plants?", "g2")] });

const KP02 = { title: "Keeping the lights on", question: "How would Romania keep the lights on through its hardest winter weeks?" };
const AS_QUESTION = "Should Romania keep its current reactors running longer instead of building new ones?";
const CD1 = { title: "Running today's reactors longer", question: "Would running today's reactors longer serve Romania better than building new ones?" };
const menuPath = (path_ref: string, title: string, question: string, viewpoint_ids: string[]) =>
  ({ path_ref, title, question, viewpoint_ids, put_together: viewpoint_ids.length > 1, is_new: false });
const MENU: StartMenu = StartMenuSchema.parse({
  menu_id: "nuclearMenuMadeUp00001", revision: 1, language: { code: "en", name: "English" }, angles: ANGLES,
  viewpoints: [...LIST1.viewpoints, ...LIST2.viewpoints].map((one) => ({ ...one, repeat_ids: [] })), repeats: [],
  paths: [
    menuPath("kp01", PT11.title, PT11.question, ["pt11"]),
    menuPath("kp02", KP02.title, KP02.question, ["pt12", "pt13"]),
    menuPath("kp03", PT14.title, PT14.question, ["pt14"]),
    menuPath("kp04", PT21.title, PT21.question, ["pt21"]),
    menuPath("kp05", PT22.title, PT22.question, ["pt22"]),
    menuPath("kp06", PT23.title, PT23.question, ["pt23"]),
    menuPath("kp07", PT24.title, PT24.question, ["pt24"])
  ],
  cards: [
    { card_id: "cd1", kind: "CHOICE_NOT_WEIGHED", sentence: "A choice you may not have weighed: keep today's reactors running longer.",
      new_path: CD1, fits_path_ref: null, as_question: AS_QUESTION },
    { card_id: "cd2", kind: "WHAT_WOULD_CHANGE_IT", sentence: "What would change the answer: much cheaper storage of power.",
      new_path: { title: "Cheaper storage", question: "Would much cheaper storage of power make new plants less needed?" },
      fits_path_ref: "kp01", as_question: null }
  ],
  suggestions: []
});

type Signing = Readonly<{ ownerScope: string; questionLine: string; planKey: DebateShapePlanKey; settingsVersion: number }>;
const SIGNED_FOR: Signing = Object.freeze({ ...BINDING, questionLine: Q });
const checkRef = (over: Partial<Signing> = {}) => signStartCheck(KEY, { ...SIGNED_FOR, ...over, lock: LOCK, originalQuestionLine: null });
/** The check of a reading whose language rewrite was accepted at Next: it binds the original line too. */
const REWRITE_ORIGINAL = "Ar trebui România să construiască centrale nucleare noi?";
const rewriteCheckRef = () => signStartCheck(KEY, { ...SIGNED_FOR, originalQuestionLine: REWRITE_ORIGINAL,
  lock: { ...LOCK, source: "CHOICE", rewriteAccepted: true, originalQuestionLine: REWRITE_ORIGINAL, recordCode: "CHOICE_USE_REWRITE" } });
const signedMenu = (over: Partial<Signing> = {}, menu: StartMenu = MENU): SignedStartMenu =>
  ({ menu, ref: signStartMenu(KEY, { ...SIGNED_FOR, ...over, menu }) });
const signedLate = (over: Partial<Signing> = {}): SignedStartList => ({ list: LIST3, ref: signStartList(KEY, { ...SIGNED_FOR, ...over, list: LIST3 }) });

/* The five paths the person shaped (How wide 5). */
const OWN_TEXT = "I worry about earthquakes near the plants.";
const COMBINED = { title: "Supply and imports", question: "Can Romania keep its power supplied without depending on imported fuel?" };
const combineRefOf = (members: readonly (typeof PT11)[], words = COMBINED) => signStartCombine(KEY, {
  ownerScope: OWNER, context: { kind: "MENU", menuId: MENU.menu_id }, title: words.title, question: words.question,
  membersHash: startMembersHash(members.map((one) => ({ viewpoint_id: one.viewpoint_id, pick_no: null, title: one.title, question: one.question })))
});
const P_KP01: StartPathChoice = { title: PT11.title, question: PT11.question, members: [{ viewpoint_id: "pt11" }] };
/** kp02's group, its members sent in the other order. */
const P_KP02_REVERSED: StartPathChoice = { ...KP02, members: [{ viewpoint_id: "pt13" }, { viewpoint_id: "pt12" }] };
const P_CARD: StartPathChoice = { ...CD1, members: [{ viewpoint_id: "cd1" }] };
const P_OWN: StartPathChoice = { title: "Earthquakes", question: OWN_TEXT, members: [{ own_text: OWN_TEXT }] };
const P_COMBINED: StartPathChoice = { ...COMBINED, members: [{ viewpoint_id: "pt14" }, { viewpoint_id: "pt21" }],
  combine_ref: combineRefOf([PT14, PT21]) };
const FIVE = [P_KP01, P_KP02_REVERSED, P_CARD, P_OWN, P_COMBINED] as const;
const AUTHORS = ["AI_SUGGESTION", "AI_SUGGESTION", "AI_SUGGESTION", "PERSON_OWN_VIEW", "AI_COMBINED"];
const one = (title: string, question: string, viewpointId: string): StartPathChoice => ({ title, question, members: [{ viewpoint_id: viewpointId }] });
const SEVEN = [P_KP01, P_KP02_REVERSED, P_CARD, P_OWN, P_COMBINED, one(PT22.title, PT22.question, "pt22"), one(PT23.title, PT23.question, "pt23")];

const baseAsk = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:start", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start paths at ask",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], ...extra });
const paths = (over: Partial<StartPaths> = {}, signing: Partial<Signing> = {}): StartPaths => ({
  source: "MENU", menu: signedMenu(signing), late_lists: [signedLate(signing)], paths: [...FIVE], width: 5, chosen_by: "PERSON", ...over });
/** A Start from the reading of Q: its check and its chosen paths; `signing` moves every reference's binding at once. */
const ask = (extra: Partial<AskRequest> = {}, over: Partial<StartPaths> = {}, signing: Partial<Signing> = {}): AskRequest =>
  baseAsk({ start_check: { ref: checkRef(signing) }, start_paths: paths(over, signing), ...extra });

/** The same Start without its check (an old or broken page): the reading is then the menu's. */
const withoutCheck = (request: AskRequest): AskRequest => {
  const { start_check: _check, ...rest } = request;
  void _check;
  return rest;
};

type VerifyInput = Parameters<typeof verifyStartPathsAtAsk>[0];
const verify = (request: AskRequest, over: Partial<VerifyInput> = {}) => verifyStartPathsAtAsk({ key: KEY, ownerScope: OWNER, ask: request,
  planKey: "premium", settingsVersion: 31, widths: WIDTHS, dig: null, now: NOW, ...over });
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { return error instanceof TypedDomainError ? error.code : `UNTYPED:${String(error)}`; }
  return "NO_THROW";
};
/** One character of the signature changed. */
const flippedMac = (ref: string) => `${ref.slice(0, -2)}${ref.at(-2) === "A" ? "B" : "A"}${ref.at(-1)!}`;

/* A dig of a debate: two picks, the second the person's own view. */
const P1: DigPick = { kind: "CONTRADICTING", suggestion_id: "sg-1", place: "w", text: "Who pays if building runs years late?" };
const P2: DigPick = { kind: "OWN_VIEW", suggestion_id: null, place: "w", text: OWN_TEXT };
const dig = Object.freeze({ parentRunId: PARENT_RUN_ID, picks: Object.freeze([P1, P2]),
  pickAuthors: Object.freeze(["AI_SUGGESTION", "PERSON_OWN_VIEW"] as DigPickAuthor[]) });
const digAsk = (extra: Partial<AskRequest> = {}): AskRequest =>
  baseAsk({ parent: { parent_run_id: PARENT_RUN_ID, places: [], mode: "quick", picks: [P1, P2] }, ...extra });
const P_PICK1: StartPathChoice = { title: "Building delays", question: P1.text, members: [{ pick_no: 1 }] };
const P_PICK2: StartPathChoice = { title: "Earthquakes", question: P2.text, members: [{ pick_no: 2 }] };
const EIGHT_PICKS = Object.freeze(Array.from({ length: 8 }, (_, index): DigPick =>
  ({ kind: "OWN_VIEW", suggestion_id: null, place: "w", text: `Made-up pick ${index + 1}?` })));
const EIGHT_AUTHORS = Object.freeze(EIGHT_PICKS.map((): DigPickAuthor => "PERSON_OWN_VIEW"));

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyStartPathsAtAsk: the paths signed at Next, read back at Start (spec 2026-11-03 §4.2)", () => {
  it("reads each path from the signed menu, in the person's order, b1 first", () => {
    const v = verify(ask());
    expect(v.paths[0]).toEqual({ pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "Whole-system costs", question: PT11_Q,
      viewpoints: [{ viewpointId: "pt11", pickNo: null, title: "Whole-system costs", question: PT11_Q, own: false }], ownWords: [] });
    expect(v.questionEdited).toBe(false);
    expect(v.paths.map((path) => path.pathId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(v.paths.map((path) => path.pathNo)).toEqual([1, 2, 3, 4, 5]);
    expect(v).toMatchObject({ source: "MENU", width: 5, chosenBy: "PERSON", carryOnToReport: false, questionSwap: null,
      menu: { menu: MENU, lateLists: [LIST3] } });
  });

  it("the canonical members: a viewpoint's words, a card's new path, the person's own words", () => {
    const v = verify(ask());
    expect(v.paths[1]!.viewpoints).toEqual([
      { viewpointId: "pt13", pickNo: null, title: PT13.title, question: PT13.question, own: false },
      { viewpointId: "pt12", pickNo: null, title: PT12.title, question: PT12.question, own: false }]);
    expect(v.paths[2]!.viewpoints).toEqual([{ viewpointId: "cd1", pickNo: null, title: CD1.title, question: CD1.question, own: false }]);
    expect(v.paths[3]!.viewpoints).toEqual([{ viewpointId: null, pickNo: null, title: null, question: OWN_TEXT, own: true }]);
  });

  describe("who wrote each path (first match)", () => {
    it("kp02's group reversed, a card and a menu path are the AIs'; the own text is the person's; a verifying combine_ref is AI_COMBINED", () => {
      expect(verify(ask()).paths.map((path) => path.author)).toEqual(AUTHORS);
    });

    it("a group in the person's own wording is PERSON_EDITED", () => {
      const v = verify(ask({}, { paths: [P_KP01, { ...P_KP02_REVERSED, title: "Winter weeks" }] }));
      expect(v.paths.map((path) => path.author)).toEqual(["AI_SUGGESTION", "PERSON_EDITED"]);
      expect(v.paths[1]!.ownWords).toEqual(["Winter weeks", KP02.question]);
    });

    it("one viewpoint with its own words is the AI's (a viewpoint split out of its group)", () => {
      const v = verify(ask({}, { paths: [one(PT12.title, PT12.question, "pt12"), one(PT13.title, PT13.question, "pt13")] }));
      expect(v.paths.map((path) => path.author)).toEqual(["AI_SUGGESTION", "AI_SUGGESTION"]);
    });

    it("a menu path's words over its viewpoints and one more are the person's (a viewpoint added into the AIs' group)", () => {
      const widened: StartPathChoice = { ...KP02, members: [{ viewpoint_id: "pt12" }, { viewpoint_id: "pt13" }, { viewpoint_id: "pt14" }] };
      const v = verify(ask({}, { paths: [widened], width: 3 }));
      expect(v.paths[0]!.author).toBe("PERSON_EDITED");
      expect(v.paths[0]!.ownWords).toEqual([KP02.title, KP02.question]);
      expect(codeOf(() => verify(ask({}, { paths: [widened], width: 3, chosen_by: "AIS" })))).toBe("START_PATHS_INVALID");
    });

    it("a card in other words, or a menu path's members under another path's words, are the person's", () => {
      const v = verify(ask({}, { paths: [{ ...P_CARD, title: "Older reactors" }, { ...P_KP01, title: KP02.title, question: KP02.question }] }));
      expect(v.paths.map((path) => path.author)).toEqual(["PERSON_EDITED", "PERSON_EDITED"]);
    });

    it("edited after combining: the AI's words changed, so the combine_ref no longer verifies and the path is PERSON_EDITED", () => {
      const v = verify(ask({}, { paths: [{ ...P_COMBINED, title: "Fuel from abroad" }] }));
      expect(v.paths[0]!.author).toBe("PERSON_EDITED");
      expect(v.paths[0]!.ownWords).toEqual(["Fuel from abroad", COMBINED.question]);
    });

    it("a combine_ref over other members, or another person's, falls through to PERSON_EDITED (never a refusal)", () => {
      const otherMembers = { ...P_COMBINED, combine_ref: combineRefOf([PT14, PT22]) };
      const otherPerson = { ...P_COMBINED, combine_ref: signStartCombine(KEY, { ownerScope: OTHER_OWNER,
        context: { kind: "MENU", menuId: MENU.menu_id }, ...COMBINED,
        membersHash: startMembersHash([PT14, PT21].map((m) => ({ viewpoint_id: m.viewpoint_id, pick_no: null, title: m.title, question: m.question }))) }) };
      expect(verify(ask({}, { paths: [otherMembers] })).paths[0]!.author).toBe("PERSON_EDITED");
      expect(verify(ask({}, { paths: [otherPerson] })).paths[0]!.author).toBe("PERSON_EDITED");
    });

    it("an AI-combined path with the person's own words in it keeps only those words as theirs", () => {
      const ownMember = { viewpoint_id: null, pick_no: null, title: null, question: "Fish?" };
      const ref = signStartCombine(KEY, { ownerScope: OWNER, context: { kind: "MENU", menuId: MENU.menu_id }, ...COMBINED,
        membersHash: startMembersHash([{ viewpoint_id: "pt14", pick_no: null, title: PT14.title, question: PT14.question }, ownMember]) });
      const v = verify(ask({}, { paths: [{ ...COMBINED, members: [{ own_text: "Fish?" }, { viewpoint_id: "pt14" }], combine_ref: ref }] }));
      expect(v.paths[0]).toMatchObject({ author: "AI_COMBINED", ownWords: ["Fish?"] });
      expect(v.paths[0]!.viewpoints[0]).toEqual({ viewpointId: null, pickNo: null, title: null, question: "Fish?", own: true });
    });

    it("ownWords: the person's paths give their title, question and own text (once each); the set adds them up", () => {
      const v = verify(ask());
      expect(v.paths[3]!.ownWords).toEqual(["Earthquakes", OWN_TEXT]);
      expect(v.paths[4]!.ownWords).toEqual([]);
      expect(v.ownWords).toEqual(["Earthquakes", OWN_TEXT]);
    });

    it("chosen by the AIs: every path must be an AI suggestion", () => {
      expect(verify(ask({}, { paths: [P_KP01, P_KP02_REVERSED, P_CARD], width: 3, chosen_by: "AIS" })).chosenBy).toBe("AIS");
    });

    /*
     * Task 33b (spec §7 "A path you added or rewrote is your own words"; the coordinator's ruling of 5 Nov on Task 63's
     * review): when the AI combine fails, or Start comes while it is being written, the page sends the code-joined words
     * of the viewpoints (joinedPathWords) with no combine_ref. The server joins the signed menu's own texts the same way:
     * the same words are the AIs' (AI_COMBINED), never the person's; a word changed, or a join the menu cannot vouch for,
     * stays the person's.
     */
    describe("code-joined AI words (Task 33b)", () => {
      const JOINED = joinedPathWords([PT14, PT21]);
      const P_JOINED: StartPathChoice = { ...JOINED, members: [{ viewpoint_id: "pt14" }, { viewpoint_id: "pt21" }] };
      const authorOfOne = (path: StartPathChoice): string => verify(ask({}, { paths: [path], width: 3 })).paths[0]!.author;
      /** The page's plan of MENU after these actions, as Start sends it, verified. */
      const pageStart = (...actions: PathPlanAction[]) => {
        let plan: PathPlan = pathPlanFromMenu(MENU, 5, false);
        for (const action of actions) plan = pathPlanReduce(plan, action).plan;
        return { plan, verified: verify(ask({}, { paths: [...pathPlanToStartPaths(plan)], width: plan.width })) };
      };

      it("(b) two menu viewpoints under their joined words, no combine_ref: AI_COMBINED, and no title or question is the person's", () => {
        expect(JOINED).toEqual({ title: "Imports of fuel · Using less power first",
          question: `1. ${PT14.question}\n2. ${PT21.question}` });
        const v = verify(ask({}, { paths: [P_KP01, P_JOINED], width: 3 }));
        expect(v.paths[1]).toMatchObject({ author: "AI_COMBINED", ...JOINED, ownWords: [] });
        expect(v.ownWords).toEqual([]);
        const withCard: StartPathChoice = { ...joinedPathWords([PT14, CD1]), members: [{ viewpoint_id: "pt14" }, { viewpoint_id: "cd1" }] };
        expect(authorOfOne(withCard)).toBe("AI_COMBINED");
      });

      it("(c) the same path with one word changed by the person: PERSON_EDITED, as before", () => {
        const changed: StartPathChoice = { ...P_JOINED, question: JOINED.question.replace("imported fuel", "fuel from abroad") };
        const v = verify(ask({}, { paths: [changed], width: 3 }));
        expect(v.paths[0]).toMatchObject({ author: "PERSON_EDITED", ownWords: [JOINED.title, changed.question] });
        expect(authorOfOne({ ...P_JOINED, title: "Fuel and saving power" })).toBe("PERSON_EDITED");
      });

      it("(d) a join of texts the signed menu does not hold (a client's own join) is the person's: the server cannot vouch for it", () => {
        const forged = joinedPathWords([{ title: PT14.title, question: "Would new plants make Romania depend on fuel bought abroad?" }, PT21]);
        expect(authorOfOne({ ...forged, members: P_JOINED.members })).toBe("PERSON_EDITED");
        expect(authorOfOne({ ...JOINED, members: [{ viewpoint_id: "pt14" }, { viewpoint_id: "pt22" }] })).toBe("PERSON_EDITED");
        expect(authorOfOne({ ...JOINED, members: [{ viewpoint_id: "pt21" }, { viewpoint_id: "pt14" }] })).toBe("PERSON_EDITED");
        // The person's own words joined in are theirs; and one viewpoint is never joined by the page.
        const withOwn = joinedPathWords([PT14, { title: OWN_TEXT, question: OWN_TEXT }]);
        expect(authorOfOne({ ...withOwn, members: [{ viewpoint_id: "pt14" }, { own_text: OWN_TEXT }] })).toBe("PERSON_EDITED");
        expect(authorOfOne({ ...joinedPathWords([PT14]), members: [{ viewpoint_id: "pt14" }] })).toBe("PERSON_EDITED");
      });

      it("(e) the page's fallback path, as pathPlanToStartPaths sends it, verifies as AI_COMBINED; so does a path still being written", () => {
        const combine: PathPlanAction[] = [{ type: "SELECT", key: "kp03" }, { type: "SELECT", key: "kp04" }, { type: "COMBINE_SELECTED" }];
        const writing = pageStart(...combine);
        expect(writing.plan.paths[2]).toMatchObject({ wording: "WRITING", combineRef: null, ...JOINED });
        expect(writing.verified.paths.map((path) => path.author)).toEqual(["AI_SUGGESTION", "AI_SUGGESTION", "AI_COMBINED", "AI_SUGGESTION"]);
        const fallback = pageStart(...combine, { type: "COMBINE_FAILED", key: writing.plan.paths[2]!.key });
        expect(fallback.plan.paths[2]).toMatchObject({ wording: "FALLBACK", combineRef: null, ...JOINED });
        expect(fallback.verified.paths[2]).toMatchObject({ author: "AI_COMBINED", ...JOINED, ownWords: [] });
        expect(fallback.verified.ownWords).toEqual([]);
        const card = pageStart({ type: "USE_CARD", cardId: "cd2", intoPathKey: "kp01" });
        expect(card.plan.paths[0]).toMatchObject({ wording: "WRITING", combineRef: null });
        expect(card.verified.paths[0]!.author).toBe("AI_COMBINED");
      });
    });
  });

  describe("read-d2: the question edited on step 2 keeps the paths", () => {
    it("check, lists and menu signed for Q; the line sent with answers and words added: verified, the same paths and authors", () => {
      const edited = verify(ask({ question_line: Q_EDITED }));
      expect(edited.questionEdited).toBe(true);
      expect(edited.paths.map((path) => path.pathId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
      expect(edited.paths.map((path) => path.author)).toEqual(verify(ask({})).paths.map((path) => path.author));
    });

    it("spaces around the line are not an edit", () => {
      expect(verify(ask({ question_line: `  ${Q}  ` })).questionEdited).toBe(false);
    });

    it("a question swap: the card's as_question sent unchanged is not an edit; with words added it is, and still verifies", () => {
      const kept: StartPathChoice = { title: "My first question", question: Q, members: [{ own_text: Q }] };
      const swapped = (line: string) => ask({ question_line: line }, { paths: [kept, P_KP01, P_KP02_REVERSED],
        width: 3, question_swap: { card_id: "cd1", original_question_line: Q } });
      const plain = verify(swapped(AS_QUESTION));
      expect(plain.questionEdited).toBe(false);
      expect(plain.questionSwap).toEqual({ originalQuestionLine: Q });
      expect(plain.paths.map((path) => path.author)).toEqual(["PERSON_OWN_VIEW", "AI_SUGGESTION", "AI_SUGGESTION"]);
      const added = verify(swapped(`${AS_QUESTION}\n\nUp to 2050.`));
      expect(added.questionEdited).toBe(true);
      expect(added.paths).toEqual(plain.paths);
    });
  });

  describe("answer Q8: no time limit, and a site update keeps the paths", () => {
    it("references signed under version 30 and verified with the binding at 31: the same paths and authors", () => {
      const moved = verify(ask({}, {}, { settingsVersion: 30 }));
      expect(moved.paths).toEqual(verify(ask()).paths);
      expect(moved.width).toBe(5);
    });

    it("references 40 days old (fake clock) verify; nothing is EXPIRED", () => {
      const request = ask();
      vi.useFakeTimers({ toFake: ["Date"], now: NOW });
      vi.setSystemTime(new Date(NOW.getTime() + FORTY_DAYS));
      expect(verify(request, { now: new Date() }).paths.map((path) => path.author)).toEqual(AUTHORS);
    });

    it("7 paths at width 7 signed under 30, the binding at 31 allowing at most 5: START_PATHS_NARROWED", () => {
      const narrow = { widths: { options: [3, 5], default: 5 } };
      expect(codeOf(() => verify(ask({}, { paths: SEVEN, width: 7 }, { settingsVersion: 30 }), narrow))).toBe("START_PATHS_NARROWED");
      const five = verify(ask({}, { paths: SEVEN.slice(0, 5), width: 7 }, { settingsVersion: 30 }), narrow);
      expect(five.width).toBe(7);
      expect(five.paths).toHaveLength(5);
    });

    it("Free with 4 paths after a version move: START_PATHS_NARROWED (Free looks into 3 at most, whatever the row says)", () => {
      expect(codeOf(() => verify(ask({}, { paths: SEVEN.slice(0, 4), width: 5 }, { planKey: "free", settingsVersion: 30 }),
        { planKey: "free", widths: { options: [3, 5, 7], default: 5 } }))).toBe("START_PATHS_NARROWED");
    });

    it("after a version move the paths still fit their own width: more paths than width is TOO_MANY", () => {
      expect(codeOf(() => verify(ask({}, { paths: SEVEN.slice(0, 5), width: 3 }, { settingsVersion: 30 })))).toBe("START_PATHS_TOO_MANY");
    });

    it("the same version: a width the plan does not offer is TOO_MANY (unchanged)", () => {
      expect(codeOf(() => verify(ask({}, { paths: SEVEN.slice(0, 4), width: 4 })))).toBe("START_PATHS_TOO_MANY");
      expect(codeOf(() => verify(ask({}, { paths: SEVEN, width: 7 }), { widths: { options: [3, 5], default: 5 } }))).toBe("START_PATHS_TOO_MANY");
    });
  });

  describe("refusals", () => {
    it.each([
      ["width 4", () => verify(ask({}, { paths: SEVEN.slice(0, 4), width: 4 }))],
      ["six paths at width 5", () => verify(ask({}, { paths: SEVEN.slice(0, 6), width: 5 }))],
      ["free with 4 paths, whatever the row says", () => verify(ask({}, { paths: SEVEN.slice(0, 4), width: 5 }, { planKey: "free" }),
        { planKey: "free", widths: { options: [3, 5, 7], default: 5 } })]
    ])("TOO_MANY: %s", (_name, run) => {
      expect(codeOf(run)).toBe("START_PATHS_TOO_MANY");
    });

    const revised: StartMenu = { ...MENU, paths: MENU.paths.map((path) => path.path_ref === "kp01" ? { ...path, title: "Costs" } : path) };
    it.each([
      ["pt99, no viewpoint of the menu", () => verify(ask({}, { paths: [one("Unknown", "Unknown?", "pt99")], width: 3 }))],
      ["pt31, a late list's viewpoint the menu does not show", () => verify(ask({}, { paths: [one("Cooling", "Cooling?", "pt31")], width: 3 }))],
      ["a duplicate member (pt11 in two paths)", () => verify(ask({}, { paths: [P_KP01, { ...P_COMBINED, members: [{ viewpoint_id: "pt11" }] }], width: 3 }))],
      ["a duplicate member (pt12 twice in one path)", () => verify(ask({}, { paths: [{ ...KP02, members: [{ viewpoint_id: "pt12" }, { viewpoint_id: "pt12" }] }], width: 3 }))],
      ["the same own words twice", () => verify(ask({}, { paths: [P_OWN, { ...P_OWN, title: "Again" }], width: 3 }))],
      ["a pick_no on a MENU", () => verify(ask({}, { paths: [{ ...P_KP01, members: [{ pick_no: 1 }] }], width: 3 }))],
      ["a MENU without its menu", () => verify(ask({}, { menu: undefined as unknown as SignedStartMenu }))],
      ["a MENU on a dig", () => verify(ask(), { dig })],
      ["DIG_PICKS with a menu", () => verify(digAsk({ start_paths: { source: "DIG_PICKS", menu: signedMenu(), paths: [P_PICK1], width: 1,
        chosen_by: "PERSON" } }), { dig })],
      ["DIG_PICKS without a dig", () => verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [P_PICK1], width: 1, chosen_by: "PERSON" } }))],
      ["a viewpoint on DIG_PICKS", () => verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [P_KP01], width: 1, chosen_by: "PERSON" } }), { dig })],
      ["a pick the dig does not have (pick 3 of 2)", () => verify(digAsk({ start_paths: { source: "DIG_PICKS",
        paths: [{ ...P_PICK1, members: [{ pick_no: 3 }] }], width: 1, chosen_by: "PERSON" } }), { dig })],
      ["a revised menu (its words changed after signing)", () => verify(ask({}, { menu: { menu: revised, ref: signedMenu().ref } }))],
      ["chosen by the AIs with an edited path", () => verify(ask({}, { paths: [P_KP01, { ...P_KP02_REVERSED, title: "Winter weeks" }, P_CARD],
        width: 3, chosen_by: "AIS" }))],
      ["chosen by the AIs with the person's own path", () => verify(ask({}, { paths: [P_KP01, P_OWN, P_CARD], width: 3, chosen_by: "AIS" }))],
      ["a swap card not in the menu", () => verify(ask({ question_line: AS_QUESTION }, { question_swap: { card_id: "cd3", original_question_line: Q } }))],
      ["a swap card with no question", () => verify(ask({ question_line: AS_QUESTION }, { question_swap: { card_id: "cd2", original_question_line: Q } }))],
      ["a tampered late list ref", () => verify(ask({}, { late_lists: [{ list: LIST3, ref: flippedMac(signedLate().ref) }] }))],
      ["a tampered menu ref", () => verify(ask({}, { menu: { menu: MENU, ref: flippedMac(signedMenu().ref) } }))],
      ["a tampered check ref", () => verify(ask({ start_check: { ref: flippedMac(checkRef()) } }))],
      ["another person's references", () => verify(ask({}, {}, { ownerScope: OTHER_OWNER }))],
      ["another person's check beside this person's menu and late list", () =>
        verify(ask({ start_check: { ref: checkRef({ ownerScope: OTHER_OWNER }) } }))]
    ])("INVALID: %s", (_name, run) => {
      expect(codeOf(run)).toBe("START_PATHS_INVALID");
    });

    it.each([
      ["a late list of another reading (its ref carries another question)", () => verify(ask({}, { late_lists: [signedLate({ questionLine: OTHER_Q })] }))],
      ["the same, on a line edited on step 2", () => verify(ask({ question_line: Q_EDITED }, { late_lists: [signedLate({ questionLine: OTHER_Q })] }))],
      ["a menu of another reading", () => verify(ask({ question_line: Q_EDITED }, { menu: signedMenu({ questionLine: OTHER_Q }) }))],
      ["a list signed under another settings version than its check (one reading)", () =>
        verify(ask({}, { late_lists: [signedLate({ settingsVersion: 30 })] }))],
      ["a menu signed under another settings version than its check", () => verify(ask({}, { menu: signedMenu({ settingsVersion: 32 }) }))],
      ["planKey plus for refs signed premium", () => verify(ask(), { planKey: "plus" })],
      ["a check signed for another plan beside this plan's menu and late list", () =>
        verify(ask({ start_check: { ref: checkRef({ planKey: "plus" }) } }))],
      ["a check of an accepted rewrite sent without its original line", () => verify(ask({ start_check: { ref: rewriteCheckRef() } }))],
      ["a swap whose original does not hash to the check's question", () =>
        verify(ask({ question_line: AS_QUESTION }, { question_swap: { card_id: "cd1", original_question_line: OTHER_Q } }))]
    ])("STALE: %s", (_name, run) => {
      expect(codeOf(run)).toBe("START_PATHS_STALE");
    });
  });

  it("the check is verified too: a reading whose rewrite was accepted verifies with its original line sent", () => {
    const v = verify(ask({ start_check: { ref: rewriteCheckRef(), original_question_line: REWRITE_ORIGINAL } }));
    expect(v.paths.map((path) => path.author)).toEqual(AUTHORS);
    expect(v.questionEdited).toBe(false);
  });

  describe("without a check: the reading is the menu's", () => {
    it("verifies, and the line sent as read is not an edit", () => {
      const v = verify(withoutCheck(ask()));
      expect(v.paths.map((path) => path.author)).toEqual(AUTHORS);
      expect(v.questionEdited).toBe(false);
      expect(verify(withoutCheck(ask({ question_line: Q_EDITED }))).questionEdited).toBe(true);
    });
  });

  it("carries on to the report only when asked, and never on a dig", () => {
    expect(verify(ask({ carry_on_to_report: true })).carryOnToReport).toBe(true);
    expect(verify(digAsk({ carry_on_to_report: true }), { dig }).carryOnToReport).toBe(false);
  });

  describe("a dig's picks", () => {
    it("DIG_PICKS: each pick resolves to its text, and a pick sent as written keeps its author", () => {
      const v = verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [P_PICK1, P_PICK2], width: 2, chosen_by: "PERSON" } }), { dig });
      expect(v.width).toBe(2);
      expect(v.paths).toEqual([
        { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "Building delays", question: P1.text,
          viewpoints: [{ viewpointId: null, pickNo: 1, title: null, question: P1.text, own: false }], ownWords: [] },
        { pathId: "b2", pathNo: 2, author: "PERSON_OWN_VIEW", title: "Earthquakes", question: OWN_TEXT,
          viewpoints: [{ viewpointId: null, pickNo: 2, title: null, question: OWN_TEXT, own: true }], ownWords: ["Earthquakes", OWN_TEXT] }]);
      expect(v).toMatchObject({ source: "DIG_PICKS", menu: null, questionSwap: null, questionEdited: false, ownWords: ["Earthquakes", OWN_TEXT] });
    });

    it("DIG_PICKS: a pick in other words is the person's; picks combined by the AI over the dig verify as AI_COMBINED", () => {
      const ref = signStartCombine(KEY, { ownerScope: OWNER, context: { kind: "DIG", parentRunId: PARENT_RUN_ID }, ...COMBINED,
        membersHash: startMembersHash([1, 2].map((no) => ({ viewpoint_id: null, pick_no: no, title: null, question: [P1, P2][no - 1]!.text }))) });
      const v = verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [{ ...COMBINED, members: [{ pick_no: 2 }, { pick_no: 1 }], combine_ref: ref }],
        width: 1, chosen_by: "PERSON" } }), { dig });
      expect(v.paths[0]).toMatchObject({ author: "AI_COMBINED", ownWords: [] });
      expect(v.ownWords).toEqual([OWN_TEXT]);
      const edited = verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [{ ...P_PICK1, question: "Who pays for delays?" }], width: 1,
        chosen_by: "PERSON" } }), { dig });
      expect(edited.paths[0]!.author).toBe("PERSON_EDITED");
    });

    /*
     * Independent review of Task 79 (wave 16; Task 33b's deferred note): the dig's rows join two AI-suggested picks the same way
     * when no AI wrote one question for them (the combine failed, or the dig was pressed while it was being written): each pick
     * by its text, with no title, so its title is its text cut to a path title's length. The server joins the picks as sent the
     * same way: the same words are the AIs' (AI_COMBINED); a pick the person wrote or reworded in the join, or a word changed,
     * stays the person's.
     */
    it("DIG_PICKS: AI-suggested picks under the dig rows' own joined words, no combine_ref, are AI_COMBINED", () => {
      const suggestions: DigSuggestion[] = [
        { suggestion_id: "sg-1", kind: "UNDOCUMENTED", side: null, text: "Who pays if building runs years late?", places: ["path:b2"] },
        { suggestion_id: "sg-3", kind: "UNDOCUMENTED", side: null, text: "Can the grid carry the new plants' power by 2035?", places: ["path:b2"] }
      ];
      let plan = digPathPlanOf(suggestions.map((suggestion) => suggestionPick("b2", suggestion)), false);
      for (const action of [{ type: "SELECT", key: plan.paths[0]!.key }, { type: "SELECT", key: plan.paths[1]!.key }, { type: "COMBINE_SELECTED" }] as const) {
        plan = pathPlanReduce(plan, action).plan;
      }
      const writing = digStartPaths(plan);
      const fallback = digStartPaths(pathPlanReduce(plan, { type: "COMBINE_FAILED", key: plan.paths[0]!.key }).plan);
      const sentPicks: DigPick[] = suggestions.map((suggestion) =>
        ({ kind: suggestion.kind, suggestion_id: suggestion.suggestion_id, place: "path:b2", text: suggestion.text }));
      const aiDig = Object.freeze({ parentRunId: PARENT_RUN_ID, picks: Object.freeze(sentPicks),
        pickAuthors: Object.freeze(["AI_SUGGESTION", "AI_SUGGESTION"] as DigPickAuthor[]) });
      const request = (startPaths: StartPaths): AskRequest =>
        baseAsk({ parent: { parent_run_id: PARENT_RUN_ID, places: ["path:b2"], mode: "quick", picks: sentPicks }, start_paths: startPaths });
      for (const sent of [writing, fallback]) {
        expect(sent.paths).toHaveLength(1);
        expect(sent.paths[0]!.combine_ref).toBeUndefined();
        const v = verify(request(sent), { dig: aiDig });
        expect(v.paths[0]).toMatchObject({ author: "AI_COMBINED", ownWords: [] });
        expect(v.ownWords).toEqual([]);
      }
      // A pick the person reworded in the join: the words are theirs.
      expect(verify(request(writing), { dig: { ...aiDig, pickAuthors: ["AI_SUGGESTION", "PERSON_EDITED"] } }).paths[0]!.author).toBe("PERSON_EDITED");
      // A word changed: the person's.
      expect(verify(request({ ...writing, paths: [{ ...writing.paths[0]!, title: "My own title" }] }), { dig: aiDig }).paths[0]!.author)
        .toBe("PERSON_EDITED");
      // One pick alone is never a join (its own words are the pick's author, as before).
      expect(verify(request({ source: "DIG_PICKS", paths: [P_PICK1], width: 1, chosen_by: "PERSON" }), { dig: aiDig }).paths[0]!.author)
        .toBe("AI_SUGGESTION");
    });

    it("DIG_PICKS: the width is the number of paths, at most the widest option", () => {
      expect(codeOf(() => verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: [P_PICK1], width: 2, chosen_by: "PERSON" } }), { dig })))
        .toBe("START_PATHS_TOO_MANY");
      const eight = EIGHT_PICKS.map((pick, index): StartPathChoice => ({ title: `Pick ${index + 1}`, question: pick.text, members: [{ pick_no: index + 1 }] }));
      // 8 > max(options) 7 (the contract allows 7; the verifier holds whatever reaches it).
      expect(codeOf(() => verify(digAsk({ start_paths: { source: "DIG_PICKS", paths: eight, width: 8, chosen_by: "PERSON" } }),
        { dig: { ...dig, picks: EIGHT_PICKS, pickAuthors: EIGHT_AUTHORS } }))).toBe("START_PATHS_TOO_MANY");
    });

    it("a dig with picks and no start_paths: one path per pick, width = picks, its title from the pick's first line", () => {
      const built = verify(digAsk({}), { dig });
      expect(built).toMatchObject({ source: "DIG_PICKS", width: 2, menu: null, ownWords: ["I worry about earthquakes near the plants."] });
      expect(built.questionEdited).toBe(false);
      expect(built.chosenBy).toBe("PERSON");
      expect(built.paths.map((path) => [path.pathId, path.author, path.title, path.question])).toEqual([
        ["b1", "AI_SUGGESTION", P1.text, P1.text], ["b2", "PERSON_OWN_VIEW", OWN_TEXT, OWN_TEXT]]);
      expect(built.paths[1]!.viewpoints).toEqual([{ viewpointId: null, pickNo: 2, title: null, question: OWN_TEXT, own: true }]);
    });

    it("an old page's dig: 8 picks (today's digs allow up to digPicksMax, 16) and no start_paths, widths [3,5,7]/5 → TOO_MANY", () => {
      expect(() => verify(digAsk({}), { dig: { ...dig, picks: EIGHT_PICKS, pickAuthors: EIGHT_AUTHORS } }))
        .toThrow(expect.objectContaining({ code: "START_PATHS_TOO_MANY" }));
    });
  });

  it("storedSetOf maps the verified set 1:1", () => {
    const v = verify(ask({ carry_on_to_report: true }));
    expect(storedSetOf("run-1", v)).toEqual({ runId: "run-1", source: "MENU", width: 5, chosenBy: "PERSON", carryOnToReport: true,
      paths: v.paths, menu: v.menu });
  });
});

/*
 * Task 92a (owner, 4 Nov): "of at most four" is gone from the merges, so the menu may hold a path the AIs put together of five
 * or more, and Start takes it whole. Task 33's author rules hold unchanged whatever the size; only the person's own words and a
 * dig's picks stay at most 4 in a path, which the contract refuses before the verifier reads any reference.
 */
describe("a merged path of any size, at Start (Task 92a)", () => {
  const SIX_IDS = ["pt11", "pt12", "pt13", "pt14", "pt21", "pt22"];
  const SIX_WORDS = { title: "Costs, supply and designs", question: "What would new plants cost, and could Romania build and supply them on time?" };
  /** The nuclear menu with kp01 holding six viewpoints the merge put together (built here, so only these cases see it). */
  const sixMenu = (): StartMenu => ({ ...MENU, paths: [menuPath("kp01", SIX_WORDS.title, SIX_WORDS.question, SIX_IDS),
    menuPath("kp02", PT23.title, PT23.question, ["pt23"]), menuPath("kp03", PT24.title, PT24.question, ["pt24"])] });
  /** A Start of one path from `menu`, its check and its menu signed for the reading of Q. */
  const askOf = (path: StartPathChoice, chosenBy: "PERSON" | "AIS" = "PERSON", menu: StartMenu = sixMenu()): AskRequest =>
    baseAsk({ start_check: { ref: checkRef() }, start_paths: { source: "MENU", menu: signedMenu({}, menu), paths: [path], width: 3, chosen_by: chosenBy } });
  /** As the route does: the body parsed with AskRequestSchema first, then the verifier, whose every reference check reads the key. */
  const atRoute = (body: unknown, key: StartStepKey = KEY) => {
    const parsed = AskRequestSchema.safeParse(body);
    if (!parsed.success) return { refused: parsed.error.issues.map((issue) => issue.message) } as const;
    return { verified: verify(parsed.data, { key }) } as const;
  };
  const verifiedOf = (result: ReturnType<typeof atRoute>) => {
    if ("refused" in result) throw new Error(`refused before the verifier: ${result.refused.join("; ")}`);
    return result.verified;
  };
  const SIX: StartPathChoice = { ...SIX_WORDS, members: SIX_IDS.map((viewpoint_id) => ({ viewpoint_id })) };

  it("a merged path of six is taken whole: the AI's suggestion, also when the AIs choose", () => {
    const byPerson = verifiedOf(atRoute(askOf(SIX)));
    expect(byPerson.paths[0]).toMatchObject({ pathId: "b1", author: "AI_SUGGESTION", ...SIX_WORDS, ownWords: [] });
    expect(byPerson.paths[0]!.viewpoints.map((one) => one.viewpointId)).toEqual(SIX_IDS);
    expect(verifiedOf(atRoute(askOf(SIX, "AIS")))).toMatchObject({ chosenBy: "AIS", paths: [{ author: "AI_SUGGESTION" }] });
    expect(StartMenuSchema.safeParse(sixMenu()).error?.issues ?? []).toEqual([]);
  });

  it("one taken out of six leaves five, the person's edit", () => {
    const five = verifiedOf(atRoute(askOf({ ...SIX, members: SIX.members.slice(0, 5) })));
    expect(five.paths[0]).toMatchObject({ author: "PERSON_EDITED", ownWords: [SIX_WORDS.title, SIX_WORDS.question] });
    expect(five.paths[0]!.viewpoints.map((one) => one.viewpointId)).toEqual(SIX_IDS.slice(0, 5));
    // Not the AIs' suggestion as written, so a set the AIs chose cannot carry it (Task 33's rule, unchanged).
    expect(codeOf(() => verifiedOf(atRoute(askOf({ ...SIX, members: SIX.members.slice(0, 5) }, "AIS"))))).toBe("START_PATHS_INVALID");
  });

  it("a fifth own word in a path is refused before any reference is read", () => {
    const refReads = vi.fn();
    const watched: StartStepKey = { get bytes() { refReads(); return KEY.bytes; } };
    // Not vacuous: a legal Start (the nuclear menu as built) reads its references through the key.
    expect("verified" in atRoute(askOf(P_KP01, "PERSON", MENU), watched)).toBe(true);
    expect(refReads).toHaveBeenCalled();
    refReads.mockClear();
    const fifth: StartPathChoice = { title: "My worries", question: "What do my own worries about new plants add?",
      members: Array.from({ length: 5 }, (_, at) => ({ own_text: `My own worry number ${String(at + 1)}.` })) };
    expect(atRoute(askOf(fifth, "PERSON", MENU), watched)).toEqual({ refused: ["a path holds at most 4 own words and picks"] });
    expect(refReads).not.toHaveBeenCalled();
  });
});

describe("verifyStartCheckAtAsk: the check at Next, read at Start", () => {
  const check = (request: AskRequest, binding: Parameters<typeof verifyStartCheckAtAsk>[0]["binding"] = BINDING) =>
    verifyStartCheckAtAsk({ key: KEY, binding, ask: request, now: NOW });

  it("verifies the lock; the line as read is not an edit, the line edited on step 2 is", () => {
    expect(check(ask())).toEqual({ lock: LOCK, questionEdited: false });
    expect(verifyStartCheckAtAsk({ key: KEY, binding: BINDING, ask: ask({ question_line: Q_EDITED }), now: NOW }))
      .toEqual({ lock: LOCK, questionEdited: true });
  });

  it("a lone check (no paths) verifies the same way", () => {
    expect(check(baseAsk({ start_check: { ref: checkRef() } }))).toEqual({ lock: LOCK, questionEdited: false });
    expect(check(baseAsk({ start_check: { ref: checkRef() }, question_line: Q_EDITED }))).toEqual({ lock: LOCK, questionEdited: true });
  });

  it("verifies under a swap: the card's question sent as written is not an edit", () => {
    const swap = { question_swap: { card_id: "cd1", original_question_line: Q } };
    expect(check(ask({ question_line: AS_QUESTION }, swap))).toEqual({ lock: LOCK, questionEdited: false });
    expect(check(ask({ question_line: `${AS_QUESTION}\n\nUp to 2050.` }, swap))).toEqual({ lock: LOCK, questionEdited: true });
  });

  it("signed under another settings version: verified (answer Q8)", () => {
    expect(check(ask({}, {}, { settingsVersion: 30 }))).toEqual({ lock: LOCK, questionEdited: false });
  });

  it("the original line of an accepted rewrite comes back in the lock", () => {
    const original = "Ar trebui România să construiască centrale nucleare noi?";
    const rewriteLock: QuestionLanguageLock = Object.freeze({ ...LOCK, source: "CHOICE", rewriteAccepted: true, originalQuestionLine: original,
      recordCode: "CHOICE_USE_REWRITE" });
    const ref = signStartCheck(KEY, { ...SIGNED_FOR, lock: rewriteLock, originalQuestionLine: original });
    expect(check(baseAsk({ start_check: { ref, original_question_line: original } }))).toEqual({ lock: rewriteLock, questionEdited: false });
    expect(check(baseAsk({ start_check: { ref } }))).toBeNull();
  });

  it.each([
    ["no start_check", () => check(baseAsk())],
    ["another owner", () => check(ask(), { ...BINDING, ownerScope: OTHER_OWNER })],
    ["a tampered ref", () => check(ask({ start_check: { ref: flippedMac(checkRef()) } }))],
    ["another plan", () => check(ask(), { ...BINDING, planKey: "plus" })],
    ["garbage", () => check(ask({ start_check: { ref: "x.y" } }))]
  ])("null for %s (a refused check is ignored)", (_name, run) => {
    expect(run()).toBeNull();
  });
});

describe("digPathTitleOf: a dig pick's path title", () => {
  it("the first line, trimmed", () => {
    expect(digPathTitleOf("Who pays if building runs years late?")).toBe("Who pays if building runs years late?");
    expect(digPathTitleOf("  Seasonal lulls?  \nWhat happens when the wind drops for a week?")).toBe("Seasonal lulls?");
  });

  it("over 120 characters: cut at the last space at or before the 119th, then …", () => {
    const words = `${"word ".repeat(30)}end`;
    const title = digPathTitleOf(words);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title).toBe(`${"word ".repeat(24).trimEnd()}…`);
    expect(digPathTitleOf("a".repeat(120))).toBe("a".repeat(120));
    expect(digPathTitleOf(`${"a".repeat(118)} bb`)).toBe(`${"a".repeat(118)}…`);
  });

  it("one long word is cut hard at 119, never inside a surrogate pair", () => {
    expect(digPathTitleOf("a".repeat(200))).toBe(`${"a".repeat(119)}…`);
    const title = digPathTitleOf(`${"a".repeat(118)}${"😀".repeat(5)}`);
    expect(title).toBe(`${"a".repeat(118)}…`);
    expect(title.length).toBeLessThanOrEqual(120);
  });
});
