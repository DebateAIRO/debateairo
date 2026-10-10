"""The v3 spending gate's Anthropic profile (PR B): one reviewed row, Claude Haiku 5.5.

Offline only: temporary directories and fake dispatch functions. No real key, no DNS, no
upstream call. The key below is a made-up value in Anthropic's key shape, built from pieces so a
secret scanner does not read it as one.
"""
import contextlib
import hashlib
import io
import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import HOST, MODEL, PEER, SCOPE, Gate, load_bridge  # noqa: E402

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
ANTHROPIC = bridge.helper.PROFILES['anthropic']
_HTTPS = bridge.helper.HttpsTransport
PARITY = Path(__file__).resolve().parent / 'fixtures/preview-model-rows-anthropic.json'
HAIKU = 'claude-haiku-5-5'
KEY = 'sk-' + 'ant-' + 'synthetic' + '-0123456789'  # A made-up test value, not a key.
OTHER_SHAPE = 'sk-' + 'ant-' + 'api03-LEAKED_value-42'  # Any other string of the same shape.
# The reviewed row and Anthropic's two list-price steps, written out independently of the gate:
# input reserve 0.625 (the upper step's 5-minute cache write), output 2.50, bound 32768.
PRICE_IN, PRICE_OUT, BOUND = Decimal('0.625'), Decimal('2.50'), 32768
LOWER = {'input': Decimal('0.10'), 'write_5m': Decimal('0.125'), 'write_1h': Decimal('0.20'), 'read': Decimal('0.01'),
         'output': Decimal('0.50')}
UPPER = {'input': Decimal('0.50'), 'write_5m': Decimal('0.625'), 'write_1h': Decimal('1.00'), 'read': Decimal('0.05'),
         'output': Decimal('2.50')}
DAY = '2026-10-08'


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


def request(**changes):
    """A valid Anthropic request for the reviewed row (output_config effort high is required)."""
    value = {'model': HAIKU, 'max_tokens': 8192, 'system': 'Offline synthetic system text',
             'messages': [{'role': 'user', 'content': 'Offline synthetic test'}], 'output_config': {'effort': 'high'}}
    value.update(changes)
    return value


def without(name, value=None):
    return {k: v for k, v in (value or request()).items() if k != name}


def reservation_of(raw):
    return (Decimal(len(raw.encode()) + 2048) * PRICE_IN + Decimal(BOUND) * PRICE_OUT) / Decimal(1000000)


def envelope(value, operation_id='op-1'):
    raw = json.dumps(value)
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reservation_of(raw))}


def sized(size):
    value = request(messages=[{'role': 'user', 'content': ''}])
    value['messages'][0]['content'] = 'x' * (size - len(json.dumps(value).encode()))
    assert len(json.dumps(value).encode()) == size
    return value


def message(input_tokens=1000, output_tokens=500, model=HAIKU, text='OK', content=None, **usage):
    """An Anthropic Messages reply as the vendor documents it."""
    return {'id': 'msg_synthetic', 'type': 'message', 'role': 'assistant', 'model': model,
            'content': [{'type': 'text', 'text': text}] if content is None else content,
            'stop_reason': 'end_turn', 'stop_sequence': None,
            'usage': {'input_tokens': input_tokens, 'output_tokens': output_tokens, **usage}}


def cost(step, input_tokens=0, write_5m=0, write_1h=0, read=0, output=0):
    return (input_tokens * step['input'] + write_5m * step['write_5m'] + write_1h * step['write_1h']
            + read * step['read'] + output * step['output']) / Decimal(1000000)


def entry_of(gate, operation_id='op-1'):
    return gate.day(DAY)['entries']['preview-test:' + SCOPE + ':' + operation_id]


class AnthropicTest(unittest.TestCase):
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

    def gate(self, **changes):
        # The proposed GO (README-anthropic.md): $1.00 and 400 calls a day, 2 calls in flight.
        go = {'provider': 'anthropic', 'enabled_models': [HAIKU], 'daily_budget_usd': '1.00',
              'max_paid_posts_per_day': 400, 'max_concurrent_calls': 2, **changes}
        gate = Gate(bridge, **go)
        self.gates.append(gate)
        return gate

    def ready(self, **changes):
        return self.gate(**changes).ready()

    def call(self, gate, operation_id='op-1', reply=None, status=200, value=None, dispatch=None, **kwargs):
        if dispatch is None:
            def dispatch(_sent, _key):
                return status, json.loads(json.dumps(message() if reply is None else reply))
        options = {'peer_uid': PEER, 'slots': gate.slots, 'dispatch': dispatch, 'key_loader': lambda _private: KEY,
                   'host': HOST, 'platform': 'linux', 'now': gate.clock, 'slot_wait': 0.2}
        options.update(kwargs)
        return bridge.execute_request(gate.private, gate.go_path, envelope(value or request(), operation_id), **options)

    def refused(self, code):
        return self.assertRaisesRegex(SafetyError, '^' + code + '$')

    def assert_uncertain_halt(self, gate, operation_id='op-1'):
        entry = entry_of(gate, operation_id)
        self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('uncertain', Decimal(entry['reserved_usd'])))
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'uncertain_charge'))


