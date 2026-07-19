from __future__ import annotations

import os
import tempfile

TEST_HOME = tempfile.mkdtemp(prefix="dialectical-test-")
os.environ["DIALECTICAL_HOME"] = TEST_HOME
os.environ["DIALECTICAL_DATABASE_URL"] = f"sqlite:///{TEST_HOME}/test.sqlite3"
os.environ["DIALECTICAL_USER_TOKEN"] = "user_test_token"
# Test-suite baseline: run the legacy fixed-quartet debate-creation path so the
# existing quartet-asserting tests remain valid byte-for-byte. Production
# defaults DIALECTICAL_DYNAMIC_PERSPECTIVES to TRUE (see dialectical_v2.bool_env
# call). setdefault (not a hard set) so a test can still opt into the dynamic
# path via monkeypatch.setenv, and delenv to exercise the production default.
os.environ.setdefault("DIALECTICAL_DYNAMIC_PERSPECTIVES", "false")

import pytest

from app.core.auth import ensure_user_token
from app.core.db import Base, SessionLocal, engine, init_db


@pytest.fixture()
def db():
    # Per-connection SQLite state survives in the engine's pool across tests
    # and breaks order-independence: PRAGMAs set by a test on a pooled
    # connection outlive it (the connect-time pragma listener only fires on
    # fresh connects), and the drop_all/create_all rebuild below rotates
    # through the FIFO pool, leaving connections whose cached schema predates
    # the rebuild -- their first PRAGMA (e.g. index_list during inspection)
    # then answers from the stale cache. Dispose the pool so every test runs
    # on fresh connections.
    engine.dispose()
    init_db()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        ensure_user_token(session, "user_test_token")
        yield session

