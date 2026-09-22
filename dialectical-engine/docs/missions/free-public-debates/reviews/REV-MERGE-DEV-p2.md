# REV-MERGE-DEV-p2 — scoped re-check of my pass-1 findings at the rework head `478b0ca0`

- seat REV-MERGE-DEV · node REV(S01) **lens: correctness-tests** · **pass 2 of 3** · ticket `t_233f8baf`
- head under review `478b0ca0` = one rework commit on the merge `df06aedf` (`rework.diff` 7 files, +237/−173)
- lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine`, read-only, returned `git status --porcelain | wc -l` = **0** (the mutant of charge 2 restored byte-equal from its own capture, md5 `6305351d9e4ff85d543032424e527a6a` before and after)
- oracle for B1: **V-12** (`docs/missions/free-public-debates/V-DECISIONS-PACKET.md`) — both steering boxes for every client, Free locked and empty, Premium typeable and carried, Tree depth 2
- my probes: `.hermes/reports/free-public-debates/probes/REV-MERGE-DEV-p2/`

## VERDICT — REWORK (pass 2), lens correctness-tests

All five scoped findings are ADDRESSED. One **new** blocking finding (B3) and three non-blocking
(N7–N9) come from the rework itself. Pass 3 is the last lawful pass.

---

## Scoped re-check — my pass-1 findings

| finding | status at `478b0ca0` | the measurement |
|---|---|---|
| **B1** production branched on the shape of the test double | **ADDRESSED** | `planTierControlsAvailable` deleted (`rework.diff` `apps/ui/app/new/page.tsx`); zero occurrences anywhere in `apps packages tests`. My re-derived probe passes **4/4**. |
| **B2** `s1-1-depth-contract` RED and mislabelled | **ADDRESSED** | **1010 passed / 0 failed** by my own run (was 1007/3). Nine admissions each opened and confirmed non-depth. Mutant killed. |
| **N1** expectation was a projection of its own fixture | **ADDRESSED** | an independent literal oracle added at `tests/integration/dev-deployment-register.test.ts:687-698` — but see **B3**. |
| **N2** construction binding dropped | **ADDRESSED for 2 of 3 members** | `p2-product-role-policy.test.ts:140` and `p2-recovery-policy-register.test.ts:122` now pin `const publicationPort = createPostgresRegisterPublicationPort(input.adminPool);`. Third member unfixed — see **N7**. |
| **N3** handoff named none of the 11 out-of-contract paths | **ADDRESSED** | `probes/MERGE-FIX-DEV-p2/n3-outside-conflict-paths.md` names all 11 with a forcing frame each; the package README points at it. |

### B1 — re-derived against the RULED behaviour, not against dev's superseded S1-2

My pass-1 refutation hard-coded dev's S1-2 expectations (`steering_presets: []` always). **V-12
overturned them**: V's later word of 2026-09-10 keeps both boxes. So the probe is rewritten as a
**positive oracle**, and the one essential property is kept and promoted from exception to default —
*it renders against a client shaped like the SHIPPED one*. My client doubles are two **plain
objects**, deliberately not the author's `Proxy`, so I do not inherit the indirection I am auditing.

Probe `probes/REV-MERGE-DEV-p2/rev-p2-steering.test.tsx`, output verbatim:

```
P2_SHIPPED_IDS=["steeringPresets","steeringAnnotations"]
P2_SHIPPED_DISABLED=[true,true]
P2_SHIPPED_VALUES=["",""]
P2_SHIPPED_DEPTH=2
P2_LEGACY_IDS=["steeringPresets","steeringAnnotations"]
P2_LEGACY_DEPTH=2
P2_PREMIUM_DISABLED=[false,false]
P2_PREMIUM_CONFIG={"plan_tier":"premium","steering_presets":["Prefer primary sources"],"steering_annotations":["Flag unsupported claims"],"depth":2}
P2_FREE_CONFIG={"plan_tier":"free","steering_presets":[],"steering_annotations":[]}
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

