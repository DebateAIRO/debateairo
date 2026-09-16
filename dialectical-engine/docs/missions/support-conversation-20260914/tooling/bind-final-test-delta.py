from pathlib import Path
import subprocess,json,hashlib,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';Q=O/'review-packages/CP1-p3';L=S/'.worktrees/support-conversation-cp1/dialectical-engine';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();bh=lambda b:hashlib.sha256(b).hexdigest()
cp=E/'FIX_P2_DEGRADED-consumption.json';assert cp.exists(),'Wait for consumed test-only correction';c=json.loads(cp.read_text());rev=c['productCommit'];base='606b2eabea1dc9212159e53c193cf69655424e77';rel='tests/integration/support-degraded.test.ts';prefix='dialectical-engine/'
def git(*a):return subprocess.check_output(['git','--no-optional-locks','-C',str(L),*a])
assert git('rev-parse','HEAD').decode().strip()==rev and git('status','--porcelain')==b''
assert git('diff','--name-only',base,rev).decode().splitlines()==[prefix+rel]
priorp=E/'GATE_P3-product-manifest.json';old=json.loads(priorp.read_text());assert old['revision']==base and len(old['productFiles'])==108
rows=[]
for r in old['productFiles']:
 p=L/r['laneRelative'];raw=p.read_bytes();assert raw==git('show',rev+':'+prefix+r['laneRelative'])
 if r['laneRelative']!=rel:assert bh(raw)==r['sha256']
 rows.append({'laneRelative':r['laneRelative'],'sha256':bh(raw),'bytes':len(raw)})
patches=[]
for label,b in [('complete',old['base']),('pass2-correction',old['correctionBase'])]:
 p=Q/f'CP1-{label}-{rev[:8]}.patch';assert not p.exists();raw=git('diff','--no-ext-diff','--no-textconv','--binary','--full-index',b,rev,'--',':(top)dialectical-engine/',':(top,exclude)dialectical-engine/.codex/skills');p.write_bytes(raw)
 names=git('diff','--name-only',b,rev,'--',':(top)dialectical-engine/',':(top,exclude)dialectical-engine/.codex/skills').decode().splitlines()
 patches.append({'path':str(p),'sha256':sha(p),'bytes':len(raw),'base':b,'revision':rev,'pathCount':len(names),'laneRelativePaths':[n.removeprefix(prefix) for n in names]})
assert patches[0]['pathCount']==108
commits=[]
for x in git('rev-list','--reverse',old['correctionBase']+'..'+rev).decode().splitlines():commits.append({'revision':x,'subject':git('show','-s','--format=%s',x).decode().strip(),'stat':git('show','--format=','--stat',x).decode().strip()})
out={**old,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'FINAL PRODUCT CUSTODY AFTER TEST-ONLY CORRECTION; FINAL REVIEW PENDING','revision':rev,'productFiles':rows,'patches':patches,'correctionCommits':commits,'runtimeEvidenceRevision':base,'testOnlyCorrection':{'path':rel,'base':base,'final':rev,'consumerPath':str(cp),'consumerSha256':sha(cp),'unchangedOtherCumulativePaths':107,'onlyChangedPathAcrossEntireGitTree':prefix+rel,'priorProductManifest':str(priorp),'priorProductManifestSha256':sha(priorp),'limit':'LIVE_P2 remains measured at606b, not relabelled. Exact tracked runtime/config/content is unchanged; final fixture checks are separately attributed.'}}
dest=E/'GATE_P3-final-product-manifest.json';assert not dest.exists();dest.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'path':str(dest),'sha256':sha(dest),'revision':rev,'runtimeEvidenceRevision':base,'paths':108,'correctionPaths':patches[1]['pathCount']}))
