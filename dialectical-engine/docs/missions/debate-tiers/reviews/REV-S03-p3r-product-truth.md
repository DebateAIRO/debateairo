# REV(S03) — lens **product-truth**, pass **3r** (the ONE V-authorized scoped re-check, V-47/V-49) — slice `S03` @ `b97985a8`

**SKILLS LOADED:** `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` ·
`superpowers:verification-before-completion`

Seat `REV-S03-p3r-product-truth` · ticket `t_e5adea05` · session
`96555a10-dafb-468d-88b3-f6c3afd4c825` · blind (the sibling lens's worktree, the lane
`.worktrees/tiers-s03` and the main checkout's product tree never opened; under `.worktrees/all`
only the mission-record files my packet names) · worktree
`.worktrees/rev-s03-p3r-product-truth/dialectical-engine`, detached at `b97985a8`, porcelain **0**
on arrival and **0** at handoff · pass-3 slice head `0fe14637` · slice head `a25c0d99` · slice base
`9a000c37` · comments read through: **2**.

---

## VERDICT for this lens: **REWORK (pass 3r)** — one blocking finding, **B1**

**What V-47 bought is delivered, and I proved it on V's own data.** The seed no longer drifts, the
roster row is published (register **v10**), and the bytes now sitting in V's database render on
`/new` as exactly the file's five model ids. My pass-3 blocking chain is broken at its first link
and I say so without reservation (§4, charge 2).

**What stops me is not that.** FIX-S03-p3-F1 implemented V-49 by putting `generate:contract` at
**stage 1** of `dev:auth:up`, ahead of the model-config check. Every shape fault in
`config/models.yaml` is now intercepted by the generator, whose message the CLI discards — so
`pnpm dev:auth:up` refuses a broken edit with the single line
`DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED`, naming **no tier, no model id and no failure class**.
**SPEC-v3 R22 requires all three**, and SPEC-v3 §2 **step 7** — inside my packet's blocking bar
(`§2 … steps 6–10`) and not key-gated — is written against exactly that message. At `0fe14637` the
product printed `DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=free model=gpt-5.6-luna class 2`. **This is
a regression introduced by the commit under review**, measured across all four faults step 7 itself
lists. The remedy is a two-line move that satisfies V-49 verbatim.

Pass 3 was the last lawful pass, so this REWORK is a **V DECISIONS PACKET row** (§8), not a pass 4.

---

## 1. The packet review (it is in my scope; its author cannot review it)

Every constant checked against its source, from my cwd. **No defect that changes what I measured**;
two record defects that would have changed what I *concluded* are findings N4 and N5.

| packet/package claim | checked how | result |
|---|---|---|
| cwd detached at `b97985a8`, porcelain 0 | `git rev-parse --short HEAD`; `git status --short \| wc -l` | `b97985a8`, `0` — correct |
| `a25c0d99` = `0fe14637` + `ef302060` + `a25c0d99` | `git log --oneline -4 a25c0d99` | exact chain, in that order — correct |
| `9a000c37`, `0fe14637`, `a25c0d99`, `3f488b3f` ancestors of HEAD | `git merge-base --is-ancestor` ×6 | all ancestors — correct |
| FIX diff since `0fe14637` = 11 files, +355/−94 | `git diff --shortstat 0fe14637 a25c0d99` | `11 files changed, 355 insertions(+), 94 deletions(-)` — correct |
| guards untouched by the FIX | `git diff --stat 0fe14637 a25c0d99 -- apps/runner/src/dev-api-environment.ts packages/db` | **EMPTY** — correct |
| merge delta over S03's files = 5 files, +156/−10 | `diffstat-merge-S03-files.txt` vs the patch | correct |
| `apps/ui/app/new/page.tsx` unchanged by the merges | `git diff --stat a25c0d99 b97985a8 -- apps/ui/app/new/page.tsx` | **EMPTY** — correct (charge 4) |
| freeze pair `10ee9329..d7a3d478`, cwd-relative pathspecs | `git diff --stat 10ee9329..d7a3d478 -- docs/missions/debate-tiers .hermes/planning/debate-tiers .hermes/reports/debate-tiers` | `20 files changed, 1735 insertions(+)` — non-empty, so the TOOLING-TRAPS spelling warning is correctly applied |
| the live v10 row's value, as quoted in `live/serve-merged-diag-v10-b97985a8.log:4` | re-derived it from this head's publisher (probe L0) | **byte-identical** — correct |
| "PRE-EXISTING since 2026-09-12, outside S03's surface" (`README.md:17`) | `git blame -L 153,160`; `git diff 9a000c37 a25c0d99 -- apps/runner/src/dev-runner-process.ts` | **wrong twice** — see **N4**; the conclusion it supports is right |

