CODEX REVIEW T1-ORACLE-EVALUATOR r2 — CHANGES · comments read through: t1-oracle-evaluator-r2-2026-09-07

BLOCKING: 11 / FOLLOW-UP: 2.

This is the reviewer's method and limitations record for [the main review](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-r2.md). It does not add a separate set of findings. **STRENGTH: entailed** for the actions and observations recorded here.

## Method and custody

I read the entire supplied reviewer packet before any repository inspection. I checked the advertised worktree/base/tip and read the full evaluator, its two-file diff, the operative §3/§8 revisions, the manifest, r1c dispatch amendments, worker packet/dispatch, round-2 filings and the relevant r1–r3 counterexample findings. Earlier superseded plan sections were distinguished from operative R4 requirements.

No applicable AGENTS.md was found in the checked ancestor/task paths. I did not apply the worker's implementation skill as a reviewer or spawn agents. This review remained static plus source-only probes and executions of the seat's small accounting instrument.

The source module was read at:

    /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts

Its SHA-256 was **d55203475b2c02fc4f5cf0bdafb02a900f1731a4f977762dc76a619c265b0f6d**, matching both final mutation transcripts. The clean tip is **23ec6717b32b6fc9509b573da32bd5dda9e5d7f8**; base **90cf50891d8a60bfb36d51651eb49de528834889**. The diff adds 722/205 lines in exactly the evaluator/test files. Read-only git status/log/diff commands made no mutation.

I used the lane's already installed **typescript-classic 5.9.3** under **Node v25.7.0** to transpile the unchanged analyzer into an in-memory CommonJS module. This executes analyzer code, not fixture code. Every test source is handed to parseModule/evaluatedCandidatesOf as a string; no eval/Function/VM execution of those source strings occurs. There is no Vitest import, database setup or package installation. The probes write no files.

Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## Findings rechecked against possible confounds

| Finding | Distinguishing evidence | Qualification |
|---|---|---|
| B1 parameters | Default source misses a ruled result as OTHER; rest source returns a false RULED | Both start from non-ruled literal 0..5; rule 1 does not mask the defect. |
| B2 flatMap | Async gives RULED; assignment in untaken branch gives OTHER; exact return-only block gives UNKNOWN | Admission and evaluation are separate duties. |
| B3 closed grammar | Untaken ++n and void n are admitted and yield OTHER | The grammar exclusion applies before selected-branch evaluation. |
| B4 limits | Expression 64/9 fits; return-only block 66/11 also fits incorrectly; block depth 34 and flatMap 129/12 or depth 33 fit incorrectly | Counts start at the actual function body. I did not use deeply unbounded input or claim crash evidence. |
| B5 Prim | JSX truthiness and null/undefined string concatenation produce unknown cells | These are explicit exact rows in the chosen contract, not requests for arbitrary coercion. |
| B6 splice | slice(1).splice() gives RULED [1..5] | The prefix derivation makes the zero-argument error change the verdict. |
| B7 bindings | Nested names/defaults are ignored and return OTHER | Conservatively rejecting unsupported binding syntax is sufficient; unlimited destructuring support is not required. |
| B8 spans | Canonical K45 is literal (64,77), outer call (16,87), actual consumed (64,87) | The invocation guard works. I did not confuse literal identity with consumed owner. |
| B9 spreads | Two exact spread operands become two UNKNOWN candidate results | The written row expressly allows exact sibling spreads. |
| B10 freeze | NOT_ARRAY survives freeze despite the global continuation rule | Native string output is not itself a miss. This is contract nonconformance, qualified in the main review. |
| B11 assertions | K43 final UNKNOWN is asserted without known receiver; many promised worked rows absent | K7d is correctly distinguished by its reason and is cleared. |
| F1 corpus | 232 parsed, 33 candidates: 32 OTHER, tokenUnlock UNKNOWN | Current fallback agrees with §3.16; the conflict is with the shipped prediction. Future site counts are conditional. |
| F2 attribution | Condensed isolated run says 3/3; raw full run has child exit 1 | Zero textual imports is not a proof of no timing/resource influence. |

**STRENGTH: entailed** for recorded source-only outputs and code/test structure. Concrete JavaScript consequences of default/rest/splice are static semantic derivations here; I did not label them freshly executed native values. Future code/emission and POL-03 cause remain unverified.

