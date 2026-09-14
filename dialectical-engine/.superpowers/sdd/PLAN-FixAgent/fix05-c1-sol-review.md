# FIX-05 C1 — fresh independent review

Review range: `dc0d838136c9a75659744ced52628a19e8c2398b..7459c3fc9709054c532942e063b46cf9fd8301ff`

## Verdicts

- **SPEC (C1 behavior): PASS.** The two exhausted-call paths emit once after the retry loop; retry success emits nothing; the emitted payload is a closed enumeration-only shape; run/work-item are inherited from ambient context while attempt/ledger are declared from the terminal attempt; and the loaded provider graph contains neither `pg` nor `@debateai/db`.
- **CODE QUALITY: FAIL.** One P2 package-boundary defect remains: the new runtime import is not declared by `@debateai/providers`.
- **Ready for the later RP-0/V gate: NO as a candidate.** C1 behavior is ready, but the P2 dependency edge must be resolved under expanded authority before handoff. The frozen C1 surface does not authorize the required manifest/lockfile/architecture-edge changes.
- **FIX-05 Done: not claimed.** RP-0/S02 registry admission and V's five live acceptance steps remain pending. The current honest durable state is the minimized fallback, not the registered provider code.

## Findings by priority

### P0

None.

### P1

None.

### P2 — `@debateai/providers` imports capture without declaring the runtime dependency

`packages/providers/src/index.ts:4-9` now imports `declaredRef`, `emit`, `getObsContext`, and `runWithObsContext` from `@debateai/obs-capture`, but `packages/providers/package.json:1` and the `packages/providers` importer in `pnpm-lock.yaml` still declare only kernel, register, ledger, and zod. The architecture allowlist also still defines the provider edges as kernel/register/ledger only.

Fresh reproduction in a disposable directory:

