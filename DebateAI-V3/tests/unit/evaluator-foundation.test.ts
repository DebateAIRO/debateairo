import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import {
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  assertEvaluatorProviderIsolation,
  createBlindEvaluationSample,
  probeEvaluatorVllmCatalog,
  readEvaluatorDispatchBinding,
  readEvaluatorProviderFamily
} from "../../packages/evaluator/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { EVALUATOR_TASK_FAMILIES } from "../../apps/evaluator-worker/src/index.js";

function queryPool(rows: readonly unknown[]): Pool {
  return {
    query: async () => ({ rows, rowCount: rows.length })
  } as unknown as Pool;
}

const familyValue = {
  kind: "EVALUATOR_PROVIDER_FAMILY",
  providerRef: "provider:evaluator-vllm",
  adapterKind: "vllm-openai-compatible-http",
  maker: "maker:evaluator-local-vllm",
  chatBaseUrl: "http://vllm:8000/v1",
  modelsPath: "/models",
  deadlineMs: 250,
  source: "LOCAL_CONTAINER_NO_AUTH"
} as const;

describe("Evaluator foundation", () => {
  it("scaffolds the evaluator worker as a separate composition root", () => {
    expect(EVALUATOR_TASK_FAMILIES).toEqual([
      "evaluator.tag-question",
      "evaluator.reconcile-tags",
      "evaluator.harvest-terminal-runs",
      "evaluator.grade-judge-output",
      "evaluator.derive-profiles",
      "evaluator.refresh-consumer-output"
    ]);
  });

  it("reads the pinned purpose-specific local family and refuses panel collisions", async () => {
    const family = await readEvaluatorProviderFamily(queryPool([{
      value_json: familyValue,
      source_ref: "register:test:evaluator-family"
    }]), 7);

    expect(family.value.providerRef).toBe(EVALUATOR_PROVIDER_REF);
    expect(family.value.maker).toBe(EVALUATOR_MAKER);
    expect(family.value).not.toHaveProperty("authorizationHeader");
    expect(() => assertEvaluatorProviderIsolation(family, {
      configuredProviders: [{ providerRef: "provider:claude", maker: "maker:claude" }]
    })).not.toThrow();
    expect(() => assertEvaluatorProviderIsolation(family, {
      configuredProviders: [{ providerRef: EVALUATOR_PROVIDER_REF, maker: "maker:claude" }]
    })).toThrowError(expect.objectContaining({ code: "EVALUATOR_PROVIDER_PANEL_COLLISION" }));
    expect(() => assertEvaluatorProviderIsolation(family, {
      configuredProviders: [{ providerRef: "provider:claude", maker: EVALUATOR_MAKER }]
    })).toThrowError(expect.objectContaining({ code: "EVALUATOR_MAKER_PANEL_COLLISION" }));
  });

  it("defaults dispatch influence to UNBOUND when the row is absent or malformed", async () => {
    await expect(readEvaluatorDispatchBinding(queryPool([]), 1)).resolves.toMatchObject({
      state: "UNBOUND",
      reason: "ROW_ABSENT"
    });
    await expect(readEvaluatorDispatchBinding(queryPool([{
      value_json: { kind: "EVALUATOR_DISPATCH_BINDING", state: "unexpected" },
      source_ref: "register:test:invalid"
    }]), 1)).resolves.toMatchObject({ state: "UNBOUND", reason: "ROW_INVALID" });
  });

  it("enumerates vLLM models without authorization and fails closed on absence", async () => {
    let authorization: string | undefined;
    const server = createServer((request, response) => {
      authorization = request.headers.authorization;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: "list",
        data: [{ id: "local/evaluator-model", object: "model", owned_by: "local" }]
      }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const family = {
      rowKey: "evaluatorProviderFamily" as const,
      registerVersion: 1,
      sourceRef: "register:test",
      value: { ...familyValue, chatBaseUrl: `http://127.0.0.1:${address.port}/v1` }
    };
    try {
      await expect(probeEvaluatorVllmCatalog(family)).resolves.toMatchObject({
        state: "AVAILABLE",
        models: [{ modelId: "local/evaluator-model" }]
      });
      expect(authorization).toBeUndefined();
    } finally {
      server.close();
      await once(server, "close");
    }
    await expect(probeEvaluatorVllmCatalog({
      ...family,
      value: { ...family.value, chatBaseUrl: `http://127.0.0.1:${address.port}/v1`, deadlineMs: 25 }
    })).resolves.toMatchObject({ state: "UNAVAILABLE", models: [] });
  });

  it("constructs an allowlist-only blind DTO", () => {
    const sample = createBlindEvaluationSample({
      sampleId: "opaque:sample-1",
      questionExcerpt: "Is this reasoning sound?",
      taskExcerpt: "Grade the stated reasons.",
      grade: "agree",
      reasons: ["The conclusion follows."],
      maker: "maker:must-not-leak",
      provider: "provider:must-not-leak",
      modelId: "model:must-not-leak",
      rawArtifactRef: "artifact:must-not-leak"
    });
    expect(sample).toEqual({
      sampleId: "opaque:sample-1",
      questionExcerpt: "Is this reasoning sound?",
      taskExcerpt: "Grade the stated reasons.",
      grade: "agree",
      reasons: ["The conclusion follows."]
    });
    expect(JSON.stringify(sample)).not.toMatch(/maker|provider|model|artifact/i);
  });
});

describe("FR-0.6 AC5 panel-isolation differential", () => {
  const ask: AskRequest = {
    question_line: "Does evaluator configuration alter the debate panel?",
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "test:asker",
    composition_budget_tier: "medium",
    depth_params: { depth: 2 },
    decision_owner: "asker:test",
    action_owner: "asker:test",
    decision_scope: "test",
    caller_scope: "ASKER",
    as_of: "2026-08-14T00:00:00.000Z",
    steering_presets: [],
    steering_annotations: []
  };
  const panel = fixtureDiscoveredPanel(2);
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "test",
    settlementWatchHandle: "test",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 2),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  };
  const family = {
    rowKey: "evaluatorProviderFamily" as const,
    registerVersion: 1,
    sourceRef: "register:test",
    value: familyValue
  };

  it("keeps membership, agent_count input, and structural envelope identical healthy versus absent", async () => {
    const healthyProbe = await probeEvaluatorVllmCatalog(family, async () => new Response(JSON.stringify({
      data: [{ id: "local/evaluator-model", object: "model", owned_by: "local" }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const healthy = await evaluateAskAdmission(settings, ask);
    const absentProbe = await probeEvaluatorVllmCatalog(family, async () => {
      throw new TypeError("container absent");
    });
    const absent = await evaluateAskAdmission(settings, ask);
    expect(healthyProbe.state).toBe("AVAILABLE");
    expect(absentProbe.state).toBe("UNAVAILABLE");
    expect(healthy.discoveredPanel).toEqual(absent.discoveredPanel);
    expect(healthy.discoveredPanel).toHaveLength(absent.discoveredPanel.length);
    expect(healthy.envelopeBasis).toEqual(absent.envelopeBasis);
    expect(healthy.discoveredPanel.some((member) =>
      member.provider_ref === EVALUATOR_PROVIDER_REF || member.maker === EVALUATOR_MAKER
    )).toBe(false);
  });
});
