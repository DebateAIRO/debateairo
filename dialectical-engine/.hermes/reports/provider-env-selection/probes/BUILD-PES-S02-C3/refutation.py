from pathlib import Path
import subprocess,os,json
root=Path(__file__).parent
product=Path("acceptance/pes-s02-hosted.ts")
original=product.read_text()
runner="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
mutations=[
 ("01-refusal-stage", 'stage = "deployment";', 'stage = "priced";', "stage tracked through real guard chain"),
 ("02-output-order", 'emit("PES-S02 ADMITTED vendor:a");', 'emit("PES-S02 ADMITTED vendor:b");', "exact provider admission output"),
 ("03-output-token", 'lines.push(line);', 'lines.push(line); lines.push(FAKE_VENDOR_AUTHORIZATION.slice("Bearer ".length));', "every output line excludes token"),
 ("04-output-scheme", 'lines.push(line);', 'lines.push(line); lines.push("Bearer synthetic-mutant");', "every output line excludes credential scheme"),
 ("05-output-custody", 'lines.push(line);', 'lines.push(line); if (scratchRoot) lines.push(join(scratchRoot, "custody.d", "vendor.header"));', "every output line excludes custody descendants"),
 ("06-scratch-removal", 'await rm(scratchRoot, { recursive: true, force: true });', 'await Promise.resolve();', "all outcomes remove scratch before return"),
 ("07-admission-check", 'if (members.length !== 1 || members[0]?.provider_ref !== "vendor:a" || members[0]?.maker !== "Acme")', 'if (false)', "wrong credential cannot print admitted"),
 ("08-refusal-equality", 'caught.message !== refusal.expected', 'false', "first mismatched refusal stops the run"),
 ("09-dns-error", 'stop("UNVERIFIED", `dns ${errorCode(error)}`);', 'stop("FAIL", `dns ${errorCode(error)}`);', "resolver own error classified UNVERIFIED"),
 ("10-dns-nonloopback", 'stop("UNVERIFIED", "dns non-loopback");', 'stop("UNVERIFIED", "dns no-ipv4-loopback");', "non-loopback DNS gets its own verdict"),
 ("11-tls-material", 'stop("UNVERIFIED", "tls-material openssl-unavailable");', 'stop("FAIL", "internal");', "unavailable certificate tool classified UNVERIFIED"),
 ("12-law-token", 'forbidden.tokens.some((token) => line.includes(token))', 'false', "stdout predicate token arm"),
 ("13-law-scheme", r'/Bearer \S/u.test(line)', 'false', "stdout predicate scheme arm"),
 ("14-law-directory", 'line.includes(path)', 'line.includes(path + "/")', "stdout predicate includes custody directory itself"),
 ("15-law-descendant", 'line.includes(path)', 'line === path', "stdout predicate includes custody descendants"),
 ("16-law-codes", 'return forbidden.tokens.some', 'return line.includes("AUTHORIZATION") || forbidden.tokens.some', "lawful refusal codes are admitted"),
 ("17-listener-release", 'await vendor?.close();', 'if (vendor) { const activeVendor = vendor; setTimeout(() => { void activeVendor.close(); }, 1000); }', "listener is closed before return"),
 ("18-scratch-prefix", 'mkdtemp(join(tmpdir(), "pes-s02-"))', 'mkdtemp(join(tmpdir(), "pes-s02-custody-"))', "scratch basename has no custody"),
]
records=[]
def run(name,expected):
 log=root/(name+".log")
 assert not log.exists(), log
 env={**os.environ,"LOG":str(log)}
 result=subprocess.run(["zsh",runner,"acceptance/pes-s02-hosted.test.ts:8:0"],env=env,text=True,capture_output=True)
 print(result.stdout,end="",flush=True)
 text=log.read_text()
 marker=text.splitlines()[-1]
 failures=[line for line in text.splitlines() if line.startswith(" FAIL ")]
 assert marker==expected,(name,marker)
 return {"log":str(log),"marker":marker,"failures":failures}
for name,old,new,property in mutations:
 assert original.count(old)==1,(name,original.count(old))
 print(name,flush=True)
 try:
  product.write_text(original.replace(old,new))
  red=run("S02-S18-mutant-"+name+"-attempt-1","CLUSTER_RED")
 finally:
  product.write_text(original)
  state=subprocess.check_output(["git","status","--porcelain"],text=True)
  (root/("restore-"+name+".log")).write_text(state)
  print(state,end="",flush=True)
 green=run("S02-S18-restore-"+name+"-attempt-1","CLUSTER_GREEN")
 records.append({"id":name,"property":property,"old":old,"new":new,"red":red,"green":green,"restore":state})
 (root/"refutation-results.json").write_text(json.dumps(records,indent=2)+"\n")
