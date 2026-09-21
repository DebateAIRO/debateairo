"""Consume only the explicitly amended nine-path quality correction, preserving original frozen inputs."""
import runpy,sys,json,hashlib
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_QUALITY_FIX2';base='6cbe0e7ad18b20eca35876f4a91478cfbba82307'
assert len(sys.argv)==3,'expected exact sealed receipt SHA and delegated verdict'
expected,verdict=sys.argv[1:];rp=E/(node+'-receipt.json');assert sha(rp)==expected;r=read(rp);assert r['verdict']==verdict and r['baseRevision']==base
revision=receipt_revision(r);clean(revision);git('merge-base','--is-ancestor',base,revision,cwd=L)
index_path=E/(node+'-inputs.json');index=read(index_path);assert index['revision']==base;inputs_verified=verify(index['inputs']);artifacts_verified=verify(r['artifacts'])
amendments=[];allowed=list(index['writePaths'])
expected_amendments=[('scope-amendment1','025f51a43fe15a71b323a8f17366625579dcbb9d6b76b9ec880f289c1192d3bc',['tests/unit/support-context.test.ts','tests/unit/support-recovery-attestation.test.ts']),('scope-amendment2','9c5f787229db4ffae6a8554333b288a1c36fce5648a956279675299034d51ca9',['packages/support-kb/src/context.ts'])]
for suffix,expected_sha,paths in expected_amendments:
 p=E/(node+'-'+suffix+'.json');assert sha(p)==expected_sha;a=read(p)
 assert a['node']==node and a['ticket']==r['ticket'] and a['baseRevision']==base and a['additionalWritePaths']==paths
 assert a['originalInputs']==rec(index_path)
 if 'originalPacket' in a:assert a['originalPacket']==rec(P/(node+'.md'))
 if 'priorAmendment' in a:assert a['priorAmendment']==amendments[-1]
 for f in a['unchangedBaseFiles']:
  assert f['relative'] in paths and f['path']==str(L/f['relative'])
  old=git('show',base+':dialectical-engine/'+f['relative'],cwd=L);assert hashlib.sha256(old).hexdigest()==f['sha256'] and len(old)==f['bytes']
 allowed.extend(paths);amendments.append(rec(p))
assert len(allowed)==9 and len(set(allowed))==9
changed=git('diff','--name-only',base,revision,cwd=L).decode().splitlines();assert changed and set(changed)<=set('dialectical-engine/'+p for p in allowed)
product_files=verify(r['productFiles'])
for p in product_files:assert Path(p['path']).is_relative_to(L) and 'dialectical-engine/'+str(Path(p['path']).relative_to(L)) in changed
assert len(product_files)==len(changed)
current=custody();assert all(current[k]==index['sourceCustody'][k] for k in ['head','index','worktree'])
dest=E/(node+'-consumption.json');assert not dest.exists()
write(dest,{'at':now(),'node':node,'ticket':r['ticket'],'revision':revision,'verdict':verdict,'receipt':rec(rp),'scopeAmendmentsVerified':amendments,'productDeltaVerified':{'base':base,'revision':revision,'paths':changed,'allowed':['dialectical-engine/'+p for p in allowed],'productFilesVerified':product_files},'artifactsVerified':artifacts_verified,'inputsVerified':inputs_verified,'retainedOriginalSessionProof':rec(E/'GUIDE_QUALITY_FIX-consumption.json'),'clean':True,'sourceCustodyVerified':current,'authority':'Mechanical custody of the delegated correction under the original six-path frozen packet and two exact hash-bound board scope amendments. No original input or packet rewrite; no readiness or acceptance claim.'})
board('complete',r['ticket'],'--result',verdict+'; amended delta consumed '+sha(dest))
reg=read(O/'logs/agents.json');reg['agents'][node]['status']='completed_'+verdict.lower()+'_consumed';reg['agents'][node]['revision']=revision
for key in ['heavy_lease','git_slot']:
 v=reg.get(key)
 if v and isinstance(v,dict) and v.get('node')==node:reg[key]=None
write(O/'logs/agents.json',reg);ledger(node+' consumed '+expected+' with both exact scope amendments; '+verdict)
commit=freeze(node+'_SCOPE',[Path(__file__).resolve(),P/(node+'.md'),index_path,rp,dest,O/'LEDGER.md',*[Path(p['path']) for p in amendments]],revision=revision)
board('comment',r['ticket'],'AMENDMENTS_FROZEN after product Git release: '+commit+'; final product '+revision+'; original packet and input hashes retained.','--author','Astra')
print(json.dumps({'node':node,'revision':revision,'verdict':verdict,'changedFiles':len(changed),'allowedPaths':len(allowed),'artifacts':len(artifacts_verified),'consumptionSha256':sha(dest),'scopeFreeze':commit}))
