# T8 self-report — seat t08-strict-and (Opus 5, PROGRAMMING loop)

## r1

Murder-case format. Causes, not symptoms; every finding priced.

---

### 1. The one thing that made this lane cheap: the packet ordered enumeration BEFORE editing

The packet's "enumerate the CLASS first" clause is the reason this lane did not
need a rework round. Concretely, the up-front enumeration (5 greps, ~4 minutes)
found **three deletion sites the packet's own anchor list did not name**:

| site the packet did not name | what it would have cost |
|---|---|
| `tools/orphan-audit/src/index.ts:81,87,89` hard-codes `["agg","product","σ"]` **three times** as the expected arithmetic export set | deleting `product` breaks 6 architecture test files; found at edit time this is a mid-lane surprise, found at review time it is a round |
| `apps/replay/src/index.ts:2,6,85` mirrors the same symbol list in a runtime receipt (`REPLAY_ISOLATION_PROOF`) that a test pins by value | same |
| `packages/contract` + `packages/serve` + `migrations/0000` carry the WITHHELD number slot whose ONLY lawful reason is the strict-and literal | the DoD grep would have failed at the end, after the "real" work was done |

**PRICE OF THE COUNTERFACTUAL:** the TREL lane paid 2 rework rounds for exactly
this class ("r1/r2 were one bug class fixed instance-wise"). The rule as written
into the packet converted that into ~4 minutes. **This clause should be promoted
from a per-packet line to a standing worker-contract rule** — it is currently
only in packets that happen to remember it.

### 2. What I nearly got wrong — and the general lesson under it

**I nearly shipped a weakened oracle.** After the first GREEN attempt, two things
still tripped the invariant test: my own explanatory comments (which used the
words while explaining the removal), and `migrations/0003_s03.sql`, which is
applied history and must never be edited.

The tempting move — and I started reaching for it — was to relax the regex or
quietly exclude migrations. Both would have produced a green test that pins
nothing, which is the exact failure mode §2 of the worker contract names.

What I did instead, and would do again:
- **Comments:** reworded mine so they say "the repealed second operator". Cost:
  90 seconds. Benefit: the oracle stays maximally strict over source *including
  comments*, which is the strongest available form. Rewording my own prose is
  always cheaper than weakening an assertion.
- **Migrations:** did NOT exclude them silently. Gave them their own assertion
  (P5) that pins the permitted set *by measurement* — measured-carriers must
  equal declared-carriers — plus content assertions that the forward migration
  really drops the columns. Mutant M5 (a new migration reintroducing
  `rival_operator`) fires P5, proving the exception is not a hole.

**GENERALISABLE RULE:** when an invariant test has a legitimate exception, never
express it as an exclusion. Express it as a *second assertion that pins the
exception set by measurement*. An exclusion rots silently; a measured set fails
the moment it grows.

### 3. The finding that would have shipped broken: D14 is under-triggered

**CAUSE:** D14 says a lane "touching web/ or apps/ui MUST run the workspace-local
gate". I touched neither. Root `pnpm run typecheck` exited **0 with 0 errors**.
By the letter of D14 I was done.

I ran the local gates anyway — only because I had noticed during enumeration that
both Next apps consume `number_slots` — and found **5 real type errors**
(`apps/ui/components/AnswerHonestyDrawer.tsx:249,250×3`,
`web/components/DebateWorkspaceDrawer.tsx:20`): narrowing the contract's
discriminated union left both drawers rendering a branch typed `never`.

**This is a hole in D14's trigger condition, and it is a bigger hole than the one
D14 was written to close.** D14 triggers on *editing* those directories. The real
hazard is *changing something they consume* — a contract schema, a kernel
vocabulary — while never opening their files. Root typecheck is green, the lane
looks finished, and the breakage ships.

**PROPOSED AMENDMENT (for V):** D14's trigger becomes "a lane that edits web/ or
apps/ui, **or that changes any symbol exported from `packages/contract` or
`packages/kernel`**, MUST run both workspace-local gates." Cheap to state,
mechanically checkable, and it closes the class rather than the instance.

**PRICE IF MISSED:** two broken Next apps merged behind a green root typecheck —
almost certainly a full round, plausibly discovered only at acceptance.

### 4. Token and wall-clock costs, itemised

