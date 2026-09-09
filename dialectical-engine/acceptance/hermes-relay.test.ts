import { lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach,describe,expect,it } from "vitest";
import {
  HERMES_GLM_MODEL,
  HERMES_SUPPORT_PROVIDER_REF,
  startHermesSupportRelay,
  type HermesSupportRelayHandle
} from "./hermes-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-hermes-cli.mjs",import.meta.url));
const handles: HermesSupportRelayHandle[] = [];

async function start(): Promise<HermesSupportRelayHandle> {
  const handle = await startHermesSupportRelay({
    port: 0,
    timeoutMs: 1_000,
    testOnlyCommand: { binary: process.execPath,prefixArguments: [fakeCli] },
    testOnlyGlmApiKey: "zai-test-only"
  });
  handles.push(handle);
  return handle;
}

afterEach(async () => {
  delete process.env.FAKE_HERMES_FAIL;
  delete process.env.FAKE_HERMES_BAD_HANDSHAKE;
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe("Support-only Hermes GLM relay",() => {
  it("pins direct Z.AI GLM 5.3 Flash with no tools, user config, rules, or persistent home",async () => {
    process.env.DATABASE_URL = "postgresql://must-not-reach-hermes";
    process.env.ANTHROPIC_API_KEY = "must-not-reach-hermes";
    const relay = await start();
    const response = await fetch(`${relay.baseUrl}/v1/chat/completions`,{
      method: "POST",
      headers: { "content-type": "application/json",authorization: relay.authorizationHeader },
      body: JSON.stringify({ model: HERMES_GLM_MODEL,messages: [{ role: "user",content: "Help me" }] })
    });
    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string;
      maker: string;
      choices: readonly { message: { content: string } }[];
    };
    expect(completion.model).toBe(HERMES_GLM_MODEL);
    expect(completion.maker).toBe("Z.AI");
    const observed = JSON.parse(completion.choices[0]!.message.content) as {
      prompt: string;
      argumentList: readonly string[];
      environment: Readonly<Record<string,string>>;
    };
    expect(observed.argumentList).toEqual([
      "--provider","zai",
      "--model","glm-5.3-flash",
      "--toolsets","context_engine",
      "--ignore-user-config",
      "--ignore-rules",
      "-z",observed.prompt
    ]);
    expect(JSON.parse(observed.prompt)).toEqual({
      format: "debateai.relay-messages.v1",
      messages: [{ role: "user",content: "Help me" }]
    });
    expect(observed.environment.GLM_API_KEY).toBe("zai-test-only");
    expect(observed.environment.OPENROUTER_API_KEY).toBeUndefined();
    expect(observed.environment.HERMES_HOME).toMatch(/[/\\]relay-z-ai-[^/\\]+$/u);
    expect(observed.environment.HOME).toBe(observed.environment.HERMES_HOME);
    expect(observed.environment.PWD).toBe(observed.environment.HERMES_HOME);
    expect(observed.environment.DATABASE_URL).toBeUndefined();
    expect(observed.environment.ANTHROPIC_API_KEY).toBeUndefined();
    await expect(lstat(observed.environment.HERMES_HOME!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exposes one support-only identity without joining the debate provider roster",async () => {
    const relay = await start();
    expect(relay).toMatchObject({
      providerRef: HERMES_SUPPORT_PROVIDER_REF,
      model: HERMES_GLM_MODEL,
      maker: "Z.AI"
    });
    expect(JSON.parse(relay.targetJson)).toEqual({
      provider_ref: HERMES_SUPPORT_PROVIDER_REF,
      base_url: `${relay.baseUrl}/v1`,
      model: HERMES_GLM_MODEL,
      authorization_header: relay.authorizationHeader
    });
  });

  it("fails closed when Hermes fails or does not answer the exact handshake",async () => {
    process.env.FAKE_HERMES_FAIL = "1";
    await expect(start()).rejects.toThrow("HERMES_CLI_FAILED");
    delete process.env.FAKE_HERMES_FAIL;
    process.env.FAKE_HERMES_BAD_HANDSHAKE = "1";
    await expect(start()).rejects.toThrow("HERMES_CLI_HANDSHAKE_INVALID");
  });
});
