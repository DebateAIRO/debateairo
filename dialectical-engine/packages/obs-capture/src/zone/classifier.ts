import {
  ZONE_MANIFEST,
  ZONE_MANIFEST_HASH,
  type ZoneManifest,
} from "./manifest.js";

const FRAME_LOCATION = /(?:\(|\s)((?:file:\/\/\/|\/|[A-Za-z]:[\\/])[^()\n]+?):(\d+):(\d+)\)?\s*$/u;
const MAX_CAUSE_DEPTH = 64;

export interface ZoneDriftSignal {
  readonly code: "ZONE_DRIFT_DETECTED";
  readonly manifest_hash: string;
  readonly day_bucket: string;
}

export type ZoneClassification =
  | {
      readonly classification: "ZONE";
      readonly disposition: "COUNTER_ONLY";
      readonly zone_delta: 1;
      readonly drift?: ZoneDriftSignal;
    }
  | {
      readonly classification: "SHARED";
      readonly disposition: "CAPTURE";
      readonly route: "zone";
      readonly component: string;
      readonly frames: readonly string[];
    }
  | {
      readonly classification: "ORDINARY";
      readonly disposition: "CAPTURE";
      readonly route: "ordinary";
      readonly component: string;
      readonly frames: readonly string[];
    }
  | {
      readonly classification: "ORIGIN_UNKNOWN";
      readonly disposition: "CAPTURE";
      readonly component: "UNKNOWN:NON_ERROR" | "UNKNOWN:NO_USABLE_REPO_FRAME";
      readonly source: "unclassified";
      readonly counter_class: "unclassified";
      readonly trip_eligible: true;
      readonly frames: readonly string[];
    };

interface ParsedFrame {
  readonly absolutePath: string;
  readonly repoPath: string;
  readonly line: number;
  readonly column: number;
  readonly zone: boolean;
}

interface StackEvidence {
  readonly frames: readonly ParsedFrame[];
  readonly innermostRepoFrame: ParsedFrame | undefined;
}

function normalizePathString(value: string): string {
  const slashPath = value.replaceAll("\\", "/");
  const drive = /^([A-Za-z]:)(?:\/|$)/u.exec(slashPath)?.[1] ?? "";
  const absolute = slashPath.startsWith("/") || drive.length > 0;
  const body = drive.length > 0 ? slashPath.slice(drive.length) : slashPath;
  const segments: string[] = [];
  for (const segment of body.split("/")) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const prefix = drive.length > 0 ? `${drive}/` : absolute ? "/" : "";
  return `${prefix}${segments.join("/")}`.replace(/\/+$/u, "");
}

function decodeFilePath(value: string): string {
  const withoutScheme = value.startsWith("file://")
    ? value.slice("file://".length)
    : value;
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    return withoutScheme;
  }
}

function repoRelativePath(absolutePath: string, repoRoot: string): string | null {
  if (typeof absolutePath !== "string" || typeof repoRoot !== "string") return null;
  const decodedPath = decodeFilePath(absolutePath);
  if (decodedPath.includes("\u0000") || repoRoot.includes("\u0000")) return null;
  const normalizedRoot = normalizePathString(repoRoot);
  const normalizedPath = normalizePathString(decodedPath);
  if (
    normalizedRoot.length === 0
    || normalizedRoot === "/"
    || /^[A-Za-z]:$/u.test(normalizedRoot)
  ) {
    return null;
  }
  const caseFold = /^[A-Za-z]:\//u.test(normalizedRoot);
  const comparableRoot = caseFold ? normalizedRoot.toLowerCase() : normalizedRoot;
  const comparablePath = caseFold ? normalizedPath.toLowerCase() : normalizedPath;
  if (!comparablePath.startsWith(`${comparableRoot}/`)) return null;
  const relative = normalizedPath.slice(normalizedRoot.length + 1);
  if (relative.length === 0 || relative.split("/").includes("node_modules")) return null;
  return relative;
}

function prefixMatches(repoPath: string, prefix: string): boolean {
  return repoPath === prefix || repoPath.startsWith(`${prefix}/`);
}

export function matchesZoneFrame(
  absolutePath: string,
  repoRoot: string,
  manifest: ZoneManifest = ZONE_MANIFEST,
): boolean {
  const repoPath = repoRelativePath(absolutePath, repoRoot);
  if (repoPath === null) return false;
  return [
    ...manifest.zone_path_prefixes,
    ...manifest.compiled_alternate_prefixes,
  ].some((prefix) => prefixMatches(repoPath, prefix));
}

function parseStack(
  stack: string,
  repoRoot: string,
  manifest: ZoneManifest,
): StackEvidence {
  const frames: ParsedFrame[] = [];
  for (const lineText of stack.split("\n").slice(1)) {
    const match = FRAME_LOCATION.exec(lineText);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      continue;
    }
    const repoPath = repoRelativePath(match[1], repoRoot);
    if (repoPath === null) continue;
    const parsed = Object.freeze({
      absolutePath: decodeFilePath(match[1]),
      repoPath,
      line: Number(match[2]),
      column: Number(match[3]),
      zone: matchesZoneFrame(match[1], repoRoot, manifest),
    });
    frames.push(parsed);
  }
  return Object.freeze({
    frames: Object.freeze(frames),
    innermostRepoFrame: frames[0],
  });
}

