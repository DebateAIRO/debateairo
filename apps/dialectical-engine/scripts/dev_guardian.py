"""Local dev guardian for coordinator/web, real worker, and judge readiness.

This is a practical resurrection helper for local development. It starts
missing local services, registers/starts the real V2 worker when possible, and
reports judge/scoring status honestly. It never creates fake debates, fake
workers, fake judge output, or prints worker/user tokens.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _common import DEFAULT_DEV_USER_TOKEN, mask_secret  # noqa: E402
from v2_worker_judge_smoke import evaluate_v2_worker_judge_smoke, fetch_json as smoke_fetch_json  # noqa: E402

REQUIRED_MODEL = "codex-gpt-5.5"
DEFAULT_COORDINATOR_URL = "http://127.0.0.1:8000"
DEFAULT_WEB_URL = "http://127.0.0.1:3000"
WORKER_CONFIG_DEFAULT = ROOT / ".dialectical-dev" / "worker-real.toml"
GUARDIAN_STATE = ROOT / ".dialectical-dev" / "guardian.json"


@dataclass
class CommandResult:
    ok: bool
    stdout: str = ""
    stderr: str = ""
    returncode: int | None = None


def http_json(url: str, *, token: str | None = None, timeout: float = 5) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"{url} returned non-object JSON")
    return payload


def http_ready(url: str, *, timeout: float = 5) -> bool:
    try:
        request = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 500
    except Exception:
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return 200 <= response.status < 500
        except Exception:
            return False


def python_exe() -> str:
    candidates = [
        ROOT / ".venv" / "Scripts" / "python.exe",
        ROOT / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def popen_detached(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None,
    stdout_log: Path,
    stderr_log: Path,
) -> int:
    stdout_log.parent.mkdir(parents=True, exist_ok=True)
    stderr_log.parent.mkdir(parents=True, exist_ok=True)
    stdout = stdout_log.open("ab")
    stderr = stderr_log.open("ab")
    kwargs: dict[str, Any] = {
        "cwd": str(cwd),
        "env": env,
        "stdin": subprocess.DEVNULL,
        "stdout": stdout,
        "stderr": stderr,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(args, **kwargs)
    return int(process.pid)


def clean_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env: dict[str, str] = {}
    path_value = os.environ.get("Path") or os.environ.get("PATH") or ""
    for key, value in os.environ.items():
        if key.lower() == "path":
            continue
        env[key] = value
    env["Path" if os.name == "nt" else "PATH"] = path_value
    if extra:
        env.update(extra)
    return env


def run_command(args: list[str], *, env: dict[str, str] | None = None, timeout: float = 30) -> CommandResult:
    try:
        completed = subprocess.run(
            args,
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        return CommandResult(ok=False, stderr=str(exc))
    return CommandResult(
        ok=completed.returncode == 0,
        stdout=completed.stdout,
        stderr=completed.stderr,
        returncode=completed.returncode,
    )


def redacted_command_result(result: CommandResult) -> dict[str, Any]:
    return {
        "ok": result.ok,
        "returncode": result.returncode,
        "stdout": redact_text(result.stdout),
        "stderr": redact_text(result.stderr),
    }


def redact_text(value: str) -> str:
    redacted = value
    for key in ("DIALECTICAL_USER_TOKEN", "USER_TOKEN", "DIALECTICAL_WORKER_TOKEN", "Authorization"):
        redacted = redacted.replace(os.environ.get(key, ""), "[redacted]") if os.environ.get(key) else redacted
    return redacted


class DevGuardian:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.py = python_exe()
        self.dev_dir = ROOT / ".dialectical-dev"
        self.dev_dir.mkdir(parents=True, exist_ok=True)
        self.coordinator_url = args.base_url.rstrip("/")
        self.web_url = args.web_url.rstrip("/")
        self.user_token = args.user_token or os.environ.get("DIALECTICAL_USER_TOKEN") or DEFAULT_DEV_USER_TOKEN
        self.worker_config = Path(args.worker_config).expanduser()
        if not self.worker_config.is_absolute():
            self.worker_config = (ROOT / self.worker_config).resolve()

    def run(self) -> dict[str, Any]:
        report: dict[str, Any] = {
            "status": "blocked",
            "coordinator": self.ensure_coordinator(),
            "web": {"state": "not_checked", "url": self.web_url},
            "worker": {"state": "not_checked", "required_model": self.args.required_model},
            "judges": {"state": "not_checked", "debate_id": self.args.debate_id},
            "secrets_redacted": True,
        }
        report["web"] = self.ensure_web()
        backend_status = self.fetch_backend_status()
        report["worker"] = self.ensure_worker(backend_status)
        backend_status = self.fetch_backend_status()
        report["judges"] = self.check_judges()
        report["status"] = overall_status(report)
        self.write_state(report)
        return report

    def ensure_coordinator(self) -> dict[str, Any]:
        status_url = f"{self.coordinator_url}/api/backends/status"
        if self.backend_reachable():
            return {"state": "ready", "url": self.coordinator_url}
        if self.args.no_start_stack:
            return {"state": "unreachable", "url": self.coordinator_url}
        env = clean_env(
            {
                "DIALECTICAL_USER_TOKEN": self.user_token,
                "DIALECTICAL_HOME": str(self.dev_dir / "home"),
                "DIALECTICAL_DATABASE_URL": f"sqlite:///{self.dev_dir / 'db.sqlite3'}",
            }
        )
        pid = popen_detached(
            [self.py, "-m", "uvicorn", "app.main:app", "--port", "8000"],
            cwd=ROOT / "coordinator",
            env=env,
            stdout_log=self.dev_dir / "guardian-coordinator.out.log",
            stderr_log=self.dev_dir / "guardian-coordinator.err.log",
        )
        if wait_for(lambda: http_ready(status_url), self.args.start_timeout_seconds):
            return {"state": "ready", "url": self.coordinator_url, "started_pid": pid}
        return {"state": "failed", "url": self.coordinator_url, "started_pid": pid, "log": str(self.dev_dir / "guardian-coordinator.err.log")}

    def ensure_web(self) -> dict[str, Any]:
        if http_ready(self.web_url):
            return {"state": "ready", "url": self.web_url}
        if self.args.no_start_stack:
            return {"state": "unreachable", "url": self.web_url}
        pnpm = os.environ.get("PNPM") or str(Path(os.environ.get("APPDATA", "")) / "npm" / "pnpm.cmd")
        if os.name != "nt" and not Path(pnpm).exists():
            pnpm = "pnpm"
        env = clean_env({"PNPM": pnpm, "DIALECTICAL_USER_TOKEN": self.user_token})
        pid = popen_detached(
            [
                self.py,
                "scripts/web_proxy.py",
                "--root",
                str(ROOT),
                "--next-mode",
                "dev",
                "--public-host",
                "127.0.0.1",
                "--public-port",
                "3000",
                "--next-port",
                "3001",
                "--coordinator-port",
                "8000",
                "--pnpm",
                pnpm,
            ],
            cwd=ROOT,
            env=env,
            stdout_log=self.dev_dir / "guardian-web.out.log",
            stderr_log=self.dev_dir / "guardian-web.err.log",
        )
        if wait_for(lambda: http_ready(self.web_url), self.args.start_timeout_seconds):
            return {"state": "ready", "url": self.web_url, "started_pid": pid}
        return {"state": "failed", "url": self.web_url, "started_pid": pid, "log": str(self.dev_dir / "guardian-web.err.log")}

    def backend_reachable(self) -> bool:
        try:
            self.fetch_backend_status()
            return True
        except Exception:
            return False

    def fetch_backend_status(self) -> dict[str, Any] | None:
        try:
            return http_json(f"{self.coordinator_url}/api/backends/status", token=self.user_token)
        except Exception:
            return None

    def ensure_worker(self, backend_status: dict[str, Any] | None) -> dict[str, Any]:
        worker_state = evaluate_worker_status(backend_status, self.args.required_model)
        if worker_state["state"] == "ready" or self.args.no_start_worker:
            return worker_state
        if not self.worker_config.exists():
            registration = self.register_worker()
            if not registration.ok:
                worker_state.update({"state": "config_missing", "register": redacted_command_result(registration)})
                return worker_state
        elif not config_has_worker_identity(self.worker_config):
            registration = self.register_worker()
            if not registration.ok:
                worker_state.update({"state": "blocked_auth", "register": redacted_command_result(registration)})
                return worker_state

        pid = self.start_worker()
        if wait_for(
            lambda: evaluate_worker_status(self.fetch_backend_status(), self.args.required_model)["state"] == "ready",
            self.args.worker_timeout_seconds,
        ):
            ready_state = evaluate_worker_status(self.fetch_backend_status(), self.args.required_model)
            ready_state["started_pid"] = pid
            ready_state["worker_config"] = safe_path(self.worker_config)
            return ready_state
        blocked = evaluate_worker_status(self.fetch_backend_status(), self.args.required_model)
        blocked.update(
            {
                "started_pid": pid,
                "worker_config": safe_path(self.worker_config),
                "log": str(self.dev_dir / "guardian-worker.err.log"),
            }
        )
        return blocked

    def register_worker(self) -> CommandResult:
        env = clean_env({"DIALECTICAL_USER_TOKEN": self.user_token})
        return run_command(
            [
                self.py,
                "scripts/register_worker.py",
                "--coordinator-url",
                self.coordinator_url,
                "--name",
                self.args.worker_name,
                "--config",
                str(self.worker_config),
                "--allowed-models",
                self.args.required_model,
            ],
            env=env,
            timeout=60,
        )

    def start_worker(self) -> int:
        env = clean_env(
            {
                "DIALECTICAL_WORKER_CONFIG": str(self.worker_config),
                "DIALECTICAL_COORDINATOR_URL": self.coordinator_url,
                "DIALECTICAL_USER_TOKEN": self.user_token,
                "DIALECTICAL_ENABLE_MOCK": "0",
                "DIALECTICAL_ENABLE_REAL_ADAPTERS": "1",
            }
        )
        pid = popen_detached(
            [self.py, "-m", "app.main"],
            cwd=ROOT / "worker",
            env=env,
            stdout_log=self.dev_dir / "guardian-worker.out.log",
            stderr_log=self.dev_dir / "guardian-worker.err.log",
        )
        (self.dev_dir / "guardian-worker.pid").write_text(str(pid), encoding="utf-8")
        return pid

    def check_judges(self) -> dict[str, Any]:
        if not self.args.debate_id:
            state = "needs_real_debate"
            if self.args.require_judges:
                state = "failed"
            return {
                "state": state,
                "debate_id": None,
                "reason": "Pass --debate-id with a real local debate to check judge/scoring lifecycle.",
            }
        report = evaluate_v2_worker_judge_smoke(
            fetch_json=smoke_fetch_json,
            base_url=self.coordinator_url,
            debate_id=self.args.debate_id,
            user_token=self.user_token,
            database_url=self.args.database_url,
            start_scoring_job=self.args.start_scoring_job,
            timeout_seconds=self.args.scoring_timeout_seconds,
        )
        scoring = report.get("checks", {}).get("scoring_lifecycle", {})
        if report.get("status") == "passed":
            return {"state": "ready", "debate_id": self.args.debate_id, "source": scoring.get("source")}
        job_status = scoring.get("job_status")
        if job_status and job_status not in {"complete", "failed"}:
            return {"state": "job_running", "debate_id": self.args.debate_id, "job_status": job_status}
        return {
            "state": "failed" if self.args.require_judges else "unavailable",
            "debate_id": self.args.debate_id,
            "reason": scoring.get("reason") or "Judge/scoring lifecycle is not ready.",
        }

    def write_state(self, report: dict[str, Any]) -> None:
        state = {
            "desired_services": ["coordinator", "web", "worker-real", "judge-guard"],
            "worker_config": safe_path(self.worker_config),
            "last_known_worker_name": self.args.worker_name,
            "last_status": report.get("status"),
        }
        GUARDIAN_STATE.parent.mkdir(parents=True, exist_ok=True)
        GUARDIAN_STATE.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def wait_for(predicate: Any, timeout_seconds: float) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(1)
    return predicate()


def config_has_worker_identity(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    return "worker_id" in text and "worker_token" in text


def evaluate_worker_status(backend_status: dict[str, Any] | None, required_model: str) -> dict[str, Any]:
    if not backend_status:
        return {"state": "failed", "reason_code": "backend_status_unavailable", "required_model": required_model}
    readiness = backend_status.get("v2_generation_readiness")
    workers = backend_status.get("workers") if isinstance(backend_status.get("workers"), list) else []
    if not isinstance(readiness, dict):
        return {"state": "failed", "reason_code": "missing_v2_generation_readiness", "required_model": required_model}
    online_names = [str(name) for name in readiness.get("online_worker_names") or [] if str(name).strip()]
    base = {
        "required_model": readiness.get("required_model") or required_model,
        "reason_code": readiness.get("reason_code"),
        "reason": readiness.get("reason"),
        "online_worker_names": online_names,
    }
    real_online = [
        worker for worker in workers
        if isinstance(worker, dict)
        and worker.get("status") == "online"
        and required_model in [str(capability) for capability in worker.get("capabilities") or []]
        and "mock-local" not in [str(capability).lower() for capability in worker.get("capabilities") or []]
    ]
    if readiness.get("ready") is True and real_online:
        return {**base, "state": "ready"}
    reason_code = str(readiness.get("reason_code") or "")
    if reason_code in {"offline_real_worker", "stale_real_worker"}:
        state = "stale" if reason_code == "stale_real_worker" else "failed"
    elif reason_code in {"no_real_worker", "no_workers"}:
        state = "config_missing"
    elif reason_code in {"mock_only", "fake_only"}:
        state = "fake_only"
    elif reason_code in {"model_not_allowed", "required_model_unavailable"}:
        state = "failed"
    else:
        state = "failed"
    return {**base, "state": state}


def overall_status(report: dict[str, Any]) -> str:
    if report["coordinator"].get("state") != "ready" or report["web"].get("state") != "ready":
        return "failed"
    if report["worker"].get("state") != "ready":
        return "blocked"
    if report["judges"].get("state") in {"failed"}:
        return "failed"
    if report["judges"].get("state") in {"unavailable", "needs_real_debate", "job_running"}:
        return "blocked"
    return "passed"


def safe_path(path: Path) -> str:
    try:
        return str(path.resolve())
    except OSError:
        return str(path)


def print_human(report: dict[str, Any], *, user_token: str | None) -> None:
    token_text = mask_secret(user_token or "") if user_token else "(unset)"
    print("Dev Guardian")
    print(f"- status: {report['status']}")
    print(f"- coordinator: {report['coordinator'].get('state')} {report['coordinator'].get('url')}")
    print(f"- web: {report['web'].get('state')} {report['web'].get('url')}")
    worker = report["worker"]
    print(
        "- worker: "
        f"{worker.get('state')} "
        f"model={worker.get('required_model')} "
        f"reason={worker.get('reason_code') or worker.get('reason')}"
    )
    if worker.get("online_worker_names"):
        print(f"- online real workers: {', '.join(worker['online_worker_names'])}")
    judges = report["judges"]
    print(f"- judges/scoring: {judges.get('state')} debate={judges.get('debate_id') or '(none)'}")
    if judges.get("reason"):
        print(f"- judges reason: {judges['reason']}")
    print(f"- token: {token_text}")
    print("- secrets redacted: yes")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start/check local dev stack, real worker, and judge readiness.")
    parser.add_argument("--once", action="store_true", help="Compatibility no-op; guardian runs once by default.")
    parser.add_argument("--base-url", default=DEFAULT_COORDINATOR_URL)
    parser.add_argument("--web-url", default=DEFAULT_WEB_URL)
    parser.add_argument("--user-token", default=None)
    parser.add_argument("--debate-id")
    parser.add_argument("--start-scoring-job", action="store_true")
    parser.add_argument("--require-judges", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--worker-config", default=str(WORKER_CONFIG_DEFAULT))
    parser.add_argument("--worker-name", default=os.environ.get("DIALECTICAL_WORKER_NAME", "VLADWORKS"))
    parser.add_argument("--required-model", default=REQUIRED_MODEL)
    parser.add_argument("--database-url", default=f"sqlite:///{ROOT / '.dialectical-dev' / 'db.sqlite3'}")
    parser.add_argument("--start-timeout-seconds", type=float, default=60)
    parser.add_argument("--worker-timeout-seconds", type=float, default=45)
    parser.add_argument("--scoring-timeout-seconds", type=float, default=120)
    parser.add_argument("--no-start-stack", action="store_true")
    parser.add_argument("--no-start-worker", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    guardian = DevGuardian(args)
    report = guardian.run()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human(report, user_token=guardian.user_token)
    return 0 if report["status"] in {"passed", "blocked"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
