/**
 * PATCH FOLLOW-UP (owner design, 2026-10-12): when a model's structured reply slips, recover in this order —
 *  (1) code reads it as is (`decodeModelJson`, the tolerant decode every structured step uses);
 *  (2) the SMALLEST follow-up call: the model gets its own answer back and is asked only for the members that failed,
 *      which are merged into its answer and re-checked by the step's own full check;
 *  (3) a full re-ask (the step's repair packet) only when the reply is unusable or the patch did not do.
 *
 * This file holds the code half of (2): which replies may be patched and at which paths (`planPatchFollowUp`), and
 * how a patch reply is merged (`mergePatchReply`). The packet is `buildFramedPatchPrompt` (./prompt-frame.ts); the
 * gateway's repair loop (./index.ts) decides when to send it. Nothing here accepts anything: the merged answer still
 * passes the step's own classifier, unchanged, or the call goes on to the full re-ask.
 */
import { decodeModelJson, type ModelReplyFacts } from "./model-json.js";
import { isPatchPath, isPatchPathList, schemaFailureLimits, type FramedPatchLocator } from "./prompt-frame.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A schema code token, as `schemaFailureLocator` accepts one. */
const REJECTION_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;

/** Every proper dot-prefix of a patch path ("a.b.c" → "a", "a.b"): at most seven, as a patch path has at most eight
 *  segments (`isPatchPath`). */
function pathAncestors(path: string): string[] {
  const ancestors: string[] = [];
  for (let dot = path.indexOf("."); dot !== -1; dot = path.indexOf(".", dot + 1)) ancestors.push(path.slice(0, dot));
  return ancestors;
}

/**
 * EVERY failing machine path of a refusal, or null when the refusal does not name each failure at a member the patch
 * could replace. Two refusal forms are read, the same two `schemaFailureLocator` reads (and nothing from either is
 * copied but whitelisted segments):
 *  · a JSON array of issues with a `path` array (zod's message, and the runner's and the story's own content checks);
 *  · the judge family's `code@path,code@path` list (DL4-F1), `$` for the root.
 * Null for: an issue at the root (an unknown key, a wrong top-level type: nothing to replace), a segment outside the
 * whitelist, more than eight distinct paths (`isPatchPathList`), or any other text (a parse error). A path under another listed
 * path is dropped: the outer member is replaced whole.
 */
export function schemaFailurePaths(parseError: string): readonly string[] | null {
  let raw: (readonly unknown[])[];
  try {
    const issues = JSON.parse(parseError) as unknown;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    raw = [];
    for (const issue of issues) {
      const path = isPlainObject(issue) ? issue.path : undefined;
      if (!Array.isArray(path)) return null;
      raw.push(path);
    }
  } catch {
    const text = parseError.trim();
    if (!/^[A-Za-z_]+@[A-Za-z0-9_.$]{1,200}(?:,[A-Za-z_]+@[A-Za-z0-9_.$]{1,200})*$/u.test(text)) return null;
    raw = text.split(",").map((entry) => {
      const path = entry.slice(entry.indexOf("@") + 1);
      return path === "$" ? [] : path.split(".");
    });
  }
  const paths = new Set<string>();
  for (const segments of raw) {
    if (segments.length === 0) return null;
    const path = segments.map((segment) => String(segment)).join(".");
    if (!segments.every((segment) => typeof segment === "string" || (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0))
      || !isPatchPath(path)) return null;
    paths.add(path);
  }
  // A path under another listed path is dropped (the outer member is replaced whole). Each path is checked against its
  // own at most seven ancestors, never against every other path: linear in the issue list (NV-37).
  const outermost = [...paths].filter((path) => !pathAncestors(path).some((ancestor) => paths.has(ancestor)));
  return isPatchPathList(outermost) ? Object.freeze(outermost) : null;
}

/** Whether `path` names a member of `base` that a value can be set at: every parent exists; an index is in range. */
function settable(base: Record<string, unknown>, path: string): boolean {
  const segments = path.split(".");
  let node: unknown = base;
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    if (Array.isArray(node)) {
      if (!/^(?:0|[1-9][0-9]{0,8})$/u.test(segment) || Number(segment) >= node.length) return false;
      if (last) return true;
      node = node[Number(segment)];
    } else if (isPlainObject(node)) {
      if (last) return true;
      if (!Object.hasOwn(node, segment)) return false;
      node = node[segment];
    } else {
      return false;
    }
  }
  return false;
}

export interface PatchFollowUpPlan {
  /** The first reply, decoded: the object the patch is merged into (never mutated). */
  readonly base: Readonly<Record<string, unknown>>;
  /** The locator the patch block carries. */
  readonly locator: FramedPatchLocator;
}

