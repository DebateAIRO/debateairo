SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:using-git-worktrees, superpowers:executing-plans, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion, superpowers:requesting-code-review

# FIX-05 C1 implementation report

Status: C1 implementation milestone complete and committed. FIX-05 is **not Done**: RP-0 remains unratified/transcribed and V's live acceptance has not run.

## Authority and integration preflight

- Created isolated branch/worktree `codex/oa-fix-05` from the current FIX-01 PASS head `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8`.
- That head already contains FIX-01 runtime plus the reconciled/evolved FIX-03 C1 declared-kind projection.
- Applied only the reviewed FIX-03 C2/C3 runner-seam chain: upstream `847eab10`, `44cfd60c`, `4880f19d`, `322b1886`, represented here by cherry-picks `d299a6e7`, `dfdaf7ab`, `5606ebc5`, `dc0d8381`.
- The combined pre-change baseline passed: 7 files, 76 tests (FIX-01 runtime/database, FIX-03 C1-C3, provider neighbors).
- FIX-05 review range: `dc0d8381..7459c3fc`.

## Commit and scope

Commit: `7459c3fc` — `feat(providers): FIX-05 C1 — one occurrence per exhausted call with declared attempt and ledger refs`

Committed paths, exactly:

- `packages/providers/src/index.ts`
- `tests/unit/fix05-provider-exhaustion.test.ts`
- `tests/architecture/fix05-import-graph.test.ts`

No obs-capture, runner, scheduler, zone, schema, migration, spec, plan, decision, progress, or Hermes file was changed. This report is intentionally untracked and unstaged.

## Behavior implemented

- Hoisted `lastAttemptId` outside the attempt loop and updates it once for each actual attempt.
- Emits once at each of the two post-loop exhaustion sites only.
- Declares the last attempt as kind `attempt` and the matching terminal ledger ref as kind `ledger_entry`.
- Inherits only ambient own-data `run_ref`, `work_item_ref`, and `zone_context`; it does not derive run/work from the provider request.
- Emits only code, taxonomy, capture point, disposition, source, and numeric attempt count. The helper cannot receive prompt, raw response/payload, or parse text.
- Observability failures remain best effort and cannot replace provider return/error behavior.
- Imports the capture root barrel only. The resolve trace loads no `pg` and no `@debateai/db`.

## TDD and verification evidence

- RED: focused suite had 3 expected failures / 2 passing controls: both exhaustion emissions were absent and the provider graph did not load capture core.
- GREEN: focused suite passed 5/5 in three independent runs; a post-mutation restore run also passed 5/5.
- Adjacent suite: 7 files, 62/62 (FIX-05, provider neighbor tests, FIX-03 kinds/projection/repair/runner artifact).
- Mutants killed and restored:
  - inside-loop transport emit: produced four rows for three failures and one row on retry success;
  - leaked parse-text field: failed the closed payload-key assertion (and carried the planted parse canary);
  - dropped ambient run: failed both exhaustion context assertions.