The FIX author's `SKILLS LOADED` line is complete against the worker floor in both handoffs
(`board/FIX-S03-p3-F1.t_85cdfdeb.txt`, `board/FIX-S03-p3-F1-R4.t_877d51de.txt`) — no fabrication
finding. The packet cites my pass-3 sections as `## Re-check` where the file spells it
`# Re-check — 2026-09-16, …`; harmless, noted for the generator.

## 2. What I re-ran, verbatim (`passed/total`)

From my worktree, `LANG=en_US.UTF-8`. No dev server, no browser, no live database, no provider call,
no `.local` read, no port bound, nothing on V's desktop. Nothing of mine outlives this session.

| # | command | result | vs the package |
|---|---|---|---|
| C4, the five-suite command of record | `npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts tests/architecture/tiers-s02-rosters.test.ts` | rc=0 · `Test Files 5 passed (5) · Tests 79 passed (79)` | **matches** `reverify-b97985a8.txt` |
| §5 integrated, the 17 files, verbatim argv | `npx vitest run tests/architecture/tier01-roster.test.ts … tests/unit/api-provider-discovery.test.ts` | rc=1 · `Test Files 1 failed \| 16 passed (17) · Tests 2 failed \| 190 passed (192)` | **matches** all three of the package's runs |

The §5 run's two failures, named and dated: `tests/architecture/register-support-publication.test.ts`
→ *"recognizes hostile static SQL concatenation, interpolation, and tagged builders"* and
*"classifies every register relation access and bans open writers, latest selection, and unsafe
version coercion"* — **inherited, dated 2026-09-12** (SPEC-v3 R27), delta zero. No other failure
appeared, and no failure of mine is in a file S03 wrote.

## 3. My own probes (5 fixtures, 26 cases, all built from the CLAIM — never from the authors' tests)

**P1 · `REV-S03-p3r-product-truth-live.test.ts` — 9/9.** Driven by **the bytes now in V's database**,
transcribed verbatim from the read-only diagnostic `live/serve-merged-diag-v10-b97985a8.log:4`. I
touched no database.
- **L0 — the decisive one.** This head's publisher reproduces V's stored v10 value **byte for byte**:
  `{"free":["gpt-5.6-luna","glm-5.3-flash"],"kind":"PLAN_TIER_ROSTERS","premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}`.
  So the row in V's database *is* this head's row; everything below measures V's actual state.
- **L1** V's row → the real route → `status=200 body={"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}`,
  key set `["free","premium"]`, body does not contain `PLAN_TIER_ROSTERS`.
- **L2** the **real** contract client parses it: `{"free":[…],"premium":[…]}`.
- **L3** acceptance step 2's literal claim against V's row: Free is exactly `gpt-5.6-luna`, `glm-5.3-flash`.
- **6** the class holds: a row carrying two *future* register-only members still serves the two lists.
- **4 / 5 / 7** no cookie ⇒ **401 SESSION_REQUIRED**; `/v1/deployment` for the same ordinary session
  ⇒ **403 OPERATOR_REQUIRED**; the row absent ⇒ `500 {"error":"INTERNAL_ERROR","correlation_id":"…"}`.

**P2 · `REV-S03-p3r-product-truth-page.test.tsx` — 5/5.** The same live bytes → the real route → the
rendered DOM, with no literal of mine in between.
- `[PROBE p3r page] Free card ids = ["gpt-5.6-luna","glm-5.3-flash"]`
- `[PROBE p3r page] Premium card ids = ["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]`, all five
  dots non-empty, no `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE` banner.
- Fault injection retained so the measurement still discriminates: `ids=[]` under
  `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR`.