| cost | cause | cure |
|---|---|---|
| **1 wasted RED run (~2 min, ~9k tokens of stack trace)** | `--reporter=basic` was removed in vitest 4; it dies in *startup* with 40 lines of Vite module-runner stack and zero test output — it reads exactly like a broken test file | filed to TOOLING-TRAPS |
| **1 wasted three-run cluster loop (~3 min)** | zsh no-word-splitting — `$CLUSTER` as one filter → `No test files found, exit 1`. **The dangerous part: my `grep 'Tests '` found nothing, so the loop printed three blank verdicts under `exit=1`** — a shape that could be skimmed as three failing runs, or worse, transcribed as three green ones | filed to TOOLING-TRAPS with the silent-failure emphasis; the trap was *already recorded* in a different form and I still paid it |
| **~6 base-state round trips** | RED-at-base had to be re-taken because I restructured the test after the first RED (added P5, moved migrations out of the live scan) | see §5 — this is a process gap, not a mistake |
| **0 rework rounds, 0 dead ends** | — | — |

The single largest *avoidable* cost was the zsh array trap, which was **already in
TOOLING-TRAPS in its `$K more` form** and which I still walked into because the
recorded form did not resemble my usage. **Traps should be filed by SYMPTOM, not
by the syntax that produced them** — I would have recognised "a loop that prints
nothing and exits 1" far faster than "`K="cmd with args"; $K more`".

### 5. The process gap worth fixing: RED must be re-taken when the test changes

I took RED, then discovered (from the test's own output) that the oracle needed
restructuring, then had to restore base state and re-take RED so the *shipped*
test was the one proven failing. That is correct — a RED frame for a test you
subsequently rewrote is not evidence — but nothing in the contract says it, and
the cheap wrong move (keep the first RED log, ship the second test) is invisible
in a report.

**PROPOSED WORKER-CONTRACT LINE:** "The RED frame must be produced by the test
file you ship, byte-for-byte. If the test changes after RED, RED is re-taken."

Also worth standardising, because I invented it under time pressure and it worked
five times with zero loss: the **base-state round trip**. `git diff > work.patch`
→ *move untracked artifacts aside too* → `git checkout HEAD -- <dirs>` → run →
`git apply` → prove with `diff -q work.patch <(git diff)`. The untracked step is
the non-obvious one: untracked files survive `git checkout` and silently
contaminate the "base" run — my first base pin would have had migration 0051
present and P5 would have half-passed against a base that never existed.

### 6. Toward the one-prompt machine

Ranked by expected saving, highest first:

1. **Promote "enumerate the class before editing" to the worker contract.** It is
   currently a packet-level courtesy. It is the single highest-leverage rule in
   this lane's record: 4 minutes bought what cost TREL 2 rounds. *(§1)*
2. **Fix D14's trigger to cover consumers, not just editors.** A green root
   typecheck is actively misleading for any contract/kernel change. *(§3)*
3. **Make "exception ⇒ measured second assertion" a stated review criterion.**
   Reviewers can then reject silent exclusions on sight, instead of arguing case
   by case about whether a given exclusion is reasonable. *(§2)*
4. **File tooling traps by symptom.** Add a one-line "what it looks like when it
   bites" to every existing entry. I re-paid a recorded trap because the record
   described the syntax, not the failure shape. *(§4)*
5. **Give packets a "downstream consumers" field.** My packet's anchor list was
   accurate and drift-free (all 9 anchored files byte-identical to `1c9578a`),
   but it listed *where the code is*, not *who depends on its shape*. The three
   surprises in §1 were all reverse dependencies. An orchestrator running one
   `grep -rl <symbol>` at packet-write time could have named all three.
6. **State the RED-is-re-taken rule.** *(§5)*

### 7. Packet quality — credit where due

The packet was materially better than the class average and I want the specific
things named so they are repeated:

- It **pre-empted its own defect**: "those file:line anchors are cited against
  1c9578a; your tree is 71afca1 — re-locate each anchor and note any drift …
  verify, never assume." I verified: `git diff 1c9578a 71afca1` touches none of
  the nine anchored files. Zero drift. The instruction cost me one command and
  removed a whole category of doubt.
- It **named the failure mode of the suite row in advance** (D15-DEFERRED
  language, "never a placeholder"), so I did not have to choose between fighting
  contention at load 30 and inventing a number.
- It **carried the paid lesson with its provenance** ("TREL's paid lesson"),
  which is why I believed it enough to spend the 4 minutes.

One genuine gap, already covered in §6.5: no downstream-consumer field.

### 8. Residual honesty

- The full suite is **not** run by this seat (D15-DEFERRED; host at load 25–32
  with 7 concurrent vitest processes from other lanes). My cluster evidence is
  9 static/unit files ×3 and the DB integration file ×3, all against my own base
  pin — but a cross-lane interaction outside those files is genuinely unobserved
  by me, and the judge's batch run is the first thing that could see it.
- I removed the `WITHHELD` number slot rather than keeping it with a new reason.
  That is a judgment call: the goal names the *propagation withholding branch*
  explicitly and the DoD forbids the strict-and literal anywhere in shipped code,
  and nothing has ever written a WITHHELD event (serve emits `PRESENT`/`EVICTED`
  only, `packages/serve/src/index.ts:954,1216`). I believe it is the honest
  reading, but it is the largest interpretive step in this lane and a reviewer
  should test it, not accept it.
- I touched `web/` (one ternary branch) despite the SPEC's "web/ touched ONLY by
  T2" clause. I claim the J5 class (compiler-forced coherence consequence, not
  feature work). Flagged in the report as F-T8-3 rather than assumed settled.

