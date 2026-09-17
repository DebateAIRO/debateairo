# W12 CLOSURE AUDIT — DRAFT, 2026-09-16

Written by RECORDS(CONT-T19) as the orchestrator's delegated writer, at branch tip `c1c08bd7`
(product final at `35dc4c15`). **This is a draft for the judge, not a verdict.** Under the citation rule
(D67), every claim carries its source and a STRENGTH tag, and every count is enumerated in this pass.

**The headline, stated first because everything else depends on it: the judge's whole-goal verdict
cannot be issued from this branch.** It is not blocked on code. It is blocked on a run that needs the
operator's credential and go (D18 / D72), because six of the nine sub-clauses of the flagship-run bullet
are **not recorded anywhere** — not as failures, as *absences*. A verdict issued today would be a verdict
about the test suite, not about the goal.

---

## 1. The Global definition of done — quoted VERBATIM

From `slices/S12-closure/SPEC.md:33-45` (= goal-v4 lines 28–41). **Packet correction:** the dispatch
named `:33-44`; `:45` is `  fail loudly.`, the second half of the final bullet, so the block is
`:33-45`. Measured this pass with `awk 'NR>=31 && NR<=46'`.

```
- RED before GREEN means: the FIRST test asserts the DESIRED behavior and fails on the
  baseline. Never write a test that passes today and flip its assertion later. Read-only
  probes documenting old behavior are allowed but are not the RED evidence.
- Suites reported passed/total; pre-existing failures named, never absorbed.
- Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ
  (non-self-graded), measured edges, at least one root's final strength ≠ τ, an adaptive
  stop or ceiling recorded, a synthesizer verdict statement acknowledging the strongest
  surviving objection, an evaluator loop record (≤3 rounds), a code-derived three-state
  label, a band counted over cited nodes, AND envelope state WITHIN at terminal.
- Mono-maker acceptance run still completes (skeleton path + marks intact).
- Every new policy value lives in sealed register rows via T16's mechanism; missing rows
  fail loudly.
```

Also binding, and it is the clause the closing run itself violated — the Scope law at
`slices/S12-closure/SPEC.md:26`: *"Every degradation or skip emits a visible condition mark."*

---

## 2. Bullet by bullet: what proves it today, what the closing run recorded, what a re-run must produce

### 2.1 "RED before GREEN"

**Proved today, per lane, never audited once at closure.** Enforced by every packet and checked in every
review; this continuation added nineteen more instances of the discipline, several of them against the
seat's own interest (Task 15 fix round 1 disclosed three mid-round regressions of its own; Task 17's fix
round disclosed that F2 **had no RED because the property already held**, rather than manufacturing one).
**Closing run recorded:** nothing — it is not a run-level property.
**A re-run must produce:** nothing new. **What is still owed at closure is the AUDIT**: one pass that
says the rule held for every landed change, rather than 100+ separate assertions that it held for one.
Sources: `../2026-08-31-algorithm-correctness/goal-prompt.md:29-31`; `PROGRESS.md:21-22`; D64 ADDENDUM
8(4). STRENGTH: consistent-with.

### 2.2 "Suites reported passed/total; pre-existing failures named, never absorbed"

