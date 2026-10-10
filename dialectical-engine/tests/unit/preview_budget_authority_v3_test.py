"""The v3 spending gate's provider profile and reviewed model table.

Offline only: temporary directories, fake dispatch functions, local socket pairs. No private
files, real keys, real ledgers, DNS or upstream calls. Every v2 behaviour (halts, unsent calls,
stale socket, day boundary, custody, drain) runs on the v3 gate in preview_budget_authority_v2_test.py.
"""
import contextlib
import hashlib
import io
import json
import os
import socket
import sys
import threading
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import (  # noqa: E402
    DEEPSEEK, HELPER_SOURCE, HOST, KEY, MIMO, MODEL, PEER, ROWS, SCOPE, SOURCE, Gate, body, envelope, go_document,
    load_bridge, provider_response, reservation_of)

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
DEEPINFRA = bridge.helper.PROFILES['deepinfra']
_HTTPS = bridge.helper.HttpsTransport
PARITY = Path(__file__).resolve().parent / 'fixtures/preview-model-rows.json'
ALL = [MODEL, DEEPSEEK, MIMO]


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


def entry_of(gate, operation_id, day='2026-10-08'):
    return gate.day(day)['entries']['preview-test:' + SCOPE + ':' + operation_id]


def sized_body(model, size):
    """A valid request for model whose JSON text is exactly size bytes."""
    value = body(model=model, messages=[{'role': 'user', 'content': ''}])
    value['messages'][0]['content'] = 'x' * (size - len(json.dumps(value).encode()))
    assert len(json.dumps(value).encode()) == size
    return value


class FakeVendorProfile(bridge.helper.DeepInfraProfile):
    """A second provider, added the way PRs B and C add theirs: one class in PROFILES, no core change."""
    name = 'fakevendor'
    host = 'api.fakevendor.invalid'
    path = '/v1/chat'
    redaction_patterns = (r'fk-[A-Za-z0-9]{8,}',)
    rows = {'fake/model-1': bridge.helper.ModelRow('fake/model-1', 'FakeMaker', Decimal('0.10'), Decimal('0.20'),
                                                   4096, None, False)}


class GateTest(unittest.TestCase):
    def setUp(self):
        self.gates = []
        guard = patch.object(bridge.helper, 'HttpsTransport', no_network)
        guard.start()
        self.addCleanup(guard.stop)
        self.out = io.StringIO()
        redirect = contextlib.redirect_stdout(self.out)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)

    def tearDown(self):
        for gate in self.gates:
            gate.close()

    def gate(self, **go_changes):
        gate = Gate(bridge, **go_changes)
        self.gates.append(gate)
        return gate

    def refused(self, code):
        return self.assertRaisesRegex(SafetyError, '^' + code + '$')


