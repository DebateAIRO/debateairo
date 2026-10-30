"""The v3 spending gate's Anthropic profile (PR B): one reviewed row, Claude Haiku 5.5.

Offline only: temporary directories and fake dispatch functions. No real key, no DNS, no
upstream call. The key below is a made-up value in Anthropic's key shape, built from pieces so a
secret scanner does not read it as one.
"""
import contextlib
import hashlib
import io
import json
import os
import re
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
KEY = 'sk-' + 'ant-' + 'api03-' + 'synthetic' + '-0123456789'  # A made-up test value.
OTHER_SHAPE = 'sk-' + 'ant-' + 'api03-LEAKED_value-42'  # Any other string of the same shape.
# The reviewed row and Anthropic's two list-price steps, written out independently of the gate:
# the row holds the lower step's prices (0.10 / 0.50), bound 32768; a request whose bytes + 2048 are
# above 100,000 reserves at the upper step's (0.50 / 2.50), the ceiling (owner ruling 2026-10-10, evening).
PRICE_IN, PRICE_OUT, BOUND = Decimal('0.10'), Decimal('0.50'), 32768
CEIL_IN, CEIL_OUT = Decimal('0.50'), Decimal('2.50')  # The upper step's plain input and output prices.
STEP_TOKENS = 100000
# Prompt caching (owner approval 2026-10-12): a request whose system is the two-block form (the cache mark
# on the first block) reserves its whole input at the step's 5-minute cache-write price instead.
WRITE_IN, UPPER_WRITE_IN = Decimal('0.125'), Decimal('0.625')
# The dearest any accepted request reserves at: a cached request at the upper step (0.625 in, 2.50 out).
CEILING = (UPPER_WRITE_IN, CEIL_OUT)
CACHE_MARK = {'type': 'ephemeral'}
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


def cached_system(prefix='Offline synthetic instruction and safety frame\n\n',
                  tail='--- PER-CALL MARKERS (engine) ---\nBoundary marker: f00d\nCanary: c0de\n--- END PER-CALL MARKERS ---'):
    """The two-block system the app's adapter sends when the frame carries its per-call marker tail."""
    return [{'type': 'text', 'text': prefix, 'cache_control': dict(CACHE_MARK)}, {'type': 'text', 'text': tail}]


def cached_request(**changes):
    return request(**{'system': cached_system(), **changes})


def is_cached(value):
    """A request that carries a cache mark: the two-block system, or (LG-B) a marked first user turn."""
    messages = value.get('messages') if isinstance(value, dict) else None
    return isinstance(value, dict) and (isinstance(value.get('system'), list)
                                        or (isinstance(messages, list) and messages and isinstance(messages[0], dict)
                                            and isinstance(messages[0].get('content'), list)))


def reservation_of(raw):
    """Written out independently of the gate: the step by the request's size, the input at the step's
    5-minute cache-write price when the request carries the two-block system, else at its input price."""
    tokens = len(raw.encode()) + 2048
    try:
        cached = is_cached(json.loads(raw))
    except ValueError:
        cached = False
    if tokens <= STEP_TOKENS:
        price_in, price_out = (WRITE_IN if cached else PRICE_IN), PRICE_OUT
    else:
        price_in, price_out = (UPPER_WRITE_IN if cached else CEIL_IN), CEIL_OUT
    return (Decimal(tokens) * price_in + Decimal(BOUND) * price_out) / Decimal(1000000)


def envelope(value, operation_id='op-1'):
    raw = json.dumps(value)
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reservation_of(raw))}


def envelope_text(raw, operation_id='op-1'):
    """An envelope for exact request bytes (the app's own text), reserved as the app reserves them."""
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reservation_of(raw))}


def sized(size, cached=False):
    value = (cached_request if cached else request)(messages=[{'role': 'user', 'content': ''}])
    value['messages'][0]['content'] = 'x' * (size - len(json.dumps(value).encode()))
    assert len(json.dumps(value).encode()) == size
    return value


def message(input_tokens=1000, output_tokens=500, model=HAIKU, text='OK', content=None, **usage):
    """An Anthropic Messages reply as the vendor documents it."""
    return {'id': 'msg_synthetic', 'type': 'message', 'role': 'assistant', 'model': model,
            'content': [{'type': 'text', 'text': text}] if content is None else content,
            'stop_reason': 'end_turn', 'stop_sequence': None,
            'usage': {'input_tokens': input_tokens, 'output_tokens': output_tokens, **usage}}


