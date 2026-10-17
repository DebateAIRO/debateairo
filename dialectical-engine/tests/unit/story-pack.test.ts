import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { StoryBodySchema, StoryFateSchema, StoryVerdictBasisSchema, WayOfKnowingSchema } from "@debateai/contract";
import { ENGINE_QUESTION_KINDS, TypedDomainError } from "@debateai/kernel";
import {
  STORY_PACK_LIMITS,
  STORY_SHAPES_DIR_ENV_KEY,
  STORY_V4_SHAPE_SENTENCE,
  StoryCheckerVerdictSchema,
  assembleStoryCheckerInstruction,
  assembleStorytellerInstruction,
  buildStoryMaterial,
  loadStoryPack,
  resolveStoryPackDir,
  storyShapeOf,
  toStoryPromptMaterial,
  type StoryMaterialResult,
  type StoryPack
} from "@debateai/story";

/**
 * Verdict story, Task 1 — the shape pack loader (spec §5.1).
 *
 * Every rule a pack can break is driven here on a pack written into a fresh
 * temporary directory, and must be refused WITH ITS NAME, so an owner who
 * breaks a file reads which rule they broke. The shipped pack is loaded as it
 * ships, from the repository, never from a path written for one machine.
 */

const SHIPPED_SHAPE_IDS = ["general", "health", "money-decision", "legal", "factual", "personal-choice"];
const SHIPPED_DIR = resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url });

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function scratchDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "story-pack-"));
  temporary.push(directory);
  return directory;
}

function shapeText(input: {
  readonly id: string;
  readonly sections?: readonly string[];
  readonly guidance?: string;
}): string {
  const sections = input.sections ?? ["First section", "Second section", "Third section"];
  return [
    "---",
    `id: ${input.id}`,
    `title: Shape ${input.id}`,
    `when_to_use: When the question is about ${input.id}.`,
    "sections:",
    ...sections.map((title) => `  - ${title}`),
    "---",
    input.guidance ?? `Guidance for ${input.id}.`,
    ""
  ].join("\n");
}

type PackFiles = Readonly<Record<string, string | Uint8Array | null>>;

function manifest(overrides: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    pack_id: "test-pack",
    version: "t1",
    default_shape: "alpha",
    shapes: ["alpha", "beta"],
    ...overrides
  });
}

/** A minimal valid pack; a file may be replaced (text or raw bytes) or left out (null). */
function writePack(files: PackFiles = {}): string {
  const directory = scratchDir();
  const all: PackFiles = {
    "pack.json": manifest(),
    "common.md": "Common instructions.\n",
    "checker.md": "Checker instructions.\n",
    "common-map.md": "Common map instructions.\n",
    "checker-map.md": "Checker map instructions.\n",
    // Story v4 (engine redesign R1d, absorbing LG-D): the v4-only passages and the v4 text of each shape are their own
    // files, required like the map passages.
    "common-length.md": "Common length instructions.\n",
    "checker-length.md": "Checker length instructions.\n",
    "shapes-v4/alpha.md": shapeText({ id: "alpha", guidance: "V4 guidance for alpha." }),
    "shapes-v4/beta.md": shapeText({ id: "beta", guidance: "V4 guidance for beta." }),
    "shapes/alpha.md": shapeText({ id: "alpha" }),
    "shapes/beta.md": shapeText({ id: "beta" }),
    ...files
  };
  mkdirSync(join(directory, "shapes"));
  mkdirSync(join(directory, "shapes-v4"));
  for (const [path, content] of Object.entries(all)) {
    if (content !== null) writeFileSync(join(directory, ...path.split("/")), content);
  }
  return directory;
}

/** The rule a pack is refused under, or LOADED. Anything but STORY_PACK_INVALID is rethrown. */
function packVerdict(directory: string): string {
  try {
    loadStoryPack(directory);
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "STORY_PACK_INVALID") {
      return error.message.slice(0, error.message.indexOf(":"));
    }
    throw error;
  }
  return "LOADED";
}

const TOO_BIG_SHAPES = ["sa", "sb", "sc", "sd", "se"];
const tooBigInstruction: PackFiles = {
  "pack.json": manifest({ default_shape: "sa", shapes: TOO_BIG_SHAPES }),
  ...Object.fromEntries(TOO_BIG_SHAPES.flatMap((id) => ["shapes", "shapes-v4"].map((folder) => [
    `${folder}/${id}.md`,
    shapeText({ id, guidance: "g".repeat(11_000) })
  ])))
};

