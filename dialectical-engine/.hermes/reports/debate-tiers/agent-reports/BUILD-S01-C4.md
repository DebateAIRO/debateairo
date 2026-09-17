# BUILD-S01-C4 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the reading floor consumed the run before the claim

CAUSE: the packet requires the full spine because a named skill points to it (`.hermes/planning/debate-tiers/packets/BUILD-S01-C4.md:3`), while the spine's own v4 verbosity law says BUILD reads its bounded cluster (`docs/agent-protocols/debateai-heartbeat-protocol.md:1850`). PRICE: the spine was 2,167 lines and the first read alone reported 30,577 output tokens; truncation forced four chunk reads before source work. UPGRADE: make the router skill quote the binding v4 clauses or name exact spine ranges in BUILD packets. VERDICT: replace full-spine loading with exact v4 ranges / CONFIDENCE high / STRONGEST COUNTER: a full read prevents an older preserved law from being missed.

## Finding 2 — the typecheck extractor cannot satisfy its own empty-delta criterion

CAUSE: the packet's extractor accepts any text before `(`, including indented TypeScript continuation prose (`BUILD-S01-C4.md:29`). It emitted `  Property 'repoRoot' is missing...` as a filename after my real diagnostic was removed. PRICE: two post-fix typecheck reruns, about four seconds, both false-RED under the literal `comm` criterion. UPGRADE: require a non-whitespace first character (`sed -n 's/^\([^ (][^(]*\)(.*/\1/p'`) or parse `path(line,column): error` completely. VERDICT: patch the packet template's extractor / CONFIDENCE high / STRONGEST COUNTER: a future legitimate diagnostic path could contain a leading space, but repository-relative compiler paths do not.

## Finding 3 — cited BASELINE ranges had drifted

CAUSE: the packet cites C4 rows at `BASELINE.md:96-100` and `:127-132` (`BUILD-S01-C4.md:10`), but the current lane records those suites at `BASELINE.md:205-248` and again at `:329-372`. PRICE: one extra indexed search and a misleading initial slice read. UPGRADE: packet generation should resolve suite names to current lines immediately before dispatch, or cite stable headings plus suite names. VERDICT: re-grep volatile line anchors at dispatch / CONFIDENCE high / STRONGEST COUNTER: line anchors are cheaper for seats when the source is frozen.

## Finding 4 — CLAIM ordering conflicts with the comment-scan law

CAUSE: the dispatch asks for CLAIM first, then reading comments, while the spine requires the full ticket scan before claim (`docs/agent-protocols/debateai-heartbeat-protocol.md:871-875`). PRICE: the CLAIM could only truthfully cite dispatch cursor 1, followed by a second board read to reach comment 2. UPGRADE: standardize on show-ticket, then CLAIM, and have the packet state that sequence once. VERDICT: comments-before-CLAIM / CONFIDENCE high / STRONGEST COUNTER: posting CLAIM immediately gives the orchestrator faster liveness evidence.

## Finding 5 — a non-unique mutant patch nearly crossed the file contract's intent

CAUSE: I mutated a bare `gap: 10px` without selector context; it changed `.supportWidget` at `globals.css:248`, not `.ndTier`. The immediate diff caught it before a test ran. PRICE: one failed restore attempt plus two corrective tool calls, about one minute. UPGRADE: every mutation patch hunk must include its selector or enclosing symbol, followed immediately by a zero-context diff. VERDICT: selector-context mutants only / CONFIDENCE high / STRONGEST COUNTER: unique literals do not need extra context, but uniqueness was not measured here.

## Finding 6 — verification was run before the test contract froze

CAUSE: I ran the first three-run cluster table, then noticed the colour guard did not distinguish token-backed `border-color` from allowed `background: transparent`. PRICE: a second full table — 33 additional suite invocations and about 33 seconds, with repeated inherited-failure output. DEAD END: preserving the first table as final evidence would have violated fresh-verification law. UPGRADE: perform the mutation checklist and typecheck once before the first three-run gate. VERDICT: freeze assertions before the three-run gate / CONFIDENCE high / STRONGEST COUNTER: late adversarial inspection is still preferable to shipping a weak assertion.

## Finding 7 — fixed scratch filenames destroyed two full RED logs

CAUSE: the early tail-mutant and typecheck scripts reused fixed log names; later GREEN runs overwrote the original full RED files, contrary to the addressability requirement (`BUILD-S01-C4.md:30`). The exact RED frames remain in the session transcript, but rebuilding log files from them would be reconstructed evidence. PRICE: those two full RED logs are UNVERIFIED for reviewer filesystem access; all focused refutation logs and the three final cluster logs remain intact. UPGRADE: every script derives an immutable run id, opens logs with no-clobber semantics, and prints the chosen path before execution. VERDICT: immutable evidence filenames / CONFIDENCE high / STRONGEST COUNTER: scratch directories are short-lived, but this protocol explicitly requires them to survive through REV.

## What worked

The disjoint-writer contract was observable: every restore showed C3's three paths separately, and `git commit --only` produced commit `5e3e4bcf` with only C4's two paths. The capture-first scripts retained every full log under `/tmp/debate-tiers-build-s01-c4-01a08858/`, while console output stayed bounded. No token or `t9-mode-tokens` map row was added; that avoided a whole unnecessary branch of S01-41.
