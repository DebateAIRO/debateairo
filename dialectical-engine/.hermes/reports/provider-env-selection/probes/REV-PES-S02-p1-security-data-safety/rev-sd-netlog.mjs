// REV-PES-S02-p1-security-data-safety — preload that records every outbound TCP connect and every listen, per process
// and per worker thread, so a suite run proves which ports it touched (R2.11: never :55432, only the fixture's port).
// Use: NODE_OPTIONS="--import=<abs path>" REV_NET_LOG=<abs log> pnpm exec vitest run <files>
import net from "node:net";
import { appendFileSync } from "node:fs";
import { threadId } from "node:worker_threads";
const log = process.env.REV_NET_LOG;
if (log) {
  const tag = () => `pid=${process.pid} tid=${threadId}`;
  appendFileSync(log, `PRELOAD ${tag()}\n`);
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const a = args[0];
    const o = Array.isArray(a) ? a[0] : a;
    const where = typeof o === "object" && o !== null ? (o.path ?? `${o.host ?? "localhost"}:${o.port}`) : `${args[1] ?? "localhost"}:${a}`;
    appendFileSync(log, `CONNECT ${tag()} ${where}\n`);
    return connect.apply(this, args);
  };
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    const a = args[0];
    const where = typeof a === "object" && a !== null ? JSON.stringify({ port: a.port, host: a.host, path: a.path }) : `${args[1] ?? "*"}:${a}`;
    appendFileSync(log, `LISTEN ${tag()} ${where}\n`);
    return listen.apply(this, args);
  };
}
