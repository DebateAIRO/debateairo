import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";
import {
  PERPLEXITY_SEARCH_MODEL,
  PERPLEXITY_SEARCH_VENDOR,
  PREVIEW_PROVIDER_SOCKET_KEYS,
  createPreviewRemainingRpcPort,
  previewCallTierOf,
  previewGateSocket,
  previewModelRowForRef,
  previewProviderSocket,
  providerCallGateUnsent,
  structureRepairOriginalKey,
  type PerplexitySearchOutcome,
  type PerplexitySearchPort,
  type PreviewGateName,
  type PreviewGateRemaining,
  type PreviewGateSettings,
  type PreviewProviderName,
  type ProviderGateway,
  type StructureRepairRoute
} from "@debateai/providers";
import { callPriorityOf, type CallScheduler, type CallSubject, type DebateCallLane } from "./call-scheduler.js";

/**
 * Parallel AI calls (docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.2, §3.4) — a debate's calls go
 * through its lane of the runner's call scheduler.
 *
 * `execute` opens one lane per claimed debate and wraps every claim-eligible maker's gateway in `laneGateway`, OUTSIDE
 * the run's sit-out book, so a call that waited for a slot is checked against the sit-out book only when it may start.
 * The lane asks for a slot under every limit (the debate's, the model's in the debate and across the runner, the
 * preview gate's), then runs the call and frees the slot when it settles. With the register row absent every debate's
 * lane is one call at a time: today's order.
 */

/** Which model, vendor and preview gate a maker's calls use. */
export interface CallSubjectResolver {
  subjectOf(providerRef: string): CallSubject;
}

/** A ref with no known row: its own model, behind no gate, under the default runner-wide limit. */
function unknownSubject(providerRef: string): CallSubject {
  return Object.freeze({ model: providerRef, vendor: "default", gate: null });
}

/**
 * On the preview: each ref's reviewed row. The model is the row's model (two refs of one model share its slots), and
 * the row's provider is both the vendor (its runner-wide limit) and the gate its calls go through. Addition D16: only the
 * gate part of the preview configuration is read (PreviewGateSettings).
 */
export function previewCallSubjects(config: PreviewGateSettings): CallSubjectResolver {
  return Object.freeze({
    subjectOf(providerRef: string): CallSubject {
      const row = previewModelRowForRef(providerRef);
      if (row === undefined) return unknownSubject(providerRef);
      // A provider whose gate this configuration has no socket for could never be called; it is then behind no gate.
      const gate = previewProviderSocket(config, row.provider) === undefined ? null : row.provider;
      return Object.freeze({ model: row.model, vendor: row.provider, gate });
    }
  });
}

function hostIs(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** The vendor a target's host names; "default" for any other host (relays, local model servers). */
function vendorOfBaseUrl(baseUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "default";
  }
  if (hostIs(hostname, "deepinfra.com")) return "deepinfra";
  if (hostIs(hostname, "anthropic.com")) return "anthropic";
  // Perplexity plan W2-1: the web search vendor (never a declared target today; its own runner-wide limit if one is).
  if (hostIs(hostname, "perplexity.ai")) return PERPLEXITY_SEARCH_VENDOR;
  return "default";
}

/** Off the preview (hosted and local): each target's model, its vendor read from its host, and no gate. */
export function targetCallSubjects(
  targets: readonly Readonly<{ providerRef: string; model: string; baseUrl: string }>[]
): CallSubjectResolver {
  const subjects = new Map(targets.map((target) => [target.providerRef, Object.freeze({
    model: target.model,
    vendor: vendorOfBaseUrl(target.baseUrl),
    gate: null
  }) as CallSubject] as const));
  return Object.freeze({
    subjectOf: (providerRef: string): CallSubject => subjects.get(providerRef) ?? unknownSubject(providerRef)
  });
}

