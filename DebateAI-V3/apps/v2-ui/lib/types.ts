export type DebateSummary = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  models: string[];
};

export type Generation = {
  id: string;
  job_id?: string;
  model_id: string;
  role: string;
  argument: string;
  worker_id: string;
  worker_name?: string;
  created_at: string;
  is_active?: boolean;
  is_streaming?: boolean;
  tokens_in?: number | null;
  tokens_out?: number | null;
  latency_ms?: number;
};

/**
 * The four legacy POV lenses plus the structural node types. Kept as named
 * literals so existing narrowing (`node.node_type === "SCIENTIFIC_POV"`) and
 * editor autocomplete keep working.
 */
export type LegacyNodeType =
  | "ROOT_CLAIM"
  | "SCIENTIFIC_POV"
  | "STATISTICAL_POV"
  | "ETHICAL_POV"
  | "PRACTICAL_POV"
  | "PRO"
  | "CON"
  | "EVIDENCE";

/**
 * Node type of a debate tree node. The backend dynamic engine may emit ANY
 * lens/branch node_type string, not just the four legacy POV literals; the
 * `(string & {})` member accepts any backend-provided value while preserving
 * literal autocomplete. The web layer must render whatever branches the backend
 * created and never assume exactly the four legacy lenses.
 */
export type NodeType = LegacyNodeType | (string & {});

export type DebateNode = {
  id: string;
  debate_id: string;
  parent_id: string | null;
  node_type: NodeType;
  /**
   * Optional backend-provided display label / lens name for a branch node.
   * When present it is preferred over any label derived from node_type, so the
   * dynamic engine can name lenses directly. Absent for legacy four-POV debates.
   */
  label?: string | null;
  lens?: string | null;
  depth: number;
  position: number;
  claim: string;
  status: string;
  path_status?: string;
  stopping_status?: string;
  stopping_reason?: string | null;
  /**
   * W5a additive: plain-language copy of stopping_reason via the coordinator's
   * shared reason-code map (closes the "set aside because: generation_exhausted"
   * raw-code rough edge). Absent on older cached/SSR payloads -- callers must
   * fall back to stopping_reason, never assume presence.
   */
  stopping_reason_human?: string | null;
  materialized_path: string;
  active_generation_id: string | null;
  active_generation: Generation | null;
  children: DebateNode[];
  score?: NodeScore | null;
  /**
   * Task 13 (P1.5, evidence independence bookkeeping): additive, per-claim
   * aggregation over this node's own EVIDENCE children -- counts distinct
   * (source_domain, method) pairs (coordinator/app/evidence/independence.py).
   * Measures sourcing BREADTH (how many distinct places/ways this claim's
   * evidence claims to come from), never verified accuracy and never
   * training-corpus independence. Absent (not a fabricated zero-object) for
   * a node with no EVIDENCE children -- callers must not assume presence.
   */
  evidence_independence?: EvidenceIndependence | null;
};

export type EvidenceIndependencePair = [string | null, string | null];

export type EvidenceIndependence = {
  distinct_source_count: number;
  pairs: EvidenceIndependencePair[];
};

export type ScoringStatus = "available" | "partial" | "unavailable";
export type ScoringModelMetadata = {
  provider?: string | null;
  model?: string | null;
  checked_at?: string | null;
  status: ScoringStatus;
};
export type ScoringCacheMetadata = {
  hit: boolean;
  stale?: {
    reason?: "input_hash_mismatch" | string | null;
    refresh_available?: boolean | null;
  } | null;
};
export type ClaimType =
  | "empirical"
  | "causal"
  | "normative"
  | "definitional"
  | "prediction"
  | "comparative"
  | "mixed"
  | "unknown";
export type Severity = "low" | "medium" | "high";
export type InvestigationAction = "challenge" | "support" | "find_evidence" | "decompose" | "ask_user";

export type ScoringScope = {
  population?: string | null;
  timeframe?: string | null;
  geography?: string | null;
  domain?: string | null;
};

export type NormalizedClaim = {
  node_id: string;
  raw_text: string;
  core_claim: string;
  claim_type: ClaimType;
  scope: ScoringScope;
  implied_assumptions: string[];
  evidence_refs: string[];
  ambiguity_flags: string[];
  key_terms: string[];
};

