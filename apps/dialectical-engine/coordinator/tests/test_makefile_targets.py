from __future__ import annotations

import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_worker_install_targets_forward_allowed_models() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "WORKER_ALLOWED_MODELS_ARG = " in makefile
    assert "WORKER_REQUIRE_NAMED_HTTPS_ARG = " in makefile
    assert (
        'scripts/register_worker.py --coordinator-url "$(COORDINATOR_URL)" '
        '--name "$(WORKER_NAME)" $(WORKER_ALLOWED_MODELS_ARG) $(WORKER_REQUIRE_NAMED_HTTPS_ARG)'
    ) in makefile
    assert (
        'scripts/install_worker.py --coordinator-url "$(COORDINATOR_URL)" '
        '--name "$(WORKER_NAME)" --python "$(PYTHON)" $(WORKER_ALLOWED_MODELS_ARG) $(WORKER_REQUIRE_NAMED_HTTPS_ARG)'
    ) in makefile
    assert (
        'scripts/update_worker_config.py --coordinator-url "$(COORDINATOR_URL)" '
        '--config "$(WORKER_CONFIG)" $(WORKER_ALLOWED_MODELS_ARG) $(WORKER_REQUIRE_NAMED_HTTPS_ARG)'
    ) in makefile


def test_make_dev_sets_single_machine_defaults() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert '"$(CURDIR)/.venv/Scripts/python.exe"' in makefile
    assert "DIALECTICAL_USER_TOKEN ?= user_dev_token" in makefile
    assert "DIALECTICAL_DEV_WORKER_RELOAD ?= 0" in makefile
    assert "export DIALECTICAL_USER_TOKEN" in makefile
    assert "export DIALECTICAL_DEV_WORKER_RELOAD" in makefile
    assert "scripts/start_dev.ps1" in makefile
    assert '$(PYTHON_ENV) "$(PYTHON)" scripts/dev.py' in makefile


def test_sibling_dialectical_engine_makefile_forwards_dev_target() -> None:
    makefile = (ROOT.parents[1] / "dialectical-engine" / "Makefile").read_text()

    assert ".PHONY: dev" in makefile
    assert "$(MAKE) -C ../apps/dialectical-engine dev" in makefile


def test_repository_root_makefile_forwards_dev_target() -> None:
    makefile = (ROOT.parents[1] / "Makefile").read_text()

    assert ".PHONY: dev" in makefile
    assert "$(MAKE) -C apps/dialectical-engine dev" in makefile


def test_make_test_loads_pytest_cov_plugin_module_when_autoload_is_disabled() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "-p pytest_cov.plugin" in makefile
    assert "-p pytest_cov " not in makefile


def test_make_test_env_is_platform_structured() -> None:
    """W5b: the test entrypoint carries no POSIX-only hard dependency on the
    default path -- per-platform env lives in TEST_ENV inside the OS branches
    (cmd-safe `set` chain on Windows, VAR=value prefixes + the optional macOS
    DYLD workaround on POSIX), and the recipe uses only $(TEST_ENV)."""
    makefile = (ROOT / "Makefile").read_text()
    windows_block, remainder = makefile.split("ifeq ($(OS),Windows_NT)", 1)[1].split("\nelse\n", 1)
    posix_block = remainder.split("\nendif\n", 1)[0]

    assert 'TEST_ENV = set "PYTHONPYCACHEPREFIX=$(TEST_PYCACHE_PREFIX)" && set "PYTEST_DISABLE_PLUGIN_AUTOLOAD=1" &&' in windows_block
    assert "DYLD_LIBRARY_PATH" not in windows_block, "no macOS-only env baked into the Windows branch"
    assert "TEST_PYCACHE_PREFIX ?= $(TEMP)/dialectical-test-pycache" in windows_block
    assert 'TEST_ENV = PYTHONPYCACHEPREFIX="$(TEST_PYCACHE_PREFIX)" PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 $(PYTHON_ENV)' in posix_block
    assert "TEST_PYCACHE_PREFIX ?= /private/tmp/dialectical-test-pycache" in posix_block

    test_target = makefile.split("\ntest:\n", 1)[1].split("\n\n", 1)[0]
    assert test_target.count("$(TEST_ENV)") == 2, "both pytest invocations route env through TEST_ENV"
    assert "PYTHONPYCACHEPREFIX=" not in test_target, "no inline POSIX env prefixes in the recipe"
    assert "PYTEST_DISABLE_PLUGIN_AUTOLOAD" not in test_target
    # The Windows invocation is documented next to the target.
    assert "Windows invocation" in makefile


