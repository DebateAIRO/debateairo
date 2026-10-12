# Owner-Chosen Thinking Effort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner choose each preview AI's thinking level, per AI and per step, inside reviewed menus that the
spending gate also enforces. Give the practice tool a side-by-side `--levels` run so the choice is measured.

**Architecture:**
- **The menus.** Each reviewed model row carries a reviewed menu of level words. The app (TypeScript) and the gate
  (Python) hold the same menu, and parity fixtures pin the two copies together.
- **The setting.** An optional `thinking_levels` table in `PREVIEW_PROVIDER_TEST_CONFIG_JSON` picks the levels.
- **The choice per call.** The preview call policy maps each call's call-site key to a step, picks the level and sends
  it. A repair POST can run at its own "slip_fix" level.
- **The gate** checks only that the level is on the menu.
- **The practice tool** runs the same jobs at several levels and writes a labelled side-by-side page.

**Tech Stack:**
- TypeScript (Node 26, vitest 5), from `dialectical-engine/`;
- Python 3 stdlib unittest for the gate (`/usr/bin/python3`);
- pnpm workspace packages `@debateai/providers` and `@debateai/kernel`.

**Spec:** `dialectical-engine/docs/superpowers/specs/2026-10-12-thinking-effort-design.md`. Read it first; every task
argues from it.

## Global Constraints

- **Run from the engine folder.** Run every command from `dialectical-engine/` in the worktree
  `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/thinking-effort`.
  - Unit test: `pnpm exec vitest run tests/unit/<file>`.
  - Python gate tests run through `tests/unit/preview-budget-authority-json-mode.test.ts`, or directly with
    `/usr/bin/python3 tests/unit/<file>_test.py -v`.
- **With no `thinking_levels` key, nothing changes.** Every request body, every recorded level and every boot check is
  byte for byte today's. This is the safety property of the whole plan.
- **Level words, exactly:** `default`, `none`, `low`, `medium`, `high`.
  - `default` = send no effort member.
  - In the gate's Python the menu holds `None` for `default`. The gate's records and the parity fixtures write it as the
    string `"default"`.
- **Menus, exactly** (the first entry is the row's default, which is today's request):
  - GLM-5.3-Flash `high, low`
  - DeepSeek-V4.1-Flash `high, low, none`
  - MiMo-V2.6-Pro `default, none`
  - Qwen3.8-Flash `default, low, medium, none`
  - claude-haiku-5-5 `high, medium, low`
- **Step names, exactly:** `opening`, `pros_cons`, `cross_exchange`, `judge_panel`, `reviewer`, `answer_writer`,
  `answer_checker`, `story_writer`, `story_checker`, `slip_fix`.
- **Error codes:**
  - a bad table is `PREVIEW_THINKING_LEVELS_INVALID:<detail>`;
  - a bad row menu is `PREVIEW_MODEL_ROW_EFFORTS_INVALID`.
- **Machine rules:**
  - Never read keys or secret files, never touch the server, never queue task chips.
  - One heavy command at a time (typecheck, the CI gate, a whole-directory vitest run). Before one, check
    `pgrep -f "vi""test[.]mjs run"` shows at most one other run.
  - The tool shell is zsh: quote globs, and spell out arguments.
- **Comments** follow the repo's style: a plain-words doc comment on every exported thing, citing "spec 2026-10-12
  §n". Do not reflow untouched code.
- **Shipped files:** a new file under `packages/` must be added in sorted order to
  `tests/support/shipped-corpus.manifest.txt`. Run `pnpm exec vitest run tests/architecture` to find the manifest test.
  Tools under `tools/` are not shipped.
- **Commits** end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A literal `reasoning_effort: "default"` (or `output_config.effort: "default"`) in a body must be refused** by both
   the app's guarded fetch and the gate. "default" means "member absent", never a wire value. (Task 1 test.)
2. **The legacy five-key config plus `thinking_levels` must parse.** The UI-roster stage check must accept it too,
   because the live server may still carry the legacy form. (Task 2 test.)
3. **The preview's one 60-second resend after an unbilled refusal must carry the same levels as the first send**, so
   the `send()` closure must compute the levels once. (Task 3 test.)
4. **Repair POSTs use `slip_fix` on BOTH repair paths:** the story repair and the all-steps format repair, patch and
   full re-ask. (Task 3 test.)
5. **A seat-suffixed key still maps to its step.** For example, `PANEL:root:preview:mimo-v2-6-pro:seat:runnerUp` maps
   to `judge_panel`. (Task 2 test.)

---

### Task 1: Reviewed level menus on both sides (app rows, gate rows, parity, body checks)

**Files:**
- Modify: `packages/providers/src/preview-models.ts`
  - row type `PreviewModelRow` (~line 86), `RowInput` (~124), `row()` (~133-170), the five rows (~179-210),
    `previewTargetJsonRow` (~283-293);
  - add the exported `PREVIEW_EFFORT_WORDS` / `PreviewEffort`.
- Modify: `packages/providers/src/preview-test.ts`
  - `assertPreviewProviderTargets` (~175-177), `previewProbeControls` (~213-217);
  - the two effort reads in `withPreviewProviderCallPolicy` (~391-407), keeping today's behaviour for now;
  - `deepInfraBodyAccepted` (~436-452), `anthropicBodyAccepted` (~480-500).
- Modify: `packages/providers/src/anthropic-messages.ts:40-46`: `ANTHROPIC_EFFORT_LEVELS` becomes
  `["low", "medium", "high"]`, and its comment.
- Modify: `packages/providers/ops/preview_budget_helper.py`
  - the `ModelRow` comment and field (~380-385);
  - the DeepInfra rows (~459-470), plus `body_valid` (~490-515) and `probe_body` (~540-546);
  - the Anthropic rows, `body_valid` (~766-790) and the probe body (~945-950);
  - add `effort_words` and `body_effort` to both profiles.
- Modify: `packages/providers/ops/preview_budget_authority.py`
  - `row_reviewed` (~404-413): add `efforts_reviewed`;
  - the ledger entry's `requested_effort` (~983);
  - any other `row.effort` read: `git grep -n "\.effort" packages/providers/ops`, including the probe's `sent.effort`
    near ~1444.
- Modify: `tests/unit/fixtures/preview-model-rows.json` and `tests/unit/fixtures/preview-model-rows-anthropic.json`:
  `"schema": "preview-model-rows-v2"`, `"effort"` becomes `"efforts"`, and the `about` text.
- Modify: `tests/unit/preview_budget_authority_fixture.py` (`ROWS` carries the effort; use the menu tuple).
- Modify tests:
  - `tests/unit/preview-multi-model.test.ts`, `tests/unit/preview-anthropic-gate.test.ts`;
  - `tests/unit/preview_budget_authority_v3_test.py`, `tests/unit/preview_budget_authority_anthropic_test.py`;
  - `tests/unit/provider-preview-readiness.test.ts:26` (the "medium refused" assertion targets the config's
    `requested_thinking_level`; keep it, it is still refused there);
  - `tests/unit/provider-anthropic-messages.test.ts` (low/medium now accepted; xhigh and max still refused);
  - the "Ran N tests" pins in `tests/unit/preview-budget-authority-json-mode.test.ts` for every Python file you add
    tests to.
- Modify docs: `deploy/preview-gate/v3/README.md` and `deploy/preview-gate/v3/README-anthropic.md`. Wherever the rows
  table shows the effort, show the menu instead, and say: "a menu change is a reviewed row change (new helper hash, GO
  rewrite, restart)".

**Interfaces:**
- Produces, in `preview-models.ts` (exported through `packages/providers/src/index.ts`, which re-exports
  preview-models; check):
  ```ts
  /** Spec 2026-10-12 §4.1: the thinking-level words used everywhere (setting, app, gate, records). */
  export const PREVIEW_EFFORT_WORDS = Object.freeze(["default", "none", "low", "medium", "high"] as const);
  export type PreviewEffort = typeof PREVIEW_EFFORT_WORDS[number];
  // On PreviewModelRow (replacing `effort`):
  //   efforts: readonly PreviewEffort[];   // the reviewed menu, first = defaultEffort
  //   defaultEffort: PreviewEffort;         // what the row sends when the owner's setting names no level (today's)
  ```
- Produces, in the Python helper:
  - `ModelRow(... output_bound, efforts, json_object, sampling)`. `efforts` is a tuple; `None` means default.
  - `profile.effort_words`, `profile.body_effort(body)` (returns `None` when no member).
- Later tasks rely on `row.efforts`, `row.defaultEffort`, `PreviewEffort` and `ANTHROPIC_EFFORT_LEVELS`.

- [ ] **Step 1: Write the failing TypeScript tests** (add to `tests/unit/preview-multi-model.test.ts`)

