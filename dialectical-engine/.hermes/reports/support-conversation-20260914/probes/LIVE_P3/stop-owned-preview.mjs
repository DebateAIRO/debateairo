import { spawnSync } from "node:child_process";

const pid = 86341;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve,ms));
process.kill(pid,"SIGTERM");
let exited = false;
for (let attempt = 0;attempt < 120;attempt += 1) {
  try { process.kill(pid,0); } catch { exited = true; break; }
  await wait(100);
}
if (!exited) throw new Error("LIVE_P3_OWNED_SUPERVISOR_DID_NOT_EXIT");
const result = spawnSync("lsof",[
  "-nP","-iTCP:3000","-iTCP:3001","-iTCP:3100","-iTCP:3101",
  "-iTCP:8790","-iTCP:8793","-iTCP:8794","-iTCP:8795","-iTCP:8796",
  "-iTCP:8890","-iTCP:8891","-iTCP:8892","-iTCP:8893","-iTCP:8894","-iTCP:8895","-iTCP:8896","-sTCP:LISTEN"
],{ encoding:"utf8" });
if (![0,1].includes(result.status ?? -1) || result.error !== undefined) {
  throw new Error("LIVE_P3_POST_STOP_LISTENER_INVENTORY_FAILED");
}
const ports = [...result.stdout.matchAll(/TCP 127\.0\.0\.1:(\d+) \(LISTEN\)/gu)]
  .map((match) => Number(match[1]));
const preview = [3100,3101,8890,8891,8892,8893,8894,8895,8896];
const original = [3000,3001,8790,8793,8794,8795,8796];
if (preview.some((port) => ports.includes(port)) || original.some((port) => !ports.includes(port))) {
  throw new Error("LIVE_P3_SCOPED_STOP_LISTENER_MISMATCH");
}
process.stdout.write(JSON.stringify({
  stoppedOwnedSupervisor:pid,previewListenersAbsent:preview,
  originalListenersPreserved:original,observedAt:new Date().toISOString()
},null,2) + "\n");
