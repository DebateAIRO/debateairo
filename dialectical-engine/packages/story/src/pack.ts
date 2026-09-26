import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import { buildFramedPrompt } from "@debateai/providers";

/**
 * THE SHAPE PACK (verdict-story spec §5.1) — the owners' half of the two story
 * prompts, kept as plain files the engine reads.
 *
 * The pack is NOT a register row: pinning it there would make every owner edit
 * a new register version, against the owners' ruling. It is fingerprinted
 * instead, and every story row records the fingerprint, so any story can be
 * traced to the exact bytes that wrote it. The frame around the pack (the
 * fence, the evidence rule, the answer forms) stays code's, in `contracts.ts`.
 *
 * A pack that breaks any rule below is refused WHOLE, with the rule's name,
 * and the story is disabled; a debate is never refused because of it.
 */

export interface StoryShape {
  readonly id: string;
  readonly title: string;
  readonly whenToUse: string;
  readonly sections: readonly string[];
  readonly guidance: string;
}

export interface StoryPack {
  readonly packId: string;
  readonly version: string;
  readonly defaultShape: string;
  readonly common: string;
  readonly checker: string;
  readonly shapes: readonly StoryShape[];
  readonly fingerprint: string;
}

/** The one environment key that moves the pack; the runner passes its environment in. */
export const STORY_SHAPES_DIR_ENV_KEY = "DEBATEAI_STORY_SHAPES_DIR" as const;

/**
 * The limits a pack must meet. Byte limits are UTF-8 bytes (12 KB per file,
 * 48 KB for the assembled storyteller instruction). Frozen, so nothing can
 * loosen a limit at run time.
 */
export const STORY_PACK_LIMITS = Object.freeze({
  maxFileBytes: 12 * 1024,
  maxInstructionBytes: 48 * 1024,
  minSections: 3,
  maxSections: 12,
  maxSectionTitleChars: 80,
  maxTitleChars: 80,
  maxWhenToUseChars: 300,
  maxVersionChars: 64
});

const STORY_SHAPES_DIRECTORY = "story-shapes";
const STORY_PACK_MANIFEST = "pack.json";
const STORY_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/u;
/** Every control character except line feed and tab: C0, DEL and C1. */
const STORY_CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
const STORY_FRONT_MATTER_KEYS = new Set(["id", "title", "when_to_use"]);

const StoryPackManifestSchema = z.object({
  pack_id: z.string(),
  version: z.string().trim().min(1).max(STORY_PACK_LIMITS.maxVersionChars),
  default_shape: z.string(),
  shapes: z.array(z.string()).min(1)
}).strict();

interface StoryPackFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly text: string;
}

function storyPackFailure(rule: string, detail: string): TypedDomainError {
  return new TypedDomainError("STORY_PACK_INVALID", `${rule}: ${detail}`);
}

/**
 * Where the pack lives. The override wins when it is set at all, and a value
 * that names no directory holding `pack.json` fails loudly rather than falling
 * back. Otherwise the walk goes up from the caller's module to the first
 * directory that holds `story-shapes/pack.json`: relative to the repository,
 * never a path baked in for one machine.
 */
