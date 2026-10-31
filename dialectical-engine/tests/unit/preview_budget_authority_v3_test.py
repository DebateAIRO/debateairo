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
import time
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import (  # noqa: E402
    DEEPSEEK, HELPER_SOURCE, file_sha, HOST, KEY, MIMO, MODEL, PEER, QWEN, RESERVED, ROWS, SAMPLING, SCOPE, SOURCE, Gate, body, envelope,
    go_document,
    load_bridge, provider_response, reservation_of)

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
DEEPINFRA = bridge.helper.PROFILES['deepinfra']
_HTTPS = bridge.helper.HttpsTransport
PARITY = Path(__file__).resolve().parent / 'fixtures/preview-model-rows.json'
SAMPLING_BODIES = Path(__file__).resolve().parent / 'fixtures/deepinfra-sampling-bodies.json'
ALL = [MODEL, DEEPSEEK, MIMO, QWEN]


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


def unreached(_sent, _key):
    raise bridge.helper.RequestNotSent('request_not_sent')


def later(gate, seconds):
    gate.clock.set(bridge.iso(gate.clock() + bridge.timedelta(seconds=seconds)))


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
                                                   4096, (None,), False)}


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
                         ('deepinfra', bridge.RESERVATION_OVERHEAD_BYTES, DEEPINFRA.max_request_bytes, DEEPINFRA.per_call_cap_usd))
        self.assertEqual([row['model'] for row in parity['rows']], list(DEEPINFRA.rows))
        for expected in parity['rows']:
            with self.subTest(model=expected['model']):
                row = DEEPINFRA.rows[expected['model']]
                self.assertEqual({'model': row.model, 'maker': row.maker, 'input_usd_per_m': str(row.input_usd_per_m),
                                  'output_usd_per_m': str(row.output_usd_per_m),
                                  'input_nano_usd_per_token': int(row.input_usd_per_m * 1000),
                                  'output_nano_usd_per_token': int(row.output_usd_per_m * 1000),
                                  'output_bound': row.output_bound,
                                  'efforts': ['default' if word is None else word for word in row.efforts],
                                  'json_object': row.json_object,
                                  'sampling': dict(row.sampling) if row.sampling is not None else None,
                                  'worst_case_reservation_usd': '%.9f' % bridge.worst_case_reservation(DEEPINFRA, row)},
                                 expected)
                # The fixture's own rows also equal the independent copy the other tests use.
                self.assertEqual(ROWS[row.model], (row.maker, str(row.input_usd_per_m), str(row.output_usd_per_m),
                                                   row.output_bound, row.efforts, row.json_object))

    def test_every_reviewed_row_fits_the_per_call_cap_for_a_full_size_request(self):
        # Owner rulings 2026-10-10: a hard 256 KiB body cap and output bound 32768 for every row.
        self.assertEqual((DEEPINFRA.per_call_cap_usd, DEEPINFRA.max_request_bytes), (Decimal('0.25'), 256 * 1024))
        self.assertEqual({row.output_bound for row in DEEPINFRA.rows.values()}, {32768})
        self.assertLessEqual(DEEPINFRA.per_call_cap_usd, bridge.MAX_PROFILE_CALL_CAP_USD)
        expected = {MODEL: Decimal('0.0560128'), DEEPSEEK: Decimal('0.0724992'), MIMO: Decimal('0.14211072'),
                    QWEN: Decimal('0.042371072')}
        for name, profile in bridge.helper.PROFILES.items():
            for model, row in profile.rows.items():
                with self.subTest(provider=name, model=model):
                    worst = bridge.worst_case_reservation(profile, row)
                    self.assertLessEqual(worst, profile.per_call_cap_usd)
                    self.assertTrue(bridge.row_reviewed(profile, model, row))
                    if name == 'deepinfra':
                        self.assertEqual(worst, expected[model])
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        for model in ALL:  # A real request of exactly 256 KiB reserves exactly the worst case.
            with self.subTest(model=model):
                _, reserved, _, _ = bridge.validate_request(envelope(sized_body(model, DEEPINFRA.max_request_bytes)), go)
                self.assertEqual(reserved, expected[model])
                with self.refused('REQUEST_SCOPE_INVALID'):
                    bridge.validate_request(envelope(sized_body(model, DEEPINFRA.max_request_bytes + 1)), go)

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
                  'effort_max': glm._replace(efforts=('high', 'max')),
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
        # GLM worst case 0.0560128 (x4 = 0.2240512); MiMo 0.14211072 (x4 = 0.56844288);
        # DeepSeek 0.0724992 (x4 = 0.2899968).
        for enabled, budget, ok in (([MODEL], '0.22', False), ([MODEL], '0.23', True),
                                    ([MODEL, MIMO], '0.56', False), ([MODEL, MIMO], '0.57', True),
                                    ([MODEL, DEEPSEEK], '0.28', False), ([MODEL, DEEPSEEK], '0.29', True)):
            with self.subTest(enabled=enabled, budget=budget):
                gate = self.gate(enabled_models=enabled, daily_budget_usd=budget)
                gate.init()  # init does not judge the pot; activate does.
                if ok:
                    self.assertEqual(gate.activate()['state'], 'active')
                else:
                    with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
                        gate.activate()
                    self.assertEqual(gate.control()['state'], 'initialized')
        gate = self.gate(enabled_models=[MIMO], daily_budget_usd='0.14', max_concurrent_calls=1)
        gate.init()
        with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
            gate.activate()

    def test_ten_at_once_is_the_v3_bound_and_eleven_is_refused(self):
        # Owner ruling 2026-10-10: "10 at once" for the DeepInfra gate.
        self.assertEqual(bridge.MAX_CONCURRENT_CALLS, 10)
        gate = self.gate()
        for limit in (1, 9, 10):
            with self.subTest(limit=limit):
                self.assertEqual(bridge.read_go(gate.write_go(name='ok.json', max_concurrent_calls=limit))
                                 ['max_concurrent_calls'], limit)
        for limit in (0, 11, 12, 100, True, 10.0, '10'):
            with self.subTest(limit=limit), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', max_concurrent_calls=limit))
        # The pot check still holds at 10: 10 x MiMo's worst case (0.14211072) = 1.4211072, which
        # the owner's $10.00 DeepInfra pot (ruling 2026-10-10) holds.
        for budget, ok in (('1.42', False), ('1.43', True), ('10.00', True)):
            with self.subTest(budget=budget):
                gate = self.gate(enabled_models=ALL, daily_budget_usd=budget, max_concurrent_calls=10)
                gate.init()
                if ok:
                    self.assertEqual(gate.activate()['state'], 'active')
                else:
                    with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
                        gate.activate()
        # Ten slots really serve ten calls at once (the serve side takes the GO's figure).
        gate = self.gate(max_concurrent_calls=10).ready()
        self.assertEqual(gate.slots.limit, 10)
        self.assertEqual(bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots,
                                                 now=gate.clock)['max_concurrent_calls'], 10)

    def test_a_v2_go_is_refused_whatever_its_concurrency_so_v2s_own_bound_of_8_is_untouched(self):
        # Gate v2 runs its own installed bytes (bound by its GO's hashes) with max_concurrent_calls
        # 1 to 8. This code has no v2 path: a v2 GO with 9 (or the new 10) is refused here too.
        gate = self.gate()
        v2 = {**{k: v for k, v in gate.go.items() if k not in ('provider', 'enabled_models')},
              'schema': 'preview-provider-budget-go-v2', 'model': MODEL, 'requested_effort': 'high'}
        path = gate.root / 'v2.json'
        for limit in (8, 9, 10):
            with self.subTest(limit=limit), self.refused('ROOT_GO_INVALID'):
                path.write_text(json.dumps({**v2, 'max_concurrent_calls': limit}))
                bridge.read_go(path)

    def test_the_serve_socket_backlog_holds_every_slot_at_once(self):
        # socketserver's default listen backlog is 5; ten callers connecting together must all queue.
        self.assertGreaterEqual(bridge.UnixThreadingServer.request_queue_size, bridge.MAX_CONCURRENT_CALLS + 1)
        self.assertEqual(bridge.UnixThreadingServer.request_queue_size, bridge.MAX_IPC_CONNECTIONS)

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
        # Side-by-side spec §9: refused before any reservation, so the caller is told this model is not served by this GO.
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('MODEL_NOT_ALLOWED'))),
                         {'error': 'MODEL_NOT_ALLOWED'})

    def test_each_call_reserves_and_settles_at_its_own_row_and_the_entry_records_it(self):
        gate = self.gate(enabled_models=ALL).ready()
        usage = {'prompt_tokens': 10000, 'completion_tokens': 5000}
        # 10k in + 5k out at each row's list prices (under each row's reservation for this small body).
        expected = {MODEL: Decimal('0.004'), DEEPSEEK: Decimal('0.005'), MIMO: Decimal('0.00865'), QWEN: Decimal('0.00304')}
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
                maker, price_in, price_out, bound, efforts, _json = ROWS[model]
                self.assertEqual({k: entry[k] for k in ('provider', 'model', 'maker', 'reserve_input_usd_per_m',
                                                        'reserve_output_usd_per_m', 'settle_input_usd_per_m',
                                                        'settle_output_usd_per_m', 'output_bound', 'requested_effort',
                                                        'reserved_usd', 'state', 'reply_model')},
                                 {'provider': 'deepinfra', 'model': model, 'maker': maker, 'reserve_input_usd_per_m': price_in,
                                  'reserve_output_usd_per_m': price_out, 'settle_input_usd_per_m': price_in,
                                  'settle_output_usd_per_m': price_out, 'output_bound': bound,
                                  # Spec 2026-10-12 section 4.5: the level the body carried (body(): the row's default).
                                  'requested_effort': 'default' if efforts[0] is None else efforts[0], 'reserved_usd': str(reservation_of(raw, model)),
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
                with self.refused('SETTLED_INTO_HALT'):
                    gate.call('op-1', value=body(model=asked), model=named, charge='0.01')
                status = gate.status()
                self.assertEqual((status['state'], status['reason']), ('halted', 'provider_error_or_model_identity'))
                entry = entry_of(gate, 'op-1')
                self.assertEqual((entry['state'], entry['held_usd'], entry['model']), ('settled', '0.01', asked))
                self.assertEqual(entry['reply_model'], named if isinstance(named, str) else None)

    def test_a_long_model_name_in_a_reply_is_not_stored(self):
        gate = self.gate().ready()
        with self.refused('SETTLED_INTO_HALT'):
            gate.call('op-1', model='m' * 129)
        self.assertIsNone(entry_of(gate, 'op-1')['reply_model'])

    def test_effort_json_mode_and_token_bound_follow_each_row(self):
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        json_mode = {'type': 'json_object'}
        # Owner ruling 2026-10-10: max_tokens is at most 32768 for every row; 32769 is refused.
        allowed = [body(model=MODEL), body(model=MODEL, response_format=json_mode), body(model=MODEL, max_tokens=32768),
                   body(model=DEEPSEEK), body(model=DEEPSEEK, max_tokens=32768),
                   body(model=MIMO), body(model=MIMO, max_tokens=32768),
                   body(model=QWEN), body(model=QWEN, max_tokens=32768)]
        refused = [body(model=model, max_tokens=32769) for model in ALL] + [
                   {k: v for k, v in body(model=MODEL).items() if k != 'reasoning_effort'},
                   body(model=MODEL, max_tokens=163840),
                   {k: v for k, v in body(model=DEEPSEEK).items() if k != 'reasoning_effort'},
                   body(model=DEEPSEEK, reasoning_effort='medium'), body(model=DEEPSEEK, response_format=json_mode),
                   body(model=DEEPSEEK, max_tokens=131072),
                   body(model=MIMO, reasoning_effort='high'), body(model=MIMO, reasoning_effort=None),
                   body(model=MIMO, response_format=json_mode), body(model=MIMO, response_format={'type': 'json_schema'}),
                   body(model=MIMO, max_tokens=131072),
                   body(model=MIMO, max_tokens=0)]
        for value in allowed:
            with self.subTest(allowed=value):
                outgoing, reserved, row, prices = bridge.validate_request(envelope(value), go)
                self.assertEqual(prices, (DEEPINFRA.rows[value['model']].input_usd_per_m,
                                          DEEPINFRA.rows[value['model']].output_usd_per_m))
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
        nano = {MODEL: (150, 500, 32768), DEEPSEEK: (200, 600, 32768), MIMO: (430, 870, 32768), QWEN: (113, 382, 32768)}
        for model, (price_in, price_out, bound) in nano.items():
            with self.subTest(model=model):
                raw = json.dumps(body(model=model), separators=(',', ':'))
                total = (len(raw.encode()) + 2048) * price_in + bound * price_out
                typescript = '%d.%09d' % (total // 10 ** 9, total % 10 ** 9)
                request = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                           'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': typescript}
                self.assertEqual(bridge.validate_request(request, go)[1], Decimal(typescript))


# Length guidance LG-B (L26, L29, 2026-10-15): the final-writer tier, written out independently of the gate.
MIB = 1024 * 1024
FW_BOUNDS = {MODEL: 131072, DEEPSEEK: 131072, MIMO: 65536, QWEN: 131072}
FW_WORST = {MODEL: Decimal('0.2231296'), DEEPSEEK: Decimal('0.288768'), MIMO: Decimal('0.50878464'), QWEN: Decimal('0.168790016')}


def fw_reservation_of(raw, model):
    _maker, price_in, price_out, _bound, _efforts, _json = ROWS[model]
    return (Decimal(len(raw.encode()) + 2048) * Decimal(price_in) + Decimal(FW_BOUNDS[model]) * Decimal(price_out)) / Decimal(1000000)


def fw_envelope(value, operation_id='fw-1', tier='FINAL_WRITER'):
    raw = json.dumps(value)
    return {**envelope(value, operation_id), 'reservedUsd': str(fw_reservation_of(raw, value['model'])), 'callTier': tier}


def fw_sized(model, size):
    value = body(model=model, max_tokens=FW_BOUNDS[model], messages=[{'role': 'user', 'content': ''}])
    value['messages'][0]['content'] = 'x' * (size - len(json.dumps(value).encode()))
    assert len(json.dumps(value).encode()) == size
    return value


class FinalWriterTierTests(GateTest):
    def fw_gate(self, **changes):
        gate = self.gate(**{'enabled_models': ALL, 'max_final_writer_calls': 1, **changes}).ready()
        gate.slots = bridge.CallSlots(gate.go['max_concurrent_calls'], 1)
        return gate

    def options(self, gate):
        return {'peer_uid': PEER, 'slots': gate.slots, 'key_loader': lambda _private: KEY, 'host': HOST,
                'platform': 'linux', 'now': gate.clock, 'slot_wait': 0.2}

    def test_each_row_has_its_final_writer_bound_and_a_full_size_final_writer_request_fits_its_cap(self):
        parity = json.loads(PARITY.read_text())['final_writer']
        self.assertEqual((DEEPINFRA.final_writer_max_request_bytes, DEEPINFRA.final_writer_per_call_cap_usd), (MIB, Decimal('0.75')))
        self.assertEqual((parity['request_bytes'], Decimal(parity['per_call_cap_usd'])),
                         (DEEPINFRA.final_writer_max_request_bytes, DEEPINFRA.final_writer_per_call_cap_usd))
        self.assertEqual([(r['model'], r['output_bound'], r['worst_case_reservation_usd']) for r in parity['rows']],
                         [(m, row.final_writer_output_bound, '%.9f' % bridge.worst_case_reservation(DEEPINFRA, row, 'FINAL_WRITER'))
                          for m, row in DEEPINFRA.rows.items()])
        for model in ALL:
            with self.subTest(model=model):
                row = DEEPINFRA.rows[model]
                self.assertEqual(row.final_writer_output_bound, FW_BOUNDS[model])
                self.assertEqual(bridge.worst_case_reservation(DEEPINFRA, row, 'FINAL_WRITER'), FW_WORST[model])
                self.assertLessEqual(FW_WORST[model], DEEPINFRA.final_writer_per_call_cap_usd)
                # The standard worst case stays today's figure.
                self.assertEqual(bridge.worst_case_reservation(DEEPINFRA, row),
                                 bridge.reservation_for(DEEPINFRA.max_request_bytes, row, DEEPINFRA.ceiling_prices(row)))
                self.assertTrue(bridge.row_reviewed(DEEPINFRA, model, row))

    def test_a_1_mib_final_writer_request_is_reserved_at_the_final_writer_bound_and_one_byte_more_is_refused(self):
        go = bridge.read_go(self.fw_gate().go_path)
        for model in ALL:
            with self.subTest(model=model):
                outgoing, reserved, row, _prices = bridge.validate_request(fw_envelope(fw_sized(model, MIB)), go)
                self.assertEqual((reserved, row.output_bound, row.model), (FW_WORST[model], FW_BOUNDS[model], model))
                self.assertEqual(json.loads(outgoing)['max_tokens'], FW_BOUNDS[model])
                with self.refused('REQUEST_SCOPE_INVALID'):
                    bridge.validate_request(fw_envelope(fw_sized(model, MIB + 1)), go)

    def test_the_final_writer_tier_is_refused_where_it_does_not_apply(self):
        plain = bridge.read_go(self.gate(enabled_models=ALL).go_path)  # A GO that names no final-writer calls.
        with self.refused('PREVIEW_CALL_TIER_INVALID'):
            bridge.validate_request(fw_envelope(body(model=DEEPSEEK, max_tokens=131072)), plain)
        go = bridge.read_go(self.fw_gate().go_path)
        with self.refused('PREVIEW_CALL_TIER_INVALID'):
            bridge.validate_request(fw_envelope(body(model=DEEPSEEK), tier='BIG'), go)
        with self.refused('PREVIEW_CALL_TIER_INVALID'):
            bridge.validate_request(fw_envelope(body(model=DEEPSEEK)), go, probe=True)
        with self.refused('REQUEST_PARAMETERS_INVALID'):  # Over the row's own maximum.
            bridge.validate_request(fw_envelope(body(model=DEEPSEEK, max_tokens=131073)), go)
        with self.refused('REQUEST_PARAMETERS_INVALID'):  # A final writer's ask without the tier.
            bridge.validate_request(envelope(body(model=DEEPSEEK, max_tokens=131072)), go)
        standard = json.dumps(body(model=DEEPSEEK))
        with self.refused('RESERVATION_MISMATCH'):  # Priced as a standard call while declaring the tier.
            bridge.validate_request({**fw_envelope(body(model=DEEPSEEK)), 'reservedUsd': str(reservation_of(standard, DEEPSEEK))}, go)
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.validate_request({**fw_envelope(body(model=DEEPSEEK)), 'other': 1}, go)

    def test_a_standard_request_is_the_same_with_or_without_the_tier_key(self):
        go = bridge.read_go(self.fw_gate().go_path)
        value = body(model=MIMO)
        self.assertEqual(bridge.validate_request(envelope(value), go),
                         bridge.validate_request({**envelope(value), 'callTier': 'STANDARD'}, go))
        self.assertEqual(bridge.request_tier(envelope(value)), 'STANDARD')
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.validate_request({**envelope(sized_body(MIMO, DEEPINFRA.max_request_bytes + 1)), 'callTier': 'STANDARD'}, go)

    def test_one_final_writer_call_at_a_time_and_its_entry_names_the_tier(self):
        gate = self.fw_gate()
        options = self.options(gate)
        answered = lambda _sent, _key: (200, provider_response(model=DEEPSEEK))  # noqa: E731

        def first(_sent, _key):
            with self.refused('CONCURRENCY_LIMIT_REACHED'):
                bridge.execute_request(gate.private, gate.go_path, fw_envelope(body(model=DEEPSEEK, max_tokens=131072), 'fw-2'),
                                       dispatch=no_network, **options)
            # A standard call still goes through beside it.
            bridge.execute_request(gate.private, gate.go_path, envelope(body(model=DEEPSEEK), 'std-1'), dispatch=answered, **options)
            return answered(_sent, _key)
        bridge.execute_request(gate.private, gate.go_path, fw_envelope(body(model=DEEPSEEK, max_tokens=131072), 'fw-1'),
                               dispatch=first, **options)
        entry = entry_of(gate, 'fw-1')
        self.assertEqual((entry['call_tier'], entry['output_bound'], entry['state']), ('FINAL_WRITER', 131072, 'settled'))
        self.assertNotIn('call_tier', entry_of(gate, 'std-1'))
        self.assertNotIn('preview-test:' + SCOPE + ':fw-2', gate.day('2026-10-08')['entries'])
        # Its slot is free again once it settled.
        bridge.execute_request(gate.private, gate.go_path, fw_envelope(body(model=DEEPSEEK, max_tokens=131072), 'fw-3'),
                               dispatch=answered, **options)
        self.assertEqual(entry_of(gate, 'fw-3')['state'], 'settled')
        with self.subTest('an unreported charge is booked at the final-writer hold (Task 4b, M3)'):
            # No usage, a reported cost above this body's standard hold but within its final-writer hold: booked at the
            # hold the call took, the tier's (at the standard hold the hook would see a cost above it and halt).
            value = body(model=DEEPSEEK, max_tokens=131072)
            hold = fw_reservation_of(json.dumps(value), DEEPSEEK)
            standard_hold = reservation_of(json.dumps(body(model=DEEPSEEK, max_tokens=131072)), DEEPSEEK)
            self.assertLess(standard_hold, Decimal('0.05'))
            self.assertLess(Decimal('0.05'), hold)
            with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                bridge.execute_request(gate.private, gate.go_path, fw_envelope(value, 'fw-4'),
                                       dispatch=lambda _sent, _key: (200, {'model': DEEPSEEK, 'usage': {'estimated_cost': '0.05'}}),
                                       **options)
            entry = entry_of(gate, 'fw-4')
            self.assertEqual((entry['state'], entry['reason'], entry['call_tier'], Decimal(entry['held_usd']),
                              Decimal(entry['reserved_usd'])), ('settled_reserved_max', 'charge_unreported', 'FINAL_WRITER', hold, hold))
            self.assertEqual(gate.status()['state'], 'active')
            # Its final-writer slot is free again too.
            bridge.execute_request(gate.private, gate.go_path, fw_envelope(value, 'fw-5'), dispatch=answered, **options)
            self.assertEqual(entry_of(gate, 'fw-5')['state'], 'settled')
        with self.subTest('a final writer waiting for its slot holds no general slot (fix round 1)'):
            # Two slots, one of them for a final writer: while one final writer runs and a second waits for the
            # final-writer slot, a standard call still finds the other general slot (the waiter took none).
            two = self.fw_gate(max_concurrent_calls=2)
            waiting = {**self.options(two), 'slot_wait': 2.0}
            results = {}

            def second_final_writer():
                try:
                    bridge.execute_request(two.private, two.go_path, fw_envelope(body(model=DEEPSEEK, max_tokens=131072), 'fw-b'),
                                           dispatch=answered, **waiting)
                    results['fw-b'] = 'settled'
                except SafetyError as error:
                    results['fw-b'] = str(error)

            def while_running(_sent, _key):
                waiter = threading.Thread(target=second_final_writer)
                waiter.start()
                time.sleep(0.3)  # The second final writer is now waiting for the final-writer slot.
                try:
                    bridge.execute_request(two.private, two.go_path, envelope(body(model=DEEPSEEK), 'std-b'),
                                           dispatch=answered, **{**waiting, 'slot_wait': 0.2})
                    results['std-b'] = 'settled'
                except SafetyError as error:
                    results['std-b'] = str(error)
                self.assertTrue(waiter.is_alive())  # Still waiting: the first final writer has not answered yet.
                self.addCleanup(waiter.join, 5)
                results['waiter'] = waiter
                return answered(_sent, _key)
            bridge.execute_request(two.private, two.go_path, fw_envelope(body(model=DEEPSEEK, max_tokens=131072), 'fw-a'),
                                   dispatch=while_running, **waiting)
            results.pop('waiter').join(5)
            self.assertEqual(results, {'std-b': 'settled', 'fw-b': 'settled'})  # The waiter starts once the first ends.
            self.assertEqual([entry_of(two, op)['state'] for op in ('fw-a', 'std-b', 'fw-b')], ['settled'] * 3)
            # Every slot is free again: two final writers in a row, then two standard calls at once.
            self.assertTrue(two.slots.acquire(0) and two.slots.acquire(0))
            two.slots.release()
            two.slots.release()
            self.assertTrue(two.slots.acquire_final_writer(0))
            two.slots.release_final_writer()
        # A server started before the GO named the member must restart first.
        with self.refused('SERVE_RESTART_REQUIRED'):
            bridge.execute_request(gate.private, gate.go_path, envelope(body(model=DEEPSEEK), 'std-2'), dispatch=answered,
                                   **{**options, 'slots': bridge.CallSlots(gate.go['max_concurrent_calls'])})

    def test_the_go_names_its_final_writer_calls_and_activate_and_remaining_count_them(self):
        gate = self.gate()
        for count in (1, 4):
            with self.subTest(count=count):
                self.assertEqual(bridge.read_go(gate.write_go(name='ok.json', max_final_writer_calls=count))['max_final_writer_calls'], count)
        for count in (0, 5, True, 1.0, '1', None):
            with self.subTest(count=count), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', max_final_writer_calls=count))
        # Fix round 1: a GO may name final-writer calls only when its profile and every enabled row have the tier.
        fake = FakeVendorProfile()
        fake.rows = {**fake.rows, 'fake/writer-1': bridge.helper.ModelRow(
            'fake/writer-1', 'FakeMaker', Decimal('0.10'), Decimal('0.20'), 4096, (None,), False, final_writer_output_bound=8192)}
        untiered = FakeVendorProfile()
        untiered.name = 'untiered'
        untiered.final_writer_max_request_bytes = None
        untiered.rows = {'fake/writer-1': fake.rows['fake/writer-1']}
        with patch.dict(bridge.helper.PROFILES, {'fakevendor': fake, 'untiered': untiered}):
            for name, changes, ok in (('every_row_has_the_tier', {'enabled_models': ['fake/writer-1']}, True),
                                      ('a_row_without_the_tier', {'enabled_models': ['fake/writer-1', 'fake/model-1']}, False),
                                      ('only_rows_without_the_tier', {'enabled_models': ['fake/model-1']}, False),
                                      ('a_profile_without_the_tier', {'provider': 'untiered', 'enabled_models': ['fake/writer-1']}, False)):
                with self.subTest(name):
                    path = gate.write_go(name=name + '.json', **{'provider': 'fakevendor', **changes}, max_final_writer_calls=1)
                    if ok:
                        self.assertEqual(bridge.read_go(path)['max_final_writer_calls'], 1)
                    else:
                        with self.refused('ROOT_GO_INVALID'):
                            bridge.read_go(path)
                    # Without the member the same GO reads as today.
                    self.assertNotIn('max_final_writer_calls', bridge.read_go(gate.write_go(name=name + '-plain.json',
                                                                                          **{'provider': 'fakevendor', **changes})))
        # All four rows, 10 at once, one of them a final writer: 9 x 0.14211072 + 0.50878464 = 1.78778112.
        for budget, ok in (('1.78', False), ('1.79', True)):
            with self.subTest(budget=budget):
                gate = self.gate(enabled_models=ALL, daily_budget_usd=budget, max_concurrent_calls=10, max_final_writer_calls=1)
                gate.init()
                if ok:
                    self.assertEqual(gate.activate()['state'], 'active')
                else:
                    with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
                        gate.activate()
        # Without the member: today's check exactly (10 x 0.14211072 = 1.4211072 fits 1.43).
        gate = self.gate(enabled_models=ALL, daily_budget_usd='1.43', max_concurrent_calls=10)
        gate.init()
        self.assertEqual(gate.activate()['state'], 'active')
        self.assertEqual(bridge.in_flight_worst_case(DEEPINFRA, ALL, 10, 0), Decimal('1.4211072'))
        self.assertEqual(bridge.in_flight_worst_case(DEEPINFRA, ALL, 10, 1), Decimal('1.78778112'))
        # /remaining: today's seven members without the GO member, nine with it.
        plain = self.gate().ready()
        self.assertEqual(len(bridge.remaining_report(plain.private, plain.go_path, {'scope_id': SCOPE}, now=plain.clock)), 7)
        fw = self.fw_gate()
        report = bridge.remaining_report(fw.private, fw.go_path, {'scope_id': SCOPE}, slots=fw.slots, now=fw.clock)
        self.assertEqual(sorted(report), ['enabled_models', 'final_writer_max_in_flight', 'largest_final_writer_reservation_usd',
                                          'largest_reservation_usd', 'max_concurrent_calls', 'remaining_calls', 'remaining_usd',
                                          'state', 'window_open'])
        self.assertEqual((report['final_writer_max_in_flight'], Decimal(report['largest_final_writer_reservation_usd']),
                          Decimal(report['largest_reservation_usd']), report['window_open']),
                         (1, Decimal('0.50878464'), Decimal('0.14211072'), True))

    def test_the_message_limit_holds_a_1_mib_body_in_its_json_envelope(self):
        self.assertEqual(bridge.MAX_IPC_BYTES, 3 * MIB)
        # The worst case for escaping: every character of the body a quote, escaped once in the body and again in the message.
        value = body(model=MODEL, max_tokens=131072, messages=[{'role': 'user', 'content': ''}])
        value['messages'][0]['content'] = '"' * ((MIB - len(json.dumps(value).encode())) // 2)
        self.assertLessEqual(len(json.dumps(value).encode()), MIB)
        message = json.dumps(fw_envelope(value)).encode()
        self.assertGreater(len(message), MIB)
        self.assertLessEqual(len(message), bridge.MAX_IPC_BYTES)


class RemainingTests(GateTest):
    def report(self, gate, data=Ellipsis, **kwargs):
        return bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE} if data is Ellipsis else data,
                                       now=gate.clock, **kwargs)

    def test_reply_has_exactly_the_contract_shape(self):
        gate = self.gate().ready()
        gate.call('op-1', charge='0.01')
        self.assertEqual(self.report(gate, slots=gate.slots), {
            'state': 'active', 'window_open': True, 'remaining_usd': '4.99', 'remaining_calls': 499,
            'max_concurrent_calls': 4, 'largest_reservation_usd': '0.0560128', 'enabled_models': [MODEL]})
        gate = self.gate(enabled_models=[MODEL, MIMO]).ready()
        self.assertEqual((self.report(gate)['largest_reservation_usd'], self.report(gate)['remaining_usd']),
                         ('0.14211072', '5.00'))

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
        with self.refused('SETTLED_INTO_HALT'):
            gate.call('op-1', charge='0.20')  # An overrun: settled above the pot (and halts).
        report = self.report(gate)
        self.assertEqual((report['remaining_usd'], report['remaining_calls']), ('0', 0))

    def test_remaining_amounts_never_carry_more_than_nine_decimals(self):
        # A reported cost with 13 decimals settles as the held amount; the app parses at most 9.
        gate = self.gate(daily_budget_usd='3.00').ready()
        gate.call('op-1', charge='0.0123456789012')
        report = self.report(gate)
        self.assertEqual(report['remaining_usd'], '2.987654321')  # 2.9876543210988 rounded down
        self.assertRegex(report['largest_reservation_usd'], r'^[0-9]+\.[0-9]{1,9}$')
        self.assertGreaterEqual(Decimal(report['largest_reservation_usd']),
                                bridge.largest_reservation(bridge.profile_of('deepinfra'), ['zai-org/GLM-5.3-Flash']))

    def exchange(self, gate, data, path='/remaining', uid=PEER, remaining=True):
        server_side, client_side = socket.socketpair()
        payload = json.dumps(data).encode()
        client_side.sendall(b'POST ' + path.encode() + b' HTTP/1.0\r\nContent-Type: application/json\r\n'
                            b'Content-Length: ' + str(len(payload)).encode() + b'\r\n\r\n' + payload)

        def answer(request, peer):
            return bridge.remaining_report(gate.private, gate.go_path, request, slots=gate.slots, now=gate.clock, uid=peer)
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
        gate.call('op-1', charge='0.01')
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
        self.assertIn("make_handler(private, go['allowed_peer_uids'], execute, slots,\n", source)
        self.assertIn('remaining=RemainingAnswers(private, go_path, slots)),', source)
        self.assertEqual(bridge.REMAINING_MIN_SECONDS, 1.0)

    def test_serve_reads_the_state_at_most_once_a_second_however_often_peers_ask(self):
        gate = self.gate().ready()
        clock, reads = [100.0], []
        real = bridge.remaining_snapshot

        def counted(*args):
            reads.append(clock[0])
            return real(*args)
        answers = bridge.RemainingAnswers(gate.private, gate.go_path, gate.slots, clock=lambda: clock[0], now=gate.clock)
        with patch.object(bridge, 'remaining_snapshot', counted):
            first = [answers({'scope_id': SCOPE}) for _ in range(20)]
            for data in ({'scope_id': 'other-scope'}, {}, {'scope_id': SCOPE, 'x': 1}):
                with self.subTest(data=data), self.refused('REMAINING_REQUEST_INVALID'):
                    answers(data)
            self.assertEqual(reads, [100.0])
            gate.call('op-1', charge='0.01')
            clock[0] = 100.9
            self.assertEqual(answers({'scope_id': SCOPE})['remaining_usd'], '5.00')  # Still the cached read.
            clock[0] = 101.0
            self.assertEqual(answers({'scope_id': SCOPE})['remaining_usd'], '4.99')
            self.assertEqual(reads, [100.0, 101.0])
        self.assertEqual(first[0], self.report(gate, slots=gate.slots) | {'remaining_usd': '5.00', 'remaining_calls': 500})
        broken = bridge.RemainingAnswers(self.gate().private, gate.go_path, gate.slots, clock=lambda: clock[0])
        with patch.object(bridge, 'remaining_snapshot', counted):
            for _ in range(3):
                with self.refused('REMAINING_UNAVAILABLE'):
                    broken({'scope_id': SCOPE})  # No state there: refused, and the refusal is reused too.
        self.assertEqual(reads, [100.0, 101.0, 101.0])

    def test_a_state_naming_a_row_the_code_dropped_still_stops_and_reports(self):
        gate = self.gate(enabled_models=[MODEL, MIMO]).ready()
        rows = {model: row for model, row in DEEPINFRA.rows.items() if model != MIMO}
        with patch.object(DEEPINFRA, 'rows', rows):
            self.assertEqual(gate.status()['enabled_models'], [MODEL, MIMO])
            with self.refused('REMAINING_UNAVAILABLE'):
                self.report(gate)
            with self.refused('ROOT_GO_INVALID'):
                gate.call('op-1')
            self.assertEqual(bridge.stop_authority(gate.private, now=gate.clock)['state'], 'halted')


class ProbeTests(GateTest):
    def probe(self, gate, model, dispatch=None, **kwargs):
        options = {'dispatch': dispatch or (lambda sent, _key: (200, provider_response('0.0004', json.loads(sent)['model'],
                                                                                         content='OK'))),
                   'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux', 'uid': 0, 'now': gate.clock,
                   'fence': lambda _provider: None}  # The fence itself: ProbeFenceTests.
        options.update(kwargs)
        return bridge.probe(gate.private, gate.go_path, model, **options)

    def test_probe_reaches_a_reviewed_model_the_go_does_not_enable_yet(self):
        for model in (DEEPSEEK, MIMO, MODEL):
            with self.subTest(model=model):
                gate = self.gate().ready()  # GLM only.
                sent = []

                def dispatch(request, key, model=model):
                    sent.append((json.loads(request), key))
                    # total_tokens = prompt + completion proves the 20 reasoning tokens are inside the 30.
                    return 200, {'model': model, 'choices': [{'message': {'content': 'OK'}}],
                                 'usage': {'prompt_tokens': 12, 'completion_tokens': 30, 'total_tokens': 42,
                                           'completion_tokens_details': {'reasoning_tokens': 20}}}
                summary = self.probe(gate, model, dispatch)
                expected_body = {'model': model, 'max_tokens': 1024,
                                 'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
                if ROWS[model][4][0] == 'high':
                    expected_body['reasoning_effort'] = 'high'
                expected_body.update(SAMPLING.get(model, {}))  # None of these rows has any (SamplingTests: Qwen).
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
        with self.refused('AUTHORITY_HALTED'):
            self.probe(gate, DEEPSEEK, no_network)

    def test_probe_counts_in_the_pot_and_the_daily_call_limit(self):
        gate = self.gate(max_paid_posts_per_day=1).ready()
        self.probe(gate, DEEPSEEK)
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            gate.call('op-1')
        self.assertEqual(gate.status()['today_by_model'], {DEEPSEEK: {'spend_usd': '0.0004', 'posts': 1}})


class UnbilledRefusalTests(GateTest):
    """Owner ruling 5 (2026-10-10): a 429 the profile proves unbilled counts as not sent."""
    RATE_LIMITED = {'error': {'message': 'Rate limit exceeded', 'type': 'rate_limit'}}

    def test_a_429_without_usage_is_released_and_never_grows_the_streak_or_halts(self):
        # Owner direction 2026-10-11: a vendor's unbilled refusal proves it is reachable; it never halts.
        gate = self.gate().ready()
        for number in range(1, 6):
            with self.refused('PROVIDER_REFUSED_UNBILLED'):
                gate.call('op-%d' % number, dispatch=lambda _s, _k: (429, dict(self.RATE_LIMITED)))
            status = gate.status()
            self.assertEqual((status['state'], status['unsent_streak'], status['today_posts'], status['today_spend_usd'],
                              status['in_flight']), ('active', 0, 0, '0', 0))
            later(gate, 601)  # Past any cool-off, so each call reaches the vendor.
        # Kept on the record at $0 (round 2 review): never counted as spend or as a paid post.
        self.assertEqual({entry['state'] for entry in gate.day('2026-10-08')['entries'].values()}, {'released_unbilled'})
        self.assertEqual(gate.status()['today_unbilled_releases'], 5)
        self.assertIn('"reason": "unbilled_refusal"', self.out.getvalue())

    def test_a_settled_reply_resets_the_streak_and_ipc_does_not_halt(self):
        gate = self.gate().ready()
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('op-0', dispatch=unreached)
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-1', dispatch=lambda _s, _k: (429, dict(self.RATE_LIMITED)))
        self.assertEqual(gate.status()['unsent_streak'], 1)  # The refusal neither grew nor reset it.
        gate.call('op-2')
        self.assertEqual(gate.status()['unsent_streak'], 0)
        # The app maps this code to its transient retry path: nothing was billed, the hold is gone.
        self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_REFUSED_UNBILLED'))),
                         {'error': 'PROVIDER_REFUSED_UNBILLED'})

    def test_a_429_carrying_usage_is_settled_and_halts(self):
        gate = self.gate().ready()
        reply = {**self.RATE_LIMITED, 'usage': {'prompt_tokens': 10, 'completion_tokens': 0}}
        with self.refused('SETTLED_INTO_HALT'):
            gate.call('op-1', dispatch=lambda _s, _k: (429, reply))
        entry = entry_of(gate, 'op-1')
        self.assertEqual((entry['state'], gate.status()['reason']), ('settled', 'provider_error_or_model_identity'))

    def test_anything_ambiguous_stays_uncertain_and_halts(self):
        nested_cost = {'error': {'message': 'slow down', 'detail': {'estimated_cost': 0}}}
        # A 5xx without any billing field is booked at its reservation since 2026-10-15 (ServerErrorBookedTests).
        for name, status, reply in (('429_without_error', 429, {'detail': 'slow down'}),
                                    ('429_empty_error', 429, {'error': ''}),
                                    ('429_with_choices', 429, {**self.RATE_LIMITED, 'choices': []}),
                                    ('429_nested_cost', 429, nested_cost),
                                    # Review 2026-10-10: DeepInfra's native cost block and token counts.
                                    ('429_inference_status', 429, {**self.RATE_LIMITED, 'inference_status': {'cost': 0.0001}}),
                                    ('429_cost', 429, {**self.RATE_LIMITED, 'cost': 0}),
                                    ('429_tokens_generated', 429, {**self.RATE_LIMITED, 'meta': {'tokens_generated': 3}}),
                                    # Judged on the raw reply: redaction would drop this 'headers' subtree.
                                    ('429_usage_under_redacted_key', 429, {**self.RATE_LIMITED, 'headers': {'usage': {'prompt_tokens': 1}}}),
                                    ('429_not_json', 429, {'_invalid_json': True})):
            with self.subTest(name):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.call('op-1', dispatch=lambda _s, _k, c=status, r=reply: (c, r))
                entry = entry_of(gate, 'op-1')
                self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('uncertain', Decimal(entry['reserved_usd'])))
                self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'uncertain_charge'))

    def test_a_failing_hook_is_uncertain_and_halts(self):
        gate = self.gate().ready()
        with patch.object(DEEPINFRA, 'unbilled_refusal', side_effect=RuntimeError('synthetic')), \
                self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=lambda _s, _k: (429, dict(self.RATE_LIMITED)))
        self.assertEqual(gate.status()['reason'], 'uncertain_charge')


