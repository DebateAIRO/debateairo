# GUIDE_HARNESS_FIX6 self-report

## Identity and verdict

- Ticket: `t_fd7f8bf9`
- Session: `/root/preview`
- Model: `gpt-5.6-sol`
- Base product: `5731eb6faac25f9712f04aea029a021f6eee9352`
- Final clean product: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- KB: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Verdict: `PASS_INERT_STAGED_SAFE_OBSERVATION_SEPARATE_REVIEW_REQUIRED`

## What changed

I copied the sealed FIX5 harness and row-proof adapter into new FIX6 namespaces. The capture and inert verifier now use one staged observation consumer. It checkpoints canonical attempt metadata on API projection failure, the allowlisted public API response immediately after projection, DOM and equality only after rendering succeeds, and fixed diagnostic fields only after diagnostic projection succeeds. Phase-specific closed codes preserve the last safe checkpoint when later work fails. Attempted and completed row counts are separate.

The final adapter binds the full ordered-eight digest before dynamic import and the constructor proof digest before any row projection. The exact matrix, source policies, actions, branches, navigation contracts, pacing, sessions, capacity contract, and no-retry rule did not change.

## Verification and custody

- Ordered-eight digest: `6444862b9d465565a5416cec763a92216a04eb042bafe833dab43135c00debd2`
- Matrix digest: `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`
- Pre-request verifier digest: `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`
- Reviewed `Assistant.tsx`: `5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3`
- Harness controls: 100/100 PASS. All 91 prior names remain present; nine actual-consumer controls cover staged failures and privacy.
- Adapter negative: 3/3 PASS, `importerCalls=0`, `successfulRows=0`, zero traffic.
- Adapter syntax: PASS.
- Heavy lease was released immediately after the bounded frame.

No product, KB, Git, limit, counter, browser, runtime, lifecycle, HTTP, database, Support, or model operation occurred. No actual GUIDE6 receipt, screenshot, or browser profile was created.

## Murder-case findings

The direct defect was an evidence-ordering flaw. The old capture received a public API response but delayed its safe checkpoint until DOM and diagnostic work finished. A later failure could erase the only useful response evidence and leave the team unable to distinguish product behavior from capture failure. FIX6 moves evidence preservation to the earliest safe boundary and makes every later stage additive.

Three process patterns repeatedly cost tokens:

1. **Harness and product contracts drifted separately.** Action, source-policy, recovery, navigation, and language semantics were corrected in several rounds because the harness restated product rules. Product-owned exported contracts reduced that duplication. Future plans should require a single producer declaration consumed by runtime and verifier from the start.
2. **Evidence was captured too late.** Reconstructing lost outcomes triggered extra packets, reviews, and proposed reruns. Every external boundary should project and persist safe evidence immediately, then add DOM, diagnostic, screenshot, and navigation evidence in stages.
3. **Revision and digest binding happened late.** Rebinding copied adapters after each product correction generated administrative churn. A single final-binding phase should be designed into the first packet: prepare revision-independent code, freeze product once, mechanically stamp revision/KB/digests, run one inert frame, and dispatch review.

## What to upgrade

- Make staged checkpointing a reusable mission primitive with a typed phase schema, exact allowlists, closed error codes, and an atomic writer. Future capture authors should import it instead of rebuilding observation logic.
- Generate harness copies, namespace substitutions, digest pins, receipts, custody manifests, and output-absence records from one deterministic packager. Hand-edited copied paths and stale names are avoidable.
- Make the product publish machine-readable public-guide contracts for source policy, action admission, recovery selection, language aliases, and navigation destinations. The verifier should consume these contracts directly.
- Add a preflight that runs the exact shared consumer on inert fixtures before any fresh-capacity window is opened. Live gates should then perform only custody, fresh capacity, 54 row proofs, and capture.
- Keep a single immutable event record per row with `attempted`, `apiProjected`, `domProjected`, `diagnosticProjected`, and `completed` timestamps. This prevents ambiguity and reduces follow-up diagnosis.

## Toward a one-prompt machine

A stronger one-prompt workflow would compile the owner request into a dependency graph with four generated layers: product changes, immutable independent reviews, an inert executable contract, and one live capture. The orchestrator should block live traffic until all product exports and harness expectations derive from the same reviewed declarations; then it should freeze once, generate all manifests and pins, run the exact suite once, and execute the finite capture once. Each failure should route automatically from a closed code to its owning layer without asking the owner to restate intent or starting another sampling cycle.

The remaining human decisions should be true product decisions: the unresolved Forgot destination and eventual checkpoint acceptance. Mechanical custody, evidence packaging, retries, leases, and review input construction should be generated.

## Limits

This is an inert harness result, not CP1 readiness or acceptance. The prior LIVE3 response predicate and origin remain unknown. Forgot remains unresolved/actionless, a fresh capacity-bound live gate has not been created, the 54-row browser capture has not run, and CP2 remains gated. Separate bounded review is required.

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- Mission heartbeat/orchestrator worker protocol retained from the active session

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

