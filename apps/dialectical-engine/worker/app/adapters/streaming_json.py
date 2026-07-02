from __future__ import annotations

import json


def parse_json_payload(text: str) -> object | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
