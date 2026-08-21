// DR-187 — V-executed one-row register re-baseline (serveContractHash).
// Updates the computed drift-detector checksum to the hash of the
// dual-greenlit serve source, inside one transaction, re-arming the
// append-only trigger before COMMIT. Prints before/after and trigger
// state. Rolls back on any failure. Run per DEBATE-REVIVAL-091b7663.md.
import { createRequire } from "node:module";
const require = createRequire("/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/package.json");
const pg = require("pg");
const { buildAcceptanceRegisterRows } = await import("/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/acceptance/seed-register.ts");

const rows = await buildAcceptanceRegisterRows();
const newHash = rows.find((r: { rowKey: string }) => r.rowKey === "serveContractHash")!.value;
const c = new pg.Client({ host: "127.0.0.1", port: 55432, user: "debateai", password: "debateai-acceptance-local", database: "debateai_acceptance" });
await c.connect();
const before = await c.query("SELECT value_json FROM register.register_row WHERE register_version=1 AND row_key='serveContractHash'");
console.log("before:", String(before.rows[0].value_json).slice(0, 16), "-> after:", String(newHash).slice(0, 16));
try {
  await c.query("BEGIN");
  await c.query("ALTER TABLE register.register_row DISABLE TRIGGER USER");
  const upd = await c.query(
    "UPDATE register.register_row SET value_json=$1::jsonb WHERE register_version=1 AND row_key='serveContractHash'",
    [JSON.stringify(newHash)]
  );
  await c.query("ALTER TABLE register.register_row ENABLE TRIGGER USER");
  await c.query("COMMIT");
  console.log("updated:", upd.rowCount, "row; trigger re-armed inside the same transaction");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
}
const check = await c.query("SELECT value_json FROM register.register_row WHERE register_version=1 AND row_key='serveContractHash'");
console.log("persisted now:", String(check.rows[0].value_json).slice(0, 16), "== source:", String(newHash).slice(0, 16));
const armed = await c.query("SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='register.register_row'::regclass AND NOT tgisinternal");
console.log("trigger states (O = armed):", armed.rows.map((r: { tgname: string; tgenabled: string }) => `${r.tgname}=${r.tgenabled}`).join(", "));
await c.end();
