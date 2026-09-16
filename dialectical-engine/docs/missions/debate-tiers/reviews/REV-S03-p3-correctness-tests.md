# REV(S03) pass 3 — lens `correctness-tests` — slice `S03` at the merged head `3f488b3f`

**SKILLS LOADED:** `superpowers:using-superpowers`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) ·
`dialectical-engine:heartbeat-protocol` (`.claude/skills/heartbeat-protocol/SKILL.md`) ·
`dialectical-engine:heartbeat-reviewer` (`.claude/skills/heartbeat-reviewer/SKILL.md`) ·
`superpowers:verification-before-completion`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

- seat `REV-S03-p3-correctness-tests` · ticket `t_f2e090a2` · pass **3 of 3 — the last lawful pass** · blind
- worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p3-correctness-tests/dialectical-engine`,
  detached at `3f488b3f`, `git status --porcelain` **0 entries at start and at handoff**
- pass base `cd043907` · slice head `0fe14637` · review head `3f488b3f` (= `integration/all`) · slice base `9a000c37`
- package `.hermes/reports/debate-tiers/review-packages/S03-p3/` · ticket comments read through: **4**
- **VERDICT: REWORK** (§8) — one blocking finding (**B1**, §5), three new non-blocking, seven carried.
  **At pass 3 this is a V DECISIONS PACKET row** (§10).

**The short version — and an honest note on how this verdict changed.** Everything the packet charged me
with came back clean. FIX-S03-p2-F1 ruled the row↔reader seam on the **reader** side, and I verified that
by mutation rather than by reading it: the publisher still emits `kind` (`dev-deployment-register.ts:346`),
the wire schema is still `.strict()` without it (`contract/src/index.ts:308-311`), and reverting only the
reader's projection reproduces the exact pre-fix failure — `ZodError: unrecognized_keys ["kind"]`. The new
joining case is genuinely joined to the production publisher (renaming the publisher's row key breaks it,
and it alone) and genuinely proves the ROW rather than the compiled constant is the source. All five
commands of record match the orchestrator's numbers. **On the charges as written, this lens was a PASS.**

Two orchestrator notes landed on my ticket at 12:50 and 12:53, both measured on V's live merge-day
database, both explicitly handed to the lenses to price. They are one class, they are correctness, and
they are mine: **S03 changed persistent developer-machine state whose upgrade path is guarded, and the
slice's entire verification surface is structurally incapable of seeing it**, because every suite builds
the prior state with the same current code. I did not take the notes on trust — I proved the mechanism in
source at this head and the refusal from an existing passing test, without touching the live database
(§5). `pnpm dev:auth:up` is the command SPEC-v3 §2 names in acceptance steps 6, 8, 9 and 10, and **R32's
own closing sentence is "The dev stack does not become un-startable for anyone but V."** It became
un-startable for everyone holding a database sealed before S03. That is S03's own promise, unmet at
`3f488b3f`, so it is blocking by the pass-3 bar the packet sets.

---

## 1. The packet review (the packet is in my scope; its author cannot review it)

| # | Check | Outcome |
|---|---|---|
| 1 | Packet path resolves from the seat's cwd | OK |
| 2 | `3f488b3f` / `0fe14637` / `cd043907` / `9a000c37` against `git rev-parse` | OK — all four resolve; `0fe14637`, `cd043907`, `9a000c37` each `merge-base --is-ancestor HEAD` = YES |
| 3 | `allowed` covers every deliverable the packet demands | OK |
| 4 | Freeze pair is a concrete `<previous>..<latest>` | OK — `06e98e06..8b49350c`; my run of the packet's exact command over the three mission trees: **22 files, 986 insertions, 0 deletions** — the F1 self-report, the whole S03-p3 package, one `LEDGER.md` row, one `PROGRESS.md` line. **No product code in the freeze.** |
| 5 | Is the packet I read the frozen packet? | **Verified.** Blob at `82be5d72` = `1201c9f0513115392b49a2d6d14602b432ae68e3`; `git hash-object` of the copy I was told to read = the same; the records tree reports it unmodified since its commit. (`8b49350c` — the packet-check commit — predates the packet's existence, which is consistent with "packet-check OK at 8b49350c, frozen at 82be5d72".) |
| 6 | README's F1 diffstat "2 files changed, 55 insertions(+), 1 deletion(-)" | **Verified by me**: `git diff --stat cd043907..0fe14637` is exactly that. |
| 7 | README's merge diffstat "5 files changed, 156 insertions(+), 10 deletions(-)" | **Verified by me** over the five named paths. |
| 8 | Charge 5's prediction: "only the two inherited `register-support-publication` titles in §5/C3, and the one inherited pin title in the pair" | **Verified by me on my own runs** — §2. |
| 9 | `SKILLS LOADED` of the FIX seat against the worker floor | Board comment lists **7**: `using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `receiving-code-review` · `test-driven-development` · `verification-before-completion` · `systematic-debugging`. That is the worker floor exactly. No shortfall found. |

**No packet defect found this pass.** Pass-2 defect **N8** (a route-count constant that was wrong by an
order of magnitude and pointed away from B1) is **TAKEN**: this packet carries no such constant, and every
number the README states is one I could re-derive from a command it printed. Pass-2 **B1**'s three
record-level remedies were all applied — the route pins are now gate step 1c, the RED is recorded as
inherited with its cause, and the inventory inconsistency is on the observability board (`t_acc50b4e`).
Recorded closed, not re-found. One recorded-sweep defect against the F1 handoff is **N11** (§6).

---

## 2. Everything I re-ran, in MY worktree (charge 5)

