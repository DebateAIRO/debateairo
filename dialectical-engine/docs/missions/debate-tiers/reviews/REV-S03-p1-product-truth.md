# REV(S03) — lens **product-truth**, pass 1 of 3 — slice `S03` @ `cc014550`

**SKILLS LOADED:** `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md` ·
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md` ·
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md` ·
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`

Seat REV-S03-p1-product-truth · ticket `t_31d988e8` · blind (the two sibling lenses and the S03 lane
never opened) · worktree `.worktrees/rev-s03-p1-product-truth/dialectical-engine`, detached at
`cc014550`, porcelain 0 on arrival and 0 at handoff · base `9a000c37` · comments read through: 1.

**VERDICT for this lens: REWORK** — one blocking finding (B1), three non-blocking (N1–N3), one row
for V. The lens measured is *what V asked for, against what the slice does*.

---

## 1. The packet review (it is in my scope; its author cannot review it)

The packet is accurate where it is checkable: the cwd resolves, `cc014550` is the slice head, the
freeze pair `b6ecee09..8e89d5d4` is concrete and its CWD-relative pathspec produces a non-empty
diff (14 files, 1882 insertions — the orchestrator's record of the pass), rows V-34…V-41 exist and I
read them before raising anything, and the four BUILD seats' `SKILLS LOADED` lines are each complete
against the worker floor (using-superpowers · heartbeat-protocol · heartbeat-worker ·
test-driven-development · verification-before-completion · systematic-debugging) — **no fabrication
finding against any author.** Three defects, all against the orchestrator, are N1–N3 below.

The one substantive packet error is inside probes.md and it is load-bearing, so it is stated here as
well as at N1: **probe 13's parenthetical "the page ALREADY reads the deployment for riskTier
defaults" is false.** `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) has **zero call
sites** in `apps` or `tests` (`git grep -n 'deriveRiskTierDefault' -- apps tests` returns only its
own definition), and the base page `9a000c37:./apps/ui/app/new/page.tsx` contains no `readDeployment`
at all. S03 introduces the **first** deployment read on `/new`. Had I taken the parenthetical as
given, B1 would have been written off as pre-existing precedent.

## 2. What I re-ran (commands verbatim, `passed/total`)

Every run through `LOG=<abs> zsh .claude/skills/heartbeat-orchestrator/scripts/run-capture.sh <cmd>`,
from my worktree. No dev server, no browser, no live database, no provider call, no `.local` read.

| # | command | result | vs the package |
|---|---|---|---|
| C1 | `npx vitest run tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/unit/model-config-file.test.ts tests/unit/model-config-shape.test.ts tests/unit/model-config-tiers.test.ts tests/architecture/model-config-no-secret.test.ts` | rc=0 · Test Files 6 passed (6) · **Tests 24 passed (24)** | matches (24/24) |
| C2 | `npx vitest run tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts tests/unit/provider-base-url-admission.test.ts tests/unit/provider-discovery-uncredentialed.test.ts` | rc=0 · Test Files 4 passed (4) · **Tests 26 passed (26)** | matches (26/26) |
| C3 | `npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts` | rc=1 · Test Files 1 failed \| 8 passed (9) · **Tests 2 failed \| 88 passed (90)** | matches |
| C4 | `npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts` | rc=0 · Test Files 4 passed (4) · **Tests 67 passed (67)** | README says 73/73 — see N3 |

All `LANG=en_US.UTF-8`. C3's two failures are named and dated: `register-support-publication.test.ts`
→ *"recognizes hostile static SQL concatenation, interpolation, and tagged builders"* and
*"classifies every register relation access and bans open writers, latest selection, and unsafe
version coercion"* — **pre-existing, dated 2026-09-12**, delta zero (SPEC-v3 R27). No other failure
appeared in any run of mine.

## 3. My own probes (promoted to `.hermes/reports/debate-tiers/probes/REV-S03-p1-product-truth/`)

