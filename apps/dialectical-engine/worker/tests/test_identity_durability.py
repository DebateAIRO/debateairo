"""Regression tests for C-4 (full-pass-2026-07-27, Mandate A section A.7):
the worker's registered identity must be durable across restarts.

The 2026-07-27 outage shape: config.toml on disk had no worker_id /
worker_token while the running process held a valid identity in memory (the
2026-07-26 firefight repair was never persisted). A launchd restart then
crash-looped on the generic "Set user_token in worker config or
DIALECTICAL_USER_TOKEN to register" RuntimeError, and KeepAlive could not
recover because nothing supplied a credential.

Four guarantees under test:
  1. Every successful registration leaves the identity on disk -- including
     register()'s short-circuit path where memory has an identity the file
     lost.
  2. The identity-desync handler snapshots the previous identity to a sidecar
     file before wiping it, so a bad desync detection is operator-recoverable.
  3. Startup fails loudly and distinguishably (distinct exception, distinct
     exit code) when there is neither a stored identity nor a registration
     credential, before any network or adapter work.
  4. The macOS Keychain is a credential source of last resort, so a launchd
     KeepAlive restart can re-register unattended without a token in any file.
"""
from __future__ import annotations

import asyncio
import stat
from pathlib import Path

import httpx
import pytest

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - runtime target is 3.12+.
    import tomli as tomllib

import app.config as config_module
import app.main as worker_main
from app.client import CoordinatorClient
from app.config import (
    MissingCredentialsError,
    WorkerConfig,
    ensure_identity_persisted,
    identity_snapshot_path,
    keychain_user_token,
    load_config,
    resolve_user_token,
    save_config,
    snapshot_identity,
)
from app.main import handle_identity_desync, startup_credentials_check, worker_loop


