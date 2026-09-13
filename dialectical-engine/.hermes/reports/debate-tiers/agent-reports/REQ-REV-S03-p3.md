# Self-report — REQ-REV-S03 pass 3, the cap (slice S03, ticket `t_d99f6df3`, 2026-09-13)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **PASS, pass 3 of 3** — zero blocking, two folds. The slice goes to ARCH on `SPEC-v3.md`.
Artifact: `docs/missions/debate-tiers/reviews/REQ-REV-S03-p3.md`.
Probes kept: `probes/REQ-REV-S03/{p3-v3-deciding-measurements.sh,.out, p3-runtime-refresh-callsite.out}`.

## 1. The case, closed — and what actually converged it

Three passes: **3 B + 7 N → 1 B + 5 N → 0 B + 2 N.** The shape of that curve is the finding.

- **Pass 1** found defects that were *in the document from the start* (a requirement that could not
  hold, two acceptance steps nobody could run).
- **Pass 2** found one defect that **the fix introduced** — a qualifier appended to a five-item list.
- **Pass 3** found none, because pass 2's lesson was applied structurally: the seat did not patch the
  clause, it **named the five surfaces separately**, which is the form that cannot re-collapse.

**The cause of convergence was not review pressure. It was that each fix moved from prose to
measurement.** v1 argued; v2 measured the oracle; v3 measured the product's own refresh path and let
that break a tie two reviewers had only argued about. The seat's deciding measurement
(`isExactProviderRuntimeRefresh` skips `PROVIDER_DISCOVERY_TARGETS_JSON`) is better evidence than my
pass-2 recommendation was, and it turned my "VERDICT Build A / CONFIDENCE medium" into a fact.

*Upgrade:* when a reviewer recommends a build with CONFIDENCE medium, the fix seat's job is **not** to
adopt it — it is to find the product behaviour that decides it. That is what happened here, and it
should be the written expectation, because a reviewer's recommendation carried on authority is how a
fleet converges on a confident mistake.

## 2. What I nearly got wrong — and the thing I got wrong at pass 2

**I recommended Build A for a reason that was weaker than the real one.** At pass 2 I argued A from
"it is closer to today's product" and from R14's wording, and I raised the unauthenticated-probe
counter against it without noticing that the counter had a *requirement-shaped* answer. The seat found
both: the refresh-path measurement that makes A a fact rather than a preference, and R33, which closes
my own counter instead of merely noting it. **A reviewer who raises a counter should also say what
would close it** — I left that work on the table, and it cost a round-trip of nobody's time only
because the seat did it unprompted.

**I nearly accepted the tie-break on the seat's citation alone.** It cited
`dev-api-environment.ts:310-318` — the function's definition. A definition proves nothing about a code
path; a call site does. I grepped and found it at `:493`, and it is the **first** predicate of the
reuse chain, which makes the claim stronger than stated. Had it been dead code or a fourth-choice
branch, the entire Build A derivation would have been decoration and this pass would have been a V row.
**Rule worth promoting: when a decision rests on "the product already does X", the evidence is the call
site, never the definition.**

## 3. What repeatedly cost tokens across the three passes

1. **Verifying citations that were correct.** Pass 1 spent roughly half its budget confirming ~40
   exact `path:line` citations. Pass 3 spent almost nothing, because the seat's handoff separated
   *"measured this pass"* from *"carried"*, and I only re-opened what was new or load-bearing. Across
   three passes the same conclusion: **a citation checker script is the single highest-leverage tool
   this fleet does not have**, and the discipline that substitutes for it is the handoff's
   measured/carried split.
2. **Numbers restated from memory.** Pass 2's N4 (a handoff saying 430 where `wc -l` says 454) and pass
   1's N1/N2 (a lane commit and a stale suite row) are the same defect three times: **a measurable fact
   written from recall.** Pass 3's handoff measured every count at write time and all six were exact.
   Making `packet-check` compare handoff numbers against the artifacts they name would end this class
   outright.