**P3 · `REV-S03-p3r-product-truth-runner.test.ts` — 5/5.** Why `dev:auth:up` still cannot finish, and
whose it is. `startDevelopmentRunnerProcess` driven in-process (no child, no port, no database).
- **R0** the runner's `environment.REGISTER_VERSION` is a **number** — produced by the register
  package's own transform (`runtime-environment.ts:76-78`).
- **R1** the gate rejects it: `DEV_RUNNER_PROCESS_READINESS_INVALID` — the live log's exact code.
- **R2** the **pre-S03** register version **9** fails identically. **R4** so do 1, 4, 10, 11.
- **R3 CONTROL** a *string* `"10"` passes and yields
  `{"worker":"debateai-dev-runner","registerVersion":"10","state":"REGISTERED"}` — the gate is
  satisfiable, so R1 is a real measurement and not a broken harness.

**P4 · `REV-S03-p3r-product-truth-step7.test.ts` — 3/3** and **P5 ·
`REV-S03-p3r-product-truth-step7sweep.test.ts` — 5/5.** B1's evidence; see §5.

**MUTANT (the refutation duty), capture → mutate → run → restore, `cmp equal` both times.**
1. *Does V-49's generator actually make the run follow the file?* Swap the two Free entries in
   `config/models.yaml`, run `pnpm generate:contract`: rc=**0**, and
   `packages/contract/generated/plan-tier-rosters.ts` becomes
   `free: Object.freeze(["glm-5.3-flash","gpt-5.6-luna"])`. Restored: `models.yaml` **cmp equal**,
   `generated/` **cmp equal**, porcelain back to my fixtures. **Yes — measured.**
2. *Step 7's fault class* — §5, B1.

**A green I could not turn red would not be evidence:** P1+P2 are the same join whose pass-3
ancestor I turned from `17 passed` to `10 failed | 7 passed` by reverting the projection; P3's R3
control and P5's stage-2 arm are the discriminating halves here.

## 4. The charges, answered in order

### Charge 2 — the promise V-47 buys, read from the live log

**Does `pnpm dev:auth:up` now complete? NO — and the part that fails is not S03's.** The log's own
last line is `[ELIFECYCLE] Command failed with exit code 1`. Precisely, stage by stage
(`dev-auth-stack.ts:152-208`), from `live/serve-merged-up-b97985a8.log`:

| stage | outcome on V's database | R32/R31's demand |
|---|---|---|
| 1 generate contract | ran | V-49 |
| 2 model config · 3 port · 4 provider panel | ran; **two warnings, one per Free entry** — `DEV_PROVIDER_SLOT_UNAVAILABLE class (a) tier=free model=gpt-5.6-luna` / `… model=glm-5.3-flash` | **R31(a) MET** — "both Free slots absent from the healthy panel … with one warning each" (see **N3** on the wording) |
| 6 data plane (seed + publish) | **seed replayed the sealed v4 with NO drift**; publication landed **register v10** (GENERAL, base 9, 33 rows) carrying the five-slot `configuredProviderSet` and `planTierRosters` | **V-47's whole promise — MET** |
| 8 api.env | rewritten at 17:35:29 with `REGISTER_VERSION=10` **under the existing predicate**, no widening | **MET**, and the security lens's pass-3 ruling holds |
| 9 API | started | — |
| 10 runner | **`DEV_AUTH_STACK_RUNNER_FAILED:DEV_RUNNER_PROCESS_READINESS_INVALID`**; the CLI then stopped every owned stage — **no listeners** | **R32 "starts the stack" and R31 "completes with exit code 0" — UNMET** |
| 11 UI · 12 TLS | never reached | unmet |

**Is that the frame R32 and §2 steps 6–10 require? Partly — and the gap is not S03's.** I did not
take "pre-existing, outside S03's surface" on trust:

- The failing predicate is `dev-runner-process.ts:157-158`; `git blame -L 153,160` dates it to
  **`9d0c8e30`, 2026-09-05** — not 2026-09-12.
- It is **byte-identical at the slice base**: `git show 9a000c37:…/dev-runner-process.ts` carries the
  same two lines, and `…/runtime-environment.ts` the same number-producing transform.
- My probe **R2** shows the **pre-S03 register version 9** fails the gate identically, and **R4**
  that no version can pass — it is a *type* mismatch, so S03's 9→10 bump is not the cause.

