from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[2]


def load_local_single_machine_check_module() -> ModuleType:
    path = ROOT / "scripts" / "local_single_machine_check.py"
    spec = importlib.util.spec_from_file_location("local_single_machine_check", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_local_single_machine_acceptance_module() -> ModuleType:
    path = ROOT / "scripts" / "local_single_machine_acceptance.py"
    spec = importlib.util.spec_from_file_location("local_single_machine_acceptance", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_http_json_uses_browser_like_health_check_user_agent(monkeypatch) -> None:
    module = load_local_single_machine_check_module()

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def read(self) -> bytes:
            return json.dumps({"ok": True}).encode("utf-8")

    def fake_urlopen(request, timeout: float):
        assert isinstance(request, module.urllib.request.Request)
        assert request.get_header("User-agent") == "Mozilla/5.0 (compatible; DialecticalHealthCheck/1.0; +https://dezbatere.ro)"
        assert timeout == 5.0
        return FakeResponse()

    monkeypatch.setattr(module.urllib.request, "urlopen", fake_urlopen)

    result = module.http_json("https://dezbatere.ro/api/backends/status")

    assert result["ok"] is True


def test_launch_agent_is_explicitly_not_applicable_on_windows_without_launchctl(monkeypatch) -> None:
    module = load_local_single_machine_check_module()
    monkeypatch.setattr(module.sys, "platform", "win32")
    monkeypatch.setattr(
        module.os,
        "getuid",
        lambda: (_ for _ in ()).throw(AssertionError("os.getuid must not run on Windows")),
        raising=False,
    )
    monkeypatch.setattr(
        module,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("launchctl must not run on Windows")),
    )

    result = module.launch_agent("com.dialectical.worker")

    assert result == {
        "applicable": False,
        "platform": "win32",
        "status": "not_applicable",
        "reason": "launchd checks require macOS",
    }


def test_cli_status_does_not_make_active_model_calls_on_windows(monkeypatch) -> None:
    module = load_local_single_machine_check_module()
    monkeypatch.setattr(module.sys, "platform", "win32")
    monkeypatch.setattr(module, "command_path", lambda name: None)
    monkeypatch.setattr(
        module,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("provider command must not run on Windows")),
    )

    result = module.cli_status(probe_models=True)

    for name in ("claude", "codex", "gemini"):
        assert result[name]["probe"] == {
            "applicable": False,
            "platform": "win32",
            "status": "not_applicable",
            "reason": "active model auth probes are only supported by the single-Mac setup",
        }


def test_command_path_uses_cross_platform_executable_discovery(monkeypatch) -> None:
    module = load_local_single_machine_check_module()
    fake_shutil = type("FakeShutil", (), {"which": staticmethod(lambda name: f"C:/tools/{name}.exe")})
    monkeypatch.setattr(module, "shutil", fake_shutil, raising=False)
    monkeypatch.setattr(
        module,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("POSIX which must not run")),
    )

    assert module.command_path("codex") == "C:/tools/codex.exe"


def test_windows_readiness_main_skips_product_database_and_lm_studio_generation(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = load_local_single_machine_check_module()
    report_path = tmp_path / "readiness.json"
    monkeypatch.setattr(module.sys, "platform", "win32")
    monkeypatch.setattr(
        module.sys,
        "argv",
        ["local_single_machine_check.py", "--report-path", str(report_path)],
    )
    monkeypatch.setattr(module, "quick_tunnel_status", lambda paths: {})
    monkeypatch.setattr(module, "cloudflared_status", lambda path: {})
    monkeypatch.setattr(module, "dns_status", lambda domain: {})
    monkeypatch.setattr(module, "select_public_url", lambda *args: {"url": None, "source": "none"})
    monkeypatch.setattr(module, "launch_agent", lambda label: module.platform_not_applicable("launchd checks require macOS"))
    monkeypatch.setattr(module, "checkout_hydration", lambda: {"ok": True, "offloaded": [], "missing": []})
    monkeypatch.setattr(module, "cli_status", lambda probe_models: {})
    monkeypatch.setattr(module, "gemini_auth_status", lambda *args: {})
    monkeypatch.setattr(module, "local_endpoints", lambda *args: {})
    monkeypatch.setattr(module, "summarize", lambda report: 0)

    def fake_lm_studio_status(base_url: str, model: str, probe: bool) -> dict[str, object]:
        assert probe is False
        return {"models_endpoint": {"ok": False}, "expected_model_loaded": False}

    monkeypatch.setattr(module, "lm_studio_status", fake_lm_studio_status)
    monkeypatch.setattr(
        module,
        "runtime_routing_status",
        lambda *args: (_ for _ in ()).throw(AssertionError("product database must not be read on Windows")),
    )

    exit_code = module.main()

    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 0
    assert report["checks"]["runtime_routing"] == {
        "applicable": False,
        "platform": "win32",
        "status": "not_applicable",
        "reason": "single-Mac runtime routing database check requires macOS",
    }


def test_local_single_machine_acceptance_is_not_applicable_on_windows_without_product_probe(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = load_local_single_machine_acceptance_module()
    report_path = tmp_path / "acceptance.json"
    monkeypatch.setattr(module.sys, "platform", "win32")
    monkeypatch.setattr(module.sys, "argv", ["local_single_machine_acceptance.py", "--report-path", str(report_path)])
    monkeypatch.setattr(
        module,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("product probe must not run on Windows")),
    )

    exit_code = module.main()

    assert exit_code == 0
    assert json.loads(report_path.read_text(encoding="utf-8")) == {
        "ok": None,
        "platform": "win32",
        "reason": "strict local single-machine acceptance is only supported by the single-Mac setup",
        "status": "not_applicable",
    }