FIVE_MINUTES_30000 = {'ephemeral_5m_input_tokens': 30000, 'ephemeral_1h_input_tokens': 0}


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
        # The proposed GO (README-anthropic.md): $2.00 and 600 calls a day, 2 calls in flight.
        go = {'provider': 'anthropic', 'enabled_models': [HAIKU], 'daily_budget_usd': '2.00',
              'max_paid_posts_per_day': 600, 'max_concurrent_calls': 2, **changes}
        gate = Gate(bridge, **go)
        self.gates.append(gate)
        return gate

    def ready(self, **changes):
        return self.gate(**changes).ready()

    def call(self, gate, operation_id='op-1', reply=None, status=200, value=None, dispatch=None, **kwargs):
        if dispatch is None:
            def dispatch(_sent, _key):
                # As helper.HttpsTransport parses a reply (final review 2026-10-16, Important 2): floats as Decimals.
                return status, json.loads(json.dumps(message() if reply is None else reply), parse_float=Decimal)
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
                          'cache_write_5m_input_usd_per_m': str(ANTHROPIC.settlement_steps[0].cache_write_5m_usd_per_m),
                          'cache_write_5m_input_nano_usd_per_token': int(ANTHROPIC.settlement_steps[0].cache_write_5m_usd_per_m * 1000),
                          'output_bound': row.output_bound,
                          'efforts': ['default' if word is None else word for word in row.efforts],
                          'json_object': row.json_object,
                          'worst_case_reservation_usd': '%.9f' % bridge.worst_case_reservation(ANTHROPIC, row),
                          'worst_case_uncached_reservation_usd': '%.9f' % bridge.reservation_for(
                              ANTHROPIC.max_request_bytes, row, ANTHROPIC.reservation_prices(row, None, ANTHROPIC.max_request_bytes))},
                         parity['rows'][0])
        self.assertEqual([{'prompt_tokens_up_to': step.prompt_tokens_up_to, 'input_usd_per_m': str(step.input_usd_per_m),
                           'cache_write_5m_usd_per_m': str(step.cache_write_5m_usd_per_m),
                           'cache_write_1h_usd_per_m': str(step.cache_write_1h_usd_per_m),
                           'cache_read_usd_per_m': str(step.cache_read_usd_per_m),
                           'output_usd_per_m': str(step.output_usd_per_m)} for step in ANTHROPIC.settlement_steps],
                         parity['settlement_steps'])
        # And the independent copy these tests use.
        self.assertEqual((row.input_usd_per_m, row.output_usd_per_m, row.output_bound, row.efforts, row.json_object),
                         (PRICE_IN, PRICE_OUT, BOUND, ('high', 'medium', 'low'), False))
        lower, upper = ANTHROPIC.settlement_steps
        self.assertEqual((lower.input_usd_per_m, lower.cache_write_5m_usd_per_m, lower.cache_write_1h_usd_per_m,
                          lower.cache_read_usd_per_m, lower.output_usd_per_m), tuple(LOWER.values()))
        self.assertEqual((upper.input_usd_per_m, upper.cache_write_5m_usd_per_m, upper.cache_write_1h_usd_per_m,
                          upper.cache_read_usd_per_m, upper.output_usd_per_m), tuple(UPPER.values()))
        # The row is the lower step; the ceiling is the upper step's 5-minute cache-write input price and its
        # output price (a cached request at the upper step: the dearest any accepted request reserves at).
        self.assertEqual((PRICE_IN, PRICE_OUT), (lower.input_usd_per_m, lower.output_usd_per_m))
        self.assertEqual(ANTHROPIC.ceiling_prices(row), CEILING)
        self.assertEqual((CEIL_IN, CEIL_OUT), (upper.input_usd_per_m, upper.output_usd_per_m))
        self.assertEqual((WRITE_IN, UPPER_WRITE_IN), (lower.cache_write_5m_usd_per_m, upper.cache_write_5m_usd_per_m))
        self.assertEqual(ANTHROPIC.RESERVATION_OVERHEAD_BYTES, bridge.RESERVATION_OVERHEAD_BYTES)
        reservation = parity['reservation']
        self.assertEqual((reservation['step_tokens'], Decimal(reservation['upper_input_usd_per_m']),
                          Decimal(reservation['upper_output_usd_per_m']), Decimal(reservation['ceiling_input_usd_per_m']),
                          Decimal(reservation['ceiling_output_usd_per_m'])),
                         (lower.prompt_tokens_up_to, CEIL_IN, CEIL_OUT) + CEILING)

    def test_the_reservation_step_follows_the_request_size(self):
        # bytes + 2048 up to 100,000: the prompt cannot reach the upper step, so the lower prices;
        # one byte more, or an unknown size: the upper step's.
        row, now = ANTHROPIC.rows[HAIKU], bridge.helper.utc_now()
        edge = STEP_TOKENS - 2048
        self.assertEqual(ANTHROPIC.reservation_prices(row, now, edge), (PRICE_IN, PRICE_OUT))
        self.assertEqual(ANTHROPIC.reservation_prices(row, now, 0), (PRICE_IN, PRICE_OUT))
        for size in (edge + 1, 256 * 1024, None, -1, True, 1.0):
            with self.subTest(size=size):
                self.assertEqual(ANTHROPIC.reservation_prices(row, now, size), (CEIL_IN, CEIL_OUT))
                self.assertEqual(ANTHROPIC.reservation_prices(row, now, size, cache_write=True), CEILING)
        # A cached request: the same step rule, its input at the step's 5-minute cache-write price.
        self.assertEqual(ANTHROPIC.reservation_prices(row, now, edge, cache_write=True), (WRITE_IN, PRICE_OUT))
        self.assertEqual(ANTHROPIC.reservation_prices(row, now, edge, cache_write=False), (PRICE_IN, PRICE_OUT))
        go = bridge.read_go(self.gate().go_path)
        for size, prices in ((edge, (PRICE_IN, PRICE_OUT)), (edge + 1, (CEIL_IN, CEIL_OUT))):
            with self.subTest(body_bytes=size):
                _, reserved, _, used = bridge.validate_request(envelope(sized(size)), go)
                self.assertEqual(used, prices)
                self.assertEqual(reserved, (Decimal(size + 2048) * prices[0] + Decimal(BOUND) * prices[1]) / Decimal(1000000))
        # At the edge: (100,000 x 0.10 + 32,768 x 0.50) / 1e6 = $0.026384; one byte more:
        # (100,001 x 0.50 + 32,768 x 2.50) / 1e6 = $0.1319205.
        self.assertEqual(reservation_of(json.dumps(sized(edge))), Decimal('0.026384'))
        self.assertEqual(reservation_of(json.dumps(sized(edge + 1))), Decimal('0.1319205'))

    def test_worst_case_is_pinned_under_the_per_call_cap(self):
        row = ANTHROPIC.rows[HAIKU]
        self.assertEqual((ANTHROPIC.per_call_cap_usd, ANTHROPIC.max_request_bytes), (Decimal('0.25'), 256 * 1024))
        # Prompt caching (2026-10-12): a full-size CACHED request is the worst case now,
        # (264,192 x 0.625 + 32,768 x 2.50) / 1e6 = $0.24704 (an uncached one stays $0.214016).
        self.assertEqual(bridge.worst_case_reservation(ANTHROPIC, row), Decimal('0.24704'))
        self.assertEqual((Decimal(264192) * UPPER_WRITE_IN + Decimal(32768) * CEIL_OUT) / Decimal(1000000), Decimal('0.24704'))
        self.assertEqual((Decimal(264192) * CEIL_IN + Decimal(32768) * CEIL_OUT) / Decimal(1000000), Decimal('0.214016'))
        self.assertTrue(bridge.row_reviewed(ANTHROPIC, HAIKU, row))
        self.assertIs(bridge.profile_of('anthropic'), ANTHROPIC)
        go = bridge.read_go(self.gate().go_path)
        _, reserved, _, prices = bridge.validate_request(envelope(sized(ANTHROPIC.max_request_bytes)), go)
        self.assertEqual((reserved, prices), (Decimal('0.214016'), (CEIL_IN, CEIL_OUT)))
        _, reserved, _, prices = bridge.validate_request(envelope(sized(ANTHROPIC.max_request_bytes, cached=True)), go)
        self.assertEqual((reserved, prices), (Decimal('0.24704'), CEILING))
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.validate_request(envelope(sized(ANTHROPIC.max_request_bytes + 1)), go)
        # A row whose full-size cached request would pass the cap is not reviewed, and its GO is refused:
        # 264,192 x 0.625 = 165,120, so 33,952 x 2.50 = 84,880 reaches the $0.25 exactly and 33,953 tips it over.
        with patch.object(ANTHROPIC, 'rows', {HAIKU: row._replace(output_bound=33952)}):
            self.assertIs(bridge.profile_of('anthropic'), ANTHROPIC)
        with patch.object(ANTHROPIC, 'rows', {HAIKU: row._replace(output_bound=33953)}):
            self.assertIsNone(bridge.profile_of('anthropic'))

    def test_a_small_request_reserves_exactly_and_the_app_nano_usd_form_is_accepted(self):
        go = bridge.read_go(self.gate().go_path)
        value = request()
        raw = json.dumps(value, separators=(',', ':'))
        self.assertEqual(len(raw.encode()), 185)
        expected = Decimal('0.0166073')  # ((185 + 2048) x 0.10 + 32768 x 0.50) / 1e6: the lower step
        total = (len(raw.encode()) + 2048) * 100 + BOUND * 500  # The app's nano-USD sum.
        typescript = '%d.%09d' % (total // 10 ** 9, total % 10 ** 9)
        self.assertEqual(typescript, '0.016607300')
        sent = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': typescript}
        outgoing, reserved, row, prices = bridge.validate_request(sent, go)
        self.assertEqual((reserved, row.model, prices, json.loads(outgoing)), (expected, HAIKU, (PRICE_IN, PRICE_OUT), value))
        # Sorted keys, no spaces: the same length as the compact bytes priced, never longer.
        self.assertEqual((outgoing, len(outgoing)), (bridge.helper.canonical(value), len(raw.encode())))
        with self.refused('RESERVATION_MISMATCH'):
            bridge.validate_request({**sent, 'reservedUsd': '0.016607299'}, go)


class FinalWriterTierTests(AnthropicTest):
    """Length guidance LG-B (L26, L29, owner answer 4, 2026-10-15): Claude Haiku as a final writer may send 1 MiB and ask
    its own maximum (128,000), under its own per-call cap of $1.00."""

    def test_haiku_final_writer_tier_reserves_at_most_one_dollar(self):
        parity = json.loads(PARITY.read_text())['final_writer']
        row = ANTHROPIC.rows[HAIKU]
        self.assertEqual((ANTHROPIC.final_writer_max_request_bytes, ANTHROPIC.final_writer_per_call_cap_usd, row.final_writer_output_bound),
                         (1024 * 1024, Decimal('1.00'), 128000))
        self.assertEqual((parity['request_bytes'], Decimal(parity['per_call_cap_usd'])), (1024 * 1024, Decimal('1.00')))
        worst = bridge.worst_case_reservation(ANTHROPIC, row, 'FINAL_WRITER')
        # (1,050,624 x 0.625 + 128,000 x 2.50) / 1e6: a cached full-size request at the upper step.
        self.assertEqual(worst, Decimal('0.97664'))
        uncached = bridge.reservation_for(1024 * 1024, bridge.tier_row(ANTHROPIC, row, 'FINAL_WRITER'),
                                          ANTHROPIC.reservation_prices(row, None, 1024 * 1024))
        self.assertEqual(parity['rows'], [{'model': HAIKU, 'output_bound': 128000, 'worst_case_reservation_usd': '%.9f' % worst,
                                           'worst_case_uncached_reservation_usd': '%.9f' % uncached}])
        self.assertTrue(bridge.row_reviewed(ANTHROPIC, HAIKU, row))
        self.assertLessEqual(worst, bridge.MAX_PROFILE_CALL_CAP_USD)

    def test_a_cached_1_mib_final_writer_request_reserves_at_the_upper_write_price(self):
        go = bridge.read_go(self.gate(max_final_writer_calls=1).go_path)
        value = cached_request(max_tokens=128000, messages=[{'role': 'user', 'content': ''}])
        value['messages'][0]['content'] = 'x' * (1024 * 1024 - len(json.dumps(value).encode()))
        raw = json.dumps(value)
        reserved = (Decimal(len(raw.encode()) + 2048) * UPPER_WRITE_IN + Decimal(128000) * CEIL_OUT) / Decimal(1000000)
        self.assertEqual(reserved, Decimal('0.97664'))
        _outgoing, got, row, prices = bridge.validate_request({**envelope_text(raw), 'reservedUsd': str(reserved),
                                                               'callTier': 'FINAL_WRITER'}, go)
        self.assertEqual((got, row.output_bound, prices), (reserved, 128000, CEILING))
        with self.refused('REQUEST_SCOPE_INVALID'):  # Without the tier the same body is over the standard 256 KiB.
            bridge.validate_request(envelope_text(raw), go)
        with self.subTest('an unreported final-writer charge is booked at the tier hold it took (Task 4b, M3)'):
            # Unreadable input, a readable output count priced above this body's standard hold but within its
            # final-writer hold (lower step, 60,000 x 0.50 / 1e6 = $0.03): booked at the hold the call took, the tier's.
            gate = self.ready(max_final_writer_calls=1)
            small = json.dumps(request(max_tokens=128000))
            hold = (Decimal(len(small.encode()) + 2048) * PRICE_IN + Decimal(128000) * PRICE_OUT) / Decimal(1000000)
            self.assertLess(reservation_of(small), Decimal('0.03'))
            self.assertLess(Decimal('0.03'), hold)
            reply = {**message(), 'usage': {'input_tokens': True, 'output_tokens': 60000}}
            options = {'peer_uid': PEER, 'slots': gate.slots, 'key_loader': lambda _private: KEY, 'host': HOST,
                       'platform': 'linux', 'now': gate.clock, 'slot_wait': 0.2,
                       'dispatch': lambda _sent, _key: (200, json.loads(json.dumps(reply)))}
            with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                bridge.execute_request(gate.private, gate.go_path, {**envelope_text(small), 'reservedUsd': str(hold),
                                                                    'callTier': 'FINAL_WRITER'}, **options)
            entry = entry_of(gate)
            self.assertEqual((entry['state'], entry['reason'], entry['call_tier'], entry['output_bound'], Decimal(entry['held_usd']),
                              Decimal(entry['reserved_usd'])), ('settled_reserved_max', 'charge_unreported', 'FINAL_WRITER', 128000, hold, hold))
            self.assertEqual(gate.status()['state'], 'active')
            # Negative control: at the standard hold the hook would see the count above it (the call would halt).
            self.assertFalse(ANTHROPIC.bookable_unreported(200, reply, entry['accounting'], reservation_of(small)))


class GoAndActivateTests(AnthropicTest):
    def test_the_owners_pots_add_up_to_the_team_total_and_one_cent_more_refuses(self):
        # Owner answer M1 (2026-10-15): Anthropic $4.00 (this GO) + DeepInfra $12.00 = $16.00; owner answer Q12
        # (2026-10-30): + Perplexity $1.00 = the $17.00 team total. Each GO
        # alone may ask up to the $12.00 per-GO ceiling, so a $4.01 Anthropic GO is itself valid: what refuses it is
        # the team-total check at activate.
        def deepinfra_go(gate, budget):
            for provider, amount in (('deepinfra', budget), ('perplexity', '1.00')):
                path = gate.root / ('team-go-' + provider + '.json')
                path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': provider,
                                            'daily_budget_usd': amount}))
                os.chmod(path, 0o600)
        self.assertEqual((bridge.TEAM_TOTAL_BUDGET_USD, bridge.MAX_GO_BUDGET_USD), (Decimal('17.00'), Decimal('12.00')))
        gate = self.gate(daily_budget_usd='4.00')
        self.assertEqual(bridge.read_go(gate.go_path)['daily_budget_usd'], '4.00')
        gate.init()
        deepinfra_go(gate, '12.00')
        self.assertEqual(gate.activate()['state'], 'active')  # 4.00 + 12.00 + 1.00 = 17.00 exactly.
        for mine, theirs in (('4.01', '12.00'), ('4.02', '11.99')):
            with self.subTest(anthropic=mine, deepinfra=theirs):
                gate = self.gate(daily_budget_usd=mine)
                self.assertEqual(bridge.read_go(gate.go_path)['daily_budget_usd'], mine)  # Valid on its own.
                gate.init()
                deepinfra_go(gate, theirs)
                with self.refused('TEAM_TOTAL_BUDGET_EXCEEDED'):
                    gate.activate()

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
        # The proposed GO: 2 x 0.24704 = 0.49408 fits $2.00. 4 x 0.24704 = 0.98816 (a cached full-size request).
        for budget, calls, ok in (('2.00', 2, True), ('0.50', 2, True), ('0.49', 2, False),
                                  ('0.98', 4, False), ('0.99', 4, True), ('0.24', 1, False), ('0.25', 1, True)):
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
        # A reply whose prompt total is near or above the step needs a request that large: its bytes
        # + 2048 above 100,000 reserve at the upper step (a small request could never bring one back).
        usage = reply.get('usage') if isinstance(reply.get('usage'), dict) else {}
        prompt = sum(value for value in (usage.get('input_tokens'), usage.get('cache_creation_input_tokens'),
                                         usage.get('cache_read_input_tokens')) if type(value) is int)
        # A reply reporting cache tokens needs a request that asked for caching (the two-block system).
        cached = any(type(usage.get(name)) is int and usage[name] > 0
                     for name in ('cache_creation_input_tokens', 'cache_read_input_tokens'))
        gate = gate or self.ready()
        value = sized(120000, cached) if prompt > 50000 else cached_request() if cached else None
        result = self.call(gate, operation_id, reply=reply, value=value)
        self.assertEqual(result['status'], 200)
        return gate, entry_of(gate, operation_id)

    def test_fixture_replies_settle_exactly_at_both_steps_with_the_boundary_on_the_lower_one(self):
        cases = (('small', message(1000, 500), 'up_to_100k', Decimal('0.00035')),
                 ('boundary_100000', message(100000, 1000), 'up_to_100k', Decimal('0.0105')),
                 ('just_over_100001', message(100001, 1000), 'over_100k', Decimal('0.0525005')),
                 # Cache reads and writes count toward the prompt total that picks the step (a 5-minute write here).
                 ('mixed_100000', message(60000, 10, cache_creation_input_tokens=30000, cache_read_input_tokens=10000,
                                  cache_creation=FIVE_MINUTES_30000),
                  'up_to_100k', Decimal('0.009855')),
                 ('mixed_100001', message(60000, 10, cache_creation_input_tokens=30000, cache_read_input_tokens=10001,
                                  cache_creation=FIVE_MINUTES_30000),
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
                                  # The reservation follows the REQUEST's size: a reply this large needed a large request,
                                  # and a reply with cache tokens a cached one (its input at the 5-minute write price).
                                  'reserve_input_usd_per_m': '0.10' if name == 'small' else '0.625' if name.startswith('mixed') else '0.50',
                                  'reserve_output_usd_per_m': '0.50' if name == 'small' else '2.50',
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
        # Without its split, the write a cached request asked for is the 5-minute kind (the only mark it may carry):
        # 2000 x 0.10 + 3000 x 0.125 + 4000 x 0.01 + 100 x 0.50 = 665 -> $0.000665
        self.assertEqual(cost(LOWER, 2000, 3000, 0, 4000, 100), Decimal('0.000665'))
        documented = message(2000, 100, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                             cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0},
                             server_tool_use={'web_search_requests': 0, 'web_fetch_requests': 0},
                             service_tier='standard', inference_geo='global')
        nulls = message(2000, 100, cache_creation_input_tokens=None, cache_read_input_tokens=None, cache_creation=None,
                        server_tool_use=None, service_tier=None, inference_geo=None)
        # Anthropic's Messages reference (read 2026-10-11) adds usage.output_tokens_details.thinking_tokens: a
        # read-only split of output_tokens, which stays the inclusive billed total. Haiku 5.5 thinks by default,
        # so every real reply carries it (the first live probe halted on it).
        thinking = {**message(2000, 100, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                              cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0},
                              server_tool_use={'web_search_requests': 0, 'web_fetch_requests': 0},
                              service_tier='standard', inference_geo='global',
                              output_tokens_details={'thinking_tokens': 60}),
                    'stop_details': None, 'diagnostics': None}
        thinking_null = message(2000, 100, output_tokens_details=None)
        thinking_all = message(2000, 100, output_tokens_details={'thinking_tokens': 100})
        for name, reply, expected, step, hour in (('lower', lower, Decimal('0.000815'), 'up_to_100k', 2000),
                                                  ('upper', upper, Decimal('0.05475'), 'over_100k', 2000),
                                                  ('no_split', no_split, Decimal('0.000665'), 'up_to_100k', 0),
                                                  ('documented_zeros', documented, cost(LOWER, 2000, output=100), 'up_to_100k', 0),
                                                  ('nulls', nulls, cost(LOWER, 2000, output=100), 'up_to_100k', 0),
                                                  ('documented_thinking_split', thinking, cost(LOWER, 2000, output=100), 'up_to_100k', 0),
                                                  ('thinking_split_null', thinking_null, cost(LOWER, 2000, output=100), 'up_to_100k', 0),
                                                  ('thinking_equals_output', thinking_all, cost(LOWER, 2000, output=100), 'up_to_100k', 0)):
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

    def test_a_200_that_is_no_message_halts_with_the_full_hold_kept(self):
        for name, reply in (('empty_body', {}), ('not_json', {'_invalid_json': True})):
            with self.subTest(name):
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply)
                self.assert_uncertain_halt(gate)

    def test_every_usage_shape_the_profile_does_not_know_halts_and_missing_or_unreadable_counts_are_booked(self):
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
            'speed_fast': {'speed': 'fast'},
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
            'output_details_not_a_dict': {'output_tokens_details': 60},
            'output_details_unknown_key': {'output_tokens_details': {'thinking_tokens': 0, 'tool_tokens': 0}},
            'output_details_negative': {'output_tokens_details': {'thinking_tokens': -1}},
            'output_details_float': {'output_tokens_details': {'thinking_tokens': Decimal('1.0')}},
            'output_details_bool': {'output_tokens_details': {'thinking_tokens': True}},
            'output_details_above_output': {'output_tokens_details': {'thinking_tokens': 501}},
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
            'container_upload_block': {**good, 'content': [{'type': 'text', 'text': 'OK'}, {'type': 'container_upload', 'file_id': 'f'}]},
            'unknown_block': {**good, 'content': [{'type': 'image', 'source': {}}]},
            'block_without_type': {**good, 'content': [{'text': 'OK'}]},
            'container': {**good, 'container': {'id': 'c', 'expires_at': 'x'}},
            'container_empty_object': {**good, 'container': {}},
            'context_management': {**good, 'context_management': {'applied_edits': []}},
            'context_management_empty_object': {**good, 'context_management': {}},
            'usage_outside_usage': {**good, 'server_usage': {'x': 1}},
            'tokens_outside_usage': {**good, 'cache_tokens': 5},
            'tokens_outside_usage_null': {**good, 'cache_tokens': None},
            'usage_a_list': {**good, 'usage': [1000, 500]},
        })
        # Owner answer M3 (2026-10-15): a message whose usage is missing or whose input/output counts cannot be read is booked
        # at its reservation (UnreportedChargeBookedTests); every other shape the profile does not know still halts.
        # Final review (2026-10-16, Minor 1): a usage of another type (usage_a_list) is not an absent usage: it halts.
        booked = {'input_float', 'input_bool', 'input_negative', 'output_missing'}
        for name, reply in replies.items():
            with self.subTest(name):
                self.assertFalse(ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)['usage_valid'])
                gate = self.ready()
                if name in booked:
                    with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                        self.call(gate, reply=reply, dispatch=lambda _s, _k, r=reply: (200, r))
                    self.assertEqual((entry_of(gate)['state'], gate.status()['state']), ('settled_reserved_max', 'active'))
                    continue
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, dispatch=lambda _s, _k, r=reply: (200, r))
                self.assert_uncertain_halt(gate)
        # The control: the same reply with the documented fields is valid.
        self.assertTrue(ANTHROPIC.account(good, ANTHROPIC.rows[HAIKU], None)['usage_valid'])

    def test_a_reply_with_a_null_container_and_null_context_editing_settles(self):
        # Messages reference (read 2026-10-11): `container` is "Container or null"; a reply that used
        # none carries it as null, and context_management likewise. Null means none was used.
        documented = {**message(cache_creation_input_tokens=0, cache_read_input_tokens=0,
                                cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0},
                                server_tool_use={'web_search_requests': 0, 'web_fetch_requests': 0},
                                service_tier='standard', inference_geo='global',
                                output_tokens_details={'thinking_tokens': 0}),
                      'container': None, 'context_management': None, 'stop_details': None, 'diagnostics': None}
        accounting = ANTHROPIC.account(documented, ANTHROPIC.rows[HAIKU], None)
        self.assertTrue(accounting['usage_valid'])
        self.assertEqual(accounting['guard_charge_usd'],
                         ANTHROPIC.account(message(), ANTHROPIC.rows[HAIKU], None)['guard_charge_usd'])
        self.assertNotIn('invalid_reason', accounting)
        self.assertNotIn('reply_shape', accounting)
        gate = self.ready()
        self.call(gate, reply=documented)
        self.assertEqual(entry_of(gate)['state'], 'settled')
        self.assertEqual(gate.status()['state'], 'active')

    @staticmethod
    def halted_shape(**usage):
        """The reply that halted the live gate at 02:59:54 UTC on 2026-10-16, field for field as its ledger
        outline shows it (HTTP 200, Haiku), with made-up numbers: every member it carried, usage.speed included."""
        return {**message(2000, 100, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                          cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0},
                          service_tier='standard', inference_geo='global',
                          output_tokens_details={'thinking_tokens': 60}, **usage),
                'container': None, 'stop_details': None, 'diagnostics': None}

    def test_usage_speed_standard_or_absent_settles_at_the_list_price(self):
        # Fast mode page (platform.claude.com/docs/en/build-with-claude/fast-mode, read 2026-10-16): usage.speed
        # is "fast" or "standard", the speed the call ran at. "standard" is the list price; so is a reply without it.
        expected = cost(LOWER, 2000, output=100)
        for name, reply in (('standard', self.halted_shape(speed='standard')), ('absent', self.halted_shape()),
                            ('null', self.halted_shape(speed=None)), ('plain_standard', message(2000, 100, speed='standard'))):
            with self.subTest(name):
                accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)
                self.assertTrue(accounting['usage_valid'])
                self.assertEqual(Decimal(accounting['guard_charge_usd']), expected)
                gate = self.ready()
                self.call(gate, reply=reply)
                entry = entry_of(gate)
                self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', expected))
                self.assertEqual(gate.status()['state'], 'active')

    def test_any_other_usage_speed_halts_and_the_outline_names_it(self):
        # "fast" is premium pricing (the same page: Opus fast mode at 2x the list price), and the reviewed row
        # holds Haiku's standard prices only; any value the docs do not name is unknown. Both stay uncertain.
        for name, value, label in (('fast', 'fast', 'fast'), ('priority', 'priority', 'priority'),
                                   ('capitalised', 'Standard', '(other)'), ('empty', '', '(other)'),
                                   ('number', 1, 'number'), ('object', {'mode': 'standard'}, 'object')):
            with self.subTest(name):
                reply = self.halted_shape(speed=value)
                accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)
                self.assertFalse(accounting['usage_valid'])
                self.assertEqual(accounting['invalid_reason'], 'speed')
                self.assertEqual(accounting['reply_shape']['usage_labels'],
                                 {'service_tier': 'standard', 'inference_geo': 'global', 'speed': label})
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply)
                self.assert_uncertain_halt(gate)
                self.assertEqual(entry_of(gate)['accounting']['invalid_reason'], 'speed')

    def test_an_unreadable_usage_records_which_check_failed(self):
        cases = {
            'not_a_message': ({**message(), 'type': 'error'}, 'not_a_message'),
            'container': ({**message(), 'container': {'id': 'c', 'expires_at': 'x'}}, 'unpriced_reply_member'),
            'context_management': ({**message(), 'context_management': {}}, 'unpriced_reply_member'),
            'counts_outside_usage': ({**message(), 'cache_tokens': 5}, 'counts_outside_usage'),
            'content_not_a_list': ({**message(), 'content': 'OK'}, 'content_block'),
            'tool_block': (message(content=[{'type': 'tool_use', 'id': 't', 'name': 'x', 'input': {}}]), 'content_block'),
            'usage_missing': (without('usage', message()), 'usage_missing'),
            'unknown_usage_field': (message(cache_write_tokens=7), 'usage_unknown_field'),
            'token_counts': (message(input_tokens=True), 'token_counts'),
            'output_details': (message(output_tokens_details={'thinking_tokens': 501}), 'output_tokens_details'),
            'cache_counts': (message(cache_read_input_tokens=-1), 'cache_counts'),
            'server_tool_use': (message(server_tool_use={'web_search_requests': 1}), 'server_tool_use'),
            'service_tier': (message(service_tier='priority'), 'service_tier'),
            'inference_geo': (message(inference_geo='us'), 'inference_geo'),
            'speed': (message(speed='fast'), 'speed'),
            'cache_split': (message(cache_creation={'ephemeral_5m_input_tokens': 5, 'ephemeral_1h_input_tokens': 0}),
                            'cache_split'),
        }
        for name, (reply, reason) in cases.items():
            with self.subTest(name):
                accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)
                self.assertFalse(accounting['usage_valid'])
                self.assertEqual(accounting['invalid_reason'], reason)
                self.assertIn('reply_shape', accounting)

    def test_the_outline_holds_field_names_kinds_and_two_usage_labels_only(self):
        # Never the reply text, a token count, an id, the model name or any free-form name.
        reply = {**message(input_tokens=1234, output_tokens=56, text='private words', service_tier='standard',
                           inference_geo='us', cache_creation_input_tokens=0,
                           cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0}),
                 'container': None, 'stop_details': None, 'Free Form-Name': 3,
                 'content': [{'type': 'text', 'text': 'private words'}, {'type': 'thinking', 'thinking': 'more'}]}
        accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)
        self.assertEqual(accounting['invalid_reason'], 'inference_geo')
        self.assertEqual(accounting['reply_shape'], {
            'reply': ['(other):number', 'container:null', 'content:array', 'id:string', 'model:string', 'role:string',
                      'stop_details:null', 'stop_reason:string', 'stop_sequence:null', 'type:string', 'usage:object'],
            'content': ['text', 'thinking'],
            'usage': ['cache_creation.ephemeral_1h_input_tokens:number', 'cache_creation.ephemeral_5m_input_tokens:number',
                      'cache_creation:object', 'cache_creation_input_tokens:number', 'inference_geo:string',
                      'input_tokens:number', 'output_tokens:number', 'service_tier:string'],
            'usage_labels': {'service_tier': 'standard', 'inference_geo': 'us'}})
        text = json.dumps(accounting)
        for secret in ('private', 'more', '1234', '56', 'msg_synthetic', HAIKU, 'Free'):
            self.assertNotIn(secret, text)

    def test_the_outline_is_bounded_and_odd_values_become_kinds(self):
        many = {'k%03d' % index: index for index in range(200)}
        reply = {**message(service_tier='Not A Label', inference_geo=7, **many), 'content': [{'text': 'x'}, 'x'] * 50}
        shape = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)['reply_shape']
        self.assertEqual(shape['usage_labels'], {'service_tier': '(other)', 'inference_geo': 'number'})
        self.assertEqual(len(shape['usage']), 41)
        self.assertEqual(shape['usage'][-1], '(+164 more)')
        self.assertEqual(len(shape['content']), 41)
        self.assertEqual(shape['content'][:2], ['(no type)', '(not an object)'])
        self.assertEqual(ANTHROPIC.account({'_invalid_json': True}, ANTHROPIC.rows[HAIKU], None)['reply_shape'],
                         {'reply': ['_invalid_json:boolean']})
        self.assertEqual(ANTHROPIC.account([1], ANTHROPIC.rows[HAIKU], None)['reply_shape'], {'reply_kind': 'array'})
        self.assertLess(len(json.dumps(shape)), 8192)

    def test_a_halted_call_keeps_the_reason_and_the_outline_in_its_ledger_entry(self):
        reply = {**message(text='private words'), 'container': {'id': 'c-77', 'expires_at': 'x'}}
        gate = self.ready()
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            self.call(gate, reply=reply)
        self.assert_uncertain_halt(gate)
        accounting = entry_of(gate)['accounting']
        self.assertEqual(accounting['invalid_reason'], 'unpriced_reply_member')
        self.assertIn('container:object', accounting['reply_shape']['reply'])
        ledger = ''.join(path.read_text() for path in sorted(gate.private.iterdir()) if path.suffix == '.json')
        self.assertNotIn('private words', ledger)
        self.assertNotIn('c-77', ledger)

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
                with self.refused('SETTLED_INTO_HALT'):
                    self.call(gate, reply=message(model=named))
                entry = entry_of(gate)
                self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', Decimal('0.00035')))
                self.assertEqual(entry['reply_model'], named if isinstance(named, str) else None)
                self.assertEqual((gate.status()['state'], gate.status()['reason']),
                                 ('halted', 'provider_error_or_model_identity'))

    def test_an_error_status_with_valid_usage_settles_and_halts(self):
        gate = self.ready()
        with self.refused('SETTLED_INTO_HALT'):
            self.call(gate, reply=message(), status=500)
        self.assertEqual((entry_of(gate)['state'], gate.status()['reason']), ('settled', 'provider_error_or_model_identity'))

    def test_a_1h_cache_write_above_the_hold_is_charged_and_halts_with_charge_overrun(self):
        # The ceiling (0.625 input, a 5-minute write) is not the dearest input price: a 1-hour cache write over
        # 100,000 tokens is 1.00. No request can ask for one, but if Anthropic reports one anyway, the call is
        # charged in full (no cap at the hold) and the gate halts with charge_overrun.
        hour = {'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 200000}
        reply = message(1000, 100, cache_creation_input_tokens=200000, cache_creation=hour)
        expected = cost(UPPER, 1000, write_1h=200000, output=100)
        self.assertEqual(expected, Decimal('0.20075'))
        gate = self.ready()
        with self.refused('SETTLED_INTO_HALT'):
            self.call(gate, reply=reply)
        entry = entry_of(gate)
        self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', expected))
        self.assertGreater(Decimal(entry['held_usd']), Decimal(entry['reserved_usd']))
        self.assertEqual(Decimal(entry['overrun_usd']), expected - Decimal(entry['reserved_usd']))
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'charge_overrun'))


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
                                  status_now['today_spend_usd'], status_now['in_flight']), ('active', 0, 0, '0', 0))
                # A's machinery: the entry stays on the record at $0 as 'released_unbilled'.
                entries = gate.day(DAY)['entries']
                self.assertEqual([(e['state'], e['held_usd'], e['http_status'], e['reason']) for e in entries.values()],
                                 [('released_unbilled', '0', status, 'unbilled_refusal')])
                self.assertEqual(status_now['today_unbilled_releases'], 1)
                self.assertIn('"reason": "unbilled_refusal"', self.out.getvalue())
        self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_REFUSED_UNBILLED'))),
                         {'error': 'PROVIDER_REFUSED_UNBILLED'})

    @staticmethod
    def error(kind, **extra):
        return {'type': 'error', 'error': {'type': kind, 'message': 'synthetic'}, **extra}

    NOT_BUSY = ((400, 'invalid_request_error'), (404, 'not_found_error'), (413, 'request_too_large'), (500, 'api_error'))

    def test_other_well_formed_non_billing_errors_are_released_on_the_same_ledger_entry(self):
        # Judge round on PR B: Anthropic's own error answers that bill nothing go through A's
        # released_unbilled machinery (a $0 entry kept on the record). Review 2026-10-12: only 429/529
        # say the model is busy; these four are not busy, so they count toward the gate-wide unsent
        # streak exactly as before gate v4, never cool the model, and the caller sees
        # PROVIDER_ERROR_UNBILLED (the app's plain unbilled refusal, never the busy one).
        for status, kind in self.NOT_BUSY:
            with self.subTest(status=status):
                reply = self.error(kind, request_id='req_synthetic')
                self.assertTrue(ANTHROPIC.unbilled_refusal(status, reply))
                self.assertFalse(ANTHROPIC.busy_refusal(status, reply))
                gate = self.ready()
                with self.refused('PROVIDER_ERROR_UNBILLED'):
                    self.call(gate, reply=reply, status=status)
                entries = list(gate.day(DAY)['entries'].values())
                self.assertEqual([(e['state'], e['held_usd'], e['http_status']) for e in entries],
                                 [('released_unbilled', '0', status)])
                now = gate.status()
                self.assertEqual((now['state'], now['today_spend_usd'], now['today_unbilled_releases'], now['in_flight'],
                                  now['unsent_streak'], now['cooling']), ('active', '0', 1, 0, 1, {}))
        self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_ERROR_UNBILLED'))),
                         {'error': 'PROVIDER_ERROR_UNBILLED'})

    def test_only_429_and_529_are_busy(self):
        for status, reply in ((429, self.RATE), (429, self.BUSY), (529, self.BUSY), (529, self.RATE)):
            with self.subTest(status=status, kind=reply['error']['type']):
                self.assertTrue(ANTHROPIC.unbilled_refusal(status, reply))
                self.assertTrue(ANTHROPIC.busy_refusal(status, reply))
        for status, kind in self.NOT_BUSY:
            self.assertFalse(ANTHROPIC.busy_refusal(status, self.error(kind)))

    def test_five_404s_in_a_row_halt_provider_unreachable(self):
        # As before gate v4: five not-busy unbilled errors with no settled reply between halt the gate
        # (the halt watcher then emails), and the model is never cooled on the way.
        gate = self.ready()
        missing = self.error('not_found_error')
        for number in range(1, 5):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, 'op-%d' % number, reply=missing, status=404)
            self.assertEqual((gate.status()['state'], gate.status()['unsent_streak'], gate.status()['cooling']),
                             ('active', number, {}))
        with self.refused('PROVIDER_ERROR_UNBILLED'):
            self.call(gate, 'op-5', reply=missing, status=404)
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], status['unsent_streak'], status['today_unbilled_releases'],
                          status['today_spend_usd'], status['in_flight']), ('halted', 'provider_unreachable', 5, 5, '0', 0))
        sent = []
        with self.refused('AUTHORITY_HALTED'):
            self.call(gate, 'op-6', dispatch=lambda *args: sent.append(args))
        self.assertEqual(sent, [])

    def test_a_settled_reply_resets_the_not_busy_streak_and_busy_refusals_neither_grow_nor_reset_it(self):
        gate = self.ready()
        for number in range(1, 5):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, 'bad-%d' % number, reply=self.error('invalid_request_error'), status=400)
        self.call(gate, 'ok-1')
        self.assertEqual(gate.status()['unsent_streak'], 0)
        for number in range(1, 4):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, 'big-%d' % number, reply=self.error('request_too_large'), status=413)
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            self.call(gate, 'busy-1', reply=self.BUSY, status=529)
        status = gate.status()
        self.assertEqual((status['state'], status['unsent_streak'], status['cooling'][HAIKU]['refusals'],
                          status['cooling'][HAIKU]['cooling_now']), ('active', 3, 1, False))

    def test_400_and_413_never_cool_the_model(self):
        gate = self.ready()
        replies = ((400, self.error('invalid_request_error')), (413, self.error('request_too_large')),
                   (400, self.error('invalid_request_error')), (413, self.error('request_too_large')))
        for number, (status, reply) in enumerate(replies, start=1):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, 'op-%d' % number, reply=reply, status=status)
        self.assertEqual((gate.status()['state'], gate.status()['cooling'], gate.status()['unsent_streak']), ('active', {}, 4))
        sent = []

        def answered(raw, _key):
            sent.append(raw)
            return 200, json.loads(json.dumps(message()))
        self.call(gate, 'op-5', dispatch=answered)  # Not refused MODEL_COOLING: the vendor is asked.
        self.assertEqual((len(sent), gate.status()['unsent_streak']), (1, 0))

    def test_a_not_busy_answer_to_a_cooling_trial_neither_doubles_nor_extends_the_window(self):
        gate = self.ready()
        for number in (1, 2):
            with self.refused('PROVIDER_REFUSED_UNBILLED'):
                self.call(gate, 'busy-%d' % number, reply=self.RATE, status=429)
        before = dict(gate.control()['cooling'][HAIKU])
        gate.clock.set('2026-10-08T09:01:00+00:00')  # The first window has run out: this call is the trial.
        with self.refused('PROVIDER_ERROR_UNBILLED'):
            self.call(gate, 'trial', reply=self.error('invalid_request_error'), status=400)
        after = gate.control()['cooling'][HAIKU]
        self.assertEqual(after, {**before, 'trial': None})
        self.assertEqual(gate.status()['unsent_streak'], 1)
        self.call(gate, 'next')  # The next call is the trial; its answer ends the cool-off.
        self.assertEqual(gate.status()['cooling'], {})

    def test_key_billing_and_client_errors_and_mismatched_types_still_halt(self):
        # Ruling R2 (2026-10-16): these 4xx keep halting; a 5xx without any billing field is booked (UnreportedChargeBookedTests).
        cases = {'401_authentication': (401, self.error('authentication_error')),
                 '403_permission': (403, self.error('permission_error')),
                 '402_billing': (402, self.error('billing_error')),
                 '400_api_error': (400, self.error('api_error')),
                 '404_with_usage': (404, {**self.error('not_found_error'), 'usage': {'input_tokens': 1, 'output_tokens': 0}}),
                 '400_with_content': (400, {**self.error('invalid_request_error'), 'content': []})}
        for name, (status, reply) in cases.items():
            with self.subTest(name):
                self.assertFalse(ANTHROPIC.unbilled_refusal(status, reply))
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, status=status)
                self.assert_uncertain_halt(gate)

    def test_overloaded_answers_never_halt_the_gate_they_cool_the_model_off(self):
        # Owner direction 2026-10-11: 429/529 prove Anthropic is reachable; busy-ness is per model.
        gate = self.ready()
        for number in (1, 2):
            with self.refused('PROVIDER_REFUSED_UNBILLED'):
                self.call(gate, 'op-%d' % number, reply=self.BUSY, status=529)
        for number in range(3, 8):
            sent = []
            with self.refused('MODEL_COOLING'):
                self.call(gate, 'op-%d' % number, dispatch=lambda *args: sent.append(args))
            self.assertEqual(sent, [])
        status = gate.status()
        self.assertEqual((status['state'], status['unsent_streak'], status['today_unbilled_releases'],
                          status['cooling'][HAIKU]['cooling_now']), ('active', 0, 2, True))
        gate.clock.set('2026-10-08T09:01:00+00:00')  # The first window (60 s) has run out: one trial goes through.
        self.call(gate, 'op-8', reply=message())
        self.assertEqual(gate.status()['cooling'], {})

    def test_anything_else_stays_uncertain_and_halts(self):
        cases = {
            '429_with_usage': (429, {**self.RATE, 'usage': {'input_tokens': 10, 'output_tokens': 0}}),
            '429_with_content': (429, {**self.RATE, 'content': []}),
            '429_with_model': (429, {**self.RATE, 'model': HAIKU}),
            '429_model_nested': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'model': HAIKU}}),
            '429_usage_nested': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'detail': {'usage': {}}}}),
            '429_invalid_request_error': (429, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'x'}}),
            '429_error_text': (429, {'type': 'error', 'error': 'rate_limit_error'}),
            '429_type_message': (429, {**self.RATE, 'type': 'message'}),
            '429_extra_top_key': (429, {**self.RATE, 'detail': 'slow down'}),
            '429_request_id_number': (429, {**self.RATE, 'request_id': 7}),
            '429_not_json': (429, {'_invalid_json': True}),
            '429_tokens_prefixed': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'tokens_billed': 3}}),
            '429_tokens_suffixed': (429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'output_tokens': 3}}),
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

    def test_a_connection_failure_after_the_send_is_booked_at_the_reservation_and_the_gate_stays_active(self):
        # Owner ruling 2026-10-12 ("Book max cost, keep going"), both profiles: the reservation bounds the bill.
        gate = self.ready()

        def lost(_sent, _key):
            raise TimeoutError('read timed out')
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            self.call(gate, dispatch=lost)
        entry, = gate.day(DAY)['entries'].values()
        self.assertEqual((entry['state'], entry['reason'], entry['error_class'], entry['held_usd']),
                         ('settled_reserved_max', 'transport_failure', 'TimeoutError', entry['reserved_usd']))
        status = gate.status()
        self.assertEqual((status['state'], status['in_flight'], status['today_booked_max']), ('active', 0, 1))
        self.assertEqual(Decimal(status['today_spend_usd']), Decimal(entry['reserved_usd']))
        self.assertEqual(self.call(gate, 'op-2')['status'], 200)

    def test_a_failure_after_the_connect_that_is_not_a_connection_failure_is_uncertain_and_halts(self):
        gate = self.ready()

        def broken(_sent, _key):
            raise RuntimeError('synthetic')
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            self.call(gate, dispatch=broken)
        self.assert_uncertain_halt(gate)

    def test_anthropics_own_504_timeout_answer_is_booked_at_the_reservation(self):
        # M3 ruling R1 (2026-10-16): Anthropic's 504 timeout_error carries no billing field, so the reservation bounds
        # whatever it billed: booked (settled_reserved_max, reason charge_unreported), and the gate stays active.
        gate = self.ready()
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            self.call(gate, reply={'type': 'error', 'error': {'type': 'timeout_error', 'message': 'timed out'}}, status=504)
        entry = entry_of(gate)
        self.assertEqual((entry['state'], entry['reason'], entry['http_status'], entry['held_usd']),
                         ('settled_reserved_max', 'charge_unreported', 504, entry['reserved_usd']))
        self.assertEqual((gate.status()['state'], gate.status()['today_booked_max']), ('active', 1))


