# SPEC-v2 — S03 · the tier fleets are declared in one editable file, and Free reaches its makers over API keys

ui: no
**Supersedes `slices/S03/SPEC.md` (v1, frozen 2026-09-13).** Written by REQ-FIX-S03 at pass 2 of 3 under the REWORK verdict `docs/missions/debate-tiers/reviews/REQ-REV-S03-p1.md` (B1 `t_1292cc86`, B2 `t_748b2433`, B3 `t_d502e39f`) and V's update of 2026-09-13 16:05 EEST (`00-intake-S03.md` § *V's update*, facts F13/F14; rows V-35 ANSWERED, V-36, V-37, V-38). **Requirements changed:** R7 (the Z.ai endpoint and id), R8 (the declaration oracle — B1), R11 (six refusals counted — N3), R13 (the probe mechanism is now measured — F14), R14 (an explicit slot-order rule — N4), R19/R20/R21/R23 (shape refusals split from availability outages — B2/B3 under V-38), R26 (stated against R8's oracle), R27 (the `dev-api-environment` row is 10/10 — N2; the two roster suites' matchers and totals — B1), R28 (the RED list follows). **Added:** R30 (the id the endpoint echoes — F13), R31 (start-with-the-slot-absent — V-38), R32 (the post-merge start on a machine with no keys — B3). **Unchanged from v1:** R1–R6, R9, R10, R12, R15–R18, R22, R24, R25, R29. `SPEC.md` is byte-identical to its freeze and is the historical record; **this file is the SPEC of record** and every later packet names it by this file name.