Argv, HEAD and porcelain are printed at the head of every log under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/REV-S03-p3-correctness-tests/`.

| Command | My result at `3f488b3f` | The orchestrator's `reverify-3f488b3f.txt` | Verdict |
|---|---|---|---|
| C4 five-suite | `Test Files 5 passed (5)` · `Tests 79 passed (79)` · rc 0 | 79/79 (F1's gate) | **match** |
| route-pin pair | `Test Files 1 failed \| 1 passed (2)` · `Tests 1 failed \| 40 passed (41)` · rc 1 | identical | **match — the inherited RED** |
| relay+panel set (4 files) | `Test Files 4 passed (4)` · `Tests 49 passed (49)` · rc 0 | — | **green** |
| C3 nine-suite | `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 89 passed (91)` · rc 1 | — | **match** — only the two inherited titles |
| §5 integrated 17-file | `Test Files 1 failed \| 16 passed (17)` · `Tests 2 failed \| 186 passed (188)` · rc 1 | identical, ×3 | **match** |

`Test Files` is **17** on the integrated run, so no filter was silently dropped. The two failures
everywhere are `tests/architecture/register-support-publication.test.ts` → *"recognizes hostile static SQL
concatenation…"* and *"classifies every register relation access…"*, **pre-existing, dated 2026-09-12**,
delta zero. The one pin failure is `tests/unit/s7-authorization.test.ts > keeps one complete, duplicate-free
policy row per contract route`. **No suite of this slice's own fails on any run**, and the counts grew by
exactly the one joining case F1 added (`api.test.ts` 29/29 → 30/30; C4 78 → 79; §5 187 → 188).

**S03's own row is in all three lists — I confirmed it myself** (charge 3; the RED pin cannot say this):
`apps/api/src/index.ts:149` (governed table) · `packages/contract/src/index.ts:685` (`contractInventory.routes`) ·
`tests/unit/s7-authorization.test.ts:51` (`EXPECTED_AUTHORIZATION_MATRIX`) — all three carry
`GET /v1/plan-tiers`, `auth: "user"`, `resource: "plan-tier-rosters"`, `action: "read"`. Counts at this head
are **52 governed / 50 contract routes / 50 matrix**; the two-row gap is the observability pair and nothing else.

---

## 3. The seam ruling and the joining case, re-derived by mutation (charge 2)

**Which side moved: the READER, and only the reader.** Measured in source at `3f488b3f`:

- publisher **unchanged** — `apps/runner/src/dev-deployment-register.ts:344-349` still emits
  `{ kind: "PLAN_TIER_ROSTERS", free, premium }`;
- wire schema **unchanged** — `packages/contract/src/index.ts:308-311` is still `.strict()` over `{free, premium}`;
- reader **moved** — `apps/api/src/index.ts:1539-1547` projects the named allow-list `{free, premium}` off the
  row before the strict parse.

That is the remedy law 3.2 prescribes for a **fixed key set** ("project to a named allow-list"), so the
choice is correct by shape, not merely by outcome.

### 3.1 Mutants — property · mutant · outcome · restore

Content-matched (never line-numbered), each applied only after asserting the literal occurs **exactly once**,
restored from **my own byte copy** and verified by **sha256**; the script refuses a dirty tree. Log:
`mutants-run.log` (promoted, §9). Every restore verified; porcelain **0** after the whole set.

| # | Property claimed | Mutant | Outcome | Restore |
|---|---|---|---|---|
| **A** | **the joining case's RED is real** — F1's frame is a claim until I reproduce it | revert `apps/api/src/index.ts:1539-1547` to the pre-F1 whole-row `PlanTierRostersSchema.parse(row?.value)` | **6 failed / 2 files.** The joining case fails with the exact pre-fix frame: `ZodError: … "code": "unrecognized_keys" … "kind"`. **The RED at `cd043907` is re-derived, not taken on trust.** | sha `ddbbeb3a` OK |
| **B** | the joining case is built from the **publisher's** shape, not a hand-written row | rename the publisher's `rowKey: "planTierRosters"` → `…MUTANT` | **exactly 1 failure** — the joining case, and nothing else in C4 | sha `ed2878ff` OK |
| **C** | is the discriminant checked by anything? | corrupt the publisher's `kind: "PLAN_TIER_ROSTERS"` → `…_MUTANT` | **exactly 1 failure, and it is not a behavioural one**: `tiers-s02-rosters.test.ts > keeps plan-tier roster selection in server production files only` — and it fires because `dev-deployment-register.ts` **drops out of the selecting-files list** (`expected ['apps/api/src/index.ts'] to deeply equal ['apps/api/src/index.ts', …(1)]`), i.e. the file stops matching a text pattern. `api.test.ts` incl. the joining case stays **GREEN**. See **N10** | sha `ed2878ff` OK |
| **D** | **is the drift detector alive at the merged head?** | drift S03's OWN row `auth: "user"` → `"operator"` at `apps/api/src/index.ts:149` | **MASKED** — `Tests 1 failed \| 40 passed (41)`, and the message is **byte-identical** to the unmutated run: `expected [ 'POST /v1/auth/register', …(51) ] to have a length of 50 but got 52`. **Inherited, not S03's** — see §4 | sha `ddbbeb3a` OK |
| **E** | the obs pair is the ONLY cause of the pin RED at this head | add the two `observability` rows to `contractInventory` **and** the expected matrix | pins go **`Tests 41 passed (41)`** — GREEN | both restored |
| **E2** | with the pair supplied, the detector bites | E + drift S03's own row to `operator` | **RED**, `1 failed \| 30 passed (31)` — the detector works the moment the inherited gap is closed | shas OK |
| **F** | the joining case proves the **ROW**, not the compiled constant | make `readPlanTierRosters` return `PLAN_TIER_ROSTERS` | **2 failures** — the pre-existing *"reads plan-tier rosters from the sealed deployment register row"* **and** F1's joining case. The compiled fallback is guarded twice | sha `ddbbeb3a` OK |

**My pass-2 mutants A–F, re-derived at `3f488b3f`** (`.hermes/reports/debate-tiers/probes/REV-S03-p2-correctness-tests-mutants.sh`,
run in my worktree; `p2mutants/mutants.log`). **Every direction is unchanged from pass 2:** MUT-A `4 failed | 26 passed (30)`
incl. all three shipped argv titles · MUT-B `14 failed | 4 passed (18)` · MUT-C **exactly 2** failures ·
MUT-D **exactly 1** diagnostic, `dev-cli-provider-panel.ts(122,59): error TS2353 … 'model' does not exist in
type 'ClaudeRelayOptions'` · MUT-E `41 passed (41)` · MUT-E2 RED. (Counts are lower than pass 2's by exactly
the cases of my own p2 probe file, which is not resident in this tree — the shipped titles are identical.)

**`tiers-s02-rosters.test.ts` case 6 still pins exactly two selecting files** — source at `:277-284`
asserts `["apps/api/src/index.ts", "apps/runner/src/dev-deployment-register.ts"]` and that no `apps/ui/`
file selects; the suite is **6/6** in my C4 and §5 runs. Mutant C shows the pin is live.

**The F2 seam still bites.** My promoted pass-2 cross-check ran **13/13** at this head
(`REV-S03-p2-correctness-tests-run-probe.sh`): X1 the strict schema still refuses all **11** malformed
shapes · X2 it still admits `{free:[],premium:[]}` (**N2**) · X3 the committed file's tiers are non-empty ·
X4 the projection is the row, not `PLAN_TIER_ROSTERS` · X5 `PLAN_TIER_ROSTERS` still deep-equals
`config/models.yaml`. P1–P8 (R18, the relay argv) are all green, so pass-1 B1 stays closed at the merged head.

---

## 4. The merge cross-check (charge 4)

`diff-0fe14637..3f488b3f-S03-files.patch` read in full. Five files S03 wrote changed, all from the
observability branch plus the orchestrator's revert — **and no hunk lands in either region F1 touched**:
the `apps/api/src/index.ts` hunks sit at `:64/:81/:136/:162/:191/:364/:483/:532/:815`, all **above**
`readPlanTierRosters` at `:1536`; the `tests/unit/api.test.ts` hunks sit at `:692/:708/:720`, all **below**
the joining case at `:318-361`.

| File | Merge delta | Does it change what pass 2 measured, from THIS lens? |
|---|---|---|
| `apps/api/src/index.ts` | +54/−5 | **No, for S03.** The obs policy pair at `:145-146`, `"observability"` in the resource union, the `onRequest` obs-context hook, `registerClientReportRoutes`, and the 500-envelope change (`message` → `correlation_id`). It is the sole cause of the inherited pin RED (mutant E), which is §4's named inherited item. S03's row, handler and reader are untouched. |
| `tests/unit/api.test.ts` | +12/−3 | No. Three 500-envelope expectations follow the product change; `api.test.ts` is **30/30** at `3f488b3f` in my C4 and §5 runs. |
| `packages/providers/src/index.ts` | +61/−0 | No. Obs emission on exhaustion, wrapped in `try/catch` with product semantics winning. `tests/unit/provider.test.ts` **9/9**. |
| `package.json` / `pnpm-lock.yaml` | +4/−2, +25/−0 | No. Script and dependency rows only (`audit:obs-inventory`, `obsctl`, the `obs-capture` links). |

**The inherited RED, stated once and not re-litigated.** The route-contract pair is RED at `3f488b3f`
because `apps/api/src/index.ts` governs **52** routes while `contractInventory.routes` and
`EXPECTED_AUTHORIZATION_MATRIX` list **50** — the observability branch's two client-report rows have no
entry in either. Mutant **E** isolates it: supply exactly those two and the pins go 41/41. **It is not
S03's**, no S03 code changes for it, and S03's own row is present in all three lists (§2). Its one live
consequence — the drift detector on S03's own route is masked while the gap stands (mutant **D**, message
byte-identical) — is **inherited**, exactly as charge 3 frames it, and mutant **E2** shows the detector
recovers the moment the gap closes. It sits on the observability board as `t_acc50b4e`.

---

## 5. BLOCKING finding

### B1 — S03 grew a SEALED historical register version instead of superseding it by publication, so `pnpm dev:auth:up` cannot complete on any dev database sealed before S03 — and no command of record can see the class

**Provenance.** Raised by the orchestrator's ticket notes of 12:50 and 12:53 (comments 3 and 4 on
`t_f2e090a2`), measured by the orchestrator on V's live merge-day database and explicitly handed to the
lenses: *"the finding itself is yours to price"*, *"Price it from your lens if it is yours."* It is mine.
**I did not take the notes on trust.** I am forbidden the live database, so I proved it a different way —
every link below is measured by me at `3f488b3f`, and the refusal itself is proved by a test that is
**already in the repo and already passing**.

**The proof, in four measured links, no live database required.**

1. **`pnpm dev:auth:up` reaches the seed.** `package.json:36` → `apps/runner/src/dev-auth-stack-cli.ts` →
   the data plane's fixed step `DEV_AUTH_DATA_PLANE_REGISTER_FAILED` at
   `apps/runner/src/dev-auth-data-plane.ts:105-108`, whose `seedRegister()` (`:373-378`) shells
   `pnpm dev:auth:seed-register` → `apps/runner/src/dev-deployment-register-cli.ts:20` →
   `seedDevelopmentDeploymentRegister`. The outer wrapper is `DEV_AUTH_STACK_DATA_FAILED`
   (`dev-auth-stack.ts:174`) — exactly the pair the orchestrator observed.
2. **The seed replays a SEALED version.** `seedDevelopmentDeploymentRegister`
   (`apps/runner/src/dev-deployment-register.ts:704-714`) calls
   `importHistorical({ registerVersion: DEVELOPMENT_REGISTER_VERSION, rows: publicationRows })` with
   `DEVELOPMENT_REGISTER_VERSION = 4` (`:62`) — and the file's own comment at `:640-650` states the rule
   it is breaking: *the historical bootstrap is **sealed**, and a deployment that grows "supersedes the
   old set by **publication**", via `publishDevelopmentDeploymentRegisterProviderSet`.*
3. **S03 changed that sealed set — measured.** The v4 replay row set is built by
   `buildDevelopmentDeploymentRegisterPublicationRows` (`:541-557`) → `expectedRunnerRows` →
   `buildDevelopmentDeploymentRegisterRows`. At the lane base `9a000c37` that builder emits **13**
   `rowKey`s; at `3f488b3f` it emits **14** — the added one is `planTierRosters` at `:344`, S03's own row.
   (`git show 9a000c37:…/dev-deployment-register.ts | grep -n 'rowKey: "'` vs the same grep at HEAD.)
4. **A changed v4 row set is refused — and the repo already proves it.**
   `tests/integration/register-support-publication.test.ts:902` is a **passing** test:
   `await expect(importHistorical("4", changed)).rejects.toThrow(/historical replay drift/u)`, where
   `changed` is the v4 row set with *one value altered*. S03 did something strictly larger — it added a
   whole row. Therefore any database whose v4 was sealed with the pre-S03 13-row set **must** refuse the
   replay. That is precisely the `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` the
   orchestrator observed.

**Why this is blocking at pass 3.** The bar the packet sets is "S03's own promise unmet at `3f488b3f`".
The oracle is explicit, and it is S03's:

- **R32** (`oracle/SPEC-v3-section-1-requirements.md:267-272`): *"`pnpm dev:auth:up` **starts the stack**"*,
  closing with **"The dev stack does not become un-startable for anyone but V."** It became un-startable
  for every holder of a pre-S03 database — the exact sentence, inverted.
- **Acceptance steps 6, 8, 9 and 10** (`oracle/SPEC-v3-section-2-acceptance.md:47-72`) each run
  `pnpm dev:auth:up` and each requires it to complete ("run `pnpm dev:auth:up`, wait for it to finish";
  *"`pnpm dev:auth:up` **completes**"*; *"It succeeds"*). On any existing dev database, four of V's eleven
  acceptance steps cannot be started, let alone judged.

**The second member of the same class (orchestrator note 2), also verified by me.** With a custody whose
`api.env` was written by the pre-S03 stack, stage 1 refuses with `DEV_API_ENVIRONMENT_DRIFT`
(`apps/runner/src/dev-api-environment.ts:271`): an existing file that is neither byte-identical to the new
`source` nor in `acceptedPreviousSources` nor admitted by `acceptPreviousSource` throws, and the accepted
transitions are only the four `isExact*` predicates at `:312`, `:344`, `:399`, `:412`. S03's panel shape —
two healthy CLI slots with two keyless API slots absent — is not among them. Same class: **a guarded
upgrade path that S03 changed without adding the transition.**

**Why it is MY lens, and the part only this lens can say.** Both members are invisible to the slice's
entire verification surface, by construction. Every suite that touches this code — `dev-deployment-register`
(integration and architecture), `register-support-publication`, `dev-api-environment`, `dev-auth-stack`,
all of them inside C3 and the §5 seventeen — builds its prior state **with the current code, on a fresh
embedded postgres or a fresh file**. The only two tests that exercise the seal build a *deliberately wrong*
prior state, never the *previous release's correct* one: `tests/integration/dev-deployment-register.test.ts:681`
seeds a single bogus `riskTier` fixture row and asserts the seed refuses it; `register-support-publication.test.ts:902`
hand-alters one value. Both prove the seal **works**; neither measures the **upgrade path**. So this class
could not have been caught by any command of record, was not, and — this is the part that matters for the
future — **will not be caught by any re-verification of S03 either**, because the frame that hides it is
the fixture strategy, not a missing assertion.

**What the remedy is NOT.** Not "re-measure on a fresh database" — that is the frame that produced the
defect. Not a change to the F1 fix, which is correct.

**The remedy, as the product's own comment prescribes it.** Growth supersedes by **publication**: the
`planTierRosters` row belongs in `publishDevelopmentDeploymentRegisterProviderSet`'s published version, not
in the v4 historical replay — which is exactly what `dev-deployment-register.ts:640-650` says and what the
support configuration already does. Plus, for the class: one test that seeds v4 with the **previous
release's** row set and then runs the current seed, so the upgrade path has an oracle; and the matching
accepted transition for a pre-S03 `api.env`.

**VERDICT** S03's documented restart path does not run on any pre-existing developer machine, and R32's own
sentence is inverted / **CONFIDENCE high** on the mechanism and the test-blindness (every link measured by
me in source at this head; the refusal proved by an existing passing test; the row-set change proved by
git), **medium** on the live reproduction, which is the orchestrator's measurement and which I am forbidden
to repeat / **STRONGEST COUNTER** the orchestrator already served V the merged tree by publishing through
the product's own publish command and by moving the stale `api.env` aside, so V is unblocked today, S03's
product behaviour is correct and complete, and at pass 3 a REWORK spends a V row on what could be a
follow-up ticket. **Rebuttal:** the workaround is two manual steps that exist nowhere in the SPEC, and R32
is not about whether V can be served — it is the requirement that *the stack does not become un-startable
for anyone but V*, which is now false for everyone else. A lens that measured that and filed it as
non-blocking would be recording "promise met" about a promise it had just watched fail.

---

## 6. Non-blocking findings (each sets WHEN, never WHETHER; each needs a ticket by end of pass)

**N9 — the reader-side projection silently DROPS an unknown top-level member of the register row where the
seam used to refuse the row.** `apps/api/src/index.ts:1539-1547`. Measured (probe case **Y1**), shape by
shape, against the eleven my pass-2 X1 measured: exactly **two** of the eleven that the strict schema
refuses are now **admitted** at the application seam — `{free, premium, hidden}` (the unknown key is
dropped) and the `__proto__`-in-literal case (normalised away into a fresh plain object; **Y6** confirms no
prototype pollution reaches `Object.prototype`, so this second one is a refusal that disappeared *safely*).
The other nine still refuse identically. **This is a consequence of the correct remedy, not a deviation
from it** — law 3.2 prescribes the named allow-list for a fixed key set, and F1 applied it. But the
consequence is unrecorded and untested: a corrupt or hand-edited `planTierRosters` row carrying an extra
member is now served instead of refused, and no test of record says so. **Cost if unfixed:** a register row
that has drifted structurally reads as healthy at `/new` rather than failing loudly. **Remedy:** one case
pinning `Y1`'s disagreement set, so the next person to touch the seam learns which refusals are gone.
*file:line* `apps/api/src/index.ts:1539-1547`.

**N10 — `planTierRosters` is the only published register-row kind in the repo whose discriminant is
validated by nobody.** Measured (**Y2**): a row published as `kind: "CONFIGURED_PROVIDER_SET"` with valid
lists is served **identically** to the correct row. Measured (**mutant C**): corrupting the publisher's
literal leaves every behavioural case GREEN — the one suite that moves is the architecture selecting-files
pin, and it moves because the file stops matching a text pattern, not because the discriminant is checked.
Every sibling reader in the repo pins its discriminant: `apps/runner/src/dev-runner-policy.ts:20,28,60`
(`kind: z.literal(...)` inside `runnerRowsSchema`), `packages/register/src/index.ts:62,125,261,319,324`,
`acceptance/runtime-policy.ts:47,79`, plus hand-written guards at `packages/critique/src/index.ts:267`
(`candidate.kind !== "CONFIGURED_PROVIDER_SET"`) and `packages/battery/src/terminal.ts:1002`
(`value.kind !== "LIVENESS_POLICY"`). After F1 the publisher writes a discriminant that no reader reads.
**Cost if unfixed:** the repo's own convention silently has one exception, and the next reader of this row
cannot tell whether the `kind` is load-bearing. **Remedy (smallest):** keep the allow-list projection and
add `kind` to the *internal* read as a literal check, leaving the wire shape `{free, premium}` untouched —
which is what every sibling does. *file:line* `apps/api/src/index.ts:1543`.

**N11 — the F1 handoff records a class sweep over the wrong population, so the sweep cannot be checked
mechanically (law 3.2).** The handoff names the class as *"a fixed-key public projection parsed an internal
register-row object wholesale"* and then records "Sweep FOUND **17/17** `kind: z.literal(...)` sibling sites
and 0 plan-tier mentions **under `packages/register/src`**" — every listed site is under
`packages/register/src`. The members of the class it named are **readers** of register rows, and those live
outside that directory: `apps/runner/src/dev-runner-policy.ts:112` (five rows at once),
`apps/ui/app/new/defaults.tsx:27`, `apps/ui/lib/v3/adapter.ts:536`, `packages/register/src/index.ts:345-346`,
and `apps/api/src/index.ts:1538` itself. **I swept that population myself and the ANSWER is right: no other
member has the defect** — every sibling either pins `kind` in a strict schema (`dev-runner-policy.ts:20,28,60`;
`register/src/index.ts:319,324`) or reads a scalar and range-checks it (`defaults.tsx:28`, `adapter.ts:537`).
So the slice is not at risk. But a reviewer who took the recorded sweep at face value would have verified
nothing about the class, and one who wanted to check it had to re-derive the whole thing — which I did.
**Remedy:** record a sweep over the population the class names, with the command that enumerated it.
*file:line* `.hermes/reports/debate-tiers/review-packages/S03-p3/board/FIX-S03-p2-F1.t_2ab42655.txt:54`.

### Carried findings — status at `3f488b3f` (charge 5; none was assigned to F1)

| # | From | Still holds? | Evidence re-measured this pass |
|---|---|---|---|
| **N1** | p2 | **YES** | `acceptance/claude-relay.ts:72` is still exact equality on the `kind:"model"` branch while the alias branch lowercases and token-splits (`:75-77`); probe **P6** (dated key, no `canonicalModel`, one helper → `CLAUDE_CLI_MODEL_UNRESOLVED`) and **P7** (same shape *with* `canonicalModel` → resolves) both green. Failure window unchanged: *dated key AND no `canonicalModel`*. |
| **N2** | p2 | **YES** | X2 green: `PlanTierRostersSchema.parse({free:[],premium:[]})` succeeds (`contract/src/index.ts:308-311`); X3 green, so still unreachable from the committed file. |
| **N3** | p2 | **YES — and F1 did not address it** | `apps/api/src/index.ts:1537` still calls `readDeployment`, whose `Promise.all` at `:1488` runs the register, scorecard and run-execution-binding queries; a failure in either unrelated query still rejects the roster read. F1 changed only the lines below it. |
| **N4** | p1 N1 → p2 | **YES** | `dev-api-environment.ts` `additive` `:383`, `exactHeldSet` `:386`, refusal `:391` — line numbers unchanged by the merge; the S28 residue still names step 8 where step **9** is what refuses. |
| **N5** | p1 N2 → p2 | **YES** | `heldConfiguredProviderSets` is *constructed* in exactly two places repo-wide, both fixtures (`tests/integration/dev-api-environment.test.ts:441`, `:493`); production only threads the parameter (`dev-auth-stack.ts:191` → `dev-api-environment.ts:531` → `:384`) and nothing writes it onto the receipt. |
| **N6** | p1 N3 → p2 | **YES** | `dev-provider-keys.ts:66` validates the key **NAME** against `/^[A-Z][A-Z0-9_]*$/u`; `:69` stores the **VALUE** verbatim (`rawLine.slice(separator + 1)`), so a quoted `.env` value is an absent-slot probe failure, not a format refusal. |
| **N7** | p1 N4 → p2 | **YES — and now measured, not re-grepped** | `packages/model-config/src/shape.ts:154-163` is byte-unchanged since `62a4c367`. I drove the predicate directly: `https://api.x.test/v1?` **ADMITTED** and `…/v1#` **ADMITTED** (URL normalises a bare `?`/`#` to `search=""`, `hash=""`), while `…?k=v` and `…#f` are REFUSED; `https://10.0.0.5:8443/v1` and any host ADMITTED. The pass-2 wording holds exactly. |

