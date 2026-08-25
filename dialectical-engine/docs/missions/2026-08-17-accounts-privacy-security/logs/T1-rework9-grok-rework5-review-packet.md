# T1 Rework9 Rework5 — same Grok 4.6 finder review

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. Sole reviewer; Claude
is excluded. Read-only only: do not edit, launch/recover, run supervisor,
viewer, worker, Vitest/PostgreSQL, commit, push, or touch Kanban.

Read completely: `T1-rework9-rework5-self-report.json`, manifest, current
progress, RED/GREEN/static/custody logs+statuses, recovery authority/tool/
failure evidence, `T1-rework9-rework5-static-fixture.mjs`, updated controller
and worker plist templates, updated viewer, gate contract, static checker, and
the current never-started e3aa receipt owner/preflight/plists/zero streams and
live claim.

Incident: run `e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16` started no controller,
viewer, worker, or test. launchd rejected Hermes Node as direct plist Program
with xpcproxy EPERM/exit78. Separately, viewer `spawnSync(tty)` piped stdin and
therefore could never prove a Terminal tty. Exact controller label is absent;
worker label absent; six streams zero; no viewer.ready, epoch, heartbeat,
sentinel, worker-terminal, test.status, terminal, or release.

Required review:

1. Both plist templates use a system `/bin/zsh` direct Program with a minimal
   positional `exec "$@"` wrapper, preserve exact Node/script/args, cwd/env,
   IO, KeepAlive, and process-group semantics, and cannot interpolate paths or
   secrets as shell source.
2. Correct worker plist makes the controller's existing internal launchctl
   bootstrap viable without controller/worker logic changes.
3. Viewer passes its real Terminal stdin to `/usr/bin/tty` while capturing
   stdout and retains challenge, exact tty, ready-receipt, and read-only rules.
4. RED kills the old direct-Node/default-piped mechanisms; GREEN verifies
   rendered argv order/escaping, no extra group/session, and actual tty seam.
5. One-time recovery for e3aa is exact, fail-closed, uses the approved recovery
   core, archives instead of deletes, and cannot start a new run or test.
6. Product/test bytes and all 12 governed tuples remain frozen.

Expected key hashes from manifest:

- controller template prefix `3c6be89a`
- worker template prefix `da2f5f7d`
- viewer prefix `1b7c7998`
- fixture prefix `a55346c5`
- recovery prefix `e9c93663`
- authority prefix `cb2ba478`
- failure evidence prefix `0c2e1074`
- contract prefix `52d75a8b`
- static checker prefix `4e739226`
- manifest `18aff3796464a9b825f43e475322742b14f37e5b2513752d6fb501fd0af4c7e2`
- self-report `a443d1de4c5b460898fb3eec8da9121f4af8e3aa2032cc1309789909f8ecb94b`

HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged 0. Live
lock dev/inode `16777233/46491737`; claim inode `46491752`, SHA
`e9be4c2450f95c2b6b10fc7d2b6d728415cdca0609fee276fd3cbb2d9e6b1e69`;
owner SHA `7dad353a9d298d11868c5febcdbc2176cd62e65a363283099e34834cf64830d8`.

Finish exactly:

- `GROK REWORK9 REWORK5 APPROVED`
- `GROK REWORK9 REWORK5 CHANGES REQUESTED`

Report final custody and whether the live lock was untouched.