class ParityAndReservationTests(AnthropicTest):
    def test_row_and_settlement_steps_equal_the_parity_fixture_the_app_also_asserts(self):
        parity = json.loads(PARITY.read_text())
        self.assertEqual((parity['provider'], parity['reservation']['overhead_bytes'],
                          parity['reservation']['worst_case_request_bytes'], Decimal(parity['reservation']['per_call_cap_usd'])),
                         ('anthropic', bridge.RESERVATION_OVERHEAD_BYTES, ANTHROPIC.max_request_bytes, ANTHROPIC.per_call_cap_usd))
        self.assertEqual([row['model'] for row in parity['rows']], list(ANTHROPIC.rows))
        row = ANTHROPIC.rows[HAIKU]
        self.assertEqual({'model': row.model, 'maker': row.maker, 'input_usd_per_m': str(row.input_usd_per_m),
                          'output_usd_per_m': str(row.output_usd_per_m),
                          'input_nano_usd_per_token': int(row.input_usd_per_m * 1000),
                          'output_nano_usd_per_token': int(row.output_usd_per_m * 1000),
                          'output_bound': row.output_bound, 'effort': row.effort, 'json_object': row.json_object,
                          'worst_case_reservation_usd': '%.9f' % bridge.worst_case_reservation(ANTHROPIC, row)},
                         parity['rows'][0])
        self.assertEqual([{'prompt_tokens_up_to': step.prompt_tokens_up_to, 'input_usd_per_m': str(step.input_usd_per_m),
                           'cache_write_5m_usd_per_m': str(step.cache_write_5m_usd_per_m),
                           'cache_write_1h_usd_per_m': str(step.cache_write_1h_usd_per_m),
                           'cache_read_usd_per_m': str(step.cache_read_usd_per_m),
                           'output_usd_per_m': str(step.output_usd_per_m)} for step in ANTHROPIC.settlement_steps],
                         parity['settlement_steps'])
        # And the independent copy these tests use.
        self.assertEqual((row.input_usd_per_m, row.output_usd_per_m, row.output_bound, row.effort, row.json_object),
                         (PRICE_IN, PRICE_OUT, BOUND, 'high', False))
        lower, upper = ANTHROPIC.settlement_steps
        self.assertEqual((lower.input_usd_per_m, lower.cache_write_5m_usd_per_m, lower.cache_write_1h_usd_per_m,
                          lower.cache_read_usd_per_m, lower.output_usd_per_m), tuple(LOWER.values()))
        self.assertEqual((upper.input_usd_per_m, upper.cache_write_5m_usd_per_m, upper.cache_write_1h_usd_per_m,
                          upper.cache_read_usd_per_m, upper.output_usd_per_m), tuple(UPPER.values()))
        # The reservation prices are the dearest the request can meet: never below a settlement price
        # of either step (except the 1-hour write, which no accepted request can ask for).
        self.assertEqual(ANTHROPIC.reservation_prices(ANTHROPIC.rows[HAIKU], bridge.helper.utc_now()), (PRICE_IN, PRICE_OUT))
        self.assertEqual(ANTHROPIC.ceiling_prices(row), (PRICE_IN, PRICE_OUT))
        for step in (lower, upper):
            self.assertLessEqual(max(step.input_usd_per_m, step.cache_write_5m_usd_per_m, step.cache_read_usd_per_m), PRICE_IN)
            self.assertLessEqual(step.output_usd_per_m, PRICE_OUT)

    def test_worst_case_is_pinned_under_the_per_call_cap(self):
        row = ANTHROPIC.rows[HAIKU]
        self.assertEqual((ANTHROPIC.per_call_cap_usd, ANTHROPIC.max_request_bytes), (Decimal('0.25'), 256 * 1024))
        self.assertEqual(bridge.worst_case_reservation(ANTHROPIC, row), Decimal('0.24704'))
        self.assertEqual((Decimal(264192) * PRICE_IN + Decimal(32768) * PRICE_OUT) / Decimal(1000000), Decimal('0.24704'))
        self.assertTrue(bridge.row_reviewed(ANTHROPIC, HAIKU, row))
        self.assertIs(bridge.profile_of('anthropic'), ANTHROPIC)
        go = bridge.read_go(self.gate().go_path)
        _, reserved, _, prices = bridge.validate_request(envelope(sized(ANTHROPIC.max_request_bytes)), go)
        self.assertEqual((reserved, prices), (Decimal('0.24704'), (PRICE_IN, PRICE_OUT)))
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.validate_request(envelope(sized(ANTHROPIC.max_request_bytes + 1)), go)
        # A row whose full-size request would pass the cap (33,953 x 2.50 tips it over) is not reviewed, and its GO is refused.
        with patch.object(ANTHROPIC, 'rows', {HAIKU: row._replace(output_bound=33953)}):
            self.assertIsNone(bridge.profile_of('anthropic'))

    def test_a_small_request_reserves_exactly_and_the_app_nano_usd_form_is_accepted(self):
        go = bridge.read_go(self.gate().go_path)
        value = request()
        raw = json.dumps(value, separators=(',', ':'))
        self.assertEqual(len(raw.encode()), 185)
        expected = Decimal('0.083315625')  # ((185 + 2048) x 0.625 + 32768 x 2.50) / 1e6
        total = (len(raw.encode()) + 2048) * 625 + BOUND * 2500  # The app's nano-USD sum.
        typescript = '%d.%09d' % (total // 10 ** 9, total % 10 ** 9)
        self.assertEqual(typescript, '0.083315625')
        sent = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': typescript}
        outgoing, reserved, row, prices = bridge.validate_request(sent, go)
        self.assertEqual((reserved, row.model, prices, json.loads(outgoing)), (expected, HAIKU, (PRICE_IN, PRICE_OUT), value))
        # Sorted keys, no spaces: the same length as the compact bytes priced, never longer.
        self.assertEqual((outgoing, len(outgoing)), (bridge.helper.canonical(value), len(raw.encode())))
        with self.refused('RESERVATION_MISMATCH'):
            bridge.validate_request({**sent, 'reservedUsd': '0.083315624'}, go)


class GoAndActivateTests(AnthropicTest):
    def test_a_go_for_anthropic_loads_only_with_its_own_reviewed_row(self):
        gate = self.gate()
        self.assertEqual((bridge.read_go(gate.go_path)['provider'], bridge.read_go(gate.go_path)['enabled_models']),
                         ('anthropic', [HAIKU]))
        for changes in ({'enabled_models': [MODEL]}, {'enabled_models': [HAIKU, MODEL]}, {'enabled_models': [HAIKU, HAIKU]},
                        {'enabled_models': ['claude-haiku-5-5-20261001']}, {'enabled_models': ['Claude-Haiku-5-5']},
                        {'provider': 'google'}, {'provider': 'Anthropic'}, {'provider': 'deepinfra'}):
            with self.subTest(changes=changes), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', **{'provider': 'anthropic', 'enabled_models': [HAIKU],
                                                                 **changes}))

    def test_activate_checks_the_calls_in_flight_times_the_worst_case_against_the_pot(self):
        # The proposed GO: 2 x 0.24704 = 0.49408 fits $1.00. 4 x 0.24704 = 0.98816.
        for budget, calls, ok in (('1.00', 2, True), ('0.50', 2, True), ('0.49', 2, False),
                                  ('0.98', 4, False), ('0.99', 4, True), ('1.00', 4, True), ('0.24', 1, False)):
            with self.subTest(budget=budget, calls=calls):
                gate = self.gate(daily_budget_usd=budget, max_concurrent_calls=calls)
                gate.init()
                if ok:
                    self.assertEqual(gate.activate()['state'], 'active')
                else:
                    with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
                        gate.activate()
                    self.assertEqual(gate.control()['state'], 'initialized')


