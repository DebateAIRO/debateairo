"""Mechanical mission administration; never product verdict authority."""
from pathlib import Path
import json, hashlib, subprocess, datetime, tempfile, os
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine'); R=S.parent
M='support-conversation-20260914'; D=S/'docs/missions'/M; O=S/'.hermes/reports'/M; E=O/'evidence'; P=S/'.hermes/planning'/M/'packets'; L=S/'.worktrees/support-conversation-cp1/dialectical-engine'
REV='0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def read(p): return json.loads(Path(p).read_text())
def write(p,v): Path(p).write_text(json.dumps(v,indent=2)+'\n')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(args,**kw): return subprocess.run(args,check=True,capture_output=True,**kw).stdout
def git(*args,env=None,cwd=R): return run(['git','-C',str(cwd),*args],env=env)
def board(*args): return run(['/Users/vladmihaimiron/.local/bin/hermes','kanban','--board',M,*args]).decode()
def rec(p):
 p=Path(p); assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(S),p
 return {'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}
def verify(rows):
 out=[]
 for r in rows:
  p=Path(r.get('absolute',r.get('path','')))
  if not p.is_absolute(): p=O/p
  actual=rec(p); assert actual['sha256']==r['sha256'],str(p)
  if 'bytes' in r: assert actual['bytes']==r['bytes'],str(p)
  out.append(actual)
 return out
def custody():
 return {'head':git('rev-parse','HEAD').decode().strip(),'index':hashlib.sha256(git('diff','--cached','--binary','--full-index')).hexdigest(),'worktree':hashlib.sha256(git('diff','--binary','--full-index')).hexdigest(),'productRef':git('rev-parse','refs/heads/codex/support-conversation-cp1').decode().strip()}
def clean(revision=REV):
 assert git('rev-parse','HEAD',cwd=L).decode().strip()==revision
 assert not git('status','--porcelain',cwd=L)
def receipt_revision(r):
 values=[r[k] for k in ['revision','finalRevision','productRevision'] if k in r]
 assert values and len(set(values))==1,values
 return values[0]
def ledger(t):
 with (O/'LEDGER.md').open('a') as f:f.write('\n- '+now()+' '+t+'\n')
def create(node,title,parent,seat):
 ids=read(D/'board-ids.json'); assert node not in ids['tickets']
 value=json.loads(board('create','[gpt-5.6-sol] '+node+' '+title,'--assignee','codex','--parent',ids['tickets'][parent],'--workspace','dir:'+str(S),'--created-by','Astra','--idempotency-key',M+':'+node,'--json'))
 ticket=value.get('id') or value.get('task',{}).get('id'); assert ticket,value
 ids['tickets'][node]=ticket;ids['edges'].append([parent,node]);write(D/'board-ids.json',ids)
 board('comment',ticket,'STATE '+json.dumps({'node':node,'owner':seat,'model':'gpt-5.6-sol','risk_tier':'high','contract':'exact frozen packet only','human_acceptance':'NOT_APPLICABLE'}),'--author','Astra')
 return ticket
def consume(node,expected,verdict,proof,revision=REV):
 clean(revision); rpath=E/(node+'-receipt.json');assert sha(rpath)==expected
 r=read(rpath);assert receipt_revision(r)==revision and r['verdict']==verdict
 arts=verify(r['artifacts']);index=read(E/(node+'-inputs.json'));ins=verify(index['inputs']);proofrec=rec(proof)
 delta=None
 if revision!=index.get('revision',revision):
  base=index['revision'];assert r['baseRevision']==base
  git('merge-base','--is-ancestor',base,revision,cwd=L)
  paths=git('diff','--name-only',base,revision,cwd=L).decode().splitlines()
  allowed=['dialectical-engine/'+p for p in index['writePaths']]
  assert paths and set(paths)<=set(allowed),paths
  delta={'base':base,'revision':revision,'paths':paths,'allowed':allowed,'productFilesVerified':verify(r['productFiles'])}
  if 'sourceCustody' in index:
   current=custody();assert all(current[k]==index['sourceCustody'][k] for k in ['head','index','worktree'])
 dest=E/(node+'-consumption.json');assert not dest.exists()
 write(dest,{'at':now(),'node':node,'ticket':r['ticket'],'revision':revision,'verdict':verdict,'receipt':rec(rpath),'productDeltaVerified':delta,'artifactsVerified':arts,'inputsVerified':ins,'retainedOriginalSessionProof':proofrec,'clean':True,'authority':'mechanical custody; delegated verdict; no readiness or acceptance'})
 board('complete',r['ticket'],'--result',verdict+'; mechanically consumed '+sha(dest))
 reg=read(O/'logs/agents.json');reg['agents'][node]['status']='completed_'+verdict.lower()+'_consumed';reg['agents'][node]['revision']=revision
 for key in ['heavy_lease','git_slot']:
  v=reg.get(key)
  if v and (v==node or isinstance(v,dict) and v.get('node')==node):reg[key]=None
 write(O/'logs/agents.json',reg);ledger(node+' consumed '+expected+'; '+verdict)
 print(json.dumps({'node':node,'artifacts':len(arts),'inputs':len(ins),'consumptionSha256':sha(dest)}))
def freeze(node,paths,revision=REV):
 reg=read(O/'logs/agents.json');assert not reg.get('git_slot')
 clean(revision);before=custody();assert before['productRef']==revision
 paths=list(dict.fromkeys(map(Path,paths)));records=[rec(p) for p in paths]
 assert all(p.is_relative_to(D) or p.is_relative_to(P) or p.is_relative_to(O) for p in paths)
 assert all('stack.log' not in p.name for p in paths)
 ref='refs/heads/codex/support-conversation-mission';parent=git('rev-parse',ref).decode().strip()
 with tempfile.TemporaryDirectory(prefix='support-freeze-',dir='/private/tmp') as tmp:
  env={**os.environ,'GIT_INDEX_FILE':tmp+'/index'};git('read-tree',parent,env=env)
  git('add','-f','--',*[str(p.relative_to(R)) for p in paths],env=env)
  tree=git('write-tree',env=env).decode().strip();commit=git('commit-tree',tree,'-p',parent,'-m','docs(support): freeze '+node).decode().strip()
  for r,p in zip(records,paths):assert hashlib.sha256(git('show',commit+':'+str(p.relative_to(R)))).hexdigest()==r['sha256'];assert sha(p)==r['sha256']
  git('update-ref',ref,commit,parent)
 assert custody()==before
 dest=E/(node+'-freeze-resume.json');assert not dest.exists()
 write(dest,{'at':now(),'commit':commit,'parent':parent,'tree':tree,'records':records,'before':before,'after':custody(),'privateIndexRemoved':True,'historicalIntakeGap':'unverified; no broader continuity claim'})
 return commit
def dispatch(node,seat,commit,heavy=False,revision=REV,git_scope=None,heavy_scope=None):
 reg=read(O/'logs/agents.json');assert not reg.get('git_slot')
 if heavy:assert not reg.get('heavy_lease')
 check=run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))]).decode()
 ids=read(D/'board-ids.json');ticket=ids['tickets'][node];t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='ready',t['task']['status']
 board('comment',ticket,'DISPATCHED checked scoped packet; freeze='+commit+'; product='+revision+'; sole heavy='+str(heavy)+'; Git scope='+str(git_scope)+'.','--author','Astra')
 reg['agents'][node]={'status':'dispatched','session':seat,'ticket':ticket,'base':revision,'freeze':commit,'packet':str(P/(node+'.md'))}
 if heavy:reg['heavy_lease']={'node':node,'session':seat,'at':now(),'scope':heavy_scope or ('supported owned readiness and one reviewed finite capture' if node in ['GUIDE_LIVE5','GUIDE_LIVE6'] else 'supported owned lifecycle and ordinary TLS health only; zero Support/model/capacity traffic' if node=='GUIDE_RUNTIME5' else 'bounded inert controls only; no runtime traffic')}
 if git_scope:
  assert isinstance(git_scope,list) and git_scope
  reg['git_slot']={'node':node,'session':seat,'at':now(),'base':revision,'paths':git_scope}
 reg['last_event']=now();write(O/'logs/agents.json',reg);ledger(node+' dispatched '+seat+' freeze '+commit)
 print(check.strip());print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'heavy':heavy}))
