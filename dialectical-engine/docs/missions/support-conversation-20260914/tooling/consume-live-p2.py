from pathlib import Path
import json,hashlib,subprocess,datetime,re
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';L=S/'.worktrees/support-conversation-cp1/dialectical-engine';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();bh=lambda b:hashlib.sha256(b).hexdigest()
rev='606b2eabea1dc9212159e53c193cf69655424e77';dest=E/'LIVE_P2-consumption.json';assert not dest.exists();mp=E/'LIVE_P2-manifest.json';assert sha(mp)=='69675e153fb7d789a4637e93d8127ae712e9b52d6706c3116660367992a55a58';m=json.loads(mp.read_text());assert m['artifactCount']==len(m['artifacts'])==45 and m['receiptSelfExcluded'] and m['productRevision']==rev
refs=[]
for r in m['artifacts']:
 p=Path(r['absolute']);assert p==S/r['missionRelative'] and p.is_file() and not p.is_symlink();assert 'stack-detached.log' not in p.name;assert sha(p)==r['sha256'] and p.stat().st_size==r['bytes'];refs.append({'path':str(p),'sha256':r['sha256'],'bytes':r['bytes']})
refs.append({'path':str(mp),'sha256':sha(mp),'bytes':mp.stat().st_size})
acp=E/'ATTEST_P2-consumption.json';assert sha(acp)=='fcab1dd7da70b48dc00b1ec7dcea3ead4607a3ed24e13ecfb6c05dc654a54ad0';ac=json.loads(acp.read_text())
assert subprocess.check_output(['git','--no-optional-locks','-C',str(L),'rev-parse','HEAD'],text=True).strip()==rev and subprocess.check_output(['git','--no-optional-locks','-C',str(L),'status','--porcelain'])==b''
for r in ac['cumulativeProductFiles']:assert sha(L/r['laneRelative'])==r['sha256']
assert len(ac['cumulativeProductFiles'])==108
ip=E/'LIVE_P2-inputs.json';i=json.loads(ip.read_text());assert len(i['inputs'])==16
for r in i['inputs']:assert sha(Path(r['path']))==r['sha256']
required=json.loads((E/'LIVE_P2-required-suites.json').read_text());oldrequired=json.loads((E/'LIVE_P1-required-suites.json').read_text());assert len(required['files'])==len(set(required['files']))==25 and set(oldrequired['files'])<set(required['files'])
actual=json.loads((E/'LIVE_P2-actual-relay-receipt.json').read_text());old=json.loads((E/'LIVE_P1-actual-relay-receipt.json').read_text());snap=json.loads((E/'ATTEST_P2-snapshot-receipt.json').read_text());components=json.loads((L/'packages/support-kb/recovery/components.json').read_text());by={(r['id'],r['lang']):r for r in components['components']};kb=snap['snapshot']['kbVersion']
assert actual['completed'] and actual['revision']==rev and not actual['synthetic_support_overrides'] and actual['credential_or_recovery_operations']==0
assert actual['attested_snapshot']=={'kbVersion':kb,'componentSha256':snap['files']['component']['sha256'],'selectingReviewSha256':snap['files']['review']['sha256']}
assert actual['session_kb_versions']==[kb,kb] and len(actual['prompts'])==len(actual['pre_request_pins'])==7
assert actual['browser']['headless'] and actual['browser']['fresh_profile'] and not actual['browser']['tls_bypass']
keys={'attemptId','code','predicate','hasSources','hasActions','sourceCount','actionCount'};origins=[];ids=[]
for idx,(q,o,pin) in enumerate(zip(actual['prompts'],old['prompts'],actual['pre_request_pins']),1):
 assert q['sequence']==o['sequence']==pin['sequence']==idx
 for k in ['mode','language','topic','input']:assert q[k]==o[k],(idx,k)
 assert q['language']==pin['language'] and pin['kbVersion']==kb
 component=by[(pin['pinnedSourceId'],pin['language'])];assert bh(component['fallback'].encode())==pin['fallbackSha256']
 a=q['api'];v=q['visible'];assert a['status']==200 and a['outcome']=='ANSWER_GROUNDED' and q['grounded_success']
 assert a['text']==v['text'] and [x['label'] for x in a['sources']]==v['sources'] and [{'label':x['label'],'href':x['href']} for x in a['actions']]==v['actions']
 assert q['api_dom_text_equal'] and q['api_dom_source_labels_equal'] and q['api_dom_actions_equal']
 d=q['diagnostic'];assert d['cursorStart']<=d['cursorEnd'] and d['invalidCount']==d['duplicateCount']==d['unmatchedCount']==0
 if d['status']=='ACCEPTED_DRAFT':assert q['response_origin']=='MODEL_ACCEPTED_DRAFT' and d['candidateCount']==d['validCount']==0 and 'record' not in d
 else:
  assert idx==2 and d['status']=='ATTRIBUTED_RECOVERY' and q['response_origin']=='REVIEWED_FALLBACK' and d['candidateCount']==d['validCount']==1
  r=d['record'];assert set(r)==keys and r['code']=='SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION' and r['predicate']=='CREDENTIAL_OPERATION';assert re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',r['attemptId']);ids.append(r['attemptId'])
  assert a['text']==component['fallback'] and [x['id'] for x in a['sources']]==[pin['pinnedSourceId']] and a['actions']==[]
 origins.append(q['response_origin'])
