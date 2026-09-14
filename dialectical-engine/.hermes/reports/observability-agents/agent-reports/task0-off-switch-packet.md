SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:brainstorming, superpowers:systematic-debugging, superpowers:verification-before-completion

# Task 0.3 — capture OFF-switch ruling-request report

- Outcome: authored an evidence/design packet; no architecture ruling, frozen contract, migration, policy, product source, external state, staging area, or commit was changed.
- Recommended location: `${OBS_CONTROL_DIR}/CAPTURE_OFF`, presence = OFF and verified absence = ON; every invalid/indeterminate control read fails closed for capture while product execution remains fail-open and byte-identical.
- Why: it works with Postgres down, is shared by every runtime and FIX-10, stays outside the occurrence spool, and receives audit history from FIX-10's always-appended witness plus `obs.agent_action` when available.
- Alternative priced: `${OBS_SPOOL_DIR}/../.obs-capture-OFF` avoids a new environment input but has no address when `OBS_SPOOL_DIR` is absent and conflicts with the newer main-checkout REQ-FIX proposal.
- Register result: a direct live register row is not a current equivalent because register versions are immutable/pinned, runtime disable must work with Postgres down, and installer bootstrap is import-light. A future row may audit/project the local marker; it should not be the enforcement dependency.
- Critical conflict: runtime-only polling cannot suppress the current Tier-0 fatal writer before deferred runtime arming, and pre-arm emits cannot be labelled `DISABLED`. Full frozen semantics require a narrow V-authorized installer/emit surface amendment; otherwise V must explicitly narrow FIX-07-R03 to armed runtimes.
- `DISABLED` truth: count once at the cached in-memory gate, bulk-count queued entries at cutover, never also count them `QUEUE_FULL`, retain pending count through failed INSERT, and never invent a persisted count after process death. A lost volatile counter makes authority proof stale/missing, never QUIET.
- Query mismatch found: current gap `source` means `first_party|hatchet|ui_client|unclassified`, while the frozen sample query compares it with runtime names. The implementation must not falsify `source` to satisfy that join; schema/query reconciliation is separate.
- Task 0.2 carried forward: writer has no `component_health` rights and `component` is the table primary key. The chosen append-only heartbeat needs separately authorized schema/grant work before FIX-07 acceptance can be truthful.
- Verification requested after a ruling: startup/live OFF/ON, DB-down, unreadable marker, Tier-0, queue-cutover, retry-count, append-only grant, and three-way product-byte tests, each with explicit mutants listed in the packet.
- Source integrity: the authorized worktree still has a generic frozen SPEC and OPEN switch decision; the main checkout has an authoritative untracked plan naming the spool-parent default plus uncommitted REQ-FIX edits naming the control-dir marker. The packet treats both as evidence and asks ARCH to reconcile them.
- Packet: `.superpowers/sdd/PLAN-FixAgent/task0-off-switch-ruling-request.md`.
- Commit: none; this is a ruling-request artifact and the heartbeat protocol does not permit self-approval.
- Status: ready for independent architecture review; not Done.