class UnreportedChargeBookedTests(AnthropicTest):
    """Owner answer M3 (2026-10-15) with rulings R1-R3 (2026-10-16): a message (HTTP 200) without usage or with unreadable
    input/output counts, and a server error (500 to 599) that is no message and names no billing field, are booked at
    the reservation (settled_reserved_max, reason charge_unreported); the gate stays active. Premium or unknown billing,
    a tool or other block, an answer that is no message, and every 4xx still halt."""

    def assert_booked(self, gate, status, reason):
        entry = entry_of(gate)
        self.assertEqual((entry['state'], entry['reason'], entry['http_status'], entry['held_usd']),
                         ('settled_reserved_max', 'charge_unreported', status, entry['reserved_usd']))
        self.assertEqual(entry['accounting']['invalid_reason'], reason)
        status_now = gate.status()
        self.assertEqual((status_now['state'], status_now['halts'], status_now['in_flight'], status_now['today_booked_max']),
                         ('active', [], 0, 1))

    def test_a_message_without_usage_or_with_unreadable_counts_is_booked(self):
        for name, reply, reason in (
                ('no_usage', without('usage', message()), 'usage_missing'),
                ('usage_null', {**message(), 'usage': None}, 'usage_missing'),
                ('input_bool', message(input_tokens=True), 'token_counts'),
                ('output_missing', {**message(), 'usage': {'input_tokens': 1000}}, 'token_counts'),
                ('output_text_standard_labels', message(output_tokens='500', service_tier='standard', inference_geo='global',
                                                        speed='standard'), 'token_counts')):
            with self.subTest(name):
                gate = self.ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    self.call(gate, reply=reply)
                self.assert_booked(gate, 200, reason)
                self.assertEqual(self.call(gate, 'op-2')['status'], 200)  # Haiku keeps working.

    def test_a_server_error_without_any_billing_field_is_booked(self):
        # Ruling R1 (2026-10-16): M3 names "the Anthropic twin", the later, general rule over #172's "not now".
        error = UnbilledAndUnsentTests.error
        for name, status, reply in (('504_timeout', 504, error('timeout_error')), ('503_overloaded', 503, error('overloaded_error')),
                                    ('500_invalid_request', 500, error('invalid_request_error')),
                                    ('529_api_error', 529, {'type': 'error', 'error': {'type': 'api_error'}}),
                                    ('502_not_json', 502, {'_invalid_json': True}), ('599_empty', 599, {})):
            with self.subTest(name):
                self.assertFalse(ANTHROPIC.unbilled_refusal(status, reply))  # Not provably unbilled: booked, not released.
                gate = self.ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    self.call(gate, reply=reply, status=status)
                self.assert_booked(gate, status, 'not_a_message')

    def test_premium_or_unknown_billing_a_block_or_no_message_still_halts(self):
        cases = {
            # The #173 guard: each may bill above the list price the reservation holds.
            'speed_fast_bad_counts': (200, message(input_tokens=True, speed='fast')),
            'speed_fast': (200, message(speed='fast')),
            'service_tier_priority_bad_counts': (200, message(output_tokens='500', service_tier='priority')),
            'inference_geo_us_bad_counts': (200, message(input_tokens=-1, inference_geo='us')),
            'server_tool_use_bad_counts': (200, message(input_tokens=True, server_tool_use={'web_search_requests': 1})),
            'cache_write_bad_counts': (200, message(input_tokens=True, cache_creation_input_tokens=500)),
            # Ruling R3: a usage member the gate does not know.
            'unknown_usage_member': (200, message(cache_write_tokens=7)),
            'tool_block_no_usage': (200, without('usage', message(content=[{'type': 'tool_use', 'id': 't', 'name': 'x', 'input': {}}]))),
            'container_no_usage': (200, {**without('usage', message()), 'container': {'id': 'c', 'expires_at': 'x'}}),
            'no_message_200': (200, {'_invalid_json': True}),
            # Controller ruling (2026-10-16): another model may bill above Haiku's prices: never booked.
            'another_model_no_usage': (200, without('usage', message(model='claude-opus-5-5'))),
            # Fix round 1 (review 2026-10-16): no usable bill, never evidence of a bigger one.
            'cache_read_unreadable_bad_counts': (200, message(input_tokens=True, cache_read_input_tokens='x')),
            'output_details_bad_bad_counts': (200, message(input_tokens=True,
                                                           output_tokens_details={'thinking_tokens': 'x', 'new': 1})),
            'output_above_the_hold_bad_counts': (200, message(input_tokens=True, output_tokens=10 ** 9)),
            'thinking_above_the_hold_bad_counts': (200, message(output_tokens='500',
                                                                output_tokens_details={'thinking_tokens': 10 ** 9})),
            'cost_above_the_hold_no_usage': (200, {**without('usage', message()), 'cost': '9.99'}),
            '201_no_usage': (201, without('usage', message())),
            '503_speed_fast': (503, {'type': 'error', 'error': {'type': 'api_error'}, 'speed': 'fast'}),
            '503_service_tier': (503, {'type': 'error', 'error': {'type': 'api_error'}, 'service_tier': 'priority'}),
            '503_inference_geo': (503, {'type': 'error', 'error': {'type': 'api_error'}, 'inference_geo': 'us'}),
            '503_with_model': (503, {'type': 'error', 'error': {'type': 'overloaded_error'}, 'model': HAIKU}),
            '502_with_usage': (502, {'type': 'error', 'error': {'type': 'api_error'}, 'usage': {'output_tokens': 5}}),
            '503_message_without_usage': (503, without('usage', message())),
            # Final review (2026-10-16, Minor 1 = Task 9 F4): only an absent or null usage is booked; a usage of
            # any other type than an object says something the gate cannot read, so it keeps halting.
            'usage_a_list': (200, {**message(), 'usage': [1000, 500]}),
            'usage_a_string': (200, {**message(), 'usage': '1000 in, 500 out'}),
            'usage_a_number': (200, {**message(), 'usage': 1500}),
        }
        for name, (status, reply) in cases.items():
            with self.subTest(name):
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, status=status)
                self.assert_uncertain_halt(gate)
                self.assertEqual(gate.status()['today_booked_max'], 0)
                self.assertEqual(entry_of(gate)['reason'], 'usage_or_cost_unreported')  # Not booked: the reason stays.

    def test_key_and_billing_errors_and_every_other_4xx_still_halt(self):
        # Ruling R2 (2026-10-16): not a paid post, and a broken key needs root.
        error = UnbilledAndUnsentTests.error
        for status, reply in ((401, error('authentication_error')), (402, error('billing_error')), (403, error('permission_error')),
                              (400, error('api_error')), (408, error('timeout_error')), (499, {})):
            with self.subTest(status=status):
                self.assertFalse(ANTHROPIC.bookable_unreported(status, reply, ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None),
                                                               Decimal('1')))
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, status=status)
                self.assert_uncertain_halt(gate)
                self.assertEqual(entry_of(gate)['reason'], 'usage_or_cost_unreported')

    def test_a_booking_counts_in_todays_spend_and_journals_the_alert_and_a_failing_hook_halts(self):
        gate = self.ready()
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            self.call(gate, reply=without('usage', message()))
        reserved = Decimal(entry_of(gate)['reserved_usd'])
        status = gate.status()
        self.assertEqual((status['today_posts'], status['today_booked_max'], Decimal(status['today_spend_usd']),
                          Decimal(status['today_booked_max_usd'])), (1, 1, reserved, reserved))
        self.assertEqual(Decimal(status['remaining_today_usd']), Decimal('2.00') - reserved)
        logged = [json.loads(line) for line in self.out.getvalue().splitlines() if line.startswith('{')]
        booked = [line for line in logged if line.get('status') == 'settled_reserved_max']
        self.assertEqual({name: booked[0][name] for name in ('model', 'alert', 'reason', 'http_status', 'authority')},
                         {'model': HAIKU, 'alert': 'charge_booked_at_reservation', 'reason': 'charge_unreported',
                          'http_status': 200, 'authority': 'active'})
        gate = self.ready()
        with patch.object(ANTHROPIC, 'bookable_unreported', side_effect=RuntimeError('synthetic')), \
                self.refused('NEW_CHARGE_UNCERTAIN'):
            self.call(gate, reply=without('usage', message()))
        self.assertEqual(entry_of(gate)['reason'], 'accounting_failure')
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
            self.call(gate, 'op-2', reply={'type': 'error', 'error': {'type': 'authentication_error',
                                                                       'message': 'bad key ' + KEY + ' ' + OTHER_SHAPE}},
                      status=401)
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
        for value in (request(), without('system'), request(max_tokens=1), request(max_tokens=32768),
                      request(output_config={'effort': 'medium'}), request(output_config={'effort': 'low'}),
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
                     'response_format': {'type': 'json_object'}, 'speed': 'fast'}
        refused = [request(**{name: value}) for name, value in forbidden.items()]
        refused += [
            request(messages=[{'role': 'user', 'content': 'x', 'cache_control': {'type': 'ephemeral'}}]),
            request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'x'}]}]),
            # LG-B (L30): one marked text block as the first user turn is now the accepted material mark
            # (PromptCachingTests' material tests and the shared fixture's material_sent), so it left this list.
            request(messages=[{'role': 'assistant', 'content': 'x'}, {'role': 'user', 'content': 'y'}]),
            request(messages=[{'role': 'system', 'content': 'x'}, {'role': 'user', 'content': 'y'}]),
            request(messages=[{'role': 'user', 'content': 'y'}, {'role': 'system', 'content': 'x'}]),
            request(messages=[{'role': 'user', 'content': None}]), request(messages=[{'role': 'user'}]),
            request(messages=[]), request(messages='hi'), request(messages=['hi']),
            request(max_tokens=0), request(max_tokens=32769), request(max_tokens=True), request(max_tokens=8.0),
            request(max_tokens='8'), request(max_tokens=None), without('max_tokens'), without('messages'),
            # Spec 2026-10-12 section 4.5: off the reviewed Haiku menu, or no level at all (the menu holds no None).
            without('output_config'), request(output_config={'effort': 'max'}), request(output_config={'effort': 'xhigh'}),
            request(output_config={'effort': 'none'}), request(output_config={'effort': 'default'}),
            request(output_config={'effort': None}), request(output_config={'effort': ['low']}),
            request(output_config={'effort': 'high', 'budget_tokens': 1}), request(output_config={}),
            request(output_config='high'), request(output_config=None),
            request(system=[{'type': 'text', 'text': 'x'}]), request(system=7), request(system=None),
            # What the adapter can never send (anthropic-messages.ts): an empty system or content,
            # two turns of one role in a row, a final assistant turn.
            request(system=''), request(messages=[{'role': 'user', 'content': ''}]),
            request(messages=[{'role': 'user', 'content': 'a'}, {'role': 'user', 'content': 'b'}]),
            request(messages=[{'role': 'user', 'content': 'a'}, {'role': 'assistant', 'content': 'b'}]),
            request(messages=[{'role': 'user', 'content': 'a'}, {'role': 'assistant', 'content': 'b'},
                              {'role': 'assistant', 'content': 'c'}, {'role': 'user', 'content': 'd'}]),
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

    def test_every_body_the_app_adapter_sends_passes_and_what_it_refuses_fails(self):
        # tests/unit/fixtures/anthropic-adapter-bodies.json: `sent` holds the adapter's own output
        # byte for byte (its TS test rebuilds each one); `refused` holds bodies the adapter never sends.
        fixture = json.loads((Path(__file__).resolve().parent / 'fixtures/anthropic-adapter-bodies.json').read_text())
        self.assertGreaterEqual(len(fixture['sent']), 4)
        go = bridge.read_go(self.gate().go_path)
        for case in fixture['sent']:
            with self.subTest(sent=case['name']):
                body = json.loads(case['body'])
                self.assertTrue(ANTHROPIC.body_valid(body, ANTHROPIC.rows[HAIKU]))
                outgoing, reserved, _, _ = bridge.validate_request(envelope_text(case['body']), go)
                self.assertEqual(json.loads(outgoing), body)
                self.assertLessEqual(len(outgoing), len(case['body'].encode()))
        for case in fixture['refused']:
            with self.subTest(refused=case['name']):
                self.assertFalse(ANTHROPIC.body_valid(json.loads(case['body']), ANTHROPIC.rows[HAIKU]))

    def test_a_row_without_effort_must_not_carry_output_config(self):
        row = ANTHROPIC.rows[HAIKU]._replace(efforts=(None,))
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

    def test_a_key_of_another_shape_is_never_sent_and_reserves_nothing(self):
        # A DeepInfra or Google key put in the Anthropic folder: refused before any reservation or call.
        admin_form = 'sk-' + 'ant-' + 'admin01-' + 'x' * 24  # Anthropic's Admin form: never used here.
        for wrong in ('synthetic-key-0123456789', 'AIza' + 'x' * 35, 'sk-ant-has space', admin_form,
                      'sk-' + 'ant-' + 'synthetic' + '-0123456789'):
            with self.subTest(key=wrong[:8]):
                gate = self.ready()
                calls = []
                with self.refused('KEY_SHAPE_INVALID'):
                    self.call(gate, dispatch=lambda *args: calls.append(args), key_loader=lambda _private, k=wrong: k)
                self.assertEqual(calls, [])
                self.assertIsNone(gate.day(DAY))
        deepinfra = bridge.helper.PROFILES['deepinfra']
        self.assertTrue(re.fullmatch(ANTHROPIC.key_pattern, KEY))
        self.assertFalse(re.fullmatch(deepinfra.key_pattern, KEY))  # An Anthropic key in the DeepInfra gate is refused.
        self.assertFalse(re.fullmatch(deepinfra.key_pattern, 'AIza' + 'x' * 35))
        self.assertFalse(re.fullmatch(deepinfra.key_pattern, 'pp' + 'lx-' + 'x' * 40))  # Nor a Perplexity key (W1-1).
        self.assertTrue(re.fullmatch(deepinfra.key_pattern, 'synthetic-key-0123456789'))