/**
 * One maker's gateway, through the debate's lane. The call's kind (author, panel, review, other) comes from its
 * call-site key. The call runs in the async context it was made in, however late its slot frees: the slot may be freed
 * by another debate's call settling, and the keep-alive, the content lease and the evaluator scope the call's gateways
 * read belong to the debate that made it (AsyncLocalStorage, run-keep-alive.ts and packages/db).
 *
 * On the preview the gate's health is kept here, BEFORE the slot is freed, so a call waiting for that gate never slips
 * through on the old health: an answer marks the gate healthy (all its slots), a failure the gate proved unsent
 * (PROVIDER_NOT_REACHED, PROVIDER_ERROR_UNBILLED; `providerCallGateUnsent`) marks it unhealthy (one call in flight,
 * spec §3.4). Results and errors pass through unchanged.
 *
 * `onFailed` (spec §2.3, Task 12) is told of every failed call, also BEFORE its slot is freed: a stop that failure
 * raises is then known to the lane's start guard when the freed slot would start the next waiting call. It never
 * changes the error.
 *
 * `beforeSlot` (ruling R31; preview only, main.ts wires it to the runner-wide busy coordinator's `admit`) is awaited
 * BEFORE the call asks for any slot: a call to a model that is busy (one probe in flight, the rest waiting through the
 * gate's 60-600 s cool-off) then waits holding no debate, model or gate slot, so another model's calls through the same
 * gate are never stalled behind it. A rejection ends the call with that error, nothing sent and no slot taken. The wait
 * and the slot request both run in the caller's async context, whoever releases the wait.
 */
export function laneGateway(input: Readonly<{
  lane: DebateCallLane;
  scheduler: CallScheduler;
  subject: CallSubject;
  provider: ProviderGateway;
  onFailed?: (error: unknown) => void;
  beforeSlot?: (subject: CallSubject) => Promise<void>;
}>): ProviderGateway {
  const { lane, scheduler, subject, provider, onFailed, beforeSlot } = input;
  const gate = subject.gate;
  const held: HeldLaneSlot = Object.freeze({ lane, scheduler, subject, ...(beforeSlot === undefined ? {} : { beforeSlot }) });
  return Object.freeze({
    call(request) {
      const send = AsyncResource.bind(async () => {
        try {
          // LG-A: a call this call's own gateway makes for it (the structure repair) finds the slot it holds.
          const result = await heldLaneSlot.run(held, () => provider.call(request));
          if (gate !== null) scheduler.markGateHealthy(gate);
          return result;
        } catch (error) {
          if (gate !== null && providerCallGateUnsent(error)) scheduler.markGateUnhealthy(gate);
          try { onFailed?.(error); } catch { /* the hook never changes the call's error */ }
          throw error;
        }
      });
      // LG-B (Task 5, fix round 1): a final writer, by the same rule the preview call policy asks the gate's tier with
      // (previewCallTierOf), waits in the scheduler for one of its gate's final-writer slots, never at the gate.
      const ticket = { ...subject, priority: callPriorityOf(request.callSiteKey),
        ...(previewCallTierOf(request) === "FINAL_WRITER" ? { finalWriter: true as const } : {}) };
      if (beforeSlot === undefined) return lane.run(ticket, send);
      // Bound, so the slot request (and the lane's start guard) runs in this caller's context however the wait ends.
      const askForSlot = AsyncResource.bind(() => lane.run(ticket, send));
      let waited: Promise<void>;
      try { waited = beforeSlot(subject); } catch (error) { return Promise.reject(error); }
      return waited.then(askForSlot);
    }
  } satisfies ProviderGateway);
}

/** LG-A: the lane slot a running call holds, seen by a call its own gateway makes for it (`structureRepairThroughLane`). */
type HeldLaneSlot = Readonly<{
  lane: DebateCallLane;
  scheduler: CallScheduler;
  subject: CallSubject;
  beforeSlot?: (subject: CallSubject) => Promise<void>;
}>;
const heldLaneSlot = new AsyncLocalStorage<HeldLaneSlot>();

/**
 * LG-A (spec 2026-10-15, L32) under the owner's parallel-call limits (spec 2026-10-12 §3.2: 12 calls per debate, 3 per
 * AI in a debate, each model's runner-wide slots, each gate's slots) — THE STRUCTURE-REPAIR ROUTE, THROUGH THE LANE.
 *
 * withStructureRepair sits inside each member's lane gateway, so the repair call is made while the original call holds
 * its slot, after the original's own POST has ended. Its gateway is wrapped here so that, inside a lane, it asks that
 * debate's lane for the repair model's slots the original call does not already hold (`DebateCallLane.runWithin`): never
 * a debate slot (the original's is used), nothing more for a call of the repair model itself (Haiku's own repair), and
 * otherwise one of the repair model's slots in the debate and across the runner and one of its gate's. So a repair is
 * never a POST beyond the owner's limits, even when Haiku also argues in the debate. As any lane call it first waits on
 * the busy coordinator (`beforeSlot`, ruling R31), here while the original keeps its slot, and its answer or unsent
 * failure keeps the gate's health. Outside a lane (no scheduler) it is the route's gateway, as every call there is.
 * Null stays null.
 */