1. `pnpm --filter @debateai/providers deploy --legacy --prod <temp>` completed.
2. Importing the deployed `src/index.ts` with the workspace's TSX loader failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@debateai/obs-capture'`.
3. The same import from a disposable production deployment of `@debateai/runner` succeeded because runner independently declares `@debateai/obs-capture`. That limits current blast radius and calibrates this as P2 rather than P1, but it does not repair the provider package's direct dependency contract.

The committed import-graph test runs from the workspace root, whose devDependencies contain `@debateai/obs-capture`; it therefore cannot detect the missing direct edge. Before later gate handoff, an authorized owner should add the provider manifest dependency, regenerate the lockfile, authorize/update the architecture edge, and add an isolated package-resolution assertion. Those files are outside the frozen C1 write surface, so this review did not modify them.

### P3

None.

## Independent C1 behavior review

- Exactly-once placement: `emitProviderExhaustion` has one internal `emit` call and exactly two call sites, both after the attempt loop immediately before the two exhaustion throws.
- Transport exhaustion: three failed attempts produce one envelope with `attempt_count: 3`, the final attempt UUID, and the final ledger UUID.
- Content exhaustion: the terminal content rejection produces one envelope with its final attempt and rejection-ledger UUID.
- Retry-success neighbor: one failed attempt followed by success performs two provider/ledger attempts and produces no provider envelope.
- Context provenance: the fixture deliberately makes `request.runId` differ from the ambient run and makes `subjectItemId` non-UUID text. Captured run/work-item match only the ambient declared references; attempt matches the terminal ledger attempt; ledger matches the terminal ledger reference.
- Closed payload: the exact payload keys are `capture_point`, `code`, `disposition`, `source`, `taxonomy_class`, and `template_parameters`; the only template parameter is numeric `attempt_count`. The helper contains no request packet, raw text/artifact, parse error, subject item, or request run input.
- No free text: question, raw provider payload, and parse-error canaries are absent from the captured envelope. The pre-RP-0 shared-redactor check minimizes to `self|CAPTURE_SELF|OBS_CAPTURE_SELF|true`, preserves the four declared identities, and clears template parameters.
- Capture failure/off behavior: capture rejection cannot replace the provider error, and the retry-success value remains equal to capture-off behavior. The added capture work has no await, retry, deadline, or transport mutation.
- Provider import graph: three fresh traces loaded the capture root/core modules and loaded zero `pg` and zero `@debateai/db`/`packages/db` modules.

## Fresh test evidence

- Focused command, fresh three times: `pnpm vitest run tests/unit/fix05-provider-exhaustion.test.ts tests/architecture/fix05-import-graph.test.ts` -> **5/5, 5/5, 5/5**.
- Claimed adjacent set: FIX-05 + provider neighbor + FIX-03 kinds/projection/repair/runner artifact -> **62/62** across 7 files.
- Broader provider set: provider core, API discovery, dev CLI panel, real panel, and provider-topology architecture checks -> **26/26** across 6 files.

## Fresh mutant evidence

All product mutations were applied only to `/private/tmp/fix05-mutants.7CRMfW`, never to the reviewed worktree.

- Inside-loop transport emission: focused suite failed **2/5**; three transport failures produced four envelopes, and failure-then-success produced one envelope instead of zero.
- Leaked parsed/free-text field: adding `parsed_detail` carrying the planted parse canary failed **1/5** at the closed payload-key assertion.
- Dropped ambient run: skipping `run_ref` inheritance failed **2/5**, independently on both transport exhaustion and content exhaustion.
- Restoration: disposable product SHA-256 returned to `71cfc66fce147759d940a53cbf355121b2c45dfeedd761f29f980cd8146db861`, byte comparison against the reviewed source returned equal, and the restored focused suite passed **5/5**.

## Type, source, text, static, and scope checks

- `pnpm typecheck` freshly returned the pinned unrelated baseline: exit 1 with exactly 8 diagnostics, all in `tests/unit/s14-ui.test.ts`; FIX-05/provider diagnostics were 0.
- A fresh `tsc --traceResolution` parse observed 5,625 absolute successful resolutions and **0 paths outside this worktree**, with **0 FIX-05 diagnostics**.
- The generated contract tree equals HEAD. The generator was not rerun because this review was explicitly read-only.
- `pnpm audit:source` returned only the five recorded FIX-01 environment-reading baseline rows under obs-capture install/runtime; no FIX-05 row was added.
- `pnpm audit:architecture` still aborts on the recorded unrelated missing retired `web/package.json` baseline. The exact C1 range does not change that path or the audit implementation.
- Exact changed-file control-byte scan: **0 forbidden bytes**.
- `git diff --check dc0d8381..7459c3fc`: exit 0.
- Exact committed delta: **3 paths, 444 insertions** — `packages/providers/src/index.ts`, `tests/unit/fix05-provider-exhaustion.test.ts`, and `tests/architecture/fix05-import-graph.test.ts`. No capture, runner, scheduler, schema, migration, or frozen FIX-05 document changed.
- Frozen SHA-256 values remained: SPEC `926bb258ad9591b7d765b2ff34e67dc9fdabe2de7bd845bdb7748654195523a1`; PLAN `0c8182aa510841f290f585800961f20e4648b8ddb7953e50cd5e25ce348fdea7`; DECISIONS `6fc137c6e3dfc7c7ea97427c01e1270c99d52504b89059b0132daca694b0887c`.
- The supplied implementation report remained byte-identical at SHA-256 `622d4a6d968c9ee6e06ec2adb3623a523c56b0aacc8766f20671881d798d2db2`.
- Registry text check found zero occurrences of `PROVIDER_CALL_FAILED` or `PROVIDER_CONTENT_UNACCEPTED`; RP-0/S02 therefore remains pending exactly as declared.

## HEAD and tracked-state proof

- Resolved base: `dc0d838136c9a75659744ced52628a19e8c2398b`.
- Branch: `codex/oa-fix-05`.
- HEAD before and after review: `7459c3fc9709054c532942e063b46cf9fd8301ff`.
- HEAD/current blob equality: provider `47ed0bba3ffb7bbfdd6e898da5f4447206c0156d`; unit test `1b68ae80348da0d2f1e2102c8c63a8d6e9569c14`; architecture test `4a1943a2a2244255d8950b9bba6ed9121d979a4f`.
- Before creating this report, tracked-worktree diff vs HEAD returned 0 and index diff vs HEAD returned 0.
- After creating this report, fresh tracked-worktree and index checks still returned 0; this report is the only review write and remains untracked/unstaged alongside the pre-existing implementation report.
