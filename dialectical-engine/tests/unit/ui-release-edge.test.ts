import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReleaseKey } from "../../packages/kernel/src/release-key.js";
import {
  BUILD_STAMP_FILE,
  RELEASE_KEY_PATTERN,
  assertBuildMatchesRelease,
  createReadinessResponder,
  installGracefulClose,
  noteUnusableApiBase,
  parseWebsiteReleaseKey,
  releaseHeaderFor,
  resolveBuildReleaseCode
} from "../../apps/ui/release-edge.mjs";
import { EDGE_SECRET_HEADER, hardenIncomingProxyHeaders } from "../../apps/ui/trusted-client-ip.mjs";

/**
 * Side-by-side uploads spec 2026-10-21 §1, §6, §7 (plan C12): the website edge (apps/ui/server.mjs) knows its release
 * key, refuses to serve a build made for another release, answers GET /readyz ahead of Next from its own API's /readyz,
 * stamps x-debateai-release on every response and closes cleanly on SIGTERM.
 */
// Key-shaped values are built from pieces, so no line pairs a *_KEY name with a literal (gitleaks).
const CODE = "0123456789ab";
const OWN = ["r17", CODE].join("-");
const OTHER = ["r18", CODE].join("-");

/** The `code` of what `fn` throws; undefined when it returns. */
function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
}

const scratch: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function distDir(stamp?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ui-release-edge-"));
  scratch.push(dir);
  if (stamp !== undefined) writeFileSync(join(dir, BUILD_STAMP_FILE), stamp);
  return dir;
}

describe("parseWebsiteReleaseKey", () => {
  it("requires a key outside development, and lets development run without one", () => {
    expect(codeOf(() => parseWebsiteReleaseKey(undefined, { development: false }))).toBe("RELEASE_KEY_REQUIRED");
    expect(codeOf(() => parseWebsiteReleaseKey("", { development: false }))).toBe("RELEASE_KEY_REQUIRED");
    expect(parseWebsiteReleaseKey(undefined, { development: true })).toBeNull();
  });

  it("returns a well-formed key as is and refuses a malformed one", () => {
    expect(parseWebsiteReleaseKey(OWN, { development: false })).toBe(OWN);
    expect(parseWebsiteReleaseKey(OWN, { development: true })).toBe(OWN);
    expect(codeOf(() => parseWebsiteReleaseKey(["r17", "0123456789AB"].join("-"), { development: false })))
      .toBe("RELEASE_KEY_INVALID");
    expect(codeOf(() => parseWebsiteReleaseKey("legacy", { development: true }))).toBe("RELEASE_KEY_INVALID");
  });

  it("uses the INTERFACE's pattern, which agrees with the kernel's parseReleaseKey", () => {
    expect(RELEASE_KEY_PATTERN.source).toBe("^r[1-9][0-9]*-[0-9a-f]{12}$");
    const samples = [OWN, ["r17", "0123456789AB"].join("-"), "legacy", ["r0", CODE].join("-"),
      ["r17", CODE.slice(0, 11)].join("-"), ["r17", `${CODE}c`].join("-")];
    for (const sample of samples) {
      const kernelAccepts = codeOf(() => parseReleaseKey(sample)) === undefined;
      expect(RELEASE_KEY_PATTERN.test(sample), sample).toBe(kernelAccepts);
    }
    expect(samples.map((sample) => RELEASE_KEY_PATTERN.test(sample))).toEqual([true, false, false, false, false, false]);
  });
});

