# Observability loop — landed-state audit (2026-09-01, dev @ 8d38185c)

**Seat:** AUDIT-STATE (verification, `heartbeat-reviewer`) · **ticket:** `t_0d8634a7` on board `observability-agents` · **model:** Fable 5.1 (Claude Code subagent) · **session start:** 2026-09-01T23:40:23+0300.

**Measured on `dev @ 4f764037`, not `8d38185c`.** The packet's constants (`8d38185c`, 111 dirty entries) were true at packet-write; between 23:30 and 23:45 a concurrent `ui-overhaul` session committed the 111 dirty UI entries (`3e7d83e9`) plus four slice merges and three packet commits, and the orchestrator committed `4f764037` (spine v3.4.0). HEAD at my start was `b5a6b6eb` with 4 dirty entries; from 23:49 on it was `4f764037` with 12 dirty entries (all of them this mission's own packets, intake and logs — none in any test or typecheck program). **Every obs surface is byte-identical between `8d38185c` and `4f764037`**: `git diff --stat 8d38185c 4f764037 -- packages/obs-capture migrations packages/db/src/{obs-schema,schema,index}.ts packages/kernel/src/index.ts apps/runner/src/{index,main}.ts apps/api/src/main.ts apps/scheduler/src/cli.ts packages/providers/src/index.ts tools tests/**/obs-l* docs/missions/2026-08-21-observability-loop/demo` is EMPTY. So every file-existence claim below holds for both commits; every command output cites the HEAD it ran on.

All command outputs quoted here are verbatim; full logs: `docs/missions/observability-agents/logs/audit-state-suite-run-{1,2,3}.log`, `logs/audit-state-gates.log`.

## Verdict summary

1. **LANDED on `dev`:** S01 (merge `29f370e`, 2026-08-22, V-accepted on the board) and the whole L2 lane — S02 base + exhaustive-1 (`7a3ff398`, `5f0bd546`), S03a (`7a3ff398` + `7afdbe5d`), S03b, S04, S05 (…`367591e`) — via merge `3e91cf42` (2026-08-28 23:27). **No board comment records that merge, and S02's exhaustive-1 commit was merged with no review verdict.**
2. **PARTIAL:** S06 is half-merged — merge `1c9578a2` (2026-08-28 23:28) took the installer import (`apps/runner/src/main.ts:1`) and the 432-line S06 test but kept `dev`'s `apps/runner/src/index.ts` wholesale, discarding every binding hunk. **ABSENT:** S05b (`src/runtime/**`), S07 (`TypedDomainError` still `(code, message)`), everything G2+. RP-0 still has no hash from V.
3. **Number 1 — suites:** `133/139` on all three runs (identical), 6 failures in 2 files: S06 runner-binding ×4 (binding absent + fixtures stale), S04 zone-boundary ×2 (ZI-2 pinned to frozen base `29f370e`; accounts commit `0cec59ef` rewrote the region 2026-08-23). **All six red since 2026-08-28, none caused today.**
4. **Number 2 — gates:** `pnpm audit:source` exit 1, `blocking` length **3** (the three installers read `process.env` outside the register loader — V ticket `t_d821f99e`, 0 comments since 08-27); `pnpm typecheck` exit 1, **8** diagnostics, **all in `tests/unit/s14-ui.test.ts`** (imports the `web/` tree that `3e7d83e9` deleted tonight), **0 in obs paths**. `pnpm lint` and `pnpm build` are red on `dev` for these two reasons.
5. **Number 3 — RP-0:** faithful recipe over the frozen 115-file scope reproduces every pinned hash; subclass pass yields exactly `PROVIDER_CALL_FAILED`, `PROVIDER_CONTENT_UNACCEPTED`; `declared_gap` = 9 members, sha256 `51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078` — **independent derivation, NOT a ratification; V runs the one-liner.**
6. **Stage 16:** demo-rule defect (verdict i) — `observability-demo.sh:779` must exempt the human-owned manifest; no obs artifact imports, reads, stats, lists or probes a zone path.
7. **Board:** S03a `running` (stale since 08-26); S02/S03b/S04/S05 `todo` while merged; reconciliation table in §A. Lane-3 and all five other obs worktrees are clean with HEAD inside `dev` — nothing unmerged anywhere.

## A Board receipts

Column legend: **exists** = `git ls-tree` on `dev @ 8d38185c` (identical at `4f764037`); introducing commit = `git log --diff-filter=A --format=%h -- <path> | tail -1`. Comment indices are 0-based positions in `show --json .comments`; timestamps are the board's (UTC).