```ts
describe("reviewed thinking-level menus (spec 2026-10-12 §4.1)", () => {
  it("each row carries its menu, first entry = default = today's request", () => {
    expect(Object.fromEntries(PREVIEW_MODEL_ROWS_ALL.map(row => [row.model, [row.efforts, row.defaultEffort]]))).toEqual({
      [GLM]: [["high", "low"], "high"],
      [DEEPSEEK]: [["high", "low", "none"], "high"],
      [MIMO]: [["default", "none"], "default"],
      [QWEN]: [["default", "low", "medium", "none"], "default"],
      "claude-haiku-5-5": [["high", "medium", "low"], "high"]
    });
  });
  it("the guarded fetch accepts exactly the menu, and 'default' only as an absent member", async () => {
    const accepted = [
      { model: GLM, reasoning_effort: "low" }, { model: DEEPSEEK, reasoning_effort: "none" },
      { model: MIMO, ...MIMO_SAMPLING, reasoning_effort: "none" }, { model: MIMO, ...MIMO_SAMPLING },
      { model: QWEN, ...QWEN_SAMPLING, reasoning_effort: "medium" }, { model: QWEN, ...QWEN_SAMPLING }
    ];
    const refusedBodies = [
      { model: GLM, reasoning_effort: "medium" }, { model: GLM, reasoning_effort: "max" }, { model: GLM, reasoning_effort: "none" },
      { model: GLM }, { model: DEEPSEEK, reasoning_effort: "default" }, { model: MIMO, ...MIMO_SAMPLING, reasoning_effort: "low" },
      { model: QWEN, ...QWEN_SAMPLING, reasoning_effort: "high" }, { model: DEEPSEEK, reasoning_effort: null }
    ];
    for (const body of accepted) {
      const { executions, post } = recordingFetch();
      await post({ ...body, max_tokens: 8, messages });
      expect(executions, JSON.stringify(body)).toHaveLength(1);
    }
    for (const body of refusedBodies) {
      const { executions, post } = recordingFetch();
      await expect(post({ ...body, max_tokens: 8, messages }), JSON.stringify(body)).rejects.toThrow();
      expect(executions).toHaveLength(0);
    }
  });
  it("targets and probes keep today's single level (no server file changes)", () => {
    expect(previewTargetJsonRow("preview:deepseek-v4-1-flash")).toMatchObject({ thinking_parameter: "reasoning_effort", thinking_levels: ["high"] });
    expect(previewTargetJsonRow("preview:qwen-3-8-flash")).not.toHaveProperty("thinking_parameter");
    expect(previewProbeControls({ model: GLM })).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
    expect(previewProbeControls({ model: MIMO })).toEqual({ tokenCeiling: 8192 });
  });
});
```

Notes for the implementer:
- `PREVIEW_MODEL_ROWS_ALL` is the package's `PREVIEW_MODEL_ROWS`. The file renames the DeepInfra-only list locally, so
  import the full list under an alias.
- Define `MIMO_SAMPLING = { temperature: 1.0, top_p: 0.95 }` beside `QWEN_SAMPLING`.
- Use the file's existing `recordingFetch`. If the existing refusal test for `reasoning_effort: "medium"` on DeepSeek
  (~line 202) still holds, keep it.

In `tests/unit/preview-anthropic-gate.test.ts`, the "effort low" refusal case (~292) moves to an accepted list; add
refusals for `"xhigh"`, `"max"`, `"none"`, `"default"`, and a body with no `output_config`. Update the parity type and
comparison (~53, ~87) to `efforts`.

- [ ] **Step 2: Write the failing Python tests** (add a test class to `tests/unit/preview_budget_authority_v3_test.py`;
  mirror it in the Anthropic file for Haiku)

```python
class ThinkingLevelMenus(unittest.TestCase):
    """Spec 2026-10-12 section 4.5: the gate accepts exactly each row's reviewed menu."""

    def base(self, model, **members):
        row = DEEPINFRA.rows[model]
        payload = {'model': model, 'max_tokens': 8, 'messages': [{'role': 'user', 'content': 'x'}]}
        payload.update(dict(row.sampling or ()))
        payload.update(members)
        return payload, row

    def test_menus_are_the_reviewed_ones(self):
        self.assertEqual({model: row.efforts for model, row in DEEPINFRA.rows.items()}, {
            MODEL: ('high', 'low'), DEEPSEEK: ('high', 'low', 'none'), MIMO: (None, 'none'), QWEN: (None, 'low', 'medium', 'none')})

    def test_every_menu_level_is_accepted_and_nothing_else(self):
        for model, row in DEEPINFRA.rows.items():
            for word in ('none', 'low', 'medium', 'high', 'max', 'xhigh', 'default', 'minimal'):
                payload, _ = self.base(model, reasoning_effort=word)
                with self.subTest(model=model, word=word):
                    self.assertEqual(DEEPINFRA.body_valid(payload, row), word in row.efforts)
            payload, _ = self.base(model)
            with self.subTest(model=model, word='absent'):
                self.assertEqual(DEEPINFRA.body_valid(payload, row), None in row.efforts)
            for bad in (None, 1, True, ['low'], {'effort': 'low'}):
                payload, _ = self.base(model, reasoning_effort=bad)
                with self.subTest(model=model, bad=repr(bad)):
                    self.assertFalse(DEEPINFRA.body_valid(payload, row))

    def test_row_review_refuses_a_malformed_menu(self):
        row = DEEPINFRA.rows[MODEL]
        for efforts in ((), ('high', 'high'), ('ultra',), 'high', None, ['high']):
            with self.subTest(efforts=repr(efforts)):
                self.assertFalse(bridge.row_reviewed(DEEPINFRA, MODEL, row._replace(efforts=efforts)))
        self.assertTrue(bridge.row_reviewed(DEEPINFRA, MODEL, row))

    def test_the_probe_sends_the_rows_default(self):
        self.assertEqual(DEEPINFRA.probe_body(DEEPINFRA.rows[DEEPSEEK])['reasoning_effort'], 'high')
        self.assertNotIn('reasoning_effort', DEEPINFRA.probe_body(DEEPINFRA.rows[QWEN]))

    def test_body_effort_names_the_level_a_body_carries(self):
        self.assertEqual(DEEPINFRA.body_effort({'reasoning_effort': 'low'}), 'low')
        self.assertIsNone(DEEPINFRA.body_effort({}))
```

Also add a test that a reserved entry's `requested_effort` records the body's level (`'low'` for a GLM low body,
`'default'` for a MiMo body without the member). Use the file's existing reserve helper, as the test near ~337 does,
and update that test's expectation (`effort or 'none'` becomes the body's word, or `'default'`). Anthropic file:
- Haiku menu `('high', 'medium', 'low')`;
- an absent `output_config` is refused;
- `{"effort": "none"}` and `{"effort": "default"}` are refused;
- `AnthropicProfile.effort_words == ('low', 'medium', 'high')`.

- [ ] **Step 3: Run both test sets and watch them fail**

Run: `pnpm exec vitest run tests/unit/preview-multi-model.test.ts tests/unit/preview-anthropic-gate.test.ts`
Expected: FAIL (`efforts` undefined).

Run: `/usr/bin/python3 tests/unit/preview_budget_authority_v3_test.py -v 2>&1 | tail -5`
Expected: FAIL / AttributeError `efforts`.

- [ ] **Step 4: Implement the TypeScript side**

In `preview-models.ts`:

```ts
/**
 * Spec 2026-10-12 §4.1: the thinking-level words, the same in the owner's setting, the app, the gate and the records.
 * "default" sends no effort member at all (the vendor's own default); "none" asks DeepInfra to switch thinking off;
 * "low" / "medium" / "high" are DeepInfra's `reasoning_effort` or Anthropic's `output_config.effort`.
 */
export const PREVIEW_EFFORT_WORDS = Object.freeze(["default", "none", "low", "medium", "high"] as const);
export type PreviewEffort = typeof PREVIEW_EFFORT_WORDS[number];
```

Replace the row field docs and `effort` with:

```ts
  /**
   * Spec 2026-10-12 §4.1: the reviewed thinking-level menu, only levels the model's maker documents (GLM has no
   * "medium": an unknown word runs its maximum). The first entry is `defaultEffort`. The gate holds the same menu.
   */
  efforts: readonly PreviewEffort[];
  /** The level this row runs at when the owner's setting names none: exactly today's request. */
  defaultEffort: PreviewEffort;
```

In `RowInput`, `effort: "high" | null` becomes `efforts: readonly PreviewEffort[]`. In `row()`, before building:

```ts
  const efforts = input.efforts;
  if (efforts.length === 0 || new Set(efforts).size !== efforts.length
    || efforts.some(word => !(PREVIEW_EFFORT_WORDS as readonly string[]).includes(word))
    || (provider === "anthropic" && efforts.some(word => word === "default" || word === "none"))) {
    throw new TypeError("PREVIEW_MODEL_ROW_EFFORTS_INVALID");
  }
```

Build the row with `efforts: Object.freeze([...efforts]), defaultEffort: efforts[0]!`. Destructure `efforts` out of
`plain` the way `sampling` is. Rows:
- GLM `efforts: ["high", "low"]`
- DeepSeek `["high", "low", "none"]`
- MiMo `["default", "none"]`
- Qwen `["default", "low", "medium", "none"]`
- Haiku `["high", "medium", "low"]`

Add one comment line per row citing the maker's documented levels (spec §2 table).

`previewTargetJsonRow` emits today's single level:

```ts
    ...(reviewed.defaultEffort === "default" ? {} : { thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze([reviewed.defaultEffort]) }),
```

