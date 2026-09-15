import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const PORT = Number(process.argv[2] ?? 8811);
const LOG = process.argv[3] ?? "/private/tmp/debate-tiers-REV-S01-p2-product-truth/stub-api.requests.log";
const SESSION = {
  asker_id: "owner:2f1c9a44-8b7e-4c31-9d2a-77e0b5c31a90",
  session_id: "8c2b1f0e-4a55-4a2e-9c11-2b7d6e4f1a33",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};
let n = 0;
createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    n += 1;
    appendFileSync(LOG, `#${n} ${new Date().toISOString()} ${req.method} ${req.url}\nBODY: ${body}\n\n`);
    const send = (code, obj) => {
      const payload = JSON.stringify(obj);
      res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
      res.end(payload);
    };
    if (req.method === "GET" && req.url.startsWith("/v1/session")) return send(200, SESSION);
    if (req.method === "POST" && req.url.startsWith("/v1/asks")) return send(202, { run_ref: `run-${n}`, status: "QUEUED" });
    return send(404, { error: "STUB_NOT_FOUND", path: req.url });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`stub-api listening on 127.0.0.1:${PORT}`));
