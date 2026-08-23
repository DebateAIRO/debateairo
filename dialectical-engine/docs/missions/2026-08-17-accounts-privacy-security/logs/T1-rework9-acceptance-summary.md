# T1 Rework9 acceptance and closure boundary

Recorded by Codex-Router on 2026-08-23 after the final repository-wide suite and
the sole Grok 4.6 read-only acceptance review. This document is a scope record;
the user subsequently authorized local Phase 1 implementation commits and
Kanban continuation, but did not authorize a push or deletion of any
working-tree artifact.

## Accepted outcome

- Final repository suite: 113/113 files and 1037/1037 tests, raw status `0`.
- Registration database file: 56/56 passing test ticks.
- OBS foundation file: 12/12 passing test ticks.
- T9 six-window live classification: `T9_RESEND_EQUIVALENCE_GREEN`, family-wise
  adjusted p-value 0.311279, all six median gaps at or below 0.301 ms, and zero
  deadlock deltas.
- Grok marker: `GROK REWORK9 REPOSITORY SUITE ACCEPTED`, raw status `0`.
- HEAD before/after/review:
  `7918f4f8bff33909792afc01dc38d402972b4ccd`; staged paths: zero.

Receipt digests:

```text
93145f7f13570309bd26cb7e4ac4379f9e1bf755fc064db84ea7f00ed9108d81  T1-rework9-router-repo-full-suite-final.log
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  T1-rework9-router-repo-full-suite-final.status
115ab36972c625c3941700489a553584a63d4daf77c514ab212dcc8fe656d9c0  T1-rework9-grok-repo-full-suite-final-review-visible.log
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  T1-rework9-grok-repo-full-suite-final-review-visible.status
```

## Exact accepted code/test payload

These are the ten tracked paths that belong to the accepted T1/T9/OBS payload.
They passed `git diff --check` together and match the final-suite pre/post
custody manifest. The nine T1/T9 product and test paths were committed locally
as `be2ce88`; the OBS portability test and this scope record form a separate
companion commit.

```text
91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b  apps/api/src/main.ts
1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03  apps/api/src/registration.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216  packages/register/src/auth-policy.ts
4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d  tests/architecture/t1-argon2-worker-contract.test.ts
8f2b88188202450df642eef36368c07353a23ce2cb93924f37f5ac432bdf9a4f  tests/integration/obs-l1-s01-foundation.test.ts
58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191  tests/integration/registration-database.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
baa9254edaf65965402b8d6714efcb63dcde4961f99268573b9bdc9903b0de53  tests/unit/registration.test.ts
```

The already-tracked `packages/crypto/src/index.ts` and
`packages/crypto/src/argon2-worker.ts` are part of the accepted governed T1
surface but have no pending diff relative to this HEAD.

## Explicitly excluded current working-tree material

The following tracked modifications are not part of this ticket payload and
must remain untouched and unstaged by a T1 closure operation:

```text
../.claude/launch.json
../.gitignore
docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh
docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md
docs/missions/2026-08-21-observability-loop/research/POST-SYNTHESIS-RULINGS.md
```

At audit time there were 592 other untracked Accounts Phase 1 log artifacts and
19 untracked observability-mission artifacts. They are preserved in place but
are not implicitly accepted as one commit payload. Do not use `git add -A`, do
not delete them, and do not stash or clean the entire tree without separate
authority.

## Remaining closure sequence

Local commits and Kanban continuation were separately authorized by the user.
No push is authorized. Any future push must keep the explicit path boundary
above, preserve unrelated dirty files, and satisfy the user requirement to
integrate the latest remote `dev` immediately before pushing. If remote `dev`
has advanced or integration changes any governed byte, re-establish
proportionate custody and test evidence before push.