**Conclusion for this lens: `dev:auth:up` does not complete, and S03 neither caused it nor can fix it
inside its surface. That is row V-51, and it is not my B1.** It does, however, mean **no one can mark
steps 6, 8, 9 or 10a "done" through the command the SPEC names** until V-51 lands — a sequencing
decision I put to V in §8.

**What remains V's on the real stack** (none of it measurable by any seat):
- **the browser and the cookie session** — every acceptance step is "V, in a browser" (§2 preamble P3);
- **steps 3, 4 and 10b — V-34 (OpenAI key) and the Z.AI key.** The live log shows **both** Free slots
  unavailable, class (a): on that run neither `OPENAI_API_KEY` nor `ZAI_API_KEY` was present and
  non-empty, so 10b ("a Free debate then runs on all three") is doubly gated;
- **the one-time custody step** (the acceptance addendum, `slices/S03/DECISIONS.md`, last fold):
  `mv .local/dev-auth/api.env .local/dev-auth/api.env.stale-<date>` before the first `dev:auth:up` on
  a **pre-S03** custody. **The live run did not exercise it** — it used a custody copy whose api.env
  was written today at v9 and was accepted. V's own custody is pre-S03, so this step is
  **UNVERIFIED live** and is V's to perform. `.local/**` is no-touch for every seat.

### Charge 3 — V-49, and the acceptance-step map

