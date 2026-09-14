# FIX-09 Independently Replayable Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an independently replayable FIX-09 admission receipt and truthful exact-name gates before any C3.5 implementation.

**Architecture:** SPEC-v7 replaces self-certified command assertions with immutable fact capture plus one authority-embedded ledger/verifier. The verifier owns every command argv/parser and derives all receipt fields from raw artifacts and live Git. A separate downstream result replay avoids a digest circle.

**Tech Stack:** Node.js 22, POSIX filesystem APIs, Git 2.50, pnpm/Vitest JSON reporter, SHA-256, RFC 8785.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v7.md`

## Global Constraints

- SPEC/PLAN v4-v6 and their decision rows are byte-immutable.
- Task 0 and C3.5 are STOP until independent v7 authority review returns zero unresolved P0-P3.
- No live root/key/database/migration/quiesce/activation/service/acceptance/merge/push/Done act.
- Only the future admission-only Task 0 may create its fixed branch/worktree/reports after review.
- Migration remains forward-only `migrations/0064_fix09_audit_chain.sql`.
- Every captured command has exact cwd, argv, environment, raw streams, status, and literal authority parser.

---

## Appendix A — literal fact capture

Open a fresh shell in the controller repository. Create two new mode-0700 roots with exact `mktemp -d /private/tmp/fix09-v7-base.XXXXXXXX` and `mktemp -d /private/tmp/fix09-v7-validation.XXXXXXXX`. Use this byte-exact function; it records facts and makes no PASS claim:

```bash
fix09_capture_fact() {
  local evidence_root="$1"
  local command_id="$2"
  local ordinal="$3"
  local command_cwd="$4"
  shift 4
  test "$1" = "--"
  shift
  /Users/vladmihaimiron/.local/bin/node - "$evidence_root" "$command_id" "$ordinal" "$command_cwd" "$@" <<'FIX09_CAPTURE_V2'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");
const [rootInput,id,ordinal,cwdInput,...argv] = process.argv.slice(2);
if (!/^(t0|h0|r0)-[0-9]{3}$/.test(id) || !/^[1-9][0-9]*$/.test(ordinal) || argv.length === 0) throw new Error("FIX09_CAPTURE_GRAMMAR");
if (argv.some((value) => value.includes("\0"))) throw new Error("FIX09_CAPTURE_NUL");
const stable = (value) => value === null || typeof value === "boolean" || typeof value === "string"
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : (() => { throw new Error("FIX09_CAPTURE_TYPE"); })();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = fs.realpathSync(rootInput); const cwd = fs.realpathSync(cwdInput);
if (!fs.lstatSync(root).isDirectory() || (fs.statSync(root).mode & 0o777) !== 0o700) throw new Error("FIX09_CAPTURE_ROOT");
const prefix = `${ordinal.padStart(3,"0")}-${id}`;
const stdoutName = `${prefix}.stdout`; const stderrName = `${prefix}.stderr`; const factName = `${prefix}.command.json`;
const stdoutPath = path.join(root,stdoutName); const stderrPath = path.join(root,stderrName); const factPath = path.join(root,factName);
const stdoutFd = fs.openSync(stdoutPath,"wx",0o600); const stderrFd = fs.openSync(stderrPath,"wx",0o600);
const environment = {PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"};
const run = child.spawnSync(argv[0],argv.slice(1),{cwd,env:environment,shell:false,stdio:["ignore",stdoutFd,stderrFd]});
if (run.error) fs.writeSync(stderrFd,Buffer.from(`FIX09_CAPTURE_SPAWN_ERROR ${run.error.code || "UNKNOWN"}\n`));
fs.fsyncSync(stdoutFd); fs.fsyncSync(stderrFd); fs.closeSync(stdoutFd); fs.closeSync(stderrFd);
fs.chmodSync(stdoutPath,0o400); fs.chmodSync(stderrPath,0o400);
const stdout = fs.readFileSync(stdoutPath); const stderr = fs.readFileSync(stderrPath);
const fact = {schema:"fix09-task0-command/v2",id,ordinal,cwd,argv,environment:["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"],exit_code:run.status === null ? null : String(run.status),signal:run.signal === null ? null : String(run.signal),stdout:{path:stdoutName,bytes:String(stdout.length),sha256:sha256(stdout),mode:"0400"},stderr:{path:stderrName,bytes:String(stderr.length),sha256:sha256(stderr),mode:"0400"}};
const temporary = `${factPath}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`; const fd = fs.openSync(temporary,"wx",0o600);
fs.writeFileSync(fd,Buffer.from(stable(fact))); fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(temporary,factPath); fs.chmodSync(factPath,0o400);
const rootFd = fs.openSync(root,fs.constants.O_RDONLY); fs.fsyncSync(rootFd); fs.closeSync(rootFd);
FIX09_CAPTURE_V2
}
```

Use this byte-exact structural finalizer only after all ledger commands exist:

```bash
fix09_finalize_facts() {
  local evidence_root="$1"
  /Users/vladmihaimiron/.local/bin/node - "$evidence_root" <<'FIX09_FINALIZE_V2'
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const stable=(v)=>v===null||typeof v==="boolean"||typeof v==="string"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
const hash=(b)=>crypto.createHash("sha256").update(b).digest("hex"); const root=fs.realpathSync(process.argv[2]);
const names=fs.readdirSync(root).sort(); const commandNames=names.filter((name)=>name.endsWith(".command.json")); if(commandNames.length===0)throw Error("FIX09_FACT_EMPTY");
const commands=commandNames.map((name,index)=>{const bytes=fs.readFileSync(path.join(root,name));const value=JSON.parse(bytes);if(stable(value)!==bytes.toString("utf8")||value.ordinal!==String(index+1)||name!==`${value.ordinal.padStart(3,"0")}-${value.id}.command.json`)throw Error("FIX09_FACT_RECORD");for(const stream of [value.stdout,value.stderr]){const target=path.join(root,stream.path),body=fs.readFileSync(target);if((fs.statSync(target).mode&0o777)!==0o400||String(body.length)!==stream.bytes||hash(body)!==stream.sha256)throw Error("FIX09_FACT_STREAM");}return value;});
const expected=commands.flatMap((value)=>[`${value.ordinal.padStart(3,"0")}-${value.id}.command.json`,value.stdout.path,value.stderr.path]).sort();if(stable(names)!==stable(expected))throw Error("FIX09_FACT_EXTRA");
const manifest={schema:"fix09-task0-evidence-manifest/v2",evidence_root:root,command_count:String(commands.length),commands};const output=path.join(root,"manifest.json"),temporary=`${output}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(temporary,"wx",0o600);fs.writeFileSync(fd,Buffer.from(stable(manifest)));fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(temporary,output);fs.chmodSync(output,0o400);const rootFd=fs.openSync(root,fs.constants.O_RDONLY);fs.fsyncSync(rootFd);fs.closeSync(rootFd);fs.chmodSync(root,0o500);
FIX09_FINALIZE_V2
}
```

---

## Appendix B — complete literal ledgers

The constants are:

```text
CONTROLLER=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine
ADMISSION=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission/dialectical-engine
PROGRAM=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v7.mjs
CANDIDATE=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt
RESULT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-result.receipt
REVIEW=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md
BASE_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-base-manifest-v7.json
CANDIDATE_VALIDATION_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-candidate-validation-manifest-v7.json
RESULT_VALIDATION_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-result-validation-manifest-v7.json
```

In the following canonical JSON arrays, those nine uppercase strings are presentation aliases only. Before execution, replace each entire JSON string value with the exact corresponding absolute value above. No substring, shell, environment, or other substitution exists. The validator performs the same element equality after alias expansion from its own nine constants.

### Base ledger

```json
[
{"argv":["/usr/bin/git","rev-parse","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-001","ordinal":"1","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","rev-parse","HEAD^"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-002","ordinal":"2","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"0e1fe1807aa2a4706b2438024a6b85f9c1a5f2ca\n"}},
{"argv":["/usr/bin/git","show","-s","--format=%s","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-003","ordinal":"3","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"docs(obs): bind FIX-09 admission evidence\n"}},
{"argv":["/usr/bin/git","diff-tree","--no-commit-id","--name-only","-r","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-004","ordinal":"4","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v7.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v7.md\n"}},
{"argv":["/usr/bin/git","rev-parse","HEAD^{tree}","HEAD:./docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-005","ordinal":"5","stderr_parser":{"kind":"empty"},"stdout_parser":{"count":"2","kind":"sha40_lines"}},
{"argv":["/usr/bin/git","merge-base","HEAD","e7b9f6812cafc8808cf5e188cd6440f19beda831"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-006","ordinal":"6","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"2b670d3059c60d7262cf655bd5d402c88100dff3\n"}},
{"argv":["/usr/bin/git","merge-base","HEAD","8619b9ab4dbc01fdd166337a641193675b24380a"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-007","ordinal":"7","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"2b670d3059c60d7262cf655bd5d402c88100dff3\n"}},
{"argv":["/usr/bin/git","merge-base","e7b9f6812cafc8808cf5e188cd6440f19beda831","24d0b3e5de84876b6b46fa84b13a0a42aa2640a4"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-008","ordinal":"8","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8\n"}},
{"argv":["/usr/bin/git","worktree","add","-b","codex/fix09-c35-admission","/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission","refs/heads/codex/fixagent-plan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-009","ordinal":"9","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"any"}},
{"argv":["/usr/bin/git","status","--porcelain=v1","--untracked-files=all"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-010","ordinal":"10","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","merge","--no-ff","--no-commit","e7b9f6812cafc8808cf5e188cd6440f19beda831"],"cwd":"ADMISSION","expected_exit_code":"1","expected_signal":null,"id":"t0-011","ordinal":"11","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-012","ordinal":"12","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-02/DECISIONS.md\n"}},
{"argv":["/usr/bin/git","restore","--source=e7b9f6812cafc8808cf5e188cd6440f19beda831","--staged","--worktree","--","docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-013","ordinal":"13","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse",":docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-014","ordinal":"14","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"0e2ffc4fc4f148520f228a9f69014f2ad7d5416c\n"}},
{"argv":["/usr/bin/git","-c","user.name=FIX09-Admission","-c","user.email=fix09-admission@invalid","commit","-m","chore(obs): admit FIX-02 writer line"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-015","ordinal":"15","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","cherry-pick","24d0b3e5de84876b6b46fa84b13a0a42aa2640a4"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-016","ordinal":"16","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-017","ordinal":"17","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse","HEAD:./tests/unit/fix01-runtime-readiness.test.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-018","ordinal":"18","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd\n"}},
{"argv":["/usr/bin/git","merge","--no-ff","--no-commit","8619b9ab4dbc01fdd166337a641193675b24380a"],"cwd":"ADMISSION","expected_exit_code":"1","expected_signal":null,"id":"t0-019","ordinal":"19","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-020","ordinal":"20","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\n"}},
{"argv":["/usr/bin/git","restore","--source=refs/heads/codex/fixagent-plan","--staged","--worktree","--","docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-021","ordinal":"21","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse",":docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-022","ordinal":"22","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","-c","user.name=FIX09-Admission","-c","user.email=fix09-admission@invalid","commit","-m","chore(obs): admit FIX-09 listener line"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-023","ordinal":"23","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","status","--porcelain=v1","--untracked-files=all"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-024","ordinal":"24","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse","HEAD"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-025","ordinal":"25","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","rev-parse","HEAD","HEAD^","HEAD^2","HEAD^{tree}","--abbrev-ref","HEAD"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-026","ordinal":"26","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"head_topology"}},
{"argv":["/usr/bin/git","rev-parse","--path-format=absolute","--git-common-dir","--show-toplevel"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-027","ordinal":"27","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"common_worktree"}},
{"argv":["/usr/bin/git","ls-tree","-r","--full-tree","HEAD","--","migrations/0034_obs_foundation.sql","migrations/0061_obs_job_lifecycle_taxonomy.sql","migrations/0062_fix09_listener_fold.sql","packages/db/src/obs-schema.ts","packages/obs-capture/src/envelope-contract.ts","packages/obs-capture/src/runtime/config.ts","packages/obs-capture/src/runtime/drain.ts","packages/obs-capture/src/runtime/index.ts","packages/obs-capture/src/runtime/sink.ts","tests/unit/fix01-runtime-readiness.test.ts","tools/obs-listener/src/daemon/dispatch-arm.ts","tools/obs-listener/src/daemon/fold.ts","tools/obs-listener/src/daemon/main.ts","tools/obs-listener/src/daemon/poison.ts","tools/obs-listener/src/daemon/tracer-hook.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-028","ordinal":"28","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"source_map_15"}},
{"argv":["/usr/bin/shasum","-a","256","tests/unit/fixtures/fix09-interface-contract.ts","tools/obs-listener/src/daemon/dispatch-arm.ts","tools/obs-listener/src/daemon/tracer-hook.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-029","ordinal":"29","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"c1_sha256_3"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","writer-scan"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-030","ordinal":"30","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"writer_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","grant-scan"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-031","ordinal":"31","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"grant_json"}},
{"argv":["/usr/bin/git","for-each-ref","--format=%(refname)"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-032","ordinal":"32","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"refs"}},
{"argv":["/usr/bin/git","for-each-ref","--format=%(refname)","refs/heads","refs/remotes"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-033","ordinal":"33","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"branch_refs"}},
{"argv":["/usr/bin/git","worktree","list","--porcelain"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-034","ordinal":"34","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"worktree_registry"}},
{"argv":["/usr/bin/git","rev-list","--objects","--all"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-035","ordinal":"35","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"object_paths"}},
{"argv":["/usr/bin/git","log","--all","--name-only","--pretty=format:"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-036","ordinal":"36","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"history_paths"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","ref-tip-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-037","ordinal":"37","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"ref_tip_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","worktree-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-038","ordinal":"38","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"worktree_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","paper-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-039","ordinal":"39","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"paper_json"}}
]
```

### Candidate-validation ledger

This table is a human-readable projection, not an argv template. The executable ledger is exactly the `candidateLedger(BASE_MANIFEST)` constructor in Appendix C: it expands every row to the fixed absolute cwd, six literal argv values, null signal, and the exact stream parsers. Implementers must iterate that returned array without editing or synthesizing argv. The closed projection is:

```json
[
{"id":"t0-040","mutant":"NONE","ordinal":"1","expected_exit_code":"0","stdout":"FIX09_CANDIDATE_PASS\n","stderr":""},
{"id":"h0-001","mutant":"AUTHORITY_TREE","ordinal":"2","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_TREE\n"},
{"id":"h0-002","mutant":"AUTHORITY_SUBJECT","ordinal":"3","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_SUBJECT\n"},
{"id":"h0-003","mutant":"AUTHORITY_SCOPE","ordinal":"4","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_SCOPE\n"},
{"id":"h0-004","mutant":"MERGE_PARENT","ordinal":"5","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_PARENT\n"},
{"id":"h0-005","mutant":"MERGE_ORDER","ordinal":"6","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_ORDER\n"},
{"id":"h0-006","mutant":"MERGE_CONFLICT","ordinal":"7","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_CONFLICT\n"},
{"id":"h0-007","mutant":"MERGE_RESOLUTION","ordinal":"8","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_RESOLUTION\n"},
{"id":"h0-008","mutant":"SOURCE_MAP","ordinal":"9","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_SOURCE_MAP\n"},
{"id":"h0-009","mutant":"C1_MAP","ordinal":"10","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_C1_MAP\n"},
{"id":"h0-010","mutant":"WRITER_MAP","ordinal":"11","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_WRITER_MAP\n"},
{"id":"h0-011","mutant":"COLLISION_COUNT","ordinal":"12","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COLLISION_COUNT\n"},
{"id":"h0-012","mutant":"COLLISION_SCOPE","ordinal":"13","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COLLISION_SCOPE\n"},
{"id":"h0-013","mutant":"MANIFEST_STDOUT","ordinal":"14","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_STDOUT\n"},
{"id":"h0-014","mutant":"MANIFEST_RC","ordinal":"15","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_RC\n"},
{"id":"h0-015","mutant":"MANIFEST_HASH","ordinal":"16","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_HASH\n"},
{"id":"h0-016","mutant":"BRANCH","ordinal":"17","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_BRANCH\n"},
{"id":"h0-017","mutant":"COMMON_DIR","ordinal":"18","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COMMON_DIR\n"},
{"id":"h0-018","mutant":"WORKTREE_REGISTRY","ordinal":"19","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_WORKTREE_REGISTRY\n"},
{"id":"h0-019","mutant":"RECEIPT_WIRE","ordinal":"20","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_RECEIPT_WIRE\n"}
]
```

### Result-validation ledger

After the reviewer writes the report and 17-field result, use a third fresh mode-0700 directory. This table is a projection only. The executable ledger is exactly `resultLedger(BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST)` in Appendix C: it expands every row to the fixed absolute cwd, nine literal argv values, null signal, and exact stream parsers. Implementers must iterate it without editing or synthesizing argv:

```json
[
{"id":"r0-001","mutant":"NONE","ordinal":"1","expected_exit_code":"0","stdout":"FIX09_RESULT_PASS\n","stderr":""},
{"id":"r0-002","mutant":"REVIEW_HASH","ordinal":"2","expected_exit_code":"1","stdout":"","stderr":"FIX09_RESULT_FAIL code=FIX09_REVIEW_HASH\n"},
{"id":"r0-003","mutant":"REVIEW_VERDICT","ordinal":"3","expected_exit_code":"1","stdout":"","stderr":"FIX09_RESULT_FAIL code=FIX09_REVIEW_VERDICT\n"}
]
```

The result-validation manifest is downstream evidence and is not embedded in the result. C3.5 requires it at the fixed report root and independently replays it; this is the noncircular final readback.

---

## Appendix C — literal scanner and validator program

Task 0 writes the following bytes exactly to `PROGRAM` with mode `0500`, regular-file/nlink-one/no-symlink checks, file fsync, atomic rename, and parent-directory fsync. Its SHA-256 is recorded after the source block and checked before every t0-030/031/037/038/039/040/r0 invocation.

```js
// FIX09_TASK0_V7_PROGRAM_BEGIN
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";

const CONTROLLER="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine";
const ADMISSION="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission";
const ENGINE=`${ADMISSION}/dialectical-engine`;
const COMMON="/Users/vladmihaimiron/Documents/DebateAIRO/.git";
const PROGRAM="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v7.mjs";
const PLAN="docs/missions/observability-agents/slices/FIX-09/PLAN-v7.md";
const CANDIDATE="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt";
const RESULT="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-result.receipt";
const REVIEW="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md";
const BASE_MANIFEST="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-base-manifest-v7.json";
const CANDIDATE_VALIDATION_MANIFEST="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-candidate-validation-manifest-v7.json";
const RESULT_VALIDATION_MANIFEST="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-result-validation-manifest-v7.json";
const F1="24d0b3e5de84876b6b46fa84b13a0a42aa2640a4",F2="e7b9f6812cafc8808cf5e188cd6440f19beda831",F9="8619b9ab4dbc01fdd166337a641193675b24380a";
const INTEGRATION="2b670d3059c60d7262cf655bd5d402c88100dff3",F1BASE="bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8";
const EMPTY_SHA="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ENV=["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"];
const RX=/(^|\/)(migrations|packages\/db\/src\/migrations)\/0064[^/]*\.sql$/;
const SCOPE={claim:"migrations/0064_fix09_audit_chain.sql",excluded:[".git","node_modules","private-key-material"],paper:["all-ref-tips","all-registered-worktrees"],path_regex:"(^|/)(migrations|packages/db/src/migrations)/0064[^/]*\\.sql$",tracked:["all-reachable-objects","all-reachable-history","all-ref-tip-trees","all-registered-worktrees"],untracked:["all-registered-worktrees-nonignored"]};
const WRITERS=["occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences","occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence","agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt","agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt","future_agent_action|FIX-10|ops|obsctl"];
const SOURCE_PATHS=["migrations/0034_obs_foundation.sql","migrations/0061_obs_job_lifecycle_taxonomy.sql","migrations/0062_fix09_listener_fold.sql","packages/db/src/obs-schema.ts","packages/obs-capture/src/envelope-contract.ts","packages/obs-capture/src/runtime/config.ts","packages/obs-capture/src/runtime/drain.ts","packages/obs-capture/src/runtime/index.ts","packages/obs-capture/src/runtime/sink.ts","tests/unit/fix01-runtime-readiness.test.ts","tools/obs-listener/src/daemon/dispatch-arm.ts","tools/obs-listener/src/daemon/fold.ts","tools/obs-listener/src/daemon/main.ts","tools/obs-listener/src/daemon/poison.ts","tools/obs-listener/src/daemon/tracer-hook.ts"];
const C1_CANONICAL="aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd";
const CANDIDATE_FIELDS=["schema","authority_commit","authority_parent","authority_tree","integration_base","fix01_shared_base","fix01_tip","fix02_head","fix09_head","composition_order","merge_fix02_conflict_paths","merge_fix02_resolution_blob","cherry_pick_fix01_conflict_paths","merge_fix09_conflict_paths","merge_fix09_resolution_blob","composition_result_commits","branch_name","worktree_canonical_path","git_common_dir_canonical_path","c35_baseline","c35_tree","clean_porcelain_sha256","source_blob_map","source_blob_extensions","writer_map","writer_map_sha256","c1_pin_map","schema_grant_probe_sha256","migration_collision_counts","migration_collision_scope","migration_collision_evidence_sha256","capture_evidence_manifest_sha256"];
const RESULT_FIELDS=["schema","candidate_receipt_path","candidate_receipt_sha256","admission_review_report_path","admission_review_report_sha256","receipt_validation_manifest_sha256","reviewer","reviewed_authority_commit","reviewed_c35_baseline","reviewed_c35_tree","spec_verdict","code_quality_verdict","p0_count","p1_count","p2_count","p3_count","result"];
const JSON_FIELDS=new Set(["composition_order","merge_fix02_conflict_paths","cherry_pick_fix01_conflict_paths","merge_fix09_conflict_paths","composition_result_commits","source_blob_map","source_blob_extensions","writer_map","c1_pin_map","migration_collision_counts","migration_collision_scope"]);
const stable=(v)=>v===null||typeof v==="boolean"||typeof v==="string"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:typeof v==="object"&&Object.getPrototypeOf(v)===Object.prototype?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:(()=>{throw Error("FIX09_JSON_TYPE")})();
const hash=(b)=>crypto.createHash("sha256").update(b).digest("hex");
const same=(a,b,c)=>{if(stable(a)!==stable(b))throw Error(c)};
const keys=(o,k,c)=>same(Object.keys(o).sort(),[...k].sort(),c);
const lines=(b)=>{const s=b.toString("utf8");if(!Buffer.from(s).equals(b))throw Error("FIX09_UTF8");return s.split("\n").filter(Boolean)};
const git=(cwd,args,allowOne=false)=>{const r=spawnSync("/usr/bin/git",args,{cwd,encoding:null,maxBuffer:100*1024*1024,env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});if((r.status!==0&&!(allowOne&&r.status===1))||r.signal||r.error)throw Error("FIX09_GIT");return r.stdout};
const gitText=(cwd,args)=>git(cwd,args).toString("utf8").trim();
const canonicalJson=(b,code)=>{const s=b.toString("utf8");if(!s.endsWith("\n")||!Buffer.from(s).equals(b))throw Error(code);const v=JSON.parse(s.slice(0,-1));if(stable(v)!==s.slice(0,-1))throw Error(code);return v};
const sha40=(s)=>/^[0-9a-f]{40}$/.test(s);

function authorityPlan(ref){return git(CONTROLLER,["show",`${ref}:./${PLAN}`]).toString("utf8")}
function selfCheck(ref){const p=authorityPlan(ref),m=p.match(/```js\n(\/\/ FIX09_TASK0_V7_PROGRAM_BEGIN[\s\S]*?\/\/ FIX09_TASK0_V7_PROGRAM_END)\n```/),st=fs.lstatSync(PROGRAM);if(!m)throw Error("FIX09_PROGRAM_AUTHORITY");if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o500||fs.realpathSync(PROGRAM)!==PROGRAM)throw Error("FIX09_PROGRAM_MODE");if(!fs.readFileSync(PROGRAM).equals(Buffer.from(`${m[1]}\n`)))throw Error("FIX09_PROGRAM_HASH")}
function baseLedger(ref){const p=authorityPlan(ref),m=p.match(/### Base ledger[\s\S]*?```json\n([\s\S]*?)\n```/);if(!m)throw Error("FIX09_LEDGER_AUTHORITY");const alias={CONTROLLER,ADMISSION:ENGINE,PROGRAM,CANDIDATE,RESULT,REVIEW,BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST,RESULT_VALIDATION_MANIFEST};const replace=(v)=>typeof v==="string"&&Object.hasOwn(alias,v)?alias[v]:Array.isArray(v)?v.map(replace):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;return replace(JSON.parse(m[1]))}
const candidateMutants=["NONE","AUTHORITY_TREE","AUTHORITY_SUBJECT","AUTHORITY_SCOPE","MERGE_PARENT","MERGE_ORDER","MERGE_CONFLICT","MERGE_RESOLUTION","SOURCE_MAP","C1_MAP","WRITER_MAP","COLLISION_COUNT","COLLISION_SCOPE","MANIFEST_STDOUT","MANIFEST_RC","MANIFEST_HASH","BRANCH","COMMON_DIR","WORKTREE_REGISTRY","RECEIPT_WIRE"];
const MUTANT_CAUSE={AUTHORITY_TREE:"FIX09_AUTHORITY_TREE",AUTHORITY_SUBJECT:"FIX09_EVIDENCE_STREAM",AUTHORITY_SCOPE:"FIX09_EVIDENCE_STREAM",MERGE_PARENT:"FIX09_MERGE_PARENT",MERGE_ORDER:"FIX09_MERGE_ORDER",MERGE_CONFLICT:"FIX09_MERGE_CONFLICT",MERGE_RESOLUTION:"FIX09_MERGE_RESOLUTION",SOURCE_MAP:"FIX09_SOURCE_MAP",C1_MAP:"FIX09_C1_MAP",WRITER_MAP:"FIX09_WRITER_MAP",COLLISION_COUNT:"FIX09_COLLISION_COUNT",COLLISION_SCOPE:"FIX09_COLLISION_SCOPE",MANIFEST_STDOUT:"FIX09_GRANT_SCAN",MANIFEST_RC:"FIX09_MANIFEST_RC",MANIFEST_HASH:"FIX09_MANIFEST_HASH",BRANCH:"FIX09_BRANCH",COMMON_DIR:"FIX09_COMMON_DIR",WORKTREE_REGISTRY:"FIX09_WORKTREE_REGISTRY",RECEIPT_WIRE:"FIX09_RECEIPT_WIRE"};
function candidateLedger(baseManifest){return candidateMutants.map((mutant,index)=>({id:index===0?"t0-040":`h0-${String(index).padStart(3,"0")}`,ordinal:String(index+1),cwd:CONTROLLER,argv:["/Users/vladmihaimiron/.local/bin/node",PROGRAM,"validate-candidate",CANDIDATE,baseManifest,`--mutant=${mutant}`],expected_exit_code:index===0?"0":"1",expected_signal:null,stdout_parser:{kind:"exact_utf8",value:index===0?"FIX09_CANDIDATE_PASS\n":""},stderr_parser:{kind:"exact_utf8",value:index===0?"":`FIX09_CANDIDATE_FAIL code=FIX09_${mutant}\n`}}))}
function resultLedger(baseManifest,validationManifest){return ["NONE","REVIEW_HASH","REVIEW_VERDICT"].map((mutant,index)=>({id:`r0-${String(index+1).padStart(3,"0")}`,ordinal:String(index+1),cwd:CONTROLLER,argv:["/Users/vladmihaimiron/.local/bin/node",PROGRAM,"validate-result",CANDIDATE,baseManifest,RESULT,validationManifest,REVIEW,`--mutant=${mutant}`],expected_exit_code:index===0?"0":"1",expected_signal:null,stdout_parser:{kind:"exact_utf8",value:index===0?"FIX09_RESULT_PASS\n":""},stderr_parser:{kind:"exact_utf8",value:index===0?"":`FIX09_RESULT_FAIL code=FIX09_${mutant}\n`}}))}
function parseReceiptBytes(bytes,fields){if(!bytes.length||bytes.includes(0x0d)||bytes.at(-1)!==0x0a||!Buffer.from(bytes.toString("utf8")).equals(bytes))throw Error("FIX09_RECEIPT_WIRE");const a=bytes.toString("utf8").slice(0,-1).split("\n");if(a.length!==fields.length)throw Error("FIX09_RECEIPT_WIRE");const out={};for(let i=0;i<a.length;i++){const n=a[i].indexOf("=");if(n<1||a[i].indexOf("=",n+1)!==-1||a[i].slice(0,n)!==fields[i])throw Error("FIX09_RECEIPT_WIRE");const raw=a[i].slice(n+1);if(JSON_FIELDS.has(fields[i])){const v=JSON.parse(raw);if(stable(v)!==raw)throw Error("FIX09_RECEIPT_WIRE");out[fields[i]]=v}else out[fields[i]]=raw}return out}
function parseRule(rule,b){if(rule.kind==="any")return;if(rule.kind==="empty"){if(b.length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="nonempty_utf8"){if(!lines(b).length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="exact_utf8"){if(b.toString("utf8")!==rule.value)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="sha40_lf"){if(!/^[0-9a-f]{40}\n$/.test(b.toString("utf8")))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="sha40_lines"){const a=lines(b);if(a.length!==Number(rule.count)||a.some(x=>!sha40(x)))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="head_topology"){const a=lines(b);if(a.length!==5||a.slice(0,4).some(x=>!sha40(x))||a[4]!=="codex/fix09-c35-admission")throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="common_worktree"){same(lines(b),[COMMON,ADMISSION],"FIX09_EVIDENCE_STREAM");return}if(rule.kind==="source_map_15"){if(parseSourceMap(b).size!==15)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="c1_sha256_3"){parseC1(b);return}if(rule.kind==="writer_json"){same(canonicalJson(b,"FIX09_WRITER_MAP"),WRITERS,"FIX09_WRITER_MAP");return}if(rule.kind==="grant_json"){const v=canonicalJson(b,"FIX09_GRANT_SCAN");keys(v,["files","schema","statements"],"FIX09_GRANT_SCAN");if(v.schema!=="fix09-grant-scan/v1"||v.files.length!==2)throw Error("FIX09_GRANT_SCAN");return}if(["refs","branch_refs"].includes(rule.kind)){const a=lines(b);if(!a.length||new Set(a).size!==a.length||stable([...a].sort())!==stable(a))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="worktree_registry"){parseWorktrees(b);return}if(["object_paths","history_paths"].includes(rule.kind)){if(!b.length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind.endsWith("_json")){const v=canonicalJson(b,"FIX09_COLLISION_SCAN");if(v.schema!==`fix09-${rule.kind.replace("_json","").replaceAll("_","-")}/v1`)throw Error("FIX09_COLLISION_SCAN");return}throw Error("FIX09_LEDGER_PARSER")}
function authorityFromManifest(file){const bytes=fs.readFileSync(file),manifest=JSON.parse(bytes);if(stable(manifest)!==bytes.toString("utf8")||manifest.schema!=="fix09-task0-evidence-manifest/v2"||!Array.isArray(manifest.commands))throw Error("FIX09_MANIFEST_SCHEMA");const f=manifest.commands[0];if(!f||f.id!=="t0-001"||f.ordinal!=="1"||stable(f.argv)!==stable(["/usr/bin/git","rev-parse","HEAD"])||f.cwd!==CONTROLLER)throw Error("FIX09_AUTHORITY_REF");const root=fs.realpathSync(manifest.evidence_root),raw=fs.readFileSync(path.join(root,f.stdout.path));if(hash(raw)!==f.stdout.sha256||String(raw.length)!==f.stdout.bytes||!/^([0-9a-f]{40})\n$/.test(raw.toString("utf8")))throw Error("FIX09_AUTHORITY_REF");return raw.toString("utf8").trim()}
function replayManifest(file,ledger,mutant="NONE"){const fst=fs.lstatSync(file),bytes=fs.readFileSync(file),text=bytes.toString("utf8"),manifest=JSON.parse(text);if(!fst.isFile()||fst.isSymbolicLink()||fst.nlink!==1||(fst.mode&0o777)!==0o400)throw Error("FIX09_MANIFEST_MODE");if(stable(manifest)!==text)throw Error("FIX09_MANIFEST_HASH");keys(manifest,["command_count","commands","evidence_root","schema"],"FIX09_MANIFEST_SCHEMA");if(manifest.schema!=="fix09-task0-evidence-manifest/v2"||manifest.commands.length!==ledger.length||manifest.command_count!==String(ledger.length))throw Error("FIX09_MANIFEST_SCHEMA");const root=fs.realpathSync(manifest.evidence_root),rst=fs.lstatSync(root);if(!rst.isDirectory()||rst.isSymbolicLink()||(rst.mode&0o777)!==0o500)throw Error("FIX09_MANIFEST_MODE");const facts=structuredClone(manifest.commands),artifacts=new Map();for(const fact of manifest.commands){const prefix=`${fact.ordinal.padStart(3,"0")}-${fact.id}`,factPath=path.join(root,`${prefix}.command.json`),fst0=fs.lstatSync(factPath);if(!fst0.isFile()||fst0.isSymbolicLink()||fst0.nlink!==1||(fst0.mode&0o777)!==0o400||fs.readFileSync(factPath).toString("utf8")!==stable(fact))throw Error("FIX09_FACT_RECORD");for(const stream of ["stdout","stderr"]){if(fact[stream].path!==`${prefix}.${stream}`)throw Error("FIX09_FACT_RECORD");const target=path.join(root,fact[stream].path),st=fs.lstatSync(target),body=fs.readFileSync(target);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400||String(body.length)!==fact[stream].bytes||hash(body)!==fact[stream].sha256)throw Error("FIX09_MANIFEST_HASH");artifacts.set(`${fact.id}:${stream}`,body)}}if(["AUTHORITY_SUBJECT","AUTHORITY_SCOPE","WORKTREE_REGISTRY","MANIFEST_STDOUT"].includes(mutant)){const id=mutant==="AUTHORITY_SUBJECT"?"t0-003":mutant==="AUTHORITY_SCOPE"?"t0-004":mutant==="WORKTREE_REGISTRY"?"t0-034":"t0-031",fact=facts.find(x=>x.id===id);let body;if(mutant==="AUTHORITY_SUBJECT")body=Buffer.from("docs(obs): forged authority\n");else if(mutant==="AUTHORITY_SCOPE")body=Buffer.from("dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v7.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/forged.md\n");else if(mutant==="WORKTREE_REGISTRY")body=Buffer.from(artifact({artifacts},id).toString("utf8").split("\n\n").filter(x=>!x.includes(`worktree ${ADMISSION}`)).join("\n\n")+"\n");else body=Buffer.from(`${stable({files:[],schema:"fix09-grant-scan/v1",statements:[]})}\n`);artifacts.set(`${id}:stdout`,body);fact.stdout.bytes=String(body.length);fact.stdout.sha256=hash(body)}if(mutant==="MANIFEST_RC")facts.find(x=>x.id==="t0-031").exit_code="1";if(mutant==="MANIFEST_HASH")facts.find(x=>x.id==="t0-031").stdout.sha256="0".repeat(64);
  for(let i=0;i<ledger.length;i++){const fact=facts[i],expected=ledger[i];keys(fact,["argv","cwd","environment","exit_code","id","ordinal","schema","signal","stderr","stdout"],"FIX09_FACT_SCHEMA");if(fact.schema!=="fix09-task0-command/v2")throw Error("FIX09_FACT_SCHEMA");for(const stream of ["stdout","stderr"]){keys(fact[stream],["bytes","mode","path","sha256"],"FIX09_FACT_SCHEMA");const b=artifacts.get(`${fact.id}:${stream}`);if(fact[stream].mode!=="0400"||String(b.length)!==fact[stream].bytes||hash(b)!==fact[stream].sha256)throw Error("FIX09_MANIFEST_HASH")}same([fact.id,fact.ordinal,fact.cwd,fact.argv,fact.environment,fact.exit_code,fact.signal],[expected.id,expected.ordinal,expected.cwd,expected.argv,ENV,expected.expected_exit_code,expected.expected_signal],"FIX09_MANIFEST_RC");parseRule(expected.stdout_parser,artifacts.get(`${fact.id}:stdout`));parseRule(expected.stderr_parser,artifacts.get(`${fact.id}:stderr`))}
  const expectedFiles=["manifest.json",...facts.flatMap(f=>[`${f.ordinal.padStart(3,"0")}-${f.id}.command.json`,f.stdout.path,f.stderr.path])].sort();same(fs.readdirSync(root).sort(),expectedFiles,"FIX09_MANIFEST_EXTRA");return{bytes,manifest,facts,artifacts,root}}
function parseSourceMap(b){const map=new Map();for(const line of lines(b)){const m=line.match(/^100644 blob ([0-9a-f]{40})\t(?:dialectical-engine\/)?(.+)$/);if(!m||!SOURCE_PATHS.includes(m[2])||map.has(m[2]))throw Error("FIX09_SOURCE_MAP");map.set(m[2],m[1])}if(map.size!==15)throw Error("FIX09_SOURCE_MAP");return map}
function parseC1(b){const out={canonical_policy_bundle_sha256:C1_CANONICAL};for(const line of lines(b)){const m=line.match(/^([0-9a-f]{64})  (tests\/unit\/fixtures\/fix09-interface-contract\.ts|tools\/obs-listener\/src\/daemon\/(?:dispatch-arm|tracer-hook)\.ts)$/);if(!m||Object.hasOwn(out,m[2]))throw Error("FIX09_C1_MAP");out[m[2]]=m[1]}if(Object.keys(out).length!==4)throw Error("FIX09_C1_MAP");return out}
function parseWorktrees(b){const out=[];for(const line of b.toString("utf8").split("\n"))if(line.startsWith("worktree ")){const p=fs.realpathSync(line.slice(9));if(out.includes(p))throw Error("FIX09_WORKTREE_REGISTRY");out.push(p)}if(!out.length)throw Error("FIX09_WORKTREE_REGISTRY");return out}
function artifact(replay,id,stream="stdout"){return replay.artifacts.get(`${id}:${stream}`)}
function mergeEntry(commit,p){try{return gitText(ENGINE,["ls-tree",commit,"--",p])}catch{return""}}
function verifyMerge(first,second,result,conflict,selected){const base=gitText(ENGINE,["merge-base",first,second]),changed=new Set([...lines(git(ENGINE,["diff","--name-only",base,first])),...lines(git(ENGINE,["diff","--name-only",base,second])),...lines(git(ENGINE,["diff","--name-only",base,result]))]);for(const p0 of changed){const p=p0.replace(/^dialectical-engine\//,"");const b=mergeEntry(base,p),a=mergeEntry(first,p),s=mergeEntry(second,p),r=mergeEntry(result,p);if(p===conflict){if(!r.includes(selected))throw Error("FIX09_MERGE_RESOLUTION");continue}const expected=a===b?s:s===b?a:a===s?a:null;if(expected===null||r!==expected)throw Error("FIX09_MERGE_PARENT")}}
function collisionDigest(replay){const h=crypto.createHash("sha256");h.update(Buffer.from("fix09-collision-evidence/v1\0"));for(let n=32;n<=39;n++){const id=`t0-${String(n).padStart(3,"0")}`,ib=Buffer.from(id),raw=artifact(replay,id),l4=Buffer.alloc(4),l8=Buffer.alloc(8);l4.writeUInt32BE(ib.length);l8.writeBigUInt64BE(BigInt(raw.length));h.update(l4);h.update(ib);h.update(l8);h.update(raw)}return h.digest("hex")}
function collisionValues(replay){const refs=lines(artifact(replay,"t0-032")),branches=lines(artifact(replay,"t0-033")),worktrees=parseWorktrees(artifact(replay,"t0-034"));if(branches.some(x=>!refs.includes(x)))throw Error("FIX09_COLLISION_COUNT");const objects=lines(artifact(replay,"t0-035")).map(x=>x.replace(/^[0-9a-f]{40} /,"")).filter(x=>RX.test(x)),history=lines(artifact(replay,"t0-036")).filter(x=>RX.test(x));const tip=canonicalJson(artifact(replay,"t0-037"),"FIX09_COLLISION_COUNT"),wt=canonicalJson(artifact(replay,"t0-038"),"FIX09_COLLISION_COUNT"),paper=canonicalJson(artifact(replay,"t0-039"),"FIX09_COLLISION_COUNT");keys(tip,["all_refs","hit_count","matches","ref_set_sha256","schema","scope"],"FIX09_COLLISION_COUNT");keys(wt,["registered_worktrees","schema","scope","tracked_hit_count","tracked_matches","untracked_hit_count","untracked_matches","worktree_set_sha256"],"FIX09_COLLISION_COUNT");keys(paper,["independent_claim_hits","matches","schema","scope"],"FIX09_COLLISION_COUNT");same(tip.scope,SCOPE,"FIX09_COLLISION_SCOPE");same(wt.scope,SCOPE,"FIX09_COLLISION_SCOPE");same(paper.scope,SCOPE,"FIX09_COLLISION_SCOPE");if(tip.all_refs!==String(refs.length)||tip.ref_set_sha256!==hash(Buffer.from(stable(refs)))||tip.hit_count!==String(tip.matches.length)||wt.registered_worktrees!==String(worktrees.length)||wt.worktree_set_sha256!==hash(Buffer.from(stable(worktrees)))||wt.tracked_hit_count!==String(wt.tracked_matches.length)||wt.untracked_hit_count!==String(wt.untracked_matches.length)||paper.independent_claim_hits!==String(paper.matches.length))throw Error("FIX09_COLLISION_COUNT");const counts={all_refs:String(refs.length),branch_remote_refs:String(branches.length),independent_claim_hits:paper.independent_claim_hits,reachable_history_0064_hits:String(history.length),reachable_object_0064_hits:String(objects.length),ref_tip_0064_hits:tip.hit_count,registered_worktrees:String(worktrees.length),worktree_tracked_0064_hits:wt.tracked_hit_count,worktree_untracked_0064_hits:wt.untracked_hit_count};if(Object.entries(counts).some(([k,v])=>k.endsWith("_hits")&&v!=="0"))throw Error("FIX09_COLLISION_COUNT");return counts}
function composition(A,baseline){const M9=baseline,C1=gitText(ENGINE,["rev-parse",`${M9}^1`]),M2=gitText(ENGINE,["rev-parse",`${C1}^`]);same(lines(git(ENGINE,["show","-s","--format=%P",M2])),[`${A} ${F2}`],"FIX09_MERGE_PARENT");same(lines(git(ENGINE,["show","-s","--format=%P",C1])),[M2],"FIX09_MERGE_PARENT");same(lines(git(ENGINE,["show","-s","--format=%P",M9])),[`${C1} ${F9}`],"FIX09_MERGE_PARENT");if(hash(git(ENGINE,["diff","--binary",`${F1}^`,F1]))!==hash(git(ENGINE,["diff","--binary",`${C1}^`,C1])))throw Error("FIX09_MERGE_PARENT");return{M2,C1,M9}}
function rerunReadOnly(replay){const ledger=baseLedger(lines(artifact(replay,"t0-001"))[0]);for(const n of [1,2,3,4,5,6,7,8,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39]){const e=ledger[n-1],r=spawnSync(e.argv[0],e.argv.slice(1),{cwd:e.cwd,encoding:null,maxBuffer:100*1024*1024,env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});if(r.error||r.signal!==null||String(r.status)!==e.expected_exit_code||!r.stdout.equals(artifact(replay,e.id))||!r.stderr.equals(artifact(replay,e.id,"stderr")))throw Error(n<=8?"FIX09_AUTHORITY_REF":n===34?"FIX09_WORKTREE_REGISTRY":n>=32?"FIX09_COLLISION_COUNT":"FIX09_SOURCE_MAP")}}
function derive(replay){rerunReadOnly(replay);const a=(id)=>lines(artifact(replay,id)),A=a("t0-001")[0],authorityObjects=a("t0-005"),baseline=a("t0-025")[0],top=a("t0-026"),paths=a("t0-027"),graph=composition(A,baseline);if(gitText(CONTROLLER,["rev-parse","refs/heads/codex/fixagent-plan"])!==A||a("t0-002")[0]!==gitText(CONTROLLER,["rev-parse",`${A}^`])||authorityObjects[0]!==gitText(CONTROLLER,["rev-parse",`${A}^{tree}`]))throw Error("FIX09_AUTHORITY_TREE");if(gitText(CONTROLLER,["rev-parse",`${F1}^`])!==F1BASE)throw Error("FIX09_MERGE_PARENT");for(const c of [F1,F2,F9])git(CONTROLLER,["cat-file","-e",`${c}^{commit}`]);if(authorityObjects[1]!==a("t0-022")[0])throw Error("FIX09_MERGE_RESOLUTION");same(top,[baseline,graph.C1,F9,gitText(ENGINE,["rev-parse",`${baseline}^{tree}`]),"codex/fix09-c35-admission"],"FIX09_BRANCH");same(paths,[COMMON,ADMISSION],"FIX09_COMMON_DIR");if(gitText(CONTROLLER,["rev-parse","--path-format=absolute","--git-common-dir"])!==COMMON||gitText(ENGINE,["rev-parse","--path-format=absolute","--git-common-dir"])!==COMMON)throw Error("FIX09_COMMON_DIR");if(gitText(ENGINE,["symbolic-ref","--short","HEAD"])!=="codex/fix09-c35-admission")throw Error("FIX09_BRANCH");if(!parseWorktrees(git(CONTROLLER,["worktree","list","--porcelain"])).includes(ADMISSION))throw Error("FIX09_WORKTREE_REGISTRY");verifyMerge(A,F2,graph.M2,"docs/missions/observability-agents/slices/FIX-02/DECISIONS.md",a("t0-014")[0]);verifyMerge(graph.C1,F9,graph.M9,"docs/missions/observability-agents/slices/FIX-09/DECISIONS.md",a("t0-022")[0]);const source=Object.fromEntries(parseSourceMap(artifact(replay,"t0-028")));for(const [p,b] of Object.entries(source))if(gitText(ENGINE,["rev-parse",`${baseline}:./${p}`])!==b)throw Error("FIX09_SOURCE_MAP");const writers=canonicalJson(artifact(replay,"t0-030"),"FIX09_WRITER_MAP"),c1=parseC1(artifact(replay,"t0-029"));for(const [p,h] of Object.entries(c1))if(p!=="canonical_policy_bundle_sha256"&&hash(git(ENGINE,["show",`${baseline}:./${p}`]))!==h)throw Error("FIX09_C1_MAP");const order=[{expected_conflicts:["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],input:F2,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix02_resolution_blob"},{expected_conflicts:[],input:F1,kind:"cherry_pick",resolution_field:null},{expected_conflicts:["docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],input:F9,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix09_resolution_blob"}];return{schema:"fix09-c35-admission-candidate/v1",authority_commit:A,authority_parent:a("t0-002")[0],authority_tree:authorityObjects[0],integration_base:INTEGRATION,fix01_shared_base:F1BASE,fix01_tip:F1,fix02_head:F2,fix09_head:F9,composition_order:order,merge_fix02_conflict_paths:a("t0-012").map(x=>x.replace(/^dialectical-engine\//,"")),merge_fix02_resolution_blob:a("t0-014")[0],cherry_pick_fix01_conflict_paths:a("t0-017"),merge_fix09_conflict_paths:a("t0-020").map(x=>x.replace(/^dialectical-engine\//,"")),merge_fix09_resolution_blob:a("t0-022")[0],composition_result_commits:[{commit:graph.M2,input:F2,kind:"merge_no_ff"},{commit:graph.C1,input:F1,kind:"cherry_pick"},{commit:graph.M9,input:F9,kind:"merge_no_ff"}],branch_name:top[4],worktree_canonical_path:paths[1],git_common_dir_canonical_path:paths[0],c35_baseline:baseline,c35_tree:top[3],clean_porcelain_sha256:hash(artifact(replay,"t0-024")),source_blob_map:source,source_blob_extensions:[],writer_map:writers,writer_map_sha256:hash(Buffer.from(stable(writers))),c1_pin_map:c1,schema_grant_probe_sha256:hash(artifact(replay,"t0-031")),migration_collision_counts:collisionValues(replay),migration_collision_scope:SCOPE,migration_collision_evidence_sha256:collisionDigest(replay),capture_evidence_manifest_sha256:hash(replay.bytes)}}
function receiptBytes(v,fields){return Buffer.from(fields.map(k=>`${k}=${JSON_FIELDS.has(k)?stable(v[k]):v[k]}\n`).join(""))}
function mutateValue(v,m){const z=structuredClone(v);if(m==="AUTHORITY_TREE")z.authority_tree="0".repeat(40);if(m==="MERGE_PARENT")z.composition_result_commits[0].commit=F1;if(m==="MERGE_ORDER")z.composition_order.reverse();if(m==="MERGE_CONFLICT")z.merge_fix02_conflict_paths=[];if(m==="MERGE_RESOLUTION")z.merge_fix09_resolution_blob="0".repeat(40);if(m==="SOURCE_MAP")z.source_blob_map[SOURCE_PATHS[0]]="0".repeat(40);if(m==="C1_MAP")z.c1_pin_map.canonical_policy_bundle_sha256="0".repeat(64);if(m==="WRITER_MAP")z.writer_map=z.writer_map.slice(1);if(m==="COLLISION_COUNT")z.migration_collision_counts.all_refs=String(Number(z.migration_collision_counts.all_refs)+1);if(m==="COLLISION_SCOPE")z.migration_collision_scope.claim="migrations/0064_forged.sql";if(m==="BRANCH")z.branch_name="codex/forged";if(m==="COMMON_DIR")z.git_common_dir_canonical_path="/private/tmp/forged";return z}
function scannerRoot(){const ref=gitText(CONTROLLER,["rev-parse","HEAD"]);selfCheck(ref);return ref}
function writerScan(){scannerRoot();const sink=git(ENGINE,["show","HEAD:./packages/obs-capture/src/runtime/sink.ts"]).toString(),poison=git(ENGINE,["show","HEAD:./tools/obs-listener/src/daemon/poison.ts"]).toString();for(const p of ["async writeOccurrences","async ingestSpooledOccurrence","INSERT INTO obs.occurrence","jsonb_array_length(candidate.detail_cause_chain_codes) > 0","envelope.cause_chain_codes.length > 0"])if(!sink.includes(p))throw Error("FIX09_WRITER_SCAN");for(const p of ["appendSkipReceipt","appendPoisonReceipt","INSERT INTO obs.agent_action"])if(!poison.includes(p))throw Error("FIX09_WRITER_SCAN");const hits=lines(git(ENGINE,["grep","-n","-I","-E","INSERT INTO obs\\.(occurrence|agent_action)","HEAD","--","packages","tools"])),mapped=hits.map(x=>{const m=x.match(/^HEAD:(packages\/obs-capture\/src\/runtime\/sink\.ts|tools\/obs-listener\/src\/daemon\/poison\.ts):[0-9]+:.*INSERT INTO obs\.(occurrence|agent_action)/);if(!m)throw Error("FIX09_WRITER_SCAN");return`${m[1]}|${m[2]}`});same(mapped,["packages/obs-capture/src/runtime/sink.ts|occurrence","packages/obs-capture/src/runtime/sink.ts|occurrence","tools/obs-listener/src/daemon/poison.ts|agent_action","tools/obs-listener/src/daemon/poison.ts|agent_action"],"FIX09_WRITER_SCAN");process.stdout.write(`${stable(WRITERS)}\n`)}
function grantScan(){scannerRoot();const files=["migrations/0034_obs_foundation.sql","packages/db/src/obs-schema.ts"].map(p=>{const body=git(ENGINE,["show",`HEAD:./${p}`]);return{path:p,blob:gitText(ENGINE,["rev-parse",`HEAD:./${p}`]),sha256:hash(body)}});const combined=files.map(x=>git(ENGINE,["show",`HEAD:./${x.path}`]).toString()).join("\n"),statements=["CREATE SCHEMA obs","GRANT USAGE ON SCHEMA obs","occurrence","agent_action"].filter(x=>combined.includes(x));if(statements.length!==4)throw Error("FIX09_GRANT_SCAN");process.stdout.write(`${stable({files,schema:"fix09-grant-scan/v1",statements})}\n`)}
function refTipScan(){scannerRoot();const refs=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)"])),matches=[];for(const ref of refs)for(const p of lines(git(CONTROLLER,["ls-tree","-r","--name-only","--full-tree",ref])))if(RX.test(p))matches.push(`${ref}:${p}`);process.stdout.write(`${stable({all_refs:String(refs.length),hit_count:String(matches.length),matches,ref_set_sha256:hash(Buffer.from(stable(refs))),schema:"fix09-ref-tip/v1",scope:SCOPE})}\n`)}
function worktreeScan(){scannerRoot();const worktrees=parseWorktrees(git(CONTROLLER,["worktree","list","--porcelain"])),tracked=[],untracked=[];for(const w of worktrees){for(const p of lines(git(w,["ls-files"])))if(RX.test(p))tracked.push(`${w}:${p}`);for(const p of lines(git(w,["ls-files","--others","--exclude-standard"])))if(RX.test(p))untracked.push(`${w}:${p}`)}process.stdout.write(`${stable({registered_worktrees:String(worktrees.length),schema:"fix09-worktree/v1",scope:SCOPE,tracked_hit_count:String(tracked.length),tracked_matches:tracked,untracked_hit_count:String(untracked.length),untracked_matches:untracked,worktree_set_sha256:hash(Buffer.from(stable(worktrees)))})}\n`)}
function paperScan(){scannerRoot();const refs=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)"])),independent=[];for(const ref of refs){const out=git(CONTROLLER,["grep","-n","-I","-E","0064(_fix09_audit_chain)?\\.sql|0064[^[:space:]]*\\.sql",ref,"--","*.md"],true);for(const line of lines(out)){const rest=line.slice(ref.length+1),n=rest.indexOf(":"),p=rest.slice(0,n).replace(/^dialectical-engine\//,"");if(!p.startsWith("docs/missions/observability-agents/slices/FIX-09/"))independent.push(line)}}process.stdout.write(`${stable({independent_claim_hits:String(independent.length),matches:independent,schema:"fix09-paper/v1",scope:SCOPE})}\n`)}
function validateCandidate(candidateFile,manifestFile,mutant){const authority=authorityFromManifest(manifestFile),initial=replayManifest(manifestFile,baseLedger(authority),mutant),expected=derive(initial);let raw=fs.readFileSync(candidateFile);if(mutant==="RECEIPT_WIRE")raw=Buffer.concat([raw,Buffer.from("extra=forged\n")]);let actual=parseReceiptBytes(raw,CANDIDATE_FIELDS);actual=mutateValue(actual,mutant);same(actual,expected,`FIX09_${mutant}`)}
function validateResult(candidateFile,baseManifest,resultFile,validationManifest,reviewFile,mutant){const authority=authorityFromManifest(baseManifest),candidate=parseReceiptBytes(fs.readFileSync(candidateFile),CANDIDATE_FIELDS);selfCheck(authority);replayManifest(baseManifest,baseLedger(authority));replayManifest(validationManifest,candidateLedger(baseManifest));const expectedCandidate=derive(replayManifest(baseManifest,baseLedger(authority)));same(candidate,expectedCandidate,"FIX09_RESULT_CANDIDATE");const result=parseReceiptBytes(fs.readFileSync(resultFile),RESULT_FIELDS),report=fs.readFileSync(reviewFile);if(mutant==="REVIEW_HASH")result.admission_review_report_sha256="0".repeat(64);if(mutant==="REVIEW_VERDICT")result.spec_verdict="REWORK";const reportLines=lines(report),expected={schema:"fix09-c35-admission-result/v1",candidate_receipt_path:"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt",candidate_receipt_sha256:hash(fs.readFileSync(candidateFile)),admission_review_report_path:"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md",admission_review_report_sha256:hash(report),receipt_validation_manifest_sha256:hash(fs.readFileSync(validationManifest)),reviewer:"Sol",reviewed_authority_commit:authority,reviewed_c35_baseline:expectedCandidate.c35_baseline,reviewed_c35_tree:expectedCandidate.c35_tree,spec_verdict:"SPEC PASS",code_quality_verdict:"CODE QUALITY PASS",p0_count:"0",p1_count:"0",p2_count:"0",p3_count:"0",result:"PASS"};for(const line of ["REVIEWER: Sol","SPEC VERDICT: SPEC PASS","CODE QUALITY VERDICT: CODE QUALITY PASS","UNRESOLVED: P0=0 P1=0 P2=0 P3=0","ADMISSION RESULT: PASS"])if(reportLines.filter(x=>x===line).length!==1)throw Error("FIX09_REVIEW_VERDICT");same(result,expected,mutant==="REVIEW_HASH"?"FIX09_REVIEW_HASH":"FIX09_REVIEW_VERDICT")}
function atomicWrite(file,bytes){if(fs.existsSync(file))throw Error("FIX09_OUTPUT_EXISTS");const dir=path.dirname(file),tmp=`${file}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(tmp,file);fs.chmodSync(file,0o400);const d=fs.openSync(dir,fs.constants.O_RDONLY);fs.fsyncSync(d);fs.closeSync(d)}
function publishManifest(source,target){selfCheck(gitText(CONTROLLER,["rev-parse","HEAD"]));const st=fs.lstatSync(source),bytes=fs.readFileSync(source),v=JSON.parse(bytes);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400||stable(v)!==bytes.toString("utf8")||v.schema!=="fix09-task0-evidence-manifest/v2")throw Error("FIX09_MANIFEST_MODE");atomicWrite(target,bytes)}
const [mode,...args]=process.argv.slice(2);try{if(mode==="writer-scan")writerScan();else if(mode==="grant-scan")grantScan();else if(mode==="ref-tip-scan")refTipScan();else if(mode==="worktree-scan")worktreeScan();else if(mode==="paper-scan")paperScan();else if(mode==="publish-manifest")publishManifest(args[0],args[1]);else if(mode==="derive-candidate"){const manifest=args[0],out=args[1],authority=authorityFromManifest(manifest);selfCheck(authority);const r=replayManifest(manifest,baseLedger(authority)),v=derive(r);atomicWrite(out,receiptBytes(v,CANDIDATE_FIELDS))}else if(mode==="validate-candidate"){const mutant=(args[2]||"").replace("--mutant=","");if(!candidateMutants.includes(mutant))throw Error("FIX09_MUTANT_UNKNOWN");if(mutant==="NONE"){validateCandidate(args[0],args[1],mutant);process.stdout.write("FIX09_CANDIDATE_PASS\n")}else{let cause=null;try{validateCandidate(args[0],args[1],mutant)}catch(e){cause=e.message}if(cause!==MUTANT_CAUSE[mutant])throw Error(cause===null?"FIX09_MUTANT_SURVIVED":"FIX09_MUTANT_WRONG_CAUSE");process.stderr.write(`FIX09_CANDIDATE_FAIL code=FIX09_${mutant}\n`);process.exit(1)}}else if(mode==="validate-result"){const mutant=(args[5]||"").replace("--mutant=","");if(!["NONE","REVIEW_HASH","REVIEW_VERDICT"].includes(mutant))throw Error("FIX09_MUTANT_UNKNOWN");if(mutant==="NONE"){validateResult(args[0],args[1],args[2],args[3],args[4],mutant);process.stdout.write("FIX09_RESULT_PASS\n")}else{let cause=null;try{validateResult(args[0],args[1],args[2],args[3],args[4],mutant)}catch(e){cause=e.message}if(cause!==`FIX09_${mutant}`)throw Error(cause===null?"FIX09_MUTANT_SURVIVED":"FIX09_MUTANT_WRONG_CAUSE");process.stderr.write(`FIX09_RESULT_FAIL code=FIX09_${mutant}\n`);process.exit(1)}}else throw Error("FIX09_MODE")}catch(e){process.stderr.write(`FIX09_FATAL code=${/^FIX09_[A-Z0-9_]+$/.test(e.message)?e.message:"FIX09_UNEXPECTED"}\n`);process.exit(2)}
// FIX09_TASK0_V7_PROGRAM_END
```

Program source is the UTF-8 bytes inside the JavaScript fence plus one final LF. Its SHA-256 is `6d12bf2578770af1f110097cc0eb3066462513a2f56e89e8cc81d144eb4d0f44`. The program also derives its own exact bytes from the committed authority blob and refuses a mismatch; the printed hash is an independent quick check.

---

## Appendix D — truthful expanded adjacent names

V6's 94 direct names remain in their printed order. Insert these exact reporter-expanded names after `FIX-09 C1 policy bundle > does not run a live fileURLToPath callback after policy initialization` and before `FIX-09 C1 policy bundle > does not dispatch the exported refusal error superclass before custodian authentication`:

```json
[
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptor callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyNames callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptors callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live 'Reflect' 'deleteProperty' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'Number' 'isSafeInteger' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'Array' 'isArray' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'JSON' 'stringify' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited 'Error.prototype' name setter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited 'RepinRefusedError.prototype' name setter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'get' descriptor getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'set' descriptor getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'name' VM-option getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'displayErrors' VM-option getter before custodian authentication"
]
```

The exact 107-name canonical array is 11,281 bytes and SHA-256 `5b061d338cbf49f10a1b2569b7e3fce3f1724c642bfd0922ebb7b878daaba09c`. Outer order is the five v6 paths in their printed order; within each file, reporter `assertionResults` order is authority. Reporter completion order and declaration-only regex order are not authority.

---

### Task 0: Produce independently replayable admission artifacts

**Files:**

- Create outside product tree: `PROGRAM`
- Create outside product tree: candidate/review/result receipts and three evidence roots/manifests
- Do not modify product, test, migration, or prior authority files

**Interfaces:**

- Consumes: independently approved v7 commit and immutable FIX-01/FIX-02/FIX-09 heads.
- Produces: closed candidate, reviewer result, base/candidate-validation/result-validation evidence.

- [ ] **Step 1: Materialize and hash the exact program**

Copy only the concatenated Appendix C JavaScript bytes to the fixed path. Verify its printed SHA-256, mode, owner, file type, nlink, and canonical path before execution.

- [ ] **Step 2: Capture the base ledger exactly**

Call `fix09_capture_fact` once per Appendix B base entry in ordinal order using its expanded exact cwd/argv. Do not stop on expected merge rc 1. Finalize only after all 39 facts exist. Then invoke exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<base-root>/manifest.json,BASE_MANIFEST]`; `BASE_MANIFEST` must not preexist, and the program exclusive-publishes the byte-identical mode-0400 fixed copy.

