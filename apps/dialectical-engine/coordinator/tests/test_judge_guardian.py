from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "judge_guardian.py"


def load_module():
    spec = importlib.util.spec_from_file_location("judge_guardian", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def module():
    return load_module()


def write_yaml(path: Path, data: dict) -> None:
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


# --- agents_config + repair: missing file ---------------------------------


def test_missing_agents_file_repairs_by_creating_minimal_judge_entry(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    assert not agents_path.exists()

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    assert agents_path.exists()
    data = yaml.safe_load(agents_path.read_text(encoding="utf-8"))
    assert data["agents"]["judge"] == {"provider": "codex", "model": "gpt-5.6sol-medium"}
    assert report["agents_config"]["repaired"] is True
    assert report["provider_detection"]["available"] is True


def test_missing_agents_file_without_repair_reports_missing_and_exits_1(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=False)

    assert not agents_path.exists()
    assert report["agents_config"]["state"] == "missing_role"
    assert report["agents_config"]["repaired"] is False
    assert module.exit_code_for(report) == 1


# --- repair merges into existing YAML without losing other roles ----------


def test_repair_merges_judge_into_existing_yaml_preserving_other_roles(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {
            "defaults": {"provider": "codex", "model": "${OPENAI_MODEL}", "temperature": 0.2},
            "agents": {
                "proponent": {},
                "opponent": {},
                "specialist": {},
            },
        },
    )

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    data = yaml.safe_load(agents_path.read_text(encoding="utf-8"))
    assert data["agents"]["proponent"] == {}
    assert data["agents"]["opponent"] == {}
    assert data["agents"]["specialist"] == {}
    assert data["defaults"] == {"provider": "codex", "model": "${OPENAI_MODEL}", "temperature": 0.2}
    assert data["agents"]["judge"] == {"provider": "codex", "model": "gpt-5.6sol-medium"}
    assert report["agents_config"]["repaired"] is True


# --- unparseable YAML: corrupt_config, file untouched, exit 2 --------------


def test_unparseable_yaml_reports_corrupt_config_and_does_not_modify_file(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    original_text = "agents: [this is not: valid: yaml: at all: {{{\n"
    agents_path.write_text(original_text, encoding="utf-8")

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    assert agents_path.read_text(encoding="utf-8") == original_text
    assert report["agents_config"]["state"] == "corrupt_config"
    assert report["agents_config"]["repaired"] is False
    assert module.exit_code_for(report) == 2


# --- existing non-empty judge entry: repair is a no-op ---------------------


def test_existing_non_empty_judge_entry_is_never_overwritten(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {
            "defaults": {"provider": "codex", "model": "${OPENAI_MODEL}", "temperature": 0.2},
            "agents": {"judge": {"model": "gpt-5.6-sol", "temperature": 0.0}},
        },
    )
    before = agents_path.read_text(encoding="utf-8")

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    after = agents_path.read_text(encoding="utf-8")
    assert after == before
    assert report["agents_config"]["repaired"] is False
    assert report["agents_config"]["state"] == "ready"
    assert report["provider_detection"]["available"] is True
    assert report["provider_detection"]["model"] == "gpt-5.6-sol"


# --- empty model on an existing judge entry: repaired ----------------------


def test_empty_model_on_existing_judge_entry_is_repaired(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {
            "defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"},
            "agents": {"judge": {"model": "", "temperature": 0.0}},
        },
    )

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    data = yaml.safe_load(agents_path.read_text(encoding="utf-8"))
    assert data["agents"]["judge"]["model"] == "gpt-5.6sol-medium"
    assert data["agents"]["judge"]["provider"] == "codex"
    assert data["agents"]["judge"]["temperature"] == 0.0
    assert report["agents_config"]["repaired"] is True
    assert report["provider_detection"]["available"] is True


# --- --no-repair: reports missing, exit 1, file untouched ------------------


def test_no_repair_flag_reports_missing_role_and_leaves_file_untouched(module, tmp_path) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"proponent": {}}},
    )
    before = agents_path.read_text(encoding="utf-8")

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=False)

    assert agents_path.read_text(encoding="utf-8") == before
    assert report["agents_config"]["state"] == "missing_role"
    assert report["agents_config"]["repaired"] is False
    assert module.exit_code_for(report) == 1


# --- exit code mapping table ------------------------------------------------


def test_exit_code_mapping_table(module) -> None:
    assert module.exit_code_for({"agents_config": {"state": "corrupt_config"}}) == 2
    assert module.exit_code_for(
        {
            "agents_config": {"state": "ready", "repaired": False},
            "provider_detection": {"available": True},
            "executable": {"state": "ready"},
            "contract": {"state": "ready"},
        }
    ) == 0
    assert module.exit_code_for(
        {
            "agents_config": {"state": "ready", "repaired": False},
            "provider_detection": {"available": False},
        }
    ) == 1
    assert module.exit_code_for({}) == 2


