# INTAKE — slice S03 of mission `debate-tiers` (heartbeat v4.0.0, graph mode)

- **Date:** 2026-09-13 · **Orchestrator:** Claude Code, Fable 5.1 (Claude-Router seat) · **Spine:** v4.0.0 · **Board:** `debate-tiers` · **Base:** `7188b167` on `integration/debate-tiers` (= dev f19c706f + S01 + S02 + the 2026-09-12/13 ops work committed as 6a05a0d0 + 7188b167 — see Rulings).
- **Slice ticket (V's, closes only on V's veto):** S03 `t_f14b0ca0`. Nodes: REQ `t_089ce7cc` → REQ-REV `t_f2364116` → ARCH `t_6b7afd11` → ARCH-REV `t_ff973916` → BUILD(S03-Cn) appended from the plan's clusters → GATE → REV lenses → TEST = `t_f14b0ca0` (linked as the child of the final REV pass) → MERGE.
- **Lane:** `dialectical-engine/.worktrees/tiers-s03/dialectical-engine` (branch `slice/tiers-s03`) from `7188b167`, HEAD **`9a000c37`** (= 7188b167 + the cherry-picked fix `4df0b2b5`, ruling R-S03-5) — BUILD packets cite 9a000c37 as the lane base; setup + baseline log `.hermes/reports/debate-tiers/logs/setup-tiers-s03.log` (script `setup-tiers-s03.sh`). REQ, REQ-REV, ARCH and ARCH-REV run in the MAIN tree (mission docs only, no git writes); BUILD runs in the lane.
- **The 2026-09-09 intake (`00-intake.md`) still binds** for everything it says about the ask contract, the API ask path, the `/new` form and the R7 election; this record adds the S03 facts only.

## V's goal (verbatim, `/goal`, 2026-09-13)

> /heartbeat : For the free tier, switch Sonnet 5 with GLM 5.3 Flash. Switch to API_KEYS.but only for the free tier. Luna 5.6 and GLM 5.3 Flash with API_KEYS is enough for us, for now.

## V's words on the config file (the brainstorm that preceded the goal, 2026-09-13, verbatim)

> okay. now we gotta think about free and premium model wiring. Models should be swapped easily via a config file or something like that.
> Cause they are prone to change

