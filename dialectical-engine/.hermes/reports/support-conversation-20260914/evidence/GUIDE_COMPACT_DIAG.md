# GUIDE_COMPACT_DIAG

## Disposition

**HARNESS_PRECONDITION_DEFECT_PROVED / LIVE7_CAUSE_UNRESOLVED / NO_PRODUCT_DEFECT_PROVED.**

LIVE7 completed and sent 15 rows. Canonical row 43, the full-page Romanian prompt-injection row, was the last completed row. The next row was canonical 3, the compact Romanian Pricing row. That next row was never attempted: no message request began and no new group session was created. The failure occurred while opening compact mode, after the harness issued one toggle click and before the compact composer became visible.

The current harness creates a circular readiness condition. In compact mode it waits only for `domcontentloaded`, clicks the server-visible Support toggle, and then waits for the composer. Its hydration check runs only after that composer appears. The product starts with the widget collapsed, mounts the panel and `Assistant` only after React handles the toggle click, and renders the compact composer whenever that Assistant is mounted. The existing render test proves the intended hydrated path: one click expands the widget, mounts the panel, and focuses the message input.

A pre-hydration click being ignored is therefore a concrete competing explanation. It is not the proved historical cause. LIVE7 retained no post-click widget state, `aria-expanded`, panel/compact-root/composer counts, failure screenshot, DOM snapshot, or exact child numeric status. The evidence cannot distinguish an ignored click from another transition failure, and it does not show a product rendering defect.

## Finite evidence

- Sealed LIVE7: 15 completed/15 attempted rows, 15 Support requests, 2 sessions; last completed sequence 43; next sequence 3 not attempted.
- Harness lines 158–173: compact `goto(...domcontentloaded)`, immediate toggle click, composer wait, then hydration check.
- Harness lines 289–303: the failed boundary is `STORAGE_RESET_BEFORE_REMOUNT`, then `openMode(compact, ro)`.
- `SupportWidget.tsx` lines 36–48 and 63–107: collapsed by default; the React `onClick` changes state; panel/Assistant mount only after expansion or during closing.
- `Assistant.tsx` lines 667–703 and `globals.css` lines 1160–1167: a mounted compact Assistant contains the composer, and the compact root uses `display:grid`.
- `sup-04-widget.test.tsx` lines 53–59 and 82–101: static markup is collapsed without a panel; the hydrated click expands, mounts, and focuses the composer.
- The shell invocation allowed `tee` to return zero while the child failed, so process status and UI-stage evidence were both incomplete.

No inert command would reconstruct the missing LIVE7 state. None was run. No product, harness, prior evidence, runtime, browser, database, service, capacity, or model state was changed.

## Exact next scope

Create an append-only `GUIDE_HARNESS_BIND13` correction and review it independently. Preserve the frozen 54-row matrix, all response oracles, privacy checks, pacing, session accounting, and prior evidence.

1. Establish a stable client-hydration signal before the first compact-toggle interaction. If the product has no stable public readiness signal, add only an observability marker to `SupportWidget`, set from `useEffect`, with a render test that proves server-collapsed, hydrated-ready, one-click-expanded, panel-mounted, composer-visible, and focused states. This is an observability contract; it is not a product behavior fix.
2. Record fixed, non-text state before the click, immediately after it, and after the bounded transition: toggle count/visibility, hydration readiness, widget state, `aria-expanded`, panel/compact-root/composer counts and visibility, URL class, cookie-region visibility, and categorized console counts. Store no text, cookie value, storage value, credential, or private record.
3. Require exactly one toggle and a one-interaction collapsed-to-expanded transition. Use separate fixed codes for missing/duplicate toggle, hydration timeout, absent state transition, absent panel, absent compact root, absent composer, and invisible composer.
4. Checkpoint every transition boundary before the next operation. Preserve the child numeric exit code; use `pipefail` or internal file logging instead of an unguarded `tee` pipeline.
5. Before any actual Support request, run a fresh zero-request preflight over fresh full/EN, same-session full/RO, storage-reset compact/RO, route-remount full/EN, and storage-reset compact/EN. It must prove `createSession=0`, `sendMessage=0`, no private controls, readiness before interaction, one-click compact expansion, visible panel/root/composer, and deterministic language selection.

If a current live observation is still requested after BIND13 review, bound it to the zero-request preflight above in a new output namespace. It may establish the current transition behavior, but it cannot retroactively prove the lost LIVE7 state. No additional model sample or retry is justified by this diagnosis.

Forgot-password navigation remains unresolved and actionless. This report makes no readiness, acceptance, or checkpoint claim.
