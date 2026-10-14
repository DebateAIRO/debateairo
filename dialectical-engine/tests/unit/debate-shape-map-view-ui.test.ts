import { describe, expect, it } from "vitest";
import { ContractHttpError, type Answer, type DebateMapView } from "@debateai/contract";
import { positionAiName, positionTitlesFrom, readAnswerMapView, type PositionTitleNode } from "../../apps/ui/lib/v3/mapView.js";
import { getDebateBundle } from "../../apps/ui/lib/api.js";
import { PREVIEW_MODEL_MAKERS } from "../../apps/ui/lib/previewPlanRoster.js";
import { STORY_FIXTURE_ANSWER } from "../../apps/ui/lib/v3/storyFixture.js";

/** Debate shape P2c: the owner page reads the map view beside the answer, and titles each position with it. */

/**
 * The one key the titles read, as Wording picks option 1 words it. `public.positionTitle` reaches
 * en/public.json only in Task 7 Step 9a, and `t()` does not fall back to the public catalogue, so
 * this test carries the key itself (pre-flight PF-C20).
 */
const ENGLISH_TITLE: Record<string, string> = { "public.positionTitle": "The case for {answer}, argued by {ai}" };

/** A reviewed preview model id, found by its family, so this test writes no model id of its own. */
function previewModel(family: RegExp): string {
  const id = Object.keys(PREVIEW_MODEL_MAKERS).find((candidate) => family.test(candidate));
  if (id === undefined) throw new Error(`PREVIEW_MODEL_MISSING: no preview model matches ${String(family)}`);
  return id;
}

const VIEW: DebateMapView = {
  positions: [
    { node_id: "n-hybrid", answer: "Move gradually, with hybrid work" },
    { node_id: "n-yes", answer: "Move now" },
    { node_id: "node:not-in-answer", answer: "Stay" }
  ],
  also_raised: ["Ask the school about a mid-year move."]
};

describe("debate shape P2c — readAnswerMapView", () => {
  const answer = { answer_id: STORY_FIXTURE_ANSWER.answer_id };

  it("reads the view, says 'none' for a 404, and 'could not read' for anything else", async () => {
    expect(await readAnswerMapView({ readAnswerMapView: async () => VIEW }, answer)).toEqual({ mapView: VIEW, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("NOT_FOUND", 404, "MAP_VIEW_NOT_FOUND"); }
    }, answer)).toEqual({ mapView: null, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "boom"); }
    }, answer)).toEqual({ mapView: null, failed: true });
    // A client without the method (an older test double) is a failed read, never a thrown page.
    expect(await readAnswerMapView({} as never, answer)).toEqual({ mapView: null, failed: true });
  });

  it("rides the served bundle beside the floor", async () => {
    const client = {
      readRun: async () => ({ run_ref: STORY_FIXTURE_ANSWER.run_ref, question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null, argument_language: null }),
      readRunAnswer: async () => STORY_FIXTURE_ANSWER as Answer,
      readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); },
      readAnswerMapView: async () => VIEW
    };
    const bundle = await getDebateBundle(STORY_FIXTURE_ANSWER.run_ref, "cookie-session", client as never);
    expect(bundle.kind).toBe("served");
    expect(bundle.kind === "served" ? bundle.mapViewRead : null).toEqual({ mapView: VIEW, failed: false });
  });
});

describe("debate shape P2c — positionTitlesFrom", () => {
  const nodes = STORY_FIXTURE_ANSWER.nodes;

  it("titles each position the answer holds, in the catalogue it is given", () => {
    const titles = positionTitlesFrom(VIEW, nodes, ENGLISH_TITLE);
    expect([...titles.keys()]).toEqual(["n-hybrid", "n-yes"]);
    // storyFixture.ts: n-hybrid is xAI's Grok model, n-yes is OpenAI's GPT model.
    expect(titles.get("n-hybrid")).toBe("The case for Move gradually, with hybrid work, argued by Grok");
    const romanian = { "public.positionTitle": "Argumentele pentru {answer}, susținute de {ai}" };
    expect(positionTitlesFrom(VIEW, nodes, romanian).get("n-yes")).toBe("Argumentele pentru Move now, susținute de GPT");
  });

  it("gives no title without a view, or for a position whose AI is not known", () => {
    expect(positionTitlesFrom(null, nodes, ENGLISH_TITLE).size).toBe(0);
    const anonymous = nodes.map((node) => ({ ...node, maker_lineage: null }));
    expect(positionTitlesFrom(VIEW, anonymous, ENGLISH_TITLE).size).toBe(0);
  });

  it("names the AI in plain words and never shows a raw model id (pre-flight PF-C23, ruling C-NAMES)", () => {
    const glm = previewModel(/glm/iu);
    const qwen = previewModel(/qwen/iu);
    const unknown = "acme-lab/acme-7b-chat";
    // A preview model: its maker's display name, even when the recorded maker is not a plain name.
    expect(positionAiName({ maker: "provider:zai", model_id: glm })).toBe("Z.AI");
    // Qwen: its maker's name, never "Qwen (local)" from the interface's compose words.
    expect(positionAiName({ maker: "Alibaba", model_id: qwen })).toBe("Alibaba");
    // A model the UI does not know: the recorded maker when it is a plain name, else nothing.
    expect(positionAiName({ maker: "Acme", model_id: unknown })).toBe("Acme");
    expect(positionAiName({ maker: "provider:acme", model_id: unknown })).toBeNull();
    expect(positionAiName({ maker: unknown, model_id: unknown })).toBeNull();

    const glmNode: PositionTitleNode = { node_id: "n-glm", maker_lineage: { maker: "Z.AI", model_id: glm } };
    const qwenNode: PositionTitleNode = { node_id: "n-qwen", maker_lineage: { maker: "Alibaba", model_id: qwen } };
    const unknownNode: PositionTitleNode = { node_id: "n-unknown", maker_lineage: { maker: "provider:acme", model_id: unknown } };
    const view: DebateMapView = {
      positions: [{ node_id: "n-glm", answer: "Stay" }, { node_id: "n-qwen", answer: "Wait a year" }, { node_id: "n-unknown", answer: "Go" }],
      also_raised: []
    };
    const titles = positionTitlesFrom(view, [glmNode, qwenNode, unknownNode], ENGLISH_TITLE);
    expect([...titles.entries()]).toEqual([
      ["n-glm", "The case for Stay, argued by Z.AI"],
      ["n-qwen", "The case for Wait a year, argued by Alibaba"]
    ]);
    for (const title of titles.values()) {
      for (const id of [glm, qwen, unknown]) expect(title).not.toContain(id);
    }
  });

  it("drops the answer's closing punctuation, and gives no title when nothing is left (pre-flight PF-C24)", () => {
    const view = (answer: string): DebateMapView => ({ positions: [{ node_id: "n-yes", answer }], also_raised: [] });
    expect(positionTitlesFrom(view("Move now."), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for Move now, argued by GPT");
    expect(positionTitlesFrom(view("  Move now?! "), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for Move now, argued by GPT");
    expect(positionTitlesFrom(view("现在搬。"), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for 现在搬, argued by GPT");
    expect(positionTitlesFrom(view(" ?! "), nodes, ENGLISH_TITLE).size).toBe(0);
  });
});
