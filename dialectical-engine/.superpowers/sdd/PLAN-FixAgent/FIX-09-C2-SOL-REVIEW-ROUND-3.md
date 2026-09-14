# FIX-09 C2 Sol re-review — round 3

Date: 2026-09-04

- Immediate range: `480a148d658f5d535588f164bb40de181ffb4562..4d598fd91d7db20d0f884871215203bdc7f608ec`
- Accumulated C2 range: `daa8908d918da1ab137014f68c89e752bd406428..4d598fd91d7db20d0f884871215203bdc7f608ec`
- Reviewed HEAD: `4d598fd91d7db20d0f884871215203bdc7f608ec`
- Scope: only R2-F1 and R2-F2 plus new breakage introduced by the immediate fix
- Repository acts: this report only; no product, specification, test, C1, V, C3, C4, merge, push, board, or Hermes act

## Verdicts

- **SPEC: PASS.** The clean migration remains byte-identical, and the revised PostgreSQL proof enforces the exact non-owner publisher EXECUTE grantee set.
- **CODE QUALITY: PASS.** Both round-2 findings are addressed. No P0-P3 breakage was found in the immediate two-file fix.

## Finding dispositions

### R2-F1 — ADDRESSED

`tests/integration/fix09-daemon.test.ts:260-280` now expands the ACL of the exact no-argument `obs.occurrence_seq_nextval_notify()` routine with `pg_catalog.aclexplode`. It excludes only the routine owner, retains every other direct EXECUTE grantee, and asserts that the complete result is exactly one `debateai_obs_writer` row. No role allow-filter remains.

The source check at lines 281-289 now splits SQL statements, normalizes whitespace and case, and requires the sole normalized `GRANT` statement to be the writer grant. The catalog assertion is the authoritative semantic check, so comments, case, indentation, or other spelling differences cannot conceal an applied extra direct grantee.

Independent real-PostgreSQL mutations against a disposable archive of reviewed HEAD produced:

- Exact former survivor, indented lowercase grant to `debateai_obs_human`: **KILLED**, exit `1`; the catalog result contained human plus writer.
- Mixed-case/indented grant to `debateai_obs_watchdog`: **KILLED**, exit `1`; the catalog result contained watchdog plus writer.
- Safe inverse control, replacing the clean statement with an indented mixed-case writer-only grant: **PASSED**, `1 passed`, exit `0`; writer insertion/commit notification succeeded and listener execution remained denied with SQLSTATE `42501`.

The committed migration itself did not change from `480a148d`; its independently computed SHA-256 is still `4b600044eaeb628091a23206a3e266c6fe85b99f8bc0bc1478b4b2aee762ddec`.

### R2-F2 — ADDRESSED

`.superpowers/sdd/PLAN-FixAgent/FIX-09-C2.md:103-112` now records and accurately identifies:

- C2.1: `95d0908be3334f01c7e175c7253306e77ff147fa`
- C2.2: `4fdfa192356ec830c5a420d6469d94b80d3c8308`
- C2.3: `f42164153c3694eedb2454e7d2ac0883e2f6b74a`
- C2.4: `b8f63a84761fb4f3f0931bbc33fe0d730f1f1b64`
- First review rework/final HEAD reviewed in round two: `480a148d658f5d535588f164bb40de181ffb4562`

The identifiers and subjects match the Git history. The report correctly distinguishes the reviewed `480a148d` HEAD from the later proof/report correction commit now under review. Its clean focused, C1 hash/interface, migration hash, static, typecheck-baseline, and whitespace claims reproduced within this bounded review.

## New breakage in the fix diff

### P0

None.

### P1

None.

### P2

None.

### P3

None.

The immediate diff changes only the implementation report and `tests/integration/fix09-daemon.test.ts`. No production, migration, schema, frozen specification, or C1 byte changed.

## Verification evidence

- Focused `fix09-fold` plus `fix09-daemon`, three fresh real-PostgreSQL 18.4 runs: each `2 passed`, `20 passed`, exit `0`.
- Exact human-role survivor: killed by the complete catalog ACL projection.
- Watchdog-role case/indentation neighbor: killed by the complete catalog ACL projection.
- Writer-only case/indentation control: passed; source normalization accepts the equivalent statement while PostgreSQL retains the exact singleton writer grant.
- `git diff --check` passes for the immediate and accumulated ranges.
- Migration diff `480a148d..4d598fd9`: empty.
- Migration SHA-256: `4b600044eaeb628091a23206a3e266c6fe85b99f8bc0bc1478b4b2aee762ddec`.
- Independent C1 bundle hash: `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- C1 interface fixture compile: exit `0`.
- Immediate scope is exactly the report and focused integration test; accumulated scope remains the authorized C2 documents/report, migration/schema parity, daemon modules, and C2 tests.
- The implementation report contains no trailing whitespace.

## Frozen boundary

This re-review does not reopen prior closed F1-F6 behavior beyond R2-F1/R2-F2, and does not review or perform V, C3, C4, integration, merge, push, board, launchd, or production work.