class ThinkingLevelMenus(AnthropicTest):
    """Spec 2026-10-12 section 4.5: the Anthropic gate accepts exactly the reviewed Haiku menu."""

    def test_the_haiku_menu_and_the_profile_words(self):
        self.assertEqual(ANTHROPIC.rows[HAIKU].efforts, ('high', 'medium', 'low'))
        self.assertEqual(ANTHROPIC.effort_words, ('low', 'medium', 'high'))

    def test_every_menu_level_is_accepted_and_nothing_else(self):
        row = ANTHROPIC.rows[HAIKU]
        for word in ('none', 'low', 'medium', 'high', 'max', 'xhigh', 'default', 'minimal'):
            with self.subTest(word=word):
                self.assertEqual(ANTHROPIC.body_valid(request(output_config={'effort': word}), row), word in row.efforts)
        # No output_config is refused: the menu holds no None (Haiku's own default is not today's request).
        self.assertFalse(ANTHROPIC.body_valid(without('output_config'), row))
        for bad in (None, 1, True, ['low'], {'effort': 'low'}):
            with self.subTest(bad=repr(bad)):
                self.assertFalse(ANTHROPIC.body_valid(request(output_config={'effort': bad}), row))

    def test_row_review_refuses_a_malformed_menu(self):
        row = ANTHROPIC.rows[HAIKU]
        for efforts in ((), (None,), ('none',), ('high', None), ('high', 'high'), ('xhigh',), 'high', ['high']):
            with self.subTest(efforts=repr(efforts)):
                self.assertFalse(bridge.row_reviewed(ANTHROPIC, HAIKU, row._replace(efforts=efforts)))
        self.assertTrue(bridge.row_reviewed(ANTHROPIC, HAIKU, row))

    def test_body_effort_and_the_probe_default(self):
        self.assertEqual(ANTHROPIC.body_effort(request(output_config={'effort': 'low'})), 'low')
        self.assertIsNone(ANTHROPIC.body_effort(without('output_config')))
        self.assertIsNone(ANTHROPIC.body_effort({'output_config': 'low'}))
        self.assertEqual(ANTHROPIC.probe_body(ANTHROPIC.rows[HAIKU])['output_config'], {'effort': 'high'})

    def test_the_ledger_records_the_level_the_body_carried(self):
        gate = self.ready()
        for operation_id, word in (('op-low', 'low'), ('op-medium', 'medium'), ('op-high', 'high')):
            with self.subTest(word=word):
                self.assertEqual(self.call(gate, operation_id, value=request(output_config={'effort': word}))['status'], 200)
                self.assertEqual(entry_of(gate, operation_id)['requested_effort'], word)


