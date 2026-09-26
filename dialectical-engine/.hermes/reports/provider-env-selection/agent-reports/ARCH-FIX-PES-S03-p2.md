# Self-report — ARCH-FIX-PES-S03-p2 · node ARCH-FIX(S03) pass 2 · ticket t_2913aad6 · 2026-09-24

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Same session as ARCH-PES-S03 (agent adbd71f6a2f5bad4c), resumed. Wall clock 19:08:55 → 19:38 EEST
for the rework (**~30 min**), then ~10 min for this report and the handoff. Checking this report
against its sources removed five overclaims from its first draft: two unmeasured prices, a false
"only the self-test exposed it", a wrong trap origin and an invented shim size. The transcript grew
1,475,591 → 3,443,207 bytes (19:47). PRICE of pass 1's defects, in nodes: one blind review seat
(grok, t_3889dc21), one orchestrator fold (DECISIONS.md:53) and this fix seat. The ledger does not
give the review seat's wall clock (the orchestrator's 15:20 session limit fell between its dispatch
and its 19:10 consumption), so I do not state one.

---

## 1. The body: B1, three done-when counts that failed a correct edit — and four more nobody listed

**CAUSE.** In pass 1 I wrote every count as a SUM ("1 header + 1 separator + 11 existing + 6 new =
19") and never RAN the pattern I published. `grep -c '^| '` does not match the separator
`|---|---|`, so both table counts were one high. C2-6's "3" was the end-state number written as a
step criterion, two lines above my own sentence that said "4 before C2-9". I ran dozens of greps in
pass 1, just not the ones I told a stranger to run.

**The class was bigger than the verdict's table.** The packet warns that a pinned count propagates a
table's omissions, so I swept every oracle. The sweep found **four more members**. The worst was
C1-1, the FIRST BUILD step: `run-suites.sh …:23:1` expecting `CLUSTER_RED`. The runner prints GREEN
whenever measured equals expected (`run-suites.sh:23,:25`), so a correct RED state prints GREEN. The
very first action of the BUILD seat would have been un-markable, or read as a pass. The other three:
C2-5's base written as "6 lines beginning `| `" (5 under that pattern), the §4 row "3 lines" (depends
on prose), and "C2-1's member-table half passes", which a stranger can only judge by reading which
assertion failed. **Seven fixed, ten checked and left alone**, member by member in
`oracles.log` and `simulate.log`.

**PRICE.** B1 alone cost one review pass and this fix pass, 2 seats. The C1-1 marker would have
cost at least one more: a BUILD seat that either BLOCKS on an un-markable first step or, worse,
reads GREEN as done. That second case is a false pass the REV node would have to find. The cost is
not measured.

## 2. What I NEARLY got wrong in this pass — five times

1. **The minimal fix for B1.3 re-creates B1.** Changing 3 to 4 passes on one phrasing of C2-5's
   Value cells and FAILS on another that C2-5's own instruction invites ("declaring it without
   `input_price_micros_per_million`…"): the count becomes 5. I only saw this because the simulator
   built two prose variants. A per-line position check replaced the count.
2. **The reviewer's own remedy for N2, implemented literally, lets the violation through.** The
   whole-word ban passes "The recommended value is 600000." and a whole-word-or-substring number
   test passes `6000000`. Seven fixtures, three oracles, measured. I kept the reviewer's intent and
   changed the mechanism, with the table in DECISIONS.
