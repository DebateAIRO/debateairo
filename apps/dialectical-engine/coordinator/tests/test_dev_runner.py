from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_dev_module():
    spec = importlib.util.spec_from_file_location("dialectical_dev_runner", ROOT / "scripts" / "dev.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_dev_smoke_module():
    spec = importlib.util.spec_from_file_location("dialectical_dev_smoke", ROOT / "scripts" / "dev_smoke_check.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_common_module():
    spec = importlib.util.spec_from_file_location("dialectical_script_common", ROOT / "scripts" / "_common.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_dev_scripts_share_masked_token_helper() -> None:
    common = load_common_module()
    dev = load_dev_module()
    smoke = load_dev_smoke_module()

    assert dev.DEFAULT_USER_TOKEN == common.DEFAULT_DEV_USER_TOKEN
    assert smoke.DEFAULT_USER_TOKEN == common.DEFAULT_DEV_USER_TOKEN
    assert common.dev_user_token({}) == "user_dev_token"
    assert common.dev_user_token({"DIALECTICAL_USER_TOKEN": "custom-token"}) == "custom-token"
    assert common.mask_secret("user_custom_token") == "user...oken"
    assert common.mask_secret("short") == "***"


def test_start_dev_masks_token_output_by_default() -> None:
    script = (ROOT / "scripts" / "start_dev.ps1").read_text(encoding="utf-8")

    assert 'Write-Output "Token: $env:DIALECTICAL_USER_TOKEN"' not in script
    assert "Format-DevSecret" in script
    assert "DIALECTICAL_SHOW_DEV_TOKEN" in script


def test_dev_smoke_wait_for_worker_registration_retries_not_registered(monkeypatch) -> None:
    module = load_dev_smoke_module()
    monkeypatch.setattr(module.time, "sleep", lambda _seconds: None)
    calls = {"count": 0}

    def check():
        calls["count"] += 1
        payload = (
            {"workers": []}
            if calls["count"] == 1
            else {
                "workers": [
                    {
                        "name": "mac-mini",
                        "status": "online",
                        "capabilities": ["mock-local"],
                    }
                ]
            }
        )
        return module.require_worker(payload, "mac-mini")

    worker = module.wait_for("Worker A registration", module.time.monotonic() + 1, check)

    assert calls["count"] == 2
    assert worker["name"] == "mac-mini"


def test_make_dev_topology_defaults_to_goal_ports_and_worker_a() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(root=ROOT, python="/python", environ={"DIALECTICAL_DEV_REAL_WORKER_AUTO": "0"})
    by_name = {spec.name: spec for spec in specs}

    assert list(by_name) == ["coordinator", "worker-a", "web"]
    assert by_name["coordinator"].args == [
        "/python",
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--port",
        "8000",
    ]
    assert by_name["coordinator"].cwd == ROOT / "coordinator"
    assert by_name["coordinator"].env["DIALECTICAL_DATABASE_URL"] == f"sqlite:///{ROOT / '.dialectical-dev' / 'db.sqlite3'}"

    assert by_name["worker-a"].args == ["/python", "-m", "app.main"]
    assert by_name["worker-a"].cwd == ROOT / "worker"
    assert by_name["worker-a"].env["DIALECTICAL_COORDINATOR_URL"] == "http://localhost:8000"
    assert by_name["worker-a"].env["DIALECTICAL_WORKER_NAME"] == "mac-mini"
    assert by_name["worker-a"].env["DIALECTICAL_ENABLE_MOCK"] == "1"
    assert by_name["worker-a"].env["DIALECTICAL_ENABLE_REAL_ADAPTERS"] == "0"

    assert by_name["web"].args == [
        "/python",
        str(ROOT / "scripts" / "web_proxy.py"),
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
    ]
    assert by_name["web"].cwd == ROOT


def test_make_dev_auto_starts_saved_real_worker_config(tmp_path) -> None:
    module = load_dev_module()
    config_path = tmp_path / ".dialectical-worker" / "config.toml"
    config_path.parent.mkdir()
    config_path.write_text('name = "VLADWORKS"\n', encoding="utf-8")

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={
            "HOME": str(tmp_path),
            "USERPROFILE": str(tmp_path),
        },
    )
    by_name = {spec.name: spec for spec in specs}

    assert list(by_name) == ["coordinator", "worker-a", "worker-real", "web"]
    assert by_name["worker-real"].env["DIALECTICAL_WORKER_CONFIG"] == str(config_path)


def test_make_dev_real_worker_auto_can_be_disabled(tmp_path) -> None:
    module = load_dev_module()
    config_path = tmp_path / ".dialectical-worker" / "config.toml"
    config_path.parent.mkdir()
    config_path.write_text('name = "VLADWORKS"\n', encoding="utf-8")

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={
            "DIALECTICAL_DEV_REAL_WORKER_AUTO": "0",
            "HOME": str(tmp_path),
            "USERPROFILE": str(tmp_path),
        },
    )

    assert [spec.name for spec in specs] == ["coordinator", "worker-a", "web"]


def test_make_dev_can_start_autoreloading_real_worker_from_saved_config() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={"DIALECTICAL_DEV_REAL_WORKER_CONFIG": "~/.dialectical-worker/config.toml"},
    )
    by_name = {spec.name: spec for spec in specs}

    assert list(by_name) == ["coordinator", "worker-a", "worker-real", "web"]
    assert by_name["worker-real"].cwd == ROOT / "worker"
    assert "dialectical-worker" in by_name["worker-real"].env["DIALECTICAL_WORKER_CONFIG"]
    assert by_name["worker-real"].env["DIALECTICAL_WORKER_CONFIG"].endswith("config.toml")
    assert by_name["worker-real"].env["DIALECTICAL_COORDINATOR_URL"] == "http://localhost:8000"
    assert by_name["worker-real"].args == [
        "/python",
        "-m",
        "watchfiles",
        "--filter",
        "python",
        "/python -m app.main",
        str(ROOT / "worker" / "app"),
    ]


