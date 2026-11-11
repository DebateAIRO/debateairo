// tests/unit/investigation-report-sizes.test.ts
// R22 decision 26: the report's sizes, measured with made-up debates. How many digs fit with every point at levels 1 to 3, when the list
// of deeper paths starts to shrink, and how much room a second round really needs (which is why it is 72 KiB and no longer 80). The dig's
// shape is a guess at a full one: 3 paths, 4 points each, a source on each path. The first real big debates will say how close it is.
import { describe, expect, it } from "vitest";
import { buildFramedPrompt, buildFramedRevisionPrompt } from "@debateai/providers";
import { REPORT_STORY_PROMPT_CONTRACT, type ReportAnswerDraft } from "@debateai/story";
import {
  INVESTIGATION_REPORT_ASK_ROOM_BYTES, INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES, buildInvestigationDossier, type Dossier, type DossierDig, type DossierInput
} from "../../apps/runner/src/investigation-dossier.js";
import { PATH_REWRITE_BODY_MAX_BYTES, pathRewriteBodyBytes, pathRewriteBodyFits } from "../../apps/runner/src/path-rewrite-material.js";
import { PATH_NO, PATH_YES, ROOT, firstPaths, investigationInput, readyDig } from "../support/investigation-close-world.js";

/** A word, in bytes as JSON carries them: English about 6, Chinese 3 bytes for each of about 2.5 characters, Hindi about 16. */
const SCRIPTS = Object.freeze({ en: "ridership ", zh: "客流量", hi: "यात्री ", ru: "пассажир " });
type Script = keyof typeof SCRIPTS;
const wordsOf = (script: Script, words: number): string => SCRIPTS[script].repeat(words);

const uuid = (head: number, a: number, b = 0) => `${String(head).padStart(8, "0")}-${String(a).padStart(4, "0")}-4000-8000-${String(b).padStart(12, "0")}`;
const PATH_WORDS = 30;
const POINT_WORDS = 45;

/** One full dig at `level`: 3 paths, 4 points each, a source on each path. */
function fullDig(script: Script, at: number, level: number, parentRunId: string, positionRef: string): DossierDig {
  const runId = uuid(level, at);
  const paths = [0, 1, 2].map((p) => {
    const positionRef2 = uuid(level + 50, at, p);
    return Object.freeze({ positionRef: positionRef2, statement: wordsOf(script, PATH_WORDS), extracts: Object.freeze([]),
      points: Object.freeze([0, 1, 2, 3].map((q) => Object.freeze({ id: uuid(level + 80, at, p * 10 + q), text: wordsOf(script, POINT_WORDS), onId: null,
        side: "for" as const, trust: null, disputed: q === 0 }))) });
  });
  return readyDig({ runId, parentRunId, positionRef, level, finishedAt: "2026-10-31T10:00:00.000Z",
    picks: [{ text: wordsOf(script, 15), by: "AI_SUGGESTION" }],
    rewrite: { ...readyDig().rewrite!, rewriteId: uuid(90, level, at), view: null, whatChanged: [wordsOf(script, 40), wordsOf(script, 40)],
      before: { line: wordsOf(script, PATH_WORDS), summary: null, fate: "HELD_UP" },
      after: { line: wordsOf(script, PATH_WORDS), summary: wordsOf(script, 60), fate: "PARTLY_HELD" },
      digPaths: paths.map((path) => ({ positionRef: path.positionRef, line: path.statement, fate: "HELD_UP" as const })) },
    ownMaterial: { answer: [], paths, sources: paths.map((path, p) => ({ pointId: path.points[0]!.id, site: `site${String(at)}.example.org`,
      link: `https://site${String(at)}.example.org/page-${String(p)}`, title: wordsOf(script, 8), quote: wordsOf(script, 15), line: wordsOf(script, 50) })) } });
}

/** `count` digs spread over levels 1 to 3 in a broad tree (one level-1 dig for every level-2, one level-2 for every level-3). */
function atTop(script: Script, count: number): readonly DossierDig[] {
  return Array.from({ length: count }, (_, at) => {
    const level = (at % 3) + 1;
    return fullDig(script, at, level, level === 1 ? ROOT : uuid(level - 1, at - 1), level === 1 ? (at % 2 === 0 ? PATH_YES : PATH_NO) : uuid(level + 49, at - 1, 0));
  });
}
/** `count` digs below level 3 (levels 4 to 10), hanging under a level-3 dig. */
function below(script: Script, count: number): readonly DossierDig[] {
  return Array.from({ length: count }, (_, at) => fullDig(script, at + 1000, 4 + (at % 7), uuid(3, 2), uuid(53, 2, 0)));
}
const debate = (script: Script, top: number, deep: number): DossierInput => investigationInput({
  question: { ...investigationInput().question, line: wordsOf(script, 15) },
  first: { ...investigationInput().first, paths: firstPaths(5) }, digs: [...atTop(script, top), ...below(script, deep)] });
