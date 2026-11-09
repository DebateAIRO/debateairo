import { describe, expect, it } from "vitest";
import { AnswerSchema, PublicDebateSchema, type Answer, type AnswerBranches, type PublicDebate, type PublicStoryShort } from "@debateai/contract";
import { buildPublicDebateBody } from "../../apps/api/src/publications.js";
import { extractCheckedText } from "../../apps/api/src/publication-check/material.js";
import { publicMapOf } from "../../apps/ui/lib/v4/publicMap.js";
import { publicPathViews } from "../../apps/ui/lib/v4/publicPage.js";
import { branchFixture, branchesFixture, outcomeFixture } from "../support/branchesFixture.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/*
 * V4 start step, Task 63 (spec 2026-11-03 §7, "Free debates that become public publish their paths"): a path debate's
 * snapshot carries its paths (publicBranchesOf), the person's own path among them, and the publication check reads every
 * title, question and own view with the question. Never the "+ N more" list, the point-of-view line, the carry-on box,
 * the evidence or the root's node id. An R22 answer publishes no `branches` key. The public page names each row by its
 * path's title and shows the person's own words as theirs, never as AI text. Made-up words only.
 */

const QUESTION_ONE = "What does the whole energy system cost if the plant closes?";
const OWN_QUESTION = "Do the jobs at Cernavodă stay if the plant closes?";
const OWN_VIEW = "My electricity bill went up twice this year.";

/** b1: put together by the AIs from one of their views and one the person wrote; argued, its trust word from its points. */
const AI_PATH = branchFixture(1, {
  title: "Whole-system costs", question: QUESTION_ONE, author: "AI_COMBINED",
  viewpoints: [{ title: "Grid costs", question: "What does the grid cost to keep?", own: false }, { title: null, question: OWN_VIEW, own: true }],
  outcome: outcomeFixture("READY", {
    view: { outcome: "HELPED", scope: "PATH", reason: "The bill rose with the grid costs.", own_words: [OWN_VIEW] },
    rests_on: ["n-grid", "n-bill"], trust: "SURE_FOR_CASE"
  })
});
/** b2: the person's own path, in their own words. */
const OWN_PATH = branchFixture(2, {
  title: "Cernavodă jobs", question: OWN_QUESTION, author: "PERSON_OWN_VIEW",
  viewpoints: [{ title: null, question: OWN_QUESTION, own: true }],
  outcome: outcomeFixture("READY", { trust: "STILL_ARGUED" })
});
const BRANCHES: AnswerBranches = branchesFixture([AI_PATH, OWN_PATH], {
  source: "MENU", width: 3,
  more: [{ more_id: "more-kp03", title: "Storage", question: "Could storage replace the plant?", is_new: true }],
  also_raised: ["Nobody looked at the river's water level."], carry_on_to_report: true
});

const answerOf = (branches?: AnswerBranches): Answer => AnswerSchema.parse({ ...buildFairShapedAnswer(), ...(branches === undefined ? {} : { branches }) });

const publicBody = (answer: Answer) => buildPublicDebateBody({
  runId: "run-1", answer, owner: { userId: "user-1", ownerRef: "owner-1" },
  readers: {
    stories: { readStoryShort: async () => null },
    repository: { readArgumentLanguageTag: async () => null, readAnswerFloor: async () => null } as never,
    mapViews: { readMapView: async () => null } as never
  },
  source: {} as never
});

const snapshotOf = (body: Awaited<ReturnType<typeof publicBody>>, extra: Partial<PublicDebate> = {}): PublicDebate => PublicDebateSchema.parse({
  ...body, public_ref: "22222222-2222-4222-8222-222222222222", author_pseudonym: "Stable Public Author", published_at: "2026-11-05T10:00:00.000Z", ...extra
});

describe("Task 63: a path debate's snapshot publishes its paths", () => {
  it("carries every path's title, the person's own path among them, and nothing the public page may not show", async () => {
    const body = await publicBody(answerOf(BRANCHES));
    expect(body.branches!.paths.map((path) => path.title)).toEqual(["Whole-system costs", "Cernavodă jobs"]);
    expect(body.branches!.paths.map((path) => path.author)).toEqual(["AI_COMBINED", "PERSON_OWN_VIEW"]);
    expect(body.branches!.paths[1]!.viewpoints).toEqual([{ title: null, question: OWN_QUESTION, own: true }]);
    expect(body.branches!.also_raised).toEqual(["Nobody looked at the river's water level."]);
    const text = JSON.stringify(body);
    for (const kept of ['"more"', '"view"', "carry_on_to_report", "rests_on", "root_node_id", "more-kp03", "The bill rose with the grid costs."]) {
      expect(text, kept).not.toContain(kept);
    }
    // The body is the snapshot without its three publication fields: it parses as one.
    expect(snapshotOf(body).branches).toEqual(body.branches);
  });

  it("is read by the publication check: both titles, every question and own view with the question; the answers so far with the story", async () => {
    const checked = extractCheckedText(snapshotOf(await publicBody(answerOf(BRANCHES))));
    for (const words of ["Whole-system costs", "Cernavodă jobs", QUESTION_ONE, OWN_QUESTION, "Grid costs", OWN_VIEW]) {
      expect(checked, words).toContainEqual({ kind: "QUESTION", text: words });
    }
    expect(checked).toContainEqual({ kind: "STORY", text: "The costs come before the savings." });
    expect(checked).toContainEqual({ kind: "STORY", text: "The costs were checked against two sources." });
    expect(checked).toContainEqual({ kind: "ARGUMENTS", text: "Nobody looked at the river's water level." });
    expect(checked.filter((leaf) => leaf.text === "b1" || leaf.text === "b2")).toEqual([]);
  });

  it("publishes an R22 answer exactly as before: no branches key", async () => {
    const body = await publicBody(answerOf());
    expect(Object.keys(body)).not.toContain("branches");
    expect(Object.keys(snapshotOf(body))).not.toContain("branches");
  });
});

