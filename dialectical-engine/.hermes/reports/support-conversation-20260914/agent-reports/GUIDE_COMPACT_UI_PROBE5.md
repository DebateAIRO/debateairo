# GUIDE_COMPACT_UI_PROBE5 self-report

## Identity

- Session: `/root/preview`
- Ticket: `t_ea7d37a8`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_COMPACT_RO_POST_READY_UNCLASSIFIED`
- Skills loaded: retained packet-scoped operational and verification BODY guidance; no additional skill body was required.

## Execution

PROBE5 repaired checkpoint persistence and completed both full-page transitions. Compact Romanian reached public READY with an expanded visible panel and composer, then failed before its transition record or any compact private-control result. Source ordering shows the READY checkpoint is followed by `selectLanguage(language)` before `openGuideSupportSurface` returns; the caller begins `assertNoPrivateControls` only afterward. Because `setLanguage()` is scoped to `.supportDesk .supportLanguage` while compact is rooted under `.supportAssistantCompact`, language selection is a concrete competing stage and private-control assertion entry is unproved. The fixed projection retained only an unclassified failure, so the exact lost exception remains unknown. Child exit was 1 and no retry occurred. The abort guard forwarded zero Support requests, and the detached ordinary-TLS runtime remains healthy.

## Requested process review

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The checkpoint repair worked and exposed the next observability gap: code after the surface-ready checkpoint performs language selection and then several label reads and one assertion, but the catch collapses every unexpected error into an unclassified result without recording which bounded operation began or ended. The system paid for another real browser turn yet cannot distinguish compact language-selector mismatch from a later private-control read or policy failure.

The upgrade is to bind language selection to the actual surface producer and add a fixed-stage postcondition recorder. Persist a stage enum before language selection and before each fallible assertion; after safe reads, persist only bounded label-family counts and a read-status enum; then assert. Any failure should retain a closed predicate such as `LANGUAGE_SELECTION_FAILED`, `PRIVATE_CONTROL_PRESENT`, `PRIVATE_CONTROL_READ_FAILED`, or `TRANSITION_RECORD_FAILED`. Raw DOM and exception strings remain excluded.

For a stronger one-prompt machine, generate the operational state machine and evidence schema together. Every fallible step must have a before checkpoint, safe bounded result, and closed error code. The dispatcher can then route one exact correction from the first failure rather than spending additional turns rediscovering which line ran.