**The generator runs before the model check and the seed — confirmed at the head, not from the
handoff.** `dev-auth-stack.ts:155-157` `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` → `:158-161` the
model check → `:179-181` the data plane that seeds. And the generator genuinely refreshes the
constant admission uses: mutant 1 above (rc 0, the constant follows the file's order).

**So after an edit of `config/models.yaml`, the card and the run read the same file — my pass-3 N1 is
ADDRESSED** (§5). The publisher→route→DOM join is unchanged at `b97985a8`, as the charge expects
(P1/P2, 14/14).

**The acceptance-step map, now:**

| step | S03's half | verdict at `b97985a8` |
|---|---|---|
| **2** `/new` lists both tiers | the published row → route → DOM | **MET, measured on V's own row** (L0–L3, page C/C2/C3). Needs a running stack; V's is served today by the piecewise family |
| **6** edit one line, restart, the card shows it | generator (stage 1) + publication (stage 6) both follow the file | **S03's halves MET**; the step as written is **not executable** — the command exits 1 and, since the port preflight is stage 3, V must first stop the stack, so a failed run leaves V with none (V-51) |
| **7** the broken edit is refused, naming tier/model/class | the refusal message | **UNMET — B1, and S03's own regression** |
| **8** (merge day) completes, one warning per Free entry | the warnings | warnings **MET in substance**, wording **N3**; "completes" **UNMET** (V-51) |
| **8b** (once keys exist) dead `base_url`, restart, R31(b) | — | **UNVERIFIED** — key-gated (V-34) and restart-gated |
| **9** remove the grok entry, restart, version moves | publication path | **S03's half MET** (v10 proves a publication moves the version); restart-gated |
| **10a** add grok under `free:`, restart, Free lists three | as step 6 | **S03's halves MET**; restart-gated |
| **10b** a Free debate runs on all three | admission reads the same file now | **UNVERIFIED** — V-34 + Z.AI key; both Free slots were class (a) on the live run |

### Charge 4 — the merge cross-check

I read `diff-a25c0d99..b97985a8-S03-files.patch` in full (5 files, +156/−10). **No hunk changes what
I measure.**
- **`apps/ui/app/new/page.tsx`: the diff vs the lane is EMPTY** — my P2 renders the lane's page.
- `apps/api/src/index.ts`: `GET /v1/plan-tiers` appears **only as context** (`:33`, inside the hunk
  adding the two `/v1/obs/client-report*` inventory rows). The one hunk touching a surface my lens
  cares about is the 5xx envelope (`:114`, `{error, message}` → `{error, correlation_id}`); I
  re-measured its product consequence rather than assuming it — the banner still reads
  `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR` (P2 fault case) and the correlation id does not
  reach the user.
- `packages/providers/src/index.ts`, `package.json`, `pnpm-lock.yaml`: provider-gateway and workspace
  changes, no product surface of mine. `tests/unit/api.test.ts`: three 500-envelope assertions.
- **The inherited RED, named once:** the route-contract pair is RED at `b97985a8` for the
  observability branch's two client-report rows — **not S03's**, and S03's own row is present in all
  three lists (I re-checked each rather than taking `s03-row-in-three-lists.txt`:
  `apps/api/src/index.ts:149`, `packages/contract/src/index.ts:685`,
  `tests/unit/s7-authorization.test.ts:51`). Nothing blocking for this lens.

### Charge 5 — the two runs, and my pass-3 N1/N2

Both re-run and matching (§2). **N1 is now addressed** (V-49, measured); **N2 still holds and its
class has gained a member** (§5).

## 5. Findings

### B1 (BLOCKING, new) — a shape refusal names nothing: R22 unmet, and it is this FIX's regression

`apps/runner/src/dev-auth-stack.ts:155-157` (the V-49 stage) vs `:158-161` and `:307-317` ·
`apps/runner/src/dev-auth-stack-cli.ts:52-55` · `dev-auth-stack.ts:119-128` ·
oracle `SPEC-v3-section-1-requirements.md:225-226` (**R22**), `:220-224` (R21) ·
`SPEC-v3-section-2-acceptance.md` **step 7**.

**R22, verbatim:** *"A shape refusal names, for each refused entry: the tier, the entry's `model`
value, and which of R20's classes it fell into."* Step 7 is the acceptance step that exercises it,
and the §2 table marks it **"needs a key? no"** — a merge-day step.

**Concrete inputs → wrong outcome (measured, not read).**
1. V introduces one shape fault and runs `pnpm dev:auth:up`.
2. Stage 1 is now `generateContract`, which shells out through `execFileAsync`
   (`dev-auth-stack.ts:296-305`), so the generator's message is **captured**, never printed.
3. The CLI prints only `developmentAuthStackErrorCode(error)` (`dev-auth-stack-cli.ts:52-55`), which
   keeps only messages matching `/^DEV_[A-Z0-9_]+$/` (`:119-128`). An `ExecFileException`
   ("Command failed: pnpm generate:contract…") matches nothing.
4. **V sees exactly one line: `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED`.** No tier. No model id.
   No class.

**The class, swept — all four faults step 7 itself lists** (P5, each mutating and restoring; the
committed file re-asserted byte-identical afterwards):

| member | what the CLI prints today | what stage 2 would have printed |
|---|---|---|
| an unknown transport word (`api: acme`) | `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` | `DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=free model=gpt-5.6-luna class 2` |
| a fourth key on an entry | `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` | `… tier=premium model=gpt-5.6-sol class 2` |
| a second Anthropic entry in Premium | `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` | `… tier=premium model=undefined class 5` (see N6) |
| a `key:` value that is an actual key-looking string | `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` | `… tier=free model=gpt-5.6-luna class 4` |

**RED before GREEN — it is a regression of the commit under review.** At the pass-3 slice head,
`git show 0fe14637:…/dev-auth-stack.ts` shows `checkModelConfig` as the **first** stage and no
generator stage at all, so the same broken file produced the curated line. `ef302060` inserted the
generator ahead of it. Nothing else in the FIX touches this.

**Why it is BLOCKING from this lens.** My packet's bar is *S03's promise unmet at `b97985a8`*, naming
`§2 … steps 6–10`. Step 7 is inside that range, is not key-gated, is not restart-gated (the refusal
happens at stage 1, long before the runner), and R22 is a SPEC-v3 requirement S03 owns. The
observable is the operator's: with five entries and five fault classes, V edits one line, gets one
opaque word back, and is told nothing about which entry is wrong. R21's sibling clauses (nothing
rewritten, non-zero exit) still hold; R22's does not. This is the same honesty law the mission
already enforced on the page at pass 1 ("the page names a refusal instead of a silent blank").