---

## 7. UNVERIFIED — what I could not do, and why

- **Any real provider or CLI call.** No lens may call the `codex`/`claude`/`grok` CLIs or a paid endpoint.
  R18's runtime consequence is established on the ARGV each relay builds through its own process seam —
  which is the thing R18 names — and **not** on an observed live turn. N1's real exposure (what `modelUsage`
  keys a real Claude CLI emits, and whether it always emits `canonicalModel`) stays **UNVERIFIED**; the same
  line pass 2 drew, still drawn.
- **The live `:3000` stack, a browser, V's dev database, and V's acceptance steps.** Forbidden to this seat.
  So "a corrupt row with an extra member now renders as healthy cards" (N9) is measured at the
  **application** seam, not observed in the page. **And B1's live reproduction is the orchestrator's, not
  mine** — I could not and did not run `pnpm dev:auth:up` against a pre-S03 database. What I contribute is
  the mechanism, measured link by link in source at this head, plus the row-set change measured from git
  and the refusal proved by an existing passing test. If the orchestrator's observation were somehow
  mistaken, links 2–4 of §5 would still stand and the class would still be untested.
- **Whether a pre-S03 `api.env` could be accepted by `acceptPreviousSource`** at some call site I did not
  read. I measured the four `isExact*` predicates the refusal consults and that none matches S03's panel
  shape; I did not enumerate every caller that supplies `acceptPreviousSource`.
