import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readCustodyAuthorizationHeader } from "../../packages/crypto/src/index.js";
import {
  ApiVendorAdapter,
  RelayAdapter,
  SUPPORT_HERMES_MODEL,
  SUPPORT_HERMES_PROVIDER_REF,
  createSupportModelAdapter,
  parseSupportModelTargetJson
} from "../../apps/api/src/support/model.js";

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

function ask(): Readonly<{
  system: string;
  messages: readonly Readonly<{ role: "user"; content: string }>[];
  language: "en";
}> {
  return {
    system: "bounded", messages: [{ role: "user", content: "help" }], language: "en"
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
    expect(Object.values(process.env).join(" ")).not.toContain(VENDOR_CREDENTIAL);
    expect(process.argv.join(" ")).not.toContain(VENDOR_CREDENTIAL);
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
    expect(source).not.toMatch(/child_process|spawnSync|execFile|console\./u);
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
    const completion = await createSupportModelAdapter(
      parseSupportModelTargetJson(RELAY_TARGET, LOCAL),
      {
        readAuthorizationHeader: () => { throw new TypeError("NO_FILE_IS_READ_ON_THE_RELAY_PATH"); },
        fetchImplementation: fetchRecord.implementation
      }
    ).complete(ask());
    expect(completion.usage).toEqual({ input_tokens: 7, output_tokens: 3, cost_usd: 0.0001 });
    expect(fetchRecord.calls[0]?.url).toBe("http://127.0.0.1:8794/v1/chat/completions");
    expect((fetchRecord.calls[0]?.init.headers as Record<string, string>).authorization)
      .toBe(RELAY_CREDENTIAL);
    expect(JSON.parse(String(fetchRecord.calls[0]?.init.body))).toEqual({
      model: SUPPORT_HERMES_MODEL,
      stream: false,
      messages: [{ role: "system", content: "bounded" }, { role: "user", content: "help" }]
    });
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

  it("refuses a target that declares both credential forms, and one that declares neither", () => {
    for (const invalid of [
      vendorTarget({
        authorization_header: VENDOR_CREDENTIAL,
        authorization_file: "/etc/debateai/api/providers/acme.header"
      }),
      vendorTarget({}),
      vendorTarget({ authorization_file: "providers/acme.header" })
    ]) {
      expect(() => parseSupportModelTargetJson(invalid, LOCAL))
        .toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
  });
});

describe("V-30(2) the local-mode instructions say local mode is for a computer you do not share", () => {
  it("says it plainly, says why, and names the deliberate argument-passing decision", async () => {
    const runbook = await readFile(
      new URL("../../deploy/dev-auth/README.md", import.meta.url), "utf8"
    );
    expect(runbook).toMatch(/computer you do not share/u);
    expect(runbook).toMatch(/process list|`ps`/u);
    expect(runbook).toMatch(/DR-133/u);
    expect(runbook).toMatch(/support chat/iu);
  });
});
