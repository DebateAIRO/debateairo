from pathlib import Path
import subprocess,re,json
product=Path("acceptance/pes-s02-hosted.ts")
text=product.read_text()
for name in ["PES_S02_CONFIGURED_PROVIDERS","PES_S02_REFUSAL_CASES","violatesStdoutLaw","runHostedAcceptance","HostedAcceptanceDeps","HostedAcceptanceResult","RefusalCase"]:
 n=len(re.findall(r"^export (?:const|function|async function|type) "+name+r"[^A-Za-z0-9_]",text,re.M))
 print(name,n); assert n==1
assert text.count('import { lookup } from "node:dns";')==1
for path in [product,Path("acceptance/pes-s02-fake-vendor.ts")]:
 assert not re.search(r"node:dns/promises|promises\.lookup|dns\.promises",path.read_text())
 print(str(path)+":0 promise lookup references")
cli=Path("acceptance/pes-s02-hosted-cli.ts").read_text()
assert cli.count('process.exitCode = result.outcome === "PASS" ? 0 : 1;')==1
assert cli.count('process.exitCode = 1;')==1
assert not re.search(r"process\.exit\(|process\.exitCode = 0",cli)
print("CLI gates 1 / 1 / 0")
assert len(re.findall(r'^it\(',Path("acceptance/pes-s02-hosted.test.ts").read_text(),re.M))==8
print("EXACTLY 8 cases")
a=json.loads(subprocess.check_output(["git","show","HEAD:dialectical-engine/package.json"],text=True))
b=json.loads(Path("package.json").read_text())
assert b['scripts'].pop('pes:accept-hosted')=='tsx --no-cache acceptance/pes-s02-hosted-cli.ts'
assert a==b
print("package.json: exactly one scripts entry added")
# Named dependency support factory: compare only the named function block.
pat=r"function callbackLookup\(.*?const lookupStub = .*?;"
left=re.search(pat,Path("acceptance/pes-s02-hosted.test.ts").read_text(),re.S).group()
right=re.search(pat,Path("acceptance/pes-s02-fake-vendor.test.ts").read_text(),re.S).group()
assert left==right
print("callbackLookup + lookupStub byte-identical to C2")
paths=["packages/register/src/runtime-environment.ts","packages/register/src/configured-provider-set.ts","packages/providers/src/index.ts","packages/providers/src/provider-probe.ts","packages/crypto/src/index.ts","apps/api/src/main.ts","apps/api/src/provider-discovery.ts","pnpm-lock.yaml"]
for path in paths:
 tracked=subprocess.check_output(["git","ls-files","--",path],text=True).strip()
 assert tracked==path,(path,tracked)
 print("pathspec matches:",tracked)
 diff=subprocess.check_output(["git","diff","776359c3","--",path],text=True)
 assert diff=="",path
print("untouched boundary diff: empty for all 8 tracked paths")
positive=subprocess.check_output(["git","diff","--","package.json"],text=True)
assert 'pes:accept-hosted' in positive
print("positive diff control:",positive)
print("STATIC_GATES_PASS")