- **The wire body of `GET /v1/plan-tiers` for an authenticated user.** That is the security lens's charge
  this pass; I measured only that the application projects `{free, premium}` and that the handler re-parses
  strictly at `:927`.
- **Whether the observability branch intends its two routes to be in `contractInventory`.** I measured that
  they are not and that this is the sole cause of the RED; the fix is that mission's call.
- **`tests/unit/contract.test.ts`'s own coverage of the new route beyond the inventory list** — I ran it
  (10/10 inside the pair) but did not audit its cases; the pin I needed was the length/ set/ matrix triple.
- **The end-to-end refusal of acceptance step 9** (N4) and **`max_tokens: 64` without
  `thinking:{type:"disabled"}` against a real Z.ai endpoint** — carried, never measured by anyone.
- **Whether OpenAI sells `gpt-5.6-luna`** — row V-34, waits on V's key.

---

## 8. Verdict

**REWORK — pass 3 of 3, lens `correctness-tests`. Pass 3 is the last lawful pass, so this is a V row (§10).**

**One blocking finding, B1:** S03 added its `planTierRosters` row to the replay set of **sealed** historical
register version 4 (13 → 14 rowKeys between `9a000c37` and `3f488b3f`) instead of superseding by
publication as `dev-deployment-register.ts:640-650` prescribes. Any database whose v4 was sealed before S03
therefore refuses the replay — proved by the repo's own passing test
`register-support-publication.test.ts:902` — and `pnpm dev:auth:up` fails at
`DEV_AUTH_DATA_PLANE_REGISTER_FAILED`. That command is what acceptance steps 6, 8, 9 and 10 run, and R32
closes with *"The dev stack does not become un-startable for anyone but V."* A second member of the same
class: a pre-S03 `api.env` fails stage 1 with `DEV_API_ENVIRONMENT_DRIFT`
(`dev-api-environment.ts:271`; the accepted transitions at `:312/:344/:399/:412` do not include S03's panel
shape). **The class is invisible to every command of record**, because every suite builds its prior state
with the current code on a fresh database or a fresh file; the two tests that touch the seal construct a
deliberately *wrong* prior state, never the previous release's correct one.

