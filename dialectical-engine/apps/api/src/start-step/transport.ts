import { createHash, randomUUID } from "node:crypto";
import type { PreStartChargeKind } from "@debateai/budget";
import { START_STEP_LIMITS } from "@debateai/kernel";
import {
  START_CALL_SITES, START_STEP_TIMING, mapErrorCodeOf, mapProviderPieces, type MapCallOutcome, type MapCallRequest, type MapCaller
} from "@debateai/map";
import {
  OpenAICompatibleProviderGateway, previewTargetGatewayControls, promptContractFingerprintText, providerCallEndedVendorRefusedUnbilled,
  providerTargetGatewayControls, withPreviewProviderCallPolicy, type CallBound, type PreviewBusyCoordinator, type PreviewProviderTestConfig,
  type PromptContract, type ProviderCostEnvelopeSeam, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { startModelOfSeat, type StartBusyBook } from "./seats.js";

/**
 * V4 start step, Task 27 (spec 2026-11-03 §4.1): THE PREVIEW TRANSPORT of the calls before Start. Each call goes through
 * one fresh gateway built for it alone, exactly as a debate's call goes on the preview (the guarded fetch, so the gates
 * reserve and settle it; the target's reviewed controls; `withPreviewProviderCallPolicy`, so the owner's thinking table,
 * the one format repair and the preview's call bound apply: see START_STEP_CALL_BOUNDS for what that bound does to each
 * kind's own), with no debate (`runId: null`) and nothing persisted: the gateway's artifacts and ledger entries are
 * dropped, and the only record is the person's charge (charge.ts) through the call's money seam.
 * Role JUDGE on the served lane, as the map's calls; the seat's "#2" mark is stripped before anything is sent.
 *
 * A model the vendor refused as busy (an unbilled refusal, proved by the gate) ends its call at once, BUSY, with no
 * 60-second resend (the step lasts about a minute), and sits out the busy book's two minutes. A refusal of the money seam
 * (the record down, an unpriced target) is STOPPED: nothing was sent. Any other failure is FAILED with its code. Every
 * call's end is told to `onCallEnd` exactly once, after its outcome is settled (the model, the outcome, the time; never
 * the question or the reply); a hook that throws changes nothing.
 */
const callBound = (tokenCeiling: number, deadlineMs: number): CallBound => Object.freeze({ maxAttempts: 2, tokenCeiling, deadlineMs });

/**
 * Each kind's bound as this transport hands it to the gateway: two attempts (the one format repair), its reply's room,
 * its deadline from START_STEP_TIMING. What a call actually gets on the preview (the only transport today) is the preview
 * call policy's (`previewCallBound` in @debateai/providers, run by `withPreviewProviderCallPolicy`): the two attempts
 * kept; `max_tokens` raised to at least PREVIEW_GLM_GENERATION_TOKEN_FLOOR (8,192: the merge keeps its own 16,384, the
 * combine's and the fit's 4,096 go out as 8,192); and the deadline replaced by the gate's, PREVIEW_GLM_DEADLINE_MS
 * (1,260 s), so no START_STEP_TIMING deadline here ever ends a call on the preview. Kept so (wave 2 review ruling): a
 * call already started finishes and counts in the allowance (the owner's 31 Oct rule, settled for the step on 3 Nov),
 * and the step's own clocks in @debateai/map (the planner's race, the lists' 150 s cap) stop the waiting, never the
 * call. A gateway without the preview policy (none today) would get these bounds exactly as written.
 */
export const START_STEP_CALL_BOUNDS: Readonly<Record<PreStartChargeKind, CallBound>> = Object.freeze({
  ANGLES: callBound(8_192, START_STEP_TIMING.plannerDeadlineMs),
  LIST: callBound(8_192, START_STEP_TIMING.listsHardCapMs),
  MERGE: callBound(16_384, START_STEP_TIMING.mergeDeadlineMs),
  MERGE_LATE: callBound(8_192, START_STEP_TIMING.lateMergeDeadlineMs),
  COMBINE: callBound(4_096, START_STEP_TIMING.combineDeadlineMs),
  FIT: callBound(4_096, START_STEP_TIMING.fitDeadlineMs)
});

/** The charge kind of a start-step call site (START:list:<1..9>, the five fixed keys), or null for any other key. */
export function preStartKindOfCallSite(callSiteKey: string): PreStartChargeKind | null {
  if (callSiteKey === START_CALL_SITES.angles) return "ANGLES";
  if (callSiteKey === START_CALL_SITES.merge) return "MERGE";
  if (callSiteKey === START_CALL_SITES.mergeLate) return "MERGE_LATE";
  if (callSiteKey === START_CALL_SITES.combine) return "COMBINE";
  if (callSiteKey === START_CALL_SITES.fit) return "FIT";
  const list = /^START:list:([1-9][0-9]*)$/u.exec(callSiteKey);
  return list !== null && Number(list[1]) <= START_STEP_LIMITS.listsMax ? "LIST" : null;
}

export type StartCallEnd = Readonly<{ callSiteKey: string; model: string; outcome: "OK" | "FAILED" | "BUSY" | "STOPPED"; ms: number }>;

export type StartTransport = Readonly<{
  targetOf(model: string): ProviderDiscoveryTarget | null;
  callerFor(input: Readonly<{
    config: PreviewProviderTestConfig;
    seamFor(kind: PreStartChargeKind, target: ProviderDiscoveryTarget): ProviderCostEnvelopeSeam;
    busy: StartBusyBook;
    onCallEnd(end: StartCallEnd): void;
  }>): MapCaller;
}>;

/** The policy's busy coordinator for the step before Start: a busy model's call gives up at once, never waits or resends. */
const GIVE_UP_WHEN_BUSY: PreviewBusyCoordinator = Object.freeze({
  admit: () => Promise.resolve(),
  refusedBusy: () => Promise.resolve("GIVE_UP" as const),
  probeOutcome: () => undefined,
  answered: () => undefined
});

/** The seam refusals that mean nothing was sent and nothing more should be (the map's STOPPED). */
const START_STEP_STOP_CODES: ReadonlySet<string> = new Set(["START_STEP_RECORD_DOWN", "START_STEP_UNPRICED"]);

/** The hash of the contract actually sent (frame version, id, instruction, answer form), as a story call records its own. */
const contractHashOf = (contract: PromptContract): string =>
  createHash("sha256").update(promptContractFingerprintText(contract), "utf8").digest("hex");

export function createStartTransport(deps: Readonly<{ fetch: typeof fetch; targets: readonly ProviderDiscoveryTarget[]; now?: () => number }>): StartTransport {
  const now = deps.now ?? Date.now;
  const targetOf = (model: string): ProviderDiscoveryTarget | null => deps.targets.find((target) => target.model === model) ?? null;
  const gatewayFor = (config: PreviewProviderTestConfig, target: ProviderDiscoveryTarget) => withPreviewProviderCallPolicy(
    new OpenAICompatibleProviderGateway({
      fetchImplementation: deps.fetch, endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target),
      assertNoOpenWriteTransaction: () => undefined,
      // Nothing persisted: no run exists, and the person's charge is the only record (the money seam).
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => entry.attemptId
    }), config, target, { busy: GIVE_UP_WHEN_BUSY });
  return Object.freeze({
    targetOf,
    callerFor: (input) => Object.freeze({
      async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
        const started = now();
        const model = startModelOfSeat(request.seat.aiRef);
        // Wave 2 review fix (Task 27): told once, after the outcome is settled and outside the call's try, so a hook that
        // throws is never caught as the call's own failure (which told it a second time, FAILED). The hook is this
        // transport's only telling, so its own failure has nowhere else to go: it changes neither the outcome nor how often
        // the end is told.
        const ended = (outcome: MapCallOutcome<T>): MapCallOutcome<T> => {
          try {
            input.onCallEnd(Object.freeze({ callSiteKey: request.callSiteKey, model, outcome: outcome.kind, ms: Math.max(0, now() - started) }));
          } catch {
            // the hook never changes the call
          }
          return outcome;
        };
        const kind = preStartKindOfCallSite(request.callSiteKey);
        if (kind === null) return ended({ kind: "FAILED", code: "START_STEP_CALL_SITE_UNKNOWN" });
        const target = targetOf(model);
        if (target === null) return ended({ kind: "FAILED", code: "START_STEP_SEAT_UNKNOWN" });
        let outcome: MapCallOutcome<T>;
        try {
          const pieces = mapProviderPieces(request.spec);
          const response = await gatewayFor(input.config, target).call({
            runId: null, subjectItemId: randomUUID(), callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
            bound: START_STEP_CALL_BOUNDS[kind], contractHash: contractHashOf(request.spec.contract), providerRef: target.providerRef,
            packet: pieces.framed.packet, classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket,
            costEnvelope: input.seamFor(kind, target),
            ...(request.spec.guidedWords === null ? {} : { guidedWords: request.spec.guidedWords }),
            ...(request.spec.replyWordsCeiling === null ? {} : { replyWordsCeiling: request.spec.replyWordsCeiling })
          });
          outcome = { kind: "OK", value: pieces.readAccepted(response.content) };
        } catch (error) {
          const code = mapErrorCodeOf(error);
          if (providerCallEndedVendorRefusedUnbilled(error)) {
            input.busy.mark(model);
            outcome = { kind: "BUSY", code };
          } else {
            outcome = START_STEP_STOP_CODES.has(code) ? { kind: "STOPPED", code } : { kind: "FAILED", code };
          }
        }
        return ended(outcome);
      }
    })
  });
}
