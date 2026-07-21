import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-scoring-response-test");

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/scoringResponse.ts",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--rootDir",
    ".",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--strict",
  ];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tscCommand, ...tscArgs], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync(tscCommand, tscArgs, { cwd: process.cwd(), stdio: "pipe" });
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "scoringResponse.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("indexScoringResponse keeps partial node errors separate from successful scores", async () => {
  const { indexScoringResponse } = await loadHelper();
  const successfulScore = { node_id: "scored-node" };
  const failedError = {
    node_id: "failed-node",
    status: "unavailable",
    reason: "Scoring judge call timed out.",
  };

  const indexed = indexScoringResponse({
    debate_id: "debate-1",
    status: "partial",
    node_ids: ["scored-node", "failed-node"],
    items: [successfulScore],
    errors: [failedError],
  });

  assert.equal(indexed.scoringByNodeId.get("scored-node"), successfulScore);
  assert.equal(indexed.scoringByNodeId.has("failed-node"), false);
  assert.equal(indexed.scoringErrorsByNodeId.get("failed-node"), failedError);
});

test("indexScoringResponse keeps pending nodes separate from scores and unavailable errors", async () => {
  const { indexScoringResponse } = await loadHelper();
  const successfulScore = { node_id: "scored-node" };
  const failedError = {
    node_id: "failed-node",
    status: "unavailable",
    reason: "Scoring judge call timed out.",
  };
  const pendingItem = {
    node_id: "pending-node",
    status: "pending",
    reason: "Scoring has not completed for this node.",
  };

  const indexed = indexScoringResponse({
    debate_id: "debate-1",
    status: "partial",
    node_ids: ["scored-node", "failed-node", "pending-node"],
    items: [successfulScore],
    errors: [failedError],
    pending: [pendingItem],
  });

  assert.equal(indexed.scoringByNodeId.get("scored-node"), successfulScore);
  assert.equal(indexed.scoringByNodeId.has("pending-node"), false);
  assert.equal(indexed.scoringErrorsByNodeId.get("failed-node"), failedError);
  assert.equal(indexed.scoringPendingByNodeId.get("pending-node"), pendingItem);
});

test("indexScoringResponse indexes feedback summary and current user votes by node", async () => {
  const { indexScoringResponse } = await loadHelper();
  const feedbackSummary = { node_id: "node-1", up: 2, down: 1 };
  const currentUserVote = { node_id: "node-1", vote: "down" };

  const indexed = indexScoringResponse({
    debate_id: "debate-1",
    status: "available",
    node_ids: ["node-1"],
    items: [],
    feedback_summary: [feedbackSummary],
    current_user_votes: [currentUserVote],
  });

  assert.equal(indexed.feedbackSummaryByNodeId.get("node-1"), feedbackSummary);
  assert.equal(indexed.currentUserFeedbackByNodeId.get("node-1"), currentUserVote);
});

test("indexScoringResponse returns empty maps for absent scoring data", async () => {
  const { indexScoringResponse } = await loadHelper();

  const indexed = indexScoringResponse(null);

  assert.equal(indexed.scoringByNodeId.size, 0);
  assert.equal(indexed.scoringErrorsByNodeId.size, 0);
  assert.equal(indexed.scoringPendingByNodeId.size, 0);
  assert.equal(indexed.feedbackSummaryByNodeId.size, 0);
  assert.equal(indexed.currentUserFeedbackByNodeId.size, 0);
});

test("formatScoringVisibilityState names off, provider required, unavailable, refreshing, and scored states", async () => {
  const { formatScoringVisibilityState } = await loadHelper();

  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: false,
      hasActionToken: false,
      scoringStatus: "idle",
      refreshStatus: "idle",
      response: null,
      error: null,
    }),
    {
      kind: "off",
      title: "Scoring off",
      detail: "Scoring is disabled for this view; no score data is being shown.",
    }
  );
  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: false,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      response: { status: "available", items: [{ node_id: "n1" }, { node_id: "n2" }] },
      error: null,
    }),
    {
      kind: "scores",
      title: "Real scores displayed",
      detail: "Showing 2 persisted scored claims from the scoring response.",
    }
  );
  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "unavailable",
      refreshStatus: "idle",
      response: { status: "unavailable", items: [], reason: "Configure a scoring provider before running scoring." },
      error: null,
    }),
    {
      kind: "provider_required",
      title: "Scoring provider required",
      detail: "Configure a scoring provider before running scoring.",
    }
  );
  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "error",
      refreshStatus: "idle",
      response: null,
      error: "Scoring refresh failed.",
    }),
    {
      kind: "unavailable",
      title: "Scoring unavailable",
      detail: "Scoring refresh failed.",
    }
  );
  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "loaded",
      refreshStatus: "starting",
      response: { status: "available", items: [{ node_id: "n1" }] },
      error: null,
    }),
    {
      kind: "refreshing",
      title: "Scoring in progress",
      detail: "Judge outputs are being generated. Showing 1 persisted scored claim while it completes.",
    }
  );
  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      response: { status: "available", items: [{ node_id: "n1" }, { node_id: "n2" }, { node_id: "n3" }] },
      error: null,
    }),
    {
      kind: "scores",
      title: "Real scores displayed",
      detail: "Showing 3 persisted scored claims from the scoring response.",
    }
  );
});