In `preview-test.ts`:
- `assertPreviewProviderTargets` compares against `reviewed.defaultEffort === "default"` / `reviewed.defaultEffort`
  exactly as it compared `reviewed.effort === null` / `reviewed.effort`.
- `previewProbeControls` returns `thinkingLevel: reviewed.defaultEffort` unless it is `"default"`. Widen its return
  type to `thinkingLevel?: string`.
- `withPreviewProviderCallPolicy`: replace `reviewed.effort === null` with `reviewed.defaultEffort === "default"`
  (both places). Behaviour must not change in this task.

The body checks:

```ts
/** Spec 2026-10-12 §4.5: a body's effort is on the row's menu; "default" only as an absent member, never a wire word. */
function effortOnMenu(present: boolean, value: unknown, reviewed: PreviewModelRow): boolean {
  return present
    ? typeof value === "string" && value !== "default" && (reviewed.efforts as readonly string[]).includes(value)
    : reviewed.efforts.includes("default");
}
```

- `deepInfraBodyAccepted`: `required` lists `reasoning_effort` iff `Object.hasOwn(body, "reasoning_effort")`. The old
  equality check becomes `effortOnMenu(Object.hasOwn(body, "reasoning_effort"), body.reasoning_effort, reviewed)`.
- `anthropicBodyAccepted`: `required` lists `output_config` iff present. The check becomes
  `(hasEffort ? isPlainObject(effort) && Object.keys(effort).length === 1 && effortOnMenu(true, effort.effort, reviewed) : effortOnMenu(false, undefined, reviewed))`.

Update both functions' doc comments.

`anthropic-messages.ts`:

```ts
/**
 * The thinking levels this wire can carry, as `output_config.effort` (spec 2026-10-12 §4.4: the reviewed Haiku menu).
 * Claude Haiku 5.5 also has xhigh and max; they are not reviewed, so they are refused before anything is sent.
 */
export const ANTHROPIC_EFFORT_LEVELS = Object.freeze(["low", "medium", "high"] as const);
```

- [ ] **Step 5: Implement the Python side**

In `preview_budget_helper.py`:
- Rename the `ModelRow` field `effort` to `efforts`, and rewrite its comment: a non-empty tuple of distinct words from
  the profile's `effort_words`, where `None` = no member at all, and the first element is the app's default.
- Rows: `('high', 'low')`, `('high', 'low', 'none')`, `(None, 'none')`, `(None, 'low', 'medium', 'none')`.
- `DeepInfraProfile.effort_words = (None, 'none', 'low', 'medium', 'high')`.
- `body_valid`: replace the effort handling with:

```python
        effort_member = 'reasoning_effort' in body
        fields = {'model', 'max_tokens', 'messages'} | ({'reasoning_effort'} if effort_member else set()) | set(sampling)
        # ... unchanged extra / response_format checks ...
        # Spec 2026-10-12 section 4.5: the level is on the row's reviewed menu; no member only where the menu holds None.
        if effort_member:
            if not (isinstance(body['reasoning_effort'], str) and body['reasoning_effort'] in row.efforts):
                return False
        elif None not in row.efforts:
            return False
```

- Add `body_effort`:

```python
    def body_effort(self, body):
        """The level a body carries (spec 2026-10-12 section 4.5): its reasoning_effort, or None for no member."""
        value = body.get('reasoning_effort') if isinstance(body, dict) else None
        return value if isinstance(value, str) else None
```

- `probe_body`: `if row.efforts[0] is not None: body['reasoning_effort'] = row.efforts[0]`.
- Anthropic:
  - `effort_words = ('low', 'medium', 'high')`; Haiku row `('high', 'medium', 'low')`.
  - `body_valid` requires `output_config` iff present. When present it must be exactly `{'effort': <str in row.efforts>}`;
    when absent the menu must hold `None`, which it never does.
  - `body_effort` returns `body['output_config']['effort']` when it is a dict holding a str, else `None`.
  - The probe body sends `row.efforts[0]`.

In `preview_budget_authority.py`:

```python
def efforts_reviewed(profile, efforts):
    """Spec 2026-10-12 section 4.5: a non-empty tuple of distinct words from the profile's effort_words."""
    words = getattr(profile, 'effort_words', ())
    return (type(efforts) is tuple and 1 <= len(efforts) <= len(words) and len(set(efforts)) == len(efforts)
            and all(word in words for word in efforts))
```

- `row_reviewed` uses `efforts_reviewed(profile, getattr(row, 'efforts', None))` in place of
  `row.effort in ('high', None)`.
- The ledger entry records `'requested_effort': effort_word(profile.body_effort(body))`, with
  `effort_word = lambda value: 'default' if value is None else value`. Find the parsed body variable in that function;
  the request body is parsed before `body_valid` runs.
- Fix every other `row.effort` / `sent.effort` read the same way (the probe records the default it sent).
- Fixture files: `"efforts": ["high", "low"]` (with `"default"` for `None`), `"schema": "preview-model-rows-v2"`, and
  the `about` text: replace the "effort null means…" sentence with the menu meaning.
- The Python parity test compares `['default' if word is None else word for word in row.efforts]` with the fixture.
- `preview_budget_authority_fixture.py` `ROWS` holds the tuple.

- [ ] **Step 6: Run everything this task touched**

Run: `pnpm exec vitest run tests/unit/preview-multi-model.test.ts tests/unit/preview-anthropic-gate.test.ts tests/unit/provider-anthropic-messages.test.ts tests/unit/provider-preview-readiness.test.ts tests/unit/preview-budget-authority-json-mode.test.ts`
Expected: PASS. Bump the "Ran N tests" pins to the new counts that the Python runs print.

Then: `git grep -n "\.effort\b\|effort:" -- '*.ts' '*.py' | grep -v docs/`
Expected: no stale reads of the old field (wire bodies like `output_config: { effort: ... }` are fine).

Then: `pnpm run typecheck`. This is a heavy command; run it alone.
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A packages/providers tests/unit deploy/preview-gate
git commit -m "Preview: reviewed thinking-level menus on the app and gate rows (spec 2026-10-12 §4.1, §4.5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The owner's setting: `thinking_levels`, step names, level lookup

**Files:**
- Create: `packages/providers/src/preview-thinking.ts`.
- Modify: `packages/providers/src/index.ts`. Export it the same way `preview-test.ts` is exported; check the file's
  export list.
- Modify: `packages/providers/src/preview-test.ts`: the `PreviewProviderTestConfig` type (~45-53) and
  `parsePreviewProviderTestConfig` (~66-97).
- Modify: `deploy/preview-auth-dev/v1/environment.mjs:25-46`: `uiRosterMatchesApiConfig` treats `thinking_levels` as an
  optional key on both forms.
- Modify: `tests/support/shipped-corpus.manifest.txt`: add `packages/providers/src/preview-thinking.ts` in sorted order.
- Modify docs: the document that explains `PREVIEW_PROVIDER_TEST_CONFIG_JSON` (find it with
  `git grep -n "requested_thinking_level" -- '*.md'`; likely `deploy/preview-release/v1/README.md` and/or
  `deploy/preview-auth-dev/v1/README.md`). Add the optional `thinking_levels` key: its shape, the level words, the step
  names, "absent = today's", and "a bad table stops the API and runner at boot".
- Test: create `tests/unit/preview-thinking-levels.test.ts`. Extend `tests/unit/preview-auth-dev-environment.test.ts`
  (the `uiRosterMatchesApiConfig` table near line 63).

**Interfaces:**
- Consumes: `PreviewEffort`, `PreviewModelRow`, `previewModelRow` (Task 1); `debateRoleFromCallSiteKey`,
  `THINKING_LEVEL_DEFAULT_ONLY` (`@debateai/kernel`).
- Produces (all exported from `@debateai/providers`):
  ```ts
  export const PREVIEW_THINKING_STEPS: readonly ["opening","pros_cons","cross_exchange","judge_panel","reviewer","answer_writer","answer_checker","story_writer","story_checker","slip_fix"];
  export type PreviewThinkingStep = typeof PREVIEW_THINKING_STEPS[number];
  export type PreviewThinkingChoice = Readonly<{ level?: PreviewEffort; steps?: Readonly<Partial<Record<PreviewThinkingStep, PreviewEffort>>> }>;
  export type PreviewThinkingLevels = Readonly<Record<string, PreviewThinkingChoice>>;
  export const PREVIEW_THINKING_LEVELS_INVALID: "PREVIEW_THINKING_LEVELS_INVALID";
  export function parsePreviewThinkingLevels(value: unknown): PreviewThinkingLevels; // throws TypeError("PREVIEW_THINKING_LEVELS_INVALID:<detail>")
  export function previewThinkingStepOf(request: Readonly<{ callSiteKey: string; lane?: string }>): PreviewThinkingStep | null;
  export function previewThinkingLevelFor(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow, step: PreviewThinkingStep | null): PreviewEffort;
  export function previewSlipFixLevel(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow): PreviewEffort | undefined;
  export function previewThinkingLevelOnRequest(level: PreviewEffort): string; // "default" -> THINKING_LEVEL_DEFAULT_ONLY
  // PreviewProviderTestConfig gains: readonly thinking_levels?: PreviewThinkingLevels;
  ```

