from __future__ import annotations

import os
import tempfile

# Home-proofing: any test that reaches save_config()/load_config()/
# snapshot_identity() without an explicit path resolves the REAL
# ~/.dialectical-worker/config.toml via DIALECTICAL_WORKER_CONFIG's default.
# That is not hypothetical: worker_loop's capability-change save inside
# test_startup_lifecycle overwrote the operator's live config with fixture
# junk (name "fresh-start-worker", capabilities ["fake-a"]) -- the exact
# identity-less file shape found in the 2026-07-27 worker A outage
# (full-pass-2026-07-27.md section A.7). Pin the whole session to a throwaway
# directory, unconditionally (an inherited env value pointing at the real
# file must lose too). Tests that care about the path still monkeypatch.setenv
# per-case, which layers cleanly on top of this baseline.
os.environ["DIALECTICAL_WORKER_CONFIG"] = os.path.join(
    tempfile.mkdtemp(prefix="dialectical-worker-tests-"), "config.toml"
)

# Makefile-proofing: the repo Makefile defaults DIALECTICAL_USER_TOKEN to
# "user_dev_token" and `export`s it into every recipe, so under `make test`
# load_config()'s env overlay (app/config.py) could never return
# user_token=None and the three "user_token must not be persisted" tests
# failed with `assert 'user_dev_token' is None`. This suite's baseline is a
# token-free environment, so drop the variable before any test module runs.
# (The coordinator conftest hard-sets the same variable because its suite
# NEEDS a token -- same env-pinning discipline, opposite direction.) A test
# that wants the env overlay opts in per-case via monkeypatch.setenv;
# test_registration_scripts.py's no-token paths already delenv per-case.
os.environ.pop("DIALECTICAL_USER_TOKEN", None)