What changed from pass 1, stated plainly: P1/P3 now **assert** the rendering and carrying that pass 1
filed as the violation, because V ruled that behaviour correct; P2 is new and is the part V-12 makes
load-bearing — *a client WITHOUT `readPlanTiers` renders both boxes and depth 2 all the same*, which
is what "for every client" means and what the old predicate made false.

**"No production code in `apps/` branches on the shape of a client object" — swept.** Class, as I
define it: `Reflect.get` in a boolean position · `typeof <application object>.<m> === "function"` ·
`"<m>" in <client>` · `process.env.VITEST` · `NODE_ENV === "test"`. Members found in `apps/`: **none**.
The three `Reflect.get` hits (`apps/runner/src/support-switch-cli.ts:133`,
`support-status-cli.ts:224`, `support-limits-cli.ts:138`) are identical `Proxy` forwarding traps
inside `clientBoundPool`, not feature detection. The `typeof … === "function"` hits are host-capability
checks on browser/Node globals — `apps/ui/app/api/[...path]/route.ts:127` (`getSetCookie`),
`components/CanvasViewport.tsx:229` (`getAnimations`), `components/support/Assistant.tsx:429`
(`scrollIntoView`), `components/support/SupportWidget.tsx:19` (`matchMedia`),
`apps/observation-agent/src/core/threshold-cache.ts:58` and `modules/channels-sendmail/sendmail.ts:47`
(`process.getuid`). The `client = contractClient` sites in `apps/ui/components/*` are default-parameter
dependency injection, which is the opposite construct: the caller supplies the double, the component
never asks what shape it is.

**The guard was rewritten in the open, as V-12 required.** `tests/render/ux01-new-debate-form.test.tsx`
carries **13** `V-12` mentions, **zero** surviving S1-2 assertions (`not.toMatch(/steering/i)` is gone),
and its two new cases are named `V-12 renders both empty steering boxes locked on Free for a client
without readPlanTiers` (:279) and `V-12 enables both steering boxes on Premium and carries their text`
(:307). Case count is unchanged at 8 — two S1-2 cases out, two V-12 cases in. I re-ran it: **8/8**.

### B2 — the admissions are honest and the detector is alive

`tests/unit/s1-1-depth-contract.test.ts` at `478b0ca0`, my run: `rc=0 passed=1010 failed=0`.

**Every one of the nine admissions opened and judged** (charge 2). None is a depth bound:

| # | site | what is actually there | non-depth? |
|---|---|---|---|
| 1 | `verify-fix09-native-wipe.mjs:55` | `Buffer.from([0])` inside `digest()`'s preimage | yes — a hash-domain separator byte |
| 2 | `verify-fix09-native-wipe.mjs:394` (×12) | `const families = [` then 12 ARM instruction `[mask, value]` pairs | yes — instruction-family vectors |
| 3 | `verify-fix09-native-wipe.mjs:561` | `for (const [index, capacity] of [256, 768].entries())` | yes — memset byte capacities |
| 4 | `chain/canonical.ts:255` | `Buffer.from([0])` terminating a canonical name | yes |
| 5 | `chain/private-key-helper.ts:261` | `BIND_LENGTH + 3` / `Buffer.from([2, 2, 3])` custody frame | yes — frame byte lengths |
| 6 | `chain/private-key-helper.ts:308` | `Buffer.from([7, 1])` custody-closed ack | yes — ack bytes |
| 7 | `chain/verify.ts:90` | `Buffer.from([0])` string terminator | yes |
| 8 | `chain/witness.ts:131` | `Buffer.from([0])` string terminator | yes |
| 9 | `spool-index.ts:698` | `for (const slot of [0, 1] as const)` | yes — the two physical cursor slots |

