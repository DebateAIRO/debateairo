# FIX_P2_DEGRADED evidence

## Read-only diagnosis

The completed LIVE_P2 integrated capture at product revision `606b2eabea1dc9212159e53c193cf69655424e77` reports one failure among 25 files: `tests/integration/support-degraded.test.ts` expected `REFUSE_SAFETY` with model usage `3/4/0.001`, but received `NO_SOURCE`. The remaining 24 files passed; totals were 977 passed, one failed, and one todo.

The failure is confined to a stale test fixture:

1. `tests/integration/support-degraded.test.ts:23-28` constructs `ENTRY` without `modelProjection`.
2. `tests/integration/support-degraded.test.ts:36-42` supplies a snapshot lookup, which makes `createSupportAnswerService` select its structured path at `apps/api/src/support/answer.ts:200-212`.
3. `packages/support-kb/src/context.ts:165-167` excludes structured entries whose `modelProjection` is absent.
4. The ranked context therefore has no source. `apps/api/src/support/answer.ts:223-250` returns `NO_SOURCE` before invoking `modelFor.complete`.
5. Because no transport occurs, the returned value has no completion usage and cannot clear the degraded relay state. This exactly explains every mismatched assertion at `tests/integration/support-degraded.test.ts:57-65`.

The actual production corpus does not have this gap. ATTEST_P2 loaded the final corpus in strict reviewed-recovery mode and admitted 36/36 entries with projections, yielding 18 reviewed bilingual pairs. The test bypasses that loader with an `unknown as LoadedHelpCorpus` cast, so this observation does not support a runtime regression.

## Approved exact correction

After LIVE_P2 exits and root grants the heavy and scoped Git leases, add one explicit, safe `modelProjection` string to the shared `ENTRY` fixture in `tests/integration/support-degraded.test.ts`. Intentionally leave `fallback` absent. Do not edit production modules or any assertion.

That correction exercises the intended boundary:

- the entry passes current projection admission and ranks as a source;
- the model transport runs once;
- `apps/api/src/support/response-policy.ts:254-255` rejects the credential-bearing draft at the text screen;
- because the fixture intentionally has no reviewed fallback, `apps/api/src/support/answer.ts:335-351` returns `REFUSE_SAFETY`, preserving the reviewed-recovery no-fallback branch;
- `apps/api/src/support/answer.ts:344` marks the successful transport available;
- `apps/api/src/support/answer.ts:365-374` preserves the actual `3/4/0.001` usage in storage and the response.

The correction preserves the distinction between no source and a successful but screened model draft. It does not accept `NO_SOURCE`, remove an assertion, add a fallback that would change the expected outcome to `ANSWER_GROUNDED`, change runtime behavior, or relabel the existing LIVE sample.

## Current custody

- Product/source during diagnosis: clean at `606b2eabea1dc9212159e53c193cf69655424e77` / `446c685e977104ecf2b0b5ee0519f7123968429f`.
- Commands during diagnosis: read-only file, Git, ticket, and completed-log inspection only.
- Root later consumed LIVE_P2, froze its outputs at `719289ec5868d7ec7dc0a4d554366f2ccfa0ebd5`, and explicitly granted the sole heavy and scoped one-test Git leases.

## RED, correction, and GREEN

The targeted test was captured before mutation in `FIX_P2_DEGRADED-target-red.log`, SHA-256 `80345a8adc78d11a7b0265e45d6fa96f4e9868896cc7afcf90209e184f07def3`: one failed and seven skipped. It reproduced the exact `NO_SOURCE` outcome against the stale fixture.

The correction added only:

```ts
modelProjection: "Open the new debate page to start your first debate."
```

The fixture still has no `fallback`, and every existing refusal, model usage, persisted accounting, and degraded-health assertion is byte unchanged. The full affected file capture `FIX_P2_DEGRADED-file-green.log`, SHA-256 `b013fde167ba1b1f3b95195d839e77007bc0c6f0420dda23d6b7df9e2fcec6d1`, passed all eight tests.

The correction is local commit `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`. `FIX_P2_DEGRADED-final-custody.log`, SHA-256 `107a26a018f4ff6b6fcbde8a096b2c8255f2fd6055f2e7bc938b7ec7e954f655`, proves the diff from `606b2eab` contains only `tests/integration/support-degraded.test.ts`; all tracked `apps`, `packages`, `acceptance`, `compose.dev.yaml`, and `deploy` paths compare equal. The final file is SHA-256 `0559fdf2dceeadac10b7d544094ff02e0b84067102fb2e8787c24bce200d0df6`, 10,834 bytes, and the product worktree is clean.

No preview action, actual model/provider sample, browser, HTTP traffic, runtime reload, content change, or broad/typecheck rerun occurred. LIVE_P2's finite sample remains correctly attributed to revision `606b2eab`; this later test-only commit does not relabel it. REV1_P3 owns the final finding disposition.