## Reproduction instrument and counterexamples

The following combined recipe uses the same in-memory loader and the same source inputs/counters used during review. It is included inside this requested file so there is no third output artifact. The separate 57-case recipe below records the worked-case expansion; counts are not added together as unique inputs because some fixtures overlap.

Run from the lane working directory:

    /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine

```sh
node <<'NODE'
const fs = require('fs'), ts = require('typescript-classic'), Module = require('module'), path = require('path');
const filename = path.resolve('tests/support/depthOracle.ts');
const m = new Module(filename, module);
m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, filename);
const api=m.exports;
console.log(JSON.stringify({node:process.version,ts:ts.version}));
function probe(id,source,expected){const parsed=api.parseModule('probe.tsx',source); console.log(JSON.stringify({id,source,expected,parse:parsed.ok,actual:api.evaluatedCandidatesOf('probe.tsx',source)},(k,v)=>typeof v==='number'&&Object.is(v,-0)?'-0':v));}

const reviewCases = [
 ['B1-default', 'const choices = [0,1,2,3,4,5].map(n=>n===0?undefined:n).map((n=1)=>n);', 'UNDETERMINED under the declared plain-parameter grammar'],
 ['B1-rest', 'const choices = [0,1,2,3,4,5].filter((...n) => n);', 'UNDETERMINED'],
 ['B2-async', 'const choices = [0,1,2,3,4,5].flatMap(async n => n ? [n] : []);', 'UNDETERMINED'],
 ['B2-assignment', 'const choices = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n = 1)]);', 'UNDETERMINED'],
 ['B2-block', 'const choices = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });', 'RULED'],
 ['B3-increment', 'const choices = [0,1,2,3,4,5].map(n => true ? n : ++n);', 'UNDETERMINED'],
 ['B3-void', 'const choices = [0,1,2,3,4,5].map(n => true ? n : void n);', 'UNDETERMINED'],
 ['B5-jsx', 'const choices = [0,1,2,3,4,5].map(n => (<span/>)).map(n => n ? 1 : 0);', 'OTHER / six numeric 1s'],
 ['B5-null', 'const choices = [0,1,2,3,4,5].map(n => "" + null);', 'OTHER / six str null payloads'],
 ['B5-undefined', 'const choices = [0,1,2,3,4,5].map(n => undefined + "");', 'OTHER / six str undefined payloads'],
 ['B6-splice0', 'const choices = [0,1,2,3,4,5].slice(1).splice();', 'OTHER / EXACT []'],
 ['B7-nested', 'const [[head, ...choices]] = [[0,1,2,3,4,5]];', 'UNDETERMINED unless nested binding is modelled'],
 ['B7-rest', 'const [...[head, ...choices]] = [0,1,2,3,4,5];', 'UNDETERMINED unless nested binding is modelled'],
 ['B7-default', 'const [choices = Array.from({length:5}, (_,i)=>i+1)] = [0,1,2,3,4,5].map(n=>undefined);', 'UNDETERMINED'],
 ['B8-K45', 'const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);', 'UNDETERMINED / consumed 16,87'],
 ['B8-twin', 'const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"]);', 'UNDETERMINED / consumed 16,90'],
 ['B9-spread', 'const choices = [...[0,1,2,3,4,5], ...[6]].slice(1);', 'OTHER for both candidates'],
 ['B10-freeze', 'const choices = Object.freeze([0,1,2,3,4,5].join(""));', 'UNDETERMINED under current written continuation rule'],
 ['B11-K43-prefix', 'const choices = [0,1,2,3,4,5].map(n => "x");', 'OTHER / six known str x cells'],
 ['F1-condition', 'if (error.serverCode === "API_UPSTREAM_UNREACHABLE" || [502, 503, 504].includes(error.status)) {}', 'current fallback UNKNOWN; conflicts with shipped-population prediction']
];
for (const [id,source,expected] of reviewCases) probe(id,source,expected);

const sumZeros = k => k === 1 ? '0' : '(' + sumZeros(k / 2) + ' + ' + sumZeros(k / 2) + ')';
const parens32 = '('.repeat(32) + 'n' + ')'.repeat(32);
const limitCases = [
 ['expression64', 'const choices = [0,1,2,3,4,5].map(n => n + '+sumZeros(16)+').slice(1);'],
 ['block66', 'const choices = [0,1,2,3,4,5].map(n => { return n + '+sumZeros(16)+'; }).slice(1);'],
 ['blockDepth34', 'const choices = [0,1,2,3,4,5].map(n => { return '+parens32+'; }).slice(1);'],
 ['flat129', 'const choices = [0,1,2,3,4,5].flatMap(n => [n + '+sumZeros(32)+']).slice(1);'],
 ['flatDepth33', 'const choices = [0,1,2,3,4,5].flatMap(n => ['+parens32+']).slice(1);']
];
for (const [id,source] of limitCases) {
 const parsed=api.parseModule('limits.ts',source), measured=[];
 function inspect(n) {
  if(ts.isArrowFunction(n)) {
   let nodes=0,depth=0;
   function count(x,d) { nodes++;depth=Math.max(depth,d);ts.forEachChild(x,c=>count(c,d+1)); }
   count(n.body,0);measured.push({nodes,depth});
  }
  ts.forEachChild(n,inspect);
 }
 inspect(parsed.file);
 console.log(JSON.stringify({id,source,measured,actual:api.evaluatedCandidatesOf('limits.ts',source)}));
}

const shipped=[];
const skipDirs=new Set(['node_modules','generated','.next','dist','build','__tests__']);
function censusWalk(dir) {
 for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
  if(skipDirs.has(e.name))continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory())censusWalk(p);
  else if(['.ts','.tsx','.mts','.mjs'].some(x=>e.name.endsWith(x)))shipped.push(p);
 }
}
for(const dir of ['packages','apps','web'])censusWalk(dir);
const totals={};let candidateCount=0,parseCount=0,freezeCount=0;const exceptions=[];
for(const f of shipped) {
 const source=fs.readFileSync(f,'utf8');
 if(api.parseModule(f,source).ok)parseCount++;
 for(const c of api.evaluatedCandidatesOf(f,source)) {
  candidateCount++;totals[c.verdict]=(totals[c.verdict]||0)+1;
  if(c.reason==='Object.freeze: identity')freezeCount++;
  if(c.verdict!=='OTHER'||f.endsWith('LoginFlow.tsx'))exceptions.push({path:f,...c});
 }
}
console.log(JSON.stringify({files:shipped.length,tsx:shipped.filter(x=>x.endsWith('.tsx')).length,parseCount,candidateCount,freezeCount,totals,exceptions}));

NODE
```

