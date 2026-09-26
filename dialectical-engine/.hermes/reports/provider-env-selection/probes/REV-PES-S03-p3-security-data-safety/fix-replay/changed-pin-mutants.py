# REV-PES-S03-p3-security-data-safety re-point: copied verbatim from ../../FIX-PES-S03-p2/changed-pin-mutants.py; cwd = any checkout of 9f29022f3; logs land in THIS dir.
from pathlib import Path
import os,sys,subprocess,re,json
OUT=Path(__file__).resolve().parent;phase=sys.argv[1]
p=Path('deploy/vps/README.md');t=Path('tests/unit/v9-provider-credential-files.test.ts')
base=p.read_bytes();original_test=t.read_bytes();text=base.decode()
por=lambda f:subprocess.check_output(['git','status','--porcelain','--',str(f)],text=True)
pre={f:por(f) for f in [p,t]}
policy=['COST_ENVELOPE_POLICY_UNRESOLVED','COST_ENVELOPE_POLICY_INVALID']
row=lambda code:next(l for l in text.splitlines() if l.startswith('| `'+code+'` |'))
cases={}
for code in policy:
 r=row(code);cases['missing-'+code]=(text.replace(r+'\n','',1),'refusal row for COST_ENVELOPES_NOT_SEALED',True)
 # Keep all rows and exact text, but put a policy row below the row that calls it above.
 build=row('COST_ENVELOPES_NOT_SEALED');cases['below-'+code]=(text.replace(r+'\n','',1).replace(build,build+'\n'+r,1),'refusal row for COST_ENVELOPES_NOT_SEALED',True)
for n,bullet in enumerate(["§11's hosted provider target example","§11's refusal-code table is incomplete","the daily call cap is the only ceiling"]):
 cases['stale-'+str(n)]=(text.replace('Refreshed by Task 14',bullet+'\n\nRefreshed by Task 14',1),"known-stale list",True)
cases['stale-banner']=(text.replace('Refreshed by Task 14','## Known-stale sections\n\nRefreshed by Task 14',1),'known-stale list',True)
# Benign prose wrapping and price-row reordering; policy ordering stays truthful.
x=row('PROVIDER_TARGET_PRICE_REQUIRED:') if False else next(l for l in text.splitlines() if l.startswith('| `PROVIDER_TARGET_PRICE_REQUIRED:`'))
y=next(l for l in text.splitlines() if l.startswith('| `PROVIDER_TARGET_PRICE_ZERO:`'))
neighbor=text.replace(x+'\n'+y,y+'\n'+x,1).replace('are parsed, before','are parsed,\n before',1)
cases['neighbor']=(neighbor,'',False)
if phase=='before-existence':cases={k:v for k,v in cases.items() if k.startswith('missing-')}
results=[]
for name,(mut,filter_,red) in cases.items():
 log=OUT/f'{phase}-{name}.log';assert not log.exists()
 try:
  assert mut!=text;p.write_text(mut)
  cmd=['pnpm','exec','vitest','run',str(t),'--reporter=verbose']
  if filter_:cmd+=['-t',filter_]
  env=dict(os.environ,LOG=str(log))
  run=subprocess.run(['zsh','/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh',*cmd],env=env,text=True,capture_output=True)
  content=log.read_text();lines=[l.strip() for l in content.splitlines() if re.match(r'^\s*(Tests|Test Files|FAIL)\s',l)]
  matched=(run.returncode!=0)==red
  print(name,'rc',run.returncode,'DETECTOR_GREEN' if matched else 'DETECTOR_RED',lines,flush=True)
  results.append({'name':name,'rc':run.returncode,'detector_matched':matched,'lines':lines,'log':str(log)})
 finally:
  p.write_bytes(base);assert p.read_bytes()==base and t.read_bytes()==original_test
  for f in [p,t]:assert por(f)==pre[f];print('RESTORE',str(f),'cmp=0',repr(por(f)),flush=True)
(OUT/f'{phase}-results.json').write_text(json.dumps(results,indent=2)+'\n')
