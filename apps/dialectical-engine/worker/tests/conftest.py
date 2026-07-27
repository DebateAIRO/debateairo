from __future__ import annotations

import os

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