Observed counterexample outputs are summarized in the main findings. Independent count results:

| Body construction | Body-inclusive nodes | Depth | Current verdict |
|---|---:|---:|---|
| n + balanced 16-zero sum, expression body | 64 | 9 | RULED |
| Same expression inside exact return-only block | 66 | 11 | RULED, wrong under budget |
| 32 parentheses around n inside exact return-only block | 35 | 34 | RULED, wrong under depth limit |
| flatMap [n + balanced 32-zero sum] | 129 | 12 | RULED, wrong under budget |
| flatMap [32-parenthesized n] | 34 | 33 | RULED, wrong under depth limit |

The body-depth counts follow TypeScript forEachChild, not textual parenthesis count alone. The expression-only counterpart at 64 is admissible; the block adds the Block and ReturnStatement nodes. **STRENGTH: entailed.**

The shipped source-only census returned:

```json
{
  "files": 232,
  "tsx": 59,
  "parsed": 232,
  "candidates": 33,
  "freeze": 23,
  "counts": {"OTHER": 32, "UNDETERMINED": 1},
  "exception": {
    "path": "apps/ui/lib/v3/tokenUnlock.ts",
    "line": 36,
    "literal": [1900, 1915],
    "verdict": "UNDETERMINED",
    "reason": "unmodelled owner"
  },
  "LoginFlow": {
    "line": 252,
    "literal": [10807, 10825],
    "verdict": "OTHER",
    "cells": ["jsx", "jsx", "jsx", "jsx", "jsx", "jsx"]
  }
}
```

The displayed relative paths in this JSON are corpus identifiers, resolved under the absolute working directory above. No site emitter was rewritten or simulated as an observed output. **STRENGTH: entailed** for the census.

