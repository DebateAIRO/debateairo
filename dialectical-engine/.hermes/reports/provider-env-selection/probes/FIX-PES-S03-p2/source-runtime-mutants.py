from pathlib import Path
import json,os,re,subprocess,sys
OUT=Path(__file__).resolve().parent;LANE=Path.cwd();TEST=LANE/'tests/unit/v9-provider-credential-files.test.ts';original=TEST.read_bytes()
por=lambda:subprocess.check_output(['git','status','--porcelain','--',str(TEST)],text=True)
pre=por();results=[]
all_cases=json.loads((OUT/'p2-review-results.json').read_text())
cases=[c for c in all_cases if c['source_fixture_only']]
if len(sys.argv)>1 and sys.argv[1]=='control':
 cases=[{'lens':'control','name':'control'}]
 (OUT/'control-control-providers.txt').write_bytes((LANE/'packages/providers/src/index.ts').read_bytes())
elif len(sys.argv)>1:cases=[c for c in cases if c['name']==sys.argv[1]]
for c in cases:
 name=c['lens']+'-'+c['name'];extended=c['name'] in ['source-rename-LOOPBACK','source-rename-AUTH_FILE_UNUSABLE','control'];name+=('-extended' if extended else '');source=(OUT/(c['lens']+'-'+c['name']+'-providers.txt')).read_text()
 # Execute the exact mutated source from an owned probe; resolve its relative imports
 # to the unchanged production dependencies. No file under packages/ is written.
 source=re.sub(r'(from\s+["\'])(\.[^"\']+)(["\'])',lambda m:m[1]+str((LANE/'packages/providers/src'/m[2]).resolve())+m[3],source)
 module=OUT/(name+'-runtime.ts');module.write_text(source)
 src=original.decode()
 if 'retype+' in c['name']:
  a=src.index('    const providers = await read(');b=src.index('    expect(union.size).toBe(12);',a)
  twelve=['COST_ENVELOPE_POLICY_INVALID','COST_ENVELOPE_POLICY_UNRESOLVED','CUSTODY_GROUP_UNRESOLVED','PROVIDER_CREDENTIAL_FILE_ABSENT','PROVIDER_CREDENTIAL_FILE_INVALID','PROVIDER_DISCOVERY_TARGET_PRICE_INVALID','PROVIDER_TARGET_PRICE_REQUIRED','PROVIDER_TARGET_PRICE_ZERO','SECRET_CUSTODY_INVALID','SUPPORT_ADMISSION_SCOPES_NOT_SEALED','SUPPORT_MODEL_CREDENTIAL_ABSENT','SUPPORT_MODEL_PATH_NOT_RATIFIED']
  src=src[:a]+'    const union = new Set<string>('+json.dumps(twelve)+');\n'+src[b:]
 src=src.replace('await read("packages/providers/src/index.ts")','await readFile('+json.dumps(str(module))+', "utf8")')
 src=src.replace('new URL("../../packages/providers/src/index.ts", import.meta.url)','new URL('+json.dumps(module.as_uri())+')')
 src='vi.mock("../../packages/providers/src/index.js", () => import('+json.dumps(str(module))+'));\n'+src
 # The prior LOOPBACK probe ran v30 as well. Load that unchanged suite into this
 # temporary test entry, so its imports receive the same mocked source module.
 src+='\nawait import("./v30-support-provider.test.js");\n'
 if extended:src+='\nawait import("./v9-deployment-mode.test.js");\n'
 count=262 if extended else 61
 log=OUT/(name+'-runtime.log');assert not log.exists(),log
 try:
  TEST.write_text(src);env=dict(os.environ,LOG=str(log))
  r=subprocess.run(['zsh','/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh',f'tests/unit/v9-provider-credential-files.test.ts:{count}:0','tests/architecture/vps-deployment-baseline.test.ts:43:0'],env=env,text=True,capture_output=True)
  content=log.read_text();pair=re.search(r'tests/unit/v9-provider-credential-files.test.ts rc=(\d+) passed=(\d+) failed=(\d+)',content)
  failures=[l.strip() for l in content.splitlines() if l.startswith(' FAIL ')]
  print(name,r.stdout,failures,flush=True)
  assert pair and int(pair[2])+int(pair[3])==count,'runtime fixture failed to load'
  results.append({'name':name,'total':count,'passed':int(pair[2]),'failed':int(pair[3]),'failures':failures,'log':str(log)})
 finally:
  TEST.write_bytes(original);assert TEST.read_bytes()==original and por()==pre;print('RESTORE cmp=0',repr(por()),flush=True)
(OUT/('source-runtime-'+(sys.argv[1] if len(sys.argv)>1 else 'all')+'-results.json')).write_text(json.dumps(results,indent=2)+'\n')
