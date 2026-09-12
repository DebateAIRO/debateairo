# Self-report — seat `REV-S02-p2-product-truth`, mission `debate-tiers`, node REV(S02) pass 2, lens product-truth

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Ticket `t_37e841db` · worktree `.worktrees/rev-s02-p2-product/dialectical-engine` @ `88f8a01f`,
0 dirty at claim and at handoff · verdict **PASS**, 0 blocking, 6 non-blocking · wall clock
13:12 → 13:4x EEST, roughly 35 minutes, one background shell (PID 19880), no retries, no blocked
states, no dead-end reruns.

---

## 1. The cause, not the symptom: what actually happened at this node

**The single most expensive thing in this pass was written by me, at the previous pass, and it cost a
whole FIX node.**

At pass 1 I raised product B1 and — correctly, per law 3.2 — named the class and enumerated its
members: *(a) all-members-missing Free, (b) empty panel, (c) the 422 face, (d) all-members-missing
Premium*. F2 swept all four, exactly, and closed them; I re-applied the pass-1 mutant M2 today and it
fails precisely those four tests. **But my enumeration was wrong, not incomplete-by-accident: I
enumerated the members of the SYMPTOM ("the all-members-missing shape"), not of the CLASS I had
myself written down ("refusal-message content is asserted for some tiers and not others").** The
single-missing-member shape — which is *today's Premium*, one of the two shapes the oracle sends V to
run at acceptance steps 6–7 before row V-7 — was never in my list, and it is still unpinned at this
head (mutant M2b survives, C2 58/58 green). F2 even measured it themselves ("singular-message-only
change left the all-missing set GREEN") and filed it as a *neighbour proving specificity* rather than
as an open member, which is exactly what a seat does when the reviewer's enumeration reads as
exhaustive.

Price: one N at this pass that should have been inside B1 at the last one. If it had been in the
list, F2 would have fixed it in the same commit for one extra `toMatchObject` line. Instead it is a
ticket, a route, and — if anyone insists on it — potentially a third FIX node and the last lawful REV
pass.

**The upgrade this argues for, and it is mechanical.** A class enumeration should be produced by a
COMMAND, not by prose. When a seat writes "the class is X, members (a)…(d)", the packet should
require the grep or the parameter sweep that generated the list, pasted verbatim, the same way the
protocol already requires a three-run table for a suite. For B1 the generating command was one line —
enumerate the distinct values of `missing.length` the code can produce (`1`, `roster.length`, and the
intermediate) and demand one exact-message assertion per value. Three shapes, three assertions, no
judgement. A hand-written member list is a guess wearing the costume of a sweep, and law 3.2 does not
currently distinguish the two.

## 2. What repeatedly costs tokens in this fleet, priced

1. **Re-deriving line numbers that moved.** My pass-1 N6 said the frozen SPEC's citations had drifted
   by one line; at this head F1's 13-line helper pushed `DiscoveredPanelMember` from `974-980` to
   `987-993`, and I spent a full read + grep cycle re-measuring every `path:line` in my own §3.2
   sweep for the second time. Fifteen places, twice, two passes. **Fix: stop citing line numbers for
   anything append-only.** Cite `file` + a unique anchor string (`const filteredPanel = roster`), and
   let the reader `grep -n` it. The protocol already knows this (R14's own note says a line citation
   is checked at the moment it is used) and then every packet and every SPEC does it anyway.
2. **Probes that hard-code an observation from a previous head.** The promoted correctness probe
   `slice-probe` reports `1 failed | 6 passed (7)` at this head purely because it asserts the
   pre-fix `TypeError`, which F2 turned into `AskRefusal/ASK_PLAN_TIER_INVALID`. Every downstream
   reader now has to re-derive that this red is intentional. **Fix: a promoted probe PRINTS the
   observation and asserts only the invariant.** My two promoted p1 probes do exactly that and both
   re-ran 5/5 and 4/4 unchanged across a FIX that rewrote both database write paths — zero
   interpretation cost.
3. **Reading the author's tests instead of running mutants.** The cheapest possible version of this
   pass would have been "the four tests now carry `message:` strings, PASS" — ten minutes and wrong
   in two places (N1 and N2 are both invisible from the patch). Eight mutants cost about eight
   minutes of wall clock at 1–16 s a cluster and produced every finding I have. **Mutation is the
   cheapest review tool in this fleet and it is still not a packet requirement with a floor count.**

## 3. What I nearly got wrong

- **I nearly called N1 blocking.** Under the letter of law 3.2 ("a FIX that closed the sample and not
  the class is a B") it qualifies: F2's own handoff restated the class more broadly than my four
  members and then left one open. I went the other way because (i) the members-missing model IS named
  in that shape — control mutant M2c is caught, so the honesty law itself holds; (ii) acceptance
  step 6 passes on the mutant build; and (iii) the open member is the residue of my own pass-1
  under-enumeration, and charging pass 3 — the last lawful one — for a tier label would have handed V
  a DECISIONS row instead of a merge. If V disagrees with that trade, the rule to change is not my
  judgement but law 3.2's silence on *who owns a class the reviewer mis-enumerated*.
- **I nearly wrote `ASK_PLAN_TIER_INVALID` up as a V row**, which the dispatch comment explicitly
  invited. Building the probe instead of arguing killed it in ninety seconds: nine out-of-vocabulary
  shapes, all `400 MALFORMED_REQUEST`, plus a client-side guard at `apps/ui/lib/api.ts:376` that
  refuses before the request leaves the browser. There is no product face, so there is nothing for V
  to decide. A V row would have cost V real attention on a code no asker can see.
- **I nearly trusted the packet's freeze-pair sentence.** It says the mission-tree diff "is exactly
  what the seats under review changed"; they changed nothing there. One `git diff --name-only` caught
  it (N4).

## 4. Dead ends — do not re-derive these

- **The pre-0061 "silent tier loss".** F1's conditional write means a run started against a database
  without migration 0061 records no tier at all, silently, and R11's stated purpose is billing. It
  looks like a finding and is not: migrations run through `apps/runner/src/migrate-cli.ts:6` and the
  dev-auth data plane under a typed `DEV_AUTH_DATA_PLANE_MIGRATION_FAILED` step
  (`apps/runner/src/dev-auth-data-plane.ts:100`), so a missing 0061 is loud where it matters, and in
  practice the pre-0061 path exists only for the truncated-migration suites. Recorded in §5 of the
  artifact.
- **`LibraryComposer`'s dead "start" button.** `apps/ui/components/LibraryComposer.tsx:29-37` never
  starts a debate — `apps/ui/lib/api.ts:374`'s `risk_tier` guard throws first and a bare `catch {}`
  routes the user to `/new?topic=`. S02's new `plan_tier` guard at `:376` changes nothing, because it
  never runs. Pre-existing, already ticketed (REQ-REV-p1 B2). Not S02's.
- **The three `s14-contract` failures.** Pre-existing at `BASELINE.md` 2/5, another mission's, in
  every run of every pass. They will keep costing every seat a paragraph until someone puts a single
  line at the top of the review package README saying "C3 rc=1 is expected; here are the three names".

## 5. Where THIS packet was unclear, exactly

- **`.hermes/planning/debate-tiers/packets/REV-S02-p2-product-truth.md:17`, the `verification` line:**
  "your OWN fixtures for the whole slice, **both modes on UI** · … · on UI: rendered DOM with the real
  compiled CSS measured against the oracle's artboards". This is a `ui: no` slice with no `DONE.md`.
  Pass 1's product lens recorded the same defect and it is still in the pass-2 packet, so the template
  is not branching on the slice's `ui` flag. It is not a blocker — the line self-cancels — but it
  makes a reader stop and check whether they are the seat that missed a UI surface. **Fix: emit the
  UI clauses only when `SPEC.ui: yes`, and on a `ui: no` slice replace them with one sentence saying
  there is no oracle beyond SPEC-v2 §2.**
- **`:10`, the `inputs` line, is 1 200 characters long and holds six separate obligations**
  (the review package, the worktree, two oracle files, the pass-1 union, my pass-1 artifact, the
  freeze pair with a trap warning and a misattribution). It reads as one sentence. I read it three
  times. **Fix: one obligation per bullet; the trap warning is its own bullet.**
- **`:25` charge 2 packs six numbered sub-charges into one paragraph-bullet** that runs to nine lines,
  with sub-charge (6) — "the cluster commands three times against `reverify-88f8a01f.txt`" — hidden at
  the very end of the last one. The single most time-consuming duty of the node is the last clause of
  the last sub-item of the second charge. **Fix: the three-run cluster table is charge 1 of every REV
  packet, always, on its own line, because it is the only duty with a fixed cost and it should start
  in the background before anything is read.** I did that by instinct at 13:13 and it was the single
  best scheduling decision of the run — the nine minutes of cluster runs overlapped every read.
- **Nothing else fought me.** The freeze-pair trap warning was accurate and saved a real error; the
  `allowed` list covered every deliverable exactly; the cwd, the head and the comment cursor were all
  correct; the promoted-probe contract (runnable from any worktree, mutant restores from captured
  bytes) is now precise enough that I could write a conforming probe without re-reading it.

## 6. Toward the one-prompt machine — three upgrades, in order of payoff

1. **A `class-sweep.sh` obligation on every B finding.** The finding names the class; the seat that
   raises it must ALSO commit a script under `probes/` that ENUMERATES the members and exits non-zero
   while any member is open. The FIX seat runs it, the next REV seat runs it. Today the enumeration
   is prose, the sweep is a promise, and my B1 is the proof that prose enumerations leak. This is the
   single change that would have removed this pass's entire N1.
2. **Ban line numbers from every frozen artifact; require anchor strings.** SPEC citations, packet
   citations, cluster-map citations. `file + "unique anchor"` is grep-able, survives any insertion
   above it, and removes a whole recurring finding class (pass-1 N4 and N6, pass-2 N5) plus the
   re-measurement tax in §2.1.
3. **Start the fixed-cost verification before the first read.** Every REV packet should open with the
   exact background command for the three-run cluster table and the promoted-probe re-runs, so the
   seat launches it in its first tool call. Here that was ~9 minutes of wall clock that cost nothing
   because it ran under the reading. In a fleet of parallel lenses that is minutes per seat per pass,
   free.

## 7. Numbers

| what | value |
|---|---|
| clusters re-run | 4 × 3 runs, all identical, all matching `reverify-88f8a01f.txt` |
| promoted pass-1 probes re-run | 2 of mine (5/5, 4/4) |
| new probes written and promoted | 2 (one fixture, one mutant script), both re-run from the promoted copy |
| mutants applied and restored | 8; every restore byte-equal (`shasum -a 256`), `git status --porcelain` 0 after each |
| mutants that survived | 2 (M2b → N1, MDUP/MDUP2 → N2) |
| findings | 0 blocking · 4 new N (N1–N4) · 2 re-raised on existing tickets (N5, N6) |
| packet defects against the orchestrator | 1 blocking-none (N4, the freeze-pair misattribution) + 1 recorded here (the UI clause on a `ui: no` slice, second pass running) |
| rows for V | none; V-28/V-29 confirmed untouched, `ASK_PLAN_TIER_INVALID` ruled not a V question |
| processes started | 1 (PID 19880, the cluster script; exited on its own) · no dev server, no browser, no terminal on V's desktop |