**P1 · `new-page-deployment-refusal.test.tsx` — 3/3.** Built from the CLAIM (acceptance step 2), not
from the author's test. Case A is the control on known-good input (a RESOLVED payload renders all
five ids, each with a non-empty `--dot`). Cases B and C render the page when the deployment read does
**not** resolve. Evidence for B1.

**P2 · `model-config-broken-edits.test.ts` — 10/10.** V's own plausible broken edits, each over its
own `mkdtemp` root: a pasted real key, `api: acme`, a second Anthropic entry in Premium, a query in
`base_url`, credentials in `base_url`, a deleted tier, broken YAML. Every one is refused with the
right class, naming the tier and the entry's model, and **no key-looking value is echoed** in
`message`, `String(error)` or `JSON.stringify(error)`. Two further cases pin standing risks (V-37's
`glm-4.7` and V-39's no-`cli:` file are both ADMITTED by the file check).

**P3 · the mutant (the refutation duty).** Byte copy taken, then V's own acceptance-step-6 edit
applied to `config/models.yaml` (`model: glm-5.3-flash` → `model: glm-5.3`), `pnpm run
generate:contract` rc=0. Result: `packages/contract/generated/plan-tier-rosters.ts` became
`free: ["gpt-5.6-luna","glm-5.3"]` and **`git status --porcelain apps/ui` stayed at 0 entries** — the
file genuinely drives the product's data path with nothing rebuilt or edited under `apps/ui` (R16's
mechanical half, acceptance step 6). Re-running C1 under the mutant: **3 failed | 21 passed (24)** —
`tier01-roster`, `tiers-s02-rosters` and `model-config-file` all catch the edit (this is N2, not a
defect). Restored from my own byte copy; `config/models.yaml` sha256
`97af8017bf45e3d2b1da2b8907318475b044d3ba765a6ef12e8e10a9ad8654ea`, generated rosters regenerated,
porcelain clean.

## 4. The charges, answered in V's order

**(a) `config/models.yaml` is the ONE declaration — YES.** The committed file at `cc014550` is
byte-exact to R7: two tiers, five entries, Free = `gpt-5.6-luna` over `openai` at
`https://api.openai.com/v1` and `glm-5.3-flash` over `zai` at
`https://api.z.ai/api/coding/paas/v4`, both keyed **by variable name** (`OPENAI_API_KEY`,
`ZAI_API_KEY`); Premium = the three CLIs unchanged; the "Put Grok in Free too" block intact. No
secret in the file. My quoted-exact scan over `git ls-files apps packages` (non-test,
non-generated) returns **NONE for all six ids** — `gpt-5.6-luna`, `glm-5.3-flash`, `gpt-5.6-sol`,
`claude-opus-5`, `grok-4.6-build`, `claude-sonnet-5` — with **no allow-list**. Every literal that
survives, named:

- `apps/api/src/support/model.ts:6-7` — `"development:hermes-glm-5.3-flash"`, `"z-ai/glm-5.3-flash"`
- `apps/runner/src/dev-support-model.ts:2-3` — the same two
- `apps/runner/src/dev-auth-stack.ts:60` — `providerRef: "development:hermes-glm-5.3-flash"`
- `apps/ui/components/landing/cards.ts:27-28` — `"Anthropic · Claude · claude-opus-5"`,
  `"OpenAI · GPT · gpt-5.6-sol"`
- `apps/ui/lib/publicDebatePresentation.test.mjs` — a test file

The first three are the support seam's provider ref and maker-qualified model (R26, untouched — and
`dev-real-provider-only` is 4/4 in my C3 run). **The `cards.ts` pair I probed as a suspected stale
surface and refuted it**: two lines below sits `A_GEMINI = "Google · Gemini · gemini-3-ultra"`, a
model in no tier at all — it is the landing page's illustrative sample exchange, not a roster claim.
`claude-sonnet-5` survives in **no production file at all**.