# --- executable-missing path: honest reason, never crashes -----------------


def test_executable_missing_reports_honest_blocked_reason(module, tmp_path, monkeypatch) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.6-sol"}}},
    )
    monkeypatch.setattr(module.shutil, "which", lambda _cmd: None)

    report = module.run_guardian(agents_path=agents_path, codex_command="totally-missing-codex-binary", repair=True)

    assert report["executable"]["state"] == "not_found"
    assert report["executable"]["which"] is None
    assert "totally-missing-codex-binary" in report["executable"]["reason"]
    # provider_detection can still be available (config-only check); readiness overall is gated by executable too.
    assert module.exit_code_for(report) == 1


def test_executable_probe_execs_resolved_path_not_raw_command(module, monkeypatch) -> None:
    """On Windows, `codex` is an npm .CMD shim: CreateProcess can't exec the
    bare command name directly. Production (CodexCliProvider.generate) always
    execs the shutil.which-resolved full path, so the guardian's probe must
    mirror that exactly or it reports false 'blocked' failures.
    """
    fake_resolved_path = "C:\\fake\\nodejs\\codex.CMD"
    monkeypatch.setattr(module.shutil, "which", lambda _cmd: fake_resolved_path)

    captured_args: dict[str, Any] = {}

    def fake_run(args, **kwargs):
        captured_args["args"] = args
        return module.subprocess.CompletedProcess(args=args, returncode=0, stdout="codex-cli 1.2.3", stderr="")

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    result = module.check_executable("codex")

    assert captured_args["args"][0] == fake_resolved_path
    assert captured_args["args"][0] != "codex"
    assert result["state"] == "ready"
    assert result["which"] == fake_resolved_path


def test_summary_line_and_human_output_never_crash(module, tmp_path, capsys) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.6-sol"}}},
    )

    exit_code = module.main(["--agents-path", str(agents_path), "--codex-command", "totally-missing-codex-binary"])

    captured = capsys.readouterr()
    assert "agents_config:" in captured.out
    assert "provider_detection:" in captured.out
    assert "executable:" in captured.out
    assert "contract:" in captured.out
    assert exit_code in (0, 1, 2)


def test_json_mode_dumps_full_report(module, tmp_path, capsys) -> None:
    import json

    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.6-sol"}}},
    )

    module.main(["--agents-path", str(agents_path), "--json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert "agents_config" in payload
    assert "provider_detection" in payload
    assert "executable" in payload
    assert "contract" in payload


# --- import-failure guard: never a traceback, honest unknown state --------


def test_import_failure_reports_unknown_everywhere_exit_2_no_repair(module, tmp_path, monkeypatch) -> None:
    """Simulates a broken coordinator app package (missing dep, broken
    import, etc). The guardian must never crash and must never repair
    config against an environment it cannot trust.
    """
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"proponent": {}}},
    )
    before = agents_path.read_text(encoding="utf-8")

    monkeypatch.setattr(module, "IMPORT_ERROR", "ModuleNotFoundError: No module named 'app.providers.registry'")

    exit_code = module.main(["--agents-path", str(agents_path), "--json"])

    assert exit_code == 2
    # No repair write happened against a broken environment.
    assert agents_path.read_text(encoding="utf-8") == before

    report = module.run_guardian_import_failed(agents_path=agents_path, codex_command="codex")
    assert report["agents_config"]["state"] == "unknown"
    assert report["agents_config"]["repaired"] is False
    assert report["agents_config"]["repair_skipped"] == "broken_environment"
    assert "coordinator import failed" in report["agents_config"]["reason"]
    assert report["provider_detection"]["available"] is None
    assert "coordinator import failed" in report["provider_detection"]["reason"]
    assert report["contract"]["state"] == "unknown"
    assert "coordinator import failed" in report["contract"]["reason"]
    assert module.exit_code_for(report) == 2


def test_import_failure_summary_and_human_output_never_crash(module, tmp_path, monkeypatch, capsys) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.6-sol"}}},
    )

    monkeypatch.setattr(module, "IMPORT_ERROR", "ImportError: broken dependency")

    exit_code = module.main(["--agents-path", str(agents_path)])

    captured = capsys.readouterr()
    assert exit_code == 2
    assert "agents_config: unknown" in captured.out
    assert "UNKNOWN/CORRUPT" in captured.out


def test_import_error_none_leaves_existing_behavior_untouched(module, tmp_path) -> None:
    """Sanity check: when IMPORT_ERROR is None (the normal case), behavior
    is unchanged from before this fix — repair still runs and reports ready.
    """
    agents_path = tmp_path / "agents.yaml"
    assert module.IMPORT_ERROR is None

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    assert agents_path.exists()
    assert report["agents_config"]["state"] == "ready"
    assert report["agents_config"]["repaired"] is True
    assert report["provider_detection"]["available"] is True
    assert module.exit_code_for(report) in (0, 1)
