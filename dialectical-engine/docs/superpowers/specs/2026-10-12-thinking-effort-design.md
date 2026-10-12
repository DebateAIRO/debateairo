# Owner-chosen thinking effort per AI and per step (v3 preview)

Date: 2026-10-12. Status: design approved by the owner in chat on 2026-10-12. The owner then said to write this spec,
build it, deploy it and run the test, and to come back only with the PR and the summary, or earlier if something is
off. Base: `origin/release/2026-10-12-r14`. Branch: `design/2026-10-12-thinking-effort`.

## 1. Goal

The owner chooses how hard each AI thinks:
- per AI;
- optionally per step (for example lighter for the story writer, deeper for the judges).

The choice must stay inside a reviewed set that the spending gate also enforces. A measured side-by-side practice run
backs the choice. Until the owner chooses, every request is byte for byte what it is today.

## 2. Facts this design rests on (research 2026-10-12)

DeepInfra's public model pages list no reasoning parameters per model. Its general API reference accepts
`reasoning_effort` none/minimal/low/medium/high/xhigh/max, and says "none disables reasoning entirely if the model
supports" (docs.deepinfra.com/api-reference/chat-completions/openai-chat-completions.md). The levels each maker
documents are below.

| AI (DeepInfra / Anthropic id) | Maker's levels | Sent today | Source |
|---|---|---|---|
| zai-org/GLM-5.3-Flash | low, high, max; default max. An unknown value falls back to max. Thinking cannot be switched off. | `reasoning_effort: "high"` | huggingface.co/zai-org/GLM-5.3-Flash; deepinfra.com/blog/glm-5-3-flash-deepinfra (2026-09-28); docs.z.ai/guides/llm/glm-5.3 |
| deepseek-ai/DeepSeek-V4.1-Flash | none, low, high, max; default high; medium is treated as high | `reasoning_effort: "high"` | api-docs.deepseek.com/api/create-chat-completion; api-docs.deepseek.com/guides/thinking_mode |
| XiaomiMiMo/MiMo-V2.6-Pro | thinking on/off only; no levels | nothing (on) | mimo.mi.com docs, deep-thinking page (2026-09-22) |
| Qwen/Qwen3.8-Flash | low, medium, xhigh; default xhigh (thinking budgets 4,096 / 16,384 / 262,144 on Alibaba); "high" is not a Qwen value; `enable_thinking` false turns it off | nothing (xhigh) | alibabacloud.com Model Studio, OpenAI-compatible API (2026-10-12); Qwen3.8-Flash-Next card |
| claude-haiku-5-5 | low, medium, high, xhigh, max; default medium. `budget_tokens` is refused. | `output_config: {"effort": "high"}` | Anthropic docs (claude-api skill: model-migration "Migrating to Claude Haiku 5.5") |

How DeepInfra handles each value per model is NOT documented. A refused value (HTTP 4xx) and a silently ignored value
(it runs at the default) can only be told apart by a live call that reads the reasoning-token count. Step A of the test
(§6) settles this before the side-by-side run.

What we measured earlier in practice runs:
- reasoning is 75% of DeepSeek's output, 87% of Qwen's and 56% of MiMo's;
- output is about 77% of spend;
- DeepInfra answers take 37–60 s on average; Haiku takes 11 s.

## 3. Owner rulings (2026-10-12)

1. **Where the choice lives:** a server (operator) setting. `PREVIEW_PROVIDER_TEST_CONFIG_JSON` gets an optional
   `thinking_levels` table. It is not a sealed register row and not code. Every call already records the level it ran at.
2. **Granularity:** a usual level per AI, plus optional per-step overrides (§4.3).
3. **First test:** the real lower-side levels, plus "thinking off" for MiMo, Qwen and DeepSeek. The top levels are not
   tested.
4. **Quality judging:** labelled side by side (not blind).
5. **Process:** the owner pre-approved the steps: spec, build, gate update on the server, practice tests within the
   standing test budget. The owner wants the PR and a summary at the end, or an early word if something is off. Merging,
   and writing the owner's final picks into the server setting, stay the owner's call.

## 4. Design

### 4.1 Reviewed level menus

Each reviewed row in `packages/providers/src/preview-models.ts`:
- replaces `effort: "high" | null` with `efforts`, the reviewed menu (an ordered, non-empty list);
- gets `defaultEffort`, the level it runs at when the setting names none. That is exactly today's request.

Level words, used everywhere (setting, app, gate, records):