class SettlementTests(AnthropicTest):
    def settle(self, reply, operation_id='op-1', gate=None):
        gate = gate or self.ready()
        result = self.call(gate, operation_id, reply=reply)
        self.assertEqual(result['status'], 200)
        return gate, entry_of(gate, operation_id)

    def test_fixture_replies_settle_exactly_at_both_steps_with_the_boundary_on_the_lower_one(self):
        cases = (('small', message(1000, 500), 'up_to_100k', Decimal('0.00035')),
                 ('boundary_100000', message(100000, 1000), 'up_to_100k', Decimal('0.0105')),
                 ('just_over_100001', message(100001, 1000), 'over_100k', Decimal('0.0525005')),
                 # Cache reads and writes count toward the prompt total that picks the step.
                 ('mixed_100000', message(60000, 10, cache_creation_input_tokens=30000, cache_read_input_tokens=10000),
                  'up_to_100k', Decimal('0.009855')),
                 ('mixed_100001', message(60000, 10, cache_creation_input_tokens=30000, cache_read_input_tokens=10001),
                  'over_100k', Decimal('0.04927505')))
        independent = {'small': cost(LOWER, 1000, output=500), 'boundary_100000': cost(LOWER, 100000, output=1000),
                       'just_over_100001': cost(UPPER, 100001, output=1000),
                       'mixed_100000': cost(LOWER, 60000, write_5m=30000, read=10000, output=10),
                       'mixed_100001': cost(UPPER, 60000, write_5m=30000, read=10001, output=10)}
        for name, reply, step, expected in cases:
            with self.subTest(name):
                self.assertEqual(independent[name], expected)
                gate, entry = self.settle(reply)
                prices = LOWER if step == 'up_to_100k' else UPPER
                self.assertEqual((entry['state'], Decimal(entry['held_usd']), entry['accounting']['price_step']),
                                 ('settled', expected, step))
                self.assertEqual({k: entry[k] for k in ('provider', 'model', 'maker', 'reserve_input_usd_per_m',
                                                        'reserve_output_usd_per_m', 'output_bound', 'requested_effort',
                                                        'reply_model')},
                                 {'provider': 'anthropic', 'model': HAIKU, 'maker': 'Anthropic',
                                  'reserve_input_usd_per_m': '0.625', 'reserve_output_usd_per_m': '2.50',
                                  'output_bound': 32768, 'requested_effort': 'high', 'reply_model': HAIKU})
                self.assertEqual((Decimal(entry['settle_input_usd_per_m']), Decimal(entry['settle_output_usd_per_m'])),
                                 (prices['input'], prices['output']))
                usage = reply['usage']
                prompt = usage['input_tokens'] + usage.get('cache_creation_input_tokens', 0) + usage.get('cache_read_input_tokens', 0)
                accounting = entry['accounting']
                self.assertEqual((accounting['prompt_tokens'], accounting['completion_tokens'], accounting['total_tokens'],
                                  accounting['cached_tokens'], accounting['reasoning_tokens'], accounting['usage_valid']),
                                 (prompt, usage['output_tokens'], prompt + usage['output_tokens'],
                                  usage.get('cache_read_input_tokens', 0), None, True))
                self.assertEqual(Decimal(accounting['guard_charge_usd']), expected)
                self.assertIsNone(accounting['provider_estimated_cost_usd'])
                self.assertEqual(Decimal(gate.status()['today_spend_usd']), expected)

    def test_cache_reads_and_a_5m_and_1h_creation_split_settle_exactly(self):
        split = {'ephemeral_5m_input_tokens': 1000, 'ephemeral_1h_input_tokens': 2000}
        lower = message(2000, 100, cache_creation_input_tokens=3000, cache_read_input_tokens=4000, cache_creation=split)
        # 2000 x 0.10 + 1000 x 0.125 + 2000 x 0.20 + 4000 x 0.01 + 100 x 0.50 = 815 -> $0.000815
        self.assertEqual(cost(LOWER, 2000, 1000, 2000, 4000, 100), Decimal('0.000815'))
        upper = message(90000, 2000, cache_creation_input_tokens=6000, cache_read_input_tokens=5000,
                        cache_creation={'ephemeral_5m_input_tokens': 4000, 'ephemeral_1h_input_tokens': 2000})
        # 90000 x 0.50 + 4000 x 0.625 + 2000 x 1.00 + 5000 x 0.05 + 2000 x 2.50 = 54750 -> $0.05475
        self.assertEqual(cost(UPPER, 90000, 4000, 2000, 5000, 2000), Decimal('0.05475'))
        no_split = message(2000, 100, cache_creation_input_tokens=3000, cache_read_input_tokens=4000)
        self.assertEqual(cost(LOWER, 2000, 3000, 0, 4000, 100), Decimal('0.000665'))
        documented = message(2000, 100, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                             cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0},
                             server_tool_use={'web_search_requests': 0, 'web_fetch_requests': 0},
                             service_tier='standard', inference_geo='global')
        nulls = message(2000, 100, cache_creation_input_tokens=None, cache_read_input_tokens=None, cache_creation=None,
                        server_tool_use=None, service_tier=None, inference_geo=None)
        for name, reply, expected, step, hour in (('lower', lower, Decimal('0.000815'), 'up_to_100k', 2000),
                                                  ('upper', upper, Decimal('0.05475'), 'over_100k', 2000),
                                                  ('no_split', no_split, Decimal('0.000665'), 'up_to_100k', 0),
                                                  ('documented_zeros', documented, cost(LOWER, 2000, output=100), 'up_to_100k', 0),
                                                  ('nulls', nulls, cost(LOWER, 2000, output=100), 'up_to_100k', 0)):
            with self.subTest(name):
                _, entry = self.settle(reply)
                accounting = entry['accounting']
                self.assertEqual((Decimal(entry['held_usd']), accounting['price_step'], accounting['cache_write_1h_tokens']),
                                 (expected, step, hour))
                creation = reply['usage'].get('cache_creation_input_tokens') or 0
                self.assertEqual((accounting['cache_creation_input_tokens'], accounting['cache_write_5m_tokens']),
                                 (creation, creation - hour))
                prices = LOWER if step == 'up_to_100k' else UPPER
                self.assertEqual((Decimal(accounting['cache_write_5m_usd_per_m']), Decimal(accounting['cache_write_1h_usd_per_m']),
                                  Decimal(accounting['cache_read_usd_per_m'])),
                                 (prices['write_5m'], prices['write_1h'], prices['read']))
                for name_, value in accounting.items():
                    if isinstance(value, str) and name_ != 'cost_basis':
                        self.assertLessEqual(len(value), 64)
                        self.assertNotIn('E', value)  # Plain decimals in the ledger.

    def test_missing_usage_halts_with_the_full_hold_kept(self):
        for name, reply in (('no_usage', without('usage', message())), ('usage_null', {**message(), 'usage': None}),
                            ('empty_body', {}), ('not_json', {'_invalid_json': True})):
            with self.subTest(name):
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply)
                self.assert_uncertain_halt(gate)

    def test_every_usage_shape_the_profile_does_not_know_halts(self):
        good = message()
        usage = good['usage']
        cases = {
            'server_tool_use_nonzero': {'server_tool_use': {'web_search_requests': 1}},
            'server_tool_use_not_a_dict': {'server_tool_use': 0},
            'server_tool_use_float_zero': {'server_tool_use': {'web_search_requests': Decimal('0.0')}},
            'server_tool_use_bool': {'server_tool_use': {'web_search_requests': False}},
            'inference_geo_us': {'inference_geo': 'us'},
            'service_tier_priority': {'service_tier': 'priority'},
            'service_tier_batch': {'service_tier': 'batch'},
            'unknown_usage_key': {'cache_write_tokens': 0},
            'cache_split_not_summing': {'cache_creation_input_tokens': 3000,
                                        'cache_creation': {'ephemeral_5m_input_tokens': 1000, 'ephemeral_1h_input_tokens': 1000}},
            'cache_split_without_total': {'cache_creation': {'ephemeral_5m_input_tokens': 5, 'ephemeral_1h_input_tokens': 0}},
            'cache_split_extra_key': {'cache_creation_input_tokens': 0,
                                      'cache_creation': {'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0,
                                                         'ephemeral_24h_input_tokens': 0}},
            'cache_split_missing_key': {'cache_creation_input_tokens': 0, 'cache_creation': {'ephemeral_5m_input_tokens': 0}},
            'cache_split_negative': {'cache_creation_input_tokens': 0,
                                     'cache_creation': {'ephemeral_5m_input_tokens': 1, 'ephemeral_1h_input_tokens': -1}},
            'cache_read_negative': {'cache_read_input_tokens': -1},
            'cache_creation_text': {'cache_creation_input_tokens': '10'},
            'input_float': {'input_tokens': Decimal('1000.0')},
            'input_bool': {'input_tokens': True},
            'input_negative': {'input_tokens': -1},
            'output_missing': None,
        }
        replies = {name: {**good, 'usage': {k: v for k, v in usage.items() if k != 'output_tokens'}} if extra is None
                   else {**good, 'usage': {**usage, **extra}} for name, extra in cases.items()}
        replies.update({
            'tool_use_block': {**good, 'content': [{'type': 'text', 'text': 'OK'},
                                                   {'type': 'tool_use', 'id': 't', 'name': 'x', 'input': {}}]},
            'server_tool_use_block': {**good, 'content': [{'type': 'server_tool_use', 'id': 's', 'name': 'web_search',
                                                           'input': {}}]},
            'server_tool_result_block': {**good, 'content': [{'type': 'web_search_tool_result', 'tool_use_id': 's',
                                                              'content': []}]},
            'block_not_an_object': {**good, 'content': ['OK']},
            'content_not_a_list': {**good, 'content': 'OK'},
            'type_not_message': {**good, 'type': 'error'},
            'usage_a_list': {**good, 'usage': [1000, 500]},
        })
        for name, reply in replies.items():
            with self.subTest(name):
                self.assertFalse(ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)['usage_valid'])
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, dispatch=lambda _s, _k, r=reply: (200, r))
                self.assert_uncertain_halt(gate)
        # The control: the same reply with the documented fields is valid.
        self.assertTrue(ANTHROPIC.account(good, ANTHROPIC.rows[HAIKU], None)['usage_valid'])

    def test_thinking_blocks_are_allowed_and_ignored_by_the_text(self):
        reply = message(content=[{'type': 'thinking', 'thinking': 'hmm', 'signature': 'sig'},
                                 {'type': 'redacted_thinking', 'data': 'opaque'},
                                 {'type': 'text', 'text': 'O'}, {'type': 'text', 'text': 'K'}])
        _, entry = self.settle(reply)
        self.assertEqual(entry['state'], 'settled')
        self.assertEqual(ANTHROPIC.reply_text(reply), 'OK')
        self.assertEqual(ANTHROPIC.reply_text({'type': 'error', 'error': {'type': 'x', 'message': 'why'}}), 'why')
        self.assertIsNone(ANTHROPIC.reply_text({'content': [{'type': 'thinking', 'thinking': 'only'}]}))

    def test_a_reply_naming_another_model_halts(self):
        for named in ('claude-haiku-5-5-20261001', 'claude-sonnet-5-5', 'Claude-Haiku-5-5', HAIKU + ' ', None, 7):
            with self.subTest(named=named):
                gate = self.ready()
                with self.refused('AUTHORITY_HALTED'):
                    self.call(gate, reply=message(model=named))
                entry = entry_of(gate)
                self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', Decimal('0.00035')))
                self.assertEqual(entry['reply_model'], named if isinstance(named, str) else None)
                self.assertEqual((gate.status()['state'], gate.status()['reason']),
                                 ('halted', 'provider_error_or_model_identity'))

    def test_an_error_status_with_valid_usage_settles_and_halts(self):
        gate = self.ready()
        with self.refused('AUTHORITY_HALTED'):
            self.call(gate, reply=message(), status=500)
        self.assertEqual((entry_of(gate)['state'], gate.status()['reason']), ('settled', 'provider_error_or_model_identity'))


