# FIX-04 SPEC-v2 — per-slice immutable zone-delta authority

Status: FROZEN — V approved option B on 2026-09-05. This is successor planning authority for FIX-04 admission and the C1 zone guard only. It records no worktree creation, product edit, merge, push, production act, acceptance, veto, or Done claim.

This file has higher precedence than `SPEC.md` only for FIX-04 dispatch admission, R05's ZI-2 baseline, and acceptance step 6's base meaning. Every other requirement, file boundary, privacy rule, zone prohibition, acceptance step, and V-only Done gate in `SPEC.md` remains unchanged. The original `SPEC.md`, original `PLAN.md`, and every earlier decision row remain frozen.

`PLAN-v2.md` governs the admitted dependency composition and C1 guard. Product work for C2 and C3 remains held by section 7 of this successor because the reviewed dependency endpoint does not expose two interfaces required by frozen R03 and R07.

## 1. V ruling: ZI-2 is a per-slice delta invariant

ZI-2 proves that the named slice changed zero bytes in the semantically resolved zone-route-mount region across that slice's own integration boundary. It is not a mission-wide frozen-byte pin.

For an active FIX-04 worktree:

- `FIX04_BASE_REF` is the full 40-hex SHA of the immutable dependency-composition commit from which the admitted worktree begins;
- the base object is `FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts`;
- the comparison target is the worktree's `apps/api/src/index.ts`;
- `resolveZoneRouteMountRegion()` resolves the two sources independently; and
- the two resolved `region` strings and `contentHash` values must be equal.

At pre-merge review, the orchestrator records the full 40-hex `FIX04_TIP_REF` and repeats the same comparison as two immutable Git objects: `FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts` and `FIX04_TIP_REF:dialectical-engine/apps/api/src/index.ts`.

If V subsequently merges FIX-04, historical evidence uses two newly recorded full SHAs:

- `FIX04_MERGE_PARENT_REF`, the integration first parent; and
- `FIX04_MERGE_RESULT_REF`, the landed merge result.

The historical pair is `FIX04_MERGE_PARENT_REF:dialectical-engine/apps/api/src/index.ts` to `FIX04_MERGE_RESULT_REF:dialectical-engine/apps/api/src/index.ts`. The collected current-tree check remains baseline-free ZI-1 shape proof. A test never discovers `HEAD`, a merge base, a parent shorthand, a branch name, or an invocation-time ref as an unstated fallback.

The ratified historical S04 proof pair is exactly:

```text
base / integration parent: 7b3a30634fc45f7fe60571ccdfdd348e32b4c549
landed merge result:        3e91cf4222767d1eafc2c1dde8d336f87b8fc448
resolved region bytes:      1653
resolved region SHA-256:    bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d
```

That pair proves only that S04 did not alter the integration branch's zone-region bytes. It does not set FIX-04's base.

## 2. Exact reviewed dependency composition

The admitted FIX-04 composition has exactly two parents and no other slice endpoint:

1. `FIX04_AUTHORITY_REF`: the full controller commit that adds this `SPEC-v2.md`, `PLAN-v2.md`, and the single 2026-09-05 FIX-04 decision row. The normal authority report records the literal full SHA after commit. A read-only independent authority review must approve that exact commit before admission.
2. `FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`: the current reviewed FIX-01 endpoint. Its final review reports SPEC PASS and CODE QUALITY PASS for `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8..24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`; FIX-01 V acceptance remains pending.

The FIX-01 endpoint already contains `FIX03_PROJECTION_REF=6649fd7d809c6bc2ff21123d8b47c3d8a2b553e9`, the reviewed FIX-03 declared-kind projection required by FIX-04. Its `kinds.ts` blob equals the reviewed FIX-03 projection blob. Full FIX-03 endpoint `322b188649e5db7b1a264ceef2155f35470acd3e` is intentionally excluded because its runner task and provider-gateway changes are not FIX-04 dependencies.

The common ancestor of the controller lineage and `FIX01_REVIEW_REF` is `2b670d3059c60d7262cf655bd5d402c88100dff3`. That ancestor is an audit fact, not FIX-04's base. No FIX-02, FIX-03 runner, FIX-05, FIX-07, FIX-08, listener, UI, or production endpoint enters the composition.

At authority authoring time, the controller and FIX-01 endpoints carry the identical API blob:

```text
dialectical-engine/apps/api/src/index.ts blob: 174ee8ff60461eb4f5aa233441b0367bb3d174b7
resolved lines:                              738-769
resolved offsets:                            34835-36488
resolved bytes:                              1653
resolved SHA-256:                            bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d
ordered mounts:                              /v1/auth/register
                                             /v1/auth/verify-email
                                             /v1/auth/resend-verification
```

Line numbers and offsets are evidence only. The semantic resolver controls.

## 3. Admission commit and durable receipt

After the authority review passes, the admission task creates branch `slice/oa-fix-04` and worktree `dialectical-engine/.worktrees/oa-fix-04` from `FIX04_AUTHORITY_REF`, then makes one no-fast-forward composition merge with exact second parent `FIX01_REVIEW_REF` and exact subject:

```text
chore(obs): compose FIX-04 reviewed dependencies
```

