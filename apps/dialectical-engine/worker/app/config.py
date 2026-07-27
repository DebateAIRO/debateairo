from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - runtime target is 3.12+, tests may use older macOS Python.
    import tomli as tomllib

try:
    import tomli_w
except ImportError:  # pragma: no cover
    tomli_w = None

DEFAULT_WORKER_DIR = Path("~/.dialectical-worker").expanduser()
DEFAULT_CONFIG_PATH = DEFAULT_WORKER_DIR / "config.toml"
_UNSET = object()


def as_bool(value: object, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() not in {"0", "false", "no"}


def parse_model_list(value: object) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, str):
        candidates = value.split(",")
    elif isinstance(value, list):
        candidates = value
    else:
        candidates = [value]
    models: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        model = str(candidate).strip()
        if not model or model in seen:
            continue
        models.append(model)
        seen.add(model)
    return models or None


def resolved_config_path(path: Path | None = None) -> Path:
    return (path or Path(os.getenv("DIALECTICAL_WORKER_CONFIG", DEFAULT_CONFIG_PATH))).expanduser()


def _atomic_write_private(path: Path, serialized: str) -> None:
    """Atomically persist secret-bearing worker state with owner-only access."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        # O_CREAT's mode does not tighten a pre-existing stale temp file.
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as handle:
            fd = -1  # fdopen owns and closes it from here.
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
        os.chmod(path, 0o600)
    finally:
        if fd >= 0:
            os.close(fd)


def default_worker_name() -> str:
    try:
        name = socket.gethostname().strip()
    except OSError:
        name = ""
    return name or "local-worker"


@dataclass
class WorkerConfig:
    coordinator_url: str = "http://localhost:8000"
    worker_id: str | None = None
    worker_token: str | None = None
    user_token: str | None = None
    name: str = default_worker_name()
    enable_mock: bool = False
    enable_real_adapters: bool = True
    mock_models: list[str] | None = None
    allowed_models: list[str] | None = None
    last_capabilities: list[str] | None = None
    heartbeat_seconds: int = 30
    request_timeout_seconds: int = 60
    keychain_service: str = "dialectical-worker"
    keychain_account: str = "user-token"


def load_config(path: Path | None = None) -> WorkerConfig:
    path = resolved_config_path(path)
    data = tomllib.loads(path.read_text()) if path.exists() else {}
    return WorkerConfig(
        coordinator_url=os.getenv("DIALECTICAL_COORDINATOR_URL", data.get("coordinator_url", "http://localhost:8000")),
        worker_id=os.getenv("DIALECTICAL_WORKER_ID", data.get("worker_id")),
        worker_token=os.getenv("DIALECTICAL_WORKER_TOKEN", data.get("worker_token")),
        user_token=os.getenv("DIALECTICAL_USER_TOKEN", data.get("user_token")),
        name=os.getenv("DIALECTICAL_WORKER_NAME", data.get("name", default_worker_name())),
        enable_mock=as_bool(os.getenv("DIALECTICAL_ENABLE_MOCK"), as_bool(data.get("enable_mock", False))),
        enable_real_adapters=as_bool(
            os.getenv("DIALECTICAL_ENABLE_REAL_ADAPTERS"),
            as_bool(data.get("enable_real_adapters", True)),
        ),
        mock_models=parse_model_list(os.getenv("DIALECTICAL_MOCK_MODELS", data.get("mock_models"))),
        allowed_models=parse_model_list(os.getenv("DIALECTICAL_ALLOWED_MODELS", data.get("allowed_models"))),
        last_capabilities=parse_model_list(data.get("last_capabilities")),
        heartbeat_seconds=int(data.get("heartbeat_seconds", 30)),
        request_timeout_seconds=int(data.get("request_timeout_seconds", 60)),
        keychain_service=os.getenv("DIALECTICAL_KEYCHAIN_SERVICE", data.get("keychain_service", "dialectical-worker")),
        keychain_account=os.getenv("DIALECTICAL_KEYCHAIN_ACCOUNT", data.get("keychain_account", "user-token")),
    )


def save_config(config: WorkerConfig, path: Path | None = None) -> None:
    path = resolved_config_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "coordinator_url": config.coordinator_url,
        "worker_id": config.worker_id,
        "worker_token": config.worker_token,
        "name": config.name,
        "enable_mock": config.enable_mock,
        "enable_real_adapters": config.enable_real_adapters,
        "mock_models": config.mock_models,
        "allowed_models": config.allowed_models,
        "last_capabilities": config.last_capabilities,
        "heartbeat_seconds": config.heartbeat_seconds,
        "request_timeout_seconds": config.request_timeout_seconds,
        "keychain_service": config.keychain_service,
        "keychain_account": config.keychain_account,
    }
    data = {key: value for key, value in data.items() if value is not None}
    if tomli_w is not None:
        serialized = tomli_w.dumps(data)
    else:
        lines = []
        for key, value in data.items():
            if isinstance(value, bool):
                lines.append(f"{key} = {'true' if value else 'false'}")
            elif isinstance(value, int):
                lines.append(f"{key} = {value}")
            elif isinstance(value, list):
                lines.append(f"{key} = [{', '.join(json.dumps(str(item)) for item in value)}]")
            elif value is not None:
                lines.append(f'{key} = "{value}"')
        serialized = "\n".join(lines) + "\n"
    # Atomic swap: a crash mid-save must leave the previous file intact. A
    # torn config.toml fails startup parsing before any self-check can run,
    # which is exactly the unrecoverable crash-loop shape this file guards
    # against (this file carries the worker identity).
    _atomic_write_private(path, serialized)


def load_file_config(path: Path | None = None) -> WorkerConfig:
    path = resolved_config_path(path)
    data = tomllib.loads(path.read_text()) if path.exists() else {}
    return WorkerConfig(
        coordinator_url=data.get("coordinator_url", "http://localhost:8000"),
        worker_id=data.get("worker_id"),
        worker_token=data.get("worker_token"),
        user_token=data.get("user_token"),
        name=data.get("name", default_worker_name()),
        enable_mock=as_bool(data.get("enable_mock", False)),
        enable_real_adapters=as_bool(data.get("enable_real_adapters", True)),
        mock_models=parse_model_list(data.get("mock_models")),
        allowed_models=parse_model_list(data.get("allowed_models")),
        last_capabilities=parse_model_list(data.get("last_capabilities")),
        heartbeat_seconds=int(data.get("heartbeat_seconds", 30)),
        request_timeout_seconds=int(data.get("request_timeout_seconds", 60)),
        keychain_service=data.get("keychain_service", "dialectical-worker"),
        keychain_account=data.get("keychain_account", "user-token"),
    )


def update_config_file(
    path: Path | None = None,
    *,
    coordinator_url: str | None = None,
    allowed_models: object = _UNSET,
) -> WorkerConfig:
    if coordinator_url is None and allowed_models is _UNSET:
        raise ValueError("set at least one worker config field")

    config_path = resolved_config_path(path)
    config = load_file_config(config_path)
    if coordinator_url is not None:
        cleaned_url = coordinator_url.strip().rstrip("/")
        if not cleaned_url:
            raise ValueError("coordinator_url cannot be empty")
        config.coordinator_url = cleaned_url
    if allowed_models is not _UNSET:
        config.allowed_models = parse_model_list(allowed_models)

    save_config(config, config_path)
    return load_file_config(config_path)


class MissingCredentialsError(RuntimeError):
    """The worker has neither a stored identity nor a registration credential."""


def identity_snapshot_path(path: Path | None = None) -> Path:
    config_path = resolved_config_path(path)
    return config_path.with_name(config_path.stem + ".identity-snapshot" + config_path.suffix)


def snapshot_identity(config: WorkerConfig, path: Path | None = None, reason: str = "") -> Path | None:
    """Write worker_id/worker_token (and context, never user_token) to a
    sidecar next to the config file, so a wiped identity stays recoverable.

    A rolling single file: it is only ever overwritten when there is a real
    identity to record, so repeated desync rounds after a wipe cannot clobber
    the last good identity with empties. Returns the path, or None when there
    is no complete identity to snapshot.
    """
    if not (config.worker_id and config.worker_token):
        return None
    snapshot_path = identity_snapshot_path(path)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "worker_id": config.worker_id,
        "worker_token": config.worker_token,
        "name": config.name,
        "coordinator_url": config.coordinator_url,
        "snapshotted_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
    }
    lines = [f"{key} = {json.dumps(str(value))}" for key, value in data.items()]
    serialized = "\n".join(lines) + "\n"
    # The snapshot holds the worker token: owner-only from creation onward,
    # and atomically swapped in so a crash cannot leave a torn snapshot.
    _atomic_write_private(snapshot_path, serialized)
    return snapshot_path


def ensure_identity_persisted(config: WorkerConfig, path: Path | None = None) -> bool:
    """Make the in-memory registered identity durable: rewrite the config file
    iff it does not already carry this worker_id/worker_token. Returns True
    when a write happened. No-op when the config holds no complete identity."""
    if not (config.worker_id and config.worker_token):
        return False
    config_path = resolved_config_path(path)
    if config_path.exists():
        try:
            on_disk = load_file_config(config_path)
        except Exception:  # noqa: BLE001 - unreadable/corrupt file: rewrite it below.
            on_disk = None
        if (
            on_disk is not None
            and on_disk.worker_id == config.worker_id
            and on_disk.worker_token == config.worker_token
        ):
            return False
    save_config(config, config_path)
    return True


def keychain_user_token(service: str, account: str) -> str | None:
    """Read the registration user token from the macOS Keychain, or None.

    This gives an unattended launchd KeepAlive restart a credential source
    without ever putting the token in a file, plist, or log. The token value
    must never be logged by callers.
    """
    if sys.platform != "darwin" or not service or not account:
        return None
    try:
        completed = subprocess.run(
            ["security", "find-generic-password", "-s", service, "-a", account, "-w"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    token = completed.stdout.strip()
    return token or None


def resolve_user_token(config: WorkerConfig) -> bool:
    """Fill config.user_token from the keychain when config/env supplied none.
    Returns True iff the keychain provided the token."""
    if config.user_token:
        return False
    token = keychain_user_token(config.keychain_service, config.keychain_account)
    if not token:
        return False
    config.user_token = token
    return True
