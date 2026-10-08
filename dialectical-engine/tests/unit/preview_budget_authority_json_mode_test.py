"""Synthetic guard tests. No private files, keys, sockets, or upstream calls."""
import copy
import contextlib
import hashlib
import importlib.util
import json
import io
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[2] / 'packages/providers/ops/preview_budget_authority.py'
spec = importlib.util.spec_from_file_location('production_preview_budget_authority', SOURCE)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class SafetyError(RuntimeError):
    pass

HELPER = types.SimpleNamespace(SafetyError=SafetyError, decimal_amount=Decimal,
    utc_now=lambda: '2030-01-01T00:00:00Z', read_key=lambda _: 'synthetic-key',
    redact=lambda value, _: value, account_response=lambda _: {'guard_charge_usd': '0.01'})
GO = {'scope_id': 'preview-synthetic-debate-20261004', 'target_host': 'synthetic-host',
      'allowed_peer_uids': [42], 'max_paid_posts': 2}

def body():
    return {'model': 'zai-org/GLM-5.3-Flash', 'reasoning_effort': 'high',
            'max_tokens': 8192, 'messages': [{'role': 'user', 'content': 'Offline synthetic test'}]}

def envelope(value, **json_options):
    raw = json.dumps(value, **json_options)
    # Independent calculation from the fixed reviewed prices/output bound.
    reservation = (Decimal(len(raw.encode()) + 2048) * Decimal('0.15')
                   + Decimal(163840) * Decimal('0.50')) / Decimal(1000000)
    return {'scope_id': 'preview-synthetic-debate-20261004', 'operationId': 'synthetic-1',
            'requestBody': raw, 'requestSha256': hashlib.sha256(raw.encode()).hexdigest(),
            'reservedUsd': str(reservation)}