assert origins.count('MODEL_ACCEPTED_DRAFT')==6 and origins.count('REVIEWED_FALLBACK')==1 and len(ids)==len(set(ids))==1
assert sum(x['operation']=='send_message' for x in actual['network'])==7 and sum(x['operation']=='create_session' for x in actual['network'])==2
for n,mode in zip(actual['navigations'],['pointer','keyboard-enter']):assert n['input']==mode and n['performed'] and n['href']=='/login?next=%2Fnew' and n['destination']=='https://localhost:3100/login?next=%2Fnew'
assert actual['console_error_categories']=={'HTTP_401':15,'HTTP_404':0,'JS_OR_HYDRATION':0,'OTHER':0} and actual['console_error_count']==15
pre=json.loads((E/'LIVE_P2-pretraffic-session-gate-failure.json').read_text());assert not pre['completed'] and pre['prompts']==[] and not any(x['operation']=='send_message' for x in pre['network'])
idle=json.loads((E/'LIVE_P2-idle-custody.json').read_text());assert idle['revision']==idle['head']==rev and idle['product_status_clean'] and idle['idle_seconds']==10 and not idle['browser_profile_present'];assert idle['supervisor']['pid']==idle['supervisor']['pgid']==86341 and idle['supervisor']['ppid']==1
assert idle['ordinary_system_tls']=={'url':'https://localhost:3100/help','custom_ca':False,'insecure':False,'status':200}
assert all(x==1 for x in idle['preview_listeners'].values()) and all(x==1 for x in idle['original_listeners'].values())
assert set(idle['preview_listeners'])==set(map(str,[3100,3101,*range(8890,8897)])) and set(idle['original_listeners'])==set(map(str,range(8790,8797)))
ilog=O/'logs/LIVE_P2-integrated-suite.log';assert sha(ilog)=='b8901466de0fc1059b420565a2082c31e6b1bb818c08ce6854a6e74745aa39e7';it=ilog.read_text();assert '1 failed | 24 passed (25)' in it and '1 failed | 977 passed | 1 todo (979)' in it and 'support-degraded.test.ts:57:8' in it
alog=O/'logs/LIVE_P2-adapter-green3.log';assert sha(alog)==actual['pre_request_adapter_proof']['sha256'];controls=[json.loads(x) for x in alog.read_text().splitlines() if x.startswith('{')];assert controls[0]['totalControls']==27 and controls[1]['totalControls']==54 and controls[1]['adapterProperties']==20 and controls[1]['canonicalPins']==7
glog=O/'logs/LIVE_P2-session-gate-green.log';assert sha(glog)=='1e717a4f5a8f6e45936a7864d9b2dd5e75dfcf8014dac9136bd754aa41b85227' and '10/10 inert controls passed' in glog.read_text()
native=Path('/Users/vladmihaimiron/.codex/sessions/2026/09/14/rollout-2026-09-14T11-21-56-01a09f02-346a-7fb0-aa70-0424f1fdd21e.jsonl');calls={};outs={};patches=[]
for line in native.read_text().splitlines():
 try:d=json.loads(line)
 except:continue
 q=d.get('payload',{});ts=d.get('timestamp','');typ=q.get('type');cid=q.get('call_id')
 if ts<'2026-09-15T17:20:00':continue
 if typ in ['function_call','custom_tool_call']:
  raw=q.get('arguments',q.get('input',''));calls[cid]={'at':ts,'raw':raw}
  if isinstance(raw,str):
   for target in re.findall(r'\*\*\* (?:Add|Update|Delete) File: ([^\n\\]+)',raw):patches.append({'at':ts,'target':target})
 elif typ in ['function_call_output','custom_tool_call_output']:
  v=q.get('output','')
  if isinstance(v,str):
   try:v=json.loads(v)
   except:pass
  text='\n'.join(x.get('text','') for x in v) if isinstance(v,list) else str(v)
  outs[cid]={'at':ts,'text':text}
aid='call_i0DPBLet166BPdoieBIpaN1b';gid='call_T8QBS4Lz7uO6N5lpJ3MXtmGo';bid='call_VM8EuagqIDGJ0I0yBU5c3al3'
assert 'rc=0' in outs[aid]['text'] and '"exit_code":0' in outs[gid]['text'];assert outs[aid]['at']<outs[gid]['at']<calls[bid]['at'];assert 'LIVE_P2-actual-relay-browser2.log' in calls[bid]['raw']
for rel,t in [('pre-request-adapter.ts',outs[aid]['at']),('verify-pre-request-adapter.ts',outs[aid]['at']),('session-version-gate.mjs',outs[gid]['at']),('verify-session-version-gate.mjs',outs[gid]['at'])]:
 mutations=[x['at'] for x in patches if x['target']==str(O/'probes/LIVE_P2'/rel)];assert mutations and max(mutations)<t