const REFUSALS: readonly (readonly [rule: string, why: string, files: PackFiles])[] = [
  ["FILE_MISSING", "checker.md is absent", { "checker.md": null }],
  ["FILE_MISSING", "a listed shape has no file", { "shapes/beta.md": null }],
  // Ruling W-STORY: the map passages are their own files, required like common.md and checker.md.
  ["FILE_MISSING", "common-map.md is absent", { "common-map.md": null }],
  ["FILE_MISSING", "checker-map.md is absent", { "checker-map.md": null }],
  ["FILE_MISSING", "common-length.md is absent", { "common-length.md": null }],
  ["FILE_MISSING", "checker-length.md is absent", { "checker-length.md": null }],
  ["FILE_MISSING", "a listed shape has no v4 file", { "shapes-v4/beta.md": null }],
  ["FILE_TOO_LARGE", "a file is over the file limit (24 KB)", { "common.md": "x".repeat(STORY_PACK_LIMITS.maxFileBytes + 1) }],
  ["NOT_UTF8", "a file is not UTF-8", { "common.md": Uint8Array.from([0x43, 0xff, 0xfe, 0x0a]) }],
  ["CONTROL_CHARACTER", "a file holds a bell character", { "checker.md": "Checker\u0007 instructions.\n" }],
  ["CONTROL_CHARACTER", "a file has Windows line endings", { "common.md": "Common\r\ninstructions.\r\n" }],
  ["PACK_JSON_INVALID", "pack.json is not JSON", { "pack.json": "{ not json" }],
  ["PACK_JSON_INVALID", "pack.json carries an unknown key", { "pack.json": manifest({ extra: true }) }],
  ["PACK_JSON_INVALID", "pack.json lists no shapes", { "pack.json": manifest({ shapes: [] }) }],
  ["PACK_JSON_INVALID", "the version is blank", { "pack.json": manifest({ version: "   " }) }],
  ["PACK_JSON_INVALID", "the version is over 64 characters", {
    "pack.json": manifest({ version: "v".repeat(STORY_PACK_LIMITS.maxVersionChars + 1) })
  }],
  ["PACK_JSON_INVALID", "the version holds a tab, which is not printable", { "pack.json": manifest({ version: "t\t1" }) }],
  ["CONTROL_CHARACTER", "the version decodes a \\u0000 escape", { "pack.json": manifest({ version: "t\u00001" }) }],
  ["ID_INVALID", "the pack id has capitals and a space", { "pack.json": manifest({ pack_id: "Test Pack" }) }],
  ["ID_INVALID", "a shape id is one character", { "pack.json": manifest({ shapes: ["alpha", "b"] }) }],
  ["ID_DUPLICATE", "a shape is listed twice", { "pack.json": manifest({ shapes: ["alpha", "alpha"] }) }],
  ["DEFAULT_SHAPE_MISSING", "the default is not listed", { "pack.json": manifest({ default_shape: "gamma" }) }],
  ["TEXT_EMPTY", "common.md is blank", { "common.md": "  \n\n" }],
  ["TEXT_EMPTY", "checker-map.md is blank", { "checker-map.md": "\n" }],
  ["TEXT_EMPTY", "common-length.md is blank", { "common-length.md": "  \n" }],
  ["TEXT_EMPTY", "checker-length.md is blank", { "checker-length.md": "\n" }],
  ["TEXT_EMPTY", "a v4 shape has no guidance", { "shapes-v4/beta.md": shapeText({ id: "beta", guidance: "" }) }],
  ["FRONT_MATTER_INVALID", "a v4 shape has no front matter", { "shapes-v4/alpha.md": "Just guidance.\n" }],
  ["SHAPE_ID_MISMATCH", "a v4 shape file declares another id", { "shapes-v4/beta.md": shapeText({ id: "gamma" }) }],
  ["SECTION_COUNT", "a v4 shape has two sections", {
    "shapes-v4/alpha.md": shapeText({ id: "alpha", sections: ["One", "Two"] })
  }],
  ["TEXT_EMPTY", "a shape has no guidance", { "shapes/beta.md": shapeText({ id: "beta", guidance: "" }) }],
  ["FRONT_MATTER_INVALID", "a shape has no front matter", { "shapes/alpha.md": "Just guidance.\n" }],
  ["FRONT_MATTER_INVALID", "a shape has no title", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("title: Shape alpha\n", "")
  }],
  ["FRONT_MATTER_INVALID", "a shape has an unknown key", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("when_to_use:", "whenever:")
  }],
  ["FRONT_MATTER_INVALID", "a shape's title is over 80 characters", {
    "shapes/alpha.md": shapeText({ id: "alpha" })
      .replace("title: Shape alpha\n", `title: ${"t".repeat(STORY_PACK_LIMITS.maxTitleChars + 1)}\n`)
  }],
  ["FRONT_MATTER_INVALID", "a shape's when_to_use is over 300 characters", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace(
      "when_to_use: When the question is about alpha.\n",
      `when_to_use: ${"w".repeat(STORY_PACK_LIMITS.maxWhenToUseChars + 1)}\n`
    )
  }],
  ["FRONT_MATTER_INVALID", "a shape repeats a key", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("title: Shape alpha\n", "title: Shape alpha\ntitle: Again\n")
  }],
  ["FRONT_MATTER_INVALID", "a shape lists sections twice", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("---\nGuidance", "sections:\n  - Fourth section\n---\nGuidance")
  }],
  ["FRONT_MATTER_INVALID", "a shape has a list item outside sections", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("sections:\n", "  - Stray item\nsections:\n")
  }],
  ["FRONT_MATTER_INVALID", "a shape leaves a value empty", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("title: Shape alpha\n", "title:\n")
  }],
  ["SHAPE_ID_MISMATCH", "a shape file declares another id", { "shapes/beta.md": shapeText({ id: "gamma" }) }],
  ["SECTION_COUNT", "a shape has two sections", {
    "shapes/alpha.md": shapeText({ id: "alpha", sections: ["One", "Two"] })
  }],
  ["SECTION_COUNT", "a shape has thirteen sections", {
    "shapes/alpha.md": shapeText({ id: "alpha", sections: Array.from({ length: 13 }, (_, index) => `Part ${String(index + 1)}`) })
  }],
  ["SECTION_TITLE_INVALID", "a section title is over 80 characters", {
    "shapes/alpha.md": shapeText({ id: "alpha", sections: ["One", "Two", "t".repeat(81)] })
  }],
  ["INSTRUCTION_TOO_LARGE", "the assembled instruction is over 48 KB", tooBigInstruction],
  // Story v4 (R1d): every assembled form is checked, so a pack whose instruction fits only without the length passage
  // is refused whole, never at the first v4 story.
  ["INSTRUCTION_TOO_LARGE", "the v4 instruction grows past 48 KB only with common-length.md", {
    "common.md": "c".repeat(24_560), "common-length.md": "l".repeat(24_560)
  }],
  ["RESERVED_TOKEN", "common.md carries the frame's banner", { "common.md": "--- SAFETY FRAME pasted here\n" }],
  ["RESERVED_TOKEN", "checker.md carries a canary-shaped token", { "checker.md": "Watch for DBAI-CANARY-0123 here.\n" }],
  ["RESERVED_TOKEN", "common-map.md carries the frame's banner", { "common-map.md": "--- SAFETY FRAME pasted here\n" }],
  ["RESERVED_TOKEN", "checker-map.md carries a canary-shaped token", { "checker-map.md": "Watch for DBAI-CANARY-0123 here.\n" }],
  ["RESERVED_TOKEN", "common-length.md carries the frame's banner", { "common-length.md": "--- SAFETY FRAME pasted here\n" }],
  ["RESERVED_TOKEN", "checker-length.md carries a canary-shaped token", { "checker-length.md": "Watch for DBAI-CANARY-0123 here.\n" }],
  ["RESERVED_TOKEN", "a v4 shape's guidance carries the frame's banner", {
    "shapes-v4/beta.md": shapeText({ id: "beta", guidance: "--- SAFETY FRAME pasted here" })
  }]
];