| Ticket | Slice | Board column today | Last verdict-bearing comment | File surface (VerticalSlices §1) → on `dev` | Measured state | Recommended board action (orchestrator applies) |
|---|---|---|---|---|---|---|
| `t_1fde033d` | S01 obs store foundation | `done` | #35 · 2026-08-22T07:28Z · `V ACCEPTED + MERGED` · lane commit `6829599` merged `--no-ff` as `29f370e` | `migrations/0034_obs_foundation.sql` ✔ (`68295991`) · `packages/db/src/obs-schema.ts` ✔ (`68295991`) · TP-1 `packages/db/src/schema.ts:2` `export * from "./obs-schema.js"` ✔ · TP-2 `packages/db/src/index.ts:1513` same line ✔ · `tests/integration/obs-l1-s01-foundation.test.ts` ✔ (`68295991`), green ×3 | **LANDED** | keep `done` (evidence `29f370e`) |
| `t_8e040ec2` | S02 code registry + safe templates | `todo` | #29 · 2026-08-26T07:25Z · ROUTER: Grok `PEER REVIEW APPROVED`, three lenses GREEN. Then #31 · 2026-08-27T13:00Z exhaustive-1 DISPATCHED; #33 · 2026-08-27T13:13Z codex `READY FOR PEER REVIEW` (commit `5f0bd546`) — **no verdict after it** | `packages/obs-capture/src/registry/index.ts` ✔ (`7a3ff398`; exhaustive-1 `5f0bd546`) · `tests/unit/obs-l2-s02-registry.test.ts` ✔ (`7a3ff398`; not opened by me), green ×3 | **LANDED** (base + exhaustive-1 both in `dev` via `3e91cf42`); exhaustive-1 unreviewed; S02 addendum (declared_gap transcription) not started | keep `todo` — two named open items: (a) peer review of `5f0bd546` (N1), (b) addendum gated on RP-0 |
| `t_489ecbcc` | S03a package scaffold | `running` (stale; last activity 08-26) | #26 · 2026-08-26T18:27Z · independent Claude Opus review `PASS, ZERO BLOCKERS` on `7afdbe5` (L2 addendum step 1); earlier #15 · 2026-08-22T09:42Z diamond ALL THREE LENSES GREEN | `packages/obs-capture/package.json` ✔ (`7a3ff398`, extended `7afdbe5d`) | **LANDED** | `done` (evidence `7a3ff398` + `7afdbe5d`, merged `3e91cf42`) — see N1 for the missing V record |
| `t_9b5ca941` | S03b capture core | `todo` | #12 · 2026-08-26T08:46Z · ROUTER: Grok `PEER REVIEW APPROVED` (rework 1) | `packages/obs-capture/src/{index,emit,context,queue,flusher,redactor,spool,health}.ts` ✔ all `7a3ff398` · `tests/unit/obs-l2-s03b-core.test.ts` ✔, green ×3 | **LANDED** | `done` (evidence `7a3ff398` via `3e91cf42`) |
| `t_d1e18a14` | S04 zone classifier + manifest | `todo` | #21 · 2026-08-26T11:56Z · ROUTER: Grok `PEER REVIEW APPROVED` (rework 1; fail-closed finding resolved) | `packages/obs-capture/src/zone/{manifest,classifier,counter,index}.ts` ✔ all `7a3ff398` · `tests/unit/obs-l2-s04-zone.test.ts` ✔ — **RED 2/15 ×3 on `dev`** | **LANDED, test RED** (B2) | keep `todo` — blocker named: B2 (ZI-2 `BASE_REF` pinned to `29f370e`; needs an architecture ruling, not a code guess) |
| `t_6e99d607` | S05 installers | `todo` | #60 · 2026-08-27T12:51Z · ROUTER: verification lens on `367591e` **GREEN**, "slice now awaits V" | `packages/obs-capture/install/{api,runner,scheduler,evaluator-lib,ui-client}.ts` ✔ (`7a3ff398`; fixes `14965fc1`, `caac4d94`, `01422e29`, `367591e`) · `tests/architecture/obs-l2-s05-{import-graph,boot-capture}.test.ts` ✔, green ×3 | **LANDED** (via `3e91cf42`) | `done` (evidence `367591e` via `3e91cf42`) — the merge is the only acceptance evidence; no V comment (N1) |
| `t_3a04cc06` | S05b runtime capture wiring | `blocked` | none — 3 Router contract comments (08-26 21:07/21:09, 08-27 06:44); no claim, no verdict | `packages/obs-capture/src/runtime/**` ✘ ABSENT · `tests/unit/obs-l2-s05b-*` ✘ | **ABSENT** | keep `blocked` — blocker: L2-ADDENDUM-PLAN §6 order (RP-0 ratified → S02 addendum → S05b); RP-0 is V's act |
| `t_5504afe0` | S06 runner binding | `todo` | #11 · 2026-08-26T14:46Z · Claude Opus diamond, three blind lenses, **BLOCK / BLOCK / BLOCK**; #15 · 2026-08-27T13:00Z hold not lifted; rework packet `s06-rework-1.md` never dispatched | TP-5 `apps/runner/src/main.ts:1` `import "@debateai/obs-capture/install/runner"` ✔ (`e8d99d33` via `1c9578a2`) · `apps/runner/src/index.ts` `task-catch` / `gateway-seam` ✘ (hunks dropped at `1c9578a2`) · `tests/integration/obs-l3-s06-runner-binding.test.ts` ✔ (`e8d99d33`) — **RED 4/5 ×3** | **PARTIAL (half-merged)** (B1) | keep `todo` — blocker named: L2 addendum + re-cut from current `dev` (B1); board must record `1c9578a2` |
| `t_9f4e5bfb` | S07 cause-chain retrofit | `todo` | none — #2 `CODEX BLOCKED` 08-26; #5 ARCH ruling applied; #7 · 2026-08-27T13:00Z ownership question recorded; never reached review | `packages/kernel/src/index.ts:283-288` `TypedDomainError` still `constructor(readonly code: string, message: string)` — no `cause` ✘ · `packages/db/src/index.ts:608-612` `typedPoolFailure` still interpolates `${detail}` ✘ · `tests/unit/obs-l3-s07-*` ✘ | **ABSENT** | keep `todo` — depends on S06 |
| `t_4deda7ab` | RP-0 declared_gap re-pin | `blocked` | #0 · 2026-08-26T19:38Z · ROUTER only ("computable two ways"); **no V comment, no hash anywhere on the ticket** | n/a (custodian act) | **OPEN** | keep `blocked` — blocker: V's custodian one-liner (§F gives the derivation) |
| `t_40c2cc1b` | D12 scripted demo | `ready` (assignee `claude-opus`) | #1 · 2026-08-27T09:52Z · ROUTER: delivered and run, `7 PASSED 0 FAILED 21 SKIPPED`, exit 0 | `docs/missions/2026-08-21-observability-loop/demo/{observability-demo.sh,README.md}` ✔ (`2d1f86b8`) | **LANDED**; today `6/1/21` exit 1 (stage 16) | keep `ready` — next revision applies §D's line-779 change (N4); record today's regression on the ticket (N1) |
| `t_d821f99e` | [V] audit:source vs §3.7 env-only config | `ready`, **0 comments** | none | n/a (V decision) | **OPEN since 08-27**; today's `blocking` array is exactly its subject | keep `ready` for V (N2) |

## B Suites, three runs

Set (packet recipe): `find tests -name 'obs-*' -o -name '*obs-l*'` → 7 files; `grep -rl '@debateai/obs-capture' tests` → 6 files, all already in the 7 (S01 does not import the package). Command, run three times from the repo root on HEAD `4f764037`, vitest 4.1.10, node v22.23.1, no `DATABASE_URL` set (S01 starts an embedded throwaway PostgreSQL in a `mkdtemp` dir — `tests/support/testDatabase.ts:85-111`):

`pnpm vitest run tests/architecture/obs-l2-s05-boot-capture.test.ts tests/architecture/obs-l2-s05-import-graph.test.ts tests/integration/obs-l1-s01-foundation.test.ts tests/integration/obs-l3-s06-runner-binding.test.ts tests/unit/obs-l2-s02-registry.test.ts tests/unit/obs-l2-s03b-core.test.ts tests/unit/obs-l2-s04-zone.test.ts`

| run | start (local) | duration | files | tests (`passed/total`) | exit | log |
|---|---|---|---|---|---|---|
| 1 | 23:53:00 | 21.21s | `2 failed \| 5 passed (7)` | **133/139** (6 failed) | 1 | `logs/audit-state-suite-run-1.log` (the appendix of that log is the BROKEN first attempt at 23:52:01 — see below) |
| 2 | 23:54:14 | 20.32s | `2 failed \| 5 passed (7)` | **133/139** (6 failed) | 1 | `logs/audit-state-suite-run-2.log` |
| 3 | 23:56:21 | 20.45s | `2 failed \| 5 passed (7)` | **133/139** (6 failed) | 1 | `logs/audit-state-suite-run-3.log` |

**Worst run = every run: `133/139`, verdict RED, entirely pre-existing.** The same nine `❯ file:line:col` markers fired in all three runs. Passing files ×3: `obs-l2-s05-boot-capture`, `obs-l2-s05-import-graph`, `obs-l1-s01-foundation`, `obs-l2-s02-registry`, `obs-l2-s03b-core`.