**(b) "edit, then restart the stack" — the check is FIRST, and it refuses by class.**
`startDevelopmentAuthStack` (`apps/runner/src/dev-auth-stack.ts:149-155`) runs
`checkModelConfig()` as stage **one**, before the port preflight, before the provider panel, before
the data plane and before `assembleApiEnvironment` — so a shape refusal is structurally incapable of
touching `api.env` or the register (R19/R21). The refusal line names tier, model and class number
with no key value (`dev-auth-stack.ts:288-296`, R22), and my P2 confirms all six classes on V's own
edits. The availability half is also right (R31/R32, V-38): `resolveDevelopmentApiProviderSlots`
(`apps/runner/src/dev-provider-panel.ts:232-262`) emits
`DEV_PROVIDER_SLOT_UNAVAILABLE class (a) tier=… model=…` for a missing key and `class (b)` for a
probe failure **or an echo mismatch** (`response.model === slot.model`, R30), returns the slot with
the sentinel model, and the stack starts. Not a refusal — as V-38's default binds.

**(c) What V reads on `/new` — the ids are right, the read is not. See B1.** The card prints the raw
id (`page.tsx:224` renders `{modelId}`), not a family name, so acceptance step 2's "lists exactly
`gpt-5.6-luna` and `glm-5.3-flash`" is the right shape; `glm-5.3-flash` falls to the `default` family
(`apps/ui/lib/models.ts:34`) and its dot resolves to `var(--m-default)` = `#888888`, defined in both
`:root` and the chamber block (`globals.css:41,147`), so R17's "non-empty name, visible dot" holds —
my P1 case A asserts all five. `ui: no`, so the DOM assertion is the oracle and no artboard exists;
I measured no CSS geometry. **But the values never arrive in a browser: B1.**

**(d) The CLI panel asks for full ids — YES; the relays' handling is UNVERIFIED (V-40).**
`dev-cli-provider-panel.ts:115-129` passes `slot.model` straight from the file to each starter:
codex → `startModelShim({model: slot.model})`, claude → `startClaudeRelay({model: slot.model})` =
`claude-opus-5`, grok → `startGrokRelay({model: slot.model})` = `grok-4.6-build`. No `claudeAlias`,
no prefix matching, no `"opus"` anywhere. The two boundary casts at `:123` and `:129` are row V-40's;
**what they hide — whether the real relays honour a `model` member — is UNVERIFIED by any suite and
by me.** I did not call a relay.

**(e) An `api:` slot starts NO process and takes NO port — YES.** Starters are built only for
`slots.filter((slot) => slot.transport === "cli")` (`dev-cli-provider-panel.ts:115`), the start-set
size is asserted against the CLI slot count (`:49-51`), and an `api` slot's observation is built
directly from `provider.baseUrl` with no port and no relay (`:61-67`). R10 holds.

**(f) The acceptance-step map.** Which suite or command stands in for each of V's steps 1–11, and
what is runnable on merge day. "Runnable" means *V can perform it*; a step marked **BLOCKED by B1**
has its suite green and its browser step failing.

| Step | Stands in for it in this slice | Merge day |
|---|---|---|
| 1 read the file | `tests/unit/model-config-file.test.ts` (in my C1 24/24) + my P2 control | **runnable** ✔ verified |
| 2 `/new` lists both tiers | `tests/render/tier01-new-plan-tier.test.tsx` 24/24 — mocks the read RESOLVED | **BLOCKED by B1** |
| 3 Free debate on both models | none — waits on V's keys (V-34) | waits on keys · UNVERIFIED |
| 4 read `discovered_panel` back | the command **is recorded verbatim** in the C3 handoff (`board/BUILD-S03-C3.t_843976bb.txt:75`, the `psql … discovered_panel` one-liner) — I confirmed it appears and did **not** run it | waits on keys · UNVERIFIED |
| 5 Premium debate on three CLIs | `tests/unit/dev-cli-provider-panel.test.ts` 11/11 pins the full-id starts; no end-to-end suite | runnable (no key) · not suite-covered |
| 6 edit one line, restart, `/new` shows it | my P3 mutant proves file → generated roster with **0 changes under `apps/ui`** | data path ✔ · **`/new` half BLOCKED by B1** |
| 7 broken edit refused, nothing rewritten | `dev-auth-stack.test.ts` 24/24 + `model-config-shape.test.ts` + my P2 (10/10) | **runnable** ✔ verified |
| 8 missing model named, never substituted | `tiers-s02-admission.test.ts` 15/15 (typed refusal) + R31(a) warnings | refusal ✔ · **the "`/new` still lists both" clause BLOCKED by B1** |
| 9 subtraction, version moves | `dev-deployment-register.test.ts` 14/14 + `dev-api-environment.test.ts` 12/12 | runnable · **at risk from V-41** (see N1) |
| 10a add grok under `free:` | the render suite's runtime-row case | **BLOCKED by B1** |
| 10b that debate runs on all three | none — waits on V's keys | waits on keys · UNVERIFIED |
| 11 support bot still answers | `dev-real-provider-only.test.ts` 4/4 + the untouched-refs scan in (a) | **runnable** ✔ verified |