3. **Reading a SPEC section by section.** A contradiction between line 178 and line 276 is invisible to
   sequential reading. Both of my blocking finds at passes 1 and 2 came from reading **by concept** —
   pulling every sentence about one idea (the declaration oracle; the slot set) next to each other.
   That is mechanisable: a per-requirement concordance of which other requirements mention the same
   surface would have surfaced B1(p2) before a reviewer ever saw it.

## 4. Dead ends — settled, do not re-derive

- **Build A vs B is settled by the product, not by taste.** `isExactProviderRuntimeRefresh`
  (`dev-api-environment.ts:310-318`, called at `:493`) skips the targets JSON, so a key arriving is a
  same-version runtime refresh. B would publish a register version for a non-file event.
- **"Configured but absent from the healthy panel" is a shape the product already enforces** —
  `dev-provider-panel.ts:103-108` throws unless (healthy ∧ credentialed) or (sentinel ∧ uncredentialed);
  `:120-122` excludes sentinel targets from `healthyProviderRefs`. R31 pins a shape, it does not invent
  one.
- **`PLAN_TIER_ROSTERS` must survive as an export** — `tiers-s02-rosters.test.ts` imports it at `:6`,
  asserts it at `:205`/`:209` and uses its **name** as a scan selector at `:78`. Deleting it guts three
  of four cases. R8 removes the id literals, not the export.
- **The quoted-exact declaration oracle** (measured at passes 1, 2 and 3, seven ids, 413 files) and
  **the duplicate-model-across-slots question** (only `provider_ref` must be unique) are closed.

## 5. Where the packets fought me, across three passes

- **Pass 1:** `allowed` said "(append only)" while the same packet ordered a table-row insert. Fixed in
  the next packet — the template learned inside one mission, which is the good case.
- **Pass 2:** a typed section map for a 454-line file; three spot-checks to learn nothing. A section map
  should be generated at freeze, not typed.
- **Pass 3:** nothing. This packet scoped me precisely (B1(p2), R33, the folds, my own predictions),
  told me to **rule R33 IN or OUT with a measurement**, and pre-listed the product lines the seat's
  claims rest on so I could go straight at them. It is the best packet of the three and the reason this
  pass cost a fraction of pass 1.
- **Across all three: `session id` is still not a seat identifier.** I measured it this pass: the
  `.jsonl` named by the fix seat exists but its mtime (15:32) predates both its own pass-3 run and my
  pass-2 work, so it cannot be the live transcript of either. Three seats have now written that path
  into the record as if it identified them. Replace the CLAIM field with the ticket id plus the
  orchestrator's own spawn record, or drop it.

## 6. Toward the one-prompt machine

1. **Evidence for "the product already does X" is the CALL SITE.** Add it to the reviewer contract; it
   was the one thing standing between this pass and a wrong PASS.
2. **A reviewer who raises a counter must name what would close it.** I did not, at pass 2; the seat
   had to invent R33. Cheap to require, and it converts a counter from an objection into a work item.
3. **Never write a qualifier across a list of surfaces.** One line per surface. This was pass 2's only
   blocking finding and pass 3's whole fix.
4. **Split handoffs into "measured this pass" and "carried".** Adopted voluntarily by the fix seat at
   pass 2; it cut my verification cost by roughly an order of magnitude and it is why the cap was cheap.
5. **`packet-check` should verify every number a handoff states against the artifact it names.** Three
   of the fourteen findings across three passes were recalled numbers.
6. **Keep the three-pass cap and keep the passes scoped.** Pass 1 read everything; passes 2 and 3 read
   deltas. The curve 3B → 1B → 0B is what a cap is supposed to produce, and the one defect that
   appeared mid-way was created by a fix — which is exactly the thing a scoped later pass is for.
7. **The blind-review gate earned its cost here.** Over three passes it caught a requirement that could
   not go green, two acceptance steps V could not run, a clause that would have emptied a page, and a
   register-publication ambiguity at the hardest seam in the slice. Every one of them was invisible to a
   reader trusting the document and visible to one who ran a grep or opened a call site.

## 7. Price

This pass: ~20 minutes, one resumed session, no retries, no dead ends. Two probe files, five product
ranges re-opened, one grep that mattered more than the rest (the call site). Across all three passes:
one session, three verdicts, three self-reports, six probe files, zero git writes, zero stack calls,
zero provider calls.
