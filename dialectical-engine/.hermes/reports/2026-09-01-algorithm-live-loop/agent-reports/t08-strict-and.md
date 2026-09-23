REWORK READY FOR REVIEW — T8 r3 · comments read through: t08-codex-r2-2026-09-01
report sha256: c256385664678e764120389f8b5ad752b6e412072e5058bb5b663d9b7839ede9

# T8 STRICT-AND r3

Base: `71afca1a728f26713a8137ffcd463f1cf45228b7`. Branch `lane/t8`.
Commits: `a438084` (r1) · `d2a521d` (r2) · `c309f80` (r3). Never pushed, never merged.
Report hash reproducing command: `tail -n +3 <this file> | shasum -a 256`.

Answers codex r2 (`agent-reports/T8-codex-r2.md`), 0 blocking / 3 non-blocking:
**N1 fixed with measured discrimination · N2 corrected · N3 reconciled.**
This is the last rework round; residue is packaged V-ready below rather than
opening r4.

## N1 — the post-upgrade door assertion was a false positive. VERIFIED, FIXED.

**Verified before fixing.** `logs/t08/green-t8-upgrade.log:692` reads
`ERROR: column "at_seq" of relation "node_strength_record" does not exist`, and
the test reported PASS. `node_strength_record` has no `at_seq` column
(`migrations/0000_s00.sql:201-210` plus its later `ADD COLUMN`s). **The test
passed on a typo.** Codex is right, including the secondary point that
`gen_random_uuid()` would have failed the `core.node` foreign key before the
CHECK was ever consulted.

### The fix, and what tightening it immediately exposed

Split into one test per door; the strength-record door now seeds a **real**
`core.node`, inserts **only columns the table has**, and requires the error to
**name** `node_strength_record_operator_used_check`. Each door carries an
**ACCEPTED control** — the same row differing only in the property under test —
so no other column, the node FK, or the operator-pair CHECK can be what failed.

Tightening the assertion surfaced **two further fixture defects the loose form
had been swallowing**, which is the substance of the finding:

1. `core.node`'s `depth` / `sibling_ordinal` / `materialized_path` defaults are
   dropped by a later migration → NOT NULL violation.
2. A root node must be `depth 0 / ordinal 0 / path '0'` or the structural trigger
   at `migrations/0002_s02.sql:58` rejects it.

Under `.rejects.toThrow()` with no argument, **all three defects were
indistinguishable from success.**

### DISCRIMINATION — measured, both forms under the SAME mutant

Mutant M14: `0051` narrows nothing — the operator CHECK still admits the repealed
value. This is precisely the regression the assertion exists to catch.

| assertion form | result under M14 | log |
|---|---|---|
| **r3 hardened** | **`1 failed \| 7 passed`** — the door test correctly FAILS | `logs/t08/red-t8-n1-hardened-vs-m14.log` |
| **r2 as filed** | **`8 passed`** — passes anyway, on the `at_seq` error | `logs/t08/red-t8-n1-oldform-vs-m14.log` |

The r2 assertion could not have caught a migration that forgot to narrow the
operator domain. The r3 one does.

### GREEN