function safeProperty(value: object, key: "stack" | "cause"): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function boundedDepth(candidate: number): number {
  return Number.isSafeInteger(candidate) && candidate > 0
    ? Math.min(candidate, MAX_CAUSE_DEPTH)
    : 1;
}

function causeEvidence(options: {
  readonly error: unknown;
  readonly repoRoot: string;
  readonly causeDepthMax: number;
  readonly manifest: ZoneManifest;
}): {
  readonly isErrorLike: boolean;
  readonly stacks: readonly StackEvidence[];
} {
  const stacks: StackEvidence[] = [];
  const seen = new Set<object>();
  let current = options.error;
  let isErrorLike = false;
  const depthLimit = boundedDepth(options.causeDepthMax);

  for (let depth = 0; depth < depthLimit; depth += 1) {
    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      break;
    }
    isErrorLike = true;
    if (seen.has(current)) break;
    seen.add(current);
    const stack = safeProperty(current, "stack");
    if (typeof stack === "string") {
      stacks.push(parseStack(stack, options.repoRoot, options.manifest));
    }
    current = safeProperty(current, "cause");
  }

  return Object.freeze({ isErrorLike, stacks: Object.freeze(stacks) });
}

function scrubFrames(stacks: readonly StackEvidence[]): readonly string[] {
  const output: string[] = [];
  for (const stack of stacks) {
    let zoneCount = 0;
    for (const frame of stack.frames) {
      if (frame.zone) {
        zoneCount += 1;
      } else {
        output.push(`${frame.repoPath}:${frame.line}:${frame.column}`);
      }
    }
    if (zoneCount > 0) {
      output.push(`ZONE_FRAMES_ELIDED:${zoneCount}`);
      output.push("CAUSE_NOT_CAPTURED:ZONE");
      break;
    }
  }
  return Object.freeze(output);
}

export function dayBucket(at: Date): string {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) return "1970-01-01";
  const value = at.toISOString().slice(0, 10);
  return value.length === 10 ? value : "1970-01-01";
}

export function createZoneDriftSignal(
  manifestHash: string,
  at: Date,
): ZoneDriftSignal {
  return Object.freeze({
    code: "ZONE_DRIFT_DETECTED",
    manifest_hash: manifestHash,
    day_bucket: dayBucket(at),
  });
}

function zoneResult(drift?: ZoneDriftSignal): ZoneClassification {
  return Object.freeze({
    classification: "ZONE",
    disposition: "COUNTER_ONLY",
    zone_delta: 1,
    ...(drift === undefined ? {} : { drift }),
  });
}

function originUnknown(
  reason: "UNKNOWN:NON_ERROR" | "UNKNOWN:NO_USABLE_REPO_FRAME",
): ZoneClassification {
  return Object.freeze({
    classification: "ORIGIN_UNKNOWN",
    disposition: "CAPTURE",
    component: reason,
    source: "unclassified",
    counter_class: "unclassified",
    trip_eligible: true,
    frames: Object.freeze([]),
  });
}

export function classifyErrorOrigin(options: {
  readonly error: unknown;
  readonly zoneBoundary: boolean;
  readonly repoRoot: string;
  readonly causeDepthMax: number;
  readonly now: Date;
  readonly manifest?: ZoneManifest;
  readonly manifestHash?: string;
}): ZoneClassification {
  try {
    const manifest = options.manifest ?? ZONE_MANIFEST;
    const evidence = causeEvidence({
      error: options.error,
      repoRoot: options.repoRoot,
      causeDepthMax: options.causeDepthMax,
      manifest,
    });
    const manifestHit = evidence.stacks.some(
      (stack) => stack.innermostRepoFrame?.zone === true,
    );
    if (manifestHit) {
      return zoneResult(
        options.zoneBoundary
          ? undefined
          : createZoneDriftSignal(options.manifestHash ?? ZONE_MANIFEST_HASH, options.now),
      );
    }

    const deepestStack = evidence.stacks[evidence.stacks.length - 1];
    const producingFrame = deepestStack?.innermostRepoFrame;
    if (producingFrame === undefined) {
      if (options.zoneBoundary) return zoneResult();
      return originUnknown(
        evidence.isErrorLike
          ? "UNKNOWN:NO_USABLE_REPO_FRAME"
          : "UNKNOWN:NON_ERROR",
      );
    }

    const frames = scrubFrames(evidence.stacks);
    return options.zoneBoundary
      ? Object.freeze({
          classification: "SHARED",
          disposition: "CAPTURE",
          route: "zone",
          component: producingFrame.repoPath,
          frames,
        })
      : Object.freeze({
          classification: "ORDINARY",
          disposition: "CAPTURE",
          route: "ordinary",
          component: producingFrame.repoPath,
          frames,
        });
  } catch {
    return options.zoneBoundary
      ? zoneResult()
      : originUnknown("UNKNOWN:NO_USABLE_REPO_FRAME");
  }
}