test("formatScoringVisibilityState treats missing judge output as a pending default scoring state", async () => {
  const { formatScoringVisibilityState } = await loadHelper();

  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "unavailable",
      refreshStatus: "idle",
      response: {
        debate_id: "debate-1",
        status: "unavailable",
        node_ids: ["node-a"],
        items: [],
        reason: "No scoring judge outputs are available for this debate.",
      },
      error: null,
    }),
    {
      kind: "empty",
      title: "Scoring pending",
      detail: "No persisted judge outputs are available yet.",
    }
  );
});

test("formatScoringVisibilityState reports refreshes as in progress without implying failure", async () => {
  const { formatScoringVisibilityState } = await loadHelper();

  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "unavailable",
      refreshStatus: "starting",
      response: {
        debate_id: "debate-1",
        status: "unavailable",
        node_ids: ["node-a"],
        items: [],
        reason: "No scoring judge outputs are available for this debate.",
      },
      error: null,
    }),
    {
      kind: "refreshing",
      title: "Scoring in progress",
      detail: "Judge outputs are being generated.",
    }
  );
});

test("formatScoringVisibilityState treats active backend scoring jobs as in progress", async () => {
  const { formatScoringVisibilityState } = await loadHelper();

  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "unavailable",
      refreshStatus: "idle",
      response: {
        debate_id: "debate-1",
        status: "unavailable",
        node_ids: ["node-a"],
        items: [],
        active_scoring_job_id: "job-1",
        active_scoring_job_status: "running",
        reason: "Scoring judge call failed: The 'gpt-5.6sol-medium' model is not supported.",
      },
      error: null,
    }),
    {
      kind: "refreshing",
      title: "Scoring in progress",
      detail: "Judge outputs are being generated.",
    }
  );
});

test("formatScoringVisibilityState reports partial scoring counts", async () => {
  const { formatScoringVisibilityState } = await loadHelper();

  assert.deepEqual(
    formatScoringVisibilityState({
      enabled: true,
      hasActionToken: true,
      scoringStatus: "loaded",
      refreshStatus: "idle",
      response: {
        debate_id: "debate-1",
        status: "partial",
        node_ids: ["node-a", "node-b", "node-c"],
        items: [{ node_id: "node-a" }, { node_id: "node-b" }],
        errors: [{ node_id: "node-c", status: "unavailable", reason: "Scoring node limit reached." }],
        scored_node_count: 2,
      },
      error: null,
    }),
    {
      kind: "scores",
      title: "Scores partially checked",
      detail: "Showing 2 persisted scored claims; 1 unavailable claim.",
    }
  );
});

