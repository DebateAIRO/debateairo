# Self-report — seat ARCH-REV-S03 · node ARCH-REV(S03) pass 2 of 3 (SCOPED) · ticket `t_f06b97cf` · 2026-09-13

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **REWORK (pass 2)** — ONE blocking finding, C3-scoped; five non-blocking; **C1 ∥ C2 can be
dispatched today**. Artifact: `docs/missions/debate-tiers/reviews/ARCH-REV-S03-p2.md`.
Lane `9a000c37`, 0 dirty at start and end. No git writes, no stack, no provider, and I did not run
either embedded-postgres suite the packet forbids.

---

## 1. The cause of death — my own pass-1 prediction killed this pass

I ended pass 1 with three falsifiable predictions. The third:

> whoever checks the cluster table will check disjointness (which holds) and not completeness (which
> does not) — B2 is a gap of omission, and omissions do not show up in the check the table invites.

**That is exactly what happened, inside the remedy for B2.** The seat did the right thing — it stopped
hand-writing the surface column and derived it mechanically with `surfaces.mjs`. The script checks
disjointness and prints `none — every file sits in exactly one cluster`. It does not check
completeness, and it cannot: its marker-walk stops at the first token after `Create:`/`Modify:` that is
not a backticked path. S10's Files line is

```
Files — Modify: `package.json` (the repository root's), `tests/architecture/dev-deployment-register.test.ts`.
```

The parenthetical `(the repository root's),` ends the walk. `tests/architecture/dev-deployment-register.test.ts`
— a **declared write** — never enters any surface. The disjointness check then reports "none" not because
the file is safely owned but because it is **absent**, and the plan at `:854` makes the script's output
authoritative over the hand-written column: *"a column that disagrees with it is the defect, not the script."*

That is the whole murder: **a mechanical check that is silent where it is incomplete, promoted to
authority.** A hand-written column is wrong loudly; a derived column is wrong quietly and outranks you.

The cost is real because C3's S21 breaks that very file — `:14` asserts the CLI source contains
`loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment())` and S21 puts a second
argument inside those parentheses — so C3's command cannot go green inside C3's file contract.

**The upgrade:** a derivation that feeds a contract must fail loudly, not silently. `surfaces.mjs` needs
one assertion — *every backticked path inside a `Files —` paragraph is either captured or explicitly
classified as a citation* — and to exit non-zero otherwise. I wrote that check as
`p2-dropped-paths.mjs` in about fifteen lines; it prints the S10 drop immediately and, as a bonus,
classifies the other 42 paths as citations correctly. **Recommendation: ship the completeness assertion
inside `surfaces.mjs` itself and make `plan-check.sh` run it.** A script that derives a contract must
answer "did I see everything?", not only "did I see a clash?".

## 2. What repeatedly cost tokens

1. **My own attack script silently matched nothing — again.** My first command-vs-surface diff printed
   `none` for hole (1) and I nearly believed it. The table-row regex never matched, so the loop ran zero
   times and reported a clean result. This is the *second* pass in a row where my own tooling produced a
   confident false negative (pass 1 it was range expansion in the trace parser). **The rule I am now
   applying to myself: a check that reports "none" must first prove it looked — print the denominator.**
   Had I printed "0 rows parsed", I would have caught it instantly instead of re-deriving by hand.
   Cost: ~1 extra script and one round-trip. It is also, precisely, the same failure mode as the finding
   I am filing against the seat, which is uncomfortable and worth writing down.