describe("verdict story — the shape pack is refused whole, under the rule it broke", () => {
  it("loads the minimal fixture pack the refusal rows start from", () => {
    expect(packVerdict(writePack())).toBe("LOADED");
  });

  it.each(REFUSALS.map(([rule, why, files]) => [rule, why, files] as const))(
    "%s: %s",
    (rule, _why, files) => {
      expect(packVerdict(writePack(files))).toBe(rule);
    }
  );

  it("every documented rule has a refusal row", () => {
    expect(new Set(REFUSALS.map(([rule]) => rule))).toEqual(new Set([
      "FILE_MISSING", "FILE_TOO_LARGE", "NOT_UTF8", "CONTROL_CHARACTER", "PACK_JSON_INVALID", "ID_INVALID",
      "ID_DUPLICATE", "DEFAULT_SHAPE_MISSING", "TEXT_EMPTY", "FRONT_MATTER_INVALID", "SHAPE_ID_MISMATCH",
      "SECTION_COUNT", "SECTION_TITLE_INVALID", "INSTRUCTION_TOO_LARGE", "RESERVED_TOKEN"
    ]));
  });
});

describe("verdict story — the shipped pack", () => {
  const pack = loadStoryPack(SHIPPED_DIR);

  it("loads, with the six shapes the spec names and general as the default", () => {
    expect(pack.packId).toBe("verdict-story");
    expect(pack.defaultShape).toBe("general");
    expect(pack.shapes.map((shape) => shape.id)).toEqual(SHIPPED_SHAPE_IDS);
    expect(pack.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    for (const shape of pack.shapes) {
      expect(shape.sections.length).toBeGreaterThanOrEqual(3);
      expect(shape.sections.length).toBeLessThanOrEqual(12);
      expect(shape.guidance.length).toBeGreaterThan(0);
    }
  });

  it("assembles an instruction under 48 KB that offers every shape", () => {
    const instruction = assembleStorytellerInstruction(pack);
    expect(Buffer.byteLength(instruction, "utf8")).toBeLessThanOrEqual(48 * 1024);
    expect(instruction.startsWith(pack.common)).toBe(true);
    for (const shape of pack.shapes) {
      expect(instruction).toContain(`### Shape ${shape.id}: ${shape.title}`);
      expect(instruction).toContain(shape.guidance);
    }
    expect(instruction).toContain("When none fits clearly, choose general.");
  });

  /**
   * The pack is the owners' to edit, so nothing below pins its prose (fix round
   * 1, minor 7): an owner's rewording must never break CI. What is checked is
   * structural and keyed on code's own identifiers, which any rewording still
   * has to explain: every field the storyteller reads and writes, the fate codes
   * and the limits they follow, and every criterion the checker's verdict carries.
   */
  it("explains to the storyteller every material field it reads and every story field it writes", () => {
    const material = toStoryPromptMaterial(built(buildStoryMaterial({
      snapshot: {
        runId: "run", workItemId: "work", answerId: "answer", answerVersion: 1, questionLine: "Should we?",
        argumentLanguage: null, compositionBudgetTier: "low",
        verdictBasis: {
          label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT", winner_node_id: "p", winner_strength: 0.8,
          runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
          thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }, confidence_band: "FULL", marks: []
        },
        servedStatement: ["Yes."],
        nodes: [{
          nodeId: "p", claim: "Yes.", isPosition: true, wayOfKnowing: "REASONING", baseScore: 0.8, finalStrength: 0.8,
          excludedReason: null, authorModel: null, panelDispersion: null, criticSummary: null
        }],
        arrows: [], sensitivity: [], setAside: [],
        // Debate shape P2c: the snapshot ranks by raisedBy; the material carries the claims only (ruling C-ORDER).
        alsoRaised: [{ claim: "Ask the school about a mid-year move.", raisedBy: 2 }],
        answersNote: "MAP_UNAVAILABLE"
      },
      enrichment: new Map(), budgetBytes: 40_000, shapeIds: new Set(["general"])
    })).material, "prior").map((field) => field.name);
    expect(material).toContain("prior_objection");
    expect(material).toEqual(expect.arrayContaining(["also_raised", "answers_note"]));
    const short = Object.keys(StoryBodySchema.shape.short.shape).map((member) => `short.${member}`);
    for (const name of [
      ...material, ...short, "why.reasons", "long.sections", "reviewer_note", "node_refs", "position_ref",
      ...StoryFateSchema.options, "high_cut", "low_cut", "confidence_band"
    ]) {
      // Ruling W-STORY: also_raised and answers_note are explained in common-map.md, sent with them.
      const told = `${pack.common}\n${pack.commonMap}`;
      expect([name, told.includes(name) || told.includes(name.split(".").at(-1)!)]).toEqual([name, true]);
    }
  });

  it("tells the checker every criterion its verdict carries", () => {
    for (const criterion of Object.keys(StoryCheckerVerdictSchema.shape.criteria.shape)) {
      expect([criterion, pack.checker.includes(criterion)]).toEqual([criterion, true]);
    }
    expect(pack.checker).toContain("candidate_story");
  });

  /**
   * Debate shape P2c. Controller ruling C-ORDER: also_raised reaches the storyteller and the checker as claims in
   * order, most-raised first, with no count, so the pack names no raised_by and both files say the story never
   * states how many AIs raised a point (the checker refuses a story that does). Owner ruling C-STORY (pre-flight
   * PF-C6): answers_note is one plain sentence the story retells once, in its own words.
   */
  it("tells the checker about the points raised but not debated, and the answers note (debate shape P2c)", () => {
    // Ruling W-STORY (whole-branch review I-1): the passages live in common-map.md and checker-map.md, sent only
    // with a material that carries the fields; common.md and checker.md stay origin/dev's and never name them.
    expect(pack.checkerMap).toContain("also_raised");
    expect(pack.checkerMap).toContain("answers_note");
    for (const text of [pack.commonMap, pack.checkerMap]) {
      expect(text).not.toContain("raised_by");
      expect(text).toContain("most-raised first");
      expect(text).toContain("with no count");
    }
    for (const text of [pack.common, pack.checker]) {
      expect(text).not.toContain("also_raised");
      expect(text).not.toContain("answers_note");
    }
    expect(pack.commonMap).toContain("never say who raised it or how many did");
    expect(pack.checkerMap).toContain("never says who raised them or how many AIs did");
    expect(pack.checkerMap).toContain("a story that states one is not faithful_to_material");
    expect(pack.commonMap).toContain("## Also raised, not debated");
  });

  /**
   * THE OWNERS' RULES FOR THE SHIPPED PACK (spec §14.1, the owners' look gate):
   * the story talks to the person, never about the engine. This test holds the
   * shipped pack to that rule, and the lists below ARE the owners' reading of
   * it: named constants the owners amend when they change the rule, never
   * code's. Only engine-only phrases are listed: a bare judge, margin, band,
   * threshold, score, leverage or hinge has a real meaning in a legal or money
   * question, and stays allowed.
   */
  it("the owners' rules for the shipped pack", () => {
    const owners = (rule: string, detail: string): string =>
      `Owners' rule (spec §14.1) broken: ${rule}: ${detail}. The list this checks belongs to the owners; amend it in tests/unit/story-pack.test.ts when the rule changes.`;
    const codeTokens = [...StoryVerdictBasisSchema.shape.label.options, ...StoryFateSchema.options, ...WayOfKnowingSchema.options];
    // Story v4 (R1d): the v4 shape texts are the owners' too, held to the same rules.
    for (const shape of [...pack.shapes, ...pack.shapesV4]) {
      for (const title of shape.sections) {
        for (const token of codeTokens) {
          expect(new RegExp(`(?<![\\p{L}_])${token}(?![\\p{L}_])`, "u").test(title), owners(
            "a section title names none of the material's codes", `${shape.id} "${title}" names ${token}`
          )).toBe(false);
        }
        for (const word of OWNERS_TITLE_WORDS_BANNED) {
          expect(new RegExp(`\\b${word}\\b`, "iu").test(title), owners(
            "a section title names none of the engine's words", `${shape.id} "${title}" names "${word}"`
          )).toBe(false);
        }
      }
      for (const phrase of OWNERS_GUIDANCE_PHRASES_BANNED) {
        expect(phrase.test(shape.guidance), owners(
          "shape guidance steers toward none of the engine-only phrases", `${shape.id} matches ${String(phrase)}`
        )).toBe(false);
      }
    }
    for (const [id, note] of Object.entries(OWNERS_ADVICE_NOTES)) for (const shapes of [pack.shapes, pack.shapesV4]) {
      expect(note.test(shapes.find((shape) => shape.id === id)?.guidance ?? ""), owners(
        "the health, money and legal shapes each say plainly that the story is not professional advice", `${id} lacks ${String(note)}`
      )).toBe(true);
    }
  });

  it("keeps each file under the 24 KB file limit and the whole instruction under 48 KB (controller ruling, R1 fix round 1)", () => {
    expect(STORY_PACK_LIMITS.maxFileBytes).toBe(24 * 1024);
    expect(STORY_PACK_LIMITS.maxInstructionBytes).toBe(48 * 1024);
    for (const file of ["common.md", "checker.md", "common-length.md", "checker-length.md", "pack.json",
      ...pack.shapes.map((shape) => `shapes/${shape.id}.md`), ...pack.shapesV4.map((shape) => `shapes-v4/${shape.id}.md`)]) {
      expect(readFileSync(join(SHIPPED_DIR, file)).byteLength).toBeLessThanOrEqual(STORY_PACK_LIMITS.maxFileBytes);
    }
  });
});

