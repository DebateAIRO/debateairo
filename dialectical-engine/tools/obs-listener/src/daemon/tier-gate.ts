import { createHash } from "node:crypto";

import {
  bundleHash as computeBundleHash,
  canonicalJson,
  canonicalProjection,
} from "../../policy/canonical.js";
import {
  isFloorDenied,
  type PolicyBundle,
} from "../../policy/loader.js";

export type TierSizeLabel = "QUICK" | "PR_FIX" | "ESCALATE";
export type TierFloorVerdict = "FLOOR_CLEAR" | "FLOOR_DENIED";
export type TierFloorReason =
  | "NONE"
  | "FLOOR_PATH"
  | "ZONE_BOUNDARY"
  | "UNKNOWN_CLASS"
  | "EXTERNAL_ROOT"
  | "UNCONFIRMED_ROOT"
  | "NON_FIRST_PARTY"
  | "NON_PRODUCTION_ROOT"
  | "INVALID_INPUT";

export type TierRoot =
  | {
      readonly verdict: "CODE_ROOT";
      readonly path: string;
    }
  | {
      readonly verdict: "EXTERNAL_ROOT";
      readonly boundary:
        | "provider_http"
        | "postgres_host"
        | "hatchet_engine"
        | "cli_subprocess";
    }
  | {
      readonly verdict: "UNCONFIRMED";
    };

export interface TierChangeShape {
  readonly productionFiles: number;
  readonly testFiles: number;
  readonly productionLines: number;
  readonly totalLines: number;
  readonly redGreen: boolean;
}

export interface TierGateInput {
  readonly schema: "fixagent-tier-input/v1";
  readonly incident: {
    readonly fingerprint: string;
    readonly fingerprintVersion: number;
    readonly distinctWorkUnitCount: string;
    readonly maxSeverity: "INFO" | "DEGRADED" | "SEVERE" | "FATAL";
    readonly sourceSet: readonly ("first_party" | "hatchet" | "ui_client")[];
    readonly taxonomyClass: string;
    readonly zoneContext: boolean;
  };
  readonly root: TierRoot;
  readonly changeShape: TierChangeShape | null;
}

export interface PolicyDecisionPayload {
  readonly schema: "fixagent-policy-decision/v1";
  readonly policyRef: "fixagent-policy-v1";
  readonly bundleHash: string;
  readonly inputHash: string;
  readonly decision: `${TierSizeLabel}|${TierFloorVerdict}`;
  readonly sizeLabel: TierSizeLabel;
  readonly floorVerdict: TierFloorVerdict;
  readonly floorReason: TierFloorReason;
  readonly route: "APPROVAL_FIRST" | "REPORT_ONLY";
}

type PlainRecord = Readonly<Record<string, unknown>>;

const INVALID_CANONICAL_INCIDENT = Object.freeze({
  schema: "fixagent-tier-input-invalid/v1",
});
const INCIDENT_KEYS = Object.freeze([
  "distinctWorkUnitCount",
  "fingerprint",
  "fingerprintVersion",
  "maxSeverity",
  "sourceSet",
  "taxonomyClass",
  "zoneContext",
]);
const INPUT_KEYS = Object.freeze(["changeShape", "incident", "root", "schema"]);
const CODE_ROOT_KEYS = Object.freeze(["path", "verdict"]);
const EXTERNAL_ROOT_KEYS = Object.freeze(["boundary", "verdict"]);
const UNCONFIRMED_ROOT_KEYS = Object.freeze(["verdict"]);
const CHANGE_SHAPE_KEYS = Object.freeze([
  "productionFiles",
  "productionLines",
  "redGreen",
  "testFiles",
  "totalLines",
]);
const SOURCE_ORDER = Object.freeze(["first_party", "hatchet", "ui_client"] as const);
const EXTERNAL_BOUNDARIES = Object.freeze([
  "provider_http",
  "postgres_host",
  "hatchet_engine",
  "cli_subprocess",
] as const);
const SEVERITIES = Object.freeze(["INFO", "DEGRADED", "SEVERE", "FATAL"] as const);

