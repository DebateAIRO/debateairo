// tests/unit/investigation-dossier.test.ts
// W5-1: the final report's dossier — the same bytes every time, the rewrite cards in tree order, by map order, the rewritten
// paths with the story's line beside them, a FAILED rewrite bringing its dig's own material, the person's views beside
// their verdicts, the shown quotes cut to 120 characters, the earlier report from version 2 on, the 100K guard and the
// ladder: a level-10 tree still fits, whole statements only, and every shortening counted.
import { describe, expect, it } from "vitest";
import { buildFramedPrompt } from "@debateai/providers";
import { REPORT_STORY_PROMPT_CONTRACT } from "@debateai/story";
import {
  buildInvestigationDossier, digsInTreeOrder, dossierFieldsOf, investigationReportGuard, INVESTIGATION_REPORT_INPUT_OVER_LIMIT,
  type Dossier
} from "../../apps/runner/src/investigation-dossier.js";
import { pathRewriteBodyBytes, pathRewriteBodyFits } from "../../apps/runner/src/path-rewrite-material.js";
import {
  DIG_FAILED, DIG_NESTED, DIG_READY, OWN_VIEW, PATH_NO, PATH_YES, deepChain, failedDig, investigationInput, nestedDig, readyDig
} from "../support/investigation-close-world.js";

const built = (input = investigationInput()): Dossier => {
  const dossier = buildInvestigationDossier(input);
  if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
  return dossier;
};
const field = (dossier: Dossier, name: string): unknown => JSON.parse(dossierFieldsOf(dossier).find((entry) => entry.name === name)!.content);

