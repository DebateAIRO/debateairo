// ARCH-PES-S02 — THROWAWAY: the default fetch against the fixture's certificate via the LITERAL 127.0.0.1 URL
// (PLAN S02-S13 case 4 and S02-S18 row 6). Which cause code does it reject with?
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "pes-s02-arch-negctl-"));
await writeFile(join(dir, "openssl.cnf"), "[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = api.localtest.me\n[ext]\nsubjectAltName = DNS:api.localtest.me\nbasicConstraints = critical,CA:TRUE\n");
spawnSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-config", join(dir, "openssl.cnf")]);
let port = 0;
for (let p = 4480; p <= 4499; p += 1) { const r = spawnSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" }); if (r.status === 1 && r.stdout === "") { port = p; break; } }
let requests = 0;
const server = createServer({ key: await readFile(join(dir, "key.pem"), "utf8"), cert: await readFile(join(dir, "cert.pem"), "utf8") }, (_q, s) => { requests += 1; s.writeHead(401).end(); });
server.on("tlsClientError", () => undefined);
await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
for (const url of [`https://127.0.0.1:${port}/v1/chat/completions`, `https://api.localtest.me:${port}/v1/chat/completions`]) {
  try { const res = await fetch(url, { method: "POST", body: "{}" }); console.log(`NEGCTL ${url.replace(String(port), "<port>")} RESOLVED status=${res.status}`); }
  catch (e) { console.log(`NEGCTL ${url.replace(String(port), "<port>")} rejected cause=${(e as { cause?: { code?: string } }).cause?.code ?? "?"}`); }
}
console.log(`NEGCTL http requests that reached the handler: ${requests}`);
server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); await rm(dir, { recursive: true, force: true });
