"""Finalize prepared packets only after exact predecessor receipt consumption."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')))
globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1]
assert node in ['GUIDE_HARNESS_REVIEW8','GUIDE_HARNESS_FIX9','GUIDE_HARNESS_REVIEW9','GUIDE_LIVE5','GUIDE_LIVE6','GUIDE_PRODUCT','GUIDE_TESTABILITY5']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL6-manifest.json']
parents=['GUIDE_INJECTION_DIAG','GUIDE_HARNESS_FIX8','GUIDE_HARNESS_REVIEW7','GUIDE_COMPOUND_ALIAS']
if node in ['GUIDE_HARNESS_FIX9','GUIDE_HARNESS_REVIEW9','GUIDE_LIVE5','GUIDE_LIVE6','GUIDE_PRODUCT','GUIDE_TESTABILITY5']:parents+=['GUIDE_HARNESS_REVIEW8']
if node in ['GUIDE_HARNESS_REVIEW9','GUIDE_LIVE5','GUIDE_LIVE6','GUIDE_PRODUCT','GUIDE_TESTABILITY5']:parents+=['GUIDE_HARNESS_FIX9']
if node in ['GUIDE_LIVE5','GUIDE_LIVE6','GUIDE_PRODUCT','GUIDE_TESTABILITY5']:parents+=['GUIDE_HARNESS_REVIEW9','GUIDE_RUNTIME5','GUIDE_CORRECTNESS7','GUIDE_SECURITY7','GUIDE_LIVE4']
if node in ['GUIDE_LIVE6','GUIDE_PRODUCT','GUIDE_TESTABILITY5']:parents+=['GUIDE_LIVE5']
if node in ['GUIDE_PRODUCT','GUIDE_TESTABILITY5']:parents+=['GUIDE_LIVE6']
if node=='GUIDE_TESTABILITY5':parents+=['GUIDE_PRODUCT']
for name in parents:
 receipt=E/(name+'-receipt.json');consumption=E/(name+'-consumption.json')
 assert consumption.exists(),consumption
 c=read(consumption);assert c['receipt']['sha256']==sha(receipt)
 r=read(receipt);files.extend([receipt,consumption]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
if node in ['GUIDE_PRODUCT','GUIDE_TESTABILITY5']:
 actual=read(E/'GUIDE_LIVE_GUIDE9-actual-receipt.json')
 # Requiring the final receipt's explicit success is additional to delegated review.
 live=read(E/'GUIDE_LIVE6-receipt.json');assert live['verdict'].startswith('PASS'),live['verdict']
 files.append(D/'slices/CP1/MENU-COVERAGE-v2.json')
 for name in ['GUIDE_EDITORIAL','GUIDE_EDITORIAL_RECHECK','GUIDE_ATTEST']:
  path=E/(name+'-receipt.json');r=read(path);files.append(path);files.extend(Path(a['path']) for a in verify(r['artifacts']))
if node=='GUIDE_TESTABILITY5':assert read(E/'GUIDE_PRODUCT-receipt.json')['verdict'].startswith('PASS')
if node in ['GUIDE_LIVE5','GUIDE_LIVE6']:
 assert read(E/'GUIDE_HARNESS_REVIEW9-receipt.json')['verdict'].startswith('PASS')
 template=read(E/'GUIDE_LIVE4-gate-template.json')
 template['controlProofPath']=str(E/'GUIDE_HARNESS_FIX9-control-proof.json');template['controlProofSha256']=sha(template['controlProofPath'])
 template['runtimeLogPath']=str(O/'logs/GUIDE_LIVE5-stack.log')
 path=E/(node+'-gate-template.json');assert not path.exists();write(path,template);assert len(template)==16
 files.append(path)
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':REV,'inputs':[rec(p) for p in files]})
paths=[D/'board-ids.json',D/'tooling/resume-admin.py',D/'tooling/prepare-guide-resume.py',P/(node+'.md'),inp,O/'LEDGER.md']+files
commit=freeze(node,paths)
seat='/root/baseline' if node in ['GUIDE_HARNESS_REVIEW8','GUIDE_HARNESS_REVIEW9','GUIDE_PRODUCT'] else '/root/preview'
heavy=node in ['GUIDE_LIVE5','GUIDE_LIVE6','GUIDE_HARNESS_FIX9']
dispatch(node,seat,commit,heavy)
c=read(E/'COORDINATOR-CURRENT.json');c.update({'at':now(),'active':[node],'seat':[seat],'ticket':[read(D/'board-ids.json')['tickets'][node]],'adminFreeze':commit,'activeAuthorOutputsSealed':False,'heavyLease':node if heavy else None,'gitLease':None});write(E/'COORDINATOR-CURRENT.json',c)
