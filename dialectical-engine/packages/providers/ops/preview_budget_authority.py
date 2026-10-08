#!/usr/bin/env python3
"""Root-owned, single-authority private preview spending gate. No retries.

prepare is read-only. freeze revokes legacy Mac GO hashes; activate accepts only
that exact frozen ledger on the reviewed Linux host. The original entries and
uncertain holds remain intact. serve is Root-operated Unix IPC; only it reads
Root's credential and makes the one fixed upstream HTTPS request.
"""
import argparse, copy, fcntl, hashlib, importlib.util, json, os, re, socket, stat, struct, sys, time
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MODEL='zai-org/GLM-5.3-Flash'
SCOPE='preview-synthetic-debate-20261004'
OUTPUT_BOUND=163840
DEFAULT_HELPER=Path('/Users/stefannour/DebateAIRO/docs/operations/initial-testing-2026-10-03/staging-execution/deepinfra/benchmark/benchmark.py')

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load_helper(path):
 spec=importlib.util.spec_from_file_location('preview_accounting_helper',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def read_go(path,helper):
 try:go=json.loads(Path(path).read_text())
 except (OSError,ValueError):raise helper.SafetyError('ROOT_GO_REQUIRED') from None
 if go.get('schema')!='preview-provider-budget-go-v1' or go.get('allow_paid_calls') is not True or go.get('bridge_sha256')!=sha(Path(__file__)) or go.get('helper_sha256')!=sha(Path(helper.__file__)) or go.get('model')!=MODEL or go.get('requested_effort')!='high' or go.get('total_budget_usd')!='1.00' or go.get('retain_prior_uncertainty') is not True or go.get('revoke_mac_execution') is not True or go.get('scope_id')!=SCOPE or not isinstance(go.get('target_host'),str) or not re.fullmatch(r'[A-Za-z0-9.-]{1,128}',go['target_host']) or type(go.get('max_paid_posts')) is not int or not 1<=go['max_paid_posts']<=64 or not isinstance(go.get('allowed_peer_uids'),list) or not go['allowed_peer_uids'] or any(type(uid) is not int or uid<0 for uid in go['allowed_peer_uids']):
  raise helper.SafetyError('ROOT_GO_INVALID')
 return go

class LockedLedger:
 def __init__(self,private,helper):self.private=Path(private);self.helper=helper
 def __enter__(self):
  h=self.helper;self.writer=h.Ledger(self.private);self.writer.dir_fd=h.private_dir_fd(self.private);self.writer.lock_fd=None
  try:
   self.writer.lock_fd=h.secure_open(self.writer.dir_fd,'budget-ledger.lock',os.O_RDWR,create=True);fcntl.flock(self.writer.lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   fd=h.secure_open(self.writer.dir_fd,'budget-ledger.json',os.O_RDONLY)
   with os.fdopen(fd,'rb') as stream:raw=stream.read(1024*1024+1)
   if len(raw)>1024*1024:raise h.SafetyError('LEDGER_TOO_LARGE')
   self.data=json.loads(raw);self.before_hash=hashlib.sha256(raw).hexdigest();self.writer.data=self.data
   if self.data.get('schema')!='deepinfra-global-dollar-ledger-v1' or self.data.get('budget_usd')!='1.00' or self.data.get('stopped') is not True:raise h.SafetyError('ORIGINAL_STOPPED_LEDGER_REQUIRED')
   self.writer.total();self.check_originals();return self
  except BaseException:self.writer.__exit__(None,None,None);raise
 def __exit__(self,*args):self.writer.__exit__(*args)
 def total(self):return self.writer.total()
 def check_originals(self):
  control=self.data.get('preview_authority')
  if control and any(self.data['entries'].get(k)!=v for k,v in control['baseline_entries'].items()):raise self.helper.SafetyError('PRIOR_CHARGE_CHANGED')
 def save(self):self.check_originals();self.writer.save()

def prepare_plan(private,helper,target_host):
 with LockedLedger(private,helper) as ledger:
  if any(e['state']=='pending' for e in ledger.data['entries'].values()) or ledger.total()>Decimal('1.00'):raise helper.SafetyError('UNFINISHED_OR_OVERRUN_LEDGER')
  return {'schema':'preview-provider-budget-transfer-plan-v1','starting_ledger_sha256':ledger.before_hash,'prior_entry_count':len(ledger.data['entries']),'retained_held_usd':str(ledger.total()),'remaining_usd':str(Decimal('1.00')-ledger.total()),'retained_uncertain_entry_ids':[k for k,e in ledger.data['entries'].items() if e['state']=='uncertain'],'target_host':target_host,'model':MODEL,'requested_effort':'high','output_reservation_tokens':OUTPUT_BOUND,'context_window_tokens':1048576,'prices_usd_per_million':{'input':'0.15','output':'0.50'},'deadline_seconds':600,'manual_window_hours':24,'bridge_sha256':sha(Path(__file__)),'helper_sha256':sha(Path(helper.__file__)),'scope_id':SCOPE,'activation_state':'NOT_ACTIVATED; Root must approve/freeze sole authority before transferring'}

def freeze_source(private,go_path,helper):
 go=read_go(go_path,helper)
 with LockedLedger(private,helper) as ledger:
  if ledger.before_hash!=go['starting_ledger_sha256'] or 'preview_authority' in ledger.data or any(e['state']=='pending' for e in ledger.data['entries'].values()) or ledger.total()>Decimal('1.00'):raise helper.SafetyError('FREEZE_SNAPSHOT_MISMATCH')
  ledger.data['preview_authority']={'state':'frozen_for_transfer','go_sha256':sha(go_path),'source_ledger_sha256':ledger.before_hash,'baseline_entries':copy.deepcopy(ledger.data['entries']),'target_host':go['target_host'],'scope_id':SCOPE,'paid_posts':0,'frozen_at':helper.utc_now()};ledger.save()
  return {'state':'frozen_for_transfer','frozen_ledger_sha256':sha(Path(private)/'budget-ledger.json'),'held_usd':str(ledger.total()),'mac_v1_still_stopped':True,'legacy_v2_go_revoked_by_new_ledger_hash':True}

def activate_target(private,go_path,frozen_hash,helper,host=None,platform=None):
 go=read_go(go_path,helper);host=host or socket.gethostname();platform=platform or sys.platform
 with LockedLedger(private,helper) as ledger:
  control=ledger.data.get('preview_authority',{})
  if platform!='linux' or host!=go['target_host'] or ledger.before_hash!=frozen_hash or control.get('state')!='frozen_for_transfer' or control.get('go_sha256')!=sha(go_path) or control.get('source_ledger_sha256')!=go['starting_ledger_sha256']:raise helper.SafetyError('TRANSFER_AUTHORITY_MISMATCH')
  control.update(state='active',active_host=host,activated_at=helper.utc_now(),expires_at_utc=(datetime.now(timezone.utc)+timedelta(hours=24)).isoformat());ledger.save()
  return {'state':'active','held_usd':str(ledger.total()),'remaining_usd':str(Decimal('1.00')-ledger.total()),'authority_host':host}

def valid_response_format(body):
 if not isinstance(body,dict):return False
 fields={'model','reasoning_effort','max_tokens','messages'}
 if set(body)==fields:return True
 if set(body)!=fields|{'response_format'}:return False
 mode=body['response_format']
 return isinstance(mode,dict) and set(mode)=={'type'} and mode['type']=='json_object'

def validate_request(input,go,helper):
 if not isinstance(input,dict) or set(input)!={'scope_id','operationId','requestBody','requestSha256','reservedUsd'} or input['scope_id']!=go['scope_id'] or not isinstance(input['operationId'],str) or not re.fullmatch(r'[A-Za-z0-9-]{1,96}',input['operationId']) or not isinstance(input['requestBody'],str) or len(input['requestBody'].encode())>256*1024 or hashlib.sha256(input['requestBody'].encode()).hexdigest()!=input['requestSha256']:raise helper.SafetyError('REQUEST_SCOPE_INVALID')
 try:body=json.loads(input['requestBody'])
 except ValueError:raise helper.SafetyError('REQUEST_INVALID') from None
 if not valid_response_format(body) or body['model']!=MODEL or body['reasoning_effort']!='high' or type(body['max_tokens']) is not int or not 1<=body['max_tokens']<=OUTPUT_BOUND or not isinstance(body['messages'],list) or not body['messages'] or any(not isinstance(m,dict) or set(m)!={'role','content'} or m['role'] not in ('system','user','assistant') or not isinstance(m['content'],str) for m in body['messages']):raise helper.SafetyError('REQUEST_PARAMETERS_INVALID')
 reserved=(Decimal(len(input['requestBody'].encode())+2048)*Decimal('0.15')+Decimal(OUTPUT_BOUND)*Decimal('0.50'))/Decimal(1000000)
 if helper.decimal_amount(input['reservedUsd'])!=reserved:raise helper.SafetyError('RESERVATION_MISMATCH')
 return body,reserved

def execute_request(private,go_path,input,helper,dispatch=None,key_loader=None,host=None,platform=None,peer_uid=None):
 go=read_go(go_path,helper);body,reserved=validate_request(input,go,helper);host=host or socket.gethostname();platform=platform or sys.platform
 if platform!='linux' or host!=go['target_host'] or peer_uid not in go['allowed_peer_uids']:raise helper.SafetyError('EXECUTION_AUTHORITY_REFUSED')
 key_loader=key_loader or helper.read_key
 if dispatch is None:
  transport=helper.HttpsTransport();transport.timeout=600
  dispatch=transport
 with LockedLedger(private,helper) as ledger:
  control=ledger.data.get('preview_authority',{})
  if control.get('state')!='active' or control.get('go_sha256')!=sha(go_path) or control.get('active_host')!=host or control.get('scope_id')!=SCOPE or control.get('paid_posts',64)>=go['max_paid_posts']:raise helper.SafetyError('AUTHORITY_STOPPED')
  try:expired=datetime.fromisoformat(control['expires_at_utc'])<=datetime.now(timezone.utc)
  except (KeyError,ValueError,TypeError):raise helper.SafetyError('AUTHORITY_EXPIRY_INVALID') from None
  if expired:
   control.update(state='halted',reason='manual_window_expired');ledger.save();raise helper.SafetyError('AUTHORITY_EXPIRED')
  entry_id='preview-test:'+SCOPE+':'+input['operationId']
  if entry_id in ledger.data['entries'] or ledger.total()+reserved>Decimal('1.00') or any(e['state'] in ('pending','uncertain') for k,e in ledger.data['entries'].items() if k not in control['baseline_entries']):raise helper.SafetyError('GLOBAL_TEST_BUDGET_REFUSED')
  entry={'state':'pending','reserved_usd':str(reserved),'held_usd':str(reserved),'reserved_at':helper.utc_now(),'request_sha256':input['requestSha256'],'requested_effort':'high','model':MODEL};ledger.data['entries'][entry_id]=entry;ledger.save()
  start=time.monotonic();response=None;status=None
  try:
   key=key_loader(private)
   entry['dispatched_at']=helper.utc_now();control['paid_posts']+=1;ledger.save()
   status,response=dispatch(body,key)
   response=helper.redact(response if isinstance(response,dict) else {},key)
  except BaseException as error:
   entry.update(state='uncertain',reason='transport_failure',error_class=type(error).__name__);control.update(state='halted',reason='uncertain_charge');ledger.save();raise helper.SafetyError('NEW_CHARGE_UNCERTAIN') from None
  accounting=helper.account_response(response);charge=accounting.get('guard_charge_usd')
  entry['accounting']=accounting;entry['elapsed_seconds']=round(time.monotonic()-start,6)
  if charge is None:
   entry.update(state='uncertain',reason='usage_or_cost_unreported');control.update(state='halted',reason='uncertain_charge');ledger.save();raise helper.SafetyError('NEW_CHARGE_UNCERTAIN')
  amount=Decimal(charge);entry.update(state='settled',held_usd=str(amount),overrun_usd=str(max(Decimal(0),amount-reserved)),reconciled_at=helper.utc_now())
  if amount>reserved or ledger.total()>Decimal('1.00'):control.update(state='halted',reason='charge_overrun')
  elif status!=200 or response.get('model')!=MODEL:control.update(state='halted',reason='provider_error_or_model_identity')
  ledger.save()
  print(json.dumps({'event':'preview_provider_paid_post','operation_id':input['operationId'],'status':'settled' if control['state']=='active' else 'halted','held_usd':str(ledger.total()),'guard_charge_usd':charge,'elapsed_seconds':entry['elapsed_seconds']}),flush=True)
  if control['state']!='active':raise helper.SafetyError('AUTHORITY_HALTED')
  return {'status':status,'body':json.dumps(response,ensure_ascii=False,default=str)}

def halt_authority(private,go_path,helper,reason='operator_stop'):
 go=read_go(go_path,helper)
 with LockedLedger(private,helper) as ledger:
  control=ledger.data.get('preview_authority',{})
  if control.get('go_sha256')!=sha(go_path):raise helper.SafetyError('AUTHORITY_MISMATCH')
  control.update(state='halted',reason=reason);ledger.save();return {'state':'halted','held_usd':str(ledger.total())}

def serve(private,go_path,helper,socket_path):
 go=read_go(go_path,helper)
 if sys.platform!='linux' or os.getuid()!=0 or socket.gethostname()!=go['target_host'] or not re.fullmatch(r'/run/debateai-v3-preview/[a-z0-9-]+\.sock',str(socket_path)) or Path(socket_path).exists():raise helper.SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
 class Server(HTTPServer):
  address_family=socket.AF_UNIX
  def server_bind(self):self.socket.bind(self.server_address);self.server_name='localhost';self.server_port=0
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_POST(self):
   execution_started=False
   try:
    uid=struct.unpack('3i',self.connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]
    length=int(self.headers.get('content-length','0'))
    if self.path!='/complete' or uid not in go['allowed_peer_uids'] or not 1<=length<=1024*1024:raise helper.SafetyError('IPC_REQUEST_REFUSED')
    self.connection.settimeout(5)
    data=json.loads(self.rfile.read(length))
    # Timeout-mode recv waits for readiness even with MSG_DONTWAIT. Check
    # cancellation in nonblocking mode, then restore the reply timeout.
    self.connection.setblocking(False)
    try:
     if self.connection.recv(1,socket.MSG_PEEK)==b'':raise helper.SafetyError('CALLER_CANCELED_BEFORE_DISPATCH')
    except BlockingIOError:pass
    finally:self.connection.settimeout(630)
    execution_started=True
    result=execute_request(private,go_path,data,helper,peer_uid=uid)
    encoded=json.dumps(result,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
   except BaseException:
    # A lost reply may follow a paid settled call; preserve the charge and stop.
    if execution_started:
     try:halt_authority(private,go_path,helper,'ipc_or_delivery_failure')
     except BaseException:pass
    try:self.send_response(409);self.end_headers();self.wfile.write(b'{"error":"PREVIEW_TEST_AUTHORITY_STOPPED"}')
    except BaseException:pass
 server=Server(str(socket_path),Handler);os.chmod(socket_path,0o666)
 try:server.serve_forever()
 finally:server.server_close();Path(socket_path).unlink(missing_ok=True)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('phase',choices=('prepare','freeze','activate','serve','stop'));parser.add_argument('--private',type=Path,required=True);parser.add_argument('--helper',type=Path,default=DEFAULT_HELPER);parser.add_argument('--go',type=Path);parser.add_argument('--target-host',default='ROOT_MUST_SET_REVIEWED_VPS_HOST');parser.add_argument('--frozen-ledger-sha256');parser.add_argument('--socket',type=Path,default=Path('/run/debateai-v3-preview/provider-budget.sock'));args=parser.parse_args()
 try:
  helper=load_helper(args.helper)
  if args.phase=='prepare':result=prepare_plan(args.private,helper,args.target_host)
  elif args.go is None:raise helper.SafetyError('ROOT_GO_REQUIRED')
  elif args.phase=='freeze':result=freeze_source(args.private,args.go,helper)
  elif args.phase=='activate':result=activate_target(args.private,args.go,args.frozen_ledger_sha256,helper)
  elif args.phase=='stop':result=halt_authority(args.private,args.go,helper)
  else:serve(args.private,args.go,helper,args.socket);return 0
  print(json.dumps(result,ensure_ascii=False,default=str));return 0
 except BaseException as error:print(json.dumps({'status':'refused','error_class':type(error).__name__}));return 2

if __name__=='__main__':raise SystemExit(main())
