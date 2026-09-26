from pathlib import Path
import subprocess,os
root=Path(__file__).parent
product=Path("acceptance/pes-s02-hosted.ts")
original=product.read_text()
runner="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
# Relevant neighbours retain the measured properties: empty-store freshness,
# normal successful rm, and a semantically equivalent literal-space predicate.
for name,old,new in [
 ("empty-store-freshness", "probeFreshnessMs: 600000", "probeFreshnessMs: 600001"),
 ("cleanup-force", "recursive: true, force: true", "recursive: true, force: false"),
 ("stdout-literal-space", r"/Bearer \S/u", r"/Bearer[ ]\S/u"),
]:
 assert original.count(old)==1,(name,original.count(old))
 try:
  product.write_text(original.replace(old,new))
  log=root/("S02-S18-neighbour-"+name+"-attempt-1.log")
  subprocess.run(["zsh",runner,"acceptance/pes-s02-hosted.test.ts:8:0"],env={**os.environ,"LOG":str(log)},check=True)
  assert log.read_text().splitlines()[-1]=="CLUSTER_GREEN"
 finally:
  product.write_text(original)
  state=subprocess.check_output(["git","status","--porcelain"],text=True)
  (root/("restore-neighbour-"+name+".log")).write_text(state)
  print(state,end="",flush=True)
 log=root/("S02-S18-neighbour-restore-"+name+"-attempt-1.log")
 subprocess.run(["zsh",runner,"acceptance/pes-s02-hosted.test.ts:8:0"],env={**os.environ,"LOG":str(log)},check=True)
 assert log.read_text().splitlines()[-1]=="CLUSTER_GREEN"
