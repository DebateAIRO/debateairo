# FIX-03 SPEC-v2 — C1 declared-kind projection correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no production acceptance or V attestation.

This file has higher precedence than `SPEC.md` for FIX-03 C1 only. The ratified kind list and projector rules remain those in `L2-ADDENDUM-2-DECLARED-KINDS.md` §§2–4. All other FIX-03 requirements remain unchanged and deferred.

## C1 scope

Allowed product files:

- `packages/obs-capture/src/kinds.ts`
- `packages/obs-capture/src/redactor.ts`, region `correlation-projection` only, as defined by the addendum §4.3 R1–R5

Within that redactor region, C1 may capture `entry.ambient_context_ref` once through a
non-throwing guard, add the captured value to the `fallback(ambientContext)` signature,
and pass the same local to every fallback and success `build()` call. These exact
expressions supersede the addendum §4.3 byte freeze. No other redactor expression is
opened by this correction.

Allowed tests:

- `tests/unit/fix03-kinds.test.ts`
- `tests/unit/fix03-projection.test.ts`

No architecture test is part of C1. Runtime import shape is proved by a command receipt. `packages/obs-capture/src/runtime/**`, scheduler files, runner files, database files, manifests, lockfiles, and all other tests stay unchanged.

## Corrected C1 rules

1. The six kinds are exactly `run`, `work_item`, `node`, `attempt`, `ledger_entry`, `at_seq`, in that order. The list is closed.
2. The six durable fields are always present. If `zone_context` is true, every field is exactly `UNKNOWN:DECLARED_KIND_REQUIRED`; no supplied ref survives.
3. A field accepts only its paired kind. A bare value, an unknown kind, a lawful kind in the wrong field, a malformed declaration, or a value that fails its shape veto yields the same sentinel.
4. `NOT_APPLICABLE` requires an own `not_applicable: true` property and no `value` property. Silence is unknown, not absence.
5. Only own properties count. The projector is pure, total, and non-throwing. It returns six strings on every input.
6. UUID kinds accept only canonical lowercase RFC-4122 UUID text. `at_seq` accepts only a positive canonical decimal integer string no larger than `Number.MAX_SAFE_INTEGER`. Accepted values are copied byte-for-byte.
7. `kinds.ts` has one type-only import from `./context.js` and no runtime import.
8. C1 does not seed runner context. Later seams must use `runWithObsContext` with declared `run_ref` and `work_item_ref` objects. A Hatchet retry ordinal belongs only in `attempt_index`; it is never an `attempt_ref`.
9. A nullish entry or a throwing `ambient_context_ref` getter returns the minimized fallback. The ambient property is read at most once. A captured lawful declaration still projects on every later fallback path.

## C1 milestone

C1 is ready for review when both unit files pass three fresh runs, the named mutants fail and are restored, type/static/scope receipts are recorded, and the C1 commit contains only the four allowed files. This is not FIX-03 Done. V acceptance stays deferred.