- [ ] **Step 1: Write the failing tests** (`tests/unit/preview-thinking-levels.test.ts`)

```ts
/** Spec 2026-10-12 §4.2–§4.3: the owner's thinking-level table, the step names, and the level lookup. */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_THINKING_STEPS, parsePreviewProviderTestConfig, parsePreviewThinkingLevels, previewModelRow,
  previewSlipFixLevel, previewThinkingLevelFor, previewThinkingLevelOnRequest, previewThinkingStepOf
} from "@debateai/providers";
import { THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture" };

describe("the thinking-level table", () => {
  it("names the ten steps", () => {
    expect(PREVIEW_THINKING_STEPS).toEqual(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
      "answer_writer", "answer_checker", "story_writer", "story_checker", "slip_fix"]);
  });
  it("parses a valid table", () => {
    expect(parsePreviewThinkingLevels({ [QWEN]: { level: "low", steps: { story_writer: "medium" } }, [HAIKU]: { level: "medium" } }))
      .toEqual({ [QWEN]: { level: "low", steps: { story_writer: "medium" } }, [HAIKU]: { level: "medium" } });
  });
  it.each([
    ["not an object", []], ["empty", {}], ["unknown model", { "other/model": { level: "low" } }],
    ["off-menu level (GLM has no medium)", { [GLM]: { level: "medium" } }], ["off-menu level (Haiku has no none)", { [HAIKU]: { level: "none" } }],
    ["unknown step", { [GLM]: { steps: { judging: "low" } } }], ["off-menu step level", { [MIMO]: { steps: { reviewer: "low" } } }],
    ["empty entry", { [GLM]: {} }], ["empty steps", { [GLM]: { steps: {} } }], ["extra key", { [GLM]: { level: "low", effort: "low" } }],
    ["non-string level", { [GLM]: { level: 1 } }]
  ])("refuses %s with PREVIEW_THINKING_LEVELS_INVALID", (_name, table) => {
    expect(() => parsePreviewThinkingLevels(table)).toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });
  it("rides in the preview config, both forms, absent = today's", () => {
    const legacy = parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM], thinking_levels: { [GLM]: { level: "low" } } }));
    expect(legacy?.thinking_levels).toEqual({ [GLM]: { level: "low" } });
    const roster = parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM, DEEPSEEK],
      premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN], thinking_levels: { [DEEPSEEK]: { steps: { judge_panel: "none" } } } }));
    expect(roster?.thinking_levels).toEqual({ [DEEPSEEK]: { steps: { judge_panel: "none" } } });
    expect(parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM] }))).not.toHaveProperty("thinking_levels");
    expect(() => parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM], thinking_levels: { [GLM]: { level: "medium" } } })))
      .toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });
});

describe("the step of a call", () => {
  it.each([
    ["JUDGE", "served", "opening"], ["JUDGE:root:0", "served", "opening"], ["JUDGE:critic:root0:r2:p0", "served", "pros_cons"],
    ["JUDGE:defender:root1:r1:p0", "served", "pros_cons"], ["JUDGE:cross-root:0->1", "served", "cross_exchange"],
    ["PANEL:root", "served", "judge_panel"], ["PANEL:root:preview:mimo-v2-6-pro:seat:runnerUp", "served", "judge_panel"],
    ["JUDGE:review:node-1", "served", "reviewer"], ["JUDGE:review:catch-up:node-1", "served", "reviewer"],
    ["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "answer_writer"], ["COMPOSER:SYNTHESIZER:RETRY:2:seat:main", "served", "answer_writer"],
    ["POST_COMPOSE_R9:EVALUATOR:1", "served", "answer_checker"], ["STORY:STORYTELLER:1", "story", "story_writer"],
    ["STORY:CHECKER:2", "story", "story_checker"], ["STORY:STORYTELLER:1", "served", null], ["evaluator.grade-judge-output.v1", "served", null]
  ])("%s on %s -> %s", (callSiteKey, lane, step) => {
    expect(previewThinkingStepOf({ callSiteKey, lane })).toBe(step);
  });
});

describe("the level lookup", () => {
  const table = parsePreviewThinkingLevels({ [DEEPSEEK]: { level: "low", steps: { judge_panel: "none", slip_fix: "low" } },
    [QWEN]: { steps: { story_writer: "medium" } } });
  it("step override, else the AI's level, else the row's default", () => {
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, "judge_panel")).toBe("none");
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, "opening")).toBe("low");
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, null)).toBe("low");
    expect(previewThinkingLevelFor(table, previewModelRow(QWEN)!, "story_writer")).toBe("medium");
    expect(previewThinkingLevelFor(table, previewModelRow(QWEN)!, "reviewer")).toBe("default");
    expect(previewThinkingLevelFor(table, previewModelRow(GLM)!, "judge_panel")).toBe("high");
    expect(previewThinkingLevelFor(undefined, previewModelRow(HAIKU)!, "story_writer")).toBe("high");
  });
  it("slip_fix is read only as the repair level", () => {
    expect(previewSlipFixLevel(table, previewModelRow(DEEPSEEK)!)).toBe("low");
    expect(previewSlipFixLevel(table, previewModelRow(QWEN)!)).toBeUndefined();
    expect(previewSlipFixLevel(undefined, previewModelRow(GLM)!)).toBeUndefined();
  });
  it("'default' travels as DEFAULT_ONLY", () => {
    expect(previewThinkingLevelOnRequest("default")).toBe(THINKING_LEVEL_DEFAULT_ONLY);
    expect(previewThinkingLevelOnRequest("none")).toBe("none");
  });
});
```

In `tests/unit/preview-auth-dev-environment.test.ts`, add table rows proving `uiRosterMatchesApiConfig` accepts a
legacy config and a roster config that each also carry `thinking_levels`, with the same rosters, and still refuses an
unknown extra key. Use the file's existing row format.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/unit/preview-thinking-levels.test.ts tests/unit/preview-auth-dev-environment.test.ts`
Expected: FAIL (missing exports / roster mismatch).

- [ ] **Step 3: Implement `packages/providers/src/preview-thinking.ts`**

```ts
/**
 * The owner's thinking levels on the private preview (spec 2026-10-12 §4.2–§4.4).
 *
 * Plain words: the owner picks how hard each AI thinks, a usual level per AI and, if wanted, a different level for
 * named steps (for example a lighter story writer). Only levels on the AI's reviewed menu (preview-models.ts, the gate
 * holds the same menu) are accepted; anything else stops the app at boot. A model or step the table leaves out runs at
 * its row's default, which is exactly today's request.
 */
import { THINKING_LEVEL_DEFAULT_ONLY, debateRoleFromCallSiteKey } from "@debateai/kernel";
import { previewModelRow, type PreviewEffort, type PreviewModelRow } from "./preview-models.js";

/** Spec 2026-10-12 §4.3: the step names a table may override (slip_fix = a repair POST inside a call). */
export const PREVIEW_THINKING_STEPS = Object.freeze(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
  "answer_writer", "answer_checker", "story_writer", "story_checker", "slip_fix"] as const);
export type PreviewThinkingStep = typeof PREVIEW_THINKING_STEPS[number];
export type PreviewThinkingChoice = Readonly<{ level?: PreviewEffort; steps?: Readonly<Partial<Record<PreviewThinkingStep, PreviewEffort>>> }>;
/** model id -> that AI's choice. */
export type PreviewThinkingLevels = Readonly<Record<string, PreviewThinkingChoice>>;
export const PREVIEW_THINKING_LEVELS_INVALID = "PREVIEW_THINKING_LEVELS_INVALID" as const;

function invalid(detail: string): never { throw new TypeError(`${PREVIEW_THINKING_LEVELS_INVALID}:${detail}`); }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onMenu(row: PreviewModelRow, value: unknown, where: string): PreviewEffort {
  if (typeof value !== "string" || !(row.efforts as readonly string[]).includes(value)) invalid(`level ${where}`);
  return value as PreviewEffort;
}

/** The table as the owner wrote it, checked against every named AI's reviewed menu; throws PREVIEW_THINKING_LEVELS_INVALID. */
export function parsePreviewThinkingLevels(value: unknown): PreviewThinkingLevels {
  if (!isPlainObject(value) || Object.keys(value).length === 0) invalid("table");
  const table: Record<string, PreviewThinkingChoice> = {};
  for (const [model, choice] of Object.entries(value)) {
    const row = previewModelRow(model) ?? invalid(`model ${model}`);
    if (!isPlainObject(choice) || Object.keys(choice).length === 0
      || Object.keys(choice).some(key => key !== "level" && key !== "steps")) invalid(`entry ${model}`);
    const level = choice.level === undefined ? undefined : onMenu(row, choice.level, model);
    let steps: Partial<Record<PreviewThinkingStep, PreviewEffort>> | undefined;
    if (choice.steps !== undefined) {
      if (!isPlainObject(choice.steps) || Object.keys(choice.steps).length === 0) invalid(`steps ${model}`);
      steps = {};
      for (const [step, stepLevel] of Object.entries(choice.steps)) {
        if (!(PREVIEW_THINKING_STEPS as readonly string[]).includes(step)) invalid(`step ${model} ${step}`);
        steps[step as PreviewThinkingStep] = onMenu(row, stepLevel, `${model} ${step}`);
      }
    }
    table[model] = Object.freeze({ ...(level === undefined ? {} : { level }), ...(steps === undefined ? {} : { steps: Object.freeze(steps) }) });
  }
  return Object.freeze(table);
}

/** Spec 2026-10-12 §4.3: the step a call belongs to, from its call-site key (and lane for the story), or null. */
export function previewThinkingStepOf(request: Readonly<{ callSiteKey: string; lane?: string }>): PreviewThinkingStep | null {
  if (request.lane === "story" && /^STORY:STORYTELLER:[1-8]$/u.test(request.callSiteKey)) return "story_writer";
  if (request.lane === "story" && /^STORY:CHECKER:[1-8]$/u.test(request.callSiteKey)) return "story_checker";
  switch (debateRoleFromCallSiteKey(request.callSiteKey)) {
    case "POSITION": return "opening";
    case "SUPPORT_ATTACK": return "pros_cons";
    case "CROSS_EXCHANGE": return "cross_exchange";
    case "JUDGE": return "judge_panel";
    case "REVIEWER": return "reviewer";
    case "ANSWER_WRITER": return "answer_writer";
    case "ANSWER_CHECKER": return "answer_checker";
    default: return null;
  }
}

/** Spec 2026-10-12 §4.4: the step's override, else the AI's usual level, else the row's reviewed default. */
export function previewThinkingLevelFor(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow, step: PreviewThinkingStep | null): PreviewEffort {
  const choice = levels?.[row.model];
  return (step === null ? undefined : choice?.steps?.[step]) ?? choice?.level ?? row.defaultEffort;
}

/** The level a repair POST runs at, when the owner set `slip_fix` for this AI; undefined = the step's own level. */
export function previewSlipFixLevel(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow): PreviewEffort | undefined {
  return levels?.[row.model]?.steps?.slip_fix;
}

/** A level as the request carries it: "default" travels as DEFAULT_ONLY, which the gateway sends as no member. */
export function previewThinkingLevelOnRequest(level: PreviewEffort): string {
  return level === "default" ? THINKING_LEVEL_DEFAULT_ONLY : level;
}
```

