from pathlib import Path
import json,subprocess,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine')
D=S/'docs/missions/support-conversation-20260914'; O=S/'.hermes/reports/support-conversation-20260914'
b=json.loads((D/'board-ids.json').read_text())
base=['/Users/vladmihaimiron/.local/bin/hermes','kanban','--board',b['board']]
def call(*args):
 r=subprocess.run(base+list(args),text=True,capture_output=True,check=True)
 return r.stdout
specs=[
 ('LIVE_GUIDANCE','[gpt-5.6-sol] Finding: benign real-relay product guidance rejected','At085fff68 actual UI/API/unchanged relay: six of seven benign creation/Settings/export questions returned REFUSE_SAFETY without sources/actions. Only EN export grounded. Cause unresolved. CP1-A09 blocker; no raw rejected completion retained.',None),
 ('FIX2','[gpt-5.6-sol] FIX2 diagnose and correct live structured-response contract','Same server author /root/requirements. Root-cause diagnosis first from LIVE evidence; no product changes until exact scope is recorded. Preserve strict validation, runtime model, source/action provenance and all controls. Bounded secret-safe metadata only.', 'LIVE'),
 ('LIVE2','[gpt-5.6-sol] LIVE2 actual CP1 demonstration after contract correction','After FIX2: exact integrated affected checks and one finite actual UI/API/relay CP1 walkthrough; no retry-to-pass, no synthetic Support overrides. Preserve current supported preview.', 'FIX2')]
for key,title,body,parent in specs:
 args=['create',title,'--body',body,'--created-by','Astra','--workspace','dir:'+str(S),'--idempotency-key',b['board']+'-'+key,'--json']
 if key=='LIVE_GUIDANCE': args+=['--triage']
 else: args+=['--assignee','codex','--parent',b['tickets'][parent]]
 raw=json.loads(call(*args)); tid=raw.get('id') or raw.get('task',{}).get('id'); assert tid,raw
 b['tickets'][key]=tid
 if parent:b['edges'].append([parent,key])
 state={'ticket':tid,'node':key,'risk_tier':'high','status':'queued' if not parent else 'waiting_dependency','owner':{'agent':'codex' if parent else 'reviewer','session':'/root/requirements' if key=='FIX2' else '/root/preview' if key=='LIVE2' else None},'model':'gpt-5.6-sol','authority_epoch':1,'rework_round':2 if key=='FIX2' else 0,'contract':{'allowed':['checked packet scope; FIX2 initially diagnosis only'],'forbidden':'all_others','human_review':False},'comments_read_through':0,'worktree':{'path':str(S/'.worktrees/support-conversation-cp1/dialectical-engine'),'branch':'codex/support-conversation-cp1','merge_status':'none'},'human_acceptance':'NOT_APPLICABLE'}
 call('comment',tid,'STATE\n'+json.dumps(state,indent=2),'--author','Astra')
 print(key,tid)
call('link',b['tickets']['LIVE2'],b['tickets']['GATE']);b['edges'].append(['LIVE2','GATE'])
(D/'board-ids.json').write_text(json.dumps(b,indent=2)+'\n')
call('comment',b['tickets']['LIVE'],'CONSUMED REWORK evidence: root verified12 artifact/log hashes, exact clean085fff68 and seven outcomes (1 grounded,6 safety refusals).20/20 files,730pass+1TODO retained as regression evidence only. Functional CP1-A09 failure ticketed; LIVE→FIX2→LIVE2→GATE now blocks final package. No checkpoint acceptance.','--author','Astra')
print(call('complete',b['tickets']['LIVE'],'--result','REWORK: finite LIVE evidence consumed; functional guidance1/7. FIX2 and LIVE2 required before GATE.'))
a=json.loads((O/'logs/agents.json').read_text());a['agents']['LIVE']['status']='completed_rework';a['heavy_lease']=None;a['state']='CP1_LIVE_FUNCTIONAL_REWORK';a['last_event']=datetime.datetime.now(datetime.timezone.utc).isoformat();(O/'logs/agents.json').write_text(json.dumps(a,indent=2)+'\n')
with (O/'LEDGER.md').open('a') as f:f.write('\n## LIVE consumed — actual functional blocker\nSol /root/preview at085fff68; root verified12 manifest references and clean revision. Integrated20files/730pass/1ForgotTODO; actual7prompts only1grounded,6REFUSE_SAFETY, zero actions activated. Skills body reads already verified in resumable author session; self-report agent-reports/LIVE.md. No raw rejected completion retained. Ruling: complete evidence node as REWORK and append FIX2→LIVE2→GATE; no final gate or checkpoint readiness.\n')
with (D/'slices/CP1/PROGRESS.md').open('a') as f:f.write('\n## Live failure and next correction\nAt085fff68,20/20 integrated files passed (730tests+1ForgotTODO), but actual UI/API/relay answered only1/7 required questions with grounding. Six REFUSE_SAFETY results failCP1-A09; action navigation could not run. Same server author FIX2 diagnosis will preserve strict validation and existing model, followed by LIVE2 and separate final reviews. Exact Forgot destination remains owner-blocked.\n')
