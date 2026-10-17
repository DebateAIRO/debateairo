import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TypedDomainError, type EngineQuestionKind } from "@debateai/kernel";
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
  /**
   * Debate shape (whole-branch review I-1, ruling W-STORY): what the storyteller and the checker are told about the
   * two map fields (`also_raised`, `answers_note`). Sent ONLY when the material carries one of them, so a story
   * without a map gets exactly the instructions it got before the debate shape, byte for byte.
   */
  readonly commonMap: string;
  readonly checkerMap: string;
  /**
   * Story v4 (engine redesign spec 2026-10-15 §7.2 items 3, 7, 9, 10; absorbs length guidance LG-D): what the storyteller
   * and the checker are told about the `length` field, the long version's length, what may be said about the debate's
   * gaps, misleading problems against wording notes, and the answers' layout in the long version. Sent ONLY with the v4
   * story contracts (engine 2), so every other story gets exactly the instructions it got before, byte for byte.
   * OWNER WORDING — approve before switch-on (common-length.md, checker-length.md).
   */
  readonly commonLength: string;
  readonly checkerLength: string;
  readonly shapes: readonly StoryShape[];
  /**
   * Story v4 (spec §7.2 items 2, 10): the v4 text of every shape (`shapes-v4/<id>.md`), one per id of `shapes`, in the
   * same order, under the same rules. A v4 story is told ONE of them; `shapes` stays the v3 menu, byte for byte.
   * OWNER WORDING — approve before switch-on (shapes-v4/<id>.md).
   */
  readonly shapesV4: readonly StoryShape[];
  readonly fingerprint: string;
}

/** The one environment key that moves the pack; the runner passes its environment in. */
export const STORY_SHAPES_DIR_ENV_KEY = "DEBATEAI_STORY_SHAPES_DIR" as const;

/**
 * The limits a pack must meet. Byte limits are UTF-8 bytes (24 KB per file,
 * 48 KB for the assembled storyteller instruction). Frozen, so nothing can
 * loosen a limit at run time. The file limit was 12 KB; the owners' look-gate
 * rewrite of common.md needed more, and the owners need room to keep editing
 * it (spec §5.1, controller ruling in R1 fix round 1), so it is 24 KB.
 */
