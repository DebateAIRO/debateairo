import { execFileSync } from "node:child_process";
import { stat,writeFile } from "node:fs/promises";

const revision = "475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9";
const pid = 6142;
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const profileRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/LIVE_P3/browser-profile";
const receiptPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/LIVE_P3-idle-custody.json";
const previewPorts = [3100,3101,8890,8891,8892,8893,8894,8895,8896];
const originalPorts = [3000,3001,8790,8793,8794,8795,8796];
const run = (file,args,options = {}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();

const idleStartedAt = new Date().toISOString();
await new Promise((resolve) => setTimeout(resolve,10_000));
const idleCompletedAt = new Date().toISOString();

const processLine = run("/bin/ps",["-o","pid=,ppid=,pgid=,stat=,command=","-p",String(pid)]);
const processFields = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(processLine);
if (processFields === null) throw new Error("LIVE_P3_IDLE_PROCESS_SHAPE_INVALID");
const supervisorProcess = {
  pid:Number(processFields[1]),
  ppid:Number(processFields[2]),
  pgid:Number(processFields[3]),
  state:processFields[4],
  command:processFields[5]
};
const supervisorCwd = run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
const head = run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const status = run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot });
const tlsStatus = Number(run("/usr/bin/curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/help"
]));

function listenerCount(port) {
  try {
    return run("/usr/sbin/lsof",[
      "-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"
    ]).split("\n").filter((line) => /^p[0-9]+$/u.test(line)).length;
  } catch {
    return 0;
  }
}

let browserProfilePresent = true;
try { await stat(profileRoot); } catch { browserProfilePresent = false; }
const receipt = {
  schema_version:1,
  revision,
  idle_started_at:idleStartedAt,
  idle_completed_at:idleCompletedAt,
  idle_seconds:10,
  supervisor:supervisorProcess,
  supervisor_cwd:supervisorCwd,
  expected_supervisor:{ pid,ppid:1,pgid:pid },
  head,
  product_status_clean:status.length === 0,
  ordinary_system_tls:{ url:"https://localhost:3100/help",custom_ca:false,insecure:false,status:tlsStatus },
  preview_listeners:Object.fromEntries(previewPorts.map((port) => [port,listenerCount(port)])),
  original_listeners:Object.fromEntries(originalPorts.map((port) => [port,listenerCount(port)])),
  browser_profile_present:browserProfilePresent
};
if (supervisorProcess.pid !== pid || supervisorProcess.ppid !== 1 || supervisorProcess.pgid !== pid
  || !supervisorProcess.command.includes("pnpm dev:auth:up") || supervisorCwd !== productRoot
  || head !== revision || status.length !== 0 || tlsStatus !== 200
  || Object.values(receipt.preview_listeners).some((count) => count < 1)
  || Object.values(receipt.original_listeners).some((count) => count < 1)
  || browserProfilePresent) {
  throw new Error("LIVE_P3_IDLE_CUSTODY_FAILED");
}
await writeFile(receiptPath,JSON.stringify(receipt,null,2) + "\n",{ mode:0o600 });
process.stdout.write(JSON.stringify(receipt,null,2) + "\n");