## Worked-case expansion

Using the loader already shown, I ran this expansion. It reported **57 cases / 57 expected verdicts / zero failures**; the appended binding probes are counterexamples, not members of that passing subtotal.

```js

const ruled = [
'[0,1,2,3,4,5].slice(1)','[1,2,3,4,5,6].slice(0,-1)','[0,1,2,3,4,5,].slice(1)',
'[0,1,2,3,4,5].map(n=>n).slice(1)','[0,1,2,3,4,5].map(n=>{return n;}).slice(1)',
'new Set([0,1,2,3,4,5].map(n=>n||1))','[0,1,2,3,4,5]["slice"](1)',
'([0,1,2,3,4,5] as const).slice(1)','[0,1,2,3,4,5].filter(n=>n>0)',
'[0,1,2,3,4,5].flatMap(n=>n?[n]:[])','[0,1,2,3,4,5].splice(1)',
'[1,2,3,4,5,6].filter(n=>n<6)','[0,1,2,3,4,5].map(n=>n||1)',
'[0,1,2,3,4,5].reverse().slice(0,-1)','[1,2,3,4,5,0].sort().slice(1)',
'[0,1,2,3,4,5].filter(n=>n)',
'[0,1,2,3,4,5].map(n=>`${n}`).map(n=>+n).slice(1)',
'[0,...[0,1,2,3,4,5]].slice(2)',
'[...new Set([0,6,1,2,3,4,5].map(n=>n===0?"a":n===6?"b":n))].slice(2)',
'[1,2,3,4,5].map(n=>0)'
];
const other=[
'[0,1,2,3,4,5].reverse()','[0,1,2,3,4,5].slice()','[0,1,2,3,4,5].slice(0,4)',
'[0,1,2,3,4,5].sort()','[1,2,3,4,5,6]','[0,1,2,3,4,5]',
'[0,1,2,3,4,5].map(n=>n).reverse()','[0,1,2,3,4,5].map(n=>n).slice()',
'[0,1,2,3,4,5].map(n=>n).slice(0,0)','[0,1,2,3,4,5].reverse().slice(1)',
'[1,2,3,4,5,0].sort().slice(0,-1)','[0,1,2,3,4,5,10].sort().slice(1,-1)',
'[0,1,2,3,4,5].filter(n=>n%2===0)','[502,503,504].includes(x)',
'[0,1,2,3,4,5].map(n=>n===0)','[...[0,1,2,3,4,5],6].slice(1)',
'Array.from(new Set([0,1,2,3,4,5].map(n=>n||1))).slice(1)',
'[...new Set([0,6,1,2,3,4,5].map(n=>n===0?"a":n===6?"a":n))].slice(2)',
'[0,1,2,3,4,5].map(slot=>(<span/>))','Object.freeze([0,1,2,3,4,5])',
'(";",[0,1,2,3,4,5])'
];
const unknown=[
'[0,1,2,3,4,5].filter(unknownPredicate)',
'[0,1,2,3,4,5].map(n=>`${n}`).map(n=>n*1).slice(1)',
'[0,1,2,3,4,5].map(n=>n===5?6:n).filter((n,i,a)=>{a[5]=5;return n>0;})',
'[0,1,2,3,4,5].map(n=>n*n/n).filter(n=>n)',
'[0,1,2,3,4,5].reduce((a,n)=>n?a.concat(n):a,[])',
'[0,1,2,3,4,5].map(n=>[n+1,n+2,n+3,n+4,n+5]).find(()=>true)',
'[0,1,2,3,4,5].map(n=>[n+1,n+2,n+3,n+4,n+5]).at(0)',
'[0,1,2,3,4,5].map(n=>[n+1,n+2,n+3,n+4,n+5])[0]',
'[0,1,2,3,4,5].slice(1,4).concat(4,5)',
'((x)=>x.slice(1))([0,1,2,3,4,5])',
'((method)=>Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes)',
'((method)=>Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"])'
];
let pass=0,fail=[];
for(const [expected,list] of [['RULED',ruled],['OTHER',other],['UNDETERMINED',unknown]]){
 for(const expression of list){
  const source='const choices = '+expression+';';
  const out=api.evaluatedCandidatesOf('probe.tsx',source);
  const ok=out.length===1 && out[0].verdict===expected;
  if(ok)pass++;else fail.push({source,expected,out});
 }
}
for(const [source,expected] of [
['const [unused,...choices] = [0,1,2,3,4,5];','RULED'],
['const [a,...rest] = [1,2,3,4,5,6];','OTHER'],
['const [,...choices] = [0,1,2,3,4,5];','RULED'],
['const [choices] = [[0,1,2,3,4,5].slice(1)];','RULED']]){
const out=api.evaluatedCandidatesOf('probe.tsx',source);if(out.length===1&&out[0].verdict===expected)pass++;else fail.push({source,expected,out});
}
console.log(JSON.stringify({workedRows:pass+fail.length,pass,fail}));
for (const [id,source,expected] of [
['nested binding','const [[head, ...choices]] = [[0,1,2,3,4,5]];','UNDETERMINED (unsupported) or RULED (modelled)'],
['nested rest','const [...[head, ...choices]] = [0,1,2,3,4,5];','UNDETERMINED (unsupported) or RULED (modelled)'],
['default parameter','const choices = [0,1,2,3,4,5].map(n=>n===0?undefined:n).map((n=1)=>n);','UNDETERMINED for non-plain parameter, or RULED if modelled'],
['default binding','const [choices = Array.from({length:5}, (_,i)=>i+1)] = [0,1,2,3,4,5].map(n=>undefined);','UNDETERMINED'],
['nested scalar','const [choices] = [[0,1,2,3,4,5].join("")];','OTHER final scalar (model may retain nonnumber wrapper)']
]) probe(id,source,expected);

```

