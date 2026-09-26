from pathlib import Path
import subprocess,os,json
root=Path(__file__).parent
module=Path("acceptance/pes-s02-hosted.ts")
cli=Path("acceptance/pes-s02-hosted-cli.ts")
original=module.read_text()
original_cli=cli.read_text()
runner="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh"
records=[]
def run(name):
 log=root/("S02-S19-"+name+"-attempt-1.log")
 assert not log.exists()
 result=subprocess.run(["zsh",runner,"env","-u","FORCE_COLOR","-u","NO_COLOR","pnpm","pes:accept-hosted"],env={**os.environ,"LOG":str(log)},text=True,capture_output=True)
 print(result.stdout,end="",flush=True)
 lines=log.read_text().splitlines()
 return result.returncode,lines
for name,old,new,want in [
 ("FAIL", "credentialLiteral: FAKE_VENDOR_AUTHORIZATION,", 'credentialLiteral: "Bearer pes-s02-cli-wrong",', "PES-S02-ACCEPT: FAIL admitted"),
 ("UNVERIFIED", 'opensslExecutable: "/usr/bin/openssl",', 'opensslExecutable: "/nonexistent/openssl",', "PES-S02-ACCEPT: UNVERIFIED tls-material openssl-unavailable"),
 ("thrown", "  const deps: HostedAcceptanceDeps = {", '  throw new Error("synthetic-nonsecret-internal-error");\n  const deps: HostedAcceptanceDeps = {', "PES-S02-ACCEPT: FAIL internal"),
]:
 assert original.count(old)==1
 try:
  module.write_text(original.replace(old,new))
  rc,lines=run(name+"-mapping")
  assert rc==1,(name,rc)
  assert lines[-2]==want and lines[-1].startswith("[ELIFECYCLE]"),(name,lines)
  assert not any("synthetic-nonsecret-internal-error" in x for x in lines)
  # The exit-0 mutant must break the same oracle under the same stimulus.
  cli.write_text(original_cli.replace('result.outcome === "PASS" ? 0 : 1','0').replace('process.exitCode = 1;', 'process.exitCode = 0;'))
  mutant_rc,mutant_lines=run(name+"-exit0-mutant")
  assert mutant_rc==0 and mutant_lines[-1]==want
  records.append({"case":name,"expected":1,"restoredExit":rc,"mutantExit":mutant_rc,"verdict":want})
 finally:
  module.write_text(original)
  cli.write_text(original_cli)
  state=subprocess.check_output(["git","status","--porcelain"],text=True)
  (root/("restore-cli-"+name+".log")).write_text(state)
  print(state,end="",flush=True)
 rc,lines=run(name+"-restore-PASS")
 assert rc==0 and lines[-1]=="PES-S02-ACCEPT: PASS"
(root/"cli-exits-results.json").write_text(json.dumps(records,indent=2)+"\n")
