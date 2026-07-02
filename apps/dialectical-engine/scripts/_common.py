from __future__ import annotations

import os
from collections.abc import Mapping

DEFAULT_DEV_USER_TOKEN = "user_dev_token"


def dev_user_token(environ: Mapping[str, str] | None = None) -> str:
    env = os.environ if environ is None else environ
    configured = env.get("DIALECTICAL_USER_TOKEN", "").strip()
    return configured or DEFAULT_DEV_USER_TOKEN


def mask_secret(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"
