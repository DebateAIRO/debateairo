// ARCH-PES-S02 — THROWAWAY probe: does node:https, given a custom `lookup` that answers ::1 BEFORE 127.0.0.1,
// fall back to 127.0.0.1 when the server listens on 127.0.0.1 only? (PLAN S02-S13 case 6 relies on it.)
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Agent, createServer, request } from "node:https";
import { getDefaultAutoSelectFamily } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LookupFunction } from "node:net";

const dir = await mkdtemp(join(tmpdir(), "pes-s02-arch-ipv6-"));
await writeFile(join(dir, "openssl.cnf"), "[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = api.localtest.me\n[ext]\nsubjectAltName = DNS:api.localtest.me\nbasicConstraints = critical,CA:TRUE\n");
spawnSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-config", join(dir, "openssl.cnf")]);
const key = await readFile(join(dir, "key.pem"), "utf8");
const cert = await readFile(join(dir, "cert.pem"), "utf8");
let port = 0;
for (let p = 4470; p <= 4499; p += 1) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (r.status === 1 && r.stdout === "") { port = p; break; }
}
const server = createServer({ key, cert }, (_req, res) => { res.writeHead(200).end("ok"); });
await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
const calls: string[] = [];
const ipv6First: LookupFunction = (hostname, options, callback) => {
  calls.push(`${hostname} all=${String((options as { all?: boolean }).all)}`);
  const all = [{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }];
  if ((options as { all?: boolean }).all) (callback as (e: null, a: typeof all) => void)(null, all);
  else (callback as (e: null, a: string, f: number) => void)(null, "::1", 6);
};
const agent = new Agent({ ca: [cert], keepAlive: false });
const outcome = await new Promise<string>((resolve) => {
  const req = request(`https://api.localtest.me:${port}/`, { agent, lookup: ipv6First, rejectUnauthorized: true }, (res) => {
    res.resume(); res.on("end", () => resolve(`status=${res.statusCode}`));
  });
  req.on("error", (e: NodeJS.ErrnoException) => resolve(`error=${e.code ?? e.message}`));
  req.end();
});
console.log(`IPV6-FIRST autoSelectFamily default=${getDefaultAutoSelectFamily()} port=${port} outcome=${outcome} lookup-calls=${JSON.stringify(calls)}`);
agent.destroy();
server.closeAllConnections();
await new Promise<void>((r) => server.close(() => r()));
await rm(dir, { recursive: true, force: true });
