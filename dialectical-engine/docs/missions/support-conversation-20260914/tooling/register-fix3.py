from pathlib import Path
import json,subprocess
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';b=json.loads((D/'board-ids.json').read_text())
base=['/Users/vladmihaimiron/.local/bin/hermes','kanban','--board',b['board']]
def call(*a):return subprocess.run(base+list(a),text=True,capture_output=True,check=True).stdout
for key,parent,title,body,session in [
 ('FIX3','LIVE2','[gpt-5.6-sol] FIX3 correct measured live response contract failures','At82f57f1e LIVE2 already has actual benign failures. Initial fixed categories KEY_SET_INVALID and TEXT_CREDENTIAL_OR_SECURITY_ACTION are aggregate-window evidence, not proven request attribution. Await full finite LIVE2 receipt. Diagnose measured producer/schema and benign/security-policy boundary without raw rejected content, model substitution or validation weakening.','/root/requirements'),
 ('LIVE3','FIX3','[gpt-5.6-sol] LIVE3 actual CP1 demonstration after measured-boundary correction','After FIX3 correction and evidence consumption, exact integrated checks and finite actual CP1 walkthrough with fixed-category diagnostics, no retries and persistent supported preview. Final REV1/2/3 still required.','/root/preview')]:
 raw=json.loads(call('create',title,'--body',body,'--created-by','Astra','--assignee','codex','--workspace','dir:'+str(S),'--parent',b['tickets'][parent],'--idempotency-key',b['board']+'-'+key,'--json'));tid=raw.get('id') or raw.get('task',{}).get('id');assert tid
 b['tickets'][key]=tid;b['edges'].append([parent,key])
 state={'ticket':tid,'node':key,'risk_tier':'high','status':'waiting_dependency','owner':{'agent':'codex','session':session},'model':'gpt-5.6-sol','authority_epoch':1,'rework_round':3 if key=='FIX3' else 0,'contract':{'allowed':['pending checked packet; not dispatchable'],'forbidden':'all_others','human_review':False},'comments_read_through':0,'worktree':{'path':str(S/'.worktrees/support-conversation-cp1/dialectical-engine'),'branch':'codex/support-conversation-cp1','merge_status':'none'},'human_acceptance':'NOT_APPLICABLE'}
 call('comment',tid,'STATE\n'+json.dumps(state,indent=2),'--author','Astra');print(key,tid)
call('link',b['tickets']['LIVE3'],b['tickets']['GATE']);b['edges'].append(['LIVE3','GATE']);(D/'board-ids.json').write_text(json.dumps(b,indent=2)+'\n')
call('comment',b['tickets']['LIVE_GUIDANCE'],'LIVE2 interim aggregate diagnostics at82f57f1e: KEY_SET_INVALID1 and TEXT_CREDENTIAL_OR_SECURITY_ACTION1. No per-request identifier, so only count/order-window correlation to the first two benign failures; original predicates remainUNKNOWN. Finite matrix continues once. FIX3→LIVE3→GATE registered before LIVE2 consumption to preserve checkpoint dependency.','--author','Astra')
