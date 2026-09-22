# GUIDE_COMPACT_UI_PROBE4 self-report

## Identity

- Session: `/root/preview`
- Ticket: `t_f96afae0`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_CHECKPOINT_CONSTANT_UNDEFINED`
- Skills loaded: retained packet-scoped operational and verification BODY guidance; no additional skill body was required.

## Execution

The exact PROBE4 command exited `1` because `checkpoint()` referenced undefined `EVIDENCE_ROOT`. The browser and abort guard existed, but no result checkpoint was written. Blocked-attempt and transition counts are unavailable; no Support route could be forwarded. The command was not retried. Postflight runtime ownership and ordinary TLS remained healthy.

## Requested process review

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The regression was introduced while centralizing argument validation: the local evidence-root constant was removed even though the checkpoint closure still used it. Syntax checks, argument guards, pure readiness controls, and independent review all passed because none executed the checkpoint writer. This is another boundary where static validation stopped one line before the operational effect.

The upgrade is an inert checkpoint smoke built into author verification. It should import or invoke a browser-free writer with a temporary, valid, collision-free output path; assert first-write exclusivity, update behavior, exact directory custody, and serialized fixed shape; then remove only the owned temporary fixture. The future operational command should be generated from that same validated contract.

The one-prompt machine needs an effect-coverage ledger alongside its control count: argument parse, browser launch, route installation, first checkpoint, each transition phase, cleanup, and numeric child exit. A gate should not call the executable reviewed merely because its argument function and syntax passed. That change would have caught this regression without consuming a browser attempt or another round of runtime custody evidence.
