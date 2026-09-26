# 00-intake — mission `provider-env-selection` · opened 2026-09-24 13:25 EEST by the orchestrator (Claude Fable 5.1, session 2c3aeba2)

## 1. V's goal, verbatim
- `/goal` 2026-09-24 13:20 EEST, in this session: **"start the coding. GPT Codes, Fable orchestrates, Grok reviews each slice after done. /heartbeat-or"** (the trailing token is `/heartbeat-orchestrator`, cut by the input box).
- The goal named no feature. Asked once (AskUserQuestion, 13:24) which work "the coding" is, V chose: **"Env-based provider selection (Recommended)"** — the option text V picked: *localhost uses the CLI-relay subscriptions, a VPS uses API keys; shape B of yesterday's research: a production provider roster + a publish CLI that is not dev-gated + env/secret-file composition at process launch, plus a cost guard on discovery probes; a short REQ/ARCH pass precedes the GPT coders; Grok reviews each slice when done.*
- The origin, V 2026-09-23 19:14 EEST (session b40ffbd3, research only): **"i need my app to select something: If on localhost, it should use local subs. if on remote/VPS, it should use API Keys. Is this separation possible? Do some research"** — the answer is `design/spike-2026-09-23.md` (verbatim, with a staleness notice).

## 2. The R7 election — asked per loop, never preset
| seat | model | why | V's word |
|---|---|---|---|
| coders (BUILD, FIX) | `codex@gpt-6-astra` (substitute `gpt-5.6-sol` if a seat dies) | "GPT Codes" | today's goal |
| reviewers (REQ-REV, ARCH-REV, REV(S) lenses) | `grok-4.7` | "Grok reviews each slice after done" | today's goal |
| planning seats (REQ, ARCH) | `claude-opus-5` subagents (Agent tool, background) | "Fable orchestrates" — the orchestrator holds no seat; planning goes to the nearest Claude house model that is not the orchestrator | row V-3 (default) |
| orchestrator | Claude Fable 5.1, this session | "Fable orchestrates" | today's goal |
Two blind seats sharing a base model: REQ-REV and ARCH-REV and every REV lens are Grok — one house, blind to each other's verdicts; REQ and ARCH are both Opus but ARCH reads REQ's output by design (not blind). Recorded as V's knowing choice through row V-3.

## 3. Risk tier and lenses
`risk_tier: medium` — the slices touch secrets (API keys), deployment configuration (`deploy/vps/env/*`), the sealed provider register and paid endpoints. Lenses per slice: correctness/tests + security/data-safety. No `ui: yes` slice is expected (no MOCK/DONE gate); a slice that adds a browser-visible surface flips to `ui: yes` at REQ and gets the product-truth lens.

