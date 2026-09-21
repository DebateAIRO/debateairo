# FIX-S01-p1-A self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding

The failure was not one bug. It was a broken chain of custody between “an answer was served” and “the publication is durably recoverable.” The original implementation attached the hook to one of two full-answer routes, created retry work only after known failure returns, and trusted the first visibility read across a concurrent publication. That combination allowed three false states: a served Free answer never attempted publication, a thrown attempt left no retry row, and a losing attempt reintroduced `publish_pending` after another attempt had already published.

The database boundary had the same pattern. Boundness was checked at transition time but not prepare time. The DENY audit wrapper accepted a run without evidence that an actual bound auto-publish attempt was outstanding. Retry timing used `clock_timestamp()` on every failure, so a permanent failure ran at every scheduler tick forever. The C2 database suite also depended on the host locale and could silently skip all tests on SQL_ASCII.

## Evidence that found it

- Re-derived RED tests produced C2 unit 9/5 and database 13/7 before the fix.
- `LANG=C LC_ALL=C` reproduced the C2 database suite as 0/0; the UTF-8 pin makes the same suite 20/0.
- T8 now fails the bound-PRIVATE unpublish case (10/1 instead of 11/0).
- T10 now fails the exact decrypted snapshot assertion (13/1 instead of 14/0).
- The final seven-suite C2+C3 cluster was green three times on the committed revision, across ambient and explicit UTF-8 runs.

## What should be upgraded

1. Treat auto-publication as a durable state machine. Enqueue before fallible work, clear only on PUBLISHED or terminal BLOCKED, and re-read after every false/null/exception race exit. Keep the visibility projection defensive so PUBLISHED can never expose `publish_pending` even if stale work exists.
2. Put admission checks at the earliest privilege boundary. Prepare now requires the persisted Free-public predicate; audit DENY now requires both a bound run and outstanding work. Future SECURITY DEFINER wrappers should ship with an explicit admission matrix test under `SET ROLE`.
3. Keep retries infinite as V-2 requires, but use capped exponential delay. This preserves eventual recovery without producing roughly one audit row every 30 seconds forever.
4. Centralize “full Answer served” behavior. There are exactly two `AnswerSchema.parse` response sites and both now call one helper. A future full-answer route should be forced through that helper by a static or route-inventory test.
5. Ban locale-dependent embedded database setup. Use the shared helper, or enforce the exact UTF-8/init flags. The runner should report a suite-level `beforeAll` failure with skipped tests as `BROKEN`, not merely RED.

## What repeatedly cost tokens

- Review probes encoded old behavior and old repository-double interfaces. They had to be preserved, rerun, interpreted, then replaced with re-derived expectations. Probe metadata should declare whether PASS means healthy or proves the defect, plus an interface version.
- Evidence was split across the union, three lens reports, SPEC sections, decisions, packet, probe READMEs, and raw logs. A generated finding manifest could carry the authoritative requirement, detector, old expectation, corrected expectation, affected files, and exact suite pair in one record.
- Counts were implicit. The useful sweeps were five fallible attempt sites, two race exits, two full-answer routes, three direct EmbeddedPostgres constructors, and seven affected cluster suites. Packets should emit these as machine-checkable arrays rather than prose.
- Mutation restoration needed a new path-partitioned harness because the promoted harness required a globally clean tree. The standard harness should always compare only the mutated path’s bytes and status.

## Toward a one-prompt machine

Generate the FIX packet from a structured review artifact. Each finding should provide: requirement id, RED command, expected failure name, mutation literal or fixture, allowed files, class members, corrected oracle, and final cluster command. The runner should emit JSON containing pass/fail/skip counts, failed case names, locale, commit, and a `GREEN|RED|BROKEN` verdict. A completion tool could then refuse commit until every detector has shown RED before the edit, GREEN after it, every declared mutant is caught and restored, typecheck has no allowed-path delta, and the exact final cluster is green three times. That removes most manual transcription while preserving the adversarial checks that found this class of defect.
