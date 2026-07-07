"""Judge Guardian: honest startup readiness check for scoring judges.

Symptom this fixes: after code/config changes, scoring reports "No judge
agent is configured for scoring" / "Configured scoring provider is
unavailable" and users see judges "not found" with no actionable signal.

This is a startup check, NOT a loop: it runs ONE pass over five ordered
checks and reports the real state of each. It never fakes green — the
overall exit code only reports success when provider detection actually
re-ran and came back available after any repair.

Repair (default ON, disable with --no-repair) is narrowly scoped: it may
only create the `judge` role entry when absent, or fill in `provider`/
`model` when the existing judge entry has an empty model. It never
overwrites a non-empty judge entry and never touches a file that fails to
parse as YAML (that is reported as corrupt_config instead).

No provider/LLM calls are made anywhere in this script.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
COORDINATOR_ROOT = ROOT / "coordinator"
if str(COORDINATOR_ROOT) not in sys.path:
    sys.path.insert(0, str(COORDINATOR_ROOT))

from app.providers.registry import (  # noqa: E402
    AgentConfig,
    default_agents_path,
    detect_scoring_provider_config,
    load_agent_configs,
)
from app.scoring.judge_registry import active_contract  # noqa: E402

REPAIR_ROLE = "judge"
REPAIR_DEFAULTS = {"provider": "codex", "model": "codex-gpt-5.5"}
EXECUTABLE_PROBE_TIMEOUT_SECONDS = 10


def load_raw_yaml(agents_path: Path) -> tuple[dict[str, Any] | None, str | None]:
    """Load the agents YAML as a raw dict. Returns (data, error).

    `data` is None (and `error` set) when the file is missing or fails to
    parse. An empty-but-parseable file loads as `{}`.
    """
    if not agents_path.exists():
        return None, "missing_file"
    try:
        text = agents_path.read_text(encoding="utf-8")
    except OSError as exc:
        return None, f"read_error: {exc}"
    try:
        loaded = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        return None, f"parse_error: {exc}"
    if loaded is None:
        return {}, None
    if not isinstance(loaded, dict):
        return None, "parse_error: top-level YAML is not a mapping"
    return loaded, None


def judge_entry_state(data: dict[str, Any]) -> str:
    """Classify the judge role entry within an already-parsed agents dict.

    Returns one of: "missing_role", "empty_model", "ready".
    """
    agents = data.get("agents")
    if not isinstance(agents, dict) or REPAIR_ROLE not in agents:
        return "missing_role"
    judge_entry = agents.get(REPAIR_ROLE)
    if not isinstance(judge_entry, dict):
        return "missing_role"
    model = judge_entry.get("model")
    if model is None or not str(model).strip():
        return "empty_model"
    return "ready"


def repair_agents_data(data: dict[str, Any]) -> dict[str, Any]:
    """Return a new dict with the judge role created/filled, preserving
    every other key untouched. Never mutates the input in place."""
    repaired = dict(data)
    agents = dict(repaired.get("agents") or {})
    existing = agents.get(REPAIR_ROLE)
    if isinstance(existing, dict) and str(existing.get("model") or "").strip():
        # Already non-empty; never overwrite. (Caller should not reach here
        # in practice since check_agents_config only repairs missing_role/
        # empty_model states, but stay defensive.)
        return data
    if isinstance(existing, dict):
        merged = dict(existing)
        merged.setdefault("provider", REPAIR_DEFAULTS["provider"])
        merged["model"] = REPAIR_DEFAULTS["model"]
    else:
        merged = dict(REPAIR_DEFAULTS)
    agents[REPAIR_ROLE] = merged
    repaired["agents"] = agents
    return repaired


def check_agents_config(agents_path: Path, *, repair: bool) -> dict[str, Any]:
    data, error = load_raw_yaml(agents_path)
    if error == "missing_file":
        if not repair:
            return {"state": "missing_role", "repaired": False, "reason": f"Agents config file not found: {agents_path}"}
        written = repair_agents_data({})
        agents_path.write_text(yaml.safe_dump(written, sort_keys=False), encoding="utf-8")
        return {
            "state": "ready",
            "repaired": True,
            "reason": f"Agents config file was missing; created minimal judge entry at {agents_path}.",
            "written": written["agents"][REPAIR_ROLE],
        }
    if error is not None:
        return {
            "state": "corrupt_config",
            "repaired": False,
            "reason": f"Agents config file could not be parsed and was left untouched: {error}",
        }

    assert data is not None
    state = judge_entry_state(data)
    if state == "ready":
        return {"state": "ready", "repaired": False, "reason": "Judge role is configured with a non-empty model."}
    if not repair:
        reason = (
            "No judge role is configured in the agents file."
            if state == "missing_role"
            else "Judge role is configured but its model is empty."
        )
        return {"state": state, "repaired": False, "reason": reason}

    written = repair_agents_data(data)
    agents_path.write_text(yaml.safe_dump(written, sort_keys=False), encoding="utf-8")
    return {
        "state": "ready",
        "repaired": True,
        "reason": f"Judge role was {state}; repaired in place, preserving all other config.",
        "written": written["agents"][REPAIR_ROLE],
    }


def check_provider_detection(agents_path: Path) -> dict[str, Any]:
    try:
        configs = load_agent_configs(agents_path)
    except Exception as exc:  # noqa: BLE001 - never crash the guardian
        return {"available": False, "reason": f"Could not load agent configs: {exc}"}
    status = detect_scoring_provider_config(configs, role="judge")
    return {
        "available": status.available,
        "role": status.role,
        "provider": status.provider,
        "model": status.model,
        "reason": status.reason,
    }


def check_executable(codex_command: str) -> dict[str, Any]:
    which = shutil.which(codex_command)
    if which is None:
        return {
            "state": "not_found",
            "which": None,
            "reason": f"'{codex_command}' was not found on PATH.",
        }
    try:
        completed = subprocess.run(
            [which, "--version"],
            capture_output=True,
            text=True,
            timeout=EXECUTABLE_PROBE_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "state": "blocked",
            "which": which,
            "reason": f"'{codex_command} --version' timed out after {EXECUTABLE_PROBE_TIMEOUT_SECONDS}s.",
        }
    except OSError as exc:
        return {
            "state": "blocked",
            "which": which,
            "reason": f"'{codex_command} --version' could not be run: {exc}",
        }
    if completed.returncode != 0:
        return {
            "state": "blocked",
            "which": which,
            "reason": f"'{codex_command} --version' exited {completed.returncode}.",
            "stderr": (completed.stderr or "").strip()[:200],
        }
    return {
        "state": "ready",
        "which": which,
        "version_output": (completed.stdout or completed.stderr or "").strip()[:200],
    }


def check_contract(role: str = "judge") -> dict[str, Any]:
    try:
        contract = active_contract(role)
    except KeyError:
        return {"state": "not_found", "reason": f"No active judge contract is registered for role '{role}'."}
    except Exception as exc:  # noqa: BLE001 - never crash the guardian
        return {"state": "error", "reason": f"Could not resolve active contract: {exc}"}
    return {
        "state": "ready",
        "judge_id": contract.judge_id,
        "judge_version": contract.judge_version,
        "contract_hash_prefix": contract.contract_hash[:12],
    }


def run_guardian(*, agents_path: Path, codex_command: str, repair: bool) -> dict[str, Any]:
    report: dict[str, Any] = {}
    report["agents_config"] = check_agents_config(agents_path, repair=repair)
    report["provider_detection"] = check_provider_detection(agents_path)
    report["executable"] = check_executable(codex_command)
    report["contract"] = check_contract()
    return report


def exit_code_for(report: dict[str, Any]) -> int:
    agents_config = report.get("agents_config")
    if not isinstance(agents_config, dict) or "state" not in agents_config:
        return 2
    if agents_config["state"] == "corrupt_config":
        return 2
    provider_detection = report.get("provider_detection")
    if not isinstance(provider_detection, dict) or "available" not in provider_detection:
        return 2
    if agents_config["state"] != "ready":
        return 1
    if provider_detection.get("available") is not True:
        return 1
    executable = report.get("executable")
    if not isinstance(executable, dict) or executable.get("state") != "ready":
        return 1
    contract = report.get("contract")
    if not isinstance(contract, dict) or contract.get("state") != "ready":
        return 1
    return 0


def format_human_report(report: dict[str, Any]) -> list[str]:
    lines = []
    agents_config = report.get("agents_config", {})
    lines.append(
        f"- agents_config: {agents_config.get('state', 'unknown')}"
        f"{' (repaired)' if agents_config.get('repaired') else ''} — {agents_config.get('reason', '')}"
    )
    provider_detection = report.get("provider_detection", {})
    lines.append(
        "- provider_detection: "
        f"{'ready' if provider_detection.get('available') else 'unavailable'} "
        f"provider={provider_detection.get('provider')} model={provider_detection.get('model')} "
        f"— {provider_detection.get('reason') or 'ok'}"
    )
    executable = report.get("executable", {})
    lines.append(
        f"- executable: {executable.get('state', 'unknown')} which={executable.get('which')} "
        f"— {executable.get('reason') or executable.get('version_output') or 'ok'}"
    )
    contract = report.get("contract", {})
    if contract.get("state") == "ready":
        lines.append(
            f"- contract: ready {contract.get('judge_id')}@{contract.get('judge_version')} "
            f"hash={contract.get('contract_hash_prefix')}"
        )
    else:
        lines.append(f"- contract: {contract.get('state', 'unknown')} — {contract.get('reason', '')}")
    return lines


def summary_line(report: dict[str, Any], exit_code: int) -> str:
    if exit_code == 0:
        return "[judge-guardian] READY — judge scoring is fully configured and reachable."
    if exit_code == 2:
        return "[judge-guardian] UNKNOWN/CORRUPT — cannot determine judge readiness safely."
    return "[judge-guardian] NOT READY — judge scoring is not fully configured."


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Startup guardian for scoring judges: checks agent config, provider "
            "detection, the codex executable, and the active judge contract. "
            "Runs one pass; never fakes green."
        )
    )
    parser.add_argument("--agents-path", default=None, help="Override the agents.yaml path (default: repo config/agents.yaml).")
    parser.add_argument("--codex-command", default=None, help="Override the codex executable name (default: $CODEX_COMMAND or 'codex').")
    parser.add_argument("--no-repair", action="store_true", help="Never write to the agents config file; report-only.")
    parser.add_argument("--json", action="store_true", help="Print the full report as JSON instead of human-readable lines.")
    return parser.parse_args(argv)


def resolve_codex_command(explicit: str | None) -> str:
    if explicit:
        return explicit
    import os

    return os.environ.get("CODEX_COMMAND", "codex")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    agents_path = Path(args.agents_path) if args.agents_path else default_agents_path()
    codex_command = resolve_codex_command(args.codex_command)
    repair = not args.no_repair

    report = run_guardian(agents_path=agents_path, codex_command=codex_command, repair=repair)
    exit_code = exit_code_for(report)

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        for line in format_human_report(report):
            print(line)
        print(summary_line(report, exit_code))

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