/** The owners' rule (spec §14.1): words a section title never uses. The owners amend this list. */
const OWNERS_TITLE_WORDS_BANNED: readonly string[] = Object.freeze(["verdict", "score", "judge", "evaluator"]);
/** The owners' rule (spec §14.1): engine-only phrases shape guidance never uses. The owners amend this list. */
const OWNERS_GUIDANCE_PHRASES_BANNED: readonly RegExp[] = Object.freeze([
  /how it (scored|finished)/iu, /runner-up/iu, /high cut/iu, /low cut/iu, /evaluator/iu, /checker/iu,
  /reviewers?/iu, /\brung\b/iu, /the engine/iu, /assessments were (most )?divided/iu, /judges (disagreed|were divided)/iu
]);
/** The owners' rule: these shapes each carry a plain not-professional-advice note. The owners amend this list. */
const OWNERS_ADVICE_NOTES: Readonly<Record<string, RegExp>> = Object.freeze({
  health: /\bnot medical advice\b/iu,
  "money-decision": /\bnot financial\b[^.]*\badvice\b/iu,
  legal: /\bnot legal advice\b/iu
});

function built(result: StoryMaterialResult): Extract<StoryMaterialResult, { kind: "OK" }> {
  if (result.kind !== "OK") throw new Error("the probe material must fit");
  return result;
}

