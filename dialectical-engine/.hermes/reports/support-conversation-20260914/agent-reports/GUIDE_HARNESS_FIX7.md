# GUIDE_HARNESS_FIX7 self-report

## Identity and verdict

- Ticket: `t_2ae29af2`
- Session: `/root/preview`
- Model: `gpt-5.6-sol`
- Product: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- KB: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Verdict: `PASS_INERT_STRICT_DIAGNOSTIC_SHAPE_SEPARATE_REVIEW_REQUIRED`

## Narrow change

FIX7 closes GH6-R1 without changing product or matrix behavior. The shared diagnostic projector now validates the real producer's schema by status. Attributed recovery/refusal requires a recognized predicate and the exact complete fixed-count shape. Accepted draft and ambiguous states require their complete count shapes without an attributed category. Deterministic `NOT_APPLICABLE` keeps legitimate nullable projected fields. `assertGuideObservation` revalidates both raw and projected diagnostics, so a caller cannot bypass the projector.

Five new controls use the actual shared paths to reject missing attributed records, unknown predicates, and missing/non-integer counts at `DOM_PROJECTED`; validate legitimate producer shapes; and preserve `NOT_APPLICABLE` nullability. All 100 prior control names remain present.

## Evidence

- Ordered-eight digest: `66a56435d7e0c664a12429498b5929b8f308f6217951700c506361d18554e30a`
- Matrix digest: `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`
- Pre-request verifier digest: `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`
- Harness controls: 105/105 PASS.
- Adapter negative: 3/3 PASS, `importerCalls=0`, `successfulRows=0`, zero traffic.
- Adapter syntax: PASS.
- Heavy lease released immediately after verification.

No product, KB, Git, limit, counter, browser, runtime, HTTP, status, capacity, database, Support, model, or lifecycle operation occurred. GUIDE7 live outputs remain absent.

## Murder-case lesson

The repeated cost was accepting a broad enum while validating only part of the associated record. The status looked trustworthy, but its dependent fields were nullable, so a malformed attributed event could be promoted to a successful outcome. This kind of partial schema validation forces another review round because the evidence layer can overstate what the producer proved.

The upgrade is to model diagnostics as a discriminated union owned by the producer, with one validator and projector shared by capture and assertions. Generated fixtures should cover every status and mutate each required field automatically. That would replace hand-maintained status/count combinations and expose incomplete schemas in the first inert run.

For a better one-prompt workflow, the orchestrator should generate the diagnostic union, validator, negative mutations, digest pins, and receipt from one contract. Product review would then inspect the producer contract once, while harness verification mechanically proves every variant. This removes repeated prose interpretation, copied fixture repair, and follow-up packets for missing cases.

## Limits

This is an inert correction and requires separate review. The prior LIVE3 failure remains unattributed, Forgot remains unresolved/actionless, no fresh gate or capture ran, and no CP1 or CP2 acceptance is claimed.

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- Mission heartbeat/orchestrator worker protocol retained from the active session

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

