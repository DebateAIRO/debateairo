# REQ-REV pass 2 — mission `free-public-debates`

- seat: REQ-REV-02 · node: REQ-REV · pass: **2 of 3** · ticket: `t_7c3bd32e`
- work under review: REQ-FIX-02 artifacts frozen at `69d119c5` (`SPEC-v2.md` the SPEC of record)
- verdict: **PASS**
- probes: `.hermes/reports/free-public-debates/probes/REQ-REV-02/` (`probe-p1-copy.sh`, `probe-p2.sh`, `probe-p2.out`, mutants). Pass-1 `probes/REQ-REV-01/probe.sh` was copied, never executed in place (sha256 `d062d862…` / `probe.out` `56b038f3…` unchanged).

Pass 2 is scoped to p1 findings B1, B2, B3, N1…N7 and the revision that answers them. N8 (packet defects) is the orchestrator's (`t_5b665910`) and is named, not re-tried.

## 1. What was verified, and how

| claim | how | result |
|---|---|---|
| `SPEC.md` byte-identical to `06e4eceb` | `git diff --stat 06e4eceb -- docs/missions/free-public-debates/slices/S01/SPEC.md` → 0 lines; checker `cmp` → YES | holds |
| freeze `03a59ae1..69d119c5` is the FIX write | `git diff --stat` from packet cwd: INSTRUCTIONS, V-DECISIONS (+V-6), DECISIONS append, PLAN, PROGRESS, SPEC-v2.md, spec-v2-check.sh. No product files. `SPEC.md` absent from the diff | holds |
| `ui: no`, one slice, no `DONE.md` | SPEC-v2.md:3 `ui: no`; S01 has no DONE.md | holds |
| R-1…R-25, no R-26 | unique R-ids 1–25 (probe S9) | holds |
| INSTRUCTIONS.md ≤ 100 | `wc -l` → **92** | holds |
| banned words in SPEC-v2 | grep → NO_HITS | holds |
| AskRequestSchema has eleven keys | `packages/contract/src/index.ts` object keys = 11 | holds; p1 B3.1 said ten, FIX was right |
| route table 52 / apps/ui delta 0 | checker repo-facts block | holds |
| REQ-FIX SKILLS LOADED | orchestrator CONSUMED on `t_9e5427b1`: receiving-code-review + heartbeat-requirements this pass; other three at REQ READY, same transcript | holds; floor met |
| stack not served | charge 4 / intake no-touch | no listener probed |

Cluster commands: PLAN.md §1 still three empty scaffold rows. None to run.

## 2. The REQ-FIX packet

Reviewed `packets/REQ-FIX-02.md` first. Assigned findings B1, B2, B3, N1–N7 match the p1 verdict (N8 excluded). Output list names SPEC-v2, INSTRUCTIONS, PLAN, DECISIONS append, detector. Allowed list matches those deliverables (PROGRESS excepted). Four packet defects they reported on `t_9e5427b1` are real:

1. Running `probes/REQ-REV-01/probe.sh` would tee into that directory's `probe.out`. Confirmed: the script's `ROOT="${0:A:h}"`. This packet (REQ-REV-02) repeats the same trap and tells the seat to copy first — obeyed.
2. Detector lives under `slices/S01/` because the FIX allowed list has no probes dir.
3. DECISIONS append vs re-point: they appended §5 rather than editing §1–§4.
4. Line 4 of SPEC-v2 is one ~200-word SUPERSEDES line. It does name the pass, REWORK, and every changed requirement.

No additional packet defect that would have let a finding through. Charge "no new requirements" is checkable by R-id set; their checker does not assert it (N3 below).

## 3. Each p1 finding against SPEC-v2 — ADDRESSED or not

Detectors: pass-1 P9/P10 re-implemented against both files (probe S3/S4); `spec-v2-check.sh` run on SPEC-v2 (PASS, rc 0), on frozen SPEC.md (FAIL, rc 1), on a B1 mutant (FAIL, rc 1). READY comment sentences were checked in the file, not taken as the claim.

