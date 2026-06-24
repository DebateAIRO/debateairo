from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_smoke_module():
    spec = importlib.util.spec_from_file_location(
        "real_codex_scoring_smoke",
        ROOT / "scripts" / "real_codex_scoring_smoke.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_real_codex_scoring_smoke_defaults_to_dry_run_without_provider_call() -> None:
    module = load_smoke_module()
    called = False

    def fail_if_called(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("dry-run smoke must not call a real provider")

    report = module.run_smoke_check(
        debate=None,
        node=None,
        argument_text=None,
        run_real_codex=False,
        provider_factory=fail_if_called,
    )

    assert called is False
    assert report["status"] == "dry_run"
    assert report["provider_called"] is False
    assert "run_real_codex" in report["next_step"]


def test_real_codex_scoring_smoke_sanitizes_secret_like_output() -> None:
    module = load_smoke_module()

    sanitized = module.sanitize_for_output(
        {
            "safe": "codex-gpt-5.5",
            "api_key": "sk-secret",
            "nested": {
                "stderr": "Authorization: Bearer secret-token",
                "note": "normal scoring note",
            },
            "items": ["token=abc123", "ordinary text"],
        }
    )

    assert sanitized == {
        "safe": "codex-gpt-5.5",
        "api_key": "[redacted]",
        "nested": {
            "stderr": "[redacted]",
            "note": "normal scoring note",
        },
        "items": ["[redacted]", "ordinary text"],
    }


def test_real_codex_scoring_smoke_reports_unavailable_when_local_db_cannot_open(monkeypatch, capsys) -> None:
    module = load_smoke_module()

    class BrokenSession:
        def __enter__(self):
            raise RuntimeError("unable to open database token=abc123")

        def __exit__(self, *args):
            return None

    monkeypatch.setattr(module, "SessionLocal", lambda: BrokenSession())

    exit_code = module.main([])

    body = capsys.readouterr().out
    assert exit_code == 1
    assert "traceback" not in body.lower()
    assert "token=abc123" not in body
    assert '"status": "unavailable"' in body
    assert '"reason": "Local debate database could not be opened or queried."' in body
