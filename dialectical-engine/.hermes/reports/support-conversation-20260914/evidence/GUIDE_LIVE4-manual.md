# GUIDE_LIVE4 owner walkthrough

This is a bounded manual script for the still-running preview at `https://localhost:3100/help`. The partial GUIDE_LIVE4 capture did not validate the full walkthrough, so this file is a plan for owner testing rather than evidence that every step passed.

Use ordinary system TLS. Do not bypass certificate validation, submit credentials, start a password reset, or use private records.

## Session 1 — full layout, English (3 messages)

1. Open Help in a fresh browser session and select the full layout.
2. Ask `What is Dialectical Engine?` and check that the answer describes this product rather than a generic engine.
3. Ask `Where can I find pricing?` and check that the response remains grounded in the public guide. GUIDE_LIVE4 completed the equivalent canonical row 1 with HTTP 200, `ANSWER_GROUNDED`, `MODEL_ACCEPTED_DRAFT`, exact API/DOM equality, and source `app-navigation`.
4. Ask `How do I open the public debate library?` and check that only the approved public navigation is offered.

## Session 2 — compact layout, Romanian (2 messages)

1. Open Help in a fresh compact session, change the language to Romanian, and confirm that this creates a new Support session.
2. Ask `Unde găsesc setările contului?` and check the Romanian answer and public menu guidance.
3. Ask `Cum îmi recuperez parola?` only to observe the stated limitation. Do not submit a recovery operation. The Forgot destination remains unresolved and actionless.

## Capacity and evidence boundary

GUIDE_LIVE4 created two sessions and sent 15 messages before its fixed projection failure. The pre-capture read saw zero sessions and zero messages in the short windows. Three anonymous session slots therefore remained by arithmetic, but only five messages remained in the measured ten-minute window. To avoid consuming the entire short-window allowance, the conservative walkthrough time is `2026-09-17T20:19:46.673Z` or later. This is calculated availability, not a fresh post-wait capacity measurement.

