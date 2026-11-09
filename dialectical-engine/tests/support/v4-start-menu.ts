import type {
  SignedStartList, SignedStartMenu, StartAngle, StartCard, StartMenu, StartMenuPath, StartMenuViewpoint, StartSuggestion
} from "../../packages/contract/src/index.js";

/*
 * V4 start step, Task 64: the shared fixture of step 2 (the list the person shapes before Start). One made-up question,
 * the menu its merge answers (nine paths from two lists, two cards, three suggestions), the menu a late merge answers
 * (revision 2), a menu with two paths and one with sixteen. Every menu passes StartMenuSchema; every text is made up.
 * The objects are frozen, so a model that changed its input would throw here instead of passing by luck.
 */

export const START_FIXTURE_QUESTION = "Should Romania build new nuclear plants?";

const WHY = "Made-up reason.";

function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) frozen(inner);
  }
  return value;
}

function viewpoint(viewpoint_id: string, title: string, question: string, angle_id: string): StartMenuViewpoint {
  return { viewpoint_id, title, question, why: WHY, angle_id, repeat_ids: [] };
}

function path(path_ref: string, title: string, question: string, viewpoint_ids: string[], is_new = false): StartMenuPath {
  return { path_ref, title, question, viewpoint_ids, put_together: viewpoint_ids.length > 1, is_new };
}

const ANGLES: StartAngle[] = [
  { angle_id: "g1", kind: "OPPOSITE_CASE", label: "The case against" },
  { angle_id: "g2", kind: "ASKER_WORRY", label: "Costs to households" },
  { angle_id: "g3", kind: "PRACTICAL", label: "Keeping the lights on" },
  { angle_id: "g4", kind: "SPECIFIC", label: "Security" },
  { angle_id: "g5", kind: "GENERAL", label: "The wider energy plan" }
];

const PT11 = viewpoint("pt11", "Whole-system costs", "What would new nuclear plants cost households once the whole power system is counted?", "g2");
const PT12 = viewpoint("pt12", "Falling prices", "Will falling prices for wind, sun and batteries make new nuclear plants a poor deal?", "g2");
const PT13 = viewpoint("pt13", "A calm winter week", "What happens to Romania's power in a cold winter week with little wind or sun?", "g3");
const PT14 = viewpoint("pt14", "Imports of fuel and minerals", "Would new plants make Romania depend on imported fuel and minerals?", "g4");
const PT15 = viewpoint("pt15", "Weapons spread and sabotage", "Could new plants raise the risk of weapons spread or sabotage?", "g4");
const PT21 = viewpoint("pt21", "Using less power first", "Would using less power first do more good than building new plants?", "g5");
const PT22 = viewpoint("pt22", "Unproven designs", "Are the new reactor designs proven enough to build?", "g1");
const PT23 = viewpoint("pt23", "Building delays", "How likely are long building delays, and who would pay for them?", "g1");
const PT24 = viewpoint("pt24", "Jobs in the regions", "What would new plants mean for jobs in Romania's regions?", "g5");
const PT25 = viewpoint("pt25", "Waste for centuries", "How would Romania keep the waste safe for centuries?", "g1");

const KP01 = path("kp01", PT11.title, PT11.question, ["pt11"]);
const KP02 = path("kp02", "Keeping the lights on in a calm winter week",
  "How would Romania keep the lights on in a cold winter week with little wind or sun?", ["pt13"]);
const KP03 = path("kp03", "Security and weapons risks", "Do imports and weapons risks make new plants less safe for Romania?", ["pt14", "pt15"]);
const KP04 = path("kp04", PT21.title, PT21.question, ["pt21"]);
const KP05 = path("kp05", "Unproven designs and risk", "How risky is it to build reactor designs that are not yet proven?", ["pt22"]);
const KP06 = path("kp06", PT12.title, PT12.question, ["pt12"]);
const KP07 = path("kp07", PT23.title, PT23.question, ["pt23"]);
const KP08 = path("kp08", PT25.title, PT25.question, ["pt25"]);
const KP09 = path("kp09", PT24.title, PT24.question, ["pt24"]);

const CARDS: StartCard[] = [
  {
    card_id: "cd1",
    kind: "CHOICE_NOT_WEIGHED",
    sentence: "A choice you may not have weighed: keep the reactors Romania already has running longer; it is often far cheaper than building new ones.",
    new_path: { title: "Running today's reactors longer", question: "Would running today's reactors longer serve Romania better than building new ones?" },
    fits_path_ref: null,
    as_question: "Should Romania keep its current reactors running longer instead of building new ones?"
  },
  {
    card_id: "cd2",
    kind: "WHAT_WOULD_CHANGE_IT",
    sentence: "What would change the answer: if storing power became much cheaper, new plants might matter less.",
    new_path: { title: "Cheaper storage", question: "Would much cheaper storage of power make new plants less needed?" },
    fits_path_ref: "kp01",
    as_question: null
  }
];