def _http_401(url: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(401, request=request)
    return httpx.HTTPStatusError("unauthorized", request=request, response=response)


def _no_keychain(monkeypatch) -> None:
    """Tests must never read the real machine's keychain."""
    monkeypatch.setattr(config_module, "keychain_user_token", lambda *args, **kwargs: None)


class FakeAdapter:
    model_id = "fake-a"
    role_pool = {"proposer"}


async def _fake_detect_adapters(config):
    return {"fake-a": FakeAdapter()}


# ---------------------------------------------------------------------------
# 0. The test suite itself must never touch the operator's real config dir
# ---------------------------------------------------------------------------


def test_suite_pins_worker_config_away_from_real_home() -> None:
    """Proven live on 2026-07-27: tests that call worker_loop/save_config
    without pinning DIALECTICAL_WORKER_CONFIG wrote fixture junk (name
    'fresh-start-worker', capabilities ['fake-a']) into the operator's real
    ~/.dialectical-worker/config.toml -- the same identity-less shape section
    A.7 found after the outage. conftest.py must pin the env var to a temp
    location for the whole session so no test can resolve the real path."""
    pinned = Path(config_module.resolved_config_path(None))
    real_dir = (Path.home() / ".dialectical-worker").resolve()
    assert pinned != config_module.DEFAULT_CONFIG_PATH
    assert real_dir not in pinned.resolve().parents


# ---------------------------------------------------------------------------
# 1. Identity is persisted on every successful registration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_short_circuit_persists_in_memory_identity_to_disk(monkeypatch, tmp_path: Path) -> None:
    """The firefight state: identity in memory, file lost it. register()'s
    short-circuit must re-persist instead of leaving the file bare."""

    async def no_network(self, url, **kwargs):
        raise AssertionError("short-circuit must not reach the network")

    monkeypatch.setattr(httpx.AsyncClient, "post", no_network)
    config_path = tmp_path / "config.toml"
    config = WorkerConfig(worker_id="w1", worker_token="t1", name="mac-mini")
    client = CoordinatorClient(config)
    try:
        await client.register(["m"], save_path=config_path)
    finally:
        await client.aclose()

    assert config_path.exists()
    loaded = load_config(config_path)
    assert loaded.worker_id == "w1"
    assert loaded.worker_token == "t1"


@pytest.mark.asyncio
async def test_worker_loop_persists_identity_for_restart(monkeypatch, tmp_path: Path) -> None:
    """A worker that starts with an in-memory-only identity (file lost it,
    capabilities unchanged so the old capability-change save never fires) must
    still leave worker_id/worker_token on disk before polling."""
    config_path = tmp_path / "config.toml"
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))
    _no_keychain(monkeypatch)

    async def fake_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        return None

    async def fake_heartbeat(self, capabilities, status="online", fresh_start=False):
        return None

    async def fake_poll(self):
        return None

    def fake_load_config(path=None):
        # last_capabilities matches the detected adapters exactly, so the
        # pre-existing "capabilities changed" save_config call does not fire.
        return WorkerConfig(worker_id="w1", worker_token="t1", last_capabilities=["fake-a"])

    monkeypatch.setattr(CoordinatorClient, "register", fake_register)
    monkeypatch.setattr(CoordinatorClient, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(CoordinatorClient, "poll", fake_poll)
    monkeypatch.setattr(worker_main, "detect_adapters", _fake_detect_adapters)
    monkeypatch.setattr(worker_main, "load_config", fake_load_config)

    await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    assert config_path.exists(), "identity never persisted: a restart would need a user token"
    loaded = load_config(config_path)
    assert loaded.worker_id == "w1"
    assert loaded.worker_token == "t1"


@pytest.mark.asyncio
async def test_worker_loop_survives_persist_failure(monkeypatch, tmp_path: Path, capsys) -> None:
    """Durability is best-effort at runtime: a failing disk must not take the
    (currently working) worker down mid-session."""
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))
    _no_keychain(monkeypatch)

    def broken_persist(config, path=None):
        raise OSError("disk full")

    async def fake_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        return None

    async def fake_heartbeat(self, capabilities, status="online", fresh_start=False):
        return None

    async def fake_poll(self):
        return None

    def fake_load_config(path=None):
        return WorkerConfig(worker_id="w1", worker_token="t1", last_capabilities=["fake-a"])

    monkeypatch.setattr(worker_main, "ensure_identity_persisted", broken_persist)
    monkeypatch.setattr(CoordinatorClient, "register", fake_register)
    monkeypatch.setattr(CoordinatorClient, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(CoordinatorClient, "poll", fake_poll)
    monkeypatch.setattr(worker_main, "detect_adapters", _fake_detect_adapters)
    monkeypatch.setattr(worker_main, "load_config", fake_load_config)

    await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    assert "could not persist worker identity" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_register_short_circuit_survives_persist_failure(monkeypatch, tmp_path: Path, capsys) -> None:
    """A disk error during the short-circuit re-persist must not kill a worker
    that has a valid in-memory identity and a reachable coordinator -- same
    best-effort policy as worker_loop's persist step."""
    import app.client as client_module

    def broken_persist(config, path=None):
        raise OSError("disk full")

    async def no_network(self, url, **kwargs):
        raise AssertionError("short-circuit must not reach the network")

    monkeypatch.setattr(client_module, "ensure_identity_persisted", broken_persist)
    monkeypatch.setattr(httpx.AsyncClient, "post", no_network)
    client = CoordinatorClient(WorkerConfig(worker_id="w1", worker_token="t1", name="n"))
    try:
        await client.register(["m"], save_path=tmp_path / "config.toml")
    finally:
        await client.aclose()

    assert "could not persist worker identity" in capsys.readouterr().out


def test_save_config_write_is_atomic(monkeypatch, tmp_path: Path) -> None:
    """A crash mid-save must leave the previous config intact, never a torn
    file: a torn config.toml would fail startup parsing with a generic error
    before any self-check runs -- the crash-loop shape C-4 removes."""
    config_path = tmp_path / "config.toml"
    save_config(WorkerConfig(worker_id="old-id", worker_token="old-tok", name="n"), config_path)
    before = config_path.read_text()

    def crash_at_swap(src, dst):
        raise OSError("simulated crash at swap")

    monkeypatch.setattr(config_module.os, "replace", crash_at_swap)
    with pytest.raises(OSError):
        save_config(WorkerConfig(worker_id="new-id", worker_token="new-tok", name="n"), config_path)

    assert config_path.read_text() == before


def test_save_config_is_owner_only_even_when_replacing_permissive_file(tmp_path: Path) -> None:
    """The config contains worker_token and must never inherit 0644 defaults."""
    config_path = tmp_path / "config.toml"
    config_path.write_text('worker_id = "old"\nworker_token = "old-token"\n')
    config_path.chmod(0o644)

    save_config(WorkerConfig(worker_id="w1", worker_token="t1", name="n"), config_path)

    assert stat.S_IMODE(config_path.stat().st_mode) == 0o600
    loaded = load_config(config_path)
    assert loaded.worker_id == "w1"
    assert loaded.worker_token == "t1"


@pytest.mark.asyncio
async def test_worker_loop_fails_loudly_on_corrupt_config(monkeypatch, tmp_path: Path) -> None:
    """An unparseable config file must produce the same loud, distinguishable
    (exit-78 routed) diagnostic as missing credentials, pointing at the file
    and any identity snapshot -- not a raw TOMLDecodeError crash-loop."""
    config_path = tmp_path / "config.toml"
    config_path.write_text('worker_id = "torn')
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))
    snapshot_path = snapshot_identity(
        WorkerConfig(worker_id="w-old", worker_token="t-old", name="n"), config_path, reason="test"
    )

    with pytest.raises(MissingCredentialsError) as excinfo:
        await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    message = str(excinfo.value)
    assert str(config_path) in message
    assert "unreadable or corrupt" in message
    assert str(snapshot_path) in message