BROKEN first attempt (kept as evidence, not counted): `pnpm vitest run $FILES` under zsh passed the seven paths as ONE filter token → `No test files found, exiting with code 1` at 23:52:01 (the `filter:` line echoes all seven paths joined). Classified BROKEN per the TOOLING-TRAPS rule, re-run with literal arguments. Appended to TOOLING-TRAPS.

Failures, by marker (blame = `git blame -L n,n` of the assertion line; "red since" = first `dev` commit where the assertion's premise was false):

| file:line | test | observed (verbatim head) | blame | red on `dev` since | predates today |
|---|---|---|---|---|---|
| `tests/integration/obs-l3-s06-runner-binding.test.ts:104:19` | S06 runner task binding › captures the real task failure before terminal recording… | `expected [ 'terminal' ] to deeply equal [ 'capture', 'terminal' ]` | `e8d99d33` (2026-08-28) | `1c9578a2` (2026-08-28 23:28) — binding hunks absent from `index.ts` | yes |
| `…:192:8`, `…:196:24`, `…:202:9`, `…:206:25` | S06 runner task binding › preserves the original task failure when terminal recording fails… | `chainContainsFailure: false, replacementCode: "RUNNER_FAILURE_STATE_NOT_RECORDED"` where `true / "CHAIN_PRESERVED"` expected | `e8d99d33` | `1c9578a2` — OBS-R064 branch never landed | yes |
| `…:305:22` | S06 provider gateway binding › captures one provider occurrence… | `Error: UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` — `dev`'s `createPostgresProviderGateway` (`apps/runner/src/index.ts:2603`) now issues an advisory-lock query the fixture client does not expect | `e8d99d33` | `1c9578a2` (gateway moved under the test: `7b3a3063`/`2d1f86b8`) | yes |
| `…:426:46` | S06 deployment linkage › evaluates the runner installer before the DB dependency… | `message: "The requested module '@debateai/db' does not provide an export named 'RunRepository'"`, `uncaught: 0, unhandled: 0` where `DB_IMPORT_AFTER_RUNNER_INSTALL / 1 / 1` expected — `dev`'s `main.ts` (128+/26- since `e8d99d33`) and db exports moved under the entrypoint probe | `e8d99d33` | `1c9578a2` | yes |
| `tests/unit/obs-l2-s04-zone.test.ts:77:11` | S04 semantic zone boundary › calls the resolver over the real mount-list source and runs ZI-1..ZI-4 | `'Error: ZONE_REGION_MODIFIED: slice=S0…' was thrown` — ZI-2 content hash of the resolved region ≠ the same region at the test's hard-coded `BASE_REF = "29f370e0f1017245aa26443ad366e020e815c301"` (test `:33`); commit `0cec59ef` (2026-08-23, accounts) rewrote all three mount lines (`{ config: { auth: "public" } }` → `routePolicy("POST /v1/auth/…")`) | `7a3ff398` (2026-08-26) | `3e91cf42` (2026-08-28 23:27) — `dev` already carried `0cec59ef` | yes |
| `tests/unit/obs-l2-s04-zone.test.ts:165:29` | S04 semantic zone boundary › passes all 15 required falsification mutants | `expected true to be false` — mutant `g4 = INDEX_SOURCE.replace("      ip: request.ip,", …)` (test `:133-136`) is a NO-OP on `dev`: the needle occurs 1× at `29f370e`/`7a3ff398`, **0× on `dev`**, so `g4 === INDEX_SOURCE` and resolves `ok` | `7a3ff398` | `3e91cf42` | yes |

Root cause, both S04 arms (systematic-debugging, phase 1–3 complete; hypothesis tested minimally by counting the needle per ref): the test pins another mission's live file to a frozen base. `S04-zone-boundary-correction.md` §5.2 defines ZI-2 as content identity "against the **lane's merge-base**"; the test transcribed a fixed SHA. On any `dev` that contains `0cec59ef`, ZI-2 fails and the text-anchored mutant fixtures rot. The registration block itself still contains exactly the ruled three mounts — the recovery/MFA mounts sit in sibling blocks `if (options.recovery !== undefined)` (`apps/api/src/index.ts:771`) and `if (options.mfa !== undefined)` (`:783`) — so ZI-1 shape is intact; this is ZI-2's pin, not a boundary breach.

## C Gates: audit:source, typecheck

Measured 2026-09-01T23:49:04+0300, HEAD `4f764037`, `pnpm exec tsc --version` = `Version 7.0.2` (repo root — the canonical invocation directory per TOOLING-TRAPS), porcelain 12 before and 12 after every step (the 12 are `.hermes/planning/observability-agents/packets/*`, `docs/missions/observability-agents/00-intake-H0.md`, `docs/missions/observability-agents/logs/` — none is in any compile program). Full log: `logs/audit-state-gates.log`.

**(1) `pnpm audit:source` — exit 1.** `blocking` array VERBATIM, length **3**:

```
{
  "blocking": [
    "packages/obs-capture/install/api.ts reads the process environment outside the register loader",
    "packages/obs-capture/install/runner.ts reads the process environment outside the register loader",
    "packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader"
  ]
}
```

The 4th row measured on 2026-08-27 (S02 `t_8e040ec2` #30: registry `switch` without `default`/`exhaustive`) is GONE — exhaustive-1 `5f0bd546` ("make declaration validation exhaustive") removed it. The remaining three are the subject of V ticket `t_d821f99e`.

**(2) `pnpm generate:contract` — exit 0**, porcelain 12 → 12 (its outputs are gitignored: `packages/contract/generated/`). Then **`pnpm typecheck` (`tsc --noEmit`, repo-wide) — exit 1, diagnostic count 8** (`grep -cE 'error TS[0-9]+:'`), verbatim:

```
tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module '../../web/lib/v3Presentation.js' or its corresponding type declarations.
tests/unit/s14-ui.test.ts(122,38): error TS18046: 'label' is of type 'unknown'.
tests/unit/s14-ui.test.ts(128,71): error TS18046: 'label' is of type 'unknown'.
tests/unit/s14-ui.test.ts(199,18): error TS2339: Property 'nodes' does not exist on type '{ event_id: string; … }'.
tests/unit/s14-ui.test.ts(200,18): error TS2339: Property 'placeholderEdges' does not exist on type '{ event_id: string; … }'.
tests/unit/s14-ui.test.ts(230,58): error TS2307: Cannot find module '../../web/lib/api.js' or its corresponding type declarations.
tests/unit/s14-ui.test.ts(232,55): error TS7006: Parameter 'input' implicitly has an 'any' type.
tests/unit/s14-ui.test.ts(232,62): error TS7006: Parameter 'init' implicitly has an 'any' type.
```

(two long union types elided with `…` here only; the log has them in full.) **Diagnostics in obs paths: 0. Diagnostics elsewhere: 8**, all one file, cause: `3e7d83e9` (2026-09-01 23:30, ui-overhaul) deleted the `web/` tree (present at `8d38185c`: 1 entry; at HEAD: 0) while `tests/unit/s14-ui.test.ts` still imports `../../web/lib/*`. These numbers describe THIS tree at `4f764037`; the packet's "111 `ui-overhaul` dirty entries" were committed before I measured, so the typecheck ran on committed state. Consequence: `pnpm build` (= `generate:contract && typecheck && …`) fails on `dev` today. TBP: the `count: 0 at 80362d0` pin is VOID (TYPECHECK-BASELINE §"THE OPERATIVE PIN IS VOID"); T-5 containment (`--traceResolution` escape check) was NOT asserted — main tree, not a worktree — recorded as UNVERIFIED.

## D Stage 16 ruling input

**VERDICT: (i) demo-rule defect. CONFIDENCE: high. STRONGEST COUNTER:** (ii) — "a real zone probe would match the same grep, so the FAIL might be genuine." Refuted by the sweep below: no obs artifact applies any filesystem or import operation to a zone path; the only file matching the rule is the manifest, whose stated purpose is to hold those strings.

Evidence:
- The rule (`docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh:779`): `grep -qE '(^|[^A-Za-z_])identity\.[a-z_]+|identity\.(js|ts)|registration\.(js|ts)|mail-channel|/mfa\.(js|ts)' "$PRODUCT_ROOT/$_a"` over every `.ts/.tsx/.sql/.json` under `packages/obs-capture`, `tools/obs-listener`, `acceptance/obs` plus the two S01 files (`:759-770`); any match → `:780 _viol`, `:787 fail`. It is a TEXT rule, and the manifest is text that must contain those strings.
- `packages/obs-capture/src/zone/manifest.ts:3-13` (doc comment): "Human-owned RP-1 input. These are literal classification prefixes only. Runtime code must never probe, import, read, list, or otherwise distinguish whether any named zone path or identity table exists." `:16-25` `zone_path_prefixes`, `:26-35` `compiled_alternate_prefixes`, `:36-40` `mount_list`, `:41` `identity_table_deny_set: ["identity.*"]` — all string literals; the only import is `node:crypto` (`:1`) for the manifest hash.
- `packages/obs-capture/src/zone/classifier.ts:111-113` `prefixMatches(repoPath, prefix)` = `repoPath === prefix || repoPath.startsWith(prefix + "/")`; `:115-126` `matchesZoneFrame` maps a stack-frame path to a repo-relative string and tests it against the prefix arrays — **string comparison only; the file imports nothing but `./manifest.js` (`:1-5`)**. `counter.ts` imports `./classifier.js` only; `zone/index.ts` re-exports.
- Sweep of every `.ts` under `packages/obs-capture/` for `readFileSync|readFile(|statSync|lstatSync|stat(|existsSync|readdirSync|readdir(|accessSync|openSync|createReadStream|import(|require(`: hits only in `install/{api,runner,scheduler}.ts:2,77,82,117` (`openSync`/`fstatSync`/`realpathSync` on the **spool** directory from `OBS_SPOOL_DIR`) and `:194` (`import("@debateai/obs-capture/runtime")`), `install/{evaluator-lib,ui-client}.ts:8` (`import("@debateai/obs-capture")`), `src/spool.ts:1` (`node:fs` for the spool). **None is applied to a zone prefix.** Static imports across `src/` and `install/`: Node built-ins and intra-package relative modules only — no `registration`, `mail-channel`, `mfa`, `identity` module anywhere. The only non-manifest textual hits for those words are `writer_identity` (`install/*.ts:154`, `redactor.ts:95,108,239`), which the rule's `[^A-Za-z_]identity\.` anchor already excludes.
- `tests/unit/obs-l2-s04-zone.test.ts › S04 human-owned manifest › contains no runtime probe or excluded-zone import surface` — PASSED ×3.
- Ratified design: VerticalSlices §0 GLOBAL-FORBID — "The zone is referenced only as **path-string data in the D03 manifest**, never as an import"; S04 §1 "allowed … **and the human-owned manifest data file** (zone path-prefix set, compiled-shape alternate prefixes, the three-route mount list, identity-table deny set)". The demo's own `path_is_zone` (`observability-demo.sh:83-97`) holds the same strings for the same reason.
- History: the manifest entered `dev` with the L2 merge `3e91cf42` (2026-08-28 23:27); the 2026-08-27 run (7/0/21) predates it. The FAIL is the rule meeting the manifest for the first time, not an obs regression.

**Exact change (D12 revision, `observability-demo.sh`, inside the `for _a in $_artifacts` loop, immediately before line 779):**

```sh
  case "$_a" in
    packages/obs-capture/src/zone/manifest.ts)
      # D03 human-owned classification list (VerticalSlices §0 GLOBAL-FORBID: zone paths are
      # path-string DATA here, never imports). Audit it under the narrower rule only:
      # any import/require/export-from naming a zone MODULE is still a violation.
      if grep -qE '^[[:space:]]*(import|export)[^;]*from[[:space:]]*"[^"]*(registration|mail-channel|mfa|identity)\.(js|ts)"|require\(' "$PRODUCT_ROOT/$_a" 2>/dev/null; then
        _viol="$_viol $_a"
      fi
      continue ;;
  esac
```

and extend the `evidence` line at `:790` with `"manifest.ts audited under the module-reference rule only (string-literal prefixes are its purpose)"`. The runtime half of D6 stays NOT COVERED exactly as the stage already says (`:794-798`). UNVERIFIED: I did not run the demo (charge D asked me to read the rule; today's log is the orchestrator's 20:28Z run) — the revision must re-run it and show stage 16 PASS with `_count` unchanged.

## E Lane 3 and predecessor worktrees

Repo layout reminder (TOOLING-TRAPS): the git root is `DebateAIRO/`; each worktree under `dialectical-engine/.worktrees/<name>` is a full checkout with the project at `<name>/dialectical-engine/`.

**Lane 3 — `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-3`**

| probe | result |
|---|---|
| `git status --porcelain` | **empty — 0 entries** |
| `git diff --stat` / `git diff --cached --stat` | empty / empty |
| HEAD | `e8d99d33` — `wip(obs): S06 runner binding — uncommitted seat work checkpointed` (2026-08-28 23:26:08 +0300, "Checkpointed verbatim on V's submit-everything order; S06 rework still owes its RED/GREEN chain before this is claimed as done") — branch `obs-lane-3-runner-cause` |
| base vs `dev` | `git merge-base HEAD dev` = `e8d99d33` itself; `rev-list --left-right --count HEAD...dev` = **0 ahead / 163 behind**; `merge-base --is-ancestor e8d99d33 dev` = yes — merged by `1c9578a2` `Merge branch 'obs-lane-3-runner-cause' into dev` (2026-08-28 23:28:17, parents `3e91cf42` + `e8d99d33`) |
| "uncommitted S06 files" | **none exist.** The intake's premise is false since 2026-08-28 23:26. The three files the S06 seat left uncommitted are the content of `e8d99d33`: `apps/runner/src/index.ts` (+120/−31), `apps/runner/src/main.ts` (+1), `tests/integration/obs-l3-s06-runner-binding.test.ts` (+432) |

Did `dev` move under each file? (`git -C <git-root> diff --numstat e8d99d33 dev -- <path>`)

| file (in `e8d99d33`) | `e8d99d33 → dev` | what happened at the merge `1c9578a2` |
|---|---|---|
| `apps/runner/src/index.ts` | **166+ / 115−** | vs parent-1 (`dev` `3e91cf42`): **no change** — the merge kept `dev`'s file wholesale; vs parent-2 (`e8d99d33`): 166+/115−. The wip's `await import("@debateai/obs-capture")` seams (`e8d99d33:2508`, `:2577`) occur **0×** at `1c9578a2` and 0× at HEAD. `dev` had moved first: `2d1f86b8` (17:21, +96 lines) and `7b3a3063` (23:26:07, DEV-12E provider panel) — neither is an ancestor of `e8d99d33`, whose parent is `7a3ff398` |
| `apps/runner/src/main.ts` | 128+ / 26− | `dev`'s dev-auth-stack rewrite kept; the one TP-5 line survived at `:1` |
| `tests/integration/obs-l3-s06-runner-binding.test.ts` | none | merged verbatim — and RED 4/5 on `dev` since |

**Does the work still apply? NO — it must be re-cut. VERDICT re-cut from current `dev` / CONFIDENCE high / STRONGEST COUNTER:** "fast-forward lane-3 to `dev` and re-apply `e8d99d33`'s `index.ts` hunks" — the hunks are recoverable (`git show e8d99d33 -- dialectical-engine/apps/runner/src/index.ts`), but (a) their anchors moved (`declareHatchetWalkingSkeletonTask` now `apps/runner/src/index.ts:2569`, `createPostgresProviderGateway` `:2603`, `recordTerminalFailure` `:2539`, vs VerticalSlices anchors `:2494-2526` / `:2528-2559` at `dc9fd57`), (b) `dev`'s gateway now takes `pg_try_advisory_lock` and the entrypoint's db exports changed, so the test's fixtures are stale too (§B), and (c) the code carries a three-lens BLOCK verdict (#11) whose rework packet was never dispatched. Re-application is therefore a rework round against the post-L2-addendum base, not a merge.

**Other predecessor worktrees (`git worktree list | grep obs-`)** — all six probed read-only, none touched:

| worktree | HEAD | branch | dirty | ahead/behind `dev` | HEAD in `dev` | recommendation |
|---|---|---|---|---|---|---|
| `.worktrees/obs-lane-1` | `68295991` (2026-08-22, S01 lane commit) | `obs-lane-1-store` | 0 | 0 / 166 | yes (`29f370e`) | **remove** |
| `.worktrees/obs-lane-2` | `5f0bd546` (2026-08-27, exhaustive-1) | `obs-lane-2-capture` | 0 | 0 / 156 | yes (`3e91cf42`) | **remove** |
| `.worktrees/obs-lane-3` | `e8d99d33` (2026-08-28) | `obs-lane-3-runner-cause` | 0 | 0 / 163 | yes (`1c9578a2`) | **remove** the worktree; the branch ref may stay for the S06 re-cut (fast-forward it to `dev` first) |
| `.worktrees/obs-s05-lens-1` | `693c77a0` (2026-08-27) | detached | 0 | 0 / 159 | yes | **remove** |
| `.worktrees/obs-s05-lens-2` | `602afba3` (2026-08-27) | detached | 0 | 0 / 158 | yes | **remove** |
| `.worktrees/obs-s05-lens-3` | `367591e3` (2026-08-27) | detached | 0 | 0 / 157 | yes | **remove** |

Rationale: nothing unmerged anywhere, and TOOLING-TRAPS records that `tests/architecture/s9-dev-token-retirement-contract.test.ts` walks `.worktrees/` and counts every worktree's files as offenders — these six inflate the architecture suite's failure count for no benefit. Removal is the orchestrator's/V's act; **I removed nothing.** Out of scope but visible: 55 further worktrees exist (`accounts-*`, `eval-*`, `slice-*`, `rev-*`, `prog-*`, `qa-01`, and ten `/private/tmp/debateai-*` entries git marks `prunable`).

## F RP-0 independent derivation

**Ticket `t_4deda7ab`:** status `blocked`; events created/promoted/blocked 2026-08-26T16:14Z; **exactly one comment**, author `default` (Router), 2026-08-26T19:38:39Z; **no comment by V; no 64-hex value anywhere in the ticket body or comment.** Confirmed. The body enumerates the nine expected members and cites "the custodian one-liner in §4.3" — that section is `planning/L2-ADDENDUM-PLAN.md` §4.3 (`:514-543`), **not** `S02-registry-pin-correction.md` (which has no §4.3; its §3.2/§3.2a/§4.2 carry the recipe and the seven). Packet N5 notes the mis-citation.

**Recipe run** — `S02-registry-pin-correction.md` §3.2 (v1) + §3.2a (`subclass`), transcribed verbatim into a `sh -s <mode>` quoted heredoc (no file written to the tree), base `29f370e`, repo `/Users/vladmihaimiron/Documents/DebateAIRO`:

```
files: count = 115
files sha256 (as emitted, with the dialectical-engine/ prefix): 63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da   = pinned scope_file_list
direct pass: count = 234  sha256 = 1be8394c0c01dcf859b70e2c3b7df7f6efe8f8d376fbf28b01caf9615628f790       = pinned code_seed_direct
SUBCLASS PASS OUTPUT (verbatim):
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
subclass count = 2
```

Stop condition (card §3.2a, ticket body): **not triggered** — exactly the two expected codes. Note for V: the pinned `scope_file_list` hash is over the paths **with** the `dialectical-engine/` prefix as `files()` emits them (the stripped list hashes `70681725…`, which matches nothing) — §11.3 displays them stripped; "repo-root-relative" means the `DebateAIRO` git root.

**`declared_gap` = §4.2 seven ∪ subclass two, `LC_ALL=C sort -u`, trailing LF, SHA-256:**

```
EVALUATOR_DOMAIN_MODEL_ID_INVALID
EVALUATOR_DOMAIN_MODEL_VERSION_INVALID
EVALUATOR_DOMAIN_PROVENANCE_INVALID
EVALUATOR_DOMAIN_PROVIDER_INVALID
EVALUATOR_DOMAIN_RUN_ID_INVALID
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
SCORECARD_TASK_CLASS_AMBIGUOUS
SCORECARD_TASK_CLASS_UNRESOLVED
count = 9
sha256 = 51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078
```

**independent derivation — NOT a ratification; V runs the one-liner.** Cross-checks: the seven alone reproduce the pinned `known_gap` `d1e9b67d17efa3a2e8f8a2be386f59517fbd7769e193b2d5f042f24c53d4ae9a`; the Router's path-(1) `printf` one-liner over the nine enumerated values (RP-0 comment #0) yields the same `51bbfb0a…f078`, so paths (1) and (2) agree as the comment requires.

**Zone disclosure and control.** The frozen 115-file scope (card §11.3, §10.1) contains eight paths COMMON §3 classes as zone (`apps/api/src/{registration,mail-channel}.ts`, `packages/db/src/identity.ts`, `packages/crypto/src/{argon2-worker-pool,argon2-worker,index}.ts`, `apps/ui/app/settings/page.tsx`, `apps/ui/components/AuthGate.tsx`); the recipe's `stream` pipes their **frozen `29f370e` git blobs** through the perl filter, whose only output is matched code literals. No working-tree read, `stat`, listing or grep of any zone file occurred, and none of their content reached me. As a control, the identical subclass pass with all eight removed from the scope (107 files) yields the **same two codes** — the zone blobs contributed nothing. The card §10.1 records the same scan by the architecture seat. The tension between charge F ("frozen 115-file scope") and COMMON §3 is filed as N5 for the orchestrator to rule, not resolved by me.

I never opened `tests/unit/obs-l2-s02-registry.test.ts`; its suite output was filtered for 64-hex lines before I read it, and it passed ×3, so no expected value was ever printed.

## G Notes vs truth

| # | note | truth (measured) | correction |
|---|---|---|---|
| 1 | "S05 closed GREEN at `367591e`" | `t_6e99d607` is `todo`; #60 (2026-08-27T12:51Z) says verification lens **GREEN** on `367591e` and "the slice now awaits V"; no V acceptance comment exists; the code reached `dev` in `3e91cf42` (2026-08-28 23:27, second parent `5f0bd546` whose parent is `367591e`) with no board record | GREEN is right, **"closed" is wrong** — write "GREEN at `367591e` (lens, 08-27); merged to `dev` 08-28 in `3e91cf42`; board never closed, V never commented" |
| 2 | "S02 exhaustive-1 was dispatched 2026-08-27" | #31 · 2026-08-27T13:00:13Z: dispatched 12:59:30Z, fresh Codex seat, worktree `obs-lane-2`, base `367591e`; #33 · 13:13:54Z `READY FOR PEER REVIEW`, commit `5f0bd546`; **no verdict since**; `5f0bd546` is `3e91cf42`'s second parent | **True but incomplete** — it was also delivered the same day and merged unreviewed; the notes should read "dispatched and delivered 08-27 (`5f0bd546`), unreviewed, merged 08-28" |
| 3 | Intake: "`obs-lane-3` carries UNCOMMITTED S06 work" | lane-3 porcelain is empty; the work was checkpointed as `e8d99d33` at 2026-08-28 23:26:08 and merged by `1c9578a2` at 23:28:17 | **False since 08-28** — and the merge discarded the `index.ts` hunks (B1) |
| 4 | Intake: "every binding (S06 runner …) ABSENT" | `apps/runner/src/main.ts:1` imports `@debateai/obs-capture/install/runner` on `dev`; the S06 test is collected (red); the binding regions are absent | S06 is **PARTIAL**, not absent — the runner entrypoint on `dev` already installs the Tier-0 fatal-boundary handlers |
| 5 | Packet/COMMON: `dev @ 8d38185c`, 111 dirty | measured `b5a6b6eb` → `4f764037`; dirty 4 → 12 (mission packets) → 16 with my files; obs surfaces byte-identical `8d38185c → 4f764037` | acknowledged by the orchestrator's HEARTBEAT (#1 on my ticket); every figure here cites its HEAD |
| 6 | Intake: "The 2026-08-27 run passed 7/0/21 before S04's manifest was merged" | demo delivered 2026-08-27T09:52Z; manifest merged `3e91cf42` 2026-08-28 23:27 | consistent — no correction |
| 7 | D12 ticket #1: "Exit 0. 7 PASSED" | today `6/1/21`, exit 1 (stage 16) | the ticket carries no record of the regression (N1) |

## Findings

**B1 — `dev` carries a half-merged S06, and the collected suite has been red since 2026-08-28.** Merge `1c9578a2` (2026-08-28 23:28:17, parents `3e91cf42` + `e8d99d33`) resolved `apps/runner/src/index.ts` to parent-1 wholesale (numstat vs `3e91cf42`: none; vs `e8d99d33`: 166+/115−), discarding every binding hunk of the S06 wip, while merging `apps/runner/src/main.ts:1` (`import "@debateai/obs-capture/install/runner"`) and `tests/integration/obs-l3-s06-runner-binding.test.ts` (432 lines). Failure scenario: `pnpm vitest run tests/integration/obs-l3-s06-runner-binding.test.ts` → 4 failed / 1 passed, markers `:104:19 :192:8 :196:24 :202:9 :206:25 :305:22 :426:46`, three identical runs (§B); `pnpm test` on `dev` is red by construction. Side effect V should know: the production runner entrypoint on `dev` now installs the Tier-0 fatal-boundary handlers at module-eval (`install/runner.ts:186-190`: `uncaughtExceptionMonitor` + `exit` → `writeFatalBoundaryRecord()`) and attempts `import("@debateai/obs-capture/runtime")` (`:192-197`), which does not exist (S05b absent) and is swallowed by `.catch(() => undefined)` — behaviour from a slice whose three blind lenses returned BLOCK (#11). Class: **merge-conflict resolution that silently discards a lane's hunks** — the same class as SYNC-01 in TOOLING-TRAPS ("a worktree's planning documents and the main tree's are related by nothing"), here applied to code. Fix owner: the S06 rework (packet `goal-packets/s06-rework-1.md`, held) re-cut against the post-L2-addendum `dev`; until then V decides whether the red S06 test stays collected. Mechanical guard for the class: after any lane merge, `git diff <merge>^2 <merge> -- <lane-owned files>` must be empty for every lane-owned region, or the merge is re-done.

**B2 — S04's zone-integrity assertion pins another mission's live file to a frozen base, so it is permanently red on `dev`.** `tests/unit/obs-l2-s04-zone.test.ts:33` `const BASE_REF = "29f370e0f1017245aa26443ad366e020e815c301"`; `:76-77` `assertZoneBoundaryIntact({ repoRoot: ROOT, baseRef: BASE_REF, slice: "S04" })` throws `ZONE_REGION_MODIFIED: slice=S04 base=… work=…` (`tests/support/zone-boundary.ts:459-461`, ZI-2) because commit `0cec59ef` (2026-08-23, `feat(accounts): enforce opaque run ownership`) rewrote all three mount lines inside the accounts-owned registration block (`{ config: { auth: "public" } }` → `routePolicy("POST /v1/auth/…")`); `:133-136` builds mutant `g4` by replacing the literal `      ip: request.ip,`, which occurs 1× at `29f370e` and 0× on `dev`, so `:165` `expect(disagreement.ok).toBe(false)` receives `true`. Failure scenario: any `dev` containing `0cec59ef` (every `dev` since 08-23) → 2 failed / 13 passed, three identical runs. `S04-zone-boundary-correction.md` §5.2 defines ZI-2 as content identity "against the **lane's merge-base**"; the test transcribed a fixed SHA and the fixtures a fixed text — TOOLING-TRAPS variant-6 class (an acceptance pinned to coordinates of a file whose purpose is to change), with a negative-direction twin: ZI-1 shape still passes, so the boundary itself is intact and the test cannot tell V that. Fix owner: architecture ruling on what `baseRef` means once a lane is merged (merge-base with `dev` at check time, i.e. HEAD → trivially identical; or a per-slice recorded base), then S04's own test glob. Obs proposes nothing inside the zone; the recovery/MFA mounts live in sibling blocks (`apps/api/src/index.ts:771`, `:783`), not in the ruled region.

**N1 — the board does not carry the state.** No comment on any L2/L3 ticket records merges `3e91cf42` (L2), `1c9578a2` (L3), or checkpoint `2d1f86b8`; S02's exhaustive-1 `5f0bd546` reached `dev` with no review verdict after #33; `t_489ecbcc` reads `running` with no activity since 08-26; `t_40c2cc1b` reads exit 0 / 7 PASSED while today's run is exit 1 / 6 PASSED. Fix: the orchestrator posts the §A reconciliation comments today and routes a Fable reviewer to `5f0bd546` (its diff is `git show 5f0bd546`, one file + one report).

**N2 — `pnpm lint` is red on `dev`.** `pnpm audit:source` `blocking` length 3 (`packages/obs-capture/install/{api,runner,scheduler}.ts` read `process.env` outside the register loader). The decision is V's (`t_d821f99e`, `ready`, 0 comments since 2026-08-27; L2-ADDENDUM-PLAN §3.7/R-5 "config surface is env-only, and nothing validates it"). Fix: V answers the ticket; either the installers move their config behind the register loader (S05's own glob) or the audit gains a ruled exemption — never a silent allowlist.

**N3 — `pnpm typecheck`/`pnpm build` are red on `dev`, cause outside obs.** 8 diagnostics, all `tests/unit/s14-ui.test.ts` (`:19 :122 :128 :199 :200 :230 :232 :232`), because `3e7d83e9` (ui-overhaul, 2026-09-01 23:30) deleted `web/` without retiring the test that imports `../../web/lib/*`. Owner: ui-overhaul. Fix: retire or repoint `tests/unit/s14-ui.test.ts`; re-run `pnpm typecheck` to 0.

**N4 — D12 stage-16 rule defect.** `observability-demo.sh:779` fails the human-owned manifest for containing the strings it exists to hold; exact change in §D. Owner: D12 (`t_40c2cc1b`) next revision; re-run required.

**N5 — packet defects (filed against the packet, not the seat).** (a) Constants `8d38185c` / 111 dirty stale within 10 minutes of dispatch — acknowledged in HEARTBEAT #1; the packet should carry a "re-pin HEAD/dirty at CLAIM" instruction as standard. (b) Charge E premise "uncommitted S06 files" false since 08-28 23:26 (intake §"Fleet" repeats it). (c) Charge F cites "the card's §4.3 one-liner" and lists `S02-registry-pin-correction.md` §4.3 among the upstream sections — that file has no §4.3; the one-liner is `L2-ADDENDUM-PLAN.md:514-543` and RP-0 comment #0. (d) Charge F orders the frozen 115-file scope while COMMON §3 forbids direct zone reads; eight in-scope paths are zone by COMMON's list — ruled here by running the recipe faithfully with disclosure and a zone-excluded control (§F); the packet should say which it wants. (e) The output heading pins `dev @ 8d38185c` while the tree moved — kept verbatim, disambiguated in line 1. Nothing in the `allowed` list was missing for the deliverables.

**N6 — two tooling traps paid for again this session** (appended to `.hermes/TOOLING-TRAPS.md`): zsh passed `$FILES` to vitest as one token (`No test files found` = BROKEN); `git diff -- dialectical-engine/…` from inside `dialectical-engine/` matches nothing and reads as "unchanged" (produced a false "dev did not move under lane-3" for one round).

## UNVERIFIED / gaps

- **T-5 containment** for the typecheck (`--traceResolution` escape check) — not asserted; measured in the main tree where the only parent is the git root.
- **Who performed the 2026-08-28 merges** (`3e91cf42`, `1c9578a2`, `2d1f86b8`): git author/committer identity is V's for every commit in this repo; the board is silent; `e8d99d33`'s message says "Ordered by V". Not verifiable from here.
- **V's personal test** of any L2 slice (vertical-slice law) — no record anywhere; the merge is the only acceptance signal.
- **"Red since 2026-08-28"** for S06/S04 is inferred from the merge diffs and `git show`/`grep -c` at `1c9578a2`/`3e91cf42`, not from running the suite at those commits (no checkout permitted).
- **The demo was not re-run** and the §D change was not executed; stage 16 PASS after the change is a prediction.
- **Whether `0cec59ef` is the only commit that changed the ZI-2 region** — it is one confirmed cause (its own diff rewrites the three mount lines); `4828358e`, `ef12714c`, `2d1f86b8` also touch `apps/api/src/index.ts` and were not attributed line-by-line.
- **RP-1 manifest hash** (`18d53b6c…` per S04 #12) vs today's manifest — not recomputed (not charged).
- **S02 exhaustive-1 content** — merged unreviewed; I did not review it (out of charge; it needs its own lens).
- **Live database state** (`obs.*` tables in `debateai-v3-postgres-1`) — not probed (no SQL permitted; the demo's stage 02 also skipped it for lack of a URL).

## Handoff

```
READY FOR PEER REVIEW — AUDIT-STATE (t_0d8634a7)
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging
Audit file: docs/missions/observability-agents/requirements/fixagent-state-audit.md · self-report: .hermes/reports/observability-agents/agent-reports/AUDIT-STATE.md · logs: docs/missions/observability-agents/logs/audit-state-{gates,suite-run-1,suite-run-2,suite-run-3}.log · TOOLING-TRAPS.md: two entries appended.
Measured on dev @ 4f764037 (packet: 8d38185c). Every obs surface is byte-identical between the two (git diff --stat over packages/obs-capture, migrations, obs tests, runner/api/scheduler entrypoints, kernel, tools, demo: EMPTY).

VERDICT SUMMARY
1. LANDED on dev: S01 (merge 29f370e, V-accepted on the board) and the whole L2 lane — S02 base + exhaustive-1 (7a3ff398, 5f0bd546), S03a (+7afdbe5d), S03b, S04, S05 (…367591e) — via merge 3e91cf42 (2026-08-28 23:27). No board comment records that merge; S02 exhaustive-1 (5f0bd546) was merged with NO review verdict.
2. PARTIAL: S06 is half-merged — 1c9578a2 (2026-08-28 23:28) took apps/runner/src/main.ts:1 (installer import) and the 432-line S06 test but kept dev's apps/runner/src/index.ts wholesale, discarding every binding hunk. ABSENT: S05b (src/runtime), S07 (TypedDomainError still has no cause), everything G2+. RP-0: no hash from V.
3. Suites: 133/139 on all three runs, identical — 6 red: S06 runner-binding x4, S04 zone-boundary x2; all red on dev since 2026-08-28; none caused today.
4. Gates: pnpm audit:source exit 1, blocking length 3 (install/{api,runner,scheduler}.ts read process.env outside the register loader — V ticket t_d821f99e, 0 comments since 08-27); pnpm generate:contract exit 0 (no porcelain delta); pnpm typecheck exit 1, 8 diagnostics ALL in tests/unit/s14-ui.test.ts (web/ deleted tonight by 3e7d83e9), 0 in obs paths. pnpm lint and pnpm build are red on dev for these two reasons.
5. RP-0: faithful recipe over the frozen 115-file scope at 29f370e reproduces scope 63c7ebb2… and direct 1be8394c…; subclass pass yields exactly PROVIDER_CALL_FAILED, PROVIDER_CONTENT_UNACCEPTED; declared_gap = 9 members, sha256 51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078 — independent derivation, NOT a ratification; V runs the one-liner. The Router's path-(1) printf gives the same value; a zone-excluded control (107 files) yields the same two codes.
6. Stage 16: verdict (i) demo-rule defect, confidence high — observability-demo.sh:779 must exempt the human-owned manifest (exact edit in §D). Sweep: no obs artifact imports, reads, stats, lists or probes a zone path; classifier is string-prefix matching only.
7. Board: S03a 'running' stale since 08-26; S02/S03b/S04/S05 'todo' while merged; per-ticket actions in §A. All six obs worktrees (lane-1/2/3, s05-lens-1/2/3) are clean with HEAD inside dev — nothing unmerged; recommend removal (I removed nothing).

FINDINGS
B1 — dev carries a half-merged S06: merge 1c9578a2 discarded the index.ts hunks of e8d99d33 (166+/115- vs lane, 0 vs dev), leaving 4 permanently red tests (markers :104:19 :192:8 :196:24 :202:9 :206:25 :305:22 :426:46) and a live Tier-0 fatal-boundary installer in the production runner entrypoint from a slice whose three blind lenses returned BLOCK. Owner: S06 re-cut against post-L2-addendum dev; mechanical guard: after any lane merge, git diff <merge>^2 <merge> -- <lane-owned files> must be empty.
B2 — tests/unit/obs-l2-s04-zone.test.ts:33 pins BASE_REF=29f370e0… where S04-zone-boundary-correction §5.2 says lane merge-base; accounts commit 0cec59ef (2026-08-23) rewrote the three mount lines, so ZI-2 throws ZONE_REGION_MODIFIED (:77); mutant g4 (:133-136) is a no-op on dev (needle 1x at 29f370e, 0x on dev) so :165 inverts. ZI-1 shape is intact (recovery/MFA mounts live in sibling blocks :771/:783) — no boundary breach. Owner: architecture ruling on baseRef, then S04's own test glob.
N1 — the board does not carry the state: no record of merges 3e91cf42 / 1c9578a2 / 2d1f86b8; no verdict after S02's READY FOR PEER REVIEW #33 (5f0bd546); t_489ecbcc stale 'running'; t_40c2cc1b still says exit 0 / 7 PASSED while today is exit 1 / 6 PASSED.
N2 — pnpm lint red on dev: audit:source blocking x3 → t_d821f99e needs V's answer.
N3 — pnpm typecheck / build red on dev: 8 diagnostics in tests/unit/s14-ui.test.ts because 3e7d83e9 deleted web/ (owner: ui-overhaul).
N4 — D12 stage-16 rule (observability-demo.sh:779) fails the manifest for holding the strings it exists to hold; exact edit in §D; demo not re-run by me.
N5 — packet defects: stale constants (acknowledged in HEARTBEAT #1); charge E premise 'uncommitted S06 files' false since 08-28 23:26; charge F cites a '§4.3' that S02-registry-pin-correction.md does not have (it is L2-ADDENDUM-PLAN.md:514-543 / RP-0 comment #0); charge F's frozen scope vs COMMON §3 zone rule unaddressed (eight in-scope paths are zone — ran faithfully, disclosed, controlled); heading pinned to 8d38185c while the tree moved.
N6 — two TOOLING-TRAPS paid again: zsh $FILES to vitest → 'No test files found' (BROKEN, not RED); git pathspec double-prefix from inside dialectical-engine/ → empty diff read as 'unchanged'.

NOT VERIFIED (and why): T-5 traceResolution containment for the typecheck (main tree, not a worktree); who performed the 08-28 merges (git identity is V's on every commit; board silent); V's personal test of any L2 slice (no record anywhere); 'red since 08-28' is inferred from merge diffs and git show at 1c9578a2/3e91cf42, not by running the suite at those commits (no checkout permitted); the demo was not re-run and the §D edit not executed; whether 0cec59ef is the only commit that changed the ZI-2 region; RP-1 manifest hash not recomputed; S02 exhaustive-1 content not reviewed; live obs.* DB state not probed (no SQL).

git status --porcelain | wc -l: START 4 (23:40:23, HEAD b5a6b6eb) → END 19 (HEAD 4f764037). Not equal — delta attributed: 16 entries belong to other actors writing during my session (orchestrator's edits to COMMON.md / REQ-FIX.md / 00-intake-H0.md and the new REQ-REV-*, REQ-SYNTH, TEMPLATE-* packets — untouched by me); 3 entries are mine (docs/missions/observability-agents/requirements/ = the audit file; .hermes/reports/observability-agents/ = the self-report; .hermes/TOOLING-TRAPS.md append). The logs/ directory was already an untracked entry at start and absorbs my four logs. No git write, no migration, no SQL, no process start/stop, no zone file read/stat/list; suite runs used an embedded throwaway PostgreSQL (tests/support/testDatabase.ts).
comments read through: 2
```

### git status --porcelain at handoff (19 entries, HEAD 4f764037)

```
 M dialectical-engine/.hermes/TOOLING-TRAPS.md
 M dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md
 M dialectical-engine/.hermes/planning/observability-agents/packets/REQ-FIX.md
 M dialectical-engine/apps/ui/next-env.d.ts
 M dialectical-engine/docs/missions/observability-agents/00-intake-H0.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/AUDIT-STATE.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/REQ-REV-FIX.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/REQ-REV-OBS.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/REQ-REV-SUP.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/REQ-SYNTH.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/TEMPLATE-ARCH.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/TEMPLATE-CODE-REV.md
?? dialectical-engine/.hermes/planning/observability-agents/packets/TEMPLATE-CODE.md
?? dialectical-engine/.hermes/planning/translation/
?? dialectical-engine/.hermes/reports/observability-agents/
?? dialectical-engine/docs/missions/observability-agents/logs/
?? dialectical-engine/docs/missions/observability-agents/requirements/
?? dialectical-engine/docs/missions/observability-agents/slices/
?? dialectical-engine/docs/missions/translation/
```