class RemainingAndProbeTests(AnthropicTest):
    def probe(self, gate, dispatch, **kwargs):
        options = {'dispatch': dispatch, 'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux', 'uid': 0,
                   'now': gate.clock, 'fence': lambda _provider: None}  # The fence itself: test_probe_runs_the_anthropic_fence.
        options.update(kwargs)
        return bridge.probe(gate.private, gate.go_path, HAIKU, **options)

    def test_probe_runs_the_anthropic_fence_first(self):
        gate = self.ready()
        asked, sent = [], []

        def fence(provider):
            asked.append(provider)
            raise bridge.FenceRequired(['unit'])

        with self.assertRaises(bridge.FenceRequired):
            self.probe(gate, lambda request, _k: sent.append(request) or (200, message(12, 3)), fence=fence)
        self.assertEqual((asked, sent), (['anthropic'], []))  # Refused before any call or hold.
        self.assertEqual((gate.day(DAY) or {}).get('entries', {}), {})

    def test_remaining_answers_for_the_anthropic_pot(self):
        gate = self.ready()
        self.call(gate)  # $0.00035 settled.
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertEqual(set(report), {'state', 'window_open', 'remaining_usd', 'remaining_calls', 'max_concurrent_calls',
                                       'largest_reservation_usd', 'enabled_models'})
        self.assertEqual({k: report[k] for k in ('state', 'window_open', 'remaining_calls', 'max_concurrent_calls',
                                                 'enabled_models')},
                         {'state': 'active', 'window_open': True, 'remaining_calls': 599, 'max_concurrent_calls': 2,
                          'enabled_models': [HAIKU]})
        self.assertEqual((Decimal(report['remaining_usd']), Decimal(report['largest_reservation_usd'])),
                         (Decimal('1.99965'), Decimal('0.24704')))

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
        # A well-formed 400 (Anthropic refused the request's shape) bills nothing: the probe is refused
        # PROVIDER_ERROR_UNBILLED (not busy) and the day's record keeps the $0 entry with its HTTP
        # status (the README's probe step says: that means stop and report).
        gate = self.ready()
        rejected = {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'output_config:\nunknown field'}}
        with self.refused('PROVIDER_ERROR_UNBILLED'):
            self.probe(gate, lambda _r, _k: (400, rejected))
        self.assertEqual([(e['state'], e['http_status']) for e in gate.day(DAY)['entries'].values()],
                         [('released_unbilled', 400)])
        self.assertEqual(gate.status()['state'], 'active')
        # An error that is not provably unbilled (a key Anthropic does not accept) halts, with its excerpt.
        gate = self.ready()
        denied = {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}}
        summary = self.probe(gate, lambda _r, _k: (401, denied))
        self.assertEqual((summary['http_status'], summary['entry_state'], summary['halt_reason'], summary['reply_excerpt']),
                         (401, 'uncertain', 'uncertain_charge', 'invalid x-api-key'))
        self.assertEqual(gate.status()['state'], 'halted')