/**
 * Story wording (practice debate 2, 2026-10-12). What our own pack taught or left open, pinned so it cannot come back:
 * the storyteller copied "when it was double-checked" from the instruction itself; read an author's objection as the
 * position's own admission and cited one point's words to its neighbour; named the third-placed option as the close
 * rival; and the checker found one problem per round, so two rounds rarely reached a clean story.
 */
describe("verdict story — the shipped pack's wording fixes (story wording, 2026-10-12)", () => {
  const pack = loadStoryPack(SHIPPED_DIR);

  it("teaches no sentence about the checking: the old model phrases are gone, the finding-first rule is there", () => {
    expect(pack.common).not.toContain("A point challenged when it was double-checked");
    expect(pack.common).not.toContain("a point was challenged when it was double-checked");
    expect(pack.common).not.toContain("a second model's double-check");
    expect(pack.common).toContain("This holds for whole sentences, not only for words.");
    expect(pack.common).toContain("no text speaks of the material");
    expect(pack.common).toContain("its claims have no sources behind them");
    // The reviewer's note is held to the same rule.
    expect(pack.common).toContain("never of what the debate weighed or how it worked");
  });

  it("says who wrote each objection and what it argues against, and how to cite it", () => {
    for (const text of [pack.common, pack.checker]) {
      expect(text).toContain("objection_to");
      expect(text).toMatch(/never a concession or (an )?admission/u);
    }
    expect(pack.common).toContain("two notes the point's own author wrote while writing it");
    expect(pack.common).toContain("list in node_refs the point whose record holds it, never a neighbour with similar words");
    expect(pack.checker).toContain("words taken from one point and cited to another are not");
  });

  it("names the option that made a close call close: the runner-up, place 2; the others within the tie margin finished behind it", () => {
    for (const text of [pack.common, pack.checker]) {
      expect(text).toContain("within_tie_margin");
      expect(text).toContain("place");
    }
    expect(pack.common).toContain("the one that made it close is the position at runner_up_id, in place 2");
    expect(pack.checker).toContain("the option the story names as the closest is the runner-up");
    // The hinges are not all on our side: the storyteller is told to read which way each pushes.
    expect(pack.common).toContain("A hinge can argue for our answer or for a rival");
  });

  it("asks the checker for every problem at once, and the storyteller to fix them all in one draft", () => {
    expect(pack.checker).not.toContain("in a few sentences at most");
    expect(pack.checker).toContain("list every problem you find in this one objection, most important first");
    expect(pack.common).toContain("fix every problem it rightly points to, all in this draft");
  });

  it("tells the checker its reply is the one JSON object, with nothing after it", () => {
    expect(pack.checker).toContain("once it is written, stop, and add nothing after it");
  });

  it("explains every key the material carries", () => {
    for (const key of ["place", "within_tie_margin", "objection_to", "runner_up_id"]) {
      expect([key, new RegExp(`(?<![\\p{L}_])${key}(?![\\p{L}_])`, "u").test(pack.common)]).toEqual([key, true]);
    }
  });
});