The admissions sum to **20**, exactly the 20 hits of my pass-1 B2, and the mechanism is
count-checked: a stale entry throws `STALE_NON_DEPTH_DOMAIN_EXEMPTION`
(`tests/unit/s1-1-depth-contract.test.ts:427-431`), so it cannot decay into a path-wide suppression.

**The mutant (charge 2).** `probes/REV-MERGE-DEV-p2/rev-p2-depth-mutant.sh` captures
`packages/obs-capture/src/chain/witness.ts`, appends **one** duplicate of the ruled ceiling, runs the
suite, and restores **from its own capture**:

```
MUTANT_APPLIED line=476 md5_before=6305351d9e4ff85d543032424e527a6a md5_mutated=f0837c98cc411ae6dae41027aae90c0d
MUTANT_RUN_RC=1
+   "packages/obs-capture/src/chain/witness.ts:476 [DEPTH_BOUND_LITERAL] const maxDepth = 5;",
+   "packages/obs-capture/src/chain/witness.ts:476 [DEPTH_BOUND_LITERAL] const maxDepth = 5;",
 Test Files  1 failed (1)
      Tests  2 failed | 1008 passed (1010)
RESTORED md5_after=6305351d9e4ff85d543032424e527a6a byte_equal=yes
LANE_DIRTY=0
MUTANT_KILLED=yes (the detector went RED on one duplicate ceiling)
```

The exemption list did **not** swallow it: the new site is reported by name in both the
duplicate-definition and the single-site rows. B2's remedy is a working detector, not a silencer.

---

## B3 (NEW, blocking) — the rework's own N1 fix leaves its suite RED

`tests/integration/dev-deployment-register.test.ts` — **19/19 green at `df06aedf`** (my pass-1
measurement), **RED at `478b0ca0`** in two independent runs:

- mine (`probes/REV-MERGE-DEV-p2/scratch/c4-batch-c.log`): `rc=1 passed=16 failed=3` —
  `publishes a smaller configured provider set after a file entry is removed` ·
  `F34 — the claim-time re-probe detects and RECORDS a member absent since ask time` ·
  `serializes concurrent first invocation and refuses a service principal`
- the orchestrator's (`probes/orchestrator/merge-dev/gate-478b0ca0-dev-deployment-register-integration.log`):
  also 16/3, on a **different** three cases —
  `initializes the complete 16-key development support snapshot enabled from the explicit deployed receipt` (:798) ·
  `T3C — refuses a panel row sealed by a foreign deployment under the same version` (:2206) — with
  `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` in the embedded-postgres log (:1499)

Two independent runs, two different failing sets, one database-level product error: this is
order/state-dependent breakage in the development-deployment-register seeding path, not a flake on one
box. The file is inside `rework.diff`; the rework edited it to close N1 and did not report it green.

**Why blocking.** The DEV-05 capability — seed the complete development deployment register, seal it,
and re-seed it idempotently — is not demonstrable at this head, and the regression was introduced
between `df06aedf` and `478b0ca0`. Charge 4 is exactly "new breakage inside `rework.diff`".

## N7 — the N2 class was swept 2 of 3, and an ordering anchor moved with it

`tests/architecture/dev-deployment-register.test.ts:49,57`

The rework added the construction oracle to the two `p2-*` files but **not** to this one, which is the
third member of the same class:

- `:49` asserts only `expect(source).toContain("publicationPort.importHistorical")`. Ours asserted the
  exact construction `createPostgresRegisterPublicationPort(input.adminPool).importHistorical`
  (`64d052b4:…:42`). Any pool now satisfies it.
- `:57` re-anchors the receipt-ordering probe from ours'
  `indexOf("await createPostgresRegisterPublicationPort(input.adminPool).importHistorical")`
  (`64d052b4:…:51`) to `indexOf("return publicationPort.publishGeneral")`. The ordering
  *port → receipt → custody* is therefore now measured only on **theirs'** `publishGeneral` branch;
  ours' historical-import branch is no longer ordered against receipt or custody at all.

