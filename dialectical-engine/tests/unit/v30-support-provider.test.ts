import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { PromptPacket } from "@debateai/providers";
import { readCustodyAuthorizationHeader } from "../../packages/crypto/src/index.js";
import {
  ApiVendorAdapter,
  RelayAdapter,
  SUPPORT_HERMES_MODEL,
  SUPPORT_HERMES_PROVIDER_REF,
  SUPPORT_MODEL_STARTUP_REFUSAL_CODES,
  createSupportModelAdapter,
  parseSupportModelTargetJson
} from "../../apps/api/src/support/model.js";
import {
  SUPPORT_ANSWER_CONTRACT_ID,
  SUPPORT_VISITOR_MESSAGE_FIELD,
  buildSupportAnswerPrompt
} from "../../apps/api/src/support/prompt.js";
import { framedField, readFramedMaterial, wirePacket } from "../support/framed-packet.js";

/**
 * V-30, ruled 2026-09-22 (task 12). The support chat reaches its model by
 * CONFIGURATION, on the same two-mode decision the debate path takes (V-9(c),
 * task 10) — never on a second copy of it:
 *
 * - HOSTED: an `https:` vendor API with a custody-file credential. A relay
 *   target refuses at start-up with the SAME typed provider codes the debate
 *   path uses, "exactly as for debates" (V-30(1)).
 * - LOCAL: today's relay path, unchanged — the relays are the local deployment,
 *   a supported product path (V-9(c)) — plus the local user's own `https:` API
 *   key if they have one.
 *
 * The table below is mode x target kind, and every row is a case.
 */

const HOSTED = Object.freeze({ mode: "hosted", nodeEnv: "production" } as const);
const LOCAL = Object.freeze({ mode: "local", nodeEnv: undefined } as const);
const LOCAL_PRODUCTION = Object.freeze({ mode: "local", nodeEnv: "production" } as const);

/** Never a real credential: no key of any vendor exists on this machine. */
const VENDOR_CREDENTIAL = "Bearer t12-fixture-token-0123456789";
const RELAY_CREDENTIAL = "Bearer support-only";

const RELAY_TARGET = JSON.stringify({
  provider_ref: SUPPORT_HERMES_PROVIDER_REF,
  base_url: "http://127.0.0.1:8794/v1",
  model: SUPPORT_HERMES_MODEL,
  authorization_header: RELAY_CREDENTIAL
});

