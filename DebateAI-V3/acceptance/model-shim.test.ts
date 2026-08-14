import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodexCompletion, startModelShim, type ModelShimHandle } from "./model-shim.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-codex-cli.mjs", import.meta.url));
const fakeSessionsRoot = fileURLToPath(new URL("./test-fixtures/codex-sessions", import.meta.url));
const handles: ModelShimHandle[] = [];

async function start(timeoutMs = 1_000): Promise<ModelShimHandle> {
  const handle = await startModelShim({
    port: 0,
    timeoutMs,
    testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] },
    testOnlySessionsRoot: fakeSessionsRoot
  });
  handles.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe("ACC-01 model shim", () => {
  it("replays the real Codex JSONL shape and resolves lineage from its persisted turn context", async () => {
    const completion = await parseCodexCompletion([
      JSON.stringify({ type: "thread.started", thread_id: "01a000e7-3ea0-7f91-b166-7104741ef333" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: "OK" } }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 15490, cached_input_tokens: 0, output_tokens: 5 }
      })
    ].join("\n"), fakeSessionsRoot);

    expect(completion).toEqual({ content: "OK", model: "gpt-5.6-sol" });
  });

  it("maps an OpenAI request to codex exec, closes stdin, strips the prompt echo, and reports true lineage", async () => {
    const shim = await start();
    const response = await fetch(`${shim.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ignored-by-shim",
        messages: [
          { role: "system", content: "Return strict JSON." },
          { role: "user", content: "Assess this claim." }
        ]
      })
    });

    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string;
      maker: string;
      choices: readonly { message: { content: string } }[];
    };
    expect(completion).toMatchObject({ model: "gpt-5.6-sol", maker: "OpenAI" });
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      prompt: string;
      arguments: readonly string[];
    };
    expect(relayed.arguments.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(relayed.arguments.some((argument) => argument.startsWith("model="))).toBe(false);
    expect(relayed.prompt).toContain("[system]\nReturn strict JSON.");
    expect(relayed.prompt).toContain("[user]\nAssess this claim.");
    expect(completion.choices[0]!.message.content).not.toContain("Return strict JSON.\n[user]");
  });

  it("propagates a nonzero CLI exit as an HTTP 5xx without fabricating choices", async () => {
    const shim = await start();
    const response = await fetch(`${shim.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-sol", messages: [{ role: "user", content: "FAIL_CLI" }] })
    });

    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ error: "CODEX_CLI_FAILED" });
    expect(body).not.toHaveProperty("choices");
  });

  it("propagates a CLI deadline as HTTP 504 without fallback text", async () => {
    const shim = await start(100);
    const response = await fetch(`${shim.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-sol", messages: [{ role: "user", content: "TIMEOUT_CLI" }] })
    });

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "CODEX_CLI_TIMEOUT" });
  });
});