class UnbilledAndUnsentTests(AnthropicTest):
    RATE = {'type': 'error', 'error': {'type': 'rate_limit_error', 'message': 'Number of requests has exceeded your rate limit'}}
    BUSY = {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}}

    def test_429_rate_limit_and_529_overloaded_are_unsent_and_release_the_hold(self):
        for name, status, reply in (('429', 429, self.RATE), ('529', 529, self.BUSY),
                                    ('429_request_id', 429, {**self.RATE, 'request_id': 'req_synthetic'}),
                                    ('529_request_id', 529, {**self.BUSY, 'request_id': 'req_synthetic'}),
                                    ('529_rate_type', 529, self.RATE), ('429_overloaded_type', 429, self.BUSY)):
            with self.subTest(name):
                self.assertTrue(ANTHROPIC.unbilled_refusal(status, reply))
                gate = self.ready()
                with self.refused('PROVIDER_REFUSED_UNBILLED'):
                    self.call(gate, reply=reply, status=status)
                status_now = gate.status()
                self.assertEqual((status_now['state'], status_now['unsent_streak'], status_now['today_posts'],
                                  status_now['today_spend_usd'], status_now['in_flight']), ('active', 1, 0, '0', 0))
                self.assertEqual(gate.day(DAY)['entries'], {})
                self.assertIn('"reason": "unbilled_refusal"', self.out.getvalue())
        self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_REFUSED_UNBILLED'))),
                         {'error': 'PROVIDER_REFUSED_UNBILLED'})

    def test_five_unbilled_in_a_row_halt_as_unreachable(self):
        gate = self.ready()
        for number in range(1, 6):
            with self.refused('PROVIDER_REFUSED_UNBILLED'):
                self.call(gate, 'op-%d' % number, reply=self.RATE, status=429)
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'provider_unreachable'))

    def test_anything_else_stays_uncertain_and_halts(self):
        cases = {
            '429_with_usage': (429, {**self.RATE, 'usage': {'input_tokens': 10, 'output_tokens': 0}}),
            '429_with_content': (429, {**self.RATE, 'content': []}),
            '429_with_model': (429, {**self.RATE, 'model': HAIKU}),
            '429_model_nested': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'model': HAIKU}}),
            '429_usage_nested': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'detail': {'usage': {}}}}),
            '500': (500, self.BUSY),
            '503': (503, self.BUSY),
            '429_invalid_request_error': (429, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'x'}}),
            '529_api_error': (529, {'type': 'error', 'error': {'type': 'api_error'}}),
            '429_error_text': (429, {'type': 'error', 'error': 'rate_limit_error'}),
            '429_type_message': (429, {**self.RATE, 'type': 'message'}),
            '429_extra_top_key': (429, {**self.RATE, 'detail': 'slow down'}),
            '429_request_id_number': (429, {**self.RATE, 'request_id': 7}),
            '429_not_json': (429, {'_invalid_json': True}),
            '429_tokens_prefixed': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'tokens_billed': 3}}),
            '529_cost': (529, {'type': 'error', 'error': {'type': 'overloaded_error', 'cost': '0.001'}}),
            # Judged on the RAW reply: redaction would drop this 'headers' subtree and hide the usage.
            '429_usage_under_redacted_key': (429, {'type': 'error', 'error': {'type': 'rate_limit_error',
                                                                             'headers': {'usage': {'output_tokens': 5}}}}),
            '429_empty': (429, {}),
        }
        for name, (status, reply) in cases.items():
            with self.subTest(name):
                self.assertFalse(ANTHROPIC.unbilled_refusal(status, reply))
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, status=status)
                self.assert_uncertain_halt(gate)

    def test_a_failed_connect_is_unsent(self):
        gate = self.ready()

        def unreachable(_sent, _key):
            raise bridge.helper.RequestNotSent('request_not_sent')
        with self.refused('PROVIDER_NOT_REACHED'):
            self.call(gate, dispatch=unreachable)
        self.assertEqual((gate.status()['state'], gate.status()['unsent_streak'], gate.status()['in_flight']), ('active', 1, 0))
        self.assertEqual(gate.day(DAY)['entries'], {})

    def test_a_failure_after_the_connect_is_uncertain_and_halts(self):
        gate = self.ready()

        def lost(_sent, _key):
            raise TimeoutError('read timed out')
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            self.call(gate, dispatch=lost)
        self.assert_uncertain_halt(gate)