**This bullet moved during the 2026-09-16 continuation, and it is the one place where closure is closer
than it was.** The 2026-09-16 status map found this PARTIAL, with the specific gap: *"No full-suite gate
exists at the final tip `e2adf68b`."*
**That gap is now filled on this branch.** The FINAL GATE was measured at `6cdc14b2` (product files
identical to Task 17's tip `5ace5d7c`), with an instrument first validated by reproducing two known
gates exactly (`96e3c91c` → 170/1/0/1 and `78e89ea4` → 142/0/0/1). Verbatim:

```
FOUR-COUNT  failures=141  suite-load=0  skips=0  unhandled=1
TOTALS(json)  tests=5271  passed=5130  failedTests=141  files=425  failedFiles=32
```

Every one of the 141 is named and attributed in the SDD ledger's `FINAL GATE ATTRIBUTION` entry: **NEW
1** (entailed to Task 15, fixed at `35dc4c15`), **CLEARED 2** (F22, consistent-with `env:resource`),
**UNHANDLED 1** (the known s7 `ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` rejection, present at
`96e3c91c`, `78e89ea4` and `6cdc14b2` alike), **STILL RED 140** (name-identical to the Phase 1 list).
**Nothing was absorbed.**
**Closing run recorded (`agent-reports/closing-run-report.md:16`; `LEDGER.md:487`):** the full suite at
dev `169941c6` — **77 / 1 / None / 1**, passed 3379 of 3456, 33 of 265 files, *"Nothing unexplained."*
**A re-run must still produce:** a gate at the branch tip. One is **in flight** at `c1c08bd7` with the
same instrument; its four-count is measured, never predicted, and the orchestrator appends it.
**And one caveat that must travel with any number from this branch:** every gate here ran on **Node
26.5.0** against a declared `22.23.1` (D73 e/7). 100 `localStorage` rows in `tests/render` are that
mismatch, and a shim proved it masks **4 real reds** in `t1-canvas`. A Node 22.23.1 run is expected to
**clear ~100 and reveal ~4**, so its name set will not be comparable row-for-row with these.
STRENGTH: entailed.

### 2.3 The flagship-run bullet — nine sub-clauses

**Enumerated in this pass from the status map §2.1 table: 9 sub-clauses. 2 recorded. 1 partial. 6 not
recorded anywhere.**

> **Discrepancy named rather than smoothed over:** the status map's own headline says the closing
> artifacts record *"only 4 of the 9"*. Counting the rows of its own table gives me **2 DONE + 1 PARTIAL
> + 6 OPEN**. I cannot reconcile 4 with that table, so I report my enumeration and flag the difference.
> This does not change the conclusion — the six OPEN rows are identical either way.

| # | sub-clause | what proves it TODAY | what the closing run recorded | STRENGTH |
|---|---|---|---|---|
| 1 | **panel-reduced τ (non-self-graded)** | nothing | *"DISC-01: panel 2"* and *"each node reviewed by the other maker"* — neither states that τ was panel-reduced, nor that it was non-self-graded | undetermined |
| 2 | **measured edges** | partial | *"8 nodes, 4 attack edges … 4 independent attack edges"*, XREV-01 outcomes recorded. **No artifact states that MEASURED magnitudes were written to the graph** | consistent-with |
| 3 | **at least one root's final strength ≠ τ** | nothing | **nothing** — a grep for `final ≠` / `final strength` over every closing artifact returns zero hits | undetermined |
| 4 | **an adaptive stop OR ceiling recorded** | the ceiling arm | *"T17 envelope at terminal: WITHIN, 30 of 106 attempts"*. The ADAPTIVE-STOP arm (δ stop / `BRANCH-FROZEN-LOW-LEVERAGE`) is not recorded. **The bullet says OR, so this sub-clause is SATISFIED** | entailed (ceiling) |
| 5 | **synthesizer statement acknowledging the strongest surviving objection** | nothing | **nothing** | undetermined |
| 6 | **evaluator loop record (≤3 rounds)** | nothing | **nothing** | undetermined |
| 7 | **code-derived three-state label** | nothing | **nothing** — the report names run id, answer id, node/edge counts, call counts and the envelope, **and no label** | undetermined |
| 8 | **band counted over cited nodes** | nothing | **nothing** | undetermined |
| 9 | **envelope state WITHIN at terminal** | the closing run | *"WITHIN, 30 of 106 attempts (V's sealed ceiling)"* | entailed |

**The six a re-run must produce — 1, 3, 5, 6, 7, 8.** They are all of one kind: **the algorithm almost
certainly did them, and the ceremony did not write them down.** The run exited 0 and its own gates
(FAIR-01, PRO-01, DISC-01, XREV-01) passed; those gates simply do not report the label, the band, the
evaluator loop, the synthesizer's acknowledgement, τ's provenance, or any root's final strength.

**So the cheapest path to closure is NOT another debate — it is a report that prints what the run
already computes.** A re-run against an unchanged ceremony report would produce the same six absences.
**Recommendation to the judge and to V: before the re-run, extend the ceremony's phase report to emit
those six facts.** Otherwise the credential, the spend and ~23 minutes buy an artifact with the same
holes.

### 2.4 "Mono-maker acceptance run still completes (skeleton path + marks intact)"

**OPEN. Never run at any closing tree.** The only mono ceremony on record is T0's BASELINE at M=1
(`67a294c8` / `fed8007d`), which **pre-dates T11 and printed `verdict SUPPORTED`** — exactly what
confirm-item 6 now forbids (*"a solo voice can never print SUPPORTED"*). So the one mono artifact that
exists demonstrates the old behaviour, not the ruled one. `PROGRESS.md:18` still lists the mono run
inside a `pending` W12. Sources: `DECISIONS.md:445-448`; `PROGRESS.md:18`. STRENGTH: entailed.
**A re-run must produce:** a mono-maker ceremony that completes, with the skeleton path intact, and whose
label is **CONTESTED + `LABEL-BASIS-INCOMPLETE`**. That artifact is simultaneously the only possible
demonstration of confirm-item 6.

### 2.5 "Every new policy value lives in sealed register rows via T16's mechanism; missing rows fail loudly"

**DONE, and this continuation strengthened it rather than merely preserving it.** T16 is the sole owner;
the sealedrows lane re-proved both deployment seeders at `d08ee928`; F-T17-T9 made the synthesis-role
family non-optional at `b763ffb7`. During the continuation, **Task 15 minted two new policy values —
`synthesizerCallBound` and `evaluatorCallBound` — through exactly that mechanism** (migration `0064`
measured as the next free number, dev seeding, the required-row manifest updated) and made them REQUIRED
at the type level, so a missing row does not merely fail loudly: **it fails to compile.** Sources:
`DECISIONS.md:351`; `PROGRESS.md:106`, `:136-138`; SDD ledger :129–:132. STRENGTH: entailed.
**A re-run must produce:** nothing new. This bullet is closeable now.

---

## 3. The seven confirm-items — quoted, and all seven still un-presented

Verbatim from `slices/S12-closure/SPEC.md:52-74` (= goal-v4 lines 42–66); the operative defaults are
R7-3's, applied throughout the mission. **None of the seven has ever been presented to V at an acceptance
ceremony** — `V-DECISIONS-PACKET.md:48` still reads *"(Items 1 and 7 text to be quoted verbatim from
goal-v4 at closure.)"*, i.e. the acceptance presentation itself is unfinished. STRENGTH: entailed.

