import {
  ContractHttpError,
  createContractClient,
  type Answer,
  type AskRequest,
  type ContractClient,
  type RunProjection
} from "@debateai/contract";
import type {
  DebateAdaptiveDepthApprovalRequest,
  DebateAdaptiveDepthApprovalResponse,
  DebateAdaptiveDepthDryRunResponse,
  DebateDetail,
  DebateScoringResponse,
  Generation,
  ScoringFeedbackResponse,
  ScoringFeedbackVote,
  WorkerStatus
} from "./types.js";
import {
  adaptiveDepthUnavailable,
  debateDetailFromAnswer,
  debateDetailFromRunProjection,
  scoringUnavailable,
  settingsViewFromDeployment,
  workersFromDeployment,
  type SettingsView
} from "./v3/adapter.js";

/**
 * UI-01 (DR-145): V2's browser data access, swapped onto V3's typed contract
 * client. Same-origin by default — the browser only ever talks to this app's
 * own /api proxy (ACC-01 rev-3 pattern); the acceptance upstream is a
 * server-only concern. Cross-origin-capable bases are rejected loudly at
 * import time.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

function normalizeSameOriginApiPath(apiBase: string): string {
  const normalized = apiBase.trim().replace(/\/+$/, "");
  // Rev-3 advisory A1: the WHATWG URL parser treats "\" as "/" for special
  // schemes, so any backslash form ("/\evil.test") can escape the origin.
  // Refuse every backslash outright, refuse ".." path escapes, then prove the
  // survivor stays on a sentinel origin by round-tripping it.
  if (normalized.length === 0 || normalized.includes("\\")) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  if (normalized.includes("?") || normalized.includes("#") || normalized.split("/").some((segment) => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return true; }
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  })) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  let resolved: URL;
  try {
    resolved = new URL(`${normalized}/origin-probe`, "http://sentinel.invalid");
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  if (resolved.origin !== "http://sentinel.invalid"
    || resolved.pathname !== `${normalized}/origin-probe`) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  return normalized;
}

/**
 * Rewrites contract-client URLs onto the same-origin proxy path. Rev-3
 * advisory A4: a Request input would silently drop method, headers, and body
 * under rewriting, so it is refused loudly instead of forwarded wrong.
 */
export function createSameOriginFetch(
  apiBase: string,
  fetchImplementation: typeof fetch = fetch
): typeof fetch {
  const sameOriginApiPath = normalizeSameOriginApiPath(apiBase);
  return ((input, init) => {
    if (input instanceof Request) {
      return Promise.reject(
        new Error("PROXY_FETCH_REQUEST_INPUT_UNSUPPORTED: pass a URL plus init so method, headers, and body forward faithfully")
      );
    }
    const contractUrl = new URL(String(input));
    return fetchImplementation(`${sameOriginApiPath}${contractUrl.pathname}${contractUrl.search}`, init);
  }) as typeof fetch;
}

export function createBrowserContractClient(
  fetchImplementation: typeof fetch = fetch,
  apiBase: string = API_BASE
): ContractClient {
  const contractOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return createContractClient(
    contractOrigin,
    createSameOriginFetch(apiBase, fetchImplementation),
    { mode: "cookie" }
  );
}

export const contractClient: ContractClient = createBrowserContractClient();

export const COOKIE_SESSION_MARKER = "cookie-session";

function requireToken(token?: string | null): string {
  const resolved = token ?? COOKIE_SESSION_MARKER;
  if (resolved === null || resolved.length === 0) {
    throw new ContractHttpError("SESSION_REQUIRED", 401, "Every V3 read is asker-scoped; sign in first.");
  }
  return resolved;
}

export function isNotFound(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.code === "NOT_FOUND";
}

/** readSession proves the browser's HttpOnly cookie names a real asker identity. */
export async function validateSession(client: ContractClient = contractClient): Promise<void> {
  await client.readSession(COOKIE_SESSION_MARKER);
}

export type DebateBundle =
  | { kind: "served"; answer: Answer; detail: DebateDetail; run: null }
  | { kind: "loading"; answer: null; detail: DebateDetail; run: RunProjection }
  | { kind: "failed"; answer: null; detail: DebateDetail; run: RunProjection };

export type DebateBundleReadOptions = Readonly<{
  /** A terminal stream event says an answer may already exist even if the run projection lags. */
  answerExpected?: boolean;
  /** A served answer already rendered by SSR is authoritative over a lagging projection. */
  currentAnswer?: Answer | null;
}>;

function servedDebateBundle(answer: Answer): DebateBundle {
  return { kind: "served", answer, detail: debateDetailFromAnswer(answer), run: null };
}

/**
 * Reads the run projection first so an ask redirect does not poll two
 * deliberately absent answer resources while generation is in flight.
 * Answer ids remain supported through one run miss followed by readAnswer.
 */
