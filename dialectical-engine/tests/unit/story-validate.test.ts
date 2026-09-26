import { describe, expect, it } from "vitest";
import { STORY_BODY_LIMITS, type StoryBody } from "@debateai/contract";
import { schemaFailureLocator, type ContentClassification } from "@debateai/providers";
import {
  classifyCheckerContent,
  classifyStoryContent,
  parseCheckerVerdict,
  parseStoryBody,
  type StoryMaterialIndex
} from "@debateai/story";

/**
 * Verdict story, Task 2 — the deterministic checks that run as the
 * storyteller's content classifier (spec §5.3). A refusal must reach the
 * repair packet as a CODE and a machine PATH, never as the model's own words.
 */

/** The material names points by short references (Task 3); the index holds exactly those. */
const INDEX: StoryMaterialIndex = {
  nodeIds: new Set(["P1", "P2", "P3", "P4"]),
  positionIds: new Set(["P1", "P2"]),
  positionOrder: ["P1", "P2"],
  shapeIds: new Set(["general", "health"]),
  pathCap: 8
};

function paragraph(text: string, refs: readonly string[] = ["P3"]): { text: string; node_refs: string[] } {
  return { text, node_refs: [...refs] };
}

function story(): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate backs funding the extension, on the city's own figures.",
      summary: "Our reading of your question: whether the extension is worth its cost. It is, on the figures argued.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "Fund it: the savings argument held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "FELL", line: "Do not fund it: the cost objection was answered.", node_refs: ["P2", "P4"] }
      ],
      change: paragraph("A measured drop in ridership would move the savings point.")
    },
    long: {
      sections: [
        { title: "What you are really trying to decide", paragraphs: [paragraph("Our reading of your question: ...", [])] },
        { title: "The verdict in one paragraph", paragraphs: [paragraph("The debate supports funding it.", ["P1"])] },
        { title: "The paths explored", paragraphs: [paragraph("Funding held up.", ["P1", "P3"])] }
      ]
    },
    reviewer_note: null
  };
}

function refused(result: ContentClassification): { code: string; path: string } {
  if (result.parseStatus === "PARSED") throw new Error("expected the classifier to refuse the content");
  return { ...schemaFailureLocator(result) };
}