| id | p1 failure | sentence in SPEC-v2 (READY quote checked) | detector | verdict |
|---|---|---|---|---|
| **B1** | R-8 outstanding=0 vs R-9 "PRIVATE with nothing outstanding is a violation" | R-9: "After a **publishable bound run's** answer is served…" + "This requirement says nothing about a run that is not publishable" (`SPEC-v2.md:76-81`); R-8: "R-9 does not apply to it" (`:75`). Sweep: R-5 (`:58-60`), R-7 (`:67-70`). R-4 already used publishable. Dual check at `:81-84` requires both tests green in one run. | P9: SPEC.md B1 closed=False; SPEC-v2 B1 closed=True. Mutant unscope R-9 → checker FAIL. | **ADDRESSED** |
| **B2** | unnamed visibility field vs `.strict()` two-field schema | R-11 names `publish_pending`, optional, present `true` iff outstanding, absent otherwise (`:87-108`). Four constraints: no third `state` value; other responses byte-identical; no `apps/ui` edit; deploy-skew residual written. Check JSON is pinned. V-ROW → V-6. | checker B2 needles present; p1 phrase "in a field a test names" gone. | **ADDRESSED** |
| **B3** | walk returns 400 / unmarkable "usual success" | §4.0 pins CSRF+Origin, step-up body, `step_up_grant.token`. Steps 2/12: eleven keys + 202 `{run_ref,status:QUEUED}`. 7/8/14: `copies_may_persist_acknowledged: true`. 13/15: `warning_acknowledged: true`. 10/15: `DELETE_PRIVATE_DEBATE`. Example enums match `packages/contract/src/index.ts:5-8`. | P10: SPEC.md NO_HITS; SPEC-v2 hits on all three literals + `step_up_grant.token`. | **ADDRESSED** |
| **N1** | anonymous DELETE unnamed | R-18 / step 9: `401 {"error":"SESSION_REQUIRED"}` citing `index.ts:515` (`:141-145`, `:327-328`). | checker N1 | **ADDRESSED** |
| **N2** | R-22 cited `publications.ts:301-321` (unpublish) | cite `publications.ts:382-407`, catch `:401-402` (`:184-185`). Drifted `:301-321` gone. Class sweep: `public_ref`/`published_at` revalidation at `:397-398` named as member 2 (`:188-191`). Re-measured: those lines are the comparison. | checker N2; product read | **ADDRESSED** |
| **N3** | CSRF unnamed | §4.0 three headers including `x-csrf-token` and `origin: $WEB` (`:242-247`). Origin is the extra member FIX found (`index.ts:504`). | checker N3 | **ADDRESSED** |
| **N4** | R-21 unnamed row; refusal half beyond charge 6 | refusal half **removed** with a scope note (`:173-176`); failure half pinned to `append_audit_event_internal` (`:167-172`). Residue in DECISIONS §8 (pointer in the SPEC is wrong — N2-p2). | checker N4 | **ADDRESSED** as a requirement |
| **N5** | `$WEB` page path unnamed | step 6: `$WEB/` and `$WEB/public/debate/<free_ref>` citing `apps/ui/app/public/debate/[id]/page.tsx` (`:307-309`). Both paths exist. `$WEB/login` exists (`apps/ui/app/login/page.tsx`). | checker N5; dir list | **ADDRESSED** |
| **N6** | no poll timeout; first page only | step 3: every 10s, at most 15 minutes, stop UNVERIFIED (`:297-300`). Steps 1/4/8/11/12 paginate `offset=0,100,200,…` until empty. | checker N6 | **ADDRESSED** |
| **N7** | INSTRUCTIONS still said V-1…V-4 after V-5 | INSTRUCTIONS.md:12,44 now V-1…V-5; slice oracle and TOC point at SPEC-v2.md; SPEC.md kept as a labelled superseded row. | checker N7; wc 92 | **ADDRESSED as the assigned instance.** The class recurred for V-6 (N1-p2). |
| **N8** | packet defects P-A…P-F | not assigned. NAMED, not re-tried. | — | out of scope |

## 4. Changed text — second reading, new contradiction, new scope

Diff SPEC.md → SPEC-v2.md is 228 insertions / 99 deletions, concentrated in R-5, R-7, R-8/R-9, R-11, R-16 (success body spelled), R-18, R-21, R-22, §3 one-line note that R-11 may move `s8-publication-contract`, and §4 rewritten.

No new R-number. R-22.2 (revalidation) is the N2 class sweep, not a new requirement. R-11 is the B2 pin plus a V-ROW, not extra scope.

No new B1-shaped contradiction: R-9's general clause now sits only next to the publishable scope, and R-8 disclaims it. Vocabulary (`:24-26`) defines publishable once.

R-21's cite of `migrations/0040_account_erasure.sql:4136-4141` is the *authenticated denial* branch of a function that today requires a session. A system-path failure (R-4: no session) cannot reach those lines until ARCH changes the function. The *observable* (two failed attempts → two audit rows naming the run) is still unique. HOW remains ARCH's. Not a blocking contradiction.