def test_make_test_dry_run_expands_platform_env() -> None:
    proc = subprocess.run(
        ["make", "-n", "test"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=30,
    )

    assert proc.returncode == 0, proc.stdout
    assert "PYTHONPYCACHEPREFIX=" in proc.stdout
    assert "PYTEST_DISABLE_PLUGIN_AUTOLOAD=1" in proc.stdout
    assert "-p pytest_cov.plugin" in proc.stdout


def test_makefile_exposes_explicit_quick_tunnel_stop_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "stop-quick-tunnel:" in makefile
    assert 'scripts/install_tunnel.py --stop-quick-service-only' in makefile


def test_makefile_exposes_named_tunnel_setup_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "setup-named-tunnel:" in makefile
    assert 'scripts/setup_named_tunnel.py --tunnel "$(TUNNEL_NAME)"' in makefile
    assert "STOP_QUICK_TUNNEL_AFTER_VERIFY ?= 1" in makefile
    assert "--stop-quick-after-verified" in makefile
    assert "$(SETUP_NAMED_TUNNEL_FLAGS)" in makefile


def test_makefile_exposes_interactive_manual_setup_target() -> None:
    makefile = (ROOT / "Makefile").read_text()
    helper = (ROOT / "scripts" / "interactive_manual_setup.sh").read_text()

    assert "interactive-manual-setup:" in makefile
    assert "./scripts/interactive_manual_setup.sh" in makefile
    assert "claude auth login --claudeai" in helper
    assert "Refresh local model routing after Claude/Gemini login now?" in helper
    assert "make refresh-local-models" in helper
    assert "Create Romarg nameserver paste card" in helper
    assert "make prepare-romarg-nameservers" in helper
    assert "Run named Cloudflare tunnel setup now if DNS and login are ready?" in helper
    assert "make resume-dezbatere-hosting" in helper


def test_makefile_exposes_romarg_nameserver_card_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "LOCAL_CHECK_PYTHON ?= $(PYTHON)" in makefile
    assert "CLOUDFLARE_NAMESERVERS ?=" in makefile
    assert "ROMARG_NAMESERVER_CARD ?= Romarg_Nameservers_To_Set.md" in makefile
    assert "prepare-romarg-nameservers:" in makefile
    assert 'scripts/prepare_romarg_nameservers.py $(if $(strip $(CLOUDFLARE_NAMESERVERS)),--nameservers "$(CLOUDFLARE_NAMESERVERS)",) --output "$(ROMARG_NAMESERVER_CARD)"' in makefile


def test_makefile_exposes_final_single_machine_check_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "FINAL_SINGLE_MACHINE_REPORT ?= /private/tmp/dialectical-final-single-machine-check.json" in makefile
    assert "FINAL_SINGLE_MACHINE_FLAGS ?=" in makefile
    assert "final-single-machine-check: setup-status" in makefile
    assert 'scripts/final_single_machine_check.py --report-path "$(FINAL_SINGLE_MACHINE_REPORT)" $(FINAL_SINGLE_MACHINE_FLAGS)' in makefile


def test_dezbatere_tunnel_helpers_require_full_cloudflare_delegation() -> None:
    for script_name in ("resume_dezbatere_hosting.sh", "setup_dezbatere_tunnel.sh"):
        script = (ROOT / "scripts" / script_name).read_text()

        assert "is_cloudflare_delegation()" in script
        assert "cloudflare == total" in script
        assert (
            "every nameserver must end with .ns.cloudflare.com" in script
            or "Replace all Romarg nameservers" in script
        )


def test_makefile_exposes_source_snapshot_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "SOURCE_SNAPSHOT ?= /private/tmp/dialectical-engine-source.tgz" in makefile
    assert "SOURCE_SNAPSHOT_REPORT ?= /private/tmp/dialectical-engine-source-snapshot.json" in makefile
    assert "source-snapshot:" in makefile
    assert 'scripts/export_source_snapshot.py --output "$(SOURCE_SNAPSHOT)" --report-path "$(SOURCE_SNAPSHOT_REPORT)"' in makefile


def test_makefile_exposes_manual_real_codex_scoring_smoke_target() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "SCORING_SMOKE_FLAGS ?=" in makefile
    assert "real-codex-scoring-smoke:" in makefile
    assert 'scripts/real_codex_scoring_smoke.py $(SCORING_SMOKE_FLAGS)' in makefile


def test_makefile_exposes_handoff_production_gate_targets() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "HANDOFF_ARCHIVE ?= $(BUNDLE_OUTPUT_DIR)/dialectical-v2-handoff-$(shell date +%F).tgz" in makefile
    assert "final-production-check:" in makefile
    assert "production-readiness:" in makefile
    assert "production-acceptance-sequence:" in makefile
    assert "dialectical-handoff/final_production_check.sh" in makefile
    assert "dialectical-handoff/production_readiness.sh" in makefile
    assert "dialectical-handoff/production_acceptance_sequence.sh" in makefile
    assert 'ENGINE_DIR="$${ENGINE_DIR:-$(CURDIR)}" "$$script"' in makefile


def test_local_cluster_check_builds_web_before_running_proof() -> None:
    makefile = (ROOT / "Makefile").read_text()

    target = makefile.split("local-cluster-check:", 1)[1].split("\n\ndeploy-preflight:", 1)[0]

    assert "pnpm --dir web build" in target
    assert "scripts/local_cluster_check.py" in target
    assert target.index("pnpm --dir web build") < target.index("scripts/local_cluster_check.py")


def test_setup_status_windows_dry_run_uses_cmd_safe_full_sequence() -> None:
    proc = subprocess.run(
        ["make", "-n", "setup-status"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=30,
    )

    assert proc.returncode == 0, proc.stdout
    assert 'DYLD_LIBRARY_PATH=""' not in proc.stdout
    # The Makefile only prefixes the manual-setup output with %TEMP% on an
    # actual Windows host (the `ifeq ($(OS),Windows_NT)` branch, which also
    # switches SHELL to cmd.exe). On any other host OS the else-branch default
    # applies, so compute the platform-appropriate expected path rather than
    # requiring a Windows-only env var to exist.
    if os.name == "nt":
        expected_output = f'{os.environ["TEMP"]}/ManualSetup_TODO.md'
    else:
        expected_output = "ManualSetup_TODO.md"
    assert f'--output "{expected_output}"' in proc.stdout
    expected_steps = [
        "scripts/local_single_machine_check.py",
        "scripts/local_single_machine_check.py --probe-models",
        "scripts/hosting_status.py",
        "scripts/manual_setup_checklist.py",
        "scripts/local_single_machine_acceptance.py",
        "scripts/local_next_steps.py",
    ]
    positions = [proc.stdout.index(step) for step in expected_steps]
    assert positions == sorted(positions)