**Remedy — two lines, and it satisfies V-49 verbatim.** V-49 requires `generate:contract` to run
*"before it seeds the register"*; the seed is stage 6. So move the `generateContract` stage to sit
**after** `checkModelConfig` (i.e. stage 1 ⇄ stage 2). I checked the dependency: the generated
constant is consumed only by `packages/contract/src/plan-tiers.ts` → the API's admission, and the API
starts at stage 9, so no stage between the model check and the seed reads it. The alternative — catch
`ModelConfigShapeError` inside `generateContract` and re-emit the curated line — also works but
duplicates the handler. The choice belongs to the FIX seat.
VERDICT: **blocking** · CONFIDENCE **high** (both stage outcomes executed at this head; the class
swept member by member; the pre-FIX behaviour read at `0fe14637`; my probe reproduces the CLI's own
rendering function rather than imitating it) · **STRONGEST COUNTER:** *"the information still exists
in the generator's stderr, so this is cosmetic."* It exists and is discarded — nothing in the product
prints it, and step 7 tells V to run `dev:auth:up`, not the generator. A refusal that names nothing
is the defect R22 was written to forbid; and the fix is cheaper than the argument.

### N1 (pass-3, **ADDRESSED** by V-49) — the card and the run no longer read different files

Measured this pass: `generate:contract` is a stage of `dev:auth:up` (`dev-auth-stack.ts:155-157`)
and it rewrites `packages/contract/generated/plan-tier-rosters.ts` from `config/models.yaml`
(mutant 1, rc 0, order followed). One command now refreshes both sources. **Closed**, with the
residue that follows.

### N2 (NON-BLOCKING, CARRIED from passes 1–3 — class now **four** members)

Oracle `SPEC-v3-section-2-acceptance.md` steps 6, 8b, 10a. Steps 7 and 9 end with a restoration
sentence; steps 6, 8b and 10a mutate `config/models.yaml` and never restore it. **V-49 adds a fourth
member: the same steps now also leave `packages/contract/generated/plan-tier-rosters.ts` modified** —
a *committed* file, rewritten by the generator (measured: mutant 1 changed it and I had to restore it
explicitly). After step 6, `git status` shows two modified tracked files, and the pin
`tests/architecture/tiers-s02-rosters.test.ts > keeps generated rosters equal to the configured file
order` goes RED if V restores only one of them.
Remedy: one restoration sentence on steps 6, 8b and 10a naming **both** artefacts — or "restore the
file and re-run `dev:auth:up`", which regenerates the constant back to the committed bytes.
VERDICT: non-blocking · CONFIDENCE high (measured at two heads) · STRONGEST COUNTER: *"obvious to V"*
— it was not obvious to me at pass 2, where I under-swept my own class by a third.

### N3 (NON-BLOCKING, new) — step 8's warning names a class letter, not "missing key"

`SPEC-v3-section-2-acceptance.md` step 8 requires *"one warning per Free entry naming the tier, the
model id and 'missing key'"*. The shipped string (live log, and `dev-provider-panel.ts:236`) is
`DEV_PROVIDER_SLOT_UNAVAILABLE class (a) tier=free model=gpt-5.6-luna`. Tier ✓, model id ✓; the
reason is the letter `(a)`, which only R31 decodes as *a missing key*. One warning per Free entry is
correct (two, on the live run). Remedy: one string — append the class's own words. Non-blocking: the
information is present, in coded form, and the step's other observables hold.

### N4 (NON-BLOCKING, new) — a package provenance claim that is wrong twice, on the sentence the verdict turns on

`review-packages/S03-p3r/README.md:17`: *"PRE-EXISTING since 2026-09-12, outside S03's surface"*.
Measured: the predicate landed **2026-09-05** (`9d0c8e30`), and `apps/runner/src/dev-runner-process.ts`
**is** in S03's surface — S03 edited it at `43efdb1a` (+8/−3, `createRunnerEnvironment`). The
conclusion is right (S03 did not touch `:157-158`) but neither half of the sentence is. The V-51 row
is more careful ("Known since 2026-09-12"), which is accurate.
The same README quotes four Hatchet deprecation lines as "the log's last lines" and introduces
`[ELIFECYCLE] Command failed with exit code 1` nowhere — burying the one fact the charge turns on.
Remedy (a class fix, cheap and mechanical): **every "pre-existing" claim carries `git blame -L <n>,<m>`
of the failing line plus the slice's diff over that file**; and a live-log summary leads with the
command's exit code and failing stage.

### N5 (NON-BLOCKING, new) — the record states what the blind lenses will conclude