describe("W5-1 the final report's dossier", () => {
  it("is the same bytes every time, whatever order the store hands the digs in", () => {
    const first = built();
    const again = built();
    const shuffled = built(investigationInput({ digs: [readyDig(), failedDig(), nestedDig()] }));
    expect(JSON.stringify(dossierFieldsOf(again))).toBe(JSON.stringify(dossierFieldsOf(first)));
    expect(JSON.stringify(dossierFieldsOf(shuffled))).toBe(JSON.stringify(dossierFieldsOf(first)));
    expect(shuffled.fingerprint).toBe(first.fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    // A different investigation is a different dossier.
    expect(built(investigationInput({ digs: [readyDig()] })).fingerprint).not.toBe(first.fingerprint);
  });

  it("orders the cards in tree order, by map order: a path's digs, then the digs of their own paths, then the next path", () => {
    expect(digsInTreeOrder(investigationInput()).map((dig) => dig.runId)).toEqual([DIG_READY, DIG_NESTED, DIG_FAILED]);
    const cards = field(built(), "follow_ups") as Array<{ ref: string; from: unknown; level: number }>;
    expect(cards.map((card) => [card.ref, card.from, card.level])).toEqual([
      ["G1", { debate: "first", path: "A1" }, 1],
      ["G2", { debate: "G1", path: "G1.D1" }, 2],
      ["G3", { debate: "first", path: "A2" }, 1]
    ]);
  });

  it("gives each path its latest rewrite, the story's line beside it, and the rewrites that made it, in order", () => {
    const first = field(built(), "first_debate") as { answer: unknown; paths: Array<Record<string, unknown>> };
    expect(first.answer).toEqual({ short: "Yes, for rush hour.", summary: "A second pier relieves the morning crush.", would_change: "Falling ridership would change it." });
    expect(first.paths[0]).toMatchObject({ ref: "A1", line: "Partly: a second pier helps at rush hour, not in winter.", fate: "PARTLY_HELD",
      story_line: "Yes: a second pier would relieve rush hour.", rewritten_by: ["G1"] });
    // A FAILED rewrite changes nothing: the path keeps the story's line.
    expect(first.paths[1]).toMatchObject({ ref: "A2", line: "No: the money is better spent on buses.", fate: "HELD_UP", rewritten_by: ["G3"] });
    expect(first.paths[1]).not.toHaveProperty("story_line");
  });

  it("a READY card holds the picks marked, the text before and after, what the dig changed, the verdict and the dig's paths", () => {
    const [card] = field(built(), "follow_ups") as Array<Record<string, unknown>>;
    expect(card).toEqual({
      ref: "G1", from: { debate: "first", path: "A1" }, level: 1,
      picks: [{ text: OWN_VIEW, marked: "PERSON_OWN_VIEW" }, { text: "How full are winter ferries?", marked: "AI_SUGGESTION" }],
      rewrite: {
        state: "READY",
        before: { line: "Yes: a second pier would relieve rush hour.", fate: "HELD_UP" },
        after: { line: "Partly: a second pier helps at rush hour, not in winter.", summary: "The dig found winter ridership falls by half.", fate: "PARTLY_HELD" },
        what_changed: ["The dig weakened the year-round case: winter ridership falls."],
        view: { outcome: "HELPED", scope: "PATH", reason: "Winter ridership does fall by half." },
        dig_paths: [{ ref: "G1.D1", line: "Winter ridership falls.", fate: "HELD_UP" }]
      }
    });
    // The person's view, word for word, marked as theirs, beside its verdict.
    expect(field(built(), "views")).toEqual([{ card: "G1", words: [OWN_VIEW], marked: "PERSON",
      verdict: { outcome: "HELPED", scope: "PATH", reason: "Winter ridership does fall by half." } }]);
  });

  it("a FAILED rewrite brings in its dig's own material: its paths and their points", () => {
    const cards = field(built(), "follow_ups") as Array<Record<string, unknown>>;
    expect(cards[2]).toMatchObject({ ref: "G3", rewrite: { state: "FAILED" }, own_material: { answer: [],
      paths: [{ ref: "G3.D1", statement: "Buses carry fewer at the peak.",
        points: [{ text: "A bus carries 80 people; a ferry 400.", on: "G3.D1", side: "for" }] }] } });
    // Its points are refs the answer may rest on.
    const dossier = built();
    const pointRef = ((cards[2] as { own_material: { paths: Array<{ points: Array<{ ref: string }> }> } }).own_material.paths[0]!.points[0]!.ref);
    expect(dossier.material.index.refs.has(pointRef)).toBe(true);
    expect(dossier.material.index.cardRefs).toEqual(["G1", "G2", "G3"]);
    expect([...dossier.cardRuns]).toEqual([["G1", DIG_READY], ["G2", DIG_NESTED], ["G3", DIG_FAILED]]);
  });

  it("keeps only the quote people see (at most 120 characters) and reader 1's line; the newest rewrite read is recorded", () => {
    const dossier = built();
    const sources = field(dossier, "sources") as Array<{ ref: string; quote: string; line: string }>;
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      expect(Array.from(source.quote).length).toBeLessThanOrEqual(120);
      expect(source.quote.endsWith("…")).toBe(true);
      expect(source.line).toBe("The city's own ridership counts.");
    }
    expect(dossier.sources.map((source) => source.site)).toEqual(["city.example.org", "city.example.org"]);
    expect(dossier.coveredRewrite).toEqual({ rewriteId: "88888888-8888-4888-8888-888888888888", recordedAt: "2026-10-31T12:05:00.000Z" });
    expect(buildInvestigationDossier(investigationInput({ digs: [] })).kind === "BUILT"
      && (built(investigationInput({ digs: [] })).coveredRewrite)).toBeNull();
  });

  it("from version 2 on holds the earlier report's answer (F8 A); version 1 has none", () => {
    expect(dossierFieldsOf(built()).some((entry) => entry.name === "earlier_report")).toBe(false);
    const later = built(investigationInput({ earlier: { version: 1, segments: ["Build it."] } }));
    expect(field(later, "earlier_report")).toEqual({ version: 1, answer: ["Build it."] });
  });

  it("puts the dossier first and the step's own fields after it, the reader and language fields last", () => {
    const dossier = built();
    const names = (fields: readonly { name: string }[]) => fields.map((entry) => entry.name);
    expect(names(dossier.material.answerWriter)).toEqual(["question", "first_debate", "follow_ups", "views", "sources", "answer_length"]);
    const opening = JSON.stringify(dossierFieldsOf(dossier));
    for (const fields of [dossier.material.answerWriter, dossier.material.storyWriterOf({ segments: [{ text: "Build it.", rests_on: [] }] })]) {
      expect(JSON.stringify(fields.slice(0, dossierFieldsOf(dossier).length))).toBe(opening);
    }
  });

  it("the 100K guard: a body of 195,904 bytes passes, 195,905 is refused before anything is sent", () => {
    expect(pathRewriteBodyFits(195_904)).toBe(true);
    expect(pathRewriteBodyFits(195_905)).toBe(false);
    const huge = buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: [{ name: "question", content: "q".repeat(200_000) }] }).packet;
    expect(() => investigationReportGuard(huge)).toThrow(expect.objectContaining({ code: INVESTIGATION_REPORT_INPUT_OVER_LIMIT }));
  });

  it("a level-10 tree fits the ladder: whole statements only, the shortening counted and disclosed", () => {
    const deep = investigationInput({ digs: deepChain(10) });
    const dossier = built(deep);
    expect(dossier.ladderStep).toBeGreaterThan(1);
    // The largest call (the storyteller's first packet plus round 2's room) stays under the line.
    const story = buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: dossier.material.storyWriterOf({ segments: [{ text: "x", rests_on: [] }] }) }).packet;
    expect(pathRewriteBodyFits(pathRewriteBodyBytes(story))).toBe(true);
    expect(pathRewriteBodyFits(pathRewriteBodyBytes(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT,
      material: dossier.material.answerWriter }).packet))).toBe(true);
    // Whole statements: every text kept is a text given, never cut inside.
    const cards = field(dossier, "follow_ups") as Array<Record<string, unknown>>;
    const given = new Set(deep.digs.flatMap((dig) => [dig.picks[0]!.text, ...(dig.rewrite?.whatChanged ?? [])]));
    for (const card of cards) {
      const texts = [(card.also_dug as { pick?: string } | undefined)?.pick, ...((card.rewrite as { what_changed?: string[] } | undefined)?.what_changed ?? []),
        ...((card.picks as Array<{ text: string }> | undefined) ?? []).map((pick) => pick.text)].filter((text): text is string => text !== undefined);
      for (const text of texts) expect(given.has(text)).toBe(true);
    }
    // The deepest levels went to one line first: a level-10 card is never fuller than a level-1 card.
    const form = (card: Record<string, unknown>) => ("also_dug" in card ? 0 : "dig_paths" in (card.rewrite as object) ? 2 : 1);
    const byLevel = new Map<number, number>();
    for (const card of cards) byLevel.set(card.level as number, Math.max(byLevel.get(card.level as number) ?? 0, form(card)));
    expect(byLevel.get(10) ?? 0).toBeLessThanOrEqual(byLevel.get(1) ?? 0);
    expect(dossierFieldsOf(dossier).some((entry) => entry.name === "left_out")).toBe(dossier.leftOut > 0);
    expect(dossier.ladderStep).toBeGreaterThanOrEqual(4);
  });

  it("every step of a small investigation is step 1: nothing left out, nothing disclosed", () => {
    const dossier = built();
    expect(dossier.ladderStep).toBe(1);
    expect(dossier.leftOut).toBe(0);
    expect(dossierFieldsOf(dossier).some((entry) => entry.name === "left_out")).toBe(false);
    // Paths named by their map ids map back: A1 is the first path, A2 the second.
    expect((field(dossier, "first_debate") as { paths: Array<{ ref: string }> }).paths.map((path) => path.ref)).toEqual(["A1", "A2"]);
    expect([PATH_YES, PATH_NO]).toHaveLength(2);
  });
});