class KeyCustodyTests(AnthropicTest):
    def test_the_key_and_any_key_shaped_text_never_reach_a_log_the_ledger_status_or_the_reply(self):
        gate = self.ready()
        seen = []
        leaky = message(text='echo ' + KEY + ' and ' + OTHER_SHAPE)
        leaky['id'] = 'msg ' + OTHER_SHAPE

        def dispatch(sent, key):
            seen.append((json.loads(sent), key))
            return 200, json.loads(json.dumps(leaky))
        reply = self.call(gate, dispatch=dispatch)
        self.assertEqual(seen[0][1], KEY)  # The key goes to the transport only.
        self.assertNotIn(KEY, json.dumps(seen[0][0]))
        self.assertIn('echo [REDACTED] and [REDACTED]', reply['body'])
        # A halting reply and an unbilled one carry the shapes too.
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            self.call(gate, 'op-2', reply={'type': 'error', 'error': {'type': 'invalid_request_error',
                                                                       'message': 'bad key ' + KEY + ' ' + OTHER_SHAPE}},
                      status=400)
        bridge.activate(gate.private, gate.go_path, host=HOST, platform='linux', now=gate.clock)
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            self.call(gate, 'op-3', reply={'type': 'error', 'error': {'type': 'rate_limit_error', 'message': KEY}}, status=429)
        texts = [reply['body'], json.dumps(gate.status()), self.out.getvalue()]
        texts += [path.read_text() for path in sorted(gate.private.iterdir()) if path.suffix == '.json']
        for text in texts:
            self.assertNotIn(KEY, text)
            self.assertNotIn(OTHER_SHAPE, text)
            self.assertNotIn('sk-ant-', text)

    def test_redaction_blanks_anthropic_key_shapes(self):
        self.assertEqual(ANTHROPIC.redaction_patterns, (r'sk-ant-[A-Za-z0-9_-]+',))
        value = {'a': 'x ' + OTHER_SHAPE + ' y', 'x-api-key': 'k', 'b': [KEY]}
        self.assertEqual(bridge.helper.redact(value, 'unrelated-key-value', ANTHROPIC.redaction_patterns),
                         {'a': 'x [REDACTED] y', 'b': ['[REDACTED]']})

    def test_transport_sends_the_key_in_x_api_key_with_the_version_to_the_messages_path(self):
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
            _HTTPS(timeout=5, profile=ANTHROPIC, path=ANTHROPIC.path_for(ANTHROPIC.rows[HAIKU]))(b'{}', KEY)
        self.assertEqual(sent, ['api.anthropic.com', ('POST', '/v1/messages', b'{}', {
            'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json',
            'Accept': 'application/json'})])
        self.assertEqual(ANTHROPIC.auth_headers(KEY), {'x-api-key': KEY, 'anthropic-version': '2023-06-01'})


