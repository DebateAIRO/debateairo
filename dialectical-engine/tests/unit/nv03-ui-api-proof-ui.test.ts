// NV-03, the website half: server.mjs reads and checks the UI-to-API proof at boot and installs it once under a registry
// symbol; both forwarders (the /api proxy and the SSR contract client) send exactly that value with every forwarded
// address, and nothing else ever reads the file. A caller-supplied proof header never reaches Next.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as uiRoute from "../../apps/ui/app/api/[...path]/route.js";
import { createServerContractClient } from "../../apps/ui/lib/serverApi.js";
import * as edge from "../../apps/ui/trusted-client-ip.mjs";

type Module = Record<string, unknown>;
const ui = edge as unknown as Module;
const call = <T>(name: string, ...args: unknown[]): T => {
  const fn = ui[name];
  if (typeof fn !== "function") throw new Error(`${name} is not exported`);
  return (fn as (...a: unknown[]) => T)(...args);
};
const PROOF = "u".repeat(43);
const SLOT = Symbol.for("debateai.ui.apiProof");
const slots = globalThis as unknown as Record<symbol, unknown>;

const originalFetch = globalThis.fetch;
const saved = {
  edge: process.env.DIALECTICAL_UI_EDGE,
  path: process.env.DIALECTICAL_UI_API_PROOF_PATH,
  base: process.env.DIALECTICAL_API_BASE
};
const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

beforeEach(() => {
  process.env.DIALECTICAL_API_BASE = "http://127.0.0.1:8790";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  restore("DIALECTICAL_UI_EDGE", saved.edge);
  restore("DIALECTICAL_UI_API_PROOF_PATH", saved.path);
  restore("DIALECTICAL_API_BASE", saved.base);
  if (typeof ui.installUiApiProof === "function") call("installUiApiProof", null);
  vi.restoreAllMocks();
});

type ProxyRoute = Readonly<{ POST(request: Request, context: { readonly params: Promise<Readonly<{ path: string[] }>> }): Promise<Response> }>;
async function forwardedHeaders(stamp: string): Promise<Record<string, string>> {
  let captured: Headers | undefined;
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    captured = new Headers(init.headers);
    return new Response("{}", { status: 202, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await (uiRoute as unknown as ProxyRoute).POST(new Request("http://ui.local/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-debateai-client-ip": stamp, "x-debateai-ui-proof": "caller-supplied" },
    body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "auth", "register"] }) });
  expect(captured).toBeDefined();
  return Object.fromEntries(captured!);
}

describe("NV-03: the /api proxy sends the installed proof with the forwarded address", () => {
  it("sends the proof only beside a forwarded address, and never a caller's", async () => {
    process.env.DIALECTICAL_UI_EDGE = "server.mjs";
    call("installUiApiProof", PROOF);
    expect(await forwardedHeaders("203.0.113.9")).toEqual({
      "content-type": "application/json", "x-forwarded-for": "203.0.113.9", "x-debateai-ui-proof": PROOF
    });
    expect(await forwardedHeaders("not-an-ip")).toEqual({ "content-type": "application/json" });
    call("installUiApiProof", null);
    expect(await forwardedHeaders("203.0.113.9")).toEqual({ "content-type": "application/json", "x-forwarded-for": "203.0.113.9" });
  });
});

