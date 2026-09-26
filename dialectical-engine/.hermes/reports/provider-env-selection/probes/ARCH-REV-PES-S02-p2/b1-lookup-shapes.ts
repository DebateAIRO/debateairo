// ARCH-FIX-PES-S02-p2 — THROWAWAY detector for B1 (one `deps.lookup` binding, two call shapes).
// It runs the EXACT code the revised PLAN pastes into S02-S13/S02-S17 (`callbackLookup`) and S02-S18 row 3
// (`resolveAll`), against node:dns `lookup` (the default) and the stubs, and passes the SAME values to
// https.request and tls.connect. It also runs the two defect shapes (mutants M1, M2, M3), which must fail.
import { spawnSync } from "node:child_process";
import { lookup as dnsLookup, promises as dnsPromises } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Agent, createServer, request } from "node:https";
import type { LookupFunction } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:tls";

// ---- PLAN S02-S13 / S02-S17 (verbatim) ----
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

// ---- PLAN S02-S18 row 3 (verbatim) ----
function resolveAll(lookup: LookupFunction, hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, answer) => {
      if (error) reject(error);
      else resolve(answer as LookupAddress[]);
    });
  });
}
// ----

const out: string[] = [];
const say = (s: string) => { out.push(s); console.log(s); };
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | "TIMEOUT"> =>
  Promise.race([p, new Promise<"TIMEOUT">((r) => setTimeout(() => r("TIMEOUT"), ms))]);
const describe = async (label: string, run: () => Promise<string>) => {
  try { say(`${label}: ${await run()}`); } catch (e) {
    const err = e as NodeJS.ErrnoException; say(`${label}: THROW ${err.code ?? ""} ${err.message}`);
  }
};

const dir = await mkdtemp(join(tmpdir(), "pes-s02-archfix-b1-"));
await writeFile(join(dir, "openssl.cnf"), "[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = api.localtest.me\n[ext]\nsubjectAltName = DNS:api.localtest.me\nbasicConstraints = critical,CA:TRUE\n");
spawnSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-config", join(dir, "openssl.cnf")]);
const key = await readFile(join(dir, "key.pem"), "utf8");
const cert = await readFile(join(dir, "cert.pem"), "utf8");
const EXCLUDED = new Set([3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455]);
let port = 0;
for (let p = 4460; p <= 4499; p += 1) {
  if (EXCLUDED.has(p)) continue;
  const r = spawnSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (r.status === 1 && r.stdout === "") { port = p; break; }
}
say(`port ${port} (lsof rc=1 lines=0)`);
const server = createServer({ key, cert }, (_req, res) => { res.writeHead(200).end("ok"); });
await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));

const httpsGet = (lookup: unknown) => new Promise<string>((resolve) => {
  const agent = new Agent({ ca: [cert], keepAlive: false });
  const req = request(`https://api.localtest.me:${port}/`, { agent, lookup: lookup as LookupFunction, rejectUnauthorized: true, timeout: 2000 }, (res) => {
    res.resume(); res.on("end", () => { agent.destroy(); resolve(`status=${res.statusCode}`); });
  });
  req.on("timeout", () => { req.destroy(); agent.destroy(); resolve("req-timeout"); });
  req.on("error", (e: NodeJS.ErrnoException) => { agent.destroy(); resolve(`error=${e.code ?? e.message}`); });
  req.end();
});
const tlsAuth = (lookup: LookupFunction) => new Promise<string>((resolve) => {
  const s = connect({ host: "api.localtest.me", port, ca: [cert], servername: "api.localtest.me", rejectUnauthorized: true, lookup });
  s.on("secureConnect", () => { const a = s.authorized; s.end(); resolve(`authorized=${a}`); });
  s.on("error", (e: NodeJS.ErrnoException) => resolve(`error=${e.code ?? e.message}`));
});

say("== GREEN shapes (the revision) — each must resolve");
await describe("G1 resolveAll(node:dns lookup, api.localtest.me)", async () => (await resolveAll(dnsLookup as LookupFunction, "api.localtest.me")).map((a) => a.address).join(","));
await describe("G2 resolveAll(lookupStub)", async () => (await resolveAll(lookupStub, "api.localtest.me")).map((a) => a.address).join(","));
await describe("G3 resolveAll(callbackLookup(ENOTFOUND))", async () => (await resolveAll(callbackLookup(Object.assign(new Error("getaddrinfo ENOTFOUND api.localtest.me"), { code: "ENOTFOUND" })), "api.localtest.me")).join(","));
await describe("G4 resolveAll(callbackLookup([192.0.2.10]))", async () => (await resolveAll(callbackLookup([{ address: "192.0.2.10", family: 4 }]), "api.localtest.me")).map((a) => a.address).join(","));
await describe("G5 https.request lookup=node:dns lookup", () => httpsGet(dnsLookup));
await describe("G6 https.request lookup=lookupStub", () => httpsGet(lookupStub));
await describe("G7 https.request lookup=callbackLookup([::1,127.0.0.1])", () => httpsGet(callbackLookup([{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }])));
await describe("G8 tls.connect lookup=node:dns lookup", () => tlsAuth(dnsLookup as LookupFunction));
await describe("G9 tls.connect lookup=lookupStub", () => tlsAuth(lookupStub));

say("== MUTANTS (the reviewed shapes) — each must NOT resolve to an address list");
await describe("M1 node:dns lookup(host, {all:true}) with no callback (PLAN p1 row 3)", async () => String(await (dnsLookup as unknown as (h: string, o: object) => unknown)("api.localtest.me", { all: true })));
await describe("M2 https.request lookup=dns.promises.lookup (the spike's function)", () => httpsGet(dnsPromises.lookup));
await describe("M3 resolveAll(dns.promises.lookup)", async () => {
  const r = await withTimeout(resolveAll(dnsPromises.lookup as unknown as LookupFunction, "api.localtest.me"), 2000);
  return r === "TIMEOUT" ? "TIMEOUT (never calls back)" : r.map((a) => a.address).join(",");
});

server.closeAllConnections();
await new Promise<void>((r) => server.close(() => r()));
await rm(dir, { recursive: true, force: true });
const after = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
say(`teardown: scratch removed, port ${port} listening after close: ${after.status === 0}`);