function vendorTarget(credential: Readonly<Record<string, string>>, overrides = {}): string {
  return JSON.stringify({
    provider_ref: "vendor:acme",
    base_url: "https://api.acme.example/v1",
    model: "acme-large",
    ...credential,
    ...overrides
  });
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A 0600 file inside a 0700 directory — the custody shape §11 documents. */
function credentialFile(contents: string, mode = 0o600): string {
  const root = mkdtempSync(join(tmpdir(), "t12-custody-"));
  roots.push(root);
  chmodSync(root, 0o700);
  const path = join(root, "acme.header");
  writeFileSync(path, contents);
  chmodSync(path, mode);
  return path;
}

function recordingFetch(body: unknown): Readonly<{
  calls: { url: string; init: RequestInit }[];
  implementation: typeof fetch;
}> {
  const calls: { url: string; init: RequestInit }[] = [];
  const implementation = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return { calls, implementation };
}

const ANSWER = Object.freeze({
  choices: [{ message: { content: "the answer" }, finish_reason: "stop" }]
});

/**
 * FW-B / B-I1: the support transport takes ONE framed packet and runs the door
 * on it, so every case here builds its prompt with the shipped support builder.
 * A fresh packet per call, because the fence and the canary are minted per call.
 */
function ask(): Readonly<{ packet: PromptPacket; language: "en" }> {
  return {
    packet: buildSupportAnswerPrompt({ instruction: "bounded", visitorMessage: "help" }).packet,
    language: "en"
  };
}

describe("V-30 hosted: the support chat reaches a paid API and refuses a relay", () => {
  it("refuses today's loopback relay target with a typed provider code", () => {
    expect(() => parseSupportModelTargetJson(RELAY_TARGET, HOSTED))
      .toThrowError(new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${SUPPORT_HERMES_PROVIDER_REF}`));
  });

  it("refuses a TLS relay that merely names this machine", () => {
    for (const host of ["localhost", "127.0.0.2", "[::1]", "relay.localhost"]) {
      expect(() => parseSupportModelTargetJson(vendorTarget(
        { authorization_file: "/etc/debateai/api/providers/acme.header" },
        { base_url: `https://${host}:8794/v1` }
      ), HOSTED)).toThrowError(new TypeError("PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:acme"));
    }
  });

  it("refuses a credential written into the environment instead of a file", () => {
    expect(() => parseSupportModelTargetJson(
      vendorTarget({ authorization_header: VENDOR_CREDENTIAL }), HOSTED
    )).toThrowError(new TypeError("PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:acme"));
  });

  it("accepts an https API target that names a credential FILE", () => {
    const target = parseSupportModelTargetJson(
      vendorTarget({ authorization_file: "/etc/debateai/api/providers/acme.header" }), HOSTED
    );
    expect(target).toEqual({
      providerRef: "vendor:acme",
      baseUrl: "https://api.acme.example/v1",
      model: "acme-large",
      authorizationFile: "/etc/debateai/api/providers/acme.header"
    });
    expect(target.authorizationHeader).toBeUndefined();
  });

  it("calls the vendor with the header the custody file holds, and carries its usage", async () => {
    const path = credentialFile(`${VENDOR_CREDENTIAL}\n`);
    const target = parseSupportModelTargetJson(
      vendorTarget({ authorization_file: path }), HOSTED
    );
    const fetchRecord = recordingFetch({
      ...ANSWER,
      usage: { prompt_tokens: 120, completion_tokens: 42, x_cost_usd: 0.0031 }
    });
    const completion = await createSupportModelAdapter(target, {
      readAuthorizationHeader: readCustodyAuthorizationHeader,
      fetchImplementation: fetchRecord.implementation
    }).complete(ask());
    expect(completion.text).toBe("the answer");
    // The existing support accounting (`reserveModelCall`, the `input_tokens` /
    // `output_tokens` / `cost_usd` columns of migration 0054) reads exactly this
    // shape, so a vendor's reported usage keeps reaching it.
    expect(completion.usage).toEqual({ input_tokens: 120, output_tokens: 42, cost_usd: 0.0031 });
    expect(fetchRecord.calls).toHaveLength(1);
    expect(fetchRecord.calls[0]?.url).toBe("https://api.acme.example/v1/chat/completions");
    expect((fetchRecord.calls[0]?.init.headers as Record<string, string>).authorization)
      .toBe(VENDOR_CREDENTIAL);
  });

  /**
   * Review finding 1. The vendors V is most likely to buy first put their
   * OpenAI-compatible endpoint UNDER a path prefix: `openrouter.ai/api/v1`,
   * `api.groq.com/openai/v1`, `api.together.xyz/v1`. The parser and the kit both
   * say "path ending in /v1"; only the adapter said "path IS /v1", so those
   * targets passed every rule and then died at module load under the generic
   * not-ratified code. That is the go-live item V-30 exists to unblock.
   */
  it.each([
    ["https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/chat/completions"],
    ["https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1/chat/completions"],
    ["https://api.together.xyz/v1", "https://api.together.xyz/v1/chat/completions"]
  ])("reaches a vendor whose endpoint sits under a path prefix (%s)", async (baseUrl, posted) => {
    const path = credentialFile(VENDOR_CREDENTIAL);
    const target = parseSupportModelTargetJson(
      vendorTarget({ authorization_file: path }, { base_url: baseUrl }), HOSTED
    );
    expect(target.baseUrl).toBe(baseUrl);
    const fetchRecord = recordingFetch(ANSWER);
    await createSupportModelAdapter(target, {
      readAuthorizationHeader: readCustodyAuthorizationHeader,
      fetchImplementation: fetchRecord.implementation
    }).complete(ask());
    expect(fetchRecord.calls[0]?.url).toBe(posted);
  });

  /**
   * Review finding 2(a). Most vendors report tokens and no money at all, and the
   * support `cost_usd` column then stays NULL with nothing said. Task 11 owns the
   * money envelope (V-28); until it lands the honest minimum is that the silence
   * is ANNOUNCED, once per call, under a typed code and through the support
   * diagnostic reporter — never a bare console line from this module.
   */
  it("reports a typed diagnostic when a vendor reply carries no cost, and none when it does", async () => {
    const path = credentialFile(VENDOR_CREDENTIAL);
    const target = parseSupportModelTargetJson(
      vendorTarget({ authorization_file: path }), HOSTED
    );
    const seen: string[] = [];
    const adapterFor = (body: unknown) => createSupportModelAdapter(target, {
      readAuthorizationHeader: readCustodyAuthorizationHeader,
      fetchImplementation: recordingFetch(body).implementation,
      reportDiagnostic: (diagnostic) => { seen.push(diagnostic.code); }
    });
    await adapterFor({ ...ANSWER, usage: { prompt_tokens: 12, completion_tokens: 3 } })
      .complete(ask());
    expect(seen).toEqual(["SUPPORT_MODEL_COST_UNREPORTED"]);
    await adapterFor(ANSWER).complete(ask());
    expect(seen).toEqual(["SUPPORT_MODEL_COST_UNREPORTED", "SUPPORT_MODEL_COST_UNREPORTED"]);
    seen.length = 0;
    await adapterFor({ ...ANSWER, usage: { prompt_tokens: 12, cost_usd: 0.002 } }).complete(ask());
    expect(seen).toEqual([]);
  });

  /**
   * Re-review finding 1. The diagnostic sink is the caller's code, and a sink
   * that throws must never change what the visitor gets. Unguarded, this call
   * sat inside `complete()`'s own `try`, so a broken log line turned a vendor
   * answer that had ALREADY BEEN PAID FOR into SUPPORT_MODEL_UNAVAILABLE and
   * opened the degraded circuit.
   *
   * The guard swallows and COUNTS rather than falling back to a log line: this
   * module holds a vendor credential and is pinned to contain no `console.` at
   * all, so a readable count is the honest record it is allowed to keep.
   */
  it("keeps the vendor's answer when the diagnostic sink throws, and counts the loss", async () => {
    const path = credentialFile(VENDOR_CREDENTIAL);
    const adapter = createSupportModelAdapter(
      parseSupportModelTargetJson(vendorTarget({ authorization_file: path }), HOSTED),
      {
        readAuthorizationHeader: readCustodyAuthorizationHeader,
        fetchImplementation: recordingFetch({
          ...ANSWER, usage: { prompt_tokens: 9, completion_tokens: 4 }
        }).implementation,
        reportDiagnostic: () => { throw new TypeError("the sink is broken"); }
      }
    );
    const completion = await adapter.complete(ask());
    expect(completion.text).toBe("the answer");
    expect(completion.usage).toEqual({ input_tokens: 9, output_tokens: 4 });
    expect(adapter.diagnosticFailures()).toBe(1);
  });

  /**
   * Re-review finding 2. `??` stops at a `cost_usd` that is PRESENT and
   * unusable, so a vendor that reports `cost_usd: null` (or a string, or a
   * negative) alongside a usable `x_cost_usd` lost the money it did report.
   * RED was recorded by inlining the old form:
   *   `const costUsd = row.cost_usd ?? row.x_cost_usd;`
   * which yields `usage.cost_usd` undefined for every row below.
   */
  it.each([
    // `null` survives `??` on its own; it is here because it is the shape
    // vendors actually send, and because a non-finite number reaches the wire
    // as `null` too — JSON has no NaN.
    ["null", null],
    ["a string", "0.004"],
    ["negative", -1]
  ])("falls through to the vendor's own cost field when cost_usd is %s", async (_name, costUsd) => {
    const completion = await createSupportModelAdapter(
      parseSupportModelTargetJson(
        vendorTarget({ authorization_header: VENDOR_CREDENTIAL }), LOCAL
      ),
      {
        readAuthorizationHeader: () => { throw new TypeError("NO_FILE_IS_READ_FOR_AN_INLINE_KEY"); },
        fetchImplementation: recordingFetch({
          ...ANSWER,
          usage: { prompt_tokens: 11, completion_tokens: 5, cost_usd: costUsd, x_cost_usd: 0.004 }
        }).implementation
      }
    ).complete(ask());
    expect(completion.usage).toEqual({ input_tokens: 11, output_tokens: 5, cost_usd: 0.004 });
  });

  it("says nothing about cost on the local relay, which reports its own", async () => {
    const seen: string[] = [];
    await createSupportModelAdapter(parseSupportModelTargetJson(RELAY_TARGET, LOCAL), {
      readAuthorizationHeader: () => { throw new TypeError("NO_FILE_IS_READ_ON_THE_RELAY_PATH"); },
      fetchImplementation: recordingFetch(ANSWER).implementation,
      reportDiagnostic: (diagnostic) => { seen.push(diagnostic.code); }
    }).complete(ask());
    expect(seen).toEqual([]);
  });

  it("names the provider, never the path or the credential, when the file cannot be used", () => {
    const absentRoot = mkdtempSync(join(tmpdir(), "t12-absent-"));
    roots.push(absentRoot);
    chmodSync(absentRoot, 0o700);
    const absent = join(absentRoot, "acme.header");
    expect(() => createSupportModelAdapter(
      parseSupportModelTargetJson(vendorTarget({ authorization_file: absent }), HOSTED),
      { readAuthorizationHeader: readCustodyAuthorizationHeader }
    )).toThrowError(new TypeError("PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:acme"));
    const world = credentialFile(VENDOR_CREDENTIAL, 0o644);
    expect(() => createSupportModelAdapter(
      parseSupportModelTargetJson(vendorTarget({ authorization_file: world }), HOSTED),
      { readAuthorizationHeader: readCustodyAuthorizationHeader }
    )).toThrowError(new TypeError(
      "PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor:acme:SECRET_CUSTODY_INVALID"
    ));
  });
});