class RemainingProbeWindowTests(GateTest):
    """Review 2026-10-10: a probe id in flight makes the next reservation wait or halt, so /remaining
    says the window is shut and the app starts no debate into it."""

    def test_a_probe_id_in_flight_shuts_the_window(self):
        gate = self.gate().ready()
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertTrue(report['window_open'])
        with bridge.TeamStore(gate.private) as store:
            control = store.control()
            control['in_flight'][bridge.PROBE_ENTRY_PREFIX + 'x'] = '2026-10-08'
            store.save_control(control)
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertFalse(report['window_open'])


class DatedVendorProfile(FakeVendorProfile):
    """A vendor whose price rises on a date (as Google's will) and whose path names the model."""
    name = 'datedvendor'
    rows = {'dated/model-1': bridge.helper.ModelRow('dated/model-1', 'DatedMaker', Decimal('0.10'), Decimal('0.20'),
                                                     4096, (None,), False)}
    RISE = bridge.datetime.fromisoformat('2026-10-09T00:00:00+00:00')

    def path_for(self, row):
        return '/v1/models/' + row.model + ':generate'

    def reservation_prices(self, row, moment, request_bytes=None):
        return (Decimal('0.20'), Decimal('0.40')) if moment >= self.RISE else (row.input_usd_per_m, row.output_usd_per_m)

    def ceiling_prices(self, row):
        return Decimal('0.20'), Decimal('0.40')

    def account(self, response, row, moment):
        return bridge.helper.account_response(response, *self.reservation_prices(row, moment))


