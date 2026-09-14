# FIX-03 SPEC-v4 — C2 review correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no persisted row, production acceptance, or V attestation.

This file has higher precedence than `SPEC-v3.md` for the three C2 review findings only. Every other C2 rule and file limit in `SPEC-v3.md` remains unchanged. C3 and persisted-row proof remain deferred.

## Outer zone veto

1. Before nesting the task context, read the current context once with `getObsContext`.
2. Inspect only its own `zone_context` descriptor. Do not enumerate it, invoke a getter, or copy any outer field.
3. No outer context, no own `zone_context`, or an own data value of `false` means non-zone. An own data value of `true` keeps the zone veto.
4. A context read failure, descriptor trap, accessor descriptor, or non-boolean own value fails closed to zone true.
5. The nested non-zone task context has exactly the real `run_ref` and `work_item_ref` declarations. The zone form has those same declarations plus `zone_context: true`. Outer correlation refs never enter the nested context.
6. The real emitted entry must redact all six refs to `UNKNOWN:DECLARED_KIND_REQUIRED` when the outer zone veto is true or fails closed.

## Frozen terminal input

1. In the task catch, compute and freeze the complete `recordTerminalFailure` input before the first `emit` call.
2. Pass that same frozen object to `recordTerminalFailure` after capture.
3. A capture emitter may mutate the live error and throw. That cannot change the saved terminal input, its call count, or the exact caught object that the task throws.
4. C2 does not promise that every mutable field on the error remains unchanged. That would need a separate capture-snapshot contract because the synchronous emitter receives the live error object.

## Installer-order probe

The current ratified fatal-boundary installer has no direct `unhandledRejection` listener. The probe must assert `process.listenerCount("uncaughtExceptionMonitor") >= 1` and `process.listenerCount("unhandledRejection") === 0`. A direct rejection listener stops Node's normal crash, so restoring an expectation of one listener would restore the old defect. C2 changes only the fake module exports and this corrected assertion; it does not edit the installer.

## Review milestone

The rework is ready for review after the focused tests pass three fresh runs, zone and terminal-input mutants fail and are restored, adjacent/type/static/scope checks are recorded, and a new code commit contains only the three C2 files already named by `SPEC-v3.md`.
