# REV(S03) — lens **product-truth**, pass 3 of 3 (the last lawful pass) — slice `S03` @ `3f488b3f`

**SKILLS LOADED:** `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md` ·
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md` ·
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md` ·
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`

Seat REV-S03-p3-product-truth · ticket `t_08142adf` · session `96555a10-dafb-468d-88b3-f6c3afd4c825`,
transcript `subagents/agent-afcb19ddca9bb1ba6.jsonl` · blind (the two sibling lenses, the S03 lane
`.worktrees/tiers-s03` and the main checkout's product tree never opened; under `.worktrees/all`
only the mission-record files my packet names) · worktree
`.worktrees/rev-s03-p3-product-truth/dialectical-engine`, detached at `3f488b3f`, porcelain 0 on
arrival and 0 at handoff · pass base `cd043907` · slice head `0fe14637` · slice base `9a000c37` ·
comments read through: 1.

**VERDICT for this lens: PASS (pass 3).** Pass-2 **B1 is fixed and I proved it end to end with my
own join**: the row the dev register actually publishes now reaches `/new` as the file's five model
ids, and I measured every link myself — publisher → projection → route → the real contract client →
the rendered DOM. Two non-blocking findings (N1 new, N2 carried and its class now larger than I
reported at pass 2), one row for V. No finding here meets the pass-3 blocking bar, which my packet
sets as *S03's own promise unmet at `3f488b3f`*: SPEC-v3 §2 step 2 is met.

---

## 1. The packet review (it is in my scope; its author cannot review it)

Every constant checked against its source, from my cwd:

| packet claim | checked how | result |
|---|---|---|
| cwd detached at `3f488b3f`, porcelain 0 | `git rev-parse --short HEAD`, `git status --short \| wc -l` | `3f488b3f`, `0` — correct |
| `cd043907` pass-2 slice head, `0fe14637` slice head, `9a000c37` slice base | `git merge-base --is-ancestor <c> 3f488b3f` ×3 | all three ancestors — correct |
| freeze pair `06e98e06..8b49350c`, cwd-relative pathspecs | `git diff --stat 06e98e06..8b49350c -- docs/missions/debate-tiers .hermes/planning/debate-tiers .hermes/reports/debate-tiers` | `22 files changed, 986 insertions(+)` — non-empty, so the TOOLING-TRAPS warning about the git-root-relative spelling is correctly applied |
| rows V-34…V-46 exist | `grep -oE 'V-(3[4-9]\|4[0-6])' V-DECISIONS-PACKET.md` | all 13 present (46 rows total) — correct |
| case C mocks the read to REJECT at `REV-S03-p2-product-truth-newpage.test.tsx:127` | read the file | `:127` is `mocks.readPlanTiers.mockRejectedValue(new Error("INTERNAL_ERROR"));` — correct |
| "the mount is now named file↔loader" | `README.md:16` | correct, and it cites my pass-2 N3 by name |

**No packet defect this pass, and my pass-2 N1 is remedied.** Pass-2 N1 was that the packet
forbade opening `.worktrees/all` and then named twelve inputs inside it. The pass-3 dispatch and
`review-packages/S03-p3/README.md:24` now both state the distinction explicitly — the mission
RECORD under `.worktrees/all` is a named input, its PRODUCT tree is never opened. No lens has to
rule on it privately any more.

**The FIX author's `SKILLS LOADED` line is complete against the worker floor** (7 skills, including
`test-driven-development`, `verification-before-completion`, `systematic-debugging` and
`receiving-code-review`) — no fabrication finding.

One package statement I checked because my whole verdict turns on it, and it is **accurate**:
`README.md:21` says pass-2 case C "mocks `readPlanTiers` to REJECT … so its Free card is `[]` at
EVERY head" and case 3b "asserts the PERSISTED `value_json` has no `kind` — the writer-side
remedy". I reproduced both as promoted before re-deriving either (§2).

## 2. What I re-ran, verbatim (`passed/total`)

From my worktree, `LANG=en_US.UTF-8`. No dev server, no browser, no live database, no provider
call, no `.local` read, no port bound, nothing on V's desktop.

| # | command | result | vs the package |
|---|---|---|---|
| the pass-2 probes AS PROMOTED | `npx vitest run tests/unit/REV-S03-p2-product-truth-probe.test.ts tests/render/REV-S03-p2-product-truth-newpage.test.tsx` | `Test Files 2 failed (2) · Tests 2 failed \| 8 passed (10)` | **matches** the gate exactly, and the two RED titles are exactly the two the package names as fixture-intrinsic |
| C4 (five-suite, the command of record) | `npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts tests/architecture/tiers-s02-rosters.test.ts` | rc=0 · `Test Files 5 passed (5) · Tests 79 passed (79)` | **matches** (79/79; 78→79 is F1's one joining case) |
| §5 integrated (the 17 files of `reverify-3f488b3f.txt:3`, verbatim argv) | `npx vitest run tests/architecture/tier01-roster.test.ts … tests/unit/api-provider-discovery.test.ts` | rc=1 · `Test Files 1 failed \| 16 passed (17) · Tests 2 failed \| 186 passed (188)` | **matches** |

The §5 run's two failures are named and dated: `tests/architecture/register-support-publication.test.ts`
→ *"recognizes hostile static SQL concatenation, interpolation, and tagged builders"* and
*"classifies every register relation access and bans open writers, latest selection, and unsafe
version coercion"* — **inherited, dated 2026-09-12** (SPEC-v3 R27), delta zero. No other failure
appeared in any run of mine, and no failure of mine is in a file S03 wrote.

**The two RED pass-2 cases are RED for the reasons the package gives, and for no other reason.**
Case C: `expected [] to deeply equal [ 'gpt-5.6-luna', 'glm-5.3-flash' ]` — it mocks the read to
reject and then demands the ids, so it cannot be green at any head. Case 3b:
`expected { Object (free, kind, …) } to deeply equal { Object (free, premium) }` — it demands a
writer-side removal of `kind` that F1 deliberately did not make. **Cases 2 and 3 — the ones that
carried B1 — are now GREEN.** That is the fix landing.

## 3. My own probes, pass 3 (promoted to `.hermes/reports/debate-tiers/probes/REV-S03-p3-product-truth/`)

Three fixtures, 20 cases, **`Test Files 3 passed (3) · Tests 20 passed (20)` on each of three runs.**
Built from the CLAIM, never from the authors' tests.

**P1 · `REV-S03-p3-product-truth-wire.test.ts` — 12/12.** Publisher → projection → route → the real
client.
- case 2 THE REAL ROW (the value `buildDevelopmentDeploymentRegisterRows` writes, key set
  `["free","kind","premium"]`) ⇒ `[PROBE p3] real published row -> status=200 body={"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}`
- case 2b THE WIRE ⇒ `[PROBE p3] wire key set = ["free","premium"]`; the body does not contain the
  string `PLAN_TIER_ROSTERS`.
- case 3b RE-DERIVED ⇒ `[PROBE p3] persisted value_json text = {"free":[…],"kind":"PLAN_TIER_ROSTERS","premium":[…]}`
  **and** that same persisted value served over the route yields key set `["free","premium"]`.
- case 6 THE CLASS (mine, exceeding the author's parameters) — a row carrying two *future*
  register-only members (`retiredAt`, `provenance`) ⇒ `status=200`, body still exactly the two
  lists. F1's remedy is a named allow-list, so it survives the next key too; a `kind`-only patch
  would not have.
- case 8 THE REAL CLIENT ⇒ `[PROBE p3] client.readPlanTiers() -> {"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":[…]}`.
  This matters: `client.ts:509` parses the wire body with the same `.strict()` schema, so a
  discriminator on the wire would break the browser even where the server allowed it.
- cases 4 / 5 unchanged: no cookie ⇒ **401 `SESSION_REQUIRED`**; `/v1/deployment` for the same
  ordinary session ⇒ **403 `OPERATOR_REQUIRED`**.
- case 7 (recorded, not predicted) — the roster row absent entirely ⇒
  `status=500 body={"error":"INTERNAL_ERROR","correlation_id":"…"}`.

**P2 · `REV-S03-p3-product-truth-page.test.tsx` — 5/5.** **The join pass 2 could not make.** The
page is driven by *the bytes the real route returns*, with no literal anywhere between
`config/models.yaml` and the DOM V looks at.
- `[PROBE p3 page] real route -> status=200 body={"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":[…]}`
- case C RE-DERIVED, step 2 as V states it ⇒ `[PROBE p3 page] Free card ids = ["gpt-5.6-luna","glm-5.3-flash"]`
- case C2 ⇒ `[PROBE p3 page] Premium card ids = ["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]`,
  all five dots non-empty.
- case C3 — no `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE` banner when the real route answers.
- case B, relabelled honestly as **fault injection, not the current state** ⇒
  `[PROBE p3 page] injected failure -> ids=[] error="ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR"`.

**P3 · `REV-S03-p3-product-truth-drift.test.ts` — 3/3.** The two roster sources (finding N1).

**MUTANT (the refutation duty) — my probes have teeth.** Reverting F1's projection to the pass-2
whole-row parse turns P1+P2 from `17 passed (17)` to **`10 failed | 7 passed (17)`**, including
every page case. Restored from the captured bytes, `RESTORED: cmp equal`. A green I could not turn
red would not have been evidence.

## 4. The charges, answered in order

**(2) Does `/new` now list BOTH tiers' ids for an ordinary signed-in session, from the row the stack
PUBLISHES? YES — measured, not inferred.** P1 case 2 and P2 case C above. The ruling that shipped is
reader-side: `apps/api/src/index.ts:1536-1547` lifts `free` and `premium` off the row and parses only
those with the strict wire schema; `apps/runner/src/dev-deployment-register.ts:343-350` still writes
`kind`. My case 3b records both halves.

**Is the reader-side ruling enough for the product's promise? YES, and it is the better of the two
shapes I named at pass 2.** SPEC-v3 §2 step 2 promises the user sees *the file's ids*; it says
nothing about where a discriminator lives. The reader-side ruling keeps the register row
self-describing (every other register row reader in the tree declares its `kind` —
`packages/register/src/index.ts:62,125,210,219,261,319,324`) while giving the browser a wire body
with no internal member on it. My case 6 is why I prefer it to the writer-side alternative I also
offered at pass 2: stripping `kind` from the producer would have fixed this row and left the next
register-only key to break the page again. **VERDICT: meets the promise / CONFIDENCE high (publisher
executed, projection executed, route injected, real client parsed, DOM measured, and the mutant
proves the measurement discriminates) / STRONGEST COUNTER:** *"a projection that silently drops
unknown keys can hide a genuinely malformed row."* True, and it is the price: case 7 shows the
malformed-row path is an opaque 500, not a named refusal. That is N1's neighbourhood, not step 2's.

**Acceptance step 2's map, now.** `tests/render/tier01-new-plan-tier.test.tsx` (26/26) stands in for
the page half; `tests/unit/api.test.ts` (30/30, including F1's joining case at `:318-361`, which is
driven by `buildDevelopmentDeploymentRegisterRows` and not by a literal — I verified that import at
`tests/unit/api.test.ts:19`) stands in for the route half. **Unlike pass 2, they now stand in for
step 2 under the row shape the product actually produces.** What remains for V on the real stack:
the browser render, the cookie session, and the row currently sitting in the live database at
`127.0.0.1:55432`. I proved the code path that writes and reads that row; I did not read the row.
**Say it plainly: step 2 is now a measured-green path with an unmeasured live-database tail, where
at pass 2 it was a measured-RED path.**

**(3) The wire answer — exactly the two lists.** `GET /v1/plan-tiers` returns key set
`["free","premium"]` and nothing else (P1 case 2b, measured; the body does not contain the string
`PLAN_TIER_ROSTERS`). Both the page's read and the page's render depend on it and on nothing else:
`packages/contract/src/client.ts:509` parses the body with the same `.strict()`
`PlanTierRostersSchema`, and `apps/ui/app/new/page.tsx:115-118` stores only `rosters.free` and
`rosters.premium`, which `:220` maps into the cards. **No discriminator reaches the browser, and no
UI code branches on one.**

**(4) The merge cross-check — nothing the merge did changes what pass 2 measured for this lens.** I
read `diff-0fe14637..3f488b3f-S03-files.patch` in full (five files).
- **`apps/ui/app/new/page.tsx`: `git diff --stat 0fe14637 3f488b3f -- apps/ui/app/new/page.tsx` is
  EMPTY** — the page at the review head is byte-identical to the lane's, so my P2 render measures
  the lane's page.
- `apps/api/src/index.ts` (+the obs branch): the roster lines appear only as **context**
  (`:33` `GET /v1/plan-tiers` sits unchanged inside the hunk that adds the two `/v1/obs/client-report*`
  rows; `:34-41` only widens the resource union with `"observability"`). The one hunk that touches a
  surface my lens cares about is the **5xx envelope**, `{error, message}` → `{error, correlation_id}`
  (`:109-115`). I measured its product consequence rather than assuming it: `client.ts:80-93` builds
  the detail from `body.error` and `body.message`, so with `message` gone the banner reads
  **`ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR`** — unchanged copy (P1 case 9) — and
  `[PROBE p3] correlation id reaches the user? false`.
- `packages/providers/src/index.ts`: obs emissions on provider exhaustion, each wrapped in a
  `try { … } catch {}` whose comment is *"Provider product semantics always win over
  observability"* — no product behaviour change.
- `package.json` / `pnpm-lock.yaml`: scripts and workspace links, no product surface.
- `tests/unit/api.test.ts`: three 500-envelope assertions updated at `:692-724`. **They do not touch
  F1's joining case at `:318-361`.**

**The inherited RED: S03's own row is present in all three lists — I checked each myself rather than
taking `s03-row-in-three-lists.txt`.** The governed inventory
`apps/api/src/index.ts:149`; the contract route list `packages/contract/src/index.ts:685`; the
matrix `tests/unit/s7-authorization.test.ts:51`. All three carry
`GET /v1/plan-tiers`, `auth: "user"`, `resource: "plan-tier-rosters"`, `action: "read"`. **Nothing
blocking from the inherited pin for this lens.**

**(5) My pass-2 N2 and N3.**
- **N3 REMEDIED, both halves.** The label now reads *"the file↔loader mount … it joins the file to
  the loader, not the published row to the reader — pass-2 N3"* (`README.md:16`), and the mount that
  was missing — producer row to reader — now exists as F1's joining case.
- **N2 STILL HOLDS, and its class is larger than I reported.** See below.

## 5. Findings

### N1 (NON-BLOCKING, new) — the roster V *sees* and the roster a run *uses* are refreshed by different commands, and SPEC-v3 §2 names only one of them

`apps/api/src/index.ts:1272,1279` (execution) vs `:1536-1547` (display) ·
`packages/contract/generated/plan-tier-rosters.ts` · `package.json:22,36` ·
oracle `SPEC-v3-section-2-acceptance.md` steps 6, 8 (second half), 10.

**Concrete inputs → wrong outcome.**
1. `/new`'s cards come from `GET /v1/plan-tiers` → the **published register row**, which
   `pnpm dev:auth:up` rebuilds from `config/models.yaml` on every run
   (`apps/runner/src/dev-deployment-register.ts:343-350`).
2. A run's admission comes from `PLAN_TIER_ROSTERS` (`apps/api/src/index.ts:1272,1279`) →
   `packages/contract/generated/plan-tier-rosters.ts`, a **committed generated file** whose ids are
   literals (MEASURED, D2), refreshed only by `pnpm generate:contract` (`package.json:22`).
3. **`dev:auth:up` runs no generator.** MEASURED, D3: `dev:auth:up` is
   `tsx apps/runner/src/dev-auth-stack-cli.ts`, and neither that CLI nor `apps/runner/src/dev-auth-stack.ts`
   mentions `generate:contract`, `generate-plan-tier-rosters` or `generatePlanTierRosters`.
4. Step 6 tells V to edit one line and run **only** `dev:auth:up`; step 10a the same. So after either,
   the **card moves and admission does not**. Step 10b — *"A Free debate then runs on all three"* —
   **cannot pass as written**: admission still holds the two generated ids.

At the committed file the two sources agree (MEASURED, D1 control: both
`["gpt-5.6-luna","glm-5.3-flash"]` / `["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]`), and
`tests/architecture/tiers-s02-rosters.test.ts > keeps generated rosters equal to the configured file
order` pins that equality at test time — which is why this never reaches an ordinary user and why it
is not blocking. It reaches **V**, in the exact window steps 6/8b/10 create.

**Why non-blocking:** no ordinary user can reach the divergence — it needs an operator editing
`config/models.yaml` on the dev stack — and SPEC-v3 §2 step 2, S03's own user-visible promise, is met
at `3f488b3f`. The defect is in the acceptance procedure and the stack pipeline, not in the shipped
read path.
Remedy (either, not both): add `pnpm generate:contract` to steps 6, 8b and 10 of SPEC-v3 §2, or make
`dev:auth:up` run the generator before it seeds the register so the two sources cannot separate.
VERDICT: non-blocking · CONFIDENCE **medium-high** — the mechanism is measured (D1–D3) and the code
path is unambiguous; the **live** consequence is UNVERIFIED because step 10b is provider-gated
(V-34) and I ran no stack · STRONGEST COUNTER: *"the architecture pin already forbids drift, so any
merged state is consistent."* True of the repository, false of V's running stack during acceptance —
and step 10b is written against the running stack.

### N2 (NON-BLOCKING, CARRIED from passes 1 and 2 — and my pass-2 sweep was incomplete)

Oracle `SPEC-v3-section-2-acceptance.md`, steps 6, 8 (second half), 10a.

Steps 7 and 9 end with a restoration sentence (*"Undo the fault."*, *"Put the entry back and
restart."*). **Three** steps mutate `config/models.yaml` and never restore it — and at pass 2 I named
only two. The third is step 8's second half: *"point one Free entry's `base_url:` at a host that
answers nothing and restart"*, which has no restoration sentence either. **I under-swept my own class
at pass 2 and am correcting it here rather than letting it stand.**

Priced at THIS head, with my promoted mutant (capture → mutate → run → restore, `RESTORED: cmp equal`):

| state | file-pinning suites (7 files) |
|---|---|
| file as committed | `Test Files 7 passed (7) · Tests 50 passed (50)` |
| step 6 applied (`glm-5.3-flash` → `glm-5.3`) | `Test Files 2 failed \| 5 passed (7) · Tests 2 failed \| 48 passed (50)` |
| step 10a applied on top (grok added under `free:`) | `Test Files 2 failed \| 5 passed (7) · Tests 2 failed \| 48 passed (50)` |

The two RED titles, both times: `tests/architecture/tiers-s02-rosters.test.ts > keeps generated
rosters equal to the configured file order` and `tests/unit/model-config-file.test.ts > keeps the
committed fleet and V's edit comments exact`.
Remedy: one restoration sentence on steps 6, 8b and 10a — or a named note that those suites are
expected RED while the file is edited. Same class as N1, and one sentence fixes both if it also
names `generate:contract`.
VERDICT: non-blocking · CONFIDENCE high (measured twice, at two heads) · STRONGEST COUNTER:
*"obvious to V"* — it was not obvious to me at pass 2, where I missed a third of the class.

### Pass-2 findings, status at `3f488b3f`

| finding | status |
|---|---|
| **B1** (published row rejected by the strict reader; `/new` lists zero ids) | **RESOLVED** — measured end to end (§3), mutant-confirmed |
| **N1** (the packet forbade `.worktrees/all` then named inputs inside it) | **REMEDIED** — the distinction is explicit in the dispatch and `README.md:24` |
| **N2** (steps 6/10a never restore the file) | **STILL HOLDS**, class corrected to three members, priced above |
| **N3** (the "file↔rosters mount" measured only the file side) | **REMEDIED** — label corrected, and the missing producer→reader mount now exists |

## 6. What I did NOT verify

- **V's live register row.** The database on `127.0.0.1:55432` is no-touch. I proved the publisher's
  output and the reader's acceptance of it; I never read the bytes in V's DB. **UNVERIFIED.**
- **N1's live consequence.** That an edit + `dev:auth:up` actually leaves a card and a run
  disagreeing on V's stack. I measured the mechanism (D1–D3) and read the pipeline; I ran no stack
  and started no process. **UNVERIFIED.**
- **Any real provider call or relay turn** — whether the CLIs honour `--model claude-opus-5` /
  `--model grok-4.6-build` in practice stays **UNVERIFIED** (DR-115 keeps the answer CLI-reported).
  I called no relay and faked none.
- **Acceptance steps 3, 4, 5, 10b** — provider-gated, waiting on V's OpenAI key (V-34).
- **The `:3000` stack, any browser, any dev server, `.local/**`, ports 8790–8796** — never touched;
  nothing of mine bound a port and no process of mine survives this run.
- **CSS geometry / both modes** — `ui: no` for this slice; the DOM assertion is the oracle and no
  artboard exists. My P2 measures the rendered DOM, not compiled CSS.
- **The sibling lenses' verdicts, the S03 lane, the main tree's product tree** — never opened.

**One listener delta I did not cause, reported because it is a fact about the environment V will
test in.** `listener-baseline.txt` (assembly, 12:42:31 EEST) shows two listeners: Docker postgres on
`127.0.0.1:55432` (pid 58423) and `node` on `127.0.0.1:8796` (pid 72588) — the `claude-premium-cli`
relay. At 13:03:26 EEST, `lsof -nP -iTCP:55432 -iTCP:8796 -iTCP:3000 -iTCP:3001 -sTCP:LISTEN` shows
**only postgres, same pid 58423; the `:8796` relay is gone.** I started no process that binds a port
(my fixtures use fastify `inject`, which is in-process), killed nothing, and never touched
8790–8796. **I cannot prove what ended it and do not claim to — UNVERIFIED.** It matters because
`claude-opus-5` is a Premium roster member: acceptance steps 5 and 10b need that relay up. Note also
that the baseline itself shows **no `:3000` listener at assembly time**, so the front door was
already down before this pass began — that is not a change of mine either.

## 7. Predictions about the other two lenses (falsifiable; blindness held)

I expect **correctness-tests** to PASS F1 and to spend its pass on the seam ruling and the joining
case, and I expect it to be right that the case is well-built — it is driven by
`buildDevelopmentDeploymentRegisterRows` with distinctive values, which is exactly the remedy I asked
for at pass 2. Its most likely miss is my N1: from a correctness lens the generated roster looks
*pinned* (`tiers-s02-rosters.test.ts` asserts generated == file), so the natural verdict is "drift is
impossible" — the question that breaks it is not *is drift pinned?* but *which command refreshes each
source, and does the acceptance step name it?*. I also expect it to report the route-contract pair as
inherited RED and to stop there; if it reports S03's own row missing from any of the three lists, my
§4 grep of all three refutes that. I expect **security-data-safety** to PASS on the wire answer — it
will find, as I did, that the body is exactly `{free, premium}` with no discriminator, which is the
*more* conservative outcome than the alternative F1 could have chosen — and its most likely miss is
the mirror of mine: a reader that silently drops unknown keys is a **widened acceptance** at the
trust boundary, and from a security lens that reads as hardening rather than as the loss of a
malformed-row signal (my case 7: an absent or malformed row is an opaque 500, never a named
refusal). I would ask it first whether anything now distinguishes *"the register row is missing"*
from *"the register row is corrupt"* on the wire. If either lens reports that acceptance step 2 still
fails at this head, my P2 case C refutes it; if either reports that the browser receives a `kind`
member, my P1 case 2b refutes it.

---

## 8. Row for V

```
V-ROW: NEW · S03 · /new's card and a Free run read two different rosters after V edits
  config/models.yaml, because `dev:auth:up` refreshes the register row but not the
  committed generated constant admission uses
Recommended default: fix the PIPELINE, not the prose — have `pnpm dev:auth:up` run
  `pnpm generate:contract` before it seeds the register, so the card and the run cannot
  separate. The prose fix (adding `generate:contract` to SPEC-v3 §2 steps 6, 8b and 10)
  is cheaper but leaves the trap armed for every future edit V makes outside acceptance.
  Either way step 10b ("a Free debate then runs on all three") cannot pass as written
  today. This is NOT a merge blocker: at the committed file the two sources agree
  (measured), an architecture test pins that equality, and no ordinary user can reach
  the divergence — only V editing the file on the dev stack.
Smallest yes/no for V: "Make `dev:auth:up` regenerate the plan-tier rosters before it
  seeds the register — yes? (no = SPEC-v3 §2 steps 6, 8b and 10 gain a
  `pnpm generate:contract` line instead, and V must remember it on every hand edit)"
VERDICT: fix the pipeline / CONFIDENCE medium-high / STRONGEST COUNTER: the generator
  writes a COMMITTED source file, so making a dev command rewrite tracked source on every
  start would dirty V's worktree on every `dev:auth:up` — which is a real cost and may be
  why it was left out. If that is decisive, the prose fix is the right answer and this row
  should be closed as "no". I could not measure the live consequence: step 10b is
  provider-gated on V-34 and I ran no stack.
```