---

## r2

### 1. The r1 miss, named exactly: I proved a property of the CODE and called it a property of the SYSTEM

Codex B1 is correct and it is the most valuable finding in this lane.

**CAUSE — and it is not carelessness, which makes it worth writing down.** In r1
I established, correctly and with citations, that *no first-party writer has ever
emitted a `WITHHELD` event* (serve inserts only `'EVICTED'` at
`packages/serve/src/index.ts:954` and `'PRESENT'` at `:1216`). I then treated
that as sufficient. It is not. **Source history is a fact about this repository;
it is not a fact about any deployed database.** The constraint that made
`WITHHELD` legal shipped in `0000`, so any row written by any means — a fixture,
a hand-repair, a since-deleted code path, a migration from an older shape — is
still sitting there and is still legal.

And I made it worse than inert: I added both replacement constraints `NOT VALID`.
That is not a neutral choice, it is *precisely* the choice that lets the offending
rows survive behind a green migration. Then `packages/serve/src/index.ts:1513`
tests only for `EVICTED` and `:1514-1523` folds everything else into `PRESENT` —
so the upgrade would have **exposed the very number the old semantics withheld.**
A deletion lane turning into a disclosure bug is about the worst shape this could
have taken.

The second arm I would not have found on my own even having been told about the
first: `ledger.propagation_run.operator_by_parent`. I reasoned that the narrowed
`operator_used` CHECK on `node_strength_record` covered stored operator values.
It does not, and the reason is *my own deleted code*: a withheld parent returned
`null` before any strength record was constructed, **so exactly the rows carrying
the repealed operator are the rows with no `node_strength_record` to check.** The
proxy fails precisely where it was needed. That inversion is the sharpest thing I
learned this round, and my r2 test asserts it explicitly (`strengths.rowCount`
is 0 while the receipt carries the repealed operator) so the next reader gets it
for free.

> **CORRECTED IN r3 (codex r2 N2) — the bolded sentence above is FALSE as
> written and is left standing only so the error is visible.** "Exactly the rows"
> is a false equivalence. An ALL-JUDGED parent under the repealed operator
> produced a perfectly ordinary strength row carrying `operatorUsed:
> "strict-and"` — base `tests/unit/scoring.test.ts:235-253` at `71afca1` asserts
> precisely that. The true claim is existential, not universal: **a
> strict-WITHHELD parent CAN leave the frozen receipt with no strength row, so
> `operator_used` is not a COMPLETE proxy.** Incompleteness is all the argument
> needs — and the migration never depended on the stronger claim, since its JSONB
> scan reads every `operator_by_parent` array whether or not a strength row
> exists. See `## r3` §2.

**GENERALISABLE RULE — and I think this is a standing law, not a T8 note:**

> Deleting a value from a vocabulary is a DATA migration, never only a code
> migration. The question is never "does anything still write this?" but "can
> anything have written this, ever, into a store that survives the deploy?" —
> and for any narrowed constraint, `NOT VALID` answers "yes, and I have agreed
> not to look."