Separately, I extracted 40 complete-source rows from manifest Part 2: K1, K2, K6, K6b, K7, K9, K8, K10, K11, K12, K13, K14, K15, K16, K17, K18, K19, K20, K21, K22, K28, K29, K31, K32, K33, K36, K38, K39, K40, K41, K42, K43, K44, K45, K46, K47, K48, K49, K50, K51. Markdown escaped pipes/newlines were decoded; source was parsed, never executed. These are 40 rows, not 40 distinct expressions or mutant runs; K44 used its first source and its length pair was separately checked.

The original raw parser/lexical counterexample classes remain covered by the committed successful-parse tests and the fresh 232-file parse census. This review did not replace those checks with the old scanner or regenerate fixture callbacks.

Additional direct probes confirmed the seven active control verdicts, K7d's attributable assignment reason, other individual map/filter purity rejection reasons, the known K43 prefix cells, return-kind splits, known versus unknown receivers, representative unsupported arities/spread arguments, numeric-index conservatism on nested-map output, and SameValueZero typed-sentinel distinctions. **STRENGTH: entailed** for the actual probes and bounded source inspection; no claim of exhaustive operator combinations.

## Accounting instrument

I read fourcount5.py before executing it. Its inputs were existing logs; malformed inputs were passed through /dev/stdin using Python subprocess.run(input=..., capture_output=True), with returncode read directly. There were no temporary log files or pipeline-status inferences.

Known-good absolute inputs, each exit 0:

- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r0/25-full-suite-tip.log
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r1/21-full-suite-tip.log
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r1/43-rework-full-suite.log
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/15-full-suite-r2.log

Base synthetic input:

    Test Files 1 passed (1)
    Tests 1 passed (1)
    EXIT STATUS: 0

| Independent alteration/input | Actual exit |
|---|---:|
| Empty input | 2 |
| RUN only / truncated | 2 |
| Remove exit line | 2 |
| Nonnumeric total | 2 |
| Tests field "banana skipped", with malformed Errors also present | 2 |
| EXIT STATUS: bad0 | 2 |
| Tests 999 passed followed by duplicate 1 passed | 2 |
| Trailing empty category segment | 2 |
| Tests (0), no category | 2 |
| Bare Errors heading | 2 |
| One failed file but no failing-test/load identity | 5 |
| Test summary arithmetic mismatch | 4 |
| File summary arithmetic mismatch | 4 |
| Leading empty category segment | 2 |
| Doubled separator | 2 |
| Errors banana error alone | 2 |

The first thirteen negative cases plus the four historical good logs reproduce the filed **17-case matrix categories**. Three extra negative cases and the new full log bring the direct review total to **21**. All match expected exits.