class ProfileApiTests(GateTest):
    def dated_gate(self):
        guard = patch.dict(bridge.helper.PROFILES, {'datedvendor': DatedVendorProfile()})
        guard.start()
        self.addCleanup(guard.stop)
        return self.gate(provider='datedvendor', enabled_models=['dated/model-1']).ready()

    def dated_request(self, operation_id, prices):
        value = {'model': 'dated/model-1', 'max_tokens': 100, 'messages': [{'role': 'user', 'content': 'hi'}]}
        raw = json.dumps(value)
        reserved = (Decimal(len(raw.encode()) + 2048) * prices[0] + Decimal(4096) * prices[1]) / Decimal(1000000)
        return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
                'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reserved)}

    def test_reservation_and_settlement_use_the_profile_prices_for_the_moment_and_the_entry_records_both(self):
        gate = self.dated_gate()
        usage = {'prompt_tokens': 1000, 'completion_tokens': 0}  # $0.0002 at the risen price.
        seen = []

        def dispatch(_sent, _key):
            gate.clock.set('2026-10-09T00:00:01+00:00')  # The price rises while the call runs.
            return 200, {'model': 'dated/model-1', 'usage': usage}

        class Recorder:
            def __init__(self, timeout, profile, path):
                seen.append(path)

            def __call__(self, sent, key):
                return dispatch(sent, key)
        gate.clock.set('2026-10-08T20:00:00+00:00')
        request = self.dated_request('op-1', (Decimal('0.10'), Decimal('0.20')))
        with patch.object(bridge.helper, 'HttpsTransport', Recorder):
            bridge.execute_request(gate.private, gate.go_path, request, peer_uid=PEER, slots=gate.slots,
                                   key_loader=lambda _p: KEY, host=HOST, platform='linux', now=gate.clock)
        self.assertEqual(seen, ['/v1/models/dated/model-1:generate'])
        entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
        self.assertEqual({k: entry[k] for k in ('reserve_input_usd_per_m', 'reserve_output_usd_per_m',
                                                'settle_input_usd_per_m', 'settle_output_usd_per_m', 'held_usd')},
                         {'reserve_input_usd_per_m': '0.10', 'reserve_output_usd_per_m': '0.20',
                          'settle_input_usd_per_m': '0.20', 'settle_output_usd_per_m': '0.40', 'held_usd': '0.0002'})
        with self.refused('RESERVATION_MISMATCH'):  # After the rise, the old price is refused.
            bridge.execute_request(gate.private, gate.go_path, self.dated_request('op-2', (Decimal('0.10'), Decimal('0.20'))),
                                   peer_uid=PEER, slots=gate.slots, dispatch=no_network, key_loader=no_network,
                                   host=HOST, platform='linux', now=gate.clock)

    def test_worst_cases_use_the_ceiling_prices_and_the_profile_cap(self):
        profile, row = DatedVendorProfile(), DatedVendorProfile.rows['dated/model-1']
        self.assertEqual(bridge.worst_case_reservation(profile, row),
                         (Decimal(profile.max_request_bytes + 2048) * Decimal('0.20') + 4096 * Decimal('0.40')) / Decimal(1000000))
        for change in ({'per_call_cap_usd': Decimal('0.0001')}, {'per_call_cap_usd': Decimal('1.01')},
                       {'per_call_cap_usd': 0.25}, {'max_request_bytes': 10}, {'max_request_bytes': 2 * 1024 * 1024},
                       {'name': 'other-name'}):
            with self.subTest(change=change):
                broken = DatedVendorProfile()
                for attribute, value in change.items():
                    setattr(broken, attribute, value)
                with patch.dict(bridge.helper.PROFILES, {'datedvendor': broken}):
                    self.assertIsNone(bridge.profile_of('datedvendor'))

    def test_reservation_prices_above_the_ceiling_are_refused(self):
        gate = self.dated_gate()
        profile = bridge.helper.PROFILES['datedvendor']
        with patch.object(profile, 'reservation_prices', lambda _row, _moment, _bytes=None: (Decimal('0.30'), Decimal('0.40'))), \
                self.refused('REQUEST_INVALID'):
            bridge.validate_request(self.dated_request('op-1', (Decimal('0.30'), Decimal('0.40'))), gate.go)

    def test_refusal_body_passes_only_the_public_codes(self):
        for code in ('PROVIDER_NOT_REACHED', 'PROVIDER_REFUSED_UNBILLED', 'TEAM_DAILY_BUDGET_REACHED',
                     'DAILY_CALL_LIMIT_REACHED', 'CONCURRENCY_LIMIT_REACHED', 'AUTHORITY_HALTED', 'MODEL_COOLING'):
            self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent(code))), {'error': code})
        self.assertEqual(json.loads(bridge.refusal_body(bridge.ModelCooling(42))), {'error': 'MODEL_COOLING', 'retry_after': 42})
        # Side-by-side spec §9: refused before any reservation, this model or this price is not served by this GO.
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('MODEL_NOT_ALLOWED'))), {'error': 'MODEL_NOT_ALLOWED'})
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('RESERVATION_MISMATCH'))), {'error': 'RESERVATION_MISMATCH'})
        # SETTLED_INTO_HALT: a call that was reserved and sent, then halted the gate, stays opaque.
        for code in ('NEW_CHARGE_UNCERTAIN', 'SETTLED_INTO_HALT', 'AUTHORITY_STOPPED',
                     'AUTHORITY_EXPIRED', 'REMAINING_REQUEST_INVALID', 'PROBE_RUNNING', 'SETTLEMENT_FAILED', 'provider_not_reached'):
            self.assertEqual(json.loads(bridge.refusal_body(SafetyError(code))), {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})
        self.assertEqual(json.loads(bridge.refusal_body(ValueError('PROVIDER_NOT_REACHED'))),
                         {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})

    def test_status_amounts_are_never_in_scientific_notation(self):
        gate = self.gate().ready()
        gate.call('op-1', charge='0.00000001')
        text = json.dumps(gate.status())
        self.assertNotIn('E-', text)
        self.assertEqual(gate.status()['today_by_model'][MODEL]['spend_usd'], '0.00000001')


class ProbeLockTests(GateTest):
    def test_serve_start_refuses_while_a_probe_runs_and_a_second_probe_is_refused(self):
        gate = self.gate().ready()
        held = []

        def dispatch(_sent, _key):
            with self.refused('PROBE_RUNNING'):
                bridge.recover_interrupted(gate.private, now=gate.clock)
            with self.refused('PROBE_ALREADY_RUNNING'):
                ProbeTests.probe(self, gate, MIMO, dispatch=no_network)
            held.append(True)
            return 200, provider_response('0.0004', DEEPSEEK, content='OK')
        summary = ProbeTests.probe(self, gate, DEEPSEEK, dispatch)
        self.assertEqual((held, summary['entry_state'], gate.status()['state']), ([True], 'settled', 'active'))
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0, 'unrecorded_uncertain': 0})
        self.assertEqual(list(gate.day('2026-10-08')['entries'])[0].split(':')[0], 'preview-probe')

    def test_a_probe_left_in_flight_without_its_lock_halts_the_next_reservation(self):
        gate = self.gate().ready()
        go = bridge.read_go(gate.go_path)
        request = envelope(body(model=DEEPSEEK), 'probe-1')
        _, reserved, row, prices = bridge.validate_request(request, go, probe=True)
        bridge.reserve_call(gate.private, go, file_sha(gate.go_path), request, reserved, row, HOST, 0, gate.clock,
                            True, prices)  # The probe process died here: its lock is gone.
        dispatched = []
        with self.refused('AUTHORITY_HALTED'):
            gate.call('op-1', dispatch=lambda *args: dispatched.append(args))
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], dispatched), ('halted', 'interrupted_probe', []))
        self.assertEqual(status['halts'][0]['entry_id'], 'preview-probe:' + SCOPE + ':probe-1')

    def test_an_ipc_operation_named_like_a_probe_is_an_ordinary_call(self):
        gate = self.gate().ready()
        entered, results = threading.Event(), {}
        release = threading.Event()

        def blocking(_sent, _key):
            entered.set()
            release.wait(5)
            return 200, provider_response('0.01', MODEL)
        thread = threading.Thread(target=lambda: results.update(r=gate.call('probe-x', dispatch=blocking)))
        thread.start()
        try:
            self.assertTrue(entered.wait(3))
            self.assertEqual(gate.call('op-2')['status'], 200)  # No probe halt for a 'probe-' operationId.
        finally:
            release.set()
            thread.join(5)
        self.assertEqual((results['r']['status'], gate.status()['state']), (200, 'active'))

    def test_probe_reports_whether_the_model_kept_to_max_tokens(self):
        for completion, within in ((1024, True), (1025, False)):
            with self.subTest(completion=completion):
                gate = self.gate().ready()
                summary = ProbeTests.probe(self, gate, DEEPSEEK, lambda _s, _k, c=completion: (200, {
                    'model': DEEPSEEK, 'usage': {'prompt_tokens': 5, 'completion_tokens': c}}))
                self.assertEqual(summary['completion_within_max_tokens'], within)


class RemainingPeerTests(GateTest):
    def test_remaining_checks_the_peer_against_the_go_on_disk_now(self):
        gate = self.gate(allowed_peer_uids=[PEER, 77]).ready()
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, now=gate.clock, uid=77)
        self.assertTrue(report['window_open'])
        gate.write_go(allowed_peer_uids=[PEER])  # The owner removed uid 77 (not yet activated).
        with self.refused('IPC_REQUEST_REFUSED'):
            bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, now=gate.clock, uid=77)
        self.assertFalse(bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, now=gate.clock,
                                                 uid=PEER)['window_open'])
        gate.go_path.write_text('{')
        with self.refused('IPC_REQUEST_REFUSED'):
            bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, now=gate.clock, uid=PEER)


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
            _HTTPS(timeout=5, profile=DEEPINFRA, path=DEEPINFRA.path_for(DEEPINFRA.rows[MODEL]))(b'{}', KEY)
            fake = FakeVendorProfile()
            _HTTPS(timeout=5, profile=fake, path=fake.path_for(fake.rows['fake/model-1']))(b'{}', KEY)
        self.assertEqual(sent, [
            'api.deepinfra.com', ('POST', '/v1/openai/chat/completions', b'{}',
                                  {'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json',
                                   'Accept': 'application/json'}),
            'api.fakevendor.invalid', ('POST', '/v1/chat', b'{}',
                                       {'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json',
                                        'Accept': 'application/json'})])

    def test_a_profile_path_with_a_query_or_no_leading_slash_is_refused(self):
        for path in ('/v1/x?key=abc', 'v1/x', '/v1/x#y', '/v1/../x', '/v1/x y', None):
            with self.subTest(path=path), self.refused('profile_path_invalid'):
                _HTTPS(timeout=5, profile=FakeVendorProfile(), path=path)
            profile = FakeVendorProfile()
            profile.path_for = lambda _row, path=path: path
            with self.subTest(review=path), patch.dict(bridge.helper.PROFILES, {'fakevendor': profile}):
                self.assertIsNone(bridge.profile_of('fakevendor'))  # A GO naming it is refused.

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
        # Anthropic's profile arrived with PR B (its own tests: preview_budget_authority_anthropic_test.py).
        # Perplexity's arrived with plan task W1-1 (2026-10-30; preview_budget_authority_perplexity_test.py).
        self.assertEqual(set(bridge.helper.PROFILES), {'deepinfra', 'anthropic', 'perplexity'})
        self.assertNotIn('google', bridge.helper.PROFILES)



class QwenRowTests(GateTest):
    """Owner swap 2026-10-10: Qwen3.8-Flash on DeepInfra, appended after MiMo."""

    def test_the_qwen_row_is_appended_after_mimo_with_its_contract_values(self):
        self.assertEqual(list(DEEPINFRA.rows), [MODEL, DEEPSEEK, MIMO, QWEN])
        row = DEEPINFRA.rows[QWEN]
        self.assertEqual((row.maker, row.input_usd_per_m, row.output_usd_per_m, row.output_bound, row.efforts, row.json_object),
                         ('Alibaba', Decimal('0.113'), Decimal('0.382'), 32768, (None, 'low', 'medium', 'none'), False))
        # ((262144 + 2048) x 0.113 + 32768 x 0.382) / 1e6, under the $0.25 cap (caps: owner, 2026-10-10).
        self.assertEqual(bridge.worst_case_reservation(DEEPINFRA, row), Decimal('0.042371072'))
        self.assertTrue(bridge.row_reviewed(DEEPINFRA, QWEN, row))

    def test_qwen_takes_no_effort_and_no_json_mode(self):
        gate = self.gate(enabled_models=ALL).ready()
        self.assertEqual(gate.call('ok', value=body(model=QWEN))['status'], 200)
        for name, value in (('effort', {**body(model=QWEN), 'reasoning_effort': 'high'}),
                            ('json', {**body(model=QWEN), 'response_format': {'type': 'json_object'}})):
            with self.subTest(name), self.refused('REQUEST_PARAMETERS_INVALID'):
                gate.call(name, value=value)


