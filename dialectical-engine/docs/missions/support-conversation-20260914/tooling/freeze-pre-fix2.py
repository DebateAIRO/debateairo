from pathlib import Path
import subprocess,os,tempfile,hashlib,json,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');R=S.parent;D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';P=S/'.hermes/planning/support-conversation-20260914/packets'
ref='refs/heads/codex/support-conversation-mission'
def git(args,env=None):return subprocess.run(['git','-C',str(R),*args],env=env,check=True,capture_output=True).stdout
def sha(data):return hashlib.sha256(data).hexdigest()
files=[D/'board-ids.json',D/'slices/CP1/PROGRESS.md',D/'reviews/CP1-REVIEW-SCOPE.md',D/'reviews/CP1-SUMMARY-CONTRACT.md',D/'reviews/REV1-prep.md',D/'reviews/REV2-prep.md',D/'reviews/REV3-prep.md',O/'LEDGER.md',P/'FIX2.md',P/'LIVE.md',P/'REVIEW-COMMON-draft.md',*[P/(n+'-draft.md') for n in ['REV1','REV2','REV3']]]
for n in ['NAV','UI','FIX1','UIFIX1','LIVE']:
 files += [O/'evidence'/(n+'.md'),O/'evidence'/(n+'-manifest.json'),O/'agent-reports'/(n+'.md')]
for n in ['FIX1-consumption','UI-consumption','UIFIX1-consumption','GATE-pre-LIVE-inventory','GATE-source-preservation','LIVE-required-suites','LIVE-actual-relay-receipt']:
 files += [O/'evidence'/(n+'.json')]
for f in files:assert f.is_file() and not f.is_symlink(),f
before={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()}
assert before['lane_ref']=='085fff68f8b22743978d1efafd7ad9fd204e5a6f'
parent=git(['rev-parse',ref]).decode().strip()
records=[{'path':str(f.relative_to(R)),'sha256':sha(f.read_bytes())} for f in files]
with tempfile.TemporaryDirectory(prefix='support-evidence-freeze-',dir='/private/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':str(Path(tmp)/'index')};git(['read-tree',parent],env);git(['add','--',*[r['path'] for r in records]],env);tree=git(['write-tree'],env).decode().strip();commit=git(['commit-tree',tree,'-p',parent,'-m','docs(support): preserve CP1 evidence and actual walkthrough rework']).decode().strip()
 for row in records:assert sha(git(['show',commit+':'+row['path']]))==row['sha256'],row['path']
 for row,f in zip(records,files):assert sha(f.read_bytes())==row['sha256'],'Input changed: '+str(f)
 git(['update-ref',ref,commit,parent])
after={'head':git(['rev-parse','HEAD']).decode().strip(),'index':sha(git(['diff','--cached','--binary'])),'worktree':sha(git(['diff','--binary'])),'lane_ref':git(['rev-parse','refs/heads/codex/support-conversation-cp1']).decode().strip()};assert before==after,(before,after)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ref':ref,'commit':commit,'tree':tree,'parent':parent,'files':records,'source_before':before,'source_after':after,'private_index_removed':True,'tested':'metadata only; no product tests; no running FIX2 output included'}
(O/'evidence/FREEZE-pre-FIX2.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'commit':commit,'tree':tree,'parent':parent,'hashes_checked':len(records),'source_unchanged':True}))