| # | topic | default applied | presented to V? | demonstrable today? |
|---|---|---|---|---|
| 1 | S7-1 split: label from code, statement from synthesizer, agreement enforced | applied (yes) | **no** | not from any closing artifact — see §2.3 rows 5 and 7 |
| 2 | a round-3 standing evaluator objection serves WITH a visible mark | applied in T9's loop | **no** | **no closing artifact shows the mark firing** |
| 3 | does a round-3 objection ALSO force CONTESTED? | **NO** — it stays a mark; the ladder stays acyclic | **no** | n/a (a design choice, not an observable) |
| 4 | live-UI vocabulary mapping (SUPPORTED→endorsed, …) | accepted as-is | **no** | partially — and see `F-T4-UI-8-REVIEW-VOCABULARY-CARD`: the review vocabulary reaches the drawer and never the card |
| 5 | panel-member failure policy; PANEL-PARTIAL ratified canonical (J11) | applied | **no** | not exercised by the closing run |
| 6 | a solo voice can never print SUPPORTED → CONTESTED + `LABEL-BASIS-INCOMPLETE` | applied | **no** | **no — and it cannot be, without the mono-maker run (§2.4)** |
| 7 | run-level claim frame | **parked** in Non-goals | **no** | n/a |

**What a closure ceremony owes on these:** items 1 and 7 quoted verbatim from goal-v4 into the V packet,
all seven presented as decisions rather than as applied defaults, and — for item 6 — the mono-maker
artifact, because item 6 is the only one of the seven that has a *demonstration* and not merely an
answer.

---

## 4. The other W12 duties

