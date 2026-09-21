# REQ-REV pass 3 — mission `free-public-debates`

- seat: REQ-REV-03 · node: REQ-REV · pass: **3 of 3 (the cap)** · ticket: `t_614cf0c1`
- work under review: REQ-FIX-03 artifacts frozen at `22d115bc` (`SPEC-v3.md` the SPEC of record)
- verdict: **REWORK** — a REWORK at pass 3 is a **V row**, not a fourth pass
- probes: `.hermes/reports/free-public-debates/probes/REQ-REV-03/` (`probe-p3.out`, `checker-on-v3.out`, `checker-on-v2.out`, `mutant-r26.md`, `mutant-one-route.md`)

Scoped to the three union findings assigned to REQ-FIX p3: **P-B2**, **S-N7**, and the **oracle half of C-B1**. Everything else in `REV-S01-p1-UNION.md` is named, not re-tried.

## 1. What was verified, and how

| claim | how | result |
|---|---|---|
| change set is `5ffdfa13..22d115bc` | `git diff --stat` from mission home on `slices/S01` + `INSTRUCTIONS.md` → 6 files, 755/17, no product | holds |
| `SPEC.md` / `SPEC-v2.md` frozen | checker `cmp` against `06e4eceb` / `69d119c5` → YES; `git diff --stat` empty | holds |
| `ui: no`, R-1…R-25, no R-26 | SPEC-v3.md:3; unique `**R-n**` = 1–25 | holds |
| INSTRUCTIONS.md ≤ 100, V-1…V-10 | `wc -l` = **94**; lines 12, 45 | holds |
| banned words in SPEC-v3 | grep → NO_HITS | holds |
| REQ-FIX SKILLS LOADED | orchestrator CONSUMED: floor verified at REQ READY / REQ-FIX p2, same transcript | holds |
| spec-v3-check.sh 45 assertions | run on SPEC-v3 → **PASS rc 0**; on SPEC-v2 → **FAIL**; R-26 mutant → **FAIL** (26 ids); one-route mutant → **FAIL** | holds; pass-2 N3-p2 gap is closed |
| stack not served | charge 5 | no listener probed |

## 2. The REQ-FIX packet

Reviewed `packets/REQ-FIX-03.md` first. Assigned findings match the union (P-B2, S-N7, C-B1 oracle). Output is SPEC-v3 + INSTRUCTIONS + PLAN + DECISIONS §26–§30 + spec-v3-check.sh. Allowed list matches. Five packet defects they reported on `t_f58de68f` are real; (2) the `git -C <lane>` prefix is correct in *this* packet (REQ-REV-03.md:31 uses `fpd-s01` as git root + `dialectical-engine/` in the path — measured, it runs). (3) "decidable from the snapshot and the run alone" vs the parity assertion is still in the Check header (N1-p3).

## 3. Charge 3 — the definition against the code at `db4758da`

Predicate under review: *a route is answer-serving exactly when a success reply of that route sends a body parsed by `AnswerSchema`*.

`git -C …/fpd-s01 show db4758da:dialectical-engine/apps/api/src/index.ts`:

| route | policy | send | schema |
|---|---|---|---|
| `GET /v1/runs/{id}/answer` | `:163` | `:1115` `reply.send(AnswerSchema.parse(answer))` | AnswerSchema → **in** |
| `GET /v1/answers/{id}` | `:154` | `:1007` `reply.send(AnswerSchema.parse(answer))` | AnswerSchema → **in** |
| `GET /v1/answers` | `:153` | `:984-994` | AnswerIndexSchema → **out** |
| `GET /v1/answers/{id}/inspection` | `:155` | `:1010-1024` | InspectionSchema → **out** |
| `GET /v1/answers/{id}/nodes/{nodeId}` | `:156` | `:1033-1041` | NodeSchema → **out** |
| `GET /v1/answers/{id}/ledger-digest` | `:157` | `:1026-1031` | ExecutionLedgerDigestSchema → **out** |