describe("resolveBuildReleaseCode", () => {
  it("takes the code part of RELEASE_KEY first", () => {
    expect(resolveBuildReleaseCode({ RELEASE_KEY: OWN, DEBATEAI_SOURCE_REVISION: "f".repeat(40) }, "e".repeat(40),
      { production: true })).toBe(CODE);
  });

  it("then the first 12 of DEBATEAI_SOURCE_REVISION, lowercased", () => {
    expect(resolveBuildReleaseCode({ DEBATEAI_SOURCE_REVISION: "ABCDEF0123456789ABCDEF0123456789ABCDEF01" },
      "e".repeat(40), { production: true })).toBe("abcdef012345");
  });

  it("then the first 12 of the git head", () => {
    expect(resolveBuildReleaseCode({}, `${CODE}${"d".repeat(28)}`, { production: true })).toBe(CODE);
  });

  it("refuses an unresolved code in production, and gives the development code otherwise", () => {
    expect(codeOf(() => resolveBuildReleaseCode({}, null, { production: true }))).toBe("RELEASE_CODE_UNRESOLVED");
    expect(resolveBuildReleaseCode({}, null, { production: false })).toBe("000000000000");
  });

  it("reads the git head only when neither RELEASE_KEY nor DEBATEAI_SOURCE_REVISION is set (C12 review)", () => {
    const head = vi.fn(() => `${CODE}${"d".repeat(28)}`);
    expect(resolveBuildReleaseCode({ RELEASE_KEY: OWN }, head, { production: true })).toBe(CODE);
    expect(resolveBuildReleaseCode({ DEBATEAI_SOURCE_REVISION: "f".repeat(40) }, head, { production: true }))
      .toBe("f".repeat(12));
    expect(head).not.toHaveBeenCalled();
    expect(resolveBuildReleaseCode({}, head, { production: true })).toBe(CODE);
    expect(head).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed key or revision instead of falling past it", () => {
    expect(codeOf(() => resolveBuildReleaseCode({ RELEASE_KEY: "legacy" }, null, { production: false })))
      .toBe("RELEASE_KEY_INVALID");
    expect(codeOf(() => resolveBuildReleaseCode({ DEBATEAI_SOURCE_REVISION: "not-hex" }, null, { production: false })))
      .toBe("RELEASE_CODE_UNRESOLVED");
  });
});

describe("assertBuildMatchesRelease", () => {
  it("passes when the build's stamp is the key's code part", () => {
    expect(() => assertBuildMatchesRelease(distDir(JSON.stringify({ releaseCode: CODE })), OWN)).not.toThrow();
  });

  it("refuses another release's key, a missing stamp and a malformed one", () => {
    const stamped = distDir(JSON.stringify({ releaseCode: CODE }));
    expect(codeOf(() => assertBuildMatchesRelease(stamped, ["r17", "a".repeat(12)].join("-"))))
      .toBe("RELEASE_KEY_BUILD_MISMATCH");
    expect(codeOf(() => assertBuildMatchesRelease(distDir(), OWN))).toBe("RELEASE_KEY_BUILD_MISMATCH");
    expect(codeOf(() => assertBuildMatchesRelease(distDir("{"), OWN))).toBe("RELEASE_KEY_BUILD_MISMATCH");
  });
});

/** A captured website answer. */
type Answer = { status: number; headers: Record<string, string>; body: unknown };
function fakeResponse(): { res: unknown; done: Promise<Answer> } {
  let resolveDone!: (answer: Answer) => void;
  const done = new Promise<Answer>((resolve) => { resolveDone = resolve; });
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    end(text?: string) {
      resolveDone({ status: res.statusCode, headers, body: text === undefined ? undefined : JSON.parse(text) });
    }
  };
  return { res, done };
}

function responder(apiAnswer: () => Promise<Response>, draining = () => false) {
  const calls: string[] = [];
  const respond = createReadinessResponder({
    apiBase: "http://127.0.0.1:8790",
    releaseKey: OWN,
    fetch: (async (url: unknown) => { calls.push(String(url)); return apiAnswer(); }) as typeof fetch,
    timeoutMs: 50,
    draining
  });
  return { respond, calls };
}