## 4. Contradiction check (two requirements that cannot both hold → V now; the rest are defaults that bind until V rules)
1. "Select by whether we are on localhost" vs the register law *config is declared and sealed, never inferred* (`packages/register/src/configured-provider-set.ts:10`, ADR-0011): a runtime hostname check would put "am I local?" into the request path. Both hold when the SELECTION happens at process launch (which env file / which register publication the box boots with) — row **V-1**, default: launch-time composition, no runtime sniffing.
2. Keys inline in `PROVIDER_DISCOVERY_TARGETS_JSON` (as `deploy/vps/env/runner.env.example:59` and `api.env.example:12` do today) vs the house style of file-backed secrets (`KEK_PATH`, `*_KEY_PATH`, `dev-secret-files.ts`): both can hold — row **V-2**, default: a file-backed variant for hosted deployments, the inline JSON kept for localhost.
3. "GPT codes, Grok reviews" names no planning seat, yet coders need a frozen SPEC and an oracle — row **V-3**, default: Opus 5 planning seats, one blind Grok planning review per planning node.
4. The main tree is on `integration/debate-tiers` (register-form's base) while this surface lives on `origin/dev` (981 commits ahead here: `deploy/vps/*`, `provider-topology.ts`, `dev-secret-files.ts`, `configured-provider-set.ts`) — row **V-4**, default: base = `origin/dev` @ 776359c3; MERGE(S) into `dev`.
5. Acceptance needs a paid endpoint answering a Bearer key, but no seat may hold a real key — row **V-5**, default: every seat proves the path against a fake OpenAI-compatible endpoint that REFUSES a missing/wrong Bearer token; V alone points one slot at a real key at TEST(S).
No hard contradiction found; none goes to V at a seat's cost.

## 5. Measured state (commands in the right column; re-measure before leaning on one)
| fact | value | command |
|---|---|---|
| base | `origin/dev` @ `776359c3` (fetched 13:28; tip = today's merge of PR #8/#9 security hardening, author date 09-16) | `git fetch origin dev; git rev-parse --short origin/dev` |
| main tree | `integration/debate-tiers` @ 2d652eae, **225 dirty entries** of other missions — never touched | `git status --porcelain \| wc -l` |
| divergence | merge-base 446c685e; dev ahead 981, main tree ahead 21 | `git rev-list --count HEAD..origin/dev` |
| lockfile drift | `pnpm-lock.yaml` differs 1494 lines main-tree vs dev → lanes install from dev's lockfile (`setup-lane.zsh`: clone from `.worktrees/i18n-merge3`, `pnpm install --offline --frozen-lockfile` rc=0) | `git diff --stat HEAD origin/dev -- pnpm-lock.yaml` |
| planning lane | `.worktrees/pes-base/dialectical-engine` detached @ 776359c3, contract generated | `logs/setup-pes-base.log` |
| running stacks (NO-TOUCH) | :3000 UI + :3001 + :8790 API = the peer session's debate stack (node 98975/99904/99853); :4310 = the register-form serve for V (node 95068); :8793/:8795/:8796 = the peer's CLI relays; :55432 = dev Postgres (docker 19920); :8791/:8792 free | `lsof -nP -iTCP:<port> -sTCP:LISTEN` at 13:31 |
| baselines | `logs/baseline-intake-suites.log` (the 20 provider-reading suites, placeholder pairs) · `logs/baseline-intake-typecheck.log` — table in §5b when the run lands | `logs/measure-baseline.zsh <lane> intake` |
| node | v26.9.0 with `/opt/homebrew/bin` first on PATH (TRAPS: node 22 breaks `dev:*` CLIs) | `node --version` |

## 5b. Baselines (appended by the orchestrator when the measurement lands)
Measured 2026-09-24 13:34–13:37 in `.worktrees/pes-base` @ 776359c3 with `logs/measure-baseline.zsh <lane> intake` (capture runner, placeholder pairs; per-suite lines are the measurement). **36 suites read the provider surface** (the `git grep -l` in the script); **4 are RED at base** — their failure names are in `logs/baseline-intake-suites.log`: `dev-api-environment` 9/10 (DEV-09 'atomically assembles the exact environment' — an assertion-shape error), `dev-api-process` 5/10 (every DEV-10B case fails `DEV_API_PROCESS_ENVIRONMENT_INVALID` before its own assertion — environment-dependent), `dev-provider-panel` 3/4 ('loads the exact live CLI targets' expects the 2-slot live panel, this host answers 4 — the peer's relays are up), `t16-algorithm-register` 20/21 (providerFamilyMap seed differs). These four stay EXACTLY at their pairs through every node unless a slice's SPEC names one (a fix is then a step, never a side effect). `pnpm typecheck` at base: rc=1, **1 diagnostic** (`apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, outside this surface) — the delta by file is the verdict.

| suite | passed/total at base |
|---|---|
| `tests/architecture/dev-custody-root.test.ts` | 16/16 |
| `tests/architecture/dev-deployment-register.test.ts` | 6/6 |
| `tests/architecture/dev-real-provider-only.test.ts` | 3/3 |
| `tests/architecture/dev-runner-provider-set.test.ts` | 6/6 |
| `tests/architecture/dev-secret-files.test.ts` | 2/2 |
| `tests/architecture/p3-production-database-principals.test.ts` | 2/2 |
| `tests/architecture/s10-carrier-erasure-red.test.ts` | 13/13 |
| `tests/architecture/t09-synthesis-entrypoint.test.ts` | 4/4 |
| `tests/architecture/vps-deployment-baseline.test.ts` | 31/31 |
| `tests/integration/critique-database.test.ts` | 2/2 |
| `tests/integration/dev-api-environment.test.ts` | 9/10 |
| `tests/integration/dev-api-process.test.ts` | 5/10 |
| `tests/integration/dev-deployment-register.test.ts` | 15/15 |
| `tests/integration/dev-provider-panel.test.ts` | 3/4 |
| `tests/integration/dev-secret-files.test.ts` | 8/8 |
| `tests/integration/evaluator-database.test.ts` | 21/21 |
| `tests/integration/t16-algorithm-register.test.ts` | 20/21 |
| `tests/unit/api-operational-error.test.ts` | 9/9 |
| `tests/unit/api-provider-discovery.test.ts` | 5/5 |
| `tests/unit/critique-s08.test.ts` | 15/15 |
| `tests/unit/dev-api-environment-cli.test.ts` | 7/7 |
| `tests/unit/dev-cli-provider-panel.test.ts` | 8/8 |
| `tests/unit/dev-runner-process.test.ts` | 8/8 |
| `tests/unit/dev-runner-reconciliation.test.ts` | 8/8 |
| `tests/unit/dl7-f7-boot-custody.test.ts` | 14/14 |
| `tests/unit/f-t9b-3-empty-basis-floor.test.ts` | 16/16 |
| `tests/unit/obs-l2-s04-zone.test.ts` | 17/17 |
| `tests/unit/production-environment-floors.test.ts` | 24/24 |
| `tests/unit/prompt-injection-corpus.test.ts` | 253/253 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 |
| `tests/unit/v20-optional-primary-provider-keys.test.ts` | 11/11 |
| `tests/unit/v28-cost-envelope.test.ts` | 35/35 |
| `tests/unit/v28-provider-target-price.test.ts` | 11/11 |
| `tests/unit/v30-support-provider.test.ts` | 30/30 |
| `tests/unit/v9-deployment-mode.test.ts` | 201/201 |
| `tests/unit/v9-provider-credential-files.test.ts` | 23/23 |

(F1 of REQ-PES, 14:02: the first version of this table concatenated the strings `passed`+`failed` instead of adding them — every total was wrong by an order of magnitude; regenerated 14:10 from `logs/measure-baseline-intake.out` with integer arithmetic and emitted as `logs/baselines.tsv` in the same run — one source, two renderings.)

## 6. Caller-checked symbols (git grep on origin/dev at 13:28; hits = lines, then files)
| symbol | hits | where |
|---|---|---|
| `parseProviderDiscoveryTargets` | 14 | apps/api/src/main.ts · apps/api/src/provider-discovery.ts · apps/api/src/support/model.ts · apps/runner/src/dev-provider-panel.ts |
| `configuredProviderSet` | 14 | apps/runner/src/dev-deployment-register.ts · apps/runner/src/dev-provider-panel.ts · deploy/vps/README.md · deploy/vps/env/runner.env.example |
| `normalizedProviderBaseUrl` | 3 | apps/api/src/support/model.ts · packages/providers/src/index.ts |
| `probeFreshnessMs` | 6 | apps/api/src/main.ts · apps/api/src/provider-discovery.ts · packages/register/src/index.ts |
| `PROVIDER_DISCOVERY_TARGETS_JSON` | 33 | apps/api/src/main.ts · apps/runner/src/dev-api-environment.ts · dev-api-process.ts · dev-runner-process.ts · deploy/vps/env/*.env.example |
| `dev-provider-set-publish-cli.ts` | file exists (31 lines), imports `developmentConfiguredProviderPanel` — dev-only by construction | `git ls-tree origin/dev` |
| `dev-secret-files` | 3 | apps/runner/src/dev-auth-stack.ts · dev-secret-files-cli.ts · packages/crypto/src/index.ts |
| `KEK_PATH` / `AUDIT_KEY_STORE_PATH` | 67 / 10 | the file-backed secret house style (api main.ts:136-163, dev-api-environment.ts:36-65, deploy/vps/env/*) |
| `deploymentRiskTier` | 2 | apps/api/src/main.ts |
| `DEPLOYMENT_KIND`, hostname sniffing | 0 | none — and the spike's "no environment switch today" is FALSE on dev: the switch is `DEBATEAI_DEPLOYMENT_MODE` (§10; corrected 14:35 on REQ-REV-p1 N1 after the orchestrator's table regeneration swallowed §6–§9 and they were restored from freeze cb65cd3e) |
The 158 measured quote lines are in `design/dev-extracts.md`; tests that READ the surface: 20 files (`git grep -l` over `tests/`, list in `logs/measure-baseline.zsh`).

## 7. Where the spike is stale (read it with this list beside it)
"there is no VPS deployment path yet at all" — FALSE on dev: `deploy/vps/{README.md (873 lines),compose.prod.yaml,Caddyfile,env/*.env.example,systemd/*.service}` and `tests/architecture/vps-deployment-baseline.test.ts` (561 lines) exist; `runner.env.example:59` already takes `PROVIDER_DISCOVERY_TARGETS_JSON` inline and `:56` requires every ref in the register row; README:19-23 marks §11's hosted provider example as known-stale. "The publish path is dev-gated" — TRUE: `dev-provider-set-publish-cli.ts` imports the development panel; `configured-provider-set.ts:134-136` says hosted publications go through `RegisterPublicationPort.publishGeneral`. The probe cost point stands (`provider-discovery.ts:44-69`, `provider-probe.ts:5-17`).

## 8. Candidate slicing (a proposal for REQ, which owns the slice table)
- S01 — the hosted provider roster and its publish path: a `production:`/hosted provider set module with honest refs (maker + API), published through the existing hosted publication port by a CLI that is not dev-gated; `PROVIDER_DISCOVERY_TARGETS_*` composed from the same source so the exact-set check passes on a hosted box.
- S02 — launch-time composition for the VPS: env examples + systemd units + README §11 refreshed; file-backed targets/keys per row V-2; localhost keeps the dev composition untouched (`dev-auth-stack`).
- S03 — paid-endpoint guards: the discovery probe against a paid endpoint is rate-bounded (`probeFreshnessMs` floor or a per-target flag) and its cost visible; operator acceptance against a fake Bearer-checking endpoint (row V-5).

## 9. Transports (probed)
codex `exec` + `exec resume` — proved 2026-09-24 on register-form (6 seats, 3 resumes) · grok `-p` headless — proved 2026-09-24 (6 lenses), `--resume`/`--continue` present in `grok --help` · Claude subagent via the Agent tool (background, model per roster) with SendMessage resume — the harness's own · board: `~/.local/bin/hermes kanban --board provider-env-selection …` (flag before verb; `--parent` must be its own argv word — zsh `${x:+--parent $x}` glues them, TRAPS).

## 10. What dev ALREADY implements of V's ask (measured 13:40 — the spike, on the stale branch, saw none of it)
- **The explicit deployment mode** `DEBATEAI_DEPLOYMENT_MODE=hosted|local` (V-9, ruled 2026-09-22, merged to dev this morning with PR #8): `apps/api/src/main.ts:97,238,306,312`, `apps/runner/src/main.ts:38-108`, `deploy/vps/env/{api,runner}.env.example:14/:11`, README:730-773 (`DEPLOYMENT_MODE_UNRESOLVED` / `_INVALID`); `tests/unit/v9-deployment-mode.test.ts` (477 lines, 201 cases): *hosted refuses a relay/loopback target, local admits it; the mode is never guessed*.
- **Credential FILES for hosted API keys**: a target may name `authorization_file` (0600 in a 0700 dir, custody contract, read once into memory, path never in a refusal), admitted in hosted mode where an inline credential is refused — `tests/unit/v9-provider-credential-files.test.ts` (600 lines), `packages/providers/src/index.ts:707-725`, `packages/crypto/src/index.ts:166-181,868`, README:777-784 ("The credential-file contract"). This is row V-2's default, already built.
- **The VPS kit starts the runner with the hosted mode and `PROVIDER_DISCOVERY_TARGETS_JSON` as the single source of the provider set** (`tests/unit/v20-optional-primary-provider-keys.test.ts:142-159`); priced targets are asserted in hosted mode (`assertPricedProviderTargets`, `v28-*` suites).
- **Still measured as GAPS (REQ verifies each before it becomes a slice):** (a) the hosted provider-set PUBLICATION path — `dev-provider-set-publish-cli.ts` is dev-only and `configured-provider-set.ts:134-136` routes hosted publications through `RegisterPublicationPort.publishGeneral` with no CLI found by `git grep publishGeneral` outside packages; (b) README §11's hosted provider-target example is marked known-stale by README:19-23; (c) the localhost composition never sets the mode explicitly (`local` is the outside-production default — v9 test :264) — V's 'if on localhost' is the default, not a declared value; (d) a paid-endpoint probe cost guard (`probeFreshnessMs` floor) — unverified need; (e) an operator acceptance V can run on this Mac: boot hosted mode against a fake Bearer-checking endpoint on a free port and see the relay refused, the key file honoured, a debate ask answered.
Row **V-6** records this: the mission's scope is the measured gap, not the spike's shape B as written.
