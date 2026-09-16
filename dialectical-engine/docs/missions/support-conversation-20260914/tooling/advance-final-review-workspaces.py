from pathlib import Path
import subprocess,json,hashlib,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');E=S/'.hermes/reports/support-conversation-20260914/evidence';L=S/'.worktrees/support-conversation-cp1/dialectical-engine';rev='5cbfc6d483aae0f56eabfdee00a6829e09e76c3d';base='606b2eabea1dc9212159e53c193cf69655424e77';dest=E/'GATE_P3-final-review-workspaces.json';assert not dest.exists();sha=lambda b:hashlib.sha256(b).hexdigest()
def git(p,*a):return subprocess.check_output(['git','--no-optional-locks','-C',str(p),*a])
def custody():
 return {'sourceHead':git(S,'rev-parse','HEAD').decode().strip(),'sourceIndexSha256':sha(git(S,'diff','--cached','--binary','--full-index')),'sourceFullIndexDiffSha256':sha(git(S,'diff','--binary','--full-index')),'productHead':git(L,'rev-parse','HEAD').decode().strip(),'productStatus':git(L,'status','--porcelain').decode()}
before=custody();assert before['sourceHead']=='446c685e977104ecf2b0b5ee0519f7123968429f' and before['productHead']==rev and not before['productStatus']
prior=E/'GATE_P3-review-workspaces.json';r=json.loads(prior.read_text());assert r['revision']==base
for w in r['workspaces']:
 p=Path(w['cwd']);assert git(p,'rev-parse','HEAD').decode().strip()==base and git(p,'status','--porcelain')==b''
 assert subprocess.run(['git','--no-optional-locks','-C',str(p),'symbolic-ref','-q','HEAD'],capture_output=True).returncode==1
for w in r['workspaces']:
 p=Path(w['cwd']);subprocess.run(['git','-C',str(p),'checkout','--detach',rev],check=True,capture_output=True)
 assert git(p,'rev-parse','HEAD').decode().strip()==rev and git(p,'status','--porcelain')==b'';w['revision']=rev
assert custody()==before
r.update({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'revision':rev,**{k:v for k,v in before.items() if k.startswith('source')},'sourceBeforeAfterEqual':True,'productRefUnchanged':True,'priorWorkspaceReceipt':{'path':str(prior),'sha256':sha(prior.read_bytes())},'limits':['Advanced only three clean, unused, root-owned detached review checkouts from606b to the final test-only commit.','No tests, install, build, source mutation or preview action.','Each lens retains its own product checkout and disjoint administrative outputs.']})
dest.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'path':str(dest),'sha256':sha(dest.read_bytes()),'revision':rev,'workspaces':3,'sourceBeforeAfterEqual':True}))
