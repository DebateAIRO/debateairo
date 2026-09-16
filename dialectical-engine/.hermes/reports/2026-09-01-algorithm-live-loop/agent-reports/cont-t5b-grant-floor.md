READY — BUILD(CONT-T5B) · seat `cont-t5b-grant-floor` · pass 1 of 3 · comments read through: n/a (no board in this continuation)

# Self-report — BUILD(CONT-T5B), the `debateai_obs_view_owner` column floor

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

base `1681a0e3` · fix commit `50f37fb4490677545d4557c6fb1ff2956dff4c69` · model Opus 5 · one pass,
no rework · wall-clock ~22 min · no blocker hit.

---

## 1. The case, in one paragraph

A test pin said the observation view owner may read five columns of `core.run`. The product said it
could read twenty-five. The pin was right. The repair was four SQL statements. Everything expensive
about this task happened **before** those four statements: deciding *which* columns the narrowed
grant may contain. The packet answered that question with a rule that is wrong on this chain, and the
only thing that surfaced it was measuring `pg_depend` instead of reading the two migrations the packet
named. **The murder weapon was a correct-sounding scoping rule, not a missing REVOKE.**

## 2. The cause — named, not the symptom

**Cause: a privilege floor was specified by CITING A MIGRATION instead of by MEASURING THE READERS.**

`debateai_obs_view_owner` owns five views. None declares `security_invoker`, so it defaults to false
and PostgreSQL checks the OWNER's base-table privileges. The owner's grant *is* the chokepoint floor.
Every author who touched that floor specified it by writing the grant next to the view they had just
added:

| migration | statement | what it did |
|---|---|---|
| `0034_obs_foundation.sql:274-275` | `GRANT SELECT (5 cols) ON core.run` | the correct pattern — a column list |
| `0058_observation_safe_views.sql:23` | `GRANT SELECT ON core.work_item,core.run_progress_event` | table-level; widened 2 tables |
| `0060_observation_throughput_views.sql:23` | `GRANT SELECT ON core.run,core.work_item,ledger.raw_artifact` | table-level; superseded 0034 |

Each author was locally right (their own view worked) and globally wrong (the floor grew). Nothing in
the repo computes "what does this owner's view set actually read", so the floor drifted silently for
two migrations. The test pin caught it only because it pins `core.run`, by luck of which table the
2026-era author chose to pin.

**The upgrade this asks for:** a committed test that derives the owner's *expected* column set from
`pg_depend` over every relation the role owns, and equates it to
`information_schema.column_privileges`. That test writes itself (the query is in
§6), it is chain-wide, and it would have failed on `0058` the day `0058` landed — two migrations
before a human noticed. A pin per table cannot do this; a derived-set pin can.

## 3. What I nearly got wrong — the single most expensive thing in this task

The packet's outcome said: narrow `core.work_item` and `ledger.raw_artifact` **"to exactly what 0060's
own views READ"**. That sentence is a trap on this chain, and I was one command away from absorbing it.

Measured: `obs.work_item_liveness_v` is defined by **`0058:1-10`**, not by 0060, it is owned by the same
role, and it reads `claimed_by`, `claim_deadline` and `settled_artifact_ref` — three columns **no 0060
view reads**. Implementing the packet literally narrows `core.work_item` to the four columns
`obs.run_throughput_v` reads and breaks `obs.work_item_liveness_v`.

I did not have to reason about this, because I built it as mutant **M2** and ran it:

```
obs.work_item_liveness_v: FAILED 42501 permission denied for table work_item
```

and — this is the part that matters — **every suite stayed green**: the two guard rows 12/12, the two
`obs-agent-06` neighbours 8/8. A seat that implemented the packet's sentence and ran the prescribed
verification would have shipped a broken production view under a full green board.

Why I caught it: I ran a `pg_depend` query over *all* obs views before writing a line, rather than
reading the two migrations the packet's read-surface named. The packet's read-surface was a **complete
list of the files the finding mentioned and an incomplete list of the files the outcome depends on.**

**The general lesson, and the cheapest possible upgrade to the machine:** when a packet's outcome is
"narrow X to what Y reads", the seat must enumerate the readers *from the database*, never from the
migration the finding cites. A finding names the migration that broke it; it does not name the
migrations that depend on it.

## 4. What repeatedly cost tokens

1. **Reading prose to learn a fact the database would have said in one query (~10k tokens).** F1, the
   two `NOT UPDATED` comments and the `TOOLING-TRAPS` entry all narrate the same widening in English,
   and all three state the wrong cardinality: they say the owner reached **"all 18"** columns of
   `core.run`. Measured: **25**, and 25 is also what the RED diff prints. Three prose copies of a
   number, all wrong, none load-bearing. The `pg_depend` + `column_privileges` probe cost one run and
   produced the before-table, the after-table, the boundary rows and the view-liveness proof.
   **Upgrade: a finding carries a QUERY, not an adjective.** The remedy line in a security finding
   should be the SQL that measures the current state, so the next seat runs it instead of re-deriving
   it from three narrations.
2. **The read-surface as a line-number list (~4k tokens).** The packet named `0060`'s view as
   `~:24-32`. Measured, `:24-32` is the `ALTER VIEW` / `REVOKE` / `GRANT` block; the two views are at
   `:1-8` and `:10-19`. (The second `NOT UPDATED` comment carried the same wrong citation, so it
   propagated.) Every other constant the packet quoted was right — base commit, `0034:274-275`,
   `0060:23`, `packages/db/src/index.ts:769`, `ls migrations | tail` → 0061. One wrong citation in
   six is cheap, but it cost a `cat -n` of the whole file to re-anchor.