describe("V-30 the hosted credential cannot escape", () => {
  it("appears in no log line, no refusal, no serialised adapter, no argv and no environment", async () => {
    const path = credentialFile(VENDOR_CREDENTIAL);
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...parts: readonly unknown[]) => {
        logs.push(parts.map((part) => String(part)).join(" "));
      }));
    let caught: unknown;
    let adapter: ReturnType<typeof createSupportModelAdapter>;
    try {
      const target = parseSupportModelTargetJson(vendorTarget({ authorization_file: path }), HOSTED);
      adapter = createSupportModelAdapter(target, {
        readAuthorizationHeader: readCustodyAuthorizationHeader,
        fetchImplementation: (async () => { throw new TypeError("connection failed"); }) as typeof fetch
      });
      caught = await adapter.complete(ask()).then(() => null, (error: unknown) => error);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(caught).toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    const rendered = JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {}));
    expect(rendered).not.toContain(VENDOR_CREDENTIAL);
    expect(rendered).not.toContain(path);
    expect(logs.join("\n")).not.toContain(VENDOR_CREDENTIAL);
    // The header rides in a private field: nothing that stringifies the adapter
    // — a log line, a diagnostic, a crash report — can carry it out.
    expect(JSON.stringify(adapter!)).not.toContain(VENDOR_CREDENTIAL);
    expect(Object.values(process.env).join("\u0000")).not.toContain(VENDOR_CREDENTIAL);
    expect(process.argv.join("\u0000")).not.toContain(VENDOR_CREDENTIAL);
  });

  it("keeps each transport on its own endpoint shape", () => {
    expect(() => new ApiVendorAdapter({
      baseUrl: "http://127.0.0.1:8794/v1", authorizationHeader: RELAY_CREDENTIAL, model: "m"
    })).toThrowError(expect.objectContaining({ code: "SUPPORT_MODEL_PATH_NOT_RATIFIED" }));
    expect(() => new RelayAdapter({
      baseUrl: "https://api.acme.example/v1", authorizationHeader: VENDOR_CREDENTIAL, model: "m"
    })).toThrowError(expect.objectContaining({ code: "SUPPORT_MODEL_PATH_NOT_RATIFIED" }));
  });

  it("never spawns a child and never writes a log line from the model module", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/support/model.ts", import.meta.url), "utf8"
    );
    // The pin is on the CODE. Matching the raw file made the module's own
    // comments unable to say the word — the guard added for re-review finding 1
    // explains that it may not log, and the explanation tripped the pin.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/(^|[^:])\/\/.*$/gmu, "$1");
    expect(code).toContain("class SupportChatCompletionsAdapter");
    expect(code).not.toMatch(/child_process|spawnSync|execFile|console\s*\./u);
  });
});

