import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  startAttestedDevTlsFrontDoor
} from "../../deploy/dev-auth/tls-front-door.mjs";

type HttpProbe = Readonly<{ statusCode: number; contentType: string; body: string }>;
type DevTlsUiProbe = Readonly<{ login: HttpProbe; session: HttpProbe }>;
type DevTlsReadinessOperations = Readonly<{
  isPublicPortOccupied(): Promise<boolean>;
  probePrivateUi(): Promise<DevTlsUiProbe | null>;
  startFrontDoor(): Promise<Readonly<{ port: number; close(): Promise<void> }>>;
  probePublicUi(): Promise<DevTlsUiProbe | null>;
  delay(milliseconds: number): Promise<void>;
}>;

const SESSION_DENIAL = Object.freeze({
  statusCode: 401,
  contentType: "application/json; charset=utf-8",
  body: '{"error":"SESSION_REQUIRED"}'
});
const READY_UI = Object.freeze({
  login: Object.freeze({
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Back to the graph.</body></html>"
  }),
  session: SESSION_DENIAL
});

function operations(input: Readonly<{
  occupied?: boolean;
  privateUi?: DevTlsUiProbe | null;
  publicUi?: readonly (DevTlsUiProbe | null)[];
}> = {}): DevTlsReadinessOperations & Readonly<{
  close: ReturnType<typeof vi.fn>;
  startFrontDoor: ReturnType<typeof vi.fn>;
}> {
  const close = vi.fn(async () => undefined);
  const publicProbes = input.publicUi ?? [READY_UI];
  let publicProbeIndex = 0;
  return {
    isPublicPortOccupied: vi.fn(async () => input.occupied ?? false),
    probePrivateUi: vi.fn(async () => input.privateUi === undefined ? READY_UI : input.privateUi),
    startFrontDoor: vi.fn(async () => Object.freeze({ port: 3000, close })),
    probePublicUi: vi.fn(async () => (
      publicProbes[Math.min(publicProbeIndex++, publicProbes.length - 1)] ?? null
    )),
    delay: vi.fn(async () => undefined),
    close
  };
}

describe("DEV-10D attested trusted local HTTPS front door", () => {
  it("starts only after private readiness and reports ready only after exact trusted HTTPS identity", async () => {
    const runtime = operations();
    const frontDoor = await startAttestedDevTlsFrontDoor({ operations: runtime });

    expect(frontDoor.receipt).toEqual({ origin: "https://localhost:3000", trust: "SYSTEM" });
    expect(runtime.isPublicPortOccupied).toHaveBeenCalledTimes(1);
    expect(runtime.probePrivateUi).toHaveBeenCalledTimes(1);
    expect(runtime.startFrontDoor).toHaveBeenCalledTimes(1);
    expect(runtime.probePublicUi).toHaveBeenCalledTimes(1);
    await frontDoor.stop();
    await frontDoor.stop();
    expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it("refuses an occupied public port or wrong private identity without starting or adopting anything", async () => {
    const occupied = operations({ occupied: true });
    await expect(startAttestedDevTlsFrontDoor({ operations: occupied }))
      .rejects.toThrow("DEV_TLS_PUBLIC_PORT_OCCUPIED");
    expect(occupied.probePrivateUi).not.toHaveBeenCalled();
    expect(occupied.startFrontDoor).not.toHaveBeenCalled();

    for (const privateUi of [
      null,
      { ...READY_UI, login: { ...READY_UI.login, body: "<html>wrong app</html>" } },
      { ...READY_UI, session: { ...SESSION_DENIAL, body: '{"error":"WRONG"}' } }
    ]) {
      const runtime = operations({ privateUi });
      await expect(startAttestedDevTlsFrontDoor({ operations: runtime }))
        .rejects.toThrow("DEV_TLS_PRIVATE_UI_UNAVAILABLE");
      expect(runtime.startFrontDoor).not.toHaveBeenCalled();
    }
  });

  it("rejects wrong public identity and closes only the owned front door", async () => {
    for (const publicUi of [
      [{ ...READY_UI, login: { ...READY_UI.login, body: "<html>wrong app</html>" } }],
      [{ ...READY_UI, session: { ...SESSION_DENIAL, statusCode: 200 } }]
    ]) {
      const runtime = operations({ publicUi });
      await expect(startAttestedDevTlsFrontDoor({ operations: runtime }))
        .rejects.toThrow("DEV_TLS_PUBLIC_READINESS_INVALID");
      expect(runtime.close).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds public readiness and cleans up the owned front door on timeout", async () => {
    const runtime = operations({ publicUi: [null] });
    await expect(startAttestedDevTlsFrontDoor({
      operations: runtime,
      maximumProbeAttempts: 2
    })).rejects.toThrow("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
    expect(runtime.probePublicUi).toHaveBeenCalledTimes(2);
    expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it("uses normal system trust for the public probe and emits readiness only after attestation", async () => {
    const source = await readFile("deploy/dev-auth/tls-front-door.mjs", "utf8");
    expect(source).toContain('host: "localhost"');
    expect(source).toContain('path: "/api/v1/session"');
    expect(source).toContain('getCACertificates("system")');
    expect(source).toContain("setDefaultCACertificates");
    expect(source).not.toMatch(/rejectUnauthorized\s*:/u);
    expect(source).not.toMatch(/\bca\s*:/u);
    expect(source.indexOf("await startAttestedDevTlsFrontDoor"))
      .toBeLessThan(source.indexOf("DEV_TLS_FRONT_DOOR_READY"));
  });
});