def test_ensure_identity_persisted_is_noop_when_disk_current(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    config = WorkerConfig(worker_id="w1", worker_token="t1", name="n")
    save_config(config, config_path)
    before = config_path.read_text()

    assert ensure_identity_persisted(config, config_path) is False
    assert config_path.read_text() == before


def test_ensure_identity_persisted_writes_when_file_lacks_identity(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    config_path.write_text('coordinator_url = "http://localhost:8000"\nname = "n"\n')
    config = WorkerConfig(worker_id="w1", worker_token="t1", name="n", user_token="user_secret")

    assert ensure_identity_persisted(config, config_path) is True

    saved = config_path.read_text()
    assert "w1" in saved
    assert "t1" in saved
    assert "user_token" not in saved
    assert "user_secret" not in saved


def test_ensure_identity_persisted_skips_without_identity(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    assert ensure_identity_persisted(WorkerConfig(), config_path) is False
    assert not config_path.exists()


# ---------------------------------------------------------------------------
# 2. Desync handler snapshots the identity before wiping it
# ---------------------------------------------------------------------------


def test_snapshot_identity_writes_sidecar_with_owner_only_permissions(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    config = WorkerConfig(worker_id="w1", worker_token="t1", name="mac-mini", user_token="user_secret")

    snapshot_path = snapshot_identity(config, config_path, reason="identity desync (attempt 1/5)")

    assert snapshot_path is not None
    assert snapshot_path == identity_snapshot_path(config_path)
    assert snapshot_path.parent == config_path.parent
    data = tomllib.loads(snapshot_path.read_text())
    assert data["worker_id"] == "w1"
    assert data["worker_token"] == "t1"
    assert data["name"] == "mac-mini"
    assert data["reason"] == "identity desync (attempt 1/5)"
    assert "snapshotted_at" in data
    assert "user_token" not in snapshot_path.read_text()
    assert "user_secret" not in snapshot_path.read_text()
    assert stat.S_IMODE(snapshot_path.stat().st_mode) == 0o600


def test_snapshot_identity_skips_without_identity(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    assert snapshot_identity(WorkerConfig(worker_id="w1"), config_path) is None
    assert not identity_snapshot_path(config_path).exists()


@pytest.mark.asyncio
async def test_desync_handler_snapshots_before_wipe(monkeypatch, tmp_path: Path) -> None:
    """A wiped identity must be recoverable from the sidecar snapshot, and a
    later desync round with no identity must not clobber the snapshot."""
    config_path = tmp_path / "config.toml"
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))

    async def rejected_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        raise _http_401("http://c/api/workers/register")

    async def fake_wait_or_stop(stop, seconds):
        return None

    monkeypatch.setattr(CoordinatorClient, "register", rejected_register)
    monkeypatch.setattr(worker_main, "wait_or_stop", fake_wait_or_stop)

    config = WorkerConfig(worker_id="w1", worker_token="t1", user_token="user-tok", name="mac-mini")
    client = CoordinatorClient(config)
    try:
        attempts = await handle_identity_desync(client, ["m"], asyncio.Event(), 0)
        assert attempts == 1
        assert config.worker_id is None
        assert config.worker_token is None

        snapshot_path = identity_snapshot_path(config_path)
        assert snapshot_path.exists(), "identity wiped without a recoverable snapshot"
        data = tomllib.loads(snapshot_path.read_text())
        assert data["worker_id"] == "w1"
        assert data["worker_token"] == "t1"

        # Second round: identity already gone; the snapshot must survive.
        attempts = await handle_identity_desync(client, ["m"], asyncio.Event(), attempts)
        assert attempts == 2
        data = tomllib.loads(snapshot_path.read_text())
        assert data["worker_id"] == "w1"
        assert data["worker_token"] == "t1"
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# 3. Startup self-check: loud, distinguishable, before any network/adapters
# ---------------------------------------------------------------------------


def test_startup_check_passes_with_stored_identity(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))
    startup_credentials_check(WorkerConfig(worker_id="w1", worker_token="t1"))


def test_startup_check_passes_with_user_token_only(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))
    startup_credentials_check(WorkerConfig(user_token="user-tok"))


def test_startup_check_fails_loudly_with_no_credentials(monkeypatch, tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))

    with pytest.raises(MissingCredentialsError) as excinfo:
        startup_credentials_check(WorkerConfig())

    message = str(excinfo.value)
    assert str(config_path) in message
    assert "DIALECTICAL_USER_TOKEN" in message
    assert "eychain" in message  # Keychain / keychain guidance
    assert "worker_id" in message


