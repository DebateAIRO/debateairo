import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { basisKey, OPEN_QUESTION_KINDS, READING_LEVELS, DIG_MODES, TRUST_BASES, TRUST_WORDS } from "../../apps/ui/lib/v4/types.js";
import { DIG_LEVEL_MAX, POINT_OF_VIEW_OUTCOMES, POINT_OF_VIEW_SCOPES } from "../../packages/contract/src/web.js";

/*
 * V4 initial (2026-10-28): the v4 namespace has no English backstop in t() (only chrome/home/newDebate/support/time
 * do), so a key missing from messages/en/v4.json would show as the raw key on the page. Every literal "v4.…" key the
 * V4 code reads must exist, with a non-empty value, and every key built from a shared word list must exist for every word.
 */
const ui = resolve(import.meta.dirname, "../../apps/ui");
const catalog = JSON.parse(readFileSync(join(ui, "messages/en/v4.json"), "utf8")) as Record<string, string>;
const v4Dirs = ["app/v4", "components/v4", "lib/v4"];

/** The approved page lines of the web search and the digs (PERPLEXITY-DESIGN.md §7.1; owner Q14: a percentage). */
const APPROVED_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.web.sureBasis": "A second AI agreed, and the point rests on a page we looked up.",
  "v4.web.failed": "We couldn't look things up on the web this time. The points below come from the AIs' own knowledge.",
  "v4.web.free": "Not checked on the web; paid plans look things up.",
  "v4.dig.quotaShare": "This dig uses about {percent}% of today. After it you can still finish your report.",
  "v4.dig.quotaDayUsed": "You've used what today allows for digging. Write your report now, or keep digging after {time}.",
  "v4.rail.writeReport": "Write my report"
});

/**
 * Dig model revision (W2-7): the verdict lines on the person's point of view, draft 5.3 of
 * docs/superpowers/plans/2026-10-30-dig-model-revision.md, approved as written by the owner (30 Oct). Code picks the line
 * from the outcome and scope; a NOT_SETTLED verdict has one line whatever its scope.
 */
const APPROVED_VIEW_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.view.HELPED.PATH": "Your point of view helped this path.",
  "v4.view.HELPED.MAIN_QUESTION": "Your point of view helped this path and the main question.",
  "v4.view.DID_NOT_HELP.PATH": "Your point of view did not help this path.",
  "v4.view.DID_NOT_HELP.MAIN_QUESTION": "Your point of view did not help this path or the main question.",
  "v4.view.NOT_SETTLED": "The dig could not settle whether your point of view helps.",
  "v4.view.asYours": "The AIs weighed your point of view as yours. They did not take it as a finding.",
  "v4.view.why": "Why: {reason}"
});

/** Owner Q20: labels drafted for the owner's click-test, not yet approved. */
const DRAFTED_UNTIL_CLICK_TEST: readonly string[] = Object.freeze([
  "v4.web.noSearch",
  "v4.web.noSearch.noReason",
  "v4.web.switchedOff",
  "v4.web.previewOnly",
  "v4.web.fewerReaders",
  "v4.web.otherPages",
  "v4.web.addResearched",
  "v4.web.researched.READING",
  "v4.web.researched.ADDS",
  "v4.web.researched.ADDS_NOTHING",
  "v4.web.researched.FAILED",
  "v4.room.blockedUntil",
  "v4.suggest.kind.CONTRADICTING",
  "v4.suggest.kind.UNDOCUMENTED",
  "v4.suggest.kind.NEEDS_MORE_WEB",
  "v4.suggest.kind.HELPS_MAIN_QUESTION.FOR",
  "v4.suggest.kind.HELPS_MAIN_QUESTION.AGAINST",
  "v4.suggest.ownView",
  "v4.suggest.edit",
  // Dig model revision (W2-7): the page labels of section 5.5 (no search-words box: the owner corrected that on 30 Oct).
  "v4.view.heading",
  "v4.rewrite.changedSince.one",
  "v4.rewrite.changedSince.other",
  "v4.rewrite.changedSinceReport",
  "v4.rewrite.whatChanged",
  "v4.rewrite.rewrittenOnce",
  "v4.rewrite.rewrittenMany",
  "v4.rewrite.showEarlier",
  "v4.rewrite.hideEarlier",
  "v4.rewrite.before",
  "v4.rewrite.seeDigPoints",
  "v4.rewrite.openDigMap",
  "v4.rewrite.state.WRITING",
  "v4.rewrite.state.NO_CHANGE",
  "v4.rewrite.state.FAILED",
  "v4.rewrite.changedBelow",
  "v4.rewrite.digCard.CHANGED",
  "v4.rewrite.digCard.NO_CHANGE",
  "v4.rewrite.digCard.RUNNING",
  "v4.rewrite.digCard.WAITING",
  "v4.rewrite.digCard.FAILED",
  "v4.nest.digHereToo",
  "v4.nest.trailRoot",
  "v4.nest.level",
  "v4.nest.deepest",
  "v4.nest.tooDeep",
  "v4.digPage.lookedInto",
  "v4.digPage.rewrote",
  "v4.digPage.backToPath",
  "v4.digPage.rewriting",
  "v4.changes.digChanged",
  "v4.changes.digNoChange",
  "v4.report.pathsChangedHeading",
  // The money rule (owner, 31 Oct): the estimate before a new question, the borrow notice, new starts after the reset,
  // the month pause and Continue.
  "v4.room.startShare",
  "v4.money.borrowed.PERSON_DAY",
  "v4.money.borrowed.PERSON_WEEK",
  "v4.money.startsWait.PERSON_DAY",
  "v4.money.startsWait.PERSON_WEEK",
  "v4.money.startsWait.PERSON_MONTH",
  "v4.debate.state.PAUSED_MONTH",
  "v4.money.paused",
  "v4.money.pausedReady",
  "v4.money.continue",
  "v4.money.continueNote",
  "v4.money.continuing",
  "v4.money.continueTooEarly"
]);

