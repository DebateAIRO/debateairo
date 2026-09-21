# REV-MERGE-DEV — blind review of the origin/dev merge resolution `df06aedf`

- seat REV-MERGE-DEV · node REV(S01) **lens: correctness-tests** · **pass 1 of 3** · ticket `t_73ffc0ba`
- head under review `df06aedf` = ours `64d052b4` + theirs `cbf1b281`, merge base `f19c706f`
- lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine`, entered read-only, returned `git status --porcelain | wc -l` = **0**
- oracle: the law in `.hermes/reports/free-public-debates/review-packages/MERGE-DEV/README.md:4` —
  "BOTH sides' behaviour survives; no whole-file side-taking; a truly incompatible hunk is BLOCKED, not guessed"
- everything below was run by me, under `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`, from that lane.
  My probes: `.hermes/reports/free-public-debates/probes/REV-MERGE-DEV/`

## VERDICT — REWORK (pass 1), lens correctness-tests

2 blocking (B1, B2) · 6 non-blocking (N1–N6).

---

## B1 — theirs' S1-2 capability is gone, and the merge made its own guard blind

`apps/ui/app/new/page.tsx:81,88,304` · `apps/ui/app/new/defaults.tsx:69-80`

**What theirs shipped.** `cbf1b281:apps/ui/app/new/page.tsx:205-210` deletes the two steering
textareas and leaves the reason in place: "S1-2 · V ruling 2026-09-03: the two steering textareas
that stood here are removed… a control that appears to steer a debate it cannot steer is worse than
none… **Pinned by ux01-new-debate-form.test.tsx**." `cbf1b281:apps/ui/app/new/defaults.tsx` sends
`steering_presets: []` and `steering_annotations: []` unconditionally.

**What the merge head does.** `df06aedf:apps/ui/app/new/page.tsx:81` introduces a predicate that
exists on **neither** parent:

```
const planTierControlsAvailable = typeof Reflect.get(contractClient, "readPlanTiers") === "function";
```

`:304` renders the steering row only when it is true; `:88` picks depth `2` vs `1` on it. The
shipped client `apps/ui/lib/api.ts` exports `readPlanTiers`, so in the app the predicate is **true**.
The guard suite's mock is `contractClient: { readDeployment, readSession }`
(`tests/render/ux01-new-debate-form.test.tsx:77-80`) — no `readPlanTiers` — so in the test it is
**false**. Production behaviour is branched on the shape of the test double. The seat states this in
its own words in `agent-reports/MERGE-FIX-DEV.md:23`: "H2 preserves the **legacy mocked-client
path** with depth 1 and no unsupported steering wire fields."

**Consequence.** `tests/render/ux01-new-debate-form.test.tsx` passes 8/8 at `df06aedf` (I ran it)
while every property it exists to pin is false in the shipped app.

**My refutation, not the author's test.** I copied ux01's harness verbatim and changed exactly one
thing — the mocked `contractClient` carries `readPlanTiers`, as the shipped one does. Probe:
`.hermes/reports/free-public-debates/probes/REV-MERGE-DEV/rev-steering-refutation.test.tsx`
(header states the head it was written against and how to run it from any worktree). Output, verbatim:

```
REV_STEERING_CONTROL_IDS=["steeringPresets-hint","steeringPresets","steeringAnnotations-hint","steeringAnnotations"]
REV_ENABLED_STEERING_TEXTAREAS=2
REV_TYPED=["asker-typed-open-0","asker-typed-open-1","asker-typed-open-2"]
REV_STEERING_PRESETS=["asker-typed-open-1"]
REV_STEERING_ANNOTATIONS=["asker-typed-open-2"]
REV_DEPTH=2
 × R1 renders the two steering controls dev's S1-2 ruling removed
   → expected [ 'steeringPresets-hint', …(3) ] to deeply equal []
 × R2 sends the asker's typed steering text to the ask (PREMIUM tier, controls enabled)
   → expected { plan_tier: 'premium', …(9) } to match object { steering_presets: [], …(1) }
 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Concrete inputs → wrong outcome: an asker on `/new`, plan tier **premium**, opens Options and types
into the two steering boxes (both `disabled={planTier === "free"}`, therefore **enabled** here — my
probe asserts `REV_ENABLED_STEERING_TEXTAREAS=2` before typing). The ask leaves with
`steering_presets: ["asker-typed-open-1"]`. Theirs' contract-level guarantee — both fields always
empty — is broken, and `depth` defaults to `2`, not the `1` ux01 asserts.