def test_startup_check_names_the_missing_identity_half(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))

    with pytest.raises(MissingCredentialsError) as excinfo:
        startup_credentials_check(WorkerConfig(worker_id="w1"))

    message = str(excinfo.value)
    assert "worker_id: present" in message
    assert "worker_token: MISSING" in message


def test_startup_check_points_at_snapshot_when_present(monkeypatch, tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))
    snapshot_path = snapshot_identity(
        WorkerConfig(worker_id="w-old", worker_token="t-old", name="n"), config_path, reason="test"
    )
    assert snapshot_path is not None

    with pytest.raises(MissingCredentialsError) as excinfo:
        startup_credentials_check(WorkerConfig())

    assert str(snapshot_path) in str(excinfo.value)


@pytest.mark.asyncio
async def test_worker_loop_fails_fast_before_any_network_or_adapters(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))
    _no_keychain(monkeypatch)

    async def no_register(self, capabilities, **kwargs):
        raise AssertionError("unconfigured worker must not attempt registration")

    async def no_detect(config):
        raise AssertionError("unconfigured worker must not probe adapters")

    monkeypatch.setattr(CoordinatorClient, "register", no_register)
    monkeypatch.setattr(worker_main, "detect_adapters", no_detect)
    monkeypatch.setattr(worker_main, "load_config", lambda path=None: WorkerConfig())

    with pytest.raises(MissingCredentialsError):
        await asyncio.wait_for(worker_loop(run_once=True), timeout=10)


def test_main_exits_with_distinct_config_code_when_unconfigured(monkeypatch, tmp_path: Path, capsys) -> None:
    """launchctl list must show a distinguishable status (EX_CONFIG, 78)
    instead of the generic 1 from an uncaught RuntimeError."""
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(tmp_path / "config.toml"))
    _no_keychain(monkeypatch)
    monkeypatch.setattr(worker_main, "load_config", lambda path=None: WorkerConfig())
    monkeypatch.setattr("sys.argv", ["app.main"])

    async def no_detect(config):
        raise AssertionError("unconfigured worker must not probe adapters")

    async def no_register(self, capabilities, **kwargs):
        raise AssertionError("unconfigured worker must not attempt registration")

    monkeypatch.setattr(worker_main, "detect_adapters", no_detect)
    monkeypatch.setattr(CoordinatorClient, "register", no_register)

    with pytest.raises(SystemExit) as excinfo:
        worker_main.main()

    assert excinfo.value.code == 78
    assert "credential" in capsys.readouterr().err.lower()


# ---------------------------------------------------------------------------
# 4. macOS Keychain as an unattended registration credential source
# ---------------------------------------------------------------------------