Product code is correct (`apps/runner/src/dev-deployment-register.ts:991` constructs from
`input.adminPool`; `:1025` is the historical import). This is assertion coverage, not behaviour —
non-blocking, WHEN = pass 3.

## N8 — the sweep table asserts a fix that is not in the file

`probes/MERGE-FIX-DEV-p2/third-behaviour-sweep.md` row 27 reads "p2 adds the shared `input.adminPool`
construction oracle" for `tests/architecture/dev-deployment-register.test.ts`. It does not:
`grep -rn 'const publicationPort = createPostgresRegisterPublicationPort(input.adminPool)' tests`
returns exactly two hits, `p2-recovery-policy-register.test.ts:122` and
`p2-product-role-policy.test.ts:140`. One wrong row in the eight I sampled.

## N9 — the gate at this head is green over a list that excludes the rework's own suites

`probes/orchestrator/merge-dev/gate-478b0ca0.txt` prints `CLUSTER_GREEN`, `skipped-lines 0`, `tsc=13`
and lists the S01 cluster plus the four conflicted suites. `rework.diff` edits four test files, of
which only `tests/architecture/p2-*` are covered indirectly and
`tests/integration/dev-deployment-register.test.ts` — the RED one — is on no list. My pass-1 **N4**
was the same organ failing in the other direction (a stale expectation making the gate red). The fix
is one rule: **the gate's suite set is derived from the diff under review.**

---

## Charge 3 — third-behaviour sweep, eight rows of my choosing (9, 13, 18, 20, 23, 27, 33, 35)

I deliberately took the rows carrying a `∅` (one side deleted the block), the rows that change a
function signature, and three test rows — not the first eight.