class RequestShapeTests(AnthropicTest):
    def test_the_wire_contract_shape_is_accepted(self):
        go = bridge.read_go(self.gate().go_path)
        for value in (request(), without('system'), request(max_tokens=1), request(max_tokens=32768), request(system=''),
                      request(messages=[{'role': 'user', 'content': 'a'}, {'role': 'assistant', 'content': 'b'},
                                        {'role': 'user', 'content': 'c'}])):
            with self.subTest(value=value):
                outgoing, reserved, row, _ = bridge.validate_request(envelope(value), go)
                self.assertEqual((json.loads(outgoing), row.model, reserved), (value, HAIKU, reservation_of(json.dumps(value))))

    def test_every_other_shape_is_refused_before_any_reservation(self):
        go = bridge.read_go(self.gate().go_path)
        forbidden = {'thinking': {'type': 'enabled', 'budget_tokens': 1024}, 'tools': [], 'tool_choice': {'type': 'auto'},
                     'stream': False, 'metadata': {'user_id': 'u'}, 'stop_sequences': ['x'], 'temperature': 0,
                     'top_p': 1, 'top_k': 1, 'cache_control': {'type': 'ephemeral'}, 'inference_geo': 'global',
                     'service_tier': 'standard_only', 'container': 'c', 'mcp_servers': [], 'reasoning_effort': 'high',
                     'response_format': {'type': 'json_object'}}
        refused = [request(**{name: value}) for name, value in forbidden.items()]
        refused += [
            request(messages=[{'role': 'user', 'content': 'x', 'cache_control': {'type': 'ephemeral'}}]),
            request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'x'}]}]),
            request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'x',
                                                            'cache_control': {'type': 'ephemeral'}}]}]),
            request(messages=[{'role': 'assistant', 'content': 'x'}, {'role': 'user', 'content': 'y'}]),
            request(messages=[{'role': 'system', 'content': 'x'}, {'role': 'user', 'content': 'y'}]),
            request(messages=[{'role': 'user', 'content': 'y'}, {'role': 'system', 'content': 'x'}]),
            request(messages=[{'role': 'user', 'content': None}]), request(messages=[{'role': 'user'}]),
            request(messages=[]), request(messages='hi'), request(messages=['hi']),
            request(max_tokens=0), request(max_tokens=32769), request(max_tokens=True), request(max_tokens=8.0),
            request(max_tokens='8'), request(max_tokens=None), without('max_tokens'), without('messages'),
            without('output_config'), request(output_config={'effort': 'low'}), request(output_config={'effort': 'max'}),
            request(output_config={'effort': 'high', 'budget_tokens': 1}), request(output_config={}),
            request(output_config='high'), request(output_config=None),
            request(system=[{'type': 'text', 'text': 'x'}]), request(system=7), request(system=None),
            request(system=[{'type': 'text', 'text': 'x', 'cache_control': {'type': 'ephemeral'}}])]
        for value in refused:
            with self.subTest(refused=value), self.refused('REQUEST_PARAMETERS_INVALID'):
                bridge.validate_request(envelope(value), go)
        for value in (request(model=MODEL), request(model='claude-haiku-5-5-20261001'), request(model=HAIKU.upper())):
            with self.subTest(model=value['model']), self.refused('MODEL_NOT_ALLOWED'):
                bridge.validate_request(envelope(value), go)
        for value in (without('model'), request(model=None), request(model=7)):
            with self.subTest(model=value.get('model')), self.refused('REQUEST_PARAMETERS_INVALID'):
                bridge.validate_request(envelope(value), go)

    def test_a_row_without_effort_must_not_carry_output_config(self):
        row = ANTHROPIC.rows[HAIKU]._replace(effort=None)
        self.assertTrue(ANTHROPIC.body_valid(without('output_config'), row))
        self.assertFalse(ANTHROPIC.body_valid(request(), row))
        self.assertNotIn('output_config', ANTHROPIC.probe_body(row))

    def test_a_refused_shape_reserves_nothing_and_reads_no_key(self):
        gate = self.ready()
        calls = []
        with self.refused('REQUEST_PARAMETERS_INVALID'):
            self.call(gate, value=request(stream=True), dispatch=lambda *args: calls.append(args),
                      key_loader=lambda _private: calls.append('key'))
        self.assertEqual(calls, [])
        self.assertIsNone(gate.day(DAY))