export type NodeScores = {
  strength: number;
  uncertainty: number;
  impact: number;
  evidence_quality: number;
  relevance: number;
  logical_validity: number;
  assumption_risk: number;
  counter_resilience: number;
};

export type ScoreLabels = {
  strength_label: "weak" | "mixed" | "strong";
  uncertainty_label: "low" | "medium" | "high";
  impact_label: "low" | "medium" | "high";
};

// Task 4 (docs/improvement-plan-2026-07-22.md Sec P2.1): labeled drivers
// replace the opaque "UNC 48" numeric-only display. Mirrors
// coordinator/app/scoring/models.py's UncertaintyDriverCode/UncertaintyDriver/
// UncertaintySource -- see app/scoring/reducer.py::_uncertainty_drivers and
// app/scoring/disagreement.py::dispersion_uncertainty for how they're derived.
export type UncertaintyDriverCode =
  | "no_evidence_refs"
  | "low_evidence_quality"
  | "ambiguity"
  | "judge_disagreement"
  | "score_caps"
  | "strong_counter"
  // Stamped only when uncertainty_source is "dispersion" -- always the
  // first driver in that case, explaining the measured numeric itself.
  | "judge_dispersion";

export type UncertaintyDriver = {
  code: UncertaintyDriverCode;
  label: string;
};

export type UncertaintySource = "dispersion" | "heuristic";

// Task 5 (docs/improvement-plan-2026-07-22.md Sec P2.4): mirrors
// coordinator/app/scoring/models.py's StrengthKind -- "argument_only" is
// stamped for claim types that can never carry external evidence
// (normative/definitional), where scores.strength is computed by dropping
// the evidence_quality term and renormalizing the remaining criteria,
// rather than being structurally capped near 0.5 by a term that can never
// move. "evidence_weighted" (the default) is the pre-Task-5 composition,
// unchanged for every other claim type.
export type StrengthKind = "argument_only" | "evidence_weighted";

export type ScoringHole = {
  type: string;
  severity: Severity;
  description: string;
  source: string;
};

export type FatalFlag = {
  type: string;
  severity: Severity;
  description: string;
};

export type ScoreCap = {
  score: string;
  cap_value: number;
  reason: string;
  triggered_by: string;
};

export type JudgeDisagreement = {
  judges: string[];
  type: string;
  severity: Severity;
  description: string;
};

export type RecommendedInvestigation = {
  action: InvestigationAction;
  reason: string;
  priority: number;
  target_node_id?: string | null;
};

export type ManualInvestigationStatus = "queued" | "unavailable";

export type ManualInvestigationRequest = {
  debate_id: string;
  node_id: string;
  action: InvestigationAction;
  hole: ScoringHole;
  reason?: string | null;
};

export type ManualInvestigationResponse = {
  debate_id: string;
  node_id: string;
  action: InvestigationAction;
  status: ManualInvestigationStatus;
  job_id?: string | null;
  reason?: string | null;
};

export type ScoreRationale = {
  short: string;
  why_not_higher: string;
  why_not_lower: string;
  weakest_link: string;
};

export type ScoringDebug = {
  reducer_version: string;
  rubric_version: string;
  judge_outputs?: Record<string, unknown> | null;
};

export type NodeScoringPayload = {
  node_id: string;
  claim: NormalizedClaim;
  scores: NodeScores;
  labels: ScoreLabels;
  holes: ScoringHole[];
  fatal_flags: FatalFlag[];
  score_caps: ScoreCap[];
  judge_disagreements: JudgeDisagreement[];
  recommended_investigations: RecommendedInvestigation[];
  rationale: ScoreRationale;
  debug?: ScoringDebug | null;
  // Optional: additive fields (Task 4). Older persisted/cached debates
  // predate these and omit them entirely -- callers must not assume
  // presence.
  uncertainty_drivers?: UncertaintyDriver[] | null;
  uncertainty_source?: UncertaintySource | null;
  // Optional: additive field (Task 5). Older persisted/cached debates
  // predate this and omit it entirely -- callers must not assume presence.
  strength_kind?: StrengthKind | null;
};