`grep -n AnswerSchema.parse(` at that commit → **exactly 2 hits**, the two table rows. POST `…/investigations` and `…/memory-link/unlink` contain `/answers` in the path and do not parse `AnswerSchema`. The four projection routes are excluded for the reason given (they do not return the whole answer). Including them would publish on a node fetch, which is stricter than V-10 / I-1.

A stranger adding a new route knows what it owes: if the success reply is `reply.send(AnswerSchema.parse(…))`, it is answer-serving from that moment and must carry the same publish trigger (§1:49-56), with two mechanical consequences (parse-site count; no 200 to a bound owner without R-4/R-9). That is one build.

At `db4758da` only `GET /v1/runs/:id/answer` calls `tryAutoPublish` (`:1109-1111`). `GET /v1/answers/:id` does not. That is P-B2's product gap, assigned to FIX-A after this SPEC. Not a SPEC miss.

## 4. Each assigned finding against SPEC-v3

READY sentences checked in the file.

| id | p1 failure | sentence in SPEC-v3 | detector | verdict |
|---|---|---|---|---|
| **P-B2** (V-10) | SPEC-v2 named one route; `GET /v1/answers/{id}` serves the same answer with no auto-publish | §1:24-56 defines *answer-serving route* by the `AnswerSchema` predicate, tables both routes with send sites at `db4758da`, excludes the four projections, binds later routes, states two mechanical tests. R-4 Check runs once per route (`:89-93`). R-9 Check names "the answer-serving route the test used" (`:148-151`). Acceptance 3b/3c/11b added (`:375-388`, `:433-438`). | checker P-B2 needles present; one-route mutant FAIL; SPEC-v2 still has the old sentence (RED frame) | **ADDRESSED** as a definition. The walk that is supposed to prove V-10 then contradicts itself at step 4 (B1-p3). |
| **S-N7** | R-6 Check scanned user-authored text and failed on the owner path | R-6 (`:98-133`): does not govern the owner's words; email-in-question is not a violation on either path; three assertions (identity, parity, machine-filled fields) replace the scan. | checker S-N7; old "no … email address anywhere" forbidden and absent | **ADDRESSED** |
| **C-B1 oracle** | R-6 Check asserted nowhere on the system path; `ownerRef` mutant left suites green | Check runs against the **decrypted system-path snapshot**, never the transition parameters; `0067:336` cited and re-measured (it is `v_pseudonym IS DISTINCT FROM p_expected_pseudonym`); identity assertion kills `author_pseudonym = owner_ref`; "at least one test … turns RED under the B1 mutant". Implementation of that test remains FIX-A (union C-B1, DECISIONS §29). | checker C-B1; `:336` verified at `db4758da` | **ADDRESSED** as an oracle |

## 5. Changed text — silent invalidation, new R-id, unlisted change

No new R-id. Supersession line lists §1, R-4, R-6's Check, R-9's Check, §4 steps 3b/3c/11b and step 11's total. R-25 inherits the wider "served" definition without a wording change — listed as unchanged in substance, which is true of the paragraph.

P-B2 *intentionally* invalidates the built one-route trigger. That is inside the assigned findings. DECISIONS §29 names the knock-on: P-B3/C-B2 now apply at two sites. Not silent.

Folded N1-p2/N2-p2 pointers: R-11.4 now `DECISIONS.md` §9 / V-6 (`SPEC-v3.md:174`); R-21 residue `§8` (`:244`); compass V-1…V-10. Those were declared on the supersession line as folded, not new scope.

## 6. Findings this pass

### Blocking

**B1-p3.** `slices/S01/SPEC-v3.md:375-392` — after steps 3b and 3c a **second** Free debate is public, then step 4 still expects `total` = step-1 **plus 1**.