test("summarizeScoringHoles aggregates only real payload holes with node context", async () => {
  const { summarizeScoringHoles } = await loadHelper();
  const summary = summarizeScoringHoles({
    debate_id: "debate-1",
    status: "partial",
    node_ids: ["node-a", "node-b", "node-c"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "Claim A" },
        holes: [
          { type: "evidence_gap", severity: "high", source: "judge-a", description: "Needs a primary source." },
          { type: "scope_gap", severity: "medium", source: "judge-b", description: "   " },
        ],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "Claim B" },
        holes: [
          { type: "assumption_gap", severity: "medium", source: "judge-a", description: "Assumption is unstated." },
          { type: "precision_gap", severity: "low", source: "judge-b", description: "Term needs definition." },
        ],
      },
    ],
    errors: [
      {
        node_id: "node-c",
        status: "unavailable",
        reason: "Scoring unavailable for this node.",
      },
    ],
  });

  assert.equal(summary.total, 3);
  assert.deepEqual(summary.bySeverity, { high: 1, medium: 1, low: 1 });
  assert.deepEqual(
    summary.items.map((item) => ({
      nodeId: item.nodeId,
      claim: item.claim,
      severity: item.severity,
      type: item.type,
      description: item.description,
      source: item.source,
    })),
    [
      {
        nodeId: "node-a",
        claim: "Claim A",
        severity: "high",
        type: "evidence_gap",
        description: "Needs a primary source.",
        source: "judge-a",
      },
      {
        nodeId: "node-b",
        claim: "Claim B",
        severity: "medium",
        type: "assumption_gap",
        description: "Assumption is unstated.",
        source: "judge-a",
      },
      {
        nodeId: "node-b",
        claim: "Claim B",
        severity: "low",
        type: "precision_gap",
        description: "Term needs definition.",
        source: "judge-b",
      },
    ]
  );
});

test("summarizeScoringFatalFlags aggregates only real payload fatal flags with node context", async () => {
  const { summarizeScoringFatalFlags } = await loadHelper();
  const summary = summarizeScoringFatalFlags({
    debate_id: "debate-1",
    status: "partial",
    node_ids: ["node-a", "node-b", "node-c"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "Claim A" },
        fatal_flags: [
          { type: "contradiction", severity: "high", description: "Contradicts the source text." },
          { type: "empty", severity: "medium", description: "   " },
        ],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "   " },
        fatal_flags: [
          { type: "unsupported_core", severity: "medium", description: "Core claim has no support." },
          { type: "scope_mismatch", severity: "low", description: "Scope does not match conclusion." },
        ],
      },
    ],
    errors: [
      {
        node_id: "node-c",
        status: "unavailable",
        reason: "Scoring unavailable for this node.",
      },
    ],
  });

  assert.equal(summary.total, 3);
  assert.deepEqual(summary.bySeverity, { high: 1, medium: 1, low: 1 });
  assert.deepEqual(
    summary.items.map((item) => ({
      nodeId: item.nodeId,
      claim: item.claim,
      severity: item.severity,
      type: item.type,
      description: item.description,
    })),
    [
      {
        nodeId: "node-a",
        claim: "Claim A",
        severity: "high",
        type: "contradiction",
        description: "Contradicts the source text.",
      },
      {
        nodeId: "node-b",
        claim: "node-b",
        severity: "medium",
        type: "unsupported_core",
        description: "Core claim has no support.",
      },
      {
        nodeId: "node-b",
        claim: "node-b",
        severity: "low",
        type: "scope_mismatch",
        description: "Scope does not match conclusion.",
      },
    ]
  );
});

test("selectStrongestUnresolvedScoringIssue picks the highest-priority real issue deterministically", async () => {
  const { selectStrongestUnresolvedScoringIssue } = await loadHelper();
  const issue = selectStrongestUnresolvedScoringIssue({
    debate_id: "debate-1",
    status: "available",
    node_ids: ["node-a", "node-b", "node-c"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "Lower impact claim" },
        scores: { impact: 0.9, uncertainty: 0.9, strength: 0.2 },
        holes: [
          { type: "evidence_gap", severity: "medium", source: "judge-a", description: "Needs a source." },
        ],
        fatal_flags: [
          { type: "contradiction", severity: "medium", description: "Contradicts supporting evidence." },
        ],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "High impact claim" },
        scores: { impact: 0.8, uncertainty: 0.4, strength: 0.4 },
        holes: [
          { type: "assumption_gap", severity: "high", source: "judge-b", description: "Key assumption is unresolved." },
        ],
        fatal_flags: [],
      },
      {
        node_id: "node-c",
        claim: { core_claim: "Fatal claim" },
        scores: { impact: 0.7, uncertainty: 0.8, strength: 0.6 },
        holes: [],
        fatal_flags: [
          { type: "unsupported_core", severity: "high", description: "Core claim lacks support." },
        ],
      },
    ],
  });

  assert.deepEqual(issue, {
    kind: "fatal_flag",
    nodeId: "node-c",
    claim: "Fatal claim",
    type: "unsupported_core",
    severity: "high",
    description: "Core claim lacks support.",
  });
});

