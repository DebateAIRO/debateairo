// REV-PES-S02-p1-security-data-safety — the fake vendor's Authorization gate, driven past the author's three cases.
// Root from $WORKTREE (the lane's dialectical-engine dir). Written against slice head dfef0de94.
// Usage: cd $WORKTREE && WORKTREE=$PWD pnpm exec tsx <abs path to this file>
import { mkdtemp, rm } from "node:fs/promises";
import * as tls from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = process.env.WORKTREE;
if (!root) throw new Error("WORKTREE unset");
const m = await import(join(root, "acceptance/pes-s02-fake-vendor.ts"));
const dir = await mkdtemp(join(tmpdir(), "rev-sd-vendor-"));
const cert = m.createFixtureCertificate(dir, "/usr/bin/openssl");
const { port, evidence } = m.pickFreePort(m.FAKE_VENDOR_PORT_CANDIDATES, m.isPortListening);
console.log(`port ${port} (${evidence})`);
const vendor = await m.startFakeVendor({ port, ...cert });
const bind = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim().split("\n").slice(1)
  .map((l) => l.split(/\s+/).slice(-2).join(" "));
console.log(`bound: ${JSON.stringify(bind)}`);
function send(label: string, method: string, path: string, rawHeaders: string[]) {
  // Raw HTTP/1.1 over the fixture's own TLS trust, so duplicate and odd headers reach the server byte for byte.
  return new Promise<void>((resolve) => {
    const before = vendor.counts();
    const body = '{"model":"fake-model","max_tokens":8,"messages":[]}';
    const lines = [`${method} ${path} HTTP/1.1`, `host: ${m.FAKE_VENDOR_HOST}:${port}`, "content-type: application/json",
      `content-length: ${Buffer.byteLength(body)}`, "connection: close"];
    for (let i = 0; i < rawHeaders.length; i += 2) lines.push(`${rawHeaders[i]}: ${rawHeaders[i + 1]}`);
    const socket = tls.connect({ host: "127.0.0.1", port, ca: [cert.certPem], servername: m.FAKE_VENDOR_HOST, rejectUnauthorized: true },
      () => socket.end(lines.join("\r\n") + "\r\n\r\n" + body));
    const chunks: Buffer[] = [];
    socket.on("data", (c) => chunks.push(c));
    socket.on("error", (e) => { console.log(`${label} -> ERROR ${(e as NodeJS.ErrnoException).code}`); resolve(); });
    socket.on("close", () => {
      const raw = Buffer.concat(chunks).toString();
      const status = raw.split(" ")[1];
      const text = raw.split("\r\n\r\n").slice(1).join("");
      const after = vendor.counts();
      const leaks = /pes-s02|Bearer|token|wrong/iu.test(text);
      console.log(`${label.padEnd(40)} -> ${status} body=${JSON.stringify(text)} matched+${after.matched - before.matched} rejected+${after.rejected - before.rejected} body-names-credential=${leaks}`);
      resolve();
    });
  });
}
const L = m.FAKE_VENDOR_AUTHORIZATION;
const P = "/v1/chat/completions";
await send("1 absent", "POST", P, []);
await send("2 wrong token", "POST", P, ["authorization", "Bearer wrong"]);
await send("3 token without scheme", "POST", P, ["authorization", L.slice(7)]);
await send("4 lowercase scheme", "POST", P, ["authorization", L.toLowerCase().replace("bearer", "bearer")]);
await send("5 Basic scheme, same token", "POST", P, ["authorization", `Basic ${L.slice(7)}`]);
await send("6 literal + suffix", "POST", P, ["authorization", `${L}x`]);
await send("7 prefix of literal", "POST", P, ["authorization", L.slice(0, -1)]);
await send("8 empty value", "POST", P, ["authorization", ""]);
await send("9 duplicate [wrong, right]", "POST", P, ["authorization", "Bearer wrong", "authorization", L]);
await send("10 duplicate [right, wrong]", "POST", P, ["authorization", L, "authorization", "Bearer wrong"]);
await send("11 right, trailing space (HTTP OWS)", "POST", P, ["authorization", `${L} `]);
await send("12 right literal, GET", "GET", P, ["authorization", L]);
await send("13 right literal, query string", "POST", `${P}?a=1`, ["authorization", L]);
await send("14 right literal, /v1/models", "POST", "/v1/models", ["authorization", L]);
await send("15 right literal", "POST", P, ["authorization", L]);
await vendor.close();
await rm(dir, { recursive: true, force: true });
console.log(`after close: port ${port} listening=${m.isPortListening(port)}`);