**Everything else this lens owes is green and re-measured by me.** All five commands of record match the
orchestrator's re-verification exactly, with `Test Files` 17 on the integrated run and the only failures
the two pre-existing `register-support-publication` titles plus the one inherited route-pin title.
FIX-S03-p2-F1's seam ruling is correct and correctly sided — I reproduced the pre-fix RED myself
(`unrecognized_keys ["kind"]`, mutant A), proved the joining case is built from the production publisher
(mutant B) and that it pins the row rather than the compiled constant (mutant F), and confirmed
`tiers-s02-rosters` case 6 still pins exactly two selecting files. My pass-2 probes are 13/13 and all six
pass-2 mutant directions are unchanged, so pass-1 B1 (R18) stays closed at the merged head. The route-pin
RED is the observability branch's two ungoverned rows, isolated by mutant E and attributed; the masking it
causes on S03's own drift detector is **inherited**, and mutant E2 shows the detector recovers the moment
the gap closes. S03's own row is present in all three lists. **No packet defect this pass.**

**Three new non-blocking findings** — **N9** (the projection stopped refusing two of eleven shapes; measured
Y1), **N10** (the row's `kind` is now validated by nobody, uniquely in this repo; measured Y2 + mutant C),
**N11** (the F1 handoff's recorded class sweep covers the wrong population — the answer is right, the record
is not checkable). **Seven carried findings N1–N7 all still hold**, N7 now measured rather than re-grepped.

**On my own tiering, plainly.** On the charges as written I had this lens at PASS, and the artifact said so
before the two orchestrator notes arrived. I changed it because the notes are correctness, are mine to
price by the orchestrator's own words, and survived my attempt to verify them independently. Had I filed
PASS while a numbered requirement of this slice's SPEC was demonstrably false on every existing developer
machine, the pass-3 record — the last one before V — would have asserted a promise met that I had just
watched fail.

---

## 9. Probes promoted

- `.hermes/reports/debate-tiers/probes/REV-S03-p3-correctness-tests-probe.test.ts` — Y1–Y6, 6 cases.
  Every roster id comes from `PLAN_TIER_ROSTERS` or the production publisher; no model id is a literal.
- `.hermes/reports/debate-tiers/probes/REV-S03-p3-correctness-tests-mutants.py` — mutants A–E2,
  content-matched, exactly-one-match assertion, sha256-verified restore, refuses a dirty tree. Its header
  names the head it was written against (`3f488b3f`) and it restores **from the bytes it captured in that
  run**, never to a literal.
- `.hermes/reports/debate-tiers/probes/REV-S03-p3-correctness-tests-run-probe.sh` — takes the worktree root
  from `$WORKTREE` or argv, **never hard-coded**; copies the probe in, runs it, removes it, prints the
  porcelain before and after. **Verified end to end in my worktree: `Tests 6 passed (6)`, porcelain 0 → 0.**
- `.hermes/reports/debate-tiers/probes/REV-S03-p3-correctness-tests-mutants-evidence.txt` — the verbatim
  mutant run, every sha and restore line included.

**A direction that can invert.** Y1 pins the *set of shapes on which the schema and the application seam
disagree*. At `3f488b3f` it has exactly two members. If the reader-side projection is ever replaced, Y1
must be re-derived before it is trusted — that is stated in the probe and in the runner's header.

---

## 10. Rows for V

The first row carries B1 and is the reason this pass is a REWORK; the second is the N10 hardening row.
Neither is numbered here — the orchestrator numbers them at transcription.

```
V-ROW: NEW · S03 · S03 grew a SEALED historical register version, so `pnpm dev:auth:up` — the command
four of V's own acceptance steps run — cannot complete on any dev database sealed before S03
S03 added its `planTierRosters` row to the row set that seedDevelopmentDeploymentRegister replays into
SEALED historical register version 4 (DEVELOPMENT_REGISTER_VERSION = 4,
apps/runner/src/dev-deployment-register.ts:62; the builder emits 13 rowKeys at the lane base 9a000c37
and 14 at the review head 3f488b3f, the added one being planTierRosters at :344). The file's own comment
at :640-650 states the rule: the historical bootstrap is sealed and growth "supersedes the old set by
publication". A changed v4 row set is refused — the repo's own PASSING test
tests/integration/register-support-publication.test.ts:902 asserts importHistorical("4", changed) rejects
with "historical replay drift" for a single altered value; S03 added a whole row. So every database whose
v4 was sealed before S03 refuses the seed, and `pnpm dev:auth:up` fails at
DEV_AUTH_DATA_PLANE_REGISTER_FAILED (apps/runner/src/dev-auth-data-plane.ts:105-108, :373-378 shelling
dev:auth:seed-register). The orchestrator measured exactly this on V's live merge-day database; I could
not repeat it (this seat is forbidden the live database) and instead verified every link in source.
SPEC-v3 R32 closes with "The dev stack does not become un-startable for anyone but V", and acceptance
steps 6, 8, 9 and 10 each require the command to complete. A second member of the same class: a custody
whose api.env predates S03 fails stage 1 with DEV_API_ENVIRONMENT_DRIFT
(apps/runner/src/dev-api-environment.ts:271); the four accepted transitions at :312/:344/:399/:412 do not
include S03's panel shape. The class is invisible to the slice's whole verification surface because every
suite builds its prior state with the CURRENT code on a fresh embedded postgres or a fresh file; the only
two tests that exercise the seal build a deliberately WRONG prior state (a single bogus riskTier fixture
row at tests/integration/dev-deployment-register.test.ts:681; one hand-altered value at :902), never the
previous release's correct one. So no command of record could have caught it, and none will.
Recommended default: move the planTierRosters row out of the v4 historical replay and into
publishDevelopmentDeploymentRegisterProviderSet's published version, exactly as the file's own comment
and the support configuration already do; add the accepted transition for a pre-S03 api.env; and add one
test that seeds v4 with the PREVIOUS release's row set before running the current seed, so the upgrade
path has an oracle. S03's product behaviour needs no change.
Smallest yes/no for V: "Must a slice that changes sealed or already-written developer-machine state ship
an upgrade path and a test that starts from the previous release's state, before it can be called done?"
VERDICT hold S03 until the restart path runs on an existing machine / CONFIDENCE high on the mechanism
and the test-blindness, medium on the live reproduction (the orchestrator's, not mine) / STRONGEST
COUNTER: the orchestrator already served the merged tree by publishing through the product's own publish
command and moving the stale api.env aside, so V is unblocked today and the slice's product behaviour is
correct and complete; a pass-3 REWORK spends a V row on what a follow-up ticket could carry. Rebuttal:
the workaround is two manual steps documented nowhere in the SPEC, and R32 is not a promise that V can be
served — it is the promise that the stack does not become un-startable for anyone but V, which is now
false for every other machine, including a clean clone whose database predates S03.
```

```
V-ROW: NEW · S03 · after F1, the plan-tier register row's `kind` discriminant is written by the
publisher and read by nobody — the only published row kind in the repo with no reader-side check
FIX-S03-p2-F1 correctly ruled the row<->reader seam on the reader side: apps/api/src/index.ts:1539-1547
now projects the named allow-list {free,premium} off the register row before the strict wire parse, which
is exactly the remedy law 3.2 prescribes for a fixed key set. Two measured consequences were never
recorded. (1) The seam stopped refusing two of the eleven malformed shapes the strict schema refuses: an
unknown top-level member is silently dropped, and a `__proto__` literal is normalised away (measured safe
— no prototype pollution). (2) The publisher still writes kind:"PLAN_TIER_ROSTERS"
(dev-deployment-register.ts:346) and no reader validates it: a row published with the WRONG kind is served
identically, and corrupting the publisher's literal leaves every behavioural test green. Every sibling
register-row reader in this repo pins its discriminant with kind: z.literal(...) —
apps/runner/src/dev-runner-policy.ts:20,28,60; packages/register/src/index.ts:62,125,261,319,324;
acceptance/runtime-policy.ts:47,79 — so planTierRosters is now the single exception to the repo's own
convention. Nothing is broken today and S03's promise is met; this is hardening plus a record gap.
Recommended default: keep the wire shape {free,premium} exactly as it is, and add `kind` as a literal
check on the INTERNAL read only, matching every sibling; pin Y1's disagreement set with one test case.
Ship S03 as is and take both in TEST(S03) residue rather than a fourth REV pass.
Smallest yes/no for V: "Should a register-row reader be required to validate the row's `kind`, even when
the public wire shape does not carry it?"
VERDICT ship S03; fix the discriminant and pin the disagreement set as N-tickets / CONFIDENCE high
(measured: probe Y1/Y2, mutant C, and the sibling sweep) / STRONGEST COUNTER: the discriminant is
redundant because the row is already selected by row_key, so checking `kind` guards only a corrupt or
hand-edited row — a case that is out of scope for a development register. Rebuttal: that is precisely the
case the strict schema was there to catch before F1, and the reason pass-2 B1 existed at all was a
producer/consumer shape disagreement nobody detected; a one-line literal check restores the detector
without touching the wire.
```

---

## 11. Predictions about the other two lenses (falsifiable; written before any contact)

**Written after the orchestrator's two notes, which all three lenses received, so the interesting question
is no longer whether anyone finds B1's subject but what each lens does with it.** My sharpest prediction:
**I expect at least one of them to file it non-blocking, and I expect the split to be about R32 rather than
about the mechanism.** The mechanism is not really contestable — the row count went 13 → 14 on a sealed
version and the repo's own test says a changed v4 is refused — so the disagreement will be tiering. I
predict **product-truth** reads it as blocking with me, because acceptance steps 6/8/9/10 are literally
their oracle and "V cannot run four of the eleven steps" is the most product-truth sentence available;
and I predict **security-data-safety** files it non-blocking or out-of-lens, because a refused replay is a
**seal working correctly** — from a data-safety lens the refusal is the system doing its job, and the
defect reads as an operational upgrade gap rather than a safety one. If security does raise it, I predict
they arrive via `importHistorical`'s sealing guarantees and frame it as "S03 attempted to mutate sealed
state", which is a sharper framing than mine and would be the better one for the record.

On the charges as written, I predict **both** other lenses would otherwise have returned **PASS**.
**Security-data-safety** owns the wire answer after F1, and I expect them to arrive at
my N9 from the opposite direction and rate it higher than I do: their probe R is now inverted (`R_ROUTE_STATUS=200`),
and the natural next question — *what else can ride along in that row?* — lands exactly on the dropped
unknown member. I expect them to confirm the wire is exactly `{free, premium}` with no `kind` leak, and I
predict they will **not** raise the missing discriminant, because from a data-safety lens dropping an
unknown member is strictly safer than refusing on it, and the `__proto__` case (my Y6) resolves in the
product's favour. I also expect them to keep P4's `EXTRA_MEMBERS` → 500 as correct-and-intended: that is
the handler's strict re-parse at `:927` refusing a widened APPLICATION result, which is a different seam
from the one F1 moved, and a lens that reports it as a regression would be wrong. **Product-truth** owns
`/new` and I expect them to close their B1 affirmatively; the trap in their path is the carried package
warning — their case **C** mocks `readPlanTiers` to REJECT and then asserts the two Free ids, so its Free
card is `[]` at **every** head and it must be re-derived before any direction is read off it, and their
case **3b** asserts the *persisted* `value_json` has no `kind`, which is the writer-side remedy F1
explicitly did not take. If either lens reports a blocking finding, I predict it is product-truth ruling
that "the persisted text keeps `kind`" fails the promise — and I think that reading is wrong: the promise
was about what `/new` lists, and the row is internal storage, not the wire. My own most likely error this
pass is **tiering in the other direction from pass 2**: a reasonable reviewer could hold N10 blocking on
the ground that a validated discriminant is what pass-2 B1 was really about. I hold it non-blocking because
S03's promise is met at this head, no reachable input breaks today, and pass 3 is the last lawful pass —
spending a V row on hardening that a TEST(S03) ticket can carry would cost more than it buys.
