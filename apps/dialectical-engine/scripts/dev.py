from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _common import DEFAULT_DEV_USER_TOKEN, dev_user_token

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_USER_TOKEN = DEFAULT_DEV_USER_TOKEN
DEFAULT_REAL_WORKER_CONFIG = ".dialectical-worker/config.toml"


@dataclass(frozen=True)
class ProcessSpec:
    name: str
    args: list[str]
    cwd: Path
    env: dict[str, str]


def int_env(environ: dict[str, str], name: str, default: int) -> int:
    raw = environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"{name} must be an integer") from None


def enabled_env(environ: dict[str, str], name: str, default: bool) -> bool:
    raw = environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() not in {"0", "false", "no"}


def home_dir(environ: dict[str, str]) -> Path:
    raw = environ.get("HOME") or environ.get("USERPROFILE")
    if raw and raw.strip():
        return Path(raw).expanduser()
    return Path.home()


def real_worker_config_path(environ: dict[str, str]) -> Path | None:
    configured = environ.get("DIALECTICAL_DEV_REAL_WORKER_CONFIG", "").strip()
    if configured:
        return Path(configured).expanduser()
    if not enabled_env(environ, "DIALECTICAL_DEV_REAL_WORKER_AUTO", True):
        return None
    default_config = home_dir(environ) / DEFAULT_REAL_WORKER_CONFIG
    return default_config if default_config.exists() else None


def real_worker_command(python: str, root: Path, environ: dict[str, str]) -> list[str]:
    if not enabled_env(environ, "DIALECTICAL_DEV_WORKER_RELOAD", True):
        return [python, "-m", "app.main"]
    return [
        python,
        "-m",
        "watchfiles",
        "--filter",
        "python",
        f"{python} -m app.main",
        str(root / "worker" / "app"),
    ]


def build_process_specs(
    *,
    root: Path = ROOT,
    python: str = sys.executable,
    environ: dict[str, str] | None = None,
) -> list[ProcessSpec]:
    environ = environ or os.environ
    dev_home = Path(environ.get("DIALECTICAL_DEV_HOME") or root / ".dialectical-dev").expanduser()
    coordinator_port = int_env(environ, "DIALECTICAL_DEV_COORDINATOR_PORT", 8000)
    public_web_port = int_env(environ, "DIALECTICAL_DEV_WEB_PORT", 3000)
    next_port = int_env(environ, "DIALECTICAL_DEV_NEXT_PORT", 3001)
    next_mode = environ.get("DIALECTICAL_DEV_NEXT_MODE", "dev").strip() or "dev"
    if next_mode not in {"dev", "start"}:
        raise ValueError("DIALECTICAL_DEV_NEXT_MODE must be 'dev' or 'start'")
    coordinator_url = f"http://localhost:{coordinator_port}"
    coordinator_args = [python, "-m", "uvicorn", "app.main:app", "--port", str(coordinator_port)]
    if enabled_env(environ, "DIALECTICAL_DEV_RELOAD", True):
        coordinator_args.insert(4, "--reload")
    specs = [
        ProcessSpec(
            "coordinator",
            coordinator_args,
            root / "coordinator",
            {
                "DIALECTICAL_HOME": str(dev_home / "home"),
                "DIALECTICAL_DATABASE_URL": f"sqlite:///{dev_home / 'db.sqlite3'}",
            },
        ),
        ProcessSpec(
            "worker-a",
            [python, "-m", "app.main"],
            root / "worker",
            {
                "DIALECTICAL_WORKER_CONFIG": str(dev_home / "worker.toml"),
                "DIALECTICAL_COORDINATOR_URL": coordinator_url,
                "DIALECTICAL_USER_TOKEN": dev_user_token(environ),
                "DIALECTICAL_WORKER_NAME": environ.get("DIALECTICAL_WORKER_NAME", "mac-mini"),
                "DIALECTICAL_ENABLE_MOCK": environ.get("DIALECTICAL_ENABLE_MOCK", "1"),
                "DIALECTICAL_ENABLE_REAL_ADAPTERS": environ.get("DIALECTICAL_ENABLE_REAL_ADAPTERS", "0"),
            },
        ),
        ProcessSpec(
            "web",
            [
                python,
                str(root / "scripts" / "web_proxy.py"),
                "--root",
                str(root),
                "--next-mode",
                next_mode,
                "--public-host",
                "127.0.0.1",
                "--public-port",
                str(public_web_port),
                "--next-port",
                str(next_port),
                "--coordinator-port",
                str(coordinator_port),
            ],
            root,
            {},
        ),
    ]
    real_worker_config = real_worker_config_path(environ)
    if real_worker_config:
        specs.insert(
            2,
            ProcessSpec(
                "worker-real",
                real_worker_command(python, root, environ),
                root / "worker",
                {
                    "DIALECTICAL_WORKER_CONFIG": str(real_worker_config),
                    "DIALECTICAL_COORDINATOR_URL": coordinator_url,
                },
            ),
        )
    return specs


def start(spec: ProcessSpec) -> subprocess.Popen:
    child_env = os.environ.copy()
    child_env.update(spec.env)
    child_env["DIALECTICAL_USER_TOKEN"] = dev_user_token(child_env)
    process = subprocess.Popen(spec.args, cwd=spec.cwd, env=child_env)
    print(f"[dev] started {spec.name} pid={process.pid}", flush=True)
    return process


def main() -> int:
    processes: list[subprocess.Popen] = []
    try:
        for spec in build_process_specs():
            processes.append(start(spec))
            if spec.name == "coordinator":
                time.sleep(2)
        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    print(f"[dev] process exited pid={process.pid} code={code}", flush=True)
                    return code
            time.sleep(1)
    except KeyboardInterrupt:
        return 130
    finally:
        for process in processes:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
