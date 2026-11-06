import { randomUUID } from "node:crypto";
import {
  chargeMicrosForUsage, chargeableUsage, costEnvelopeDay, preStartSpendRef, readUsageCounters, type PreStartChargeEntry, type PreStartChargeKind,
  type ProviderTargetPrice, type ReportedUsage
} from "@debateai/budget";
import { TypedDomainError, type FundingBasis } from "@debateai/kernel";
import { previewModelRow, type ProviderCostEnvelopeSeam, type ProviderDiscoveryTarget } from "@debateai/providers";

/**
 * V4 start step, Task 27 (spec 2026-11-03 §4.1 "Allowance"): THE PER-PERSON CHARGE of every call before Start. No run
 * exists yet, so each call has its own record (0157): one row naming the person, the kind of call, the cost and the
 * time, beside a run-less ledger row that keeps it in the site's day; the windows, a team member's grant and the team's
 * one limit read it, as they read step 2's clarifying call (ask-clarify.ts, 0144), whose rules this follows.
 *
 * The money seam each call is sent with:
 *  · before the send: refused while the record is down (START_STEP_RECORD_DOWN: never spend unrecorded) or when the
 *    target has no price or no reviewed provider (START_STEP_UNPRICED: a call that could not be charged is never sent);
 *  · after it: the vendor's REAL counts only. On the preview the gate settles the money, and a send it refused, or a
 *    reply whose counts cannot be read, settles there at its projection; charging the person that projection would book
 *    spend the vendor may never have billed. A usage-less call charges nothing.
 *  · It never throws after a call: a record that fails is one code line (a report that throws is dropped), and the
 *    breaker latches until a restart on a refusal every later record would meet too (42501, 42883, 23514) or on the third
 *    failure in a row (a success resets that count). Nothing here logs the person, the question or the reply.
 */
export type StartCharges = Readonly<{
  recordDown(): boolean;
  /**
   * Task 57c (owner, 5 Nov: a failed question gives back its path-list charge): `tryRef`, the try the call is made for (signing.ts's
   * startTryRefOf), rides the record, so Start can give the try's charges to its debate and 0164 gives them back if it fails.
   */
  seamFor(input: Readonly<{ ownerRef: string; funding: FundingBasis | null; kind: PreStartChargeKind; target: ProviderDiscoveryTarget;
    tryRef?: string }>): ProviderCostEnvelopeSeam;
}>;

const RECORD_LATCHING_CODES: ReadonlySet<string> = new Set(["42501", "42883", "23514"]);
const RECORD_FAILURES_IN_A_ROW = 3;

/** The vendor's own counts (an absent side is zero, the cache parts kept), or null when they cannot be read. */
function realUsage(usage: unknown, projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>): ReportedUsage | null {
  if (usage === undefined || usage === null) return null;
  const parts = readUsageCounters(usage);
  if (parts.malformed || (typeof parts.promptTokens !== "number" && typeof parts.completionTokens !== "number")) return null;
  return chargeableUsage(usage, projection);
}

export function createStartCharges(deps: Readonly<{
  /** The one writer (0157): identity.record_pre_start_charge. */
  record(entry: PreStartChargeEntry): Promise<void>;
  /** The target's price (main: previewTargetChargePrice over providerTargetPrice), or null: none. */
  priceOf(providerRef: string): ProviderTargetPrice | null;
  clock(): Date;
  report(line: Readonly<{ event: string; code: string }>): void;
  newId?: () => string;
}>): StartCharges {
  const newId = deps.newId ?? randomUUID;
  let down = false;
  let failuresInARow = 0;
  const unrecorded = (code: string): void => {
    failuresInARow += 1;
    if (RECORD_LATCHING_CODES.has(code) || failuresInARow >= RECORD_FAILURES_IN_A_ROW) down = true;
    // Wave 2 review fix (Task 27): the report is this seam's one log line, so a report that throws has nowhere else to go;
    // it is dropped, after the count and the latch above, and recordCall still never throws.
    try {
      deps.report({ event: "api.start_step.charge_unrecorded", code: "RECORD_DOWN" });
    } catch {
      // the report never changes the record
    }
  };
  const charges: StartCharges = {
    recordDown: () => down,
    seamFor(input) {
      const provider = previewModelRow(input.target.model)?.provider ?? null;
      const grant = input.funding?.kind === "INTERNAL"
        ? Object.freeze({ grantId: input.funding.grantId, grantEventId: input.funding.grantEventId }) : null;
      const seam: ProviderCostEnvelopeSeam = {
        assertCallAllowed: () => {
          if (down) throw new TypedDomainError("START_STEP_RECORD_DOWN", "START_STEP_RECORD_DOWN");
          if (provider === null || deps.priceOf(input.target.providerRef) === null) {
            throw new TypedDomainError("START_STEP_UNPRICED", "START_STEP_UNPRICED");
          }
        },
        recordCall: async (observed) => {
          let entry: PreStartChargeEntry;
          try {
            const usage = realUsage(observed.usage, observed.projection);
            const price = deps.priceOf(input.target.providerRef);
            if (usage === null || price === null || provider === null) return;
            entry = Object.freeze({ spendId: newId(), ownerRef: input.ownerRef, kind: input.kind,
              providerRef: preStartSpendRef(input.kind, provider, input.target.model), chargedOn: costEnvelopeDay(deps.clock()),
              chargeMicros: chargeMicrosForUsage(price, usage), inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, grant,
              ...(input.tryRef === undefined ? {} : { tryRef: input.tryRef }) });
          } catch {
            unrecorded("");
            return;
          }
          try {
            await deps.record(entry);
            failuresInARow = 0;
          } catch (failure) {
            unrecorded(typeof failure === "object" && failure !== null && "code" in failure ? String(failure.code) : "");
          }
        },
        assertUsageReported: () => undefined
      };
      return Object.freeze(seam);
    }
  };
  return Object.freeze(charges);
}