| Word | Meaning on the wire |
|---|---|
| `default` | no effort member at all (the vendor's own default) |
| `none` | DeepInfra `reasoning_effort: "none"` (thinking off) |
| `low`, `medium`, `high` | DeepInfra `reasoning_effort: <word>`; Anthropic `output_config: {"effort": <word>}` |

Menus (the first entry is `defaultEffort`):

| AI | Menu | Default (today) |
|---|---|---|
| GLM-5.3-Flash | high, low | high |
| DeepSeek-V4.1-Flash | high, low, none | high |
| MiMo-V2.6-Pro | default, none | default |
| Qwen3.8-Flash | default, low, medium, none | default |
| Claude Haiku 5.5 | high, medium, low | high |

Rules:
- A level a maker does not document is never on a menu. For example, "medium" for GLM would silently run max.
- Anthropic rows never carry `default` or `none`.
- The gate's Python rows (`preview_budget_helper.py` `ModelRow`) carry the same menu as a tuple. In it, `None` stands
  for `default`, and the first element is the default.
- The parity fixtures (`tests/unit/fixtures/preview-model-rows*.json`) hold both, so the two copies cannot drift.

**One variable at a time.** A row's reviewed sampling (Qwen T 0.6 / top_p 0.95 / top_k 20; MiMo T 1.0 / top_p 0.95) is
the same at every level. The Qwen card's other advice (T 1.0 when thinking, T 0.7 / top_p 0.8 / presence_penalty 1.5
when not) is a later, separate test.

### 4.2 The owner's setting

`PREVIEW_PROVIDER_TEST_CONFIG_JSON` keeps every key it has today, `requested_thinking_level: "high"` included, so the
server's current file stays valid. It gains one optional key:

```json
{"thinking_levels": {"Qwen/Qwen3.8-Flash": {"level": "low", "steps": {"story_writer": "medium"}}}}
```