hp=E/'HARNESS_P2-consumption.json';assert sha(hp)=='56568d834d611d6f26131b8880e9594bcfea69a69c534869432f7ee985494506';proof=json.loads(hp.read_text())['nativeSkillBodyProof'];assert len(proof)==6
for v in proof.values():assert sha(Path(v['file']))==v['sha256']
summary={'integrated':{'revision':rev,'rc':1,'files':25,'filesPassed':24,'filesFailed':1,'passed':977,'failed':1,'todo':1,'total':979,'durationSeconds':79.82,'failure':'support-degraded screened-model transport fixture expected REFUSE_SAFETY+usage, got NO_SOURCE'},'actual':{'revision':rev,'sentOnce':7,'http200Grounded':7,'apiDomEqual':7,'acceptedDrafts':6,'attributedReviewedRecovery':1,'attributedRefusals':0,'ambiguous':0,'manualUsefulAuthorReported':7,'englishPointer':'PASS','compactRomanianKeyboard':'PASS','minorQualityNote':'One Romanian Settings draft contains lucruuri; final product reviewer owns disposition.'},'preview':{'url':'https://localhost:3100/help','runtimeRevision':rev,'pid':86341,'pgid':86341,'ppid':1,'normalTlsStatus':200,'browserExited':True,'idleSeconds':10,'profileRemoved':True,'previewAndOriginalListenersPresent':True},'console':actual['console_error_categories']}
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':'LIVE_P2','ticket':'t_f60b27a3','state':'LIVE_EVIDENCE_CONSUMED_WITH_INTEGRATED_TEST_BLOCKER','productCommit':rev,'clean':True,'manifest':{'path':str(mp),'sha256':sha(mp)},'immutableReferences':refs,'checks':{'artifacts':45,'indexedInputs':16,'currentProductPaths':108,'priorSuiteMembersRetained':23,'finalSuiteMembers':25,'sameSevenPrompts':True,'preRequestPinHashBindings':7,'apiDomComparisons':7,'exactReviewedRecoveryMatches':1,'producerKeyCount':7,'nativeSkillBodiesRetained':6},'summary':summary,'nativeTiming':{'adapterControl':{'callId':aid,'completedAt':outs[aid]['at'],'logSha256':sha(alog)},'sessionGateControl':{'callId':gid,'completedAt':outs[gid]['at'],'logSha256':sha(glog)},'actualCaptureLaunch':{'callId':bid,'at':calls[bid]['at']},'guard':'Both successful control calls completed before actual capture launch; named adapter/gate patch targets precede their controls. Native outputs establish command timing; no product rerun by root.'},'nativeSkillBodyProof':proof,'skillProofContinuity':{'path':str(hp),'sha256':sha(hp),'sameNativeSession':'01a09f02-346a-7fb0-aa70-0424f1fdd21e','scope':'Previously consumed actual BODY reads retained; current skill hashes match, no fresh-read claim.'},'attributionQualifications':['The six no-event drafts and one exact reviewed fallback are separated; no model-quality improvement, discarded-text, matched-token or semantic false-positive inference.','Unique UUID plus isolated cursor is bounded attribution, not an API-event join.','Final receipt preserves the failed pre-traffic session gate and its corrected nested/lazy-session observer with fresh10 controls before sampling; no prompt retries.','The actual successful browser capture was started once after the final session gate. Helper/control proof wiring remains subject to separate final review.','Author report calls the forthcoming final review pass2 in its limitations; the actual mission is final pass3/3. This is a numbering typo, not another review pass.','Manual usefulness and screenshot QA are attributed Sol preview judgments, not a root product verdict.','15 HTTP401 events have unverified origin/harmlessness.','Latest preview custody is at its recorded timestamp; this consumption does not perform a new HTTP or process-liveness check.'],'boardHandoff':'Worker reported auto-review rejection for the detailed final board metadata payload. Root independently read back this established local mission ticket; a minimal status/reference marker will be persisted through the authorized mission CLI.','limits':['Integrated test remains failed until separate one-test correction and review; no broad suite PASS claim.','Only test-only correction may follow without new runtime sample, and any later Git HEAD must be bound separately.','Forgot destination unresolved; final three review lenses pending; no CP1 readiness or acceptance.','Ongoing private stack log is excluded and was not read/copied/hashed by root.']}
dest.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'consumption':str(dest),'sha256':sha(dest),'artifacts':45,'productPaths':108,'actual':7,'accepted':6,'reviewedRecovery':1,'controlsBeforeTraffic':True}))