export function resolveStoryPackDir(input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly moduleUrl: string;
}): string {
  const override = input.env[STORY_SHAPES_DIR_ENV_KEY];
  if (override !== undefined) {
    const directory = resolve(override);
    if (override.trim() === "" || !existsSync(join(directory, STORY_PACK_MANIFEST))) {
      throw new TypedDomainError(
        "STORY_PACK_DIR_UNRESOLVED",
        `${STORY_SHAPES_DIR_ENV_KEY} names no directory holding ${STORY_PACK_MANIFEST}: ${override}`
      );
    }
    return directory;
  }
  const start = dirname(fileURLToPath(input.moduleUrl));
  let cursor = start;
  for (;;) {
    const candidate = join(cursor, STORY_SHAPES_DIRECTORY);
    if (existsSync(join(candidate, STORY_PACK_MANIFEST))) return candidate;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new TypedDomainError(
    "STORY_PACK_DIR_UNRESOLVED",
    `No ${STORY_SHAPES_DIRECTORY}/${STORY_PACK_MANIFEST} above ${start}; set ${STORY_SHAPES_DIR_ENV_KEY}`
  );
}

function readStoryPackFile(directory: string, path: string): StoryPackFile {
  const absolute = join(directory, ...path.split("/"));
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw storyPackFailure("FILE_MISSING", `${path} is not in the pack`);
  }
  const bytes = readFileSync(absolute);
  if (bytes.byteLength > STORY_PACK_LIMITS.maxFileBytes) {
    throw storyPackFailure(
      "FILE_TOO_LARGE",
      `${path} is ${String(bytes.byteLength)} bytes; the limit is ${String(STORY_PACK_LIMITS.maxFileBytes)}`
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw storyPackFailure("NOT_UTF8", `${path} is not valid UTF-8`);
  }
  const control = STORY_CONTROL_CHARACTER.exec(text);
  if (control !== null) {
    const codePoint = control[0].codePointAt(0) ?? 0;
    throw storyPackFailure(
      "CONTROL_CHARACTER",
      `${path} holds U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} at character ${String(control.index)}`
    );
  }
  return Object.freeze({ path, bytes, text });
}

function parseStoryShapeFile(file: StoryPackFile): StoryShape {
  const lines = file.text.split("\n");
  if (lines[0] !== "---") {
    throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} must open with a line holding only ---`);
  }
  const close = lines.indexOf("---", 1);
  if (close < 0) {
    throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} has no closing --- line`);
  }
  const scalars = new Map<string, string>();
  const sections: string[] = [];
  let sawSections = false;
  let inSections = false;
  for (const line of lines.slice(1, close)) {
    if (line.trim() === "") continue;
    const item = /^\s+-\s+(.*)$/u.exec(line);
    if (item !== null) {
      if (!inSections) {
        throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} has a list item outside sections`);
      }
      sections.push((item[1] ?? "").trim());
      continue;
    }
    const entry = /^([a-z_]+):(.*)$/u.exec(line);
    if (entry === null) {
      throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} has a front-matter line that is not key: value`);
    }
    const key = entry[1] ?? "";
    const value = (entry[2] ?? "").trim();
    if (key === "sections") {
      if (sawSections || value !== "") {
        throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} lists sections once, one "  - title" line each`);
      }
      sawSections = true;
      inSections = true;
      continue;
    }
    inSections = false;
    if (!STORY_FRONT_MATTER_KEYS.has(key) || scalars.has(key)) {
      throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} has an unknown or repeated key ${key}`);
    }
    if (value === "") {
      throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} leaves ${key} empty`);
    }
    scalars.set(key, value);
  }
  const id = scalars.get("id");
  const title = scalars.get("title");
  const whenToUse = scalars.get("when_to_use");
  if (id === undefined || title === undefined || whenToUse === undefined || !sawSections) {
    throw storyPackFailure("FRONT_MATTER_INVALID", `${file.path} needs id, title, when_to_use and sections`);
  }
  if (title.length > STORY_PACK_LIMITS.maxTitleChars || whenToUse.length > STORY_PACK_LIMITS.maxWhenToUseChars) {
    throw storyPackFailure(
      "FRONT_MATTER_INVALID",
      `${file.path}: title is at most ${String(STORY_PACK_LIMITS.maxTitleChars)} characters and when_to_use at most ${String(STORY_PACK_LIMITS.maxWhenToUseChars)}`
    );
  }
  return Object.freeze({
    id,
    title,
    whenToUse,
    sections: Object.freeze(sections),
    guidance: lines.slice(close + 1).join("\n").trim()
  });
}

/** sha256 over every loaded file: sorted relative paths, each with its byte length and bytes. */
function storyPackFingerprint(files: readonly StoryPackFile[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  for (const file of sorted) {
    hash.update(`${file.path}\n${String(file.bytes.byteLength)}\n`, "utf8");
    hash.update(file.bytes);
  }
  return hash.digest("hex");
}

/**
 * The frame's reserved tokens (the fence, the canary, the contract marker, the
 * frame banner) may not appear in an owners' text: `buildFramedPrompt` refuses
 * such a contract at build time, which would fail every story. The pack is put
 * through that same door once, at load, so a bad edit is refused here, by name.
 */
function assertStoryTextFrameable(path: string, text: string): void {
  try {
    buildFramedPrompt({
      contract: { contractId: "story.pack-probe.v1", instruction: text, answerForm: "Return nothing." },
      material: []
    });
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "PROMPT_INSTRUCTION_RESERVED_TOKEN") {
      throw storyPackFailure("RESERVED_TOKEN", `${path} holds a token reserved for the engine's safety frame`);
    }
    throw error;
  }
}

/**
 * The storyteller's instruction: `common.md`, then a menu of every shape with
 * its id, title, when-to-use line, ordered sections and guidance.
 */
export function assembleStorytellerInstruction(pack: StoryPack): string {
  const menu = pack.shapes.map((shape) => [
    `### Shape ${shape.id}: ${shape.title}`,
    `When to use: ${shape.whenToUse}`,
    "Sections, in order:",
    ...shape.sections.map((title, index) => `${String(index + 1)}. ${title}`),
    "Guidance:",
    shape.guidance
  ].join("\n"));
  return [
    pack.common,
    "## The shapes",
    `Choose the one shape below that best fits the question, and put its id in shape_id. When none fits clearly, choose ${pack.defaultShape}. Use the chosen shape's sections, in order, as the titles of long.sections, written in the language of the question, and follow its guidance.`,
    ...menu
  ].join("\n\n");
}