/**
 * Whether a refused reply may be patched, and how. Only a SCHEMA_FAILED reply that the tolerant decode reads as ONE
 * object, refused at named members that exist to be replaced (`schemaFailurePaths`, `settable`). The code is the
 * refusal's own when the issues name one (a content check's code, e.g. COMPOSED_TEXT_NAMES_A_NODE, when every issue
 * names the same one), else SCHEMA_FAILED. Null otherwise: a parse failure, a cut-off reply, prose, an issue at the
 * root — those are re-asked in full.
 */
export function planPatchFollowUp(input: {
  readonly content: string;
  readonly reply: ModelReplyFacts | undefined;
  readonly parseStatus: string;
  readonly parseError: string;
}): PatchFollowUpPlan | null {
  if (input.parseStatus !== "SCHEMA_FAILED") return null;
  const decoded = decodeModelJson(input.content, input.reply);
  if (!decoded.ok || !isPlainObject(decoded.value)) return null;
  const paths = schemaFailurePaths(input.parseError);
  if (paths === null || paths.length === 0) return null;
  const base = decoded.value;
  if (!paths.every((path) => settable(base, path))) return null;
  // Practice 2026-10-14: a size refusal states its limit (the 240-character line DeepSeek re-sent at 326); a refusal
  // that states none leaves the locator, and so the block, exactly as before.
  const limits = schemaFailureLimits(input.parseError, paths);
  return Object.freeze({
    base: Object.freeze(base),
    locator: Object.freeze({ code: issueCode(input.parseError), paths, ...(limits.length === 0 ? {} : { limits }) })
  });
}

/** The one content code every issue names (its `message`), or SCHEMA_FAILED. */
function issueCode(parseError: string): string {
  try {
    const issues = JSON.parse(parseError) as unknown;
    if (Array.isArray(issues)) {
      const codes = new Set(issues.map((issue) => isPlainObject(issue) ? issue.message : undefined));
      const [only] = [...codes];
      if (codes.size === 1 && typeof only === "string" && REJECTION_CODE.test(only)) return only;
    }
  } catch {
    // The judge's code@path list: its codes are the schema's own (invalid_type, …), so the step's code stands.
  }
  return "SCHEMA_FAILED";
}

/**
 * The patch reply decoded to one object with a key outside the request — most often the whole answer again. The
 * gateway then checks that reply as a whole answer (owner ruling 2026-10-12); the merge itself never accepts it.
 */
export const PATCH_KEY_NOT_REQUESTED = "PATCH_KEY_NOT_REQUESTED@$" as const;

export type PatchMerge =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED"; readonly parseError: string };

/**
 * THE MERGE. The patch reply is decoded with the same tolerant decode; it must be ONE object whose keys are a
 * non-empty subset of the requested paths (any other key refuses the whole patch). Each value is set at its path in a
 * deep copy of the first reply, and the result is serialised once, compactly (`JSON.stringify`, the first reply's
 * member order kept): that string is what the step's own classifier then checks and what the call hands back.
 */
export function mergePatchReply(plan: PatchFollowUpPlan, patchText: string, reply: ModelReplyFacts | undefined): PatchMerge {
  const decoded = decodeModelJson(patchText, reply);
  if (!decoded.ok) return Object.freeze({ ok: false, parseStatus: "PARSE_FAILED", parseError: "PATCH_NOT_AN_OBJECT@$" });
  if (!isPlainObject(decoded.value)) return Object.freeze({ ok: false, parseStatus: "SCHEMA_FAILED", parseError: "PATCH_NOT_AN_OBJECT@$" });
  const patch = decoded.value;
  const keys = Object.keys(patch);
  if (keys.length === 0) return Object.freeze({ ok: false, parseStatus: "SCHEMA_FAILED", parseError: "PATCH_EMPTY@$" });
  if (!keys.every((key) => plan.locator.paths.includes(key))) {
    return Object.freeze({ ok: false, parseStatus: "SCHEMA_FAILED", parseError: PATCH_KEY_NOT_REQUESTED });
  }
  const merged = structuredClone(plan.base) as Record<string, unknown>;
  for (const key of plan.locator.paths) {
    if (!Object.hasOwn(patch, key)) continue;
    const segments = key.split(".");
    let node: unknown = merged;
    for (const segment of segments.slice(0, -1)) {
      node = Array.isArray(node) ? node[Number(segment)] : (node as Record<string, unknown>)[segment];
    }
    const last = segments.at(-1)!;
    if (Array.isArray(node)) node[Number(last)] = patch[key];
    else Object.defineProperty(node as object, last, { value: patch[key], enumerable: true, writable: true, configurable: true });
  }
  return Object.freeze({ ok: true, content: JSON.stringify(merged) });
}