type Respond = ReturnType<typeof createReadinessResponder>;
async function ask(respond: Respond, url = "/readyz"): Promise<Answer> {
  const { res, done } = fakeResponse();
  expect(respond({ method: "GET", url }, res as never)).toBe(true);
  return done;
}

const json = (status: number, body: unknown) =>
  async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createReadinessResponder", () => {
  it("answers 200 with the API's own body when the API is ready under the same key", async () => {
    const body = { ready: true, releaseKey: OWN, reasons: [] };
    const { respond, calls } = responder(json(200, body));
    const answer = await ask(respond);
    expect(calls).toEqual(["http://127.0.0.1:8790/readyz"]);
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual(body);
    expect(answer.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(answer.headers["cache-control"]).toBe("no-store");
  });

  it("carries the API's reasons when it is not ready", async () => {
    const answer = await ask(responder(json(503, { ready: false, releaseKey: OWN, reasons: ["NOT_CURRENT"] })).respond);
    expect(answer.status).toBe(503);
    expect(answer.body).toEqual({ ready: false, releaseKey: OWN, reasons: ["NOT_CURRENT"] });
  });

  it("says BOOTING when the API is unreachable, not JSON, not a readiness answer or late", async () => {
    const unreachable = responder(async () => { throw new TypeError("fetch failed"); });
    const notJson = responder(async () => new Response("<html>", { status: 200 }));
    const notReadiness = responder(json(401, { error: "UNAUTHENTICATED" }));
    const late = createReadinessResponder({
      apiBase: "http://127.0.0.1:8790",
      releaseKey: OWN,
      fetch: ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch,
      timeoutMs: 20,
      draining: () => false
    });
    for (const respond of [unreachable.respond, notJson.respond, notReadiness.respond, late]) {
      const answer = await ask(respond);
      expect(answer.status).toBe(503);
      expect(answer.body).toEqual({ ready: false, releaseKey: OWN, reasons: ["BOOTING"] });
    }
  });

  it("says RELEASE_KEY_MISMATCH when its API is another release", async () => {
    const answer = await ask(responder(json(200, { ready: true, releaseKey: OTHER, reasons: [] })).respond);
    expect(answer.status).toBe(503);
    expect(answer.body).toEqual({ ready: false, releaseKey: OWN, reasons: ["RELEASE_KEY_MISMATCH"] });
  });

  it("adds DRAINING after SIGTERM, even when the API is ready", async () => {
    let draining = false;
    const { respond } = responder(json(200, { ready: true, releaseKey: OWN, reasons: [] }), () => draining);
    expect((await ask(respond)).status).toBe(200);
    draining = true;
    const answer = await ask(respond);
    expect(answer.status).toBe(503);
    expect(answer.body).toEqual({ ready: false, releaseKey: OWN, reasons: ["DRAINING"] });
  });

  it("leaves every other path and method to Next", () => {
    const { respond, calls } = responder(json(200, { ready: true, releaseKey: OWN, reasons: [] }));
    const { res } = fakeResponse();
    expect(respond({ method: "GET", url: "/readyz-not" }, res as never)).toBe(false);
    expect(respond({ method: "GET", url: "/" }, res as never)).toBe(false);
    expect(respond({ method: "POST", url: "/readyz" }, res as never)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("reads /readyz with a query string as /readyz", async () => {
    const answer = await ask(responder(json(200, { ready: true, releaseKey: OWN, reasons: [] })).respond, "/readyz?probe=1");
    expect(answer.status).toBe(200);
  });

  // Caddy's active health check (deploy/vps/Caddyfile, health_uri /readyz) sends the upstream's address as its Host,
  // 127.0.0.1:3100, not the site's name: the answer never depends on Host. server.mjs runs only the header hardening
  // before the responder (and Next, the only place a Host rule could live, after it).
  it("answers Caddy's probe, whose Host is the upstream address 127.0.0.1:3100, as it answers the site's own name", async () => {
    const body = { ready: true, releaseKey: OWN, reasons: [] };
    const { respond } = responder(json(200, body));
    for (const host of ["127.0.0.1:3100", "127.0.0.1:3101", "dezbatere.example"]) {
      const headers: Record<string, string> = { host, [EDGE_SECRET_HEADER]: "s".repeat(48) };
      hardenIncomingProxyHeaders(headers, "127.0.0.1", ["127.0.0.1"], null);
      expect(headers.host).toBe(host);
      const { res, done } = fakeResponse();
      expect(respond({ method: "GET", url: "/readyz", headers } as never, res as never)).toBe(true);
      expect(await done).toMatchObject({ status: 200, body });
    }
  });
});

describe("installGracefulClose", () => {
  function fakes() {
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    let closed: (() => void) | undefined;
    const order: string[] = [];
    const server = {
      close: vi.fn((callback: () => void) => { order.push("close"); closed = callback; }),
      closeIdleConnections: vi.fn(() => { order.push("closeIdleConnections"); }),
      closeAllConnections: vi.fn(() => { order.push("closeAllConnections"); })
    };
    const onDrain = vi.fn(() => { order.push("onDrain"); });
    installGracefulClose({ server, process: proc, onDrain });
    return { proc, server, onDrain, order, fireClosed: () => closed?.() };
  }

  it("drains, closes, and exits 0 once the server has closed", () => {
    vi.useFakeTimers();
    const { proc, server, onDrain, order, fireClosed } = fakes();
    proc.emit("SIGTERM");
    expect(onDrain).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["onDrain", "close", "closeIdleConnections"]);
    expect(proc.exit).not.toHaveBeenCalled();
    fireClosed();
    expect(proc.exit).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it("closes every connection and exits 0 at the 20 s deadline when the close never ends", () => {
    vi.useFakeTimers();
    const { proc, server, order } = fakes();
    proc.emit("SIGTERM");
    vi.advanceTimersByTime(19_999);
    expect(proc.exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe("closeAllConnections");
    expect(proc.exit).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it("does nothing more on a second SIGTERM", () => {
    vi.useFakeTimers();
    const { proc, server, onDrain } = fakes();
    proc.emit("SIGTERM");
    proc.emit("SIGTERM");
    expect(onDrain).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(proc.exit).toHaveBeenCalledTimes(1);
  });
});

describe("noteUnusableApiBase (C12 review)", () => {
  it("outside --dev names a missing or unusable API base in one content-free line, so a site stuck BOOTING says why", () => {
    for (const apiBase of [undefined, "", "not a url", "ftp://127.0.0.1:8790"]) {
      const warn = vi.fn();
      expect(noteUnusableApiBase(apiBase, { development: false, warn }), String(apiBase)).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({ event: "ui.api_base.unusable", key: "DIALECTICAL_API_BASE" });
    }
  });

  it("says nothing for a usable base, or under --dev", () => {
    const warn = vi.fn();
    expect(noteUnusableApiBase("http://127.0.0.1:8790", { development: false, warn })).toBe(false);
    expect(noteUnusableApiBase(undefined, { development: true, warn })).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("releaseHeaderFor (C12 review)", () => {
  it("names the website's release on its own pages and /readyz", () => {
    for (const url of ["/", "/debate/x?y=1", "/readyz", "/apiary", "/_next/static/a.js"]) {
      expect(releaseHeaderFor(OWN, url), url).toBe(OWN);
    }
  });

  it("leaves a proxied /api answer to carry its API's own header, so a headerless API shows as missing", () => {
    for (const url of ["/api", "/api/", "/api/v1/session", "/api?x=1", "/api/v1/runs/x/events?after=3"]) {
      expect(releaseHeaderFor(OWN, url), url).toBeNull();
    }
  });

  it("names nothing under --dev without a key", () => {
    expect(releaseHeaderFor(null, "/")).toBeNull();
  });
});

describe("next.config.mjs (C12 review)", () => {
  afterEach(() => {
    vi.doUnmock("../../apps/ui/release-edge.mjs");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig(env: Readonly<Record<string, string | undefined>>) {
    const readGitHead = vi.fn(() => `${"c".repeat(12)}${"d".repeat(28)}`);
    vi.resetModules();
    vi.doMock("../../apps/ui/release-edge.mjs", async (importOriginal) => ({
      ...await importOriginal<typeof import("../../apps/ui/release-edge.mjs")>(),
      readGitHead
    }));
    vi.stubEnv("RELEASE_KEY", "");
    vi.stubEnv("DEBATEAI_SOURCE_REVISION", "");
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value ?? "");
    // @ts-expect-error -- next.config.mjs is plain JavaScript with no declaration file; only its `env` is read here.
    const config = (await import("../../apps/ui/next.config.mjs")).default as { env: Record<string, string> };
    return { code: config.env.NEXT_PUBLIC_DEBATEAI_RELEASE_CODE, readGitHead };
  }

  it("reads git only when neither RELEASE_KEY nor DEBATEAI_SOURCE_REVISION is set", async () => {
    const keyed = await loadConfig({ RELEASE_KEY: OWN });
    expect(keyed.code).toBe(CODE);
    expect(keyed.readGitHead).not.toHaveBeenCalled();
    const revised = await loadConfig({ DEBATEAI_SOURCE_REVISION: "e".repeat(40) });
    expect(revised.code).toBe("e".repeat(12));
    expect(revised.readGitHead).not.toHaveBeenCalled();
    const bare = await loadConfig({});
    expect(bare.code).toBe("c".repeat(12));
    expect(bare.readGitHead).toHaveBeenCalledTimes(1);
  });
});

describe("the website edge is wired", () => {
  it("server.mjs reads the key before Next, checks the build outside --dev, answers /readyz first and closes on SIGTERM", async () => {
    const source = await readFile(new URL("../../apps/ui/server.mjs", import.meta.url), "utf8");
    const at = (needle: string) => {
      const index = source.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    expect(at("parseWebsiteReleaseKey(process.env.RELEASE_KEY, { development })")).toBeLessThan(at("next({"));
    expect(source).toMatch(/if \(!development\) assertBuildMatchesRelease\(distDir, releaseKey\);/u);
    expect(at("assertBuildMatchesRelease(distDir, releaseKey)")).toBeLessThan(at("next({"));
    expect(at("if (readiness(request, response)) return;")).toBeLessThan(at("void handle(request, response)"));
    // C12 review: the website's own pages and /readyz name its release; a proxied /api answer carries its API's own.
    expect(source).toContain("const ownRelease = releaseHeaderFor(releaseKey, request.url);");
    expect(source).toContain('if (ownRelease !== null) response.setHeader("x-debateai-release", ownRelease);');
    expect(at("releaseHeaderFor(releaseKey, request.url)")).toBeLessThan(at("if (readiness(request, response)) return;"));
    expect(source).toMatch(/noteUnusableApiBase\(apiBase, \{ development \}\);/u);
    expect(at("noteUnusableApiBase(apiBase")).toBeLessThan(at("next({"));
    expect(at("installGracefulClose(")).toBeGreaterThan(at("server.listen(port, hostname)"));
  });

  it("the build stamps its release code and next.config inlines the same code for the browser", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../apps/ui/package.json", import.meta.url), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(manifest.scripts.build).toBe(
      "next build && node release-edge.mjs --stamp && node ../../scripts/assert-auth-front-door-routes.mjs . apps-ui"
    );
    const config = await readFile(new URL("../../apps/ui/next.config.mjs", import.meta.url), "utf8");
    expect(config).toContain("NEXT_PUBLIC_DEBATEAI_RELEASE_CODE: resolveBuildReleaseCode(process.env, gitHead)");
    expect(config).toContain("const gitHead = () => readGitHead(");
  });
});