/**
 * Load and validate a pack. Throws `STORY_PACK_INVALID` with a message that
 * opens with the rule that failed: FILE_MISSING, FILE_TOO_LARGE, NOT_UTF8,
 * CONTROL_CHARACTER, PACK_JSON_INVALID, ID_INVALID, ID_DUPLICATE,
 * DEFAULT_SHAPE_MISSING, TEXT_EMPTY, FRONT_MATTER_INVALID, SHAPE_ID_MISMATCH,
 * SECTION_COUNT, SECTION_TITLE_INVALID, INSTRUCTION_TOO_LARGE or RESERVED_TOKEN.
 */
export function loadStoryPack(dir: string): StoryPack {
  const manifestFile = readStoryPackFile(dir, STORY_PACK_MANIFEST);
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestFile.text);
  } catch {
    throw storyPackFailure("PACK_JSON_INVALID", `${STORY_PACK_MANIFEST} is not JSON`);
  }
  const manifest = StoryPackManifestSchema.safeParse(manifestJson);
  if (!manifest.success) {
    throw storyPackFailure(
      "PACK_JSON_INVALID",
      `${STORY_PACK_MANIFEST} holds exactly pack_id, version, default_shape and a non-empty shapes list`
    );
  }
  const { pack_id: packId, version, default_shape: defaultShape, shapes: shapeIds } = manifest.data;
  for (const id of [packId, ...shapeIds]) {
    if (!STORY_ID_PATTERN.test(id)) {
      throw storyPackFailure("ID_INVALID", `${JSON.stringify(id.slice(0, 40))} must match ${STORY_ID_PATTERN.source}`);
    }
  }
  if (new Set(shapeIds).size !== shapeIds.length) {
    throw storyPackFailure("ID_DUPLICATE", `${STORY_PACK_MANIFEST} lists a shape id twice`);
  }
  if (!shapeIds.includes(defaultShape)) {
    throw storyPackFailure("DEFAULT_SHAPE_MISSING", `default_shape ${JSON.stringify(defaultShape.slice(0, 40))} is not a listed shape`);
  }

  const commonFile = readStoryPackFile(dir, "common.md");
  const checkerFile = readStoryPackFile(dir, "checker.md");
  for (const file of [commonFile, checkerFile]) {
    if (file.text.trim() === "") throw storyPackFailure("TEXT_EMPTY", `${file.path} is empty`);
  }

  const shapeFiles: StoryPackFile[] = [];
  const shapes: StoryShape[] = [];
  for (const id of shapeIds) {
    const file = readStoryPackFile(dir, `shapes/${id}.md`);
    const shape = parseStoryShapeFile(file);
    if (shape.id !== id) {
      throw storyPackFailure("SHAPE_ID_MISMATCH", `${file.path} declares id ${JSON.stringify(shape.id.slice(0, 40))}`);
    }
    if (shape.sections.length < STORY_PACK_LIMITS.minSections || shape.sections.length > STORY_PACK_LIMITS.maxSections) {
      throw storyPackFailure(
        "SECTION_COUNT",
        `${file.path} has ${String(shape.sections.length)} sections; a shape has ${String(STORY_PACK_LIMITS.minSections)} to ${String(STORY_PACK_LIMITS.maxSections)}`
      );
    }
    for (const title of shape.sections) {
      if (title === "" || title.length > STORY_PACK_LIMITS.maxSectionTitleChars) {
        throw storyPackFailure(
          "SECTION_TITLE_INVALID",
          `${file.path} has a section title that is empty or longer than ${String(STORY_PACK_LIMITS.maxSectionTitleChars)} characters`
        );
      }
    }
    if (shape.guidance === "") throw storyPackFailure("TEXT_EMPTY", `${file.path} has no guidance after its front matter`);
    shapeFiles.push(file);
    shapes.push(shape);
  }

  const pack: StoryPack = Object.freeze({
    packId,
    version,
    defaultShape,
    common: commonFile.text.trim(),
    checker: checkerFile.text.trim(),
    shapes: Object.freeze(shapes),
    fingerprint: storyPackFingerprint([manifestFile, commonFile, checkerFile, ...shapeFiles])
  });
  const instruction = assembleStorytellerInstruction(pack);
  const instructionBytes = Buffer.byteLength(instruction, "utf8");
  if (instructionBytes > STORY_PACK_LIMITS.maxInstructionBytes) {
    throw storyPackFailure(
      "INSTRUCTION_TOO_LARGE",
      `the assembled storyteller instruction is ${String(instructionBytes)} bytes; the limit is ${String(STORY_PACK_LIMITS.maxInstructionBytes)}`
    );
  }
  assertStoryTextFrameable("the assembled storyteller instruction", instruction);
  assertStoryTextFrameable(checkerFile.path, pack.checker);
  return pack;
}
