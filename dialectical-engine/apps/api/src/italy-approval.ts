import { UNKNOWN_COUNTRY, type GeoLookup } from "@debateai/geo";
import { ITALY_COUNTRY, italyApprovalLeg, TypedDomainError, type ItalyApprovalLeg } from "@debateai/kernel";
import type { DeploymentMode } from "@debateai/register";

/**
 * Italy clause approval (mission italy-clause-approval, slice S01; SPEC R14-R17): the server's half of the second
 * sign-up checkbox (Italian Civil Code arts. 1341-1342). A sign-up owes the approval when Italy is picked in Region
 * (the PICKED leg) OR the request's source IP resolves to Italy (the IP leg). The IP leg asks the SAME GeoLookup the
 * country gate asks (one per API process, ADR-0038) — never a second geo database, never the edge's country header.
 *
 * Without a usable lookup the picked leg still decides and the IP leg is skipped, with one line that names the
 * surface and the reason only: never the address, never a country.
 */
export type ItalyApprovalSurface = "register" | "social_complete";
export type ItalyIpLegSkipReason = "NO_LOOKUP" | "LOOKUP_FAILED" | "NO_COUNTRY";

function skipped(log: (line: string) => void, surface: ItalyApprovalSurface, reason: ItalyIpLegSkipReason): false {
  log(JSON.stringify({ event: "italy_approval.ip_leg_skipped", surface, reason }));
  return false;
}

/** Whether this request's source IP is in Italy. A Tor exit the database places in Italy counts as Italy (R15). */
export function italyIpLeg(input: Readonly<{
  lookup: GeoLookup | undefined;
  ip: string;
  surface: ItalyApprovalSurface;
  log: (line: string) => void;
}>): boolean {
  if (input.lookup === undefined) return skipped(input.log, input.surface, "NO_LOOKUP");
  let country: string;
  try {
    country = input.lookup.lookup(input.ip).country;
  } catch {
    return skipped(input.log, input.surface, "LOOKUP_FAILED");
  }
  if (country === UNKNOWN_COUNTRY) return skipped(input.log, input.surface, "NO_COUNTRY");
  return country === ITALY_COUNTRY;
}

/** The leg that puts this sign-up in Italy, or null when neither fired (no approval is owed, none is stored). */
export function decideItalyApproval(input: Readonly<{
  pickedCountry: string;
  lookup: GeoLookup | undefined;
  ip: string;
  surface: ItalyApprovalSurface;
  log: (line: string) => void;
}>): ItalyApprovalLeg | null {
  return italyApprovalLeg(input.pickedCountry === ITALY_COUNTRY, italyIpLeg({
    lookup: input.lookup, ip: input.ip, surface: input.surface, log: input.log
  }));
}

/**
 * The boot's one GeoLookup (R14, R16, R17). Local mode opens nothing (the IP leg is skipped there). With the country
 * gate composed, a failed open refuses the boot exactly as before. Without the gate, the lookup serves the IP leg
 * alone, so a failed open only turns that leg off: one line with the open's code, and the boot goes on.
 */
export function composeGeoLookup<L>(input: Readonly<{
  mode: DeploymentMode;
  gateComposed: boolean;
  open: () => L;
  log: (line: string) => void;
}>): L | undefined {
  if (input.mode === "local") return undefined;
  if (input.gateComposed) return input.open();
  try {
    return input.open();
  } catch (error) {
    input.log(JSON.stringify({
      event: "italy_approval.ip_leg_off",
      code: error instanceof TypedDomainError ? error.code : "GEO_LOOKUP_OPEN_FAILED"
    }));
    return undefined;
  }
}
