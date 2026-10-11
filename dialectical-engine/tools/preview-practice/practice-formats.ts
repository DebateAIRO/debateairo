/**
 * Preview practice, mode "formats": every model asked to do every job a few times, each reply checked by the
 * engine's own format check.
 *
 * Plain words: for each of the five models and each job (lane), the real prompt is built from synthetic practice
 * material and sent N times (default 3, the two practice questions taken in turn) through exactly the gateway the
 * runner uses on the preview (the guarded fetch over the gate's own protocol, the preview call policy, the model's
 * reviewed controls, effort "high" where the model has it). Each reply is checked by that job's real check. Calls go
 * one at a time with a polite gap. Nothing is stored anywhere but in memory and the report.
 */
import { randomUUID } from "node:crypto";
import {
  OpenAICompatibleProviderGateway,
  previewModelRow,
  previewTargetGatewayControls,
  providerTargetGatewayControls,
  withPreviewProviderCallPolicy,
  createPreviewGuardedFetch,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget,
  type ProviderGateway,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import type { StoryPack } from "@debateai/story";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import {
  issueListFromParseError,
  recheckReply,
  replyContentOf,
  runPracticeLane,
  type PracticeLane,
  type PracticeLaneBounds
} from "./practice-lanes.js";
import { PRACTICE_QUESTIONS } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";

export type PracticeSampleStatus =
  | "PARSED" | "PARSE_FAILED" | "SCHEMA_FAILED" | "UNPARSED" | "POST_CHECK_FAILED"
  | "CALL_FAILED" | "UNBILLED_REFUSED" | "SKIPPED_GATE_STOPPED";

export type PracticeAttempt = Readonly<{
  callSiteKey: string;
  outcome: ProviderLedgerInput["outcome"];
  parseStatus: RawArtifactInput["parseStatus"] | null;
  latencyMs: number;
}>;

export type PracticeSample = Readonly<{
  model: string;
  providerRef: string;
  gate: PracticeGateName;
  lane: PracticeLane;
  sample: number;
  questionId: string;
  status: PracticeSampleStatus;
  /** Wall time of the whole job (includes the policy's 60-second wait when a call was refused as busy). */
  latencyMs: number;
  attempts: readonly PracticeAttempt[];
  inputTokens: number | null;
  outputTokens: number | null;
  costNanoUsd: string | null;
  unbilledRefusals: number;
  /** For a reply that failed its format check: what the check said, as `code@path`, and the re-check of the stored text. */
  issues: readonly string[];
  recheckIssues: readonly string[];
  errorCode: string | null;
  /** Only for a non-PARSED reply: the reply text, key-shaped strings blanked, at most 64 KiB. */
  replyText: string | null;
  detail: string | null;
}>;

/** The gateway one target uses, built exactly as the runner builds it on the preview, but recording in memory. */
function recordingGateway(input: Readonly<{
  target: ProviderDiscoveryTarget;
  config: PreviewProviderTestConfig;
  guardedFetch: typeof fetch;
  sink: { artifacts: RawArtifactInput[]; ledger: ProviderLedgerInput[] };
  sleep?: (milliseconds: number) => Promise<void>;
}>): ProviderGateway {
  const http = new OpenAICompatibleProviderGateway({
    fetchImplementation: input.guardedFetch,
    endpoint: input.target.baseUrl,
    model: input.target.model,
    maker: input.target.maker,
    ...providerTargetGatewayControls(input.target),
    ...previewTargetGatewayControls(input.config, input.target),
    assertNoOpenWriteTransaction: () => undefined,
    persistRawArtifact: async (artifact) => { input.sink.artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { input.sink.ledger.push(entry); return randomUUID(); }
  });
  return withPreviewProviderCallPolicy(http, input.config, input.target, input.sleep === undefined ? {} : { sleep: input.sleep });
}

function gateOf(model: string): PracticeGateName {
  return previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
}

function errorCodeOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    if (error instanceof Error) return error.name;
  }
  return "UNKNOWN";
}

export type PracticeFormatsResult = Readonly<{
  samples: readonly PracticeSample[];
  /** Models (by id) the run was asked to cover. */
  models: readonly string[];
  lanes: readonly PracticeLane[];
}>;

