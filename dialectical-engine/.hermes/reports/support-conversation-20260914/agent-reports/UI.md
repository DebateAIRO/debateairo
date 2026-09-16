# UI author self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

- Ticket/session: `t_36e6e01e` / `/root/preview`
- Scope: CP1 C3 existing Support UI response, navigation, and stale-snapshot behavior only. No visual redesign, server or knowledge edit, authentication or recovery operation, owner ratification, or checkpoint acceptance.
- Skills actually read: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `test-driven-development` with `writing-good-tests`, `verification-before-completion`, and `systematic-debugging` after failures.

## Findings

The largest avoidable cost came from dependency installation state. The UI package lacked its direct workspace dependency on `@debateai/support-kb`, which correctly made the first GREEN attempt fail at module resolution. The authorized offline filtered install then recreated the worktree dependency tree before discovering that the local pnpm store did not contain the `@types/react` tarball. It neither accessed the network nor changed dependency versions, but recovering the isolated lane required cloning the already-installed source checkout's root and workspace `node_modules` trees and adding the normal UI workspace symlink. A future packet should include a preflight that checks every lockfile tarball in the selected offline store before pnpm receives permission to recreate a dependency tree. The supported fallback should also be written down as an exact local clone recipe with source and destination ownership.

The browser harness initially waited for Next's `networkidle`, which never arrived because the development client keeps connections open. Switching to `domcontentloaded` exposed a second timing issue: the server-rendered composer was visible before React hydration, so the first click had no handler and no Support POST occurred. An explicit EN/RO `aria-pressed` state transition is a cheap hydration handshake for this established interface. Browser packets should specify a product-visible readiness selector and one hydrated state transition rather than a generic network state.

Repository typecheck does not include the changed TSX component. The separate UI package check found and localized one real new error in stored-language narrowing, while root typecheck retained 76 baseline diagnostics. Comparing machine-readable diagnostic identities showed zero introduced diagnostics, but only the dedicated UI check proves the component compiles. Future mission plans should derive typecheck commands from each allowed file's owning TypeScript project and retain the immutable baseline comparison as a distinct repository-health result.

The stale-session contract benefited from testing the whole observable sequence instead of only branch coverage: A message, fresh-session creation, B message, identical redacted request bodies, exact tokens, one visible user turn, and persistence without A. The first second-mismatch test found that B could remain in storage after the retry failed. Adding an assertion on storage state caught this custody bug before browser work. High-value retry requirements should arrive as an ordered trace table that includes durable state after every terminal path.

Boundary mutation probes were more useful than repeated passing runs. Suppressing rendered actions failed all four EN/RO and full/compact cases; omitting canonical href equality failed the targeted forged-href assertion; a nearby unrelated status-text mutation did not affect that assertion. The restored final cluster was then enough. This pattern should be generated from the invariant table in the packet.

The exact Forgot-password destination remained unresolved throughout implementation. Keeping its action list empty prevented a guessed recovery route or credential flow, but it also means the mandatory click cannot be accepted in this node. The destination should be a named predecessor artifact before UI dispatch, with route ownership, authorization semantics, and a browser acceptance case.

## One-prompt improvements

1. Attach copyable baseline, RED, final, package typecheck, browser, and stack commands with their required execution mode and expected output schema.
2. Add an offline-store completeness preflight and an approved worktree-local dependency restoration recipe before any install command.
3. Generate client validators and fixture builders from the server response schema plus the closed catalog, leaving only presentation and retry orchestration to hand-written UI code.
4. Express retry invariants as an ordered transport-and-storage trace so tests can be generated before implementation.
5. Provide a reusable browser receipt harness with explicit hydration readiness, EN/RO and viewport matrices, DOM/accessibility assertions, screenshots, TLS mode, and synthetic-versus-real labels.
6. Generate the allowed-path staging command, blob manifest, test-log hashes, and ticket result payload from Git and the packet to prevent transcription mistakes.

Actual usage UNAVAILABLE.
