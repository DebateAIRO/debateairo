// tests/support/lg-a-harness.ts
/**
 * LG-A test support: the preview's own DeepInfra wire for GLM (the guarded fetch and its gate ports, as
 * tests/unit/patch-follow-up-gateway.test.ts builds it), and a scripted gateway standing in for the structure-repair
 * model's (it classifies the scripted reply with the request's own classifier, as the real gateway does).
 */
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, OpenAICompatibleProviderGateway, PreviewVendorRefusedUnbilled, ProviderContentUnacceptedError,
  createPreviewGuardedFetch, parsePreviewProviderTestConfig, previewTargetGatewayControls, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type ProviderCallRequest, type ProviderGateway, type ProviderLedgerInput, type RawArtifactInput
} from "@debateai/providers";

export const GLM = "zai-org/GLM-5.3-Flash";
export const HAIKU = "claude-haiku-5-5";
export const HAIKU_REF = "preview:claude-haiku-5-5";
export const STOP = Object.freeze({ finishReason: "stop" });
export const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-lg-a-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, HAIKU]
}))!;

export type HarnessStep = { content: string } | { refuse: true };

export function previewGlmHarness(script: HarnessStep[]) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    const next = script.shift();
    if (next === undefined) return { status: 599, body: JSON.stringify({ error: "script_exhausted" }) };
    if ("refuse" in next) throw new PreviewVendorRefusedUnbilled();
    return { status: 200, body: JSON.stringify({ id: `fixture-${String(executions.length)}`, model: GLM,
      choices: [{ message: { content: next.content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: "https://api.deepinfra.com/v1/openai", model: GLM, maker: "Z.AI",
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    supportsJsonObjectResponse: true,
    ...previewTargetGatewayControls(CONFIG, { model: GLM })
  });
  const gateway = withPreviewProviderCallPolicy(native, CONFIG, { model: GLM }, { sleep: async () => undefined });
  return { gateway, executions, artifacts, ledger };
}

/** The repair model's gateway, scripted: the request's own classifier decides, as the real gateway's does. */
export function scriptedRepairGateway(reply: string | Error) {
  const requests: ProviderCallRequest[] = [];
  const gateway: ProviderGateway = { async call(request) {
    requests.push(request);
    if (reply instanceof Error) throw reply;
    const classified = request.classifyContent!(reply, STOP);
    if (classified.parseStatus !== "PARSED") {
      throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:repair", "ledger:repair");
    }
    return { rawArtifactRef: "artifact:repair", ledgerEntryRef: "ledger:repair", content: reply,
      provider: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, model: HAIKU, maker: "Anthropic", modelVersion: HAIKU };
  } };
  return { gateway, requests };
}