- **Frozen** at REQ-FIX-S03's READY marker on `t_9ee87d3d`. A further change is `SPEC-v3.md` with its own supersession header, never an in-place edit (`heartbeat-requirements` §2).
- **Line numbers are measured in the S03 LANE** `.worktrees/tiers-s03/dialectical-engine`, branch `slice/tiers-s03`, **HEAD `9a000c37`** (N1 — v1 said `7188b167`; `9a000c37` = `7188b167` + the cherry-pick `4df0b2b5`, which touches one **test** file, +1/−5, so no product line moved). Re-verified at `9a000c37` this pass: `apps/api/src/index.ts:1214`, `:1223`, `:1248`; `packages/providers/src/index.ts:128`; `apps/runner/src/dev-provider-panel.ts:100`; `apps/runner/src/main.ts:67`; `apps/ui/app/new/page.tsx:200`. The MAIN tree's numbers for `apps/api/src/index.ts` run 13 ahead (another mission's uncommitted lines); cite the lane.
- **Inputs of record:** `00-intake-S03.md` (V's goal, the four brainstorm answers, C10–C15, F1–F14, rulings R-S03-1…5, the three CORRECTED lines) · `slices/S02/SPEC-v2.md:32-168` · `V-DECISIONS-PACKET.md` rows V-34…V-38 · the verdict above.

## 0. What V asked for, and what this supersedes

> For the free tier, switch Sonnet 5 with GLM 5.3 Flash. Switch to API_KEYS. but only for the free
> tier. (`00-intake-S03.md:10`) · I want to be able to change the model that gets called inside a
> simple file … I want to be able to add makers to tiers. Or substract them. (`:19`)

> **Update:** Switch the 5.3 to GLM 4.7. we got a subscription, use them API_TOKENS. or idk how can
> we connect to GLM 4.7 (V, 16:05, `00-intake-S03.md` § *V's update*)

V's update is answered by R7 and R30, not by naming `glm-4.7` in the file: on V's subscription a
request for `glm-4.7` is **answered by `glm-5.3-flash`** — the maker's own `model` field — and only
`glm-5.3` and `glm-5.3-flash` answer under their own id (F13, measured 16:05). The app records the id
the maker reports (DR-115) and the probe demands an exact echo (F5), so the file names the id the
endpoint echoes and V's subscription is used, which is what V asked for. Row V-37's default
(`glm-5.3-flash`) binds; switching to `glm-5.3` is one line of the file (R16), and no other
requirement moves.

**What this slice supersedes elsewhere (N5).** S02 SPEC-v2 R1 (`slices/S02/SPEC-v2.md:36-39`) requires
each roster id to be "written as a roster member in exactly one file" and still spells `grok-4.6`
where the fleet is `grok-4.6-build`. **S03 R8 replaces that requirement**; S02's document is history
and is not re-read as live. S02 R3–R10 (the admission behaviour) remain live and are carried here by
R15.

## 1. Requirements

### The file

- **R1.** A file exists at `config/models.yaml` (repo root; no `config/` directory exists today, F11).
  It is YAML, it is committed, and it is the file V edits. Its comment lines survive an edit—apply
  cycle unchanged: the tool that reads it never rewrites it.
- **R2.** The file has exactly two top-level keys, `free:` and `premium:`, each a list of entries.
  A third top-level key, a missing key, or a key that is not a list is a shape refusal (R20).
- **R3.** A **CLI entry** has exactly the keys `cli` and `model`. `cli` is one of `codex`, `claude`,
  `grok`. `model` is the maker's full model id as that CLI answers it — never an alias and never a
  family word (F10: `claude --model` takes a full id, `grok -m` takes a full id, the Codex shim takes
  `-c model="…"`, `acceptance/model-shim.ts:167`).
- **R4.** An **API entry** has exactly the keys `api`, `model`, `base_url` and `key`. `api` is the
  maker word (`openai`, `zai`). `model` is the id the endpoint echoes (R30). `base_url` is the full
  HTTPS base the maker serves `/chat/completions` under. `key` is the **NAME of an environment
  variable**, not a key.
- **R5.** The file contains no secret. Every `key:` value matches `^[A-Z][A-Z0-9_]*$` and is read as a
  variable name; a value containing a character outside that set is a shape refusal (R20). A reviewer
  greps the committed file for `sk-`, `Bearer` and `=` inside a `key:` value and finds none.
- **R6.** Each tier lists at least two entries, at least two distinct makers, and at most one entry
  per maker per tier (V's rule, stated with the shape V chose, `00-intake-S03.md:23`). A file
  violating any of the three is a shape refusal (R20). This is the configuration S02 R5 said must not
  be expressible: the check that says so lives beside the file, not in the admission path
  (`slices/S02/SPEC-v2.md:56-60`).
- **R7.** The content at merge is exactly:

  ```yaml
  free:
    - api: openai
      model: gpt-5.6-luna
      base_url: https://api.openai.com/v1
      key: OPENAI_API_KEY
    - api: zai
      model: glm-5.3-flash
      base_url: https://api.z.ai/api/coding/paas/v4
      key: ZAI_API_KEY

  premium:
    - cli: codex
      model: gpt-5.6-sol
    - cli: claude
      model: claude-opus-5
    - cli: grok
      model: grok-4.6-build
  ```

  with the header and trailing comments of the preview V chose (`00-intake-S03.md:25-49`) carried
  over, the `# CLIs:` line extended to name the `api:` form, and the "Put Grok in Free too" block kept
  verbatim. `claude-sonnet-5` appears nowhere in the file.
  *Derivation of the two Free base URLs:* `https://api.openai.com/v1` is OpenAI's documented base.
  `https://api.z.ai/api/coding/paas/v4` is **V's subscription endpoint — row V-35 ANSWERED** by V's
  words *"we got a subscription, use them API_TOKENS"* (16:05); the token on this Mac answers `200`
  there, while the pay-as-you-go base still answers `429` (F13, and v1's pinned
  `https://api.z.ai/api/paas/v4` is superseded here rather than left for V to edit on day one).
  *Derivation of the GLM id:* row V-37's default — see R30.
- **R8.** **The file is the only declaration of the tier lists, and "declaration" means a string
  literal that IS the id** — the quoted-exact oracle already used by
  `tests/architecture/tier01-roster.test.ts:43-52` (`JSON.stringify(modelId)`), not the bare-substring
  oracle of `tests/architecture/tiers-s02-rosters.test.ts:51-70` (`readFileSync(...).includes(needle)`).
  Measured in the lane at `9a000c37`, this is the only oracle under which the requirement can hold:

  | id | bare-substring hits in `apps`+`packages` (non-test) | quoted-exact hits |
  |---|---|---|
  | `glm-5.3-flash` | `apps/api/src/support/model.ts`, `apps/runner/src/dev-support-model.ts`, `apps/runner/src/dev-auth-stack.ts` | **none** |
  | `glm-5.3` (V-37's alternative) | the same three files | **none** |
  | `gpt-5.6-sol`, `claude-opus-5` | `apps/ui/components/landing/cards.ts` + `packages/contract/src/plan-tiers.ts` | `packages/contract/src/plan-tiers.ts` only |
  | `gpt-5.6-luna`, `grok-4.6-build`, `claude-sonnet-5` | `packages/contract/src/plan-tiers.ts` | the same |

  The three support hits are `"development:hermes-glm-5.3-flash"` and `"z-ai/glm-5.3-flash"`
  (`apps/api/src/support/model.ts:6-7`, `apps/runner/src/dev-support-model.ts:2-3`,
  `apps/runner/src/dev-auth-stack.ts:55`) — a provider ref and a maker-qualified model, which
  **contain** the id and do not **declare** it; R26 says this slice does not touch them. The two
  `cards.ts` hits are `"Anthropic · Claude · claude-opus-5"` and `"OpenAI · GPT · gpt-5.6-sol"`
  (`apps/ui/components/landing/cards.ts:27-28`) — display copy, which is why the bare oracle needed an
  allow-list for them and the quoted-exact oracle never did.

  **Therefore, after this slice:** for each of the six ids, the quoted-exact scan over
  `git ls-files apps packages` (non-test, non-generated, non-build) returns **zero** files — no
  allow-list, no exception — and `claude-sonnet-5` survives in no production file at all.
  `PLAN_TIER_ROSTERS` (`packages/contract/src/plan-tiers.ts:8-11`) no longer spells ids and
  `DEVELOPMENT_CLI_MODEL_PINS` (`apps/runner/src/dev-cli-provider-panel.ts:122-128`) derives every pin
  from the file.
  **Positive limb (without it the requirement is satisfied by deleting the ids):** a suite reads
  `config/models.yaml` itself and asserts that each tier's ids are exactly the tier lists the product
  exposes at runtime. Neither scan reaches the file today — both are rooted at `apps`+`packages`
  (`tier01-roster.test.ts:17-27`, `tiers-s02-rosters.test.ts:8-9`) and `.yaml` is not in
  `SOURCE_EXTENSIONS` — so the positive limb is a new case, not a widened scan. R27 names which suite
  carries it and what its total becomes.
- **R30.** **A key-based entry's `model` is an id its endpoint echoes exactly.** The health probe
  compares the response's `model` field to the requested id and fails otherwise
  (`apps/api/src/provider-discovery.ts:77-79`), and the app records the id the maker reports, never a
  guessed literal (DR-115). Measured on V's subscription endpoint at 16:05 (F13, cited from the
  intake, not re-measured here): `glm-4.7`, `GLM-4.7`, `glm-4.6` and `glm-5-turbo` are all answered
  with `model: "glm-5.3-flash"`; `glm-5` is answered with `model: "glm-5.3"`; only `glm-5.3` and
  `glm-5.3-flash` answer under their own id. An entry naming an id the endpoint re-labels is an
  availability outage for that slot (R31 class b), never a silent relabelling of the panel — the
  honesty law (`INSTRUCTIONS.md:54-55`). At merge the Free GLM entry is `glm-5.3-flash` (row V-37's
  binding default); `glm-5.3` is row V-37's alternative and reaching it is one line of the file
  (R16), with no other requirement moved.

### The transports

- **R9.** A `cli:` entry is served the way the five CLI slots are served today: a local relay process
  on a fixed loopback port, `http://127.0.0.1:<port>/v1`, started by the panel operations
  (`apps/runner/src/dev-cli-provider-panel.ts:130-149`) and admitted by
  `buildDevelopmentProviderPanel` (`apps/runner/src/dev-provider-panel.ts:91-130`). Premium's three
  entries are served this way and nothing about their transport changes.
- **R10.** An `api:` entry reaches its maker **directly over HTTPS**: the discovery target's
  `base_url` is the entry's `base_url`, and its authorization header is `Bearer <value>` where
  `<value>` is read at stack start from the variable the entry's `key:` names, in
  `.local/dev-auth/provider-keys.env`. No relay process is started for an `api:` entry and no loopback
  port is allocated to it. The gateway needs no new adapter kind: it already sends
  `headers.authorization` (`packages/providers/src/index.ts:335`) to `${endpoint}/chat/completions`
  (`:337`).
- **R11.** A remote HTTPS base URL is admissible. Two mechanisms refuse one today and both change:
  (a) `normalizedProviderBaseUrl` (`packages/providers/src/index.ts:109-132`) throws
  `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` unless the path ends `/v1` (`:128`), which refuses
  `https://api.z.ai/api/coding/paas/v4`; (b) `buildDevelopmentProviderPanel`
  (`apps/runner/src/dev-provider-panel.ts:100`) throws `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`
  unless a slot's base URL equals `http://127.0.0.1:<that slot's port>/v1` (`:87-89`). After this
  slice both admit an `api:` entry's base URL and both still refuse **these six, counted** (N3 — v1
  enumerated six and then said "five"): from the URL gate, (1) a username, (2) a password, (3) a
  query, (4) a fragment (`packages/providers/src/index.ts:120-126`), (5) a non-`http(s)` scheme; and
  from the panel gate, (6) a `cli:` slot whose observed base URL is not that slot's loopback port.
  A reviewer shows a refused case for each of the six.
- **R12.** `.local/dev-auth/provider-keys.env` holds lines `OPENAI_API_KEY=…` and `ZAI_API_KEY=…`,
  mode `0600`, owner the running uid, not a symlink, `nlink === 1` — the custody shape
  `readGlmCredential` already asserts for the Hermes store (`acceptance/hermes-relay.ts:33-40`). The
  file is created and filled by V (ruling R-S03-1, rows V-34/V-35): **no seat writes it, reads its
  values, or prints it.** A key value appears in no log line, no error message, no test fixture and no
  committed file; a reviewer greps the diff and the lane's logs for the variable names and finds only
  the names.
- **R13.** **The health probe returns HEALTHY for each Free entry whose key is present**, with the
  probe record's `modelId` equal to that entry's `model` exactly. Today's probe cannot do this for
  `glm-5.3-flash`: it sends `max_tokens: 8` and demands the content be exactly `OK`
  (`apps/api/src/provider-discovery.ts:56-59, 77-79`), and GLM spent 5 of those 8 tokens on reasoning
  and returned `content: ""`. **The mechanism is no longer open — it is measured (F14, 16:05):**
  `max_tokens: 64` with `thinking: { type: "disabled" }` returns `"OK"` on every try (reasoning
  tokens still reported, 12–18), and `max_tokens: 8` fails in either mode. This requirement states the
  observable — a HEALTHY record naming the entry's id exactly — and hands ARCH the measured fact
  rather than a re-derivation. Whatever is chosen applies to `gpt-5.6-luna` too.

### The slots, admission and the surfaces

- **R14.** The discovery slot set equals the union of the two tiers' entries, one slot per entry, and
  the register's configured provider set is that same set. Its observables (N4 — the derivation
  mechanism stays ARCH's):
  1. **one slot per entry** — adding an entry adds a slot, removing an entry removes its slot, and two
     entries never share a slot (a duplicate `model` across two slots is admissible: only
     `provider_ref` must be unique, `packages/providers/src/index.ts:159-161`, which is what makes
     acceptance step 10 parseable);
  2. **refs are stable across restarts** — the same file yields the same `provider_ref` for the same
     entry on every start, so a register version is not republished by restarting alone;
  3. **order: Premium's `cli:` entries occupy the first slots, in file order, then Free's entries in
     file order.** *Derivation:* the runner pins slot 0's `baseUrl`/`model`/`authorizationHeader` to
     `VLLM_BASE_URL`/`VLLM_MODEL`/`VLLM_AUTHORIZATION`
     (`apps/runner/src/main.ts:65-71`, `RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT`), so slot 0's
     header is copied into the api.env primary triple; keeping slot 0 a local CLI relay keeps V's paid
     API key out of that triple. Discovery stays 1:1 and order-checked against the configured set
     (`packages/providers/src/index.ts:134-137`; `apps/api/src/provider-discovery.ts:119-124`
     `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`).

  At merge the set is five slots: three `cli:` (Premium) then two `api:` (Free);
  `development:codex-cli` (8791) and `development:claude-cli` (8792) are gone.
- **R15.** **Admission behaviour is unchanged from S02 R3–R10, with the new lists.** For an ask at
  tier T, `evaluateAskAdmission` (`apps/api/src/index.ts:1196-1259`) filters the discovered panel to
  T's list in list order (`:1215-1217`), refuses with `ASK_PLAN_TIER_MODEL_UNAVAILABLE` naming the
  tier and **every** missing model id before `assertMakerAdmission` runs (`:1218-1228` precedes
  `:1239` — S02 R6's pinned order), passes `panelSize = filteredPanel.length` (`:1248`), persists
  exactly those members as `discovered_panel` (`:1256`), and creates no run for a refused ask. With
  the new lists: a Free ask while `glm-5.3-flash` is absent from the panel answers `422` with
  `error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE"` and a message containing `free` and `glm-5.3-flash`. No
  substitution, no shrinking, no silent drop.
- **R16.** **After an edit of `config/models.yaml` and the restart command, `/new` shows the new
  lists, with no rebuild of the UI and no edit to any file under `apps/ui/`.** Today the browser
  bundle compiles the roster in (`apps/ui/app/new/page.tsx:10` imports `PLAN_TIER_ROSTERS`, `:200`
  maps it), so this changes: the page gets the lists at runtime. Which runtime path — an API route or
  a module the restart regenerates — is ARCH's call (C15). The observable is the one V runs: change
  one line, restart, reload `/new`, read the new id on the tier card; `git status` in `apps/ui/` shows
  nothing changed. **The lists `/new` shows are the FILE's, not the healthy panel's** — a tier whose
  model is unreachable still lists it, and the refusal (R15) is what names it missing.
- **R17.** Each model id on the tier cards renders with a non-empty name and a visible identity dot.
  `glm-5.3-flash` is unknown to `apps/ui/lib/models.ts:26-35`, so it falls to the `default` family:
  the dot is `var(--m-default)` and the displayed name is the raw id. That is a satisfying outcome of
  this requirement, not a defect; adding a `glm` family is one map entry plus one token and is NOT in
  this slice (DECISIONS.md, the identity-dot line). What fails this requirement is a blank dot, an
  empty name, or a throw.
- **R18.** Every CLI pin is the entry's full model id, taken from the file. The alias derivation
  `claudeAlias` (`apps/runner/src/dev-cli-provider-panel.ts:105-110`) and the pins `claudeFreeAlias` /
  `claudePremiumAlias` (`:125-126`) are removed rather than re-pointed, and the Claude relay is asked
  for `claude-opus-5`, not `opus` (F10). `rosterModel(…, "gpt-")`-style prefix matching (`:99-103`) is
  removed with them: an entry names its maker, so no pin is recovered by guessing at an id's prefix.

### Applying the file: shape refusals, and outages that do not refuse

Row **V-38**'s default binds until V rules (`V-DECISIONS-PACKET.md`, raised by the verdict §9): the
check refuses for the file's **shape**; a **missing key or a failing probe** starts the stack with
that entry's slot absent and a named warning, and the tier then refuses debates naming the model.

- **R19.** One command applies the file: `pnpm dev:auth:up`
  (`apps/runner/src/dev-auth-stack-cli.ts`), the command that already brings the stack up. It reads
  and checks `config/models.yaml` **before** it starts a relay, writes an env file, publishes a
  register version or stops a process.
- **R20.** **Shape classes — the command refuses, always.** A reviewer shows one refused fixture per
  class:
  1. **Malformed file** — not parseable as YAML, or R2's shape broken (a missing tier, a third
     top-level key, a tier that is not a list).
  2. **Unknown transport** — an entry that is neither an R3 CLI entry nor an R4 API entry: an unknown
     key, a missing required key, an extra key, an unknown `cli:` word, an unknown `api:` word.
  3. **A CLI that is not installed** — a `cli:` entry whose CLI binary is absent or not executable on
     this Mac.
  4. **A malformed key name** — R5 broken.
  5. **A roster the tiers may not express** — R6 broken (fewer than two entries, fewer than two
     makers, or two entries from one maker in one tier).
  6. **A malformed base URL** — R11's six refusals.

  These are V's own sentence for the restart — *"typos, a CLI that isn't installed"*
  (`00-intake-S03.md:22`) — and none of them is weakened by R31.
- **R21.** **On a shape refusal nothing is rewritten and nothing is stopped.** Measured, not asserted:
  after a refused run, `.local/dev-auth/api.env` is byte-identical to what it was before (compare a
  `sha256` taken before and after — never the contents), the register's latest version number is
  unchanged, no new register publication row exists, and every process that was listening before the
  command is still listening on the same port with the same pid. The exit code is non-zero.
- **R22.** A shape refusal names, for each refused entry: the tier, the entry's `model` value, and
  which of R20's classes it fell into. It prints no key value and no authorization header.
- **R31.** **Availability classes — the stack starts, the slot is absent, and the reason is named.**
  Two classes, neither of them a refusal:
  - **(a) a missing key** — an `api:` entry whose key file is absent, whose custody is wrong (R12), or
    whose named variable is absent or empty in it;
  - **(b) a model that does not answer** — an entry whose health probe fails, or whose response
    carries a `model` other than the entry's id (R30).

  In both, `pnpm dev:auth:up` completes with exit code 0, every other entry's slot is configured and
  served, and that entry's slot is **absent from the panel**. For each absent slot the command emits
  one warning naming the tier, the entry's `model`, and which of (a)/(b) applied — and no key value.
  The tier's list on `/new` is unchanged (R16: the list is the file's), and an ask at that tier is
  refused by R15 naming that model. Nothing substitutes for the absent model and nothing shrinks the
  panel silently — the warning and the typed refusal are the two places it is named.
  *If V rules V-38 the other way* (the whole stack refuses to start until every key exists and every
  model answers), then (a) and (b) become R20 classes 7 and 8, R21 covers them, R32 is deleted, and
  acceptance steps 2, 5, 6, 7, 8, 9, 10 and 11 are re-flagged UNVERIFIED-until-both-keys-exist — one
  ruling, one rewrite of this block.
- **R23.** On a run with no shape refusal the stack restarts and the file's entries are live: the
  panel, the published register version, `api.env`, the API's discovery targets and `/new` name the
  file's entries and nothing else — minus any slot absent under R31, which is named, not hidden.
- **R32.** **The post-merge start on a machine with no keys.** With the merged `config/models.yaml`
  (R7) and **no `.local/dev-auth/provider-keys.env` at all**, `pnpm dev:auth:up` starts the stack:
  Premium's three CLI slots are configured and healthy, both Free slots are absent under R31(a) with
  one warning each, `/new` lists both tiers from the file, a Premium debate runs, and a Free ask is
  refused by R15 naming `free`, `gpt-5.6-luna` and `glm-5.3-flash`. **The dev stack does not become
  un-startable for anyone but V** — which is the consequence the verdict measured against v1 (B3,
  §3) and the reason row V-38 exists. This requirement is what a second machine, or a fresh clone, is
  checked against.

### The register and api.env follow a removal

- **R24.** Applying a file whose entry set is SMALLER than the running one publishes a **new** register
  version whose `configuredProviderSet` row is the smaller set
  (`apps/runner/src/dev-deployment-register.ts:509, 618`; nothing in the database forbids a smaller
  set, F7). The version number moves forward; no version is edited in place.
- **R25.** `api.env` follows that publication instead of refusing it as drift. Today it cannot:
  `isExactPublishedRegisterRefresh` (`apps/runner/src/dev-api-environment.ts:336-374`) admits a
  forward version move only when every provider ref in the OUTGOING file is still in the new
  configured set (`:361-368`, comment at `:354-357` "slots are ADDED, never removed or renamed"), so
  dropping `development:codex-cli` is `DEV_API_ENVIRONMENT_DRIFT` (`:271`). After this slice a removal
  that the register **actually holds** is admitted, and the guard still refuses a reconstruction:
  `tests/integration/dev-api-environment.test.ts:352` `rejects v4 reconstruction and removed-provider
  fallback` keeps its case (an older `REGISTER_VERSION` plus a retired `development:local-vllm` ref)
  and gains a case for the legitimate removal. How a legitimate removal is told from a stale
  reconstruction is ARCH's (C14 names one candidate: the outgoing version and refs must match a
  version the register actually holds).
