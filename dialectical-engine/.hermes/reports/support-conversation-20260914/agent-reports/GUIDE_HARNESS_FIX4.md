# GUIDE_HARNESS_FIX4 self-report

## Identity and result

- Node: `GUIDE_HARNESS_FIX4`
- Ticket: `t_4e6af872`
- Session: `/root/preview`
- Revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Result: `PASS_INERT_SAME_DESTINATION_CORRECTION_SEPARATE_RECHECK_REQUIRED`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and worker-role instructions retained from this author session

## Work and evidence

I accepted the REVIEW3 diagnosis and copied FIX3 into new FIX4 harness and adapter namespaces. The matrix and product are unchanged. Navigation activation now uses one helper in the existing hashed controls file. The capture still verifies the closed action, performs the requested pointer or keyboard operation, and checks the exact resolved destination; it skips only the impossible change wait when the browser is already at that destination.

The inert frame passed 69/69 at the exact product and KB: all previous 65 controls plus same-destination pointer, changed-destination keyboard, wrong-destination, and missing-activation regressions. The copied adapter negative passed 3/3 before import and the replay adapter parsed. Harness digest is `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`; adapter digest is `bc265096f5211771c214c0aa63af1977618a1f536aeb1ec0be3b36017ddbb97a`. Heavy lease was released immediately after execution.

The board CLI read again failed on the local SQLite init-lock `EPERM`; root read the comments and persisted the claim. No retry was made. Usage and token accounting are unavailable.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The proximate cause was an assertion about motion rather than outcome. The harness treated every successful navigation as a URL change, even though activating Help from Help has a correct stable destination. The action itself, its exact href, and the final URL were already the meaningful facts.

The upgrade is to test state transitions with an explicit initial state and expected terminal state. Wait only when those states differ, but always execute the action and always assert the terminal state. Keep this orchestration in a small pure helper inside the hashed harness surface, then test both branches and their failure modes without starting the browser.

The repeated token cost came from discovering deterministic harness assumptions only after fresh stack and capacity work. A better one-prompt pipeline orders work as: immutable matrix review, pure orchestration controls, full digest binding, exact-product row-proof replay, then one fresh live gate. Standard delta and receipt generators also remove repeated prose reconstruction and make separate review focus on four changed files instead of the whole mission archive.

## Limits

No live gate, 54-row replay, browser, HTTP, database, Support, model, provider, or lifecycle action ran. Fixed future capture outputs remain absent. Separate baseline recheck is required before LIVE3, and this report does not claim checkpoint readiness or acceptance.