class ReviewedTableTests(GateTest):
    def test_reviewed_rows_equal_the_parity_fixture_the_app_also_asserts(self):
        parity = json.loads(PARITY.read_text())
        self.assertEqual((parity['provider'], parity['reservation']['overhead_bytes'],
                          parity['reservation']['worst_case_request_bytes'], Decimal(parity['reservation']['per_call_cap_usd'])),
                         ('deepinfra', bridge.RESERVATION_OVERHEAD_BYTES, bridge.MAX_REQUEST_BYTES, bridge.MAX_CALL_RESERVATION_USD))
        self.assertEqual([row['model'] for row in parity['rows']], list(DEEPINFRA.rows))
        for expected in parity['rows']:
            with self.subTest(model=expected['model']):
                row = DEEPINFRA.rows[expected['model']]
                self.assertEqual({'model': row.model, 'maker': row.maker, 'input_usd_per_m': str(row.input_usd_per_m),
                                  'output_usd_per_m': str(row.output_usd_per_m),
                                  'input_nano_usd_per_token': int(row.input_usd_per_m * 1000),
                                  'output_nano_usd_per_token': int(row.output_usd_per_m * 1000),
                                  'output_bound': row.output_bound, 'effort': row.effort, 'json_object': row.json_object,
                                  'worst_case_reservation_usd': '%.9f' % bridge.worst_case_reservation(row)},
                                 expected)
                # The fixture's own rows also equal the independent copy the other tests use.
                self.assertEqual(ROWS[row.model], (row.maker, str(row.input_usd_per_m), str(row.output_usd_per_m),
                                                   row.output_bound, row.effort, row.json_object))

    def test_every_reviewed_row_fits_the_per_call_cap_for_a_full_size_request(self):
        self.assertEqual(bridge.MAX_CALL_RESERVATION_USD, Decimal('0.25'))
        self.assertEqual(bridge.MAX_REQUEST_BYTES, 256 * 1024)
        expected = {MODEL: Decimal('0.1215488'), DEEPSEEK: Decimal('0.1314816'), MIMO: Decimal('0.2276352')}
        for name, profile in bridge.helper.PROFILES.items():
            for model, row in profile.rows.items():
                with self.subTest(provider=name, model=model):
                    worst = bridge.worst_case_reservation(row)
                    self.assertLessEqual(worst, bridge.MAX_CALL_RESERVATION_USD)
                    self.assertTrue(bridge.row_reviewed(model, row))
                    if name == 'deepinfra':
                        self.assertEqual(worst, expected[model])
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        for model in ALL:  # A real request of exactly 256 KiB reserves exactly the worst case.
            with self.subTest(model=model):
                _, reserved, _ = bridge.validate_request(envelope(sized_body(model, bridge.MAX_REQUEST_BYTES)), go)
                self.assertEqual(reserved, expected[model])
                with self.refused('REQUEST_SCOPE_INVALID'):
                    bridge.validate_request(envelope(sized_body(model, bridge.MAX_REQUEST_BYTES + 1)), go)

    def test_the_table_lives_in_the_hash_bound_helper_only(self):
        helper_text, gate_text = HELPER_SOURCE.read_text(), SOURCE.read_text()
        for model, (_maker, price_in, price_out, _bound, _effort, _json) in ROWS.items():
            self.assertIn("ModelRow('%s'" % model, helper_text)
            self.assertNotIn(model, gate_text)
            self.assertNotIn("Decimal('%s')" % price_out, gate_text)
        self.assertEqual(go_document()['helper_sha256'], hashlib.sha256(HELPER_SOURCE.read_bytes()).hexdigest())

    def test_a_row_with_zero_ceiling_or_over_cap_values_refuses_every_go_of_its_profile(self):
        glm = DEEPINFRA.rows[MODEL]
        broken = {'zero_input': glm._replace(input_usd_per_m=Decimal('0')),
                  'zero_output': glm._replace(output_usd_per_m=Decimal('0.00')),
                  'negative': glm._replace(input_usd_per_m=Decimal('-0.15')),
                  'over_ceiling': glm._replace(output_usd_per_m=Decimal('10.01')),
                  'float_price': glm._replace(input_usd_per_m=0.15),
                  'over_cap': glm._replace(output_bound=1048576),
                  'zero_bound': glm._replace(output_bound=0),
                  'effort_max': glm._replace(effort='max'),
                  'json_text': glm._replace(json_object='yes'),
                  'no_maker': glm._replace(maker=''),
                  'other_id': glm._replace(model='zai-org/GLM-5.3'),
                  'dot_dot': None}
        for name, row in broken.items():
            with self.subTest(name):
                rows = dict(DEEPINFRA.rows)
                if row is None:
                    rows['zai-org/../x'] = glm._replace(model='zai-org/../x')
                else:
                    rows[MODEL] = row
                gate = self.gate()
                with patch.object(DEEPINFRA, 'rows', rows), self.refused('ROOT_GO_INVALID'):
                    bridge.read_go(gate.go_path)
        bridge.read_go(self.gate().go_path)  # The reviewed table itself passes.