Check the kernel's `DebateRole` union names against `packages/kernel/src/debate-roles.ts` and use them exactly. If
`debateRoleFromCallSiteKey` is not re-exported from `@debateai/kernel`'s index, it is (line 454 re-exports
`./debate-roles.js`).

- [ ] **Step 4: Wire the config parser**

In `preview-test.ts`, add `readonly thinking_levels?: PreviewThinkingLevels;` to the type, and a doc line citing
spec §4.2. In `parsePreviewProviderTestConfig`:
- Compute `keys`, `legacy`, `socketKeys` and `baseKeys` over the keys WITHOUT `"thinking_levels"`. For example
  `const own = Object.keys(row).filter(key => key !== "thinking_levels")`, and use `own` wherever `Object.keys(row)`
  was used.
- Add to the frozen config:
  `...(row.thinking_levels === undefined ? {} : { thinking_levels: parsePreviewThinkingLevels(row.thinking_levels) })`.
- `parsePreviewThinkingLevels` throws its own `PREVIEW_THINKING_LEVELS_INVALID:<detail>`. Let it propagate (do not
  wrap it in `refused()`), so the boot error names the problem.

In `environment.mjs`:
- add `const OPTIONAL_TABLE_KEYS=Object.freeze(['thinking_levels']);`;
- compute the legacy comparison over the keys without `thinking_levels`;
- compute the roster comparison over the keys without the socket keys and `thinking_levels`.

Update the JSDoc above `uiRosterMatchesApiConfig` in one sentence.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/unit/preview-thinking-levels.test.ts tests/unit/preview-auth-dev-environment.test.ts tests/unit/preview-multi-model.test.ts tests/unit/provider-preview-readiness.test.ts`
Expected: PASS.

Run: `pnpm exec vitest run tests/architecture`
Expected: PASS. If the shipped-corpus manifest test fails, add the new file in sorted order.

- [ ] **Step 6: Commit**

```bash
git add -A packages/providers deploy/preview-auth-dev tests
git commit -m "Preview: the owner's thinking_levels table, step names and level lookup (spec 2026-10-12 §4.2-§4.3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Each call runs at its chosen level; repair POSTs at the slip_fix level

**Files:**
- Modify: `packages/providers/src/preview-test.ts`: `previewTargetGatewayControls` (~223-228) and
  `withPreviewProviderCallPolicy` (~383-416).
- Modify: `packages/providers/src/index.ts`
  - `ProviderCallRequest`: add `repairThinkingLevel` beside `thinkingLevel`, ~line 190-196.
  - `OpenAICompatibleProviderGateway.call` (~1700-2400): resolve the repair level once, before any POST, and choose
    per attempt.
- Test: create `tests/unit/preview-thinking-policy.test.ts`. Extend `tests/unit/patch-follow-up-gateway.test.ts` (or a
  new `tests/unit/provider-repair-thinking-level.test.ts`) for the gateway part. Extend
  `tests/unit/preview-budget-estimate.test.ts` for the estimate pin.

**Interfaces:**
- Consumes: Task 2's `previewThinkingStepOf`, `previewThinkingLevelFor`, `previewSlipFixLevel`,
  `previewThinkingLevelOnRequest`, and `PreviewProviderTestConfig.thinking_levels`. Task 1's `row.efforts`.
- Produces:
  - `ProviderCallRequest.repairThinkingLevel?: string`;
  - `previewTargetGatewayControls(config, target)` now returns
    `Readonly<{ maxOutputTokens?: number; thinking?: Readonly<{ parameter: "reasoning_effort"; levels: readonly string[] }> }>`.

- [ ] **Step 1: Write the failing policy tests** (`tests/unit/preview-thinking-policy.test.ts`)

Build each gateway exactly as the runner does:
- a fake guarded fetch that records bodies (copy `recordingFetch` from `tests/unit/preview-multi-model.test.ts`, and
  make it answer a valid chat-completions reply);
- `new OpenAICompatibleProviderGateway({ ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target), fetchImplementation, ... })`;
- wrapped in `withPreviewProviderCallPolicy(gateway, config, target, { sleep: async () => undefined })`.

Reuse the request helpers `tests/unit/preview-multi-model.test.ts` uses around line 520-620 (it already builds a
DeepSeek call and checks `reasoning_effort`). Cases:

```ts
it.each([
  // [model, thinking_levels, callSiteKey, lane, expected reasoning_effort member (undefined = absent)]
  [DEEPSEEK, undefined, "PANEL:root", "served", "high"],
  [DEEPSEEK, { [DEEPSEEK]: { level: "low", steps: { judge_panel: "none" } } }, "PANEL:root", "served", "none"],
  [DEEPSEEK, { [DEEPSEEK]: { level: "low", steps: { judge_panel: "none" } } }, "JUDGE", "served", "low"],
  [GLM, { [GLM]: { level: "low" } }, "COMPOSER:SYNTHESIZER:INITIAL:1", "served", "low"],
  [MIMO, undefined, "PANEL:root", "served", undefined],
  [MIMO, { [MIMO]: { level: "none" } }, "PANEL:root", "served", "none"],
  [QWEN, { [QWEN]: { steps: { story_writer: "medium" } } }, "STORY:STORYTELLER:1", "story", "medium"],
  [QWEN, { [QWEN]: { steps: { story_writer: "medium" } } }, "PANEL:root", "served", undefined]
])("%s with %j at %s sends %s", async (model, levels, callSiteKey, lane, expected) => { /* call once, read the one body */ });
```

Add these tests too:
- **Haiku `{level: "medium"}`:** the Anthropic body carries `output_config: {effort: "medium"}`. Use the Anthropic
  gateway setup from `tests/unit/preview-anthropic-gate.test.ts`.
- **Unchanged without a table:** with no table, the bodies for every reviewed model equal the bodies the existing
  tests pin. Assert that one DeepSeek body is byte-identical to `JSON.stringify` of the old expected body.
- **Review Focus 3 (the unbilled resend):** the fake gate first returns the unbilled 429 the existing retry tests use,
  then 200. Both POSTs carry `reasoning_effort: "low"` under `{ [DEEPSEEK]: { level: "low" } }`.
- **Review Focus 4 (repairs use slip_fix):**
  - A served PANEL call whose first reply fails its content check gets the second POST (patch) with
    `reasoning_effort: "low"` under `{ [DEEPSEEK]: { level: "high", steps: { slip_fix: "low" } } }`. The first POST
    carries "high".
  - The same with no `slip_fix` gives "high" on both.
  - The same on a story storyteller call (story repair).
  - Use the content-check and repair-packet fixtures from `tests/unit/provider-preview-story-repair.test.ts` and
    `tests/unit/patch-follow-up-gateway.test.ts`.
- **The ledger records the level per attempt:** under slip_fix, the recorded rows' `thinkingLevel` are `"high"` then
  `"low"`. Read them through the gateway's `appendLedgerEntry` sink.
- **The incoming-level rule is unchanged:** a request carrying `thinkingLevel: "low"` itself is still refused with
  `PROVIDER_THINKING_LEVEL_UNSUPPORTED`. The table, not the caller, picks.

