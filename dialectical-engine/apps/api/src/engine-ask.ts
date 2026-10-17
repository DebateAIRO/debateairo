import { TypedDomainError } from "@debateai/kernel";
import {
  engineSettingsOf, type EngineSettings, type EngineVersionPolicy, type LengthGuidance, type LengthGuidancePolicy
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
 * The API boot's rule (INTERFACE §1.5 row 1), shared by apps/api/src/main.ts and the practice's ask composition: the
 * engine row in force needs the length row, else the boot refuses. A disabled or absent engine row needs nothing.
 */
export function assertEngineHasLengthPolicy(policy: EngineVersionPolicy | null, lengthPolicy: LengthGuidancePolicy | null): void {
  if (policy !== null && lengthPolicy === null) {
    throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY",
      "The register's engineVersionPolicy row is in force without a lengthGuidancePolicy row");
  }
}