## 5. Findings

### B1 (BLOCKING) — `/new`'s tier cards are empty for every browser session, silently. Acceptance step 2 cannot pass.

`apps/ui/app/new/page.tsx:114-123` · `apps/api/src/index.ts:139` · `apps/api/src/index.ts:475-477`

**Concrete inputs → wrong outcome.** V signs in on the `:3000` stack and opens `/new`. The page calls
`contractClient.readDeployment()` → `GET /v1/deployment` (`packages/contract/src/client.ts:506`) over
the browser's same-origin cookie client (`apps/ui/lib/api.ts:106`). That route's policy is
`auth: "operator"` (`apps/api/src/index.ts:139`), and the **only** runtime evaluation of that policy
is:

```
if (authPolicy === "operator") {
  return reply.status(403).send({ error: "OPERATOR_REQUIRED" });
}
```

— `apps/api/src/index.ts:475-477`, inside the cookie-authenticated branch, **unconditional**: no
role, claim or scope is consulted, and `Session` carries no role field. A request with no cookie gets
401; the retired dev header gets 401 (`s7-authorization.test.ts:193-197`). The client throws on any
non-2xx (`packages/contract/src/client.ts:122`), and `page.tsx:123` ends `.catch(() => undefined)`.
`planTierRosters` therefore stays `EMPTY_PLAN_TIER_ROSTERS` (`page.tsx:49`), and `page.tsx:216`
maps an empty array.

**What V sees:** the Free and Premium cards render with their names and promises and **no model ids
at all**, and nothing on the page says why. Measured, not argued — my P1 case B at `cc014550`:
`.ndTierModel` count **0**, `.error` element **null**, no `"OPERATOR_REQUIRED"` and no `"gpt-5.6-luna"`
anywhere in the markup, while both `.ndTierOption` buttons still render. Case A proves the same
harness renders all five ids on a resolved payload, so this is the page, not my fixture.