3. **Nothing else.** No debugging, no failed approach, no rework. The four SQL statements were right
   the first time because the column lists were measured first.

## 5. Dead ends nobody should re-derive

- **`REVOKE SELECT ON <table>` also drops the column-level privileges on that table.** So the fix is
  necessarily REVOKE-then-GRANT in that order, and the 0034 column list must be re-issued by the
  forward migration even though 0034 already granted it. Verified: after, `core.run` = exactly the 5.
- **A superuser `SELECT` through a `security_invoker = false` view still exercises the owner's floor.**
  The owner is `NOLOGIN` (`rolcanlogin=false`, pinned at `obs-l1-s01-foundation.test.ts:781`), so the
  obvious "connect as the owner" route is closed. Two routes work and both were used: query the view
  as anyone (the owner's privileges are checked), and `SET ROLE debateai_obs_view_owner` from the
  superuser pool for a direct per-column boundary read. No `configureRolePasswords` needed.
- **`GRANT`/`REVOKE` are outside `auditMigrationReplaySafety`'s keyword list entirely** (it knows only
  `ADD COLUMN`, `ADD CONSTRAINT`, `CREATE FUNCTION`, `CREATE [UNIQUE] INDEX` —
  `tools/orphan-audit/src/index.ts:613-633`). Its silence about `0062` is not evidence of
  replay-safety, exactly as the BUILD(CONT-T6) trap at `TOOLING-TRAPS.md:4665` warns. I proved
  replay-safety by re-applying the file's own bytes twice against the live chain and re-reading both
  the privilege table and the five views. That probe cost ~35 s and is the only thing that licenses
  the word "idempotent".
- **A scratchpad probe can drive this repo's real test database without touching the repo.**
  `pnpm exec tsx <abs path>.mts`, importing `tests/support/testDatabase.ts` and `packages/db/src/index.ts`
  by absolute path: the project's own files resolve their bare specifiers from their own directory, so
  no `node_modules` problem, no file written inside the write contract, and full `migrate()` fidelity.
  This is the tool the "measure before you speculate" law has been missing for database work.

## 6. What to upgrade — concrete, in priority order

1. **Ship the derived-floor test** (biggest security return in this area). One query, one assertion:

   ```sql
   SELECT tn.nspname, t.relname, array_agg(DISTINCT a.attname ORDER BY a.attname)
   FROM pg_rewrite r JOIN pg_class v ON v.oid=r.ev_class
   JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass
   JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
   JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
   WHERE pg_get_userbyid(v.relowner)='debateai_obs_view_owner' AND t.relkind='r' AND d.refobjsubid>0
   GROUP BY tn.nspname, t.relname
   ```
   equated to `information_schema.column_privileges` for that grantee. It is a *derived* pin: it
   cannot go stale when a view is added, and it fails the moment a table-level grant appears.
2. **Add `GRANT ... ON <table>` (no column list) to a role that owns a `security_invoker=false` view
   to the source audit's SQL rules.** The class is mechanically detectable in migration text.
3. **Make the packet's read-surface carry the DEPENDENTS, not only the culprits.** For any privilege
   or schema narrowing, the seat needs "every object that reads this". That list is a query, so the
   orchestrator can generate it rather than hand-curate it.
4. **Put the measured cardinality in the finding and nowhere else.** Three prose copies of "18" is
   three chances to be wrong and zero chances to be checked.

## 7. Turning this into a one-prompt machine

This task was close to one-prompt already: base verified, deps provisioned, RED reproducible in 5 s,
write surface exhaustive, outcome stated as a measurable end state rather than as a diff. The three
things that still needed a human-shaped judgement:

- **Scope resolution.** The packet said "0060's views"; reality said "the owner's views". A one-prompt
  machine needs outcomes phrased over the RUNTIME OBJECT ("every view this role owns"), never over the
  authoring file. Phrased that way, this task has exactly one correct answer and no judgement call.
- **What to do with the fourth class member.** `core.run_progress_event` is the same defect, from the
  same statement (`0058:23`), and sits outside the packet's three-table outcome. I named it and did not
  fix it, per the packet. A one-prompt machine should decide this ONCE, in the protocol, not per packet:
  either the outcome is "the class", or the packet enumerates the members it excludes and says why.
  Silence here forces every seat to re-litigate §3.2 against its own `allowed` list.
- **The refutation's second half.** M1 (the mutant the pin exists to catch) is mechanical. M2 (the
  mutant it must NOT catch) is where the packet defect actually surfaced, and nothing in the process
  told me which neighbour to build — I chose it because it was the column the packet's rule would have
  dropped. **Rule worth promoting: build the neighbour mutant out of the packet's own scoping rule.**
  If the packet says "exactly what Y reads", mutate to "exactly what Y reads" and see what breaks.
  That is the cheapest possible test of a packet's premise, and it is fully automatable.

## 8. Honest limits

- The three-run verdict, the neighbours, `typecheck` and `audit:source` were taken on bytes identical
  to commit `50f37fb4`; the target file was additionally re-run at the tip (12/12) to remove all doubt.
- I did not run the full suite. `tests/integration/database.test.ts` (the shared-database neighbour)
  passed whole-file, 98/98 across the four neighbours, so the `TOOLING-TRAPS.md:1748` ordering hazard
  does not apply — I added no test.
- `audit:source` exits 1 with three blocking rows, all pre-existing (`packages/obs-capture/install/*`,
  = Task 5's F3). `0062` adds none; no `migrations/` row appears at all.