`V-DECISIONS-PACKET.md` row V-51: *"the re-check lenses read the frame as 'V-47 met through api.env,
the runner gate pre-existing'"* — written before this node ran, in a file the node is required to
read. `README.md:17` similarly frames the log under *"the orchestrator's reading"*. My independent
measurement agrees with it, which is exactly why it is worth reporting: agreement is not evidence
when the conclusion was supplied, and blindness is the only thing that makes a lens's PASS worth
anything. Remedy: a V row may state the orchestrator's **recommended default**; it must not state
what the reviewers find. Split the package into assembly (excellent as it is) and an
`ORCHESTRATOR-READING.md` that no lens packet names.

### N6 (NON-BLOCKING, new, pre-existing — not S03's) — the curated refusal itself says `model=undefined`

Measured in the sweep: for the duplicate-maker class the stage-2 line reads
`DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=premium model=undefined class 5`. R22 requires the entry's
`model` value for **each refused entry**. Whoever fixes B1 will be standing in this handler; the two
belong on one ticket.

### Pass-3 findings, status at `b97985a8`

| finding | status |
|---|---|
| pass-3 **REWORK** (the sealed-v4 drift; `/new` lists zero ids on a pre-S03 database) | **RESOLVED** — measured on V's own database via the published v10 bytes (L0–L3) and the DOM (C/C2/C3) |
| **N1** (card and run refreshed by different commands) | **ADDRESSED** by V-49, measured |
| **N2** (steps 6/8b/10a never restore the file) | **STILL HOLDS**, class now four members |

## 6. What I did NOT verify

- **The live failure and the live success are both the orchestrator's measurements, not mine.** V's
  database, custody and the running stack are no-touch for every seat. I re-derived V's stored row
  from this head's publisher (L0, byte-identical) and read the log; **I never read V's database.**
  **UNVERIFIED by me**, and I say so wherever I lean on it.
- **The one-time custody step** (pre-S03 `api.env` move-aside) — never exercised, by anyone: the live
  run used a custody copy whose api.env was post-S03. **UNVERIFIED**, and it is V's step.
- **Acceptance steps 3, 4, 5, 8b, 10b** — provider-gated (V-34 + the Z.AI key; both Free slots were
  class (a) on the live run) and, for 8b, restart-gated. **UNVERIFIED.**
- **Whether the relays honour `--model <id>` in practice** — DR-115 keeps that CLI-reported.
  I called no relay and faked none.
- **The piecewise serve family** (`logs/serve-merged.sh`) normalising the runner's message — the
  README's claim; I did not open the script (it is not a named input) and cannot confirm V's stack is
  reachable today. **UNVERIFIED.**
- **CSS geometry / both modes** — `ui: no` for this slice; the DOM assertion is the oracle and no
  artboard exists.
- **The `:3000` stack, any browser, any dev server, `.local/**`, ports 8790–8796, the database** —
  never touched. Nothing of mine bound a port (every fixture uses fastify `inject`, in-process) and
  no process of mine survives this run.
- **The sibling lens's verdict, the S03 lane, the main tree's product tree** — never opened.

## 7. Predictions about the other lens (falsifiable; blindness held)

I expect **correctness-tests** to **PASS** the FIX on its own terms and to spend its pass where its
charges point: the RED→GREEN on a re-derived pre-S03 sealed v4, idempotence, the five-title class
sweep across three suites, and the empty guard diff — which I also measured and which is genuinely
empty. Its most likely miss is **B1**, and for a structural reason: a correctness lens reads
`tests/unit/dev-auth-stack.test.ts` (26/26, green at this head) and sees the generator stage
*asserted present and ordered*, which is exactly what V-49 asked for; nothing in the suite asserts
what the CLI **prints** when that stage throws, because the printing lives in
`dev-auth-stack-cli.ts`, which no cluster command runs. The question that breaks it is not *is the
generator first?* but *what does a shape fault look like to the operator now that it is?* — and the
answer needs the CLI's own rendering function, not the stage list. I also expect it to report the
route-contract pair as inherited RED and stop there, and to report the runner gate as pre-existing; if
it repeats the README's "since 2026-09-12, outside S03's surface", my `git blame -L 153,160`
(`9d0c8e30`, 2026-09-05) and `git diff 9a000c37 a25c0d99 -- apps/runner/src/dev-runner-process.ts`
(non-empty) refute both halves. If it reports that V-47 is still unmet on V's database, L0's
byte-identical publisher re-derivation and the v10 diagnostic refute it; if it reports that the
browser receives a `kind` member, L1 refutes it. Where I expect it to be **right and me to have added
nothing** is the seal-and-predicate question: both guards are untouched, and I confirmed the empty
diff independently.