**Why it is blocking.** A capability of one side is lost (the tier rule of charge 5), and it is lost
*silently*: the merge did not report the incompatibility, it removed the observer. Under the
package law this hunk is the textbook "truly incompatible" case — one side renders a control the
other side deleted by ruling — and the law's answer is `BLOCKED` with the two quotes, not a third
behaviour invented in the merge.

**The class, swept.** *Production code branching on the shape of a test double.* I swept `apps/` at
`df06aedf` for the pattern: `planTierControlsAvailable` (`page.tsx:81`) is the only member; it has
two consumers (`:88` depth default, `:304` steering row). Both are listed above.

**The product question is V's, not mine** — see the `V-ROW: NEW` block in the last section. What is
mine is that the merge may not decide it by making the test blind.

---

## B2 — a dev-side invariant suite is RED at the merge head, caused by the combination and filed as "incoming"

`tests/unit/s1-1-depth-contract.test.ts` — measured by me at `df06aedf`: **rc=1, passed=1007,
failed=3** (log `probes/REV-MERGE-DEV/scratch/rev-extras.log`).

Failing cases:

```
× S1-1 · the depth bound has a single source > parses every shipped file with no syntactic diagnostic
  → expected { added: [ …(51) ], missing: [ …(3) ] } to deeply equal { added: [], missing: [] }
× S1-1 · the depth bound has a single source > leaves no duplicate definition of the ruled ceiling anywhere in shipped code
  → expected [ …(20) ] to deeply equal []
× S1-1 · the depth bound has a single source > keeps the owning declaration as the only depth-bound site in shipped code
  → expected [ …(21) ] to deeply equal [ Array(1) ]
```

The seat's READY comment files these as "incoming corpus/detector drift"
(`tests/unit/s1-1-depth-contract.test.ts:372/:1773/:1777`). **That label is wrong and it is
mechanically checkable.** The corpus manifest these three cases read,
`tests/support/shipped-corpus.manifest.txt`, is a **dev-only artefact**: 398 lines at `cbf1b281`,
**absent at `64d052b4` and at the base `f19c706f`** (`git cat-file -e` on all four revisions). It
therefore enumerates dev's corpus only. The merge adds ours' 537 commits of source, and 51 of those
files are not in it — e.g. `apps/api/src/obs-client-report.ts`, present at `64d052b4` and
`df06aedf`, absent at `cbf1b281` and absent from the manifest. The three "missing" entries
(`apps/api/src/support/own-context.ts`, `apps/ui/components/support/ConsentToggle.tsx`,
`apps/ui/components/support/DebatePicker.tsx`) are files ours deleted. Nothing here is incoming:
every one of the 54 deltas is the combination.

**Why it is blocking.** These three cases pass on theirs and fail at `df06aedf` — the merge packet's
own charge 6 ("after the merge every case that passes on EITHER side passes"). Worse, the failure is
*self-masking*: a guard that is already red can no longer report the next duplicate depth-ceiling
definition anybody adds. Theirs' detection capability is dead, not degraded. The suite is not on the
S01 cluster list, so the three-run `CLUSTER_GREEN` never looked at it.

The fix is mechanical — the suite carries its own regeneration switch
(`tests/unit/s1-1-depth-contract.test.ts:392`, `SHIPPED_CORPUS_MANIFEST_UPDATE=1`) — plus a
judgement on the 20/21 detector hits. It is blocking because it is unfixed and mislabelled, not
because it is hard.

---

## N1 — an expectation replaced by a projection of the fixture it is testing

`tests/integration/dev-deployment-register.test.ts:677-683`

Beyond automerge, the literal

```
configuredMakers: ["Anthropic", "OpenAI", "xAI"],
configuredProviders: [ { providerRef: "development:codex-cli", maker: "OpenAI" }, … ]
```

became

```
configuredMakers: [...new Set(TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders.map(({ maker }) => maker))].sort(),
configuredProviders: TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders.map(({ providerRef, maker }) => ({ providerRef, maker }))
```

while the same test now *injects* that panel into the subject (`:642 providerPanel:
TEST_DEVELOPMENT_PROVIDER_PANEL`). The assertion still pins dedup, sort and projection, so it is not
vacuous — but it no longer pins **which** makers a development deployment publishes, and the
no-panel default path it used to cover is now exercised only at `:573-576`. Suite is green (19/19,
measured by me). WHEN: this pass. Concrete ask: keep the derived assertion and add one literal case
over the default panel.

