from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_dev_module():
    spec = importlib.util.spec_from_file_location("dialectical_dev_runner_wiring", ROOT / "scripts" / "dev.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_guardian_specs_returns_judge_then_worker_in_order() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {})

    assert [spec.name for spec in specs] == ["judge-guardian", "worker-guardian"]


def test_guardian_specs_worker_args_include_once_and_base_url() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {})
    worker = {spec.name: spec for spec in specs}["worker-guardian"]

    assert "--once" in worker.args
    assert worker.args[0] == "/python"
    assert str(ROOT / "scripts" / "dev_guardian.py") in worker.args
    base_url_index = worker.args.index("--base-url") + 1
    assert worker.args[base_url_index] == "http://localhost:8000"
    assert worker.cwd == ROOT


def test_guardian_specs_judge_args_reference_judge_guardian_script() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {})
    judge = {spec.name: spec for spec in specs}["judge-guardian"]

    assert judge.args == ["/python", str(ROOT / "scripts" / "judge_guardian.py")]
    assert judge.cwd == ROOT


def test_guardian_specs_disabled_returns_empty_list() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {"DIALECTICAL_DEV_GUARDIANS": "0"})

    assert specs == []


def test_guardian_specs_port_override_changes_worker_base_url() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {"DIALECTICAL_DEV_COORDINATOR_PORT": "8765"})
    worker = {spec.name: spec for spec in specs}["worker-guardian"]

    base_url_index = worker.args.index("--base-url") + 1
    assert worker.args[base_url_index] == "http://localhost:8765"


def test_guardian_specs_worker_user_token_passed_through() -> None:
    module = load_dev_module()

    specs = module.guardian_specs(ROOT, "/python", {"DIALECTICAL_USER_TOKEN": "custom-token"})
    worker = {spec.name: spec for spec in specs}["worker-guardian"]

    token_index = worker.args.index("--user-token") + 1
    assert worker.args[token_index] == "custom-token"


def test_build_process_specs_unchanged_by_guardian_feature() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(root=ROOT, python="/python", environ={"DIALECTICAL_DEV_REAL_WORKER_AUTO": "0"})

    assert [spec.name for spec in specs] == ["coordinator", "worker-a", "web"]
    assert not any("guardian" in spec.name for spec in specs)


class _FakeProcess:
    def __init__(
        self,
        name: str,
        *,
        exit_code: int | None = 0,
        hang: bool = False,
        interrupt_on_wait: bool = False,
        terminate_raises_oserror: bool = False,
    ) -> None:
        self.name = name
        self.pid = 4242
        self._exit_code = exit_code
        self._hang = hang
        self._interrupt_on_wait = interrupt_on_wait
        self._terminate_raises_oserror = terminate_raises_oserror
        self.killed = False
        self.terminated = False
        self.wait_calls = 0

    def wait(self, timeout=None):  # noqa: ANN001 - mirrors subprocess.Popen.wait signature
        self.wait_calls += 1
        if self._interrupt_on_wait and self.wait_calls == 1:
            raise KeyboardInterrupt
        if self._hang and not self.killed:
            raise subprocess.TimeoutExpired(cmd=self.name, timeout=timeout)
        return self._exit_code

    def terminate(self) -> None:
        self.terminated = True
        if self._terminate_raises_oserror:
            raise OSError("process already reaped")

    def kill(self) -> None:
        self.killed = True


def test_run_guardians_reports_ready_and_not_ready(monkeypatch, capsys) -> None:
    module = load_dev_module()
    specs = [
        module.ProcessSpec("judge-guardian", ["python", "judge_guardian.py"], ROOT, {}),
        module.ProcessSpec("worker-guardian", ["python", "dev_guardian.py"], ROOT, {}),
    ]
    fakes = {
        "judge-guardian": _FakeProcess("judge-guardian", exit_code=0),
        "worker-guardian": _FakeProcess("worker-guardian", exit_code=1),
    }

    def fake_start(spec):
        return fakes[spec.name]

    monkeypatch.setattr(module, "start", fake_start)

    module.run_guardians(specs)

    output = capsys.readouterr().out
    assert "[dev] judge-guardian exit=0 (ready)" in output
    assert "[dev] worker-guardian exit=1 (NOT READY — see output above)" in output


def test_run_guardians_never_raises_on_unknown_exit_code(monkeypatch, capsys) -> None:
    module = load_dev_module()
    specs = [module.ProcessSpec("judge-guardian", ["python", "judge_guardian.py"], ROOT, {})]
    fake = _FakeProcess("judge-guardian", exit_code=2)

    monkeypatch.setattr(module, "start", lambda spec: fake)

    module.run_guardians(specs)  # must not raise

    output = capsys.readouterr().out
    assert "[dev] judge-guardian exit=2 (unknown)" in output


def test_run_guardians_kills_on_timeout_and_does_not_raise(monkeypatch, capsys) -> None:
    module = load_dev_module()
    specs = [module.ProcessSpec("worker-guardian", ["python", "dev_guardian.py"], ROOT, {})]
    fake = _FakeProcess("worker-guardian", hang=True)

    monkeypatch.setattr(module, "start", lambda spec: fake)

    module.run_guardians(specs)  # must not raise

    assert fake.killed is True
    output = capsys.readouterr().out
    assert "worker-guardian exit=timeout" in output


def test_run_guardians_terminates_and_reraises_on_keyboard_interrupt(monkeypatch, capsys) -> None:
    module = load_dev_module()
    specs = [module.ProcessSpec("worker-guardian", ["python", "dev_guardian.py"], ROOT, {})]
    fake = _FakeProcess("worker-guardian", interrupt_on_wait=True)

    monkeypatch.setattr(module, "start", lambda spec: fake)

    try:
        module.run_guardians(specs)
    except KeyboardInterrupt:
        raised = True
    else:
        raised = False

    assert raised is True
    assert fake.terminated is True
    output = capsys.readouterr().out
    assert "worker-guardian interrupted — terminated" in output


def test_run_guardians_keyboard_interrupt_survives_terminate_oserror(monkeypatch, capsys) -> None:
    module = load_dev_module()
    specs = [module.ProcessSpec("worker-guardian", ["python", "dev_guardian.py"], ROOT, {})]
    fake = _FakeProcess(
        "worker-guardian",
        interrupt_on_wait=True,
        terminate_raises_oserror=True,
    )

    monkeypatch.setattr(module, "start", lambda spec: fake)

    try:
        module.run_guardians(specs)
    except KeyboardInterrupt:
        raised = True
    except OSError:
        raised = False
    else:
        raised = False

    assert raised is True
    assert fake.terminated is True
    output = capsys.readouterr().out
    assert "worker-guardian interrupted — terminated" in output