class GoV3Tests(GateTest):
    def test_a_v2_go_is_refused_never_upgraded(self):
        gate = self.gate()
        v2 = {**{k: v for k, v in gate.go.items() if k not in ('provider', 'enabled_models')},
              'schema': 'preview-provider-budget-go-v2', 'model': MODEL, 'requested_effort': 'high'}
        path = gate.root / 'v2.json'
        path.write_text(json.dumps(v2))
        for document in (v2, {**v2, 'schema': 'preview-provider-budget-go-v3'},
                         {**gate.go, 'schema': 'preview-provider-budget-go-v2'}, {**gate.go, 'model': MODEL}):
            with self.subTest(document=document):
                path.write_text(json.dumps(document))
                with self.refused('ROOT_GO_INVALID'):
                    bridge.read_go(path)
        gate.go_path = path
        path.write_text(json.dumps(v2))
        with self.refused('ROOT_GO_INVALID'):
            gate.init()
        self.assertEqual(list(gate.private.iterdir()), [])

    def test_only_a_known_provider_and_reviewed_unique_enabled_models_are_accepted(self):
        gate = self.gate()
        for changes in ({'enabled_models': ALL}, {'enabled_models': [MIMO]}, {'enabled_models': [DEEPSEEK, MODEL]}):
            with self.subTest(changes=changes):
                self.assertEqual(bridge.read_go(gate.write_go(name='ok.json', **changes))['enabled_models'],
                                 changes['enabled_models'])
        for changes in ({'provider': 'anthropic'}, {'provider': 'google'}, {'provider': 'DeepInfra'},
                        {'provider': 7}, {'provider': None}, {'provider': ['deepinfra']},
                        {'enabled_models': []}, {'enabled_models': [MODEL, MODEL]}, {'enabled_models': ['other/model']},
                        {'enabled_models': MODEL}, {'enabled_models': [7]}, {'enabled_models': None},
                        {'enabled_models': [[MODEL]]}, {'enabled_models': [MODEL.lower()]},
                        {'enabled_models': ALL + ['fake/model-1']}):
            with self.subTest(changes=changes), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', **changes))

    def test_activate_refuses_concurrency_times_the_largest_enabled_worst_case_over_the_pot(self):
        # GLM worst case 0.1215488 (x4 = 0.4861952); MiMo 0.2276352 (x4 = 0.9105408).
        for enabled, budget, ok in (([MODEL], '0.48', False), ([MODEL], '0.49', True),
                                    ([MODEL, MIMO], '0.91', False), ([MODEL, MIMO], '0.92', True),
                                    ([MODEL, DEEPSEEK], '0.52', False), ([MODEL, DEEPSEEK], '0.53', True)):
            with self.subTest(enabled=enabled, budget=budget):
                gate = self.gate(enabled_models=enabled, daily_budget_usd=budget)
                gate.init()  # init does not judge the pot; activate does.
                if ok:
                    self.assertEqual(gate.activate()['state'], 'active')
                else:
                    with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
                        gate.activate()
                    self.assertEqual(gate.control()['state'], 'initialized')
        gate = self.gate(enabled_models=[MIMO], daily_budget_usd='0.22', max_concurrent_calls=1)
        gate.init()
        with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
            gate.activate()

    def test_enabling_another_model_takes_a_new_go_and_activate(self):
        gate = self.gate().ready()
        with self.refused('MODEL_NOT_ALLOWED'):
            gate.call('op-1', value=body(model=DEEPSEEK))
        gate.go_path = gate.write_go(name='with-deepseek.json', enabled_models=[MODEL, DEEPSEEK])
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-2', value=body(model=DEEPSEEK))
        bridge.stop_authority(gate.private, now=gate.clock)
        gate.activate()
        self.assertEqual(gate.call('op-3', value=body(model=DEEPSEEK))['status'], 200)
        self.assertEqual(gate.status()['enabled_models'], [MODEL, DEEPSEEK])

    def test_activate_refuses_a_go_for_another_provider_than_the_state(self):
        with patch.dict(bridge.helper.PROFILES, {'fakevendor': FakeVendorProfile()}):
            gate = self.gate()
            gate.init()
            gate.go_path = gate.write_go(name='other-provider.json', provider='fakevendor', enabled_models=['fake/model-1'])
            with self.refused('ACTIVATION_REFUSED'):
                gate.activate()
            self.assertEqual(gate.control()['provider'], 'deepinfra')


