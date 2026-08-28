# P4-13 Grok 4.6 verdict

Review session: `01a03cf4-c616-7fe0-8593-ad62d7df146e`

Final verdict: **GREENLIGHT**

## Initial BLOCK

Grok found two evidence defects in the first restored corpus execution:

1. The database/filesystem zero-call counters were disconnected parent-local variables. `startObservationRelay` accepted the callbacks but never required or referenced them, so deleting a callback would leave GREEN and the claimed capability mutation was vacuous.
2. `SECRET-01` checked six forbidden variables individually but did not pin the complete child environment, so an unruled new locator could be added without failing the case.

The first review hit Grok's 12-turn cap before emitting a verdict. The same session was resumed for the verdict; no second review was started.

## Repair

- Child-requested `DATABASE` and `FILESYSTEM` capabilities now require their matching trap to be installed at the live adapter parse boundary.
- Baseline execution intentionally leaves the traps inert.
- `MUT-DATABASE-CAPABILITY` invokes a throwing installed trap and makes `DB-01` return 400 instead of 200.
- `MUT-FILESYSTEM-CAPABILITY` invokes an installed trap that changes the owned outside-scratch sentinel from `UNCHANGED` to `MUTATED`.
- `SECRET-01` pins the exact child environment after excluding only macOS's injected `__CF_USER_TEXT_ENCODING`, including ruled maker locator and scratch `PWD`/`OLDPWD`.
- `DB-01` pins the exact common child-environment key set and exact one-argument prompt argv.
- The execution record and review packet were corrected to describe these live oracles rather than zero-call counters.

## Final Grok verdict

> **GREENLIGHT**
>
> The BLOCK items are closed. Child-requested `DATABASE` / `FILESYSTEM` now fail closed unless the matching trap is installed. GREEN leaves those traps inert: `DB-01` stays HTTP 200, `FS-01` keeps the owned sentinel at `UNCHANGED`. Dispatch is a live seam: invoking the DB trap throws and the relay turns 200 into 400; invoking the FS trap rewrites the sentinel to `MUTATED`.
>
> `SECRET-01` pins the complete child environment after excluding only `__CF_USER_TEXT_ENCODING`, including the ruled maker locator and scratch `PWD`/`OLDPWD`. `DB-01` pins the exact common-key set, so a database locator cannot hide in leftover keys.
>
> The rest of the corpus still hits the real HTTP, judgement, and Claude/Grok argv seams, and the execution record keeps the local-fake-relay honesty limit. No bounded-scope P0/P1 remains.

Final local evidence:

- complete corpus: `11/11`;
- affected relay/model/judgement/corpus gate: `55/55`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0;
- corpus execution test SHA-256: `7dbcb83ec68e7f69d6923c4f23ec1e973a58dbe4e2f2f02e3b3e259dc69009ec`;
- execution record SHA-256: `68f7c6af0079ac11e0267c65742d6a0b7a294147c2157860d99eeed7025d2b7f`;
- review packet SHA-256: `d751ac4eb7ace2d43fe7e30048a0f622a56a2addd5c8e0dc78f7ea6357e04276`.
