# UX-02 Codex handoff

Ticket `t_e795a52c` · worker session `019ffacc-335c-76e1-a91a-5f00992b82a7` / Hermes run 79 · first pass · DR-166-B / DR-153.

## Rev2 — DR-166-C + Opus B1-B3/A2-A3 (supersedes rev1 outcome and counts)

The ruled default surface is now question, risk tier, composition budget tier, the real `treeDepth` selector, and Start. Risk and budget remain visible user choices; the existing depth control moved intact from the closed legacy Options panel to the default surface. The five DR-166 machinery fields remain conditionally unmounted behind Advanced exactly as rev1 delivered them.

The render harness no longer writes a magic hook slot. It evaluates the real component element tree, locates the actual Advanced button, invokes its production `onClick`, and then re-renders. The same evaluated tree exposes the real form `onSubmit`, allowing a never-opened behavioural submission assertion over the complete ask and redirect.

Both disclosure buttons now expose `aria-expanded`. `aria-controls` exists only while its controlled region is mounted, so neither collapsed button has a dangling reference. The helper now tells the user to choose risk, budget, and depth before Start, matching DR-166-C.

### Finding-by-finding disposition

- **B1:** moved `treeDepth` out of Options; collapsed render asserts `riskTier`, `budgetTier`, and `treeDepth` are present. Risk/budget stay visible per V's DR-166-C ruling.
- **B2 / A1:** removed `advancedDisclosureStateSlot` and `openAdvanced`; expanded tests click the real Advanced `onClick`. A dead-handler mutation fails the expanded test.
- **B3:** collapsed render asserts Start is ready, then invokes the never-opened form's real submit handler and proves the complete defaulted config plus `/debate/run%3Anew` navigation. An `advancedOpen &&` readiness mutation fails this test.
- **A2:** Advanced and Options have consistent expanded-state ARIA and no collapsed dangling `aria-controls`.
- **A3:** helper copy names all three visible choices and Start.
- **Held unchanged:** the conditional mount, MUT-1 visibility kill, DR-166-A two-identity guard, and `defaults.tsx` logic. Its md5 remains Opus's reviewed `f4908a99752fac1c10370f7ade1b230b`.

### Rev2 RED and mutation evidence

New tests against rev1:

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
FAIL DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
expected collapsed Advanced not to carry aria-controls="machineOwnedAskFields"
Test Files  1 failed (1)
Tests       1 failed | 14 passed | 1 skipped (16)
```

Dead production Advanced handler mutation:

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t "B4/DR-166-B expanded"
FAIL B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled
expected aria-expanded="true"; received the still-collapsed real button
Test Files  1 failed (1)
Tests       1 failed | 15 skipped (16)
```

Collapsed-readiness inversion mutation (`advancedOpen &&`):

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t "MUTATION collapsed-submit"
FAIL DR-166-B + MUTATION collapsed-submit: creates the fully defaulted ask without opening Advanced
expected class="startBtn ready" without disabled; received class="startBtn" disabled
Test Files  1 failed (1)
Tests       1 failed | 15 skipped (16)
```

Both temporary mutations were restored before GREEN and final gates.

### Rev2 GREEN and collection

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
Test Files  1 passed (1)
Tests       15 passed | 1 skipped (16)

pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
... B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled
... DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
... DR-166-B + MUTATION collapsed-submit: creates the fully defaulted ask without opening Advanced
... DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
exit 0
```

### Rev2 final gates

```text
pnpm exec vitest run tests/render
Test Files  3 passed (3)
Tests       27 passed | 1 skipped (28)

pnpm exec tsc --noEmit --pretty false
exit 0

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

pnpm --filter dialectical-engine-v2ui test
V2_UI_NODE_TESTS_DISCOVERED=1
# tests 27
# pass 27
# fail 0

pnpm lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }

pnpm exec vitest run
Test Files  74 passed (74)
Tests       522 passed | 1 skipped (523)
Duration    25.86s

pnpm exec vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

git diff --check
exit 0
```