The resulting two-parent merge commit is `FIX04_BASE_REF`. Before the first test or product edit, the orchestrator writes `.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md` with the exact full values of `FIX04_AUTHORITY_REF`, `FIX01_REVIEW_REF`, both `FIX04_BASE_REF` parents, `FIX04_BASE_REF`, the API blob id, the resolved byte count, and the resolved SHA-256. The report is the explicit admission receipt and is passed to every FIX-04 command. It is not a Git-discovered default.

Admission stops without an implementation edit if:

- either supplied ref is not full 40-hex or is not a commit;
- the reviewed authority result does not name the exact `FIX04_AUTHORITY_REF`;
- the merge conflicts, fast-forwards, has other parents, or changes the API blob during composition;
- the composed region does not resolve to the exact three ordered mounts, 1,653 bytes, and the SHA-256 above;
- branch `slice/oa-fix-04` or its worktree already exists; or
- the controller index is nonempty or contains any path outside the exact authority commit.

The admission task does not edit or stage the controller's pre-existing FIX-07 decision delta or any unrelated untracked path.

## 4. Active C1 guard contract

`tests/architecture/fix04-zone-region.test.ts` is the only local implementation authorized by this successor.

The test must:

1. require `process.env.FIX04_BASE_REF` to be exactly 40 lowercase hexadecimal characters;
2. verify that ref as a commit and load only `FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts` through `git show`;
3. read only the worktree's `apps/api/src/index.ts`;
4. call `resolveZoneRouteMountRegion()` independently on both sources;
5. require both results to be resolved with the exact three ordered POST mounts;
6. require equal region strings, byte counts, and content hashes;
7. print the explicit base SHA plus both byte counts and hashes;
8. prove in memory that one inserted region byte makes identity RED, insertion before the region leaves identity GREEN, and deletion of one ruled mount makes shape RED; and
9. never read, stat, list, import, or hash a zone file.

`tests/support/zone-boundary.ts` remains read-only. The stale landed `tests/unit/obs-l2-s04-zone.test.ts` is S04-owned and is not changed by FIX-04. Its historical repair must use the exact S04 pair in section 1 under separate test ownership.

Every C1 focused run receives the literal environment assignment. Missing, short, non-hex, nonexistent, or wrong base input is a failed run, never a skip or PASS. The focused command runs three times; the worst run controls.

## 5. Acceptance step 6 clarification

Before merge, acceptance step 6 treats the frozen labels `base` and `tip` as the recorded full `FIX04_BASE_REF` and `FIX04_TIP_REF`, respectively. The semantic resolver proof is primary; the textual diff grep remains a secondary visibility check and cannot replace byte identity.

After a merge, the equivalent immutable comparison expands to the recorded full `FIX04_MERGE_PARENT_REF` and `FIX04_MERGE_RESULT_REF`. Neither ref is inferred inside a test. This clarification changes no other acceptance step and transfers no acceptance authority from V.

## 6. Exact local write boundary under this successor

Allowed after admission and authority review:

- create `tests/architecture/fix04-zone-region.test.ts` only; and
- write the normal admission and implementation reports under `.superpowers/sdd/PLAN-FixAgent/`.

Read-only:

- `apps/api/src/index.ts`;
- `tests/support/zone-boundary.ts`;
- the reviewed FIX-01 endpoint and reports;
- all FIX-04 frozen and successor authority documents after admission; and
- every dependency source named in `SPEC.md` §7.

Forbidden under this successor:

- any product edit, including `apps/api/src/index.ts` and `apps/api/src/main.ts`;
- any `packages/**`, installer, registry, migration, helper, S04 test, zone, UI, runner, scheduler, or listener edit;
- any merge into an integration branch, push, production or service act, V acceptance step, veto, or Done claim; and
- any path not explicitly allowed above.

## 7. Reviewed-interface blocker for product work

The exact reviewed FIX-01 dependency does not yet provide the two capabilities frozen FIX-04 requires:

1. `emit()` and `captureHandled()` return `void`. The redactor generates `source_event_ref` internally from its private `sourceEventRef` callback. The input allowlist rejects a caller-supplied `source_event_ref`. FIX-04 therefore cannot return a caller-visible id that is provably equal to the persisted occurrence's `source_event_ref` as R03 requires.
2. Runtime creation fixes `component` to `{ process: runtime, package: "@debateai/" + runtime }`. The redactor input allowlist rejects `component`, so FIX-04 cannot persist `component.route_template` as R07 requires.

These facts are present at exact reviewed endpoint `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` in blobs `emit.ts=decdbb7be2cfeec8c24514058f355981f4bf484f`, `redactor.ts=0ffff01c90f996573a7c97f5817c7d3f775b8cd9`, and `runtime/index.ts=73a77fee4d66c9dd66b36b7ee0590c4ee5846bbf`.

No FIX-04 API-only implementation may fabricate the id, substitute `request.id`, predict the redactor UUID, write directly to obs tables, add caller metadata to an unapproved field, or edit the read-only capture package. Product C2/C3 work remains held until a separate V-approved successor names a minimal reservation or acknowledgement API, a safe per-event route-template projection, ownership, compatibility rules, and falsification tests. Option B does not imply that additional authority.

## 8. Claim boundary

This successor resolves B2 and authorizes the composition admission plus the C1 architecture guard. It does not repair S04's collected test, change a zone or product byte, satisfy R01-R04 or R07-R09, establish a persisted occurrence, run the dev stack, execute V acceptance, merge, push, or make FIX-04 Done.
