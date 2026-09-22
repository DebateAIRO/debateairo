from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1]; board='support-conversation-20260914'; cli='/Users/vladmihaimiron/.local/bin/hermes';ids=json.loads((root/'board-ids.json').read_text())
def run(args): return subprocess.run([cli,'kanban','--board',board,*args],check=True,capture_output=True,text=True).stdout
nodes=[('REQFIX1','[gpt-5.6-sol] REQ-FIX CP1 planning B1–B3','Bounded same-author correction for PLANREV-p1 B1 session snapshot runtime ownership, B2 status gate conflict, B3 rejected-draft outcome semantics; N1 bounded source range. No product implementation.','codex'),('PLANREV2','[gpt-5.6-sol] REQ-REV CP1 pass 2','Scoped same-reviewer verification of B1–B3 planning amendments, plus N1 packet correction. Does not certify future runtime.','codex'),('PLAN_B1','[finding B1] Session snapshot lacks runtime owner','PLANREV-p1.md B1; corrected by REQFIX1 and verified by PLANREV2; implementation obligation assigned to NAV/UI.','none'),('PLAN_B2','[finding B2] CP1 status expectation conflicts with CP3','PLANREV-p1.md B2; corrected by REQFIX1 and verified by PLANREV2.','none'),('PLAN_B3','[finding B3] Rejected-draft canonical outcome undefined','PLANREV-p1.md B3; corrected by REQFIX1 and verified by PLANREV2; implementation obligation assigned to NAV.','none'),('PLAN_N1','[finding N1] Unbounded planning source range','PLANREV-p1.md N1; bounded source range correction included in REQFIX1.','none')]
for key,title,body,assignee in nodes:
 if key in ids['tickets']:continue
 args=['create',title,'--body',body,'--workspace','dir:'+str(root.parents[2]),'--created-by','ASTRA','--idempotency-key',board+':'+key,'--json']
 if assignee=='none':args+=['--triage']
 else:args+=['--assignee',assignee]
 result=json.loads(run(args));tid=result.get('id') or result.get('task',{}).get('id');assert tid,result
 if assignee=='none':run(['assign',tid,'none'])
 state={'ticket':tid,'node':key,'risk_tier':'high','status':'queued','owner':{'agent':assignee,'session':None},'model':'gpt-5.6-sol','authority_epoch':1,'rework_round':1,'contract':{'allowed':['packet-scoped at dispatch'],'forbidden':'all_others','human_review':False},'comments_read_through':0,'worktree':{'path':None,'branch':None,'merge_status':'none'},'human_acceptance':'NOT_APPLICABLE'}
 run(['comment',tid,'STATE\n'+json.dumps(state,indent=2),'--author','ASTRA']);ids['tickets'][key]=tid;(root/'board-ids.json').write_text(json.dumps(ids,indent=2)+'\n');print(key,tid)
for parent,child in [('PLANREV','REQFIX1'),('REQFIX1','PLANREV2'),('PLANREV2','NAV'),('PLANREV2','GATE')]:
 if [parent,child] not in ids['edges']:
  run(['link',ids['tickets'][parent],ids['tickets'][child]]);ids['edges'].append([parent,child]);(root/'board-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
run(['complete',ids['tickets']['PLANREV'],'--result','REWORK pass 1 filed at PLANREV-p1.md sha25626d08f974026987de9b67471d134bd6ea90e463a9733c1ac67fa857832cc1714. B1–B3 require correction; added REQFIX1 -> PLANREV2 gates NAV and final GATE. Review explicitly allows independent C1 work, whose catalog/provenance contracts passed coherence checks. No overall plan PASS or checkpoint acceptance.'])