class LedgerFixture:
    def __init__(self):
        old = {'state': 'uncertain', 'held_usd': '0.15'}
        self.data = {'entries': {'original-entry': copy.deepcopy(old)}, 'preview_authority': {
            'state': 'active', 'go_sha256': 'synthetic-go-hash', 'active_host': 'synthetic-host',
            'scope_id': GO['scope_id'], 'paid_posts': 0, 'baseline_entries': {'original-entry': old},
            'expires_at_utc': (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()}}
        self.saved = 0
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def total(self):
        return sum((Decimal(entry.get('held_usd', entry.get('reserved_usd', '0')))
                    for entry in self.data['entries'].values()), Decimal(0))
    def save(self):
        assert self.data['entries']['original-entry'] == self.data['preview_authority']['baseline_entries']['original-entry']
        self.saved += 1

class RequestModeTests(unittest.TestCase):
    def test_existing_four_field_request_keeps_identical_body_and_reservation(self):
        request = envelope(body())
        parsed, reserved = bridge.validate_request(request, GO, HELPER)
        self.assertEqual(parsed, body())
        self.assertEqual(str(reserved), request['reservedUsd'])
        self.assertNotIn('response_format', parsed)

    def test_exact_json_object_mode_is_accepted_without_normalizing_request_bytes(self):
        value = {**body(), 'response_format': {'type': 'json_object'}}
        compact = envelope(value, separators=(',', ':'))
        spaced = envelope(value, indent=2)
        for request in (compact, spaced):
            parsed, reserved = bridge.validate_request(request, GO, HELPER)
            self.assertEqual(parsed, value)
            self.assertEqual(str(reserved), request['reservedUsd'])
        self.assertNotEqual(compact['requestSha256'], spaced['requestSha256'])
        self.assertNotEqual(compact['reservedUsd'], spaced['reservedUsd'])

    def test_mode_helper_accepts_only_absent_or_exact_object(self):
        self.assertTrue(bridge.valid_response_format(body()))
        self.assertTrue(bridge.valid_response_format({**body(), 'response_format': {'type': 'json_object'}}))
        for invalid in (None, True, False, 1, 'json_object', [], ['json_object'], {},
                        {'type': 'text'}, {'type': 'json_schema'}, {'type': None},
                        {'type': True}, {'type': 'JSON_OBJECT'},
                        {'type': 'json_object', 'json_schema': {}},
                        {'type': 'json_object', 'extra': False}):
            with self.subTest(invalid=invalid):
                self.assertFalse(bridge.valid_response_format({**body(), 'response_format': invalid}))

    def test_invalid_optional_mode_is_refused_before_any_authority_ledger_key_or_dispatch(self):
        invalid_modes = (None, 'json_object', [], {}, {'type': 'text'},
                         {'type': 'json_schema', 'json_schema': {}},
                         {'type': 'json_object', 'extra': False})
        for mode in invalid_modes:
            with self.subTest(mode=mode), patch.object(bridge, 'read_go', return_value=GO), \
                 patch.object(bridge, 'LockedLedger') as ledger:
                calls = []
                request = envelope({**body(), 'response_format': mode})
                with self.assertRaisesRegex(SafetyError, '^REQUEST_PARAMETERS_INVALID$'):
                    bridge.execute_request(None, None, request, HELPER,
                        dispatch=lambda *args: calls.append(args), key_loader=lambda _: calls.append('key'),
                        host='synthetic-host', platform='linux', peer_uid=42)
                ledger.assert_not_called()
                self.assertEqual(calls, [])

    def test_other_body_fields_model_effort_and_token_bound_remain_refused(self):
        invalid = [{**body(), 'arbitrary': True}, {**body(), 'response_format': {'type': 'json_object'}, 'extra': True},
                   {**body(), 'model': 'other-model'}, {**body(), 'reasoning_effort': 'low'},
                   {**body(), 'max_tokens': 163841}, {**body(), 'max_tokens': True},
                   {**body(), 'max_tokens': 1.5}, {**body(), 'max_tokens': 0}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaisesRegex(SafetyError, '^REQUEST_PARAMETERS_INVALID$'):
                bridge.validate_request(envelope(value), GO, HELPER)

    def test_scope_hash_reservation_and_envelope_fields_remain_exact(self):
        for changes in ({'scope_id': 'other'}, {'requestSha256': '0' * 64},
                        {'reservedUsd': '0.01'}, {'extra': True}):
            with self.subTest(changes=changes), self.assertRaises(SafetyError):
                bridge.validate_request({**envelope(body()), **changes}, GO, HELPER)

    def test_json_mode_dispatch_retains_prior_uncertainty_and_paid_post_accounting(self):
        ledger = LedgerFixture()
        original = copy.deepcopy(ledger.data['entries']['original-entry'])
        value = {**body(), 'response_format': {'type': 'json_object'}}
        dispatched = []
        def dispatch(request, key):
            dispatched.append(request)
            return 200, {'model': 'zai-org/GLM-5.3-Flash', 'choices': []}
        with contextlib.redirect_stdout(io.StringIO()), patch.object(bridge, 'read_go', return_value=GO), \
             patch.object(bridge, 'LockedLedger', return_value=ledger), \
             patch.object(bridge, 'sha', return_value='synthetic-go-hash'):
            result = bridge.execute_request(None, None, envelope(value), HELPER, dispatch=dispatch,
                host='synthetic-host', platform='linux', peer_uid=42)
        self.assertEqual(result['status'], 200)
        self.assertEqual(dispatched, [value])
        self.assertEqual(ledger.data['entries']['original-entry'], original)
        self.assertEqual(ledger.data['preview_authority']['paid_posts'], 1)
        self.assertEqual(ledger.total(), Decimal('0.16'))

    def test_expired_window_and_paid_post_limit_still_prevent_dispatch(self):
        for condition in ('expired', 'limit'):
            ledger = LedgerFixture()
            control = ledger.data['preview_authority']
            if condition == 'expired': control['expires_at_utc'] = '2000-01-01T00:00:00+00:00'
            else: control['paid_posts'] = 2
            dispatched = []
            with patch.object(bridge, 'read_go', return_value=GO), \
                 patch.object(bridge, 'LockedLedger', return_value=ledger), \
                 patch.object(bridge, 'sha', return_value='synthetic-go-hash'), self.assertRaises(SafetyError):
                bridge.execute_request(None, None, envelope({**body(), 'response_format': {'type': 'json_object'}}), HELPER,
                    dispatch=lambda *args: dispatched.append(args), host='synthetic-host', platform='linux', peer_uid=42)
            self.assertEqual(dispatched, [])

if __name__ == '__main__': unittest.main()