describe("verdict story — the story classifier", () => {
  it("accepts a well-formed story and parses it unchanged", () => {
    const content = JSON.stringify(story());
    expect(classifyStoryContent(content, INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(parseStoryBody(content, INDEX)).toEqual(story());
  });

  it("refuses text that is not JSON as PARSE_FAILED", () => {
    expect(classifyStoryContent("Here is the story: {", INDEX).parseStatus).toBe("PARSE_FAILED");
  });

  it("refuses a headline over 160 characters with a code and the member's path", () => {
    const body = story();
    body.short.headline = "h".repeat(161);
    expect(refused(classifyStoryContent(JSON.stringify(body), INDEX))).toEqual({ code: "SCHEMA_FAILED", path: "short.headline" });
  });

  it("refuses a member the form does not have", () => {
    expect(classifyStoryContent(JSON.stringify({ ...story(), notes: "extra" }), INDEX).parseStatus).toBe("SCHEMA_FAILED");
  });

  it("refuses a citation of a point the debate does not have, by path, without echoing it", () => {
    const body = story();
    body.long.sections[1]!.paragraphs[0]!.node_refs = ["P1", "node:invented-by-the-model"];
    const result = classifyStoryContent(JSON.stringify(body), INDEX);
    expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "long.sections.1.paragraphs.0.node_refs.1" });
    expect(result.parseError).not.toContain("invented-by-the-model");
    expect(() => parseStoryBody(JSON.stringify(body), INDEX))
      .toThrowError(expect.objectContaining({ code: "STORY_CONTENT_INVALID" }));
  });

  it("accepts markup and links as plain text: the story is data, never rendered", () => {
    const body = story();
    const text = "<script>alert(1)</script> See [the council report](https://example.com/report) for more.";
    body.long.sections[2]!.paragraphs[0]!.text = text;
    body.short.headline = "<b>Fund it</b>";
    const content = JSON.stringify(body);
    expect(classifyStoryContent(content, INDEX).parseStatus).toBe("PARSED");
    const parsed = parseStoryBody(content, INDEX);
    expect(parsed.long.sections[2]!.paragraphs[0]!.text).toBe(text);
    expect(parsed.short.headline).toBe("<b>Fund it</b>");
  });

  it.each([
    ["a path whose position_ref is not a position", (body: StoryBody): void => {
      body.short.paths[1]!.position_ref = "P3";
    }, "short.paths.1.position_ref"],
    ["the same position twice", (body: StoryBody): void => {
      body.short.paths[1]!.position_ref = "P1";
    }, "short.paths.1.position_ref"],
    ["a position left out", (body: StoryBody): void => {
      body.short.paths = [body.short.paths[0]!];
    }, "short.paths"],
    ["a shape that is not offered", (body: StoryBody): void => {
      body.shape_id = "legal";
    }, "shape_id"],
    ["an unknown citation in the change text", (body: StoryBody): void => {
      body.short.change.node_refs = ["node:elsewhere"];
    }, "short.change.node_refs.0"],
    ["an unknown citation in a path line", (body: StoryBody): void => {
      body.short.paths[0]!.node_refs = ["P1", "node:elsewhere"];
    }, "short.paths.0.node_refs.1"],
    ["an unknown citation in the reviewer's note", (body: StoryBody): void => {
      body.reviewer_note = paragraph("The verdict leans on one argued point.", ["node:elsewhere"]);
    }, "reviewer_note.node_refs.0"]
  ])("refuses %s", (_name, mutate, path) => {
    const body = story();
    mutate(body);
    expect(refused(classifyStoryContent(JSON.stringify(body), INDEX))).toEqual({ code: "SCHEMA_FAILED", path });
  });

  it.each([
    ["a NUL in the headline", (body: StoryBody): void => {
      body.short.headline = "Fund the\u0000 extension";
    }, "short.headline"],
    ["a right-to-left override in a paragraph", (body: StoryBody): void => {
      body.long.sections[2]!.paragraphs[0]!.text = "Funding \u202Edleh\u202C up.";
    }, "long.sections.2.paragraphs.0.text"],
    ["a directional isolate in a path line", (body: StoryBody): void => {
      body.short.paths[1]!.line = "Do not fund it: \u2067the cost objection\u2069 was answered.";
    }, "short.paths.1.line"],
    ["an escape character in a section title", (body: StoryBody): void => {
      body.long.sections[0]!.title = "What you are \u001B[31mreally\u001B[0m deciding";
    }, "long.sections.0.title"],
    ["a control character in the reviewer's note", (body: StoryBody): void => {
      body.reviewer_note = paragraph("The verdict leans on one\u0007 argued point.", ["P3"]);
    }, "reviewer_note.text"],
    ["an isolate in the summary", (body: StoryBody): void => {
      body.short.summary = "Our reading of your question: \u2066whether the extension is worth its cost.";
    }, "short.summary"],
    ["an override in the change text", (body: StoryBody): void => {
      body.short.change.text = "A measured drop in \u202Dridership would move the savings point.";
    }, "short.change.text"]
  ])("refuses %s as a code and a path, without echoing the text", (_name, mutate, path) => {
    const body = story();
    mutate(body);
    const result = classifyStoryContent(JSON.stringify(body), INDEX);
    expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
    expect(result.parseError).toContain("STORY_TEXT_CONTROL_CHARACTER");
    expect(result.parseError).not.toMatch(/Fund the|dleh|cost objection|really|leans on|worth its cost|ridership/u);
  });

  describe("no point numbers in the short version (it is shown where there is no appendix)", () => {
    it.each([
      ["the headline", (body: StoryBody): void => {
        body.short.headline = "Fund the extension: P3 carries it.";
      }, "short.headline"],
      ["the summary", (body: StoryBody): void => {
        body.short.summary = "Our reading of your question: whether the extension is worth its cost. It is, mainly on P3.";
      }, "short.summary"],
      ["a path line", (body: StoryBody): void => {
        body.short.paths[1]!.line = "Do not fund it: the cost objection (P3) was answered.";
      }, "short.paths.1.line"],
      ["the change text", (body: StoryBody): void => {
        body.short.change.text = "A measured drop in ridership would move P3.";
      }, "short.change.text"]
    ])("refuses a point number in %s, at its own path, without echoing the text", (_name, mutate, path) => {
      const body = story();
      mutate(body);
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
      expect(result.parseError).toContain("STORY_SHORT_POINT_NUMBER");
      expect(result.parseError).not.toMatch(/carries it|mainly on|cost objection|ridership/u);
      expect(() => parseStoryBody(JSON.stringify(body), INDEX))
        .toThrowError(expect.objectContaining({ code: "STORY_CONTENT_INVALID" }));
    });

    it("still accepts a point number in the long version and in the reviewer's note", () => {
      const body = story();
      body.long.sections[2]!.paragraphs[0]!.text = "Funding held up, mainly on P3 and P14.";
      body.reviewer_note = paragraph("The verdict leans on P3, which was only argued.", ["P3"]);
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    });

    it.each([
      ["PS", "Fund it. PS: the savings held up."],
      ["P0", "Fund it: P0 is not a point number."],
      ["a letter glued to it", "Fund it, even with the MP3 archive and the P3a annex."],
      ["a lowercase p", "Fund it: p3 is not how a point is named."]
    ])("does not refuse %s in a short text", (_name, headline) => {
      const body = story();
      body.short.headline = headline;
      expect(classifyStoryContent(JSON.stringify(body), INDEX).parseStatus).toBe("PARSED");
    });
  });

  it("accepts line feeds and tabs inside a text", () => {
    const body = story();
    body.long.sections[2]!.paragraphs[0]!.text = "Funding held up.\n\tThe savings point was never answered.";
    expect(classifyStoryContent(JSON.stringify(body), INDEX).parseStatus).toBe("PARSED");
  });

  describe("more positions than the site shows (the 8-path cap)", () => {
    // Task 3 numbers the positions strongest first, so P1 is the strongest and P9 the weakest.
    const positions = Array.from({ length: 9 }, (_, index) => `P${String(index + 1)}`);
    const wide: StoryMaterialIndex = {
      nodeIds: new Set(positions),
      positionIds: new Set(positions),
      positionOrder: positions,
      shapeIds: new Set(["general"]),
      pathCap: 8
    };
    function withPaths(ids: readonly string[]): string {
      const body = story();
      body.short.paths = ids.map((id) => ({
        // The short version never names a point number (Task 11 fix round 1), so the line does not either.
        position_ref: id, fate: "PARTLY_HELD" as const, line: "One of the positions argued.", node_refs: [id]
      }));
      body.short.change.node_refs = [];
      body.long.sections.forEach((section) => section.paragraphs.forEach((entry) => { entry.node_refs = []; }));
      return JSON.stringify(body);
    }

    it("accepts the 8 strongest of 9 positions", () => {
      expect(classifyStoryContent(withPaths(positions.slice(0, 8)), wide).parseStatus).toBe("PARSED");
    });

    it("refuses 8 entries that drop the strongest, at the entry that is not among the 8 strongest", () => {
      const result = classifyStoryContent(withPaths(positions.slice(1, 9)), wide);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "short.paths.7.position_ref" });
      expect(result.parseError).toContain("STORY_PATH_NOT_AMONG_STRONGEST");
    });

    it("reads the strength order from positionOrder, not from the reference numbers", () => {
      const weakestFirst: StoryMaterialIndex = { ...wide, positionOrder: [...positions].reverse() };
      expect(classifyStoryContent(withPaths(positions.slice(1, 9)), weakestFirst).parseStatus).toBe("PARSED");
      expect(refused(classifyStoryContent(withPaths(positions.slice(0, 8)), weakestFirst))).toEqual({
        code: "SCHEMA_FAILED", path: "short.paths.0.position_ref"
      });
    });

    it("refuses 7 entries for 9 positions", () => {
      expect(refused(classifyStoryContent(withPaths(positions.slice(0, 7)), wide))).toEqual({ code: "SCHEMA_FAILED", path: "short.paths" });
    });

    it("refuses 9 entries: the form caps the paths at 8", () => {
      expect(refused(classifyStoryContent(withPaths(positions), wide))).toEqual({ code: "SCHEMA_FAILED", path: "short.paths" });
    });
  });

  describe("an index built wrongly is a programming error, thrown loudly", () => {
    const content = JSON.stringify(story());

    it.each([0, 9, 2.5, Number.NaN])("refuses a pathCap of %s", (pathCap) => {
      expect(() => classifyStoryContent(content, { ...INDEX, pathCap }))
        .toThrowError(expect.objectContaining({ code: "STORY_PATH_CAP_INVALID" }));
      expect(() => parseStoryBody(content, { ...INDEX, pathCap }))
        .toThrowError(expect.objectContaining({ code: "STORY_PATH_CAP_INVALID" }));
    });

    it("accepts the schema's own cap as the pathCap", () => {
      expect(classifyStoryContent(content, { ...INDEX, pathCap: STORY_BODY_LIMITS.maxPaths }).parseStatus).toBe("PARSED");
    });

    it.each([
      ["a position missing from the order", ["P1"]],
      ["a reference that is not a position", ["P1", "P3"]],
      ["a position listed twice", ["P1", "P2", "P1"]]
    ])("refuses a positionOrder with %s", (_name, positionOrder) => {
      expect(() => classifyStoryContent(content, { ...INDEX, positionOrder }))
        .toThrowError(expect.objectContaining({ code: "STORY_POSITION_ORDER_INVALID" }));
    });
  });
});