---

## 8. Rows for V

```
V-ROW: NEW · S03 · `pnpm dev:auth:up` refuses a broken config/models.yaml with one opaque word —
  no tier, no model id, no failure class — because V-49's generator stage was placed AHEAD of the
  model-config check; SPEC-v3 R22 and acceptance step 7 are unmet, and it is a regression of the
  FIX under review (at 0fe14637 the same fault printed
  `DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=free model=gpt-5.6-luna class 2`)
Recommended default: one FIX inside S03 — move the `generateContract` stage to run AFTER
  `checkModelConfig` (dev-auth-stack.ts:155-161). That satisfies V-49 exactly as ruled
  ("generate:contract runs before it SEEDS the register"; the seed is stage 6), restores the
  curated refusal for all four of step 7's fault classes, and needs no other change — the
  generated constant is consumed only by the API's admission, which starts four stages later.
  While in that handler, fix `model=undefined` on the duplicate-maker class (N6).
Smallest yes/no for V: "Move the generator stage below the model check so a broken edit again
  names the tier, the model and the class — yes? (no = merge with step 7 failing as written:
  every bad edit to config/models.yaml reports only DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED,
  and you find the offending entry by hand)"
VERDICT: fix inside S03 / CONFIDENCE high — I executed both stages on four faulted files at this
  head, swept the class member by member, and reproduced the CLI's own rendering function; the
  pre-FIX behaviour is read at 0fe14637 / STRONGEST COUNTER: everything else V-47 and V-49 bought
  is delivered and I proved it on V's own data (register v10's bytes render as the file's five ids
  on /new), so if V wants S03 landed now, this is a one-commit follow-up on a refusal message and
  nothing a user ever sees — the price is that acceptance step 7 cannot be marked done, and step 7
  is the only step that proves the product refuses a bad edit honestly.
```

```
V-ROW: NEW · S03 · sequencing — V-51 (the runner readiness gate) is filed as an AFTER-S03 ticket,
  but four of S03's own acceptance steps (6, 8, 9, 10a) require `pnpm dev:auth:up` to COMPLETE,
  and it exits 1 at the runner stage on any machine (measured: the type mismatch is independent of
  the register version, and identical at S03's own base 9a000c37)
Recommended default: land V-51's one line BEFORE TEST(S03) — `String(environment.REGISTER_VERSION)`
  at main.ts:146, or a numeric-tolerant gate at dev-runner-process.ts:157 — as its own ticket
  outside S03's surface. Otherwise TEST(S03) must run steps 6-10 through the orchestrator's
  piecewise serve family, which is a start path the SPEC does not describe and which no
  requirement covers; R31's "completes with exit code 0" and R32's "starts the stack" then stay
  unmet on V's machine no matter what S03 does.
Smallest yes/no for V: "Fix the runner readiness line before TEST(S03) runs — yes? (no = TEST(S03)
  runs with steps 6, 8, 9 and 10a amended to say 'restart with the piecewise scripts', and the
  product's own start command stays broken)"
VERDICT: land V-51 first / CONFIDENCE high on the mechanism (probes R0-R4: a string passes, every
  version as a number fails, identical at the slice base), and the live failure is the
  orchestrator's measurement, cited, UNVERIFIED by me / STRONGEST COUNTER: V's stack is being
  served today from the merged tree by the piecewise family, so V can run step 2 and the browser
  steps right now without it — this blocks the acceptance procedure's wording, not V's ability to
  look at the product.
```

---

**Verdict for this lens, final: REWORK (pass 3r), on B1 alone.** Pass 3 was the last lawful pass, so
this is a V DECISIONS PACKET row, not a fourth pass. Everything else in this re-check is green and
measured on V's own data: the seed no longer drifts, register v10 carries the roster row, and the
bytes in V's database render on `/new` as exactly the five model ids in `config/models.yaml`.