| duty | state | evidence | what it needs |
|---|---|---|---|
| **δ/ε refit** (S12 owns EXECUTING T7's refit clause) | **OPEN — never executed** | the only `REFIT` entry in `DECISIONS.md` is J2 declaring the duty (`:77-79`); no dated refit ruling exists; the refit-note FORMAT was drafted by the T7 seat and never filled (`agent-reports/t07-stopping.md:145-172`). `slices/S12-closure/SPEC.md:104-109` | **a real M≥2 run to fit from.** It cannot be done from the suite — it needs measured spend and stopping behaviour from a live ceremony |
| **mono-maker acceptance run** | **OPEN** | §2.4 | the operator's credential and go (D18 / D72) |
| **judge whole-goal verdict** | **OPEN — does not exist** | no section, file or ledger row carries one; `PROGRESS.md:18` lists it inside a `pending` W12 | §5 below |
| **V packet FINAL status** | **OPEN — still `LIVING DRAFT`** | `V-DECISIONS-PACKET.md:1-3` | the judge's verdict, attached |
| **Global DoD audit / entry-point class sweep (J20 closure gate)** | **OPEN, and this document is its first half** | `DECISIONS.md:1014`; `V-DECISIONS-PACKET.md:19` | the entry-point class sweep still owes a pass. The class itself is in better shape than it was: F33 / F34 / F37 landed with T3C, and `V-ENTRY-1` recommends making every `WalkingSkeletonSettings` member REQUIRED at the constructor — which is exactly the shape Task 15 used for the new bounds, so the pattern is now proven in-tree |
| **W12b DEV-SYNC** | **DONE by substitution** | W5 did the reconciliation and V delegated the merges (D70); `PROGRESS.md:19` still says `pending` — **a stale row** | a records correction, not work |

---

## 5. The judge's verdict: why it cannot be issued, and what it would rest on

**It cannot be issued because six of the nine flagship sub-clauses have no artifact at all** (§2.3), and
because the DoD's mono-maker bullet has never been exercised at any closing tree (§2.4). Those are not
failures a judge can weigh — they are absences. A PASS over them would be a verdict about the test suite;
a FAIL over them would punish the goal for a reporting gap. Neither is a verdict.

**What the verdict WOULD rest on, once the runs exist:**

1. **The suite bullet — available now.** The gate at `6cdc14b2`, four-count `141 / 0 / 0 / 1`, every name
   attributed, plus the Task 15 fix at `35dc4c15` and the re-run at the tip. With the Node-26 caveat
   stated on the face of the number, not in a footnote.
2. **The sealed-register bullet — available now.** T16 is the sole owner, and the mechanism was exercised
   twice more during this continuation with compile-time enforcement.
3. **RED-before-GREEN — available now, as an audit rather than as evidence.** One pass over the landed
   changes.
4. **The flagship bullet — after a ceremony whose report EMITS the six missing facts.** This is the
   critical path, and the cheapest version of it is a reporting change, not a bigger debate.
5. **The mono-maker bullet — after one M=1 ceremony**, which doubles as the only demonstration of
   confirm-item 6.
6. **δ and ε — after (4), fitted from its measured spend**, and recorded as a dated ruling in
   `DECISIONS.md`.
7. **The seven confirm-items — presented to V as decisions**, with items 1 and 7 quoted verbatim.

**One defect the closing run exposed is now repaired in code, and the record should carry that.** Grok
never joined the 2026-09-08 ceremony: its relay's handshake failed because `--sandbox read-only` cannot
resolve `/var/run/docker.sock` while Docker Desktop is down, and the ceremony **recorded an ABSENT
provider probe and printed nothing** — a silent violation of the Scope law's *"every degradation or skip
emits a visible condition mark"* (`agent-reports/closing-run-report.md:13`; `LEDGER.md:482-483`;
`slices/S12-closure/SPEC.md:26`). **Task 17 closed that** (range `a38dde4a..5ace5d7c`): an absent maker
is announced loudly through one announcer keyed by providerRef, on **both** entry paths, before the
debate starts; and the sandbox profile is probed first and degrades with a printed mark rather than
killing the maker — while still re-throwing the ORIGINAL failure if the unsandboxed handshake also
fails, so **an absent maker is never traded for an unprotected one**. The run itself was NOT
disqualified (the DoD asks M≥2 and it had 2), but the next one can no longer fail silently in either
direction. STRENGTH: entailed.

---

## 6. The shortest path to a closable W12, in order

1. **Extend the ceremony's phase report** to emit the six facts of §2.3 (label, band over cited nodes,
   evaluator loop record, synthesizer acknowledgement, τ's panel-reduced/non-self-graded provenance, and
   at least one root's final strength against τ). Code, no credential, no spend — and without it every
   later step buys an artifact with the same holes.
2. **Operator: the Node 22.23.1 run**, so the gate everyone will quote is not carrying ~100 false reds
   and hiding 4 true ones.
3. **Operator: the M≥2 ceremony re-run** on this branch, with Docker Desktop up so Grok joins and the
   Task 17 behaviour is exercised for real.