class ModelCallTests(GateTest):
    def test_unknown_or_disabled_model_is_refused_before_reservation_and_key_read(self):
        for model in ('other/model', DEEPSEEK, MIMO, MODEL.upper()):
            with self.subTest(model=model):
                gate = self.gate().ready()
                calls = []
                with self.refused('MODEL_NOT_ALLOWED'):
                    gate.call('op-1', value=body(model=model), dispatch=lambda *args: calls.append(args),
                              key_loader=lambda _private: calls.append('key'))
                self.assertEqual(calls, [])
                self.assertIsNone(gate.day('2026-10-08'))
                self.assertEqual((gate.status()['state'], gate.status()['in_flight']), ('active', 0))
        # Pure check: no state is opened at all (the json-mode suite does the same for the shape).
        go = bridge.read_go(self.gate().go_path)
        with patch.object(bridge, 'load_go', return_value=(go, 'go-hash')), patch.object(bridge, 'TeamStore') as store, \
                self.refused('MODEL_NOT_ALLOWED'):
            bridge.execute_request(None, None, envelope(body(model=DEEPSEEK)), peer_uid=PEER, slots=bridge.CallSlots(4),
                                   dispatch=no_network, key_loader=no_network, host=HOST, platform='linux')
        store.assert_not_called()
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('MODEL_NOT_ALLOWED'))),
                         {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})

    def test_each_call_reserves_and_settles_at_its_own_row_and_the_entry_records_it(self):
        gate = self.gate(enabled_models=ALL).ready()
        usage = {'prompt_tokens': 100000, 'completion_tokens': 20000}
        # 100k in + 20k out at each row's list prices.
        expected = {MODEL: Decimal('0.025'), DEEPSEEK: Decimal('0.032'), MIMO: Decimal('0.0604')}
        for model in ALL:
            with self.subTest(model=model):
                seen = {}

                def observe(_sent, _key, model=model):
                    seen.update(gate.status())
                    return 200, {'model': model, 'usage': usage}
                value = body(model=model)
                raw = json.dumps(value)
                self.assertEqual(gate.call(model.split('/')[0], value=value, dispatch=observe)['status'], 200)
                entry = entry_of(gate, model.split('/')[0])
                maker, price_in, price_out, bound, effort, _json = ROWS[model]
                self.assertEqual({k: entry[k] for k in ('provider', 'model', 'maker', 'input_usd_per_m', 'output_usd_per_m',
                                                        'output_bound', 'requested_effort', 'reserved_usd', 'state',
                                                        'reply_model')},
                                 {'provider': 'deepinfra', 'model': model, 'maker': maker, 'input_usd_per_m': price_in,
                                  'output_usd_per_m': price_out, 'output_bound': bound,
                                  'requested_effort': effort or 'none', 'reserved_usd': str(reservation_of(raw, model)),
                                  'state': 'settled', 'reply_model': model})
                self.assertEqual(Decimal(entry['held_usd']), expected[model])
                self.assertEqual(Decimal(entry['accounting']['configured_price_cost_usd']), expected[model])
                # While in flight, the pot held exactly this row's reservation on top of what was settled.
                self.assertIn(model, seen['today_by_model'])
        status = gate.status()
        self.assertEqual(Decimal(status['today_spend_usd']), sum(expected.values()))
        self.assertEqual({m: (Decimal(v['spend_usd']), v['posts']) for m, v in status['today_by_model'].items()},
                         {m: (expected[m], 1) for m in ALL})

    def test_a_reported_cost_above_the_row_price_is_what_is_charged(self):
        gate = self.gate(enabled_models=ALL).ready()
        gate.call('op-1', value=body(model=MIMO), dispatch=lambda _s, _k: (200, {
            'model': MIMO, 'usage': {'prompt_tokens': 1000, 'completion_tokens': 1000, 'estimated_cost': '0.01'}}))
        entry = entry_of(gate, 'op-1')
        self.assertEqual((entry['held_usd'], entry['accounting']['configured_price_cost_usd']), ('0.01', '0.0013'))

    def test_a_reply_naming_another_model_than_this_calls_own_halts(self):
        for asked, named in ((DEEPSEEK, MODEL), (MODEL, DEEPSEEK), (MIMO, MIMO.lower()), (MODEL, MODEL + ' '),
                             (MODEL, None), (MODEL, 7)):
            with self.subTest(asked=asked, named=named):
                gate = self.gate(enabled_models=ALL).ready()
                with self.refused('AUTHORITY_HALTED'):
                    gate.call('op-1', value=body(model=asked), model=named, charge='0.02')
                status = gate.status()
                self.assertEqual((status['state'], status['reason']), ('halted', 'provider_error_or_model_identity'))
                entry = entry_of(gate, 'op-1')
                self.assertEqual((entry['state'], entry['held_usd'], entry['model']), ('settled', '0.02', asked))
                self.assertEqual(entry['reply_model'], named if isinstance(named, str) else None)

    def test_a_long_model_name_in_a_reply_is_not_stored(self):
        gate = self.gate().ready()
        with self.refused('AUTHORITY_HALTED'):
            gate.call('op-1', model='m' * 129)
        self.assertIsNone(entry_of(gate, 'op-1')['reply_model'])

    def test_effort_json_mode_and_token_bound_follow_each_row(self):
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        json_mode = {'type': 'json_object'}
        allowed = [body(model=MODEL), body(model=MODEL, response_format=json_mode), body(model=MODEL, max_tokens=163840),
                   body(model=DEEPSEEK), body(model=DEEPSEEK, max_tokens=131072),
                   body(model=MIMO), body(model=MIMO, max_tokens=131072)]
        refused = [{k: v for k, v in body(model=MODEL).items() if k != 'reasoning_effort'},
                   body(model=MODEL, max_tokens=163841),
                   {k: v for k, v in body(model=DEEPSEEK).items() if k != 'reasoning_effort'},
                   body(model=DEEPSEEK, reasoning_effort='medium'), body(model=DEEPSEEK, response_format=json_mode),
                   body(model=DEEPSEEK, max_tokens=131073),
                   body(model=MIMO, reasoning_effort='high'), body(model=MIMO, reasoning_effort=None),
                   body(model=MIMO, response_format=json_mode), body(model=MIMO, max_tokens=131073),
                   body(model=MIMO, max_tokens=0)]
        for value in allowed:
            with self.subTest(allowed=value):
                outgoing, reserved, row = bridge.validate_request(envelope(value), go)
                self.assertEqual((json.loads(outgoing), row.model), (value, value['model']))
                self.assertEqual(reserved, reservation_of(json.dumps(value), value['model']))
        for value in refused:
            with self.subTest(refused=value), self.refused('REQUEST_PARAMETERS_INVALID'):
                bridge.validate_request(envelope(value), go)
        self.assertNotIn('reasoning_effort', body(model=MIMO))

    def test_a_reservation_priced_as_another_row_is_refused(self):
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        value = body(model=MIMO)
        raw = json.dumps(value)
        for cheaper in (MODEL, DEEPSEEK):
            request = {**envelope(value), 'reservedUsd': str(reservation_of(raw, cheaper))}
            with self.subTest(cheaper=cheaper), self.refused('RESERVATION_MISMATCH'):
                bridge.validate_request(request, go)

    def test_typescript_nano_usd_strings_are_accepted_for_every_row(self):
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        nano = {MODEL: (150, 500, 163840), DEEPSEEK: (200, 600, 131072), MIMO: (430, 870, 131072)}
        for model, (price_in, price_out, bound) in nano.items():
            with self.subTest(model=model):
                raw = json.dumps(body(model=model), separators=(',', ':'))
                total = (len(raw.encode()) + 2048) * price_in + bound * price_out
                typescript = '%d.%09d' % (total // 10 ** 9, total % 10 ** 9)
                request = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                           'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': typescript}
                self.assertEqual(bridge.validate_request(request, go)[1], Decimal(typescript))