const step = (input: DossierInput): number => {
  const built = buildInvestigationDossier(input);
  return built.kind === "BUILT" ? built.ladderStep : 99;
};
/** The most `count` for which `fits` holds, by doubling then halving. */
function most(fits: (count: number) => boolean, limit = 200): number {
  let low = 0;
  let high = 1;
  while (high < limit && fits(high)) { low = high; high *= 2; }
  high = Math.min(high, limit + 1);
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle; else high = middle;
  }
  return low;
}

describe("R22 decision 26: the sizes, with made-up debates", () => {
  const measured: Record<string, unknown> = {};

  it("how many full digs fit with every point at levels 1 to 3, and how many deeper digs the list then holds whole", () => {
    for (const script of ["en", "ru", "hi", "zh"] as const) {
      const digsWhole = most((count) => step(debate(script, count, 0)) === 1);
      const beside = (top: number) => most((deep) => step(debate(script, top, deep)) === 1, 200);
      measured[script] = { digsWhole, listBesideHalf: beside(Math.floor(digsWhole / 2)), listBesideQuarter: beside(Math.floor(digsWhole / 4)) };
    }
    // Printed for the report: the numbers the owner asked for.
    console.log("REPORT_SIZES", JSON.stringify(measured));
    const en = measured.en as { digsWhole: number; listBesideHalf: number };
    // Before decision 26 every dig of every level had to fit here; now only levels 1 to 3 do.
    expect(en.digsWhole).toBeGreaterThanOrEqual(8);
    expect(en.listBesideHalf).toBeGreaterThan(20);
    // Past the first number, levels 1 to 3 lose points only after the list has gone.
    const over = buildInvestigationDossier(debate("en", en.digsWhole + 1, 5)) as Dossier;
    expect(over.ladderStep).toBe(2);
    expect(over.leftOut).toBeGreaterThanOrEqual(15);
  });

  it("the room for a second round: the fullest one asked for, in the widest scripts, fits 72 KiB; 80 was more than it needs", () => {
    const worst: Record<string, number> = {};
    for (const script of ["en", "ru", "hi", "zh"] as const) {
      // A story at everything the writer is asked for: 600 words of answer, a long short answer and change, 30 paragraphs, 12 open questions.
      const answer: ReportAnswerDraft = { segments: [{ text: wordsOf(script, 600), rests_on: [] }] };
      const story = { short_answer: wordsOf(script, 80), what_would_change: wordsOf(script, 80),
        how_it_went: Array.from({ length: 30 }, (_, at) => ({ card: `G${String(at + 1)}`, paragraph: wordsOf(script, 80) })),
        still_open: Array.from({ length: 12 }, () => wordsOf(script, 30)) };
      const problem = JSON.stringify({ part: "how_it_went", problem: wordsOf(script, 60) });
      const dossier = buildInvestigationDossier(investigationInput({ digs: [] })) as Dossier;
      const first = buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: dossier.material.storyWriterOf(answer) }).packet;
      const blank = buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: dossier.material.storyWriterOf({ segments: [{ text: "-", rests_on: [] }] }) }).packet;
      const second = buildFramedRevisionPrompt(first, JSON.stringify(story), problem);
      worst[script] = pathRewriteBodyBytes(second) - pathRewriteBodyBytes(blank);
      expect(worst[script], script).toBeLessThanOrEqual(INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES);
    }
    console.log("REPORT_ROUND_TWO_BYTES", JSON.stringify(worst));
  });

  it("a debate at the very edge of the fit still sends every call under the guard, with round 2's room and an ask's", async () => {
    const edge = most((count) => step(debate("en", count, 0)) === 1);
    const dossier = buildInvestigationDossier(debate("en", edge, 0)) as Dossier;
    expect(dossier.kind).toBe("BUILT");
    expect(pathRewriteBodyFits(dossier.bodyBytes + INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES)).toBe(true);
    expect(dossier.bodyBytes).toBeLessThanOrEqual(PATH_REWRITE_BODY_MAX_BYTES - INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES);
    // With a list beside it, the ask's room is kept too, and ten whole deep paths fit in it.
    const withList = buildInvestigationDossier(debate("en", 4, 10)) as Dossier;
    const names = [...withList.material.deeper!.names].slice(0, 10);
    const asked = await withList.material.deeper!.askFor(names);
    const bytes = pathRewriteBodyBytes(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: asked.storyWriterOf({ segments: [{ text: "-", rests_on: [] }] }) }).packet);
    expect(pathRewriteBodyFits(bytes + INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES)).toBe(true);
    const field = asked.answerWriter.find((entry) => entry.name === "asked_paths")!.content;
    expect(field).not.toContain("points_left_out");
    console.log("REPORT_ASK_BYTES", JSON.stringify({ tenPaths: Buffer.byteLength(field, "utf8"), room: INVESTIGATION_REPORT_ASK_ROOM_BYTES }));
  });
});
