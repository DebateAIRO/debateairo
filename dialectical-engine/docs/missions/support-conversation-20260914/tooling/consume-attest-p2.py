from pathlib import Path
import json,hashlib,subprocess,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';L=S/'.worktrees/support-conversation-cp1/dialectical-engine'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();bh=lambda b:hashlib.sha256(b).hexdigest()
dest=E/'ATTEST_P2-consumption.json';assert not dest.exists()
rev='606b2eabea1dc9212159e53c193cf69655424e77';base='dfeb7eef93de31e19367760d87c09ca1ef76544e';prefix='dialectical-engine/'
def git(*a):return subprocess.check_output(['git','--no-optional-locks','-C',str(L),*a])
assert git('rev-parse','HEAD').decode().strip()==rev and git('status','--porcelain')==b''
rp=E/'ATTEST_P2-artifact-receipt.json';assert sha(rp)=='af445d6ce4daa2b194fc545088e6e0349684c34458a532652f9708c13df954ed'
r=json.loads(rp.read_text());assert r['artifactCount']==len(r['artifacts'])==15 and r['finalCommit']==rev and r['baseRevision']==base
for row in r['artifacts']:
 p=Path(row['absolute']);assert p==S/row['missionRelative'] and sha(p)==row['sha256'] and p.stat().st_size==row['bytes'],p
mp=E/'ATTEST_P2-product-manifest.json';sp=E/'ATTEST_P2-snapshot-receipt.json';m=json.loads(mp.read_text());s=json.loads(sp.read_text())
assert sha(mp)=='38a9b3f2f5a71c2137a4fe878d2704b55abeecf67777ea69afdd967c1e777fee' and sha(sp)=='cfdaf33e1fc4e5e303d00764be509829e6631e36a60aece79813b6fb42163de2'
assert m['finalCommit']==s['finalCommit']==rev and m['baseRevision']==s['baseRevision']==base
allowed={'packages/support-kb/reviews/manifest.json','tests/unit/support-kb.test.ts','tests/unit/support-recovery-attestation.test.ts','tests/unit/support-recovery-components.test.ts'}
assert {x['laneRelative'] for x in m['productPaths']}==allowed and len(m['productPaths'])==4
assert set(git('diff','--name-only',base,rev).decode().splitlines())=={prefix+x for x in allowed}
prev=base
for c in m['commits']:
 assert git('rev-parse',c['revision']+'^').decode().strip()==prev
 assert set(git('diff','--name-only',prev,c['revision']).decode().splitlines())=={prefix+x for x in c['paths']};prev=c['revision']
assert prev==rev
for x in m['productPaths']:
 p=L/x['laneRelative'];assert str(p)==x['absolute'] and sha(p)==x['sha256'] and p.stat().st_size==x['bytes'] and p.read_bytes()==git('show',rev+':'+prefix+x['laneRelative'])
priorp=E/'EDITFIX_P2-consumption.json';assert sha(priorp)=='e8ce37315359e8f30dbd73240cfc0dccc676b98a4d61eba8c8b6b21cacbde219';prior=json.loads(priorp.read_text());oldfiles={x['laneRelative']:x for x in prior['cumulativeProductFiles']}
paths=set(oldfiles)|allowed;assert len(paths)==108
assert set(git('diff','--name-only','b7ca2c413bf3242ce18e29a397dc9a3aa9228893',rev).decode().splitlines())=={prefix+x for x in paths}
current=[]
for rel in sorted(paths):
 p=L/rel;raw=p.read_bytes();assert raw==git('show',rev+':'+prefix+rel)
 if rel not in allowed:assert bh(raw)==oldfiles[rel]['sha256']
 current.append({'laneRelative':rel,'sha256':bh(raw),'bytes':len(raw)})
manifestrel='packages/support-kb/reviews/manifest.json';old=json.loads(git('show',base+':'+prefix+manifestrel));new=json.loads((L/manifestrel).read_text())
assert new['schemaVersion']==2 and old['catalog']==new['catalog'] and old['articles']==new['articles'] and len(new['articles'])==24
ep=E/'EDITREV_P2-consumption.json';assert sha(ep)=='5b877215e190ae7faedc93b7b1f2d334d36192e11a2567c7815c9f092ace729c';ed=json.loads(ep.read_text());assert ed['verdict']=='PASS'
ec={(x['id'],x['lang']):x for x in ed['rows']};co=json.loads((L/'packages/support-kb/recovery/components.json').read_text());components={(x['id'],x['lang']):x for x in co['components']};mr={(x['id'],x['lang']):x for x in new['recovery']['components']};sr={x['logicalKey']:x for x in s['logicalRecords']}
assert len(ec)==len(components)==len(mr)==len(sr)==36
assert new['recovery']['componentFileSha256']==sha(L/'packages/support-kb/recovery/components.json')
for key,c in components.items():
 a=ec[key];b=mr[key];q=sr[key[0]+'.'+key[1]]
 assert a['projectionDisposition']==a['fallbackDisposition']=='PASS'
 for k in ['articleSha256','modelProjectionSha256','fallbackSha256']:assert a[k]==b[k]
 assert bh(c['modelProjection'].encode())==b['modelProjectionSha256']==q['modelProjectionSha256'] and bh(c['fallback'].encode())==b['fallbackSha256']==q['fallbackSha256']
 assert c['articleSha256']==b['articleSha256']==q['article']['sha256']==sha(Path(q['article']['absolute']))
 for k,v in {'reviewedBy':'SOL','reviewerSession':ed['reviewerSession'],'reviewedOn':ed['reviewedOn'],'evidence':ed['evidence'],'ratifiedBy':'','ratifiedOn':''}.items():assert b[k]==q['review'][k]==v