class VendorRefusalFactsTests(AnthropicTest):
    """2026-10-12: an answer released unbilled keeps the vendor's Retry-After, its rate-limit header NAMES and the
    error's type, code and a short redacted message, on the entry and the journal line (both profiles)."""
    BUSY = UnbilledAndUnsentTests.BUSY

    @staticmethod
    def answering(status, reply, headers):
        def dispatch(_sent, _key):
            return status, json.loads(json.dumps(reply))
        dispatch.vendor_headers = headers
        return dispatch

    def facts(self, gate, operation_id='op-1'):
        entry = entry_of(gate, operation_id)
        lines = [line for line in map(json.loads, filter(None, self.out.getvalue().splitlines()))
                 if line.get('event') == 'preview_provider_paid_post' and line.get('operation_id') == operation_id]
        keys = ('vendor_retry_after_seconds', 'vendor_rate_limit_headers', 'vendor_error')
        self.assertEqual(len(lines), 1)
        self.assertEqual({k: lines[0][k] for k in keys}, {k: entry[k] for k in keys})
        return {k: entry[k] for k in keys}

    def test_a_busy_529_keeps_retry_after_the_anthropic_rate_limit_names_and_the_error(self):
        gate = self.ready()
        headers = bridge.helper.vendor_headers([('retry-after', '17'), ('anthropic-ratelimit-requests-remaining', '0'),
                                                ('request-id', 'req_synthetic')])
        with self.refused('PROVIDER_REFUSED_UNBILLED'):
            self.call(gate, dispatch=self.answering(529, {**self.BUSY, 'request_id': 'req_synthetic'}, headers))
        self.assertEqual(self.facts(gate), {'vendor_retry_after_seconds': 17,
                                            'vendor_rate_limit_headers': ['anthropic-ratelimit-requests-remaining'],
                                            'vendor_error': {'type': 'overloaded_error', 'code': None, 'message': 'Overloaded'}})

    def test_a_not_busy_unbilled_error_keeps_the_facts_and_never_cools_the_model(self):
        gate = self.ready()
        reply = {'type': 'error', 'error': {'type': 'api_error', 'message': 'Internal server error'}}
        for operation_id in ('op-1', 'op-2'):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, operation_id, dispatch=self.answering(500, reply, {'retry_after': '120', 'rate_limit_header_names': []}))
        self.assertEqual(self.facts(gate, 'op-2'), {'vendor_retry_after_seconds': 120, 'vendor_rate_limit_headers': [],
                                                    'vendor_error': {'type': 'api_error', 'code': None,
                                                                     'message': 'Internal server error'}})
        self.assertEqual(gate.status()['cooling'], {})



