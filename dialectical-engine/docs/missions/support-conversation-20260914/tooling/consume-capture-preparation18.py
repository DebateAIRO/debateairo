"""Consume the disjoint base-bound harness preparation after the concurrent product commit."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_FIX18';base='152eed4da1cd3e66b74d8301159ba76427552409'
assert len(sys.argv)==3,'expected exact receipt SHA and delegated verdict'
expected,verdict=sys.argv[1:]
product=read(E/'GUIDE_QUALITY_FIX-consumption.json');assert product['receipt']['sha256']==sha(E/'GUIDE_QUALITY_FIX-receipt.json')
revision=product['revision'];clean(revision);git('merge-base','--is-ancestor',base,revision,cwd=L)
reg=read(O/'logs/agents.json');assert not reg.get('git_slot')
rp=E/(node+'-receipt.json');assert sha(rp)==expected;r=read(rp);assert r.get('revision') is None and r['baseRevision']==base and r['verdict']==verdict
sp=E/(node+'-long-reply-supplement-receipt.json');assert sha(sp)=='f5849846b2740fd39d5b3e2acc958dacc55c8f8a110c9fa0c7ba9fdd2d407246'
supplement=read(sp);assert supplement['originalReceipt']['sha256']==expected and supplement['baseRevision']==base and supplement['revision'] is None
assert supplement['verdict']=='PREPARED_NOT_EXECUTED_LONG_REPLY_BROWSER_GATE_REQUIRED';supplement_arts=verify(supplement['artifacts'])
index=read(E/(node+'-inputs.json'));assert index['revision']==base
arts=verify(r['artifacts']);ins=verify(index['inputs'])
for a in arts+supplement_arts:
 p=Path(a['path']);assert p.is_relative_to(O/'probes'/node) or p.parent==E and p.name.startswith(node) or p.parent==O/'logs' and p.name.startswith(node+'-') or p==O/'agent-reports'/(node+'.md'),p
dest=E/(node+'-consumption.json');assert not dest.exists()
write(dest,{'at':now(),'node':node,'ticket':r['ticket'],'revision':None,'preparationBaseRevision':base,'observedProductRevision':revision,'verdict':verdict,'receipt':rec(rp),'artifactsVerified':arts,'supplementReceipt':rec(sp),'supplementArtifactsVerified':supplement_arts,'inputsVerified':ins,'retainedOriginalSessionProof':rec(E/'GUIDE_LIVE9-consumption.json'),'concurrentProductConsumption':rec(E/'GUIDE_QUALITY_FIX-consumption.json'),'currentProductClean':True,'authority':'Mechanical custody of immutable base-bound disjoint harness preparation. This does not bind it to the concurrent final product or establish readiness. The normal clean-base consumer is inapplicable because the explicitly disjoint product author advanced the shared checkout.'})
board('complete',r['ticket'],'--result',verdict+'; base-bound preparation consumed '+sha(dest))
reg['agents'][node]['status']='completed_'+verdict.lower()+'_consumed';reg['agents'][node]['revision']=None;reg['agents'][node]['preparation_base_revision']=base;reg['agents'][node]['observed_product_revision']=revision
write(O/'logs/agents.json',reg);ledger(node+' base-bound preparation consumed '+expected+' at current clean '+revision+'; final rebinding still required')
print(__import__('json').dumps({'node':node,'revision':base,'currentProduct':revision,'verdict':verdict,'artifacts':len(arts),'inputs':len(ins),'consumptionSha256':sha(dest)}))
