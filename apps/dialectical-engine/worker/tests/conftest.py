from __future__ import annotations

import os

# Test-suite baseline: DIALECTICAL_USER_TOKEN must be ABSENT for worker tests.
# load_config resolves the token as
#     os.getenv("DIALECTICAL_USER_TOKEN", data.get("user_token"))
# so an exported env var always shadows whatever the TOML file holds. save_config
# deliberately never persists user_token, and the round-trip tests in
# tests/test_config.py assert the reloaded value is None -- which only holds when
# nothing is exported. The engine Makefile defaults DIALECTICAL_USER_TOKEN to
# user_dev_token and exports it to every recipe (including `test`), so without
# this clear a plain `make test` from a shell that doesn't already set the var
# fails those assertions, as does any developer shell that exports a real token.
#
# This is the mirror image of coordinator/tests/conftest.py, which *pins* the var
# to user_test_token: the coordinator seeds an authenticated user from it, while
# the worker asserts its absence. Clear here, don't pin -- pinning any value
# would fail the same three assertions.
#
# Tests that exercise the var itself (tests/test_registration_scripts.py) drive
# it through monkeypatch and are unaffected: delenv(raising=False) is a no-op
# when it is already absent, and monkeypatch restores state per test.
os.environ.pop("DIALECTICAL_USER_TOKEN", None)