(The example shows only the new key. The real setting carries it beside today's keys.)

Each entry is keyed by a reviewed model id and has:
- `level`: optional, defaults to the row's `defaultEffort`;
- `steps`: optional; maps a step name (§4.3) to a level.

The API and the runner both refuse to start with one plain error, `PREVIEW_THINKING_LEVELS_INVALID`, naming the problem,
when the table:
- names a model that has no reviewed row;
- names a step outside §4.3;
- names a level outside that model's menu;
- has an empty object, or any other key.

A model or step the table leaves out runs at its `defaultEffort`. With the key absent, every request is today's.

`deploy/preview-auth-dev/v1/environment.mjs` (the boot key-list check) accepts the key as optional.

### 4.3 Step families

Each call gets its step from its call-site key (any `:seat:main|runnerUp` suffix removed). The mapping reuses
`debateRoleFromCallSiteKey` (packages/kernel/src/debate-roles.ts) plus the two story sites:

| Step name | Call-site keys |
|---|---|
| `opening` | `JUDGE`, `JUDGE:root:*` |
| `pros_cons` | `JUDGE:defender:*`, `JUDGE:critic:*` |
| `cross_exchange` | `JUDGE:cross-root:*` |
| `judge_panel` | `PANEL:*` |
| `reviewer` | `JUDGE:review:*` |
| `answer_writer` | `COMPOSER:SYNTHESIZER:*` |
| `answer_checker` | `POST_COMPOSE_R9:EVALUATOR:*` |
| `story_writer` | `STORY:STORYTELLER:n` on the story lane |
| `story_checker` | `STORY:CHECKER:n` on the story lane |
| `slip_fix` | the second or third POST inside a call (patch follow-up or full re-ask), when set |

Any other key (health checks, the dormant evaluator lane) runs at the AI's usual `level`.

`slip_fix` is optional. When it is not set, a repair POST runs at its step's level, as today.

### 4.4 Choosing the level per call

`withPreviewProviderCallPolicy` (packages/providers/src/preview-test.ts) already overwrites every request's level. It
now:
1. computes the step (§4.3);
2. looks the level up as: the step's override, else the AI's `level`, else the row's `defaultEffort`;
3. sends that level. `default` becomes `THINKING_LEVEL_DEFAULT_ONLY`, so the gateway sends no member.

When a `slip_fix` level is set, the request also carries an optional `repairThinkingLevel`. The gateway
(`OpenAICompatibleProviderGateway.call`) resolves both levels once, before any POST. Each attempt then uses:
- the first level for the first POST;
- the repair level for a patch or full re-ask POST.

Each attempt's ledger row records the level it ran at, as `thinking_level`. That column exists today.

`repairThinkingLevel` absent means today's behaviour, everywhere and on every lane.

The incoming-level rule is unchanged: the preview still refuses a request that asks for its own level other than "high"
or none.

On the preview, the gateway takes its thinking control from the reviewed row's menu, through
`previewTargetGatewayControls`, not from the target's single declared level. This means:
- the server's `PROVIDER_DISCOVERY_TARGETS_JSON`, the sealed provider sets and `previewTargetJsonRow` stay exactly as
  they are, and no target file or register version changes;
- `assertPreviewProviderTargets` keeps requiring today's declaration;
- Anthropic's `ANTHROPIC_EFFORT_LEVELS` widens to low, medium, high.

### 4.5 The gate

The gate cannot see which step a call is for; its request carries only the body. It checks that the body's level is on
that model's menu:
- **DeepInfra `body_valid`:** if `reasoning_effort` is present, its value must be on the menu; if it is absent, the
  menu must hold `default`.
- **Anthropic `body_valid`:** if `output_config` is present, it is exactly `{"effort": <menu word>}`; if absent, the
  menu must hold `default` (no Anthropic row does).
- **`row_reviewed` (preview_budget_authority.py):** accepts a menu tuple whose items are distinct, drawn from
  None/'none'/'low'/'medium'/'high', in a non-empty tuple.
- **The probe body:** sends the row's default level, as today.
- **The day ledger's `requested_effort`:** now records the level the BODY carried: 'default', 'none', 'low', 'medium'
  or 'high'. Today it records the row's single level ('high', or 'none' for no member). Any reader of that field is
  updated in the same change.

Money is unchanged. A reservation is input bytes plus the row's `output_bound` (32,768) at list price, whatever the
level. A lower level only settles lower.

The app's guarded fetch (`deepInfraBodyAccepted`, `anthropicBodyAccepted`) applies the same menu rule, so the app never
sends a body its gate would refuse.

### 4.6 Records

- The app ledger's per-attempt `thinking_level` already exists and needs no change.
- Haiku's thinking tokens become readable. `reportedReasoningTokens` also reads Anthropic's
  `usage.output_tokens_details.thinking_tokens`, so `raw_artifact.thinking_tokens` is filled for Haiku instead of NULL.
  Nothing else in usage or billing changes: `output_tokens` already includes thinking.

### 4.7 Estimate and reservations

The start-of-debate estimate (`apps/api/src/preview-budget-estimate.ts`) and every per-call reservation depend on
`max_tokens` and list prices only, not on the level. A lower level makes real spend smaller than the estimate. No
change is needed. A unit test pins that the estimate is the same with and without a `thinking_levels` table.

### 4.8 The practice tool

- **`--levels`:** `practice formats --levels "<model>=<level>[,<level>…];<model>=…"`. It runs the same jobs for each
  listed level of that model.
  - Each (model, level) gets a config whose `thinking_levels` names that level, through the same
    `withPreviewProviderCallPolicy` the runner uses.
  - A level may appear twice (for example `high,low,high`). Each appearance is its own run ("high#1", "high#2"), which
    measures chance variation.
  - Levels are interleaved per job and sample (A, B, C, then B, C, A, …), so drift in vendor speed or busyness spreads
    over all levels.
  - Each level is checked against the row's menu before anything is sent.
  - Without `--levels`, the run is today's.
- **The report** groups by model and level run, with per-run lines for:
  - jobs answered;
  - right format on the first try;
  - slips fixed by the second try (patch or full re-ask);
  - failed for good;
  - cut off (reply stopped at max_tokens);
  - thinking tokens (median and total);
  - answer time (median and p90);
  - cost per job and total.

  It reads Haiku's thinking tokens as well (`practice-gate-observer.ts`, today `null`).
- **A side-by-side export** (`practice report --side-by-side`) writes one HTML page from a run's samples. For each model
  and chosen jobs (judge panel, answer writer, story writer, reviewer), it shows the same question answered at each
  level in labelled columns, with format status, thinking tokens, time and cost under each answer. Answers are
  escaped text, never markup.

## 5. Out of scope

- The full (hosted) site. Its per-role level comes from the model scorecard (candidate = model + thinking level). This
  table is preview-only, but it uses the same request field (`thinkingLevel`) and ledger column, so handing over later
  is a source swap.
- Top levels (GLM max, Haiku xhigh/max, DeepSeek max, Qwen explicit xhigh).
- Per-level sampling (§4.1).
- Haiku "thinking off".
- Changing the estimate to use typical sizes.

## 6. Test protocol

**Step A — does each level really work?** This step is a few cents.
- One practice formats run with `--lanes PANEL --samples 1` and every new level for every AI.
- Each new level counts as working only when:
  - the vendor accepts it (HTTP 200, usage valid);
  - its reasoning tokens differ clearly from the default's on the same question. "Off" means 0, or close to it.
- A level that is refused or ignored is dropped from the side-by-side run and reported.
- "Off" uses DeepInfra's documented `"none"`. If an AI ignores it, that AI's "off" is reported as not available. A
  template switch (`chat_template_kwargs`) is a separate follow-up, not part of this build.

**Step B — the side-by-side run.**
- Practice formats mode, all nine jobs, `--samples 4` (2 English, 2 Romanian) for each level run.
- Today's level is run twice.
- Planned runs:

  | AI | Level runs |
  |---|---|
  | GLM | high, high, low |
  | DeepSeek | high, high, low, none |
  | Qwen | default, default, medium, low, none |
  | MiMo | default, default, none |
  | Haiku | high, high, medium, low |

  That is 19 runs × 36 jobs, about 680 jobs, minus any level Step A dropped.
- Busy waits follow the practice rules: 60 s first, a 30-minute cap per model.
- Pass bar per run, from the practice rules: a slip fixed by the second try is a warning. A failure is a step failed
  for good, or more than 1 in 10 slips.
- **The noise band:** for each metric, the gap between today's level run 1 and run 2. A lower level is reported as
  better or worse only where the gap to today's level is clearly larger than that band. Otherwise it is reported as
  "same within chance".
- **Budget:** the owner's standing test budget, $5 DeepInfra and $1 Haiku for the testing day, counting what other
  sessions already spent that day (read from both gates' day spend before starting). The run stops before the day's
  total passes $4.75 / $0.95. Expected spend is about $1.5–2.5 DeepInfra and $0.2–0.4 Haiku.
- **Output:**
  - the report table;
  - the labelled side-by-side page, published as a private page for the owner;
  - a recommendation per AI and step, which the owner decides on.

## 7. Rollout

1. **Code:** TDD on every unit. Before the PR, run the Python gate suites, the providers and practice unit tests,
   typecheck and the CI gate, one heavy command at a time. Then merge the latest `origin/dev`, open a PR to dev, and turn
   Auto-fix on. The PR is not merged without the owner's yes.
2. **Gate update on the server** (owner pre-approved), following `deploy/preview-gate/v3/README.md` §"row change":
   - install the two gate files from this branch;
   - write each gate's GO again with the new `bridge_sha256` / `helper_sha256`;
   - stop, restart, activate both gates;
   - send each gate's probe.

   Batch rules:
   - Every batch uses `set -euo pipefail` and keeps the runbook's guards verbatim. It stops at the first unexpected
     result and tells the owner.
   - Before stopping a gate, its in-flight list must be empty, so no running debate loses a call.
   - The new gate accepts every body the old one did, so the API and runner already on the server keep working without
     a restart.
3. **Practice:** run Step A, then Step B (§6), with the setting absent on the server.
4. **Owner pick:** the owner picks from the report. On their yes, the picks go into the server setting with an API and
   runner restart, then one practice debate with all AIs must pass before the owner is told it is live.

**Rollback:**
- Remove `thinking_levels` from the setting and restart: every request returns to today's.
- The gate's wider menus need no rollback, since today's bodies stay valid. To go back fully, reinstall the r14 gate
  files with their GO hashes.

**Coordination with r14:**
- This branch is based on the r14 release candidate.
- If the server's gate files differ from r14's when the deploy starts, the deploy stops and the owner is told. The
  release owner decides the order.

## 8. Risks

- **A vendor 4xx on an unsupported level.** The gate may treat it as a charged failure and halt. Step A runs one call
  per level, and the standing permission covers reopening within budget. The README's reopen checks apply.
- **GLM busy** (about 30% answer rate seen on 2026-10-12) can stretch Step B to several hours. A busy model with at
  least one accepted answer per run is reported with its counts, and with zero answers it is NOT_PROVEN.
- **Haiku's prompt cache.** The cached system prefix may be keyed by the level, so per-step levels can split the cache.
  The practice report already shows cache use, and it is part of the picture before a pick.
- **The step cannot be checked at the gate.** A compromised app could send any menu level for any step. That costs no
  more than today, because reservations are level-independent.
