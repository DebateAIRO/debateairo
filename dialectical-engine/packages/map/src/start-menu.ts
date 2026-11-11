import { START_STEP_LIMITS, TypedDomainError } from "@debateai/kernel";
import type { StartList, StartListViewpoint, StartMenu, StartMenuPath } from "@debateai/contract";
import type { StartMergeLateReply, StartMergeReply } from "./start-replies.js";

/**
 * The menu the person shapes before Start (V4 start step, spec 2026-11-03 §2, §4.1), built in code from the lists and the merge's reply.
 * Every viewpoint of every list it holds appears exactly once: shown in one path, or kept (its own words, as its list wrote it) as a repeat
 * of a shown viewpoint, at most eight to one; the ninth repeat of one viewpoint is shown as a path of its own. A late merge only appends:
 * every path, repeat, card and suggestion of the menu so far stays as it was, in its place. The map builds menus and never parses them: the
 * API and the runner check each against the contract's StartMenuSchema.
 */
const L = START_STEP_LIMITS;
/** The most repeats one shown viewpoint names (StartMenuViewpointSchema's repeat_ids). */
const START_REPEATS_PER_VIEWPOINT_MAX = 8;

type StartMenuLanguage = StartMenu["language"];
type StartMenuViewpoint = StartMenu["viewpoints"][number];

/** The menu path ref of the `no`-th path (1 → "kp01"), 1..54. */
export function startPathRefOf(no: number): string {
  if (!Number.isSafeInteger(no) || no < 1 || no > L.menuPathsMax) throw new TypeError("START_PATH_NO_INVALID");
  return `kp${String(no).padStart(2, "0")}`;
}
const startCardIdOf = (no: number): string => `cd${String(no)}`;
const startSuggestionIdOf = (no: number): string => `sg${String(no)}`;
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The menu's angles: every list's, once each, in angle order. */
function anglesOf(lists: readonly Pick<StartList, "angles">[]): StartMenu["angles"] {
  const seen = new Map<string, StartMenu["angles"][number]>();
  for (const angle of lists.flatMap((list) => list.angles)) if (!seen.has(angle.angle_id)) seen.set(angle.angle_id, angle);
  return [...seen.values()].sort((a, b) => byId(a.angle_id, b.angle_id));
}

/** The code menu: each viewpoint of one list its own path, in list order, revision 1, no card and no suggestion. */
export function startCodeMenu(list: StartList, input: Readonly<{ menuId: string; language: StartMenuLanguage }>): StartMenu {
  return {
    menu_id: input.menuId, revision: 1, language: input.language, angles: anglesOf([list]),
    viewpoints: list.viewpoints.map((one) => ({ ...one, repeat_ids: [] })),
    repeats: [],
    paths: list.viewpoints.map((one, at) => ({ path_ref: startPathRefOf(at + 1), title: one.title, question: one.question,
      viewpoint_ids: [one.viewpoint_id], put_together: false, is_new: false })),
    cards: [],
    suggestions: []
  };
}

/**
 * What a merge reply adds to a menu: its paths, in its order, then every viewpoint it left out (in id order), each as a path of its own.
 * A path of one viewpoint has that viewpoint's words; a group whose words the reader dropped has its first viewpoint's. A repeat joins the
 * repeat_ids of the viewpoint it repeats, up to eight; past that it is not a repeat and is shown as a left-out viewpoint is.
 */
function placed(input: Readonly<{ groups: readonly Readonly<{ ids: readonly string[]; title: string | null; question: string | null }>[];
  repeats: readonly Readonly<{ id: string; same_as: string }>[]; viewpoints: readonly StartListViewpoint[]; shown: Map<string, StartMenuViewpoint>;
  firstRef: number; isNew: boolean }>): Readonly<{ paths: StartMenuPath[]; shown: StartMenuViewpoint[]; repeats: StartListViewpoint[];
  numbers: ReadonlyMap<number, string> }> {
  const byViewpoint = new Map(input.viewpoints.map((one) => [one.viewpoint_id, one] as const));
  const used = new Set<string>();
  const shown: StartMenuViewpoint[] = [];
  const paths: StartMenuPath[] = [];
  const numbers = new Map<number, string>();
  const show = (ids: readonly string[], title: string | null, question: string | null): string => {
    const members = ids.map((id) => byViewpoint.get(id)!);
    for (const member of members) {
      const viewpoint: StartMenuViewpoint = { ...member, repeat_ids: [] };
      input.shown.set(member.viewpoint_id, viewpoint);
      shown.push(viewpoint);
      used.add(member.viewpoint_id);
    }
    const words = members.length > 1 && title !== null && question !== null;
    const ref = startPathRefOf(input.firstRef + paths.length);
    paths.push({ path_ref: ref, title: words ? title : members[0]!.title, question: words ? question : members[0]!.question,
      viewpoint_ids: members.map((member) => member.viewpoint_id), put_together: members.length > 1, is_new: input.isNew });
    return ref;
  };
  input.groups.forEach((group, at) => {
    const ids = group.ids.filter((id) => byViewpoint.has(id) && !used.has(id));
    if (ids.length > 0) numbers.set(at + 1, show(ids, group.title, group.question));
  });
  // The repeats, each once; every other viewpoint the reply left out is shown before the repeats are placed (a repeat may name it).
  const marked = new Map<string, string>();
  for (const repeat of input.repeats) {
    if (byViewpoint.has(repeat.id) && !used.has(repeat.id) && !marked.has(repeat.id)) marked.set(repeat.id, repeat.same_as);
  }
  for (const id of input.viewpoints.map((one) => one.viewpoint_id).filter((id) => !used.has(id) && !marked.has(id)).sort(byId)) show([id], null, null);
  const repeats: StartListViewpoint[] = [];
  const unplaced: string[] = [];
  for (const [id, sameAs] of marked) {
    const kept = input.shown.get(sameAs);
    if (kept === undefined || kept.repeat_ids.length >= START_REPEATS_PER_VIEWPOINT_MAX) { unplaced.push(id); continue; }
    kept.repeat_ids = [...kept.repeat_ids, id];
    repeats.push(byViewpoint.get(id)!);
    used.add(id);
  }
  // Past the eighth (or naming no shown viewpoint), a repeat is not one: it is shown, appended as a left-out viewpoint is.
  for (const id of unplaced.sort(byId)) show([id], null, null);
  return { paths, shown, repeats, numbers };
}

