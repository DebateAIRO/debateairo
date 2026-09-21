# GUIDE_CORRECTNESS8 self-report

## Assignment and result

- Node/ticket/session: `GUIDE_CORRECTNESS8` / `t_769ab051` / `/root/plan_review`
- Revision: clean detached reviewer and frozen primary `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`
- Delta base: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- Verdict: **PASS for the finite nine-path restricted-role correction**
- Product work: none
- Heavy lease: released after the one approved four-suite execution and link cleanup

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Murder-case reconstruction

The failure was architectural and deterministic: every admitted injection reached a repository method that attempted `UPDATE support.session SET state='LOCKED'`, while the supported API principal is intentionally denied that column privilege. Admin-pool route tests concealed the mismatch. The correction removes the second mutation and treats immutable `INJECTION`/`LOCK` rows as the effective state source. Admission, public read, IP cooldown, and status now agree without widening database authority.

The new regression uses a provisioned `SUPPORT_DATABASE_URL` for the real session and message repositories. Its model fixture cannot mask the database operation because the observed message port forwards to the restricted cipher/repository and only counts relay transit. Indexed RED proves the same assertion failed at the base; my final frame proves it passes with the supported role.

The stale principal-count failures were separate fixture drift. The principal declaration is unchanged at 11 entries and has the same hash at base and final. Deriving all count assertions from that declaration preserves the exact membership and privilege checks while removing literals that had already become false.

## Efficiency lessons

Every role-sensitive integration path should run at least one contract test through the provisioned role rather than an administrative pool. That one test would have prevented the failed live attempt and the later forensic node. The architecture test should continue forbidding privileged substitutes so fixes cannot silently widen authority.

State should have one source. Recording immutable abuse events and separately mutating a session-state column created two representations, another database round trip, and an impossible privilege requirement. Deriving read/admission/status views from the event source reduces code, permissions, tests, and debugging branches.

Generated inventories should export or consume one cardinality. Five failures and an extra correction cycle came from repeating `12` after the declared list moved to 11. The source-derived assertions now make future membership changes fail on content or privilege, not stale bookkeeping.

## Evidence and limits

- Custody: 53/53 inputs and 144/144 frozen product files per lane; exact nine-path delta; both lanes clean.
- Scoped frame: rc 0, 4/4 files, 191/191 tests.
- First refusal, immutable threshold, concurrent/configured threshold, later 429, `openSessions`, forbidden `UPDATE(state)`, and source-derived principal membership all passed.
- No extra discriminator was needed because the four-suite frame directly exercised every assigned boundary.
- Prior guide catalog/navigation/source/fallback/recovery and case/migration bytes are unchanged; their prior finite PASS is retained by byte custody.
- Author evidence retained: 34 files / 1,699 passed / one TODO; 76 inherited type diagnostics byte-identical; structural 3×60/60 with rubric PENDING; strict 44-entry snapshot.
- Five links absent, both lanes clean/exact, heavy released before packaging.
- LIVE6 first exception remains unobserved; no causal relabeling, full34/typecheck/eval rerun, live traffic, browser/preview work, actual54 completion, Forgot resolution, readiness, checkpoint, or acceptance claim.
- Usage: **UNAVAILABLE**. User alone accepts CP1.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill body was read for this continuation.

