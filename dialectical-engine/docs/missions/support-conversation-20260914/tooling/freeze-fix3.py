from pathlib import Path
import subprocess,os,tempfile,hashlib,json,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');R=S.parent;D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';P=S/'.hermes/planning/support-conversation-20260914/packets'
ref='refs/heads/codex/support-conversation-mission'
def git(args,env=None):return subprocess.run(['git','-C',str(R),*args],env=env,check=True,capture_output=True).stdout
def sha(data):return hashlib.sha256(data).hexdigest()
files=[D/'board-ids.json',D/'slices/CP1/PROGRESS.md',O/'LEDGER.md',P/'COMMON.md',P/'LIVE3.md']
files += [O/'evidence'/n for n in ['FIX3.md','FIX3-manifest.json','FIX3-consumption.json','FIX3-stack-custody.json','GATE-pre-LIVE3-inventory.json','LIVE3-required-suites.json']]
files += [O/'agent-reports/FIX3.md']

for f in files:assert f.is_file() and not f.is_symlink(),f
before={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()}
assert before['lane_ref']=='43cf9386ea3c9e7c79523ec38debe63271d19292'
parent=git(['rev-parse',ref]).decode().strip()
records=[{'path':str(f.relative_to(R)),'sha256':sha(f.read_bytes())} for f in files]
with tempfile.TemporaryDirectory(prefix='support-evidence-freeze-',dir='/private/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':str(Path(tmp)/'index')};git(['read-tree',parent],env);git(['add','--',*[r['path'] for r in records]],env);tree=git(['write-tree'],env).decode().strip();commit=git(['commit-tree',tree,'-p',parent,'-m','docs(support): freeze FIX3 evidence and exact LIVE3 contract']).decode().strip()
 for row in records:assert sha(git(['show',commit+':'+row['path']]))==row['sha256'],row['path']
 for row,f in zip(records,files):assert sha(f.read_bytes())==row['sha256'],'Input changed: '+str(f)
 git(['update-ref',ref,commit,parent])
after={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()};assert before==after,(before,after)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ref':ref,'commit':commit,'tree':tree,'parent':parent,'files':records,'source_before':before,'source_after':after,'private_index_removed':True,'tested':'metadata only; no product tests; FIX3 completed; LIVE3 not yet dispatched'}
(O/'evidence/FREEZE-FIX3.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'commit':commit,'tree':tree,'parent':parent,'hashes_checked':len(records),'source_unchanged':True}))