class ThinkingLevelMenus(GateTest):
    """Spec 2026-10-12 section 4.5: the gate accepts exactly each row's reviewed menu."""

    def base(self, model, **members):
        row = DEEPINFRA.rows[model]
        payload = {'model': model, 'max_tokens': 8, 'messages': [{'role': 'user', 'content': 'x'}]}
        payload.update(dict(row.sampling or ()))
        payload.update(members)
        return payload, row

    def test_menus_are_the_reviewed_ones(self):
        self.assertEqual({model: row.efforts for model, row in DEEPINFRA.rows.items()}, {
            MODEL: ('high', 'low'), DEEPSEEK: ('high', 'low', 'none'), MIMO: (None, 'none'), QWEN: (None, 'low', 'medium', 'none')})
        self.assertEqual(DEEPINFRA.effort_words, (None, 'none', 'low', 'medium', 'high'))

    def test_every_menu_level_is_accepted_and_nothing_else(self):
        for model, row in DEEPINFRA.rows.items():
            for word in ('none', 'low', 'medium', 'high', 'max', 'xhigh', 'default', 'minimal'):
                payload, _ = self.base(model, reasoning_effort=word)
                with self.subTest(model=model, word=word):
                    self.assertEqual(DEEPINFRA.body_valid(payload, row), word in row.efforts)
            payload, _ = self.base(model)
            with self.subTest(model=model, word='absent'):
                self.assertEqual(DEEPINFRA.body_valid(payload, row), None in row.efforts)
            for bad in (None, 1, True, ['low'], {'effort': 'low'}):
                payload, _ = self.base(model, reasoning_effort=bad)
                with self.subTest(model=model, bad=repr(bad)):
                    self.assertFalse(DEEPINFRA.body_valid(payload, row))

    def test_row_review_refuses_a_malformed_menu(self):
        row = DEEPINFRA.rows[MODEL]
        for efforts in ((), ('high', 'high'), ('ultra',), 'high', None, ['high'], (['high'],), (None, None),
                        ('high', 'low', 'medium', 'none', None, 'max')):
            with self.subTest(efforts=repr(efforts)):
                self.assertFalse(bridge.row_reviewed(DEEPINFRA, MODEL, row._replace(efforts=efforts)))
        self.assertTrue(bridge.row_reviewed(DEEPINFRA, MODEL, row))

    def test_the_probe_sends_the_rows_default(self):
        self.assertEqual(DEEPINFRA.probe_body(DEEPINFRA.rows[DEEPSEEK])['reasoning_effort'], 'high')
        self.assertNotIn('reasoning_effort', DEEPINFRA.probe_body(DEEPINFRA.rows[QWEN]))

    def test_body_effort_names_the_level_a_body_carries(self):
        self.assertEqual(DEEPINFRA.body_effort({'reasoning_effort': 'low'}), 'low')
        self.assertIsNone(DEEPINFRA.body_effort({}))
        self.assertIsNone(DEEPINFRA.body_effort(None))

    def test_the_ledger_records_the_level_the_body_carried(self):
        gate = self.gate(enabled_models=ALL).ready()
        for operation_id, value, word in (('glm-low', body(model=MODEL, reasoning_effort='low'), 'low'),
                                          ('glm-high', body(model=MODEL), 'high'),
                                          ('deepseek-none', body(model=DEEPSEEK, reasoning_effort='none'), 'none'),
                                          ('mimo-default', body(model=MIMO), 'default'),
                                          ('qwen-medium', body(model=QWEN, reasoning_effort='medium'), 'medium')):
            with self.subTest(operation_id=operation_id):
                self.assertEqual(gate.call(operation_id, value=value)['status'], 200)
                self.assertEqual(entry_of(gate, operation_id)['requested_effort'], word)


class UnbilledLedgerTests(GateTest):
    """Round 2 review: every unbilled release stays on the record at $0, and is capped per day."""
    RATE_LIMITED = UnbilledRefusalTests.RATE_LIMITED

    def refuse(self, gate, operation_id):
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call(operation_id, dispatch=lambda _s, _k: (429, dict(self.RATE_LIMITED)))

    def test_the_entry_is_kept_with_held_zero_status_reason_and_time(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        entry = entry_of(gate, 'op-1')
        self.assertEqual({k: entry[k] for k in ('state', 'held_usd', 'http_status', 'reason', 'released_at', 'model')},
                         {'state': 'released_unbilled', 'held_usd': '0', 'http_status': 429, 'reason': 'unbilled_refusal',
                          'released_at': '2026-10-08T09:00:00+00:00', 'model': MODEL})
        self.assertEqual(Decimal(entry['reserved_usd']), RESERVED)  # What was set aside stays recorded.
        status = gate.status()
        self.assertEqual((status['today_spend_usd'], status['today_posts'], status['today_unbilled_releases'],
                          status['today_by_model'], status['in_flight']), ('0', 0, 1, {}, 0))
        with bridge.TeamStore(gate.private, shared=True) as store:
            self.assertEqual(bridge.day_spend(store.ledger('2026-10-08')), Decimal(0))

    def test_unbilled_releases_never_count_as_paid_posts(self):
        gate = self.gate(max_paid_posts_per_day=1).ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertEqual(report['remaining_calls'], 1)
        later(gate, bridge.COOL_OFF_FIRST_SECONDS)  # The model's cool-off has run out: this call is its trial.
        self.assertEqual(gate.call('op-3')['status'], 200)
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            gate.call('op-4')

    def test_there_is_no_daily_ceiling_however_many_releases(self):
        # Owner direction 2026-10-11: the old 20-a-day halt (unbilled_release_ceiling) is gone. The
        # day's count stays visible in status, and never halts.
        self.assertFalse(hasattr(bridge, 'UNBILLED_RELEASES_PER_DAY'))
        gate = self.gate().ready()
        for number in range(1, 41):
            self.refuse(gate, 'u-%d' % number)
            later(gate, 601)
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], status['today_unbilled_releases'], status['unsent_streak'],
                          status['today_posts'], status['today_spend_usd'], status['in_flight']),
                         ('active', None, 40, 0, 0, '0', 0))
        self.assertNotIn('unbilled_releases_per_day', status)
        self.assertEqual(status['halts'], [])
        self.assertEqual(gate.call('ok')['status'], 200)

    def test_the_next_bucharest_day_starts_at_zero(self):
        gate = self.gate().ready()
        for number in range(3):
            self.refuse(gate, 'u-%d' % number)
            later(gate, 601)
        gate.clock.set('2026-10-08T21:30:00+00:00')  # 00:30 in Bucharest on 9 October.
        self.assertEqual((gate.status()['today'], gate.status()['today_unbilled_releases']), ('2026-10-09', 0))
        self.refuse(gate, 'next-day')
        self.assertEqual(gate.status()['today_unbilled_releases'], 1)
        self.assertEqual(len(gate.day('2026-10-08')['entries']), 3)

    def test_a_release_across_midnight_counts_on_the_day_it_was_reserved(self):
        gate = self.gate().ready()
        gate.clock.set('2026-10-08T20:59:59+00:00')  # 23:59:59 in Bucharest on 8 October.

        def after_midnight(_body, _key):
            gate.clock.set('2026-10-08T21:00:01+00:00')  # 00:00:01 on 9 October when the 429 comes back.
            return 429, dict(self.RATE_LIMITED)
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('u-late', dispatch=after_midnight)
        # It sits on 8 October's record at $0, and halts nothing.
        self.assertEqual(entry_of(gate, 'u-late')['state'], 'released_unbilled')
        self.assertEqual(gate.day('2026-10-08')['entries'].keys(), {'preview-test:' + SCOPE + ':u-late'})
        status = gate.status()
        self.assertEqual((status['state'], status['today'], status['today_unbilled_releases']), ('active', '2026-10-09', 0))

    def test_recovery_and_day_spend_ignore_the_zero_holds(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        gate.call('op-2', charge='0.01')
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0, 'unrecorded_uncertain': 0})
        self.assertEqual((gate.status()['state'], gate.status()['today_spend_usd']), ('active', '0.01'))
        broken = gate.day('2026-10-08')
        broken['entries']['preview-test:' + SCOPE + ':op-1']['held_usd'] = '0.01'
        with self.assertRaisesRegex(SafetyError, '^LEDGER_ENTRY_INVALID$'):
            bridge.day_spend(broken)

    def test_death_during_the_release_fails_closed_or_drops_a_complete_record(self):
        class Crash(BaseException):
            pass
        for writes_before_death, expected, state in ((0, ('halted', 'interrupted_call_uncertain'), 'uncertain'),
                                                     (1, ('halted', 'interrupted_call_uncertain'), 'uncertain'),
                                                     (2, ('active', None), 'released_unbilled')):
            with self.subTest(writes_before_death=writes_before_death):
                gate = self.gate().ready()
                real, written = bridge.helper.write_bytes, []

                def dying(dir_fd, name, data):
                    if len(written) >= writes_before_death:
                        raise Crash()
                    written.append(name)
                    return real(dir_fd, name, data)
                death = patch.object(bridge.helper, 'write_bytes', dying)

                def dispatch(_body, _key):
                    death.start()
                    return 429, dict(self.RATE_LIMITED)
                try:
                    with self.assertRaises(BaseException):
                        gate.call('op-1', dispatch=dispatch)
                finally:
                    death.stop()
                bridge.recover_interrupted(gate.private, now=gate.clock)
                status = gate.status()
                self.assertEqual(((status['state'], status['reason']), status['in_flight']), (expected, 0))
                self.assertEqual(entry_of(gate, 'op-1')['state'], state)

    def test_the_mechanism_is_the_profile_hook_for_any_provider(self):
        # PR B routes its own proved-unbilled replies through profile.unbilled_refusal: same entry. Review
        # 2026-10-12: profile.busy_refusal then picks the path, the model's cool-off (busy) or the unsent
        # streak (any other unbilled error); a busy hook that fails is doubt, which halts.
        for busy, code, streak, refusals in ((True, 'PROVIDER_REFUSED_UNBILLED', 0, 1), (False, 'PROVIDER_ERROR_UNBILLED', 1, None)):
            with self.subTest(busy=busy), patch.object(DEEPINFRA, 'unbilled_refusal', lambda status, _response: status == 503), \
                    patch.object(DEEPINFRA, 'busy_refusal', lambda _status, _response, answer=busy: answer):
                gate = self.gate().ready()
                with self.refused(code):
                    gate.call('op-1', dispatch=lambda _s, _k: (503, {'error': 'busy'}))
                entry = entry_of(gate, 'op-1')
                self.assertEqual((entry['state'], entry['held_usd'], entry['http_status']), ('released_unbilled', '0', 503))
                status = gate.status()
                self.assertEqual((status['state'], status['unsent_streak'], status['cooling'].get(MODEL, {}).get('refusals')),
                                 ('active', streak, refusals))

        def broken(_status, _response):
            raise ValueError('hook failed')
        with patch.object(DEEPINFRA, 'unbilled_refusal', lambda status, _response: status == 503), \
                patch.object(DEEPINFRA, 'busy_refusal', broken):
            gate = self.gate().ready()
            with self.refused('NEW_CHARGE_UNCERTAIN'):
                gate.call('op-1', dispatch=lambda _s, _k: (503, {'error': 'busy'}))
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'uncertain_charge'))


class ModelCoolingTests(GateTest):
    """Owner direction 2026-10-11: a vendor's unbilled refusals cool THAT model off; the gate never
    halts for them, other models are untouched, and every money rule stays as it was."""
    RATE_LIMITED = UnbilledRefusalTests.RATE_LIMITED
    START = '2026-10-08T09:00:00+00:00'

    def busy(self, sent=None):
        def dispatch(raw, _key):
            if sent is not None:
                sent.append(json.loads(raw)['model'])
            return 429, dict(self.RATE_LIMITED)
        return dispatch

    def refuse(self, gate, operation_id, model=MODEL):
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call(operation_id, value=body(model=model), dispatch=self.busy())

    def cooling(self, gate, operation_id, model=MODEL):
        """A refused MODEL_COOLING call: returns its retry_after, and proves nothing was sent or reserved."""
        sent, before, in_flight = [], gate.day('2026-10-08'), gate.status()['in_flight']
        with self.assertRaises(bridge.ModelCooling) as caught:
            gate.call(operation_id, value=body(model=model), dispatch=lambda *args: sent.append(args))
        self.assertEqual(str(caught.exception), 'MODEL_COOLING')
        self.assertEqual((sent, gate.day('2026-10-08'), gate.status()['in_flight']), ([], before, in_flight))
        return caught.exception.retry_after

    def record(self, gate, model=MODEL):
        return gate.control()['cooling'].get(model)

    def test_the_defaults_are_two_refusals_sixty_seconds_doubling_to_ten_minutes(self):
        self.assertEqual((bridge.COOL_OFF_AFTER_REFUSALS, bridge.COOL_OFF_FIRST_SECONDS, bridge.COOL_OFF_MAX_SECONDS),
                         (2, 60, 600))
        self.assertEqual(bridge.UNSENT_HALT_STREAK, 5)

    def test_one_refusal_does_not_cool_the_second_does_for_sixty_seconds_without_reserving(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.assertEqual(self.record(gate), {'refusals': 1, 'window_seconds': 0, 'until_utc': None, 'trial': None})
        self.refuse(gate, 'op-2')  # The app's one 60 s resend in real use; here at once.
        self.assertEqual(self.record(gate), {'refusals': 2, 'window_seconds': 60,
                                             'until_utc': '2026-10-08T09:01:00+00:00', 'trial': None})
        self.assertEqual(self.cooling(gate, 'op-3'), 60)
        later(gate, 20)
        self.assertEqual(self.cooling(gate, 'op-4'), 40)
        status = gate.status()
        self.assertEqual((status['state'], status['unsent_streak'], status['today_unbilled_releases'], status['today_posts']),
                         ('active', 0, 2, 0))
        self.assertEqual(status['cooling'][MODEL]['cooling_now'], True)
        # Refused calls leave no entry: only the two released refusals are on the record.
        self.assertEqual(len(gate.day('2026-10-08')['entries']), 2)

    def test_other_models_are_never_affected(self):
        gate = self.gate(enabled_models=ALL).ready()
        self.refuse(gate, 'glm-1')
        self.refuse(gate, 'glm-2')
        self.cooling(gate, 'glm-3')
        for model in (DEEPSEEK, MIMO, QWEN):
            self.assertEqual(gate.call('ok-' + model.split('/')[0], value=body(model=model))['status'], 200)
        self.refuse(gate, 'ds-1', DEEPSEEK)  # One refusal for DeepSeek: not cooling.
        self.assertEqual(gate.call('ds-2', value=body(model=DEEPSEEK))['status'], 200)
        self.assertEqual(set(gate.status()['cooling']), {MODEL})  # DeepSeek's settled reply cleared its count.
        self.cooling(gate, 'glm-4')

    def test_after_the_window_one_trial_goes_through_and_the_others_wait_for_it(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        later(gate, 60)
        seen = []

        def trial(_raw, _key):
            # While the trial is out, every other call for this model is still refused.
            seen.append(self.cooling(gate, 'op-other'))
            seen.append(self.record(gate)['trial'])
            return 200, provider_response('0.01', MODEL)
        self.assertEqual(gate.call('op-trial', dispatch=trial)['status'], 200)
        self.assertEqual(seen, [60, 'preview-test:' + SCOPE + ':op-trial'])
        # The trial settled: the cool-off and its count are gone, calls flow again.
        self.assertEqual(gate.status()['cooling'], {})
        self.assertEqual(gate.call('op-next')['status'], 200)
        self.refuse(gate, 'op-again')  # The count starts over: one refusal does not cool.
        self.assertEqual(gate.call('op-after')['status'], 200)

    def test_each_refused_trial_doubles_the_window_up_to_ten_minutes(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        windows = []
        for number, wait in enumerate((60, 120, 240, 480, 600, 600), start=3):
            later(gate, wait - 1)
            self.assertEqual(self.cooling(gate, 'early-%d' % number), 1)
            later(gate, 1)
            self.refuse(gate, 'trial-%d' % number)  # The trial reached the vendor, which refused again.
            windows.append((self.record(gate)['window_seconds'], self.cooling(gate, 'after-%d' % number)))
        self.assertEqual(windows, [(120, 120), (240, 240), (480, 480), (600, 600), (600, 600), (600, 600)])
        self.assertEqual((gate.status()['state'], gate.status()['today_unbilled_releases']), ('active', 8))

    def test_a_refused_call_that_was_already_in_flight_restarts_the_window_without_doubling(self):
        gate = self.gate().ready()

        def straggler(_raw, _key):
            # Two calls sent beside this one are refused first: the cool-off starts at 09:00:00.
            self.refuse(gate, 'op-b')
            self.refuse(gate, 'op-c')
            later(gate, 30)
            return 429, dict(self.RATE_LIMITED)
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-a', dispatch=straggler)
        self.assertEqual(self.record(gate), {'refusals': 3, 'window_seconds': 60,
                                             'until_utc': '2026-10-08T09:01:30+00:00', 'trial': None})
        self.assertEqual(self.cooling(gate, 'op-d'), 60)

    def test_a_trial_that_never_reached_the_vendor_lets_the_next_call_be_the_trial(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        later(gate, 60)
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('op-trial', dispatch=unreached)
        self.assertEqual((self.record(gate)['trial'], self.record(gate)['window_seconds']), (None, 60))
        self.assertEqual(gate.status()['unsent_streak'], 1)
        self.assertEqual(gate.call('op-next')['status'], 200)
        self.assertEqual(gate.status()['cooling'], {})

    def test_many_unbilled_refusals_never_halt_and_never_touch_the_unsent_streak(self):
        gate = self.gate(enabled_models=ALL).ready()
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('nr-1', dispatch=unreached)
        refusals = 0
        for round_number in range(25):
            for model in ALL:
                record = gate.control().get('cooling', {}).get(model)
                if record is None or record['until_utc'] is None \
                        or bridge.datetime.fromisoformat(record['until_utc']) <= gate.clock():
                    self.refuse(gate, 'r-%d-%s' % (round_number, model.split('/')[0]), model)
                    refusals += 1
                else:
                    self.cooling(gate, 'c-%d-%s' % (round_number, model.split('/')[0]), model)
            later(gate, 45)
        status = gate.status()
        self.assertEqual((status['state'], status['halts'], status['unsent_streak'], status['today_unbilled_releases']),
                         ('active', [], 1, refusals))
        self.assertGreater(refusals, 20)  # More than the old daily ceiling, from four models.

    def test_connect_failures_still_halt_at_five_and_unbilled_refusals_between_them_do_not_reset_it(self):
        gate = self.gate(enabled_models=ALL).ready()
        for number in range(1, 5):
            with self.refused('PROVIDER_NOT_REACHED'):
                gate.call('nr-%d' % number, dispatch=unreached)
            self.refuse(gate, 'u-%d' % number, DEEPSEEK if number % 2 else MIMO)
            later(gate, 601)
        self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', 4))
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('nr-5', dispatch=unreached)
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'provider_unreachable'))
        # A settled reply resets the streak (unchanged); here after re-opening.
        gate.activate()
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('nr-6', dispatch=unreached)
        gate.call('ok')
        self.assertEqual(gate.status()['unsent_streak'], 0)

    def test_a_probe_is_never_refused_for_a_cool_off_and_its_settled_reply_ends_it(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        self.cooling(gate, 'op-3')
        self.assertEqual(ProbeTests.probe(self, gate, MODEL)['entry_state'], 'settled')
        self.assertEqual(gate.status()['cooling'], {})
        self.assertEqual(gate.call('op-4')['status'], 200)

    def test_the_cool_off_survives_a_serve_restart_and_a_bad_record_refuses_the_state(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0, 'unrecorded_uncertain': 0})
        self.assertEqual(self.cooling(gate, 'op-3'), 60)
        for name, bad in (('window_without_until', {'refusals': 2, 'window_seconds': 60, 'until_utc': None, 'trial': None}),
                          ('over_the_cap', {'refusals': 2, 'window_seconds': 601, 'until_utc': self.START, 'trial': None}),
                          ('naive_time', {'refusals': 2, 'window_seconds': 60, 'until_utc': '2026-10-08T09:01:00', 'trial': None}),
                          ('extra_key', {'refusals': 2, 'window_seconds': 0, 'until_utc': None, 'trial': None, 'x': 1}),
                          ('not_a_record', 'cooling')):
            with self.subTest(name):
                self.assertFalse(bridge.cooling_valid({MODEL: bad}))
        self.assertFalse(bridge.cooling_valid([]))
        control = gate.control()
        control['cooling'][MODEL]['window_seconds'] = 601
        (gate.private / 'team-control.json').write_text(json.dumps(control))
        with self.refused('CONTROL_INVALID'):
            gate.status()

    def test_deepinfra_unbilled_refusals_are_all_busy(self):
        # Review 2026-10-12: DeepInfra's only unbilled refusal is its 429, which is always "busy".
        profile = bridge.helper.DeepInfraProfile()
        self.assertTrue(profile.unbilled_refusal(429, dict(self.RATE_LIMITED)))
        self.assertTrue(profile.busy_refusal(429, dict(self.RATE_LIMITED)))
        for status in (400, 404, 413, 500, 503):
            self.assertFalse(profile.unbilled_refusal(status, dict(self.RATE_LIMITED)))

    def test_a_later_stored_end_is_kept_when_a_refusal_would_end_the_window_sooner(self):
        moment = bridge.datetime.fromisoformat(self.START)
        control = {'cooling': {MODEL: {'refusals': 2, 'window_seconds': 60,
                                       'until_utc': '2026-10-08T09:05:00+00:00', 'trial': None}}, 'in_flight': {}}
        # A refusal of a call that was already in flight: now + 60 s is 09:01, the stored end 09:05 stays.
        bridge.note_unbilled_refusal(control, MODEL, 'straggler', moment)
        self.assertEqual(control['cooling'][MODEL], {'refusals': 3, 'window_seconds': 60,
                                                     'until_utc': '2026-10-08T09:05:00+00:00', 'trial': None})
        # And a later moment moves it on: max(now + window, stored end).
        bridge.note_unbilled_refusal(control, MODEL, 'straggler-2', moment + bridge.timedelta(seconds=290))
        self.assertEqual(control['cooling'][MODEL]['until_utc'], '2026-10-08T09:05:50+00:00')

    def test_a_stored_window_above_a_lower_future_maximum_is_clamped_on_read_not_refused(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        control = gate.control()
        control['cooling'][MODEL].update(window_seconds=600, until_utc='2026-10-08T09:10:00+00:00')
        (gate.private / 'team-control.json').write_text(json.dumps(control))
        with patch.object(bridge, 'COOL_OFF_MAX_SECONDS', 300):
            status = gate.status()  # Not CONTROL_INVALID.
            self.assertEqual((status['state'], status['cooling'][MODEL]['window_seconds'],
                              status['cooling'][MODEL]['cooling_now']), ('active', 300, True))
            self.assertEqual(self.cooling(gate, 'op-3'), 300)  # retry_after never above today's maximum.
            later(gate, 600)
            self.refuse(gate, 'trial')  # A refused trial doubles from the clamped 300, capped at 300.
            self.assertEqual((self.record(gate)['window_seconds'], self.record(gate)['until_utc']),
                             (300, '2026-10-08T09:15:00+00:00'))
        for window in (0, 1, 59, 600):
            self.assertTrue(bridge.cooling_valid({MODEL: {'refusals': 2, 'window_seconds': window,
                                                          'until_utc': None if window == 0 else self.START, 'trial': None}}))

    def test_activate_does_not_clear_a_cooling_model(self):
        gate = self.gate().ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        bridge.halt(gate.private, 'operator_stop', now=gate.clock)
        gate.activate()
        self.assertEqual(self.record(gate)['until_utc'], '2026-10-08T09:01:00+00:00')
        self.assertEqual(self.cooling(gate, 'op-3'), 60)

    def test_money_rules_are_unchanged_for_a_cooling_model(self):
        gate = self.gate(max_paid_posts_per_day=1).ready()
        self.refuse(gate, 'op-1')
        self.refuse(gate, 'op-2')
        later(gate, 60)
        # The trial is paid like any call: an overrun is charged and halts the whole gate.
        with self.refused('SETTLED_INTO_HALT'):
            gate.call('op-trial', charge='1.00')
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'charge_overrun'))
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('SETTLED_INTO_HALT'))),
                         {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})
        # The pot and call-count codes come before the cool-off (a cooling model on a spent day says so).
        other = self.gate(max_paid_posts_per_day=1, enabled_models=ALL).ready()
        self.refuse(other, 'u-1')
        self.refuse(other, 'u-2')
        other.call('paid', value=body(model=DEEPSEEK))
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            other.call('next')
        spent = self.gate(daily_budget_usd='0.08', max_concurrent_calls=1, enabled_models=[MODEL, DEEPSEEK]).ready()
        self.refuse(spent, 'u-1')
        self.refuse(spent, 'u-2')
        for number in range(4):  # $0.076 spent: GLM's $0.0167 hold no longer fits the $0.08 pot.
            spent.call('paid-%d' % number, value=body(model=DEEPSEEK), charge='0.019')
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            spent.call('next')


