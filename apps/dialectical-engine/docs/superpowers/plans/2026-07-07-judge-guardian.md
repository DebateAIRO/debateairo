# Judge Guardian: Startup Readiness Check for Scoring Judges

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A standalone, read-mostly startup guardian that answers "is the scoring judge actually configured and reachable right now?" honestly — no fake green, ever — and, when safe, self-repairs the one class of drift that reliably bites us after config/code changes: a missing or empty `judge` entry in `config/agents.yaml`.

**Architecture:** `scripts/judge_guardian.py` is a standalone script, sibling to `scripts/dev_guardian.py` (which is NOT touched in this task — see Global Constraints). It runs ONE pass (five checks in order: `agents_config` → optional `repair` → `provider_detection` → `executable` → `contract`), prints one line per check plus a summary, and exits 0/1/2 based on real re-detected state. It imports the real coordinator app modules in-process (`app.providers.registry.detect_scoring_provider_config`, `app.scoring.judge_registry.active_contract`) by adding `coordinator/` to `sys.path`, mirroring the pattern in `scripts/real_codex_scoring_smoke.py` (NOT `scripts/v2_worker_judge_smoke.py` — see contradictions below). It never calls an LLM/provider and never touches the YAML file except in the one narrow repair case, using load-modify-dump so no existing content is ever lost.

**Tech Stack:** Python 3.12, PyYAML (already transitively available via `uvicorn[standard]`, imported directly by `coordinator/app/providers/registry.py`), stdlib only otherwise (`argparse`, `json`, `shutil`, `subprocess`, `sys`, `pathlib`). Test suite: `cd coordinator && python -m pytest tests/test_judge_guardian.py -v`.

## Global Constraints