export async function getDebateBundle(
  id: string,
  token: string,
  client: ContractClient = contractClient,
  options: DebateBundleReadOptions = {}
): Promise<DebateBundle> {
  let run: RunProjection | null = null;
  try {
    run = await client.readRun(id, token);
  } catch (failure) {
    if (!isNotFound(failure)) throw failure;
  }
  if (run !== null) {
    if (run.state === "SETTLED" || options.answerExpected) {
      try {
        return servedDebateBundle(await client.readRunAnswer(id, token));
      } catch (failure) {
        // The projection and answer are committed by separate bounded writes.
        // Treat a momentary answer miss as finalizing, never as a user error.
        if (!isNotFound(failure)) throw failure;
        if (options.currentAnswer) return servedDebateBundle(options.currentAnswer);
      }
    }
    if (options.currentAnswer) return servedDebateBundle(options.currentAnswer);
    if (run.state === "FAILED") {
      return { kind: "failed", answer: null, detail: debateDetailFromRunProjection(run), run };
    }
    return { kind: "loading", answer: null, detail: debateDetailFromRunProjection(run), run };
  }
  return servedDebateBundle(await client.readAnswer(id, token));
}

export async function getDebate(id: string, client: ContractClient = contractClient): Promise<DebateDetail> {
  const bundle = await getDebateBundle(id, requireToken(), client);
  return bundle.detail;
}

/**
 * DR-115 typed absence: V3 has no per-node scoring resource. The V2 scoring
 * surfaces receive their own "unavailable" state with an honest reason —
 * never a fabricated score payload, never a masked network call.
 */
export function getDebateScoring(id: string): Promise<DebateScoringResponse> {
  return Promise.resolve(scoringUnavailable(id));
}

export function getDebateAdaptiveDepthDryRun(id: string): Promise<DebateAdaptiveDepthDryRunResponse> {
  return Promise.resolve(adaptiveDepthUnavailable(id));
}

export function approveDebateAdaptiveDepthExpansion(
  _id: string,
  _payload: DebateAdaptiveDepthApprovalRequest,
  _token: string
): Promise<DebateAdaptiveDepthApprovalResponse> {
  return Promise.reject(new Error("V3_HAS_NO_ADAPTIVE_DEPTH_APPROVALS: V3 exposes no adaptive-depth approval resource."));
}

export function submitScoringFeedback(
  _debateId: string,
  _nodeId: string,
  _vote: ScoringFeedbackVote,
  _token: string
): Promise<ScoringFeedbackResponse> {
  return Promise.reject(new Error("V3_HAS_NO_SCORING_FEEDBACK: V3 exposes no scoring-feedback resource."));
}

export function regenerateNode(_nodeId: string, _token: string, _modelId?: string): Promise<{ job_id: string }> {
  return Promise.reject(new Error("V3_HAS_NO_NODE_REGENERATION: V3 exposes no node-regeneration resource."));
}

export function nodeGenerations(_nodeId: string, _token: string): Promise<Generation[]> {
  return Promise.reject(new Error("V3_HAS_NO_GENERATION_HISTORY: V3 exposes no generation-history resource."));
}

export async function backendStatus(
  token?: string | null,
  client: ContractClient = contractClient
): Promise<WorkerStatus[]> {
  const deployment = await client.readDeployment(requireToken(token));
  return workersFromDeployment(deployment);
}

export async function getSettingsView(
  token: string,
  client: ContractClient = contractClient
): Promise<SettingsView> {
  return settingsViewFromDeployment(await client.readDeployment(token));
}

export interface EvaluatorDevMenuView {
  readonly catalog: {
    readonly state: "AVAILABLE" | "UNAVAILABLE";
    readonly probeId: string | null;
    readonly failureCode: string | null;
    readonly models: readonly { readonly modelId: string }[];
  };
  readonly selectedConsumer: {
    readonly consumerSelectionId: string;
    readonly modelId: string;
    readonly selectedAt: string;
  } | null;
  readonly dispatchBinding: {
    readonly state: "UNBOUND";
    readonly reason: "ROW_ABSENT" | "ROW_INVALID" | "EXPLICIT_UNBOUND";
    readonly registerVersion: number;
    readonly sourceRef: string | null;
  };
  readonly harvestedRows: number;
  readonly domains: readonly {
    readonly domainId: string;
    readonly canonicalName: string;
    readonly origin: "STARTER" | "GROWN";
    readonly provenanceRef: string;
    readonly admittedAt: string;
  }[];
  readonly profiles: readonly {
    readonly provider: string;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly domainId: string | null;
    readonly domainName: string | null;
    readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
    readonly metric: string;
    readonly value: number | null;
    readonly n: number;
    readonly intervalLower: number | null;
    readonly intervalUpper: number | null;
    readonly derivationVersion: number;
    readonly rank: number | null;
  }[];
  readonly parkedRuns: readonly {
    readonly runId: string;
    readonly consecutiveFailures: number;
    readonly receipts: readonly {
      readonly state: "FAILED";
      readonly reason: string;
      readonly attemptId: string;
      readonly atSequence: number;
    }[];
  }[];
}