const SATISFIED = {
  satisfied: true,
  objection: null,
  criteria: {
    faithful_to_material: true,
    agrees_with_label: true,
    fair_to_losing_paths: true,
    no_overstatement: true,
    citations_correct: true,
    reviewer_note_separate: true,
    goal_marked_as_reading: true
  }
};

describe("verdict story — the checker classifier", () => {
  it("accepts a satisfied verdict and an unsatisfied one with its objection", () => {
    expect(classifyCheckerContent(JSON.stringify(SATISFIED))).toEqual({ parseStatus: "PARSED", parseError: null });
    const unsatisfied = {
      ...SATISFIED,
      satisfied: false,
      objection: "The summary calls the answer settled; the label says the debate did not settle it.",
      criteria: { ...SATISFIED.criteria, agrees_with_label: false }
    };
    expect(parseCheckerVerdict(JSON.stringify(unsatisfied))).toEqual(unsatisfied);
  });

  it("refuses an unsatisfied verdict that gives no objection, at the objection's path", () => {
    const content = JSON.stringify({ ...SATISFIED, satisfied: false });
    expect(refused(classifyCheckerContent(content))).toEqual({ code: "SCHEMA_FAILED", path: "objection" });
  });

  it.each([
    ["a NUL", "The summary calls the answer settled;\u0000 the label does not."],
    ["a right-to-left override", "The summary calls the answer \u202Edelttes\u202C; the label does not."]
  ])("refuses an objection carrying %s, at the objection's path, without echoing it", (_name, objection) => {
    const content = JSON.stringify({
      ...SATISFIED, satisfied: false, objection, criteria: { ...SATISFIED.criteria, agrees_with_label: false }
    });
    const result = classifyCheckerContent(content);
    expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "objection" });
    expect(result.parseError).toContain("STORY_TEXT_CONTROL_CHARACTER");
    expect(result.parseError).not.toContain("calls the answer");
  });

  it("refuses a satisfied verdict with an unmet criterion, at satisfied", () => {
    const content = JSON.stringify({ ...SATISFIED, criteria: { ...SATISFIED.criteria, no_overstatement: false } });
    const result = classifyCheckerContent(content);
    expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "satisfied" });
    expect(result.parseError).toContain("STORY_CHECKER_SATISFIED_WITH_UNMET_CRITERION");
    expect(() => parseCheckerVerdict(content))
      .toThrowError(expect.objectContaining({ code: "STORY_CHECKER_CONTENT_INVALID" }));
  });

  it("refuses a verdict that leaves out a criterion", () => {
    const { goal_marked_as_reading: _left, ...criteria } = SATISFIED.criteria;
    expect(refused(classifyCheckerContent(JSON.stringify({ ...SATISFIED, criteria })))).toEqual({
      code: "SCHEMA_FAILED", path: "criteria.goal_marked_as_reading"
    });
  });

  it("refuses an extra member and text that is not JSON", () => {
    expect(classifyCheckerContent(JSON.stringify({ ...SATISFIED, score: 9 })).parseStatus).toBe("SCHEMA_FAILED");
    expect(classifyCheckerContent("Looks fine to me.").parseStatus).toBe("PARSE_FAILED");
    expect(() => parseCheckerVerdict("Looks fine to me."))
      .toThrowError(expect.objectContaining({ code: "STORY_CHECKER_CONTENT_INVALID" }));
  });
});