- Never fake green: every check reports a real, honestly-derived state; the script only exits 0 when `provider_detection` re-ran and reported `available: true` after any repair.
- Repair is narrowly scoped: it may only create the `judge` role entry (when absent) or fill in `provider`/`model` on an existing-but-empty judge entry. It must NEVER overwrite a judge entry that already has a non-empty `model`. It must NEVER touch a file that fails to parse as YAML — report `corrupt_config` and stop, exit 2.
- Repair is load-modify-dump: read the full YAML structure, mutate only the `agents.judge` subtree, and re-dump the entire structure back — every other role (`proponent`, `opponent`, `specialist`, `methodologist`, `skeptic`, `estimator`, and any future role) and the `defaults` block must survive byte-for-byte-equivalent-in-structure (same keys/values; YAML formatting/ordering may differ since it's re-serialized by `yaml.safe_dump`).
- No provider calls, no LLM calls, ever, in this script. The `executable` check only does `shutil.which(...)` and a local `codex --version`-style subprocess probe with a 10-second timeout — never a `codex exec` or anything that could dispatch real work.
- Dependencies: stdlib + `yaml` only. `yaml` (PyYAML) is not pinned as an explicit dependency in `requirements-dev.txt` or `coordinator/pyproject.toml` — it currently reaches the venv only transitively via `uvicorn[standard]`, and `coordinator/app/providers/registry.py:8` already does a bare `import yaml` on that same assumption. This guardian relies on the identical (already-relied-upon) transitive availability; it does not newly introduce the dependency risk.
- Absolute, explicit git staging only: `git add scripts/judge_guardian.py Makefile coordinator/tests/test_judge_guardian.py` — never `git add -A` / `git add .`.
- Commit trailer: every commit in this task ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Anti-stall test rule (verbatim):** Run tests as ONE foreground Bash call with the timeout parameter set; never run_in_background, never Monitor; if it times out once report BLOCKED.
- Coordinator suite baseline = 12 known env-harness failures (pre-existing, unrelated to this task — do not try to fix them, just don't add new ones).
- **`scripts/dev_guardian.py` currently carries large uncommitted foreign changes** (confirmed via `git status`: modified but not committed, diverges substantially from the committed `f324eb3 feat(dev): dev-guardian honest readiness loop (Track A)` version) that likely make `coordinator/tests/test_dev_guardian.py` fail or behave unexpectedly right now. **Do not touch `scripts/dev_guardian.py` or `coordinator/tests/test_dev_guardian.py` in this task.** If `make test` or a full-suite run surfaces failures inside `test_dev_guardian.py`, record them separately in your final report as pre-existing foreign WIP on that lane — NOT a regression introduced here, and NOT something to fix here.

**Verified ground truth (dev @ `lane/roadmap-p0-p3`, re-verified while writing this plan):**

- `coordinator/app/providers/registry.py:100-135` `detect_scoring_provider_config(agents=None, *, role="judge", providers=None)`: loads configs via `load_agent_configs()` if `agents` is `None`; defaults `registered_providers` to **`{"codex": CodexCliProvider()}`** (registry.py:107) — a plain, no-args `CodexCliProvider()`, i.e. `executable="codex"` (its own default), **not** `CodexCliProvider(executable=settings.codex_command)`. That `settings.codex_command`-aware construction only happens in `ProviderRegistry.__init__` (registry.py:150), a different code path entirely. **This contradicts the design brief's claim** that the default registry is built with `executable=settings.codex_command` — flagged loudly below.
- Three not-found causes, in the order `detect_scoring_provider_config` actually checks them: (1) `configs.get(role) is None` → `"No {role} agent is configured for scoring."`; (2) `not config.model.strip()` → `"Configured {role} model is empty."` (checked BEFORE provider-registered check, note the order); (3) `config.provider not in registered_providers` → `"Configured {role} provider is not registered: {config.provider}."`.
- `load_agent_configs(path=None)` at registry.py:43-61: `config_path = path or default_agents_path()`; `raw = yaml.safe_load(config_path.read_text()) or {}`; merges `raw["defaults"]` with each `raw["agents"][role]` (role config wins); resolves `${OPENAI_MODEL}` placeholders via `resolve_config_value`; **defaults when a key is absent from both defaults and role config: `provider="codex"`, `model="codex-gpt-5.5"`, `temperature=0.0`, `max_tokens=None`** (registry.py:52-59).
- `default_agents_path()` at registry.py:32-33: **`Path(__file__).resolve().parents[3] / "config" / "agents.yaml"`**, which resolves to `<repo-root>/config/agents.yaml` (verified: file exists at `DebateV2/apps/dialectical-engine/config/agents.yaml`). There is **no env-var override** for this path in `registry.py` and no `DIALECTICAL_HOME`-relative resolution — the design brief's speculation about a `DIALECTICAL_HOME`-based override was speculative and does **not** exist; flagged below.
- The **real current `config/agents.yaml`** already has a non-empty judge entry: `judge: {model: gpt-5.5, temperature: 0.0}` (no explicit `provider` key — inherits `defaults.provider: codex`). **Model is `gpt-5.5`, not `codex-gpt-5.5`.** The guardian's repair path must never touch this because it's already non-empty — this is a "no-op repair" real-world case, not a hypothetical.
- `coordinator/app/core/config.py:80` `Settings.codex_command: str = "codex"`; line 232 `settings.codex_command = clean_string(os.getenv("CODEX_COMMAND"), settings.codex_command)` — env override confirmed as `CODEX_COMMAND`.
- `coordinator/app/providers/codex_cli.py:22` `CodexCliProvider.__init__(self, executable: str = "codex", timeout_seconds: int = 120)`.
- `coordinator/app/scoring/judge_registry.py:67-68` `active_contract(role: str) -> JudgeContract` — a plain dict lookup (`_ACTIVE_CONTRACTS[role]`), **raises `KeyError` if the role isn't registered** (currently only `"judge"` is registered, at line 63). The guardian must catch this and report an honest `contract` state rather than crash — the design brief didn't mention this failure mode; flagged below since it changes the contract-check implementation.
- `JudgeContract` (judge_registry.py:23-49) has `judge_id`, `judge_version`, and a `cached_property contract_hash` (sha256 hex digest of a JSON payload including the full `ClaimAssessment` schema) — `active_contract("judge").contract_hash[:12]` is the compact, non-secret identifier to print.
- **Smoke-script import pattern — corrected:** the design brief said to mirror `scripts/v2_worker_judge_smoke.py`'s sys.path setup, but that script does **not** import any `app.*` module at all (it talks to a running coordinator over `urllib.request` only — no sys.path manipulation exists in it). The actual pattern that imports coordinator `app` modules in-process is in **`scripts/real_codex_scoring_smoke.py:15-28`**:
  ```python
  ROOT = Path(__file__).resolve().parents[1]
  COORDINATOR_ROOT = ROOT / "coordinator"
  if str(COORDINATOR_ROOT) not in sys.path:
      sys.path.insert(0, str(COORDINATOR_ROOT))
  from app.core.config import load_settings  # noqa: E402
  ```
  This plan's script mirrors `real_codex_scoring_smoke.py`, not `v2_worker_judge_smoke.py`. Flagged below.
- Existing test pattern to mirror: `coordinator/tests/test_dev_guardian.py:1-12` loads the target script via `importlib.util.spec_from_file_location("dev_guardian", SCRIPT)` / `module_from_spec` / `spec.loader.exec_module(module)`, where `SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dev_guardian.py"` (i.e. `coordinator/tests/../../scripts/...` = repo-root `scripts/...`). This plan's test file uses the identical pattern, pointed at `judge_guardian.py`.
- `Makefile:15` `.PHONY:` line already lists `dev-guardian` and many other targets but does **not** yet list `judge-guardian` — the new target must be added to `.PHONY` too, not just defined. `Makefile:108-109` shows the existing `dev-guardian:` target's exact style (`$(PYTHON_ENV) "$(PYTHON)" scripts/dev_guardian.py --base-url "$(COORDINATOR_URL)" ...`) to mirror.
- `requirements-dev.txt` and `coordinator/pyproject.toml` do not list `pyyaml`/`PyYAML` explicitly; it is present in the venv only transitively (via `uvicorn[standard]`). `registry.py` already assumes this; this plan's script makes the same assumption and does not change dependency risk.

**Contradictions with the design brief (flagged loudly):**

1. **Default provider registry construction differs from the brief.** The brief states the default registry in `detect_scoring_provider_config` is `{"codex": CodexCliProvider(executable=settings.codex_command)}`. The actual code (registry.py:107) uses `CodexCliProvider()` with no `executable` argument at all — `settings.codex_command` is NOT consulted by `detect_scoring_provider_config`'s default path. This means the guardian's `provider_detection` check (which calls `detect_scoring_provider_config` directly, passing no `providers=` override) will never see a custom `CODEX_COMMAND` reflected in that check's `available`/`reason` — only the separate `executable` check (which the guardian itself runs via `shutil.which(codex_command)`) is `codex_command`-aware. The plan below keeps `provider_detection` calling the real function with defaults (as instructed) and keeps `codex_command` plumbing only in the guardian's own `executable` check — this is consistent with actual code, but the reasoning chain in the brief ("verify `settings.codex_command` flows into provider_detection") does not hold. No production code changes here — pure documentation of the discrepancy.
2. **`default_agents_path()` is a fixed relative-to-`__file__` path, not `DIALECTICAL_HOME`-based**, and has no path-level env override. The brief asked to "find and cite the real default + any env override" and speculated a `DIALECTICAL_HOME` mechanism; no such override exists in `registry.py`. Confirmed by full read of the file.
3. **The smoke-script import pattern to mirror is `scripts/real_codex_scoring_smoke.py`, not `scripts/v2_worker_judge_smoke.py`.** The latter has zero `sys.path`/`app.*` imports; it is a pure black-box HTTP smoke test. This plan follows `real_codex_scoring_smoke.py`'s pattern instead.
4. **`active_contract(role)` raises `KeyError` on an unregistered role** rather than returning some sentinel — the guardian must catch this explicitly (not mentioned in the brief) to stay crash-proof.
5. **The real `config/agents.yaml` judge entry today is non-empty (`model: gpt-5.5`)**, so on a clean run against the real repo file, the guardian's repair path is a no-op and `provider_detection` should already report `available: true` today (assuming `codex` executable is present) — worth knowing when manually smoke-testing this script against the real file, since the "repair" behavior will mostly be exercised by the unit tests against tmp_path fixtures, not by running the script against the live repo config.

---

### Task 1: `judge_guardian.py` + Makefile target + unit tests

**Files:**
- Create: `scripts/judge_guardian.py`
- Modify: `Makefile` (new `judge-guardian` target + `.PHONY` entry, placed after the existing `dev-guardian:` target block)
- Create: `coordinator/tests/test_judge_guardian.py`

**Interfaces:**
- Produces: `python scripts/judge_guardian.py [--agents-path PATH] [--codex-command CMD] [--no-repair] [--json]` — runs one pass, prints human-readable lines (or a JSON report with `--json`), exits `0` (all ready), `1` (not ready — some check failed/unavailable), or `2` (unknown/corrupt state, e.g. unparseable YAML). `make judge-guardian` runs it with `$(JUDGE_GUARDIAN_FLAGS)` passthrough.
- Consumes: `app.providers.registry.detect_scoring_provider_config` and `app.scoring.judge_registry.active_contract`, imported in-process via a `coordinator/` sys.path insert (mirrors `real_codex_scoring_smoke.py`). No coordinator server needs to be running — these are pure in-process Python calls, not HTTP.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_judge_guardian.py
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

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
    assert data["agents"]["judge"] == {"provider": "codex", "model": "codex-gpt-5.5"}
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
    assert data["agents"]["judge"] == {"provider": "codex", "model": "codex-gpt-5.5"}
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
            "agents": {"judge": {"model": "gpt-5.5", "temperature": 0.0}},
        },
    )
    before = agents_path.read_text(encoding="utf-8")

    report = module.run_guardian(agents_path=agents_path, codex_command="codex", repair=True)

    after = agents_path.read_text(encoding="utf-8")
    assert after == before
    assert report["agents_config"]["repaired"] is False
    assert report["agents_config"]["state"] == "ready"
    assert report["provider_detection"]["available"] is True
    assert report["provider_detection"]["model"] == "gpt-5.5"


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
    assert data["agents"]["judge"]["model"] == "codex-gpt-5.5"
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
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.5"}}},
    )
    monkeypatch.setattr(module.shutil, "which", lambda _cmd: None)

    report = module.run_guardian(agents_path=agents_path, codex_command="totally-missing-codex-binary", repair=True)

    assert report["executable"]["state"] == "not_found"
    assert report["executable"]["which"] is None
    assert "totally-missing-codex-binary" in report["executable"]["reason"]
    # provider_detection can still be available (config-only check); readiness overall is gated by executable too.
    assert module.exit_code_for(report) == 1


