"""Consume only immutable preparation custody; never assert old product cleanliness."""
import runpy,sys,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_PREP20';assert len(sys.argv)==2;expected=sys.argv[1];rp=E/(node+'-receipt.json');assert sha(rp)==expected;r=read(rp)
assert r['verdict']=='PREPARED_UNBOUND_CAPTURE' and r['revision'] is None
manifest_path=E/(node+'-manifest.json');assert sha(manifest_path)=='43cb0c58347fefd2c0b0abe694ed41184e39826be33ad2281f7c4fb176cdf7e8';assert any(Path(a.get('path',a.get('absolute','')))==manifest_path and a['sha256']==sha(manifest_path) for a in r['artifacts'])
preparation_base=read(manifest_path)['preparationBase'];assert preparation_base=='0f4290c290fd38caa0ccfb3b6781fb8c33999a22'
idx=read(E/(node+'-inputs.json'));assert idx['revision']==preparation_base and idx['finalRevision'] is None and idx['preparationOnly'] is True
arts=verify(r['artifacts']);ins=verify(idx['inputs']);dest=E/(node+'-consumption.json');assert not dest.exists()
write(dest,{'at':now(),'node':node,'ticket':r['ticket'],'revision':None,'preparationBase':preparation_base,'preparationBaseAuthority':rec(manifest_path),'receiptShapeNote':'Receipt root omits preparationBase; exact base is supplied by the hash-bound manifest and frozen input index.','verdict':r['verdict'],'receipt':rec(rp),'artifactsVerified':arts,'inputsVerified':ins,'retainedOriginalSessionProof':rec(E/'GUIDE_HARNESS_BIND19-consumption.json'),'productCleanliness':'not asserted; concurrent product author may be active','authority':'Mechanical custody of delegated unbound source/syntax preparation only. No final revision, behavior, actual runtime or readiness verdict.'})
board('complete',r['ticket'],'--result','PREPARED_UNBOUND_CAPTURE; mechanically consumed '+sha(dest));reg=read(O/'logs/agents.json');reg['agents'][node]['status']='completed_prepared_unbound_capture_consumed'
assert not reg.get('git_slot') or reg['git_slot'].get('node')!=node
assert not reg.get('heavy_lease') or reg['heavy_lease'].get('node')!=node
write(O/'logs/agents.json',reg);ledger(node+' consumed '+expected+' as unbound preparation; other author leases untouched')
print(json.dumps({'node':node,'artifacts':len(arts),'inputs':len(ins),'consumptionSha256':sha(dest),'revision':None}))
