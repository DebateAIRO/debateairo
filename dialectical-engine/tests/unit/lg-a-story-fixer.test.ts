// tests/unit/lg-a-story-fixer.test.ts
import { describe, expect, it } from "vitest";
import { STORY_ENGINE_TOKENS, classifyCheckerContent, classifyStoryContent, parseCheckerVerdict, parseStoryBody,
  type StoryMaterialIndex } from "@debateai/story";

const STOP = { finishReason: "stop" } as const;
const INDEX: StoryMaterialIndex = {
  nodeIds: new Set(["P1", "P2", "P3", "P4"]), positionIds: new Set(["P1", "P2"]), positionOrder: ["P1", "P2"],
  shapeIds: new Set(["general"]), pathCap: 8, scoreTexts: new Set(["0.64"]), engineTokens: new Set(STORY_ENGINE_TOKENS)
};
const paragraph = (text: string, refs: readonly string[] = ["P3"]) => ({ text, node_refs: [...refs] });
function story(): Record<string, any> {
  return {
    shape_id: "general",
    short: {
      headline: "The debate backs funding the extension, on the city's own figures.",
      summary: "Our reading of your question: whether the extension is worth its cost. It is, on the figures argued.",
      confidence: "Fairly sure, as long as the ridership forecast holds.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "Fund it: the savings argument held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "FELL", line: "Do not fund it: the cost objection was answered.", node_refs: ["P2", "P4"] }
      ],
      change: paragraph("A measured drop in ridership would move the savings point.")
    },
    why: { reasons: [paragraph("The savings argument held up: fares cover the running costs (P3).", ["P1", "P3"])] },
    long: { sections: [
      { title: "What you are really trying to decide", paragraphs: [paragraph("Our reading of your question: ...", [])] },
      { title: "The verdict in one paragraph", paragraphs: [paragraph("The debate supports funding it.", ["P1"])] },
      { title: "The paths explored", paragraphs: [paragraph("Funding held up.", ["P1", "P3"])] }
    ] },
    reviewer_note: null
  };
}
const CHECK = { satisfied: true, objection: null, criteria: { faithful_to_material: true, agrees_with_label: true,
  fair_to_losing_paths: true, no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
  goal_marked_as_reading: true, speaks_to_the_person: true } };

describe("LG-A: the story's two readers repair form in code (L15, L31)", () => {
  it("GLM's slip (unknown keys inside long, reviewer_note inside long as a list) is accepted, every text kept", () => {
    const sent = story();
    sent.long.reviewer_note = ["Only one point was argued.", "Read it as a reading, not a finding."];
    sent.long.style = "plain";
    sent.reviewer_note = undefined;
    const content = JSON.stringify(sent);
    expect(classifyStoryContent(content, INDEX, STOP)).toEqual({ parseStatus: "PARSED", parseError: null,
      jsonRepair: "INNER_UNASKED_KEYS", jsonRepairs: ["INNER_UNASKED_KEYS", "MEMBER_UNNESTED", "PARAGRAPHS_JOINED"] });
    expect(parseStoryBody(content, INDEX, STOP).reviewer_note)
      .toEqual({ text: "Only one point was argued.\n\nRead it as a reading, not a finding.", node_refs: [] });
  });

  it("MiMo's long written as the bare sections list is wrapped", () => {
    const sent = story();
    sent.long = sent.long.sections;
    expect(classifyStoryContent(JSON.stringify(sent), INDEX, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MEMBER_WRAPPED" });
  });

  it("a repaired story still meets every content check (an invented reference stays refused)", () => {
    const sent = story();
    sent.extra = 1;
    sent.why.reasons[0].node_refs = ["P99"];
    const refused = classifyStoryContent(JSON.stringify(sent), INDEX, STOP);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_UNKNOWN_NODE_REF");
  });

  it("the trailing-object path reads through the same fixer: prose, then a fenced story with a stray key and a straight quote", () => {
    const sent = story();
    sent.notes = "drafted twice";
    sent.long.sections[2].paragraphs[0].text = "Funding held up, „as the city said\" in its report.";
    // The straight quote written raw (MiMo's habit), so only the trailing-object read can decode it.
    const body = JSON.stringify(sent).replace("\\\"", "\"");
    const content = `I checked the material first.\n\`\`\`json\n${body}\n\`\`\``;
    expect(classifyStoryContent(content, INDEX, STOP)).toEqual({ parseStatus: "PARSED", parseError: null,
      jsonRepair: "TRAILING_OBJECT", jsonRepairs: ["TRAILING_OBJECT", "UNASKED_KEYS"] });
    const read = parseStoryBody(content, INDEX, STOP);
    expect(read).not.toHaveProperty("notes");
    expect(read.long.sections[2]!.paragraphs[0]!.text).toBe("Funding held up, „as the city said\" in its report.");
  });

  // (Task 7 review, L31) a stray text under a name the story uses for prose elsewhere may be the storyteller's words in
  // the wrong place: kept, so the reply is refused (and goes on to the structure-repair call), never read with it gone.
  it("never drops a stray text under a name the story declares as a text; an undeclared name is still dropped", () => {
    const probes: readonly ((sent: Record<string, any>) => void)[] = [
      (sent) => { sent.long.sections[0].text = "An extra paragraph the section wrote outside its list."; },
      (sent) => { sent.short.paths[0].text = "An explanation of the position line"; },
      (sent) => { sent.short.line = "A stray position line"; },
      (sent) => { sent.long.sections[0].headline = "A stray headline for the section"; }
    ];
    for (const probe of probes) {
      const sent = story();
      probe(sent);
      expect(classifyStoryContent(JSON.stringify(sent), INDEX, STOP).parseStatus).toBe("SCHEMA_FAILED");
    }
    const styled = story();
    styled.long.style = "plain";
    expect(classifyStoryContent(JSON.stringify(styled), INDEX, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
    expect(parseStoryBody(JSON.stringify(styled), INDEX, STOP)).toEqual(story());
  });

  it("the checker drops an extra key and keeps every verdict value", () => {
    const content = JSON.stringify({ ...CHECK, criteria: { ...CHECK.criteria, tone_ok: "yes" } });
    expect(classifyCheckerContent(content, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
    expect(parseCheckerVerdict(content, STOP)).toEqual(CHECK);
  });
});