Independent raw-name extraction, separate from fourcount's summary validation, found verbose/detailed failure-name equality in all five full logs: 80/82/81/81/82. Set difference r2 versus r1 rework is exactly POL-03 added, zero removed. Selected-name counts are 60 before edits, 90 at stub/first implementation, 92 at tip; 32 added, zero removed. Diagnostic-line comparison is byte-equal for all eight error lines. **STRENGTH: entailed.**

## Decisions about evidence strength

I accepted valid K28/K38 mutation custody and the combined baseline/restoration evidence, while explicitly declining to call the token-count gates three semantic executions. Final transcripts show a one-element verdict list; exact offsets were measured separately from source. The column label is CARDINALITY with a verdict qualifier; the worker's VERDICT-only wording is imprecise.

I cleared the historical F2-R2/F3-R2 items for the named defects, without claiming the checker accepts only every imaginable valid format or that a phrase sweep proves every report sentence correct. I checked the actual fourth 42 and the actual withdrawn recurrence instruction. The historical claim that a human/agent read every line cannot be reconstructed from a hit list alone.

I accepted POL-03 as consistent with context sensitivity using the unchanged direct code paths, raw full-suite failure, and the supplied same-tip isolated-pass record. I did not treat that record as a fresh experiment, a full raw transcript, or proof of exact cause. The failed value is the child process exit code.

I classified tokenUnlock as a round-3 specification/prerequisite issue because the actual code follows the declared catch-all. Blaming the worker for inventing that fallback would be inaccurate. Conversely, the round-2 assertion requirement should already have exposed the mismatch.

**STRENGTH: entailed** for these scope distinctions and evidence contents; review judgments **consistent-with** the stated evidence.

## Round-3 dispatch contents

The main review supplies the concrete dispatch additions: reviewed repair first; explicit tokenUnlock consumption/population decision; A3 emission RED and start:end correction; WHOLE_DOMAIN removal and the three DOMAIN-control migrations; nine complete LoginFlow layouts plus five preserved truncated controls; actual K3/K4/K5 remeasurement; 43 remaining mutations plus m6; a temporary LoginFlow production-mutation grant with exact edited lines and restoration; and named closing gates/comparison logs. I did not issue a worker dispatch or change authorization.

**STRENGTH: entailed** for inherited obligations and this review's recommendations; future execution **undetermined**.

## Packet audit

The reviewer packet was followed: full initial read; no suites/git mutation/install; source-only evaluation; small-instrument runs allowed; absolute evidence paths; two output files. The worker packet's full-suite decision and r1c amendments are explicit. Implementation and record overclaims are charged in the main review; source grants and the carried Node fact are clear.

No approval request was needed or made. The review changes neither source nor historical reports. **STRENGTH: entailed.**

## Not verified

No fresh Vitest run, typecheck, install, native fixture execution, Node 22.23.1 run, database/isolation run, mutation-harness execution, git write, merge or push. No emitted DOMAIN population, K3 final emitted 24, K30 production mutation or m6 survival was newly observed. The source-only analyzer probes do not supply these missing stages.

The complete historical stub bytes and full raw POL-03 isolated-run output are not supplied by the cited condensed records. I did not certify their broader execution histories or all future mutation discriminators. Only the two requested files are written; no external communication was sent. **STRENGTH: entailed** for review boundaries; all listed unrun behavior **undetermined**.

## PREDICTIONS

- Repeating the unchanged in-memory source probes on the same runtime will reproduce the counterexamples and the 32/1 corpus verdict split. **STRENGTH: entailed.**
- Current K4 cannot distinguish emission if tokenUnlock's enclosing fallback already makes its baseline UNKNOWN. **STRENGTH: consistent-with**, conditional on the planned emitter.
- A bounded rework that fixes only consumedEnd or only named K7d would leave the independent admission/binding defects. **STRENGTH: entailed** for those independent code paths; actual future patch scope **undetermined**.
- Repeating the 21 direct fourcount5 executions on the same inputs will preserve their exits; another POL-03 outcome is not implied. **STRENGTH: entailed** for the checker; **undetermined** for POL-03.

ROUND 2: changes — the verdict rests on reproduced code/contract defects, with historical and future evidence kept explicitly separate.