V's answers to the orchestrator's four questions (each was a multiple-choice question; V's own words where V typed):

1. **Scope of a file-only change:** > I want to be able to change the model that gets called inside a simple file, due to how everything is prone to change. Iwant to be able to add makers to tiers. Or substract them. But I want it to be in a simple config file where things happen easily.
2. **A maker with no CLI on this Mac:** > for now, we do things through "its own CLI" — API Tokens will be in the future
   — superseded thirty minutes later by the goal above: the FREE tier goes to API keys now; Premium stays on its CLIs.
3. **When an edit takes effect:** V chose **"On restart"** — the option read: *"You edit the file and run one command. It first checks the file (typos, a CLI that isn't installed, a model that doesn't answer) and refuses without touching anything if it's wrong. Otherwise it restarts the stack. Running debates pause about a minute and resume."*
4. **File shape:** V chose **"Tiers list models"** — each tier lists its makers and models directly; one model per maker per tier. The preview V selected, verbatim:

```yaml
# config/models.yaml
# Which models debate in each tier.
# Edit, then restart the stack.
# CLIs: codex (OpenAI) · claude (Anthropic) · grok (xAI)

free:
  - cli: codex
    model: gpt-5.6-luna
  - cli: claude
    model: claude-sonnet-5

premium:
  - cli: codex
    model: gpt-5.6-sol
  - cli: claude
    model: claude-opus-5
  - cli: grok
    model: grok-4.6-build

# Put Grok in Free too:
#   add under free:
#   - cli: grok
#     model: grok-4.6-build
```

The goal changes the Free half of that preview: Free = `gpt-5.6-luna` and `glm-5.3-flash`, both reached over an API key rather than a CLI, so a Free entry names a key-based transport where the preview says `cli:`. Premium's three entries stay `cli:`. REQ freezes the exact shape.

## V's update (verbatim, chat, 2026-09-13 14:33 EEST — stamp CORRECTED 16:49 from an estimated "16:05"; the transcript timestamp is 11:33:23Z) — folds into REQ-FIX(S03) with the REQ-REV verdict

> Update: Switch the 5.3 to GLM 4.7. we got a subscription, use them API_TOKENS. or idk how can we connect to GLM 4.7

Measured the same hour (scratchpad `probe-zai-47.mjs`, `probe-zai-47b.mjs`, `probe-zai-echo.mjs`; the key already on this Mac, read from the Hermes store, never printed):
- **F13 — the subscription endpoint routes old ids to its two live models.** `GET https://api.z.ai/api/coding/paas/v4/models` lists `glm-4.5, glm-4.5-air, glm-4.6, glm-4.7, glm-5, glm-5-turbo, glm-5.1, glm-5.2, glm-5.3, glm-5.3-flash`, but a chat request for `glm-4.7` (or `GLM-4.7`, `glm-4.6`, `glm-5-turbo`) is ANSWERED with `model: "glm-5.3-flash"`, and `glm-5` with `model: "glm-5.3"`. Only `glm-5.3` and `glm-5.3-flash` answer under their own id. Under DR-115 (lineage is what the maker reports, never a guessed literal) and the probe's exact-echo rule (F5), the app cannot claim GLM 4.7 on this subscription — row V-37.
- **F14 — the probe passes on GLM with a larger budget and thinking off.** `max_tokens: 64` + `thinking: { type: "disabled" }` → content `"OK"` on every try (reasoning tokens still reported, 12–18); `max_tokens: 8` fails in either mode. The pay-as-you-go endpoint still answers 429 for `glm-4.7` (balance).
- **V-35 is ANSWERED by V's words ("we got a subscription, use them API_TOKENS"):** the Free GLM entry targets the subscription endpoint `https://api.z.ai/api/coding/paas/v4` with a bearer; the token already in `~/.hermes/auth.json` (`credential_pool.zai`, also `custom:zai`) answers 200 there. If V's subscription came with a different token, V writes it to `.local/dev-auth/provider-keys.env` as `ZAI_API_KEY=…` (R-S03-1). The plan's terms name coding tools; V's account, V's call — recorded, not re-raised.

## Classification (set once)

```yaml
risk_tier:
  S03: high     # provider routing per run over V's paid keys + credential custody + a register publication that REMOVES slots
ui: set by REQ  # /new already shows each tier's model ids (apps/ui/app/new/page.tsx:200); no new screen is asked for
```

## R7 election — row V-1's ruling stands

`requirements: [claude-opus-5]` · `architecture: [claude-opus-5]` · `programming: [codex@gpt-5.6-sol]` · `review: [claude-opus-5]` per lens, blind · `qa: [V]`. Decorrelation as recorded on 2026-09-09.

## Contradiction check (rows go to V NOW, at one seat's cost)

| # | Requirement vs fact | Resolution |
|---|---|---|
| C10 | Luna over an API key vs **no OpenAI API key exists on this Mac**: `~/.codex/auth.json` has `auth_mode: chatgpt` and `OPENAI_API_KEY: null`; `~/.hermes/auth.json` holds `openai-codex` OAuth tokens; no `OPENAI_API_KEY` in any shell rc (field names read, never values) | **Row V-34.** V obtains a key and places it in `.local/dev-auth/provider-keys.env` (`OPENAI_API_KEY=…`, mode 600 — ruling R-S03-1). BUILD proceeds against the product's fakes; TEST(S03) needs the key. Whether the platform sells the model under the id `gpt-5.6-luna` is UNVERIFIED until a key exists (the probe demands the exact id echo, F5). |
| C11 | GLM 5.3 Flash over an API key vs the Z.ai pay-as-you-go endpoint answering **`HTTP 429 "Insufficient balance or no resource package. Please recharge."`** (11:02 UTC, the product's own probe body). The coding-plan endpoint `https://api.z.ai/api/coding/paas/v4` answers `200`, `model="glm-5.3-flash"`, 1.5 s — that is what the support bot uses through Hermes | **Row V-35.** Default: V recharges the API balance (`api.z.ai/api/paas/v4`). Alternative: the coding endpoint, whose plan terms are written for coding tools. The file carries the base URL either way. |
| C12 | "API keys, but only for the free tier" vs Premium unchanged | No contradiction — a scope line: Premium stays on the three CLI relays (`gpt-5.6-sol` 8795, `claude-opus-5` 8796, `grok-4.6-build` 8793); every Premium entry stays `cli`; every Free entry is key-based. |
| C13 | "One model per maker per tier" (the rule stated with the file shape V chose) vs the new Free = OpenAI + Z.AI | Consistent. Admission needs two reachable makers (`apps/api/src/index.ts` `runMakerReachability: makers.length >= 2`); the dev panel floor is `DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1` (`apps/runner/src/dev-provider-panel.ts:9`). REQ pins both tiers at ≥ 2 makers. |
| C14 | Removing Sonnet and the codex-cli Luna relay from the panel vs the api.env drift guard's additive-only rule (F7) and the pin `rejects v4 reconstruction and removed-provider fallback` | A product change S03 owns: ARCH decides how a legitimate removal is told apart from a stale reconstruction (the outgoing env's version + refs must equal a version the register actually holds, say). The pin keeps its case (v4 + retired scaffold) and gains the removal case. |
| C15 | "Edit the file, restart" vs the `/new` page compiling the roster into the browser bundle (F1: `page.tsx:10,200`) | The page must get the tier lists at runtime (an API route) or from a generated module the restart rewrites — ARCH's call; REQ states the observable: after an edit + restart, `/new` shows the new list without a rebuild of the UI. |

## Measured state (2026-09-13, commands beside each value)

- **Tree:** `integration/debate-tiers` @ `7188b167` (main tree); 133 dirty entries, other missions' work — never touched (`git status --porcelain | wc -l`).
- **Stacks (V's — never stop, swap or reconfigure from a seat):** front door `:3000` pid 3896 → UI `:3001` pid 3840 → API `:8790` pid 45592 (restarted 10:09 EEST with the shared-lease fix) · relays `:8791–8796` inside stack pid 45304 · runner pid 45616 (`lsof -nP -iTCP:3000 -sTCP:LISTEN`).
- **Live register:** v9, 32 rows; `api.env` `REGISTER_VERSION=9` with five discovery targets — `development:codex-cli`→`gpt-5.6-luna` · `codex-premium-cli`→`gpt-5.6-sol` · `claude-cli`→`claude-sonnet-5` · `claude-premium-cli`→`claude-opus-5` · `grok-cli`→`grok-4.6-build` (`PANEL_READY healthy=5` in `.hermes/reports/debate-tiers/logs/serve-int-stack.log`; models only — the file carries authorization headers and is NEVER printed).
- **Keys on this Mac (FIELD NAMES only):** `~/.codex/auth.json` → `{OPENAI_API_KEY: null, auth_mode: "chatgpt", tokens}` · `~/.hermes/auth.json` → `credential_pool.zai[0] {base_url: https://api.z.ai/api/paas/v4, last_status: ok, access_token: set}`, `credential_pool["custom:zai"][0] {base_url: https://api.z.ai/api/coding/paas/v4, access_token: set}`, plus `openai-codex` (OAuth), `openrouter`, `copilot` · `~/.hermes/.env` names `OPENROUTER_API_KEY` (empty). Command: a python3 listing of JSON keys.
- **Transport probes** (scratchpad `probe-zai.mjs` / `probe-zai-coding.mjs`, the product's DR-181 body, `max_tokens: 8`, key read from the Hermes store and never printed): `api.z.ai/api/paas/v4` → 429 balance · `api.z.ai/api/paas/v4/v1` → 404 · `api.z.ai/v1` → 404 · `api.z.ai/api/coding/paas/v4` → 200, `model` echoes `glm-5.3-flash` exactly, `content: ""` with `reasoning_tokens: 5` of the 8 (F6).
- **Baseline of record = the LANE** (REQ-S03 finding 3: two baselines were given; the lane's per-file rows in `setup-tiers-s03.log` bind, and `dev-api-environment.test.ts` is 10/10 at lane HEAD 9a000c37 — the 9/10 was the orchestrator's swept hunk, fixed by 4df0b2b5, LEDGER 15:05).
- **Baseline, main tree @ 7188b167** (`LANG=en_US.UTF-8 npx vitest run` over the 11 files S03 will touch, log `scratchpad/baseline-tiers-suites.log`): `Test Files 1 failed | 9 passed (10)` · `Tests 2 failed | 97 passed (99)` · both failures in `tests/architecture/register-support-publication.test.ts` ("recognizes hostile static SQL concatenation…", "classifies every register relation access…") — pre-existing, dated 2026-09-12 in the LEDGER (its 15 baseline typecheck errors, `BASELINE.md`). The lane's per-file `passed/total` rows: `setup-tiers-s03.log`.
- **Seats:** Opus 5 via the Agent tool, background; Codex Sol via `codex exec … </dev/null`, background (probed 2026-09-09; re-probed at BUILD dispatch).

## Facts REQ's charges depend on (extracts re-grepped 2026-09-13 at `7188b167`)

- **F1 — the rosters are spelled once.** `packages/contract/src/plan-tiers.ts:8-10`:
  ```ts
  export const PLAN_TIER_ROSTERS = Object.freeze({
    free: Object.freeze(["gpt-5.6-luna", "claude-sonnet-5"]),
    premium: Object.freeze(["gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"])
  ```
  Consumers: `apps/api/src/index.ts` — LANE line numbers (`9a000c37`) `:1214` `const roster = PLAN_TIER_ROSTERS[planTier …]`, `:1216` `discoveredPanel.find((member) => member.model_id === modelId)`, `:1223` `"ASK_PLAN_TIER_MODEL_UNAVAILABLE"` (**CORRECTED 2026-09-13 ≈14:28 (this mark was first written "15:30", an estimate; re-measured 16:49), REQ-S03 finding 2:** the main tree carries another mission's uncommitted +13 lines in this one file, so its numbers `:1227/:1229/:1236` are 13 ahead; every other cited file is byte-identical between the trees — cite the LANE) · `apps/ui/app/new/page.tsx:10` `import { PLAN_TIER_ROSTERS } from "@debateai/contract"`, `:200` `{PLAN_TIER_ROSTERS[option.value].map((modelId) => (` — the browser bundle compiles the roster in · `apps/runner/src/dev-cli-provider-panel.ts:122-127` `DEVELOPMENT_CLI_MODEL_PINS` derives every CLI pin from the roster (`codexFreeModel`, `claudeFreeAlias`, …, `grokSandboxProfile: "none"`).
  Pins: `tests/architecture/tier01-roster.test.ts:8-14` (`MODEL_IDS`), `:40-41` (exact rosters), `:49-50` (exactly one declaring file: `packages/contract/src/plan-tiers.ts`) · `tests/architecture/tiers-s02-rosters.test.ts:204` exact rosters, `:216-217` one canonical declaration (+ `apps/ui/components/landing/cards.ts:27-28` allow-listed for `claude-opus-5` / `gpt-5.6-sol`), `:239` no tier `if`/`case`, `:243` ≥ 2 members · `tests/unit/tiers-s02-admission.test.ts` (36 literal ids) · `tests/render/tier01-new-plan-tier.test.tsx` (9).
- **F2 — the slots.** `apps/runner/src/dev-provider-panel.ts:25` `export const DEVELOPMENT_CLI_PROVIDER_ROSTER = Object.freeze([` — five refs `development:codex-cli` (`:27`, 8791) · `codex-premium-cli` (`:33`, 8795) · `claude-cli` (`:39`, 8792) · `claude-premium-cli` (`:45`, 8796) · `grok-cli` (`:51`, 8793); `:87` `function expectedBaseUrl(port)` = `http://127.0.0.1:${port}/v1`; `:91` `buildDevelopmentProviderPanel` refuses (`:96`, `:101` `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`) an observation whose base_url is not the slot's port; `:138` `developmentConfiguredProviderPanel()` = the set without health, for publication. Pinned by `tests/architecture/dev-real-provider-only.test.ts:27-31` (the five refs by name) and `:36-41` — `"keeps Hermes GLM in the Support-only stack seam and out of the debate roster"`, `expect(panel).not.toContain("hermes-glm-5.3-flash")`: V's goal now puts GLM INTO the debate roster; the test's intent changes and S03 owns it (the support seam itself stays — F9).
- **F3 — discovery is 1:1 with the register's configured set.** `packages/providers/src/index.ts:134` `export function parseProviderDiscoveryTargets(` (one target per `provider_ref`; `:91` `MAX_PROVIDER_TARGETS = 32`); `apps/api/src/provider-discovery.ts:104` `createProviderDiscoveryResolver` demands the same length AND order → `:123` `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`. One model per slot; the config file's entries map to slots.
- **F4 — the base-URL rule refuses Z.ai.** `packages/providers/src/index.ts:109` `function normalizedProviderBaseUrl(` allows http/https but `:128` `if (!parsed.pathname.endsWith("/v1")) {` refuses everything else; Z.ai's only working paths are `/api/paas/v4` and `/api/coding/paas/v4` (probes). The gateway needs no new adapter kind: `:335` `headers.authorization = this.#options.authorizationHeader;` and `:337` `fetcher(\`${this.#options.endpoint}/chat/completions\`` — a remote HTTPS target with a bearer needs no adapter change. **CORRECTED 2026-09-13 ≈14:28 (this mark was first written "15:30", an estimate; re-measured 16:49) (REQ-S03 finding 1):** the URL rule is the FIRST of TWO gates — the dev panel is the second: `apps/runner/src/dev-provider-panel.ts:87-89` `expectedBaseUrl(port)` = `http://127.0.0.1:${port}/v1` and `:100-101` throw `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID` for any slot whose base_url is not exactly that; relaxing only the `/v1` rule gives a stack that refuses to START (no unit test catches it). SPEC R11 names both gates.
- **F5 — the health probe.** `apps/api/src/provider-discovery.ts:56` `max_tokens: 8,` · `:59` `content: "DR-181 discovery health probe. Reply exactly: OK"` · `:77` `if (decoded.model !== input.target.model || content !== "OK") {` → `PROVIDER_PROBE_RESPONSE_INVALID`.
- **F6 — GLM 5.3 Flash reasons before it answers.** With `max_tokens: 8` it returned `content: ""` and `usage.completion_tokens_details.reasoning_tokens: 5` — the probe as written marks it ABSENT. Z.ai documents a request field `thinking: { type: "disabled" }` (UNVERIFIED on this key — a probe with V's balance settles it); the alternative is a larger probe budget for that target.
- **F7 — register publication and the api.env guard.** `apps/runner/src/dev-deployment-register.ts:618` `export async function publishDevelopmentDeploymentRegisterProviderSet(` publishes the panel's set as a NEW version from `:509` `buildDevelopmentDeploymentRegisterPublicationRows` (`:327` `rowKey: "configuredProviderSet"`, sourceRef `:579`); nothing in the database forbids a smaller set. api.env follows a published version only additively: `apps/runner/src/dev-api-environment.ts:336` `function isExactPublishedRegisterRefresh(`, `:356` `// slots are ADDED, never removed or renamed.`, `:367` `if (typeof providerRef !== "string" || !configuredRefs.has(providerRef)) return false;`, chained at `:495`; a refused refresh is `:271` `DEV_API_ENVIRONMENT_DRIFT`. Pin: `tests/integration/dev-api-environment.test.ts:352` `it("rejects v4 reconstruction and removed-provider fallback"`, `:362`.
- **F8 — the runner's first-slot check.** `apps/runner/src/main.ts:67-69`: the FIRST target's `baseUrl`/`model`/`authorizationHeader` must equal `VLLM_BASE_URL` / `VLLM_MODEL` / `VLLM_AUTHORIZATION` from api.env — slot order is load-bearing.
- **F9 — stack order and the support seam.** `apps/runner/src/dev-auth-stack.ts:246` `startProviderPanel: () => startDevelopmentCliProviderPanel(),` → `:248` `startHermesSupportRelay({` → `:272` `assembleDevelopmentApiEnvironment({`. The support bot's GLM path stays untouched: `acceptance/hermes-relay.ts:15` `HERMES_GLM_MODEL = "z-ai/glm-5.3-flash"`, `:16` `HERMES_GLM_CLI_MODEL = "glm-5.3-flash"`, `:17` `HERMES_SUPPORT_PROVIDER_REF = "development:hermes-glm-5.3-flash"`, `:18` `HERMES_MAKER = "Z.AI"`, `:33` `readGlmCredential()` reads `~/.hermes/auth.json` `credential_pool.zai` under custody checks (0700 dir, 0600 file, nlink 1).
- **F10 — every CLI takes a full model id.** `claude --help`: `--model <model> … an alias … or a` full id; `grok --help`: `-m, --model <MODEL>`; codex: `acceptance/model-shim.ts:167` `-c model="…"`. A config entry can carry the exact id for every CLI; the alias derivation `claudeAlias` (`dev-cli-provider-panel.ts:106-110`) becomes unnecessary.
- **F11 — tooling.** `yaml@2.9.0` sits in the workspace store (`node_modules/.pnpm`) but is no package's dependency; no `config/` directory exists at the repo root.
- **F12 — no migration.** The run records `plan_tier` and `discovered_panel` (S02); the tier lists themselves are never written to the database — the file is configuration, not schema.

## Rulings the orchestrator took on V's behalf at this intake (what — why — cost if wrong)

- **R-S03-1** Key file = `.local/dev-auth/provider-keys.env`, lines `OPENAI_API_KEY=…` and `ZAI_API_KEY=…`, mode 600, under the custody checks `hatchet.env` already gets — named now so V can act before ARCH; ARCH may move it by a DECISIONS line. Cost: one file move by V.
- **R-S03-2** ONE slice: the config file and the key-based transport ship together (the file is where the transport is declared; a file with only `cli:` entries would not carry V's goal). Cost: a larger review package.
- **R-S03-3** C11's default = recharge the Z.ai API balance; the coding endpoint is V's alternative. Cost: one base-URL line in the file.
- **R-S03-5** `6a05a0d0` had swept ONE foreign hunk: another session's uncommitted edit to `tests/integration/dev-api-environment.test.ts:175-179` (EVALUATOR_DATABASE_URL assertions, RED against the committed product — the lane's 9/10). Fixed by `4df0b2b5` on `integration/debate-tiers` (HEAD back to the pre-sweep assertion; the hunk left in the working tree as that session's uncommitted change, byte-identical) and cherry-picked to the lane as `9a000c37` → the file is 10/10 in the lane. Class fix: a mission commit is made from a LANE, or from the shared main tree only after reading every staged hunk (TOOLING-TRAPS 2026-09-13). Cost if wrong: none for the other session (its working copy is untouched); `git revert 4df0b2b5` if it wants its hunk in history now.
- **R-S03-4** Yesterday's ops work committed locally as `6a05a0d0` (product + tests) and `7188b167` (records) so the lane has a base that contains it; `git reset --soft HEAD~2` undoes both. The pnpm lockfile in 6a05a0d0 also reflects two other missions' package.json (adds `apps/observation-agent`, drops the deleted `web/`). Cost if V objects: the reset, one minute.

## Caller checks (every symbol this intake routes)

- `PLAN_TIER_ROSTERS`: `apps/api/src/index.ts:23,1227` · `apps/ui/app/new/page.tsx:10,200` · `apps/runner/src/dev-cli-provider-panel.ts:1,123-126` (+ the tests in F1).
- `parseProviderDiscoveryTargets`: `apps/runner/src/main.ts:46` · `apps/runner/src/dev-provider-panel.ts:119,149` · `apps/runner/src/dev-runner-process.ts:62` · `apps/api/src/main.ts:167` · `apps/api/src/provider-discovery.ts:7` (re-export).
- `isExactPublishedRegisterRefresh`: `apps/runner/src/dev-api-environment.ts:495` only.
- `startDevelopmentCliProviderPanel`: `apps/runner/src/dev-auth-stack.ts:246` (+ `coverage/serve/serve-stack.ts`, the reconstructed, gitignored serve stage the main stack runs from — see LEDGER 2026-09-12 16:35).
- `publishDevelopmentDeploymentRegisterProviderSet`: `apps/runner/src/dev-provider-set-publish-cli.ts` (the `pnpm dev:auth:publish-provider-set` CLI) only.