export async function runPracticeFormats(input: Readonly<{
  config: PreviewProviderTestConfig;
  /** One target per model (the first declared target of each model). */
  targets: readonly ProviderDiscoveryTarget[];
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  lanes: readonly PracticeLane[];
  samples: number;
  gapMs: number;
  pack: StoryPack;
  bounds: PracticeLaneBounds;
  /** Test seam for the gap and the preview policy's resend wait. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** One content-free progress line per job. */
  progress?: (line: string) => void;
  /** Set to stop between jobs (the operator's interrupt). */
  shouldStop?: () => boolean;
}>): Promise<PracticeFormatsResult> {
  const guardedFetch = createPreviewGuardedFetch(input.ports);
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const samples: PracticeSample[] = [];
  let first = true;
  for (const target of input.targets) {
    const gate = gateOf(target.model);
    for (const lane of input.lanes) {
      for (let sample = 1; sample <= input.samples; sample += 1) {
        const question = PRACTICE_QUESTIONS[(sample - 1) % PRACTICE_QUESTIONS.length]!;
        const base = { model: target.model, providerRef: target.providerRef, gate, lane, sample, questionId: question.id };
        if (input.observer.stopped(gate) !== null || input.shouldStop?.() === true) {
          samples.push(Object.freeze({ ...base, status: "SKIPPED_GATE_STOPPED" as const, latencyMs: 0, attempts: [],
            inputTokens: null, outputTokens: null, costNanoUsd: null, unbilledRefusals: 0, issues: [], recheckIssues: [],
            errorCode: input.observer.stopped(gate)?.reason ?? "PRACTICE_INTERRUPTED", replyText: null, detail: null }));
          continue;
        }
        if (!first && input.gapMs > 0) await sleep(input.gapMs);
        first = false;
        const sink = { artifacts: [] as RawArtifactInput[], ledger: [] as ProviderLedgerInput[] };
        const gateway = recordingGateway({ target, config: input.config, guardedFetch, sink,
          ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
        const eventsBefore = input.observer.events.length;
        const started = performance.now();
        let errorCode: string | null = null;
        let postCheckError: string | null = null;
        let detail: string | null = null;
        try {
          const outcome = await runPracticeLane({ lane, question, gateway, providerRef: target.providerRef, maker: target.maker,
            bounds: input.bounds, pack: input.pack, runId: randomUUID(), workItemId: randomUUID() });
          postCheckError = outcome.postCheckError;
          detail = outcome.detail;
        } catch (error) {
          errorCode = errorCodeOf(error);
        }
        const latencyMs = Math.round(performance.now() - started);
        const wire = input.observer.events.slice(eventsBefore);
        const unbilled = wire.filter((event) => event.outcome === "UNBILLED").length;
        const inputTokens = wire.reduce<number | null>((sum, event) => event.inputTokens === null ? sum : (sum ?? 0) + event.inputTokens, null);
        const outputTokens = wire.reduce<number | null>((sum, event) => event.outputTokens === null ? sum : (sum ?? 0) + event.outputTokens, null);
        const row = previewModelRow(target.model);
        const costNanoUsd = row === undefined || inputTokens === null || outputTokens === null ? null
          : String(previewCallNanoUsd(row, BigInt(inputTokens), outputTokens));
        const attempts = sink.ledger.map((entry): PracticeAttempt => {
          const artifact = sink.artifacts.find((candidate) => candidate.attemptId === entry.attemptId) ?? null;
          return Object.freeze({ callSiteKey: entry.callSiteKey, outcome: entry.outcome, parseStatus: artifact?.parseStatus ?? null,
            latencyMs: entry.finishedAt.getTime() - entry.startedAt.getTime() });
        });
        // The real model's artifacts only (the story jobs' local stand-in records none).
        const failed = [...sink.artifacts].reverse().find((artifact) => artifact.parseStatus !== "PARSED") ?? null;
        const last = sink.artifacts.at(-1) ?? null;
        let status: PracticeSampleStatus;
        if (last !== null && last.parseStatus !== "PARSED") status = last.parseStatus;
        else if (failed !== null) status = failed.parseStatus; // a repair fixed it, but the first reply had the wrong format
        else if (postCheckError !== null) status = "POST_CHECK_FAILED";
        else if (last !== null && errorCode === null) status = "PARSED";
        else if (unbilled > 0 && last === null) status = "UNBILLED_REFUSED";
        else if (last !== null && errorCode !== null) status = "POST_CHECK_FAILED";
        else status = "CALL_FAILED";
        const problem = failed ?? null;
        const content = problem === null ? null : replyContentOf(problem.rawText);
        const issues = problem === null ? [] : issueListFromParseError(problem.parseError ?? null);
        const recheck = problem === null || content === null ? [] : recheckReply(attempts.find((attempt) => attempt.parseStatus !== "PARSED")?.callSiteKey
          ?? attempts[0]?.callSiteKey ?? "UNMAPPED", content).issues;
        samples.push(Object.freeze({
          ...base, status, latencyMs, attempts: Object.freeze(attempts), inputTokens, outputTokens, costNanoUsd,
          unbilledRefusals: unbilled, issues, recheckIssues: recheck,
          errorCode: postCheckError ?? errorCode,
          replyText: content === null ? null : reportableReplyText(content),
          detail
        }));
        input.progress?.(`${target.model} ${lane} #${String(sample)}: ${status} ${String(latencyMs)}ms`);
      }
    }
  }
  return Object.freeze({ samples: Object.freeze(samples), models: Object.freeze(input.targets.map((target) => target.model)),
    lanes: Object.freeze([...input.lanes]) });
}

/** One target per reviewed model: the first declared target of each model, in declaration order. */
export function onePerModel(targets: readonly ProviderDiscoveryTarget[], models: readonly string[]): readonly ProviderDiscoveryTarget[] {
  const picked: ProviderDiscoveryTarget[] = [];
  for (const target of targets) {
    if (models.includes(target.model) && !picked.some((chosen) => chosen.model === target.model)) picked.push(target);
  }
  return Object.freeze(picked);
}