## N2 — a source-text assertion relaxed to a local name, dropping the binding it existed to pin

`tests/architecture/p2-product-role-policy.test.ts:138` and
`tests/architecture/p2-recovery-policy-register.test.ts:120`

Both changed from `expect(devSeed).toContain("createPostgresRegisterPublicationPort(input.adminPool).publishGeneral")`
to `expect(devSeed).toContain("publicationPort.publishGeneral")`. The edit is *forced* — the merge
legitimately hoists the port into `const publicationPort = createPostgresRegisterPublicationPort(input.adminPool)`
(`apps/runner/src/dev-deployment-register.ts:991`) so both parents' call sites (`:1023`
`importHistorical`, ours; `:1055` `publishGeneral`, theirs) can share it. But the surviving
assertion no longer says the port is built from `input.adminPool`; any pool would satisfy it. Both
suites green (3/3 each, measured by me). Fix: assert the construction line as well as the call.

## N3 — the handoff names none of the 11 out-of-contract paths

`MERGE-FIX-DEV.md:18` permits a file outside the 20 "only when a merged-clean path is provably
broken by the combination (**name it and the measurement in the handoff**)". `beyond-automerge.files`
carries 31 paths; 20 are the conflicts, so **11** are out-of-contract:
`acceptance/ceremony.test.ts`, `apps/ui/app/new/defaults.tsx`,
`packages/providers/src/provider-probe.ts`, `tests/architecture/dev-real-provider-only.test.ts`,
`tests/architecture/p2-product-role-policy.test.ts`,
`tests/architecture/p2-recovery-policy-register.test.ts`,
`tests/integration/dev-deployment-register.test.ts`,
`tests/integration/t16-algorithm-register.test.ts`, `tests/render/tier01-new-plan-tier.test.tsx`,
`tests/unit/s1-1-depth-contract.test.ts`, `tests/unit/t17-envelope.test.ts`. The READY comment on
`t_6ce0eced` names none of them. They ARE listed in the self-report
(`agent-reports/MERGE-FIX-DEV.md:36-46`) — so this is a handoff defect, not concealment. The board
is the state (§3.4); a consumer reading the ticket cannot see that product source
(`defaults.tsx`, `provider-probe.ts`) moved outside the contract.

## N4 — the orchestrator's own gate contradicts the seat's, with no reconciliation

`probes/orchestrator/merge-dev/gate-df06aedf.txt` prints `CLUSTER_RED` at the same commit where
`s01-list-green-{1,2,3}.log` print `CLUSTER_GREEN`. I re-derived the cause: the gate list
(`gate-df06aedf-suites.txt`) carries `tests/unit/dev-auth-stack.test.ts … (expect 28/0)` and
measures `passed=39` — dev added 11 cases; I re-ran it and got **39 passed, 0 failed**. The gate's
expectation is stale, not the head. `gate-df06aedf.txt` is also truncated: two bare `CLUSTER_RED`
markers and only 4 of the 5 conflicted suites, although
`gate-tests-integration-register-support-publication.test.ts.log` exists beside it. A reviewer's
package must not require adjudicating which of its own two inputs is wrong.

## N5 — packet defect: the freeze pair carries none of the pass

The packet names `git diff --stat 02f78a92..b6c295f5 -- docs/missions/free-public-debates
.hermes/planning/free-public-debates .hermes/reports/free-public-debates` as "the orchestrator's
record of the pass… the seats' handoffs and self-reports". Run from the lane it names, verbatim:

```
 .../.hermes/planning/free-public-debates/packets/MERGE-FIX-DEV.md    | 5 ++++-
 dialectical-engine/.hermes/reports/free-public-debates/LEDGER.md     | 5 +++++
 2 files changed, 9 insertions(+), 1 deletion(-)
```

`MERGE-FIX-DEV.md`'s self-report, its probes, the review package and my own packet are **absent from
both endpoints** (`git cat-file -e` on each). `b6c295f5` is not an ancestor of `df06aedf`. The pair
is correctly *spelled* and carries no evidence.

## N6 — packet defect: "your detached worktree" is the author's lane

Packet §1 calls `…/.worktrees/merge-dev-0921/dialectical-engine` "the slice head `df06aedf` checked
out READ-ONLY in **your** detached worktree". It is on branch `tmp/merge-dev-2026-09-21` and the
package README:2 calls it "the author's lane… make no write there". A review seat that makes no git
writes cannot create the detached worktree the packet promises. I worked in the author's lane, wrote
one temporary fixture under `tests/render/` as the contract permits, deleted it, and returned the
lane at 0 dirty — but two blind lenses dispatched in parallel would share one `node_modules` cache
and one vitest temp root.

