# REV(S03) pass 1 — lens `correctness-tests` — slice `S03` @ `cc014550`

**SKILLS LOADED:** `superpowers:using-superpowers`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) ·
`dialectical-engine:heartbeat-protocol` (`.claude/skills/heartbeat-protocol/SKILL.md`) ·
`dialectical-engine:heartbeat-reviewer` (`.claude/skills/heartbeat-reviewer/SKILL.md`) ·
`superpowers:verification-before-completion`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

- seat `REV-S03-p1-correctness-tests` · ticket `t_2fe87227` · pass **1 of 3** · blind
- worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p1-correctness-tests/dialectical-engine`, detached at `cc014550`, `git status --porcelain` **0 entries at start and at handoff**
- base `9a000c37`; package `.hermes/reports/debate-tiers/review-packages/S03-p1/`
- **VERDICT: REWORK** (§7) — one blocking finding, five non-blocking.

---

## 1. The packet review (the packet is in my scope; its author cannot review it)

| # | Check | Outcome |
|---|---|---|
| 1 | Packet path resolves from the seat's cwd | OK |
| 2 | Base/head constants: `cc014550` = my `git rev-parse HEAD`; base `9a000c37` | OK, both verified |
| 3 | `allowed` list covers every deliverable the packet demands (artifact, self-report, probes, temporary fixture) | OK |
| 4 | Freeze range `b6ecee09..8e89d5d4` is a concrete pair, not a pointer | OK |
| 5 | Quoted expectations vs the commands the packet points at | **N5 — mismatch, see §6** |
| 6 | Files needed to answer charge 2's probe 3 are inside the packet's reading grant | **N6 — not granted, see §6** |
| 7 | `SKILLS LOADED` of the four BUILD seats against their floor | Verified present on all four board records (C1 t_77c0cb5f, C2 t_6a2ba493, C3 t_843976bb, C4 t_f0797f95); the orchestrator's CONSUMED comments record the rollout verification. No shortfall found. |

The four BUILD packets were read for defects. The PLAN defects already folded (S1 install order,
S10/S12 order, S13's cross-cluster criterion and its literal set, S26/S27 order, C3's and C4's moved
bases) are **carried, not re-found**, per charge 4.

---

## 2. Everything I re-ran, in MY worktree

Every run through `LOG=<abs> zsh .claude/skills/heartbeat-orchestrator/scripts/run-capture.sh <cmd…>`;
logs under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/REV-S03-p1-correctness-tests/`.

### 2.1 The four cluster commands

| Cluster | Command source | My result | Expected | Verdict |
|---|---|---|---|---|
| C1 (6 suites) | cluster-map §2 | `Test Files 6 passed (6)` · `Tests 24 passed (24)` · rc 0 | 24/24 | **match** |
| C2 (4 suites) | cluster-map §2 | `Test Files 4 passed (4)` · `Tests 26 passed (26)` · rc 0 | 26/26 | **match** |
| C3 (9 suites) | cluster-map §2 | `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 88 passed (90)` · rc 1 | 88 passed, 2 inherited | **match** |
| C4 (4 suites) | cluster-map §2 **as written** | `Test Files 4 passed (4)` · `Tests 67 passed (67)` · rc 0 | — | see **N5** |
| C4 (5 suites) | the form ruled in DECISIONS' 18:35 fold (`+ tests/architecture/tiers-s02-rosters.test.ts`) | `Test Files 5 passed (5)` · `Tests 73 passed (73)` · rc 0 | `Test Files 5 passed (5)`, 73/73 | **match** |

C3's two failures by title, both `tests/architecture/register-support-publication.test.ts`:
`recognizes hostile static SQL concatenation, interpolation, and tagged builders` and
`classifies every register relation access and bans open writers, latest selection, and unsafe version coercion`
— **pre-existing, dated 2026-09-12**, delta zero against the R27 row. Not the slice's.

### 2.2 The §5 integrated 17-file run, three times

| run | Test Files | Tests | rc | finished |
|---|---|---|---|---|
| 1 | `1 failed \| 16 passed (17)` | `2 failed \| 179 passed (181)` | 1 | 21:49:22 |
| 2 | `1 failed \| 16 passed (17)` | `2 failed \| 179 passed (181)` | 1 | 21:51:44 |
| 3 | `1 failed \| 16 passed (17)` | `2 failed \| 179 passed (181)` | 1 | 21:54:08 |