export type NodeScoringError = {
  node_id: string;
  status: "unavailable" | "no_independent_judge";
  reason: string;
};

export type NodeScoringPending = {
  node_id: string;
  status: "pending";
  reason: string;
};

export type ScoringFeedbackVote = "up" | "down";

export type ScoringFeedbackRequest = {
  vote: ScoringFeedbackVote;
};

export type NodeFeedbackSummary = {
  node_id: string;
  up: number;
  down: number;
};

export type CurrentUserFeedbackVote = {
  node_id: string;
  vote: ScoringFeedbackVote;
};

export type ScoringFeedbackResponse = {
  debate_id: string;
  node_id: string;
  vote: ScoringFeedbackVote;
  current_user_vote: ScoringFeedbackVote;
  feedback_summary: NodeFeedbackSummary;
};

export type DebateScoringResponse = {
  debate_id: string;
  status: ScoringStatus;
  node_ids: string[];
  items: NodeScoringPayload[];
  errors?: NodeScoringError[] | null;
  pending?: NodeScoringPending[] | null;
  feedback_summary?: NodeFeedbackSummary[] | null;
  current_user_votes?: CurrentUserFeedbackVote[] | null;
  max_nodes?: number | null;
  scored_node_count?: number | null;
  skipped_node_count?: number | null;
  truncated?: boolean | null;
  reason?: string;
  producer?: string;
  generated_at?: string;
  model_metadata?: ScoringModelMetadata | null;
  cache?: ScoringCacheMetadata | null;
  active_scoring_job_id?: string | null;
  active_scoring_job_status?: "queued" | "running" | "complete" | "failed" | string | null;
};

export type AdaptiveDepthMode = "fixed" | "manual" | "recommended" | "adaptive";
export type DepthPressure = "low" | "medium" | "high";
export type AdaptiveDepthExpansionHint = "expand" | "review_for_expansion";

export type AdaptiveDepthPolicy = {
  mode: AdaptiveDepthMode;
  target_depth?: number | null;
  reason?: string | null;
};

export type AdaptiveDepthDryRunItem = {
  node_id: string;
  pressure: DepthPressure;
  score: number;
  recommended_action: InvestigationAction | null;
  expansion_hint: AdaptiveDepthExpansionHint;
  reasons: string[];
  hole_count: number;
  recommended_investigation_count: number;
};

export type AdaptiveDepthDryRunPlan = {
  policy: AdaptiveDepthPolicy;
  candidate_count: number;
  expansion_count: number;
  items: AdaptiveDepthDryRunItem[];
};

export type DebateAdaptiveDepthDryRunResponse = {
  debate_id: string;
  status: ScoringStatus;
  reason?: string;
  plan: AdaptiveDepthDryRunPlan;
};

export type DebateAdaptiveDepthApprovalRequest = {
  debate_id: string;
  selected_node_ids: string[];
  approval_reason?: string | null;
};

export type DebateAdaptiveDepthApprovalResponse = {
  debate_id: string;
  // "recorded": approval audited, but no expansion work exists yet (W0/B4
  // honesty fix) -- "queued"/"partial" kept for older coordinator responses.
  status: "recorded" | "queued" | "partial" | "unavailable";
  selected_node_ids: string[];
  queued_node_ids: string[];
  unavailable_node_ids: string[];
  jobs: { node_id: string; job_id: string; status: ScoringJobStatus }[];
  // job_id is present on applied outcomes when the coordinator's adaptive
  // expansion flag is on and real work was queued.
  outcomes?: { node_id: string; applied: boolean; reason: string; job_id?: string }[];
  audit_record_id?: string | null;
  reason?: string | null;
};

export type NodeScore = NodeScoringPayload;
export type DebateScoreSummary = DebateScoringResponse;

export type ScoringJobStatus = "queued" | "running" | "complete" | "failed";

export type VerdictSuppressionReason = {
  code: "no_evidence";
  claimType: "empirical";
  claimTypeSource: "root_claim_text" | "scoring_item" | null;
  detail: string;
  unlock: string[];
};

