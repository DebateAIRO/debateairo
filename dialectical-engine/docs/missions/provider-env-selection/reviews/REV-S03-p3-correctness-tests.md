# REV(S03) pass 3 of 3 — lens correctness-tests — REWORK (V row)

Seat REV-PES-S03-p3-correctness-tests · ticket t_6c233407 · agent `ab2e794c86368ef69` (fresh blind Claude Opus) · worktree `.worktrees/pes-s03-rev-ct/dialectical-engine` detached at **9f29022f3** on base **a6d6382ba**, dirty 0 at start and at end · 2026-09-25 21:01–21:2x EEST.
Scope (packet charge 9): is the rebased slice still true to SPEC-v3 R3.1–R3.9 against dev's README and source, and did the rebase weaken any pin?
Probes, all runnable from any lane (root from argv or `$WORKTREE`): `.hermes/reports/provider-env-selection/probes/REV-PES-S03-p3-correctness-tests/`: `cluster-commands.sh`, `accept.sh`, `red-at-base.sh`, `typecheck.sh`, `source-lines.sh`, `enumeration.mjs`, `mutants.py`, `rev-pes-s03-p3-ct-behaviour.test.ts`, each with its `.out` or `.log` beside it.

## Short answer

The rebase weakened no pin. Every mutant that passes 1–2 and the rebase seat proved RED is RED at 9f29022f3: 38 of 38, plus 21 FIX-p1 class members. Every residue that was GREEN stays GREEN (R1, R2, retype). The two changed pins (the stale banner and the "two rows above" order) each fail on their mutant. The suites, the typecheck, the four RED-at-base pairs, the empty product diff and the byte-identical architecture file all hold.

**One requirement regressed in the rebase:** R3.3's Meaning clause for `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` (B1). Pass 3 is the last pass, so this REWORK is a V row.

## Findings