§4 walked as a stranger holding only the step text: every mutating body is pasted; 202/`run_ref` is named; grant actions are the enum; CSRF+Origin are named; poll has a stop; pagination is full; anonymous 401 is named. Still **UNVERIFIED** against a live `$API`/`$WEB` (charge 4). `$WEB/login` and `$WEB/public/debate/[id]` exist in the tree.

## 5. Attack on `spec-v2-check.sh`

The checker proves substring presence/absence plus three repo facts. It does **not** prove the SPEC has no new requirement, that DECISIONS section pointers resolve, or that the V-range in the compass matches the V packet.

| fixture | expected | observed |
|---|---|---|
| SPEC-v2.md | PASS | PASS rc 0 |
| frozen SPEC.md | FAIL | FAIL rc 1 (old defects + missing SUPERSEDES line) |
| mutant: unscope R-9 | FAIL | FAIL rc 1 (B1 needles) |
| mutant: append `R-26` | should FAIL if "no new requirements" were pinned | **PASS rc 0** |

A checker that only ever passed would be a decoration; this one fails the B1 mutant and the frozen SPEC. It does not fail a new R-n. That gap is N3-p2, not a SPEC defect — unique R-ids on disk are still 1–25.

Its N7 assertion *requires* the string `V-1…V-5` and fails `V-1…V-4`. Updating the compass to `V-1…V-6` (the packet after V-6 was transcribed) would make the checker FAIL. It conserves the class it closed.

## 6. Findings this pass

None blocking. Non-blocking, same day:

**N1-p2.** `INSTRUCTIONS.md:12,44` and `SPEC-v2.md:8` still say rows V-1…V-5 after V-6 was transcribed into `V-DECISIONS-PACKET.md:12` at freeze `69d119c5`. This is the N7 *class* (compass V-range lags the V packet). The assigned instance (V-5 missing) is closed. `spec-v2-check.sh:95-98` pins `V-1…V-5`, so a correct compass update goes RED. Fold: name V-6 in the compass and in SPEC-v2's authority line; point the checker at "every row id that exists in the V packet", not a frozen range.

**N2-p2.** Two section pointers in SPEC-v2 land on the wrong DECISIONS section: R-11.4 (`SPEC-v2.md:104-105`) says the alternative V-ROW is `DECISIONS.md` §3 — §3 is V-5 (delete-while-public); the row is §9 / V-6. R-21 (`:175`) says residue is `DECISIONS.md` §4 — §4 is REQ-01's contradiction log; residue is §8. Class: a SPEC pointer into DECISIONS that names a section by number after an append-only file grew. Fold: point at §9 / §8, or at the V-ROW id.

**N3-p2.** `spec-v2-check.sh` does not assert "no R-n outside 1–25". Mutant R-26 PASSES (probe S8). Charge 3 of this packet treats a new requirement as a finding; the detector would not have caught one. Fold into the checker, or keep the unique-R-id grep as the REV probe.

Packet defects (this packet, REQ-REV-02): charge 2 correctly forbids executing the pass-1 probe in place; the copy still hard-codes `SPEC.md` in P9/P10, so "run the copies against SPEC-v2" requires editing the copy. Reported, not blocking. Charge 3 of REQ-FIX forbidding new requirements is not mirrored in the handed-forward checker.

## 7. UNVERIFIED

- Every §4 step against a live `$API` / `$WEB` — charge 4, no-touch listeners, none started.
- Baseline suites not re-run (COMMON §6 cite).
- Whether a currently-served UI process was built from this commit's `packages/contract` — R-11.4 residual, not probed.
- Cluster commands — scaffold empty.

## 8. PREDICTIONS

ARCH will add `publish_pending` as an optional key on `PublicationTransitionSchema` and teach the visibility handler to emit it only while outstanding. ARCH-REV should check that `.strict()` still rejects undeclared keys and that a Premium never-published read remains two-key JSON (R-11.2). If V-6 is ruled internal-only, R-11 must supersede — that is the falsifier. The DECISIONS §3 pointer (N2-p2) is the one ARCH will follow first and it leads to the wrong V-ROW.

## Verdict

**PASS** · pass 2 of 3 · B1 B2 B3 N1–N7 ADDRESSED as assigned · N7's class recurred as N1-p2 (V-6) · N2-p2 section-pointer drift · N3-p2 checker does not pin "no new R-n" · no blocking finding.