describe("verdict story — the assembled instruction's layout", () => {
  it("renders common text, the choosing rule, then each shape in pack order", () => {
    const pack = loadStoryPack(writePack());
    expect(assembleStorytellerInstruction(pack)).toBe([
      "Common instructions.",
      "## The shapes",
      "Choose the one shape below that best fits the question, and put its id in shape_id. When none fits "
        + "clearly, choose alpha. Use the chosen shape's sections, in order, as the titles of long.sections, "
        + "written in the language of the question, and follow its guidance.",
      [
        "### Shape alpha: Shape alpha",
        "When to use: When the question is about alpha.",
        "Sections, in order:",
        "1. First section",
        "2. Second section",
        "3. Third section",
        "Guidance:",
        "Guidance for alpha."
      ].join("\n"),
      [
        "### Shape beta: Shape beta",
        "When to use: When the question is about beta.",
        "Sections, in order:",
        "1. First section",
        "2. Second section",
        "3. Third section",
        "Guidance:",
        "Guidance for beta."
      ].join("\n")
    ].join("\n\n"));
  });

  it("puts the map passages after the common text and before the shapes, only when asked (ruling W-STORY)", () => {
    const pack = loadStoryPack(writePack());
    const plain = assembleStorytellerInstruction(pack);
    expect(assembleStorytellerInstruction(pack, true)).toBe(
      plain.replace("Common instructions.\n\n", "Common instructions.\n\nCommon map instructions.\n\n")
    );
    expect(plain).not.toContain("Common map instructions.");
    expect(assembleStoryCheckerInstruction(pack)).toBe("Checker instructions.");
    expect(assembleStoryCheckerInstruction(pack, true)).toBe("Checker instructions.\n\nChecker map instructions.");
  });
});

describe("verdict story — the pack fingerprint", () => {
  it("is stable across loads and across locations, and ignores files the pack does not list", () => {
    const copy = scratchDir();
    cpSync(SHIPPED_DIR, copy, { recursive: true });
    writeFileSync(join(copy, ".DS_Store"), Uint8Array.from([0, 1, 2, 3]));
    const first = loadStoryPack(SHIPPED_DIR).fingerprint;
    expect(loadStoryPack(SHIPPED_DIR).fingerprint).toBe(first);
    expect(loadStoryPack(copy).fingerprint).toBe(first);
  });

  it("changes when one byte of one file changes", () => {
    const copy = scratchDir();
    cpSync(SHIPPED_DIR, copy, { recursive: true });
    const before = loadStoryPack(copy).fingerprint;
    const target = join(copy, "shapes", "legal.md");
    const bytes = readFileSync(target);
    const last = bytes.length - 2;
    bytes[last] = bytes[last] === 0x2e ? 0x21 : 0x2e;
    writeFileSync(target, bytes);
    expect(loadStoryPack(copy).fingerprint).not.toBe(before);
  });
});

describe("verdict story — where the pack is read from", () => {
  it("walks up from the caller's module to the repository's story-shapes", () => {
    expect(SHIPPED_DIR).toBe(resolve(import.meta.dirname, "../../story-shapes"));
    const root = scratchDir();
    cpSync(SHIPPED_DIR, join(root, "story-shapes"), { recursive: true });
    const moduleUrl = pathToFileURL(join(root, "apps", "runner", "src", "main.ts")).href;
    expect(resolveStoryPackDir({ env: {}, moduleUrl })).toBe(join(root, "story-shapes"));
  });

  it("uses the environment override when it is set", () => {
    const copy = scratchDir();
    cpSync(SHIPPED_DIR, copy, { recursive: true });
    const resolved = resolveStoryPackDir({ env: { [STORY_SHAPES_DIR_ENV_KEY]: copy }, moduleUrl: import.meta.url });
    expect(resolved).toBe(resolve(copy));
    expect(loadStoryPack(resolved).fingerprint).toBe(loadStoryPack(SHIPPED_DIR).fingerprint);
  });

  it.each([
    ["a directory with no pack.json", (): string => scratchDir()],
    ["an empty value", (): string => ""]
  ])("fails loudly when the override names %s", (_name, value) => {
    expect(() => resolveStoryPackDir({ env: { [STORY_SHAPES_DIR_ENV_KEY]: value() }, moduleUrl: import.meta.url }))
      .toThrowError(expect.objectContaining({ code: "STORY_PACK_DIR_UNRESOLVED" }));
  });

  it("fails loudly when no story-shapes directory sits above the caller", () => {
    const moduleUrl = pathToFileURL(join(scratchDir(), "deep", "module.js")).href;
    expect(() => resolveStoryPackDir({ env: {}, moduleUrl }))
      .toThrowError(expect.objectContaining({ code: "STORY_PACK_DIR_UNRESOLVED" }));
  });

  it("stops at the workspace root and never picks up a pack above it", () => {
    const outer = scratchDir();
    cpSync(SHIPPED_DIR, join(outer, "story-shapes"), { recursive: true });
    const workspace = join(outer, "workspace");
    mkdirSync(workspace);
    writeFileSync(join(workspace, "pnpm-workspace.yaml"), "packages: []\n");
    const moduleUrl = pathToFileURL(join(workspace, "apps", "runner", "src", "main.ts")).href;
    expect(() => resolveStoryPackDir({ env: {}, moduleUrl }))
      .toThrowError(expect.objectContaining({ code: "STORY_PACK_DIR_UNRESOLVED" }));
  });
});

/**
 * Story v4 (engine redesign spec 2026-10-15 §7.2 items 2, 3, 7, 9, 10; INTERFACE §5.2-§5.4; absorbs LG-D Task 1). The
 * v4-only passages and the ONE shape ride only with a v4 contract (engine 2), so every other story keeps its
 * instructions byte for byte (tests/unit/debate-shape-story-request-bytes.test.ts holds the bytes). Nothing here pins
 * the owners' prose beyond where the passages go, the identifiers they must explain, and the one line each v4 shape
 * file changes.
 */