3. **I walked into TOOLING-TRAPS `:473` while fixing a count.** I put the new commands in a Markdown
   table, which forces `\|`. Then I wrote the WRONG mechanism for why that is dangerous ("matches
   every line"). Measured: BSD grep REFUSES `'^\|'` with `empty (sub)expression` and prints no
   count. A false claim inside the paragraph that warns about the trap. Caught only because I
   re-ran the claim instead of trusting it.
4. **My simulator was proving a sentence the plan does not print.** I narrowed C1-3's wording to
   EXACT after writing `simulate.mjs`, so its snapshots still carried the old sentence. A green run
   there proves nothing about the plan. I caught it on re-read before `plan-code.mjs` ever ran. That
   checker now pins the match (`plan-code.log:1-2`), so the drift cannot recur silently.
5. **Pass 1's C1-3 wording claimed an unmeasured order.** "Then the hosted rules in the rows above"
   covers `DEPLOYMENT_MODE_*`, which the environment loader raises before any target is parsed
   (`packages/register/src/runtime-environment.ts:481`; `environment` is built before
   `apps/api/src/main.ts:300`). The EXACT sentence now claims only the three measured calls.

Not a near-miss, but priced: my own `oracles.sh` was broken on its first run, because BSD awk
rejects `print (b+0)==0 ? …`. It failed loudly: SELFTEST failed 3 checks where 1 was planted, and
the PASS run failed 2. The cost was two runs.

## 3. N3's two errors had two causes — both are process, not knowledge

(i) A **line-based grep cannot see a multi-line `throw new TypeError(`**
(`packages/providers/src/index.ts:786-787`), which gave 15 instead of 16. (ii) **"8 absent" was a
by-eye count** of my own inline output, which printed NINE `ABSENT` lines. That output was never
captured to a probe log, so the reviewer had to re-derive it and I could not re-check it. Inline
measurement is the root. PRICE: one N-finding and one DECISIONS correction.

## 4. Dead ends, so nobody re-derives them

- The file-wide `input_price_micros_per_million` count as an oracle. It depends on prose (4 or 5 at
  C2-6, 3 or 4 after C2-9).
- A guard-order check over the whole refusal span. It is vacuous: the `…PRICE_INVALID` row itself
  says "before".
- `^| \`` (count data rows only). It is exact, but it changes every number and member list;
  `^|` keeps pass 1's 19 and 8.
- Observing the runner's marker rule on a genuinely RED suite. The only RED-at-base suites are
  integration suites that may reach the NO-TOUCH Postgres; the source lines are the evidence.
- Running the plan's TS under real vitest or `pnpm typecheck`: impossible without writing in the
  lane. Instead, Node 26 type-stripping plus a small it/expect shim (`plan-code.mjs`) executed the
  plan's own code blocks (`plan-code.log`). Real vitest and typecheck stay UNVERIFIED; they are
  C1-4's gates.

## 5. Where THIS packet was unclear — exactly

- `packets/ARCH-FIX-S03-p2.md:4` says "the plan is re-issued, not patched by hand", and `:11` says
  "revised IN PLACE". I read it as: one coherent file, produced by targeted edits and then
  re-verified whole (trace, anchors, words, code execution). One minute of doubt; say which you mean.
- `reviews/ARCH-REV-S03-p1.md:32` puts the N3 count correction on the ORCHESTRATOR. The packet
  (`:10`) and the fold (`DECISIONS.md:53`) put it on this seat. The later two agree, but a seat
  reading only the verdict would skip it.
- The F1 ruling ("BUILD handoffs carry the PROGRESS records … transcribed by the orchestrator") is
  in `PROGRESS.md:3`, which is not among this packet's inputs. I found it only by inspecting the
  fold commit. PLAN.md still says "the BUILD seat records … in `PROGRESS.md`" in several steps; that
  wording predates the ruling and is outside my assignment, so it is **named in the handoff, not
  fixed**.

## 6. Upgrades, ranked by tokens saved

1. **A count-oracle law in the ARCH contract and in `packet-check.sh`: every number in a done-when
   cites the log line where its literal command printed it, at that step's boundary.** This kills
   B1 at authorship. Saves a review pass plus a fix pass per slice, ~2 seats, the single largest item.
2. **Make the "simulate the correct edit" harness a template for documentation slices**
   (`simulate.mjs` + `oracles.sh`: snapshots per step boundary, mutants per finding). This pass's
   seven extra members fell out of it in minutes. The same harness is REV(S03)'s ready-made check.
3. **Every checker ships with `SELFTEST=1`**, which plants one false expectation and must FAIL on
   exactly one. It proves the checker CAN fail. A count pattern that matches the wrong lines prints
   OK forever, and that is B1's own failure mode. The exact-one count also localises a broken
   checker: today, 3 failures where 1 was planted. Cost: three lines per script.
4. **Measurements go to a probe log, never inline-only.** Pass 1's "8" would have been caught by
   `wc -l` on a saved file, and the reviewer would not have re-derived it.
5. **No commands inside Markdown tables in PLAN templates; fenced blocks only.** TOOLING-TRAPS has
   carried this since 2026-08-29 (`TOOLING-TRAPS.md:473`, `:565`), and it still caught me after I
   had read it. A template beats a trap entry.

## 7. Toward the one-prompt machine

Pass 1's lesson was "deliver a runnable artifact, not only prose". This pass shows why that is
necessary and not sufficient. Pass 1 ran its ENUMERATION and was right there. It did not run its
done-when COMMANDS, and every B1 member lives in those. The rule that generalises: **anything a
later seat will execute, the planning seat executes first, on the state that seat will see.** Here
that meant the step boundary, not the end state. That one sentence, enforced by a linter, would have
made this pass unnecessary.
