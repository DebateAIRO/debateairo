#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Users/stefannour/Documents/DebateAIRO/debateairo/apps/dialectical-engine")
DEFAULT_PUBLIC_URL = "https://dezbatere.ro"
DEFAULT_LMSTUDIO_MODEL = "google_gemma-4-e4b-it"
DEFAULT_STATE_PATH = Path("~/.dialectical/dezbatere-watchdog-state.json").expanduser()
DEFAULT_REPORT_PATH = Path("/private/tmp/dezbatere-watchdog-report.json")
DEFAULT_CODEX_PROMPT_PATH = Path("/private/tmp/dezbatere-watchdog-codex-prompt.txt")
DEFAULT_CODEX_LAST_MESSAGE_PATH = Path("/private/tmp/dezbatere-watchdog-codex-last-message.txt")
DEFAULT_CODEX_COOLDOWN_SECONDS = 3600
DEFAULT_TIMEOUT_SECONDS = 20

CRITICAL_LABELS = (
    "com.dialectical.coordinator",
    "com.dialectical.web",
    "com.dialectical.worker",
    "com.dialectical.cloudflared",
)
RUNTIME_PATHS = (".venv313", "web/node_modules", "web/.next")
EXPECTED_WORKERS = ("mac-mini", "claude-max-loop", "gemini-google-loop")


@dataclass
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out

    def to_dict(self) -> dict[str, Any]:
        return {
            "command": self.command,
            "returncode": self.returncode,
            "stdout": self.stdout[-4000:],
            "stderr": self.stderr[-4000:],
            "timed_out": self.timed_out,
        }