class PromptCachingTests(AnthropicTest):
    """Prompt caching (owner approval 2026-10-12, "caching before the upload"): a request may carry exactly one
    5-minute cache mark, on the first of exactly two system text blocks; it reserves its whole input at the step's
    5-minute cache-write price. Any reply's cache tokens are settled at the write and read prices (no new halt)."""
    FIXTURE = Path(__file__).resolve().parent / 'fixtures/anthropic-cache-bodies.json'

    def test_the_two_block_system_is_accepted_and_reserves_its_input_at_the_write_price(self):
        go = bridge.read_go(self.gate().go_path)
        value = cached_request()
        self.assertTrue(ANTHROPIC.body_valid(value, ANTHROPIC.rows[HAIKU]))
        self.assertIs(ANTHROPIC.cache_write_requested(value), True)
        raw = json.dumps(value, separators=(',', ':'))
        outgoing, reserved, row, prices = bridge.validate_request(envelope_text(raw), go)
        # ((bytes + 2048) x 0.125 + 32768 x 0.50) / 1e6: the lower step, its input at the 5-minute write price.
        self.assertEqual((json.loads(outgoing), row.model, prices), (value, HAIKU, (WRITE_IN, PRICE_OUT)))
        self.assertEqual(reserved, (Decimal(len(raw.encode()) + 2048) * WRITE_IN + Decimal(BOUND) * PRICE_OUT) / Decimal(1000000))
        self.assertEqual(reserved, reservation_of(raw))
        # The same body priced as an uncached one is a mismatch (the app must reserve the write premium).
        plain = (Decimal(len(raw.encode()) + 2048) * PRICE_IN + Decimal(BOUND) * PRICE_OUT) / Decimal(1000000)
        with self.refused('RESERVATION_MISMATCH'):
            bridge.validate_request({**envelope_text(raw), 'reservedUsd': str(plain)}, go)
        # A string system asks for no cache write; neither does the probe's body or a DeepInfra body.
        self.assertIs(ANTHROPIC.cache_write_requested(request()), False)
        self.assertIs(ANTHROPIC.cache_write_requested(ANTHROPIC.probe_body(ANTHROPIC.rows[HAIKU])), False)
        self.assertIs(bridge.cache_write_of(ANTHROPIC, value), True)
        self.assertIs(bridge.cache_write_of(ANTHROPIC, request()), False)
        self.assertIs(bridge.cache_write_of(bridge.helper.PROFILES['deepinfra'], value), False)

    def test_a_large_cached_request_reserves_at_the_upper_steps_write_price(self):
        go = bridge.read_go(self.gate().go_path)
        edge = STEP_TOKENS - 2048
        for size, prices in ((edge, (WRITE_IN, PRICE_OUT)), (edge + 1, CEILING)):
            with self.subTest(body_bytes=size):
                _, reserved, _, used = bridge.validate_request(envelope(sized(size, cached=True)), go)
                self.assertEqual(used, prices)
                self.assertEqual(reserved, (Decimal(size + 2048) * prices[0] + Decimal(BOUND) * prices[1]) / Decimal(1000000))
        # At the edge: (100,000 x 0.125 + 32,768 x 0.50) / 1e6 = $0.028884; one byte more:
        # (100,001 x 0.625 + 32,768 x 2.50) / 1e6 = $0.144420625.
        self.assertEqual(reservation_of(json.dumps(sized(edge, cached=True))), Decimal('0.028884'))
        self.assertEqual(reservation_of(json.dumps(sized(edge + 1, cached=True))), Decimal('0.144420625'))

    def test_every_body_in_the_shared_fixture_is_accepted_at_its_reservation_or_refused(self):
        fixture = json.loads(self.FIXTURE.read_text())
        self.assertEqual(fixture['schema'], 'anthropic-cache-bodies-v1')
        self.assertEqual(fixture['separator'], '\n\n--- PER-CALL MARKERS (engine) ---')
        self.assertGreaterEqual((len(fixture['sent']), len(fixture['refused'])), (3, 20))
        go = bridge.read_go(self.gate().go_path)
        for case in fixture['sent']:
            with self.subTest(sent=case['name']):
                body = json.loads(case['body'])
                self.assertTrue(ANTHROPIC.body_valid(body, ANTHROPIC.rows[HAIKU]))
                self.assertEqual(Decimal(case['reservedUsd']), reservation_of(case['body']))
                # The app's nano-USD text, to the digit (validate_request checks equality).
                outgoing, reserved, _, prices = bridge.validate_request({**envelope_text(case['body']),
                                                                         'reservedUsd': case['reservedUsd']}, go)
                self.assertEqual((json.loads(outgoing), reserved, prices), (body, Decimal(case['reservedUsd']), (WRITE_IN, PRICE_OUT)))
                self.assertLessEqual(len(outgoing), len(case['body'].encode()))
                # The two texts join back into the system text the frame wrote, the marker line first in the tail.
                first, second = body['system']
                self.assertTrue(first['text'].endswith('\n\n') and second['text'].startswith(fixture['separator'][2:] + '\n'))
                self.assertEqual((first['text'] + second['text']).count(fixture['separator']), 1)
        for case in fixture['refused']:
            with self.subTest(refused=case['name']):
                self.assertFalse(ANTHROPIC.body_valid(json.loads(case['body']), ANTHROPIC.rows[HAIKU]))
                with self.refused('REQUEST_PARAMETERS_INVALID'):
                    bridge.validate_request(envelope_text(case['body']), go)

    def test_a_cached_call_settles_its_write_and_read_at_their_own_prices(self):
        gate = self.ready()
        five = {'ephemeral_5m_input_tokens': 3000, 'ephemeral_1h_input_tokens': 0}
        reply = message(200, 400, cache_creation_input_tokens=3000, cache_read_input_tokens=0, cache_creation=five)
        self.call(gate, reply=reply, value=cached_request())
        entry = entry_of(gate)
        # 200 x 0.10 + 3000 x 0.125 + 400 x 0.50 = 595 -> $0.000595
        expected = cost(LOWER, 200, write_5m=3000, output=400)
        self.assertEqual(expected, Decimal('0.000595'))
        self.assertEqual((entry['state'], Decimal(entry['held_usd']), entry['reserve_input_usd_per_m'], entry['cache_write_requested']),
                         ('settled', expected, '0.125', '5m'))
        accounting = entry['accounting']
        self.assertEqual((accounting['cache_write_5m_tokens'], accounting['cache_write_1h_tokens'], accounting['cache_read_input_tokens'],
                          accounting['prompt_tokens']), (3000, 0, 0, 3200))
        # The next call reads it: 200 x 0.10 + 3000 x 0.01 + 400 x 0.50 = 250 -> $0.00025.
        self.call(gate, 'op-2', reply=message(200, 400, cache_creation_input_tokens=0, cache_read_input_tokens=3000),
                  value=cached_request())
        self.assertEqual(Decimal(entry_of(gate, 'op-2')['held_usd']), cost(LOWER, 200, read=3000, output=400))
        self.assertEqual(cost(LOWER, 200, read=3000, output=400), Decimal('0.00025'))
        # A write reported without its split is the 5-minute kind the request asked for.
        self.call(gate, 'op-3', reply=message(200, 400, cache_creation_input_tokens=3000), value=cached_request())
        self.assertEqual(Decimal(entry_of(gate, 'op-3')['held_usd']), expected)
        # A prefix under the model's cacheable minimum writes nothing: plain prices, still settled.
        self.call(gate, 'op-4', reply=message(200, 400, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                                                  cache_creation={'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0}),
                  value=cached_request())
        self.assertEqual(Decimal(entry_of(gate, 'op-4')['held_usd']), cost(LOWER, 200, output=400))
        self.assertEqual(gate.status()['state'], 'active')
        # An uncached call's entry says nothing about caching and reserves at the plain input price.
        self.call(gate, 'op-5')
        self.assertNotIn('cache_write_requested', entry_of(gate, 'op-5'))
        self.assertEqual(entry_of(gate, 'op-5')['reserve_input_usd_per_m'], '0.10')

    def test_cache_tokens_on_an_unmarked_call_settle_at_their_prices_without_a_halt(self):
        # Coordinator ruling 2026-10-12: no new halt reason. An unmarked call whose reply reports cache tokens is
        # settled at their real prices (as before caching): a write without its split at the dearer 1-hour price.
        five = {'ephemeral_5m_input_tokens': 3000, 'ephemeral_1h_input_tokens': 0}
        hour = {'ephemeral_5m_input_tokens': 1000, 'ephemeral_1h_input_tokens': 2000}
        for name, usage, expected in (
                ('read', {'cache_read_input_tokens': 3000}, cost(LOWER, 200, read=3000, output=400)),
                ('write_5m_split', {'cache_creation_input_tokens': 3000, 'cache_creation': five},
                 cost(LOWER, 200, write_5m=3000, output=400)),
                ('write_mixed_split', {'cache_creation_input_tokens': 3000, 'cache_read_input_tokens': 500, 'cache_creation': hour},
                 cost(LOWER, 200, write_5m=1000, write_1h=2000, read=500, output=400)),
                ('write_no_split', {'cache_creation_input_tokens': 3000}, cost(LOWER, 200, write_1h=3000, output=400))):
            with self.subTest(name):
                reply = message(200, 400, **usage)
                accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)
                self.assertEqual((accounting['usage_valid'], Decimal(accounting['guard_charge_usd'])), (True, expected))
                self.assertNotIn('invalid_reason', accounting)
                gate = self.ready()
                self.call(gate, reply=reply)  # An unmarked request (a string system).
                entry = entry_of(gate)
                self.assertEqual((entry['state'], Decimal(entry['held_usd']), entry['reserve_input_usd_per_m']),
                                 ('settled', expected, '0.10'))
                self.assertNotIn('cache_write_requested', entry)
                self.assertEqual(gate.status()['state'], 'active')
        # 2000 x 0.10 + 3000 x 0.20 + 400 x 0.50 is the old no-split rule; a marked call says 5 minutes instead.
        self.assertEqual(cost(LOWER, 200, write_1h=3000, output=400), Decimal('0.00082'))
        marked = ANTHROPIC.account(message(200, 400, cache_creation_input_tokens=3000), ANTHROPIC.rows[HAIKU], None, cache_write=True)
        self.assertEqual(Decimal(marked['guard_charge_usd']), cost(LOWER, 200, write_5m=3000, output=400))

    def test_a_cached_call_still_halts_on_every_cache_count_it_cannot_read(self):
        for name, usage in (('split_not_summing', {'cache_creation_input_tokens': 3000,
                                                   'cache_creation': {'ephemeral_5m_input_tokens': 1000, 'ephemeral_1h_input_tokens': 1000}}),
                            ('split_without_total', {'cache_creation': {'ephemeral_5m_input_tokens': 5, 'ephemeral_1h_input_tokens': 0}}),
                            ('read_negative', {'cache_read_input_tokens': -1}),
                            ('creation_text', {'cache_creation_input_tokens': '10'}),
                            ('creation_float', {'cache_creation_input_tokens': Decimal('10.0')})):
            with self.subTest(name):
                reply = message(200, 400, **usage)
                self.assertFalse(ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None, cache_write=True)['usage_valid'])
                self.assertFalse(ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None)['usage_valid'])
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply, value=cached_request())
                self.assert_uncertain_halt(gate)

    def test_a_1h_write_on_a_cached_call_is_charged_at_the_1h_price(self):
        hour = {'ephemeral_5m_input_tokens': 1000, 'ephemeral_1h_input_tokens': 2000}
        reply = message(200, 400, cache_creation_input_tokens=3000, cache_creation=hour)
        accounting = ANTHROPIC.account(reply, ANTHROPIC.rows[HAIKU], None, cache_write=True)
        self.assertEqual(Decimal(accounting['guard_charge_usd']), cost(LOWER, 200, write_5m=1000, write_1h=2000, output=400))
        self.assertEqual((accounting['cache_write_5m_tokens'], accounting['cache_write_1h_tokens']), (1000, 2000))

    def test_the_material_mark_on_the_first_user_turn_is_accepted_and_reserves_at_the_write_price(self):
        go = bridge.read_go(self.gate().go_path)
        value = request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'Offline synthetic material',
                                                                 'cache_control': dict(CACHE_MARK)}]}])
        self.assertTrue(ANTHROPIC.body_valid(value, ANTHROPIC.rows[HAIKU]))
        self.assertIs(ANTHROPIC.cache_write_requested(value), True)  # Its system is the plain string: the mark is the turn's.
        raw = json.dumps(value)
        _outgoing, reserved, _row, prices = bridge.validate_request(envelope_text(raw), go)
        self.assertEqual((reserved, prices), (reservation_of(raw), (WRITE_IN, PRICE_OUT)))

    def test_every_material_body_in_the_shared_fixture_is_accepted_at_its_reservation_or_refused(self):
        fixture = json.loads(self.FIXTURE.read_text())
        self.assertEqual((len(fixture['material_sent']), len(fixture['material_refused'])), (3, 10))
        self.assertNotIn('the two blocks with list content in a message', [case['name'] for case in fixture['refused']])
        go = bridge.read_go(self.gate().go_path)
        for case in fixture['material_sent']:
            with self.subTest(sent=case['name']):
                body = json.loads(case['body'])
                self.assertTrue(ANTHROPIC.body_valid(body, ANTHROPIC.rows[HAIKU]))
                self.assertEqual(Decimal(case['reservedUsd']), reservation_of(case['body']))
                _outgoing, reserved, _row, prices = bridge.validate_request({**envelope_text(case['body']),
                                                                             'reservedUsd': case['reservedUsd']}, go)
                self.assertEqual((reserved, prices), (Decimal(case['reservedUsd']), (WRITE_IN, PRICE_OUT)))
        for case in fixture['material_refused']:
            with self.subTest(refused=case['name']):
                self.assertFalse(ANTHROPIC.body_valid(json.loads(case['body']), ANTHROPIC.rows[HAIKU]))
                with self.refused('REQUEST_PARAMETERS_INVALID'):
                    bridge.validate_request(envelope_text(case['body']), go)

    def test_a_marked_material_call_settles_its_write_and_read_at_their_own_prices(self):
        gate = self.ready()
        value = request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'Offline synthetic material',
                                                                 'cache_control': dict(CACHE_MARK)}]}])
        five = {'ephemeral_5m_input_tokens': 0, 'ephemeral_1h_input_tokens': 0}
        reply = message(200, 400, cache_creation_input_tokens=0, cache_read_input_tokens=3000, cache_creation=five)
        self.call(gate, value=value, reply=reply)
        entry = entry_of(gate)
        self.assertEqual((entry['state'], entry['cache_write_requested']), ('settled', '5m'))
        self.assertEqual(Decimal(entry['held_usd']), cost(LOWER, input_tokens=200, read=3000, output=400))

if __name__ == '__main__':
    unittest.main()