4. **Operator: the mono-maker (M=1) run** — the DoD bullet and confirm-item 6 in one artifact.
5. **Fit δ and ε** from (3)'s measured spend; record the dated ruling.
6. **Present the seven confirm-items** to V as decisions; quote items 1 and 7 verbatim.
7. **Then the judge's whole-goal verdict**, and the V packet moves from LIVING DRAFT to FINAL.

Steps 2–4 need the operator's credential and go (D18 / D72). Step 1 does not, and it is the one that
decides whether steps 3 and 4 are worth their spend.

---

## ADDENDUM 2026-09-17 (orchestrator) — §6 step 1 is done; the re-run's depth was missing

**Step 1 landed** (V's order of 2026-09-17; ticket `F-CEREMONY-REPORT-DOD-FACTS`; D74 ADDENDUM 1;
product tip `9540cb9b`). The ceremony now prints, below its last established line, one fixed line
per absent sub-clause: `DOD-1 panel-reduced-tau` (τ per node with its voice counts; whether every τ
had a non-author voice; single-voice node ids), `DOD-2 measured-edges` (PRESENT magnitudes over every
edge, and over attack edges by FAIR-01's rule), `DOD-3 root-final-vs-tau` (each root's τ and final;
whether one differs; the witness), `DOD-5 surviving-objection` (the strongest surviving objection's
node id and strength; whether the final evaluator round was satisfied; whether
`SYNTHESIS-OBJECTION-STANDING` is on the answer), `DOD-6 evaluator-loop` (rounds recorded against the
sealed `evaluatorLoopMaxRounds`, each round's stage and verdict), `DOD-7 verdict-label` (the label or
the unavailability reason ref, terminal, serve state), `DOD-8 confidence-band` (the band, its
`LOOKED_UP/RAN/REASONING` basis over the cited set, the ceiling's register row key). Sub-clauses 4 and 9
keep the `T17 envelope at terminal` line. No debate content enters the log. The same facts ride the
returned ceremony as the typed `definitionOfDone` block.

**What the §2.3 table becomes on the next log.** Rows 1, 3, 5, 6, 7, 8 read their line; row 2 reads
`DOD-2`'s first pair (the clause's words) and reconciles the second with `FAIR-01 graph`. The judge's
whole-goal verdict (§5) can then rest on the log alone. **Two of those rows are only witnessable
live:** the dry-run fixture's attack arrows are all placeholders and its roots keep their τ, so on it
`DOD-2` reads `0/…` and `DOD-3` reads `false` — an unmet sub-clause on a fixture, not a broken reader.

**A second hole in the re-run, found while filing.** The readiness packet's command carried no
`--depth-params`; the ceremony defaults to depth 1 (`acceptance/run-acceptance.ts:88`) and the bullet
says `depth≥2` (`slices/S12-closure/SPEC.md:37`). Both command forms now carry
`--depth-params '{"depth":2}'` (D74 e). A run without it would fail the bullet whatever it printed.

**§6 stands otherwise:** steps 2–7 remain the operator's, in that order.

## ADDENDUM 2, 2026-09-17 23:5x (orchestrator as judge) — §6 step 3 done: the re-run witnessed the flagship bullet in full

`closing-runs/ceremony-20260917-222858.log` (D76): V's run on `4f83405f`, three makers, depth 2, exit 0
in 79 minutes. Against the §2.3 table: row 1 `DOD-1` 27/27 non-self-graded, none single-voice;
row 2 `DOD-2` 30/30 measured (15/15 by FAIR-01's rule) — the partial row is closed; row 3 `DOD-3` all
three roots moved (witness `716ea8d3`); row 4 the ceiling 396 with 114 consumed; row 5 `DOD-5` the
strongest survivor `11464564` acknowledged (final round satisfied, no standing mark); row 6 `DOD-6`
2 of 3 rounds with one retry; row 7 `DOD-7` CONTESTED (DOWNGRADED, RECOMPOSED_ONCE); row 8 `DOD-8`
CAPPED over a 0/0/5 basis; row 9 WITHIN. **Nine of nine recorded. The verdict on the flagship bullet:
WITNESSED.** The whole-goal verdict (§5) now rests only on §6 steps 4–6: the mono-maker run, the δ/ε
refit (114 calls / 79 minutes / ceiling 396 are the inputs), and the seven confirm-items presented to
V; the post-ceremony four-count runs detached on the run's tree. Step 2 (Node 22.23.1) is still owed
and does not block the verdict on this bullet.
