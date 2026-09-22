"""Verify a scoped committed handoff against the prior exact inventory."""
from pathlib import Path
import json,hashlib,subprocess,sys,datetime

def check_maps(expected,actual):
 assert set(expected)==set(actual),{'missing':sorted(set(expected)-set(actual)),'unlisted':sorted(set(actual)-set(expected))}
 for p,want in expected.items():assert actual[p]==want,p

def self_test():
 controls=[({'a':'x'},{'a':'y'}),({'a':'x'},{'a':'x','b':'y'}),({'a':'x','b':'y'},{'a':'x'})]
 for pair in controls:
  try:check_maps(*pair)
  except AssertionError:continue
  raise AssertionError('Malformed fixture was accepted')
 check_maps({'a':'x'},{'a':'x'})
 print('Checker controls: wrong hash, added path and omitted path rejected; matching fixture accepted.')

if sys.argv[1:] == ['--self-test']:self_test();raise SystemExit
assert len(sys.argv)==5,'inventory-after.py PRIOR MANIFEST OUTPUT OWNER'
prior_path,manifest_path,output_path=map(Path,sys.argv[1:4]);owner=sys.argv[4]
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');L=S/'.worktrees/support-conversation-cp1/dialectical-engine'
def git(*args):return subprocess.run(['git','-C',str(L),*args],check=True,capture_output=True).stdout
def sha(data):return hashlib.sha256(data).hexdigest()
a=json.loads(prior_path.read_text());m=json.loads(manifest_path.read_text());commit=m['commit'];files=m['files']
assert all(isinstance(p,str) and isinstance(h,str) and len(h)==64 for p,h in files.items())
assert git('rev-parse','HEAD').decode().strip()==commit
assert not git('status','--porcelain').strip(),'Lane must be clean'
assert subprocess.run(['git','-C',str(L),'merge-base','--is-ancestor',a['revision'],commit],capture_output=True).returncode==0
paths=git('diff','--name-only',a['revision'],commit).decode().splitlines()
assert all(p.startswith('dialectical-engine/') for p in paths),'Change outside product directory'
paths=[p.removeprefix('dialectical-engine/') for p in paths]
check_maps(files,{p:sha(git('show',commit+':dialectical-engine/'+p)) for p in paths})
expected={p:r['sha256'] for p,r in a['files'].items()};expected.update(files)
allpaths=git('diff','--name-only',a['base'],commit).decode().splitlines();assert all(p.startswith('dialectical-engine/') for p in allpaths),'Change outside product directory'
allpaths=[p.removeprefix('dialectical-engine/') for p in allpaths]
actual={p:sha(git('show',commit+':dialectical-engine/'+p)) for p in allpaths}
check_maps(expected,actual)
check_maps(actual,{p:sha((L/p).read_bytes()) for p in allpaths})
rows={p:{'sha256':h,'lastOwner':owner if p in files else a['files'][p]['lastOwner']} for p,h in actual.items()}
r={'kind':'exact committed layered inventory; not reviewer PASS','measuredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':a['base'],'revision':commit,'fileCount':len(rows),'files':rows,'priorInventorySha256':sha(prior_path.read_bytes()),'handoffManifestSha256':sha(manifest_path.read_bytes()),'ownerAcceptance':'PENDING'}
output_path.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'revision':commit,'files':len(rows),'scopedChangedFiles':len(files),'workingBytesMatch':True}))
