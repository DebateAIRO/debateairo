/* REV(S01) p1 security lens — my own stub API. Logs every request body VERBATIM so
   SPEC-v2 §2 steps 11-12 (what POST /v1/asks actually carries) are measured, not argued.
   Binds 127.0.0.1 only. Touches no database, no :3000, no :8790. */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const PORT = Number(process.argv[2] ?? 8796);
const WIRE = process.argv[3] ?? "/private/tmp/debate-tiers-REV-S01-p1-security-data-safety/logs/wire.log";

const SESSION = {
  asker_id: "owner:8f14e45f-ceea-467a-9575-2b5a1ba9cca6",
  session_id: "8f14e45f-ceea-4a7a-9575-2b5a1ba9cca6",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.url} :: ${body || "(no body)"}\n`;
    appendFileSync(WIRE, line);
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(obj));
    };
    const path = (req.url ?? "").split("?")[0];
    if (path === "/v1/session") return send(200, SESSION);
    if (path === "/v1/asks" && req.method === "POST") {
      appendFileSync(WIRE, `>>> ASK BODY: ${body}\n`);
      return send(202, { run_ref: "run:rev-s01-security-probe", status: "QUEUED" });
    }
    if (path === "/v1/deployment") {
      return send(200, {
        register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
        fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
      });
    }
    return send(404, { error: "NOT_FOUND", path });
  });
}).listen(PORT, "127.0.0.1", () => {
  appendFileSync(WIRE, `--- stub api up on 127.0.0.1:${PORT} at ${new Date().toISOString()} ---\n`);
  console.log(`stub api on 127.0.0.1:${PORT}`);
});