test("selectStrongestUnresolvedScoringIssue uses scored claim priority as a deterministic tie-break", async () => {
  const { selectStrongestUnresolvedScoringIssue } = await loadHelper();
  const issue = selectStrongestUnresolvedScoringIssue({
    debate_id: "debate-1",
    status: "available",
    node_ids: ["node-a", "node-b"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "Lower priority claim" },
        scores: { impact: 0.4, uncertainty: 0.9, strength: 0.1 },
        holes: [
          { type: "evidence_gap", severity: "high", source: "judge-a", description: "Needs evidence." },
        ],
        fatal_flags: [],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "Higher priority claim" },
        scores: { impact: 0.9, uncertainty: 0.2, strength: 0.8 },
        holes: [
          { type: "scope_gap", severity: "high", source: "judge-b", description: "Scope is unclear." },
        ],
        fatal_flags: [],
      },
    ],
  });

  assert.deepEqual(issue, {
    kind: "hole",
    nodeId: "node-b",
    claim: "Higher priority claim",
    type: "scope_gap",
    severity: "high",
    description: "Scope is unclear.",
    source: "judge-b",
  });
});

test("selectStrongestUnresolvedScoringIssue ranks severity ahead of issue kind and scores", async () => {
  const { selectStrongestUnresolvedScoringIssue } = await loadHelper();
  const issue = selectStrongestUnresolvedScoringIssue({
    debate_id: "debate-1",
    status: "available",
    node_ids: ["node-a", "node-b"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "Flashy but less severe claim" },
        scores: { impact: 1, uncertainty: 1, strength: 0 },
        holes: [],
        fatal_flags: [
          { type: "contradiction", severity: "medium", description: "Medium severity contradiction." },
        ],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "Higher severity claim" },
        scores: { impact: 0.1, uncertainty: 0.1, strength: 1 },
        holes: [
          { type: "evidence_gap", severity: "high", source: "judge-c", description: "High severity evidence gap." },
        ],
        fatal_flags: [],
      },
    ],
  });

  assert.deepEqual(issue, {
    kind: "hole",
    nodeId: "node-b",
    claim: "Higher severity claim",
    type: "evidence_gap",
    severity: "high",
    description: "High severity evidence gap.",
    source: "judge-c",
  });
});

test("selectStrongestUnresolvedScoringIssue uses payload order after equal ranking fields", async () => {
  const { selectStrongestUnresolvedScoringIssue } = await loadHelper();
  const issue = selectStrongestUnresolvedScoringIssue({
    debate_id: "debate-1",
    status: "available",
    node_ids: ["node-a", "node-b"],
    items: [
      {
        node_id: "node-a",
        claim: { core_claim: "First payload claim" },
        scores: { impact: 0.7, uncertainty: 0.5, strength: 0.3 },
        holes: [
          { type: "ignored_blank", severity: "medium", source: "judge-a", description: "   " },
          { type: "scope_gap", severity: "medium", source: "judge-a", description: "First payload unresolved issue." },
        ],
        fatal_flags: [],
      },
      {
        node_id: "node-b",
        claim: { core_claim: "Second payload claim" },
        scores: { impact: 0.7, uncertainty: 0.5, strength: 0.3 },
        holes: [
          { type: "assumption_gap", severity: "medium", source: "judge-b", description: "Second payload unresolved issue." },
        ],
        fatal_flags: [],
      },
    ],
  });

  assert.deepEqual(issue, {
    kind: "hole",
    nodeId: "node-a",
    claim: "First payload claim",
    type: "scope_gap",
    severity: "medium",
    description: "First payload unresolved issue.",
    source: "judge-a",
  });
});

test("recordSuspiciousScoringResponse does not emit events for null response", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = { suspicious(event, payload) { events.push({ event, payload }); } };

  await recordSuspiciousScoringResponse(null, { operation: "load-scoring" }, logger);

  assert.deepEqual(events, []);
});

test("recordSuspiciousScoringResponse does not emit events for unavailable status", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = { suspicious(event, payload) { events.push({ event, payload }); } };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "unavailable",
      node_ids: ["node-a"],
      items: [],
      reason: "No scoring judge outputs are available for this debate.",
    },
    { operation: "load-scoring" },
    logger
  );

  assert.deepEqual(events, []);
});

test("recordSuspiciousScoringResponse does not emit events for unrecognised non-success status", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = { suspicious(event, payload) { events.push({ event, payload }); } };

  await recordSuspiciousScoringResponse(
    { debate_id: "debate-1", status: "error", node_ids: [], items: [] },
    { operation: "load-scoring" },
    logger
  );

  assert.deepEqual(events, []);
});

