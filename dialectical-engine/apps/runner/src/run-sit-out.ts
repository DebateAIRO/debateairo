import { TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  providerCallEndedUnbilled,
  providerCallGateUnavailable,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";

/**
 * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (d); orchestrator
 * rulings R-a and R-b) — A BUSY MEMBER SITS OUT THE REST OF THE RUN.
 *
 * On 2026-10-11 (run b53b9a9e) a busy GLM was asked again and again: every panel seat, its own root, a ten-minute
 * hold, a final retry, and then the serve fallback, each refusal one more unbilled release of the DeepInfra gate,
 * until the gate halted and the run died. Asking a model the gate has just proved busy only spends the gate's
 * patience. So, on the preview only, ONE call that ends in gate-proven unbilled refusals (the call and its one
 * 60-second resend, `withPreviewProviderCallPolicy`) makes that MODEL sit out for the rest of the run, on every ref
 * that serves it (R-a); and a gate that answers it is unavailable (fix (c), PROVIDER_GATE_UNAVAILABLE) makes every
 * member behind that gate sit out. A member that sits out is never asked again: its gateway refuses before anything
 * is sent and no ledger row is written (`MAKER_SAT_OUT`).
 *
 * The book is built once per claim, beside the run's other per-run gateways (`bodyGatewayFor`), and lives in memory
 * only: a re-claimed pass starts with every member back in. It never decides WHAT the run does about a member that
 * sits out — the roots, panels, reviews, expansion and serve read `sitsOut` and keep their own disclosures (R-b).
 *
 * Hosted and local never build one (the runner's `runResilience` setting is the preview's alone), so their calls
 * are byte for byte today's.
 */

/** The code a member that sits out is refused with, as the CAUSE of a `ProviderCallFailedError` (see below). */
export const MAKER_SAT_OUT = "MAKER_SAT_OUT" as const;

/** Why a member sits out, as the answer's disclosure names it (`RUN_PANEL_REVISED:<ref>=<reason>`). */
export type RunSitOutReason = "PROVIDER_BUSY" | "PROVIDER_GATE_UNAVAILABLE";

/**
 * The preview's facts the book needs about a provider ref, handed in by the composition root (main.ts builds them
 * from the reviewed rows, `previewRunResilience`): the gate its calls go through and the model it serves. Either may
 * be undefined for a ref the composition does not know; such a ref only ever sits out by its own ref.
 */
export interface RunResilienceSettings {
  readonly gateOf: (providerRef: string) => string | undefined;
  readonly modelOf: (providerRef: string) => string | undefined;
}

/** What the serve fallback reads of the book (`callServeRoleWithFallback`, `servePhaseFallbackOrder`). */
export interface RunSitOutView {
  sitsOut(providerRef: string): boolean;
  gateOf(providerRef: string): string | undefined;
}

export interface RunSitOutBook extends RunSitOutView {
  /** Why `providerRef` sits out, or null while it may still be asked. */
  reasonOf(providerRef: string): RunSitOutReason | null;
  /**
   * The member's gateway for this run: refused before anything is sent once the member sits out, and watched for
   * the two failures that make members sit out. Every other outcome passes through untouched.
   */
  gateway(providerRef: string, provider: ProviderGateway): ProviderGateway;
}

interface SitOutMark {
  readonly reason: RunSitOutReason;
  /** The ledger row of the failure that made the member sit out: what a halt on its behalf cites. */
  readonly ledgerEntryRef: string;
  /** Marks are compared by when they were made, so a member's reason is the first that applied to it. */
  readonly order: number;
}

/**
 * True for a failure after which the runner's ten-minute cooldown hold, and its final retry, would only ask a
 * member that now sits out (R-a): a call that ended in gate-proven unbilled refusals, a gate that is unavailable,
 * or a member that already sits out. Read by `withCooldownRetry`'s `haltsAtOnce` on the preview only.
 */
export function runSitOutHaltsAtOnce(error: unknown): boolean {
  if (!(error instanceof ProviderCallFailedError)) return false;
  if (providerCallEndedUnbilled(error) || providerCallGateUnavailable(error)) return true;
  return error.cause instanceof TypedDomainError && error.cause.code === MAKER_SAT_OUT;
}

/**
 * The answer's disclosure of the members that sat out (R-b: merged into the existing CRITIQUE-UNAVAILABLE record,
 * beside CLAIM_PANEL_REVISED), or null when none did. Codes only, in the order `providerRefs` lists them.
 */
export function runPanelRevisedReason(book: RunSitOutBook | null, providerRefs: readonly string[]): string | null {
  if (book === null) return null;
  const entries = [...new Set(providerRefs)].flatMap((providerRef) => {
    const reason = book.reasonOf(providerRef);
    return reason === null ? [] : [`${providerRef}=${reason}`];
  });
  return entries.length === 0 ? null : `RUN_PANEL_REVISED:${entries.join(",")}`;
}

export function createRunSitOutBook(settings: RunResilienceSettings): RunSitOutBook {
  const busyModels = new Map<string, SitOutMark>();
  const closedGates = new Map<string, SitOutMark>();
  let marks = 0;
  // A ref whose model the composition does not know is its own model: it sits out alone.
  const modelKey = (providerRef: string): string => settings.modelOf(providerRef) ?? `ref:${providerRef}`;
  const markOf = (providerRef: string): SitOutMark | undefined => {
    const gate = settings.gateOf(providerRef);
    const candidates = [busyModels.get(modelKey(providerRef)), gate === undefined ? undefined : closedGates.get(gate)]
      .filter((mark): mark is SitOutMark => mark !== undefined);
    return candidates.sort((left, right) => left.order - right.order)[0];
  };
  /** The two failures that make members sit out; anything else leaves the book as it was. */
  const note = (providerRef: string, error: unknown): void => {
    // Only a failure the gateway recorded can be cited by a halt made on the member's behalf later.
    if (!(error instanceof ProviderCallFailedError)) return;
    if (providerCallGateUnavailable(error)) {
      const gate = settings.gateOf(providerRef);
      if (gate !== undefined && !closedGates.has(gate)) {
        closedGates.set(gate, Object.freeze({ reason: "PROVIDER_GATE_UNAVAILABLE", ledgerEntryRef: error.lastLedgerEntryRef, order: marks++ }));
      }
      // A gate this composition cannot name still loses this member.
      if (gate === undefined && !busyModels.has(modelKey(providerRef))) {
        busyModels.set(modelKey(providerRef), Object.freeze({ reason: "PROVIDER_GATE_UNAVAILABLE", ledgerEntryRef: error.lastLedgerEntryRef, order: marks++ }));
      }
      return;
    }
    if (providerCallEndedUnbilled(error) && !busyModels.has(modelKey(providerRef))) {
      busyModels.set(modelKey(providerRef), Object.freeze({ reason: "PROVIDER_BUSY", ledgerEntryRef: error.lastLedgerEntryRef, order: marks++ }));
    }
  };
  const book: RunSitOutBook = Object.freeze({
    sitsOut: (providerRef: string) => markOf(providerRef) !== undefined,
    gateOf: (providerRef: string) => settings.gateOf(providerRef),
    reasonOf: (providerRef: string) => markOf(providerRef)?.reason ?? null,
    gateway: (providerRef: string, provider: ProviderGateway): ProviderGateway => Object.freeze({
      call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
        const mark = markOf(providerRef);
        if (mark !== undefined) {
          // Typed as the transport failure every caller already handles (a panel seat left out, a cooldown that
          // halts, a serve role that moves on), with the reason as its cause; zero attempts were made, and the halt
          // record cites the row that made the member sit out.
          throw new ProviderCallFailedError(
            new TypedDomainError(MAKER_SAT_OUT, `${providerRef} sits out the rest of this run (${mark.reason})`),
            0,
            "FAILED",
            mark.ledgerEntryRef
          );
        }
        try {
          return await provider.call(request);
        } catch (error) {
          note(providerRef, error);
          throw error;
        }
      }
    })
  });
  return book;
}