```
$ npx vitest run tests/integration/t8-upgrade-migration.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

**LOG: `logs/t08/green-t8-upgrade-hardened.log`** — and **zero** stray schema
errors inside passing tests (the r2 log carried four).

### Corrected RED-pass characterization (codex's last N1 clause)

The r2 report called all three passes in the B1 RED "fixture-validity arms". That
was wrong. Corrected: **two** were fixture-validity arms (`0050` genuinely accepts
each legacy shape); the **third was this already-green false positive**, which
passed for a reason unrelated to what it claimed to test. The B1 RED
(`logs/t08/red-t8-upgrade.log`, `4 failed | 3 passed`) remains valid evidence for
B1 — the four failures were real and are what the r2 fix addressed.

### Scoping choice a reviewer should see, not infer

The served-number door names `served_number_event_reason_matches_status`, which is
the constraint PostgreSQL actually reports. **No row can isolate
`served_number_event_status_check`**: every status outside `PRESENT`/`EVICTED`
also violates the reason pairing. The status domain is pinned by the
`convalidated` assertion instead. Deliberate, not an oversight.

## N2 — "exactly the rows with no strength record" was FALSE. CORRECTED.

Codex is right and I verified it at the base pin. `tests/unit/scoring.test.ts:235-253`
at `71afca1` evaluates an **all-judged** parent under the repealed operator and
expects a returned root strength with `operatorUsed: "strict-and"` — such
strengths flow to persisted `node_strength_record` rows. My r2 report generalised
a true property of the *withholding* branch into a false equivalence over *every*
repealed-operator receipt.

**The corrected formulation, which is what the argument actually needs:**

> A strict-**WITHHELD** parent **can** leave the frozen receipt with no
> `node_strength_record` row at all. Therefore `operator_used` is **not a
> complete proxy** for the operator vocabulary stored in
> `ledger.propagation_run.operator_by_parent`. Incompleteness alone defeats the
> proxy; no universal claim is required.

The receipt-only fixture in the upgrade test proves the **proxy's incompleteness**
(one no-strength-row example), not a global row equivalence — the test's comment
now says exactly that. **The migration never inherited the error**: preflight (b)
scans every `operator_by_parent` array for any non-`accumulate` value, with or
without a corresponding strength row.

The false sentence is left **visible and marked corrected** in the `## r2` section
of the self-report rather than silently rewritten.

## N3 — findings table reconciled against D16 and J11

I had not re-read `DECISIONS.md` after r1 and carried both findings as open
through r2. Both were ruled before codex's r1 review.

| id | status | disposition |
|---|---|---|
| **F-T8-1** | **WITHDRAWN (r2)** | The packet's runner anchor was accurate; base `:2031`'s `...strength` spread is the rival-field persistence site. |
| **F-T8-2** | **RESOLVED — ADOPTED as D16** (V may veto) | D16 extends D14's trigger to lanes whose diff touches `packages/contract` or `packages/kernel`, or any package the Next apps' tsconfigs consume type-level: both surface gates run and are reported with base classification regardless of whether the lane edits those apps. Exactly the hole this lane hit. Root typecheck's own blindness stays V's repo-level question as **F16**. |
| **F-T8-3** | **RESOLVED — J11** (V may veto) | J11 rules the J5 completion class **symmetric**: a lawful vocabulary/union change in either direction authorizes exactly the compiler-forced completions in exhaustive consumers (one line/branch each, ui and web alike); `"web/ ONLY by T2"` is not breached by a forced completion. Codex r1 verified the web/ diff is exactly the forced branch and nothing more. |
| **F-T8-4** | open, non-blocking | `orphan-audit` hard-codes the arithmetic export set three times and `apps/replay` mirrors it twice more — five hand-maintained copies of one fact. |
| **F-T8-5** | open, non-blocking | `register.test.ts` sample-value swap; confirmed non-discriminating in the r2 retrospective. |
| **F-T8-6** | **board F23** (renumbered), non-blocking | Frozen JSONB receipts are schemas the type system does not check: `operator_by_parent` is read back into the narrowed vocabulary behind only an `Array.isArray` guard (`packages/valuation/src/index.ts:456,503`). `0051` preflights it; the general hazard stands for every future vocabulary change. Packet-clause half already active. |
| **F-T8-7** | **NEW**, non-blocking | `.rejects.toThrow()` with no argument appears across the suite as a rejection oracle. In this lane one such assertion hid three separate defects. Worth a repo-wide sweep: a rejection test should name its rejector and carry an accepted control. |

## SUITES (r3)

Base pins remain my own at `71afca1` (D12).

| gate | base | r3 | verdict |
|---|---|---|---|
| root `pnpm run typecheck` | — | **exit 0, 0 errors** | PASS · `typecheck-root-r3.log` |
| `tsc -p apps/ui/tsconfig.json` | 1 error | **1 error** | PASS-EQUAL — pre-existing `apps/ui/app/layout.tsx(3,8) TS2882` · `typecheck-ui-r3.log` |
| `tsc -p web/tsconfig.json` | 1 error | **1 error** | PASS-EQUAL — pre-existing `web/app/layout.tsx(3,8) TS2882` · `typecheck-web-r3.log` |

