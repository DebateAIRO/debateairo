import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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

async function scratch() {
  const directory = await mkdtemp(join(tmpdir(), "pes-s02-fake-vendor-"));
  directories.push(directory);
  return directory;
}

async function certificate() {
  const directory = await scratch();
  return { directory, ...(await createFixtureCertificate(directory)) };
}

async function fixture() {
  const material = await certificate();
  const selected = await pickFreePort(FAKE_VENDOR_PORT_CANDIDATES, isPortListening);
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
  const selected = await pickFreePort([3000, 4455, 4310, 4460, 4461], async (p) => { calls.push(p); return p === 4460; });
  expect(selected.port).toBe(4461);
  expect(calls).toEqual([4460, 4461]);
  const { keyPem, certPem } = await certificate();
  const { port, evidence } = await pickFreePort(FAKE_VENDOR_PORT_CANDIDATES, isPortListening);
  expect(await isPortListening(port)).toBe(false);
  expect(evidence).toBe(`lsof -nP -iTCP:${port} -sTCP:LISTEN rc=1 lines=0`);
  const vendor = await startFakeVendor({ port, keyPem, certPem });
  vendors.add(vendor);
  expect(await isPortListening(port)).toBe(true);
  await vendor.close();
  vendors.delete(vendor);
  expect(await isPortListening(port)).toBe(false);
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

// Property: openssl and lsof are deduced by NAME, and a file that is not a program is refused, never started.
// Breaks: spawn a candidate before admitting it, or let a shell read it as a script (2026-09-17).
it("refuses an openssl or lsof on PATH that is not a program, and never starts it", async () => {
  const bin = await scratch();
  const marker = join(bin, "ran");
  for (const name of ["openssl", "lsof"]) {
    await writeFile(join(bin, name), `: > ${JSON.stringify(marker)}\n`, { mode: 0o755 });
  }
  const material = await scratch();
  await expect(createFixtureCertificate(material, { PATH: bin })).rejects.toMatchObject({
    message: "PES_S02_OPENSSL_UNAVAILABLE",
    cause: { message: `PES_S02_OPENSSL_UNAVAILABLE:NOT_A_PROGRAM:${join(bin, "openssl")}` }
  });
  await expect(isPortListening(4460, { PATH: bin })).rejects.toMatchObject({
    message: "PES_S02_LSOF_UNAVAILABLE",
    cause: { message: `PES_S02_LSOF_UNAVAILABLE:NOT_A_PROGRAM:${join(bin, "lsof")}` }
  });
  expect(existsSync(marker)).toBe(false);
  expect(await readdir(material)).toEqual([]);
});

// Property: the file admitted is the file started, found on the PATH handed in and never re-resolved by name.
// Breaks: admit the tool, then spawn its bare name (the child would start the host's own copy instead).
it("starts exactly the openssl and lsof it admitted from the PATH it was handed", async () => {
  const bin = await scratch();
  const marker = (name: string) => join(bin, `${name}-ran`);
  for (const [name, status] of [["lsof", 1], ["openssl", 3]] as const) {
    await writeFile(join(bin, name), [
      `#!${process.execPath}`,
      `require("node:fs").writeFileSync(${JSON.stringify(marker(name))}, "");`,
      `process.exit(${status});`
    ].join("\n") + "\n", { mode: 0o755 });
  }
  expect(await isPortListening(4460, { PATH: bin })).toBe(false);
  await expect(createFixtureCertificate(await scratch(), { PATH: bin }))
    .rejects.toMatchObject({ message: "PES_S02_OPENSSL_RC_3" });
  expect(existsSync(marker("lsof"))).toBe(true);
  expect(existsSync(marker("openssl"))).toBe(true);
});

// Property: a host without the tool fails with the tool's own code and names what it looked for.
// Breaks: fall back to a compiled-in path such as /usr/bin/openssl.
it("fails loudly when openssl or lsof is not on PATH, and never falls back to a fixed path", async () => {
  const empty = await scratch();
  await expect(createFixtureCertificate(await scratch(), { PATH: empty })).rejects.toMatchObject({
    message: "PES_S02_OPENSSL_UNAVAILABLE",
    cause: { message: "PES_S02_OPENSSL_UNAVAILABLE:NOT_ON_PATH:openssl" }
  });
  await expect(isPortListening(4460, { PATH: empty })).rejects.toMatchObject({
    message: "PES_S02_LSOF_UNAVAILABLE",
    cause: { message: "PES_S02_LSOF_UNAVAILABLE:NOT_ON_PATH:lsof" }
  });
});
