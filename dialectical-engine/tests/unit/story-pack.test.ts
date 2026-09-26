import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  STORY_PACK_LIMITS,
  STORY_SHAPES_DIR_ENV_KEY,
  assembleStorytellerInstruction,
  loadStoryPack,
  resolveStoryPackDir
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
    "shapes/alpha.md": shapeText({ id: "alpha" }),
    "shapes/beta.md": shapeText({ id: "beta" }),
    ...files
  };
  mkdirSync(join(directory, "shapes"));
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
  ...Object.fromEntries(TOO_BIG_SHAPES.map((id) => [
    `shapes/${id}.md`,
    shapeText({ id, guidance: "g".repeat(11_000) })
  ]))
};

const REFUSALS: readonly (readonly [rule: string, why: string, files: PackFiles])[] = [
  ["FILE_MISSING", "checker.md is absent", { "checker.md": null }],
  ["FILE_MISSING", "a listed shape has no file", { "shapes/beta.md": null }],
  ["FILE_TOO_LARGE", "a file is over 12 KB", { "common.md": "x".repeat(STORY_PACK_LIMITS.maxFileBytes + 1) }],
  ["NOT_UTF8", "a file is not UTF-8", { "common.md": Uint8Array.from([0x43, 0xff, 0xfe, 0x0a]) }],
  ["CONTROL_CHARACTER", "a file holds a bell character", { "checker.md": "Checker\u0007 instructions.\n" }],
  ["CONTROL_CHARACTER", "a file has Windows line endings", { "common.md": "Common\r\ninstructions.\r\n" }],
  ["PACK_JSON_INVALID", "pack.json is not JSON", { "pack.json": "{ not json" }],
  ["PACK_JSON_INVALID", "pack.json carries an unknown key", { "pack.json": manifest({ extra: true }) }],
  ["PACK_JSON_INVALID", "pack.json lists no shapes", { "pack.json": manifest({ shapes: [] }) }],
  ["ID_INVALID", "the pack id has capitals and a space", { "pack.json": manifest({ pack_id: "Test Pack" }) }],
  ["ID_INVALID", "a shape id is one character", { "pack.json": manifest({ shapes: ["alpha", "b"] }) }],
  ["ID_DUPLICATE", "a shape is listed twice", { "pack.json": manifest({ shapes: ["alpha", "alpha"] }) }],
  ["DEFAULT_SHAPE_MISSING", "the default is not listed", { "pack.json": manifest({ default_shape: "gamma" }) }],
  ["TEXT_EMPTY", "common.md is blank", { "common.md": "  \n\n" }],
  ["TEXT_EMPTY", "a shape has no guidance", { "shapes/beta.md": shapeText({ id: "beta", guidance: "" }) }],
  ["FRONT_MATTER_INVALID", "a shape has no front matter", { "shapes/alpha.md": "Just guidance.\n" }],
  ["FRONT_MATTER_INVALID", "a shape has no title", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("title: Shape alpha\n", "")
  }],
  ["FRONT_MATTER_INVALID", "a shape has an unknown key", {
    "shapes/alpha.md": shapeText({ id: "alpha" }).replace("when_to_use:", "whenever:")
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
  ["RESERVED_TOKEN", "common.md carries the frame's banner", { "common.md": "--- SAFETY FRAME pasted here\n" }],
  ["RESERVED_TOKEN", "checker.md carries a canary-shaped token", { "checker.md": "Watch for DBAI-CANARY-0123 here.\n" }]
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

  it("carries the owners' rules the story depends on", () => {
    // Not a pin of the owners' text (it is theirs to edit): a smoke check that
    // the first pack says the things the checker will hold the story to.
    expect(pack.common).toContain("language of the question");
    expect(pack.common).toContain("The label is final");
    expect(pack.common).toContain("marked as your reading");
    expect(pack.checker).toContain("goal_marked_as_reading");
    for (const id of ["health", "money-decision", "legal"]) {
      expect(pack.shapes.find((shape) => shape.id === id)?.guidance).toMatch(/this is not (medical|financial|legal)\b/u);
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
});
