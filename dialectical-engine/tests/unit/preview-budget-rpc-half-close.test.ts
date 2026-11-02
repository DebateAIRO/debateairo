// NV-58 (security audit run 3, cluster K16): the API's fast language check gives up at its own short limit (1-15 s),
// far inside the preview gate's 1,200 s call deadline. Its IPC port used to answer that abort with request.destroy()
// even after the whole request reached the gate, so a call the gate had already dispatched and settled met a closed
// peer, the 200 write failed, and the gate halted the team's Anthropic spending gate (ipc_or_delivery_failure). With
// onAbort "HALF_CLOSE" the port half-closes instead: before dispatch the gate reads the FIN as a cancel and sends
// nothing; after dispatch its reply is read and dropped. Every other caller keeps "DESTROY", today's behaviour.
//
// The stand-in gate below mimics the Python gate on a real unix socket (no network): it keeps writing after the peer's
// FIN (allowHalfOpen), notes whether it saw that FIN before it replies, and records whether its reply could be written.
// The abort is started by the stand-in gate itself once it holds the full body, so no case depends on a wall-clock race.
import { createServer, type Server, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPreviewBudgetRpcPort,
  createPreviewBudgetRpcPorts,
  type PreviewBudgetPort,
  type PreviewProviderTestConfig
} from "@debateai/providers";

type Outcome = Readonly<{ endBeforeWrite: boolean; writeError: Error | null; destroyedBeforeWrite: boolean }>;
type StandIn = Readonly<{
  socket: string;
  config: PreviewProviderTestConfig;
  /** Settles once the gate has replied (or found it could not), 300 ms after it held the full body. */
  outcome: Promise<Outcome>;
  state: { connections: number; fullBodies: number; writes: number };
}>;

const servers: Server[] = [];
const connections: Socket[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const REPLY = "{\"status\":200,\"body\":\"{}\"}";
const execution = Object.freeze({
  operationId: "op-1", requestBody: "{}", requestSha256: "0".repeat(64), reservedUsd: "0.01"
});

async function standInGate(onFullBody: () => void = () => undefined): Promise<StandIn> {
  const directory = await mkdtemp(join(tmpdir(), "pvh-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const state = { connections: 0, fullBodies: 0, writes: 0 };
  let settle: (outcome: Outcome) => void = () => undefined;
  const outcome = new Promise<Outcome>((resolve) => { settle = resolve; });
  const server = createServer({ allowHalfOpen: true }, (connection) => {
    connections.push(connection);
    state.connections += 1;
    let buffered = Buffer.alloc(0);
    let sawEnd = false;
    let full = false;
    let socketError: Error | null = null;
    connection.on("error", (error) => { socketError = error; });
    connection.on("end", () => { sawEnd = true; });
    connection.on("data", (chunk: Buffer) => {
      if (full) return;
      buffered = Buffer.concat([buffered, chunk]);
      const headerEnd = buffered.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = Number(/content-length:\s*(\d+)/iu.exec(buffered.subarray(0, headerEnd).toString("latin1"))?.[1]);
      if (!Number.isSafeInteger(length) || buffered.length < headerEnd + 4 + length) return;
      full = true;
      state.fullBodies += 1;
      // The full body received: the caller now gives up (its own test-owned AbortController).
      onFullBody();
      setTimeout(() => {
        const endBeforeWrite = sawEnd;
        if (connection.destroyed) {
          settle({ endBeforeWrite, writeError: socketError, destroyedBeforeWrite: true });
          return;
        }
        state.writes += 1;
        connection.write(
          `HTTP/1.0 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(REPLY)}\r\n\r\n${REPLY}`,
          (error) => {
            settle({ endBeforeWrite, writeError: error ?? socketError, destroyedBeforeWrite: false });
            connection.end();
          }
        );
      }, 300);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  // The socket path pattern is enforced by the env parser; these ports are built directly.
  const config = Object.freeze({
    deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
    budget_socket: socket, scope_id: "fixture-scope"
  }) as unknown as PreviewProviderTestConfig;
  return Object.freeze({ socket, config, outcome, state });
}

/** Runs one call whose caller aborts once the gate holds the full body; reports what the caller and the gate saw. */
async function abortAfterFullBody(portFor: (gate: StandIn) => PreviewBudgetPort | undefined): Promise<Readonly<{
  rejection: unknown; wroteAtRejection: number; outcome: Outcome;
}>> {
  const controller = new AbortController();
  const gate = await standInGate(() => controller.abort());
  const port = portFor(gate);
  if (port === undefined) throw new Error("expected a port");
  const settled = await port.execute(execution, controller.signal).then(
    () => { throw new Error("expected the aborted call to reject"); },
    (rejection: unknown) => ({ rejection, wroteAtRejection: gate.state.writes })
  );
  return Object.freeze({ ...settled, outcome: await gate.outcome });
}

describe("NV-58: a caller that half-closes on its own abort never makes the gate lose a paid reply", () => {
  it("half-close: rejects at once, the gate reads the FIN before its reply, and the reply is delivered", async () => {
    const result = await abortAfterFullBody((gate) =>
      createPreviewBudgetRpcPort(gate.config, gate.socket, undefined, { onAbort: "HALF_CLOSE" }));
    expect(result.rejection).toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
    expect(result.wroteAtRejection).toBe(0);
    // The gate's pre-dispatch check would read a cancel, and a reply after dispatch reaches a socket still reading.
    expect(result.outcome).toEqual({ endBeforeWrite: true, writeError: null, destroyedBeforeWrite: false });
  });

  it("createPreviewBudgetRpcPorts hands the option to its ports", async () => {
    const result = await abortAfterFullBody((gate) =>
      createPreviewBudgetRpcPorts(gate.config, { onAbort: "HALF_CLOSE" }).deepinfra);
    expect(result.rejection).toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
    expect(result.wroteAtRejection).toBe(0);
    expect(result.outcome).toEqual({ endBeforeWrite: true, writeError: null, destroyedBeforeWrite: false });
  });

  it("default keeps today's behaviour: the port destroys, so a reply after the abort cannot be delivered", async () => {
    for (const portFor of [
      (gate: StandIn) => createPreviewBudgetRpcPort(gate.config, gate.socket),
      (gate: StandIn) => createPreviewBudgetRpcPorts(gate.config).deepinfra
    ]) {
      const result = await abortAfterFullBody(portFor);
      expect(result.rejection).toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
      expect(result.wroteAtRejection).toBe(0);
      expect(result.outcome.writeError !== null || result.outcome.destroyedBeforeWrite).toBe(true);
    }
  });

  it("an abort before the body is written still destroys: the gate never holds a full body and never replies", async () => {
    const gate = await standInGate();
    const controller = new AbortController();
    controller.abort();
    await expect(createPreviewBudgetRpcPort(gate.config, gate.socket, undefined, { onAbort: "HALF_CLOSE" })
      .execute(execution, controller.signal)).rejects.toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
    // A reply could only come 300 ms after a full body; give a connection that was opened time to show one.
    await new Promise((done) => setTimeout(done, 400));
    expect(gate.state.fullBodies).toBe(0);
    expect(gate.state.writes).toBe(0);
  });
});
