# UIFIX1 evidence

- Ticket/session: `t_9e40cdeb` / `/root/preview`
- Frozen UI input: `1ed6c29d327db535259bb428eb181e1e97081c99`
- Integrated parent with consumed server FIX1: `1bd15cff4fd0d2d73e1ce872b2f0d2e70bf46b21`
- Scoped correction commit: `085fff68f8b22743978d1efafd7ad9fd204e5a6f`
- Status: READY FOR PEER REVIEW; CP1 acceptance is not claimed.

## Shortcut correction

The full Help desk no longer advertises `/settings#privacy` or `/settings#cookies`. For a signed-in identity, its first shortcut is the exact `privacy-preferences` action returned by the browser-safe canonical resolver: English `Privacy preferences` or Romanian `Preferințe de confidențialitate`, both pointing to `/settings#consent-privacy-heading`. The resolver makes this item absent for a signed-out identity instead of sending a guest to an authenticated surface under a misleading label.

`Cookie preferences` is now a button that calls the existing app-wide `requestPreferences` opener with its own element. The mounted consent sibling opens the reviewed Cookie preferences dialog and retains that opener for focus return. No fragment, route, cookie capability, modal state, or consent operation was invented. Model fleet status and Report a bug retain their existing behavior and presentation.

## Focused verification

- The prior UI baseline is consumed from the immutable UI receipt: 5 files / 194 tests passed / 1 pending Forgot click, with UI package TypeScript rc0 at `1ed6c29d`.
- Meaningful focused RED: the new navigation oracle failed because signed-out Help still contained `/settings#privacy` (`UIFIX1-red-shortcuts-r3.log`: 1 failed, 53 skipped).
- Focused GREEN: the same oracle passed after the correction (`UIFIX1-green-shortcuts.log`: 1 passed, 53 skipped). It verifies signed-out omission, signed-in exact canonical href and EN/RO labels, absence of both legacy fragments, and the exact element delivered to the existing preference-request listener.
- Final affected render file: 53 tests passed / 1 existing Forgot TODO (`UIFIX1-green-render-final.log`).
- Final UI package TypeScript check passed (`UIFIX1-tsx-typecheck.log`).
- `git diff --check` was clean. Commit `085fff68...` contains only `Assistant.tsx` and `sup-01-help.test.tsx`; the lane was clean immediately after commit.

The first attempted RED invocation used a removed Vitest option and never loaded a test (`UIFIX1-red-shortcuts.log`). The next command expanded beyond the intended focused filter and was interrupted (`UIFIX1-red-shortcuts-r2.log`). Neither is product evidence; the uniquely captured r3 frame is the meaningful RED.

## Signed-in browser matrix

The installed Playwright 1.61.1 and Chromium headless-shell 1228 used a new isolated profile and ordinary TLS. `tls_bypass` is false; no custom CA override, browser reuse, credential, account creation, or global trust change occurred. The browser loaded the actual Next application and compiled CSS. Session identity, debate projection, and Support API responses were synthetic and are explicitly labelled `synthetic_identity: true` and `synthetic_support_api: true`.

All four full/compact x EN/RO frames passed and were visually inspected:

- Full EN and RO show `Signed-in asker`, session/debate context, the consent toggle, latest-debate and synthetic owned-debate controls, immediate human escalation, two ordered sources, and a contained canonical `/new` action. The right rail shows the resolver-owned privacy destination and the working Cookie preferences button without layout change.
- Compact EN and RO show the consent and debate controls, immediate human handoff, two ordered sources, and the contained `/new` action inside the 390 x 844 panel. Romanian labels wrap within the existing cards without clipping or overlap.
- Keyboard Enter on `Cookie preferences` opened the actual dialog with heading `Cookie preferences`; the receipt records the canonical privacy shortcut href as `/settings#consent-privacy-heading`.
- Keyboard Enter on the Romanian start-debate action navigated to `https://localhost:3100/new`.

The two console 401 entries occur only after the synthetic action reaches `/new`, whose actual account projection has no real authenticated cookie. They are consistent with the explicitly synthetic identity boundary and do not support an authorization claim. The four Support interactions and all displayed signed-in data were synthetic; this evidence proves UI conditioning, rendering, navigation, and containment only.

## Forgot destination and compatibility clarification

A separate read-only browser opened the live public `https://localhost:3100/login?next=%2Fnew` page over ordinary TLS and inspected every anchor and button for Forgot, reset, recovery, or password wording. It found zero matching controls and submitted nothing. The screenshot was visually inspected and contains the email/password form, Continue, and Create one only. There is no current product destination to wire, so the exact Forgot destination and actual click remain UNKNOWN and UNVERIFIED.

The immutable UI evidence described absent decoration arrays as accepted only for legacy terminal shapes. The client parser actually defaults omitted arrays to empty for every otherwise-valid reply; the current server ordinary message path still always emits both arrays. This is safe compatibility behavior, not a new product change, and the historical receipt remains immutable.

## Supported preview custody

The prior consumed UI stack log ends after its readiness marker and has no exit or cleanup marker. A later connection refusal establishes only that the preview was absent; its exit cause is UNKNOWN. A fresh supported start was required to consume server FIX1 and the UI correction.

At handoff, an evidence-owned launcher runs the unchanged supported command `pnpm dev:auth:up` with profile `support-preview` in a detached process group. Its recorded launcher PID and process group are `71877`, its parent is PID 1 after the launcher task exited, and the frozen log contains `DEV_AUTH_STACK_READY=https://localhost:3100:RUNNER_REGISTERED`. Ordinary `curl` without `-k` or a custom CA returned HTTP 200 for `/help`. Preview listeners 3100, 3101, and 8890-8896 are active; original listeners 8790-8796 remain active. The mutable live log was copied byte-for-byte to `UIFIX1-stack-at-handoff.log` before hashing. The supported preview remains active for integrated review.

The detached process and all listener sets were checked again after an idle boundary at `2026-09-14T12:50:37Z`. `UIFIX1-stack-idle-check.log` records PID `71877` with PPID `1` and process group `71877`, ordinary TLS HTTP 200, every preview listener, and every preserved original listener.

Real-relay Support answer quality, real signed-in authorization/private-data behavior, and actual Forgot navigation remain UNVERIFIED. Actual usage UNAVAILABLE.