test("recordSuspiciousScoringResponse emits empty-output event for partial status with no items", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = { suspicious(event, payload) { events.push({ event, payload }); } };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "partial",
      node_ids: ["node-a", "node-b"],
      items: [],
      scored_node_count: 0,
    },
    { operation: "refresh-scoring" },
    logger
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "scoring.empty_output");
  assert.equal(events[0].payload.category, "suspicious");
  assert.equal(events[0].payload.status, "partial");
});

test("recordSuspiciousScoringResponse missing fields payload contains field names not raw response data", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = { suspicious(event, payload) { events.push({ event, payload }); } };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "available",
      node_ids: ["node-a"],
      items: [
        {
          node_id: "node-a",
          claim: { core_claim: "Sensitive claim text that must not leak raw" },
          labels: { strength: "strong", uncertainty: "low", impact: "medium" },
          holes: [],
          fatal_flags: [],
          score_caps: [],
          judge_disagreements: [],
          recommended_investigations: [],
          rationale: { short: "Private rationale.", why_not_higher: ".", why_not_lower: ".", weakest_link: "." },
        },
      ],
      scored_node_count: 1,
      model_metadata: { provider: "codex", model: "model-a", checked_at: "2026-06-26T00:00:00Z" },
      cache: { hit: false },
    },
    { operation: "load-scoring" },
    logger
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "scoring.success_missing_required_fields");
  const payload = events[0].payload;
  assert.ok(Array.isArray(payload.missingFields), "missingFields must be an array of field names");
  assert.ok(payload.missingFields.includes("argumentClaims[0].scores"), "must name the missing field");
  assert.equal("claim" in payload, false, "raw claim text must not appear at top level");
  assert.equal("rationale" in payload, false, "raw rationale must not appear at top level");
  assert.equal("labels" in payload, false, "raw labels must not appear at top level");
});

test("selectStrongestUnresolvedScoringIssue returns null when no real issue is present", async () => {
  const { selectStrongestUnresolvedScoringIssue } = await loadHelper();

  assert.equal(selectStrongestUnresolvedScoringIssue(null), null);
  assert.equal(
    selectStrongestUnresolvedScoringIssue({
      debate_id: "debate-1",
      status: "partial",
      node_ids: ["node-a"],
      items: [
        {
          node_id: "node-a",
          claim: { core_claim: "Claim A" },
          holes: [{ type: "evidence_gap", severity: "high", source: "judge-a", description: "   " }],
          fatal_flags: [],
        },
      ],
      errors: [{ node_id: "node-b", status: "unavailable", reason: "Timed out." }],
    }),
    null
  );
});

test("recordSuspiciousScoringResponse logs successful empty scoring output once", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = {
    suspicious(event, payload) {
      events.push({ event, payload });
    },
  };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "available",
      node_ids: ["node-a"],
      items: [],
      scored_node_count: 0,
      model_metadata: { provider: "codex", model: "model-a", checked_at: "2026-06-25T00:00:00Z" },
      cache: { hit: false },
    },
    { runId: "run-1", requestId: "request-1", operation: "refresh-scoring" },
    logger
  );

  assert.deepEqual(events, [
    {
      event: "scoring.empty_output",
      payload: {
        category: "suspicious",
        source: "scoring-response",
        message: "Successful scoring response contained no scored items.",
        debateId: "debate-1",
        runId: "run-1",
        requestId: "request-1",
        operation: "refresh-scoring",
        status: "available",
        claimCount: 1,
        argumentClaimIds: ["node-a"],
        errorCount: 0,
        scoredClaimCount: 0,
      },
    },
  ]);
});