describe("Task 63: the public page's rows of a path debate", () => {
  const STORY: PublicStoryShort = {
    headline: "Closing the plant costs more than it saves for now.",
    summary: "The savings come late; the jobs question is still argued.",
    confidence: "Fairly sure about the costs, less about the jobs.",
    paths: [
      { position_ref: "b1", fate: "HELD_UP", line: "Whole-system costs: held up. The costs come before the savings.", node_refs: [] },
      { position_ref: "b2", fate: "PARTLY_HELD", line: "The jobs stay only if the site is reused.", node_refs: [] }
    ],
    change: { text: "A cheaper way to keep the grid stable.", node_refs: [] },
    reviewer_note: null
  };
  const [COSTS, JOBS] = [STORY.paths[0]!, STORY.paths[1]!];

  it("names each row by its path's title and keeps the person's own words, each once, apart from the AI text", async () => {
    const debate = snapshotOf(await publicBody(answerOf(BRANCHES)), { story_short: STORY });
    const views = publicPathViews(debate);
    expect(views.map((view) => [view.ref, view.title])).toEqual([["b1", "Whole-system costs"], ["b2", "Cernavodă jobs"]]);
    // An AI path keeps only the views the person wrote into it; the person's own path is theirs whole (its title and question once).
    expect(views[0]!.ownWords).toEqual([OWN_VIEW]);
    expect(views[1]!.ownWords).toEqual(["Cernavodă jobs", OWN_QUESTION]);
    // The line is still the story's, as the AIs wrote it.
    expect(views[0]!.line).toBe(COSTS.line);
  });

  it("gives each row its path's own trust word, with no published tree", async () => {
    const debate = snapshotOf(await publicBody(answerOf(BRANCHES)), { story_short: STORY });
    const { map } = publicMapOf(debate);
    expect(map.paths.map((path) => [path.id, path.trust])).toEqual([["b1", "SURE_FOR_CASE"], ["b2", "STILL_ARGUED"]]);
    // A path that fell did not hold, whatever its word was.
    const fell: PublicStoryShort = { ...STORY, paths: [COSTS, { ...JOBS, fate: "FELL" }] };
    expect(publicMapOf(snapshotOf(await publicBody(answerOf(BRANCHES)), { story_short: fell })).map.paths[1]!.trust).toBe("DIDNT_HOLD");
  });

  it("counts a path the person rewrote as their own words whole, as a path they added; the AI view it grew from stays off the row", async () => {
    // Review of Task 63 (spec §7: "A path you added or rewrote is your own words"): PERSON_EDITED is the person's rewrite.
    const rewritten = branchFixture(2, {
      title: "Jobs after the closing", question: "Who hires the plant's workers once it closes?", author: "PERSON_EDITED",
      viewpoints: [{ title: "Local jobs", question: "What happens to local jobs?", own: false }],
      outcome: outcomeFixture("READY", { trust: "STILL_ARGUED" })
    });
    const debate = snapshotOf(await publicBody(answerOf(branchesFixture([AI_PATH, rewritten], { source: "MENU", width: 3 }))), { story_short: STORY });
    const views = publicPathViews(debate);
    expect(views.map((view) => [view.ref, view.title])).toEqual([["b1", "Whole-system costs"], ["b2", "Jobs after the closing"]]);
    expect(views[1]!.ownWords).toEqual(["Jobs after the closing", "Who hires the plant's workers once it closes?"]);
    // An AI path's own title and question are never the person's: only the view they wrote into it.
    expect(views[0]!.ownWords).toEqual([OWN_VIEW]);
  });

  it("leaves a debate without paths from Start as it was: no title, no own words", async () => {
    const debate = snapshotOf(await publicBody(answerOf()), { story_short: { ...STORY, paths: [{ ...COSTS, position_ref: "n-costs" }] } });
    expect(publicPathViews(debate).map((view) => [view.title, view.ownWords])).toEqual([[null, []]]);
    expect(publicMapOf(debate).map.paths[0]!.trust).toBeNull();
  });
});