---

## What I verified, and how

| claim | how I tested it | result |
|---|---|---|
| the two apply orders converge | **my own** probe `probes/REV-MERGE-DEV/scratch/rev-migration-orders.ts`, embedded postgres on a random port, order B built by applying the 73 non-dev files directly then calling the product `migrate()` (NOT the author's ledger-marker trick); 17 catalogue sections of my own writing incl. `md5(prosrc)`, `proacl`, `prosecdef`, `proconfig`, table/column/routine/usage grants, policies, role memberships, default ACLs | `MERGED_MIGRATION_FILES=84 · ORDER_B_AFTER_PASS1=73 · ORDER_A_APPLIED=84 · ORDER_B_APPLIED=84 · CATALOGUE_DIFF_SECTIONS=0 · ORDER_A_CATALOGUE_SHA256=ORDER_B_CATALOGUE_SHA256=244ae0a341baad81c2369baf76a335b12a7f8f724acf05cb2d9e2fa29151451a · REV_MIGRATION_ORDER_CONVERGENCE=PASS` |
| the API boots under both orders, under the real login roles | **my own** probe `rev-boot-both-orders.ts`, provisioning the real principals and calling the assertions `apps/api/src/main.ts:129-136` **plus** `:596-598` (`assertSupportDatabaseRole` ×1 and `assertSupportKeyCoverage`), which the repo's `fpd-s01-l1-boot-role-assertions.test.ts` does not cover | `ORDER_A_CHECKS=8 FAILURES=0 · ORDER_B_CHECKS=8 FAILURES=0 · REV_BOOT_BOTH_ORDERS=PASS` |
| S01 §1: every `AnswerSchema`-parsed send site triggers the auto-publish | my own count over `apps/api/src/index.ts` at `df06aedf`: `AnswerSchema.parse(` = **2** (`:1930`, `:2027`), `tryAutoPublishServedAnswer(` call sites = **2** (`:1929`, `:2025`), each in the handler of its send site; ours and theirs each carried 2 send sites too | count equality holds |
| unpublish of a bound Free run is 409; a bound public run is deletable by its creator only | re-ran the suites myself | `fpd-s01-c2-auto-publish 14/14` · `c3-unpublish-http 11/11` (`R-12 returns the exact typed 409 and never calls unpublish`, `R-14 preserves the grant across two sequential refusals`) · `c4-erasure-http 8/8` · `c4-delete-published 17/17` (incl. `returns NOT_FOUND for a different authenticated owner`) · `c1-binding 9/9` · `c1-privileges 3/3` · `c2-system-publication 20/20` → `CLUSTER_GREEN` |
| the five conflicted test files | re-ran all five myself at the expectations the merge head should meet | `dev-deployment-register(arch) 3/3 · register-support-publication(arch) 14/14 · obs-l3-s06-runner-binding 15/15 · production-database-principals 32/32 · register-support-publication(int) 27/27` → `CLUSTER_GREEN` |
| case-name sets vs BOTH parents, five conflicted files | my extractor `probes/REV-MERGE-DEV/scratch/case-names.py` over `f19c706f/64d052b4/cbf1b281/df06aedf` | one title absent at the head — see "checked and cleared" |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit -p .` | **13** diagnostics, none in any of the 31 beyond-automerge paths (`fix0*` obs tests ×11, `apps/ui/lib/v3/answerExport.ts:2`, `acceptance/obs/subjects/capture-subject.ts:48`); the seat's "13 vs ours 70" holds |
| the conflict surface | recomputed the automatic merge myself (`git merge-tree`) | **20** unmerged paths, matching RULING 1 and the packet; `beyond-automerge.files` = 31, so 11 out-of-contract (N3) |

### Checked and CLEARED (attempted refutations that failed)

- **`packages/providers/src/provider-probe.ts`** (`max_tokens: 8 → 64`, Z.AI `thinking: {type:"disabled"}`).
  The file exists on **theirs only** — absent at `f19c706f` and `64d052b4` — so I expected invented
  behaviour. It is forced: ours carried the same two behaviours inline at
  `64d052b4:apps/api/src/provider-discovery.ts:57,61`, and ours' `tests/unit/api-provider-discovery.test.ts:207-219`
  ("uses the measured budget and disables thinking for Z.AI probes") asserts both. That suite is
  green (7/7, measured by me). Named forcing frame; both behaviours survive.
- **`tests/architecture/dev-real-provider-only.test.ts:65`** (expectation changed from
  `loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment(), …)` to
  `(commandEnvironment, …)`). Forced: theirs hoists `const commandEnvironment` at
  `apps/runner/src/dev-deployment-register-cli.ts:17` because theirs also needs it for
  `resolveDevelopmentSynthesisRoleRefs`; ours supplies the second argument. Merged keeps both. 4/4 green.
- **One case title lost from theirs** — `obs-l3-s06-runner-binding.test.ts`,
  `it("captures one provider occurrence after the real gateway exhausts all attempts")`
  (`cbf1b281:271`). Not a lost capability: ours generalised that single case into an `it.each`
  table, and the merged body still asserts `attempts: 2`, `fetchImplementation` called twice and
  `expect(providerOccurrences).toHaveLength(1)`. Theirs' new case
  `it("supplies a receipt the shipped run-head parser accepts")` is kept, which is why the suite
  moves 14 (ours) → 15 (merged).
- **No existing migration edited or renamed**; 84 files, the 11 dev files present under their own
  names, 0 new migrations.

### UNVERIFIED

- I did not exercise the app in a browser. `disabled={planTier === "free"}` means a real Free-tier
  asker cannot type into the restored steering boxes; B1's wire-level violation is demonstrated on
  the **premium** tier, where my probe measures the two textareas as enabled. The *rendering* half
  of B1 (R1) holds on both tiers.
- I did not run the other 16 suites of the S01 cluster list three times; the orchestrator's gate and
  the seat's three runs both cover them and I re-ran the 7 that carry S01's own rules.
- I did not re-measure ours' or theirs' suites at their own heads (no checkout is available to a
  seat that makes no git writes). Statements about "passes on theirs" rest on
  `baselines-ours.txt`, on file-level evidence across the four revisions, and are labelled as such.
- I did not touch any live stack, port or database; every run used embedded postgres on a random port.

---

## Predictions about the other lenses (blind — no contact with either)

I expect **security/data-safety** to pass the migration joint exactly as I did — the two orders are
genuinely identical, and the ACL/`SECURITY DEFINER`/`search_path` columns are in my catalogue and
show zero drift — and to spend its pass on `production-database-principals.test.ts` and the register
publication port; I predict it will *miss* B1 entirely, because nothing about steering is a data
boundary and its suites are all green. I expect **product-truth** to arrive at B1 from the opposite
direction — it will read `cbf1b281:page.tsx:205-210`, see a V ruling reversed, and file it as a
product regression without noticing that `planTierControlsAvailable` is what keeps `ux01` green; if
it files it as "ours' feature restored" rather than "theirs' ruling silently overridden and its
guard neutered", the orchestrator should take my framing, because the evidence is a measurement and
not a reading. I predict **neither** lens finds B2: `s1-1-depth-contract.test.ts` is absent from the
S01 cluster list and from every gate file in the package, it is 1007/3 rather than obviously broken,
and the seat's READY pre-labels it "incoming drift" — a label that is persuasive until you check
that the manifest it reads does not exist on ours at all. If I am wrong about anything, it will be
N1: a second lens may judge the derived `configuredMakers` assertion adequate, and I would not fight
hard for it.

---

## For V

```
V-ROW: NEW · free-public-debates / merge-dev (S01 lane) · card: does the asker get steering controls back?
Two sides of the merge disagree by ruling, not by accident. origin/dev removed the two /new steering
textareas under "S1-2 · V ruling 2026-09-03 — a control that appears to steer a debate it cannot
steer is worse than none"; our local integration branch still renders them and sends what the asker
types. The merge shipped a third answer: the controls appear for Premium and vanish for anything
whose client lacks readPlanTiers, which is how dev's own guard test stayed green.
Recommended default: keep dev's ruling — no steering control on /new for any tier — and delete the
conditional at apps/ui/app/new/page.tsx:81 rather than branch on it.
Smallest yes/no for V: "Should /new show the two steering boxes to a Premium asker?"
VERDICT: restore dev's ruling until V says otherwise / CONFIDENCE: medium / STRONGEST COUNTER: our
branch built plan tiers on top of those boxes for 537 commits, and Premium may be exactly the tier
the ruling's "cannot steer" premise no longer describes — in which case the answer is a designed
control, not a resurrected one.
```
