import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { clientIpNetworkScope, normalizeClientIp } from "../../apps/api/src/client-ip.js";
import {
  createSupportKeyPort, type SupportKeyPort
} from "../../apps/api/src/support/keys.js";
import { supportHarness } from "../support/supportHarness.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

function fixtureAskApplication(): AskApplication {
  return {
    withContentLease: async (_runId: string, use: () => unknown) => use(),
    submit: async () => ({ run_ref: "00000000-0000-4000-8000-000000000000", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session: unknown, limit: number, offset: number) =>
      ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () =>
      ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () { return; }
  } as unknown as AskApplication;
}

/**
 * DL5-F3. Support wrote a plain `sha256(client_ip)` into two append-only,
 * never-pruned tables (`support.abuse_event`, `support.admission_event`). The
 * whole IPv4 space is 2^32 digests: anyone who can read the support schema — a
 * database co-tenant, or anyone holding a backup — inverts every row and
 * recovers the source address of every anonymous support conversation, every
 * injection classification, and, through the plaintext `identity_owner_ref`,
 * the addresses of signed-in accounts. Pseudonymous in name only.
 *
 * The digest is keyed now, under a key derived from the support KEK — custody
 * material that never leaves the host — so the value is a pseudonym nobody can
 * invert without that key. The scope is the IPv6 /64 rather than the full
 * 128-bit address, so one /64 can no longer mint unlimited distinct identities
 * and walk around the per-source windows.
 */
const temporaryRoots: string[] = [];
const ports: SupportKeyPort[] = [];

async function makePort(material: Buffer = Buffer.alloc(32, 0x51)): Promise<SupportKeyPort> {
  const root = await mkdtemp(join(tmpdir(), "debateai-dl5-f3-"));
  temporaryRoots.push(root);
  const directory = join(root, "secrets");
  await mkdir(directory, { mode: 0o700 });
  const supportKekPath = join(directory, "support-kek.bin");
  await writeFile(supportKekPath, material, { mode: 0o600 });
  const port = await createSupportKeyPort({ supportKekPath });
  ports.push(port);
  return port;
}

afterEach(async () => {
  await Promise.all(ports.splice(0).map((port) => port.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("DL5-F3 the stored source pseudonym is keyed", () => {
  it("is not the bare digest of the address, and changes with the key", async () => {
    const first = await makePort(Buffer.alloc(32, 0x51));
    const second = await makePort(Buffer.alloc(32, 0x52));
    const bare = createHash("sha256").update("1.2.3.4", "utf8").digest("hex");
    expect(first.sourcePseudonym("1.2.3.4")).not.toBe(bare);
    expect(first.sourcePseudonym("1.2.3.4")).not.toBe(second.sourcePseudonym("1.2.3.4"));
    // Stable under the same key, and in the column's grammar.
    expect(first.sourcePseudonym("1.2.3.4")).toBe(first.sourcePseudonym("1.2.3.4"));
    expect(first.sourcePseudonym("1.2.3.4")).toMatch(/^[0-9a-f]{64}$/u);
    // Different sources stay different: the windows still work.
    expect(first.sourcePseudonym("1.2.3.4")).not.toBe(first.sourcePseudonym("1.2.3.5"));
  });

  it("refuses an empty source and refuses to answer once the port is closed", async () => {
    const port = await makePort();
    expect(() => port.sourcePseudonym("")).toThrowError(
      expect.objectContaining({ code: "SUPPORT_SOURCE_VALUE_INVALID" })
    );
    await port.close();
    expect(() => port.sourcePseudonym("1.2.3.4")).toThrowError(
      expect.objectContaining({ code: "SUPPORT_KEY_PORT_CLOSED" })
    );
  });

  it("scopes IPv6 to its /64 and leaves IPv4 whole", () => {
    const scope = (value: string) => clientIpNetworkScope(normalizeClientIp(value) ?? "unknown");
    // One /64, any number of addresses inside it: one scope.
    expect(scope("2001:db8:1:2::1")).toBe(scope("2001:db8:1:2:ffff:ffff:ffff:ffff"));
    expect(scope("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    // The next /64 is a different source.
    expect(scope("2001:db8:1:3::1")).not.toBe(scope("2001:db8:1:2::1"));
    // IPv4, including the IPv4-mapped spelling, is its own whole address.
    expect(scope("203.0.113.5")).toBe("203.0.113.5");
    expect(scope("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(scope("203.0.113.6")).not.toBe(scope("203.0.113.5"));
    // A value that is not an address is its own scope, never merged with one.
    expect(clientIpNetworkScope("unknown")).toBe("unknown");
  });

  it("gives every address in one /64 the same pseudonym, and the next /64 another", async () => {
    const port = await makePort();
    const pseudonym = (value: string) =>
      port.sourcePseudonym(clientIpNetworkScope(normalizeClientIp(value) ?? "unknown"));
    expect(pseudonym("2001:db8:1:2::1")).toBe(pseudonym("2001:db8:1:2:a:b:c:d"));
    expect(pseudonym("2001:db8:1:3::1")).not.toBe(pseudonym("2001:db8:1:2::1"));
  });
});

describe("DL5-F3 the support routes record the keyed pseudonym", () => {
  const harness = () => {
    const support = supportHarness();
    const api = buildApi({
      application: fixtureAskApplication(),
      support: support.application,
      allowedOrigin: TEST_APP_ORIGIN
    });
    return Object.freeze({ api, support, close: async () => api.close() });
  };

  it("pseudonymises the source at the /64, and writes no bare digest", async () => {
    const h = harness();
    try {
      const created = await h.api.inject({
        method: "POST", url: "/v1/support/sessions", headers: { origin: TEST_APP_ORIGIN },
        remoteAddress: "2001:db8:1:2::9", payload: { language: "en" }
      });
      expect(created.statusCode).toBe(201);
      // The repository saw the keyed value for the /64, never `sha256(address)`.
      expect(h.support.spies.sourcePseudonym).toHaveBeenCalledWith("2001:db8:1:2::/64");
      const [admitted] = h.support.spies.admitIpSession.mock.calls;
      expect((admitted?.[0] as { ipSha256: string }).ipSha256).toBe("keyed:2001:db8:1:2::/64");
      expect((admitted?.[0] as { ipSha256: string }).ipSha256)
        .not.toBe(createHash("sha256").update("2001:db8:1:2::9", "utf8").digest("hex"));

      // A second address in the same /64 is the same source, not a fresh one.
      await h.api.inject({
        method: "POST", url: "/v1/support/sessions", headers: { origin: TEST_APP_ORIGIN },
        remoteAddress: "2001:db8:1:2:a:b:c:d", payload: { language: "en" }
      });
      const scopes = h.support.spies.admitIpSession.mock.calls
        .map((call) => (call[0] as { ipSha256: string }).ipSha256);
      expect(new Set(scopes).size).toBe(1);

      // And an IPv4 caller keeps its own whole address as the scope.
      await h.api.inject({
        method: "POST", url: "/v1/support/sessions", headers: { origin: TEST_APP_ORIGIN },
        remoteAddress: "203.0.113.5", payload: { language: "en" }
      });
      expect(h.support.spies.sourcePseudonym).toHaveBeenCalledWith("203.0.113.5");
    } finally {
      await h.close();
    }
  });

  it("pseudonymises the source on the message route too", async () => {
    const h = harness();
    try {
      const created = await h.api.inject({
        method: "POST", url: "/v1/support/sessions", headers: { origin: TEST_APP_ORIGIN },
        remoteAddress: "198.51.100.7", payload: { language: "en" }
      });
      const body = created.json() as Readonly<{
        session: Readonly<{ session_id: string }>;session_token: string;
      }>;
      h.support.spies.sourcePseudonym.mockClear();
      const answered = await h.api.inject({
        method: "POST",
        url: `/v1/support/sessions/${body.session.session_id}/messages`,
        remoteAddress: "198.51.100.7",
        headers: { "x-support-session-token": body.session_token, origin: TEST_APP_ORIGIN },
        payload: { text: "how do I change my password?" }
      });
      expect(answered.statusCode).toBeLessThan(500);
      expect(h.support.spies.sourcePseudonym).toHaveBeenCalledWith("198.51.100.7");
      const [admitted] = h.support.spies.admitMessage.mock.calls;
      expect((admitted?.[0] as { ipSha256: string }).ipSha256).toBe("keyed:198.51.100.7");
    } finally {
      await h.close();
    }
  });
});