Corollary I would put in front of every reviewer: **`NOT VALID` on a NARROWING
constraint is a smell by default.** It is right when you are adding a constraint
the existing data cannot satisfy and you intend to fix forward. It is wrong when
the whole point of the change is that the old shape must not survive.

### 2. What the fix cost, and the one thing that made it cheap

~50 minutes: fixture debugging 15, the migration itself 10, three DB clusters ~15,
mutants 10.

**Two fixture defects, both instructive, neither a property failure:**
1. `propagation_run` gained three NOT NULL columns after `0000`
   (`transmission_reductions`, `lift_records`, `judgement_selection_rule`, all
   `0001_s01.sql`). My seed used the `0000` column list.
2. **`served_number_event` and `propagation_run` are append-only at the trigger
   level.** My first test design moved between scenarios with `DELETE`/`UPDATE`;
   both were refused by the schema itself.

Defect 2 is not merely a test-design lesson — **it is an argument for the policy I
chose.** The legacy rows *cannot* be cleaned up in place even by an operator with
a psql prompt. That means auto-reclassifying them inside the migration would have
been the only "convenient" option, and it would have been silent data
reinterpretation of an append-only ledger. Fail-loud is not just the safer
policy here; it is the only one consistent with the store's own guarantees. I
put that reasoning in the migration header so it is not re-litigated.

**What made it cheap:** the packet's D12 discipline of always pinning base
behaviour first. I ran the upgrade test against the *unfixed* `0051` before
writing a line of the fix, and the RED told me both arms and the `convalidated`
gap in one shot (`4 failed | 3 passed`). The 3 passing tests were the
fixture-validity arms — which is exactly what you want a RED to look like: the
scaffolding proves itself while the property fails.

### 3. B2 — the process finding, and the part of it I still think is worth arguing

Codex is right that only `red-t8-invariant.log` was filed and the packet asked for
per-test base RED. I accept it and have filed the retrospective run.

The retrospective run also produced an honest result I would have preferred not to
have to write, and which I am recording because burying it is the exact failure
mode §2.6 exists to prevent:

| changed file | discriminating assertions at base source |
|---|---|
| `t8-strict-and-removed.test.ts` | 5 of 6 |
| `scoring.test.ts` | 3 |
| `contract.test.ts` | 1 |
| `replay.test.ts` | 1 |
| **`serve-s05.test.ts`** | **0** |
| **`register.test.ts`** | **0** |

The two zeros are honest zeros, and they are different from each other:
`register.test.ts` was a cosmetic sample-value swap in a *generic* resolver test
and could never discriminate; `serve-s05.test.ts` **removed** coverage of a
repealed status and replaced it with coverage of the surviving ones, so its new
assertions pass at base by construction. Neither is a bug. But **"I changed a
test" and "I added a discriminating assertion" are different claims, and r1's
report did not distinguish them.** That is the real content of B2, and it is a
better finding than the missing-log framing suggests.

**PROPOSED CONTRACT LINE (extends my r1 §5 proposal):** a lane reports, per
changed test file, whether its changed assertions discriminate against base —
and a file with zero discriminating assertions is *declared*, with the reason,
not left to be inferred from an absent log.

### 4. Where I was wrong and codex was right, stated plainly

**F-T8-1 is withdrawn.** I filed the packet's runner anchor
(`apps/runner/src/index.ts:2025-2039`) as imprecise because the range contains no
`rival` token. Codex checked base line 2031 and found the `...strength` spread —
which *is* how the rival fields were persisted. The anchor names the persistence
site correctly; a named-field deletion was never the mechanism. My finding
described my own expectation, not a defect in the packet. Withdrawn on the record
rather than downgraded.

The general error: **I described a surface that did not match my expectation as
imprecise, instead of asking what mechanism the packet author had in mind.** One
`git show 71afca1:apps/runner/src/index.ts | sed -n '2031p'` would have settled it.

### 5. Toward the one-prompt machine — r2 additions

Re-ranking after this round. Items 1–2 now outrank everything in my r1 list.

1. **Standing law: a vocabulary deletion is a data migration.** Every lane that
   removes a member from an enum, union, or CHECK must state the upgrade
   disposition for already-persisted values and prove it with an
   upgrade-from-previous test, not a from-empty one. *(§1)*