| row | claim | what I measured against BOTH parents | verdict |
|---:|---|---|---|
| 9 | `provider-discovery.ts`: ours' `probeTarget` removed only after its behaviour moved to the shared probe | `probeTarget` count ours=1, theirs=0, merged=0; `max_tokens: 64` + `thinking` in `packages/providers/src/provider-probe.ts` merged=2, absent on both parents' copies (the file is theirs-only) | union — no third behaviour |
| 13 | optional `providerPanel` preserves ours' historical entry path and theirs' publication path | merged `seedDevelopmentDeploymentRegister` keeps ours' `assertAdmin(authorityClient)` (1 call, as ours) **and** theirs' `warnOnIdenticalSynthesisRoleRefs` (1 call, as theirs) | union |
| 18 | the branch selects historical import or general publication | merged `:992` `input.providerPanel === undefined ? <historical import> : <publishGeneral>`; both parent operations present | union |
| 20 | ours' local depth bounds replaced by theirs' contract import | ours `DEPTH_MIN = 1`, `DEPTH_MAX = 5`; contract `EXPANSION_DEPTH_MIN = 1`, `EXPANSION_DEPTH_MAX = 5` — **numerically identical**, so the substitution changes owner, not bound | ownership dedup |
| 23 | `VerdictBanner` carries both attributes | `data-ai-generated` ours=1/theirs=0/merged=1; `data-verdict-state` ours=0/theirs=1/merged=1 | union |
| 27 | both local calls pinned, plus a construction oracle | `importHistorical` ours=2/theirs=0/**merged=1**; the construction oracle is absent here | **N7** |
| 33 | theirs' unused panel import dropped | theirs' `TEST_DEVELOPMENT_PROVIDER_PANEL` occurs **once**, on the import line only — genuinely unused; merged=0 loses nothing; the deterministic V4 hash fixture survives (2 occurrences on both) | correct |
| 35 | legacy fixture for V4 hashing, current helpers retained | ours' `buildDevelopmentDeploymentRegisterHistoricalPublicationRows` leaves this suite but remains the production path (`dev-deployment-register.ts:1025`) and stays pinned at `tests/architecture/dev-deployment-register.test.ts:48` | capability retained |

Seven of eight confirm the seat's verdict; row 27 does not.

---

## What I verified this pass, and how

| claim | how | result |
|---|---|---|
| B1 remedy under both client shapes | my own 4-case probe, plain-object doubles | 4/4 pass, output above |
| no client-shape branching in `apps/` | class defined above, swept `apps/` | 0 members |
| ux01 rewritten in the open per V-12 | 13 `V-12` mentions, 0 S1-2 assertions, 8 cases | re-run **8/8** |
| B2 remedy | my own run | **1010/0** (was 1007/3) |
| the nine admissions | opened every cited line | none is a depth bound |
| the detector still bites | mutant, restored from capture | RED, 2 cases, site named; `byte_equal=yes`, `LANE_DIRTY=0` |
| N2 remedy | grep for the construction oracle | 2 of 3 members fixed (**N7**) |
| N3 remedy | `n3-outside-conflict-paths.md` | all 11 named with frames |
| other suites in `rework.diff` | my own runs | `p2-product-role-policy` 3/3 · `p2-recovery-policy-register` 3/3 · `tier01-new-plan-tier` 26/26 |
| new breakage in `rework.diff` | my own run + the orchestrator's independent run | **B3** |

### UNVERIFIED

- I did not re-run the 21-suite S01 cluster three times at `478b0ca0`, nor `tsc`. The seat's
  `s01-cluster-green{1,2,3}.log` and `gate-478b0ca0.txt` (`CLUSTER_GREEN`, `tsc=13`) cover them; I did
  not re-derive either. My pass-1 N4 is recorded as corrected in that gate (`dev-auth-stack` 39), which
  I did not re-measure at this head.
- I did not run a third independent pass over `tests/integration/dev-deployment-register.test.ts`, and
  I did not root-cause `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`. B3 rests on two
  independent red runs with disjoint failing sets plus that database error. Both runs also reported
  single cases at 600k–1,000k ms wall against a 120s timeout, i.e. a starved process; I cannot exclude
  that load shapes *which* cases fail, only that the suite is red.
- I did not verify the freeze pair `75118ecc..c88164b7` this pass (pass 1's N5 found the previous pair
  carried none of the work under review).
- Pass-1 findings N4, N5 and N6 were outside this pass's scope; N6 (the packet still calling the
  author's lane "your detached worktree") is unchanged at `478b0ca0`.
- No browser run; no live stack, port, process or container touched; the only databases were embedded
  postgres instances on random ports, all stopped.

---

## Predictions about the other lenses (blind — no contact with either)

I expect **security/data-safety** to pass this rework quickly: nothing in `rework.diff` moves a
privilege, a migration or a role, and the two assertions it adds tighten rather than loosen the
`input.adminPool` binding — but I predict it will **not** run
`tests/integration/dev-deployment-register.test.ts`, because the gate is green and the suite is on no
list, so B3 will be mine alone. I expect **product-truth** to confirm the V-12 rendering against
`DONE(S01)` M8/M10/M14 and to be satisfied; if it disputes anything it will be the Free-tier *lock*
(`disabled` rather than a visually dimmed read-only control), which is a design reading V settled and
not a finding. My own most likely error this pass is B3's tier: if pass 3 shows the three cases green
on a quiet machine and the `REGISTER_PUBLICATION_SEAL_INVALID` line proves to be an expected negative
path exercised by `T3C`, then B3 collapses to an N about an unbounded integration suite, and I would
accept that correction on evidence — two independent red runs is what I have, and it is not the same
as a root cause.

---

## For V

No new row. **V-12 is satisfied at `478b0ca0`, by measurement**: `/new` renders both steering boxes for
every client shape, locked and empty on Free with Tree depth 2, typeable and carried on Premium, and
nothing in the shipped code branches on the shape of a test double. The steering question V answered
is closed; what remains is ordinary engineering debt (B3, N7–N9) and belongs to pass 3, not to V.
