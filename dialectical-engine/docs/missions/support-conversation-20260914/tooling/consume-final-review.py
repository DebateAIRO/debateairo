from pathlib import Path
import sys,json,hashlib,subprocess,datetime,ast
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';Q=O/'review-packages/CP1-p3';L=S/'.worktrees/support-conversation-cp1/dialectical-engine';SP=Path('/Users/vladmihaimiron/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(sys.argv)==4,'LENS_NUMBER EXPECTED_RECEIPT_SHA VERDICT';n=int(sys.argv[1]);assert n in (1,2,3);node=f'REV{n}_P3';rp=E/f'{node}-receipt.json';assert sha(rp)==sys.argv[2];r=json.loads(rp.read_text());verdict=sys.argv[3];assert verdict in ['PASS','REWORK','BLOCKED'];rev='5cbfc6d483aae0f56eabfdee00a6829e09e76c3d';dest=E/f'REV{n}-p3-consumption.json';assert not dest.exists()
assert r['node']==node and (r.get('revision') or r.get('productRevision'))==rev and r['verdict']==verdict
ids=json.loads((D/'board-ids.json').read_text())['tickets'];assert r['ticket']==ids[node]
gp=E/'GATE_P3-manifest.json';g=json.loads(gp.read_text());assert g['revision']==rev and g['reviewPass']==3
for x in g['immutableInputs']:
 p=Path(x['path']);assert sha(p)==x['sha256'] and p.stat().st_size==x['bytes'],p
ip=Q/f'REV{n}-inputs.json';idx=json.loads(ip.read_text());assert idx['revision']==rev
for x in idx['inputs']:assert sha(Path(x['path']))==x['sha256']
w=Path(idx['cwd'])
for lane in [L,w]:
 assert subprocess.check_output(['git','--no-optional-locks','-C',str(lane),'rev-parse','HEAD'],text=True).strip()==rev
 assert subprocess.check_output(['git','--no-optional-locks','-C',str(lane),'status','--porcelain'])==b''
 for x in g['productFiles']:assert sha(lane/x['laneRelative'])==x['sha256']
assert len(g['productFiles'])==108
arts=r['artifacts'];assert arts and len({x['absolute'] for x in arts})==len(arts)
for x in arts:
 p=Path(x['absolute']);assert p==S/x['missionRelative'] and p!=rp and p.is_file() and not p.is_symlink();assert '-stack-detached.log' not in p.name;assert sha(p)==x['sha256'] and p.stat().st_size==x['bytes'],p
report=D/f'reviews/REV{n}-p3.md';selfp=O/f'agent-reports/{node}.md';assert str(report) in [x['absolute'] for x in arts] and str(selfp) in [x['absolute'] for x in arts]
previous=json.loads((E/f'REV{n}-p2-consumption.json').read_text());native=Path(previous['skills']['transcript'])
phrases={'using-superpowers':'This is not negotiable. You cannot rationalize your way out of this.','heartbeat-protocol':'One role per node: a seat that reviews does not code, and no seat reviews its own work','heartbeat-reviewer':"is a finding against the orchestrator's packet, not against the worker who obeyed it",'verification-before-completion':'NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE','systematic-debugging':'Violating the letter of this process is violating the spirit of debugging.','test-driven-development':"If you didn't watch the test fail, you don't know if it tests the right thing."}
def flatten(v):
 if isinstance(v,str):
  try:decoded=json.loads(v)
  except (ValueError,TypeError):
   try:decoded=ast.literal_eval(v)
   except (ValueError,SyntaxError):return v
  return flatten(decoded) if decoded!=v else v
 if isinstance(v,list):return '\n'.join(flatten(x) for x in v)
 if isinstance(v,dict):return '\n'.join(flatten(x) for x in v.values())
 return ''
proof={}
with native.open() as f:
 for line in f:
  try:z=json.loads(line)
  except json.JSONDecodeError:continue
  q=z.get('payload',{})
  if z.get('type')!='response_item' or q.get('type') not in ['function_call_output','custom_tool_call_output']:continue
  out=flatten(q.get('output',''))
  for skill,phrase in phrases.items():
   if skill in proof or phrase not in out:continue
   file=(S/'.claude/skills'/skill/'SKILL.md') if skill.startswith('heartbeat-') else SP/skill/'SKILL.md';assert phrase in file.read_text()
   proof[skill]={'file':str(file),'sha256':sha(file),'bodyPhrase':phrase,'nativeTimestamp':z.get('timestamp'),'nativeCallId':q.get('call_id'),'outputBodySha256':hashlib.sha256(out.encode()).hexdigest(),'method':'Actual native tool output BODY only, not invocation arguments; retained same-session read, no fresh-read claim.'}
for k in ['using-superpowers','heartbeat-protocol','heartbeat-reviewer','verification-before-completion']:assert k in proof,(node,k)
refs=[{'path':x['absolute'],'sha256':x['sha256'],'bytes':x['bytes']} for x in arts]+[{'path':str(rp),'sha256':sha(rp),'bytes':rp.stat().st_size}]
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':node,'ticket':r['ticket'],'verdict':verdict,'revision':rev,'state':'SEPARATE REVIEW EVIDENCE CONSUMED; ROOT FINDING DISPOSITIONS PENDING','receipt':{'path':str(rp),'sha256':sha(rp)},'report':{'path':str(report),'sha256':sha(report)},'selfReport':{'path':str(selfp),'sha256':sha(selfp)},'immutableReferences':refs,'gateManifest':{'path':str(gp),'sha256':sha(gp),'inputsReverified':len(g['immutableInputs'])},'lensIndex':{'path':str(ip),'sha256':sha(ip),'inputsReverified':len(idx['inputs'])},'productFilesReverified':108,'detachedCwd':str(w),'primaryAndDetachedClean':True,'nativeSession':str(native),'nativeSkillBodyProof':proof,'limits':['Root verified custody, exact indexed/current bytes and captured evidence; reviewer owns substantive verdict.','Separate native Sol session, not independent model-family review.','LIVE_P2 stays measured at606b, whose runtime/config/content equals final5cbf; final commit changes one test only.','No owner acceptance or checkpoint readiness; Forgot destination remains unresolved.']}
dest.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(dest),'sha256':sha(dest),'verdict':verdict,'artifacts':len(arts),'gateInputs':len(g['immutableInputs']),'productFiles':108,'nativeBodies':list(proof)}))