The root skeleton template checks remain unavailable because `tests/render-templates.sh` and/or `tests/lint-templates.sh` are absent. The live-stack case remains opt-in and was not run; no live stack was declared for this rework. No commit, push, merge, branch, reset, destructive operation, Docker-family command, or external provider call was performed.

## Outcome

The five DR-166 machine-owned controls no longer exist in the default `/new` render. A closed `Advanced` button now conditionally renders them with `aria-expanded` and `aria-controls`; opening it restores the existing prefilled values, provenance hints, editable controls, DR-166-A asker-relative identities, honest typed absence, and Start readiness.

This was a layout-only change. `apps/v2-ui/app/new/defaults.tsx` was not edited. Risk tier and composition budget remain where UX-01 placed them because the packet explicitly said not to decide their treatment; the existing secondary `Options` disclosure and depth controls are likewise unchanged.

## Inventory

- `apps/v2-ui/app/new/page.tsx` — adds local closed-by-default disclosure state and conditionally mounts `MachineOwnedAskFields` under `Advanced`.
- `tests/render/ux01-new-debate-form.test.tsx` — adds the named default-visibility mutation guard and exercises existing UX-01 guarantees in the expanded state.
- `docs/missions/2026-08-06-v3-programming/handoffs/UX-02-progress.log` — append-only major-step receipts.
- `docs/missions/2026-08-06-v3-programming/handoffs/UX-02-codex-handoff.md` — this evidence packet.

Pre-existing UX-01 edits in `page.tsx`, the already-untracked `defaults.tsx` and render test, and unrelated dirty-worktree files were preserved. No commit, push, merge, branch, reset, Docker-family command, destructive operation, or external provider call was performed.

## TDD evidence

RED command:

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t "DR-166-B \+ MUTATION visible-by-default"
```

Real RED:

```text
FAIL DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
expected rendered HTML to contain "Advanced"
received default HTML containing agentCount, asOf, decisionOwner, actionOwner, and decisionScope
Test Files  1 failed (1)
Tests       1 failed | 14 skipped (15)
```

GREEN command:

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
```

Real GREEN:

```text
Test Files  1 passed (1)
Tests       14 passed | 1 skipped (15)
Duration    299ms
```

The expanded test asserts `aria-expanded="true"`, the disclosure container, all five prefilled values and provenance, and an enabled Start button. The default mutation test asserts `aria-expanded="false"`, no disclosure container, and no control id for any of the five fields. Rendering the five controls unconditionally makes the named mutation test RED.

## Collection proof

```text
pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
... > B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled
... > DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
... > DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
exit 0
```

## Final gates

```text
pnpm exec vitest run tests/render
Test Files  3 passed (3)
Tests       26 passed | 1 skipped (27)

pnpm exec tsc --noEmit --pretty false
exit 0

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

pnpm --filter dialectical-engine-v2ui test
V2_UI_NODE_TESTS_DISCOVERED=1
# tests 27
# pass 27
# fail 0

pnpm lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }

pnpm exec vitest run
Test Files  74 passed (74)
Tests       521 passed | 1 skipped (522)
Duration    22.98s

pnpm exec vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

git diff --check
exit 0
```

The root `AGENTS.md` names `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`, but neither script exists in this checkout. The attempted command stopped immediately with `bash: tests/render-templates.sh: No such file or directory`; no pass is claimed for that unavailable skeleton-only check.

## Deferrals / questions

- Risk tier and composition budget remain visible, as ordered by the packet's explicit non-decision rule. If V wants the literal default surface reduced beyond the five DR-166-B fields, that is a separate product ruling.
- The live-stack case remains opt-in and was not rerun because no live stack was declared for UX-02; all hermetic render, full-suite, and acceptance gates passed.

## Review request

Review the layout-only conditional render, the default-hidden mutation guard, expanded UX-01 guarantees, and the explicit risk/budget non-decision. Comments read through: Codex `WORKER CLAIM` at 2026-08-13 14:06; no later comments were present before handoff authoring.