The estimate pin, in `tests/unit/preview-budget-estimate.test.ts`: compute the file's main estimate twice, once with a
config without `thinking_levels` and once with `{ [DEEPSEEK]: { level: "none" }, [HAIKU]: { level: "low" } }`, and
expect equal results. Use whatever estimate entry point the file's existing tests call.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/unit/preview-thinking-policy.test.ts`
Expected: FAIL. The policy still sends `requested_thinking_level`, and "low"/"none" are refused by the target's
single-level control.

- [ ] **Step 3: Implement `previewTargetGatewayControls`**

```ts
/**
 * Contract A §2: on the preview only, max_tokens never exceeds the reviewed row's bound. Spec 2026-10-12 §4.4: and the
 * gateway may set exactly the row's reviewed menu (less "default", which sends nothing), whatever single level the
 * server's target file declares, so the owner's table needs no target-file change. Off the preview nothing is added.
 */
export function previewTargetGatewayControls(
  config: PreviewProviderTestConfig | undefined, target: Readonly<{ model: string }>
): Readonly<{ maxOutputTokens?: number; thinking?: Readonly<{ parameter: "reasoning_effort"; levels: readonly string[] }> }> {
  if (config === undefined) return Object.freeze({});
  const reviewed = previewModelRow(target.model) ?? refused();
  const levels = reviewed.efforts.filter(word => word !== "default");
  return Object.freeze({ maxOutputTokens: reviewed.outputBound,
    ...(levels.length === 0 ? {} : { thinking: Object.freeze({ parameter: "reasoning_effort" as const, levels: Object.freeze([...levels]) }) }) });
}
```

Check that every preview gateway spreads `previewTargetGatewayControls` AFTER `providerTargetGatewayControls`:
- `apps/runner/src/main.ts:324-326`
- `tools/preview-practice/practice-formats.ts:133-134`
- `tools/preview-practice/practice-runner-composition.ts:139-141`

`tests/unit/preview-practice-wiring-drift.test.ts` guards the practice wiring. Run it.

- [ ] **Step 4: Implement the policy**

In `withPreviewProviderCallPolicy`, keep the incoming-level guard exactly as it is after Task 1. Compute the levels
once per call, outside `send`:

```ts
    // Spec 2026-10-12 §4.4: the owner's table picks the level per step (absent = the row's default = today's request).
    const level = previewThinkingLevelOnRequest(previewThinkingLevelFor(config.thinking_levels, reviewed, previewThinkingStepOf(request)));
    const slipFix = previewSlipFixLevel(config.thinking_levels, reviewed);
    const repairLevel = slipFix === undefined || (!storyRepair && !formatRepair) ? undefined : previewThinkingLevelOnRequest(slipFix);
    const send = () => gateway.call({ ...request, thinkingLevel: level,
      ...(repairLevel === undefined ? {} : { repairThinkingLevel: repairLevel }),
      bound, maxAttemptsThisCall: storyRepair || formatRepair ? 2 : 1, attemptScope: "actor",
      ...(formatRepair ? { retryOnlyAfterContentRejection: true } : {}) });
```

Note that `maxAttemptsThisCall: 2` is today's value; the patch path may send a third POST through `remaining`. Keep
whatever the current code sends, and only add the two thinking members. Replace the comment above the old
`thinkingLevel` line. Import the Task 2 functions from `./preview-thinking.js`.

- [ ] **Step 5: Implement the gateway's repair level**

On `ProviderCallRequest` (index.ts ~195), beside `thinkingLevel`:

```ts
  /**
   * Spec 2026-10-12 §4.4 (the owner's `slip_fix`): the thinking level of this call's REPAIR POSTs (the patch follow-up
   * and the full re-ask), when it differs from `thinkingLevel`. Resolved, like `thinkingLevel`, before anything is
   * sent; absent = every POST of the call runs at `thinkingLevel` (today's behaviour on every lane).
   */
  readonly repairThinkingLevel?: string;
```

In `call()`, right after `const thinking = resolveThinkingLevel(...)`:

```ts
    const repairThinking = request.repairThinkingLevel === undefined
      ? thinking : resolveThinkingLevel(request.repairThinkingLevel, this.#options.thinking, request.providerRef);
```

Inside the attempt loop, at the top of each attempt (before the Anthropic body is built):

```ts
      // The first packet (and its length retries) runs at the call's level; a patch or full re-ask at the repair level.
      const attemptThinking = attemptPacket === request.packet ? thinking : repairThinking;
```

Replace every use of `thinking.sent` / `thinking.wire` / `thinking.echoRequired` INSIDE the loop with
`attemptThinking`. That covers:
- the Anthropic body (~1816);
- the OpenAI body spread (~1830);
- `attemptThinkingLevel`'s initial value (~1858);
- the echo checks (~2117-2127);
- the level recorded on the ledger row.

`#patchPacket(..., thinking.sent, ...)` (~2239) builds the NEXT POST, which is a repair, so pass `repairThinking.sent`.
Keep the pre-loop Anthropic packet check (~1741) on `thinking.sent`. Read the loop once fully before editing, so no
use is missed: `grep -n "thinking\." packages/providers/src/index.ts`.

Gateway test (new file `tests/unit/provider-repair-thinking-level.test.ts`):
- Build an `OpenAICompatibleProviderGateway` with
  `thinking: { parameter: "reasoning_effort", levels: ["high", "low"] }` and a fetch whose first reply fails the
  request's `classifyContent`, and whose second passes. Copy the shape from `tests/unit/patch-follow-up-gateway.test.ts`.
- Call with `thinkingLevel: "high", repairThinkingLevel: "low", maxAttemptsThisCall: 2, retryOnlyAfterContentRejection: true`.
- Expect the two bodies' `reasoning_effort` to be `["high", "low"]`, and the two ledger rows' `thinkingLevel` to be
  `["high", "low"]`.
- A `repairThinkingLevel: "max"` (not declared) is refused with `PROVIDER_THINKING_LEVEL_UNSUPPORTED` before any fetch.
- Without `repairThinkingLevel` both are "high".

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run tests/unit/preview-thinking-policy.test.ts tests/unit/provider-repair-thinking-level.test.ts tests/unit/preview-budget-estimate.test.ts tests/unit/patch-follow-up-gateway.test.ts tests/unit/provider-preview-story-repair.test.ts tests/unit/preview-multi-model.test.ts tests/unit/preview-anthropic-gate.test.ts tests/unit/preview-practice-wiring-drift.test.ts`
Expected: PASS.

Then `pnpm run typecheck` (alone).
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A packages/providers tests/unit
git commit -m "Preview: each call runs at the owner's level for its step; repair POSTs at slip_fix (spec 2026-10-12 §4.4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Haiku's thinking tokens are read (app ledger and practice observer)

**Files:**
- Modify: `packages/providers/src/index.ts:1341-1354`: `reportedReasoningTokens` also reads Anthropic's spelling.
- Modify: `tools/preview-practice/practice-gate-observer.ts:197-206`: the Anthropic branch's `reasoningTokens`.
- Test: `tests/unit/provider-anthropic-messages.test.ts` (or the file that tests `reportedReasoningTokens`; find it
  with `git grep -n reportedReasoningTokens tests`), and `tests/unit/preview-practice.test.ts` for the observer.

**Interfaces:**
- Produces: `reportedReasoningTokens(rawUsage)`. It returns the value of
  `completion_tokens_details.reasoning_tokens`, else of `output_tokens_details.thinking_tokens`, else `null`.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads Anthropic's thinking tokens (spec 2026-10-12 §4.6)", () => {
  expect(reportedReasoningTokens({ input_tokens: 10, output_tokens: 500, output_tokens_details: { thinking_tokens: 320 } })).toBe(320);
  expect(reportedReasoningTokens({ input_tokens: 10, output_tokens: 500 })).toBeNull();
  expect(reportedReasoningTokens({ output_tokens_details: { thinking_tokens: -1 } })).toBeNull();
  expect(reportedReasoningTokens({ completion_tokens_details: { reasoning_tokens: 7 } })).toBe(7);
});
```

Then add an end-to-end check through the Anthropic gateway path. Use the fake Anthropic reply helpers in
`tests/unit/provider-anthropic-messages.test.ts`, with a usage block carrying `output_tokens_details.thinking_tokens: 320`.
The persisted raw artifact's `thinkingTokens` must be 320; today it is null. First confirm which usage object the
gateway passes to `reportedReasoningTokens` on the Anthropic wire (index.ts ~1958-2043). If it passes the MAPPED usage
(`anthropicUsageAsEngineUsage`), pass the raw vendor usage instead for this read only. Never change the billing counts.

