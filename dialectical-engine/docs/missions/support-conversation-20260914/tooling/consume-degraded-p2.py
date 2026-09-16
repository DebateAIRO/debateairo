from pathlib import Path
import json,hashlib,subprocess,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';L=S/'.worktrees/support-conversation-cp1/dialectical-engine'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base='606b2eabea1dc9212159e53c193cf69655424e77';rev='5cbfc6d483aae0f56eabfdee00a6829e09e76c3d';rel='tests/integration/support-degraded.test.ts';rp=E/'FIX_P2_DEGRADED-receipt.json';dest=E/'FIX_P2_DEGRADED-consumption.json';assert not dest.exists()
def git(*a):return subprocess.check_output(['git','--no-optional-locks','-C',str(L),*a])
assert sha(rp)=='20d2ad8152b1b06c0717b00815283d4094cc2eb9f6d3da57859c3058a5b7b7f6';r=json.loads(rp.read_text());assert r['baseRevision']==base and r['finalRevision']==rev and len(r['artifacts'])==r['artifactCount']==7
refs=[];product=None
for row in r['artifacts']:
 p=Path(row['absolute']);assert sha(p)==row['sha256'] and p.stat().st_size==row['bytes']
 if row['kind']=='productTest':assert p==L/rel;product=row
 else:assert p==S/row['missionRelative'];refs.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size})
for row in r['inputEvidence']:
 p=Path(row['absolute']);assert sha(p)==row['sha256'] and p.stat().st_size==row['bytes']
assert git('rev-parse','HEAD').decode().strip()==rev and git('status','--porcelain')==b'' and git('rev-parse',rev+'^').decode().strip()==base
assert git('diff','--name-only',base,rev).decode().splitlines()==['dialectical-engine/'+rel]
before=git('show',base+':dialectical-engine/'+rel);after=git('show',rev+':dialectical-engine/'+rel)
old=b'  body: "Open the new debate page to start your first debate."\n';new=b'  body: "Open the new debate page to start your first debate.",\n  modelProjection: "Open the new debate page to start your first debate."\n'
assert before.count(old)==1 and after==before.replace(old,new) and after==(L/rel).read_bytes();assert b'fallback' not in after.split(b'const ENTRY = Object.freeze({')[1].split(b'});')[0]
red=O/'logs/FIX_P2_DEGRADED-target-red.log';green=O/'logs/FIX_P2_DEGRADED-file-green.log'
assert 'Tests  1 failed | 7 skipped (8)' in red.read_text() and '+   "outcome": "NO_SOURCE"' in red.read_text() and 'Tests  8 passed (8)' in green.read_text()
ap=E/'ATTEST_P2-consumption.json';a=json.loads(ap.read_text());proof=a['nativeSkillBodyProof']
assert len(proof)==6
for x in proof.values():assert sha(Path(x['file']))==x['sha256'] and x['bodyPhrase'] in Path(x['file']).read_text()
refs.append({'path':str(rp),'sha256':sha(rp),'bytes':rp.stat().st_size})
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':'FIX_P2_DEGRADED','ticket':'t_7f51fcb1','state':'AUTHOR TEST-ONLY CORRECTION CONSUMED; SEPARATE REV1_P3 DISPOSITION PENDING','baseRevision':base,'productCommit':rev,'runtimeEvidenceRevision':base,'clean':True,'immutableReferences':refs,'productBinding':product,'summary':{'targetedRed':{'revision':base,'exitCode':1,'failed':1,'skipped':7,'observed':'NO_SOURCE before model transport'},'affectedFileGreen':{'committedBytes':rev,'exitCode':0,'passed':8,'failed':0,'testFiles':1},'onlyChangedFile':rel,'onlySemanticChange':'Safe modelProjection added to shared ENTRY fixture','fallbackAbsent':True,'allExistingAssertionsByteUnchanged':True,'allOtherTrackedGitPathsUnchanged':True,'newLiveSample':False,'whole25SuiteRerun':False,'limit':'The original exact25 run at606b remains 977 passed,1 failed,1 Forgot TODO. This final focused8/8 evidence is separate, not a new whole-suite PASS.'},'nativeSkillBodyProof':proof,'skillProofContinuity':{'path':str(ap),'sha256':sha(ap),'sameNativeAuthorSession':'01a09ef7-fa46-7b73-bc98-70f84abd06cc','scope':'Retained actual same-session BODY reads, current hashes checked; no fresh-read claim.'},'checks':{'artifacts':7,'immutableReferences':7,'singleParent':base,'oneFileExactByteTransformation':True,'allNonTestTrackedPathsUnchanged':True},'limits':['Root verified custody, exact one-file transformation and captured evidence; root did not execute product or issue the separate review verdict.','LIVE_P2 remains measured at606b. No runtime, content or configuration changes, reload or new actual model sample.','Forgot destination and owner acceptance remain unresolved; no readiness or checkpoint advancement.']}
dest.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'path':str(dest),'sha256':sha(dest),'revision':rev,'immutableReferences':len(refs),'assertionsUnchanged':True}))
