// Occupies every candidate port 4460-4499 on 127.0.0.1 (each measured free first by the caller) so the acceptance
// meets "no free port" through its own lsof measurement. Kill by the PID the caller records.
import net from "node:net";
const servers = [];
for (let p = 4460; p <= 4499; p++) {
  await new Promise((res, rej) => { const s = net.createServer(); s.once("error", rej); s.listen(p, "127.0.0.1", () => { servers.push(s); res(); }); });
}
console.log(`BLOCKED ${servers.length}`);
setInterval(() => {}, 1 << 30);