describe("verdict story v4 — the v4 passages and the one shape (engine redesign R1d)", () => {
  const pack = loadStoryPack(SHIPPED_DIR);
  const V4 = Object.freeze({ shapeId: "general" });
  const blockOf = (shape: (typeof pack.shapesV4)[number]): string => [
    `### ${shape.title}`,
    "Sections, in order:",
    ...shape.sections.map((title, index) => `${String(index + 1)}. ${title}`),
    "Guidance:",
    shape.guidance
  ].join("\n");

  it("v4 null: neither instruction holds a v4 passage, and both are today's", () => {
    for (const mapFields of [false, true]) {
      expect(assembleStorytellerInstruction(pack, mapFields, null)).toBe(assembleStorytellerInstruction(pack, mapFields));
      expect(assembleStoryCheckerInstruction(pack, mapFields, null)).toBe(assembleStoryCheckerInstruction(pack, mapFields));
      expect(assembleStorytellerInstruction(pack, mapFields)).not.toContain(pack.commonLength);
      expect(assembleStoryCheckerInstruction(pack, mapFields)).not.toContain(pack.checkerLength);
    }
    expect(assembleStoryCheckerInstruction(pack)).toBe(pack.checker);
    expect(assembleStoryCheckerInstruction(pack, true)).toBe(`${pack.checker}\n\n${pack.checkerMap}`);
  });

  it("v4: common.md, the map passages, common-length.md, the shape sentence, the one shape; the checker's length passage last", () => {
    const general = pack.shapesV4.find((shape) => shape.id === "general")!;
    expect(assembleStorytellerInstruction(pack, false, V4))
      .toBe([pack.common, pack.commonLength, "## The shape", STORY_V4_SHAPE_SENTENCE, blockOf(general)].join("\n\n"));
    expect(assembleStorytellerInstruction(pack, true, V4))
      .toBe([pack.common, pack.commonMap, pack.commonLength, "## The shape", STORY_V4_SHAPE_SENTENCE, blockOf(general)].join("\n\n"));
    expect(assembleStoryCheckerInstruction(pack, false, V4)).toBe(`${pack.checker}\n\n${pack.checkerLength}`);
    expect(assembleStoryCheckerInstruction(pack, true, V4)).toBe(`${pack.checker}\n\n${pack.checkerMap}\n\n${pack.checkerLength}`);
  });

  it("every v4 instruction holds exactly one shape block, its v4 text, no menu and no shape_id", () => {
    for (const shape of pack.shapesV4) {
      for (const mapFields of [false, true]) {
        const instruction = assembleStorytellerInstruction(pack, mapFields, { shapeId: shape.id });
        expect([shape.id, instruction.split("Sections, in order:").length - 1]).toEqual([shape.id, 1]);
        expect(instruction).toContain(`${blockOf(shape)}`);
        expect(instruction.endsWith(blockOf(shape))).toBe(true);
        expect(instruction).not.toContain("## The shapes");
        expect(instruction).not.toContain("shape_id");
        expect(instruction).not.toContain(pack.shapes.find((v3) => v3.id === shape.id)!.guidance);
        for (const other of pack.shapesV4.filter((candidate) => candidate.id !== shape.id)) {
          expect(instruction).not.toContain(other.guidance);
        }
      }
    }
  });

  it("an unknown shape id is refused loudly, by name", () => {
    for (const assemble of [assembleStorytellerInstruction, assembleStoryCheckerInstruction]) {
      expect(() => assemble(pack, false, { shapeId: "poetry" }))
        .toThrowError(expect.objectContaining({ code: "STORY_PACK_SHAPE_UNKNOWN" }));
    }
  });

  it("explains the length field, the reasons and the long version to the storyteller; the objection and misleading to the checker", () => {
    for (const name of ["length", "why", "long"]) expect([name, pack.commonLength.includes(name)]).toEqual([name, true]);
    // D6 (2026-10-16, pre-flight PF-D4.1): the long version says whether each other answer's objection still stands.
    expect(pack.commonLength).toContain("still stands");
    expect(pack.commonLength).not.toContain("falls short");
    // The checker is told the same layout (spec §7.2 item 9, pre-flight PF-D4.3).
    for (const name of ["length", "objection", "long", "misleading", "still stands"]) {
      expect([name, pack.checkerLength.includes(name)]).toEqual([name, true]);
    }
  });

  it("keeps every form of the storyteller's instruction under 48 KB: v3, and v4 with each shape, with and without the map", () => {
    for (const mapFields of [false, true]) {
      for (const v4 of [null, ...pack.shapes.map((shape) => ({ shapeId: shape.id }))]) {
        expect(Buffer.byteLength(assembleStorytellerInstruction(pack, mapFields, v4), "utf8"))
          .toBeLessThanOrEqual(STORY_PACK_LIMITS.maxInstructionBytes);
      }
    }
  });

  it("has one v4 shape per shape, same ids, same order, same titles and sections (only the guidance differs)", () => {
    const withoutGuidance = (shapes: StoryPack["shapes"]) => shapes.map(({ guidance: _guidance, ...rest }) => rest);
    expect(withoutGuidance(pack.shapesV4)).toEqual(withoutGuidance(pack.shapes));
  });

  /** The line each v4 shape file changes (spec §7.2 item 10): the answers' paragraph, at 48586d527's line numbers. */
  const V4_CHANGED_LINE: Readonly<Record<string, number>> = Object.freeze({
    general: 17, health: 19, "money-decision": 19, legal: 19, factual: 19, "personal-choice": 19
  });

  it("each v4 shape file is its v3 file with exactly one line changed: ours first, then each other answer as an objection", () => {
    expect(Object.keys(V4_CHANGED_LINE).sort()).toEqual(pack.shapes.map((shape) => shape.id).sort());
    for (const shape of pack.shapes) {
      const v3 = readFileSync(join(SHIPPED_DIR, "shapes", `${shape.id}.md`), "utf8").split("\n");
      const v4 = readFileSync(join(SHIPPED_DIR, "shapes-v4", `${shape.id}.md`), "utf8").split("\n");
      expect([shape.id, v4.length]).toEqual([shape.id, v3.length]);
      const changed = v3.flatMap((line, index) => (line === v4[index] ? [] : [index + 1]));
      expect([shape.id, changed]).toEqual([shape.id, [V4_CHANGED_LINE[shape.id]]]);
      const at = V4_CHANGED_LINE[shape.id]! - 1;
      const label = (line: string): string => line.slice(0, line.indexOf(":") + 1);
      expect([shape.id, label(v4[at]!)]).toEqual([shape.id, label(v3[at]!)]);
      expect(v3[at]).toContain("one paragraph per position, ours first");
      expect(v4[at]).not.toContain("one paragraph per position");
      expect(v4[at]).toContain("as the objection it raises against");
      // D6 (2026-10-16, pre-flight PF-D4.1): whether the objection still stands, never that it falls short.
      expect(v4[at]).toContain("whether that objection still stands");
      expect(v4[at]).not.toContain("falls short");
    }
  });

  it("the question kinds the comparing judges name are exactly the pack's shapes (INTERFACE §5.4)", () => {
    expect(new Set(ENGINE_QUESTION_KINDS)).toEqual(new Set(pack.shapes.map((shape) => shape.id)));
    expect(new Set(ENGINE_QUESTION_KINDS)).toEqual(new Set(pack.shapesV4.map((shape) => shape.id)));
  });

  it("storyShapeOf: a strict majority of the kinds that are shapes; a tie, no majority or no kind gives the default", () => {
    expect(storyShapeOf({ questionKinds: ["health", "health", "general"], pack })).toBe("health");
    expect(storyShapeOf({ questionKinds: ["legal"], pack })).toBe("legal");
    expect(storyShapeOf({ questionKinds: ["health", "legal"], pack })).toBe("general");
    expect(storyShapeOf({ questionKinds: ["health", "health", "legal", "factual", "money-decision"], pack })).toBe("general");
    expect(storyShapeOf({ questionKinds: [], pack })).toBe("general");
    // A kind that is not a shape of this pack is not counted at all.
    const narrowed: StoryPack = { ...pack, shapes: pack.shapes.filter((shape) => shape.id !== "health") };
    expect(storyShapeOf({ questionKinds: ["health", "health", "factual"], pack: narrowed })).toBe("factual");
  });

  it("fingerprints every v4 file: one changed byte of common-length.md, checker-length.md or a v4 shape changes it", () => {
    for (const file of ["common-length.md", "checker-length.md", join("shapes-v4", "general.md")]) {
      const copy = scratchDir();
      cpSync(SHIPPED_DIR, copy, { recursive: true });
      const before = loadStoryPack(copy).fingerprint;
      const target = join(copy, file);
      const bytes = readFileSync(target);
      const last = bytes.length - 2;
      bytes[last] = bytes[last] === 0x2e ? 0x21 : 0x2e;
      writeFileSync(target, bytes);
      expect([file, loadStoryPack(copy).fingerprint === before]).toEqual([file, false]);
    }
  });
});

