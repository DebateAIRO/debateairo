# T1 Rework9 Rework6 — same Grok 4.6 finder review

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. You are the sole
reviewer. Claude is excluded. Read-only only: do not edit, recover, launch,
bootstrap, run the supervisor/viewer/worker, run Vitest/PostgreSQL, commit,
push, or touch Kanban.

Read completely:

- `T1-rework9-rework6-self-report.json`
- `T1-rework9-rework6-manifest.json`
- the Rework6 section of `T1-rework9-progress.log`
- Rework6 RED/GREEN/static/custody logs and raw statuses
- `T1-rework9-rework6-static-fixture.mjs`
- `T1-rework9-launchd-stream-custody.mjs`
- current `T1-rework9-gate-launcher.mjs` and controller
- both current plist templates and the Rework2 fixture they feed
- current gate contract and aggregate static checker
- exact 15c9 failure evidence, recovery authority/tool, custody checker
- the live 15c9 receipt owner/preflight/plists/viewer.ready/zero streams and
  the still-live claim

Incident: run `15c9c6c5-3ca3-4e68-9fb9-587d8e19309f` started the visible
viewer but no controller epoch, heartbeat, worker, PostgreSQL, or test. The
exact launchd controller was booted out and is absent; the UUID viewer group
was terminated and is absent. Unified macOS logs show launchd `xpcproxy`
denied `kTCCServiceSystemPolicyDocumentsFolder` while opening the pre-created
Documents `controller.stdout.log`, producing exit 78 before zsh/Node ran.

Required adversarial review:

1. The launcher alone creates exactly four controller/worker launchd streams
   under the UUID-bound private `0700` runtime directory with `0600` files;
   rendered plists name only those paths, never durable Documents streams.
2. The owner/preflight/packet/rendered-plist custody binds the exact private
   source to exact durable destination mapping without permitting substitution,
   symlink, path escape, stale temp reuse, or cross-run mixing.
3. The stream helper's copy is complete and fail-closed: source regular-file
   and stat checks, fsync, exclusive temp destination, exact byte/hash copy,
   atomic rename, durable directory sync, source re-verification, idempotent
   equality only, and no truncation or overwrite of conflicting evidence.
4. On normal/worker-preexec/error paths, controller and worker launchd labels
   and descendant work are settled before streams seal; controller fd1/fd2 are
   closed before copying; all four streams seal before postflight, terminal,
   release, and lock release. Worker-preexec cannot be mislabeled success.
5. Controller-preexec is honestly outside controller reach. The exact 15c9
   recovery verifies label/process absence, frozen lock/claim/secret/streams,
   seals the private streams, emits immutable evidence, archives instead of
   deleting the lock, and has no execution authority.
6. RED non-vacuously kills the old pre-created Documents/stdout contract;
   GREEN/static/custody gates exercise stream mutation/conflict/idempotence,
   ordering, both preexec paths, and exact run binding. No probe is being
   smuggled in as acceptance.
7. Product/test bytes and all 12 governed tuples remain frozen; live lock and
   claim are untouched; no launch/recovery/test ran during authoring.

Expected manifest facts:

- manifest `2b297b1c377ae2a00494f177ececa56d6ca6e2bad43007044876dfc52826a09f`
- self-report `f50ee0f0f5120fe684b0ab73077b96b98f94b7cab6990eee9bdb40499cc49f02`
- launcher `7df6823f...`, controller `135ae31b...`, helper `a57275e0...`
- Rework6 fixture `de80b1c2...`, recovery `2a8f0007...`, authority `3eeb8156...`
- failure evidence `e5c2ec69...`, custody `b206cfc6...`
- contract `361d1842...`, aggregate checker `1076a27e...`
- RED raw 1; GREEN/static/custody raw 0

HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged 0. Live lock
dev/inode `16777233/46622472`; claim inode `46622486`, SHA
`8c598375472af4d603a803470d54dd9619b116e9c9cd06e986bf7b9d19df7f4d`;
owner SHA `0e253cca9d8c8c3278fce38406c8dc7a993284959b5234a10d1f8434a3f8dd65`.

Finish exactly:

- `GROK REWORK9 REWORK6 APPROVED`
- `GROK REWORK9 REWORK6 CHANGES REQUESTED`

Report final custody and whether the live lock/claim stayed untouched.