class UnsentBurstTests(GateTest):
    """Owner ruling O8 (spec 2026-10-12 parallel calls §3.4): failures of calls that were in flight
    together count once toward UNSENT_HALT_STREAK, so one network blip under 10 parallel calls does
    not halt the gate. Calls reserved one after another still count one each, as before."""

    def not_busy(self):
        # Anthropic's 400/500 shape: proved unbilled, not busy (release_unbilled(busy=False)).
        return patch.multiple(DEEPINFRA, unbilled_refusal=lambda status, _response: status == 500,
                              busy_refusal=lambda _status, _response: False)

    def burst(self, gate, count, failure, code, prefix='burst'):
        """count calls in flight at once (each reserved inside the previous one's dispatch), then, a
        moment later, all of them fail: the last reserved first, as one blip ends them all."""
        def nested(number):
            def dispatch(raw, key):
                if number < count:
                    with self.refused(code):
                        gate.call('%s-%d' % (prefix, number + 1), dispatch=nested(number + 1))
                else:
                    self.assertEqual(gate.status()['in_flight'], count)
                    later(gate, 5)
                return failure(raw, key)
            return dispatch
        with self.refused(code):
            gate.call('%s-1' % prefix, dispatch=nested(1))
        self.assertEqual(gate.status()['in_flight'], 0)

    def test_ten_calls_in_flight_that_all_fail_unsent_count_once(self):
        gate = self.gate(max_concurrent_calls=10).ready()
        self.burst(gate, 10, unreached, 'PROVIDER_NOT_REACHED')
        status = gate.status()
        self.assertEqual((status['state'], status['unsent_streak']), ('active', 1))
        self.assertEqual(gate.control()['unsent_counted_at'], '2026-10-08T09:00:05+00:00')

    def test_five_calls_each_reserved_after_the_previous_failure_still_halt(self):
        # Today's rule for serial calls. The clock does not move here: a call reserved at the same
        # instant as the counted failure is not one that was in flight with it, so it counts.
        gate = self.gate().ready()
        for number in range(1, 5):
            with self.refused('PROVIDER_NOT_REACHED'):
                gate.call('nr-%d' % number, dispatch=unreached)
            self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', number))
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('nr-5', dispatch=unreached)
        self.assertEqual((gate.status()['state'], gate.status()['reason'], gate.status()['unsent_streak']),
                         ('halted', 'provider_unreachable', 5))

    def test_a_settled_reply_between_failures_resets_the_streak_and_the_counted_time(self):
        gate = self.gate().ready()

        def straggler(raw, key):
            # A call sent beside this one fails (counted), a later call settles, then this one fails.
            # op-b is reserved a second AFTER op-a, so op-a's own failure counts only if the settled
            # reply popped unsent_counted_at (else op-a, reserved before it, would read as in flight with it).
            later(gate, 1)
            with self.refused('PROVIDER_NOT_REACHED'):
                gate.call('op-b', dispatch=unreached)
            self.assertEqual((gate.status()['unsent_streak'], gate.control()['unsent_counted_at']),
                             (1, '2026-10-08T09:00:01+00:00'))
            later(gate, 5)
            self.assertEqual(gate.call('op-c')['status'], 200)
            self.assertEqual(gate.status()['unsent_streak'], 0)
            self.assertNotIn('unsent_counted_at', gate.control())
            later(gate, 5)
            return unreached(raw, key)
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('op-a', dispatch=straggler)
        # It was in flight with op-b, but a settled reply came between: it starts a new streak.
        self.assertEqual((gate.status()['unsent_streak'], gate.control()['unsent_counted_at']),
                         (1, '2026-10-08T09:00:11+00:00'))

    def test_not_busy_unbilled_errors_of_calls_in_flight_together_count_once(self):
        def failing(_raw, _key):
            return 500, {'type': 'error', 'error': {'type': 'api_error', 'message': 'Internal server error'}}
        with self.not_busy():
            gate = self.gate(max_concurrent_calls=10).ready()
            self.burst(gate, 10, failing, 'PROVIDER_ERROR_UNBILLED')
            self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', 1))
            # Mixed with a connect failure in the same burst: still one.
            later(gate, 1)
            self.burst(gate, 2, unreached, 'PROVIDER_NOT_REACHED', prefix='mixed')
            self.assertEqual(gate.status()['unsent_streak'], 2)
            for number in range(3, 6):  # Serial not-busy errors: one each, halting at five.
                later(gate, 1)
                with self.refused('PROVIDER_ERROR_UNBILLED'):
                    gate.call('serial-%d' % number, dispatch=failing)
            status = gate.status()
            self.assertEqual((status['state'], status['reason'], status['unsent_streak']),
                             ('halted', 'provider_unreachable', 5))
            self.assertEqual(status['today_unbilled_releases'], 13)


