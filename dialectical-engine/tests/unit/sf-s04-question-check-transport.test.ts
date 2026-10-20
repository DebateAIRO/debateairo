import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertFramedPrompt } from "@debateai/providers";
import type { SupportModelTarget } from "../../apps/api/src/support/model.js";

const adapter = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../apps/api/src/support/model.js", () => ({ createSupportModelAdapter: adapter.create }));
import { QUESTION_CHECK_MODEL, buildQuestionCheckPacket, createQuestionCheckTransport, questionCheckTarget } from "../../apps/api/src/question-check/transport.js";

const target: SupportModelTarget = {
  providerRef: "test-anthropic", baseUrl: "https://unit.example/v1/messages",
  model: "claude-haiku-5-5", adapterKind: "anthropic-messages-http",
  authorizationHeader: "synthetic-only"
};
const successFetch = vi.fn(async () => new Response(JSON.stringify({
  text: "answer", usage: { input_tokens: 3, output_tokens: 4 }
}), { status: 200 })) as unknown as typeof fetch;

beforeEach(() => {
  adapter.create.mockReset();
  vi.mocked(successFetch).mockClear();
  adapter.create.mockImplementation((actualTarget: SupportModelTarget, options: {
    timeoutMs: number; fetchImplementation: typeof fetch
  }) => ({
    complete: async ({ language, signal }: { language: string; signal: AbortSignal }) => {
      const response = await options.fetchImplementation(actualTarget.baseUrl, {
        method: "POST", body: JSON.stringify({ model: actualTarget.model, language }), signal
      });
      if (!response.ok) throw new Error("HTTP_FAILED");
      return response.json();
    }
  }));
});

function port(fetchImplementation?: typeof fetch) {
  return createQuestionCheckTransport(target, {
    readAuthorizationHeader: () => "synthetic-only", deadlineMs: 15000,
    ...(fetchImplementation === undefined ? {} : { fetchImplementation })
  });
}
function packet() { return buildQuestionCheckPacket("q").packet; }

describe("S04 question-check transport", () => {
  it("sends the question line as its only material, byte for byte", () => {
    const questionLine = "  why\n😕  ";
    const { packet } = buildQuestionCheckPacket(questionLine);
    const fields = JSON.parse(packet.messages[1]!.content.split("\n")[1]!).fields;
    expect(fields).toEqual([{ name: "question", content: questionLine }]);
    expect(Buffer.compare(Buffer.from(fields[0].content), Buffer.from(questionLine))).toBe(0);
  });
  it("uses the prompt door and a fresh boundary marker per call", () => {
    const first = buildQuestionCheckPacket("same");
    const second = buildQuestionCheckPacket("same");
    expect(() => assertFramedPrompt(first.packet)).not.toThrow();
    expect(() => assertFramedPrompt(second.packet)).not.toThrow();
    expect(first.expectedCall).toMatch(/^[0-9a-f]{32}$/u);
    expect(second.expectedCall).not.toBe(first.expectedCall);
  });
  it("posts the exact model to the configured URL once", async () => {
    const fetcher = vi.fn(successFetch) as unknown as typeof fetch;
    await port(fetcher).complete({ packet: packet(), signal: new AbortController().signal });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(target.baseUrl, expect.any(Object));
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]![1]!.body)).model).toBe(QUESTION_CHECK_MODEL);
  });
  it("uses language en regardless of the question language", async () => {
    const reportDiagnostic = vi.fn();
    const transport = createQuestionCheckTransport(target, {
      readAuthorizationHeader: () => "synthetic-only",
      deadlineMs: 15000,
      fetchImplementation: successFetch,
      reportDiagnostic
    });
    await transport.complete({ packet: buildQuestionCheckPacket("¿por qué?").packet, signal: new AbortController().signal });
    expect(JSON.parse(String(vi.mocked(successFetch).mock.calls[0]?.[1]?.body)).language).toBe("en");
    expect(adapter.create.mock.calls[0]?.[1].timeoutMs).toBe(25000);
    adapter.create.mock.calls[0]?.[1].reportDiagnostic({ code: "SENTINEL" });
    expect(reportDiagnostic).toHaveBeenCalledWith({ code: "QUESTION_CHECK:SENTINEL" });
  });
  it("refuses a target naming another model", () => {
    expect(questionCheckTarget({ ...target, model: "claude-sonnet-5" })).toBeNull();
    expect(questionCheckTarget(target)).toEqual(target);
  });
  it("maps prompt door refusal", async () => {
    adapter.create.mockImplementation(() => ({ complete: async () => { throw Object.assign(new Error("door"), { code: "PROMPT_BAD" }); } }));
    await expect(port().complete({ packet: packet(), signal: new AbortController().signal })).rejects.toMatchObject({ code: "QUESTION_CHECK_DOOR_REFUSED" });
  });
  it("maps HTTP 500", async () => {
    const fetcher = vi.fn(async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;
    await expect(port(fetcher).complete({ packet: packet(), signal: new AbortController().signal })).rejects.toMatchObject({ code: "QUESTION_CHECK_HTTP_STATUS" });
  });
  it("maps a thrown fetch", async () => {
    const fetcher = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(port(fetcher).complete({ packet: packet(), signal: new AbortController().signal })).rejects.toMatchObject({ code: "QUESTION_CHECK_TRANSPORT_FAILED" });
  });
  it("maps an aborted signal", async () => {
    const abort = new AbortController(); abort.abort();
    const fetcher = vi.fn(async () => { throw new Error("aborted"); }) as unknown as typeof fetch;
    await expect(port(fetcher).complete({ packet: packet(), signal: abort.signal })).rejects.toMatchObject({ code: "QUESTION_CHECK_DEADLINE" });
  });
  it("returns whole usage token counts", async () => {
    await expect(port(successFetch).complete({ packet: packet(), signal: new AbortController().signal })).resolves.toEqual({
      text: "answer", usage: { inputTokens: 3, outputTokens: 4 }
    });
  });
});