def test_summary_line_and_human_output_never_crash(module, tmp_path, capsys) -> None:
    agents_path = tmp_path / "agents.yaml"
    write_yaml(
        agents_path,
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.5"}}},
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
        {"defaults": {"provider": "codex", "model": "${OPENAI_MODEL}"}, "agents": {"judge": {"model": "gpt-5.5"}}},
    )

    module.main(["--agents-path", str(agents_path), "--json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert "agents_config" in payload
    assert "provider_detection" in payload
    assert "executable" in payload
    assert "contract" in payload
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_judge_guardian.py -v`
Expected: FAIL (`scripts/judge_guardian.py` does not exist yet — collection error / `ModuleNotFoundError` equivalent from `spec.loader.exec_module`).

- [ ] **Step 3: Implement**

```python
# scripts/judge_guardian.py
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
            [codex_command, "--version"],
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
```

Makefile changes:

1. Add `judge-guardian` to the `.PHONY` line (`Makefile:15`), immediately after `dev-guardian`:
   ```
   .PHONY: dev dev-real dev-guardian judge-guardian dev-smoke real-codex-scoring-smoke v2-worker-judge-smoke test ...
   ```
   (keep every other existing name in that line unchanged — only insert `judge-guardian`).

2. Add a `JUDGE_GUARDIAN_FLAGS ?=` variable near the other `*_FLAGS` variables (next to `DEV_GUARDIAN_FLAGS ?=` at `Makefile:32`):
   ```make
   DEV_GUARDIAN_FLAGS ?=
   JUDGE_GUARDIAN_FLAGS ?=
   ```

3. Add the target immediately after the existing `dev-guardian:` target block (`Makefile:108-109`):
   ```make
   dev-guardian:
       $(PYTHON_ENV) "$(PYTHON)" scripts/dev_guardian.py --base-url "$(COORDINATOR_URL)" --user-token "$(DIALECTICAL_USER_TOKEN)" $(if $(DEBATE_ID),--debate-id "$(DEBATE_ID)",) $(if $(filter 1 true yes,$(START_SCORING_JOB)),--start-scoring-job,) $(DEV_GUARDIAN_FLAGS)

   judge-guardian:
       $(PYTHON_ENV) "$(PYTHON)" scripts/judge_guardian.py $(JUDGE_GUARDIAN_FLAGS)
   ```

- [ ] **Step 4: Verify pass + suite green**

Run (ONE foreground Bash call, timeout set, never background/Monitor per the anti-stall rule):
`cd coordinator && python -m pytest tests/test_judge_guardian.py -v`
Expected: all new tests pass.

Then run the full coordinator suite the same way:
`cd coordinator && python -m pytest tests -v`
Expected: same 12 known env-harness failures as baseline, plus whatever pre-existing `test_dev_guardian.py` failures already exist from the uncommitted foreign WIP on `scripts/dev_guardian.py` — record both sets separately in your report; introduce zero new failures outside those two known buckets.

- [ ] **Step 5: Commit**

```bash
git add scripts/judge_guardian.py Makefile coordinator/tests/test_judge_guardian.py
git commit -m "$(cat <<'EOF'
feat(coordinator): judge-guardian honest startup check for scoring judges

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