Worst run = every run. `Test Files` is **17**, so no filter was silently dropped. The only two failures
on all three runs are the two `register-support-publication` titles above — **pre-existing 2026-09-12**.
No failure in this slice's own suites on any run.

### 2.3 §5-1b — the two embedded-postgres snapshot suites

`tests/integration/register-support-publication.test.ts` + `tests/integration/production-database-principals.test.ts`
→ `Test Files 2 passed (2)` · `Tests 57 passed (57)` · rc 0 (= the seat's 25/25 + 32/32). **Match.**

### 2.4 §5-2 — the cross-cluster generator mount (S10), run by me

`packages/contract/generated/` **moved away** (`mv`, per TRAPS — not `rm -rf`) → `pnpm run generate:contract`
**rc 0**, four files regenerated → the regenerated `plan-tier-rosters.ts` is **byte-identical** (`diff -q`)
to the one moved away → `tests/architecture/tier01-roster.test.ts` **`Tests 2 passed (2)`** (the 2/2 the
N3-p3 fold ruled, not the SPEC's stale 1/1). The generated file verbatim:

```
export const GENERATED_PLAN_TIER_ROSTERS = Object.freeze({
  free: Object.freeze(["gpt-5.6-luna","glm-5.3-flash"]),
  premium: Object.freeze(["gpt-5.6-sol","claude-opus-5","grok-4.6-build"])
});
```

---

## 3. My own probes — built from the CLAIM, not from the authors' suites

Fixture: 21 assertions, `Tests 21 passed (21)`, rc 0, run twice (`probe-a-1.log` 19/19 before I added
PROBE E, `probe-a-2.log` 21/21). Promoted, **and verified runnable from a clean worktree**, as
`.hermes/reports/debate-tiers/probes/REV-S03-p1-correctness-tests-probe.test.ts` +
`…-run-probe.sh` (copies in, runs, removes; prints `porcelain after: 0 entries`).

| Probe | Property under test | Outcome |
|---|---|---|
| A | **the six shape classes** (R1–R7/R20): a fixture per class, each perturbing ONE thing from an admitted baseline; assert code **and** `classNumber` | each class yields its own code and **no other**: 1 `FILE_MALFORMED` (third top-level key; non-mapping top level), 2 `ENTRY_TRANSPORT_UNKNOWN`, 3 `CLI_ABSENT`, 4 `KEY_NAME_INVALID`, 5 `TIER_ROSTER_INVALID`, 6 `BASE_URL_INVALID`; every declared code in `MODEL_CONFIG_SHAPE_CODES` reached |
| A2 | base-URL admission beyond the authors' parameters | refuses http, `u:p@`, `u@`, `?k=1`, `#f`. **Admits** (measured, recorded): trailing `?`, trailing `#`, any host, non-standard port, IP literal — see **N4** |
| B | the committed `config/models.yaml` **is** the generated roster (S8/S9) | `loadModelConfig(...).free/.premium` model lists **deep-equal** `GENERATED_PLAN_TIER_ROSTERS`; the loaded config is frozen at top, tier array and entry level; two loads are distinct objects |
| C | catalogue + entry→slot identity (S18/S19/S20) | catalogue **exactly 10 rows**, 10 unique `providerRef`, 10 unique `(tier, word)`; a `model:` edit on two entries leaves the slot `providerRef` sequence **identical**; slot 0 of the committed file is `cli` `development:codex-premium-cli` |
| C (refutation) | a file with **no** `cli:` entry | slot 0 is `api` — the §6 UNVERIFIED row is now **MEASURED**; V-39's order rule is what stands between V's paid key and the api.env primary triple |
| D | S21's panel builder takes the configured set as an **argument** | `developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(root))` returns one row per configured provider, `healthyProviderRefs` **0**, **no** `authorization_header` on any target; an unknown ref throws `DEV_PROVIDER_SLOT_UNRESOLVED` |
| E | which acceptance step the absent held-version map actually breaks | step 8 (missing keys) leaves the configured set **unchanged**; step 9 (drop premium `grok`) **loses `development:grok-cli`** — see **N1** |

### 3.1 Mutants — property · mutant · outcome · restore

All restored **from my own byte copy** (`cp -p`), never `git checkout --`. Promoted and re-verified
end-to-end as `.hermes/reports/debate-tiers/probes/REV-S03-p1-correctness-tests-mutants.sh` (content-matched,
not line-numbered; refuses a dirty tree; verifies restoration by sha256).

| # | Property claimed | Mutant | Outcome | Restore |
|---|---|---|---|---|
| M1 | the two `as unknown as` casts at `dev-cli-provider-panel.ts:123,129` are a type-lag nuisance | delete both casts, run `pnpm typecheck` | **2 × TS2353**: `'model' does not exist in type 'ClaudeRelayOptions'` / `'GrokRelayOptions'`. The file carries **zero** diagnostics at the head (absent from `reverify-gate-s03-typecheck-cc014550.log`), so both are mine | sha256 `bc8bf977…3026d` restored, porcelain 0 |
| M2 | the C3 suite pins "the full model id reaches the Claude relay" | pass `modelAlias: slot.model` — **the key the relay actually reads** — to `startClaudeRelay` | `Tests 1 failed \| 10 passed (11)`; the failing title is **`passes the full Claude model id without a modelAlias key`**. The suite *forbids* the only working shape | same sha, porcelain 0 |
| M3 | S13's flipped case really detects a new `apps/ui` selector | add `apps/ui/app/new/REV-PROBE-MUTANT.ts` importing and selecting `PLAN_TIER_ROSTERS` | `tiers-s02-rosters` `Tests 1 failed \| 5 passed (6)`; **both** limbs fire (exact set + the `apps/ui` negative) | file deleted, porcelain 0 |

M3 is a **refutation that failed**: the S13 flip is in the final form. `rosterSelectingFiles()` returns
exactly `["apps/api/src/index.ts", "apps/runner/src/dev-deployment-register.ts"]` and the `apps/ui`
negative is honest — `page.tsx`'s two `PLAN_TIER_ROSTERS` greps are the local constant
`EMPTY_PLAN_TIER_ROSTERS` (`:49`) and a type name (`:83`), not a selection. **No pinned three-file
inventory survives.** `claude-sonnet-5` appears nowhere under `apps/ui` (`grep -rn`, empty).

### 3.2 Refutations I attempted and could not land

- **The Z.AI probe-body key miss.** `provider-discovery.ts:55-58` keys the `thinking:{type:"disabled"}`
  extension on `"Z.AI"`; `packages/model-config`'s `maker()` returns lowercase `"zai"`. Not a defect:
  the discovery target's maker comes from the runner catalogue (`dev-provider-panel.ts:62,72` = `"Z.AI"`).
  **Two maker vocabularies coexist and never meet today** — worth a DECISIONS line for whoever merges them.
- **S16's frozen map being per-call.** `Object.freeze` is applied to the map and its nested value on
  every construction, and the spread `...(PROBE_BODY_EXTENSIONS[maker] ?? {})` copies values into a fresh
  body object, so no caller can mutate a shared object. Per-call construction is a style cost, not a defect
  (the C2 fold already offered the reviewer that ruling; I decline to make it a finding).
- **A `(tier, word)` slot collision from a hand-edited file.** Impossible: `maker` is a function of `word`,
  so two same-word entries in a tier are always same-maker and `validateRoster` refuses them. Proved, not assumed.
- **`cliIndex` drift** in `startDevelopmentCliProviderPanel` (`dev-cli-provider-panel.ts:58-88`) — correct,
  because `developmentProviderSlots` emits every CLI before every API slot (`dev-provider-panel.ts:97-100`).
  Nothing asserts that invariant; the index silently depends on it. Fragile, not wrong. Not a finding.

### 3.3 Verified sound (stated so pass 2 need not re-derive)

- **S25 — the restart check runs before any stage.** `dev-auth-stack.ts:152-155` `checkModelConfig()` is the
  **first** `fixedStage`, before the port preflight (`:156`), before every relay start, and before
  `assembleApiEnvironment` (`:180-188`). A shape refusal therefore cannot reach api.env — R19–R22's
  "exit non-zero, digest unchanged" is structurally guaranteed, not merely tested.
- **S27 — key custody.** `dev-provider-keys.ts`: directory `lstat` + `isDirectory` + `!isSymbolicLink` + uid +
  mode `0700` (`:32-37`); file opened `O_RDONLY|O_NOFOLLOW` (`:42`); `nlink !== 1` refused (`:52`); mode `0600`
  (`:53`); **`stat` is taken on the open handle, not the path**, so there is no TOCTOU window; read once (`:56`).
  Missing directory and missing file both return an empty map rather than throwing. Sound.
- **S26 — the two availability classes.** class (a) missing/blank key (`:230-237`) and class (b) probe
  failure or echoed-model mismatch (`:239-263`) both produce the same bounded absent-slot shape and a warning
  naming tier and model id, no key value. Matches V-38's binding default.
- **S17 — uncredentialed targets.** `dev-provider-panel.ts:181-186` pairs healthy⇔credentialed in both
  directions; an absent slot carries no `authorization_header` (probe D measured this on the real committed set).

---

## 4. BLOCKING finding

### B1 — R18 is met for one of three CLI transports; the Claude relay is asked for the exact alias R18 forbids, and the slice's own suite pins the inert shape

**SPEC-v3 R18, verbatim** (`oracle/SPEC-v3-section-1-requirements.md:188-192`):

> Every CLI pin is the entry's full model id, taken from the file. … and the Claude relay is asked for
> `claude-opus-5`, **not `opus`** (F10).

**What `cc014550` does.**

- `apps/runner/src/dev-cli-provider-panel.ts:121-123` — `startClaudeRelay({ port, timeoutMs, model: slot.model } as unknown as Parameters<typeof startClaudeRelay>[0])`.
- `acceptance/claude-relay.ts:148-155` — `ClaudeRelayOptions` is `{ port, timeoutMs, testOnlyCommand?, modelAlias? }`. **There is no `model` member.**
- `acceptance/claude-relay.ts:176` — `createClaudeAdapter(options.modelAlias ?? CLAUDE_MODEL_ALIAS)`. With `modelAlias` never set, this takes the fallback.
- `acceptance/claude-relay.ts:41` — `export const CLAUDE_MODEL_ALIAS = "opus" as const;`
- `acceptance/claude-relay.ts:142` — the CLI argv is `"--model", alias`.

→ **The Claude CLI is invoked as `--model opus`** — character for character the value R18 names as the
wrong answer. The configured `claude-opus-5` is written into a property nothing reads.

- `apps/runner/src/dev-cli-provider-panel.ts:124-129` — the same cast onto `startGrokRelay`.
- `acceptance/grok-relay.ts:110-117` — `GrokRelayOptions` is `{ port, timeoutMs, testOnlyCommand?, sandboxProfile? }`;
  **no `model` member**, and `startGrokRelay` (`:125-153`) reads none.
- `acceptance/grok-relay.ts:96-105` — the Grok argv is `--single --output-format --verbatim --sandbox --no-memory --no-subagents --disable-web-search --tools`. **There is no `--model` flag at all.**

→ **The Grok CLI is never asked for a model.** Only `cli: codex` honours the file:
`acceptance/model-shim.ts:33` (`model?`), `:150-151` (`CODEX_MODEL_PIN_PATTERN`), `:167`
(`-c model="…"`), `:187` (`CODEX_CLI_MODEL_MISMATCH` refusal). `gpt-5.6-sol` matches that pattern.

**Why no suite caught it** — `tests/unit/dev-cli-provider-panel.test.ts` contains a case titled
`passes the full Claude model id without a modelAlias key`. It asserts the **call shape**, and it
affirmatively asserts the *absence* of the only key the relay reads. Mutant M2 proves it: supplying
`modelAlias` turns the suite RED. The suite does not merely miss the defect — **it forbids the fix.**

**The obvious one-line remedy is itself blocked.** `acceptance/claude-relay.ts:60`
`CLAUDE_MODEL_ALIAS_PATTERN = /^[a-z0-9]+$/u`, enforced at `:117`, throws
`CLI_RELAY_FAILURE("CLAUDE_CLI_MODEL_ALIAS_INVALID")` for any hyphenated id. So
`modelAlias: "claude-opus-5"` makes the relay **refuse to start**. R18's Claude limb cannot be satisfied
without editing `acceptance/claude-relay.ts`, and R18's Grok limb cannot be satisfied without adding a
model input to `acceptance/grok-relay.ts` — **both outside every S03 cluster column.**

**Evidence:** M1 (compiler, 2 × TS2353 in a file with zero baseline diagnostics) · M2 (suite RED on the
named title) · the five `file:line` quotes above · `acceptance/model-shim.ts` as the working contrast.

**Tier:** **BLOCKING.** R18 is a frozen SPEC-v3 requirement, the slice reports it met, and it is not.
**Route:** a REWORK item under SPEC-v3 whose remedy crosses a file contract → it needs **a V row** to
authorise the surface (§8).

**Relation to row V-40** (read before raising, per charge 4): V-40 records that the relay option types
lack `model`, that the casts sit at `dev-cli-provider-panel.ts:122-129`, and that "real relay handling
[is] UNVERIFIED", routing it to a follow-up before live-provider acceptance. This finding is **not** that
row. V-40 calls the runtime behaviour unverified; it is **statically decidable and now verified**: the id
provably reaches neither CLI, the Claude CLI is provably asked for `opus`, the suite provably forbids the
fix, and the natural remedy provably throws. V-40 as written lets a reader conclude the id is *probably*
delivered and the types are merely stale. It is not delivered.

**VERDICT** R18 unmet for `cli: claude` and `cli: grok` / **CONFIDENCE** high (compiler- and
mutant-verified; no provider call needed) / **STRONGEST COUNTER** the relays live in `acceptance/**`,
another slice's surface, so S03 could not have fixed this inside its cluster columns and the deferral
is procedurally correct. **Rebuttal:** the deferral of the *remedy* is fine; what is not fine is
reporting R18 met, and shipping a test that pins the non-working shape and blocks the eventual fix. The
minimum in-contract action is to delete or re-title that case and record R18 as unmet — neither needs a
byte of `acceptance/**`.

---

## 5. Non-blocking findings (each sets WHEN, never WHETHER; each needs a ticket by end of pass)

**N1 — the S28 residue names the wrong acceptance step; the step that actually breaks is 9, not 8.**
`review-packages/S03-p1/README.md:28` and the V-41 summary say "acceptance step 8 may refuse on merge
day". Measured (PROBE E): step 8 (`oracle/SPEC-v3-section-2-acceptance.md:58-62`, missing `OPENAI_API_KEY`
/ `ZAI_API_KEY`) changes **no file entry**, so the configured set is unchanged, `additive` is true at
`apps/runner/src/dev-api-environment.ts:383`, and the publication is admitted. Step **9**
(`:67-69`, "Subtraction" — remove the `grok` entry from `premium:`) removes `development:grok-cli` from
the configured set, so `additive` is false, `exactHeldSet` is false with no map, and `:391` returns
false → `DEV_API_ENVIRONMENT_DRIFT`. **Cost if unfixed:** V runs step 8, it passes, and V concludes the
S28 risk is retired. *file:line* `apps/runner/src/dev-api-environment.ts:383-391`.

**N2 — R25's "api.env follows a removal" is green only on a branch no product path can execute.**
`heldConfiguredProviderSets` is populated in **exactly two places in the repository**, both fixtures:
`tests/integration/dev-api-environment.test.ts:441` and `:493`. The product threads the parameter
(`apps/runner/src/dev-auth-stack.ts:191` → `dev-api-environment.ts:531` → `:384`) and **nothing writes
it onto the receipt**. The suite proves the function; nobody proves the caller. This is V-41's fact,
with the addition my lens owes: *the green is not evidence about the product.* Every removal is
fail-closed (safe), but R25 is not satisfied. *file:line* `apps/runner/src/dev-api-environment.ts:384`.

**N3 — `readProviderKeys` validates the key NAME and not the key VALUE, so a quoted `.env` value
becomes a silent absent slot.** `apps/runner/src/dev-provider-keys.ts:66` enforces
`/^[A-Z][A-Z0-9_]*$/u` on the name; `:69` stores `rawLine.slice(separator + 1)` verbatim. A file
written in the ordinary `.env` convention, `OPENAI_API_KEY="sk-…"`, yields a bearer containing literal
quote characters (`dev-provider-panel.ts:252`), the availability probe fails, and the operator gets
`DEV_PROVIDER_SLOT_UNAVAILABLE class (b)` — the *probe-failed* class — rather than a format refusal.
R31a/R32's warning vocabulary says "missing key", and the key is present. *file:line*
`apps/runner/src/dev-provider-keys.ts:69`.

**N4 — measured base-URL admissions, recorded for the security lens, not claimed as defects.**
`packages/model-config/src/shape.ts:153-171` admits: a trailing `?` and a trailing `#` (both give
`url.search`/`url.hash` length 0, so the "without … query, or fragment" wording in the error detail at
`:169` is narrower than the check), any host, a non-standard port, and an IP literal. `probes.md` #8
states that a host allow-list is **not** a SPEC-v3 requirement, so none of these is a defect against a
frozen row. *file:line* `packages/model-config/src/shape.ts:155-160`.

**N5 — packet defect (against the orchestrator): charge 2 states a C4 expectation that charge 2's own
named source cannot produce.** Charge 2 says "the four commands are in `cluster-map-…md` §2 and
`board/*.txt`" and gives "C4 `Test Files 5 passed (5)`". `cluster-map-PLAN-sections-2-and-5.md` §2's C4
row names **four** suites; run verbatim it yields `Test Files 4 passed (4)` · `Tests 67 passed (67)`.
The five-suite form exists only in the DECISIONS fold of 2026-09-13 18:35, which grew C4 from 5 to 6
allowed paths for the S13 flip. The README's `C4 73/73` is likewise unreachable from the cluster map.
**Cost:** one wasted suite run and two folds of reading before either number could be trusted. **Remedy:**
the package's cluster map carries the *ruled* command, or the README's three-run table prints the argv
beside each number. A number without its command is not evidence.

**N6 — packet defect (against the orchestrator): probe 3 asks a question the packet's reading grant
does not permit answering.** Charge 2/probe 3 asks "the boundary casts at
`apps/runner/src/dev-cli-provider-panel.ts` — what do they hide?". What they hide is entirely inside
`acceptance/claude-relay.ts` and `acceptance/grok-relay.ts`, which no packet line names. Under the
reading floor the lawful answer would have been UNVERIFIED — and B1 would have shipped. I read both
files and declare it here. **Remedy:** a packet that asks what a cast hides must grant the file on the
other side of the cast.

---

## 6. UNVERIFIED — what I could not do, and why

- **Any real provider or CLI call.** No lens may call OpenAI, Z.ai, or the `codex`/`claude`/`grok` CLIs
  (dev-stack.md; rows V-34/V-35 are V's operation). So B1's *runtime* consequence — that a Claude debate
  runs on whatever `opus` resolves to rather than `claude-opus-5` — is **inferred from the argv the
  relay builds**, not observed on a live call. The inference chain is five quoted `file:line` facts and a
  compiler error; I regard it as conclusive, and I still mark the live observation UNVERIFIED.
- **The end-to-end refusal of acceptance step 9.** N1's mechanism is measured at the configured-set
  level (PROBE E) and read at `:383-391`; the full `pnpm dev:auth:up` refusal needs the real stack,
  which no lens may run.
- **`max_tokens: 64` without `thinking:{type:"disabled"}` against a real Z.ai endpoint** — carried from
  §6 of the PLAN, never measured by anyone.
- **Whether OpenAI sells `gpt-5.6-luna`** — row V-34, waits on V's key.
- **The `/v1/deployment` authorization mount (probe 13)** — I confirmed the mechanical facts
  (`apps/ui/app/new/page.tsx:114-116` reads the payload; `tests/unit/api.test.ts:233` pins 403 for an
  ordinary user; the render suite mocks success) but the policy question — what scope V's signed-in dev
  session carries — is the **product-truth** lens's, and I did not adjudicate it.
- **My own transcript path.** No `subagents/agent-<id>.jsonl` existed at CLAIM time; recorded honestly
  in the CLAIM rather than substituting the orchestrator's session id.

---

## 7. Verdict

**REWORK — pass 1 of 3, lens `correctness-tests`.**

One blocking finding (**B1**): SPEC-v3 **R18 is not met** for `cli: claude` (the relay is asked for
`opus`, the literal value R18 forbids) or for `cli: grok` (the CLI is never asked for a model at all);
two `as unknown as` casts erase the only automatic detector, and
`tests/unit/dev-cli-provider-panel.test.ts`'s case `passes the full Claude model id without a modelAlias key`
pins the inert shape and would fail the fix. Six non-blocking findings, **N1–N6**, two of them against
the orchestrator's packet.

Everything else this lens owes is **verified green and re-measured by me**: the six C1 suites and the
six shape classes with their own codes; the file as the one source, deep-equal to the generated rosters
and regenerating byte-identically from an empty directory; the 10-row catalogue, `(tier, word)` slot
identity under a `model:` edit, and a CLI relay at slot 0; the panel builder's configured-set argument
and the four CLI call sites; the `planTierRosters` register row and the digest sweep (57/57 on embedded
postgres); the restart check ahead of every stage; the two availability classes; key custody; the S13
flip in its final two-file form with a live `apps/ui` negative; the Free card free of `claude-sonnet-5`;
all four cluster commands and three identical integrated runs.

---

## 8. Row for V

```
V-ROW: NEW · S03 · R18 / the CLI relay model contract
The slice cannot satisfy SPEC-v3 R18 inside its own file contract. `acceptance/claude-relay.ts`
exposes `modelAlias` (not `model`), rejects any hyphenated value at `:60,:117`
(`CLAUDE_CLI_MODEL_ALIAS_INVALID`), and defaults to `CLAUDE_MODEL_ALIAS = "opus"` (`:41`);
`acceptance/grok-relay.ts` has no model input and its argv (`:96-105`) has no `--model` flag.
Both files belong to another slice's surface. So today `cli: claude` runs on `opus` and
`cli: grok` runs on the CLI's default, whatever `config/models.yaml` says, while
`cli: codex` correctly honours the file.
Recommended default: S03's allowed list is widened to `acceptance/claude-relay.ts` and
`acceptance/grok-relay.ts` for one FIX node — give both option types a `model` member, have the
Claude adapter accept a full id (relax `CLAUDE_MODEL_ALIAS_PATTERN` or add a separate full-id
path), add `--model` to the Grok argv — and the C3 suite case
`passes the full Claude model id without a modelAlias key` is re-titled to assert the ARGV the
relay builds, not the object literal it is handed.
Smallest yes/no for V: "May the S03 FIX node edit acceptance/claude-relay.ts and
acceptance/grok-relay.ts to make the Claude and Grok relays honour config/models.yaml?"
VERDICT widen the surface now / CONFIDENCE high / STRONGEST COUNTER: deferring costs nothing
today because V has no paid Anthropic or xAI API key in play and both CLIs already answer as
some model, so the slice could merge with R18 recorded as partially unmet and the relay contract
fixed in its owning slice. Rebuttal: the cost is not the runtime — it is that the current suite
case would have to be deleted by that later slice before it could land its own fix, and until
then every green run of S03 reports R18 satisfied when it is not.
```

---

## 9. Predictions about the other two lenses (falsifiable; written before any contact)

I expect **product-truth** to lead on probe 13 — `/v1/deployment` answering 403 to an ordinary user
while `apps/ui/app/new/page.tsx:114` now reads the roster row from it — and to rate it blocking, since
acceptance steps 2, 8 and 10a all require `/new` to list the Free models and the page falls back to
`EMPTY_PLAN_TIER_ROSTERS` (`:49`) on rejection; I expect them to note that the page already reads the
same payload for `riskTier` defaults (`defaults.tsx:27`) and to conclude from that the authorization
already holds, which I think is the weaker reading because nothing measures the scope either way. I
expect **security-data-safety** to lead on the absence of a host allow-list in the base-URL admission
(my N4 measured five surprising admissions for them) and on key custody — where I predict they will
find, as I did, that `dev-provider-keys.ts` is genuinely sound (`O_NOFOLLOW`, `nlink`, handle-`stat`,
both modes), and may therefore look for the real exposure in the api.env drift path or in YAML
`__proto__`/duplicate-key handling through `parse`, which I deliberately left to them. **I predict
neither lens finds B1**, for three reasons: it lives in two `acceptance/**` files no packet names, row
V-40 reads as already-triaged residue rather than an open question, and finding it requires running the
*compiler* as a mutant — deleting a cast and reading `tsc` — which is not a move either of their charge
lists asks for. If I am wrong about that, I expect it to be security-data-safety, arriving from the
"what does an erased type let through" direction rather than from R18. My own most likely error is
tiering: a reviewer could reasonably argue B1 is an N because the remedy is procedurally out of scope —
I hold it blocking because the slice *reports a frozen requirement met that is not met*, and because
its own suite would reject the fix.
