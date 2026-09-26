from pathlib import Path
import os,re,subprocess,sys,json
OUT=Path(__file__).resolve().parent
ROOT=OUT.parent
LANE=Path.cwd()
assert LANE.name=='dialectical-engine' and LANE.parent.name=='pes-s03'
README=LANE/'deploy/vps/README.md';TEST=LANE/'tests/unit/v9-provider-credential-files.test.ts'
RUNNER='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh'
sys.argv=[__file__,str(LANE)]
# Load the reviewers' transformation functions; never execute their mutation/restore loops.
ct={ '__file__':str(OUT/'adapted-ct.py'), '__name__':'probe_definitions'}
sd={ '__file__':str(OUT/'adapted-sd.py'), '__name__':'probe_definitions'}
ctsrc=(ROOT/'REV-PES-S03-p2-correctness-tests/mutants.py').read_text().split('\ndef restore():')[0]
sdsrc=(ROOT/'REV-PES-S03-p2-security-data-safety/mutants.py').read_text().split('\ndef porcelain(')[0]
# Content anchors whose dev wording/order changed. Mutation property is unchanged.
replacements={
 '"input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/providers/acme.header"':'"authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000',
 'a first provision, so read this list before following the section:\\n\\n':'Refreshed by Task 14 (2026-09-25)',
 'no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |':'the register version in force (`REGISTER_VERSION`) carries no `costEnvelopePolicy` row — the one an operator actually meets, by pinning a version published before the envelopes existed. Both services refuse. |',
 '| hosted mode, and a declared input or output price is below 1 micro-unit per million tokens. |':'| a declared price of zero, which would bound nothing. The floor is 1. |',
 'hosted mode, and a declared input':'a declared price of zero,',
 'hosted mode, and a debate target declares no price pair.':'a debate target declares no price. Both `input_price_micros_per_million` and `output_price_micros_per_million` are required in hosted mode.',
 'a debate target declares no price pair. |':'a debate target declares no price. Both `input_price_micros_per_million` and `output_price_micros_per_million` are required in hosted mode. |'
}
for a,b in replacements.items():ctsrc=ctsrc.replace(a,b)
# Pin the dev snapshot rather than the moving origin/dev name in the old probe.
sdsrc=sdsrc.replace('origin/dev:dialectical-engine/','a6d6382ba:dialectical-engine/')
exec(ctsrc,ct);exec(sdsrc,sd)
# The second dev table reuses prefixes; original probes targeted the primary table only.
def drop_primary(text,prefix):
 a=text.index('### What the hosted mode refuses, in code');b=text.index('### The credential-file contract',a)
 lines=text[a:b].split('\n');kept=[l for l in lines if not l.startswith(prefix)]
 assert len(lines)-len(kept)==1,(prefix,len(lines)-len(kept))
 return text[:a]+'\n'.join(kept)+text[b:]
ct['drop_line']=drop_primary
sd['drop_row']=lambda prefix:lambda text:drop_primary(text,prefix)
# Rebuild SD's pre-bound drop closures with scoped equivalents.
for name,ops in list(sd['MUTANTS'].items()):
 if name.startswith('p1-drop-') or name=='p1-control-drop-SUPPORT_ADMISSION':
  code={'p1-drop-PRICE_INVALID':'PROVIDER_DISCOVERY_TARGET_PRICE_INVALID','p1-drop-PRICE_REQUIRED':'PROVIDER_TARGET_PRICE_REQUIRED:','p1-drop-PRICE_ZERO':'PROVIDER_TARGET_PRICE_ZERO:','p1-control-drop-SUPPORT_ADMISSION':'SUPPORT_ADMISSION_SCOPES_NOT_SEALED'}[name]
  sd['MUTANTS'][name]=[(sd['README'],lambda t,c=code:drop_primary(t,'| `'+c+'`'))]
results=[]
for lens,ns in [('ct',ct),('sd',sd)]:
 for name,ops in ns['MUTANTS'].items():
  originals={p:p.read_bytes() for p in [README,TEST]}
  porcelain=lambda p:subprocess.check_output(['git','status','--porcelain','--',str(p)],text=True)
  before={p:porcelain(p) for p in originals}
  texts={'readme':originals[README].decode(),'test':originals[TEST].decode(),'providers':(LANE/'packages/providers/src/index.ts').read_text()}
  source_mutant=False
  try:
   for k,fn in ops:
    key=k if lens=='ct' else {ns['README']:'readme',ns['TEST']:'test',ns['PROV']:'providers'}[k]
    texts[key]=fn(texts[key]);source_mutant|=key=='providers'
   if source_mutant:
    fixture=OUT/f'{lens}-{name}-providers.txt';fixture.write_text(texts['providers'])
    # Mutate only the source text read by the documentation pin. Production is NEVER written.
    texts['test']=texts['test'].replace('await read("packages/providers/src/index.ts")','await readFile('+json.dumps(str(fixture))+', "utf8")')
    texts['test']=texts['test'].replace('new URL("../../packages/providers/src/index.ts", import.meta.url)','new URL('+json.dumps(fixture.as_uri())+')')
   README.write_text(texts['readme']);TEST.write_text(texts['test'])
   log=OUT/f'{lens}-{name}.log';assert not log.exists()
   env=dict(os.environ,LOG=str(log))
   run=subprocess.run(['zsh',RUNNER,'tests/unit/v9-provider-credential-files.test.ts:31:0','tests/architecture/vps-deployment-baseline.test.ts:43:0'],env=env,text=True,capture_output=True)
   content=log.read_text();pair=re.search(r'tests/unit/v9-provider-credential-files.test.ts rc=(\d+) passed=(\d+) failed=(\d+)',content);assert pair and int(pair[2])+int(pair[3])==31
   previous=ROOT/('REV-PES-S03-p2-correctness-tests' if lens=='ct' else 'REV-PES-S03-p2-security-data-safety')/(('mutant-' if lens=='ct' else 'mut-')+name+'.log')
   old=re.findall(r'^\s*Tests\s+(.+)$',previous.read_text(),re.M) if previous.exists() else ['not recorded']
   failures=[l.strip() for l in content.splitlines() if l.startswith(' FAIL ')]
   result={'lens':lens,'name':name,'before':old,'passed':int(pair[2]),'failed':int(pair[3]),'source_fixture_only':source_mutant,'failures':failures,'log':str(log)}
   results.append(result);print(json.dumps(result),flush=True)
  finally:
   for p,b in originals.items():
    p.write_bytes(b);assert p.read_bytes()==b and porcelain(p)==before[p]
    print('RESTORE',p.name,'cmp=0 porcelain-identical',repr(porcelain(p)),flush=True)
  (OUT/'p2-review-results.json').write_text(json.dumps(results,indent=2)+'\n')
print('REPLAY_COMPLETE',len(results),flush=True)