2. **Treat `NOT VALID` on a narrowing constraint as review-blocking by default.**
   It is a one-line grep for a reviewer and it is exactly what hid this defect.
3. **Enumerate the FROZEN RECEIPT CARRIERS alongside the columns.** My r1 class
   enumeration was thorough over code and typed columns and completely missed
   free-form JSONB receipts (`operator_by_parent`), which are read back into the
   narrowed vocabulary with only an `Array.isArray` guard
   (`packages/valuation/src/index.ts:456,503`). **A JSONB column is a schema the
   type system does not check** — it belongs in the enumeration checklist as its
   own line, because grep for a column name will never surface it.
4. **Per-file discrimination reporting, including the zeros.** *(§3)*
5. Everything from r1 §6 still stands, with D14's trigger fix (r1 §3) unchanged
   in priority — it remains a live hole that this round did not touch.

### 6. Residual honesty for r2

- The full suite remains D15-DEFERRED. Host load during this round was 20–36 with
  other lanes' vitest processes running throughout.
- Preflight (a)'s necessity is proven by the RED (with no preflights, both
  refusal arms failed), not by a dedicated mutant; I spent the mutant budget on
  (b) and on the VALIDATE statements instead, since those were the two mechanisms
  the RED could not distinguish on its own. M12 and M13 each fire exactly one
  assertion.
- The r1 mutant battery M1–M9 was not re-run: it targets source untouched by r2.
  M10/M11 (new, for the P4 oracle) and M12/M13 (new, for the migration) were run
  this round.
- My preflight (b) refuses on **any** operator that is not `accumulate`, which is
  broader than "refuse on the repealed value". I believe broader is correct for a
  fail-loud preflight, but it is a choice a reviewer should see rather than infer:
  a database carrying some third unknown operator value will also be refused.

---

## r3

Last rework round. Three non-blocking items, all accepted. Two of them are the
same failure wearing different clothes, and that is the finding.

### 1. The r3 lesson: a loose assertion is a place where three bugs hid

Codex N1: my r2 test "both repealed shapes are REJECTED at the door" used a bare
`.rejects.toThrow()`. PostgreSQL was throwing
`column "at_seq" of relation "node_strength_record" does not exist` — **the test
passed on a typo.** The error was printed inside the passing test's own log, in
every C4b run I filed, and I read past it three times because the aggregate line
said `21 passed`.

The instructive part is what happened when I tightened it. Requiring the error to
NAME `node_strength_record_operator_used_check` immediately surfaced **two more
fixture defects the loose form had been swallowing**:

1. `core.node`'s `depth`, `sibling_ordinal` and `materialized_path` defaults are
   dropped by a later migration, so my seed hit a NOT NULL violation.
2. A root node must be `depth 0 / ordinal 0 / path '0'` or the `0002_s02.sql:58`
   structural trigger rejects it — my two-sibling seed was invalid.

Under the loose assertion, **all three defects were indistinguishable from
success.** Any of them would have kept the test green forever while proving
nothing about the constraint it was named after.

**GENERALISABLE RULE — I would put this in the worker contract:**

> `.rejects.toThrow()` with no argument is not an assertion, it is a wish. A
> rejection test must name the thing that rejected — the constraint, the error
> code, the typed domain error — and must be paired with an ACCEPTED control
> that differs ONLY in the property under test. The control is what converts
> "something failed" into "this failed, and for this reason."

I added exactly that control to both doors: the same row differing only in the
operator is inserted successfully, which exercises every other column, the
`core.node` FK and the operator-pair CHECK, so none of them can be what failed.

**The discrimination, measured, because the claim above should not be taken on
faith.** Same mutant (`0051` left admitting the repealed operator):

| assertion form | result under the mutant |
|---|---|
| r3 hardened | **1 failed \| 7 passed** — the door test correctly fails |
| r2 as filed | **8 passed** — passes on the `at_seq` error |

That is the whole of N1 in two lines: the r2 assertion could not have caught a
migration that forgot to narrow the operator domain. The r3 one does.

**PRICE:** zero rounds (caught by review), but it would have shipped a permanently
green test asserting nothing — the exact corpus disease the worker contract's §2
refutation duty exists to prevent. **My §2 discipline was applied to the r1 grep
oracle and NOT to the r2 database assertions.** I built mutants for P1–P5 and for
the migration's preflights and VALIDATEs, and then wrote a brand-new door
assertion with no mutant at all. The duty is per-assertion, not per-round, and I
applied it per-round.