export type Synthesis = {
  id: string;
  debate_id: string;
  strongest_pro: string;
  strongest_con: string;
  verdict: string;
  verdict_gate?: {
    state: "endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence";
    reason: VerdictSuppressionReason | null;
    // W2 additive: mirrors the top-level verdict's served band (same single
    // coordinator derivation; "verdictBand" stays the band's sole wire key name).
    verdictBand?: VerdictBand;
  } | null;
  upstream_agent_output_ids?: string[];
  upstream_agent_run_ids?: string[];
  analyzer_findings?: Record<string, string>;
  provenance?: Record<string, unknown>;
  model_id: string;
  worker_id: string;
  worker_name?: string;
  created_at: string;
};

export type DebateBranch = {
  id: string;
  debate_id: string;
  parent_branch_id: string | null;
  root_node_id: string | null;
  status: string;
  created_at: string;
};

export type AnalyzerRun = {
  id: string;
  debate_id: string;
  branch_id: string;
  analyzer_type: string;
  output: {
    findings?: string[];
    [key: string]: unknown;
  };
  status: string;
  provenance: Record<string, unknown>;
  created_at: string;
};

export type SelectedCapability = {
  id: string;
  match_id: string;
  debate_id: string;
  branch_id: string;
  selection_reason: string;
  score: number;
  status: string | null;
  reuse_count: number;
  definition: {
    name?: string;
    description?: string;
    [key: string]: unknown;
  };
  name?: string;
  created_at: string;
};

export type AgentOutput = {
  id: string;
  debate_id: string;
  branch_id: string;
  skill_id: string;
  agent_id: string;
  analyzer_run_ids: string[];
  pros: string[];
  cons: string[];
  summary: string;
  confidence: number;
  provenance: Record<string, unknown>;
  created_at: string;
};

export type AgentRun = {
  id: string;
  debate_id: string;
  branch_id: string;
  agent_definition_id: string;
  selected_skill_ids: string[];
  agent: {
    name?: string;
    description?: string;
    lens?: string;
    default_prompt?: string;
    [key: string]: unknown;
  };
  agent_name?: string;
  role: string;
  lens: string;
  status: string;
  prompt_input: Record<string, unknown>;
  output: Record<string, unknown>;
  pros: string[];
  cons: string[];
  summary: string;
  confidence: number;
  skills_used: {
    id: string;
    name?: string;
    type?: string;
    description?: string;
    tags?: string[];
  }[];
  job_id: string | null;
  worker_id: string | null;
  model_id: string | null;
  provenance: Record<string, unknown>;
  created_at: string;
};