For the observer, in `tests/unit/preview-practice.test.ts`: feed the observer the Anthropic gate event shape the file
already uses, adding `output_tokens_details: { thinking_tokens: 320 }`, and expect `reasoningTokens: 320`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/unit/provider-anthropic-messages.test.ts tests/unit/preview-practice.test.ts`
Expected: FAIL (null).

- [ ] **Step 3: Implement**

```ts
export function reportedReasoningTokens(rawUsage: unknown): number | null {
  if (typeof rawUsage !== "object" || rawUsage === null || Array.isArray(rawUsage)) return null;
  const usage = rawUsage as Readonly<Record<string, unknown>>;
  // OpenAI's spelling (DeepInfra, the relays), else Anthropic's (spec 2026-10-12 §4.6: Haiku's thinking, which
  // `output_tokens` already includes, so nothing about the charge changes).
  const read = (details: unknown, key: string): number | null => {
    if (typeof details !== "object" || details === null || Array.isArray(details)) return null;
    const value = (details as Readonly<Record<string, unknown>>)[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_USAGE_COUNTER ? value : null;
  };
  return read(usage.completion_tokens_details, "reasoning_tokens") ?? read(usage.output_tokens_details, "thinking_tokens");
}
```

Update its doc comment. In the observer's Anthropic branch:

```ts
      reasoningTokens: typeof row.output_tokens_details === "object" && row.output_tokens_details !== null
        ? count((row.output_tokens_details as Record<string, unknown>).thinking_tokens) : null,
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/provider-anthropic-messages.test.ts tests/unit/preview-practice.test.ts tests/unit/preview-anthropic-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/providers tools/preview-practice tests/unit
git commit -m "Read Haiku's thinking tokens in the ledger and the practice report (spec 2026-10-12 §4.6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Practice `--levels`: the same jobs at several levels, interleaved, reported side by side

**Files:**
- Create: `tools/preview-practice/practice-levels.ts`: parse `--levels`, name the runs, build the per-run config, and
  give the interleaved order.
- Modify: `tools/preview-practice/practice.ts`: add `--levels` to `VALUE_FLAGS`, pass the parsed plan into the formats
  run, and print it in the start banner.
- Modify: `tools/preview-practice/practice-formats.ts`
  - Run each (model, level run) with its own config.
  - Add sample fields `levelRun`, `thinkingLevel`, `reasoningTokens`, `cutOff` and `answerText`.
- Modify: `tools/preview-practice/practice-samples-log.ts`: the log reader accepts the new optional fields, and older
  logs without them still read.
- Modify: `tools/preview-practice/practice-report.ts`: a `levels` block and a markdown table when samples carry
  `levelRun`.
- Modify: `tools/preview-practice/README.md`: a `--levels` section with the Step B command from spec §6.
- Test: create `tests/unit/preview-practice-levels.test.ts`. Extend `tests/unit/preview-practice.test.ts`.

**Interfaces:**
- Consumes: `parsePreviewThinkingLevels`, `previewModelRow`, `PreviewEffort` (Tasks 1–2), and
  `PreviewProviderTestConfig`.
- Produces:
  ```ts
  export type PracticeLevelRun = Readonly<{ model: string; level: PreviewEffort; run: string /* "high#1" */ }>;
  export type PracticeLevelPlan = Readonly<Record<string, readonly PracticeLevelRun[]>>; // model -> its runs, in the given order
  export function parsePracticeLevels(text: string, models: readonly string[]): PracticeLevelPlan; // throws PracticeRefusal("PRACTICE_LEVELS_INVALID", detail)
  export function practiceLevelConfig(config: PreviewProviderTestConfig, run: PracticeLevelRun): PreviewProviderTestConfig;
  export function practiceInterleavedRuns(runs: readonly PracticeLevelRun[], jobIndex: number): readonly PracticeLevelRun[]; // rotate by jobIndex
  // PracticeSample gains (all optional, absent in older logs): levelRun?: string; thinkingLevel?: PreviewEffort;
  //   reasoningTokens?: number | null; cutOff?: boolean; answerText?: string | null
  ```

- [ ] **Step 1: Write the failing tests** (`tests/unit/preview-practice-levels.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { parsePracticeLevels, practiceInterleavedRuns, practiceLevelConfig } from "../../tools/preview-practice/practice-levels.js";
import { parsePreviewProviderTestConfig } from "@debateai/providers";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";

describe("practice --levels (spec 2026-10-12 §4.8)", () => {
  it("names repeated levels as separate runs, in the given order", () => {
    expect(parsePracticeLevels(`${GLM}=high,high,low;${QWEN}=default,none`, [GLM, QWEN, DEEPSEEK])).toEqual({
      [GLM]: [{ model: GLM, level: "high", run: "high#1" }, { model: GLM, level: "high", run: "high#2" }, { model: GLM, level: "low", run: "low#1" }],
      [QWEN]: [{ model: QWEN, level: "default", run: "default#1" }, { model: QWEN, level: "none", run: "none#1" }]
    });
  });
  it.each([
    ["off-menu level", `${GLM}=medium`], ["model not in the run", `${DEEPSEEK}=low`], ["unknown model", "other/model=low"],
    ["empty level list", `${GLM}=`], ["duplicate model", `${GLM}=high;${GLM}=low`], ["garbage", "nonsense"]
  ])("refuses %s", (_name, text) => {
    expect(() => parsePracticeLevels(text, [GLM, QWEN])).toThrow(/PRACTICE_LEVELS_INVALID/u);
  });
  it("each run's config names only that model's level", () => {
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture", free_model_ids: [GLM],
      thinking_levels: { [GLM]: { steps: { story_writer: "low" } } } }))!;
    expect(practiceLevelConfig(config, { model: GLM, level: "low", run: "low#1" }).thinking_levels).toEqual({ [GLM]: { level: "low" } });
  });
  it("rotates the runs per job so drift spreads over every level", () => {
    const runs = parsePracticeLevels(`${GLM}=high,high,low`, [GLM])[GLM]!;
    expect([0, 1, 2, 3].map(index => practiceInterleavedRuns(runs, index).map(run => run.run))).toEqual([
      ["high#1", "high#2", "low#1"], ["high#2", "low#1", "high#1"], ["low#1", "high#1", "high#2"], ["high#1", "high#2", "low#1"]]);
  });
});
```

In `tests/unit/preview-practice.test.ts`, follow the file's existing formats-run harness (its fake ports/gates). Add:
- With `--levels` for one model (`high,low`), every job runs once per level. The samples carry `levelRun`
  (`"high#1"` / `"low#1"`), `thinkingLevel`, `reasoningTokens` (from the fake gate's
  `completion_tokens_details.reasoning_tokens`), `cutOff` (true for a reply with `finish_reason: "length"`) and
  `answerText` (the accepted reply's content, redacted). The bodies sent carry the matching `reasoning_effort`.
- The same question (`questionId`) is used for the same `sample` index at every level.
- Without `--levels`, samples carry none of the new fields, so the logs are unchanged.
- The report's `levels` block, for two runs of one model, lists:
  - `jobs`, `firstTry` (PARSED with no repair), `repaired`, `failed`, `cutOff`;
  - `reasoningMedian`, `reasoningTotal`, `latencyMedianMs`, `latencyP90Ms`, `costPerJobUsd`, `costTotalUsd`;
  - `slipsOverBar` (slips > max(1, floor(answered / 10))).

  The markdown has one table row per model × run.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/unit/preview-practice-levels.test.ts tests/unit/preview-practice.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `practice-levels.ts`**

```ts
/**
 * Preview practice: the same jobs at several thinking levels, side by side (spec 2026-10-12 §4.8).
 *
 * Plain words: `--levels "<model>=high,high,low;<model>=default,none"` asks each listed model every job once per
 * listed level. A level listed twice is run twice ("high#1", "high#2"), which shows how much the results move by
 * chance alone. The runs take turns per job, so a slow or busy hour falls on every level alike.
 */
import { parsePreviewThinkingLevels, previewModelRow, type PreviewEffort, type PreviewProviderTestConfig } from "@debateai/providers";
import { PracticeRefusal } from "./practice-settings.js";

export type PracticeLevelRun = Readonly<{ model: string; level: PreviewEffort; run: string }>;
export type PracticeLevelPlan = Readonly<Record<string, readonly PracticeLevelRun[]>>;

function refuse(detail: string): never { throw new PracticeRefusal("PRACTICE_LEVELS_INVALID", detail); }

export function parsePracticeLevels(text: string, models: readonly string[]): PracticeLevelPlan {
  const plan: Record<string, PracticeLevelRun[]> = {};
  for (const part of text.split(";")) {
    const match = /^([^=;]+)=([a-z,]+)$/u.exec(part.trim());
    if (match === null) refuse(part);
    const [, model, list] = match;
    const row = previewModelRow(model) ?? refuse(`model ${model!}`);
    if (!models.includes(row.model)) refuse(`model not in this run ${row.model}`);
    if (Object.hasOwn(plan, row.model)) refuse(`model twice ${row.model}`);
    const counts = new Map<string, number>();
    plan[row.model] = list!.split(",").map((level) => {
      if (!(row.efforts as readonly string[]).includes(level)) refuse(`level ${row.model} ${level}`);
      const n = (counts.get(level) ?? 0) + 1;
      counts.set(level, n);
      return Object.freeze({ model: row.model, level: level as PreviewEffort, run: `${level}#${String(n)}` });
    });
  }
  return Object.freeze(plan);
}

