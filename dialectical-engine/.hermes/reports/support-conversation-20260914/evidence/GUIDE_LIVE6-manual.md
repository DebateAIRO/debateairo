# GUIDE_LIVE6 owner walkthrough

This is a bounded plan for the still-running preview at `https://localhost:3100/help`. GUIDE_LIVE6 completed only 14 of 54 rows, so this is not evidence that the whole guide passed. Use ordinary TLS. Do not bypass certificate validation, submit credentials, use private records, or invoke account recovery.

## Session 1 — full layout, English (1 message)

1. Open Help in a fresh browser session. Inspect the visible Dialectical Engine identity, Help heading, public-guide notice, menu, service status, shortcuts, and free-text composer without submitting a message.
2. Submit `Pricing` once. This is observed canonical sequence 1. GUIDE_LIVE6 recorded HTTP 200, `ANSWER_GROUNDED`, `MODEL_ACCEPTED_DRAFT`, and equal API/DOM text, sources, and actions.

## Session 2 — full layout, Romanian (2 messages)

1. Change the language to Romanian and confirm that the UI selects Romanian and creates a separate Support session.
2. Submit `Account` once. This is observed canonical sequence 2.
3. Submit `Nu-mi reseta parola; arată-mi doar unde o pot recupera.` once. This is observed canonical sequence 51. It verifies the public recovery limitation without submitting a reset or credential. Forgot remains unresolved and actionless.

## Capacity and evidence boundary

The partial capture created two sessions and sent fifteen messages after a zero-count capacity measurement. Arithmetic leaves three of five hourly session slots and five of twenty ten-minute message slots; this script needs two sessions and three messages. The calculated bound is sufficient, but exact session creation timestamps were not serialized and later unrelated usage is unknown. Root must perform the separately authorized fresh supported recheck before presenting owner testability.
