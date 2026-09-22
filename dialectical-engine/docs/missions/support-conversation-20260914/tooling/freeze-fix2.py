from pathlib import Path
import subprocess,os,tempfile,hashlib,json,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');R=S.parent;D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';P=S/'.hermes/planning/support-conversation-20260914/packets'
ref='refs/heads/codex/support-conversation-mission'
def git(args,env=None):return subprocess.run(['git','-C',str(R),*args],env=env,check=True,capture_output=True).stdout
def sha(data):return hashlib.sha256(data).hexdigest()
files=[D/'board-ids.json',D/'slices/CP1/PROGRESS.md',O/'LEDGER.md',O/'agent-reports/ASTRA.md',P/'COMMON.md',P/'FIX2.md',P/'LIVE2.md']
files += [O/'evidence'/n for n in ['FIX2.md','FIX2-manifest.json','FIX2-stack-custody.json','FIX2-consumption.json','GATE-pre-LIVE2-inventory.json','LIVE2-required-suites.json']]
files += [O/'agent-reports/FIX2.md',O/'review-packages/CP1-p1/CP1-82f57f1e-diff.json']

for f in files:assert f.is_file() and not f.is_symlink(),f
before={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()}
assert before['lane_ref']=='82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0'
parent=git(['rev-parse',ref]).decode().strip()
records=[{'path':str(f.relative_to(R)),'sha256':sha(f.read_bytes())} for f in files]
with tempfile.TemporaryDirectory(prefix='support-evidence-freeze-',dir='/private/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':str(Path(tmp)/'index')};git(['read-tree',parent],env);git(['add','--',*[r['path'] for r in records]],env);tree=git(['write-tree'],env).decode().strip();commit=git(['commit-tree',tree,'-p',parent,'-m','docs(support): freeze scoped live-contract correction evidence']).decode().strip()
 for row in records:assert sha(git(['show',commit+':'+row['path']]))==row['sha256'],row['path']
 for row,f in zip(records,files):assert sha(f.read_bytes())==row['sha256'],'Input changed: '+str(f)
 git(['update-ref',ref,commit,parent])
after={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()};assert before==after,(before,after)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ref':ref,'commit':commit,'tree':tree,'parent':parent,'files':records,'source_before':before,'source_after':after,'private_index_removed':True,'tested':'metadata only; no product tests; no running LIVE2 output included'}
(O/'evidence/FREEZE-FIX2.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'commit':commit,'tree':tree,'parent':parent,'hashes_checked':len(records),'source_unchanged':True}))
