// REV-S01-p1-product-truth: my own stub API. Satisfies SessionSchema on GET /v1/session
// and AskAcceptedSchema on POST /v1/asks (202). Logs every request line and body verbatim.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const PORT = Number(process.env.STUB_PORT || 8850);
const LOG = process.env.STUB_LOG || "/private/tmp/debate-tiers-REV-S01-p1-product-truth/stub-api.log";
const SESSION = {
  asker_id: "owner:3f2b1c4d-9a6e-4b21-8c7f-1d2e3f4a5b6c",
  session_id: "8a1c2d3e-4f56-4789-b012-3456789abcde",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};
let n = 0;
function log(line) { appendFileSync(LOG, line + "\n"); }
createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const id = ++n;
    log(`#${id} ${new Date().toISOString()} ${req.method} ${req.url}`);
    log(`#${id} headers ${JSON.stringify({ "content-type": req.headers["content-type"] ?? null, cookie: req.headers.cookie ?? null, "x-csrf-token": req.headers["x-csrf-token"] ?? null })}`);
    if (body.length > 0) log(`#${id} BODY ${body}`);
    const url = (req.url || "").split("?")[0];
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && url === "/v1/session") {
      res.writeHead(200); res.end(JSON.stringify(SESSION));
      log(`#${id} -> 200 session`); return;
    }
    if (req.method === "POST" && url === "/v1/asks") {
      const runRef = `rev-p1-run-${id}`;
      res.writeHead(202); res.end(JSON.stringify({ run_ref: runRef, status: "QUEUED" }));
      log(`#${id} -> 202 {"run_ref":"${runRef}","status":"QUEUED"}`); return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: "STUB_NOT_IMPLEMENTED", path: url }));
    log(`#${id} -> 404`);
  });
}).listen(PORT, "127.0.0.1", () => log(`STUB LISTENING 127.0.0.1:${PORT} ${new Date().toISOString()}`));
