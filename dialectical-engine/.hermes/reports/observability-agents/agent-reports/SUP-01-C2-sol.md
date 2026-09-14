SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-worker, test-driven-development, writing-good-tests, systematic-debugging, verification-before-completion

# SUP-01 C2 implementation report — Help Corpus loader

## Handoff

- Status: `DONE_WITH_CONCERNS`
- Worker/session: `/root/sup01_c2_loader` (first-pass implementer; no subagents)
- Branch/worktree: `slice/oa-sup-01` at `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-sup-01/dialectical-engine`
- Base observed before edits: `2b670d3059c60d7262cf655bd5d402c88100dff3`
- Commit: `db2636576a6821d742831ddce6c5048f9523d9e8`
- Commit message: `feat(support): SUP-01 C2 — Help Corpus loader, kb_version, bilingual gate`
- Comments read through: `not-ticketed/parent-dispatch-2026-09-03`

## Authority and dispatch state

- Task 1 brief SHA-256 at start/end: `a77e1030248ba095e83669d93d38ae49c7a8c421af38df92c66a4571c2ac4dc3` / same.
- Packet-designated authoritative main-tree SUP-01 SPEC SHA-256 at start/end: `369a6dd8910e888e94b02dc880ddbe3305c45345bd8ed6c983371691096f8b07` / same.
- Final SUP-00 KB Grok verdict SHA-256 at start/end: `96ccb011273fcd8b56cae2b10b8914cff72b1cc5211f80f6b640d5116700c6f3` / same; verdict read as final `PASS` with V ratification still absent.
- Corpus aggregate over the sorted 24 per-file SHA-256 rows at dispatch/end: `dea35077160c601bfb32a7d9fcb1e36e02ce6404d5ff512a96f192c45ca0a86b` / same. All 24 individual end hashes matched the dispatch-time rows.
- Initial dirt was preserved: five modified SUP DECISIONS files; three untracked SUP-00 reports; untracked `packages/support-kb/content/**`; untracked `tests/support-eval/**`. Eval/foundation dirt was neither opened nor changed.

## Delivered behavior

- Added package `@debateai/support-kb` with exact export map `{ ".": "./src/index.ts" }` and only the already-present workspace kernel dependency.
- Added `loadHelpCorpus(directory)`, typed `SupportKbError`, public entry/result types, strict eight-key front-matter parsing, exact filename/id/language validation, duplicate detection, bilingual gating, intended/unratified counting, instruction-like-text lint, and byte-derived `kbVersion`.
- Canonical manifest is documented and tested: IDs sorted by code point; `en` then `ro`; each line `<id>.<lang>.md:<sha256 of exact file bytes>`; LF separators; no trailing LF. `kbVersion` is SHA-256 of those manifest bytes.
- Real reviewed corpus result before V ratification: `entries: 0`, `shippedCount: 0`, `ignoredCount: 12`, empty manifest, `kbVersion: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## Strict TDD evidence

### Initial RED

Command: `pnpm vitest run tests/unit/support-kb.test.ts`

- Exit `1`.
- Verbatim cause: `Error: Cannot find module '../../packages/support-kb/src/index.js'`.
- Summary: `Test Files 1 failed (1)` and `Tests no tests`; the missing-loader failure occurred before any production file existed.

### GREEN and follow-on RED→GREEN

- First loader run: exit `0`, `13 passed (13)`.
- Compiler RED found eight new C2 errors: `ReturnType<typeof readdirSync>` selected Node's buffer overload. The same run also printed the pinned eight `tests/unit/s14-ui.test.ts` diagnostics.
- Minimal compiler fix: infer the `readdirSync(..., { encoding: "utf8" })` result directly. Re-run printed only the pinned eight `s14-ui` diagnostics and zero C2 diagnostics; focused suite remained `13 passed (13)`.
- Malformed-date test RED: exit `1`, `1 failed | 13 passed (14)`, exact failure `expected function to throw an error, but it didn't` for `2026-99-99`.
- Minimal date validation fix: ISO parse plus exact round-trip. Re-run: exit `0`, `14 passed (14)`.

## Required refutation duty

Property: a pair is loadable only when both language files are `status: shipped` and `ratified_by: V`.

- Mutant: flipped both V predicates from `=== "V"` to `!== "V"`.
- Mutant run: exit `1`, `3 failed | 10 passed (13)`. The selection assertion received `unratified.en`/`unratified.ro` instead of `accepted.en`/`accepted.ro`; the manifest became empty; the shipped-byte-change version assertion also failed.
- Restored the exact `=== "V"` predicates with `apply_patch`; focused suite returned exit `0`, `13 passed (13)` at that point. `git status --porcelain` after restore showed only the known Task 0 dirt plus the authorized new C2 paths.
- Neighbouring non-load-bearing mutation: changed one intended English fixture body from `Draft A.` to `Draft B.` while keeping one shipped pair. Probe exit `0`; before/after `kbVersion` both `b6a9ac2dc49ae8db86f7353fddaa1477aa3677094bf283c200c5fdbcdb024109`; `unchanged: true`, `shipped: 1`, `ignored: 1`.

## Three-run cluster verification (worst run governs)

