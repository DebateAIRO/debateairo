from pathlib import Path
import json,os,re,subprocess
OUT=Path(__file__).resolve().parent;LANE=Path.cwd()
assert LANE==Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine')
README=Path('deploy/vps/README.md');TEST=Path('tests/unit/v9-provider-credential-files.test.ts')
originals={p:p.read_bytes() for p in [README,TEST]}
status=lambda p:subprocess.check_output(['git','status','--porcelain','--',str(p)],text=True)
prior={p:status(p) for p in originals}
text=originals[README].decode();lines=text.splitlines(keepends=True)
row=lines[1039];paragraph=lines[1020]
new_sentence=paragraph[paragraph.index('The hosted publish command'):].rstrip('\n')
cases=[
 ('drop-upper-bound',1040,' through `Number.MAX_SAFE_INTEGER`','', 'V-22'),
 ('drop-lower-bound',1040,' from 0','', 'V-22'),
 ('drop-integer-condition',1040,'not an integer','not a number', 'V-22'),
 ('drop-one-member-condition',1040,', or only one of the two price members','', 'V-22'),
 ('hosted-window-60000',1021,'set to `600000`','set to `60000`', 'V-23'),
 ('drop-no-file-member',1021,', and its file has no member to change it','', 'V-23'),
 ('drop-code-change',1021,'; a different window needs a code change','', 'V-23'),
 ('harmless-spacing',0,'','',None)
]
results=[]
for name,line,old,new,case in cases:
 log=OUT/(name+'.log');assert not log.exists()
 try:
  mutant=lines.copy()
  if line:
   assert mutant[line-1].count(old)==1,(name,old)
   mutant[line-1]=mutant[line-1].replace(old,new,1)
  else:
   mutant[1039]=mutant[1039].replace('not an integer','not  an  integer',1)
   mutant[1020]=mutant[1020].replace('The hosted publish command','The  hosted  publish  command',1)
  assert ''.join(mutant)!=text;README.write_text(''.join(mutant))
  run=subprocess.run(['zsh','/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh','tests/unit/v9-provider-credential-files.test.ts:33:0','tests/architecture/vps-deployment-baseline.test.ts:43:0','tests/unit/v30-support-provider.test.ts:30:0'],env=dict(os.environ,LOG=str(log)),text=True,capture_output=True)
  print(name+'\n'+run.stdout,flush=True)
  content=log.read_text();pairs=re.findall(r'(tests/\S+) rc=(\d+) passed=(\d+) failed=(\d+)',content)
  assert len(pairs)==3,pairs
  want_failed=1 if case else 0
  assert tuple(map(int,pairs[0][2:]))==(33-want_failed,want_failed),pairs
  assert tuple(map(int,pairs[1][2:]))==(43,0) and tuple(map(int,pairs[2][2:]))==(30,0),pairs
  failures=[l.strip() for l in content.splitlines() if l.startswith(' FAIL ')]
  if case:assert len(failures)==1 and '('+case+')' in failures[0],failures
  assert ('CLUSTER_RED' if case else 'CLUSTER_GREEN') in run.stdout
  results.append({'mutant':name,'v9_passed':33-want_failed,'v9_total':33,'baseline':'43/43','v30':'30/30','failures':failures,'log':str(log)})
  print('DETECTOR_GREEN',name,failures,flush=True)
 finally:
  for p,b in originals.items():
   if p.read_bytes()!=b:p.write_bytes(b)
   assert p.read_bytes()==b and status(p)==prior[p]
   print('RESTORE',str(p),'bytes-identical',repr(status(p)),flush=True)
  print(subprocess.check_output(['git','status','--porcelain'],text=True),flush=True)
 (OUT/'mutant-results.json').write_text(json.dumps(results,indent=2)+'\n')
print('ALL_EXPECTATIONS_MET',len(results),flush=True)
