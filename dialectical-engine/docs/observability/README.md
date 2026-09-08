# Observation listener and watchdog

The two launchd files under `ops/launchd` are dormant templates. They contain
only symbolic placeholders; this repository does not install, bootstrap, or
start either service. Build `@debateai/obs-listener` first, then V must replace
every `__PLACEHOLDER__` with reviewed absolute paths, distinct operating-system
principals, role-specific PostgreSQL DSNs, and the ratified timing values.

The listener runs `dist/src/daemon.js` as `debateai_obs_listener`. The
watchdog runs the separate `dist/src/watchdog.js` process as
`debateai_obs_watchdog`. Both templates use `KeepAlive=true` and a ten-second
throttle, and their stdout/stderr paths are distinct. The watchdog DSN must have
only the migration `0064` grants: row/activation reads and the narrow
`component_health` insert/update. It must not have product-table write access.

Before activation, V provisions the exact six chain-control paths and their
owners/modes, stages runtime-generated Ed25519 keys, signs the row keyring and
activation manifest, applies the reviewed forward migration while writers are
quiesced, checks database/file parity, and only then starts writers, listener,
and watchdog. The repository supplies no production root, identity, DSN,
credential, key, or activation value.

After V renders each template to a private absolute path, validation is:

```sh
plutil -lint /absolute/path/com.debateai.obs-listener.plist
plutil -lint /absolute/path/com.debateai.obs-watchdog.plist
```

Installation and removal are V-only operations:

```sh
launchctl bootstrap system /absolute/path/com.debateai.obs-listener.plist
launchctl bootstrap system /absolute/path/com.debateai.obs-watchdog.plist
launchctl bootout system/com.debateai.obs-watchdog
launchctl bootout system/com.debateai.obs-listener
```

Never load the `.template` files. A cold-start activation, journal, or witness
key failure exits 78 without appending or writing health. A running watchdog
keeps its activation in memory, signs one append-only witness record per cycle,
fsyncs it before health, and trips on chain, heartbeat, or cursor-lag failure.
Journal corruption, a torn tail, or rollback is never repaired in place; retain
the bytes and stop for V recovery authority.
