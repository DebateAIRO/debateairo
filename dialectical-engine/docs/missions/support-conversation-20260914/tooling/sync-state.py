"""Reconcile this mission's canonical first STATE comment with native board state.
No product state, dependencies, status or acceptance is changed. Hermes currently
has no comment-replacement API; this scoped CAS replacement preserves one object.
"""
from pathlib import Path
import sqlite3,json,datetime
root=Path(__file__).resolve().parents[1]
board=json.loads((root/'board-ids.json').read_text())
assert board['board']=='support-conversation-20260914'
db=Path('/Users/vladmihaimiron/.hermes/kanban/boards/support-conversation-20260914/kanban.db')
seats={'REV1':'/root/plan_review','REV2':'/root/forgot_destination','REV3':'/root/baseline','GATE':'/root','PRODDELTA':'/root/baseline','FIX4':'/root/requirements','LIVE4':'/root/preview','ARCHCHECK':'/root/plan_review','SECDELTA':'/root/forgot_destination','FIX3':'/root/requirements','LIVE3':'/root/preview','FIX2':'/root/requirements','LIVE2':'/root/preview','LIVE':'/root/preview','UIFIX1':'/root/preview','PRODPREP':'/root/baseline','FIX1':'/root/requirements','SECPREP':'/root/forgot_destination','CORPREP':'/root/plan_review','UI':'/root/preview','TYPEBASE':'/root/baseline','ATTEST':'/root/requirements','UIPREP':'/root/preview','EDITFIX1':'/root/requirements','EDITREV2':'/root/plan_review','BASE':'/root/baseline','REQ':'/root/requirements','FIND':'/root/forgot_destination','PREVIEW':'/root/preview','FREEZE':'/root/baseline','PLANREV':'/root/plan_review','PLANREV2':'/root/plan_review','REQFIX1':'/root/requirements','KB':'/root/requirements','RUNTIME_BASE':'/root/preview','NAV':'/root/requirements','EDITORIAL':'/root/plan_review','PREVIEW_API':'/root/preview','PREVIEW_INIT':'/root/preview','PREVIEW_WRITE_BUDGET':'/root/preview'}
status_map={'todo':'waiting_dependency','ready':'ready','running':'working','review':'waiting_review','blocked':'waiting_human','done':'done','archived':'archived','scheduled':'waiting_resource','triage':'queued'}
conn=sqlite3.connect(db,timeout=15)
conn.row_factory=sqlite3.Row
records=[]
with conn:
 conn.execute('BEGIN IMMEDIATE')
 for key,tid in board['tickets'].items():
  task=conn.execute('SELECT status FROM tasks WHERE id=?',(tid,)).fetchone()
  assert task is not None,tid
  comments=conn.execute('SELECT id,body FROM task_comments WHERE task_id=? ORDER BY id',(tid,)).fetchall()
  candidates=[c for c in comments if c['body'].startswith('STATE\n')]
  assert len(candidates)==1,(tid,len(candidates))
  comment=candidates[0]; state=json.loads(comment['body'][6:]); before=json.loads(json.dumps(state))
  state['status']=status_map[task['status']]
  state['comments_read_through']=comments[-1]['id']
  if key in seats: state['owner']['session']=seats[key]
  if key in ['CP1','CP2','CP3','WHOLE','DEST']:
   state['owner']={'agent':'human','session':None}; state['human_acceptance']='PENDING'
   assert task['status']!='done','Human checkpoint cannot be synchronized as accepted without explicit owner evidence'
  if state['status'].startswith('waiting_'):
   state.setdefault('waiting_since',datetime.datetime.now(datetime.timezone.utc).isoformat());state['escalation_target']='v_packet' if key in ['CP1','CP2','CP3','WHOLE','DEST'] else 'hermes'
  packet=root.parents[2]/'.hermes/planning/support-conversation-20260914/packets'/f'{key}.md'
  if packet.exists(): state['contract']['packet']=str(packet)
  updated='STATE\n'+json.dumps(state,indent=2)
  n=conn.execute('UPDATE task_comments SET body=? WHERE id=? AND task_id=? AND body=?',(updated,comment['id'],tid,comment['body'])).rowcount
  assert n==1,'Concurrent STATE modification'
  records.append({'ticket':tid,'node':key,'before':before,'after':state})
log=root/'state-reconciliation.jsonl'
with log.open('a') as f:f.write(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'records':records})+'\n')
print('Reconciled',len(records),'canonical STATE comments; no task status or dependency changed.')