export function structureRepairThroughLane(route: StructureRepairRoute | null, subjects: CallSubjectResolver): StructureRepairRoute | null {
  if (route === null) return null;
  const subject = subjects.subjectOf(route.providerRef);
  const gateway = route.gateway;
  return Object.freeze({ ...route, gateway: Object.freeze({
    call(request) {
      const held = heldLaneSlot.getStore();
      if (held === undefined) return gateway.call(request);
      // Haiku's own repair holds every slot it needs already: `runWithin` runs it at once (`slotsTakenWithin`).
      const { lane, scheduler, beforeSlot, subject: heldSubject } = held;
      const send = AsyncResource.bind(async () => {
        try {
          const result = await gateway.call(request);
          if (subject.gate !== null) scheduler.markGateHealthy(subject.gate);
          return result;
        } catch (error) {
          if (subject.gate !== null && providerCallGateUnsent(error)) scheduler.markGateUnhealthy(subject.gate);
          throw error;
        }
      });
      // The repair is the original call's: its kind (author, panel, review, other) orders it in the lane's queue.
      const ticket = { ...subject, priority: callPriorityOf(structureRepairOriginalKey(request.callSiteKey)) };
      const askForSlot = AsyncResource.bind(() => lane.runWithin(heldSubject, ticket, send));
      if (beforeSlot === undefined) return askForSlot();
      let waited: Promise<void>;
      try { waited = beforeSlot(subject); } catch (error) { return Promise.reject(error); }
      return waited.then(askForSlot);
    }
  } satisfies ProviderGateway) });
}

/**
 * The model providers' preview gates this configuration names, each with a socket: the gate names `previewCallSubjects`
 * reports. The web search gate is not one of them (Perplexity plan W2-1): `previewSearchGateRemainingReader`.
 */
export function previewGateNames(config: PreviewGateSettings): readonly PreviewProviderName[] {
  return Object.freeze((["deepinfra", ...Object.keys(PREVIEW_PROVIDER_SOCKET_KEYS)] as PreviewProviderName[])
    .filter((gate) => previewProviderSocket(config, gate) !== undefined));
}

/** Each model provider's preview gate's read-only `/remaining`, over the configuration's own sockets (main.ts). */
export function previewGateRemainingReaders(config: PreviewGateSettings): readonly Readonly<{
  gate: PreviewProviderName;
  remaining: () => Promise<PreviewGateRemaining>;
}>[] {
  return Object.freeze(previewGateNames(config).map((gate) => {
    const port = createPreviewRemainingRpcPort({ budget_socket: previewProviderSocket(config, gate)!, scope_id: config.scope_id });
    return Object.freeze({ gate, remaining: () => port.remaining() });
  }));
}

/**
 * Spec §3.2: each preview gate's own slots (`max_concurrent_calls`), read once at boot, so the runner never sends a gate
 * more calls than it holds at once (CONCURRENCY_LIMIT_REACHED): the rest wait in the scheduler. A gate that cannot be
 * read gets ONE slot, and one content-free line names it (never the error's text, which can carry a socket path).
 * LG-B (Task 5, fix round 1): a gate whose answer names its final-writer slots (`finalWriterMaxInFlight`) gets them too,
 * so a further final writer waits in the scheduler instead of being refused by the gate; a gate that names none, or
 * could not be read, gets no final-writer cap (today's behaviour; an unread gate runs one call at a time anyway).
 */
export async function applyPreviewGateCapacities(input: Readonly<{
  scheduler: Pick<CallScheduler, "setGateCapacity" | "setGateFinalWriterCapacity">;
  gates: readonly Readonly<{ gate: string; remaining: () => Promise<PreviewGateRemaining> }>[];
  log?: (line: string) => void;
}>): Promise<void> {
  const log = input.log ?? ((line: string) => { console.warn(line); });
  await Promise.all(input.gates.map(async ({ gate, remaining }) => {
    let slots = 1;
    let finalWriterSlots: number | undefined;
    try {
      const answer = await remaining();
      const read = answer.maxConcurrentCalls;
      if (Number.isSafeInteger(read) && read >= 1) slots = read;
      else throw new TypeError("GATE_CAPACITY_INVALID");
      // The parser already holds it to 1..max_concurrent_calls; anything else is read as one slot (never no cap).
      const finalWriters = answer.finalWriterMaxInFlight;
      if (finalWriters !== undefined) {
        finalWriterSlots = Number.isSafeInteger(finalWriters) && finalWriters >= 1 ? Math.min(finalWriters, slots) : 1;
      }
    } catch {
      log(JSON.stringify({ kind: "DEBATEAI_CALL_SCHEDULER", event: "GATE_CAPACITY_UNREAD", gate }));
    }
    if (finalWriterSlots !== undefined) input.scheduler.setGateFinalWriterCapacity(gate, finalWriterSlots);
    input.scheduler.setGateCapacity(gate, slots);
  }));
}

