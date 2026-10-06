import { DEBATE_ROLES } from "@debateai/kernel";
import { ScorecardSchema, type Scorecard } from "./schema.js";

export type ScorecardRefusalReason = "SCHEMA_INVALID" | "ENGINE_INCOMPATIBLE" | "UNKNOWN_CANDIDATE" | "NUMBER_SHAPE";

export type ScorecardParseResult =
  | Readonly<{ state: "VALID"; scorecard: Scorecard }>
  | Readonly<{ state: "REFUSED"; reason: ScorecardRefusalReason; detail: string }>;

const DOTTED_VERSION = /^\d+(?:\.\d+)*$/u;
const PLAIN_DECIMAL = /^-?(\d+)(?:\.(\d+))?$/u;

/**
 * NUMBER_SHAPE — the register's number rule, restated exactly as a JS number reaches it.
 *
 * The dev seeder seals a number as `canonicalDecimal(String(value))`
 * (apps/runner/src/dev-deployment-register.ts:635), and `canonicalDecimal` →
 * `normalizeDecimal` → `validateNormalizedDecimal` (packages/register/src/register-publication.ts:91-128)
 * refuses: exponent notation (`String(1e-7)` is "1e-7"), an integer outside ±(2^53 − 1), more
 * than 6 fractional digits, more than 15 significant digits, and any text that
 * `Number(text).toFixed(fractionDigits)` does not reproduce. `String` of a JS number never has
 * leading or trailing zeros to normalise, so the checks apply to it directly.
 *
 * Restated rather than imported because @debateai/register will import THIS package (a cycle
 * otherwise). tests/unit/scorecard-parse.test.ts pins it against `canonicalDecimal` itself.
 */
export function isRegisterSealableNumber(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const text = String(value);
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return false;
  const fraction = match[2];
  if (fraction === undefined) return Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (fraction.length > 6) return false;
  if (`${match[1] ?? ""}${fraction}`.replace(/^0+/u, "").length > 15) return false;
  return value.toFixed(fraction.length) === text;
}

/**
 * Reads a scorecard and hands back ALL of it or NONE of it (design Part 1: an invalid file is
 * refused, never half-applied). It never throws: a hostile or broken value is a refusal with a
 * reason, so the caller can keep its current scorecard or fall back to today's behaviour.
 *
 * Checked in this order: the schema; the engine range (dotted integers, so 0.10.0 is above
 * 0.9.0 and 0.1 equals 0.1.0); every role entry naming a listed candidate; then every number
 * of the RAW value, unknown fields included, against the register's number rule.
 */
export function parseScorecard(value: unknown, engineVersion: string): ScorecardParseResult {
  try {
    return readScorecard(value, engineVersion);
  } catch (error) {
    return refuseScorecard(
      "SCHEMA_INVALID",
      `the value could not be read as a scorecard (${error instanceof Error ? error.name : typeof error})`
    );
  }
}

function readScorecard(value: unknown, engineVersion: string): ScorecardParseResult {
  const parsed = ScorecardSchema.safeParse(value);
  if (!parsed.success) {
    return refuseScorecard(
      "SCHEMA_INVALID",
      parsed.error.issues.slice(0, 3).map((issue) => `${issuePathText(issue.path)}: ${issue.message}`).join("; ")
    );
  }
  const scorecard = parsed.data;
  if (typeof engineVersion !== "string" || !DOTTED_VERSION.test(engineVersion)) {
    return refuseScorecard("ENGINE_INCOMPATIBLE", `engine version ${String(engineVersion)} is not dotted integers`);
  }
  const { minEngineVersion, maxEngineVersion } = scorecard.engineCompatibility;
  if (compareDottedVersions(engineVersion, minEngineVersion) < 0
    || (maxEngineVersion !== null && compareDottedVersions(engineVersion, maxEngineVersion) > 0)) {
    return refuseScorecard(
      "ENGINE_INCOMPATIBLE",
      `this scorecard fits engine ${minEngineVersion} to ${maxEngineVersion ?? "any later version"}, not ${engineVersion}`
    );
  }
  const listed = new Set(scorecard.candidates.map((candidate) => candidate.candidateId));
  for (const role of DEBATE_ROLES) {
    const stranger = scorecard.roles[role].find((entry) => !listed.has(entry.candidateId));
    if (stranger !== undefined) {
      return refuseScorecard("UNKNOWN_CANDIDATE", `roles.${role} names ${stranger.candidateId}, which is not in candidates`);
    }
  }
  const offender = firstUnsealableNumberPath(value);
  if (offender !== null) {
    return refuseScorecard(
      "NUMBER_SHAPE",
      `${offender} is not a number the register can seal (an integer, or at most 6 decimals)`
    );
  }
  return Object.freeze({ state: "VALID" as const, scorecard });
}

function refuseScorecard(reason: ScorecardRefusalReason, detail: string): ScorecardParseResult {
  return Object.freeze({ state: "REFUSED" as const, reason, detail });
}

function issuePathText(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "(top level)" : path.map((segment) => String(segment)).join(".");
}

function compareDottedVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => BigInt(part));
  const rightParts = right.split(".").map((part) => BigInt(part));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0n;
    const rightPart = rightParts[index] ?? 0n;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

/** Walked in document order, first offender wins; a cycle is visited once. */
function firstUnsealableNumberPath(value: unknown): string | null {
  const pending: { readonly node: unknown; readonly path: string }[] = [{ node: value, path: "$" }];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { node, path } = current;
    if (typeof node === "number") {
      if (!isRegisterSealableNumber(node)) return path;
      continue;
    }
    if (typeof node !== "object" || node === null || visited.has(node)) continue;
    visited.add(node);
    const members: (readonly [string, unknown])[] = Array.isArray(node)
      ? node.map((member: unknown, index: number) => [`${path}[${String(index)}]`, member] as const)
      : Object.entries(node).map(([key, member]) => [`${path}.${key}`, member] as const);
    for (let index = members.length - 1; index >= 0; index -= 1) {
      const member = members[index];
      if (member !== undefined) pending.push({ node: member[1], path: member[0] });
    }
  }
  return null;
}