### 2. I asserted a universal where I had only an existential (N2)

I wrote that the repealed-operator receipts are "**exactly** the rows with no
`node_strength_record`". False, and codex disproved it from the base pin: an
ALL-JUDGED parent under the repealed operator produced an ordinary strength row
with `operatorUsed: "strict-and"` (`tests/unit/scoring.test.ts:235-253` at
`71afca1` — a fixture I had read, and had myself rewritten in r1).

The true claim is existential: a strict-WITHHELD parent **can** leave the receipt
with no strength row, so `operator_used` is not a **complete** proxy. That is all
the argument ever needed — incompleteness alone defeats a proxy.

**CAUSE, and it is worth separating from carelessness:** I over-generalised in the
direction that made my own fix look more necessary. The universal reads stronger
and I did not check it, because checking it could only have weakened my case. That
is a specific and nameable bias — **arguing for a fix I had already decided to
make** — and it is more dangerous than a slip, because it is systematically
directional. The migration never depended on the stronger claim; its JSONB scan
reads every array regardless. I could have written the weaker true sentence at
zero cost to the outcome.

I corrected it in place in the `## r2` section above with the false sentence left
visible and marked, rather than silently rewriting it. A self-report that edits
away its own errors is worth less than one that carries them.

### 3. Two findings were resolved before my review and I never saw them (N3)

F-T8-2 was adopted as **D16** and F-T8-3 resolved as **J11**, both ruled before
codex's r1 review and neither quoted to me — the orchestrator has taken that
omission. I carried both as open through r2.

The honest share of this is mine too: **I never re-read `DECISIONS.md` after r1.**
My packet's cursor was `packet-t08-2026-09-01`, and I treated the mission
decisions record as static input rather than as a file that grows while a lane is
in flight — which is exactly what it did, and with rulings answering *my own
findings*. The board is the state (router §2.4), and I read it once.

**PROPOSED CONTRACT LINE:** re-read the mission `DECISIONS.md` tail at the START of
every rework round, not only at dispatch. A finding you filed may already be
ruled, and reporting it as open wastes a reviewer's round — as it did here.

### 4. Toward the one-prompt machine — r3 additions

New items, ranked against my r1/r2 lists:

1. **Rejection tests must name the rejector and carry an accepted control.** The
   single highest-value line from this round; it caught three bugs at once. *(§1)*
2. **Apply the refutation duty per ASSERTION, not per round.** I mutated
   everything in r1 and r2 and then shipped an unmutated new assertion in r2. A
   simple mechanical check: every assertion added this round has a named mutant,
   or is declared as not having one and why. *(§1)*
3. **Re-read `DECISIONS.md` at the start of each rework round.** *(§3)*
4. **Treat a schema/driver error printed inside a PASSING test as a failure
   signal.** Mine was visible in four filed logs. A trivial post-run grep for
   `does not exist` / `violates .* constraint` outside the assertions that expect
   them would have caught it without a reviewer. I now run that grep and report
   the count; in the final r3 runs the only four are `graph-database.test.ts`'s
   own deliberate negative-path assertions, identical to the r1 log that predates
   my file.
5. Everything in r1 §6 and r2 §5 stands. D16 now closes the r1 §3 / F-T8-2 hole.

### 5. Residual honesty for r3

- Full suite remains D15-DEFERRED (load 13–30 through this round, other lanes
  resident).
- C4a was re-run once, not three times: no file in that cluster changed in r3, and
  its r2 three-run evidence stands. Declared rather than presented as a three-run
  verdict.
- The served-number door names `served_number_event_reason_matches_status` because
  that is the constraint PostgreSQL actually reports; **no row can isolate
  `served_number_event_status_check`**, since every status outside PRESENT/EVICTED
  also violates the reason pairing. That constraint is pinned by the
  `convalidated` assertion instead. A reviewer should see this as a deliberate
  scoping choice, not an oversight.
- I did not re-run the r1 mutant battery M1–M9 or r2's M10–M13; nothing they
  target changed in r3. M14 is new this round and is the one that produced the
  discrimination table in §1.