/**
 * Perplexity plan 2026-10-30, task W2-1 — A WEB SEARCH'S SUBJECT. Search is no model and no maker's call: its subject
 * is the search row (`perplexity-search-fast`, so the debate's and the runner's per-model limits cap searches at once),
 * the vendor `perplexity`, and on the preview its own gate when the configuration names its socket (else no gate: the
 * guarded fetch then sends nothing and the search fails NOT_CONFIGURED). Off the preview there is no gate.
 */
export function searchCallSubject(config: PreviewGateSettings | undefined): CallSubject {
  const gate = config !== undefined && previewGateSocket(config, PERPLEXITY_SEARCH_VENDOR) !== undefined ? PERPLEXITY_SEARCH_VENDOR : null;
  return Object.freeze({ model: PERPLEXITY_SEARCH_MODEL, vendor: PERPLEXITY_SEARCH_VENDOR, gate });
}

/**
 * Perplexity plan W2-1: the web search gate's read-only `/remaining` when the configuration names its socket, in the
 * form `applyPreviewGateCapacities` takes, so its slots (`max_concurrent_calls`) are read at boot like every gate's and
 * searches wait in the scheduler instead of being refused. Undefined when no search gate is configured.
 */
export function previewSearchGateRemainingReader(config: PreviewGateSettings): Readonly<{
  gate: PreviewGateName;
  remaining: () => Promise<PreviewGateRemaining>;
}> | undefined {
  const socket = previewGateSocket(config, PERPLEXITY_SEARCH_VENDOR);
  if (socket === undefined) return undefined;
  const port = createPreviewRemainingRpcPort({ budget_socket: socket, scope_id: config.scope_id });
  return Object.freeze({ gate: PERPLEXITY_SEARCH_VENDOR, remaining: () => port.remaining() });
}

const searchFailed = (failure: "STOPPED" | "UNEXPECTED"): PerplexitySearchOutcome =>
  Object.freeze({ outcome: "FAILED", failure, chargeMicros: 0, resultCount: 0 });

/**
 * Perplexity plan W2-1 — ONE DEBATE'S WEB SEARCHES, THROUGH ITS LANE. Each search waits for its slots in the debate's
 * lane as an OTHER call (never ahead of the arguing calls), under the search row's limits and its gate's slots, runs in
 * the caller's async context, and keeps the gate's health as `laneGateway` does: an answered search (FOUND, EMPTY)
 * marks the gate healthy, one the gate proved unsent (GATE_UNSENT) marks it unhealthy, before the slot frees. It never
 * throws: a search still waiting when the lane stops is FAILED STOPPED (never sent), and an inner port that throws
 * anyway is FAILED UNEXPECTED, so a search can never end the debate (owner 2026-10-30: the debate goes on without web).
 */
export function laneSearchPort(input: Readonly<{
  lane: DebateCallLane;
  scheduler: Pick<CallScheduler, "markGateHealthy" | "markGateUnhealthy">;
  subject: CallSubject;
  port: PerplexitySearchPort;
}>): PerplexitySearchPort {
  const { lane, scheduler, subject, port } = input;
  const gate = subject.gate;
  return Object.freeze({
    async search(request, signal) {
      const send = AsyncResource.bind(async (): Promise<PerplexitySearchOutcome> => {
        let outcome: PerplexitySearchOutcome;
        try { outcome = await port.search(request, signal); } catch { outcome = searchFailed("UNEXPECTED"); }
        if (gate !== null && (outcome.outcome === "FOUND" || outcome.outcome === "EMPTY")) scheduler.markGateHealthy(gate);
        if (gate !== null && outcome.outcome === "FAILED" && outcome.failure === "GATE_UNSENT") scheduler.markGateUnhealthy(gate);
        return outcome;
      });
      try {
        return await lane.run({ ...subject, priority: "OTHER" }, send);
      } catch {
        // The lane stopped or held the search back before it started: nothing was sent.
        return searchFailed("STOPPED");
      }
    }
  } satisfies PerplexitySearchPort);
}
