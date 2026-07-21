import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dev_guardian.py"


def load_module():
    spec = importlib.util.spec_from_file_location("dev_guardian", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_evaluate_worker_status_reports_ready_state() -> None:
    module = load_module()
    status = module.evaluate_worker_status(
        {
            "v2_generation_readiness": {
                "ready": True,
                "reason": "Real gpt-5.6sol-medium worker is online.",
                "reason_code": "ready",
                "online_worker_names": ["w1"],
            },
            "workers": [{"name": "w1", "status": "online", "current_job_id": None, "capabilities": ["gpt-5.6sol-medium"]}],
        },
        "gpt-5.6sol-medium",
    )
    assert status["state"] == "ready"
    assert status["reason_code"] == "ready"
    assert status["online_worker_names"] == ["w1"]


def test_evaluate_worker_status_reports_blocked_states_honestly() -> None:
    module = load_module()
    status = module.evaluate_worker_status(
        {
            "v2_generation_readiness": {"ready": False, "reason": "A real gpt-5.6sol-medium worker is known but stale or not currently online.", "reason_code": "stale_real_worker"},
            "workers": [{"name": "w1", "status": "starting", "current_job_id": "j1", "capabilities": ["gpt-5.6sol-medium"]}],
        },
        "gpt-5.6sol-medium",
    )
    assert status["state"] == "stale"
    assert status["reason_code"] == "stale_real_worker"
    assert status["reason"].startswith("A real gpt-5.6sol-medium worker")


def test_overall_status_contract() -> None:
    module = load_module()
    ready = {
        "coordinator": {"state": "ready"},
        "web": {"state": "ready"},
        "worker": {"state": "ready"},
        "judges": {"state": "ready"},
    }
    assert module.overall_status(ready) == "passed"

    worker_blocked = {
        **ready,
        "worker": {"state": "config_missing"},
    }
    assert module.overall_status(worker_blocked) == "blocked"

    coordinator_failed = {
        **ready,
        "coordinator": {"state": "failed"},
    }
    assert module.overall_status(coordinator_failed) == "failed"
