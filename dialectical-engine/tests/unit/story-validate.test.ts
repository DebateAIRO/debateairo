import { describe, expect, it } from "vitest";
import { STORY_BODY_LIMITS, type StoryBody } from "@debateai/contract";
import { schemaFailureLocator, type ContentClassification } from "@debateai/providers";
import {
  STORY_ENGINE_TOKENS,
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

/**
 * The material names points by short references (Task 3); the index holds
 * exactly those, and every score and threshold of the material as a story
 * might print it (R1): here a winner of 0.64, a runner-up of 0.58, a high cut
 * of 0.7 (also 0,7: the material prints it as 0.7) and a low cut of 0.35
 * (whose rounding to 0,3 the material never prints).
 */
const SCORE_TEXTS: ReadonlySet<string> = new Set([
  "0.64", "0,64", "0.58", "0,58", "0.70", "0,70", "0.7", "0,7", "0.35", "0,35"
]);
const INDEX: StoryMaterialIndex = {
  nodeIds: new Set(["P1", "P2", "P3", "P4"]),
  positionIds: new Set(["P1", "P2"]),
  positionOrder: ["P1", "P2"],
  shapeIds: new Set(["general", "health"]),
  pathCap: 8,
  scoreTexts: SCORE_TEXTS
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
      confidence: "Fairly sure, as long as the ridership forecast holds.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "Fund it: the savings argument held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "FELL", line: "Do not fund it: the cost objection was answered.", node_refs: ["P2", "P4"] }
      ],
      change: paragraph("A measured drop in ridership would move the savings point.")
    },
    why: {
      reasons: [paragraph("The savings argument held up: fares cover the running costs (P3).", ["P1", "P3"])]
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
    }, "reviewer_note.node_refs.0"],
    ["an unknown citation in a reason", (body: StoryBody): void => {
      body.why.reasons[0]!.node_refs = ["node:elsewhere"];
    }, "why.reasons.0.node_refs.0"],
    ["a story with no confidence sentence", (body: StoryBody): void => {
      delete (body.short as Partial<StoryBody["short"]>).confidence;
    }, "short.confidence"],
    ["a blank confidence sentence", (body: StoryBody): void => {
      body.short.confidence = "   ";
    }, "short.confidence"],
    ["a confidence sentence over 300 characters", (body: StoryBody): void => {
      body.short.confidence = "s".repeat(301);
    }, "short.confidence"],
    ["a story with no reasons", (body: StoryBody): void => {
      body.why.reasons = [];
    }, "why.reasons"],
    ["four reasons", (body: StoryBody): void => {
      body.why.reasons = [1, 2, 3, 4].map((index) => paragraph(`Reason ${String(index)}.`));
    }, "why.reasons"],
    ["a reason over 700 characters", (body: StoryBody): void => {
      body.why.reasons[0]!.text = "r".repeat(701);
    }, "why.reasons.0.text"],
    ["a story without why", (body: StoryBody): void => {
      delete (body as Partial<StoryBody>).why;
    }, "why"]
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
    }, "short.change.text"],
    ["an isolate in the confidence sentence", (body: StoryBody): void => {
      body.short.confidence = "Fairly sure, as long as \u2068the forecast\u2069 holds.";
    }, "short.confidence"],
    ["a control character in a reason", (body: StoryBody): void => {
      body.why.reasons[0]!.text = "The savings\u0008 argument held up.";
    }, "why.reasons.0.text"]
  ])("refuses %s as a code and a path, without echoing the text", (_name, mutate, path) => {
    const body = story();
    mutate(body);
    const result = classifyStoryContent(JSON.stringify(body), INDEX);
    expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
    expect(result.parseError).toContain("STORY_TEXT_CONTROL_CHARACTER");
    expect(result.parseError).not.toMatch(/Fund the|dleh|cost objection|really|leans on|worth its cost|ridership|forecast|savings/u);
  });

  describe("no point numbers in the texts the site shows (there is no appendix there)", () => {
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
      }, "short.change.text"],
      ["the reviewer's note", (body: StoryBody): void => {
        body.reviewer_note = paragraph("The verdict leans on P3, which was only argued.", ["P3"]);
      }, "reviewer_note.text"],
      ["the confidence sentence", (body: StoryBody): void => {
        body.short.confidence = "Fairly sure, as long as P3 holds.";
      }, "short.confidence"]
    ])("refuses a point number in %s, at its own path, without echoing the text", (_name, mutate, path) => {
      const body = story();
      mutate(body);
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
      expect(result.parseError).toContain("STORY_SHORT_POINT_NUMBER");
      expect(result.parseError).not.toMatch(/carries it|mainly on|cost objection|ridership|leans on|as long as/u);
      expect(() => parseStoryBody(JSON.stringify(body), INDEX))
        .toThrowError(expect.objectContaining({ code: "STORY_CONTENT_INVALID" }));
    });

    it("still accepts a point number in the long version", () => {
      const body = story();
      body.long.sections[2]!.paragraphs[0]!.text = "Funding held up, mainly on P3 and P14.";
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    });

    it("still accepts a point number in a reason: why is printed only in the full report", () => {
      const body = story();
      body.why.reasons = [
        paragraph("The fares cover the running costs (P3).", ["P3"]),
        paragraph("The overrun objection was answered, see P4.", ["P4"])
      ];
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    });

    it("still lets the reviewer's note cite points in its node_refs, naming them in words", () => {
      const body = story();
      body.reviewer_note = paragraph("The verdict leans on the savings point, which was only argued.", ["P3"]);
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

  describe("no score or threshold of the material in any text (R1: the story speaks to the person)", () => {
    it("refuses \u201ea ob\u021binut 0,64\u201d at its own path, with a code, without echoing the text", () => {
      const body = story();
      body.long.sections[1]!.paragraphs[0]!.text = "Mutarea treptat\u0103 a ob\u021binut 0,64.";
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "long.sections.1.paragraphs.0.text" });
      expect(result.parseError).toContain("STORY_TEXT_SCORE_VALUE");
      expect(result.parseError).not.toMatch(/Mutarea|ob\u021binut|0,64/u);
      expect(() => parseStoryBody(JSON.stringify(body), INDEX))
        .toThrowError(expect.objectContaining({ code: "STORY_CONTENT_INVALID" }));
    });

    it("refuses 0.64 in a reason", () => {
      const body = story();
      body.why.reasons[0]!.text = "The savings argument scored 0.64 once the objections were counted.";
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "why.reasons.0.text" });
      expect(result.parseError).toContain("STORY_TEXT_SCORE_VALUE");
    });

    it("refuses a threshold written with one decimal, 0,7", () => {
      const body = story();
      body.long.sections[2]!.paragraphs[0]!.text = "Nicio variant\u0103 nu a ajuns la pragul de 0,7.";
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "long.sections.2.paragraphs.0.text" });
      expect(result.parseError).toContain("STORY_TEXT_SCORE_VALUE");
    });

    it.each([
      ["the headline", (body: StoryBody): void => { body.short.headline = "Fund it: it scored 0.64."; }, "short.headline"],
      ["the summary", (body: StoryBody): void => { body.short.summary = "Funding scored 0,58 against the rest."; }, "short.summary"],
      ["the confidence sentence", (body: StoryBody): void => { body.short.confidence = "Fairly sure: below the 0.70 line."; }, "short.confidence"],
      ["a path line", (body: StoryBody): void => { body.short.paths[1]!.line = "Do not fund it: it ended at 0.58."; }, "short.paths.1.line"],
      ["the change text", (body: StoryBody): void => { body.short.change.text = "Anything that lifts it past 0,7 would change it."; }, "short.change.text"],
      ["a section title", (body: StoryBody): void => { body.long.sections[1]!.title = "Why 0.64 is not enough"; }, "long.sections.1.title"],
      ["a paragraph", (body: StoryBody): void => { body.long.sections[2]!.paragraphs[0]!.text = "Funding held up (0,35 was the floor)."; }, "long.sections.2.paragraphs.0.text"],
      ["a reason", (body: StoryBody): void => { body.why.reasons[0]!.text = "It led, 0.64 to 0.58."; }, "why.reasons.0.text"],
      ["the reviewer's note", (body: StoryBody): void => {
        body.reviewer_note = paragraph("The leading answer sits at 0,64 only.", ["P3"]);
      }, "reviewer_note.text"]
    ])("refuses a score value in %s, at its own path", (_name, mutate, path) => {
      const body = story();
      mutate(body);
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
      expect(result.parseError).toContain("STORY_TEXT_SCORE_VALUE");
    });

    it.each([
      ["a percentage the debate argued", "The new salary is 35% higher than the old one."],
      ["a figure with a digit on either side", "The rent is 10,640 lei a year, not 0,645 of the salary."],
      ["a longer decimal that only starts like a score", "Inflation ran at 0.643 last quarter."],
      ["a number the material does not hold", "The tram runs every 0.25 hours at peak."],
      ["a rounding of a threshold the material never prints", "Roughly 0,3 of the budget is fixed."],
      ["a range that only looks like one, the point read literally", "Children aged 0-7 ride free, and 0 64 is a bus line."],
      // A percentage is the debate's own figure, even when its digits match a
      // threshold: an interest rate of 0,35% a month, a fee of 0.64 %.
      ["a small percentage that shares a threshold's digits", "The loan costs 0,35% a month, and the fee is 0.64 % of the sum."]
    ])("accepts %s", (_name, text) => {
      const body = story();
      body.long.sections[2]!.paragraphs[0]!.text = text;
      body.short.summary = text;
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    });

    it("still refuses a score followed by other punctuation, or by a percent sign further on", () => {
      for (const text of ["It led at 0,64, clearly.", "It led (0.64).", "0,64 of the way; 5% more needed."]) {
        const body = story();
        body.short.summary = text;
        const result = classifyStoryContent(JSON.stringify(body), INDEX);
        expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path: "short.summary" });
        expect(result.parseError).toContain("STORY_TEXT_SCORE_VALUE");
      }
    });

    it("accepts every text when the material holds no score at all", () => {
      const body = story();
      body.short.headline = "Fund it: it scored 0.64.";
      expect(classifyStoryContent(JSON.stringify(body), { ...INDEX, scoreTexts: new Set() }).parseStatus).toBe("PARSED");
    });

    it("throws for score texts that are not a printed decimal: an empty one would refuse every text", () => {
      const content = JSON.stringify(story());
      for (const bad of ["", "0.6.4", "abc", "0,64 "]) {
        expect(() => classifyStoryContent(content, { ...INDEX, scoreTexts: new Set(["0.64", bad]) }))
          .toThrowError(expect.objectContaining({ code: "STORY_SCORE_TEXTS_INVALID" }));
      }
    });
  });

  describe("no code token of the material in any text (fix round 2: STORY_TEXT_ENGINE_TOKEN)", () => {
    it("holds the labels, the fates, the ways of knowing and the material's underscore keys", () => {
      for (const token of [
        "SUPPORTED", "CONTESTED", "UNSUPPORTED", "HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE",
        "LOOKED_UP", "RAN", "REASONING",
        "known_by", "rule_in_words", "confidence_band", "judge_spread", "high_cut", "low_cut", "tie_margin"
      ]) {
        expect([token, STORY_ENGINE_TOKENS.includes(token)]).toEqual([token, true]);
      }
      // Only code's shapes: all capitals and underscores, or a key with an underscore.
      for (const token of STORY_ENGINE_TOKENS) expect(token).toMatch(/^(?:[A-Z_]+|[a-z]+(?:_[a-z]+)+)$/u);
    });

    it.each([
      ["a label in the headline", (body: StoryBody): void => { body.short.headline = "Fund it: SUPPORTED."; }, "short.headline"],
      ["a fate in a path line", (body: StoryBody): void => { body.short.paths[0]!.line = "Funding HELD_UP under scrutiny."; }, "short.paths.0.line"],
      ["a way of knowing in a paragraph", (body: StoryBody): void => {
        body.long.sections[2]!.paragraphs[0]!.text = "The savings point is REASONING only.";
      }, "long.sections.2.paragraphs.0.text"],
      ["RAN as a whole capital token in the summary", (body: StoryBody): void => {
        body.short.summary = "The fare model was RAN, so it is a finding.";
      }, "short.summary"],
      ["a material key in a reason", (body: StoryBody): void => { body.why.reasons[0]!.text = "Its known_by was a source."; }, "why.reasons.0.text"],
      ["a material key in the change text", (body: StoryBody): void => {
        body.short.change.text = "See rule_in_words for what would change it.";
      }, "short.change.text"],
      ["a material key in the confidence sentence", (body: StoryBody): void => {
        body.short.confidence = "Fairly sure: the confidence_band is FULL.";
      }, "short.confidence"],
      ["a threshold key in a section title", (body: StoryBody): void => { body.long.sections[1]!.title = "Inside the tie_margin"; }, "long.sections.1.title"],
      ["a label in the reviewer's note", (body: StoryBody): void => {
        body.reviewer_note = paragraph("A CONTESTED label hides how close it was.", ["P3"]);
      }, "reviewer_note.text"]
    ])("refuses %s, at its own path, without echoing the text", (_name, mutate, path) => {
      const body = story();
      mutate(body);
      const result = classifyStoryContent(JSON.stringify(body), INDEX);
      expect(refused(result)).toEqual({ code: "SCHEMA_FAILED", path });
      expect(result.parseError).toContain("STORY_TEXT_ENGINE_TOKEN");
      expect(result.parseError).not.toMatch(/Fund it|scrutiny|savings|fare model|what would|Fairly sure|Inside|hides/u);
    });

    it.each([
      ["the same words in ordinary case", "The plan ran well, fell short once, is supported by the figures and was contested by the council."],
      ["a capitalised first word", "Supported by the council, the plan went ahead. Reasoning alone cannot settle it."],
      ["longer words that start like a token", "RANDOM checks and FELLOWS agreed; the UNSUPPORTEDLY loud claim fell."],
      ["longer words that end like a token", "The project OVERRAN, and MISREASONING, not the budget, was to blame."],
      ["the key's words written apart", "Known by a source, set aside for now, the tie margin of the vote was small."],
      ["a token glued to a letter or digit", "The HELD_UPx code and REASONING2 are not tokens here."]
    ])("accepts %s", (_name, text) => {
      const body = story();
      body.short.summary = text;
      body.long.sections[2]!.paragraphs[0]!.text = text;
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
    });

    it("never refuses the story's own fate codes, which are data, not text", () => {
      const body = story();
      body.short.paths[0]!.fate = "SET_ASIDE";
      expect(classifyStoryContent(JSON.stringify(body), INDEX)).toEqual({ parseStatus: "PARSED", parseError: null });
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
      pathCap: 8,
      scoreTexts: SCORE_TEXTS
    };
    function withPaths(ids: readonly string[]): string {
      const body = story();
      body.short.paths = ids.map((id) => ({
        // The short version never names a point number (Task 11 fix round 1), so the line does not either.
        position_ref: id, fate: "PARTLY_HELD" as const, line: "One of the positions argued.", node_refs: [id]
      }));
      body.short.change.node_refs = [];
      body.why.reasons.forEach((entry) => { entry.node_refs = []; });
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
    goal_marked_as_reading: true,
    speaks_to_the_person: true
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
    const { speaks_to_the_person: _alsoLeft, ...withoutSpeaks } = SATISFIED.criteria;
    expect(refused(classifyCheckerContent(JSON.stringify({ ...SATISFIED, criteria: withoutSpeaks })))).toEqual({
      code: "SCHEMA_FAILED", path: "criteria.speaks_to_the_person"
    });
  });

  it("refuses a satisfied verdict for a story that does not speak to the person", () => {
    const content = JSON.stringify({ ...SATISFIED, criteria: { ...SATISFIED.criteria, speaks_to_the_person: false } });
    expect(refused(classifyCheckerContent(content))).toEqual({ code: "SCHEMA_FAILED", path: "satisfied" });
    const objected = {
      ...SATISFIED,
      satisfied: false,
      objection: "The summary talks about the judges and never answers the question.",
      criteria: { ...SATISFIED.criteria, speaks_to_the_person: false }
    };
    expect(parseCheckerVerdict(JSON.stringify(objected))).toEqual(objected);
  });

  it("refuses an extra member and text that is not JSON", () => {
    expect(classifyCheckerContent(JSON.stringify({ ...SATISFIED, score: 9 })).parseStatus).toBe("SCHEMA_FAILED");
    expect(classifyCheckerContent("Looks fine to me.").parseStatus).toBe("PARSE_FAILED");
    expect(() => parseCheckerVerdict("Looks fine to me."))
      .toThrowError(expect.objectContaining({ code: "STORY_CHECKER_CONTENT_INVALID" }));
  });
});