- Input: V has completed steps 1, 2, 3 (first Free debate published), 3b, 3c (second Free debate published through `GET /v1/answers/{id}`).
- Step 4 (`:390-392`): expected `total` is the step-1 value plus 1, and the step-2 question appears once.
- Observable: `GET /v1/public/debates` `total` is step-1 **plus 2** (both question lines present). A stranger cannot mark step 4 done.
- Step 11 was amended to plus 1 *because* `<free_run2>` is still public (`:429-431`). Step 4 was not. The class is: an acceptance total not updated when a second published debate was inserted earlier in the walk.
- Evidence: SPEC-v3.md:385-388 (3c expects the second question in the public list) then :390 (plus 1). Checker does not pin step 4's total (probe).
- This is not a finding the coder can close against the SPEC as it stands — the walk text is wrong. Pass 3 cap: **V row**, not REQ-FIX p4.

```
V-ROW: NEW · S01 · t_2e15bf90 · Acceptance step 4's expected public-list total after 3b/3c
Steps 3b/3c publish a second Free debate before step 4. Step 4 still says total = step-1 plus 1.
Recommended default: change step 4 to plus 2 (and keep 11 at plus 1, 11b back to step-1).
Smallest yes/no for V: "After 3c, should step 4 expect two new public debates (total = step-1 + 2)?"
VERDICT: plus 2 / CONFIDENCE: high / STRONGEST COUNTER: move 3b/3c to after step 4 so the original plus-1 stays true — that also works and keeps step 4 as the first-debate check; either default is one sentence.
```

### Non-blocking

**N1-p3.** `SPEC-v3.md:108-119` R-6 Check header says "decidable from that snapshot and the run row alone", then assertion 1 joins `identity.session` and assertion 2 needs a second (owner-driven) snapshot. Two seats will drop parity or the session clause. The three numbered assertions are still unique; the header overclaims "alone". REQ-FIX-03 named this as their packet defect (3). Fold: drop "alone" or say "snapshot + run row + one owner-driven control snapshot".

**N2-p3.** `PLAN.md:316` (C2-S3.3, not in the v3 wording diff's trace table) still tells the coder to scan decrypted JSON for email. The §3 trace row now says that step does not execute the snapshot builder and adds an open FIX-A step. Stale body vs rewritten Check. Coder closes by following SPEC-v3 R-6, not C2-S3.3's scan.

**N3-p3.** `spec-v3-check.sh` does not assert step 4's total against the number of debates 3b/3c published, and does not require `ExecutionLedgerDigestSchema` in the projection exclusion list (SPEC lists it; dropping it from the SPEC would still PASS). R-26 *is* now killed.

**N4-p3.** Step 3b polls `GET /v1/answers?limit=25&offset=0` only. An owner with more than 25 answers can miss `<free_run2>`. Same class as p1 N6, smaller surface.

## 7. UNVERIFIED

- Every §4 step against a live `$API` / `$WEB` (charge 5).
- Whether `GET /v1/answers` lists an item before `GET /v1/answers/{id}` would 200 — step 3b/3c order. Not served.
- Cluster commands — coding seats'; REQ writes no code.
- Lens probe files — packet named UNION + SPEC, not the lens probes.

## 8. PREDICTIONS

FIX-A will hang `tryAutoPublish` under `GET /v1/answers/:id` next to `:1007` and write the R-6 decrypted-snapshot test. If they do not also put the C-B2 visibility re-read and P-B3 enqueue-before-attempt under **both** send sites, pass-2 lenses will re-file those as still open at the second route — DECISIONS §29 already says so. V walking §4 will fail at step 4's total before ever reaching 3c's proof of V-10's *success* condition… no: 3c runs *before* 4, so V will see V-10 work and then fail the next numbered step on `total`. That is the falsifier of a PASS.

## Verdict

**REWORK** · pass 3 of 3 · B1-p3 (step 4 total) is a **V row** · P-B2 / S-N7 / C-B1-oracle ADDRESSED as definitions · N1-p3…N4-p3 to fold.