Command each time: `pnpm vitest run tests/unit/support-kb.test.ts`

| Run | Exit | Result | Wall time |
|---:|---:|---|---:|
| 1 | 0 | 1 file, 14/14 tests passed | 0.591 s |
| 2 | 0 | 1 file, 14/14 tests passed | 0.603 s |
| 3 | 0 | 1 file, 14/14 tests passed | 0.591 s |

Worst-run verdict: `PASS`.

## Repository gates

- `pnpm audit:source`: the sandbox attempt failed before the audit because `tsx` could not bind its IPC pipe (`listen EPERM`). Re-run with approved escalation executed the audit and exited `1` with the pinned blocking array unchanged and no support row:

```json
{
  "blocking": [
    "packages/obs-capture/install/api.ts reads the process environment outside the register loader",
    "packages/obs-capture/install/runner.ts reads the process environment outside the register loader",
    "packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader"
  ]
}
```

- `pnpm generate:contract`: sandbox attempt hit the same `tsx` IPC `EPERM`; approved re-run exit `0`.
- `pnpm typecheck`: exit `1` with exactly the pinned eight diagnostics, all in `tests/unit/s14-ui.test.ts` at lines 19, 122, 128, 199, 200, 230, and twice at 232; zero new diagnostics.
- `git diff --check`, untracked-file `--no-index --check`, and `git diff --cached --check`: exit `0`, no output.
- Real-corpus load probe: exit `0`, zero returned entries, `0` shipped and `12` ignored.

## Commit boundary

The index immediately before commit contained exactly 27 authorized files:

- `packages/support-kb/package.json`
- `packages/support-kb/src/index.ts`
- `packages/support-kb/content/**` — 24 reviewed Task 0 files, staged without byte changes
- `tests/unit/support-kb.test.ts`

The commit reports `27 files changed, 945 insertions(+)`. No DECISIONS, SUP-00 report, eval, generated contract artifact, root script, lockfile, zone, API/UI, migration, or report path was staged. Both C2 reports were written only after the commit and remain outside it as required.

## Concerns and findings

1. Packet/path mismatch: the packet correctly names the authoritative main-tree SPEC at `369a6d…`, but the assigned worktree's tracked SPEC hashes to `4e76280d4d025d4ca64b9a2796aee8d7172ccd7864587cbe5f8773314230ce91`. The diff is in seed ranges plus non-C2 coercion/session additions; R04/R10 loader requirements agree. Nothing was changed to reconcile this read-only artifact.
2. The heartbeat-worker read order names `docs/missions/observability-agents/INSTRUCTIONS.md`, but that file does not exist. The packet's scoped Task 1 brief and frozen SPEC supplied the necessary authority. This is a packet/repository documentation defect, not a C2 blocker.
3. Required `tsx` script commands cannot create their IPC socket in the workspace sandbox. Approved escalation was necessary for audit and generation; the direct `node --import tsx` probes did not have this problem.
4. The source-audit three-row block and the eight `s14-ui` compiler diagnostics remain pre-existing. They are quoted above and were not changed under this contract.

## Self-report — murder-case notes

1. What went well: the packet's exclusive-path contract prevented accidental staging of five live DECISIONS edits and the eval/foundation corpus.
2. What went well: hashing the reviewed corpus before edits made its byte preservation a direct comparison, not an inference from Git status.
3. What nearly went wrong: hashing `SPEC.md` once from the worktree would have reported `4e7628…` against a packet that explicitly designated the main-tree `369a6d…` file.
4. Root cause: the worktree was cut before later frozen-SPEC clarifications reached the main tree; cost was one comparison/read pass, about two tool calls.
5. Root cause: `ReturnType` on overloaded Node APIs resolves the wrong overload here; cost was one compiler RED and one minimal patch.
6. Upgrade: prefer an inferred local or explicit generic result for overloaded filesystem APIs in strict TypeScript.
7. Root cause: `tsx`'s CLI starts an IPC server even for these local scripts, which the sandbox denies; cost was two failed commands and two approved re-runs.
8. Upgrade: packets for this sandbox should pre-authorize the exact `pnpm audit:source` and `pnpm generate:contract` prefixes or prescribe `node --import tsx` where semantically equivalent.
9. Dead end avoided: no YAML dependency was added; the exact narrow front-matter grammar is smaller, deterministic, and rejects unsupported YAML rather than pretending to parse it.
10. Near-miss: regex-only `YYYY-MM-DD` validation accepted impossible dates; the added RED case exposed it before commit.
11. The ratification mutant proved the main gate is not decorative: three independent assertions failed when it was inverted.
12. The intended-entry neighbour probe proved `kbVersion` excludes non-load-bearing bytes, preventing noisy version churn before V ratification.
13. Upgrade: synchronize authoritative frozen artifacts into each dispatched worktree, then hash both packet path and seat path in the pre-dispatch gate.
14. Upgrade: either add the mission `INSTRUCTIONS.md` the worker contract mandates or make the packet explicitly declare that the brief substitutes for it.
15. No corpus text was authored, corrected, or ratified by this coding seat; current zero-shipped behavior remains the intended product truth.

READY FOR PEER REVIEW