async function evaluatorDevMenuRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const csrfToken = typeof document === "undefined" ? null : document.cookie.split(";").flatMap((member) => {
    const [name, value] = member.trim().split("=", 2);
    return name === "__Host-debateai-csrf" && value !== undefined ? [value] : [];
  })[0] ?? null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(csrfToken === null ? {} : { "x-csrf-token": csrfToken }),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const code = typeof body?.error === "string" ? body.error : "EVALUATOR_DEV_MENU_REQUEST_FAILED";
    const message = typeof body?.message === "string" ? body.message : `Evaluator dev menu request failed (${response.status})`;
    throw new Error(`${code}: ${message}`);
  }
  return await response.json() as T;
}

export function getEvaluatorDevMenu(token: string): Promise<EvaluatorDevMenuView> {
  return evaluatorDevMenuRequest("/v1/dev/evaluator", token);
}

export async function selectEvaluatorConsumerModel(token: string, modelId: string): Promise<void> {
  await evaluatorDevMenuRequest("/v1/dev/evaluator/consumer-selection", token, {
    method: "POST",
    body: JSON.stringify({ model_id: modelId })
  });
}

export function saveSettings(): Promise<never> {
  return Promise.reject(new Error("V3_HAS_NO_SETTINGS_WRITE: deployment configuration is register-governed, not UI-writable."));
}

type AskConfig = Record<string, unknown>;

function requiredString(config: AskConfig, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`ASK_FIELD_REQUIRED: ${key} must be supplied explicitly; the UI invents no ask values.`);
  }
  return value.trim();
}

function requiredInteger(config: AskConfig, key: string, minimum: number): number {
  const value = config[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new Error(`ASK_FIELD_REQUIRED: ${key} must be an explicit whole number; the UI invents no ask values.`);
  }
  return value;
}

function optionalLines(config: AskConfig, key: string): string[] {
  const value = config[key];
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value.every((line): line is string => typeof line === "string")) {
    return value.filter((line) => line.trim().length > 0);
  }
  throw new Error(`ASK_FIELD_REQUIRED: ${key} must be a list of lines when supplied.`);
}

const RISK_TIERS = new Set(["casual", "standard", "high-stakes"]);
const BUDGET_TIERS = new Set(["low", "medium", "high"]);

/**
 * Builds the V3 ask strictly from user-supplied fields (S14 precedent: every
 * contract value is explicit input — no hidden defaults, no invented
 * numbers). Missing or malformed fields fail loudly before any network call.
 */
export async function createDebate(
  topic: string,
  config: AskConfig,
  token: string,
  client: ContractClient = contractClient
): Promise<{ id: string }> {
  const riskTier = requiredString(config, "risk_tier");
  if (!RISK_TIERS.has(riskTier)) throw new Error("ASK_FIELD_REQUIRED: risk_tier must be casual, standard, or high-stakes.");
  const tierSource = requiredString(config, "tier_source");
  if (tierSource !== "ASKER" && tierSource !== "MACHINE_DEFAULT") {
    throw new Error("ASK_FIELD_REQUIRED: tier_source must identify an asker choice or machine default.");
  }
  const tierProvenanceRef = requiredString(config, "tier_provenance_ref");
  const budgetTier = requiredString(config, "composition_budget_tier");
  if (!BUDGET_TIERS.has(budgetTier)) throw new Error("ASK_FIELD_REQUIRED: composition_budget_tier must be low, medium, or high.");
  const asOf = new Date(requiredString(config, "as_of"));
  if (Number.isNaN(asOf.valueOf())) throw new Error("ASK_FIELD_REQUIRED: as_of must be an explicit date and time.");
  const ask: AskRequest = {
    question_line: topic,
    risk_tier: riskTier as AskRequest["risk_tier"],
    tier_source: tierSource,
    tier_provenance_ref: tierProvenanceRef,
    composition_budget_tier: budgetTier as AskRequest["composition_budget_tier"],
    depth_params: { depth: requiredInteger(config, "depth", 0) },
    decision_scope: requiredString(config, "decision_scope"),
    as_of: asOf.toISOString(),
    steering_presets: optionalLines(config, "steering_presets"),
    steering_annotations: optionalLines(config, "steering_annotations")
  };
  const accepted = await client.submitAsk(ask, token);
  return { id: accepted.run_ref };
}
