import { readFile, writeFile } from "node:fs/promises";
import { normalizeRepositoryPath } from "./zone-check.js";
import { scan, type InventoryClass, type InventoryFinding } from "./scan.js";

const INVENTORY_CLASSES = new Set<InventoryClass>([
  "throw_without_code",
  "bare_catch",
  "void_promise",
  "wrapper_without_cause",
  "zone_import",
]);

const PRODUCTION_PREFIXES = ["apps/", "packages/", "tools/", "acceptance/"] as const;

// seed — V ratifies at FIX-16 acceptance
export const DEFAULT_INVENTORY_GATE_MS = 30_000;

export type InventoryGateResult = {
  readonly baselineCount: number;
  readonly newFindings: readonly InventoryFinding[];
};

export type RunInventoryGateOptions = {
  readonly rootDirectory: string;
  readonly baselinePath: string;
  readonly snapshot?: boolean;
  readonly gateMs: number;
  readonly now?: () => number;
  readonly writeOutput?: (line: string) => void;
};

export class InventoryGateError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "InventoryGateError";
  }
}

function compareFindings(left: InventoryFinding, right: InventoryFinding): number {
  return left.path.localeCompare(right.path) || left.line - right.line || left.class.localeCompare(right.class);
}

function findingKey(finding: InventoryFinding): string {
  return JSON.stringify([finding.path, finding.line, finding.class]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFinding(value: unknown): InventoryFinding {
  if (!isRecord(value) || Object.keys(value).some((key) => !["path", "line", "class"].includes(key))) {
    throw new InventoryGateError("OBS_INVENTORY_BASELINE_INVALID", "entry must contain only path, line, and class");
  }
  const path = value.path;
  const line = value.line;
  const inventoryClass = value.class;
  const normalizedPath = typeof path === "string" ? normalizeRepositoryPath(path) : null;
  if (
    normalizedPath === null
    || normalizedPath !== path
    || !PRODUCTION_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
    || !Number.isSafeInteger(line)
    || (line as number) < 1
    || typeof inventoryClass !== "string"
    || !INVENTORY_CLASSES.has(inventoryClass as InventoryClass)
  ) {
    throw new InventoryGateError("OBS_INVENTORY_BASELINE_INVALID", "entry has an invalid path, line, or class");
  }
  return { path: normalizedPath, line: line as number, class: inventoryClass as InventoryClass };
}

export function parseBaseline(text: string): readonly InventoryFinding[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_error) {
    throw new InventoryGateError("OBS_INVENTORY_BASELINE_INVALID", "baseline is not JSON");
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new InventoryGateError("OBS_INVENTORY_BASELINE_INVALID", "expected version 1 with an entries array");
  }
  const entries = value.entries.map(parseFinding).sort(compareFindings);
  const keys = entries.map(findingKey);
  if (new Set(keys).size !== keys.length) {
    throw new InventoryGateError("OBS_INVENTORY_BASELINE_INVALID", "duplicate entry");
  }
  return entries;
}

export function evaluateInventoryGate(
  findings: readonly InventoryFinding[],
  baselineText: string,
): InventoryGateResult {
  const baseline = parseBaseline(baselineText);
  const baselineKeys = new Set(baseline.map(findingKey));
  return {
    baselineCount: baseline.length,
    newFindings: [...findings].sort(compareFindings).filter((finding) => !baselineKeys.has(findingKey(finding))),
  };
}

export function serializeBaseline(findings: readonly InventoryFinding[]): string {
  const entries = [...findings].sort(compareFindings);
  return `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
}

export function parseInventoryGateMs(rawValue: string | undefined): number {
  if (rawValue === undefined) return DEFAULT_INVENTORY_GATE_MS;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InventoryGateError("OBS_INVENTORY_GATE_MS_INVALID", "expected a positive integer");
  }
  return value;
}

export async function runInventoryGate(options: RunInventoryGateOptions): Promise<0 | 1> {
  const now = options.now ?? performance.now.bind(performance);
  const writeOutput = options.writeOutput ?? ((line: string) => process.stdout.write(`${line}\n`));
  const startedAt = now();
  const findings = await scan(options.rootDirectory);

  if (options.snapshot === true) {
    const elapsed = Math.max(0, now() - startedAt);
    const elapsedMs = Math.floor(elapsed);
    if (elapsed >= options.gateMs) {
      writeOutput(`FAIL inventory_gate_timeout elapsed_ms=${elapsedMs} limit_ms=${options.gateMs}`);
      return 1;
    }
    await writeFile(options.baselinePath, serializeBaseline(findings), "utf8");
    writeOutput(`SNAPSHOT baseline=${findings.length} elapsed_ms=${elapsedMs}`);
    return 0;
  }

  const baselineText = await readFile(options.baselinePath, "utf8");
  const result = evaluateInventoryGate(findings, baselineText);
  const elapsed = Math.max(0, now() - startedAt);
  const elapsedMs = Math.floor(elapsed);
  if (elapsed >= options.gateMs) {
    writeOutput(`FAIL inventory_gate_timeout elapsed_ms=${elapsedMs} limit_ms=${options.gateMs}`);
    return 1;
  }
  if (result.newFindings.length === 0) {
    writeOutput(`PASS baseline=${result.baselineCount} new=0 elapsed_ms=${elapsedMs}`);
    return 0;
  }
  for (const finding of result.newFindings) {
    writeOutput(`FAIL ${finding.path}:${finding.line} ${finding.class}`);
  }
  writeOutput(`FAIL baseline=${result.baselineCount} new=${result.newFindings.length} elapsed_ms=${elapsedMs}`);
  return 1;
}