class RemainingAndProbeTests(AnthropicTest):
    def probe(self, gate, dispatch, **kwargs):
        options = {'dispatch': dispatch, 'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux', 'uid': 0,
                   'now': gate.clock}
        options.update(kwargs)
        return bridge.probe(gate.private, gate.go_path, HAIKU, **options)

    def test_remaining_answers_for_the_anthropic_pot(self):
        gate = self.ready()
        self.call(gate)  # $0.00035 settled.
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertEqual(set(report), {'state', 'window_open', 'remaining_usd', 'remaining_calls', 'max_concurrent_calls',
                                       'largest_reservation_usd', 'enabled_models'})
        self.assertEqual({k: report[k] for k in ('state', 'window_open', 'remaining_calls', 'max_concurrent_calls',
                                                 'enabled_models')},
                         {'state': 'active', 'window_open': True, 'remaining_calls': 399, 'max_concurrent_calls': 2,
                          'enabled_models': [HAIKU]})
        self.assertEqual((Decimal(report['remaining_usd']), Decimal(report['largest_reservation_usd'])),
                         (Decimal('0.99965'), Decimal('0.24704')))

    def test_probe_sends_the_tiny_request_and_reports_what_it_measured(self):
        gate = self.ready()
        sent = []

        def dispatch(raw, key):
            sent.append((json.loads(raw), key))
            return 200, message(12, 30, content=[{'type': 'thinking', 'thinking': 'short', 'signature': 's'},
                                                 {'type': 'text', 'text': 'OK'}])
        summary = self.probe(gate, dispatch)
        self.assertEqual(sent, [({'model': HAIKU, 'max_tokens': 1024, 'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}],
                                  'output_config': {'effort': 'high'}}, KEY)])
        self.assertEqual(ANTHROPIC.probe_body(ANTHROPIC.rows[HAIKU]), sent[0][0])
        self.assertEqual({k: summary[k] for k in ('status', 'provider', 'model', 'maker', 'sent', 'http_status',
                                                  'model_echoed_exactly', 'completion_within_max_tokens', 'entry_state',
                                                  'halt_reason', 'authority', 'reply_excerpt')},
                         {'status': 'probed', 'provider': 'anthropic', 'model': HAIKU, 'maker': 'Anthropic',
                          'sent': {'max_tokens': 1024, 'effort': 'high'}, 'http_status': 200, 'model_echoed_exactly': True,
                          'completion_within_max_tokens': True, 'entry_state': 'settled', 'halt_reason': None,
                          'authority': 'active', 'reply_excerpt': 'OK'})
        self.assertEqual((summary['usage']['prompt_tokens'], summary['usage']['completion_tokens'],
                          summary['usage']['usage_valid']), (12, 30, True))
        self.assertEqual(Decimal(summary['guard_charge_usd']), Decimal('0.0000162'))  # (12 x 0.10 + 30 x 0.50) / 1e6
        self.assertNotIn(KEY, json.dumps(summary) + self.out.getvalue())

    def test_probe_reports_a_dated_model_name_an_overlong_answer_and_an_error(self):
        gate = self.ready()
        summary = self.probe(gate, lambda _r, _k: (200, message(12, 1500, model='claude-haiku-5-5-20261001')))
        self.assertEqual((summary['model_echoed_exactly'], summary['reply_model'], summary['completion_within_max_tokens'],
                          summary['halt_reason'], summary['authority']),
                         (False, 'claude-haiku-5-5-20261001', False, 'provider_error_or_model_identity', 'halted'))
        gate = self.ready()
        rejected = {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'output_config:\nunknown field'}}
        summary = self.probe(gate, lambda _r, _k: (400, rejected))
        self.assertEqual((summary['http_status'], summary['entry_state'], summary['halt_reason'], summary['reply_excerpt']),
                         (400, 'uncertain', 'uncertain_charge', 'output_config: unknown field'))
        self.assertEqual(gate.status()['state'], 'halted')


if __name__ == '__main__':
    unittest.main()
