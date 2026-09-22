"""Record only a reviewed, measured testable preview; never CP1 acceptance."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
parents=[('GUIDE_ACTUAL_REVIEW24','PASS_COMPOSED31_PUBLIC_GUIDE'),('GUIDE_OWNER_TESTABILITY24','PASS_OWNER_WALKTHROUGH_AVAILABLE')]
files=[]
for node,verdict in parents:
 rp=E/(node+'-receipt.json');r=read(rp);c=E/(node+'-consumption.json')
 assert r['verdict']==verdict and receipt_revision(r)==revision
 assert read(c)['receipt']['sha256']==sha(rp)
 files.extend([rp,c]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
report=D/'slices/CP1/WORKING-PREVIEW-20260921.md';assert report.exists()
text=report.read_text();assert 'WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED' in text
assert revision in text and '31' in text and 'three segments' in text
files.append(report)
for ticket,node,verdict in [('t_c5fde1c8','GUIDE_ACTUAL_REVIEW24','PASS_COMPOSED31_PUBLIC_GUIDE'),('t_cda6b72e','GUIDE_OWNER_TESTABILITY24','PASS_OWNER_WALKTHROUGH_AVAILABLE')]:
 task=json.loads(board('show',ticket,'--json'))['task'];assert task['status'] in ['ready','running'],task['status']
 board('comment',ticket,'Original assigned Sol session completed the successor scope in '+node+'; '+verdict+'; consumption='+sha(E/(node+'-consumption.json'))+'. The adopted same-product continuation decision supersedes the historical LIVE5-only wait. All31 actual cases across three segments are retained with failed LIVE31 provenance. This closes only this demonstration/testability gate. Forgot, GUIDE_READY and CP1 acceptance remain unresolved.','--author','Astra')
 if task['status']=='ready':board('claim',ticket,'--ttl','10800')
 board('complete',ticket,'--result',verdict+' via consumed original-session successor '+node+'; no CP1 acceptance')
 assert json.loads(board('show',ticket,'--json'))['task']['status']=='done'
for ticket in ['t_bc1634cb','t_e584e488','t_e5f4e3a8','t_979fe293']:
 task=json.loads(board('show',ticket,'--json'))['task'];assert task['status']!='done',(ticket,task['status'])
state=read(E/'COORDINATOR-CURRENT.json');state.update(updatedAt=now(),active=[],activeNode=None,activeAgent=None,heavyLease=None,gitLease=None,next='Owner may test the exposed preview. Existing Forgot-password destination still unresolved; no CP1 acceptance or CP2.')
state['previewHandoff']={'status':'WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED','revision':revision,'actualCases':31,'actualSegments':3,'report':str(report),'forgot':'unresolved','cp1Accepted':False};write(E/'COORDINATOR-CURRENT.json',state)
ledger('WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED; all31 actual cases across three disclosed segments reviewed; one fresh owner availability frame consumed; no CP1 acceptance or CP2.')
files.extend([E/'COORDINATOR-CURRENT.json',O/'LEDGER.md',O/'logs/agents.json',Path(__file__).resolve()]);files=list(dict.fromkeys(files))
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze('GUIDE_WORKING_PREVIEW_HANDOFF24',[f for f in files if f not in outside],revision)
print(json.dumps({'status':'WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED','report':str(report),'freeze':commit,'revision':revision}))