class RemainingTests(GateTest):
    def report(self, gate, data=Ellipsis, **kwargs):
        return bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE} if data is Ellipsis else data,
                                       now=gate.clock, **kwargs)

    def test_reply_has_exactly_the_contract_shape(self):
        gate = self.gate().ready()
        gate.call('op-1', charge='0.05')
        self.assertEqual(self.report(gate, slots=gate.slots), {
            'state': 'active', 'window_open': True, 'remaining_usd': '4.95', 'remaining_calls': 499,
            'max_concurrent_calls': 4, 'largest_reservation_usd': '0.1215488', 'enabled_models': [MODEL]})
        gate = self.gate(enabled_models=[MODEL, MIMO]).ready()
        self.assertEqual((self.report(gate)['largest_reservation_usd'], self.report(gate)['remaining_usd']),
                         ('0.2276352', '5.00'))

    def test_it_never_writes_creates_or_reads_the_key(self):
        gate = self.gate().ready()
        gate.call('op-1')
        before = gate.snapshot()
        opened, real_open = [], os.open

        def recording_open(path, flags, *args, **kwargs):
            opened.append((os.path.basename(str(path)), flags))
            return real_open(path, flags, *args, **kwargs)
        with patch.object(os, 'open', recording_open), patch.object(bridge.helper, 'read_key', no_network), \
                patch.object(bridge.helper, 'write_bytes', no_network):
            self.report(gate)
            gate.clock.set('2026-10-09T09:00:00+00:00')  # A new day: its ledger is not created either.
            self.assertEqual(self.report(gate)['remaining_usd'], '5.00')
        self.assertEqual(gate.snapshot(), before)
        self.assertTrue(opened)
        for name, flags in opened:
            self.assertEqual(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC), 0, name)
            self.assertNotEqual(name, 'api-key.txt')

    def test_wrong_scope_or_any_other_input_is_refused(self):
        gate = self.gate().ready()
        for data in ({'scope_id': 'other-scope'}, {}, {'scope_id': SCOPE, 'extra': 1}, {'scope': SCOPE},
                     {'scope_id': 7}, [SCOPE], SCOPE, None):
            with self.subTest(data=data), self.refused('REMAINING_REQUEST_INVALID'):
                self.report(gate, data)
        with self.refused('STATE_MISSING'):
            self.report(self.gate())

    def test_window_open_is_false_whenever_a_call_could_not_be_reserved_now(self):
        gate = self.gate().ready()
        self.assertTrue(self.report(gate, slots=gate.slots)['window_open'])
        self.assertFalse(self.report(gate, slots=bridge.CallSlots(8))['window_open'])  # Restart awaited.
        tripped = bridge.CallSlots(4)
        tripped.trip()
        self.assertFalse(self.report(gate, slots=tripped)['window_open'])  # Stopping.
        original = gate.go_path.read_text()
        gate.write_go(daily_budget_usd='6.00')  # On disk but not activated.
        self.assertFalse(self.report(gate)['window_open'])
        gate.go_path.write_text('{')
        self.assertFalse(self.report(gate)['window_open'])
        gate.go_path.write_text(original)
        self.assertTrue(self.report(gate)['window_open'])
        bridge.stop_authority(gate.private, now=gate.clock)
        self.assertEqual((self.report(gate)['state'], self.report(gate)['window_open']), ('halted', False))
        gate.activate()
        gate.clock.set('2026-10-15T09:00:00+00:00')
        self.assertEqual((self.report(gate)['state'], self.report(gate)['window_open']), ('active', False))
        fresh = self.gate()
        fresh.init()
        self.assertEqual((self.report(fresh)['state'], self.report(fresh)['window_open']), ('initialized', False))

    def test_remaining_money_and_calls_never_go_below_zero(self):
        gate = self.gate(daily_budget_usd='0.13', max_concurrent_calls=1, max_paid_posts_per_day=1).ready()
        with self.refused('AUTHORITY_HALTED'):
            gate.call('op-1', charge='0.20')  # An overrun: settled above the pot (and halts).
        report = self.report(gate)
        self.assertEqual((report['remaining_usd'], report['remaining_calls']), ('0', 0))

    def exchange(self, gate, data, path='/remaining', uid=PEER, remaining=True):
        server_side, client_side = socket.socketpair()
        payload = json.dumps(data).encode()
        client_side.sendall(b'POST ' + path.encode() + b' HTTP/1.0\r\nContent-Type: application/json\r\n'
                            b'Content-Length: ' + str(len(payload)).encode() + b'\r\n\r\n' + payload)

        def answer(request):
            return bridge.remaining_report(gate.private, gate.go_path, request, slots=gate.slots, now=gate.clock)
        handler = bridge.make_handler(gate.private, [PEER], no_network, gate.slots, peer_uid_of=lambda _c: uid,
                                      now=gate.clock, remaining=answer if remaining else None)
        thread = threading.Thread(target=handler, args=(server_side, '', types.SimpleNamespace()))
        thread.start()
        thread.join(10)
        server_side.close()
        raw = b''
        while True:
            chunk = client_side.recv(65536)
            if not chunk:
                break
            raw += chunk
        client_side.close()
        head, _, reply = raw.partition(b'\r\n\r\n')
        return head.split(b'\r\n')[0], json.loads(reply)

    def test_ipc_answers_the_allowed_peers_only_and_writes_nothing(self):
        gate = self.gate().ready()
        gate.call('op-1', charge='0.05')
        before = gate.snapshot()
        line, reply = self.exchange(gate, {'scope_id': SCOPE})
        self.assertEqual(line, b'HTTP/1.0 200 OK')
        self.assertEqual(reply, self.report(gate, slots=gate.slots))
        stopped = {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'}
        for kwargs in ({'uid': 7}, {'data': {'scope_id': 'other-scope'}}, {'data': {'scope_id': SCOPE, 'x': 1}},
                       {'data': {'scope_id': 'x' * 5000}}, {'remaining': False}):
            with self.subTest(kwargs=kwargs):
                data = kwargs.pop('data', {'scope_id': SCOPE})
                self.assertEqual(self.exchange(gate, data, **kwargs), (b'HTTP/1.0 409 Conflict', stopped))
        self.assertEqual(gate.snapshot(), before)
        self.assertEqual(gate.status()['state'], 'active')

    def test_serve_wires_remaining_to_the_same_socket_and_uid_list(self):
        source = SOURCE.read_text()
        self.assertIn("if self.path == '/remaining':", source)
        self.assertIn('remaining_report(private, go_path, data, slots=slots)', source)
        self.assertIn('make_handler(private, go[\'allowed_peer_uids\'], execute, slots,', source)


class ProbeTests(GateTest):
    def probe(self, gate, model, dispatch=None, **kwargs):
        options = {'dispatch': dispatch or (lambda sent, _key: (200, provider_response('0.0004', json.loads(sent)['model'],
                                                                                         content='OK'))),
                   'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux', 'uid': 0, 'now': gate.clock}
        options.update(kwargs)
        return bridge.probe(gate.private, gate.go_path, model, **options)

    def test_probe_reaches_a_reviewed_model_the_go_does_not_enable_yet(self):
        for model in (DEEPSEEK, MIMO, MODEL):
            with self.subTest(model=model):
                gate = self.gate().ready()  # GLM only.
                sent = []

                def dispatch(request, key, model=model):
                    sent.append((json.loads(request), key))
                    return 200, {'model': model, 'choices': [{'message': {'content': 'OK'}}],
                                 'usage': {'prompt_tokens': 12, 'completion_tokens': 30,
                                           'completion_tokens_details': {'reasoning_tokens': 20}}}
                summary = self.probe(gate, model, dispatch)
                expected_body = {'model': model, 'max_tokens': 1024,
                                 'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
                if ROWS[model][4] == 'high':
                    expected_body['reasoning_effort'] = 'high'
                self.assertEqual(sent, [(expected_body, KEY)])
                self.assertEqual({k: summary[k] for k in ('status', 'model', 'http_status', 'model_echoed_exactly',
                                                          'entry_state', 'halt_reason', 'authority', 'reply_excerpt')},
                                 {'status': 'probed', 'model': model, 'http_status': 200, 'model_echoed_exactly': True,
                                  'entry_state': 'settled', 'halt_reason': None, 'authority': 'active',
                                  'reply_excerpt': 'OK'})
                self.assertEqual((summary['usage']['prompt_tokens'], summary['usage']['reasoning_tokens']), (12, 20))
                self.assertEqual(Decimal(summary['guard_charge_usd']),
                                 (12 * Decimal(ROWS[model][1]) + 30 * Decimal(ROWS[model][2])) / Decimal(1000000))
                entry = [e for e in gate.day('2026-10-08')['entries'].values()][0]
                self.assertEqual((entry['probe'], entry['peer_uid'], entry['model']), (True, 0, model))
                self.assertEqual(gate.status()['enabled_models'], [MODEL])  # The probe enables nothing.
                with self.refused('MODEL_NOT_ALLOWED') if model != MODEL else contextlib.nullcontext():
                    gate.call('after', value=body(model=model))  # Still refused over IPC unless enabled.

    def test_probe_refuses_an_unreviewed_model_before_anything(self):
        gate = self.gate().ready()
        for model in ('other/model', MODEL.lower(), '', 'fake/model-1'):
            with self.subTest(model=model), self.refused('MODEL_NOT_REVIEWED'):
                self.probe(gate, model, dispatch=no_network, key_loader=no_network)
        self.assertIsNone(gate.day('2026-10-08'))

    def test_probe_refuses_unless_root_on_linux_on_the_target_host(self):
        gate = self.gate().ready()
        for kwargs in ({'uid': 994}, {'platform': 'darwin'}, {'host': 'other-host'}):
            with self.subTest(kwargs=kwargs), self.refused('ROOT_PROBE_REFUSED'):
                self.probe(gate, DEEPSEEK, dispatch=no_network, key_loader=no_network, **kwargs)
        self.assertIsNone(gate.day('2026-10-08'))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):  # This test runs as the developer, not root.
            code = bridge.main(['probe', '--private', str(gate.private), '--go', str(gate.go_path), '--model', DEEPSEEK])
        self.assertEqual((code, json.loads(out.getvalue())['error']), (2, 'ROOT_PROBE_REFUSED'))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = bridge.main(['probe', '--private', str(gate.private), '--go', str(gate.go_path)])
        self.assertEqual((code, json.loads(out.getvalue())['error']), (2, 'MODEL_REQUIRED'))

    def test_probe_halts_like_any_call_and_still_prints_what_it_measured(self):
        cases = {'other_model': (200, {'model': MODEL, 'choices': [{'message': {'content': 'OK'}}],
                                       'usage': {'prompt_tokens': 1, 'completion_tokens': 1}}),
                 'rejected': (400, {'error': {'message': 'reasoning_effort\nis not supported for this model'},
                                    'usage': {'prompt_tokens': 0, 'completion_tokens': 0}})}
        for name, (status, response) in cases.items():
            with self.subTest(name):
                gate = self.gate().ready()
                summary = self.probe(gate, DEEPSEEK, lambda _s, _k, r=response, c=status: (c, r))
                self.assertEqual((summary['halt_reason'], summary['authority'], gate.status()['state']),
                                 ('provider_error_or_model_identity', 'halted', 'halted'))
                self.assertEqual(summary['http_status'], status)
                self.assertEqual(summary['model_echoed_exactly'], False)
                if name == 'rejected':
                    self.assertEqual(summary['reply_excerpt'], 'reasoning_effort is not supported for this model')

    def test_probe_output_never_holds_the_key_or_more_than_a_short_excerpt(self):
        gate = self.gate().ready()
        long_answer = 'OK ' + KEY + ' ' + 'y' * 5000
        summary = self.probe(gate, MIMO, lambda _s, _k: (200, provider_response('0.0004', MIMO, content=long_answer)))
        text = json.dumps(summary)
        self.assertNotIn(KEY, text)
        self.assertNotIn(KEY, self.out.getvalue())
        self.assertLessEqual(len(summary['reply_excerpt']), bridge.PROBE_EXCERPT_CHARS)
        self.assertTrue(summary['reply_excerpt'].startswith('OK [REDACTED]'))
        self.assertLess(len(text), 2000)

    def test_probe_is_refused_by_a_halted_gate_and_an_unsent_probe_fails_alone(self):
        gate = self.gate().ready()

        def unsent(_body, _key):
            raise bridge.helper.RequestNotSent('request_not_sent')
        with self.refused('PROVIDER_NOT_REACHED'):
            self.probe(gate, DEEPSEEK, unsent)
        self.assertEqual((gate.status()['state'], gate.status()['today_posts']), ('active', 0))
        bridge.stop_authority(gate.private, now=gate.clock)
        with self.refused('AUTHORITY_STOPPED'):
            self.probe(gate, DEEPSEEK, no_network)

    def test_probe_counts_in_the_pot_and_the_daily_call_limit(self):
        gate = self.gate(max_paid_posts_per_day=1).ready()
        self.probe(gate, DEEPSEEK)
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            gate.call('op-1')
        self.assertEqual(gate.status()['today_by_model'], {DEEPSEEK: {'spend_usd': '0.0004', 'posts': 1}})


class ProfileTests(GateTest):
    def test_transport_takes_host_path_and_auth_header_from_the_profile(self):
        sent = []

        class Response:
            status = 200

            def __init__(self):
                self.chunks = [b'{"model": "m"}']

            def read(self, _size):
                return self.chunks.pop() if self.chunks else b''

        class Connection:
            def __init__(self, host, timeout, context):
                self.host, self.sock = host, None

            def connect(self):
                sent.append(self.host)

            def request(self, method, path, body, headers):
                sent.append((method, path, body, headers))

            def getresponse(self):
                return Response()

            def close(self):
                pass
        with patch.object(bridge.helper.http.client, 'HTTPSConnection', Connection):
            _HTTPS(timeout=5, profile=DEEPINFRA)(b'{}', KEY)
            _HTTPS(timeout=5, profile=FakeVendorProfile())(b'{}', KEY)
        self.assertEqual(sent, [
            'api.deepinfra.com', ('POST', '/v1/openai/chat/completions', b'{}',
                                  {'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json',
                                   'Accept': 'application/json'}),
            'api.fakevendor.invalid', ('POST', '/v1/chat', b'{}',
                                       {'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json',
                                        'Accept': 'application/json'})])

    def test_a_profile_path_with_a_query_or_no_leading_slash_is_refused(self):
        for path in ('/v1/x?key=abc', 'v1/x'):
            profile = FakeVendorProfile()
            profile.path = path
            with self.subTest(path=path), self.refused('profile_path_invalid'):
                _HTTPS(timeout=5, profile=profile)

    def test_redaction_blanks_the_key_bearer_tokens_and_the_profile_key_shapes(self):
        value = {'a': 'x ' + KEY, 'b': ['Bearer abc.def'], 'c': 'leak fk-ABCDEFGH12 end', 'x-api-key': 'k',
                 'x-goog-api-key': 'k'}
        self.assertEqual(bridge.helper.redact(value, KEY, FakeVendorProfile.redaction_patterns),
                         {'a': 'x [REDACTED]', 'b': ['Bearer [REDACTED]'], 'c': 'leak [REDACTED] end'})
        self.assertEqual(DEEPINFRA.redaction_patterns, ())

    def test_a_new_profile_runs_end_to_end_without_changing_the_gate(self):
        # The fixture's independent price list learns the fake row too, so its envelopes reserve right.
        with patch.dict(bridge.helper.PROFILES, {'fakevendor': FakeVendorProfile()}), \
                patch.dict(ROWS, {'fake/model-1': ('FakeMaker', '0.10', '0.20', 4096, None, False)}):
            gate = self.gate(provider='fakevendor', enabled_models=['fake/model-1']).ready()
            value = {'model': 'fake/model-1', 'max_tokens': 100, 'messages': [{'role': 'user', 'content': 'hi'}]}
            redacted = []

            def dispatch(_sent, _key):
                return 200, {'model': 'fake/model-1', 'usage': {'prompt_tokens': 10, 'completion_tokens': 10},
                             'choices': [{'message': {'content': 'token fk-ABCDEFGH12'}}]}
            reply = gate.call('op-1', value=value, dispatch=dispatch)
            redacted.append(reply['body'])
            entry = entry_of(gate, 'op-1')
            self.assertEqual((entry['provider'], entry['maker'], entry['state']), ('fakevendor', 'FakeMaker', 'settled'))
            self.assertNotIn('fk-ABCDEFGH12', redacted[0])
            with self.refused('MODEL_NOT_ALLOWED'):
                gate.call('op-2', value=body())  # A DeepInfra row is not this profile's row.

    def test_reserved_provider_names_have_no_profile_yet(self):
        self.assertEqual(set(bridge.helper.PROFILES), {'deepinfra'})


if __name__ == '__main__':
    unittest.main()