def test_make_dev_real_worker_reload_can_be_disabled() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={
            "DIALECTICAL_DEV_REAL_WORKER_CONFIG": "~/.dialectical-worker/config.toml",
            "DIALECTICAL_DEV_WORKER_RELOAD": "0",
        },
    )
    by_name = {spec.name: spec for spec in specs}

    assert by_name["worker-real"].args == ["/python", "-m", "app.main"]


def test_make_dev_allows_isolated_ports_for_smoke_checks() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={
            "DIALECTICAL_DEV_COORDINATOR_PORT": "8765",
            "DIALECTICAL_DEV_WEB_PORT": "3765",
            "DIALECTICAL_DEV_NEXT_PORT": "3766",
            "DIALECTICAL_DEV_HOME": "/tmp/dialectical-isolated-dev",
            "DIALECTICAL_USER_TOKEN": "user_custom",
            "DIALECTICAL_WORKER_NAME": "custom-worker",
            "DIALECTICAL_ENABLE_MOCK": "0",
            "DIALECTICAL_ENABLE_REAL_ADAPTERS": "1",
        },
    )
    by_name = {spec.name: spec for spec in specs}

    assert by_name["coordinator"].args[-1] == "8765"
    assert by_name["coordinator"].env["DIALECTICAL_DATABASE_URL"].replace("\\", "/") == "sqlite:////tmp/dialectical-isolated-dev/db.sqlite3"
    assert by_name["worker-a"].env["DIALECTICAL_WORKER_CONFIG"].replace("\\", "/") == "/tmp/dialectical-isolated-dev/worker.toml"
    assert by_name["worker-a"].env["DIALECTICAL_COORDINATOR_URL"] == "http://localhost:8765"
    assert by_name["worker-a"].env["DIALECTICAL_USER_TOKEN"] == "user_custom"
    assert by_name["worker-a"].env["DIALECTICAL_WORKER_NAME"] == "custom-worker"
    assert by_name["worker-a"].env["DIALECTICAL_ENABLE_MOCK"] == "0"
    assert by_name["worker-a"].env["DIALECTICAL_ENABLE_REAL_ADAPTERS"] == "1"
    assert by_name["web"].args[by_name["web"].args.index("--public-port") + 1] == "3765"
    assert by_name["web"].args[by_name["web"].args.index("--next-port") + 1] == "3766"
    assert by_name["web"].args[by_name["web"].args.index("--coordinator-port") + 1] == "8765"


def test_make_dev_reload_can_be_disabled_for_smoke_checks() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={"DIALECTICAL_DEV_RELOAD": "0"},
    )
    coordinator = {spec.name: spec for spec in specs}["coordinator"]

    assert "--reload" not in coordinator.args
    assert coordinator.args == [
        "/python",
        "-m",
        "uvicorn",
        "app.main:app",
        "--port",
        "8000",
    ]


def test_make_dev_next_mode_can_use_built_start_for_smoke_checks() -> None:
    module = load_dev_module()

    specs = module.build_process_specs(
        root=ROOT,
        python="/python",
        environ={"DIALECTICAL_DEV_NEXT_MODE": "start"},
    )
    web = {spec.name: spec for spec in specs}["web"]

    assert web.args[web.args.index("--next-mode") + 1] == "start"


def test_make_dev_rejects_invalid_port_env() -> None:
    module = load_dev_module()

    try:
        module.build_process_specs(root=ROOT, python="/python", environ={"DIALECTICAL_DEV_WEB_PORT": "not-a-port"})
    except ValueError as exc:
        assert "DIALECTICAL_DEV_WEB_PORT must be an integer" in str(exc)
    else:
        raise AssertionError("invalid dev port was accepted")


def test_make_dev_rejects_invalid_next_mode_env() -> None:
    module = load_dev_module()

    try:
        module.build_process_specs(root=ROOT, python="/python", environ={"DIALECTICAL_DEV_NEXT_MODE": "serve"})
    except ValueError as exc:
        assert "DIALECTICAL_DEV_NEXT_MODE must be 'dev' or 'start'" in str(exc)
    else:
        raise AssertionError("invalid dev next mode was accepted")
