import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-scoring-response-spec-test");

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/scoring/scoringResponseSpecification.ts",
    "lib/observability/suspiciousScoring.ts",
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

async function loadHelpers() {
  compileHelper();
  const cacheBust = Date.now();
  const specificationUrl = pathToFileURL(
    join(outDir, "lib", "scoring", "scoringResponseSpecification.js")
  ).href;
  const suspiciousUrl = pathToFileURL(
    join(outDir, "lib", "observability", "suspiciousScoring.js")
  ).href;
  return {
    specification: await import(`${specificationUrl}?cacheBust=${cacheBust}`),
    suspicious: await import(`${suspiciousUrl}?cacheBust=${cacheBust}`),
  };
}

function validScoringResponse(overrides = {}) {
  return {
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
    ...overrides,
  };
}

test("scoring response specification flags empty successful output", async () => {
  const { specification } = await loadHelpers();

  const findings = specification.inspectScoringResponse(
    validScoringResponse({
      items: [],
      scored_node_count: 0,
    })
  );

  assert.deepEqual(findings.map((finding) => finding.kind), ["empty_output"]);
});

test("scoring response specification flags missing required fields", async () => {
  const { specification } = await loadHelpers();

  const response = validScoringResponse();
  delete response.items[0].scores;

  const findings = specification.inspectScoringResponse(response);

  assert.deepEqual(findings, [
    {
      kind: "missing_required_fields",
      missingFields: ["items[0].scores"],
    },
  ]);
});

test("scoring response specification flags missing artifact-chain metadata", async () => {
  const { specification } = await loadHelpers();

  const response = validScoringResponse();
  delete response.model_metadata;
  delete response.cache;

  const findings = specification.inspectScoringResponse(response);

  assert.deepEqual(findings, [
    {
      kind: "missing_artifact_chain",
      missingFields: ["model_metadata", "cache"],
      artifactChainExpectation: "current-scoring-producers-emit-model-metadata-and-cache",
    },
  ]);
});

test("scoring response specification does not flag normal valid output", async () => {
  const { specification } = await loadHelpers();

  assert.deepEqual(specification.inspectScoringResponse(validScoringResponse()), []);
});

test("observability serializes suspicious scoring specification findings", async () => {
  const { suspicious } = await loadHelpers();

  const events = suspicious.suspiciousScoringEvents(
    validScoringResponse({
      items: [],
      scored_node_count: 0,
    }),
    { operation: "refresh-scoring" }
  );

  assert.deepEqual(events, [
    {
      event: "scoring.empty_output",
      payload: {
        source: "scoring-response",
        message: "Successful scoring response contained no scored items.",
        debateId: "debate-1",
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

test("observability serializes missing required fields with DDD diagnostic paths", async () => {
  const { suspicious } = await loadHelpers();

  const response = validScoringResponse();
  delete response.items[0].node_id;
  delete response.items[0].scores;

  const [event] = suspicious.suspiciousScoringEvents(response, { operation: "refresh-scoring" });

  assert.ok(event);
  assert.equal(event.event, "scoring.success_missing_required_fields");
  assert.deepEqual(event.payload.missingFields, [
    "argumentClaims[0].argumentClaimId",
    "argumentClaims[0].scores",
  ]);
  assert.equal(event.payload.missingFields.includes("items[0].node_id"), false);
  assert.equal(event.payload.missingFields.includes("node_id"), false);
  assert.equal(event.payload.missingFields.includes("node_ids"), false);
});

test("observability serializes top-level missing required fields with DDD diagnostic paths", async () => {
  const { suspicious } = await loadHelpers();

  const response = validScoringResponse();
  delete response.node_ids;

  const [event] = suspicious.suspiciousScoringEvents(response, { operation: "refresh-scoring" });

  assert.ok(event);
  assert.equal(event.event, "scoring.success_missing_required_fields");
  assert.deepEqual(event.payload.missingFields, ["argumentClaimIds"]);
  assert.equal(event.payload.missingFields.includes("node_ids"), false);
});

test("observability payloads do not expose legacy node keys at the top level", async () => {
  const { suspicious } = await loadHelpers();

  const [event] = suspicious.suspiciousScoringEvents(
    validScoringResponse({
      items: [],
      scored_node_count: 0,
    })
  );

  assert.ok(event);
  assert.equal(Object.hasOwn(event.payload, "node_id"), false);
  assert.equal(Object.hasOwn(event.payload, "node_ids"), false);
  assert.equal(Object.hasOwn(event.payload, "nodeIdCount"), false);
  assert.equal(Object.hasOwn(event.payload, "scoredNodeCount"), false);
  assert.equal(Object.hasOwn(event.payload, "items"), false);
});
