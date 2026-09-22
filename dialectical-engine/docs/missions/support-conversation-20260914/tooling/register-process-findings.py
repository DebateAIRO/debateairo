from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1]; board='support-conversation-20260914'; cli='/Users/vladmihaimiron/.local/bin/hermes'
records=json.loads((root/'process-findings.json').read_text()); ids=json.loads((root/'board-ids.json').read_text())
def run(args): return subprocess.run([cli,'kanban','--board',board,*args],check=True,capture_output=True,text=True).stdout
for record in records:
 key=record['key']
 if key in ids['tickets']: continue
 body=record['body']+' Evidence: '+record['evidence']+'; '+record['reference']+'. Nonblocking mission residue; no implementation dispatch authorized by this ticket.'
 result=json.loads(run(['create','[process residue] '+record['title'],'--body',body,'--triage','--workspace','dir:'+str(root.parents[2]),'--created-by','ASTRA','--idempotency-key',board+':'+key,'--json']))
 tid=result.get('id') or result.get('task',{}).get('id'); assert tid,result
 run(['assign',tid,'none'])
 state={'ticket':tid,'node':key,'risk_tier':'low','status':'queued','owner':{'agent':'ASTRA','session':None},'model':'gpt-6-astra','authority_epoch':1,'rework_round':0,'contract':{'allowed':[],'forbidden':'all_others','human_review':False},'comments_read_through':0,'worktree':{'path':None,'branch':None,'merge_status':'none'},'human_acceptance':'NOT_APPLICABLE'}
 run(['comment',tid,'STATE\n'+json.dumps(state,indent=2),'--author','ASTRA'])
 ids['tickets'][key]=tid; (root/'board-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
 print(key,tid)