**It is a regression, not a pre-existing gap.** At base, `9a000c37:./apps/ui/app/new/page.tsx:10,200`
imported `PLAN_TIER_ROSTERS` and mapped it — the ids rendered for every signed-in user with no
network read. S03 replaced a build-time constant with an operator-only runtime read. And the page had
**no** deployment read before this slice (probe 13's parenthetical is false — §1).

**Why every suite is green:** `tests/render/tier01-new-plan-tier.test.tsx:92` sets
`mocks.readDeployment.mockReset().mockResolvedValue(deploymentFixture)` — the suite only ever renders
the state the product cannot reach. No suite in the slice exercises the rejection.

**Evidence that no path grants operator:** `git grep -n 'OPERATOR_REQUIRED' -- apps packages tests`
returns one production site and three test assertions, all of them refusals
(`tests/unit/api.test.ts:233`, `tests/unit/s5-session-http.test.ts:178`,
`tests/unit/s7-authorization.test.ts:189-197`); **no suite in the repository asserts a 200 for
`/v1/deployment`.** `tests/unit/api.test.ts` ran 26/26 in my own C4 run, including *"does not expose
deployment state to an ordinary user"*.

**This is a REWORK item under SPEC-v3**, not a V row: it fails R16 ("after an edit and the restart
command, `/new` shows the new lists") and R23.5 ("→ `/new`'s tier lists: every entry, **always** —
never minus"), and it defeats acceptance step 2 outright and steps 6, 8 and 10a in part. The honesty
law is broken in the same stroke: the list shrinks to zero **silently**, where the slice's own R31
insists "nothing shrinks the panel silently — the warning and the typed refusal are the two places it
is named". The fix is the FIX node's to choose (a `user`-readable roster surface; or the roster row
carried on a route `/new` may already read; or, at minimum, the refusal surfaced the way
`sessionDefaultsError` already is at `page.tsx:105-108` — but a visible error is a degraded step 2,
not a passing one). **Whichever is chosen, it needs the RED test this slice lacks: `readDeployment`
REJECTS → assert what the user sees.**

VERDICT: blocking · CONFIDENCE **high** (route policy read, enforcement read, three refusal suites,
client throw path read, and the rendered DOM measured in both failure shapes) · STRONGEST COUNTER:
*"V's dev session is special, so V's acceptance still passes."* It is not — the 403 is issued to
every cookie session with no role consulted, and the retired dev header is 401. If some deployment
path outside this repository injects an operator principal, it is invisible to every suite here and
to me, and it would still leave every ordinary user with empty cards.

### N1 (non-blocking) — probes.md carries a false precedent and lane-only paths; V-41 cites the wrong acceptance step

`.hermes/reports/debate-tiers/review-packages/S03-p1/probes.md` — three defects against the
orchestrator, one class: **the package asserts things it did not re-measure.**

1. **Probe 13's "the page ALREADY reads the deployment for riskTier defaults" is false.**
   `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) has zero call sites in `apps` or
   `tests`; the base page has no `readDeployment`. It would have talked a reviewer out of B1.
2. **Every probe cites `/.worktrees/tiers-s03/dialectical-engine/<file>:<line>`** — the S03 lane, the
   one tree my packet forbids. A blind lens must re-resolve all thirteen into its own worktree, three
   times over in parallel, and the hazard is that one simply opens the lane path.
3. **Row V-41 and the README residue line both say "acceptance step 8 (remove an entry, restart, the
   register publishes a smaller set)".** In SPEC-v3 §2 the removal is **step 9**; step 8 is the
   missing-model refusal. On merge day V would run the wrong step looking for the V-41 risk.

Remedy (sets WHEN, not WHETHER): re-grep every "already does X" claim before it ships in a package;
assemble probe paths `$WORKTREE`-relative; correct the step number in V-41 and the README.
VERDICT: non-blocking · CONFIDENCE high · STRONGEST COUNTER: none — (1) and (3) are checkable facts.

### N2 (non-blocking) — the acceptance tells V to edit the file and never tells V to put it back

`docs/missions/debate-tiers/slices/S03/SPEC-v3.md` §2 steps 6, 9, 10a (oracle
`SPEC-v3-section-2-acceptance.md:47-72`) · `tests/unit/model-config-file.test.ts` ·
`tests/architecture/tier01-roster.test.ts` · `tests/architecture/tiers-s02-rosters.test.ts`

Measured (P3): with `config/models.yaml` edited exactly as step 6 instructs, C1 goes **3 failed | 21
passed (24)** — those three suites pin V's merge-day roster, as R7/R27 require. Steps 7 and 9 end
with "Undo the fault" / "Put the entry back"; **step 6 and step 10a do not.** So V is invited to leave
the repository in a state where three suites are RED and `config/models.yaml` is dirty, and the next
seat or CI run reports a three-suite regression that is really V using the product as designed.
Remedy: one sentence on steps 6 and 10a ("restore the file when you are done"), or a named note that
these suites are expected RED while the file is edited.
VERDICT: non-blocking · CONFIDENCE high · STRONGEST COUNTER: *"obvious to V"* — it is not obvious to
the next seat that finds the RED, which is who pays.

### N3 (non-blocking) — the package's C4 number cannot be reproduced by the package's C4 command

`review-packages/S03-p1/README.md:13` says "C4 73/73 ×3". The cluster map's §2 C4 row names a
**four**-file command; run verbatim it gives **67/67** (my run above), which is exactly what the
gate's own per-suite re-verification sums to (24+15+2+26). The seat ran **five** files —
`tests/architecture/tiers-s02-rosters.test.ts` joined C4 for the S13 flip
(`board/BUILD-S03-C4.t_f0797f95.txt:77-82`). Neither number is wrong; the table is unlabelled, so
each lens reconciles it independently. Remedy: print the command (or the file count) beside every
`passed/total` in a package.
VERDICT: non-blocking · CONFIDENCE high · STRONGEST COUNTER: none.

## 6. What I did NOT verify

- **Any real provider call.** No OpenAI or Z.ai request was made; whether `gpt-5.6-luna` exists under
  that id, and whether the Free slots go healthy with V's keys, stay **UNVERIFIED** (V-34) —
  acceptance steps 3, 4 and 10b.
- **The real relays' handling of a full model id** behind the V-40 casts — **UNVERIFIED**, as the
  packet instructs. I did not fake it.
- **Acceptance step 4's read-back command was confirmed present, never run** — the live database is
  V's.
- **V-41's live consequence** (a removal refused as a stale reconstruction with the held-version map
  absent) — I did not stand up a register; it remains the row's own UNVERIFIED, and it lands on
  acceptance **step 9**, not step 8 (N1.3).
- **The `:3000` stack, any browser, any dev server, `.local/**`** — never touched.
- **CSS geometry / both modes** — `ui: no`; the DOM assertion is the oracle and no artboard exists.

## 7. Predictions about the other two lenses (falsifiable; blindness held)

I expect **correctness-tests** to arrive at B1 from the opposite end and possibly to under-rate it:
its natural reading of `tests/render/tier01-new-plan-tier.test.tsx` is "24/24, the runtime-row case
exists, S24 done", because the mock resolves — if it does not think to reject the mock, it will pass
the page and instead spend its pass on probe 1 (`PROBE_BODY_EXTENSIONS` frozen per call) and probe 5
(the S13 literal set), both of which I expect it to clear. I also expect it to report C4 as 73/73 by
copying the README rather than running §2's four-file command, and so to miss N3. I expect
**security-data-safety** to confirm what I found incidentally — no key value in any refusal (my P2
asserts it on `message`, `String` and `JSON.stringify`), the uncredentialed-slot record-without-probe
path, and the custody checks in `dev-provider-keys.ts` — and to flag probe 4 / V-41 as its residue;
its most likely miss is the same one, that `/v1/deployment` is operator-only, since from a security
lens an operator-gated route reads as *correct hardening* rather than as a product break, and the
temptation is to file it as "good" instead of noticing the page depends on it. If either lens claims
step 2 passes on merge day, that claim is refuted by my P1 case B. The finding I would check first in
both: whether either says anything about what the user sees when a read fails.

---

## 8. Row for V

```
V-ROW: NEW · S03 · /new's tier lists are behind an operator-only route
Recommended default: treat B1 as a REWORK item inside S03 (fix the surface, add the
  rejection RED), NOT as a ship-with-a-row. The slice's entire user-visible promise —
  "edit the file, restart, see the new lists on /new" — is the half that does not work,
  and it is a regression from the compiled roster that shipped before S03.
Smallest yes/no for V: "Fix /new's empty tier cards inside S03 before merge — yes?
  (no = merge S03 with /new's tier cards blank for every user until a follow-up slice)"
VERDICT: fix inside S03 / CONFIDENCE high / STRONGEST COUNTER: the data path, the file
  check, the warnings, the register and admission are all correct and verified — B1 is one
  read on one page, so a follow-up ticket is defensible if V wants the backend landed today;
  the price is that acceptance steps 2, 6, 8 and 10a cannot be run on merge day, which
  leaves S03 unacceptable in V's own sense of the word.
```