class HaltedRefusalTests(GateTest):
    """AUTHORITY_HALTED: the state check found the gate halted before anything was reserved."""

    def complete(self, gate, operation_id, dispatch):
        """One POST /complete through the real IPC handler; returns (status line, reply)."""
        server_side, client_side = socket.socketpair()
        data = json.dumps(envelope(body(), operation_id)).encode()
        client_side.sendall(b'POST /complete HTTP/1.0\r\nContent-Type: application/json\r\nContent-Length: '
                            + str(len(data)).encode() + b'\r\n\r\n' + data)

        def execute(request, peer_uid, cancelled, on_reserved):
            return bridge.execute_request(gate.private, gate.go_path, request, peer_uid=peer_uid, slots=gate.slots,
                                          dispatch=dispatch, key_loader=lambda _: KEY, host=HOST, platform='linux',
                                          now=gate.clock, cancelled=cancelled, on_reserved=on_reserved)
        handler = bridge.make_handler(gate.private, [PEER], execute, gate.slots, peer_uid_of=lambda _connection: PEER,
                                      now=gate.clock)
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

    def test_a_halted_gate_refuses_authority_halted_before_reserving_and_adds_no_halt(self):
        gate = self.gate().ready()
        bridge.stop_authority(gate.private, now=gate.clock)
        before, sent = gate.snapshot(), []
        line, reply = self.complete(gate, 'op-1', lambda *args: sent.append(args))
        self.assertEqual((line, reply, sent), (b'HTTP/1.0 409 Conflict', {'error': 'AUTHORITY_HALTED'}, []))
        self.assertEqual(gate.snapshot(), before)  # Nothing reserved, no ipc halt added.
        self.assertEqual([halt['reason'] for halt in gate.status()['halts']], ['operator_stop'])

    def test_a_cooling_refusal_crosses_ipc_with_retry_after_and_adds_no_halt(self):
        gate = self.gate().ready()
        for number in (1, 2):
            self.complete(gate, 'u-%d' % number, lambda _raw, _key: (429, dict(UnbilledRefusalTests.RATE_LIMITED)))
        later(gate, 15)
        line, reply = self.complete(gate, 'op-3', no_network)
        self.assertEqual((line, reply), (b'HTTP/1.0 409 Conflict', {'error': 'MODEL_COOLING', 'retry_after': 45}))
        self.assertEqual((gate.status()['state'], gate.status()['halts']), ('active', []))

    def test_a_halt_after_a_reservation_stays_opaque(self):
        gate = self.gate().ready()
        line, reply = self.complete(gate, 'op-1', lambda _raw, _key: (200, provider_response('1.00', MODEL)))
        self.assertEqual((line, reply), (b'HTTP/1.0 409 Conflict', {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'}))
        self.assertEqual(gate.status()['reason'], 'charge_overrun')
        line, reply = self.complete(gate, 'op-2', no_network)  # Now the state check says it.
        self.assertEqual(reply, {'error': 'AUTHORITY_HALTED'})

    def test_a_changed_go_or_a_stopping_server_stays_opaque(self):
        gate = self.gate().ready()
        gate.go_path = gate.write_go(name='other.json', daily_budget_usd='4.00')
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-1')
        self.assertEqual(json.loads(bridge.refusal_body(SafetyError('AUTHORITY_STOPPED'))),
                         {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})


class ServerErrorBookedTests(GateTest):
    """Owner ruling 2026-10-15 (option A): a DeepInfra server error (HTTP 500 to 599) with no billing field
    anywhere in it is booked at its reservation, as a connection that failed after the send is
    (settled_reserved_max), and the gate stays active. Seen live: GLM answered 500 after about 31 s with no
    usage and no model (2026-10-14 23:52 and 2026-10-15 07:10 UTC), and each answer halted every DeepInfra
    model until a re-open. A 4xx still halts; an answer or a server error that names a billing field but has no
    usable counts is booked as unreported since owner answer M3 (UnreportedChargeBookedTests)."""
    SERVER_ERROR = {'error': {'message': 'Internal Server Error', 'type': 'server_error', 'code': 500}}
    complete = HaltedRefusalTests.complete

    def answering(self, status, reply):
        return lambda _sent, _key: (status, wire(reply))

    def assert_booked(self, gate, status, operation_id='op-1'):
        entry = entry_of(gate, operation_id)
        self.assertEqual((entry['state'], entry['reason'], entry['http_status']),
                         ('settled_reserved_max', 'vendor_server_error', status))
        self.assertEqual((Decimal(entry['held_usd']), Decimal(entry['reserved_usd'])), (RESERVED, RESERVED))
        report = gate.status()
        self.assertEqual((report['state'], report['reason'], report['halts'], report['in_flight'], report['today_uncertain']),
                         ('active', None, [], 0, 0))
        self.assertEqual((report['today_booked_max'], Decimal(report['today_booked_max_usd'])), (1, RESERVED))
        return entry

    def assert_halted_uncertain(self, gate):
        report = gate.status()
        self.assertEqual((report['state'], report['reason'], report['today_booked_max']), ('halted', 'uncertain_charge', 0))
        self.assertEqual(entry_of(gate, 'op-1')['state'], 'uncertain')

    def test_a_server_error_without_billing_data_is_booked_at_its_reservation_and_the_gate_stays_active(self):
        for status, reply in ((500, self.SERVER_ERROR), (502, {'detail': 'Bad Gateway'}), (503, self.SERVER_ERROR),
                              (504, {'_invalid_json': True}), (529, self.SERVER_ERROR), (599, {})):
            with self.subTest(status=status):
                gate = self.gate().ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    gate.call('op-1', dispatch=self.answering(status, reply))
                self.assert_booked(gate, status)
                self.assertEqual(gate.call('op-2')['status'], 200)  # Every model keeps working.

    def test_the_booking_keeps_a_short_redacted_vendor_error_and_journals_the_alert(self):
        gate = self.gate().ready()
        reply = {'error': {'message': 'Internal failure for ' + KEY, 'type': 'server_error', 'code': 500}}
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            gate.call('op-1', dispatch=self.answering(500, reply))
        entry = self.assert_booked(gate, 500)
        self.assertEqual((entry['vendor_error']['type'], entry['vendor_error']['code']), ('server_error', '500'))
        self.assertTrue(entry['vendor_error']['message'].startswith('Internal failure for '))
        self.assertNotIn(KEY, json.dumps(gate.day('2026-10-08')))
        logged = [json.loads(line) for line in self.out.getvalue().splitlines() if line.startswith('{')]
        booked = [line for line in logged if line.get('status') == 'settled_reserved_max']
        self.assertEqual(len(booked), 1)
        self.assertEqual({name: booked[0][name] for name in ('model', 'alert', 'reason', 'http_status', 'authority')},
                         {'model': MODEL, 'alert': 'charge_booked_at_reservation', 'reason': 'vendor_server_error',
                          'http_status': 500, 'authority': 'active'})
        self.assertEqual(Decimal(booked[0]['booked_usd']), RESERVED)
        self.assertNotIn(KEY, self.out.getvalue())

    def test_a_server_error_carrying_any_billing_field_is_settled_or_booked_as_unreported(self):
        usage = {'prompt_tokens': 10, 'completion_tokens': 0}
        settled = {**self.SERVER_ERROR, 'model': MODEL, 'usage': usage}
        gate = self.gate().ready()
        with self.refused('SETTLED_INTO_HALT'):
            gate.call('op-1', dispatch=self.answering(500, settled))
        self.assertEqual((entry_of(gate, 'op-1')['state'], gate.status()['reason']), ('settled', 'provider_error_or_model_identity'))
        for name, reply in (('choices', {**self.SERVER_ERROR, 'choices': []}),
                            ('nested_cost', {'error': {'message': 'failed', 'detail': {'estimated_cost': 0}}}),
                            ('cost', {**self.SERVER_ERROR, 'cost': 0}),
                            ('inference_status', {**self.SERVER_ERROR, 'inference_status': {'cost': 0.0001}}),
                            ('tokens_generated', {**self.SERVER_ERROR, 'meta': {'tokens_generated': 3}}),
                            # Judged on the raw reply: redaction would drop this 'headers' subtree.
                            ('usage_under_redacted_key', {**self.SERVER_ERROR, 'headers': {'usage': usage}})):
            with self.subTest(name):
                gate = self.gate().ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    gate.call('op-1', dispatch=self.answering(503, reply))
                entry = entry_of(gate, 'op-1')
                # Owner answer M3 (2026-10-15): no usable counts and no cost above the hold: booked as unreported.
                self.assertEqual((entry['state'], entry['reason'], entry['http_status'], Decimal(entry['held_usd'])),
                                 ('settled_reserved_max', 'charge_unreported', 503, RESERVED))
                self.assertEqual((gate.status()['state'], gate.status()['today_booked_max']), ('active', 1))

    def test_a_client_error_or_a_status_outside_2xx_and_5xx_without_usage_still_halts(self):
        for status in (400, 401, 402, 403, 404, 408, 413, 422, 499, 600):
            with self.subTest(status=status):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.call('op-1', dispatch=self.answering(status, self.SERVER_ERROR))
                self.assert_halted_uncertain(gate)

    def test_only_the_deepinfra_profile_books_a_server_error(self):
        self.assertTrue(DEEPINFRA.bookable_server_error(500, dict(self.SERVER_ERROR)))
        self.assertTrue(DEEPINFRA.bookable_server_error(599, {'_invalid_json': True}))
        for status, reply in ((499, self.SERVER_ERROR), (600, self.SERVER_ERROR), (429, self.SERVER_ERROR),
                              (True, self.SERVER_ERROR), ('500', self.SERVER_ERROR), (500.0, self.SERVER_ERROR),
                              (500, ['not', 'an', 'object']), (500, {**self.SERVER_ERROR, 'usage': None}),
                              (500, {'error': {'tokens_input': 1}})):
            with self.subTest(status=status, reply=reply):
                self.assertFalse(DEEPINFRA.bookable_server_error(status, reply))
        # Owner ruling 2026-10-15: Haiku's gate has no bookable_server_error. Since owner answer M3 (ruling R1, 2026-10-16) its
        # server errors without any billing field are booked through bookable_unreported (UnreportedChargeBookedTests).
        self.assertIsNone(getattr(bridge.helper.PROFILES['anthropic'], 'bookable_server_error', None))
        self.assertTrue(callable(getattr(bridge.helper.PROFILES['anthropic'], 'bookable_unreported', None)))

    def test_a_failing_hook_is_uncertain_and_halts(self):
        gate = self.gate().ready()
        with patch.object(DEEPINFRA, 'bookable_server_error', side_effect=RuntimeError('synthetic')), \
                self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=self.answering(500, self.SERVER_ERROR))
        self.assert_halted_uncertain(gate)

    def test_through_ipc_the_caller_sees_the_booked_code_and_no_delivery_halt_is_added(self):
        # Live, the halt was journaled twice: uncertain_charge, then ipc_or_delivery_failure for the same call.
        gate = self.gate().ready()
        line, reply = self.complete(gate, 'op-1', self.answering(500, self.SERVER_ERROR))
        self.assertEqual((line, reply), (b'HTTP/1.0 409 Conflict', {'error': 'PROVIDER_CHARGE_BOOKED_MAX'}))
        self.assert_booked(gate, 500)

    def test_a_booked_server_error_neither_grows_nor_resets_the_unsent_streak_and_never_cools_the_model(self):
        gate = self.gate().ready()
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('op-0', dispatch=unreached)
        for operation_id in ('op-1', 'op-2'):
            with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                gate.call(operation_id, dispatch=self.answering(500, self.SERVER_ERROR))
        control = gate.control()
        self.assertEqual((control['unsent_streak'], control.get('cooling', {}), control['state']), (1, {}, 'active'))


class UnreportedChargeBookedTests(GateTest):
    """Owner answer M3 (2026-10-15; OVERVIEW B-3; rulings R2, R3 and 16b, 2026-10-16): a paid answer whose usage or cost
    is unreported (status 200 to 299, or a server error that names a billing field) is booked at its reservation
    (settled_reserved_max, reason charge_unreported) and the gate stays active, as long as nothing in it says it cost
    more. A reported cost or readable counts above the reservation, a cost that is not a plain amount and every 4xx
    still halt (a real overcharge, or a key or billing problem root must see)."""
    complete = HaltedRefusalTests.complete

    def answering(self, status, reply):
        return lambda _sent, _key: (status, wire(reply))

    def assert_booked(self, gate, status, operation_id='op-1'):
        entry = entry_of(gate, operation_id)
        self.assertEqual((entry['state'], entry['reason'], entry['http_status']), ('settled_reserved_max', 'charge_unreported', status))
        self.assertEqual((Decimal(entry['held_usd']), Decimal(entry['reserved_usd'])), (RESERVED, RESERVED))
        report = gate.status()
        self.assertEqual((report['state'], report['reason'], report['halts'], report['in_flight'], report['today_uncertain']),
                         ('active', None, [], 0, 0))
        self.assertEqual((report['today_booked_max'], Decimal(report['today_booked_max_usd']), Decimal(report['today_spend_usd'])),
                         (1, RESERVED, RESERVED))
        return entry

    def assert_halted_uncertain(self, gate, reason='usage_or_cost_unreported'):
        report = gate.status()
        self.assertEqual((report['state'], report['reason'], report['today_booked_max']), ('halted', 'uncertain_charge', 0))
        # Fix round 1 (review 2026-10-16): a reply that is not booked keeps the reason assess_reply gave it.
        self.assertEqual((entry_of(gate, 'op-1')['state'], entry_of(gate, 'op-1')['reason']), ('uncertain', reason))

    def test_an_answer_without_accountable_usage_is_booked_at_its_reservation_and_the_gate_stays_active(self):
        for name, reply in (('no_usage', provider_response(None)),
                            ('usage_null', {**provider_response(None), 'usage': None}),
                            ('not_json', {'_invalid_json': True}),
                            ('totals_off', {'model': MODEL, 'usage': {'prompt_tokens': 100, 'completion_tokens': 50, 'total_tokens': 151}}),
                            ('cost_within_the_hold', {'model': MODEL, 'usage': {'estimated_cost': '0.01'}})):
            with self.subTest(name):
                gate = self.gate().ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    gate.call('op-1', dispatch=self.answering(200, reply))
                self.assert_booked(gate, 200)
                self.assertEqual(gate.call('op-2')['status'], 200)  # Every model keeps working.
        gate = self.gate().ready()  # Any 2xx is an answer.
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            gate.call('op-1', dispatch=self.answering(203, provider_response(None)))
        self.assert_booked(gate, 203)

    def test_a_server_error_naming_a_billing_field_without_usable_counts_is_booked_and_the_streak_stays(self):
        gate = self.gate().ready()
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call('op-0', dispatch=unreached)
        error = {'error': {'message': 'Internal Server Error', 'type': 'server_error'}}
        for operation_id, status, reply in (('op-1', 502, {**error, 'choices': []}),
                                            ('op-2', 503, {**error, 'usage': {'prompt_tokens': 'many'}}),
                                            ('op-3', 500, {**error, 'inference_status': {'cost': 0.0001}})):
            self.assertFalse(DEEPINFRA.bookable_server_error(status, wire(reply)))  # It names a billing field.
            with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                gate.call(operation_id, dispatch=self.answering(status, reply))
            entry = entry_of(gate, operation_id)
            self.assertEqual((entry['state'], entry['reason'], entry['http_status']), ('settled_reserved_max', 'charge_unreported', status))
        control = gate.control()
        # A booking neither grows nor resets the unsent streak and never cools the model.
        self.assertEqual((control['unsent_streak'], control.get('cooling', {}), control['state']), (1, {}, 'active'))
        self.assertEqual(gate.status()['today_booked_max'], 3)

    def test_a_cost_or_count_above_the_reservation_an_unreadable_cost_or_a_4xx_still_halts(self):
        over = str(RESERVED + Decimal('0.000000001'))
        for name, status, reply in (
                ('reported_cost_above', 200, {'model': MODEL, 'usage': {'estimated_cost': over}}),
                ('nested_cost_above', 503, {'error': {'message': 'failed'}, 'inference_status': {'cost': '1.00'}}),
                # 40,000 output tokens at GLM's 0.50 per million are $0.02, above the hold of about $0.0167.
                ('counts_priced_above', 200, {'model': MODEL, 'usage': {'prompt_tokens': 10, 'completion_tokens': 40000, 'total_tokens': 1}}),
                ('cost_not_an_amount', 200, {'model': MODEL, 'usage': {'estimated_cost': 'about a cent'}}),
                # Controller ruling (2026-10-16): another model may bill above this row's prices: never booked.
                ('another_model_no_usage', 200, {'model': 'other/model'}),
                # Fix round 1 (review 2026-10-16): M3 books a reply that carries NO usable bill, never one that carries
                # evidence of a bigger one. total_tokens implies 4,999,980 output tokens ($2.50 at GLM's 0.50).
                ('total_implies_more_output', 200, {'model': MODEL, 'usage': {'prompt_tokens': 10, 'completion_tokens': 10,
                                                                               'total_tokens': 5000000}}),
                ('count_a_float', 200, {'model': MODEL, 'usage': {'prompt_tokens': 10, 'completion_tokens': 400000.0}}),
                ('count_numeric_text', 200, {'model': MODEL, 'usage': {'prompt_tokens': '10', 'completion_tokens': 10}}),
                ('cost_like_numeric_text', 200, {'model': MODEL, 'usage': {'total_cost': '5.00'}}),
                # The largest whole reasoning count counts, even when its other copy cannot be read.
                ('reasoning_in_details_above', 200, {'model': MODEL, 'usage': {
                    'prompt_tokens': 10, 'completion_tokens': 10, 'completion_tokens_details': {'reasoning_tokens': 400000},
                    'reasoning_tokens': 'x'}}),
                ('cost_an_object', 200, {'model': MODEL, 'usage': {'estimated_cost': {'usd': '5.00'}}}),
                ('cost_a_list', 200, {'model': MODEL, 'usage': {'estimated_cost': ['5.00']}}),
                ('tokens_member_above', 503, {'error': {'message': 'x'}, 'inference_status': {'tokens_generated': 5000000,
                                                                                               'tokens_input': 10}}),
                ('tokens_member_text', 503, {'error': {'message': 'x'}, 'inference_status': {'tokens_generated': '12'}}),
                ('tokens_member_float', 503, {'error': {'message': 'x'}, 'inference_status': {'tokens_generated': 12.0}}),
                # Ruling R2 (2026-10-16): a 4xx without usage is not a paid post; a broken key needs root.
                ('400', 400, {'error': {'message': 'bad request'}}),
                ('401', 401, {'error': {'message': 'invalid key'}}),
                ('402', 402, {'error': {'message': 'payment required'}}),
                ('403', 403, {'error': {'message': 'forbidden'}}),
                ('422', 422, {'error': {'message': 'unprocessable'}})):
            with self.subTest(name):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.call('op-1', dispatch=self.answering(status, reply))
                self.assert_halted_uncertain(gate)

    def test_through_ipc_the_caller_sees_the_booked_code_and_the_journal_names_the_reason(self):
        gate = self.gate().ready()
        line, reply = self.complete(gate, 'op-1', self.answering(200, provider_response(None)))
        self.assertEqual((line, reply), (b'HTTP/1.0 409 Conflict', {'error': 'PROVIDER_CHARGE_BOOKED_MAX'}))
        self.assert_booked(gate, 200)
        logged = [json.loads(text) for text in self.out.getvalue().splitlines() if text.startswith('{')]
        booked = [entry for entry in logged if entry.get('status') == 'settled_reserved_max']
        self.assertEqual(len(booked), 1)
        self.assertEqual({name: booked[0][name] for name in ('model', 'alert', 'reason', 'http_status', 'authority')},
                         {'model': MODEL, 'alert': 'charge_booked_at_reservation', 'reason': 'charge_unreported',
                          'http_status': 200, 'authority': 'active'})
        self.assertEqual(Decimal(booked[0]['booked_usd']), RESERVED)
        self.assertNotIn('ipc_or_delivery_failure', self.out.getvalue())

    def test_a_failing_hook_is_uncertain_and_halts(self):
        gate = self.gate().ready()
        with patch.object(DEEPINFRA, 'bookable_unreported', side_effect=RuntimeError('synthetic')), \
                self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=self.answering(200, provider_response(None)))
        self.assert_halted_uncertain(gate, 'accounting_failure')


class ReasoningTokenTests(GateTest):
    """Round 2 review: reasoning tokens reported outside completion_tokens are charged as output."""

    def account(self, usage):
        return bridge.helper.account_response({'usage': usage}, Decimal('1'), Decimal('2'))

    def test_reasoning_is_charged_on_top_unless_the_total_proves_it_inside(self):
        base = {'prompt_tokens': 100, 'completion_tokens': 50}
        cases = {
            'no_reasoning': ({}, 50),
            'total_proves_inside': ({'total_tokens': 150, 'completion_tokens_details': {'reasoning_tokens': 30}}, 50),
            'no_total_details': ({'completion_tokens_details': {'reasoning_tokens': 30}}, 80),
            'no_total_top_level': ({'reasoning_tokens': 30}, 80),
            'larger_than_completion': ({'total_tokens': 150, 'completion_tokens_details': {'reasoning_tokens': 70}}, 120),
            'larger_no_total': ({'reasoning_tokens': 70}, 120),
            'total_counts_it_outside': ({'total_tokens': 180, 'reasoning_tokens': 30}, 80),
            'both_places_larger_wins': ({'reasoning_tokens': 40, 'completion_tokens_details': {'reasoning_tokens': 30}}, 90),
            'zero_reasoning_no_total': ({'reasoning_tokens': 0}, 50),
        }
        for name, (extra, output) in cases.items():
            with self.subTest(name):
                accounting = self.account({**base, **extra})
                self.assertIs(accounting['usage_valid'], True)
                self.assertEqual(accounting['billed_output_tokens'], output)
                self.assertEqual(Decimal(accounting['guard_charge_usd']), (100 + Decimal(output) * 2) / Decimal(1000000))

    def test_counts_that_do_not_add_up_stay_invalid(self):
        for name, usage in (('total_off', {'prompt_tokens': 100, 'completion_tokens': 50, 'total_tokens': 151}),
                            ('total_off_with_reasoning', {'prompt_tokens': 100, 'completion_tokens': 50, 'total_tokens': 170,
                                                          'reasoning_tokens': 30}),
                            ('reasoning_text', {'prompt_tokens': 100, 'completion_tokens': 50, 'reasoning_tokens': '30'}),
                            ('reasoning_negative', {'prompt_tokens': 100, 'completion_tokens': 50,
                                                    'completion_tokens_details': {'reasoning_tokens': -1}})):
            with self.subTest(name):
                accounting = self.account(usage)
                self.assertEqual((accounting['usage_valid'], accounting['guard_charge_usd']), (False, None))

    def test_a_call_without_total_is_settled_with_its_reasoning(self):
        gate = self.gate().ready()
        gate.call('op-1', dispatch=lambda _s, _k: (200, {'model': MODEL, 'usage': {
            'prompt_tokens': 1000, 'completion_tokens': 100, 'completion_tokens_details': {'reasoning_tokens': 400}}}))
        # 1000 x 0.15 + (100 + 400) x 0.50, per million.
        self.assertEqual(Decimal(entry_of(gate, 'op-1')['held_usd']), Decimal('0.0004'))


class TeamTotalTests(GateTest):
    """Round 2 review, figures from the owner's ruling of 2026-10-10 as raised by owner answer M1 (2026-10-15): one GO
    is at most $12.00 a day (MAX_GO_BUDGET_USD), and activate adds the other gates' GOs to stay within the team total,
    $16.00 (DeepInfra $12.00 + Anthropic $4.00) and, since the owner's answer of 2026-10-30 (Q12), $17.00 (+ Perplexity
    $1.00) (a fixed, reviewed list; tests reach it only through activate's seam)."""

    def other_go(self, gate, provider, budget='1.50', **fields):
        path = gate.root / ('team-go-' + provider + '.json')
        path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': provider,
                                    'daily_budget_usd': budget, **fields}))
        os.chmod(path, 0o600)
        return path

    def test_one_go_is_capped_at_twelve_dollars_and_the_team_total_is_seventeen(self):
        self.assertEqual((bridge.MAX_GO_BUDGET_USD, bridge.TEAM_TOTAL_BUDGET_USD), (Decimal('12.00'), Decimal('17.00')))
        gate = self.gate()
        self.assertEqual(bridge.read_go(gate.write_go(name='ok.json', daily_budget_usd='12.00'))['daily_budget_usd'], '12.00')
        for budget in ('12.01', '16.00', '50.00'):
            with self.subTest(budget=budget), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', daily_budget_usd=budget))

    def test_missing_other_gos_count_zero_and_the_sum_may_reach_the_total(self):
        gate = self.gate(daily_budget_usd='12.00').ready()  # No other GO exists.
        self.assertEqual(gate.status()['state'], 'active')
        self.other_go(gate, 'anthropic', '4.00')
        bridge.stop_authority(gate.private, now=gate.clock)
        self.assertEqual(gate.activate()['state'], 'active')  # 12.00 + 4.00 = 16.00 exactly.
        self.assertEqual(bridge.team_total(gate.go, {'deepinfra': str(gate.go_path),
                                                     'anthropic': str(gate.root / 'team-go-anthropic.json')},
                                           os.getuid()), Decimal('16.00'))

    def test_a_sum_over_the_team_total_refuses(self):
        for others in ({'anthropic': '4.01', 'perplexity': '1.00'}, {'anthropic': '3.50', 'google': '1.51'},
                       {'google': '12.00'}, {'anthropic': '4.00', 'perplexity': '1.01'}):
            with self.subTest(others=others):
                gate = self.gate(daily_budget_usd='12.00')
                gate.init()
                for provider, budget in others.items():
                    self.other_go(gate, provider, budget)
                with self.refused('TEAM_TOTAL_BUDGET_EXCEEDED'):
                    gate.activate()
                self.assertEqual(gate.control()['state'], 'initialized')

    def test_the_owners_pots_twelve_plus_four_plus_one_reach_the_total_and_one_cent_more_refuses(self):
        # Owner answer M1 (2026-10-15): DeepInfra $12.00 (2,000 calls, 10 at once, all four models), Anthropic $4.00;
        # owner answer Q12 (2026-10-30): Perplexity $1.00, the team total $17.00.
        proposed = {'daily_budget_usd': '12.00', 'max_paid_posts_per_day': 2000, 'max_concurrent_calls': 10,
                    'enabled_models': ALL}
        gate = self.gate(**proposed)
        gate.init()
        self.other_go(gate, 'anthropic', '4.00')
        self.other_go(gate, 'perplexity', '1.00')
        self.assertEqual(gate.activate()['state'], 'active')  # 12.00 + 4.00 + 1.00 = 17.00 exactly.
        gate = self.gate(**proposed)
        gate.init()
        self.other_go(gate, 'anthropic', '4.01')
        self.other_go(gate, 'perplexity', '1.00')
        with self.refused('TEAM_TOTAL_BUDGET_EXCEEDED'):  # 12.00 + 4.01 + 1.00 = 17.01.
            gate.activate()
        self.assertEqual(gate.control()['state'], 'initialized')
        # A DeepInfra GO of 12.01 never gets as far as the sum: one GO is at most $12.00.
        with self.refused('ROOT_GO_INVALID'):
            bridge.read_go(gate.write_go(name='over.json', **{**proposed, 'daily_budget_usd': '12.01'}))
        # The same sum seen from the Anthropic side: its 4.01 beside DeepInfra's 12.00 is over too.
        anthropic = {'provider': 'anthropic', 'daily_budget_usd': '4.01'}
        self.assertEqual(bridge.team_total(anthropic, {'deepinfra': str(self.other_go(gate, 'deepinfra', '12.00'))},
                                           os.getuid()), Decimal('16.01'))

    def test_this_providers_own_listed_go_is_not_counted_twice(self):
        gate = self.gate(daily_budget_usd='10.00')
        gate.init()
        self.other_go(gate, 'deepinfra', '10.00')  # The old GO of this same gate: replaced, not added.
        self.assertEqual(gate.activate()['state'], 'active')

    def test_an_unreadable_or_invalid_other_go_refuses(self):
        def spoil(name):
            def apply(gate):
                path = self.other_go(gate, 'anthropic')
                if name == 'not_json':
                    path.write_text('{')
                elif name == 'not_object':
                    path.write_text('[]')
                elif name == 'wrong_provider':
                    path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': 'google',
                                                'daily_budget_usd': '1.00'}))
                elif name == 'wrong_schema':
                    path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v2', 'provider': 'anthropic',
                                                'daily_budget_usd': '1.00'}))
                elif name == 'budget_number':
                    path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': 'anthropic',
                                                'daily_budget_usd': 1.0}))
                elif name == 'budget_over_cap':
                    path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': 'anthropic',
                                                'daily_budget_usd': '50.00'}))
                elif name == 'budget_over_go_cap':  # One cent over the $12.00 a single GO may ask for.
                    path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': 'anthropic',
                                                'daily_budget_usd': '12.01'}))
                elif name == 'too_large':
                    path.write_text(' ' * (bridge.TEAM_GO_BYTES + 1))
                elif name == 'group_writable':
                    os.chmod(path, 0o620)
                elif name == 'symlink':
                    target = gate.root / 'real-anthropic.json'
                    path.rename(target)
                    path.symlink_to(target)
                elif name == 'folder':
                    path.unlink()
                    path.mkdir()
                elif name == 'unreadable':
                    os.chmod(path, 0o000)
            return apply
        names = ['not_json', 'not_object', 'wrong_provider', 'wrong_schema', 'budget_number', 'budget_over_cap',
                 'budget_over_go_cap', 'too_large', 'group_writable', 'symlink', 'folder']
        if os.getuid() != 0:
            names.append('unreadable')  # Root reads a mode-0000 file.
        for name in names:
            with self.subTest(name):
                gate = self.gate(daily_budget_usd='1.00')
                gate.init()
                spoil(name)(gate)
                with self.refused('TEAM_TOTAL_UNVERIFIABLE'):
                    gate.activate()
                self.assertEqual(gate.control()['state'], 'initialized')
        gate = self.gate(daily_budget_usd='1.00')
        gate.init()
        self.other_go(gate, 'anthropic')
        with self.refused('TEAM_TOTAL_UNVERIFIABLE'):  # Owned by the developer, not by root.
            gate.activate(owner_uid=os.getuid() + 1)

    def test_the_list_is_the_reviewed_gate_table_and_only_a_test_seam_overrides_it(self):
        self.assertEqual({name: go for name, (_private, go) in bridge.GATE_PATHS.items()}, {
            'deepinfra': '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json',
            'anthropic': '/etc/debateai-v3-preview/provider-anthropic-go-v1.json',
            'perplexity': '/etc/debateai-v3-preview/provider-perplexity-go-v1.json',
            'google': '/etc/debateai-v3-preview/provider-google-go-v1.json'})
        text = SOURCE.read_text()
        self.assertIn('result = activate(args.private, args.go)\n', text)  # main() passes no seam.
        self.assertNotIn('os.environ', text)


