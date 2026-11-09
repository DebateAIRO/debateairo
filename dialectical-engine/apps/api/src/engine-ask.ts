import type { AskParent } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  engineSettingsOf, webSitesOf, type EngineSettings, type EngineVersionPolicy, type LengthGuidance, type LengthGuidancePolicy,
  type WebSites
} from "@debateai/register";

/**
 * Engine redesign (spec 2026-10-15 §3.2; INTERFACE §1.4): engine 2's settings for one admitted panel, frozen on the
 * receipt by the composition; null without the row in force, so the receipt keeps today's bytes. `makers` is the number of
 * distinct makers on the admitted panel (the comparing judges are capped by it); `mapOpening` is true when the shape is in
 * force and resolved for this panel, so the map opens the debate (the answer check is then a site). Engine 2 reads its
 * word targets from the length numbers: without them it is refused (the boot refuses first; this is a belt for a direct
 * caller).
 */
export function engineForAsk(input: Readonly<{
  policy: EngineVersionPolicy | undefined;
  length: LengthGuidance | null;
  makers: number;
  mapOpening: boolean;
}>): EngineSettings | null {
  if (input.policy === undefined) return null;
  if (input.length === null) {
    throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY", "Engine 2 is in force without length guidance for this ask");
  }
  return engineSettingsOf(input.policy, { makers: input.makers, mapOpening: input.mapOpening });
}

/**
 * THE WEB PART ON THE RECEIPT (plan W2-2, wired for R22): what a debate may do on the web, frozen with its ceiling, so the run's
 * attempt ceiling counts the web calls (they are in `countRunModelAttempts`) and the test site's gate check sees them. Only where the
 * web step can search: an engine-2 debate whose map opens it, on a paid plan, on a site with the search gate. A dig with picks
 * counts each chosen path (its own mode); any other ask counts its answers, Thorough from depth 2 (the runner's `webModeOfDepth`).
 * V4 start step, Task 34 (spec 2026-11-03 §4.3, §4.4): a path debate (shape receipt v2) searches only on a paid plan, on a site
 * with the search gate, under engine 2; it has a pack per chosen path (PATHS, receipt v2), in a dig's own mode from a dig's
 * origin (any ask with a parent), else Thorough from depth 2 from a debate's start.
 */
export function webSitesForAsk(input: Readonly<{
  searchGate: boolean;
  shape: Readonly<{ plan: string; answers: number }> | null;
  /** V4 start step, Task 34: a path debate's plan and chosen paths (receipt v2), else null (then `shape` decides, as today). */
  shapeV2: Readonly<{ plan: string; paths: number }> | null;
  engine: unknown;
  depth: number;
  parent: Pick<AskParent, "mode" | "picks"> | undefined;
}>): WebSites | null {
  if (input.shapeV2 !== null) {
    if (!input.searchGate || input.engine === null || input.shapeV2.plan === "free") return null;
    const parent = input.parent;
    const depth = parent !== undefined ? (parent.mode === "thorough" ? "THOROUGH" : "QUICK") : input.depth >= 2 ? "THOROUGH" : "QUICK";
    return webSitesOf({ kind: "PATHS", depth, paths: input.shapeV2.paths, origin: parent === undefined ? "START" : "DIG" });
  }
  if (!input.searchGate || input.shape === null || input.engine === null || input.shape.plan === "free") return null;
  const digPicks = input.parent?.picks?.length ?? 0;
  if (digPicks > 0) return webSitesOf({ kind: "DIG", depth: input.parent?.mode === "thorough" ? "THOROUGH" : "QUICK", digPicks });
  return webSitesOf({ kind: "START", depth: input.depth >= 2 ? "THOROUGH" : "QUICK", paths: input.shape.answers });
}

/**
 * The API boot's rule (INTERFACE §1.5 row 1), shared by apps/api/src/main.ts and the practice's ask composition: the
 * engine row in force needs the length row, else the boot refuses. A disabled or absent engine row needs nothing.
 */
export function assertEngineHasLengthPolicy(policy: EngineVersionPolicy | null, lengthPolicy: LengthGuidancePolicy | null): void {
  if (policy !== null && lengthPolicy === null) {
    throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY",
      "The register's engineVersionPolicy row is in force without a lengthGuidancePolicy row");
  }
}
