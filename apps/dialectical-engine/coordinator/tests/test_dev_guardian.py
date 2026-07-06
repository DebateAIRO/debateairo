import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dev_guardian.py"


def load_module():
    spec = importlib.util.spec_from_file_location("dev_guardian", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_summarize_reports_ready_state() -> None:
    module = load_module()
    line = module.summarize_status(
        {
            "v2_generation_readiness": {"ready": True, "reason": "Real codex-gpt-5.5 worker is online.", "reason_code": "ready"},
            "workers": [{"name": "w1", "status": "online", "current_job_id": None, "capabilities": ["codex-gpt-5.5"]}],
        }
    )
    assert "ready" in line
    assert "w1:online" in line


def test_summarize_reports_blocked_states_honestly() -> None:
    module = load_module()
    line = module.summarize_status(
        {
            "v2_generation_readiness": {"ready": False, "reason": "A real codex-gpt-5.5 worker is known but stale or not currently online.", "reason_code": "stale_real_worker"},
            "workers": [{"name": "w1", "status": "starting", "current_job_id": "j1", "capabilities": ["codex-gpt-5.5"]}],
        }
    )
    assert "NOT READY" in line
    assert "stale_real_worker" in line
    assert "w1:starting" in line
    assert "job=j1" in line


def test_exit_code_contract() -> None:
    module = load_module()
    assert module.exit_code_for({"v2_generation_readiness": {"ready": True}}) == 0
    assert module.exit_code_for({"v2_generation_readiness": {"ready": False}}) == 1
    assert module.exit_code_for({}) == 2  # unknown state is an error, never fake green
