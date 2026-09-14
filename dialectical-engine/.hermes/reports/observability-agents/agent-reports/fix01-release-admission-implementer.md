SKILLS LOADED: using-superpowers, brainstorming, executing-plans, test-driven-development, writing-good-tests, systematic-debugging, verification-before-completion, receiving-code-review, using-git-worktrees, heartbeat-protocol, heartbeat-worker, finishing-a-development-branch
# FIX-01 SPEC-v3 release-admission implementer report

## Verdict

IMPLEMENTATION PASS for the controller-ratified general contract. Concrete production-directory admission was not performed and remains V-only and pending.

The exact tracked change is new binding `SPEC-v3.md`, three controller-owned append-only decision records, offline `tools/obs-spool-release-admission.ts`, and `tests/architecture/fix01-spool-release-admission.test.ts`. Runtime, installers, C4 code, migrations, previous specs, and package commands are unchanged.

## Security and recovery properties

- Offline-only sorted enumeration; no runtime/installer import or call.
- Absolute canonical directory and safe external O_EXCL/NOFOLLOW manifest output.
- Every canonical regular single-link pre-index spool is hashed twice, classified, indexed, and left byte-identical, including invalid/partial/oversized bytes.
- Unsafe canonical paths remain explicit and unindexed. Noncanonical raw names become opaque SHA-256 references, preventing planted filename secrets from entering durable evidence.
- Index/cursor hardlinks and unsafe types fail closed without victim mutation. The current framed index format is used unchanged and partial prefixes recover on the next complete append.
- A final index identity/hash reread occurs after the second source snapshot. Changed sources or index produce no PASS manifest.
- `requires_v_review` is true whenever rejected entries exist. Such a PASS proves only lawful-candidate coverage and cannot independently authorize release.
- Real bounded drain coverage proves an admitted legacy envelope reaches the ingestion sink. Database `(source, source_event_ref)` uniqueness inside the sink transaction remains authoritative; completion names remain hints and their stage/completion `nlink === 2` pair is not misclassified as the index/cursor single-link rule.

## Evidence

- Genuine initial RED: five of seven cases failed because the tool did not exist.
- Controller-review RED: four of nine cases failed before final-index/V-review/privacy implementation; the stale-index race exited zero.
- Final focused: 9/9 three times.
- Required regressions: C4 38/38; combined C1–C4 62/62; S03b/S05 82/82.
- Nine adverse mutants were RED and restored: omitted legacy basename, accepted changed second snapshot, runtime import, hardlink candidate acceptance, broken partial framing, unsafe output, source mutation, stale final index, and raw planted-secret filename.
- Benign duplicate-index neighbour remained 9/9 GREEN.
- Contract generation passed with no diff. Text audit passed. Source and architecture audits match the pinned five-row and sparse-web baselines. Typecheck has only the pinned eight S14 UI diagnostics and none in this change.
- Repository-wide test was attempted and stopped after unrelated LOAD-01 timeout, S7 concurrency, and missing sparse-web failures; all mandated scoped suites are green.
- Frozen C4 hashes match the prior round-4 report, diff checks are clean, and no product source differs from base.

Commit subject required: `feat(obs): add FIX-01 release admission gate`.
