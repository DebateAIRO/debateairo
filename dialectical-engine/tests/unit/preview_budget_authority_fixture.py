"""Shared offline fixture for the preview spending gate tests.

Temporary directories only: no real keys, ledgers, sockets to services, or upstream calls.
"""
import hashlib
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.dont_write_bytecode = True
OPS = Path(__file__).resolve().parents[2] / 'packages/providers/ops'
SOURCE = OPS / 'preview_budget_authority.py'
HELPER_SOURCE = OPS / 'preview_budget_helper.py'
MODEL = 'zai-org/GLM-5.3-Flash'
HOST = 'synthetic-host'
SCOPE = 'preview-team-synthetic'
KEY = 'synthetic-key-0123456789'
PEER = 42
REMOVE = object()  # go_document(field=REMOVE) drops a required field


def load_bridge():
    spec = importlib.util.spec_from_file_location('production_preview_budget_authority', SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def go_document(**changes):
    document = {'schema': 'preview-provider-budget-go-v2', 'allow_paid_calls': True,
                'bridge_sha256': file_sha(SOURCE), 'helper_sha256': file_sha(HELPER_SOURCE),
                'model': MODEL, 'requested_effort': 'high', 'scope_id': SCOPE, 'target_host': HOST,
                'allowed_peer_uids': [PEER], 'daily_budget_usd': '5.00', 'max_paid_posts_per_day': 500,
                'max_concurrent_calls': 4, 'open_days': 7}
    document.update(changes)
    return {k: v for k, v in document.items() if v is not REMOVE}



def body(**changes):
    value = {'model': MODEL, 'reasoning_effort': 'high', 'max_tokens': 8192,
             'messages': [{'role': 'user', 'content': 'Offline synthetic test'}]}
    value.update(changes)
    return value


def reservation_of(raw):
    # Independent calculation from the fixed reviewed prices and output bound.
    return (Decimal(len(raw.encode()) + 2048) * Decimal('0.15')
            + Decimal(163840) * Decimal('0.50')) / Decimal(1000000)


def envelope(value, operation_id='synthetic-1', scope=SCOPE, **json_options):
    raw = json.dumps(value, **json_options)
    return {'scope_id': scope, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(),
            'reservedUsd': str(reservation_of(raw))}


RESERVED = reservation_of(json.dumps(body()))


def provider_response(charge='0.01', model=MODEL, content='{}'):
    response = {'model': model, 'choices': [{'message': {'content': content}}]}
    if charge is not None:
        response['usage'] = {'prompt_tokens': 0, 'completion_tokens': 0, 'estimated_cost': charge}
    return response


class Clock:
    def __init__(self, text='2026-10-08T09:00:00+00:00'):
        self.set(text)

    def set(self, text):
        self.moment = datetime.fromisoformat(text)
        assert self.moment.tzinfo is not None

    def __call__(self):
        return self.moment


class Gate:
    """One temporary private directory plus a GO file bound to the real gate and helper."""

    def __init__(self, bridge, **go_changes):
        self.bridge = bridge
        self.root = Path(tempfile.mkdtemp(prefix='preview-gate-'))
        self.private = self.root / 'private'
        self.private.mkdir(mode=0o700)
        os.chmod(self.private, 0o700)
        self.clock = Clock()
        self.go_path = self.write_go(**go_changes)
        self.slots = bridge.CallSlots(self.go['max_concurrent_calls'])

    def write_go(self, name='go.json', **changes):
        self.go = go_document(**changes)
        path = self.root / name
        path.write_text(json.dumps(self.go))
        return path

    def init(self):
        return self.bridge.init_state(self.private, self.go_path, now=self.clock)

    def activate(self, **kwargs):
        options = {'host': HOST, 'platform': 'linux', 'now': self.clock}
        options.update(kwargs)
        return self.bridge.activate(self.private, self.go_path, **options)

    def ready(self):
        self.init()
        self.activate()
        return self

    def call(self, operation_id='op-1', charge='0.01', status=200, model=MODEL, dispatch=None,
             value=None, **kwargs):
        if dispatch is None:
            def dispatch(_body, _key):
                return status, provider_response(charge, model)
        options = {'peer_uid': PEER, 'slots': self.slots, 'dispatch': dispatch,
                   'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux',
                   'now': self.clock, 'slot_wait': 0.2}
        options.update(kwargs)
        request = envelope(value if value is not None else body(), operation_id)
        return self.bridge.execute_request(self.private, self.go_path, request, **options)

    def status(self):
        return self.bridge.status(self.private, now=self.clock)

    def control(self):
        return json.loads((self.private / 'team-control.json').read_text())

    def day(self, day):
        path = self.private / ('team-ledger-' + day + '.json')
        return json.loads(path.read_text()) if path.exists() else None

    def snapshot(self):
        return {p.name: (p.read_bytes(), p.stat().st_mtime_ns, oct(p.stat().st_mode))
                for p in sorted(self.private.iterdir())}

    def close(self):
        shutil.rmtree(self.root, ignore_errors=True)


def utc(text):
    return datetime.fromisoformat(text).astimezone(timezone.utc)