2. **The packet's charge 5 sent me to verify a contradiction that does not exist.** It framed
   BASELINE.md's `15` for `register-support-publication.test.ts` against the seat's `12/14` and asked
   which is right. Measured: BASELINE's list sits under `pnpm typecheck rc=1; diagnostics by file
   (count · file)` — `15` is a **typecheck diagnostic count**, not a test count. The seat's 12/14 is
   right (I measured `Tests 2 failed | 12 passed (14)`). Both numbers were always true of different
   things. Cost: one suite run plus the reading to disprove it. **Upgrade: when a packet asserts a
   conflict between two numbers, it must quote the heading each number sits under.**
3. **What did NOT cost tokens, and should be copied.** The scoped packet named its charges against
   specific line anchors in a 1203-line document, and every anchor resolved. I read roughly 300 lines of
   PLAN.md this pass instead of 991. Scoping a re-review to the closures plus the new finding is the
   single biggest efficiency win available to this node, and it worked.

## 3. Dead ends — do not re-derive

- **The defaulted-parameter attack on S21 does not land** the way the packet framed it. The four
  predicates are module-private with exactly one caller (the `:493` closure), so a default buys nothing
  there. The exposure is on the four *exported* panel functions — and it is closed by S21's own prose
  ("the module-level `const configuredProviders` becomes a function of the loaded config") plus S25's
  ban on reading the file at module load. Not blocking; filed as N2 with the one-line criterion that
  would close it by measurement rather than by prose.
- **F-ARCH-4 is correct and needs no V row.** I counted the sites myself: five symbol uses plus one
  name-string at `:231` (which does not move) plus the declaration. Every use references the *constant*,
  so only three edits are genuinely forced — the literal at `registerFixtures.ts:23`, the literal at
  `architecture/register-support-publication.test.ts:357`, and `toHaveLength(32)` → `33` at `:368`. The
  constant's own comment documents S02 doing exactly this on 2026-09-12. Closed by S23 as written.
- **`LEGACY_REGISTER_V1_SNAPSHOT_SHA256` and the 14-row historical count genuinely do not move.**
  Verified against the suite's own assertions. S23 says so and is right.
- **The other two command-vs-surface gaps are harmless.** I checked both rather than assuming:
  `tests/unit/provider.test.ts` never touches `normalizedProviderBaseUrl` (its `/v1` endpoints are
  gateway fixtures), and `tests/architecture/dev-runner-provider-set.test.ts` references none of the
  symbols S21 re-signs. Same class as the blocking finding, no consequence.

## 4. Where THIS packet fought me

- **Charge 5's false premise** (§2.2 above) — the one real defect.
- **Charge 2 asked a yes/no ("if it can, that is B") about a question whose answer is "partly, and the
  part that matters is closed elsewhere in the plan."** Binary charges are excellent for forcing an
  answer and bad when the honest answer is conditional. I answered it in three sentences rather than
  one, and I think that is the right trade, but a packet that says "answer yes/no **and name what closes
  it if no**" would have got a sharper answer faster.
- **Everything else in this packet was excellent and I want the shape on record:** it named the
  anchors (`S19 :399`, `S21 :462`, `S23 :524`, `§2 :844-847`), it told me which of the seat's runners to
  re-run myself rather than read, it forbade the two suites I must not run *and said why*, and it asked
  me to score my own pass-1 predictions. That last one is the highest-value instruction in the packet:
  it is what turned a vague "reviewers should be blind" into a measured hit.

## 5. Toward the one-prompt machine

1. **Make every derivation answer "did I see everything?"** (§1). One assertion in `surfaces.mjs`; it
   would have prevented this entire pass. This is the same recommendation I made at pass 1 for
   citations (`plan-check.sh`), now proven twice: the mission's two most expensive planning findings
   were both *omissions invisible to the check that was actually run*.
2. **Make "the check printed none" untrustworthy by convention.** Every check in this fleet should print
   its denominator — rows parsed, files scanned, paths classified. Both of my own false negatives, two
   passes running, would have been caught by one extra number on one line.
3. **Keep scoped re-reviews.** Pass 2 cost roughly a third of pass 1 for a finding of the same severity.
   The scoping worked because the packet carried line anchors into a document that had grown by 212
   lines; without them I would have re-read the whole plan to find what moved. **A revision should ship a
   line-anchored diff of its own changes** — the seat's `Revision 2` line `:3` plus the per-step markers
   did most of this already, and it is worth making mandatory.
4. **The deeper pattern, now visible across two passes:** every blocking finding in this slice —
   pass-1 B1, B2, B3 and pass-2 B1 — was available inside the plan's own text to a reader who opened one
   cited file or diffed two lists the plan already prints. None required judgement. The reviewer's scarce
   attention should go to the one question a script cannot answer (this pass: *should a `model:` edit
   publish a new register version?* — it should, and S19 now says so correctly). Automate the rest.

## 6. Prices

| Item | Cost |
|---|---|
| wall-clock, CLAIM → verdict | ~25 min (pass 1 was ~35, for a comparable finding) |
| the four cluster commands + the RSP suite alone, re-run at base | ~7 min, backgrounded and overlapped with reading |
| my own false-negative attack script | ~1 script + 1 round-trip, caught before it reached the verdict |
| PLAN.md read this pass | ~300 of 1203 lines (scoped by the packet's anchors) |
| findings | 1 blocking, 5 non-blocking, 1 packet defect (charge 5's premise) |
| probes kept | 8 new files prefixed `p2-` in `.hermes/reports/debate-tiers/probes/ARCH-REV-S03/` |
| pass-1 predictions scored | 1 hit (prediction 3, and it recurred inside the remedy), 2 untested (no independent lens ran) |
