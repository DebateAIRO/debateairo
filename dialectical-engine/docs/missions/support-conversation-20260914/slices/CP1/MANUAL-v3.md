# CP1 manual verification script v3

Status: preparation only. CP1 is not ready for owner verification or accepted. Final separate reviews are consumed; three security failures and the unverified, unconnected owner-confirmed Forgot password destination block readiness. This script does not ask for acceptance now.

Product branch: `codex/support-conversation-cp1`, commit `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`. The supported local preview is `https://localhost:3100/help`. Its last measured runtime is `606b2eabea1dc9212159e53c193cf69655424e77`, at 2026-09-15T17:54:11.348Z: ordinary TLS returned200 after browser exit and ten seconds idle. The later commit changes only a test fixture; all tracked runtime, content and configuration bytes are identical. This is a dated custody observation, not a new liveness check.

This script follows SPEC-v3 and CP1-REVIEWED-RECOVERY. It supersedes DONE.md step9's old unconditional-refusal expectation for rejected model drafts. The frozen prior script remains historical evidence.

## Once the checkpoint is ready

1. Open the full preview Help page. Expect the established header, topic list, conversation, details and shortcuts. Its existing `Debate engine` status wording remains a CP3 item.
2. In English ask `How do I create a debate?` Expect current sign-in and creation prerequisites, a reviewed source label and **Start a debate**. As a guest, activating that action should open the first-party login with a return to the new-debate page.
3. Ask `What can I change in Settings?` Expect session controls, browser consent, legacy debate claim and account erasure, with fresh authentication for sensitive controls. Do not expect email, password, active-MFA or deployment settings controls.
4. Ask how JSON export works. Expect the current conditional availability and no Markdown or full-account export promise.
5. Switch to Romanian and repeat the creation, Settings and export questions. Expect equivalent facts and visitor-facing Romanian labels. Open the compact Support widget, repeat creation, then activate its action using the keyboard. Expect the same first-party destination.
6. After the existing Forgot destination has been verified and connected, try `Forgot password`, `I forgot my password` and `Am uitat parola` in both surfaces. Expect the exact existing flow to open by pointer or keyboard. Support must neither ask for credentials nor submit a reset/security request. This step is currently BLOCKED; no guessed destination or substitute is acceptable.
7. In a signed-in session, confirm both existing surfaces preserve consent-gated own-status behavior and immediate **Talk to a human** access. The human path remains an asynchronous case flow with a48-hour SLA, not a telephone call. Its recorded regression evidence must be considered separately from the seven signed-out live replies.
8. Inspect the captured synthetic boundary evidence rather than submitting real credentials. A rejected draft is discarded completely. For ordinary knowledge requests, an admitted reviewed fallback from the preselected source in the same pinned snapshot may return `ANSWER_GROUNDED`, with that exact reviewed text and trusted source/action values. Without a valid fallback, expect `REFUSE_SAFETY`. Rejected draft bytes must be absent from storage, API, UI and summaries; zero Support-originated auth/reset calls. Only grounded branches receive grounded rating/resolution effects. Preserve actual model usage and successful relay health; rejection alone must not trigger E2/E6 or degradation.
9. Confirm the automated snapshot and stale-session receipts: available A answers only from A; unavailable A returns the exact409 before model/persistence; the browser starts B and retries the redacted current request once, without a loop.
10. Record the exact revision, EN/RO results, destinations and remaining issues. Explicit owner acceptance is required before CP2; this preparation document records no acceptance.

## Evidence limits to carry into the handoff

- LIVE_P2 used the same seven canonical requests once at606b: all seven grounded and API/DOM equal; six accepted model drafts and one exact reviewed EN Settings fallback. This finite sample is not a broad conversational-quality guarantee.
- The whole25-file run at606b recorded977 tests passed, one degraded-fixture failure and one Forgot TODO. The later projection-only fixture correction passed its complete affected file8/8. These are distinct captures, not a rerun of the whole suite.
- Latest project typecheck at606b failed with the attributed76 diagnostics, byte-identical to the baseline. It was not repeated after the one-test fixture addition. No project-wide typecheck PASS is claimed.
- Fifteen HTTP401 console entries were counted; origin and harmlessness are unverified. The historical source-custody gap remains qualified separately.
- Final verdicts/dispositions are in reviews/REV-CP1-p3-UNION.md: correctness PASS, security REWORK and product scope BLOCKED on Forgot. No acceptance is requested.
