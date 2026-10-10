#!/usr/bin/env python3
"""Before the spending gate starts: DeepInfra still lists every model the GO switches on.

The gate unit runs `check` before every start (ExecStartPre), as root inside the gate's own
sandbox, so through the same address filter (only the listed api.deepinfra.com addresses and the
local resolver stub). It reads the GO's `provider` and `enabled_models` and, for each model, makes
one GET of https://api.deepinfra.com/models/<model>: no key, no environment proxy, no redirect
followed. Each must answer 200 with a JSON object; anything else refuses, so the gate does not
start (the unit's restart policy retries, then emails).

It never reads the key file, never makes a model call, and never writes anything. Which models are
reviewed (prices, bounds) is the gate's own check when it starts; this script only asks DeepInfra
whether the switched-on ones are still there. One JSON line on stdout; exit 0, or 2 on refusal.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
HOST = 'api.deepinfra.com'
PROVIDER = 'deepinfra'
# The gate's own model id pattern; '..' is refused separately, so an id is always one URL path.
MODEL_ID = re.compile(r'([A-Za-z0-9][A-Za-z0-9._-]{0,63}/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}')
GO_BYTES = 64 * 1024
MAX_MODELS = 16
REPLY_BYTES = 1024 * 1024
TIMEOUT_SECONDS = 20


class Refusal(Exception):
    """A refusal with a fixed public code."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect is an answer other than 200: it refuses instead of being followed."""

    def redirect_request(self, *_args, **_kwargs):
        return None


def build_opener():
    # An empty ProxyHandler replaces the default one that reads *_proxy from the environment.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def enabled_models(go_path):
    try:
        with open(go_path, 'rb') as stream:
            raw = stream.read(GO_BYTES + 1)
        go = json.loads(raw) if len(raw) <= GO_BYTES else None
    except (OSError, ValueError):
        raise Refusal('GO_UNREADABLE') from None
    if not isinstance(go, dict):
        raise Refusal('GO_UNREADABLE')
    if go.get('provider') != PROVIDER:
        raise Refusal('GO_PROVIDER_NOT_DEEPINFRA')
    models = go.get('enabled_models')
    if not (isinstance(models, list) and 1 <= len(models) <= MAX_MODELS
            and all(isinstance(m, str) and MODEL_ID.fullmatch(m) and '..' not in m for m in models)
            and len(set(models)) == len(models)):
        raise Refusal('GO_MODELS_INVALID')
    return models


def listed(model, opener):
    """True when DeepInfra answers 200 with a JSON object; False for any other answer; a refusal
    when there is no answer at all (DNS, connect, TLS, timeout)."""
    try:
        with opener.open('https://' + HOST + '/models/' + model, timeout=TIMEOUT_SECONDS) as response:
            status, raw = response.status, response.read(REPLY_BYTES + 1)
    except urllib.error.HTTPError:
        return False  # 404, a redirect, and friends: DeepInfra answered, and not with the model.
    except Exception:  # noqa: BLE001 - no usable answer at all (DNS, connect, TLS, timeout, a broken reply)
        raise Refusal('MODEL_CHECK_UNAVAILABLE', {'model': model}) from None
    if status != 200 or len(raw) > REPLY_BYTES:
        return False
    try:
        return isinstance(json.loads(raw), dict)
    except (ValueError, RecursionError):
        return False


def check(go_path, opener):
    models = enabled_models(go_path)
    missing = [model for model in models if not listed(model, opener)]
    if missing:
        raise Refusal('MODEL_NOT_LISTED', {'missing': missing})
    return {'status': 'ok', 'host': HOST, 'models': models}


def main(argv=None, opener=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check',))
    parser.add_argument('--go', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(check(args.go, opener or build_opener())))
        return 0
    except Refusal as refusal:
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        print(json.dumps({'status': 'refused', 'error': refusal.args[0], **detail}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
