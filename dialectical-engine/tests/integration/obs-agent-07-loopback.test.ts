import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderStatus } from "../../apps/observation-agent/src/oactl/core/status.js";
import {
  createObservationSignalRouter
} from "../../apps/observation-agent/src/modules/routing/router.js";
import {
  toStoredModuleStatusProjection,
  writeStatusSnapshot
} from "../../apps/observation-agent/src/store/status.js";
import {
  createStatusPageRequestHandler,
  startStatusPage
} from "../../apps/observation-agent/src/modules/status-page/status-page.js";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-status-"));
  scratchDirectories.push(path);
  await mkdir(path, { recursive: true, mode: 0o700 });
  await writeStatusSnapshot(path, {
    pid: 732, version: "0.1.0", thresholds_version: 7, mute: null,
    components: { postgres: {
      state: "UP", last_probe_at: "2026-09-05T09:00:00.000Z",
      last_ok_at: "2026-09-05T09:00:00.000Z", open_signal_ids: []
    } }
  });
  return path;
}

function responseRecorder() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body = "";
  return {
    response: {
      writeHead(code: number, incoming: Record<string, string>) {
        statusCode = code;
        Object.assign(headers, incoming);
        return this;
      },
      end(value?: string) { body = value ?? ""; return this; }
    },
    result: () => ({ statusCode, headers, body })
  };
}

describe("OBS-07 loopback status server", () => {
  it("renders the exact storm line and gives the loopback endpoint one status owner", async () => {
    const stateDir = await scratch();
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: {
        async attempt(action) {
          return Object.freeze({
            delivery_id: crypto.randomUUID(),
            signal_id: action.signal.signal_id,
            channel: action.channel,
            attempted_at: action.now.toISOString(),
            delivered_at: null,
            outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
            external_ref: null
          });
        }
      },
      executors: {
        osascript: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (_signal, now) => ({ deliveredAt: now, externalRef: null })
      },
      configuration: {},
      thresholds: { storm_count: 5, storm_window_s: 60 },
      thresholdVersion: 7
    });
    await writeStatusSnapshot(stateDir, {
      pid: 732,
      version: "0.1.0",
      thresholds_version: 7,
      mute: null,
      components: {},
      modules: {
        routing: router.status().map(toStoredModuleStatusProjection),
        "status-page": [{ kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" }]
      }
    });
    const lines = (await renderStatus(stateDir)).split("\n");
    expect.soft(lines.filter((line) => line === "storm 5/60s")).toHaveLength(1);
    expect.soft(lines.filter((line) => line === "status http://127.0.0.1:9797/status"))
      .toHaveLength(1);
    expect(lines).not.toContain("storm threshold 5/60s");
  });

  it("binds exactly 127.0.0.1:9797 and rejects every configured alternative", async () => {
    const stateDir = await scratch();
    const listens: unknown[] = [];
    const server = await startStatusPage({
      stateDir,
      host: "127.0.0.1",
      port: 9797,
      createServer() {
        return {
          listen(port, host, ready) { listens.push([port, host]); ready(); return this; },
          close() { return this; },
          once() { return this; },
          removeListener() { return this; }
        };
      }
    });
    expect(listens).toEqual([[9797, "127.0.0.1"]]);
    server.close();
    await expect(startStatusPage({ stateDir, host: "0.0.0.0", port: 9797 }))
      .rejects.toThrow("OBSERVATION_STATUS_BIND_INVALID");
    await expect(startStatusPage({ stateDir, host: "127.0.0.1", port: 9798 }))
      .rejects.toThrow("OBSERVATION_STATUS_BIND_INVALID");
  });

  it("serves only /status and /status.json from one validated private snapshot", async () => {
    const handler = createStatusPageRequestHandler({ stateDir: await scratch() });
    const jsonResponse = responseRecorder();
    await handler({ method: "GET", url: "/status.json" }, jsonResponse.response);
    expect(jsonResponse.result().statusCode).toBe(200);
    expect(jsonResponse.result().headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(jsonResponse.result().body)).toMatchObject({ pid: 732, thresholds_version: 7 });

    const htmlResponse = responseRecorder();
    await handler({ method: "GET", url: "/status" }, htmlResponse.response);
    expect(htmlResponse.result()).toMatchObject({ statusCode: 200 });
    expect(htmlResponse.result().body).toContain("postgres");

    const missing = responseRecorder();
    await handler({ method: "GET", url: "/private" }, missing.response);
    expect(missing.result()).toMatchObject({ statusCode: 404, body: "Not Found\n" });
  });

  it("rejects an asynchronous listen error as a typed startup failure", async () => {
    const stateDir = await scratch();
    let errorListener: ((error: Error) => void) | undefined;
    const outcome = await Promise.race([
      startStatusPage({
        stateDir,
        createServer() {
          return {
            listen() {
              queueMicrotask(() => errorListener?.(new Error("EADDRINUSE")));
              return this;
            },
            close() { return this; },
            once(event: string, listener: (error: Error) => void) {
              if (event === "error") errorListener = listener;
              return this;
            },
            removeListener(event: string, listener: (error: Error) => void) {
              if (event === "error" && errorListener === listener) errorListener = undefined;
              return this;
            }
          };
        }
      }).then(() => "READY", (error: unknown) => error),
      new Promise<string>((resolvePromise) => {
        setTimeout(() => resolvePromise("HUNG"), 25);
      })
    ]);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain("OBSERVATION_STATUS_BIND_FAILED");
    expect(errorListener).toBeUndefined();
  });
});