def test_keychain_user_token_reads_security_output(monkeypatch) -> None:
    commands: list[list[str]] = []

    class FakeCompleted:
        returncode = 0
        stdout = "tok-123\n"
        stderr = ""

    def fake_run(cmd, **kwargs):
        commands.append(list(cmd))
        return FakeCompleted()

    monkeypatch.setattr(config_module.sys, "platform", "darwin")
    monkeypatch.setattr(config_module.subprocess, "run", fake_run)

    assert keychain_user_token("svc", "acct") == "tok-123"
    assert commands == [["security", "find-generic-password", "-s", "svc", "-a", "acct", "-w"]]


def test_keychain_user_token_none_when_item_missing(monkeypatch) -> None:
    class FakeCompleted:
        returncode = 44  # errSecItemNotFound
        stdout = ""
        stderr = "security: SecKeychainSearchCopyNext: The specified item could not be found.\n"

    monkeypatch.setattr(config_module.sys, "platform", "darwin")
    monkeypatch.setattr(config_module.subprocess, "run", lambda cmd, **kwargs: FakeCompleted())

    assert keychain_user_token("svc", "acct") is None


def test_keychain_user_token_none_off_darwin_or_disabled(monkeypatch) -> None:
    def no_subprocess(cmd, **kwargs):
        raise AssertionError("keychain lookup must not run here")

    monkeypatch.setattr(config_module.subprocess, "run", no_subprocess)

    monkeypatch.setattr(config_module.sys, "platform", "linux")
    assert keychain_user_token("svc", "acct") is None

    monkeypatch.setattr(config_module.sys, "platform", "darwin")
    assert keychain_user_token("", "acct") is None


def test_resolve_user_token_prefers_existing_token(monkeypatch) -> None:
    def no_keychain_lookup(*args, **kwargs):
        raise AssertionError("keychain must not be consulted when a token exists")

    monkeypatch.setattr(config_module, "keychain_user_token", no_keychain_lookup)
    config = WorkerConfig(user_token="explicit")

    assert resolve_user_token(config) is False
    assert config.user_token == "explicit"


def test_resolve_user_token_fills_from_keychain(monkeypatch) -> None:
    lookups: list[tuple[str, str]] = []

    def fake_lookup(service, account):
        lookups.append((service, account))
        return "kc-tok"

    monkeypatch.setattr(config_module, "keychain_user_token", fake_lookup)
    config = WorkerConfig()

    assert resolve_user_token(config) is True
    assert config.user_token == "kc-tok"
    assert lookups == [(config.keychain_service, config.keychain_account)]


def test_keychain_settings_roundtrip_config_file(tmp_path: Path) -> None:
    config_path = tmp_path / "config.toml"
    config_path.write_text('keychain_service = "custom-svc"\nkeychain_account = "custom-acct"\n')

    loaded = load_config(config_path)

    assert loaded.keychain_service == "custom-svc"
    assert loaded.keychain_account == "custom-acct"


@pytest.mark.asyncio
async def test_worker_loop_registers_with_keychain_token_and_persists(monkeypatch, tmp_path: Path) -> None:
    """The unattended-recovery path for launchd KeepAlive: no identity, no env
    token -- the keychain supplies the credential, registration succeeds, and
    the new identity lands on disk so the NEXT restart needs nothing at all."""
    config_path = tmp_path / "config.toml"
    monkeypatch.setenv("DIALECTICAL_WORKER_CONFIG", str(config_path))
    monkeypatch.setattr(config_module, "keychain_user_token", lambda service, account: "kc-tok")

    async def fake_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        assert self.config.user_token == "kc-tok"
        self.config.worker_id = "w-new"
        self.config.worker_token = "t-new"

    async def fake_heartbeat(self, capabilities, status="online", fresh_start=False):
        return None

    async def fake_poll(self):
        return None

    monkeypatch.setattr(CoordinatorClient, "register", fake_register)
    monkeypatch.setattr(CoordinatorClient, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(CoordinatorClient, "poll", fake_poll)
    monkeypatch.setattr(worker_main, "detect_adapters", _fake_detect_adapters)
    monkeypatch.setattr(worker_main, "load_config", lambda path=None: WorkerConfig())

    await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    loaded = load_config(config_path)
    assert loaded.worker_id == "w-new"
    assert loaded.worker_token == "t-new"
    assert "kc-tok" not in config_path.read_text()
