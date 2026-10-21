import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { questionCheckPolicyFromValue } from "../../packages/register/src/question-check-policy.js";
import { parseQuestionLanguagePolicy, questionLanguagePolicyStartValues } from "../../packages/register/src/question-language-policy.js";
import * as route from "../../apps/ui/app/api/[...path]/route.js";

const original = {
  api: process.env.DIALECTICAL_API_BASE,
  preview: process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON
};
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (original.api === undefined) delete process.env.DIALECTICAL_API_BASE; else process.env.DIALECTICAL_API_BASE = original.api;
  if (original.preview === undefined) delete process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON; else process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON = original.preview;
});

describe("ordinary ask proxy ceiling", () => {
  it("exceeds both lawful check maxima by at least 20 seconds", () => {
    expect(questionCheckPolicyFromValue({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 15_000 }, "test").deadlineMs).toBe(15_000);
    expect(() => questionCheckPolicyFromValue({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 15_001 }, "test")).toThrow();
    const start = questionLanguagePolicyStartValues();
    const withTimeout = (timeoutMs: number) => ({ ...start, fastCheck: { ...start.fastCheck!, timeoutMs } });
    expect(parseQuestionLanguagePolicy(withTimeout(15_000)).fastCheck?.timeoutMs).toBe(15_000);
    expect(() => parseQuestionLanguagePolicy(withTimeout(15_001))).toThrow();
    const source = readFileSync(join(process.cwd(), "apps/ui/app/api/[...path]/route.ts"), "utf8");
    const constant = source.match(/const ASK_UPSTREAM_TIMEOUT_MS = ([\d_]+);/u);
    expect(constant, "a separate ask ceiling is declared").not.toBeNull();
    expect(Number(constant![1]!.replaceAll("_", ""))).toBeGreaterThanOrEqual(15_000 + 15_000 + 20_000);
  });

  it("uses 55 seconds for ordinary asks without changing other timeout classes", async () => {
    process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790";
    process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON = '["zai-org/GLM-5.3-Flash"]';
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    for (const { method, path, origin, want } of [
      { method: "POST", path: ["v1", "asks"], origin: "https://other.test", want: 55_000 },
      { method: "POST", path: ["v1", "asks"], origin: "https://v3-preview.dezbatere.ro", want: 1_260_000 },
      { method: "POST", path: ["v1", "runs", "synthetic", "publish"], origin: "https://other.test", want: 145_000 },
      { method: "POST", path: ["v1", "answers"], origin: "https://other.test", want: 30_000 }
    ]) {
      timeout.mockClear();
      const request = new Request(`${origin}/api/${path.join("/")}`, { method, headers: { origin }, body: "{}" });
      const response = await route.POST(request, { params: Promise.resolve({ path }) });
      expect(response.status).toBe(200);
      expect(timeout).toHaveBeenCalledWith(want);
    }
  });
});