describe("NV-03: the SSR contract client sends the installed proof with the forwarded address", () => {
  async function seen(clientIp: string | undefined): Promise<Headers> {
    let captured: Headers | undefined;
    const stub = (async (_url: unknown, init: RequestInit = {}) => {
      captured = new Headers(init.headers);
      return new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await createServerContractClient(stub, undefined, "UA", clientIp).readPublicDebates(1, 0).catch(() => undefined);
    expect(captured).toBeDefined();
    return captured!;
  }
  it("adds the proof only when it forwards an address", async () => {
    process.env.DIALECTICAL_UI_EDGE = "server.mjs";
    call("installUiApiProof", PROOF);
    const forwarded = await seen("203.0.113.9");
    expect(forwarded.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(forwarded.get("x-debateai-ui-proof")).toBe(PROOF);
    const bare = await seen(undefined);
    expect(bare.get("x-forwarded-for")).toBeNull();
    expect(bare.get("x-debateai-ui-proof")).toBeNull();
  });
});

describe("NV-03: trusted-client-ip.mjs", () => {
  it("exports the two header names", () => {
    expect(ui.UI_API_PROOF_HEADER).toBe("x-debateai-ui-proof");
    expect(ui.UI_API_PROOF_VERDICT_HEADER).toBe("x-debateai-ui-proof-verdict");
  });

  it("readUiApiProof reads the edge secret's way and refuses what the edge secret's reader refuses", () => {
    expect(call("readUiApiProof", undefined)).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "nv03-ui-proof-"));
    try {
      const good = join(dir, "good.secret");
      writeFileSync(good, `${PROOF}\n`, { mode: 0o400 });
      expect(call("readUiApiProof", good)).toBe(PROOF);
      const shared = join(dir, "shared.secret");
      writeFileSync(shared, `${PROOF}\n`, { mode: 0o640 });
      expect(() => call("readUiApiProof", shared)).toThrow("DIALECTICAL_UI_API_PROOF_INVALID");
      const short = join(dir, "short.secret");
      writeFileSync(short, "0123456789\n", { mode: 0o600 });
      expect(() => call("readUiApiProof", short)).toThrow("DIALECTICAL_UI_API_PROOF_INVALID");
      // The edge secret's reader keeps its own code.
      expect(() => call("readEdgeSecret", short)).toThrow("DIALECTICAL_UI_EDGE_SECRET_INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("assertUiApiProofPolicy refuses a trusted proxy without a proof, and a proof equal to the edge secret", () => {
    expect(() => call("assertUiApiProofPolicy", { development: false, trustedProxies: ["127.0.0.1"], edgeSecret: null, uiApiProof: null }))
      .toThrow("DIALECTICAL_UI_API_PROOF_REQUIRED");
    expect(() => call("assertUiApiProofPolicy", { development: true, trustedProxies: ["127.0.0.1"], edgeSecret: null, uiApiProof: null })).not.toThrow();
    expect(() => call("assertUiApiProofPolicy", { development: false, trustedProxies: [], edgeSecret: null, uiApiProof: null })).not.toThrow();
    expect(() => call("assertUiApiProofPolicy", { development: false, trustedProxies: ["127.0.0.1"], edgeSecret: PROOF, uiApiProof: PROOF }))
      .toThrow("DIALECTICAL_UI_API_PROOF_REUSES_EDGE_SECRET");
    expect(() => call("assertUiApiProofPolicy", { development: false, trustedProxies: ["127.0.0.1"], edgeSecret: "e".repeat(43), uiApiProof: PROOF })).not.toThrow();
  });

  it("installUiApiProof refuses a value outside the grammar", () => {
    expect(() => call("installUiApiProof", "short")).toThrow("DIALECTICAL_UI_API_PROOF_INVALID");
    expect(() => call("installUiApiProof", 7)).toThrow("DIALECTICAL_UI_API_PROOF_INVALID");
  });

  it("a second instance of the module sees the value the first one installed (the registry symbol)", async () => {
    call("installUiApiProof", PROOF);
    vi.resetModules();
    const second = await import("../../apps/ui/trusted-client-ip.mjs") as unknown as Module;
    expect(second).not.toBe(ui);
    expect((second.installedUiApiProof as () => string | null)()).toBe(PROOF);
  });

  it("names a missing record once under the edge stamp, and stays silent for an installed null or without the stamp", async () => {
    const before = slots[SLOT];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      delete slots[SLOT];
      process.env.DIALECTICAL_UI_EDGE = "server.mjs";
      vi.resetModules();
      const fresh = await import("../../apps/ui/trusted-client-ip.mjs") as unknown as Module;
      const installed = fresh.installedUiApiProof as () => string | null;
      expect(installed()).toBeNull();
      expect(installed()).toBeNull();
      expect(errors.mock.calls.map((args) => String(args[0]))).toEqual([JSON.stringify({ event: "ui.api_proof.not_installed" })]);
      errors.mockClear();
      (fresh.installUiApiProof as (value: unknown) => void)(null);
      expect(installed()).toBeNull();
      expect(errors).not.toHaveBeenCalled();
      delete slots[SLOT];
      delete process.env.DIALECTICAL_UI_EDGE;
      vi.resetModules();
      const unstamped = await import("../../apps/ui/trusted-client-ip.mjs") as unknown as Module;
      expect((unstamped.installedUiApiProof as () => string | null)()).toBeNull();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      if (before === undefined) delete slots[SLOT];
      else slots[SLOT] = before;
    }
  });

  it("hardenIncomingProxyHeaders deletes a caller's proof header", () => {
    const headers: Record<string, string | string[] | undefined> = { "x-debateai-ui-proof": PROOF, accept: "*/*" };
    edge.hardenIncomingProxyHeaders(headers, "203.0.113.9");
    expect(headers).toEqual({ accept: "*/*", "x-debateai-client-ip": "203.0.113.9" });
  });
});

describe("NV-03: server.mjs checks and installs the proof before Next starts", () => {
  it("reads, checks and installs in that order before next({, and hands the value to the readiness responder", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/server.mjs"), "utf8");
    const read = source.indexOf("readUiApiProof(process.env.DIALECTICAL_UI_API_PROOF_PATH)");
    const policy = source.indexOf("assertUiApiProofPolicy(");
    const install = source.indexOf("installUiApiProof(uiApiProof)");
    const start = source.indexOf("next({");
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(policy);
    expect(policy).toBeLessThan(install);
    expect(install).toBeLessThan(start);
    const responder = source.slice(source.indexOf("createReadinessResponder({"));
    expect(responder.slice(0, responder.indexOf("});"))).toContain("uiApiProof,");
  });
});
