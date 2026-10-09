"""Synthetic guard tests. No private files, keys, sockets, or upstream calls."""
import contextlib
import io
import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import (  # noqa: E402
    HOST, KEY, MODEL, PEER, RESERVED, SCOPE, Gate, body, envelope, load_bridge, provider_response)

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
GO = {'scope_id': SCOPE, 'target_host': HOST, 'allowed_peer_uids': [PEER], 'max_concurrent_calls': 4}


class RequestModeTests(unittest.TestCase):
    def test_existing_four_field_request_keeps_identical_body_and_reservation(self):
        request = envelope(body())
        outgoing, reserved = bridge.validate_request(request, GO)
        self.assertEqual(outgoing, bridge.helper.canonical(body()))
        self.assertEqual(json.loads(outgoing), body())
        self.assertEqual(str(reserved), request['reservedUsd'])
        self.assertNotIn('response_format', json.loads(outgoing))

    def test_exact_json_object_mode_is_accepted_without_normalizing_request_bytes(self):
        value = {**body(), 'response_format': {'type': 'json_object'}}
        compact = envelope(value, separators=(',', ':'))
        spaced = envelope(value, indent=2)
        for request in (compact, spaced):
            outgoing, reserved = bridge.validate_request(request, GO)
            self.assertEqual(outgoing, bridge.helper.canonical(value))
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
            with self.subTest(mode=mode), patch.object(bridge, 'load_go', return_value=(GO, 'go-hash')), \
                 patch.object(bridge, 'TeamStore') as store:
                calls = []
                request = envelope({**body(), 'response_format': mode})
                with self.assertRaisesRegex(SafetyError, '^REQUEST_PARAMETERS_INVALID$'):
                    bridge.execute_request(None, None, request, peer_uid=PEER, slots=bridge.CallSlots(4),
                        dispatch=lambda *args: calls.append(args), key_loader=lambda _: calls.append('key'),
                        host=HOST, platform='linux')
                store.assert_not_called()
                self.assertEqual(calls, [])

    def test_other_body_fields_model_effort_and_token_bound_remain_refused(self):
        invalid = [{**body(), 'arbitrary': True}, {**body(), 'response_format': {'type': 'json_object'}, 'extra': True},
                   {**body(), 'model': 'other-model'}, {**body(), 'reasoning_effort': 'low'},
                   {**body(), 'max_tokens': 163841}, {**body(), 'max_tokens': True},
                   {**body(), 'max_tokens': 1.5}, {**body(), 'max_tokens': 0}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaisesRegex(SafetyError, '^REQUEST_PARAMETERS_INVALID$'):
                bridge.validate_request(envelope(value), GO)

    def test_scope_hash_reservation_and_envelope_fields_remain_exact(self):
        for changes in ({'scope_id': 'other'}, {'requestSha256': '0' * 64},
                        {'reservedUsd': '0.01'}, {'extra': True}):
            with self.subTest(changes=changes), self.assertRaises(SafetyError):
                bridge.validate_request({**envelope(body()), **changes}, GO)

    def test_json_mode_dispatch_retains_prior_uncertainty_and_paid_post_accounting(self):
        gate = Gate(bridge)
        self.addCleanup(gate.close)
        gate.ready()

        def broken(_body, _key):
            raise TimeoutError('synthetic')
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(SafetyError, '^NEW_CHARGE_UNCERTAIN$'):
                gate.call('prior', dispatch=broken)
            gate.activate()  # Root re-activates; the uncertain hold stays on its day.
            prior = json.loads(json.dumps(gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':prior']))
            value = {**body(), 'response_format': {'type': 'json_object'}}
            dispatched = []

            def dispatch(request, key):
                dispatched.append((request, key))
                return 200, provider_response('0.01')
            result = gate.call('json-mode', dispatch=dispatch, value=value)
        self.assertEqual(result['status'], 200)
        self.assertEqual(dispatched, [(bridge.helper.canonical(value), KEY)])
        self.assertEqual(json.loads(result['body'])['model'], MODEL)
        self.assertEqual(gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':prior'], prior)
        status = gate.status()
        self.assertEqual(status['today_posts'], 2)
        self.assertEqual(Decimal(status['today_spend_usd']), RESERVED + Decimal('0.01'))

    def test_expired_window_and_daily_post_limit_still_prevent_dispatch(self):
        for condition in ('expired', 'limit'):
            with self.subTest(condition=condition):
                gate = Gate(bridge, open_days=1, max_paid_posts_per_day=1)
                self.addCleanup(gate.close)
                gate.ready()
                with contextlib.redirect_stdout(io.StringIO()):
                    if condition == 'expired':
                        gate.clock.set('2026-10-09T09:00:00+00:00')
                    else:
                        gate.call('first')
                    dispatched = []
                    with self.assertRaises(SafetyError):
                        gate.call('json-mode', dispatch=lambda *args: dispatched.append(args),
                                  value={**body(), 'response_format': {'type': 'json_object'}})
                self.assertEqual(dispatched, [])


if __name__ == '__main__':
    unittest.main()