### B1 — R3.3: the rebase replaced a source-exact Meaning cell with dev's cell, which omits an emitting condition
- **Where:** `deploy/vps/README.md:1040` — `| \`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID\` | a price that is not a whole, non-negative number, or only one of the two price members. |` (KEPT-DEV, dev a6d6382ba:1032).
- **Source that throws it:** `packages/providers/src/index.ts:193-195`: `typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER` → `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. Also `:277-278`, the pair rule.
- **Concrete failure:** a target with `"input_price_micros_per_million": 9007199254740992` (2^53, a whole non-negative number) is refused `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` by the shipped parser. `probes/…/behaviour.log` shows `"MAX_SAFE+1 (2^53)": "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"`. The table row describes that input as admitted.
- **Rebase-introduced:** at the pre-rebase head 60993d2db the slice's row read "a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`". `range-diff.txt` (commit 2, the `-|` rows) shows the rebased C2 commit deleting it in favour of dev's row. The rebase seat's reconciliation row for R3.3 (`handoffs/FIX-PES-S03-p2.md`) proves only that the rows are PRESENT ("already contain all six required rows"). It never compares a Meaning cell to its source line, which is what R3.3 asks for (SPEC-v3 :64-69).
- **No pin can fail on it:** mutant `p3-price-invalid-meaning-false` rewrites that cell to "a price above 100 USD per million tokens." → v9 31/31 GREEN. This is residue R2 of REV-S03-p2-UNION. It stopped being only a test gap once the rebase edited Meaning cells.
- **Class swept (six R3.3 rows, head against source):** PRICE_REQUIRED :1038 ✓ (`index.ts:683-687`) · PRICE_ZERO :1039 ✓ ("a declared price of zero … The floor is 1", `:699-700`; `0/5` → ZERO in behaviour.log) · **PRICE_INVALID :1040 ✗** · POLICY_UNRESOLVED :1034 ✓ (`cost-envelope-policy.ts:163-166`) · POLICY_INVALID :1035 ✓ (borderline: "malformed" leaves out the blank-`source_ref` condition of `:131`, but the throwing line's own message at `:134` says "absent or malformed", so I did not count it) · SUPPORT_ADMISSION :1037 ✓ (`runtime-environment.ts:199-202`). The member table at README:1109-1110, which is R3.1's and was re-applied, does state the full range.
- **Fix:** one cell. State the source condition inside dev's row, for example "one price member is declared without the other, or a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`". Add an exact-row expectation to the v9 pin in the same shape as C3-5's.
- VERDICT: blocking under this lens (it breaks R3.3's letter and was introduced by the pass under review) / CONFIDENCE medium / STRONGEST COUNTER: the operator impact is close to nil. No real price reaches 2^53. §11's member table, 69 lines below, states the exact range. The cell is dev's upstream text, so editing it adds a small divergence from dev. V may reasonably prefer dev's wording, which is why this is a V row and not a silent fix.

### N1 — orchestrator: V's acceptance oracle was not re-stamped for the new base
- `docs/missions/provider-env-selection/slices/S03/SPEC-v3.md` §5 step 2 requires the `vps-deployment-baseline` pair to be "its base pair from the intake's baseline table" (31/0). At 9f29022f3 it is **43/0**; dev added 12 cases (`accept.out`: `Tests 74 passed (74)` = 31 + 43). **V running step 2 alone reads a FAIL.**
- Step 5 (`sed -n '14,40p'`) and step 3's "no longer only inside the known-stale notice" pass vacuously, because dev deleted the list (`grep -c Known-stale` = 0 at head and at a6d6382ba).
- PLAN §3's pairs are also 776359c3-era: C1, C2 and C3 all print CLUSTER_RED at the head (`cluster-commands.out`). The package README explains this, but PLAN §3 is still the command of record.
- Route: amend SPEC §5 steps 2/3/5 (or the TEST(S03) test point) before TEST(S03).

### N2 — test gap (pre-existing, P1 unchanged by the rebase): R3.1's VALUES are not pinned
`tests/unit/v9-provider-credential-files.test.ts:694-708` checks that the member NAMES are present in the member table. Mutants `p3-member-values-wrong` (both cells → "any number, in USD per … token. Optional.") and `p3-member-pair-rule-dropped` are both **31/31 GREEN**. R3.1 requires "the value the shipped checker requires".

### N3 — test gap (pre-existing): R3.2's "a target pasted from §11 boots" is not pinned
`:702-707` matches `"input_price_micros_per_million":\s*\d+`. Mutant `p3-example-prices-zero` (both env forms priced 0) is **31/31 GREEN**, but the shipped code refuses that paste with `PROVIDER_TARGET_PRICE_ZERO:vendor:acme` (behaviour.log `0/0`). At the head both forms DO boot: my fixture ran them through `parseProviderDiscoveryTargets` → `assertDeploymentProviderTargets` (hosted) → `assertPricedProviderTargets` and printed `FORMS 2 [runner, api]`, both BOOTS. Remedy: pin the forms with that same three-call boot (`rev-pes-s03-p3-ct-behaviour.test.ts`).

### N4 — test gap (pre-existing): R3.6's numbers and claims are only partly pinned
`:721-732` pins `600000`, `probe_freshness_ms`, `panelDiscoveryPolicy` and "no recommendation". Three mutants stay **31/31 GREEN**: `p3-max-tokens-16` (`max_tokens: 8` → 16), `p3-no-minimum-dropped` ("Hosted mode enforces no minimum…" removed) and `p3-positive-integer-dropped` ("validated only as a positive integer" removed).

### N5 — R1 is now concrete: dev ships a SECOND refusal table in §11
The table is README:1217-1231, the publisher's. Mutant `p3-publisher-table-v8-row` (a `DAILY_COST_ENVELOPE_REACHED` row inserted there) is **31/31 GREEN**. Measured at the head, V-8 is honoured in BOTH tables: none of the four run-time codes appears in either. The codes appear only as prose in "The cost envelopes" (README:1163-1165), which V-8's "a later section" allows. This is a member of residue R1, already ticketed. It is listed so the R1 fix covers this table by name.

### N6 — wording tension the re-application created in dev's structure ("seal" means two things in adjacent sentences)
README:921-925 reads: "the cost envelopes in force are the TEMPORARY ones of §11 until V seals measured values. Until V-28's cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment refuses to start with …". README:994-996 reads: "the deployment still needs sealed cost envelopes (V-28)". Dev's §11 (:1148-1160) says the PROVISIONAL row is in force and a hosted host runs on it. In the re-applied sentences, "sealed" means "present at the register version", while dev's clause beside them uses it for "final values", so an operator can read that a hosted deployment refuses to start until V seals the measured values. The text of R3.4b(b) is V-ruled and pinned verbatim (`:795-797`), so a fix is a V wording call, for example "(the provisional row counts)". Non-blocking.

### N7 — dev-owned, outside the slice's diff: the publisher summary table omits `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`
`apps/runner/src/hosted-register-publish.ts:477-479` runs the same parse, then the hosted rules, then the price check, so a malformed price refuses the publish with that code. README:1225 lists only REQUIRED/ZERO as "the same refusals the units raise at start-up". Route to dev's Task 14b owner. It is not S03's to fix.

### N8 — rebase hygiene: the intermediate commit e6d059552 is not bisect-clean
The C1 rebase applied without a conflict and appended C1's six rows beside dev's six identical codes. At e6d059552 the README table carries **14** six-code rows (measured), with conflicting Meaning cells: for example PRICE_ZERO reads "below 1 micro-unit" in one row and "a declared price of zero" in the other. b57c45ca5 removes the duplicates. The head is unaffected. Only a bisect is.

### N9 — package and packet defects (orchestrator)
(a) The package README's frames bullet says "the baseline is 1 (`apps/ui/lib/v3/answerExport.ts(2,38) TS2835`)", which contradicts its own Pass-3 block ("the baseline for this base is 0"). The template line was not re-stamped.
(b) COMMON §6's "base commit" row still says 776359c3. This packet overrides it, but a seat that reads COMMON's fact table first is misled.
(c) Charge 4 permits only README mutants, while charge 9 asks for p2's `packages/providers` source mutants. I ran them as temporary writes in MY worktree, restored byte-exactly (`final restore OK | porcelain: ''`). The rebase seat read the same text as forbidding production writes and used source copies. One sentence would settle it.
(d) FIX-S03-p2's method ("dev's text already says what the requirement asks — quote dev's line") names no source oracle for a KEPT-DEV row. That gap is B1's root cause.

## Charges

1. **Skills and CLAIM:** skills loaded in order: `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-reviewer`, `superpowers:verification-before-completion`. CLAIM posted on t_6c233407 at 21:01:34 (HEAD 9f29022f3, dirty 0, `comments read through: 1`).
2. **Package and packets:** read. Defects are N1, N9 and B1's root cause (N9d). The BUILD packets C1–C3 and FIX-p1 were reviewed at passes 1–2 and cite 776359c3-era lines, which was correct at their base. I did not re-litigate them beyond the rebase scope.
3. **Cluster commands** (`cluster-commands.out`), matching `frames/*-gate.out` line for line:

| command | v9 | vps-baseline | v30 | marker |
|---|---|---|---|---|
| C1 (PLAN §3, expects 24/0 · 31/0) | 31/31 | 43/43 | — | CLUSTER_RED (stale pairs, N1) |
| C2 (expects 28/0 · 31/0) | 31/31 | 43/43 | — | CLUSTER_RED (stale pairs) |
| C3 (expects 31/0 · 31/0) | 31/31 | 43/43 | — | CLUSTER_RED (baseline 31→43) |
| rebased run 1 | 31/31 | 43/43 | 30/30 | CLUSTER_GREEN |
| rebased run 2 | 31/31 | 43/43 | 30/30 | CLUSTER_GREEN |
| rebased run 3 | 31/31 | 43/43 | 30/30 | CLUSTER_GREEN |

This matches the FIX seat's three-run table and `frames/rebased-gate.out`. There is no disagreement.

4. **Refutation of every case the slice added** (`mutants.out`, 74 mutants, 54 RED and 20 GREEN, every restore bytes-equal and porcelain-identical, final porcelain empty):

| case (v9 line) | RED mutant(s) at 9f29022f3 | surviving GREEN |
|---|---|---|
| P2 :409 start-up refusals | drop of each of the 17 rows · 4 V-8 inserts · duplicate row · second code in a cell · moved to prose · guard sentence above the table · source rename/add | second-table V-8 row, V-8 in a Meaning cell (R1); swapped or emptied Meaning (R2); retype + source (retype blind) |
| P7 :487 resolver codes | drop AUTH_FILE_ABSENT/UNUSABLE rows · nested credential moved outside the table | — |
| P1 :694 price members | one env form unpriced · api form given the runner path · price as a JSON string | values wrong, pair rule dropped, prices 0 (N2, N3) |
| P3 :712 no daily-cap ceiling | base sentence restored (p1ct-daily-cap, p3-support-ceiling-exact-base) | paraphrase "the only ceiling is the daily call cap" (phrase-exact pin; the head's scoped sentence is true, see Notes) |
| P8 :721 paid probe | 600000 dropped | `max_tokens` 8→16, no-minimum dropped, positive-integer dropped (N4) |
| P9 :734 known-stale | stale bullet · banner heading · each of the three obsolete strings | — |
| P4 :757 R3.4 | "sealed none" → "sealed nothing" · R3.4 sentences split into their own paragraph | — |
| P5 :770 R3.4b (a) | row wording · UNRESOLVED/INVALID row dropped · either row moved below | — |
| P6 :789 R3.4b (b) | §10 bullet names the old code | — |

**Retyped list (R3.5):** replacing the source read with the literal 12 codes stays GREEN at the head. With a source mutant beside it, `p2-src-rename-zero` and `p2-src-add-code` are RED on the real pin, and the same two mutants with the retype are GREEN. **The pin can tell a retyped list from a source read. The retype cannot.**

5. **Enumeration** (`enumeration.out`, ARCH-PES-S03's script re-pointed): 8 anchors, 12 codes, the same spans as the PROGRESS records (E1 :740-744 … E7 :175-182). All 12 are in the primary table's rows. The pin's 17-code first-column set equals the table's first column. Dev's 53 commits added no refusal code on the credential or price path: the source diff 776359c3..a6d6382ba touches only `recordableFinishReason` (index.ts, a diagnostic label) and the env-key inventory (runtime-environment.ts). The guard-order sentence (README:1045) is true at all three call sites: runner `apps/runner/src/main.ts:74 → :81 → :87`, API `apps/api/src/main.ts:300 → :305 → :312`, publisher `hosted-register-publish.ts:477 → :478 → :479`, all in the order parse → hosted rules → price. V-8 is honoured in both tables (N5).
6. **Acceptance and records** (`accept.out`, `red-at-base.out`, `typecheck.out`, `source-lines.out`):
   - Step 2: 74/74, but the baseline pair is 43/0, not the intake's 31/0 (N1).
   - Step 3: all six codes are on table lines :1034-1040. At a6d6382ba they were already at :1026-1032. accept-base.log (776359c3) had them only in the stale notice at :22-27.
   - Step 4: hits at :1109 (member table) and :1112-1113 (both env forms). The base had one form.
   - Step 5: vacuous (N1).
   - Step 6: one hit at :1021 in §11, in the same sentence as `probe_freshness_ms`. The base had rc=1.
   - Step 7: `git diff --stat origin/dev...HEAD -- apps packages` and `a6d6382ba...HEAD` print nothing (rc 0). Capability proof: the same pathspec over `776359c3...a6d6382ba` prints `27 files changed`.
   - The architecture file is byte-identical to a6d6382ba (`git diff --quiet` rc 0).
   - Typecheck: 0 diagnostics, rc 0, per-file delta 0 against a baseline of 0.
   - The four RED-at-base suites are at their intake pairs: 9/1, 5/5, 3/1, 20/1.
   - Every source `path:line` in the SPEC and in the C1/C2/C3 PROGRESS records still holds at the head (`source-lines.out`, 44 lines). The README line numbers in those records are 776359c3-era; the rebase seat's table re-maps them, and I measured each of its rebased lines (:923-925, :994-1005, :1000/:1036, :1021, :1025-1045, :1030, :1081/:1092/:1236, :1106, :1109-1115, :1184, :1217-1231): every one exists and says what its row claims. Its dev quotes (:14, :912, :921-923, :995-998, :1017-1035, :1022, :1026-1032, :1028, :1071/:1082/:1226, :1099-1103, :1174) all exist in dev's README.
   - **The failing row is R3.3's "KEPT-DEV": dev's rows exist, but one does not say what R3.3 asks (B1).**
7. This file.
8. Kept: no write outlived the session (worktree porcelain empty, HEAD 9f29022f3). No git write, no `pnpm install`, no listener: NO-TOUCH ports identical at start and end (`listeners-start.txt` = `listeners-end.txt`). No key, no other lens's output for this pass, no `boards switch`. The temporary fixture `tests/unit/rev-pes-s03-p3-ct-behaviour.test.ts` was deleted after one run; a copy is promoted in probes/.
9. **Scope, the V-18 rebase:** the reconciliation table was checked row by row.
   - R3.1 RE-APPLIED, true.
   - R3.2 RE-APPLIED: both forms boot through the shipped checks.
   - **R3.3 KEPT-DEV: rows present, one Meaning cell short of source (B1).**
   - R3.4 RE-APPLIED: true, sits in dev's paragraph, does not contradict dev (see Notes).
   - R3.4b RE-APPLIED: exactly two lines (:1000, :1036), true; wording tension N6.
   - R3.5 KEPT-DEV + guard sentence: true at 3 call sites.
   - R3.6 RE-APPLIED: true (provider-probe.ts:82, register/src/index.ts:457, dev-deployment-register.ts:344).
   - R3.7 KEPT-DEV: the list is gone at dev and nothing was restored.
   - R3.8: 43/43, file identical.
   - R3.9: the shell blocks pass baseline :378.
   - V-19 KEPT-DEV (:1030, :1106).
   - Pass-1/pass-2/FIX mutants: every one RED before is RED at 9f29022f3; every GREEN residue is still GREEN; none not applicable.

## Notes (not findings)

- R3.4 at the head keeps dev's "for the support chat its own daily call cap and per-visitor share are still the only ceilings" (README:1004). It names two ceilings, so it is not the sentence R3.4 removes. It is true to source: `packages/providers/src/index.ts:671-676` says support keeps its own spend accounting outside the envelopes, and dev's Known-limitations bullet at README:952 says the same. The P3 pin is phrase-exact (`p3-support-ceiling-paraphrase` GREEN), which is acceptable for a sentence whose truth is scoped.

## VERDICT

**REWORK (pass 3 of 3, so this is a V row) — lens correctness-tests.** B1 is blocking. N1–N9 are non-blocking; each needs a ticket through the orchestrator, and N1 must be resolved before TEST(S03).
CONFIDENCE: high on the measurements. Medium on B1's tier.
STRONGEST COUNTER: B1 is a one-cell omission with no practical operator impact. §11's member table states the exact range, and the cell is dev's own text. A lens can reasonably call it N and PASS, and that is the choice the V row puts to V.

## Predictions about the other lens (security/data-safety, blind)

It will pass the rebase on secrets, because the diff is Markdown plus a test and adds no key, path or byte of credential. My guesses for what it gets wrong or skips:
1. It re-runs the V-8 insertion mutants only against the primary table and misses that dev's publisher table (README:1217-1231) is a second unpinned surface. If it does see it, it files it as R1 with no count.
2. It trusts the rebase seat's "KEPT-DEV six rows" without re-deriving a Meaning cell from source, so it misses B1.
3. It may flag V-19's loopback row (:1030) as unchanged-and-fine, which is correct.
4. It may raise the provisional-envelope wording (N6) as a fail-open reading risk.

What I would check first in its report: whether it re-measured `grep -n DAILY_COST_ENVELOPE_REACHED` over BOTH tables, and whether it ran any source-level refusal at all or only greps.

## V-ROW

V-ROW: NEW · S03 · REV(S03) p3 correctness-tests B1 (ticket t_6c233407) · Recommended default: before TEST(S03), ONE FIX node, the same Codex session, no pass 4, re-verified by the orchestrator. It rewrites the Meaning cell of `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` at `deploy/vps/README.md:1040` to the source condition (`packages/providers/src/index.ts:193-195`, `:277-278`): "one price member is declared without the other, or a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`". It adds that exact row to the v9 pin. The same node amends SPEC-v3 §5 step 2's pair to 43/0 and marks steps 3/5 as satisfied by dev's removal of the list (N1). Smallest yes/no for V: "Put the exact price-refusal condition back in that one README table cell before your test (yes), or keep dev's shorter wording (no)?" · VERDICT yes / CONFIDENCE medium / STRONGEST COUNTER: no real price reaches 2^53. §11's member table already states the full range, and keeping dev's text avoids a divergence from dev's README.

## UNVERIFIED

- A pnpm typecheck at a6d6382ba itself: I took the package's "0 at this base" and got 0 at the head. The slice changes only Markdown and a test file.
- A live VPS boot and V's browser-free TEST steps as V would run them. No real key was used, and no listener was started.
- The BUILD C1–C3 and FIX-p1 packets beyond the rebase scope. Passes 1–2 reviewed them.
- The contents of the 145-file freeze diff `09de9ea4d..4e0d2a581`. I ran it (it prints), and used only the review-package paths it lists.
