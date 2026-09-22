"""Freeze only named mission metadata using a private index; never the source index."""
from pathlib import Path
import subprocess,os,tempfile,hashlib,json,datetime
source=Path(__file__).resolve().parents[4];gitroot=source.parent;mission='support-conversation-20260914';d=source/'docs/missions'/mission;o=source/'.hermes/reports'/mission;p=source/'.hermes/planning'/mission/'packets'
files=[d/'slices/CP1/SPEC-v2.md',d/'slices/CP1/PLAN.md',d/'slices/CP1/DONE.md',d/'slices/CP1/DECISIONS.md',d/'reviews/PLANREV-p1.md',o/'agent-reports/PLANREV.md',o/'agent-reports/REQ-FIX1.md',o/'evidence/REQ-FIX1.md',p/'REQ-FIX1.md',p/'KB.md']
for f in files:assert f.is_file() and not f.is_symlink(),f
ref='refs/heads/codex/support-conversation-mission'
def git(args,env=None,data=None):return subprocess.run(['git','-C',str(gitroot),*args],env=env,input=data,check=True,capture_output=True).stdout
def sha(data):return hashlib.sha256(data).hexdigest()
before={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()}
parent=git(['rev-parse',ref]).decode().strip();assert parent=='1b305e4d28e33bf77bb181eef200b7065f2c9334',parent
records=[{'path':str(f.relative_to(gitroot)),'sha256':sha(f.read_bytes())} for f in files]
with tempfile.TemporaryDirectory(prefix='support-plan-freeze-',dir='/private/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':str(Path(tmp)/'index')};git(['read-tree',parent],env);git(['add','--',*[r['path'] for r in records]],env);tree=git(['write-tree'],env).decode().strip();commit=git(['commit-tree',tree,'-p',parent,'-m','chore(support): freeze CP1 planning correction']).decode().strip()
 for row in records:assert sha(git(['show',commit+':'+row['path']]))==row['sha256'],row['path']
 for row,f in zip(records,files):assert sha(f.read_bytes())==row['sha256'],'Input changed during freeze: '+str(f)
 git(['update-ref',ref,commit,parent])
after={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()};assert before==after,(before,after)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ref':ref,'commit':commit,'tree':tree,'parent':parent,'files':records,'source_before':before,'source_after':after,'private_index_removed':True,'tested':'metadata only; no product tests'}
(o/'evidence/FREEZE-p2.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'commit':commit,'tree':tree,'hashes_checked':len(records),'source_unchanged':True}))
