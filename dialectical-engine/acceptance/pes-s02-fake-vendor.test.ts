import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { X509Certificate } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it, expect } from "vitest";
import {
  FAKE_VENDOR_AUTHORIZATION,
  FAKE_VENDOR_PORT_CANDIDATES,
  createFixtureCertificate,
  createTrustingFetch,
  isPortListening,
  pickFreePort,
  startFakeVendor,
  verifySeamHandshake,
  type FakeVendor
} from "./pes-s02-fake-vendor.js";

function callbackLookup(answer: readonly LookupAddress[] | NodeJS.ErrnoException): LookupFunction {
  return (hostname, options: LookupOptions, callback) => {
    if (answer instanceof Error) { callback(answer, ""); return; }
    if (hostname !== "api.localtest.me") {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), "");
      return;
    }
    if (options.all === true) callback(null, [...answer]);
    else callback(null, answer[0]!.address, answer[0]!.family);
  };
}
const lookupStub = callbackLookup([{ address: "127.0.0.1", family: 4 }]);

const directories: string[] = [];
const vendors = new Set<FakeVendor>();
const clients: ReturnType<typeof createTrustingFetch>[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.destroy();
  try {
    await Promise.all([...vendors].map((vendor) => vendor.close()));
  } finally {
    vendors.clear();
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  }
});

async function certificate() {
  const directory = await mkdtemp(join(tmpdir(), "pes-s02-fake-vendor-"));
  directories.push(directory);
  return { directory, ...createFixtureCertificate(directory, "/usr/bin/openssl") };
}

async function fixture() {
  const material = await certificate();
  const selected = pickFreePort(FAKE_VENDOR_PORT_CANDIDATES, isPortListening);
  const vendor = await startFakeVendor({ port: selected.port, ...material });
  vendors.add(vendor);
  return { ...material, ...selected, vendor };
}

function trustingFetch(certPem: string, lookup: LookupFunction = lookupStub) {
  const client = createTrustingFetch(certPem, lookup);
  clients.push(client);
  return client.fetch;
}

// Property: runtime TLS material stays in its given directory and certifies the fixture hostname as a CA.
// Breaks: rename a material file, change the SAN, or remove CA:TRUE.
it("generates a run-time certificate for api.localtest.me inside the directory it is given", async () => {
  const { directory, certPem } = await certificate();
  expect((await readdir(directory)).sort()).toEqual(["cert.pem", "key.pem", "openssl.cnf"]);
  const cert = new X509Certificate(certPem);
  expect(cert.subjectAltName).toBe("DNS:api.localtest.me");
  expect(cert.ca).toBe(true);
  expect(cert.checkHost("api.localtest.me")).toBe("api.localtest.me");
});

// Property: the exact credential yields the probe's exact successful body and one matched request.
// Breaks: change the URL, success status/body, or matched counter.
it("answers the exact credential literal with the body the shipped probe accepts", async () => {
  const { vendor, port, certPem } = await fixture();
  expect(vendor.baseUrl).toBe(`https://api.localtest.me:${port}/v1`);
  const response = await trustingFetch(certPem)(`${vendor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: FAKE_VENDOR_AUTHORIZATION },
    body: '{"model":"fake-model","max_tokens":8,"messages":[]}'
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('{"model":"fake-model","choices":[{"message":{"content":"OK"}}]}');
  expect(vendor.counts()).toEqual({ matched: 1, rejected: 0 });
});

// Property: absent and wrong credentials are denied without a credential in the body; other routes are absent.
// Breaks: admit either bad credential, change the denial body/status, route GET /models, or drop rejected counts.
it("answers 401 to an absent or a wrong authorization and names no credential", async () => {
  const { vendor, certPem } = await fixture();
  const request = trustingFetch(certPem);
  const absent = await request(`${vendor.baseUrl}/chat/completions`, { method: "POST" });
  expect(absent.status).toBe(401);
  const wrong = await request(`${vendor.baseUrl}/chat/completions`, {
    method: "POST", headers: { authorization: "Bearer not-the-fixture-literal" }
  });
  expect(wrong.status).toBe(401);
  expect(await wrong.text()).toBe('{"error":"unauthorized"}');
  expect((await request(`${vendor.baseUrl}/models`)).status).toBe(404);
  expect(vendor.counts()).toEqual({ matched: 0, rejected: 3 });
});

// Property: global trust and a different CA reject; the fixture CA authorizes a handshake without an HTTP request.
// Breaks: relax verification, use the wrong handshake CA, change the handshake result, or count TLS as HTTP.
it("is trusted only through the fetch built with its own certificate", async () => {
  const { vendor, port, certPem } = await fixture();
  await expect(fetch(`https://127.0.0.1:${port}/v1/chat/completions`, { method: "POST" }))
    .rejects.toMatchObject({ cause: { code: "DEPTH_ZERO_SELF_SIGNED_CERT" } });
  const other = await certificate();
  await expect(trustingFetch(other.certPem)(`${vendor.baseUrl}/chat/completions`, { method: "POST" }))
    .rejects.toThrow();
  await expect(verifySeamHandshake({ port, caPem: certPem, lookup: lookupStub })).resolves.toBe("authorized");
  expect(vendor.counts()).toEqual({ matched: 0, rejected: 0 });
});

// Property: excluded ports are not inspected, occupied candidates are skipped, and closing releases a measured listener.
// Breaks: inspect an excluded port, select an occupied one, misreport lsof evidence/state, or omit server close.
it("measures its port free with lsof before binding and skips every excluded port", async () => {
  const calls: number[] = [];
  const selected = pickFreePort([3000, 4455, 4310, 4460, 4461], (p) => { calls.push(p); return p === 4460; });
  expect(selected.port).toBe(4461);
  expect(calls).toEqual([4460, 4461]);
  const { keyPem, certPem } = await certificate();
  const { port, evidence } = pickFreePort(FAKE_VENDOR_PORT_CANDIDATES, isPortListening);
  expect(isPortListening(port)).toBe(false);
  expect(evidence).toBe(`lsof -nP -iTCP:${port} -sTCP:LISTEN rc=1 lines=0`);
  const vendor = await startFakeVendor({ port, keyPem, certPem });
  vendors.add(vendor);
  expect(isPortListening(port)).toBe(true);
  await vendor.close();
  vendors.delete(vendor);
  expect(isPortListening(port)).toBe(false);
});

// Property: the callback lookup can return IPv6 first while the fixture listens on IPv4.
// Break: disable the request's automatic address-family fallback.
it("reaches the fixture when the resolver answers ::1 before 127.0.0.1", async () => {
  const { vendor, certPem } = await fixture();
  const thatLookup = callbackLookup([{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }]);
  const response = await trustingFetch(certPem, thatLookup)(`${vendor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: FAKE_VENDOR_AUTHORIZATION },
    body: '{"model":"fake-model","max_tokens":8,"messages":[]}'
  });
  expect(response.status).toBe(200);
});