Both surface gates re-run and reported per **D16**, though r3's diff touches
neither `packages/contract` nor `packages/kernel`.

### Cluster S02-C4b — DB: receipt schema + upgrade transition, three-run law

ONE command: `npx vitest run tests/integration/graph-database.test.ts tests/integration/t8-upgrade-migration.test.ts`

| run | host load (1m) | result |
|---|---|---|
| 1 | 13.30 | `22 passed (22)` |
| 2 | 26.35 | `22 passed (22)` |
| 3 | 30.37 | `22 passed (22)` |

**WORST RUN = `22 passed (22)`** (14 from-empty + 8 upgrade). Logs:
`r3-cluster-c4b-run{1,2,3}.log`.

**Stray-error audit, since N1 was exactly this class.** Each r3 run's log contains
4 database errors printed inside passing tests. All four are
`graph-database.test.ts`'s own deliberate negative-path assertions (three `edge`
foreign-key guards and one `node.claim_text` NOT NULL guard) — the **identical
set** appears in `logs/t08/integration-graph-db.log`, which predates my upgrade
test. **Zero originate in `t8-upgrade-migration.test.ts`**, which contributes 0
when run alone (`green-t8-upgrade-hardened.log`).

### Cluster S02-C4a — static + unit (9 files)

`2 failed | 70 passed (72)`, unchanged (`r3-cluster-c4a-run1.log`). Both failures
are the pre-existing `tests/architecture/scaffold.test.ts` obs-capture pair,
`diff`-identical to my base pin, already recorded by J10 for T1.

**DECLARED: run ONCE this round, not three times** — no file in that cluster
changed in r3, and its r2 three-run evidence (`2 failed | 70 passed` ×3) stands.
Stated rather than presented as a fresh three-run verdict.

### Full suite

`D15-DEFERRED / CANNOT-ASSESS — authoritative pnpm test is judge-run serially on
the integration branch after the applicable merge batch`

Host load through r3: **13.30–30.37**, other lanes' vitest processes resident.

## REFUTATION — r3

| mutant | what it does | fires | isolated? |
|---|---|---|---|
| **M14** | `0051` leaves the operator domain admitting the repealed value | **`the strength-record door REJECTS the repealed operator`** | yes — 7 of 8 pass; the served-number door correctly does NOT fire, since M14 does not touch the reason pairing |

Plus the direct old-vs-new comparison under M14 in the N1 table above, which is
the discrimination codex asked for.

r1's M1–M9 / N1–N2 and r2's M10–M13 were not re-run: nothing they target changed
in r3. **Declared gap, per my own r3 lesson:** the r2 door assertion shipped
without a mutant at all — the refutation duty is per-assertion, not per-round, and
I had applied it per-round. M14 closes it.

## COMMITS

```
c309f80  T8: harden the post-upgrade door assertions (r3, codex r2 N1)
d2a521d  T8: close the upgrade transition and strengthen the exports oracle (r2)
a438084  T8: remove strict-and, full surface (S5-2, goal 119-128)
```

r3: 1 file (`tests/integration/t8-upgrade-migration.test.ts`), test-only — no
shipped source, no migration, no other test moved. **Not pushed. Not merged.**

## RESIDUE — V-ready, not r4

Nothing blocking. Three non-blocking items remain open and are packaged rather
than carried into a fourth round (law 2.3):

- **F-T8-4** — five hand-maintained copies of the arithmetic export set.
- **F-T8-5** — cosmetic, disclosed, non-discriminating.
- **F-T8-6 / board F23** — frozen JSONB receipts as unchecked schemas. Closed for
  T8 by preflight (b); the general hazard is a standing enumeration-checklist item.
- **F-T8-7** (new) — argument-less `.rejects.toThrow()` as a repo-wide oracle
  weakness, evidenced by this lane.

Self-report `## r3`: `agent-reports/t08-strict-and-self.md`, written before this marker.

comments read through: t08-codex-r2-2026-09-01
