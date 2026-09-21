# GUIDE_LIVE3 manual walkthrough

This walkthrough uses only the two canonical prompts already observed in the partial capture. It requires two anonymous sessions and two messages.

1. Open `https://localhost:3100/help` normally. Confirm the Dialectical Engine identity, Help heading, public-guide notice, topic menu, service status, shortcuts, and free-text composer. In English full Help, submit `Pricing` once. This is canonical sequence 1.
2. Change the language to Romanian. Confirm that a distinct Romanian conversation is created and the shell text changes language. Submit `Account` once. This is canonical sequence 2.
3. Without sending another message, inspect the Romanian welcome text. It states that the assistant can explain and point to links but cannot authenticate, change the account, or reset anything. Do not submit credentials, recovery codes, or a recovery operation. The Forgot destination remains unresolved and actionless.

Calculated capacity permits this two-session/two-message walkthrough immediately after the failed capture: the pre-capture measurement had zero hourly sessions and zero ten-minute messages; the capture created two sessions and sent three messages; the normal limits are five sessions per hour and twenty messages per ten minutes. This is a calculation from captured evidence, not a fresh post-capture capacity measurement. See `GUIDE_LIVE3-owner-testability.json`.

The preview remains detached at exact revision `f3be0af81f1691db6c23494f9e286bb6b10f13bf`. The 54-row capture failed on canonical sequence 7, so this manual does not imply complete guide coverage or checkpoint readiness.