- **R26.** The support bot's seam is untouched (F9): `development:hermes-glm-5.3-flash` on port 8794,
  started by `startHermesSupportRelay` from `apps/runner/src/dev-auth-stack.ts:246-256`, reading the
  Hermes credential store (`acceptance/hermes-relay.ts:15-18, 33`), published through
  `SUPPORT_MODEL_TARGET_JSON`. It is a different provider ref, a different port and a different
  credential from the Free `glm-5.3-flash` debate entry, and **this slice edits none of its files** —
  which R8's quoted-exact oracle makes possible: `"development:hermes-glm-5.3-flash"` and
  `"z-ai/glm-5.3-flash"` are not declarations of the id and are never touched.
  `tests/architecture/dev-real-provider-only.test.ts:36-41` keeps asserting that
  `apps/runner/src/dev-provider-panel.ts` contains neither `hermes-glm-5.3-flash` nor
  `startHermesSupportRelay`; what changes is only that a `glm-5.3-flash` **debate** entry now exists,
  under its own ref.

### Suites and evidence

- **R27.** Every suite in the lane baseline keeps its `passed/total` or the delta is named here.
  The baseline of record is `.hermes/reports/debate-tiers/logs/setup-tiers-s03.log` **as corrected at
  its line 28** (*"2026-09-13 16:45 CORRECTION … at lane HEAD `9a000c37` the file is 10/10"*). Run
  three times, worst run wins, reported as `passed/total`:

  | Suite | Lane base @ `9a000c37` | What S03 expects of it |
  |---|---|---|
  | `tests/architecture/tier01-roster.test.ts` | 1/1 | `MODEL_IDS` becomes the five live ids (`claude-sonnet-5` moves to an asserted-absent id); the quoted-exact scan's expectation for every id becomes `[]` — the declaring file is `config/models.yaml`, outside the `apps`+`packages` scan (`:17-27`); the roster assertion compares the tier lists the product exposes at runtime against the file. Matcher unchanged. **Stays 1/1.** |
  | `tests/architecture/tiers-s02-rosters.test.ts` | 4/4 | **The matcher changes from bare-substring to quoted-exact** (`:51-70`), which is what B1 forces and what makes `glm-5.3` / `glm-5.3-flash` distinguishable at all; with it the `cards.ts` allow-list (`:216-227`) is **deleted as unnecessary** — those two hits were never quoted-exact (`cards.ts:27-28`) — and every id's expectation becomes `[]`. "No tier `if`/`case`" (`:239`) and "≥ 2 members" (`:243`) stand unchanged. **A fifth case carries R8's positive limb** (read `config/models.yaml`; assert each tier's ids are the tier lists the product exposes). **Becomes 5/5.** |
  | `tests/unit/tiers-s02-admission.test.ts` | 14/14 | The 36 literal ids: the Free fixtures and the refusal-message assertions take the new ids; every R15 behaviour assertion stands. Stays 14/14 or gains cases. |
  | `tests/unit/tiers-s02-wire.test.ts` | 2/2 | Unchanged. Stays 2/2. |
  | `tests/render/tier01-new-plan-tier.test.tsx` | 22/22 | The 9 literal ids take the new Free pair, and the fixture feeds the tier lists the way R16's runtime path delivers them instead of importing the compiled roster. Stays 22/22 or gains cases. |
  | `tests/unit/dev-cli-provider-panel.test.ts` | 6/6 | Pins come from the file as full ids; the `claudeAlias` / prefix-match cases are deleted with the code they pin (R18) and replaced by full-id cases. Delta named case by case. |
  | `tests/unit/dev-auth-stack.test.ts` | 15/15 | Stack order unchanged; R19's check and R31's warning path are new steps ahead of the panel start. Stays 15/15 or gains cases. |
  | `tests/integration/dev-deployment-register.test.ts` | 11/11 | Publication of a set the file declares, including a smaller one (R24). Stays 11/11 or gains cases. |
  | `tests/integration/dev-api-environment.test.ts` | **10/10** (N2 — v1's `9/10` row was measured at `7188b167` against a swept foreign hunk; the cherry-pick `4df0b2b5` = lane `9a000c37` restored it) | R25's pin at `:352` keeps its case and gains the legitimate-removal case. Stays 10/10 plus the new case. **A seat reporting 9/10 as "pre-existing" is reporting a regression.** |
  | `tests/architecture/dev-real-provider-only.test.ts` | 3/3 | The five pinned refs (`:27-31`) become the new slot set in R14's order; the GLM case (`:36-41`) is re-stated per R26. Stays 3/3. |
  | `tests/architecture/register-support-publication.test.ts` | **12/14 — RED at base in both trees** | Both failures pre-existing, dated 2026-09-12 (`00-intake-S03.md:83`). Delta zero. |
  | `tests/unit/api.test.ts` | 26/26 | Unchanged. Stays 26/26. |

  A suite the lane's own grep finds touching a roster id, a discovery target or the api.env guard and
  this table omits is a finding on this requirement.
- **R28.** A RED test exists, and is shown failing before its fix, for each of: the file's shape check
  (R2/R3/R4), the key-name rule (R5), the two-maker rule (R6), the file as sole declaration under the
  quoted-exact oracle **and** its positive limb (R8), the echo rule (R30), a remote HTTPS base URL
  admitted plus each of R11's **six** refusals, the probe HEALTHY on the reasoning model (R13), each
  of R14's three slot observables, a Free refusal naming the tier and the missing id (R15), `/new`
  reading the lists at runtime (R16), full-id CLI pins (R18), one per R20 shape class (six), the
  nothing-is-rewritten invariant (R21), the refusal naming tier + model + class without a key (R22),
  **each of R31's two availability classes — the stack starts, the slot is absent, the warning names
  it, and the tier's ask is refused** — the no-keys start of R32, the smaller publication (R24) and
  api.env following it while still refusing the reconstruction (R25).
- **R29.** `pnpm typecheck` gains no diagnostic outside the files pinned in
  `docs/missions/debate-tiers/BASELINE.md` for this lane. It is RED at base from other missions
  (`00-intake-S03.md:83`): the delta is asserted, never the absolute.

## 2. Acceptance — V runs these, in a browser, on the real dev stack

**Preconditions.** P3: V is signed in on the `:3000` stack, serving the merge candidate.
**P1 (row V-34):** an OpenAI API key exists in `.local/dev-auth/provider-keys.env` as
`OPENAI_API_KEY=…`, mode 600. None exists on this Mac today. Whether OpenAI sells the model under the
id `gpt-5.6-luna` is **UNVERIFIED** until a key exists.
**P2 (row V-35, ANSWERED):** V's Z.ai subscription token is in that same file as `ZAI_API_KEY=…`. The
token already on this Mac answers `200` on `https://api.z.ai/api/coding/paas/v4` (F13), so P2 is a
file V writes, not a purchase.

**Which steps run before P1 and P2 — re-derived step by step under V-38's default** (B3; v1 claimed
six ran and the verdict measured two). With no key file at all, R32 says the stack starts, Premium is
healthy, and both Free slots are absent with a named warning each. Therefore:

| Step | Needs a key? | Why |
|---|---|---|
| 1 read the file | no | a file read |
| 2 `/new` lists both tiers | **no** | the lists are the file's (R16), not the panel's; the stack is up (R32) |
| 3 a Free debate runs on both models | **yes (P1+P2)** | the two Free slots are absent without keys |
| 4 read `discovered_panel` back for that run | **yes (P1+P2)** | there is no run without step 3 |
| 5 a Premium debate runs on three CLI models | no | Premium needs no key |
| 6 edit one line, restart, `/new` shows it | no | the restart completes (R32) |
| 7 a broken edit is refused, nothing rewritten | no | a shape refusal (R20/R21) |
| 8 a missing Free model is named in the refusal | **no — this is the merge-day state** | both Free models are absent, so R15 fires without any preparation |
| 9 remove the grok entry, restart, the version moves | no | Premium-only edit |
| 10a add grok under `free:`, restart, Free lists three | no | a list change |
| 10b that Free debate runs on all three | **yes (P1+P2)** | two of the three are keyed |
| 11 the support bot still answers | no | a different seam (R26) |

So **steps 3, 4 and 10b are the only ones that wait on V's keys.** They stay in the acceptance,
flagged, never dropped.

1. Open `config/models.yaml`. It reads as R7 prints it: two tiers, five entries, two of them `api:`
   entries naming a base URL and a variable name, no key anywhere in the file.
2. Open `/new`. The **Free** card lists exactly `gpt-5.6-luna` and `glm-5.3-flash`; the **Premium**
   card lists exactly `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6-build`. `claude-sonnet-5` appears
   nowhere on the page. Each of the five ids shows a dot and a name, none blank (R17).
3. *(P1, P2)* Choose **Free**, type a question, press `Start run`. The debate page opens; exactly two
   distinct models argue and they are `gpt-5.6-luna` and `glm-5.3-flash`.
4. *(P1, P2)* For that run, read `discovered_panel` back with the command the implementing seat
   records verbatim in its READY handoff and its self-report (relayed by the orchestrator into
   `slices/S03/PROGRESS.md` and the review package — any of the three is enough; if the command is in
   none of them, this step is UNVERIFIED, not passed). It names those two models and no others.
5. Choose **Premium**, start a run: exactly three distinct models argue — `gpt-5.6-sol`,
   `claude-opus-5`, `grok-4.6-build` — over the three local CLI relays, and neither Free id appears.
6. **The edit V asked for.** Change one line — for example the Z.ai entry's `model:` from
   `glm-5.3-flash` to `glm-5.3` (row V-37's alternative), or a Premium `model:` to another id that CLI
   answers as — run `pnpm dev:auth:up`, wait for it to finish, reload `/new`. The card shows the
   edited entry. Nothing under `apps/ui/` was rebuilt or edited (R16).
7. **The broken edit.** Note the register version and take a `sha256` of `.local/dev-auth/api.env`
   (never its contents). Introduce one **shape** fault — an unknown transport word (`api: acme`), a
   fourth key on an entry, a second Anthropic entry in Premium, or a `key:` value that is an actual
   key-looking string — and run `pnpm dev:auth:up`. It **refuses**: non-zero exit, a message naming
   the tier, the entry's model id and the failure class, and no key value printed. `api.env`'s
   `sha256` is unchanged, the register's latest version is unchanged, and the stack is still serving —
   reload `/new` and the previous lists are still there (R20, R21, R22). Undo the fault.
8. **The missing model is named, never substituted — runnable on merge day, before any key exists.**
   With no `OPENAI_API_KEY` and no `ZAI_API_KEY`, `pnpm dev:auth:up` **completes** and prints one
   warning per Free entry naming the tier, the model id and "missing key" (R31a, R32). `/new` still
   lists both Free models (R16). Start a Free debate: the page does **not** navigate; the error names
   `free`, `gpt-5.6-luna` and `glm-5.3-flash`. In devtools the `POST /v1/asks` body's `error` reads
   exactly `ASK_PLAN_TIER_MODEL_UNAVAILABLE`. Reload `/`: no new debate was created (R15). *Once the
   keys exist*, reproduce the same state without touching a key: point one Free entry's `base_url:` at
   a host that answers nothing and restart — the command still completes, warns "does not answer"
   (R31b), and that tier refuses with that one model named.
   *(This is the step v1 made impossible — it prescribed an edit that R20 refused and R21 rolled back,
   so the refusal never appeared; B2.)*
9. **Subtraction.** Remove the `grok` entry from `premium:` (Premium keeps two makers, R6), run
   `pnpm dev:auth:up`. It succeeds, `/new`'s Premium card now lists two models, and the register's
   version number has moved forward (R24, R25). Put the entry back and restart.
10. **Addition.** Add `grok-4.6-build` under `free:` as the file's own comment block shows, restart,
    reload `/new`: Free lists three models **(10a)**. *(P1, P2)* A Free debate then runs on all three
    **(10b)**.
11. **The support bot is untouched.** Through the whole of the above, the support widget still answers
    (its GLM path is a different provider ref on port 8794, R26).

Nothing here is run twice for display mode: S03 adds no element and no token to any page, and the tier
cards it changes are the ones S01's acceptance already exercised in both modes.

## 3. Out of scope for S03

Premium's transport (the three CLI relays stay as they are). Production key management, key rotation,
and any key store other than the dev custody file of R12 — V places the keys and no seat reads them.
Billing and any gate on who may choose Premium (row V-6: none in this mission). The support bot
(F9/R26). The Grok CLI's `-build` lineage — row V-32 is closed. The selector, the locks and the ask
field on `/new` — all S01. Changing the composition formula for a panel size — covered for every size
≥ 1 (`packages/register/src/index.ts:185-199`). Adding a `glm` identity colour to the UI token map
(R17). Rows V-28, V-29, V-30, V-31 keep their built defaults; none is reopened here.

## 4. Rows this SPEC depends on

- **V-34** (OpenAI key placed) — blocks acceptance steps 3, 4 and 10b only; blocks no requirement and
  no BUILD, which runs against the product's fakes.
- **V-35 — ANSWERED** (the subscription endpoint `https://api.z.ai/api/coding/paas/v4`); folded into
  R7. What remains is V writing the token to `provider-keys.env` (P2).
- **V-36** (the four-line Free entry) — default binding; R4 and R7 are written to it.
- **V-37** (`glm-5.3-flash` over `glm-5.3`) — default binding; R7 and R30 are written to it, and the
  alternative is one line of the file.
- **V-38** (a missing key or a failing probe starts the stack with the slot absent) — default binding;
  R31 and R32 are written to it, and R31 states in one sentence what changes if V rules the other way.
