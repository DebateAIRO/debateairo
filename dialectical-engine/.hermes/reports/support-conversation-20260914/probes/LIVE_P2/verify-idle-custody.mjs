import { execFileSync } from "node:child_process";
import { stat,writeFile } from "node:fs/promises";

const revision = "606b2eabea1dc9212159e53c193cf69655424e77";
const pid = 86341;
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const profileRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/LIVE_P2/browser-profile";
const receiptPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/LIVE_P2-idle-custody.json";
const previewPorts = [3100,3101,8890,8891,8892,8893,8894,8895,8896];
const originalPorts = [8790,8791,8792,8793,8794,8795,8796];
const run = (file,args,options = {}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();

const idleStartedAt = new Date().toISOString();
await new Promise((resolve) => setTimeout(resolve,10_000));
const idleCompletedAt = new Date().toISOString();

const processFields = run("/bin/ps",["-o","pid=,ppid=,pgid=,stat=","-p",String(pid)])
  .split(/\s+/u);
const supervisorProcess = {
  pid:Number(processFields[0]),
  ppid:Number(processFields[1]),
  pgid:Number(processFields[2]),
  state:processFields[3]
};
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
  expected_supervisor:{ pid,ppid:1,pgid:pid },
  head,
  product_status_clean:status.length === 0,
  ordinary_system_tls:{ url:"https://localhost:3100/help",custom_ca:false,insecure:false,status:tlsStatus },
  preview_listeners:Object.fromEntries(previewPorts.map((port) => [port,listenerCount(port)])),
  original_listeners:Object.fromEntries(originalPorts.map((port) => [port,listenerCount(port)])),
  browser_profile_present:browserProfilePresent
};
if (supervisorProcess.pid !== pid || supervisorProcess.ppid !== 1 || supervisorProcess.pgid !== pid
  || head !== revision || status.length !== 0 || tlsStatus !== 200
  || Object.values(receipt.preview_listeners).some((count) => count < 1)
  || Object.values(receipt.original_listeners).some((count) => count < 1)
  || browserProfilePresent) {
  throw new Error("LIVE_P2_IDLE_CUSTODY_FAILED");
}
await writeFile(receiptPath,JSON.stringify(receipt,null,2) + "\n",{ mode:0o600 });
process.stdout.write(JSON.stringify(receipt,null,2) + "\n");