describe("verdict story v4 — the assembled v4 instruction's layout (engine redesign R1d)", () => {
  it("renders common text, the length passage, the shape sentence, then the one v4 shape with no id and no when-to-use", () => {
    const pack = loadStoryPack(writePack());
    expect(assembleStorytellerInstruction(pack, false, { shapeId: "beta" })).toBe([
      "Common instructions.",
      "Common length instructions.",
      "## The shape",
      // OWNER WORDING — approve before switch-on (STORY_V4_SHAPE_SENTENCE).
      "Use the sections of the shape below, in order, as the titles of long.sections, written in the language of the "
        + "question, and follow its guidance.",
      [
        "### Shape beta",
        "Sections, in order:",
        "1. First section",
        "2. Second section",
        "3. Third section",
        "Guidance:",
        "V4 guidance for beta."
      ].join("\n")
    ].join("\n\n"));
    expect(assembleStorytellerInstruction(pack, true, { shapeId: "alpha" }))
      .toContain("Common instructions.\n\nCommon map instructions.\n\nCommon length instructions.\n\n## The shape\n\n");
    expect(assembleStoryCheckerInstruction(pack, false, { shapeId: "beta" })).toBe("Checker instructions.\n\nChecker length instructions.");
    expect(assembleStoryCheckerInstruction(pack, true, { shapeId: "beta" }))
      .toBe("Checker instructions.\n\nChecker map instructions.\n\nChecker length instructions.");
  });
});