test("recordSuspiciousScoringResponse logs successful missing artifact chain once", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = {
    async suspicious(event, payload) {
      events.push({ event, payload });
    },
  };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "available",
      node_ids: ["node-a"],
      items: [
        {
          node_id: "node-a",
          claim: { core_claim: "Claim A" },
          scores: { strength: 0.7, uncertainty: 0.2, impact: 0.5 },
          labels: { strength: "strong", uncertainty: "low", impact: "medium" },
          holes: [],
          fatal_flags: [],
          score_caps: [],
          judge_disagreements: [],
          recommended_investigations: [],
          rationale: {
            short: "Short rationale.",
            why_not_higher: "Reason.",
            why_not_lower: "Reason.",
            weakest_link: "None.",
          },
        },
      ],
      scored_node_count: 1,
    },
    { operation: "load-scoring" },
    logger
  );

  assert.deepEqual(events, [
    {
      event: "scoring.missing_artifact_chain",
      payload: {
        category: "suspicious",
        source: "scoring-response",
        message: "Successful scoring response is missing artifact chain metadata.",
        debateId: "debate-1",
        operation: "load-scoring",
        status: "available",
        missingFields: ["modelMetadata", "cache"],
        artifactChainExpectation: "current-scoring-producers-emit-model-metadata-and-cache",
        claimCount: 1,
        argumentClaimIds: ["node-a"],
        errorCount: 0,
        scoredClaimCount: 1,
      },
    },
  ]);
});

test("recordSuspiciousScoringResponse logs success with missing required fields once", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = {
    suspicious(event, payload) {
      events.push({ event, payload });
    },
  };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "available",
      node_ids: ["node-a"],
      items: [
        {
          node_id: "node-a",
          claim: { core_claim: "Claim A" },
          labels: { strength: "strong", uncertainty: "low", impact: "medium" },
          holes: [],
          fatal_flags: [],
          score_caps: [],
          judge_disagreements: [],
          recommended_investigations: [],
          rationale: {
            short: "Short rationale.",
            why_not_higher: "Reason.",
            why_not_lower: "Reason.",
            weakest_link: "None.",
          },
        },
      ],
      scored_node_count: 1,
      model_metadata: { provider: "codex", model: "model-a", checked_at: "2026-06-25T00:00:00Z" },
      cache: { hit: false },
    },
    { operation: "refresh-scoring" },
    logger
  );

  assert.deepEqual(events, [
    {
      event: "scoring.success_missing_required_fields",
      payload: {
        category: "suspicious",
        source: "scoring-response",
        message: "Successful scoring response is missing required fields.",
        debateId: "debate-1",
        operation: "refresh-scoring",
        status: "available",
        missingFields: ["argumentClaims[0].scores"],
        claimCount: 1,
        argumentClaimIds: ["node-a"],
        errorCount: 0,
        scoredClaimCount: 1,
      },
    },
  ]);
});

test("recordSuspiciousScoringResponse does not propagate synchronous logger exceptions", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const throwingLogger = {
    suspicious() { throw new Error("Logger infrastructure failure"); },
  };

  await assert.doesNotReject(() =>
    recordSuspiciousScoringResponse(
      {
        debate_id: "debate-1",
        status: "available",
        node_ids: ["node-a"],
        items: [],
        scored_node_count: 0,
      },
      { operation: "load-scoring" },
      throwingLogger
    )
  );
});

test("recordSuspiciousScoringResponse does not propagate async logger rejections", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const rejectingLogger = {
    async suspicious() { throw new Error("Async logger infrastructure failure"); },
  };

  await assert.doesNotReject(() =>
    recordSuspiciousScoringResponse(
      {
        debate_id: "debate-1",
        status: "available",
        node_ids: ["node-a"],
        items: [],
        scored_node_count: 0,
      },
      { operation: "load-scoring" },
      rejectingLogger
    )
  );
});

test("recordSuspiciousScoringResponse does not log complete normal scoring output", async () => {
  const { recordSuspiciousScoringResponse } = await loadHelper();
  const events = [];
  const logger = {
    suspicious(event, payload) {
      events.push({ event, payload });
    },
  };

  await recordSuspiciousScoringResponse(
    {
      debate_id: "debate-1",
      status: "available",
      node_ids: ["node-a"],
      items: [
        {
          node_id: "node-a",
          claim: { core_claim: "Claim A" },
          scores: { strength: 0.7, uncertainty: 0.2, impact: 0.5 },
          labels: { strength: "strong", uncertainty: "low", impact: "medium" },
          holes: [],
          fatal_flags: [],
          score_caps: [],
          judge_disagreements: [],
          recommended_investigations: [],
          rationale: {
            short: "Short rationale.",
            why_not_higher: "Reason.",
            why_not_lower: "Reason.",
            weakest_link: "None.",
          },
        },
      ],
      scored_node_count: 1,
      model_metadata: { provider: "codex", model: "model-a", checked_at: "2026-06-25T00:00:00Z" },
      cache: { hit: false },
    },
    { operation: "refresh-scoring" },
    logger
  );

  assert.deepEqual(events, []);
});