export type ProvenanceRecord = {
  id: string;
  debate_id: string;
  branch_id: string | null;
  artifact_kind: string;
  artifact_id: string;
  model_id: string;
  worker_id: string;
  prompt_id: string;
  job_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ActiveSynthesis = {
  id: string;
  job_id: string;
  debate_id: string;
  model_id: string;
  worker_id: string;
  worker_name?: string;
  created_at: string;
  raw: string;
  is_streaming?: boolean;
};

export type SingleShotResult = {
  pros: string[];
  cons: string[];
  strongest_pro: string;
  strongest_con: string;
  global_winner: {
    side: "pro" | "con" | "balanced";
    reason: string;
  };
  final_text: string;
  model_id: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
};

export type DebateConfig = Record<string, unknown> & {
  single_shot_result?: SingleShotResult | null;
};

// ---------------------------------------------------------------------------
// Phase 9 Task 1/2: verdict-first UI (feature-flagged, NEXT_PUBLIC_VERDICT_FIRST_UI).
//
// VerdictSummary matches coordinator/app/scoring/verdict.py's verdict_summary()
// wire shape exactly (camelCase, additive). Older cached debate-detail payloads
// may lack the "verdict" key entirely, so it is an optional field here -- the
// UI must render nothing (honest absence), never a fabricated verdict.
// ---------------------------------------------------------------------------

export type VerdictBand = "supported" | "contested" | "unsupported" | "unavailable" | "insufficient_scoring" | "suppressed";

export type VerdictSummary = {
  verdictBand: VerdictBand;
  claimLanguage: string;
  basis: {
    dialecticalStrength: number | null;
    verificationStatus: string | null;
    convergence: Record<string, unknown> | null;
    preGateVerdictBand?: VerdictBand;
    semanticsVersion?: string;
    tauCoverage?: number;
    tauSourceMajority?: "judge_strength" | "default";
  };
  verdictThresholdsVersion: string;
  verdictState?: "endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence";
  evidencePresence?: "none" | "extracted_unresolved";
  suppressionReason?: VerdictSuppressionReason | null;
  caveats?: {
    code: "evidence_unverified" | "claim_type_unknown";
    detail: string;
  }[];
  evidenceGateShadow?: {
    wouldSuppress: boolean;
    reason: VerdictSuppressionReason | null;
    claimType: string | null;
    claimTypeSource: string | null;
  };
};

// ---------------------------------------------------------------------------
// W5a: decision provenance -- why the tree grew, why it stopped, what failed.
// Matches coordinator/app/services/serialization.py's debate_to_dict() shape
// exactly (camelCase, additive). Older cached payloads may lack these keys
// entirely -- optional fields, honest absence, never a fabricated value.
// ---------------------------------------------------------------------------

/** One node's latest lifecycle decision (bounded -- never the full audit
 * trail, which stays in the coordinator's lifecycle_decision_records). */
export type LifecycleDecision = {
  nodeId: string;
  decision: string;
  signalClass: "categorical" | "scalar" | null;
  reason: string | null;
  childSpawnCount: number;
  /** "annotate_only" means the decision was never in line to spawn (scalar
   * signal, or the target is gone). Every other non-"spawned" value names
   * WHY growth stopped -- see the coordinator's
   * expansion_dispatch.GROWTH_STOP_OUTCOMES, which this union mirrors. */
  outcome:
    | "spawned"
    | "annotate_only"
    | "budget_exhausted"
    | "rounds_exhausted"
    | "node_budget_exhausted"
    | "deferred_no_capacity"
    | "below_priority_floor"
    | "wave_full"
    | "converged"
    | "wall_clock"
    | "depth_limit"
    | (string & {});
  /** The impact x uncertainty x dispersion rank the adaptive dispatcher
   * ordered the frontier by. null means the node's merit was never measured
   * (and so was exempt from the priority floor), never that it measured
   * zero. Absent on payloads cached before this key shipped. */
  frontierPriority?: number | null;
  decidedAt: string;
};

/** The claim-type + matched-markers derivation that selected this debate's
 * lens set, persisted only for new dynamic-perspectives debates. */
export type DebateDerivation = {
  claimType: string | null;
  markers: string[];
  lensSet: string[];
};

/** Why the debate stopped, in plain language. */
export type DebateCompletion = {
  state: "complete" | "complete-with-failed-branches" | "failed" | "generating" | (string & {});
  reasonCode: string | null;
  humanReason: string | null;
};

// ---------------------------------------------------------------------------
// P4.1: the synthesis "Leans" meter, backend-derived (coordinator/app/
// scoring/lean.py's compute_lean) from the debate's live PRO/CON nodes.
// Matches debate_to_dict's "lean" key exactly. Older cached debate-detail
// payloads may lack this key entirely -- optional field, honest absence,
// never a fabricated value; lib/debatePresentation.ts's computeLean is the
// client-side fallback for exactly that case.
// ---------------------------------------------------------------------------

export type DebateLean = {
  /** "dialectical": propagated DF-QuAD strength split of live PRO vs CON
   * nodes. "structural": raw live-node-count split, used whenever no usable
   * judge-informed strength exists yet -- see compute_lean's docstring. */
  source: "dialectical" | "structural";
  pct: number;
  label: string;
};

export type DebateDetail = {
  id: string;
  topic: string;
  status: string;
  config: DebateConfig;
  direct_answer: null;
  root_node_id: string | null;
  synthesis_id: string | null;
  created_at: string;
  completed_at: string | null;
  tree: DebateNode | null;
  scoring?: DebateScoreSummary | null;
  synthesis: Synthesis | null;
  active_synthesis: ActiveSynthesis | null;
  branch_lineage: DebateBranch[];
  analyzer_runs: AnalyzerRun[];
  verdict?: VerdictSummary;
  lean?: DebateLean | null;
  selected_skills: SelectedCapability[];
  selected_agents: SelectedCapability[];
  agent_outputs: AgentOutput[];
  agent_runs: AgentRun[];
  skills_used: string[];
  provenance_records: ProvenanceRecord[];
  lifecycleDecisions?: LifecycleDecision[];
  derivation?: DebateDerivation;
  completion?: DebateCompletion;
  workers: string[];
  models: string[];
  node_count: number;
};

export type WorkerStatus = {
  id: string;
  name: string;
  capabilities: string[];
  last_seen: string;
  status: string;
  current_job_id: string | null;
};

// ---------------------------------------------------------------------------
// DDD-06A / DDD-10: frontend DDD language layer
//
// These types sit on top of the persistence/API DTOs (DebateNode, Generation,
// NodeScore/NodeScoringPayload). API field names are unchanged; this layer gives
// UI and scoring helpers domain-language names while preserving compatibility.
// ---------------------------------------------------------------------------

/** The legacy set of ArgumentClaim roles. */
export type LegacyArgumentClaimRole =
  | "ROOT_CLAIM"
  | "SCIENTIFIC_POV"
  | "STATISTICAL_POV"
  | "ETHICAL_POV"
  | "PRACTICAL_POV"
  | "PRO"
  | "CON";

/**
 * Role of an ArgumentClaim in the debate tree. Open to any backend-provided
 * lens/branch role (see NodeType) while keeping the legacy literals for
 * narrowing and autocomplete.
 */
export type ArgumentClaimRole = LegacyArgumentClaimRole | (string & {});

/**
 * Lifecycle status of an investigation path.
 * "abandoned" paths are never deleted and must remain visible in UX.
 */
export type InvestigationPathStatus =
  | "pending"     // path not yet investigated
  | "generating"  // generating argument text
  | "active"      // investigation live, available for deepening
  | "challenged"  // argument challenged; path under re-investigation
  | "abandoned";  // path paused/stopped — preserved, never pruned

/** Lifecycle status of an ArgumentClaim shown in the tree. */
export type ArgumentClaimStatus = InvestigationPathStatus;

/** Domain alias: a ClaimGeneration is the LLM output that produced the argument text. */
export type ClaimGeneration = Generation;

/** Domain alias: scoring information for an ArgumentClaim. */
export type ArgumentScore = NodeScore;

/**
 * Domain view of a DebateNode — uses ArgumentClaim language over raw persistence
 * field names. Convert with nodeToArgumentClaimView() in debateTreeUtils.ts.
 */
export type ArgumentClaimView = {
  id: string;
  debateId: string;
  parentId: string | null;
  claimRole: ArgumentClaimRole;
  depth: number;
  position: number;
  claimText: string;
  activeArgument: ClaimGeneration | null;
  investigationPath: string;
  children: ArgumentClaimView[];
  status: ArgumentClaimStatus;
  activeGenerationId: string | null;
  score?: ArgumentScore | null;
};

/**
 * Domain alias: the scoring output for an ArgumentClaim.
 * Wraps NodeScoringPayload — use this name in DDD-facing code.
 */
export type ScoreSignal = NodeScoringPayload;

/**
 * Evidence quality and gap summary for an ArgumentClaim.
 * Derived from NodeScoringPayload holes, fatal flags, and recommended
 * investigations. Kept separate from scoring totals per DDD doctrine:
 * evidence correctness is distinct from score values.
 */
export type EvidenceSignal = {
  argumentClaimId: string;
  holes: ScoringHole[];
  fatalFlags: FatalFlag[];
  recommendations: RecommendedInvestigation[];
  evidenceQuality: number | null;
};

/**
 * An ExplorationPolicy expansion/investigation decision for an ArgumentClaim.
 * Maps over RecommendedInvestigation with DDD-language field names.
 * Raw LLM outputs never directly populate this — deterministic policy decides.
 */
export type ExpansionDecision = {
  argumentClaimId: string;
  action: InvestigationAction;
  reason: string;
  priority: number;
  expansionHint?: AdaptiveDepthExpansionHint | null;
};