- `pnpm generate:contract`: exit 0 before typecheck.
- `pnpm typecheck`: exactly the pinned 8 diagnostics, all in `tests/unit/s14-ui.test.ts`; FIX-05 delta 0 and no path escaped this worktree.
- `pnpm audit:text-bytes`: `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `pnpm audit:source`: unchanged baseline only — the five FIX-01 env-reading rows (`install/{api,runner,scheduler}.ts`, `runtime/config.ts`, `runtime/index.ts`).
- `pnpm audit:architecture`: unchanged baseline failure — missing retired `web/package.json`.
- `git diff --cached --check`: exit 0 before commit.
- Static provider scan found zero `pg` / `@debateai/db` import strings; runtime resolve-hook test independently proves both absent.

## RP-0 / acceptance status

The current registry does not contain `PROVIDER_CALL_FAILED` or `PROVIDER_CONTENT_UNACCEPTED`. The real shared redactor therefore yields the honest pre-RP-0 minimized result:

`self|CAPTURE_SELF|OBS_CAPTURE_SELF|true`

It preserves the four declared run/work/attempt/ledger identities, but the fallback deliberately clears provider taxonomy/capture point and template parameters. No claim of registered-code behavior, live database acceptance, Done, or V acceptance is made. RP-0 ratification plus S02 transcription and V's SPEC §5 live run remain pending.

## Review fix round 1 — direct dependency contract

Status: the reviewed dependency correction is implemented and committed. This is a dependency-boundary correction only; C1 PASS, RP-0, SPEC §5 V acceptance, and FIX-05 Done remain pending.

### Authority and commits

- Started from the reviewed C1 product endpoint `7459c3fc9709054c532942e063b46cf9fd8301ff` on isolated branch `codex/oa-fix-05`.
- Verified the worktree git-dir differs from the common-dir, it is not a submodule, the named branch is correct, tracked/index state was clean, and the two existing reports were the only untracked files.
- Cherry-picked the docs-only authority commits in the required order:
  - upstream `1f663d31aae41e70c7b22c60706fe6651e8a4b3d` -> local `b0442fbfb7ae013ed5b71be3c9541feef1df0e51` (`docs(obs): authorize FIX-05 dependency correction`);
  - upstream `b5ae558bdff12011dbf6f74f2a3655cbae5c724c` -> local `331cc95da841d474ac3ac35ee527948975360d2f` (`docs(obs): harden FIX-05 verification gates`).
- Implementation commit: `ecbad9d60987a28d479dd13062fa763048aed4d8` — `fix(providers): declare obs-capture dependency`.

### Exact implementation

The implementation commit contains exactly four paths:

- `packages/providers/package.json`: exact runtime dependency `"@debateai/obs-capture":"workspace:*"`;
- `pnpm-lock.yaml`: only the provider importer entry with `specifier: workspace:*` and `version: link:../obs-capture`;
- `tools/orphan-audit/src/index.ts`: only `obs-capture` appended to the provider allowlist;
- `tests/architecture/fix05-import-graph.test.ts`: exact metadata contract, isolated production deployment import, deployed-edge deletion proof, and retained root import-graph inverse.

No provider source behavior, obs-capture path, runner, scheduler, zone, schema, migration, registry, RP-0 surface, other package manifest/importer/allowlist row, original unit fixture, or live Task 5 plan changed. No dependency or architecture edge beyond provider -> obs-capture was added.

### TDD and mutation evidence

- Genuine RED was run with only the architecture test changed. The elevated run produced exactly `2 failed | 2 passed`: the manifest dependency was absent and an otherwise successful isolated production deployment failed on import with `ERR_MODULE_NOT_FOUND` naming `@debateai/obs-capture`; the self-contained removed-edge mutant and retained root graph were GREEN. The first restricted attempt was invalid because pnpm could not reach missing store artifacts, so it was not counted as RED.
- First accepted GREEN after the exact three declarations: `1` file, `4/4` tests.
- Manifest mutant: exact-contract plus isolated-import cases failed (`2 failed | 2 passed`); restored to `4/4`.
- Provider lock-importer mutant: the one-occurrence assertion failed (`1 failed | 3 passed`); restored to `4/4`.
- Provider allowlist mutant: the exact-row assertion failed (`1 failed | 3 passed`); restored to `4/4`.
- Authoring-time neighboring-importer check: placing the otherwise exact lock stanza under `packages/battery` left deployment operational but failed the provider-importer assertion (`1 failed | 3 passed`). The battery stanza was removed and the provider stanza inserted before the accepted GREEN; no neighboring-importer byte survived.
- Deployed-package edge mutant: the restored test deletes only the deployed `node_modules/@debateai/obs-capture`, then passes only after proving child status nonzero and stderr contains both `ERR_MODULE_NOT_FOUND` and `@debateai/obs-capture`.
- Inverse graph control: every restored run imported the capture core and resolved zero `pg`, `@debateai/db`, or `packages/db` paths.

### Fresh verification

- Focused dependency architecture wrapper: `4/4` on each of three anchored runs; receipts `run=1 rc=0`, `run=2 rc=0`, `run=3 rc=0`.
- Corrected FIX-05 neighbor cluster: `2` files, `8/8`.
- Original C1 behavior slice (four unit cases plus the retained root graph): `5/5`, with the three new package-boundary cases explicitly skipped by the name filter.
- Adjacent FIX-05 + provider + FIX-03 kinds/projection/repair/runner-artifact set: `7` files, `65/65`.
- Broader provider set (provider core, API discovery, dev CLI panel, real panel, and both provider-topology architecture files): `6` files, `26/26`. A restricted run stalled at local child-process boundaries and was terminated; the local-process-enabled rerun completed in under two seconds and is the valid receipt.
- `pnpm generate:contract`: exit `0`; the exact three generated paths and all three blob hashes were unchanged, the global tracked-name set stayed at the exact four authorized edits, and the index stayed empty.
- `pnpm typecheck`: exit `1` only for the pinned baseline; exactly `8` diagnostics, all in `tests/unit/s14-ui.test.ts`, first diagnostic the recorded `TS2307`, FIX-05 diagnostics `0`.
- Positive resolution trace: compiler status `1` from that same pin, `5625` absolute successful resolutions, escaped paths `0`, diagnostics `8`, FIX-05 diagnostics `0`.
- `pnpm audit:text-bytes`: exit `0`, `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `pnpm audit:source`: exit `1` with exactly the five recorded FIX-01 environment-read rows (`install/api.ts`, `install/runner.ts`, `install/scheduler.ts`, `runtime/config.ts`, `runtime/index.ts`) and no provider row.
- `pnpm audit:architecture`: exit `1` only at the recorded missing retired `web/package.json` baseline; the exact provider-edge assertion is independently GREEN.
- `git diff --check` and pre-commit cached diff check: exit `0`.

### Preservation and repository state

Pre/post identities all match:

- provider source blob: `47ed0bba3ffb7bbfdd6e898da5f4447206c0156d`;
- tracked obs-capture index digest: `24d9378b9046c66554cd103674cc1f7022681c7f809d52423ccc68a44f4ec094`;
- frozen SPEC blob: `c14c53a0d315ba0bf82f38a9f252d24243f6bd7f`;
- frozen PLAN blob: `11694950b68f057f7df915f8b0aa70322a460263`;
- DECISIONS blob after the authorized docs cherry-pick: `2b5895b384f11bd344e71ecf1d52ca2a85284ed8`;
- live Task 5 plan blob: `62a7cb175e7aabd1fca1bae07cf8401396eb8ecc`.

The mandatory transition receipts were `pre_stage_unstaged=exact_four pre_stage_index=empty`, then `post_stage_staged=exact_four post_stage_unstaged=empty commit_paths=exact_four`, then `post_commit_tracked=empty post_commit_index=empty`. This report and the existing Sol review remain untracked and unstaged. The branch/worktree is preserved for a fresh root-dispatched Sol review.

### Pending gates and concerns

- RP-0 ratification/transcription did not occur.
- SPEC §5 live acceptance did not run.
- C1 PASS, V acceptance, and Done are not claimed.
- The only environment concerns are the recorded source/architecture baselines and the need for local-process/network permissions for production deployment, contract generation, and dev-panel tests; all valid reruns completed with the expected exact evidence.