/**
 * The first menu, from the merge's reply over the lists: the reply's paths in its order (kp01..), every viewpoint it left out appended in
 * id order, its repeats kept, its cards (cd1..) and suggestions (sg1..) on the menu's paths. A card or suggestion that names a path the
 * reply does not have is left out (the reply's reader already leaves those out).
 */
export function startMenuFromMerge(reply: StartMergeReply, lists: readonly StartList[], input: Readonly<{ menuId: string; language: StartMenuLanguage }>):
  StartMenu {
  const shown = new Map<string, StartMenuViewpoint>();
  const made = placed({ groups: reply.paths, repeats: reply.repeats, viewpoints: lists.flatMap((list) => list.viewpoints), shown, firstRef: 1, isNew: false });
  const refOf = (no: number): string | undefined => made.numbers.get(no);
  const cards = reply.cards.slice(0, L.cardsMax).map((card, at) => ({ card_id: startCardIdOf(at + 1), kind: card.kind, sentence: card.sentence,
    new_path: { title: card.title, question: card.question }, fits_path_ref: card.fits_path === null ? null : refOf(card.fits_path) ?? null,
    as_question: card.as_question }));
  const suggestions: StartMenu["suggestions"] = [];
  for (const suggestion of reply.suggestions) {
    const [a, b] = suggestion.kind === "COMBINE" ? suggestion.paths : [suggestion.path, suggestion.into];
    const from = refOf(a);
    const to = refOf(b);
    if (from === undefined || to === undefined || from === to || suggestions.length >= L.suggestionsMax) continue;
    const suggestion_id = startSuggestionIdOf(suggestions.length + 1);
    suggestions.push(suggestion.kind === "COMBINE" ? { suggestion_id, kind: "COMBINE", path_refs: [from, to], reason: suggestion.reason }
      : { suggestion_id, kind: "FITS", path_ref: from, into_path_ref: to });
  }
  return { menu_id: input.menuId, revision: 1, language: input.language, angles: anglesOf(lists), viewpoints: made.shown, repeats: made.repeats,
    paths: made.paths, cards, suggestions };
}

/**
 * The menu after a late merge, as revision + 1 (at most nine): everything of the menu so far as it was, in place; the late lists' new paths
 * appended, marked new, their refs continuing; a late repeat joins the repeats of the viewpoint it repeats (at most eight, past that a new
 * path); each `fits` a FITS suggestion, while the menu has fewer than nine.
 */
export function startLateMenu(prior: StartMenu, reply: StartMergeLateReply, late: readonly StartList[]): StartMenu {
  if (prior.revision >= L.menuRevisionsMax) throw new TypedDomainError("START_MENU_REVISIONS_SPENT", "START_MENU_REVISIONS_SPENT: a menu has at most nine revisions");
  // The shown viewpoints of the menu so far, copied: a late repeat may add to their repeat_ids, never to the menu it was given.
  const viewpoints = prior.viewpoints.map((one) => ({ ...one, repeat_ids: [...one.repeat_ids] }));
  const shown = new Map(viewpoints.map((one) => [one.viewpoint_id, one] as const));
  const refNumbers = prior.paths.map((path) => Number(path.path_ref.slice(2)));
  const made = placed({ groups: reply.paths, repeats: reply.repeats, viewpoints: late.flatMap((list) => list.viewpoints), shown,
    firstRef: Math.max(0, ...refNumbers) + 1, isNew: true });
  const refs = new Set(prior.paths.map((path) => path.path_ref));
  const suggestions = [...prior.suggestions];
  for (const fit of reply.fits) {
    const from = made.numbers.get(fit.path);
    if (from === undefined || !refs.has(fit.into) || suggestions.length >= L.suggestionsMax) continue;
    suggestions.push({ suggestion_id: startSuggestionIdOf(suggestions.length + 1), kind: "FITS", path_ref: from, into_path_ref: fit.into });
  }
  return { ...prior, revision: prior.revision + 1, angles: anglesOf([prior, ...late]), viewpoints: [...viewpoints, ...made.shown],
    repeats: [...prior.repeats, ...made.repeats], paths: [...prior.paths, ...made.paths], suggestions };
}

/** The menu's first `width` paths: what code takes for "Just answer it" and "Let the AIs choose". */
export function startTopPaths(menu: StartMenu, width: number): readonly StartMenuPath[] {
  return Object.freeze(menu.paths.slice(0, Math.max(0, width)));
}