class ProbeFenceTests(GateTest):
    """Round 2 review: a probe refuses unless it runs inside the fenced transient unit."""

    def fence(self, gate, provider='deepinfra', cgroup=None, status=None):
        proc = gate.root / 'proc'
        (proc / 'self').mkdir(parents=True, exist_ok=True)
        unit = bridge.probe_unit_name(provider)
        (proc / 'self/cgroup').write_text('0::/system.slice/%s\n' % unit if cgroup is None else cgroup)
        (proc / 'self/status').write_text('Name:\tpython3\nNoNewPrivs:\t1\nCapEff:\t0000000000000000\n'
                                          'CapBnd:\t0000000000000000\n' if status is None else status)
        paths = {name: (str(gate.root / name / 'private'), str(gate.root / name / 'go.json'))
                 for name in ('deepinfra', 'anthropic', 'google')}
        return proc, paths, (str(gate.root / 'retired-v2'),)

    def check(self, gate, provider='deepinfra', datagram=lambda: False, **kwargs):
        proc, paths, retired = self.fence(gate, provider, **kwargs)
        return bridge.check_probe_fence(provider, proc_root=proc, gate_paths=paths, retired_paths=retired, datagram=datagram)

    def missing(self, call):
        with self.assertRaises(bridge.FenceRequired) as caught:
            call()
        self.assertEqual(str(caught.exception), 'PROBE_FENCE_REQUIRED')
        return caught.exception.missing

    def test_inside_the_fence_it_passes(self):
        gate = self.gate()
        self.assertIsNone(self.check(gate))
        self.assertIsNone(self.check(gate, cgroup='1:name=systemd:/system.slice/debateai-preview-probe-deepinfra.service\n'))

    def test_each_missing_part_of_the_fence_is_named(self):
        gate = self.gate()
        no_caps = 'NoNewPrivs:\t1\nCapEff:\t0000000000000000\nCapBnd:\t0000000000000000\n'
        cases = {
            'bare_login_shell': ({'cgroup': '0::/user.slice/user-0.slice/session-4.scope\n'}, ['unit']),
            'another_unit': ({'cgroup': '0::/system.slice/run-u42.service\n'}, ['unit']),
            'another_providers_unit': ({'cgroup': '0::/system.slice/debateai-preview-probe-anthropic.service\n'}, ['unit']),
            'no_cgroup_file': ({'cgroup': ''}, ['unit']),
            'new_privileges': ({'status': no_caps.replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0')}, ['privileges']),
            'capabilities': ({'status': no_caps.replace('CapEff:\t0000000000000000', 'CapEff:\t000001ffffffffff')},
                             ['privileges']),
            'bounding_set': ({'status': no_caps.replace('CapBnd:\t0000000000000000', 'CapBnd:\t000001ffffffffff')},
                             ['privileges']),
            'no_status': ({'status': ''}, ['privileges']),
            'network': ({'datagram': lambda: True}, ['network']),
        }
        for name, (kwargs, expected) in cases.items():
            with self.subTest(name):
                self.assertEqual(self.missing(lambda: self.check(gate, **kwargs)), expected)

    def test_every_other_gates_folder_and_go_must_be_hidden_but_its_own_may_be_seen(self):
        cases = [('anthropic', 'private'), ('google', 'go.json'), ('retired', None)]
        for owner, part in cases:
            with self.subTest(owner=owner):
                gate = self.gate()
                proc, paths, retired = self.fence(gate)
                if owner == 'retired':
                    Path(retired[0]).mkdir()
                else:
                    target = Path(paths[owner][0] if part == 'private' else paths[owner][1])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.mkdir() if part == 'private' else target.write_text('{}')
                self.assertEqual(self.missing(lambda: bridge.check_probe_fence(
                    'deepinfra', proc_root=proc, gate_paths=paths, retired_paths=retired, datagram=lambda: False)),
                    ['other_gates'])
        gate = self.gate()
        proc, paths, retired = self.fence(gate, 'anthropic')
        Path(paths['anthropic'][0]).mkdir(parents=True)  # Its own folder: visible, as it must be.
        Path(paths['anthropic'][1]).write_text('{}')
        self.assertIsNone(bridge.check_probe_fence('anthropic', proc_root=proc, gate_paths=paths, retired_paths=retired,
                                                   datagram=lambda: False))
        Path(paths['deepinfra'][1]).parent.mkdir(parents=True)
        Path(paths['deepinfra'][1]).write_text('{}')  # The same fence, generic: DeepInfra is "other" here.
        self.assertEqual(self.missing(lambda: bridge.check_probe_fence(
            'anthropic', proc_root=proc, gate_paths=paths, retired_paths=retired, datagram=lambda: False)), ['other_gates'])

    def test_a_path_is_hidden_only_when_absent_or_an_unopenable_mode_0000_node(self):
        gate = self.gate()
        folder, plain, link = gate.root / 'shown', gate.root / 'plain.json', gate.root / 'link'
        folder.mkdir()
        plain.write_text('{}')
        link.symlink_to(plain)
        self.assertTrue(bridge.path_hidden(str(gate.root / 'absent')))
        for visible in (folder, plain, link):
            with self.subTest(path=visible.name):
                self.assertFalse(bridge.path_hidden(str(visible)))
        if os.getuid() != 0:  # What InaccessiblePaths= mounts: mode 0000, and no capability to open it.
            hidden = gate.root / 'inaccessible'
            hidden.mkdir()
            os.chmod(hidden, 0o000)
            self.addCleanup(os.chmod, hidden, 0o700)
            self.assertTrue(bridge.path_hidden(str(hidden)))

    def test_the_network_check_sends_one_empty_datagram_to_a_documentation_address_only(self):
        sent = []

        class Socket:
            def __init__(self, family, kind, outcome):
                sent.append((family, kind))
                self.outcome = outcome

            def sendto(self, data, address):
                sent.append((data, address))
                if self.outcome is not None:
                    raise self.outcome

            def close(self):
                pass
        for outcome, leaves in ((None, True), (PermissionError(1, 'blocked'), False), (OSError(101, 'unreachable'), False)):
            with self.subTest(outcome=outcome):
                sent.clear()
                with patch.object(bridge.socket, 'socket', lambda family, kind, o=outcome: Socket(family, kind, o)):
                    self.assertIs(bridge.datagram_leaves(), leaves)
                self.assertEqual(sent, [(socket.AF_INET, socket.SOCK_DGRAM), (b'', ('192.0.2.1', 9))])

    def test_a_bare_probe_refuses_before_the_key_or_any_reservation(self):
        gate = self.gate().ready()
        with patch.object(bridge, 'datagram_leaves', lambda: True), self.refused('PROBE_FENCE_REQUIRED'):
            bridge.probe(gate.private, gate.go_path, DEEPSEEK, dispatch=no_network, key_loader=no_network, host=HOST,
                         platform='linux', uid=0, now=gate.clock)
        self.assertIsNone(gate.day('2026-10-08'))
        self.assertEqual(gate.control()['in_flight'], {})
        # The one refusal line names which parts of the fence are missing (fixed names only).
        out = io.StringIO()

        def fenced_out(*_args, **_kwargs):
            raise bridge.FenceRequired(['unit', 'network'])
        with patch.object(bridge, 'probe', fenced_out), contextlib.redirect_stdout(out):
            code = bridge.main(['probe', '--private', str(gate.private), '--go', str(gate.go_path), '--model', DEEPSEEK])
        self.assertEqual((code, json.loads(out.getvalue())),
                         (2, {'status': 'refused', 'error_class': 'FenceRequired', 'error': 'PROBE_FENCE_REQUIRED',
                              'missing': ['unit', 'network']}))


class SamplingTests(GateTest):
    """Reviewed sampling (2026-10-12): a row may carry its own sampling settings (Qwen, at its makers' thinking-mode
    values, after it slid into random multilingual tokens at DeepInfra's defaults; MiMo, at DeepInfra's recommended
    top_p 0.95, after it broke its JSON with a straight closing quote, and the owner's temperature 0.7, after it wrote
    replies in other languages at 1.0). Its requests must
    carry exactly those keys with exactly those values; every other row's requests must carry none of them."""
    QWEN_SAMPLING = (('temperature', 0.6), ('top_p', 0.95), ('top_k', 20))
    # Owner approval 2026-10-12: DeepInfra's recommended top_p for MiMo and the owner's temperature 0.7, with no top_k.
    MIMO_SAMPLING = (('temperature', 0.7), ('top_p', 0.95))

    def test_only_the_mimo_and_qwen_rows_carry_sampling_and_they_equal_the_independent_copy(self):
        self.assertEqual(DEEPINFRA.rows[QWEN].sampling, self.QWEN_SAMPLING)
        self.assertEqual(dict(DEEPINFRA.rows[QWEN].sampling), SAMPLING[QWEN])
        self.assertEqual(DEEPINFRA.rows[MIMO].sampling, self.MIMO_SAMPLING)
        self.assertEqual(dict(DEEPINFRA.rows[MIMO].sampling), SAMPLING[MIMO])
        self.assertEqual({model: row.sampling for model, row in DEEPINFRA.rows.items() if model not in (MIMO, QWEN)},
                         {MODEL: None, DEEPSEEK: None})
        self.assertEqual(set(SAMPLING), {MIMO, QWEN})
        for name, profile in bridge.helper.PROFILES.items():
            if name != 'deepinfra':
                with self.subTest(provider=name):
                    self.assertEqual({row.sampling for row in profile.rows.values()}, {None})
        self.assertEqual(DEEPINFRA.sampling_keys, ('temperature', 'top_p', 'top_k'))

    def test_a_row_with_sampling_takes_exactly_its_reviewed_values(self):
        row = DEEPINFRA.rows[QWEN]
        exact = body(model=QWEN)
        self.assertTrue(DEEPINFRA.body_valid(exact, row))
        self.assertTrue(DEEPINFRA.body_valid({**exact, 'top_k': 20.0}, row))  # The same number, as JSON says it.

        def without(name):
            return {k: v for k, v in exact.items() if k != name}
        refused = {'no_sampling': {k: v for k, v in exact.items() if k not in SAMPLING[QWEN]},
                   'no_temperature': without('temperature'), 'no_top_p': without('top_p'), 'no_top_k': without('top_k'),
                   'temperature_default': {**exact, 'temperature': 1}, 'temperature_off': {**exact, 'temperature': 0.61},
                   'top_p_hair': {**exact, 'top_p': 0.950001}, 'top_k_other': {**exact, 'top_k': 21},
                   'top_k_off': {**exact, 'top_k': 0}, 'temperature_text': {**exact, 'temperature': '0.6'},
                   'top_k_true': {**exact, 'top_k': True}, 'temperature_null': {**exact, 'temperature': None},
                   'top_p_nan': {**exact, 'top_p': float('nan')}, 'extra_min_p': {**exact, 'min_p': 0},
                   'nested': {**without('temperature'), 'sampling': SAMPLING[QWEN]}}
        for name, value in refused.items():
            with self.subTest(name):
                self.assertFalse(DEEPINFRA.body_valid(value, row))

    def test_mimo_takes_exactly_its_reviewed_values_and_no_json_mode(self):
        # Owner approval 2026-10-12: MiMo broke its JSON with a straight closing quote in a live practice run. Its JSON
        # mode, tried the same day, was withdrawn: DeepInfra's JSON constraint turned that slip into garbage.
        row = DEEPINFRA.rows[MIMO]
        self.assertFalse(row.json_object)
        exact = body(model=MIMO)
        self.assertEqual({k: exact[k] for k in ('temperature', 'top_p')}, SAMPLING[MIMO])
        self.assertTrue(DEEPINFRA.body_valid(exact, row))

        def without(name):
            return {k: v for k, v in exact.items() if k != name}
        refused = {'no_sampling': {k: v for k, v in exact.items() if k not in SAMPLING[MIMO]},
                   'no_temperature': without('temperature'), 'no_top_p': without('top_p'),
                   'with_top_k': {**exact, 'top_k': 20}, 'qwen_temperature': {**exact, 'temperature': 0.6},
                   'temperature_before_2026_10_12': {**exact, 'temperature': 1}, 'temperature_hair': {**exact, 'temperature': 0.700001},
                   'top_p_default': {**exact, 'top_p': 1}, 'top_p_hair': {**exact, 'top_p': 0.950001},
                   'temperature_true': {**exact, 'temperature': True}, 'temperature_text': {**exact, 'temperature': '0.7'},
                   'temperature_null': {**exact, 'temperature': None}, 'effort': {**exact, 'reasoning_effort': 'high'},
                   'json_mode': {**exact, 'response_format': {'type': 'json_object'}},
                   'json_schema': {**exact, 'response_format': {'type': 'json_schema'}},
                   'json_mode_extra': {**exact, 'response_format': {'type': 'json_object', 'schema': {}}},
                   'json_mode_without_sampling': {**without('temperature'), 'response_format': {'type': 'json_object'}}}
        for name, value in refused.items():
            with self.subTest(name):
                self.assertFalse(DEEPINFRA.body_valid(value, row))

    def test_a_row_without_sampling_refuses_every_sampling_key(self):
        for model in (MODEL, DEEPSEEK):
            row = DEEPINFRA.rows[model]
            self.assertTrue(DEEPINFRA.body_valid(body(model=model), row))
            for name, value in SAMPLING[QWEN].items():
                with self.subTest(model=model, key=name):
                    self.assertFalse(DEEPINFRA.body_valid({**body(model=model), name: value}, row))
            self.assertFalse(DEEPINFRA.body_valid({**body(model=model), **SAMPLING[QWEN]}, row))

    def test_every_body_the_app_sends_passes_at_its_reservation_to_the_digit_and_the_rest_are_refused(self):
        # tests/unit/fixtures/deepinfra-sampling-bodies.json: `sent` holds bodies in the app's own key order and
        # serializer, each with the reservation the app computes (its TS test sends each through the guarded fetch).
        fixture = json.loads(SAMPLING_BODIES.read_text())
        self.assertEqual(fixture['schema'], 'deepinfra-sampling-bodies-v1')
        go = bridge.read_go(self.gate(enabled_models=ALL).go_path)
        self.assertGreaterEqual(len(fixture['sent']), 5)
        for case in fixture['sent']:
            with self.subTest(sent=case['name']):
                value, raw = json.loads(case['body']), case['body']
                request = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                           'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': case['reservedUsd']}
                outgoing, reserved, row, _ = bridge.validate_request(request, go)
                self.assertEqual((json.loads(outgoing), row.model), (value, value['model']))
                self.assertEqual(reserved, Decimal(case['reservedUsd']))
                self.assertEqual(reserved, reservation_of(raw, value['model']))
                self.assertLessEqual(len(outgoing), len(raw.encode()))
                self.assertEqual(set(SAMPLING.get(value['model'], {})) <= set(value), True)
        self.assertGreaterEqual(len(fixture['refused']), 15)
        for case in fixture['refused']:
            with self.subTest(refused=case['name']):
                value = json.loads(case['body'])
                self.assertFalse(DEEPINFRA.body_valid(value, DEEPINFRA.rows[value['model']]))
                with self.refused('REQUEST_PARAMETERS_INVALID'):
                    bridge.validate_request(envelope(value), go)

    def test_a_qwen_call_with_its_sampling_goes_through_and_sends_it(self):
        gate = self.gate(enabled_models=ALL).ready()
        sent = []

        def dispatch(request, _key):
            sent.append(json.loads(request))
            return 200, provider_response('0.0004', QWEN)
        self.assertEqual(gate.call('ok', value=body(model=QWEN), dispatch=dispatch)['status'], 200)
        self.assertEqual({k: sent[0][k] for k in SAMPLING[QWEN]}, SAMPLING[QWEN])
        with self.refused('REQUEST_PARAMETERS_INVALID'):
            gate.call('bare', value={k: v for k, v in body(model=QWEN).items() if k not in SAMPLING[QWEN]})

    def test_a_mimo_call_with_its_sampling_goes_through_and_json_mode_is_refused(self):
        gate = self.gate(enabled_models=ALL).ready()
        sent = []

        def dispatch(request, _key):
            sent.append(json.loads(request))
            return 200, provider_response('0.0004', MIMO)
        value = body(model=MIMO)
        self.assertEqual(gate.call('ok', value=value, dispatch=dispatch)['status'], 200)
        self.assertEqual(sent, [value])
        self.assertEqual({k: sent[0][k] for k in SAMPLING[MIMO]}, SAMPLING[MIMO])
        self.assertNotIn('response_format', sent[0])
        with self.refused('REQUEST_PARAMETERS_INVALID'):
            gate.call('json', value={**value, 'response_format': {'type': 'json_object'}})
        with self.refused('REQUEST_PARAMETERS_INVALID'):
            gate.call('bare', value={k: v for k, v in value.items() if k not in SAMPLING[MIMO]})

    def test_the_probe_sends_the_rows_sampling_and_reports_it(self):
        gate = self.gate().ready()  # GLM only: a probe reaches a reviewed model the GO does not enable yet.
        sent = []

        def dispatch(request, _key):
            sent.append(json.loads(request))
            return 200, {'model': QWEN, 'choices': [{'message': {'content': 'OK'}}],
                         'usage': {'prompt_tokens': 12, 'completion_tokens': 30, 'total_tokens': 42}}
        summary = bridge.probe(gate.private, gate.go_path, QWEN, dispatch=dispatch, key_loader=lambda _private: KEY, host=HOST,
                               platform='linux', uid=0, now=gate.clock, fence=lambda _provider: None)
        self.assertEqual(sent, [{'model': QWEN, 'max_tokens': 1024, 'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}],
                                 **SAMPLING[QWEN]}])
        self.assertEqual(summary['sent'], {'max_tokens': 1024, 'effort': 'default', 'sampling': SAMPLING[QWEN]})
        self.assertEqual((summary['http_status'], summary['entry_state']), (200, 'settled'))
        # MiMo's probe carries its own two (owner approval 2026-10-12); GLM's and DeepSeek's are as before: none.
        self.assertEqual(DEEPINFRA.probe_body(DEEPINFRA.rows[MIMO]),
                         {'model': MIMO, 'max_tokens': 1024, 'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}],
                          **SAMPLING[MIMO]})
        self.assertTrue(DEEPINFRA.body_valid(DEEPINFRA.probe_body(DEEPINFRA.rows[MIMO]), DEEPINFRA.rows[MIMO]))
        for model in (MODEL, DEEPSEEK):
            with self.subTest(model=model):
                probe_body = DEEPINFRA.probe_body(DEEPINFRA.rows[model])
                self.assertEqual(probe_body, {'model': model, 'max_tokens': 1024,
                                              'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}],
                                              **({'reasoning_effort': 'high'} if ROWS[model][4][0] == 'high' else {})})

    def test_row_review_refuses_a_malformed_sampling(self):
        qwen = DEEPINFRA.rows[QWEN]
        self.assertTrue(bridge.row_reviewed(DEEPINFRA, QWEN, qwen))
        broken = {'empty': (), 'dict_form': {'temperature': 0.6}, 'unknown_key': (('min_p', 0.1),),
                  'duplicate_key': (('top_k', 20), ('top_k', 20)), 'bool_value': (('top_k', True),),
                  'text_value': (('temperature', '0.6'),), 'nan': (('top_p', float('nan')),),
                  'infinite': (('temperature', float('inf')),), 'decimal_value': (('temperature', Decimal('0.6')),),
                  'not_pairs': ('temperature', 0.6), 'triple': (('temperature', 0.6, 1),)}
        for name, sampling in broken.items():
            with self.subTest(name):
                self.assertFalse(bridge.row_reviewed(DEEPINFRA, QWEN, qwen._replace(sampling=sampling)))
        # A profile with no sampling keys (Anthropic's) never reviews a row that carries any.
        anthropic = bridge.helper.PROFILES['anthropic']
        haiku = next(iter(anthropic.rows.values()))
        self.assertTrue(bridge.row_reviewed(anthropic, haiku.model, haiku))
        self.assertFalse(bridge.row_reviewed(anthropic, haiku.model, haiku._replace(sampling=(('temperature', 0.6),))))
        # A malformed row fails its whole profile, as any other unreviewed row does.
        with patch.dict(DEEPINFRA.rows, {QWEN: qwen._replace(sampling=(('top_k', True),))}):
            self.assertIsNone(bridge.profile_of('deepinfra'))



def wire(reply):
    """A vendor reply as helper.HttpsTransport hands it to the gate: JSON, parsed with parse_float=Decimal (final review
    2026-10-16, Important 2: a float count reaches the hooks as a Decimal, never as a float)."""
    return json.loads(json.dumps(reply), parse_float=Decimal)


def with_headers(status, reply, headers):
    """A dispatch that answers like the real transport: status and body, and the vendor facts it kept from the
    answer's headers on its vendor_headers attribute (helper.vendor_headers' output)."""
    def dispatch(_sent, _key):
        return status, json.loads(json.dumps(reply))
    dispatch.vendor_headers = headers
    return dispatch


def journal(out, operation_id):
    """The gate's journal lines (preview_provider_paid_post) for one call."""
    return [line for line in map(json.loads, filter(None, out.getvalue().splitlines()))
            if line.get('event') == 'preview_provider_paid_post' and line.get('operation_id') == operation_id]


class VendorRefusalFactsTests(GateTest):
    """2026-10-12: GLM on DeepInfra answers 429 about 2 calls in 3 while we send one at a time, and the gate kept
    neither the answer's message nor its Retry-After, so nobody could tell an account rate limit from a busy model.
    An answer released unbilled now keeps the vendor's Retry-After (whole seconds), the NAMES of its rate-limit
    headers, and the error's type, code and a short, redacted message, on its ledger entry and its journal line;
    and a cool-off lasts at least as long as the vendor asked (never past COOL_OFF_MAX_SECONDS)."""
    MOMENT = bridge.datetime(2026, 10, 8, 9, 0, 0, tzinfo=bridge.timezone.utc)
    RATE_LIMITED = UnbilledRefusalTests.RATE_LIMITED

    def test_retry_after_is_whole_seconds_from_delta_seconds_or_an_http_date_clamped_to_an_hour(self):
        parse = bridge.helper.retry_after_seconds
        cases = {'120': 120, ' 7 ': 7, '0': 0, '3600': 3600, '3601': 3600, '1' * 40: 3600,
                 'Thu, 08 Oct 2026 09:02:00 GMT': 120, 'Thu, 08 Oct 2026 08:59:00 GMT': 0,
                 'Fri, 09 Oct 2026 09:00:00 GMT': 3600, 'Thursday, 08-Oct-26 09:00:30 GMT': 30,
                 'Thu Oct  8 09:00:45 2026': 45}
        for value, seconds in cases.items():
            with self.subTest(value=value):
                self.assertEqual(parse(value, self.MOMENT), seconds)
        # A part second ahead is a whole second to wait.
        self.assertEqual(parse('Thu, 08 Oct 2026 09:02:00 GMT', self.MOMENT + bridge.timedelta(milliseconds=500)), 120)
        for junk in (None, '', '   ', 'soon', '-5', '1.5', '12abc', '+3', '0x10', 'Thu, 99 Foo 2026', 7, b'7', '1e3',
                     '١٢'):
            with self.subTest(junk=junk):
                self.assertIsNone(parse(junk, self.MOMENT))

    def test_the_transport_keeps_retry_after_and_rate_limit_header_names_only(self):
        kept = bridge.helper.vendor_headers([
            ('Content-Type', 'application/json'), ('Retry-After', ' 30 '), ('retry-after', '999'),
            ('X-RateLimit-Remaining-Requests', '0'), ('x-ratelimit-reset-requests', '12s'), ('RateLimit-Policy', '10;w=60'),
            ('anthropic-ratelimit-requests-remaining', '0'), ('Set-Cookie', 'session=secret'), ('Authorization', 'Bearer x'),
            ('X-Request-Id', 'req-1'), ('x-ratelimit-remaining-requests', '0'), ('x-ratelimit-bad name', '1')])
        self.assertEqual(kept, {'retry_after': '30', 'rate_limit_header_names': [
            'anthropic-ratelimit-requests-remaining', 'ratelimit-policy', 'x-ratelimit-remaining-requests',
            'x-ratelimit-reset-requests']})
        self.assertEqual(bridge.helper.vendor_headers([]), {'retry_after': None, 'rate_limit_header_names': []})
        self.assertEqual(bridge.helper.vendor_headers(None), {'retry_after': None, 'rate_limit_header_names': []})
        many = bridge.helper.vendor_headers([('x-ratelimit-n%02d' % n, '1') for n in range(40)])
        self.assertEqual(len(many['rate_limit_header_names']), bridge.helper.MAX_RATE_LIMIT_HEADER_NAMES)
        self.assertEqual(len(bridge.helper.vendor_headers([('Retry-After', '9' * 500)])['retry_after']),
                         bridge.helper.MAX_RETRY_AFTER_CHARS)

    def test_the_real_transport_records_the_answers_vendor_headers(self):
        class Response:
            status = 429

            def __init__(self):
                self.chunks = [b'{"error": {"message": "Rate limit exceeded"}}']

            def read(self, _size):
                return self.chunks.pop() if self.chunks else b''

            def getheaders(self):
                return [('Retry-After', '45'), ('X-RateLimit-Limit-Requests', '60'), ('Set-Cookie', 'a=b')]

        class Connection:
            def __init__(self, host, timeout, context):
                self.sock = None

            def connect(self):
                pass

            def request(self, method, path, body, headers):
                pass

            def getresponse(self):
                return Response()

            def close(self):
                pass
        with patch.object(bridge.helper.http.client, 'HTTPSConnection', Connection):
            transport = _HTTPS(timeout=5, profile=DEEPINFRA, path=DEEPINFRA.path)
            self.assertIsNone(transport.vendor_headers)
            self.assertEqual(transport(b'{}', KEY), (429, {'error': {'message': 'Rate limit exceeded'}}))
        self.assertEqual(transport.vendor_headers, {'retry_after': '45', 'rate_limit_header_names': ['x-ratelimit-limit-requests']})

    def test_the_vendor_error_keeps_type_code_and_a_short_safe_message(self):
        summary = bridge.helper.vendor_error_summary
        self.assertEqual(summary({'error': {'message': 'Rate limit exceeded', 'type': 'rate_limit', 'code': 429}}),
                         {'type': 'rate_limit', 'code': '429', 'message': 'Rate limit exceeded'})
        self.assertEqual(summary({'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}}),
                         {'type': 'overloaded_error', 'code': None, 'message': 'Overloaded'})
        self.assertEqual(summary({'error': 'Model is busy, retry later'}), {'type': None, 'code': None, 'message': 'Model is busy, retry later'})
        for odd in ('rate limit', 'x' * 65, True, Decimal('4.5'), ['a'], {'a': 1}, ''):
            with self.subTest(odd=odd):
                self.assertEqual(summary({'error': {'type': odd, 'code': odd, 'message': 'm'}}),
                                 {'type': '(other)', 'code': '(other)', 'message': 'm'})
        for nothing in ({}, {'error': None}, {'error': 7}, {'detail': 'busy'}, None, []):
            with self.subTest(nothing=nothing):
                self.assertIsNone(summary(nothing))
        self.assertEqual(summary({'error': {'message': {'nested': 'x'}}}), {'type': None, 'code': None, 'message': None})
        long = summary({'error': {'message': 'busy ' * 100}})['message']
        self.assertEqual(len(long), bridge.helper.MAX_VENDOR_MESSAGE_CHARS)
        self.assertEqual(bridge.helper.MAX_VENDOR_MESSAGE_CHARS, 200)

    def test_the_message_loses_control_characters_and_anything_like_a_key_token_email_or_url(self):
        safe = bridge.helper.safe_vendor_message
        self.assertEqual(safe('Too\x00many\nrequests\t‮please​ wait'), 'Too many requests please wait')
        secrets = {'email': 'contact ops.team+x@example.com for a raise', 'url': 'see https://example.com/limits?account=12345&k=abc',
                   'www': 'see www.example.com/limits', 'bearer': 'header Bearer abc.def.ghi was rejected',
                   'assignment': 'invalid api_' + 'key=abc123 for org', 'colon': 'token: ' + 'tok_' + 'live_1234 refused',
                   'prefixed': 'key ' + 'sk-' + 'proj-abcdef123456 is limited', 'long': 'account ' + 'A1b2C3d4E5f6G7h8' + 'I9j0K1l2M3n4 limited',
                   'query': 'retry /v1/x?signature=zzz later', 'password': 'pass' + 'word=hunter2'}
        # Synthetic values only, built from pieces so a secret scanner does not read them as real ones (.gitleaksignore).
        leaks = ('ops.team', 'example.com', 'account=12345', 'abc.def.ghi', 'abc123', 'tok_' + 'live_1234', 'sk-' + 'proj-abcdef123456',
                 'A1b2C3d4E5f6G7h8' + 'I9j0K1l2M3n4', 'signature=zzz', 'hunter2')
        for name, text in secrets.items():
            with self.subTest(name):
                cleaned = safe(text)
                self.assertTrue(cleaned is None or not any(leak in cleaned for leak in leaks), cleaned)
                self.assertTrue(cleaned is None or '[REDACTED]' in cleaned, cleaned)
        # Plain rate-limit wording survives as it is.
        self.assertEqual(safe('Rate limit reached for requests: 60 per 1m. Please try again in 20s.'),
                         'Rate limit reached for requests: 60 per 1m. Please try again in 20s.')
        for nothing in (None, 7, {'a': 1}, '', ' \n\t ', '\x00\x01'):
            with self.subTest(nothing=nothing):
                self.assertIsNone(safe(nothing))
        # When in doubt, the message goes: anything still looking like an address after redaction.
        self.assertIsNone(safe('write to @ops or ftp:/x'))

    def test_a_released_429_keeps_the_vendor_facts_on_its_entry_and_its_journal_line(self):
        gate = self.gate().ready()
        reply = {'error': {'message': 'Rate limit exceeded for key ' + KEY + ', see https://deepinfra.com/x?u=1',
                           'type': 'rate_limit', 'code': 'too_many_requests'}}
        headers = {'retry_after': '30', 'rate_limit_header_names': ['x-ratelimit-remaining-requests']}
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-1', dispatch=with_headers(429, reply, headers))
        entry = entry_of(gate, 'op-1')
        expected = {'vendor_retry_after_seconds': 30, 'vendor_rate_limit_headers': ['x-ratelimit-remaining-requests'],
                    'vendor_error': {'type': 'rate_limit', 'code': 'too_many_requests',
                                     'message': 'Rate limit exceeded for key [REDACTED], see [REDACTED]'}}
        self.assertEqual({k: entry[k] for k in expected}, expected)
        self.assertEqual((entry['state'], entry['held_usd'], entry['http_status']), ('released_unbilled', '0', 429))
        [line] = journal(self.out, 'op-1')
        self.assertEqual({k: line[k] for k in expected}, expected)
        self.assertEqual((line['status'], line['reason'], line['vendor_busy']), ('not_sent', 'unbilled_refusal', True))
        self.assertNotIn(KEY, self.out.getvalue())
        self.assertNotIn(KEY, json.dumps(gate.day('2026-10-08')))
        # The caller's refusal body is unchanged: the app parses {"error": CODE} only.
        self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_REFUSED_UNBILLED'))),
                         {'error': 'PROVIDER_REFUSED_UNBILLED'})

    def test_without_headers_or_an_error_the_facts_are_null_and_empty(self):
        gate = self.gate().ready()
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-1', dispatch=lambda _s, _k: (429, {'error': True}))
        entry = entry_of(gate, 'op-1')
        self.assertEqual((entry['vendor_retry_after_seconds'], entry['vendor_rate_limit_headers'], entry['vendor_error']),
                         (None, [], None))
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-2', dispatch=with_headers(429, self.RATE_LIMITED, {'retry_after': 'later', 'rate_limit_header_names': []}))
        self.assertIsNone(entry_of(gate, 'op-2')['vendor_retry_after_seconds'])
        # A settled reply carries none of the vendor refusal fields (past the cool-off the two refusals started).
        later(gate, 61)
        gate.call('op-3', dispatch=with_headers(200, provider_response('0.01'), {'retry_after': '5', 'rate_limit_header_names': []}))
        self.assertFalse({'vendor_retry_after_seconds', 'vendor_rate_limit_headers', 'vendor_error'} & set(entry_of(gate, 'op-3')))

    def test_a_malformed_vendor_headers_attribute_is_treated_as_none(self):
        gate = self.gate().ready()
        for number, odd in enumerate(({'retry_after': 30}, 'x', {'rate_limit_header_names': ['ok', 7]},
                                      {'rate_limit_header_names': 'x-ratelimit-a'})):
            with self.subTest(odd=odd), self.refused('PROVIDER_REFUSED_UNBILLED'):
                gate.call('op-%d' % number, dispatch=with_headers(429, self.RATE_LIMITED, odd))
            later(gate, 601)
        entries = gate.day('2026-10-08')['entries'].values()
        self.assertEqual({(e['vendor_retry_after_seconds'], tuple(e['vendor_rate_limit_headers'])) for e in entries}, {(None, ())})

    def cool(self, retry_after):
        gate = self.gate().ready()
        headers = {'retry_after': retry_after, 'rate_limit_header_names': []}
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-1', dispatch=with_headers(429, self.RATE_LIMITED, headers))
        self.assertIsNone(gate.control()['cooling'][MODEL]['until_utc'])  # One refusal never cools, Retry-After or not.
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-2', dispatch=with_headers(429, self.RATE_LIMITED, headers))
        record = gate.control()['cooling'][MODEL]
        with self.assertRaises(bridge.ModelCooling) as caught:
            gate.call('op-3', dispatch=lambda *_: self.fail('sent while cooling'))
        return record, caught.exception.retry_after, gate

    def test_a_cool_off_lasts_at_least_the_vendors_retry_after_within_the_maximum(self):
        record, wait, _ = self.cool('300')
        # The gate's own window (60 s, which a refused trial still doubles) is kept; the end is the vendor's.
        self.assertEqual((record['window_seconds'], record['until_utc'], wait), (60, '2026-10-08T09:05:00+00:00', 300))
        record, wait, _ = self.cool('5')
        self.assertEqual((record['window_seconds'], record['until_utc'], wait), (60, '2026-10-08T09:01:00+00:00', 60))
        record, wait, _ = self.cool('3600')
        self.assertEqual((record['until_utc'], wait), ('2026-10-08T09:10:00+00:00', bridge.COOL_OFF_MAX_SECONDS))
        record, wait, _ = self.cool('Thu, 08 Oct 2026 09:02:30 GMT')
        self.assertEqual((record['until_utc'], wait), ('2026-10-08T09:02:30+00:00', 150))
        record, wait, _ = self.cool(None)
        self.assertEqual((record['until_utc'], wait), ('2026-10-08T09:01:00+00:00', 60))
        self.assertEqual(json.loads(bridge.refusal_body(bridge.ModelCooling(300))), {'error': 'MODEL_COOLING', 'retry_after': 300})

    def test_a_refused_trial_still_doubles_the_gates_own_window(self):
        record, _, gate = self.cool('300')
        later(gate, 301)  # The vendor's wait is over: the next call is the trial.
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            gate.call('op-4', dispatch=with_headers(429, self.RATE_LIMITED, {'retry_after': '30', 'rate_limit_header_names': []}))
        record = gate.control()['cooling'][MODEL]
        self.assertEqual((record['window_seconds'], record['until_utc']), (120, '2026-10-08T09:07:01+00:00'))


if __name__ == '__main__':
    unittest.main()