function sources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push({ path: relative(ui, full), text: readFileSync(full, "utf8") });
    }
  };
  for (const dir of v4Dirs) walk(join(ui, dir));
  return out;
}

describe("V4 catalogue keys", () => {
  it("every key in messages/en/v4.json is a v4 key with English text", () => {
    for (const [key, value] of Object.entries(catalog)) {
      expect(key.startsWith("v4."), key).toBe(true);
      expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
    }
  });

  it("every literal v4 key the V4 code reads exists", () => {
    const missing: string[] = [];
    for (const { path, text } of sources()) {
      // storage.ts names this browser's storage slots ("v4.seen.<id>", …), which share the prefix but are not text keys.
      if (path === "lib/v4/storage.ts") continue;
      for (const match of text.matchAll(/["'`](v4\.[A-Za-z0-9_.]+)["'`]/g)) {
        const key = match[1]!;
        // A plural read names its stem; the catalogue holds the .one/.other forms.
        if (key in catalog || `${key}.other` in catalog) continue;
        missing.push(`${path}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every key built from a shared word list exists for every word", () => {
    const built = [
      ...TRUST_WORDS.flatMap((word) => [`v4.trust.${word}`, `v4.trustCount.${word}`]),
      // W2-6: the new "Sure" basis reads the approved "v4.web.sureBasis"; every other basis its "v4.basis.<BASIS>".
      ...TRUST_BASES.map(basisKey),
      ...["HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE"].map((fate) => `v4.fate.${fate}`),
      ...READING_LEVELS.map((level) => `v4.readingLevel.${level}`),
      ...DIG_MODES.map((mode) => `v4.digMode.${mode}`)
    ];
    expect(built.filter((key) => !(key in catalog))).toEqual([]);
    // Every key built at run time from a literal stem ("v4.x.${…}") has at least one catalogue key under that stem, and a
    // stem that words open-question kinds words all three of them.
    for (const { path, text } of sources()) {
      for (const match of text.matchAll(/`(v4\.[A-Za-z0-9_.]+\.)\$\{[^}]*\}`/g)) {
        const stem = match[1]!;
        expect(Object.keys(catalog).some((key) => key.startsWith(stem)), `${path}: ${stem}…`).toBe(true);
        // STILL_ARGUED is also a trust word, so only the two kinds of its own mark a stem as worded per kind.
        if (!(`${stem}OBJECTION` in catalog) && !(`${stem}WOULD_CHANGE` in catalog)) continue;
        const absent = OPEN_QUESTION_KINDS.filter((kind) => !(`${stem}${kind}` in catalog));
        expect(absent, `${path}: ${stem}<kind>`).toEqual([]);
      }
    }
  });

  it("the owner-approved web and dig lines are in the catalogue word for word", () => {
    // Perplexity plan W1-7 (2026-10-30): PERPLEXITY-DESIGN.md §7.1 "User-facing words", all approved by the owner; the dig
    // line shows a PERCENTAGE of today (owner Q14). "Write my report" is the rail's existing key.
    expect(Object.fromEntries(Object.keys(APPROVED_LINES).map((key) => [key, catalog[key]]))).toEqual(APPROVED_LINES);
  });

  it("the drafted labels (owner Q20) are all there until the owner approves them at the click-test", () => {
    // Owner Q20 (2026-10-30): these labels are drafted in plain English and approved by the owner at the click-test, in
    // place on the map (checkpoints C1 and C2). Until then they are DRAFTS: change their words here and in v4.json together.
    expect(DRAFTED_UNTIL_CLICK_TEST.filter((key) => !(key in catalog))).toEqual([]);
    expect(DRAFTED_UNTIL_CLICK_TEST.filter((key) => key in APPROVED_LINES || key in APPROVED_VIEW_LINES)).toEqual([]);
    expect(new Set(DRAFTED_UNTIL_CLICK_TEST).size).toBe(DRAFTED_UNTIL_CLICK_TEST.length);
  });

  it("the approved point-of-view lines (draft 5.3) are in the catalogue word for word, one per outcome and scope", () => {
    expect(Object.fromEntries(Object.keys(APPROVED_VIEW_LINES).map((key) => [key, catalog[key]]))).toEqual(APPROVED_VIEW_LINES);
    const built = POINT_OF_VIEW_OUTCOMES.flatMap((outcome) => outcome === "NOT_SETTLED"
      ? [`v4.view.${outcome}`]
      : POINT_OF_VIEW_SCOPES.map((scope) => `v4.view.${outcome}.${scope}`));
    expect(built.filter((key) => !(key in APPROVED_VIEW_LINES))).toEqual([]);
  });

  it("no search-words label is drafted (the owner's correction of 30 Oct), and the level labels name DIG_LEVEL_MAX", () => {
    expect(Object.entries(catalog).filter(([key, value]) => /search ?words/iu.test(`${key} ${value}`))).toEqual([]);
    const levelLabels = ["v4.nest.level", "v4.nest.deepest", "v4.nest.tooDeep"];
    for (const key of levelLabels) expect(catalog[key], key).toContain(String(DIG_LEVEL_MAX));
  });

  it("placeholders are well formed", () => {
    for (const [key, value] of Object.entries(catalog)) {
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      expect(opens, key).toBe(closes);
      for (const placeholder of value.matchAll(/\{([^}]*)\}/g)) expect(placeholder[1], key).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
  });
});
