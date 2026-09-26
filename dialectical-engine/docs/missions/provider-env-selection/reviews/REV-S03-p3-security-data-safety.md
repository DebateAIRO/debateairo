# REV(S03) pass 3 of 3 — lens security-data-safety — the V-18 rebase

- seat: REV-PES-S03-p3-security-data-safety (blind Claude Opus subagent aa9c7d3723d777616, V-17) · ticket t_2f09dd19 · 2026-09-25 21:01–21:20 EEST
- worktree: `.worktrees/pes-s03-rev-sd/dialectical-engine`, detached at `9f29022f3`, base `a6d6382ba` (= `origin/dev`, measured 21:0x) · dirty 0 at start and at end
- probes (promoted, runnable from any checkout: root from `$WORKTREE`/argv): `.hermes/reports/provider-env-selection/probes/REV-PES-S03-p3-security-data-safety/` — `clusters.sh` (+`clusters.out`, `logs/`), `accept.sh` (+`accept.out`), `mutants.py` (+`mutants.out`, `mutants-extra.out`, `mut-*.log`, `mutants-summary.json`), `fix-replay/` (the FIX seat's `f1-mutants.py` / `changed-pin-mutants.py` / `reviewer-ct-mutate.py`, re-pointed; `*.out` + logs), `scratch/listeners-{start,end}.txt`

## VERDICT (this lens, pass 3): **PASS**
CONFIDENCE: medium-high · STRONGEST COUNTER: charge 9 asks that every RE-APPLIED sentence sit in dev's structure "without contradicting dev's text". R3.6's "the number an operator publishes is the whole control" (README:1021) sits beside dev's hosted publisher, which seals a code-owned 600000 and gives the operator no member to change it (N1). The FIX packet told the seat to mark such a clash CONTESTED, and it did not. A strict reading makes this REWORK, which at pass 3 is a V row. The V row is raised below either way, so the choice between PASS and REWORK changes only the routing. The text errs in the safe direction: it overstates the operator's exposure and never understates it.

## What I verified, and how

| # | charge | result | evidence |
|---|---|---|---|
| 1 | skills, comments, CLAIM | done; comment 1 (DISPATCHED) read, CLAIM posted | ticket t_2f09dd19 |
| 2 | package + packets | package consistent with the tree (5 commits, 2 files, 227+/12−); packet constants re-measured: base a6d6382ba = origin/dev, baseline 43, v30 30, typecheck 0; publisher table at README:1217 (packet: "~1216") | `accept.out` head; `git diff --name-only a6d6382ba...HEAD` = the two files |
| 3 | every PLAN §3 cluster command, 3 runs | identical to `frames/*-gate.out` in all three runs: C1/C2/C3 `CLUSTER_RED` by construction (776359c3-era pairs: v9 31 vs expect 24/28/31, baseline 43 vs expect 31); rebased command `CLUSTER_GREEN` 3/3: v9 **31/31**, vps-deployment-baseline **43/43**, v30-support-provider **30/30**; `pnpm typecheck` rc=0, **0** diagnostics (base 0, delta 0) | `clusters.out`, `logs/` |
| 4 | secrets and paths | `diff.patch`: no `sk-`/`xai-`/`AIza`/`ghp_`/40+ base64 run, no `Bearer` (rc=1 on all). The v9 file's `Bearer` values are pre-existing fixture placeholders (`t10-fixture-token-…`, `local-relay-*`), none added. The only absolute path added is `/etc/debateai/api/providers/acme.header` inside the api.env JSON (README:1113); it is the documented example path, present once at a6d6382ba and once at head. The credential-file contract (README:1047-1064) is **byte-identical** to base: sha1 `eab0f2e61f7c` both sides. §3 is byte-identical too (`7074c045a6d5`). No hunk touches either. `git diff --stat a6d6382ba...HEAD -- apps packages` is empty, and the same command over `776359c3...a6d6382ba` prints 27 files, so the command can print. | `accept.out` |
| 5 | truth of the refusal table | All 17 first-column codes, and the 4 nested reasons, exist at a throw or definition site (listed below). The table heading still reads `### What the hosted mode refuses, in code` (README:1023). V-8: all four run-time spend codes are absent from BOTH tables (primary :1025-1042, publisher :1217-1231), Meaning cells included. Each appears once elsewhere in the README, outside both tables. R3.3's six codes each have a first-column row in the primary table (:1034, :1035, :1037, :1038, :1039, :1040). The publisher table carries 3 of the 6 as dev wrote it. Worked examples (:1112-1113) carry no credential value, only `authorization_file` paths. The paid-probe paragraph (:1021) recommends no value and names `max_tokens` and `probe_freshness_ms`. | `accept.out`; grep below |
| 6 | no process, no port | NO-TOUCH listeners at start = at end = `listeners.txt` (:4310 node/95068, :55432 com.docke/19920, the rest empty). No `pnpm install` was run. My worktree and the lane `pes-s03` (HEAD 9f29022f3) both end with 0 dirty files. The FIX seat's logs show no listener (the one `:3000` grep hit is the price literal `3000000`). | `scratch/listeners-*.txt` |
| 9 | the V-18 rebase | the reconciliation table is checked row by row below; every earlier mutant has the same outcome at the new head; 18 new pass-3 mutants were added | tables below |

Throw sites (charge 5), all measured at 9f29022f3:

| Code | Where it is thrown or defined |
|---|---|
| `DEPLOYMENT_MODE_UNRESOLVED` | `packages/register/src/runtime-environment.ts:66` |
| `DEPLOYMENT_MODE_INVALID` | `packages/register/src/runtime-environment.ts:76` |
| `PROVIDER_BASE_URL_TLS_REQUIRED` | `packages/providers/src/index.ts:613` |
| `PROVIDER_TARGET_LOOPBACK_REFUSED` | `packages/providers/src/index.ts:652` |
| `PROVIDER_INLINE_CREDENTIAL_REFUSED` | `packages/providers/src/index.ts:655` |
| `PROVIDER_AUTHORIZATION_FILE_ABSENT` | `packages/providers/src/index.ts:784` |
| `PROVIDER_AUTHORIZATION_FILE_UNUSABLE` | `packages/providers/src/index.ts:787` |
| `PROVIDER_CREDENTIAL_FILE_ABSENT` (nested reason) | `packages/crypto/src/index.ts:181` |
| `PROVIDER_CREDENTIAL_FILE_INVALID` (nested reason) | `packages/crypto/src/index.ts:166` |
| `CUSTODY_GROUP_UNRESOLVED` (nested reason) | `packages/crypto/src/index.ts:153` |
| `SECRET_CUSTODY_INVALID` (nested reason) | `packages/crypto/src/index.ts:139` |
| `COST_ENVELOPE_POLICY_UNRESOLVED` | `packages/register/src/cost-envelope-policy.ts:165` |
| `COST_ENVELOPE_POLICY_INVALID` | `packages/register/src/cost-envelope-policy.ts:133` |
| `COST_ENVELOPES_NOT_SEALED` | `packages/register/src/runtime-environment.ts:144` |
| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | `packages/register/src/runtime-environment.ts:176`; the start-up call is in the API only, `apps/api/src/main.ts:230`, which matches the row's "the API only" |
| `PROVIDER_TARGET_PRICE_REQUIRED` | `packages/providers/src/index.ts:687` |
| `PROVIDER_TARGET_PRICE_ZERO` | `packages/providers/src/index.ts:700`; the floor is `< 1`, and negatives are refused earlier as INVALID at `:193` |
| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | `packages/providers/src/index.ts:195`, `:278` |
| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `apps/runner/src/provider-topology.ts:76` |
| `SUPPORT_MODEL_CREDENTIAL_ABSENT` | `apps/api/src/support/model.ts:43` |
| `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `apps/api/src/support/model.ts:42` |

"Both services refuse" is true: the API reads the cost-envelope policy at `apps/api/src/main.ts:242` and the runner at `apps/runner/src/main.ts:111`.

### SPEC-v3 §5 acceptance, end to end at 9f29022f3 (`accept.out`) vs base answers (`probes/ARCH-PES-S03/accept-base.log`)
| step | base (776359c3) | at 9f29022f3 | verdict |
|---|---|---|---|
| 2 | v9 23/23, baseline 31/31 | `Tests 74 passed (74)` = v9 31 + baseline **43** | the cases pass; the step's words "its base pair from the intake's baseline table" (31) are stale against a6d6382ba (N7) |
| 3 | 4 hits, all in the stale notice | the six codes have first-column rows at :1034-1040, and every hit is below §10/§11; no stale notice exists | met |
| 4 | 1 hit (:20, stale bullet) | member row :1109; worked examples :1112 (runner) and :1113 (api) | met |
| 5 | 5 bullets | `sed -n 14,40p` holds no bullet and no stale heading (dev retired the banner) | met, but vacuously (N7) |
| 6 | no hit, rc=1 | 1 hit, :1021, in §11, naming `probe_freshness_ms`, no recommendation | met (the truth of its content is N1) |
| 7 | empty; capability proved | empty against both the literal `origin/dev` and `a6d6382ba`; capability over 776359c3...a6d6382ba = 27 files | met |
| PLAN §4 | 3 lines at ec66d5e7c | `grep -n COST_ENVELOPES_NOT_SEALED` → **2** lines (:1000 support note, :1036 table row) | met |

### Reconciliation table (`handoffs/FIX-PES-S03-p2.md`), row by row against the tree
| Req | seat's call | measured | verdict |
|---|---|---|---|
| R3.1 | RE-APPLIED :1109-1110 | Both rows say "integer from 1 through `Number.MAX_SAFE_INTEGER`" plus the pair rule, which matches `providerTargetPriceAmount` (:192-198, 0..MAX_SAFE) combined with the hosted floor (:698-700) and the pair check (:275-279). Dev's :1099-1100 wording ("Both or neither, never zero") was already true, so re-applying was a choice, not a correction. | true; the value text is unpinned (N2d) |
| R3.2 | KEPT-DEV runner, RE-APPLIED api JSON :1112-1113 | Both forms are full JSON with both prices and `authorization_file`, and no inline credential | true; nothing pins "no inline credential in the examples" (N3) |
| R3.3 | KEPT-DEV six rows | Six first-column rows exist (:1034-1040). The Meaning cells match their sources (table above). | true |
| R3.4 | RE-APPLIED :994-1005 | Both exact sentences are present. Dev's support-spend limitation is retained, and the source bears it out (`packages/providers/src/index.ts:670-676`: prices bind DEBATE targets only) | true |
| R3.4b | RE-APPLIED :923-925, :1036 | The §10 bullet names only the two policy codes. The row is exact. `grep` prints 2 lines. | true |
| R3.5 | KEPT-DEV table + guard sentence :1045 | The 12-code source union is intact (the pin asserts `union.size` 12 and passes). The exact first-column set has 17 entries. | true |
| R3.6 | RE-APPLIED :1021; dev evidence: "no paid-probe paragraph" | The paragraph is SPEC-exact, but the seat did not read the dev SOURCE that bears on it: the hosted publisher seals a code-owned `probe_freshness_ms: 600_000` | **N1** + V-ROW |
| R3.7 | KEPT-DEV (banner retired) | :14-18 is a "Refreshed by Task 14" paragraph with no bullets. Dev's :912 KEK claim is true (`package.json:27` `keys:rotate-kek`). | true |
| R3.8 | KEPT-DEV, baseline 43/43 | 43/43 in 3 of 3 runs; `tests/architecture/` is not in the diff | true |
| R3.9 | KEPT-DEV shell blocks | The baseline's angle-bracket case is green in 43/43 | true |
| V-19 | KEPT-DEV | The loopback row (:1030) says "no name resolution is done" | true; the clause itself is unpinned (N5) |

### Mutants re-run, before (60993d2db, p2 lens) → after (9f29022f3, this seat)
All 18 pass-2 security mutants give **identical** v9 outcomes. RED stayed RED (the three p1 price-row drops, the DAILY insert, the support-row control, the 13th-code add, the PRICE_ZERO rename, the AUTH_FILE_UNUSABLE rename, the heading rewording). GREEN stayed GREEN: the residue R1 members (the V-8 codes in a meaning cell, in prose above, in a second table above, in prose below) and the R2 members (retype, retype+rename/add, LOOPBACK rename, which v9 misses and `v9-deployment-mode` catches with 40 failed/201). `origin-dev-readme` (dev's README under the slice's pins) goes 8 → 7 failed: the retired-banner pin now accepts dev, as the FIX seat declared. The FIX seat's own replay also matched expectation on every member: review 5/5, class 27/27 (every row drop, four forbidden inserts, duplicate/move/second-code/nested), neighbour 1/1, regression 10/10 (retype survives as designed), changed-pin 9/9 (`fix-replay/*.out`). **No pin was weakened by the rebase.**

The 18 new pass-3 mutants: RED = R3.6 paragraph dropped, R3.2 api form reverted to dev's, R3.3 UNRESOLVED row dropped, R3.4 old sentence restored, R3.4b §10 old code restored, guard-order sentence dropped, stale banner restored. **GREEN (survivors)** = the members of N2 (6), N3 (1), N4 (1), N5 (1), N8 (1).

## Findings
No B findings. Every N goes to the orchestrator for a ticket.

- **N1 — R3.6's paragraph describes a knob that dev's sanctioned hosted path does not offer.** This truth drift is caused by the rebase, and the fault lies in the SPEC premise and in V-7.
  - `deploy/vps/README.md:1021` says "The development seed publishes `600000`. Hosted mode enforces no minimum, so the number an operator publishes is the whole control."
  - On a6d6382ba, the only lawful hosted publication is `pnpm register:publish-hosted`. README:1186 says "never publish by hand", and README:946-951 says the command "reuses the development seeder's row builder byte for byte".
  - That publisher seals the code-owned rows (`apps/runner/src/hosted-register-publish.ts:485-506`). They include `panelDiscoveryPolicy` with `probe_freshness_ms: 600_000`: `apps/runner/src/dev-deployment-register.ts:339-346`, reached through `:379` and `:677`.
  - The operator file cannot carry that row. `TOP_LEVEL_KEYS` at `hosted-register-publish.ts:118-121` lists only `format, sourceRef, configuredProviderSet, costEnvelopePolicy, providerTargets, synthesisRoles`. Any other member is refused with `HOSTED_REGISTER_FILE_KEY_UNKNOWN` (`:294-295`).
  - Concrete case: an operator reads :1021, looks for the probe window in `/etc/debateai/register/hosted-register.json`, adds `panelDiscoveryPolicy`, and the publish is refused. Or the operator concludes the window is theirs to lower, when the kit's own path fixes it at 600000.
  - "Hosted mode enforces no minimum" is still true at boot (`apps/api/src/provider-discovery.ts:49` checks only `>= 1`). So the exposure is real for a register published any other way, including S01's second hosted command (V-21).
  - Remedy: SPEC-v4 R3.6 adds one sentence saying the hosted publish seals the code-owned 600000 and offers no member to change it. See the V-ROW.
  - Class sweep: R3.1–R3.9 were each re-read against dev SOURCE (the tables above). R3.6 is the only member whose truth changed with Task 14b.
- **N2 — S03's README pins check names, not the values R3.1 and R3.6 require.** This predates the rebase: the pins are byte-identical to 60993d2db. The class and its members, each a GREEN mutant under v9 31/31, baseline 43/43:
  - (a) "Hosted mode enforces no minimum" replaced with "enforces a minimum of 60000". This is the spend-unsafe direction: an operator trusts a floor that does not exist.
  - (b) "; publish at least 600000." appended. The no-recommendation guard at v9:728-731 is a three-word blacklist.
  - (c) `max_tokens: 8` changed to `max_tokens: 4096`.
  - (d) "validated only as a positive integer" dropped.
  - (e) The R3.1 member rows reverted to dev's wording.
  - (f) The R3.1 floor changed from 1 to 0.

  Remedy by shape: pin each number from its source line, the way the 12-code pin reads codes: `provider-probe.ts:82`, `register/src/index.ts:457`, `dev-deployment-register.ts:344`, `providers/src/index.ts:698`. Pin "no minimum" and "no recommended value" as exact sentences.
- **N3 — the §11 worked-example pin does not forbid a credential in the examples.** A mutant that adds `"authorization_header":"Bearer sk-FAKE-…"` to the runner.env example (README:1112) stays GREEN in v9, baseline and v30. P1 (v9:694-707) already isolates both example lines. One more assertion, `not.toMatch(/authorization_header|Bearer\s/)`, closes this. The example lines are slice-written (R3.2). The hosted boot would refuse such a paste (`PROVIDER_INLINE_CREDENTIAL_REFUSED`, `providers/src/index.ts:655`), but the kit would be teaching operators to put a secret in an env file, which the contract at README:1055-1056 forbids.
- **N4 — residue R1 gains a member through the rebase: dev's publisher refusal table (README:1217-1231).** A mutant that adds a `DAILY_COST_ENVELOPE_REACHED` row there stays GREEN. The V-8 exclusion pin reads only the primary table's first column. Measured at head, both tables are clean (`accept.out`). The pass-2 members, re-run, are still GREEN (the four `v8-*` mutants). Append this member to R1's ticket.
- **N5 — the V-19 default clause is unpinned.** Deleting "A hostname that RESOLVES to one of these is still admitted — no name resolution is done — …" from the `PROVIDER_TARGET_LOOPBACK_REFUSED` row (README:1030) stays GREEN in v9, baseline and v30. The only "not resolved" pin (v9:518-531) reads the `base_url` member row's wording ("real public name", "resolves to this machine"), which is a different sentence. V-19's default binds the ROW. The text is dev's (KEPT-DEV), so the gap does not break a requirement at head.
- **N6 — residue R2 is unchanged.** The source-derived union is retypeable, and the nine literal first-column codes are not source-derived. `source-rename-LOOPBACK` is GREEN in v9 (RED in `v9-deployment-mode` 161/201 and in v30 29/30). This is the already-ticketed residue, listed so the union counts it once.
- **N7 — against the orchestrator's record: V's acceptance and the PLAN pairs were not restated for the V-18 base.**
  - SPEC-v3 §5 step 2 requires the baseline pair to be "its base pair from the intake's baseline table" (31). At a6d6382ba it is 43/43.
  - Step 5's `sed -n '14,40p'` now passes vacuously, because dev removed the list.
  - The PLAN §3 pairs print CLUSTER_RED by construction.
  - The package README tells reviewers all this, but V runs §5 alone. `slices/S03/TEST-POINT.md` (or SPEC-v4) should state 43 and "no known-stale list exists".
- **N8 — dev-owned, outside S03: no suite pins the credential-file contract text.** Rewriting "the path never reaches a gateway, a log line or an error" (README:1053) into "the path is printed in the refusal" stays GREEN in all three README readers. `git grep` over `tests/` finds no pin of the contract sentences. The section is byte-identical to base, so this is not a slice defect. Route it to the VPS kit owner as a data-safety pin gap.

## Predictions about the other lenses (falsifiable)
- The correctness/tests lens will re-run the same frames and PASS on 31/43/30.
- I expect it to name the N2 class, or at least (c) `max_tokens`, because number-level mutation is its home ground.
- It will probably flag N7, the stale SPEC §5 step 2 pair.
- I do not expect it to find N1, because N1 needs reading `hosted-register-publish.ts`, which is outside the diff and outside "the files the packet names".
- The product-truth lens is the one likeliest to find N1, if it reads dev's §10 "reuses the development seeder's row builder byte for byte" (README:946-951) next to :1021. If it reads the README only, it will call R3.6 met.
- I would check first whether either lens counted the publisher table (:1217) in V-8's exclusion, or only the primary one.

## UNVERIFIED
- I did not re-run the four suites that were RED at base (dev-api-environment, dev-api-process, dev-provider-panel, t16-algorithm-register). They are integration suites that may reach the dev Postgres on NO-TOUCH :55432. The slice changes no file they read: the diff is README plus the v9 file.
- I did not open PROGRESS.md's `path:line` records for R3.3 and R3.5; the file is not in my inputs.
- I did not re-run `probes/ARCH-PES-S03/enumeration.mjs` separately. The pin's own `union.size === 12` assertion passes in 3 of 3 runs.
- I did not re-run `probes/FIX-PES-S03-p2/source-runtime-mutants.py`. It runs copied source through a vi.mock seam. My direct source mutants, applied in my worktree and restored from captured bytes, cover the same members with the same results.
- Live VPS behaviour is out of scope here: no process was started and no port was opened.

## V-ROW
V-ROW: NEW · S03 · REV-S03-p3-security-data-safety N1 · Recommended default: SPEC-v4 R3.6 keeps the paragraph and adds one sentence at README:1021: "The hosted publish command (`pnpm register:publish-hosted`) seals the code-owned `panelDiscoveryPolicy` row with `600000` and its file has no member to change it; a different window needs a code change and its own ruling." This is a one-sentence FIX on S03 after V's ruling, or a fold at MERGE. V-7's premise ("a hosted deployment may publish `probe_freshness_ms = 1`") is recorded as true only for a register published outside the kit's command. Smallest yes/no for V: "Should README §11's probe-cost paragraph say that the hosted publish command fixes the probe window at 600000 ms, instead of implying the operator sets it?" · VERDICT: yes / CONFIDENCE: medium / STRONGEST COUNTER: S01 (V-21 "finish S01 anyway") ships a second hosted publish command that carries rows forward and may let an operator publish any window, so a sentence tied to dev's command could be false after MERGE(S01). The durable fix is a floor (V-7's own question), not a sentence.