- [ ] **Step 3: Derive and write the candidate**

Run exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,derive-candidate,BASE_MANIFEST,CANDIDATE]`. It independently replays all 39 facts/live Git and emits only the exact 32-line receipt. Fsync, exclusive atomic rename, directory fsync, and mode `0400`; then run `candidateLedger(BASE_MANIFEST)` into its own root, finalize, and publish its manifest with exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<candidate-validation-root>/manifest.json,CANDIDATE_VALIDATION_MANIFEST]`.

- [ ] **Step 4: Obtain independent admission review**

Sol independently re-runs `validate-candidate`, graph/source/collision scans, and every hostile. The report must contain the exact v7 reviewer lines. Only Sol writes the 17-field result.

- [ ] **Step 5: Replay the result without a circle**

Run `resultLedger(BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST)` in a third fresh root, finalize, then publish with exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<result-validation-root>/manifest.json,RESULT_VALIDATION_MANIFEST]` and obtain a second independent readback. Task 1 remains STOP until the candidate, result, three manifests, and both reviews pass.

---

### Task 1: Implement the capture gate with truthful reporter expansion

**Files:**

- Create: `tools/fix09-capture-gate.mjs`
- Create: `tests/unit/fix09-capture-gate.test.ts`
- Create: `tests/unit/fixtures/fix09-gate-manifest.json`

- [ ] **Step 1: Write the exact RED test**

Use the one v6 Task 1 name. In addition to prior hostile cases, assert `IT_EACH_UNDERCOUNT` for a missing, duplicated, reordered, and substituted expanded case, and `LEGACY_TOTAL_105_109` for either old total. The RED run selects exactly one file/one name and captures `MODULE_NOT_FOUND` before assertion.

- [ ] **Step 2: Implement exact reporter parsing**

Parse Vitest JSON as closed own-data. Normalize each reported absolute file name to one of the exact authority paths, require a one-to-one set match, and index by path; do not use reporter completion order. In the authority's printed file order, construct every result as `ancestorTitles.join(" > ") + " > " + title`, including each expanded `it.each` result. Compare within-file order, global uniqueness, exact canonical array bytes/hash, statuses, and totals. Unknown reporter keys needed for no comparison may exist, but every consumed field is own plain data and wrong type is invalid.

- [ ] **Step 3: Run Task 1 three times**

Exact argv remains `pnpm exec vitest run --reporter=json tests/unit/fix09-capture-gate.test.ts`. Require exact anchored summaries with `files=1 tests=1 failed=0 skipped=0 todo=0` for runs 1, 2, and 3.

---

### Task 2: Execute preserved C3.5 work and corrected gates

**Files:** all PLAN-v5/v6 C3.5 files only.

- [ ] **Step 1: Preserve all v4-v6 protocol tests**

Implement no v7 row/witness change. Retain detail, keyring-independent witness, recovery, permission, legacy, writer, and FIX-10 cases exactly.

- [ ] **Step 2: Run C3.5 three times**

Use the same 16 file paths: first 11 v6 new files plus all five immutable adjacent files. Require exact reporter array and summaries:

```text
FIX09_GATE_PASS gate=c35-focused run=1 files=16 tests=118 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=2 files=16 tests=118 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=3 files=16 tests=118 failed=0 skipped=0 todo=0
```

- [ ] **Step 3: Obtain independent C3.5 review**

Review all three admission manifests and receipt replays plus preserved v4-v6 protocol evidence. Require exact SPEC PASS/CODE QUALITY PASS and zero P0-P3 before FIX-10 C0.

---

### Task 3: Execute preserved C4 work and corrected gates

**Files:** all PLAN-v5/v6 C4 files only.

- [ ] **Step 1: Preserve binding stage order**

Begin only after reviewed C3.5 and separately authorized/reviewed FIX-10 C0. Preserve watchdog/witness/read-only/journal laws.

- [ ] **Step 2: Run C4 three times**

Use the same 20 file paths: all 15 v6 new files plus five immutable adjacent files. Require:

```text
FIX09_GATE_PASS gate=c4-focused run=1 files=20 tests=122 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=2 files=20 tests=122 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=3 files=20 tests=122 failed=0 skipped=0 todo=0
```

- [ ] **Step 3: Run all hostile and non-test gates**

Require prior zero/wrong-name/wrong-count/wrong-summary/nonzero/skipped/todo/truncated/argv/preexisting/extra-key controls plus `IT_EACH_UNDERCOUNT` and `LEGACY_TOTAL_105_109`. Capture exact raw streams/status before asserting.

- [ ] **Step 4: Obtain independent C4 review and stop before V-only acts**

Require independent PASS/PASS with zero P0-P3, then report local evidence only. Key provisioning, migration application, quiesce, activation, service operation, acceptance, merge, push, and Done remain V-only or separately unauthorized.