for v in s['files'].values():
 if isinstance(v,dict):
  p=Path(v['absolute']);assert p==L/v['laneRelative'] and sha(p)==v['sha256'] and p.stat().st_size==v['bytes']
assert s['reviewBinding']['evidenceSha256']==sha(Path(ed['evidence']))
assert s['snapshot']['entryCount']==36 and s['snapshot']['kbVersion']==s['snapshot']['canonicalManifestSha256']=='d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df'
assert s['catalogDigests']['canonicalCatalogSha256']=='24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe' and s['catalogDigests']['catalogSourceFileSha256']==sha(L/'packages/support-kb/src/catalog.ts')
for v in m['verification'].values():
 if 'absolute' in v:assert sha(Path(v['absolute']))==v['sha256'] and Path(v['absolute']).stat().st_size==v['bytes']
ver=m['verification'];assert ver['affectedFinalAtAttestationCommit']['passed']==449 and ver['affectedFinalAtAttestationCommit']['testFiles']==12 and ver['finalRevisionDelta']['passed']==3
tf=Path(ver['typecheckFinal']['absolute']);tb=Path(ver['typecheckBaseline']['absolute']);assert tf.read_bytes()==tb.read_bytes() and tf.read_text().count('error TS')==76 and ver['typecheckFinal']['rc']==1
suite=m['finalSuiteUnion'];assert suite['count']==25 and sha(Path(suite['path']))==suite['sha256']
fp=E/'FIX_P2-consumption.json';assert sha(fp)=='41e580a63b5be31f6ca408277db8b50c70719907ea36f46b5d415b420eb31183';proofall=json.loads(fp.read_text())['nativeSkillBodyProof'];proof={k:proofall[k] for k in ['using-superpowers','heartbeat-protocol','heartbeat-worker','test-driven-development','verification-before-completion','systematic-debugging']}
for v in proof.values():assert sha(Path(v['file']))==v['sha256'] and v['bodyPhrase'] in Path(v['file']).read_text()
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':'ATTEST_P2','ticket':'t_51e73096','state':'AUTHOR_ATTESTATION_CONSUMED_PENDING_FINAL_LIVE_AND_REVIEW','baseRevision':base,'productCommit':rev,'clean':True,'artifactReceipt':{'path':str(rp),'sha256':sha(rp)},'receiptReferences':r['artifacts'],'cumulativeProductFiles':current,'checks':{'changedProductPaths':4,'commits':2,'cumulativeCommittedCurrentPaths':108,'recoveryRows':36,'separatePassBindings':36,'originalCatalogAnd24ArticleReviewRecordsUnchanged':True,'newOwnerRatificationRecords':0,'nativeSkillBodiesRetained':6},'snapshot':s['snapshot'],'snapshotReceipt':{'path':str(sp),'sha256':sha(sp)},'verification':ver,'evidenceAttributionQualifications':['transitionFailure.revision c7e50817 is a later checkpoint label: the preserved 447/2 failure ran before amendment 1 corrected the stale assertions, in an uncommitted transition state. It is not a failed run against exact c7 committed bytes.','Strict RED used dfeb production bytes plus the newly written test. GREEN revision labels bind eventual committed bytes, not necessarily Git HEAD at command start.','449/449 across 12 suites binds c7; 3/3 in the changed test file binds final 606b. Membership overlaps; do not represent their sum as 452 distinct final-revision tests. LIVE_P2 owns the exact final 25-suite run.','Final typecheck returns 1 with exactly the attributed 76 diagnostics and identical output hash; project typecheck does not pass. The earlier mission-added TS2532 is corrected but TYPE_P2_REGRESSION remains for separate final review.'],'nativeSkillBodyProof':proof,'skillProofContinuity':{'path':str(fp),'sha256':sha(fp),'sameNativeAuthorSession':'01a09ef7-fa46-7b73-bc98-70f84abd06cc','scope':'Retained previously consumed actual skill BODY reads in the same native session; current hashes match, no fresh-read claim.'},'limits':['Root verified custody, input/output bindings and captured evidence, and consumed a separate Sol editorial verdict. Root did not issue a code/content verdict or rerun the loader.','Snapshot immutable checks are attributed author evidence, not a root runtime verdict.','No new model sample or preview reload has occurred; final adapter controls precede live traffic.','Forgot destination remains unresolved; no CP1 readiness or acceptance and no CP2 progression.']}
dest.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'consumption':str(dest),'sha256':sha(dest),'artifacts':15,'productPaths':4,'cumulative':108,'bindings':36,'skills':6}))
for name in ['ATTEST_P2-affected-final2.log','ATTEST_P2-recovery-components-green.log']:
 print(name);print((O/'logs'/name).read_text()[-800:])
