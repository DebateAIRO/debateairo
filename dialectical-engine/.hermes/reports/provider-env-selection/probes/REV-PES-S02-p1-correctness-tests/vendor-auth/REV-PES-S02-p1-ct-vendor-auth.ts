// 8(e) probe (head dfef0de94): the fake vendor admits ONLY the exact literal. Exceeds case 3's two stimuli.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const m = await import(process.env.WORKTREE + "/acceptance/pes-s02-fake-vendor.ts");
const dir = await mkdtemp(join(tmpdir(), "rev-pes-s02-ct-"));
const cert = m.createFixtureCertificate(dir, "/usr/bin/openssl");
const { port, evidence } = m.pickFreePort(m.FAKE_VENDOR_PORT_CANDIDATES, m.isPortListening);
console.log("port", port, evidence);
const vendor = await m.startFakeVendor({ port, ...cert });
const lookup = ((h: string, o: { all?: boolean }, cb: Function) => o.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4)) as never;
const client = m.createTrustingFetch(cert.certPem, lookup);
const url = `${vendor.baseUrl}/chat/completions`;
const cases: [string, Record<string, string> | undefined, string?][] = [
  ["absent", undefined], ["empty", { authorization: "" }], ["scheme only", { authorization: "Bearer" }],
  ["wrong token", { authorization: "Bearer wrong" }], ["lowercase scheme", { authorization: "bearer pes-s02-fake-vendor-token" }],
  ["no scheme", { authorization: "pes-s02-fake-vendor-token" }], ["trailing space", { authorization: "Bearer pes-s02-fake-vendor-token " }],
  ["prefix", { authorization: "Bearer pes-s02-fake-vendor-token-x" }], ["Basic", { authorization: "Basic cGVzOnM=" }],
  ["exact literal", { authorization: m.FAKE_VENDOR_AUTHORIZATION }], ["exact literal on GET", { authorization: m.FAKE_VENDOR_AUTHORIZATION }, "GET"]
];
for (const [name, headers, method] of cases) {
  const r = await client.fetch(url, { method: method ?? "POST", headers, body: method ? undefined : '{"model":"fake-model"}' });
  const body = await r.text();
  console.log(`${name.padEnd(22)} -> ${r.status} ${body.includes("pes-s02-fake-vendor-token") ? "BODY-LEAKS-TOKEN" : body}`);
}
console.log("counts", JSON.stringify(vendor.counts()));
client.destroy(); await vendor.close(); await rm(dir, { recursive: true, force: true });
console.log("after close listening:", m.isPortListening(port));