@dataclass
class Watchdog:
    root: Path
    public_url: str
    lmstudio_model: str
    check_lmstudio: bool
    invoke_codex: bool
    state_path: Path
    report_path: Path
    codex_prompt_path: Path
    codex_last_message_path: Path
    codex_cooldown_seconds: int
    strict_exit: bool
    actions: list[dict[str, Any]] = field(default_factory=list)
    checks: dict[str, Any] = field(default_factory=dict)
    unresolved: list[str] = field(default_factory=list)

    def run_command(
        self,
        command: list[str],
        *,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> CommandResult:
        started = time.monotonic()
        try:
            proc = subprocess.run(
                command,
                cwd=str(cwd or self.root),
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
            result = CommandResult(command, proc.returncode, proc.stdout, proc.stderr)
        except subprocess.TimeoutExpired as exc:
            result = CommandResult(
                command,
                124,
                (exc.stdout or "") if isinstance(exc.stdout, str) else "",
                (exc.stderr or "") if isinstance(exc.stderr, str) else "",
                timed_out=True,
            )
        self.actions.append(
            {
                "kind": "command",
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "result": result.to_dict(),
            }
        )
        return result

    def http_ok(self, url: str, *, timeout: int = 10) -> dict[str, Any]:
        request = urllib.request.Request(url, method="GET", headers={"User-Agent": "dezbatere-watchdog/1"})
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read(2_000_000)
                payload: Any = None
                content_type = response.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    try:
                        payload = json.loads(body.decode("utf-8"))
                    except json.JSONDecodeError:
                        payload = None
                return {
                    "ok": 200 <= response.status < 400,
                    "status": response.status,
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "json": payload,
                }
        except urllib.error.HTTPError as exc:
            return {"ok": False, "status": exc.code, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001 - report all operational failures.
            return {"ok": False, "status": None, "error": str(exc)}

    def launchd_state(self, label: str) -> dict[str, Any]:
        uid = os.getuid()
        result = self.run_command(["launchctl", "print", f"gui/{uid}/{label}"], timeout=10)
        output = f"{result.stdout}\n{result.stderr}"
        state = None
        path = None
        for line in output.splitlines():
            stripped = line.strip()
            if state is None and stripped.startswith("state ="):
                state = stripped.split("=", 1)[1].strip()
            elif path is None and stripped.startswith("path ="):
                path = stripped.split("=", 1)[1].strip()
        return {
            "ok": result.ok and state == "running",
            "state": state,
            "path": path,
            "returncode": result.returncode,
        }

    def kickstart(self, label: str) -> None:
        uid = os.getuid()
        self.run_command(["launchctl", "kickstart", "-k", f"gui/{uid}/{label}"], timeout=15)

    def load_plist(self, plist: Path) -> None:
        self.run_command(["launchctl", "load", str(plist)], timeout=15)

    def service_plist(self, label: str) -> Path:
        return Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"

    def hydrate_runtime_files(self) -> None:
        for relative in RUNTIME_PATHS:
            target = self.root / relative
            if not target.exists():
                continue
            self.run_command(["brctl", "download", str(target)], timeout=60)
            self.run_command(["xattr", "-r", "-d", "com.apple.provenance", str(target)], timeout=120)
            self.run_command(["chflags", "-R", "nohidden", str(target)], timeout=120)
        self.run_command(
            ["find", *RUNTIME_PATHS, "-flags", "+dataless", "-exec", "brctl", "download", "{}", "+"],
            timeout=180,
        )

    def install_core_services(self) -> None:
        self.hydrate_runtime_files()
        self.run_command(["pnpm", "--dir", "web", "build"], timeout=180)
        self.run_command(["make", "install-services"], timeout=240)

    def install_lmstudio_worker(self) -> None:
        self.run_command(["make", "install-lmstudio-worker"], timeout=60)

    def ensure_subscription_loops(self) -> None:
        status = self.run_command(["make", "subscription-loop-status"], timeout=20)
        self.checks["subscription_loops"] = {
            "ok": status.ok
            and "dialectical-claude-loop: running" in status.stdout
            and "dialectical-gemini-loop: running" in status.stdout,
            "stdout": status.stdout[-1000:],
            "stderr": status.stderr[-1000:],
        }
        if not self.checks["subscription_loops"]["ok"]:
            self.run_command(["make", "start-subscription-loops"], timeout=60)

    def ensure_lmstudio(self) -> None:
        lms = "/Users/stefannour/.lmstudio/bin/lms"
        if not Path(lms).exists():
            self.checks["lmstudio"] = {"ok": False, "error": f"{lms} is missing"}
            return
        status = self.run_command([lms, "server", "status"], timeout=15)
        status_output = f"{status.stdout}\n{status.stderr}"
        if "OFF" in status_output or not status.ok:
            self.run_command([lms, "server", "start"], timeout=30)
        models = self.http_ok("http://127.0.0.1:1234/v1/models", timeout=10)
        advertised = [
            model.get("id")
            for model in ((models.get("json") or {}).get("data") or [])
            if isinstance(model, dict)
        ]
        if self.lmstudio_model not in advertised:
            self.checks["lmstudio"] = {
                "ok": False,
                "error": f"{self.lmstudio_model} is not advertised by LMStudio",
                "advertised": advertised,
            }
            return
        loaded = self.run_command([lms, "ps"], timeout=15)
        if self.lmstudio_model not in loaded.stdout:
            self.run_command([lms, "load", self.lmstudio_model], timeout=240)
        self.install_lmstudio_worker()
        self.checks["lmstudio"] = {"ok": True, "advertised": advertised}

    def lmstudio_runtime_state(self) -> dict[str, Any]:
        lms = "/Users/stefannour/.lmstudio/bin/lms"
        if not Path(lms).exists():
            return {"ok": False, "error": f"{lms} is missing"}
        status = self.run_command([lms, "server", "status"], timeout=15)
        status_output = f"{status.stdout}\n{status.stderr}"
        models = self.http_ok("http://127.0.0.1:1234/v1/models", timeout=10)
        loaded = self.run_command([lms, "ps"], timeout=15)
        advertised = [
            model.get("id")
            for model in ((models.get("json") or {}).get("data") or [])
            if isinstance(model, dict)
        ]
        return {
            "ok": (
                status.ok
                and ("ON" in status_output or "running" in status_output.lower())
                and models.get("ok")
                and self.lmstudio_model in advertised
                and loaded.ok
                and self.lmstudio_model in loaded.stdout
            ),
            "server_status": status_output[-1000:],
            "models_http": models,
            "advertised": advertised,
            "loaded_stdout": loaded.stdout[-1000:],
        }

    def backend_status(self) -> dict[str, Any]:
        status = self.http_ok(f"{self.public_url.rstrip('/')}/api/backends/status", timeout=15)
        workers = {}
        payload = status.get("json") or {}
        if isinstance(payload, dict):
            for worker in payload.get("workers", []):
                if isinstance(worker, dict) and isinstance(worker.get("name"), str):
                    workers[worker["name"]] = {
                        "status": worker.get("status"),
                        "capabilities": worker.get("capabilities", []),
                    }
        expected = [*EXPECTED_WORKERS]
        if self.check_lmstudio:
            expected.append("mac-mini-lmstudio")
        missing_or_offline = [
            name
            for name in expected
            if workers.get(name, {}).get("status") != "online"
        ]
        return {
            "ok": status.get("ok") and not missing_or_offline,
            "http": status,
            "workers": workers,
            "missing_or_offline": missing_or_offline,
        }

    def run_checks(self, *, phase: str) -> bool:
        self.checks[phase] = {}
        self.checks[phase]["local_health"] = self.http_ok("http://127.0.0.1:8000/healthz", timeout=8)
        self.checks[phase]["public_home"] = self.http_ok(f"{self.public_url.rstrip('/')}/", timeout=15)
        self.checks[phase]["public_api"] = self.http_ok(f"{self.public_url.rstrip('/')}/api/debates", timeout=15)
        self.checks[phase]["launchd"] = {label: self.launchd_state(label) for label in CRITICAL_LABELS}
        if self.check_lmstudio:
            self.checks[phase]["launchd"]["com.dialectical.lmstudio-worker"] = self.launchd_state(
                "com.dialectical.lmstudio-worker"
            )
            self.checks[phase]["lmstudio_runtime"] = self.lmstudio_runtime_state()
        self.checks[phase]["backends"] = self.backend_status()

        checks = self.checks[phase]
        return (
            checks["local_health"].get("ok")
            and checks["public_home"].get("ok")
            and checks["public_api"].get("ok")
            and all(service.get("ok") for service in checks["launchd"].values())
            and (not self.check_lmstudio or checks["lmstudio_runtime"].get("ok"))
            and checks["backends"].get("ok")
        )

    def repair(self) -> None:
        launchd = self.checks.get("before", {}).get("launchd", {})
        if not launchd or not all(service.get("ok") for service in launchd.values()):
            self.install_core_services()
            worker_plist = self.service_plist("com.dialectical.worker")
            if worker_plist.exists():
                self.load_plist(worker_plist)
            cloudflared_plist = self.service_plist("com.dialectical.cloudflared")
            if cloudflared_plist.exists():
                self.load_plist(cloudflared_plist)

        if not self.checks.get("before", {}).get("public_home", {}).get("ok"):
            self.install_core_services()

        backends = self.checks.get("before", {}).get("backends", {})
        if any(name in backends.get("missing_or_offline", []) for name in EXPECTED_WORKERS):
            self.kickstart("com.dialectical.worker")
            self.ensure_subscription_loops()

        if self.check_lmstudio:
            self.ensure_lmstudio()

    def load_state(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def save_state(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")

    def write_report(self, *, ok: bool) -> dict[str, Any]:
        report = {
            "ok": ok,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "root": str(self.root),
            "public_url": self.public_url,
            "checks": self.checks,
            "actions": self.actions,
            "unresolved": self.unresolved,
        }
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        return report

    def codex_prompt(self) -> str:
        return "\n".join(
            [
                "The Dezbatere.ro watchdog could not restore full health automatically.",
                f"Live app root: {self.root}",
                f"Watchdog report: {self.report_path}",
                "Diagnose likely causes from the report and current host state.",
                "The user explicitly approved this unattended Codex escalation.",
                "Do not print secrets. Prefer existing Makefile and launchd helpers.",
                "Make the smallest safe repair needed to restore dezbatere.ro and its workers.",
                "If sandboxing prevents a required host-level action, write the exact command and reason to /private/tmp/dezbatere-codex-needed.txt.",
            ]
        )

    def write_codex_prompt(self) -> None:
        self.codex_prompt_path.parent.mkdir(parents=True, exist_ok=True)
        self.codex_prompt_path.write_text(self.codex_prompt() + "\n", encoding="utf-8")

    def maybe_invoke_codex_diagnostics(self, report: dict[str, Any]) -> None:
        if not self.invoke_codex or report.get("ok"):
            return
        codex = "/opt/homebrew/bin/codex"
        if not Path(codex).exists():
            self.actions.append({"kind": "codex", "ok": False, "error": f"{codex} is missing"})
            return
        state = self.load_state()
        now = time.time()
        last = float(state.get("last_codex_at") or 0)
        if now - last < self.codex_cooldown_seconds:
            self.actions.append(
                {
                    "kind": "codex",
                    "ok": False,
                    "skipped": "cooldown",
                    "seconds_until_next": int(self.codex_cooldown_seconds - (now - last)),
                }
            )
            return
        prompt = self.codex_prompt()
        result = self.run_command(
            [
                codex,
                "exec",
                "--cd",
                str(self.root),
                "--sandbox",
                "workspace-write",
                "--add-dir",
                str(Path.home() / "Library" / "LaunchAgents"),
                "--add-dir",
                "/private/tmp",
                "--ephemeral",
                "--output-last-message",
                str(self.codex_last_message_path),
                prompt,
            ],
            timeout=900,
        )
        state["last_codex_at"] = now
        self.save_state(state)
        self.actions.append({"kind": "codex_diagnostics", "result": result.to_dict()})

    def run(self) -> int:
        ok_before = self.run_checks(phase="before")
        if not ok_before:
            self.repair()
            time.sleep(3)
        ok_after = self.run_checks(phase="after")
        if not ok_after:
            self.unresolved = self.summarize_unresolved()
        report = self.write_report(ok=bool(ok_after))
        if not ok_after:
            self.write_codex_prompt()
            self.maybe_invoke_codex_diagnostics(report)
        if self.actions:
            self.write_report(ok=bool(ok_after))
        return 1 if self.strict_exit and not ok_after else 0

    def summarize_unresolved(self) -> list[str]:
        messages: list[str] = []
        after = self.checks.get("after", {})
        for name in ("local_health", "public_home", "public_api"):
            if not after.get(name, {}).get("ok"):
                messages.append(f"{name} failed: {after.get(name)}")
        for label, state in after.get("launchd", {}).items():
            if not state.get("ok"):
                messages.append(f"{label} not running: {state}")
        if self.check_lmstudio and not after.get("lmstudio_runtime", {}).get("ok"):
            messages.append(f"LMStudio runtime is not ready: {after.get('lmstudio_runtime')}")
        backends = after.get("backends", {})
        for worker in backends.get("missing_or_offline", []):
            messages.append(f"{worker} is missing or offline")
        return messages


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Self-heal the local Dezbatere.ro single-Mac runtime.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--public-url", default=DEFAULT_PUBLIC_URL)
    parser.add_argument("--lmstudio-model", default=DEFAULT_LMSTUDIO_MODEL)
    parser.add_argument("--check-lmstudio", action="store_true")
    parser.add_argument("--invoke-codex", action="store_true")
    parser.add_argument("--state-path", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--codex-prompt-path", type=Path, default=DEFAULT_CODEX_PROMPT_PATH)
    parser.add_argument("--codex-last-message-path", type=Path, default=DEFAULT_CODEX_LAST_MESSAGE_PATH)
    parser.add_argument("--codex-cooldown-seconds", type=int, default=DEFAULT_CODEX_COOLDOWN_SECONDS)
    parser.add_argument("--strict-exit", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    watchdog = Watchdog(
        root=args.root,
        public_url=args.public_url,
        lmstudio_model=args.lmstudio_model,
        check_lmstudio=args.check_lmstudio,
        invoke_codex=args.invoke_codex,
        state_path=args.state_path,
        report_path=args.report_path,
        codex_prompt_path=args.codex_prompt_path,
        codex_last_message_path=args.codex_last_message_path,
        codex_cooldown_seconds=args.codex_cooldown_seconds,
        strict_exit=args.strict_exit,
    )
    return watchdog.run()


if __name__ == "__main__":
    raise SystemExit(main())