export const STORY_PACK_LIMITS = Object.freeze({
  maxFileBytes: 24 * 1024,
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
/** The file that marks the workspace root: the upward walk never looks above it. */
const STORY_WORKSPACE_ROOT_MARKER = "pnpm-workspace.yaml";
const STORY_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/u;
/** Every control character except line feed and tab: C0, DEL and C1. */
const STORY_CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
/** Printable text: letters, marks, digits, punctuation, symbols and spaces; never a control or format character, a tab or a line break. */
const STORY_PRINTABLE_TEXT = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
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
 * never a path baked in for one machine. The walk stops at the workspace root
 * (the first directory holding `pnpm-workspace.yaml`), so a pack lying above
 * the repository, in a parent folder, is never picked up by accident.
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
    if (existsSync(join(cursor, STORY_WORKSPACE_ROOT_MARKER))) break;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new TypedDomainError(
    "STORY_PACK_DIR_UNRESOLVED",
    `No ${STORY_SHAPES_DIRECTORY}/${STORY_PACK_MANIFEST} from ${start} up to the workspace root (${STORY_WORKSPACE_ROOT_MARKER}); set ${STORY_SHAPES_DIR_ENV_KEY}`
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
 * Story v4 (engine redesign spec 2026-10-15 §7.2 item 2; INTERFACE §5.2, §5.4): the one shape a v4 story is told. The
 * storyteller no longer chooses: code picks the shape (`storyShapeOf`) and fills `shape_id` on the decoded story.
 */
export type StoryV4Options = Readonly<{ shapeId: string }>;

/**
 * The code sentence before the one v4 shape (the v3 menu's choosing sentence without the choice).
 * OWNER WORDING — approve before switch-on (option 1; ships behind the engine row, absent = today's bytes).
 */
export const STORY_V4_SHAPE_SENTENCE = "Use the sections of the shape below, in order, as the titles of long.sections, written in the language of the question, and follow its guidance.";

/** The v4 shape a v4 instruction names; an id the pack does not have is a programming error, refused by name. */
function storyV4Shape(pack: StoryPack, v4: StoryV4Options): StoryShape {
  const shape = pack.shapesV4.find((candidate) => candidate.id === v4.shapeId);
  if (shape === undefined) {
    throw new TypedDomainError(
      "STORY_PACK_SHAPE_UNKNOWN",
      `${JSON.stringify(v4.shapeId.slice(0, 40))} is not a shape of story pack ${pack.packId} ${pack.version}`
    );
  }
  return shape;
}

/**
 * The storyteller's instruction: `common.md`, then a menu of every shape with
 * its id, title, when-to-use line, ordered sections and guidance.
 *
 * Debate shape (ruling W-STORY): with `mapFields` true (the material carries `also_raised` or `answers_note`),
 * `common-map.md` follows `common.md`, before the menu. Without it the instruction is the one every story got before
 * the debate shape, byte for byte.
 *
 * Story v4 (engine 2, R1d): with `v4` set, `common-length.md` follows them, then "## The shape", the shape sentence and
 * the ONE v4 shape (title, ordered sections, guidance; no id and no when-to-use: nothing is chosen). With `v4` null the
 * instruction is today's, byte for byte.
 */
export function assembleStorytellerInstruction(pack: StoryPack, mapFields = false, v4: StoryV4Options | null = null): string {
  if (v4 !== null) {
    const shape = storyV4Shape(pack, v4);
    return [
      pack.common,
      ...(mapFields ? [pack.commonMap] : []),
      pack.commonLength,
      "## The shape",
      STORY_V4_SHAPE_SENTENCE,
      [
        `### ${shape.title}`,
        "Sections, in order:",
        ...shape.sections.map((title, index) => `${String(index + 1)}. ${title}`),
        "Guidance:",
        shape.guidance
      ].join("\n")
    ].join("\n\n");
  }
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
    ...(mapFields ? [pack.commonMap] : []),
    "## The shapes",
    `Choose the one shape below that best fits the question, and put its id in shape_id. When none fits clearly, choose ${pack.defaultShape}. Use the chosen shape's sections, in order, as the titles of long.sections, written in the language of the question, and follow its guidance.`,
    ...menu
  ].join("\n\n");
}

/**
 * The checker's instruction: `checker.md`, then, only when the material carries a map field (ruling W-STORY),
 * `checker-map.md` after a blank line. Without it, the checker's instruction of every story before the debate shape.
 * Story v4 (R1d): with `v4` set, `checker-length.md` follows them, after a blank line (the shape must still be the
 * pack's: the checker is asked about the same story).
 */
export function assembleStoryCheckerInstruction(pack: StoryPack, mapFields = false, v4: StoryV4Options | null = null): string {
  if (v4 !== null) {
    storyV4Shape(pack, v4);
    return [pack.checker, ...(mapFields ? [pack.checkerMap] : []), pack.checkerLength].join("\n\n");
  }
  return mapFields ? `${pack.checker}\n\n${pack.checkerMap}` : pack.checker;
}

/**
 * Story v4 (spec §7.2 item 2, INTERFACE §5.4): the one shape a v4 story is told. Only kinds that are shapes of this
 * pack are counted; the shape named by more than half of them is chosen; a tie, no strict majority, or no kind at all
 * gives the pack's default shape. R1d passes no kinds (the default, deviation 12); R2 passes the comparing judges'.
 */
export function storyShapeOf(input: Readonly<{ questionKinds: readonly EngineQuestionKind[]; pack: StoryPack }>): string {
  const shapeIds = new Set(input.pack.shapes.map((shape) => shape.id));
  const counted = input.questionKinds.filter((kind) => shapeIds.has(kind));
  const votes = new Map<string, number>();
  for (const kind of counted) votes.set(kind, (votes.get(kind) ?? 0) + 1);
  for (const [kind, count] of votes) {
    if (count * 2 > counted.length) return kind;
  }
  return input.pack.defaultShape;
}

interface StoryShapeFolder {
  readonly files: readonly StoryPackFile[];
  readonly shapes: readonly StoryShape[];
}

/** Every listed shape from one folder (`shapes` for v3, `shapes-v4` for v4), each under every shape rule, with its own id. */
function loadStoryShapes(dir: string, folder: string, shapeIds: readonly string[]): StoryShapeFolder {
  const files: StoryPackFile[] = [];
  const shapes: StoryShape[] = [];
  for (const id of shapeIds) {
    const file = readStoryPackFile(dir, `${folder}/${id}.md`);
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
    files.push(file);
    shapes.push(shape);
  }
  return Object.freeze({ files: Object.freeze(files), shapes: Object.freeze(shapes) });
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
  // The file check reads raw bytes; a JSON escape such as \u0000 only becomes a
  // character once decoded, so the version is checked again as decoded text.
  const versionControl = STORY_CONTROL_CHARACTER.exec(version);
  if (versionControl !== null) {
    const codePoint = versionControl[0].codePointAt(0) ?? 0;
    throw storyPackFailure(
      "CONTROL_CHARACTER",
      `${STORY_PACK_MANIFEST} version holds U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} at character ${String(versionControl.index)}`
    );
  }
  if (!STORY_PRINTABLE_TEXT.test(version)) {
    throw storyPackFailure("PACK_JSON_INVALID", `${STORY_PACK_MANIFEST} version must be printable text on one line`);
  }
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
  const commonMapFile = readStoryPackFile(dir, "common-map.md");
  const checkerMapFile = readStoryPackFile(dir, "checker-map.md");
  const commonLengthFile = readStoryPackFile(dir, "common-length.md");
  const checkerLengthFile = readStoryPackFile(dir, "checker-length.md");
  for (const file of [commonFile, checkerFile, commonMapFile, checkerMapFile, commonLengthFile, checkerLengthFile]) {
    if (file.text.trim() === "") throw storyPackFailure("TEXT_EMPTY", `${file.path} is empty`);
  }

  const v3Shapes = loadStoryShapes(dir, "shapes", shapeIds);
  // Story v4 (R1d): one v4 file per listed shape, under the same rules and ids; no manifest key lists them.
  const v4Shapes = loadStoryShapes(dir, "shapes-v4", shapeIds);

  const pack: StoryPack = Object.freeze({
    packId,
    version,
    defaultShape,
    common: commonFile.text.trim(),
    checker: checkerFile.text.trim(),
    commonMap: commonMapFile.text.trim(),
    checkerMap: checkerMapFile.text.trim(),
    commonLength: commonLengthFile.text.trim(),
    checkerLength: checkerLengthFile.text.trim(),
    shapes: v3Shapes.shapes,
    shapesV4: v4Shapes.shapes,
    fingerprint: storyPackFingerprint([manifestFile, commonFile, checkerFile, commonMapFile, checkerMapFile, commonLengthFile,
      checkerLengthFile, ...v3Shapes.files, ...v4Shapes.files])
  });
  // Every form of the storyteller's instruction is checked: v3 (the menu) and v4 with each shape, each with and without
  // the map passages. The largest bounds the size, and each must pass the frame's door.
  for (const mapFields of [false, true]) {
    for (const v4 of [null, ...shapeIds.map((shapeId): StoryV4Options => Object.freeze({ shapeId }))]) {
      const instruction = assembleStorytellerInstruction(pack, mapFields, v4);
      const instructionBytes = Buffer.byteLength(instruction, "utf8");
      // Task 9 review 3: the refusal names the form (v3, or v4 and its shape) and whether the map passages were in it.
      const form = `the assembled storyteller instruction (${v4 === null ? "v3" : `v4, shape ${v4.shapeId}`}${mapFields ? ", with the map passages" : ""})`;
      if (instructionBytes > STORY_PACK_LIMITS.maxInstructionBytes) {
        throw storyPackFailure(
          "INSTRUCTION_TOO_LARGE",
          `${form} is ${String(instructionBytes)} bytes; the limit is ${String(STORY_PACK_LIMITS.maxInstructionBytes)}`
        );
      }
      assertStoryTextFrameable(form, instruction);
    }
  }
  assertStoryTextFrameable(checkerFile.path, pack.checker);
  assertStoryTextFrameable(checkerMapFile.path, pack.checkerMap);
  assertStoryTextFrameable(checkerLengthFile.path, pack.checkerLength);
  return pack;
}
