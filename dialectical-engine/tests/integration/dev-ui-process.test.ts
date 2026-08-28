import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  startDevelopmentUiProcess,
  type DevelopmentUiChild,
  type DevelopmentUiProcessOperations,
  type DevelopmentUiProbe
} from "../../apps/runner/src/dev-ui-process.js";

const API_READY = Object.freeze({
  statusCode: 401,
  contentType: "application/json; charset=utf-8",
  body: '{"error":"SESSION_REQUIRED"}'
});
const UI_READY = Object.freeze({
  login: Object.freeze({
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Back to the graph.</body></html>"
  }),
  session: API_READY
});

function child(): DevelopmentUiChild & { terminate: ReturnType<typeof vi.fn>; exit(): void } {
  let resolveExit!: (value: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>) => void;
  const exited = new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>(
    (resolve) => { resolveExit = resolve; }
  );
  return {
    exited,
    exit() { resolveExit(Object.freeze({ code: 1, signal: null })); },
    terminate: vi.fn(async () => resolveExit(Object.freeze({ code: 0, signal: "SIGTERM" })))
  };
}

function operations(input: Readonly<{
  api?: DevelopmentUiProbe["session"] | null;
  ui?: readonly (DevelopmentUiProbe | null)[];
}> = {}): DevelopmentUiProcessOperations & Readonly<{
  uiChild: ReturnType<typeof child>;
  startUi: ReturnType<typeof vi.fn>;
}> {
  const uiChild = child();
  const probes = input.ui ?? [null, UI_READY];
  let probeIndex = 0;
  return {
    uiChild,
    probeApi: vi.fn(async () => input.api === undefined ? API_READY : input.api),
    probeUi: vi.fn(async () => probes[Math.min(probeIndex++, probes.length - 1)] ?? null),
    startUi: vi.fn(() => uiChild),
    delay: vi.fn(async () => undefined)
  };
}

describe("DEV-10C private local UI process", () => {
  it("requires the real deny-default API and starts the UI with four fixed non-secret values", async () => {
    const runtime = operations();
    const uiProcess = await startDevelopmentUiProcess({
      repositoryRoot: process.cwd(),
      commandEnvironment: Object.freeze({ PATH: "/usr/bin", HOME: "/private/home" }),
      operations: runtime
    });

    expect(uiProcess.receipt).toEqual({ host: "127.0.0.1", port: 3001, proxy: "DENY_DEFAULT" });
    expect(runtime.probeApi).toHaveBeenCalledTimes(1);
    expect(runtime.startUi).toHaveBeenCalledWith({
      PATH: "/usr/bin",
      HOME: "/private/home",
      DIALECTICAL_UI_HOST: "127.0.0.1",
      PORT: "3001",
      DIALECTICAL_API_BASE: "http://127.0.0.1:8790",
      NEXT_PUBLIC_API_BASE: "/api"
    });
    await uiProcess.stop();
    expect(runtime.uiChild.terminate).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing or wrong API before starting the UI", async () => {
    for (const api of [
      null,
      { statusCode: 200, contentType: "application/json", body: '{"ready":true}' },
      { statusCode: 401, contentType: "application/json", body: '{"error":"WRONG"}' }
    ]) {
      const runtime = operations({ api });
      await expect(startDevelopmentUiProcess({
        repositoryRoot: process.cwd(),
        commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
        operations: runtime
      })).rejects.toThrow("DEV_UI_PROCESS_API_UNAVAILABLE");
      expect(runtime.startUi).not.toHaveBeenCalled();
    }
  });

  it("refuses any pre-existing port-3001 listener without adopting it", async () => {
    const runtime = operations({ ui: [UI_READY] });
    await expect(startDevelopmentUiProcess({
      repositoryRoot: process.cwd(),
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: runtime
    })).rejects.toThrow("DEV_UI_PROCESS_PORT_OCCUPIED");
    expect(runtime.startUi).not.toHaveBeenCalled();
  });

  it("requires both login-page identity and the exact proxied session denial", async () => {
    for (const ui of [
      { ...UI_READY, login: { ...UI_READY.login, body: "<html>wrong app</html>" } },
      { ...UI_READY, session: { ...API_READY, body: '{"error":"WRONG"}' } }
    ]) {
      const runtime = operations({ ui: [null, ui] });
      await expect(startDevelopmentUiProcess({
        repositoryRoot: process.cwd(),
        commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
        operations: runtime
      })).rejects.toThrow("DEV_UI_PROCESS_READINESS_INVALID");
      expect(runtime.uiChild.terminate).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds readiness, reports early exit, and always cleans up the owned child", async () => {
    const timeout = operations({ ui: [null] });
    await expect(startDevelopmentUiProcess({
      repositoryRoot: process.cwd(),
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: timeout,
      maximumProbeAttempts: 2
    })).rejects.toThrow("DEV_UI_PROCESS_READINESS_TIMEOUT");
    expect(timeout.uiChild.terminate).toHaveBeenCalledTimes(1);

    const exited = operations({ ui: [null, null] });
    exited.startUi.mockImplementationOnce(() => {
      exited.uiChild.exit();
      return exited.uiChild;
    });
    await expect(startDevelopmentUiProcess({
      repositoryRoot: process.cwd(),
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: exited
    })).rejects.toThrow("DEV_UI_PROCESS_EXITED");
    expect(exited.uiChild.terminate).toHaveBeenCalledTimes(1);
  });

  it("exposes one fixed CLI without touching port 3000 or claiming the full stack", async () => {
    const [packageSource, cli, implementation] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-ui-process-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-ui-process.ts", "utf8")
    ]);
    const scripts = JSON.parse(packageSource).scripts as Record<string, string>;
    expect(scripts["dev:auth:ui"]).toBe("tsx apps/runner/src/dev-ui-process-cli.ts");
    expect(scripts["dev:auth:up"]).toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(implementation).toContain('const uiCwd = resolve(repositoryRoot, "apps", "ui")');
    expect(implementation).toContain('["server.mjs", "--dev"]');
    expect(implementation).toContain("{ cwd: uiCwd");
    expect(implementation).toContain(
      'new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"])'
    );
    expect(implementation).toContain("const LOCAL_UI_PORT = 3_001");
    expect(implementation).toContain("PORT: String(LOCAL_UI_PORT)");
    expect(implementation).not.toContain("LOCAL_UI_PORT = 3_000");
    expect(implementation).not.toContain("process.env");
    expect(cli).toContain("DEV_AUTH_UI_READY=127.0.0.1:3001:DENY_DEFAULT_PROXY");
    expect(cli).not.toMatch(/DATABASE_URL|HATCHET_CLIENT_TOKEN|password/iu);
  });
});
