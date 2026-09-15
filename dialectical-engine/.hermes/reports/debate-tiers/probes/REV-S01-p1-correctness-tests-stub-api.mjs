// REV-S01-p1-correctness-tests — my own stub API. Satisfies SessionSchema and
// AskAcceptedSchema (packages/contract/src/index.ts:148-154, :123-126) and logs every
// request line + body verbatim, so acceptance steps 11-12 can read plan_tier off the wire.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 8794);
const LOG = process.env.REQLOG ?? "/private/tmp/debate-tiers-REV-S01-p1-correctness-tests/api-requests.log";

const SESSION = {
  asker_id: "owner:3f1c2a44-6b7d-4e18-9a2f-51d8c6e70b3a",
  session_id: "8c2f1d64-2a91-4b07-9d3e-77a5b0c14e29",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.url} :: ${body || "(no body)"}`;
    appendFileSync(LOG, line + "\n");
    console.log(line);
    res.setHeader("content-type", "application/json");
    const url = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && url === "/v1/session") {
      res.writeHead(200); res.end(JSON.stringify(SESSION)); return;
    }
    if (req.method === "POST" && url === "/v1/asks") {
      res.writeHead(202); res.end(JSON.stringify({ run_ref: "run:probe-rev-s01", status: "QUEUED" })); return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: "STUB_NO_ROUTE", url }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`stub api on 127.0.0.1:${PORT}`));
