import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const ZONE_ROUTES = Object.freeze([
  "/v1/auth/register",
  "/v1/auth/verify-email",
  "/v1/auth/resend-verification",
]);

export type ZoneRegion =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly shapeOk: true;
      readonly startLine: number;
      readonly endLine: number;
      readonly startOffset: number;
      readonly endOffset: number;
      readonly mounts: readonly {
        readonly verb: string;
        readonly path: string | null;
        readonly line: number;
      }[];
      readonly bytes: number;
      readonly region: string;
      readonly contentHash: string;
    };

const GUARD = /(^|[^\w$.])if\s*\(\s*options\.registration\s*!==\s*undefined\s*\)\s*\{/gmu;
const BUILD_API = /\bexport\s+function\s+buildApi\s*\(/gmu;
const MOUNT = /(^|[^\w$.])api\s*\.\s*(get|post|put|delete|patch|options|head|all|route)\s*\(/gmu;
const OBS_SURFACE = /@debateai\/obs-capture|obs-capture|captureError|zoneBoundary|obsInstall/u;
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:type\s+)?(?:[^"'\n]*?\sfrom\s*)?["']([^"']+)["']/gmu;
const DYNAMIC_IMPORT = /\b(?:import|require)\s*\(/gmu;

function failure(reason: string): ZoneRegion {
  return Object.freeze({
    ok: false,
    reason: `ZONE_BOUNDARY_UNRESOLVED: ${reason}`,
  });
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

function blank(output: string[], index: number): void {
  if (output[index] !== "\n" && output[index] !== "\r") output[index] = " ";
}

/**
 * Masks comments and literals without changing UTF-16 offsets or newlines.
 * Template expression code remains visible, including its balancing braces.
 */
export function maskNonCode(source: string): string {
  const output = source.split("");
  const templateExpressionDepths: number[] = [];
  let index = 0;
  let mode: "code" | "template" = "code";
  let previousCanEndExpression = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "template") {
      if (char === "\\") {
        blank(output, index);
        index += 1;
        if (index < source.length) blank(output, index);
        index += 1;
        continue;
      }
      if (char === "`" && templateExpressionDepths.length === 0) {
        blank(output, index);
        index += 1;
        mode = "code";
        previousCanEndExpression = true;
        continue;
      }
      if (char === "$" && next === "{") {
        templateExpressionDepths.push(1);
        mode = "code";
        previousCanEndExpression = false;
        index += 2;
        continue;
      }
      blank(output, index);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        blank(output, index);
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      blank(output, index);
      blank(output, index + 1);
      index += 2;
      while (
        index < source.length
        && !(source[index] === "*" && source[index + 1] === "/")
      ) {
        blank(output, index);
        index += 1;
      }
      if (index < source.length) {
        blank(output, index);
        blank(output, index + 1);
        index += 2;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      blank(output, index);
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          blank(output, index);
          index += 1;
        }
        if (index < source.length) blank(output, index);
        index += 1;
      }
      if (index < source.length) blank(output, index);
      index += 1;
      previousCanEndExpression = true;
      continue;
    }
    if (char === "`") {
      blank(output, index);
      index += 1;
      mode = "template";
      continue;
    }
    if (char === "/" && !previousCanEndExpression) {
      let cursor = index + 1;
      let inClass = false;
      let closed = false;
      while (cursor < source.length && source[cursor] !== "\n") {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === "[") inClass = true;
        if (source[cursor] === "]") inClass = false;
        if (source[cursor] === "/" && !inClass) {
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (closed) {
        while (index <= cursor) {
          blank(output, index);
          index += 1;
        }
        while (index < source.length && /[a-z]/iu.test(source[index] ?? "")) {
          blank(output, index);
          index += 1;
        }
        previousCanEndExpression = true;
        continue;
      }
    }

    if (templateExpressionDepths.length > 0) {
      const top = templateExpressionDepths.length - 1;
      if (char === "{") {
        templateExpressionDepths[top] = (templateExpressionDepths[top] ?? 0) + 1;
      } else if (char === "}") {
        templateExpressionDepths[top] = (templateExpressionDepths[top] ?? 0) - 1;
        if (templateExpressionDepths[top] === 0) {
          templateExpressionDepths.pop();
          index += 1;
          mode = "template";
          previousCanEndExpression = true;
          continue;
        }
      }
    }

    if (/[A-Za-z0-9_$]/u.test(char ?? "")) {
      let cursor = index + 1;
      while (cursor < source.length && /[A-Za-z0-9_$]/u.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      const token = source.slice(index, cursor);
      previousCanEndExpression = ![
        "case",
        "delete",
        "else",
        "in",
        "instanceof",
        "new",
        "return",
        "throw",
        "typeof",
        "void",
        "yield",
      ].includes(token);
      index = cursor;
      continue;
    }

    if (/\S/u.test(char ?? "")) {
      previousCanEndExpression = char === ")" || char === "]" || char === "}";
    }
    index += 1;
  }

  return output.join("");
}

function findMatchingBrace(masked: string, open: number): number {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === "{") depth += 1;
    if (masked[index] === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function braceDepth(masked: string, start: number, end: number): number {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    if (masked[index] === "{") depth += 1;
    if (masked[index] === "}") depth -= 1;
  }
  return depth;
}

function literalArgument(originalRegion: string, openOffset: number): string | null {
  let cursor = openOffset + 1;
  while (/\s/u.test(originalRegion[cursor] ?? "")) cursor += 1;
  const quote = originalRegion[cursor];
  if (quote !== '"' && quote !== "'") return null;
  let end = cursor + 1;
  while (end < originalRegion.length && originalRegion[end] !== quote) {
    if (originalRegion[end] === "\\") end += 1;
    end += 1;
  }
  return end < originalRegion.length
    ? originalRegion.slice(cursor + 1, end)
    : null;
}

function hasRuledDispatches(region: string): boolean {
  const dispatches = [
    /options\.registration!\s*\.\s*register\s*\(/u,
    /options\.registration!\s*\.\s*verifyEmail\s*\(/u,
    /options\.registration!\s*\.\s*resendVerification\s*\(/u,
  ];
  let previous = -1;
  for (const dispatch of dispatches) {
    const match = dispatch.exec(region);
    if (match?.index === undefined || match.index <= previous) return false;
    previous = match.index;
  }
  return true;
}

export function resolveZoneRouteMountRegion(source: string): ZoneRegion {
  const masked = maskNonCode(source);
  const buildMatches = [...masked.matchAll(BUILD_API)];
  if (buildMatches.length !== 1) {
    return failure(`expected exactly 1 buildApi declaration, found ${buildMatches.length}`);
  }
  const buildMatch = buildMatches[0];
  if (buildMatch?.index === undefined) return failure("buildApi offset unavailable");
  const buildOpen = masked.indexOf("{", buildMatch.index + buildMatch[0].length);
  if (buildOpen < 0) return failure("buildApi body missing");
  const buildEnd = findMatchingBrace(masked, buildOpen);
  if (buildEnd < 0) return failure("buildApi braces unbalanced");

  const guardOffsets: number[] = [];
  for (const match of masked.matchAll(GUARD)) {
    if (match.index !== undefined) {
      guardOffsets.push(match.index + match[0].lastIndexOf("if"));
    }
  }
  if (guardOffsets.length !== 1) {
    return failure(`expected exactly 1 registration guard block, found ${guardOffsets.length}`);
  }
  const startOffset = guardOffsets[0];
  if (startOffset === undefined || startOffset <= buildOpen || startOffset >= buildEnd) {
    return failure("registration guard is outside buildApi");
  }
  if (braceDepth(masked, buildOpen + 1, startOffset) !== 0) {
    return failure("registration guard is not top-level in buildApi");
  }

  const openBrace = masked.indexOf("{", startOffset);
  const endOffset = findMatchingBrace(masked, openBrace);
  if (endOffset < 0 || endOffset > buildEnd) {
    return failure("unbalanced braces after registration guard");
  }

  const sourceLines = source.split("\n");
  const maskedLines = masked.split("\n");
  const startLine = lineOf(source, startOffset);
  const indentation = sourceLines[startLine - 1]?.match(/^\s*/u)?.[0] ?? "";
  let indentationEndLine = -1;
  for (let lineIndex = startLine; lineIndex < maskedLines.length; lineIndex += 1) {
    if ((maskedLines[lineIndex] ?? "").trimEnd() === `${indentation}}`) {
      indentationEndLine = lineIndex + 1;
      break;
    }
  }
  const braceEndLine = lineOf(source, endOffset - 1);
  if (braceEndLine !== indentationEndLine) {
    return failure(
      `resolver methods disagree (brace=${braceEndLine}, indent=${indentationEndLine})`,
    );
  }
  if (/^\s*else\b/u.test(masked.slice(endOffset))) {
    return failure("registration guard must not have an else branch");
  }

  const region = source.slice(startOffset, endOffset);
  const maskedRegion = masked.slice(startOffset, endOffset);
  const mounts: Array<{ readonly verb: string; readonly path: string | null; readonly line: number }> = [];
  for (const match of maskedRegion.matchAll(MOUNT)) {
    if (match.index === undefined || match[2] === undefined) continue;
    const open = maskedRegion.indexOf("(", match.index + match[0].length - 1);
    mounts.push(Object.freeze({
      verb: match[2],
      path: literalArgument(region, open),
      line: lineOf(source, startOffset + open),
    }));
  }
  const shapeOk = mounts.length === ZONE_ROUTES.length
    && mounts.every((mount) => mount.verb === "post")
    && ZONE_ROUTES.every((route, index) => mounts[index]?.path === route)
    && hasRuledDispatches(maskedRegion);
  if (!shapeOk) {
    return failure("registration block does not contain exactly the ruled mounts and dispatches");
  }

  return Object.freeze({
    ok: true,
    shapeOk: true,
    startLine,
    endLine: braceEndLine,
    startOffset,
    endOffset,
    mounts: Object.freeze(mounts),
    bytes: Buffer.byteLength(region, "utf8"),
    region,
    contentHash: createHash("sha256").update(region).digest("hex"),
  });
}

function requireResolved(source: string, side: string): Extract<ZoneRegion, { readonly ok: true }> {
  const result = resolveZoneRouteMountRegion(source);
  if (!result.ok) throw new Error(`${side}: ${result.reason}`);
  if (OBS_SURFACE.test(result.region)) {
    throw new Error(`${side}: ZONE_SHAPE_VIOLATION: obs surface entered region`);
  }
  return result;
}

function addedMountLines(diff: string): readonly number[] {
  const lines: number[] = [];
  let workLine = 0;
  for (const line of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk?.[1] !== undefined) {
      workLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      if (/\bapi\s*\.\s*(?:get|post|put|delete|patch|options|head|all|route)\s*\(/u.test(line)) {
        lines.push(workLine);
      }
      workLine += 1;
    } else if (!line.startsWith("-")) {
      workLine += 1;
    }
  }
  return Object.freeze(lines);
}

export function assertAddedMountsAfterRegion(diff: string, endLine: number): void {
  if (addedMountLines(diff).some((line) => line <= endLine)) {
    throw new Error("ZONE_CONTAINMENT_VIOLATION: added mount inside region");
  }
}

function isForbiddenZoneSpecifier(specifier: string): boolean {
  const normalized = specifier.replaceAll("\\", "/").replace(/\.(?:js|ts)$/u, "");
  return normalized === "@debateai/db/identity"
    || normalized === "apps/api/src/registration"
    || normalized === "apps/api/src/mail-channel"
    || normalized === "apps/api/src/mfa"
    || normalized === "packages/db/src/identity"
    || /(?:^|\/)(?:registration|mail-channel|mfa|identity)$/u.test(normalized);
}

export function assertNoZoneImports(source: string): void {
  for (const match of source.matchAll(STATIC_IMPORT)) {
    if (match[1] !== undefined && isForbiddenZoneSpecifier(match[1])) {
      throw new Error("ZONE_IMPORT_VIOLATION: excluded-zone import added");
    }
  }
  const masked = maskNonCode(source);
  for (const match of masked.matchAll(DYNAMIC_IMPORT)) {
    if (match.index === undefined) continue;
    const open = masked.indexOf("(", match.index);
    const specifier = literalArgument(source, open);
    if (specifier !== null && isForbiddenZoneSpecifier(specifier)) {
      throw new Error("ZONE_IMPORT_VIOLATION: excluded-zone import added");
    }
  }
}

export function assertZoneBoundaryIntact(options: {
  readonly repoRoot: string;
  readonly baseRef: string;
  readonly slice: string;
}): void {
  if (!/^[0-9a-f]{7,64}$/u.test(options.baseRef)) {
    throw new Error("ZONE_BASE_UNRESOLVED: baseRef must be an explicit commit SHA");
  }
  const indexPath = resolve(options.repoRoot, "apps/api/src/index.ts");
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: options.repoRoot,
    encoding: "utf8",
  }).trim();
  const indexGitPath = relative(gitRoot, indexPath).replaceAll("\\", "/");
  const workSource = readFileSync(indexPath, "utf8");
  let baseSource: string;
  try {
    baseSource = execFileSync("git", ["show", `${options.baseRef}:${indexGitPath}`], {
      cwd: options.repoRoot,
      encoding: "utf8",
    });
  } catch {
    throw new Error("ZONE_BASE_UNRESOLVED: git show failed");
  }
  const work = requireResolved(workSource, "work");
  const base = requireResolved(baseSource, "base");
  if (work.contentHash !== base.contentHash) {
    throw new Error(
      `ZONE_REGION_MODIFIED: slice=${options.slice} base=${base.contentHash} work=${work.contentHash}`,
    );
  }

  const indexDiff = execFileSync(
    "git",
    ["diff", "--unified=0", options.baseRef, "--", indexGitPath],
    { cwd: options.repoRoot, encoding: "utf8" },
  );
  assertAddedMountsAfterRegion(indexDiff, work.endLine);

  const authoredSources = [
    "packages/obs-capture/src/zone/classifier.ts",
    "packages/obs-capture/src/zone/counter.ts",
    "packages/obs-capture/src/zone/index.ts",
    "packages/obs-capture/src/zone/manifest.ts",
    "tests/support/zone-boundary.ts",
    "tests/unit/obs-l2-s04-zone.test.ts",
  ].map((path) => readFileSync(resolve(options.repoRoot, path), "utf8"));
  assertNoZoneImports(authoredSources.join("\n"));
}