describe("V-30 local: today's relay path is unchanged", () => {
  it("parses the dedicated loopback Hermes target exactly as before", () => {
    expect(parseSupportModelTargetJson(RELAY_TARGET, LOCAL)).toEqual({
      providerRef: SUPPORT_HERMES_PROVIDER_REF,
      baseUrl: "http://127.0.0.1:8794/v1",
      model: SUPPORT_HERMES_MODEL,
      authorizationHeader: RELAY_CREDENTIAL
    });
  });

  it("still refuses every target the ratified relay shape refused", () => {
    for (const invalid of [
      RELAY_TARGET.replace(SUPPORT_HERMES_PROVIDER_REF, "development:codex-cli"),
      RELAY_TARGET.replace(SUPPORT_HERMES_MODEL, "other-model"),
      RELAY_TARGET.replace("127.0.0.1", "localhost"),
      RELAY_TARGET.replace("8794", "8792"),
      RELAY_TARGET.replace(RELAY_CREDENTIAL, ""),
      `${RELAY_TARGET.slice(0, -1)},"fallback":"development:codex-cli"}`,
      // A loopback model server is NOT admitted by the widening: local mode
      // gained the user's own https API key, nothing else.
      JSON.stringify({
        provider_ref: "local:lmstudio", base_url: "http://127.0.0.1:1234/v1",
        model: "local-model", authorization_header: "Bearer local"
      })
    ]) {
      expect(() => parseSupportModelTargetJson(invalid, LOCAL))
        .toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
  });

  it("builds the same loopback relay call it always built", async () => {
    const fetchRecord = recordingFetch({
      ...ANSWER, usage: { prompt_tokens: 7, completion_tokens: 3, cost_usd: 0.0001 }
    });
    const request = ask();
    const completion = await createSupportModelAdapter(
      parseSupportModelTargetJson(RELAY_TARGET, LOCAL),
      {
        readAuthorizationHeader: () => { throw new TypeError("NO_FILE_IS_READ_ON_THE_RELAY_PATH"); },
        fetchImplementation: fetchRecord.implementation
      }
    ).complete(request);
    expect(completion.usage).toEqual({ input_tokens: 7, output_tokens: 3, cost_usd: 0.0001 });
    expect(fetchRecord.calls[0]?.url).toBe("http://127.0.0.1:8794/v1/chat/completions");
    expect((fetchRecord.calls[0]?.init.headers as Record<string, string>).authorization)
      .toBe(RELAY_CREDENTIAL);
    const body = String(fetchRecord.calls[0]?.init.body);
    expect(JSON.parse(body)).toMatchObject({ model: SUPPORT_HERMES_MODEL, stream: false });
    /**
     * FW-B / B-I1. The call is the same call; what changed is the PACKET. The
     * body carries the framed packet the door accepted, verbatim — no turn
     * appended, none re-labelled — and the visitor's words are inside the fence
     * in their own field instead of beside the instruction as a bare user turn.
     */
    const posted = wirePacket(body);
    expect(posted.messages).toEqual(request.packet.messages);
    const material = readFramedMaterial(posted);
    expect(material.contractId).toBe(SUPPORT_ANSWER_CONTRACT_ID);
    expect(framedField(material, SUPPORT_VISITOR_MESSAGE_FIELD)).toBe("help");
    expect(posted.messages[0]!.content).toContain("bounded");
    expect(posted.messages[0]!.content).not.toContain("help");
  });

  /**
   * L4-F7's production floor is the LOCAL mode's own rule and it is untouched:
   * a local production deployment still admits the loopback relay. A cleartext
   * target that would LEAVE this machine never reaches the floor at all — the
   * support target's API shape is `https:` only, so it is refused one step
   * earlier, as not ratified.
   */
  it("keeps the local production floor and admits no cleartext target off this machine", () => {
    expect(parseSupportModelTargetJson(RELAY_TARGET, LOCAL_PRODUCTION))
      .toMatchObject({ providerRef: SUPPORT_HERMES_PROVIDER_REF });
    for (const deployment of [LOCAL, LOCAL_PRODUCTION, HOSTED]) {
      expect(() => parseSupportModelTargetJson(vendorTarget(
        { authorization_header: VENDOR_CREDENTIAL },
        { base_url: "http://api.acme.example/v1" }
      ), deployment)).toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
  });
});

describe("V-30 local: the user's own API key is admitted", () => {
  it("accepts an https vendor target with an inline credential", async () => {
    const target = parseSupportModelTargetJson(
      vendorTarget({ authorization_header: VENDOR_CREDENTIAL }), LOCAL
    );
    expect(target).toEqual({
      providerRef: "vendor:acme",
      baseUrl: "https://api.acme.example/v1",
      model: "acme-large",
      authorizationHeader: VENDOR_CREDENTIAL
    });
    const fetchRecord = recordingFetch(ANSWER);
    await createSupportModelAdapter(target, {
      readAuthorizationHeader: () => { throw new TypeError("NO_FILE_IS_READ_FOR_AN_INLINE_KEY"); },
      fetchImplementation: fetchRecord.implementation
    }).complete(ask());
    expect(fetchRecord.calls[0]?.url).toBe("https://api.acme.example/v1/chat/completions");
  });

  it("accepts an https vendor target that names a credential file", () => {
    expect(parseSupportModelTargetJson(
      vendorTarget({ authorization_file: "/etc/debateai/api/providers/acme.header" }), LOCAL
    )).toMatchObject({ authorizationFile: "/etc/debateai/api/providers/acme.header" });
  });

  /**
   * Review finding 4. A row that is unambiguously an API target — its base URL
   * is `https:` — keeps the refusal the REUSED parser raised. Collapsing those
   * into one generic code told an operator with a typo in a credential path
   * exactly the same thing as an operator whose target is not a target at all.
   * `SUPPORT_MODEL_PATH_NOT_RATIFIED` is kept for a row that is neither lawful
   * shape, and the support chat's own extra rule gets its own name.
   */
  it.each([
    [
      "both credential forms",
      vendorTarget({
        authorization_header: VENDOR_CREDENTIAL,
        authorization_file: "/etc/debateai/api/providers/acme.header"
      }),
      "PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT"
    ],
    [
      "a credential path that is not absolute",
      vendorTarget({ authorization_file: "providers/acme.header" }),
      "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"
    ],
    [
      "a member that is not part of a target",
      vendorTarget({ authorization_header: VENDOR_CREDENTIAL }, { fallback: "vendor:other" }),
      "PROVIDER_DISCOVERY_TARGETS_INVALID"
    ],
    [
      "no credential at all",
      vendorTarget({}),
      "SUPPORT_MODEL_CREDENTIAL_ABSENT"
    ]
  ])("keeps the honest refusal for an API-shaped row with %s", (_name, invalid, code) => {
    for (const deployment of [LOCAL, HOSTED]) {
      expect(() => parseSupportModelTargetJson(invalid, deployment)).toThrow(code);
    }
  });
});

describe("V-30(2) the local-mode instructions say local mode is for a computer you do not share", () => {
  it("says it plainly, says why, and names the deliberate argument-passing decision", async () => {
    const runbook = await readFile(
      new URL("../../deploy/dev-auth/README.md", import.meta.url), "utf8"
    );
    // Whitespace-tolerant: a document may be re-wrapped, and a line break is
    // not a change of meaning.
    expect(runbook).toMatch(/computer\s+you\s+do\s+not\s+share/u);
    expect(runbook).toMatch(/process\s+list|`ps`/u);
    expect(runbook).toMatch(/DR-133/u);
    expect(runbook).toMatch(/support\s+chat/iu);
    expect(runbook).toMatch(/hosted/iu);
    // Review finding 5: the paragraph points at a hardening list, so the list
    // has to exist and to name every relay the local mode starts.
    expect(runbook).toMatch(/local-mode\s+hardening\s+list/iu);
    for (const tool of ["claude-relay.ts", "model-shim.ts", "grok-relay.ts", "hermes-relay.ts"]) {
      expect(runbook, tool).toContain(tool);
    }
    expect(runbook).toMatch(/no-hang\s+proof/u);
  });

  /**
   * Re-review finding 3, the same shape as task 10's pin on the credential
   * reader's codes: the closed set is read from the SOURCE, so the kit's table
   * of hosted refusals cannot fall behind a code the support chat can raise at
   * start-up.
   */
  it("names every support start-up refusal in the kit's table of hosted refusals", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/support/model.ts", import.meta.url), "utf8"
    );
    const declaration = source.indexOf("export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES");
    expect(declaration).toBeGreaterThan(-1);
    const codes = [...source
      .slice(declaration, source.indexOf("] as const);", declaration))
      .matchAll(/"([A-Z_]+)"/gu)].map((match) => match[1]!);
    expect(codes).toEqual([...SUPPORT_MODEL_STARTUP_REFUSAL_CODES]);
    const kit = await readFile(
      new URL("../../deploy/vps/README.md", import.meta.url), "utf8"
    );
    const section = kit.slice(kit.indexOf("## 11. Providers and vendors"));
    expect(section).not.toBe("");
    for (const code of codes) expect(section, code).toContain(code);
  });
});