function isRecord(value: unknown): value is PlainRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: PlainRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalCount(value: unknown): value is string {
  return typeof value === "string"
    && /^(?:0|[1-9][0-9]{0,18})$/u.test(value)
    && BigInt(value) <= 9_223_372_036_854_775_807n;
}

function isSafeFingerprint(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/u.test(value);
}

function isTaxonomyToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value);
}

function isRepoRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (!/^[A-Za-z0-9@+._/-]+$/u.test(value) || value.startsWith("/") || value.includes("//")) {
    return false;
  }
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isCanonicalSourceSet(value: unknown): value is TierGateInput["incident"]["sourceSet"] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SOURCE_ORDER.length) return false;
  let previous = -1;
  for (const source of value) {
    const index = SOURCE_ORDER.indexOf(source as never);
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function isChangeShape(value: unknown): value is TierChangeShape {
  return isRecord(value)
    && hasExactKeys(value, CHANGE_SHAPE_KEYS)
    && isNonNegativeSafeInteger(value.productionFiles)
    && isNonNegativeSafeInteger(value.testFiles)
    && isNonNegativeSafeInteger(value.productionLines)
    && isNonNegativeSafeInteger(value.totalLines)
    && typeof value.redGreen === "boolean"
    && value.totalLines >= value.productionLines;
}

function isRoot(value: unknown): value is TierRoot {
  if (!isRecord(value) || typeof value.verdict !== "string") return false;
  if (value.verdict === "CODE_ROOT") {
    return hasExactKeys(value, CODE_ROOT_KEYS) && isRepoRelativePath(value.path);
  }
  if (value.verdict === "EXTERNAL_ROOT") {
    return hasExactKeys(value, EXTERNAL_ROOT_KEYS)
      && EXTERNAL_BOUNDARIES.includes(value.boundary as never);
  }
  return value.verdict === "UNCONFIRMED" && hasExactKeys(value, UNCONFIRMED_ROOT_KEYS);
}

function asTierGateInput(value: unknown): TierGateInput | null {
  if (!isRecord(value) || !hasExactKeys(value, INPUT_KEYS)) return null;
  if (value.schema !== "fixagent-tier-input/v1" || !isRecord(value.incident)) return null;
  const incident = value.incident;
  if (!hasExactKeys(incident, INCIDENT_KEYS)
    || !isSafeFingerprint(incident.fingerprint)
    || !isPositiveSafeInteger(incident.fingerprintVersion)
    || !isCanonicalCount(incident.distinctWorkUnitCount)
    || !SEVERITIES.includes(incident.maxSeverity as never)
    || !isCanonicalSourceSet(incident.sourceSet)
    || !isTaxonomyToken(incident.taxonomyClass)
    || typeof incident.zoneContext !== "boolean"
    || !isRoot(value.root)) {
    return null;
  }
  if (value.root.verdict === "CODE_ROOT") {
    if (!isChangeShape(value.changeShape)) return null;
  } else if (value.changeShape !== null) {
    return null;
  }
  return value as unknown as TierGateInput;
}

function globMatches(glob: string, path: string): boolean {
  const memo = new Map<string, boolean>();
  const matchesAt = (globIndex: number, pathIndex: number): boolean => {
    const key = `${globIndex}:${pathIndex}`;
    const prior = memo.get(key);
    if (prior !== undefined) return prior;
    let result = false;
    if (globIndex === glob.length) {
      result = pathIndex === path.length;
    } else if (glob[globIndex] === "*") {
      if (glob[globIndex + 1] === "*") {
        if (glob[globIndex + 2] === "/") {
          result = matchesAt(globIndex + 3, pathIndex);
          for (let end = pathIndex; !result && end < path.length; end += 1) {
            if (path[end] === "/") result = matchesAt(globIndex + 3, end + 1);
          }
        } else {
          result = matchesAt(globIndex + 2, pathIndex)
            || (pathIndex < path.length && matchesAt(globIndex, pathIndex + 1));
        }
      } else {
        result = matchesAt(globIndex + 1, pathIndex)
          || (pathIndex < path.length && path[pathIndex] !== "/"
            && matchesAt(globIndex, pathIndex + 1));
      }
    } else if (glob[globIndex] === "?") {
      result = pathIndex < path.length && path[pathIndex] !== "/"
        && matchesAt(globIndex + 1, pathIndex + 1);
    } else {
      result = pathIndex < path.length && glob[globIndex] === path[pathIndex]
        && matchesAt(globIndex + 1, pathIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return matchesAt(0, 0);
}

function isProductionRoot(bundle: PolicyBundle, path: string): boolean {
  return bundle.production_source_globs.some((glob) => globMatches(glob, path));
}

function inputHash(canonicalIncident: unknown, policyHash: string): string {
  return createHash("sha256")
    .update(canonicalJson(canonicalIncident), "utf8")
    .update(policyHash, "utf8")
    .digest("hex");
}

function result(
  bundle: PolicyBundle,
  policyHash: string,
  hash: string,
  sizeLabel: TierSizeLabel,
  floorVerdict: TierFloorVerdict,
  floorReason: TierFloorReason,
): PolicyDecisionPayload {
  return Object.freeze({
    schema: "fixagent-policy-decision/v1" as const,
    policyRef: bundle.policy_ref,
    bundleHash: policyHash,
    inputHash: hash,
    decision: `${sizeLabel}|${floorVerdict}` as const,
    sizeLabel,
    floorVerdict,
    floorReason,
    route: bundle.tier_rules[sizeLabel].route,
  });
}

export function evaluateTierGate(
  input: unknown,
  bundle: PolicyBundle,
): PolicyDecisionPayload {
  const policyHash = computeBundleHash(bundle);
  let snapshot: unknown;
  try {
    snapshot = canonicalProjection(input);
  } catch {
    const hash = inputHash(INVALID_CANONICAL_INCIDENT, policyHash);
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "INVALID_INPUT");
  }
  const incident = asTierGateInput(snapshot);
  if (incident === null) {
    const hash = inputHash(INVALID_CANONICAL_INCIDENT, policyHash);
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "INVALID_INPUT");
  }
  const hash = inputHash(incident, policyHash);
  if (incident.root.verdict === "CODE_ROOT" && isFloorDenied(bundle, incident.root.path)) {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "FLOOR_PATH");
  }
  if (incident.incident.zoneContext) {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "ZONE_BOUNDARY");
  }
  if (!bundle.taxonomy_pin.classes.includes(incident.incident.taxonomyClass as never)) {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "UNKNOWN_CLASS");
  }
  if (incident.root.verdict === "EXTERNAL_ROOT") {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "EXTERNAL_ROOT");
  }
  if (incident.root.verdict === "UNCONFIRMED") {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "UNCONFIRMED_ROOT");
  }
  if (incident.incident.sourceSet.length !== 1 || incident.incident.sourceSet[0] !== "first_party") {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "NON_FIRST_PARTY");
  }
  if (!isProductionRoot(bundle, incident.root.path)) {
    return result(bundle, policyHash, hash, "ESCALATE", "FLOOR_DENIED", "NON_PRODUCTION_ROOT");
  }
  const shape = incident.changeShape;
  const quick = shape !== null
    && shape.productionFiles <= bundle.tier_rules.QUICK.max_production_files
    && shape.testFiles <= bundle.tier_rules.QUICK.max_test_files
    && shape.productionLines <= bundle.tier_rules.QUICK.production_line_cap
    && shape.totalLines <= bundle.tier_rules.QUICK.total_line_cap
    && (!bundle.tier_rules.QUICK.requires_red_green || shape.redGreen);
  return result(
    bundle,
    policyHash,
    hash,
    quick ? "QUICK" : "PR_FIX",
    "FLOOR_CLEAR",
    "NONE",
  );
}
