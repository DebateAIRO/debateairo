import { readFile as realReadFile,writeFile as realWriteFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const root=process.env.GUIDE_BIND37_FIXTURE_ROOT;
const counterPath=process.env.GUIDE_BIND37_COUNTER_PATH;
const revision=process.env.GUIDE_BIND37_REVISION;
const psRow=process.env.GUIDE_BIND37_PS_ROW ?? "";
const counters={ read:0,write:0,exec:0,spawn:0 };
const within=path=>typeof path==="string"&&path.startsWith(`${root}/`);
export async function readFile(path,...args) {
  if (!within(path)) throw new Error("GUIDE_BIND37_CONTROL_READ_FORBIDDEN");
  counters.read+=1;
  return realReadFile(path,...args);
}
export async function writeFile(path,data,options) {
  if (!within(path)) throw new Error("GUIDE_BIND37_CONTROL_WRITE_FORBIDDEN");
  counters.write+=1;
  return realWriteFile(path,data,options);
}
export function execFileSync(file,args) {
  counters.exec+=1;
  if (file==="/usr/bin/git"&&args[0]==="rev-parse") return `${revision}\n`;
  if (file==="/usr/bin/git"&&args[0]==="status") return "";
  if (file==="/bin/ps") return psRow;
  throw new Error("GUIDE_BIND37_CONTROL_EXEC_FORBIDDEN");
}
export function spawnSync(file) {
  counters.spawn+=1;
  if (file==="/usr/bin/curl") return { status:0,stdout:"200",stderr:"" };
  throw new Error("GUIDE_BIND37_CONTROL_SPAWN_FORBIDDEN");
}
process.on("exit",()=>{ if (counterPath) writeFileSync(counterPath,`${JSON.stringify(counters)}\n`,{ mode:0o600 }); });
