from pathlib import Path
import subprocess,os,re,json,tempfile
root=Path(__file__).parent
runner="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh"
ports=[3000,3001,8790,4310,8791,8792,8793,8795,8796,55432]
def listeners(port):
 r=subprocess.run(["lsof","-nP",f"-iTCP:{port}","-sTCP:LISTEN"],text=True,capture_output=True)
 assert r.returncode in (0,1)
 return r.stdout
before={str(p):listeners(p) for p in ports}
(root/"S02-S19-listeners-before.json").write_text(json.dumps(before,indent=2)+"\n")
log=root/"S02-S19-acceptance-final-attempt-1.log"
r=subprocess.run(["zsh",runner,"env","-u","FORCE_COLOR","-u","NO_COLOR","pnpm","pes:accept-hosted"],env={**os.environ,"LOG":str(log)},text=True,capture_output=True)
print(r.stdout,end="")
print(f"exit={r.returncode}")
assert r.returncode==0
lines=log.read_text().splitlines()
assert lines[0]=='$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts'
assert lines[-1]=="PES-S02-ACCEPT: PASS"
accepted=[x for x in lines if x.startswith("PES-S02")]
scratch=accepted[0].removeprefix("PES-S02 SCRATCH-DIR ")
port=int(accepted[2].split()[2])
addresses=accepted[1].removeprefix("PES-S02 DNS api.localtest.me ")
assert accepted==[
 f"PES-S02 SCRATCH-DIR {scratch}",
 f"PES-S02 DNS api.localtest.me {addresses}",
 f"PES-S02 PORT-FREE {port} lsof -nP -iTCP:{port} -sTCP:LISTEN rc=1 lines=0",
 f"PES-S02 FAKE-VENDOR https://api.localtest.me:{port}/v1",
 "PES-S02 TRUST seam-handshake=authorized default-fetch=DEPTH_ZERO_SELF_SIGNED_CERT",
 "PES-S02 REFUSED PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a",
 "PES-S02 REFUSED PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a",
 "PES-S02 REFUSED PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT",
 "PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a",
 "PES-S02 REFUSED PROVIDER_TARGET_PRICE_REQUIRED:vendor:a",
 "PES-S02 ADMITTED vendor:a",
 "PES-S02 VENDOR-REQUESTS 1 matched 0 rejected",
 "PES-S02-ACCEPT: PASS"
]
assert all(x.startswith(("PES-S02","(node:","(Use ")) for x in lines[1:])
assert 4460<=port<=4499
# Only the fixture defines the fake literal. Derive it rather than copying it.
fixture=Path("acceptance/pes-s02-fake-vendor.ts").read_text()
token=re.search(r'FAKE_VENDOR_AUTHORIZATION = "Bearer ([^"]+)"',fixture)[1]
for pattern in [token,scratch+"/custody.d"]:
 g=subprocess.run(["grep","-cF",pattern,str(log)],text=True,capture_output=True)
 print("secret/path grep count:",g.stdout.strip())
 assert g.returncode==1 and g.stdout=="0\n"
assert not re.search(r"Bearer \S",log.read_text())
assert scratch.startswith(subprocess.check_output(["node","-p",'require("os").tmpdir()'],text=True).strip())
assert not Path(scratch).exists()
assert listeners(port)==""
print("scratch absent; fixture port released:",port)
after={str(p):listeners(p) for p in ports}
(root/"S02-S19-listeners-after.json").write_text(json.dumps(after,indent=2)+"\n")
assert before==after
print("NO-TOUCH listener snapshots identical:",json.dumps(after))
print("DNS addresses:",addresses)
print("ACCEPTANCE_GATES_PASS; FORCE_COLOR and NO_COLOR unset")
