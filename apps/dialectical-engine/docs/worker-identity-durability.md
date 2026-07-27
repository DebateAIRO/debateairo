# Worker identity durability (C-4)

Fixes item C-4 of `.superpowers/sdd/2026-07-24-p1-contested-frontier/full-pass-2026-07-27.md`
(Mandate A, section A.7): a restart of worker A was a one-way door because the
registered identity lived only in process memory. `~/.dialectical-worker/config.toml`
had no `worker_id`/`worker_token`, no credential source existed for launchd, and the
service crash-looped on a generic `RuntimeError` with KeepAlive unable to help.

## The four guarantees

1. **Every successful registration persists the identity.** `client.register()`
   already saved fresh registrations; it now also re-persists on its short-circuit
   path (identity in memory, file lost it), and `worker_loop` enforces the
   invariant that the identity it polls with is on disk before the poll loop
   starts (`ensure_identity_persisted`). Secret-bearing config and snapshot
   writes use an atomic swap with mode `0600`; persistence failures are loud
   but non-fatal for the live process.
2. **The identity-desync handler snapshots before wiping.** Before
   `handle_identity_desync` clears `worker_id`/`worker_token`, it writes them to
   `~/.dialectical-worker/config.identity-snapshot.toml` (mode `0600`, never
   contains `user_token`). The file is rolling and only overwritten when a real
   identity exists, so repeated failed recovery rounds cannot clobber the last
   good identity. A bad desync detection is now operator-recoverable: copy
   `worker_id`/`worker_token` from the snapshot back into `config.toml`.
3. **Startup fails loudly and distinguishably.** If the worker has neither a
   stored identity nor a registration credential, it raises
   `MissingCredentialsError` *before* any network or adapter probing, prints a
   diagnostic naming the config path, which half of the identity is missing, and
   every fix path — and exits with status **78** (`EX_CONFIG`), so
   `launchctl list` distinguishes "unconfigured" from any other crash (status 1).
4. **launchd has an unattended credential source.** When `config.toml`/env
   provide no `user_token`, the worker reads it from the macOS Keychain
   (service `dialectical-worker`, account `user-token`; configurable via
   `keychain_service`/`keychain_account` config keys or
   `DIALECTICAL_KEYCHAIN_SERVICE`/`DIALECTICAL_KEYCHAIN_ACCOUNT` env). With the
   token in the login keychain, KeepAlive can re-register after any future
   identity loss with no token in any file, plist, or log.

## New finding: `make test` was wiping the live config

The engineering ledger blamed the identity-desync handler for stripping
`worker_id`/`worker_token` from `config.toml` on 2026-07-26. Verified live on
2026-07-27: the **worker test suite** overwrites the operator's real
`~/.dialectical-worker/config.toml` whenever it runs. Tests that drive
`worker_loop` with fixture configs never pinned `DIALECTICAL_WORKER_CONFIG`,
so the loop's capability-change `save_config()` resolved the real default path
and wrote fixture junk (`name = "fresh-start-worker"`,
`last_capabilities = ["fake-a"]`) — an identity-less file with exactly the
field set section A.7 found after the outage. Any `make test` run silently
re-armed the landmine. `worker/tests/conftest.py` now pins the whole session
to a throwaway directory, and
`test_identity_durability.py::test_suite_pins_worker_config_away_from_real_home`
keeps it that way (verified: two full-suite runs, zero writes to the real dir).

## Operator: repair the live state first (2 minutes)

Test runs on 2026-07-27 (before the fix landed) left fixture junk on this
machine. Before recovering, please:

1. **Delete `~/.dialectical-worker/config.identity-snapshot.toml`.** It was
   written by the leaky test path (fixture identity `w-1`/`tok-1`, dated
   2026-07-27T07:45Z) and must not be mistaken for a real recovery source.
   A byte-for-byte copy of it and of the clobbered config was preserved under
   the session scratchpad before any repair was proposed.
2. **Fix `~/.dialectical-worker/config.toml`:** set `name = "mac-mini"`
   (DB-confirmed: worker `b7df3b7f` is named `mac-mini`) and delete the
   `last_capabilities = ["fake-a"]` entry (it is recomputed and re-saved on
   the next successful start). Registering with the junk name would create a
   brand-new worker instead of rotating mac-mini's token.

## Operator: recover the current outage

Either of the following, from `apps/dialectical-engine/`:

**Option A — one-shot registration (fastest):**

```bash
cd worker && DIALECTICAL_USER_TOKEN='<operator user token>' ../.venv313/bin/python -m app.main --once
```

Then confirm `worker_id`/`worker_token` are present in
`~/.dialectical-worker/config.toml` and kickstart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.dialectical.worker
```

**Option B — durable unattended recovery (recommended, do once):**

```bash
security add-generic-password -s dialectical-worker -a user-token -w
```

(prompts for the token interactively — it never touches shell history), then:

```bash
launchctl kickstart -k gui/$(id -u)/com.dialectical.worker
```

The worker finds no identity, pulls the token from the keychain, re-registers,
and persists the new identity. Every later restart uses the persisted identity;
the keychain is only consulted again if the identity is lost.

## Notes

- Never edit `~/Library/LaunchAgents/com.dialectical.worker.plist` in place —
  the watchdog reverts live-plist edits. Change
  `deploy/launchd/worker.plist` and reinstall via the Makefile
  (`make install-worker ...`).
- `user_token` is still never written to disk by the worker (`save_config`
  excludes it; `scripts/status_report.py` guards this at source level).
- Exit statuses: `78` = missing credentials (fix config/keychain);
  `1` + `blocked_auth` in the log = coordinator rejected recovery
  (fix the registration or token, see the log's snapshot pointer).
- Tests: `worker/tests/test_identity_durability.py`.
