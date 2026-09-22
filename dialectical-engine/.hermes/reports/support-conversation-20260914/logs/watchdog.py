from pathlib import Path
import json,time,hashlib,datetime,os
root=Path(__file__).resolve().parent
out=root/'watchdog.status'
watched=root/'agents.json'
last_sig=None
last_change=time.monotonic()
while True:
 try:
  state=json.loads(watched.read_text())
  files=[]
  for directory in [root.parent/'evidence',root.parent/'agent-reports',root.parents[3]/'docs/missions/support-conversation-20260914']:
   if directory.exists():
    files.extend((str(p),p.stat().st_mtime_ns,p.stat().st_size) for p in directory.rglob('*') if p.is_file())
  signature=hashlib.sha256(json.dumps([state,files],sort_keys=True).encode()).hexdigest()
  now=datetime.datetime.now(datetime.timezone.utc).isoformat()
  if signature!=last_sig:
   last_change=time.monotonic(); last_sig=signature
  gate=state.get('state')=='WAITING_FOR_USER_VERIFICATION'
  idle=int(time.monotonic()-last_change)
  status={'state':'WAITING_FOR_USER_VERIFICATION' if gate else ('LIVENESS_RECONCILIATION_NEEDED' if idle>=1200 else 'RUNNING'),'checked_at':now,'last_event':state.get('last_event'),'idle_seconds':idle,'pid':os.getpid(),'signature':signature,'auto_dispatch':False,'auto_accept':False,'notify_unchanged':False,'note':'Native agent lifecycle remains authoritative; no CPU observability here. This watchdog never declares a live read-only agent dead.'}
  temp=out.with_suffix('.tmp');temp.write_text(json.dumps(status,indent=2)+'\n');temp.replace(out)
 except Exception as e:
  out.write_text(json.dumps({'state':'WATCHDOG_ERROR','type':type(e).__name__})+'\n')
 time.sleep(60)