/** The config one run uses: the server's config with only this model's level (no step overrides: a pure A/B). */
export function practiceLevelConfig(config: PreviewProviderTestConfig, run: PracticeLevelRun): PreviewProviderTestConfig {
  return Object.freeze({ ...config, thinking_levels: parsePreviewThinkingLevels({ [run.model]: { level: run.level } }) });
}

/** The runs in the order job `jobIndex` asks them: rotated by one per job. */
export function practiceInterleavedRuns(runs: readonly PracticeLevelRun[], jobIndex: number): readonly PracticeLevelRun[] {
  const shift = runs.length === 0 ? 0 : jobIndex % runs.length;
  return [...runs.slice(shift), ...runs.slice(0, shift)];
}
```

`PracticeRefusal` lives in `practice-settings.js` (practice.ts imports it from there). Check its constructor
`(code, detail)`. An empty level list (`model=`) fails the regex, which is good: it refuses.

- [ ] **Step 4: Wire the formats run**

In `practice-formats.ts`, the formats run takes an optional `levels?: PracticeLevelPlan` input. Read the whole run
function first: busy waits, semaphores, observer slicing per model, the `practiceTurnOrder` order. Then:
- The unit of work becomes (target, job, run). For a target with runs in the plan, each job (lane, sample) expands into
  `practiceInterleavedRuns(runs, jobIndex)` in that order. A target without runs keeps one implicit run and records no
  level fields.
- `recordingGateway` gets `config: run === undefined ? input.config : practiceLevelConfig(input.config, run)`.
- **Busy handling stays per MODEL.** A parked model parks all its runs.
- **One model's runs must not overlap in time.** Today one model never runs two jobs at once, so the observer's
  per-model slice (`events.slice(eventsBefore).filter(model)`) stays correct. Keep that guarantee: run a model's runs
  of a job one after another, not in parallel. If the existing code already allows a model two jobs at once, attribute
  wire events to the job by the job's own operation ids instead, and say so in the commit.
- New sample fields, only when the job has a run:
  - `levelRun: run.run`, `thinkingLevel: run.level`;
  - `reasoningTokens`: the sum of the job's wire events' `reasoningTokens` (null if none reported);
  - `cutOff`: any of the job's artifacts whose `practiceFinishReasonOf(artifact.metadata)` is `"length"` or
    `"max_tokens"`;
  - `answerText`: the content of the job's last accepted (`OK` and PARSED or REPAIRED) artifact, passed through the
    same redaction and 64 KiB cut as `replyText` (practice-redaction.ts), or null.

In `practice.ts`:
- `--levels` (value flag) is valid in formats mode only. It needs `--models` to include every listed model, or the
  default model set when `--models` is absent.
- Parse it with `parsePracticeLevels(text, modelsOfThisRun)` before any gate is touched.
- Print one banner line per model: its runs.

- [ ] **Step 5: The report**

In `practice-report.ts`, add `levelsBlock(samples)`. It runs when any sample has `levelRun`, and produces
`Record<model, Record<run, {...}>>` with the fields listed in Step 1:
- `firstTry`: status `PARSED`;
- `repaired`: status `REPAIRED`;
- `failed`: `PARSE_FAILED` or an `errorCode`, excluding the skipped ones;
- `answered`: jobs not skipped;
- medians and p90 from `latencyMs`;
- cost from `costNanoUsd`.

`formatsReport` includes it as `levels`. `reportMarkdown` renders a "Thinking levels" table:

| model | run | jobs | first try | repaired | failed | cut off | thinking median | time median / p90 | cost per job |

The chance band, for a model with two runs of the same level (`high#1`, `high#2`): add one line under its rows with
the absolute differences between those two runs, as "chance band: first try ±a, thinking median ±b, time median ±c s,
cost per job ±d". The level runs keep the existing verdict rules per model.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run tests/unit/preview-practice-levels.test.ts tests/unit/preview-practice.test.ts tests/unit/preview-practice-slips.test.ts tests/unit/preview-practice-wiring-drift.test.ts`
Expected: PASS.

Then `pnpm run typecheck` (alone).

- [ ] **Step 7: Commit**

```bash
git add -A tools/preview-practice tests/unit
git commit -m "Practice: --levels runs the same jobs at several thinking levels, interleaved, with a levels table (spec 2026-10-12 §4.8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Practice side-by-side page

**Files:**
- Create: `tools/preview-practice/practice-side-by-side.ts`.
- Modify: `tools/preview-practice/practice.ts`, report mode. Check what `report` mode takes today. Add
  `--side-by-side <samples.jsonl>` with `--out <dir>`; it writes `<dir>/side-by-side.html`, outside the repository
  (`assertOutsideRepository`).
- Modify: `tools/preview-practice/README.md`: one paragraph.
- Test: create `tests/unit/preview-practice-side-by-side.test.ts`.

**Interfaces:**
- Consumes: `PracticeSample` with Task 5's fields, and `readPracticeSamples` (or the samples-log reader in
  `practice-samples-log.ts`).
- Produces: `export function practiceSideBySideHtml(samples: readonly PracticeSample[], options?: Readonly<{ lanes?: readonly PracticeLane[]; generatedAt?: Date }>): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { practiceSideBySideHtml } from "../../tools/preview-practice/practice-side-by-side.js";

const base = { providerRef: "preview:deepseek-v4-1-flash", gate: "deepinfra", attempts: [], inputTokens: 100, outputTokens: 900,
  cachedInputTokens: null, unbilledRefusals: 0, repairKind: null, issues: [], recheckIssues: [], errorCode: null, replyText: null, detail: null } as const;
const sample = (over: Record<string, unknown>) => ({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash", lane: "PANEL", sample: 1,
  questionId: "q-en-1", status: "PARSED", latencyMs: 41_000, costNanoUsd: "540000", reasoningTokens: 700, cutOff: false, ...over });

describe("the side-by-side page (spec 2026-10-12 §4.8)", () => {
  it("puts the same question at each level in labelled columns, in run order", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "answer at high" }),
      sample({ levelRun: "low#1", thinkingLevel: "low", answerText: "answer at low", reasoningTokens: 90 })] as never);
    expect(html.indexOf("high#1")).toBeLessThan(html.indexOf("low#1"));
    expect(html).toContain("answer at high");
    expect(html).toContain("answer at low");
    expect(html).toContain("700");
    expect(html).toContain("90");
  });
  it("escapes answers: text, never markup", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "<script>alert(1)</script> & \"x\"" })] as never);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;");
  });
  it("shows a missing answer plainly", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" }),
      sample({ levelRun: "low#1", thinkingLevel: "low", status: "SKIPPED_MODEL_BUSY", answerText: null })] as never);
    expect(html).toContain("no answer (model busy)");
  });
  it("is a themed page that works on a phone", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" })] as never);
    expect(html).toMatch(/<title>Thinking level comparison<\/title>/u);
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(':root:not([data-theme="light"])');
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/<script/u);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/unit/preview-practice-side-by-side.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Write `practiceSideBySideHtml`. It is a static page with no script, so it can be published as a private page.

**Page shell:**
- `<!doctype html>`, charset and viewport metas, `<title>Thinking level comparison</title>`.
- CSS colour tokens on `:root`, redefined under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
  and again under `:root[data-theme="dark"]`. `body` gets an explicit background.
- A 16px side gutter. Answers sit in `<pre>` with `white-space: pre-wrap; overflow-wrap: anywhere`.

**Layout:**
- Grouping: model → lane (default lanes PANEL, SYNTHESIZER, STORYTELLER, REVIEW, in that order; the `lanes` option
  overrides) → `sample`/`questionId`.
- In each group, one column per run, in the order the runs first appear in the samples.
- Columns stack on narrow screens: CSS grid with `repeat(auto-fit, minmax(18rem, 1fr))`.
- **Under each answer:** run label, status, thinking tokens, time in seconds, cost in USD, and "cut off" when true.
- **Missing answers:** a skipped sample shows "no answer (model busy)" or "no answer (gate stopped)"; a failed one
  shows "no answer (format failed for good)".
- **Header:** the generated time and a plain one-paragraph explanation: what a run label means, that `#2` is the same
  level run again to show chance, and what "default" and "none" mean.

**Escaping:** every interpolated value goes through `&` `<` `>` `"` `'` escaping.

**Report mode:** `practice report --side-by-side <samples.jsonl> --out <dir>` reads the log with the existing reader
and writes the file. If report mode already uses `--out`, reuse it.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/preview-practice-side-by-side.test.ts tests/unit/preview-practice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A tools/preview-practice tests/unit
git commit -m "Practice: labelled side-by-side page of answers per thinking level (spec 2026-10-12 §4.8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After all tasks (orchestrator)

1. **Whole-branch review:** one fresh reviewer reads the spec and `git diff origin/release/2026-10-12-r14...HEAD`.
2. **The CI gate**, alone: `pnpm run test:ci-gate`. The Python suites run inside it through the json-mode test.
3. **Merge the latest `origin/dev`** (merge commit) and resolve conflicts. Re-run the touched unit files and typecheck.
4. **Push, open a PR to dev, bind it, and turn Auto-fix on.** Read back the auto-merge method; it must not be SQUASH.
   Do not merge.
5. **Server and practice:** spec §6 and §7, steps 2–3. Every batch runs with `set -euo pipefail`, and stops on the first
   surprise.
