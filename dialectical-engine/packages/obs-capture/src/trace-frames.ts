import { matchesZoneFrame } from "./zone/classifier.js";

export type CapturedTraceFrame =
  | Readonly<{
      readonly kind: "CODE";
      readonly path: string;
      readonly symbol: string;
    }>
  | Readonly<{ readonly kind: "OPAQUE_ZONE" }>;

const MAX_TRACE_FRAMES = 32;
const MAX_CAUSE_DEPTH = 64;
const STACK_FRAME = /^\s*at\s+([^\s(]+)\s+\(((?:file:\/\/\/|\/|[A-Za-z]:[\\/])[^()\n]+?):[0-9]+:[0-9]+\)\s*$/u;
const IDENTIFIER = /^(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u;

function safeStack(value: object): unknown {
  try {
    return Reflect.get(value, "stack");
  } catch {
    return undefined;
  }
}

function ownCause(value: object): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "cause");
    return descriptor !== undefined && Object.hasOwn(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizePath(value: string): string {
  const slashes = value.replace(/^file:\/\//u, "").replaceAll("\\", "/");
  const segments: string[] = [];
  for (const segment of slashes.split("/")) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

function repoRelativePath(absolutePath: string, repoRoot: string): string | undefined {
  const root = normalizePath(repoRoot);
  const path = normalizePath(absolutePath);
  if (root === "/" || !path.startsWith(`${root}/`)) return undefined;
  const relative = path.slice(root.length + 1);
  if (
    relative.length === 0
    || relative.length > 512
    || relative.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
    || relative.split("/").includes("node_modules")
    || !/^[A-Za-z0-9@+._/-]+$/u.test(relative)
  ) {
    return undefined;
  }
  return relative;
}

function parseStack(stack: string, repoRoot: string): readonly CapturedTraceFrame[] {
  const frames: CapturedTraceFrame[] = [];
  for (const line of stack.split("\n").slice(1)) {
    if (frames.length >= MAX_TRACE_FRAMES) break;
    const match = STACK_FRAME.exec(line);
    const symbol = match?.[1];
    const absolutePath = match?.[2];
    if (
      symbol === undefined
      || absolutePath === undefined
      || !IDENTIFIER.test(symbol)
    ) {
      continue;
    }
    if (matchesZoneFrame(absolutePath, repoRoot)) {
      frames.push(Object.freeze({ kind: "OPAQUE_ZONE" as const }));
      continue;
    }
    const path = repoRelativePath(absolutePath, repoRoot);
    if (path !== undefined) {
      frames.push(Object.freeze({ kind: "CODE" as const, path, symbol }));
    }
  }
  return Object.freeze(frames);
}

export function projectTraceFrames(
  error: unknown,
  repoRoot: string,
  causeDepthMax: number,
): readonly CapturedTraceFrame[] {
  const output: CapturedTraceFrame[] = [];
  const seen = new Set<object>();
  const limit = Number.isSafeInteger(causeDepthMax) && causeDepthMax > 0
    ? Math.min(causeDepthMax, MAX_CAUSE_DEPTH)
    : 1;
  let current = error;
  for (let depth = 0; depth < limit && output.length < MAX_TRACE_FRAMES; depth += 1) {
    if ((typeof current !== "object" && typeof current !== "function") || current === null) break;
    if (seen.has(current)) break;
    seen.add(current);
    const stack = safeStack(current);
    if (typeof stack === "string") {
      output.push(...parseStack(stack, repoRoot).slice(0, MAX_TRACE_FRAMES - output.length));
    }
    current = ownCause(current);
  }
  return output.length === 0 ? Object.freeze([]) : Object.freeze(output);
}
