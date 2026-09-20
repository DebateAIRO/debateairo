# BUILD-S01-C1 — case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The cluster landed as commit `31d6dee5`. Three independent cluster runs were GREEN at binding 9/9, privileges 3/3, tier regression 6/6, and route-privilege regression 1/1. Typecheck returned the inherited 70 diagnostics and none named an allowed path. The implementation boundary is visible at `migrations/0066_free_public_rule.sql:1-24`, encrypted creation at `packages/db/src/index.ts:1239-1318`, and legacy creation at `packages/db/src/index.ts:1331-1362`.

VERDICT: the C1 artifact is ready for slice review / CONFIDENCE: high / STRONGEST COUNTER: this node proves an ephemeral migrated database, not V's eventual served-lane acceptance walk.

## Ranked causes and upgrades

### 1. The packet names an outcome but not the existing fixture invariants

The plan asks C1 to insert a `PRIVATE` `core.run_visibility_event` (`PLAN.md:108`) but does not name the v2 binding trigger, the publication-snapshot foreign key, or the private-content trigger. The first hand-written rows also used `agent_count=0`, hidden by the initial missing-column RED. Finding the complete legal shape took four failed layer attempts plus six read-only ephemeral-schema probes. Price: about 8 minutes, 10 retries/probes, and an estimated 6k–8k transcript tokens. I nearly "fixed" production when the defect was only test data. The final count-only fixture deliberately uses `session_replication_role=replica`, isolated to the test transaction.

Upgrade: packets that require low-level row insertion should provide one approved fixture constructor or exact source range containing it. VERDICT: highest token-saving change / CONFIDENCE: high / STRONGEST COUNTER: copying fixture details into packets can drift; a shared test helper is the lower-drift remedy.

### 2. A 42501 privilege test can fail at the wrong boundary

The first nobody-role test passed even when the predicate was explicitly granted to PUBLIC because the role lacked `USAGE` on schema `core`. Two mutation runs therefore appeared green for the wrong reason. Granting schema usage while withholding function EXECUTE made the assertion isolate the intended ACL (`tests/integration/fpd-s01-c1-privileges.test.ts:39-50,102-107`). Price: about 3 minutes, two false-negative mutant runs, and roughly 2k tokens. I nearly reported the PUBLIC revocation as pinned when it was not.

Upgrade: the SET ROLE template should state "grant prerequisite schema usage, deny only the capability under test." VERDICT: add to the privilege-test template / CONFIDENCE: high / STRONGEST COUNTER: some tests intentionally assert schema denial, so the template must name the boundary rather than always granting usage.

### 3. The reading floor is not mechanically enumerable

The packet says to read only named lines (`BUILD-S01-C1.md:3`) but identifies `DECISIONS.md` as "the sections your steps cite" without enumerating those sections (`BUILD-S01-C1.md:10`). I read the whole decisions file to resolve those references. Price: one oversized read plus a truncated-output retry, estimated 8k–12k tokens. This was the largest avoidable context charge and the clearest place where this packet was unclear. The cwd statements also disagree in wording: COMMON names the mission-home tree (`COMMON.md:3`) while the seat packet commands the slice lane (`BUILD-S01-C1.md:9`); the direct seat packet and user instruction decided the lane.

Upgrade: packet generation should emit exact DECISIONS section numbers and one authoritative cwd field. VERDICT: generate a machine-readable read manifest / CONFIDENCE: high / STRONGEST COUNTER: line anchors drift, so section-heading hashes are safer than frozen line numbers.

### 4. Ordered steps and RED order conflict

C1-S8 appears after the migration work but says its privilege test must be RED before C1-S3 (`PLAN.md:204-212`). C1-S9 similarly arrives after the migration whose allow-list it pins. I resolved this by authoring every behavior test before product code, while preserving the named six-case C1-S2 frame first. Price: about 2 minutes of plan reconciliation and roughly 1k–2k tokens; no code retry.

Upgrade: packets should carry a separate ordered `RED EVENTS` list, then the implementation order. VERDICT: adopt the existing tooling-trap rule mission-wide / CONFIDENCE: high / STRONGEST COUNTER: this duplicates step references, but stable step IDs make the duplication mechanical.

### 5. Shell quoting and exact optional properties each bought one avoidable retry

My first static gate nested SQL single quotes inside a single-quoted `zsh -c`, stripping the literal quotes and returning rc=1. Price: one failed gate, one diagnostic run, one rerun, under 1 minute and about 1k tokens. The first typecheck also exposed `planTier: undefined` under `exactOptionalPropertyTypes`; omitting the key returned diagnostics from 71 to the measured 70. Price: one extra typecheck and under 1k tokens. These were mine, not packet defects.

Upgrade: static checks should be small checked-in scripts or argument arrays, not nested shell strings; test builders should conditionally spread optional keys. VERDICT: use generated probe scripts for quote-bearing SQL checks / CONFIDENCE: high / STRONGEST COUNTER: a script file adds an artifact, so the packet must grant a probe path or provide the generator.

## Dead ends and negative evidence

- Removing the explicit predicate `REVOKE` did not change behavior because database default privileges already denied PUBLIC. That neighboring mutant correctly stayed green. Explicitly granting PUBLIC produced RED after the schema-usage fix.
- A DROP/recreate mutant lost the content-provision role's EXECUTE grant and was caught; `CREATE OR REPLACE` at `migrations/0066_free_public_rule.sql:23` preserves it.
- Default-true, marker-ignored, NULL-binds, encrypted-marker-false, legacy-marker-false, extra-key-allowed, missing-key-NULL, helper-always-false, wrong-Drizzle-column, side-effecting-predicate, missing-role-grant, PUBLIC-grant, and DROP/recreate mutants all produced their expected RED frames and were restored. `git status --porcelain` after each restore contained only the six allowed paths until commit, then was clean.

## One-prompt-machine recommendation

Generate three machine-readable blocks in every BUILD packet: exact read manifest; ordered RED/mutant matrix with expected case counts; and fixture dependencies with a canonical constructor. Then have packet-check execute the read manifest and validate that each mutant has a unique log before READY. VERDICT: this would remove most interpretive tool turns in this seat / CONFIDENCE: high / STRONGEST COUNTER: generated matrices become ceremony unless architecture owns and reviews them alongside the plan.
