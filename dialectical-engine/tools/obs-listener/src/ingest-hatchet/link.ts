import { measureSplitClock, type SplitClockMeasurement } from "./skew.js";

export type LinkTaxonomyClass =
  | "PROCESS_DEATH"
  | "JOB_FAILURE"
  | "HTTP_FAILURE"
  | "CAPTURE_SELF"
  | "ORIGIN_UNKNOWN";
export type LinkSeverity = "INFO" | "DEGRADED" | "SEVERE" | "FATAL";

export interface CorrelatedOccurrence {
  readonly occurrenceId: string;
  readonly incidentId: string;
  readonly source: "first_party" | "hatchet";
  readonly runRef: string;
  readonly workItemRef: string;
  readonly occurredAt: Date;
  readonly capturedAt: Date;
  readonly taxonomyClass: LinkTaxonomyClass;
  readonly severity: LinkSeverity;
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
}

export interface SourceLinkInput {
  readonly leftOccurrenceId: string;
  readonly rightOccurrenceId: string;
  readonly evidence: Readonly<{
    readonly match: "EXACT_RUN_WORK_ITEM";
    readonly compatibleClasses: string;
    readonly runRef: string;
    readonly workItemRef: string;
    readonly firstPartyOccurredAt: string;
    readonly hatchetOccurredAt: string;
    readonly ingestObservedAt: string;
    readonly skewMs: number;
    readonly ingestLagMs: number;
    readonly toleranceMs: number;
    readonly tripEligible: boolean;
  }>;
}

export interface IncidentAuthorityInput {
  readonly firstPartyIncidentId: string;
  readonly hatchetIncidentId: string;
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
  readonly taxonomyClass: LinkTaxonomyClass;
  readonly severity: LinkSeverity;
  readonly sourceSet: readonly ["first_party", "hatchet"];
}

export interface HatchetLinkStore {
  upsertSourceLink(input: SourceLinkInput): Promise<"INSERTED" | "DUPLICATE">;
  applyFirstPartyAuthority(input: IncidentAuthorityInput): Promise<void>;
}

export interface LinkHatchetInput {
  readonly hatchet: CorrelatedOccurrence;
  readonly firstPartyCandidates: readonly CorrelatedOccurrence[];
  readonly skewToleranceMs: number;
  readonly store: HatchetLinkStore;
}

export type LinkHatchetResult =
  | Readonly<{ readonly kind: "UNMATCHED" }>
  | Readonly<{
    readonly kind: "LINKED";
    readonly firstPartyOccurrenceId: string;
    readonly link: "INSERTED" | "DUPLICATE";
    readonly skewMs: number;
    readonly tripEligible: boolean;
  }>;

function classesAreCompatible(firstParty: LinkTaxonomyClass, hatchet: LinkTaxonomyClass): boolean {
  return hatchet === "JOB_FAILURE"
    && (firstParty === "PROCESS_DEATH" || firstParty === "JOB_FAILURE");
}

type Candidate = Readonly<{
  occurrence: CorrelatedOccurrence;
  measurement: SplitClockMeasurement;
}>;

function compareCandidate(left: Candidate, right: Candidate): number {
  return left.measurement.skewMs - right.measurement.skewMs
    || left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId);
}

export async function linkHatchetOccurrence(input: LinkHatchetInput): Promise<LinkHatchetResult> {
  if (input.hatchet.source !== "hatchet") throw new TypeError("HATCHET_LINK_SOURCE_INVALID");
  const matches: Candidate[] = [];
  for (const candidate of input.firstPartyCandidates) {
    if (candidate.source !== "first_party"
      || candidate.runRef !== input.hatchet.runRef
      || candidate.workItemRef !== input.hatchet.workItemRef
      || !classesAreCompatible(candidate.taxonomyClass, input.hatchet.taxonomyClass)) continue;
    const measurement = measureSplitClock({
      firstPartyAt: candidate.occurredAt,
      hatchetAt: input.hatchet.occurredAt,
      ingestObservedAt: input.hatchet.capturedAt,
      toleranceMs: input.skewToleranceMs
    });
    if (measurement.withinTolerance) matches.push(Object.freeze({ occurrence: candidate, measurement }));
  }
  matches.sort(compareCandidate);
  const selected = matches[0];
  if (selected === undefined) return Object.freeze({ kind: "UNMATCHED" });

  const firstParty = selected.occurrence;
  const measurement = selected.measurement;
  const evidence = Object.freeze({
    match: "EXACT_RUN_WORK_ITEM" as const,
    compatibleClasses: `${firstParty.taxonomyClass}:${input.hatchet.taxonomyClass}`,
    runRef: input.hatchet.runRef,
    workItemRef: input.hatchet.workItemRef,
    firstPartyOccurredAt: measurement.firstPartyOccurredAt,
    hatchetOccurredAt: measurement.hatchetOccurredAt,
    ingestObservedAt: measurement.ingestObservedAt,
    skewMs: measurement.skewMs,
    ingestLagMs: measurement.ingestLagMs,
    toleranceMs: measurement.toleranceMs,
    tripEligible: measurement.tripEligible
  });
  const link = await input.store.upsertSourceLink(Object.freeze({
    leftOccurrenceId: firstParty.occurrenceId,
    rightOccurrenceId: input.hatchet.occurrenceId,
    evidence
  }));
  await input.store.applyFirstPartyAuthority(Object.freeze({
    firstPartyIncidentId: firstParty.incidentId,
    hatchetIncidentId: input.hatchet.incidentId,
    fingerprint: firstParty.fingerprint,
    fingerprintVersion: firstParty.fingerprintVersion,
    taxonomyClass: firstParty.taxonomyClass,
    severity: firstParty.severity,
    sourceSet: Object.freeze(["first_party", "hatchet"] as const)
  }));
  return Object.freeze({
    kind: "LINKED",
    firstPartyOccurrenceId: firstParty.occurrenceId,
    link,
    skewMs: measurement.skewMs,
    tripEligible: measurement.tripEligible
  });
}