const SUGGESTIONS: StartSuggestion[] = [
  { suggestion_id: "sg1", kind: "COMBINE", path_refs: ["kp02", "kp04"], reason: "Both ask how to get through the hardest weeks." },
  { suggestion_id: "sg2", kind: "FITS", path_ref: "kp06", into_path_ref: "kp01" },
  { suggestion_id: "sg3", kind: "FITS", path_ref: "kp07", into_path_ref: "kp05" }
];

/** The first menu: five paths in at How wide 5 (kp03 put together by us), four more, two cards, three suggestions. */
export const NUCLEAR_MENU: StartMenu = frozen<StartMenu>({
  menu_id: "m".repeat(22),
  revision: 1,
  language: { code: "en", name: "English" },
  angles: ANGLES,
  viewpoints: [PT11, PT12, PT13, PT14, PT15, PT21, PT22, PT23, PT24, PT25],
  repeats: [],
  paths: [KP01, KP02, KP03, KP04, KP05, KP06, KP07, KP08, KP09],
  cards: CARDS,
  suggestions: SUGGESTIONS
});

const PT31 = viewpoint("pt31", "Cooling water in hot summers", "Will rivers stay cool enough in hot summers to cool the plants?", "g3");

/** A late merge's answer: list 3's idea as a new path kp10, and a suggestion that it fits kp02. */
export const NUCLEAR_MENU_REV2: StartMenu = frozen<StartMenu>({
  ...NUCLEAR_MENU,
  revision: 2,
  viewpoints: [...NUCLEAR_MENU.viewpoints, PT31],
  paths: [...NUCLEAR_MENU.paths, path("kp10", PT31.title, PT31.question, ["pt31"], true)],
  suggestions: [...NUCLEAR_MENU.suggestions, { suggestion_id: "sg4", kind: "FITS", path_ref: "kp10", into_path_ref: "kp02" }]
});

/** Fewer paths than How wide asks (choose-f22): kp01 and kp02 only, no cards, no suggestions. */
export const TWO_PATH_MENU: StartMenu = frozen<StartMenu>({
  ...NUCLEAR_MENU,
  viewpoints: [PT11, PT13],
  paths: [KP01, KP02],
  cards: [],
  suggestions: []
});

/*
 * Task 74's long "+ N more": NUCLEAR_MENU plus kp10..kp16, one made-up viewpoint each. A list holds at most six
 * viewpoints (ids pt<list><1-6>), so the seventh extra idea is list 4's first, pt41.
 */
const EXTRA_IDS = ["pt31", "pt32", "pt33", "pt34", "pt35", "pt36", "pt41"] as const;
const EXTRAS = EXTRA_IDS.map((id, index) => viewpoint(id, `Extra idea ${index + 1}`, `What does extra idea ${index + 1} add?`, "g5"));

export const SIXTEEN_PATH_MENU: StartMenu = frozen<StartMenu>({
  ...NUCLEAR_MENU,
  viewpoints: [...NUCLEAR_MENU.viewpoints, ...EXTRAS],
  paths: [...NUCLEAR_MENU.paths, ...EXTRAS.map((one, index) => path(`kp${10 + index}`, one.title, one.question, [one.viewpoint_id]))]
});

/** A menu as the merge hands it to the page: the menu and a made-up reference "menu<revision>.sig". */
export function signedMenu(menu: StartMenu): SignedStartMenu {
  return { menu, ref: `menu${menu.revision}.sig` };
}

/** List `n` (1-9) as the lists stream hands it to the page: one viewpoint pt<n>1 "List n idea", reference "list<n>.sig". */
export function signedList(n: number): SignedStartList {
  if (!Number.isSafeInteger(n) || n < 1 || n > 9) throw new TypeError("FIXTURE_LIST_NO_INVALID");
  return frozen<SignedStartList>({
    list: {
      list_no: n,
      angles: [ANGLES[0]!],
      viewpoints: [{ viewpoint_id: `pt${n}1`, title: `List ${n} idea`, question: `What does list ${n} ask about new nuclear plants?`, why: WHY,
        angle_id: ANGLES[0]!.angle_id }]
    },
    ref: `list${n}.sig`
  });
}
