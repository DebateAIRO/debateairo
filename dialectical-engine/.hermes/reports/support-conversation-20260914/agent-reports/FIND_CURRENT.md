# FIND_CURRENT self-report

Ticket `t_86e6f2a1` was a bounded, read-only attempt to identify the owner-confirmed Forgot-password destination in the current source, relevant local history/worktrees, and the two already-running login targets. No product, Git, service, credential, authentication, reset, or model action was performed.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding

The inspected current checkout contains a password-recovery **initiation primitive**, not a verified user-facing flow. `POST /v1/auth/recovery/start` accepts an email and returns one fixed enumeration-resistant message. It supplies no redirect, `Location`, path, href, opener identity, or completion UI. No inspected UI caller invokes `startRecovery`. The login component and both rendered login targets expose `/sign-up`; their only recovery affordance after a successful password challenge is a saved MFA recovery code, which is a different mechanism.

This does not prove that the owner-confirmed flow is absent from every possible source. It means its canonical destination was not located in the current checkout at `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`, the bounded relevant auth refs/worktrees/history, the two supplied design documents, or the live `https://localhost:3000/login` and `https://localhost:3100/login` targets. The Support action must therefore remain unresolved rather than linking to the POST endpoint, `/settings`, the MFA recovery-code branch, or a guessed route.

## What repeatedly cost time and tokens

1. The requirement named a feature but did not bind it to a route, opener ID, or owning package. Each later author had to rediscover the same ambiguity.
2. “Recovery” names three different concepts in this repository: a recovery email, MFA recovery codes, and password-recovery initiation. Searches repeatedly surfaced valid but irrelevant MFA code paths.
3. The server has a public initiation contract while the UI test explicitly requires the login source not to contain `forgot`. Without a cross-layer capability map, backend presence can be misread as a complete journey.
4. The first browser-control surface was unavailable, so evidence progressed through static HTML and then the already-installed repository Playwright wrapper. That was safe, but a declared capture capability in the packet would have avoided the extra discovery step.
5. Concurrent source and mission work changed dirty counts while this read-only task ran. Scoped hashes and path-level status were more useful than whole-tree cleanliness claims.

## Upgrades that make the next run testable

- Give every owner-required navigation action a stable capability ID with an exact route or opener identity, owning component, authentication state, and whether it causes a side effect. Support should consume that registry rather than free-form URLs.
- Complete the password-recovery journey as an explicit first-party UI contract: a navigable GET page or opener for email entry, the existing POST start call behind form submission, and a separately specified channel/completion target. The current POST route alone is not a browser destination.
- Replace the source-only assertion that login contains no `forgot` text when the product flow is implemented with a behavioral test that the signed-out control is visible, has the canonical destination, and does not submit a recovery request merely by opening it.
- Add a preflight command that prints a safe capability inventory from the route registry and verifies the same link/button in the compiled login DOM. A mission prompt can then name one capability ID and one expected route instead of asking agents to infer product topology.
- Freeze a small evidence schema at dispatch: source revision, capability ID, source opener, rendered href, target status, and side-effect boundary. That would let one prompt drive source inspection, DOM verification, and a truthful unresolved result without broad searches or repeated owner questions.

## Skills and limits

Skills actually loaded in this continuing session: `superpowers:using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `superpowers:verification-before-completion`; the earlier implementation phases also loaded `superpowers:systematic-debugging` and `superpowers:test-driven-development`, but no code skill was exercised for this read-only node. Usage is UNAVAILABLE.

