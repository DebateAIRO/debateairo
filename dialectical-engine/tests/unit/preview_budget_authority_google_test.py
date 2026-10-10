"""The spending gate's Google profile (PR C): gemini-3.8-flash on the native generateContent wire.

Offline only: temporary directories and fake dispatch functions. No private files, real keys,
real ledgers, DNS or upstream calls. Every figure below is computed independently of the gate
(from the reviewed prices written out here) and pinned against the shared parity fixture that the
app's TypeScript test reads too (tests/unit/fixtures/preview-google-row.json).
"""
import contextlib
import hashlib
import http.client
import io
import json
import sys
import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import HOST, PEER, SCOPE, Gate, load_bridge  # noqa: E402

bridge = load_bridge()
helper = bridge.helper
SafetyError = helper.SafetyError
GOOGLE = helper.PROFILES['google']
GEMINI = 'gemini-3.8-flash'
PARITY = Path(__file__).resolve().parent / 'fixtures/preview-google-row.json'
# A made-up value shaped like a Google key (AIza + 35), built from pieces so a secret scanner does
# not read it as one. It is never a real key.
FAKE_KEY = 'AIza' + 'Sy' + 'synthetic' + '0123456789' + 'abcdefghijklmn'
assert len(FAKE_KEY) == 39
# The reviewed prices written out again, independently of the helper: (first day, input, output).
STEPS = (('0001-01-01', Decimal('0.75'), Decimal('3.75')), ('2027-01-01', Decimal('1.50'), Decimal('7.50')))
BOUND = 16384
MAX_BYTES = 256 * 1024 + 64
CAP = Decimal('0.55')
CONCURRENCY = 1  # The proposed GO: $1.00 a day, 400 calls, one call at a time.


def prices_on(day):
    chosen = None
    for first, price_in, price_out in STEPS:
        if day >= first:
            chosen = (price_in, price_out)
    return chosen


def careful(moment):
    """The higher of the prices of moment's Bucharest day and of the next day."""
    today = moment.astimezone(ZoneInfo('Europe/Bucharest')).date()
    first, second = prices_on(today.isoformat()), prices_on((today + timedelta(days=1)).isoformat())
    return max(first[0], second[0]), max(first[1], second[1])


def lookahead(moment):
    """The app's hold: the highest prices of moment's Bucharest day and of the next two days."""
    today = moment.astimezone(ZoneInfo('Europe/Bucharest')).date()
    steps = [prices_on((today + timedelta(days=k)).isoformat()) for k in range(3)]
    return max(p[0] for p in steps), max(p[1] for p in steps)


def native(**changes):
    value = {'contents': [{'role': 'user', 'parts': [{'text': 'Offline synthetic test'}]}],
             'generationConfig': {'maxOutputTokens': 8192, 'thinkingConfig': {'thinkingLevel': 'high'}}}
    value.update(changes)
    return value


def framed(inner, model=GEMINI):
    """The app's framing, byte for byte (gemini-generate.ts geminiPreviewRequestBody)."""
    return '{"model":' + json.dumps(model) + ',"request":' + json.dumps(inner, ensure_ascii=False, separators=(',', ':')) + '}'


def reservation(raw, moment):
    price_in, price_out = careful(moment)
    return (Decimal(len(raw.encode()) + 2048) * price_in + Decimal(BOUND) * price_out) / Decimal(1000000)


def envelope(raw, moment, operation_id='op-1', reserved=None):
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(),
            'reservedUsd': str(reservation(raw, moment) if reserved is None else reserved)}


def reply(prompt=1000, candidates=200, thoughts=300, total=None, model=GEMINI, text='OK', **usage_changes):
    usage = {'promptTokenCount': prompt, 'candidatesTokenCount': candidates, 'thoughtsTokenCount': thoughts,
             'totalTokenCount': prompt + candidates + thoughts if total is None else total}
    usage.update(usage_changes)
    usage = {k: v for k, v in usage.items() if v is not None}
    return {'candidates': [{'content': {'role': 'model', 'parts': [{'text': 'thinking...', 'thought': True},
                                                                   {'text': text}]},
                            'finishReason': 'STOP'}],
            'usageMetadata': usage, 'modelVersion': model, 'responseId': 'synthetic-response'}


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


class GoogleGate(Gate):
    def __init__(self, **go_changes):
        options = {'provider': 'google', 'enabled_models': [GEMINI], 'daily_budget_usd': '1.00',
                   'max_paid_posts_per_day': 400, 'max_concurrent_calls': CONCURRENCY}
        options.update(go_changes)
        super().__init__(bridge, **options)
        self.clock.set('2026-10-10T09:00:00+00:00')

    def gcall(self, operation_id='op-1', response=None, status=200, inner=None, dispatch=None, raw=None, **kwargs):
        raw = framed(inner if inner is not None else native()) if raw is None else raw
        sent = []
        if dispatch is None:
            def dispatch(outgoing, key):
                sent.append((outgoing, key))
                return status, reply() if response is None else response
        options = {'peer_uid': PEER, 'slots': self.slots, 'dispatch': dispatch, 'key_loader': lambda _p: FAKE_KEY,
                   'host': HOST, 'platform': 'linux', 'now': self.clock, 'slot_wait': 0.2}
        options.update(kwargs)
        result = bridge.execute_request(self.private, self.go_path, envelope(raw, self.clock(), operation_id), **options)
        return result, sent

    def entry(self, operation_id='op-1', day='2026-10-10'):
        return self.day(day)['entries']['preview-test:' + SCOPE + ':' + operation_id]


class GoogleTest(unittest.TestCase):
    def setUp(self):
        self.gates = []
        guard = patch.object(helper, 'HttpsTransport', no_network)
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
        gate = GoogleGate(**changes)
        self.gates.append(gate)
        return gate

    def refused(self, code):
        return self.assertRaisesRegex(SafetyError, '^' + code + '$')


class RowTests(GoogleTest):
    def test_the_profile_and_its_one_row_are_the_reviewed_values(self):
        row = GOOGLE.rows[GEMINI]
        self.assertEqual(list(GOOGLE.rows), [GEMINI])
        self.assertEqual((GOOGLE.name, GOOGLE.host, GOOGLE.per_call_cap_usd, GOOGLE.max_request_bytes, GOOGLE.redaction_patterns),
                         ('google', 'generativelanguage.googleapis.com', CAP, MAX_BYTES, (r'AIza[0-9A-Za-z_-]{35}',)))
        self.assertEqual(tuple(row), (GEMINI, 'Google', Decimal('1.50'), Decimal('7.50'), BOUND, 'high', False))
        self.assertEqual(GOOGLE.path_for(row), '/v1beta/models/gemini-3.8-flash:generateContent')
        self.assertEqual(GOOGLE.auth_headers('k'), {'x-goog-api-key': 'k'})
        self.assertEqual(GOOGLE.ceiling_prices(row), (Decimal('1.50'), Decimal('7.50')))
        self.assertIs(bridge.profile_of('google'), GOOGLE)
        self.assertEqual(GOOGLE.key_pattern, r'^AIza[0-9A-Za-z_-]{35}$')
        self.assertRegex(FAKE_KEY, GOOGLE.key_pattern)
        for wrong in (FAKE_KEY[:-1], FAKE_KEY + 'x', 'sk-ant-' + 'x' * 32, FAKE_KEY.replace('AIza', 'AIzb'), ' ' + FAKE_KEY):
            self.assertNotRegex(wrong, GOOGLE.key_pattern)
        self.assertLessEqual(GOOGLE.per_call_cap_usd, bridge.MAX_PROFILE_CALL_CAP_USD)

    def test_parity_fixture_the_app_also_asserts(self):
        parity = json.loads(PARITY.read_text())
        row = GOOGLE.rows[GEMINI]
        self.assertEqual(parity['provider'], 'google')
        self.assertEqual(parity['row'], {'model': row.model, 'maker': row.maker, 'output_bound': row.output_bound,
                                         'effort': row.effort, 'json_object': row.json_object,
                                         'ceiling_input_usd_per_m': str(row.input_usd_per_m),
                                         'ceiling_output_usd_per_m': str(row.output_usd_per_m)})
        self.assertEqual(parity['price_zone'], helper.GOOGLE_PRICE_ZONE)
        self.assertEqual([(s['first_day'], Decimal(s['input_usd_per_m']), Decimal(s['output_usd_per_m']))
                          for s in parity['price_steps']], [(s[0], s[1], s[2]) for s in helper.GOOGLE_PRICE_STEPS])
        self.assertEqual(STEPS, helper.GOOGLE_PRICE_STEPS)
        self.assertEqual((parity['reservation']['overhead_bytes'], parity['reservation']['max_request_bytes'],
                          Decimal(parity['reservation']['per_call_cap_usd']), parity['reservation']['worst_case_reservation_usd']),
                         (bridge.RESERVATION_OVERHEAD_BYTES, GOOGLE.max_request_bytes, GOOGLE.per_call_cap_usd,
                          '%.9f' % bridge.worst_case_reservation(GOOGLE, row)))
        for case in parity['moments']:
            with self.subTest(moment=case['moment']):
                moment = datetime.fromisoformat(case['moment'])
                prices = GOOGLE.reservation_prices(row, moment)
                self.assertEqual((str(prices[0]), str(prices[1])), (case['input_usd_per_m'], case['output_usd_per_m']))
                self.assertEqual(prices, careful(moment))
                reserved = bridge.reservation_for(case['request_bytes'], row, prices)
                self.assertEqual('%.9f' % reserved, case['reserved_usd'])
                # The app's lookahead hold: the highest prices of the day and the next two.
                ahead = lookahead(moment)
                self.assertEqual((str(ahead[0]), str(ahead[1])),
                                 (case['lookahead_input_usd_per_m'], case['lookahead_output_usd_per_m']))
                held = bridge.reservation_for(case['request_bytes'], row, ahead)
                self.assertEqual('%.9f' % held, case['lookahead_reserved_usd'])
                self.assertTrue(reserved <= held <= bridge.reservation_for(case['request_bytes'], row,
                                                                           GOOGLE.ceiling_prices(row)))

    def test_worst_case_fits_the_cap_and_the_proposed_go_activates(self):
        worst = bridge.worst_case_reservation(GOOGLE, GOOGLE.rows[GEMINI])
        expected = (Decimal(MAX_BYTES + 2048) * Decimal('1.50') + Decimal(BOUND) * Decimal('7.50')) / Decimal(1000000)
        self.assertEqual(worst, expected)
        self.assertLessEqual(worst, CAP)
        self.assertLessEqual(CONCURRENCY * worst, Decimal('1.00'))
        self.assertGreater((CONCURRENCY + 1) * worst, Decimal('1.00'))
        gate = self.gate()
        gate.init()
        self.assertEqual(gate.activate()['state'], 'active')
        over = self.gate(max_concurrent_calls=CONCURRENCY + 1)
        over.init()
        with self.refused('CONCURRENCY_EXCEEDS_BUDGET'):
            over.activate()

    def test_a_path_with_a_query_is_never_allowed(self):
        for path in ('/v1beta/models/gemini-3.8-flash:generateContent?key=x', '/v1beta/models/x?alt=sse',
                     '/v1beta/models/gemini-3.8-flash:generateContent#k'):
            with self.subTest(path=path):
                self.assertFalse(helper.path_valid(path))
                with self.refused('profile_path_invalid'):
                    _HTTPS(1, GOOGLE, path)

                class Leaky(helper.GoogleProfile):
                    def path_for(self, row, path=path):
                        return path
                with patch.dict(helper.PROFILES, {'google': Leaky()}):
                    self.assertIsNone(bridge.profile_of('google'))


_HTTPS = helper.HttpsTransport


class DatedPriceTests(GoogleTest):
    def test_prices_around_the_vendor_date_boundary(self):
        row = GOOGLE.rows[GEMINI]
        cases = (('2026-10-10T09:00:00+00:00', '0.75'), ('2026-12-30T21:59:59+00:00', '0.75'),
                 ('2026-12-30T22:00:00+00:00', '1.50'),  # 00:00 on 31 December in Bucharest (UTC+2).
                 ('2026-12-31T23:59:59+00:00', '1.50'), ('2027-01-01T00:00:00+00:00', '1.50'),
                 ('2027-07-01T12:00:00+00:00', '1.50'))
        for text, price_in in cases:
            with self.subTest(moment=text):
                moment = datetime.fromisoformat(text)
                expected = (Decimal(price_in), Decimal('3.75') if price_in == '0.75' else Decimal('7.50'))
                self.assertEqual(GOOGLE.reservation_prices(row, moment), expected)
                self.assertEqual(GOOGLE.account(reply(), row, moment)['input_usd_per_m'], price_in)

    def test_2027_prices_are_never_charged_now_even_when_the_app_reserves_ahead(self):
        gate = self.gate().ready()
        raw = framed(native())
        today = datetime.fromisoformat('2026-10-10T09:00:00+00:00')
        go = bridge.read_go(gate.go_path)
        _, reserved, _, prices = bridge.validate_request(envelope(raw, today), go, moment=today)
        self.assertEqual((prices, reserved), ((Decimal('0.75'), Decimal('3.75')), reservation(raw, today)))
        dearer = (Decimal(len(raw.encode()) + 2048) * Decimal('1.50') + BOUND * Decimal('7.50')) / Decimal(1000000)
        # Core change b: a hold above the gate's own figure, up to the ceiling, is held as sent ...
        _, held, _, _ = bridge.validate_request(envelope(raw, today, reserved='%.9f' % dearer), go, moment=today)
        self.assertEqual(held, dearer)
        result, _ = gate.gcall('op-1', response=reply(prompt=1000, candidates=200, thoughts=300))
        self.assertEqual(result['status'], 200)
        # ... and the call is still charged at the 2026 price.
        entry = gate.entry('op-1')
        self.assertEqual((entry['settle_input_usd_per_m'], entry['settle_output_usd_per_m'], Decimal(entry['held_usd'])),
                         ('0.75', '3.75', (1000 * Decimal('0.75') + 500 * Decimal('3.75')) / Decimal(1000000)))


class ClientReservationTests(GoogleTest):
    """Core change b (PR C): the caller may hold more than the gate's own figure, never less, never
    more than the request at the row's ceiling prices."""

    def setUp(self):
        super().setUp()
        self.raw = framed(native())
        self.moment = datetime.fromisoformat('2026-10-10T09:00:00+00:00')
        self.go = bridge.read_go(self.gate().go_path)
        self.own = reservation(self.raw, self.moment)
        self.ceiling = (Decimal(len(self.raw.encode()) + 2048) * Decimal('1.50') + BOUND * Decimal('7.50')) / Decimal(1000000)

    def check(self, text):
        return bridge.validate_request(envelope(self.raw, self.moment, reserved=text), self.go, moment=self.moment)[1]

    def test_an_under_reservation_is_refused(self):
        for text in ('%.9f' % (self.own - Decimal('0.000000001')), '0', '0.000000001'):
            with self.subTest(text=text), self.refused('RESERVATION_MISMATCH'):
                self.check(text)

    def test_an_over_reservation_up_to_the_ceiling_is_held_as_sent(self):
        for amount in (self.own + Decimal('0.000000001'), (self.own + self.ceiling) / 2, self.ceiling):
            text = '%.9f' % amount
            with self.subTest(text=text):
                self.assertEqual(self.check(text), Decimal(text))
        self.assertEqual(self.check(str(self.own)), self.own)  # Exact equality still works.

    def test_above_the_ceiling_or_in_another_notation_is_refused(self):
        for text in ('%.9f' % (self.ceiling + Decimal('0.000000001')), '%.10f' % (self.own + Decimal('0.0000000001')),
                     '%.6e' % self.ceiling, ' %.9f' % self.ceiling, '+%.9f' % self.ceiling, '0%.9f' % self.ceiling,
                     '1000.000000000', '.5'):
            with self.subTest(text=text), self.refused('RESERVATION_MISMATCH'):
                self.check(text)
        number = dict(envelope(self.raw, self.moment), reservedUsd=float(self.ceiling))  # A JSON number, not text.
        with self.refused('RESERVATION_MISMATCH'):
            bridge.validate_request(number, self.go, moment=self.moment)

    def test_a_price_without_steps_keeps_exact_equality(self):
        from preview_budget_authority_fixture import body, envelope as deepinfra_envelope
        gate = Gate(bridge)
        self.gates.append(gate)
        go = bridge.read_go(gate.go_path)
        request = deepinfra_envelope(body())
        own = Decimal(request['reservedUsd'])
        self.assertEqual(bridge.validate_request(request, go)[1], own)
        for amount in (own + Decimal('0.000000001'), own - Decimal('0.000000001')):
            with self.subTest(amount=amount), self.refused('RESERVATION_MISMATCH'):
                bridge.validate_request(dict(request, reservedUsd='%.9f' % amount), go)

    def test_the_app_lookahead_is_accepted_whatever_the_skew_across_the_price_step(self):
        for app_text, gate_text in (('2026-12-30T21:59:59.999+00:00', '2026-12-30T22:00:00.001+00:00'),
                                    ('2026-12-30T21:59:50+00:00', '2026-12-30T22:00:05+00:00'),
                                    ('2026-12-29T21:59:59.999+00:00', '2026-12-29T22:00:00.001+00:00'),
                                    ('2026-10-10T09:00:00+00:00', '2026-10-10T09:00:01+00:00')):
            with self.subTest(app=app_text):
                app, gate = datetime.fromisoformat(app_text), datetime.fromisoformat(gate_text)
                held = bridge.reservation_for(len(self.raw.encode()), GOOGLE.rows[GEMINI], lookahead(app))
                request = envelope(self.raw, app, reserved='%.9f' % held)
                self.assertEqual(bridge.validate_request(request, self.go, moment=gate)[1], held)
        # The plain two-day figure taken just before the step would have been refused just after it.
        app, gate = datetime.fromisoformat('2026-12-30T21:59:59.999+00:00'), datetime.fromisoformat('2026-12-30T22:00:00.001+00:00')
        with self.refused('RESERVATION_MISMATCH'):
            bridge.validate_request(envelope(self.raw, app), self.go, moment=gate)

    def test_a_call_over_the_price_step_midnight_settles_at_its_reservation_prices_and_never_halts(self):
        gate = self.gate()
        gate.clock.set('2026-12-30T21:59:59+00:00')  # 23:59:59 on 30 December in Bucharest.
        gate.ready()
        long_answer = reply(prompt=2000, candidates=6000, thoughts=BOUND - 6000)  # The whole bound.

        def dispatch(_outgoing, _key):
            gate.clock.set('2026-12-30T22:09:00+00:00')  # The answer comes after the price step.
            return 200, long_answer
        result, _ = gate.gcall('op-1', dispatch=dispatch)
        self.assertEqual(result['status'], 200)
        entry = gate.entry('op-1', day='2026-12-30')
        self.assertEqual((entry['reserve_input_usd_per_m'], entry['settle_input_usd_per_m'], entry['state']),
                         ('0.75', '0.75', 'settled'))
        self.assertLessEqual(Decimal(entry['held_usd']), Decimal(entry['reserved_usd']))
        self.assertEqual(gate.status()['state'], 'active')


    def test_on_the_last_bucharest_day_of_2026_the_reservation_is_already_at_the_2027_price(self):
        gate = self.gate()
        gate.clock.set('2026-12-30T22:00:01+00:00')
        gate.ready()
        result, _ = gate.gcall('op-1')
        self.assertEqual(result['status'], 200)
        entry = gate.entry('op-1', day='2026-12-31')
        self.assertEqual((entry['reserve_input_usd_per_m'], entry['reserve_output_usd_per_m'],
                          entry['settle_input_usd_per_m'], entry['settle_output_usd_per_m']),
                         ('1.50', '7.50', '1.50', '7.50'))


class RequestShapeTests(GoogleTest):
    def validate(self, raw, gate=None, probe=False):
        gate = gate or self.gate()
        moment = datetime.fromisoformat('2026-10-10T09:00:00+00:00')
        return bridge.validate_request(envelope(raw, moment), bridge.read_go(gate.go_path), probe=probe, moment=moment)

    def test_the_contract_body_is_accepted_and_the_inner_native_bytes_are_sent(self):
        for inner in (native(), native(systemInstruction={'parts': [{'text': 'Be brief.'}]}),
                      native(contents=[{'role': 'user', 'parts': [{'text': 'a'}]}, {'role': 'model', 'parts': [{'text': 'b'}]},
                                       {'role': 'user', 'parts': [{'text': 'ă î ș ț 日本'}]}]),
                      native(generationConfig={'maxOutputTokens': BOUND, 'thinkingConfig': {'thinkingLevel': 'high'}}),
                      native(generationConfig={'thinkingConfig': {'thinkingLevel': 'high'}, 'maxOutputTokens': 1})):
            with self.subTest(inner=inner):
                raw = framed(inner)
                outgoing, _, row, _ = self.validate(raw)
                self.assertEqual(outgoing, helper.canonical(inner))
                self.assertLess(len(outgoing), len(raw.encode()))
                self.assertEqual(json.loads(outgoing), inner)
                self.assertEqual(row.model, GEMINI)

    def test_every_other_shape_is_refused_before_any_reservation(self):
        def config(**changes):
            value = {'maxOutputTokens': 8192, 'thinkingConfig': {'thinkingLevel': 'high'}}
            value.update(changes)
            return {k: v for k, v in value.items() if v is not None}
        bad_inner = {
            'tools': native(tools=[{'googleSearch': {}}]), 'toolConfig': native(toolConfig={}),
            'safetySettings': native(safetySettings=[]), 'cachedContent': native(cachedContent='cachedContents/x'),
            'labels': native(labels={'a': 'b'}), 'no_config': {'contents': native()['contents']},
            'no_contents': {'generationConfig': native()['generationConfig']},
            'temperature': native(generationConfig=config(temperature=0)),
            'candidateCount': native(generationConfig=config(candidateCount=1)),
            'stopSequences': native(generationConfig=config(stopSequences=['x'])),
            'json_mode': native(generationConfig=config(responseMimeType='application/json')),
            'no_thinking': native(generationConfig=config(thinkingConfig=None)),
            'low_thinking': native(generationConfig=config(thinkingConfig={'thinkingLevel': 'low'})),
            'thinking_budget': native(generationConfig=config(thinkingConfig={'thinkingLevel': 'high', 'thinkingBudget': 0})),
            'include_thoughts': native(generationConfig=config(thinkingConfig={'thinkingLevel': 'high', 'includeThoughts': True})),
            'zero_tokens': native(generationConfig=config(maxOutputTokens=0)),
            'over_bound': native(generationConfig=config(maxOutputTokens=BOUND + 1)),
            'bool_tokens': native(generationConfig=config(maxOutputTokens=True)),
            'float_tokens': native(generationConfig=config(maxOutputTokens=8192.0)),
            'text_tokens': native(generationConfig=config(maxOutputTokens='8192')),
            'empty_contents': native(contents=[]),
            'model_first': native(contents=[{'role': 'model', 'parts': [{'text': 'a'}]}]),
            'system_role': native(contents=[{'role': 'system', 'parts': [{'text': 'a'}]}]),
            'two_parts': native(contents=[{'role': 'user', 'parts': [{'text': 'a'}, {'text': 'b'}]}]),
            'no_parts': native(contents=[{'role': 'user', 'parts': []}]),
            'thought_part': native(contents=[{'role': 'user', 'parts': [{'text': 'a', 'thought': True}]}]),
            'inline_data': native(contents=[{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'x', 'data': ''}}]}]),
            'number_text': native(contents=[{'role': 'user', 'parts': [{'text': 7}]}]),
            'turn_extra': native(contents=[{'role': 'user', 'parts': [{'text': 'a'}], 'name': 'x'}]),
            'system_role_key': native(systemInstruction={'role': 'system', 'parts': [{'text': 'a'}]}),
            'system_two_parts': native(systemInstruction={'parts': [{'text': 'a'}, {'text': 'b'}]}),
            'system_text': native(systemInstruction='Be brief.')}
        for name, inner in bad_inner.items():
            with self.subTest(name=name), self.refused('REQUEST_PARAMETERS_INVALID'):
                self.validate(framed(inner))
        frames = {'extra_key': '{"model":"gemini-3.8-flash","request":%s,"stream":true}',
                  'no_request': '{"model":"gemini-3.8-flash"}',
                  'request_list': '{"model":"gemini-3.8-flash","request":[%s]}'}
        for name, template in frames.items():
            with self.subTest(name=name), self.refused('REQUEST_PARAMETERS_INVALID'):
                self.validate(template.replace('%s', json.dumps(native())))
        for name, raw in {'unknown_model': framed(native(), model='gemini-3.8-pro'),
                          'upper_case': framed(native(), model='Gemini-3.8-flash'),
                          'no_model': '{"request":%s}' % json.dumps(native()),
                          'native_unframed': json.dumps(native())}.items():
            with self.subTest(name=name), self.assertRaises(SafetyError) as caught:
                self.validate(raw)
            self.assertIn(str(caught.exception), ('MODEL_NOT_ALLOWED', 'REQUEST_PARAMETERS_INVALID'))

    def test_a_framed_body_over_the_byte_limit_is_refused_and_one_at_it_is_accepted(self):
        def sized(size):
            inner = native(contents=[{'role': 'user', 'parts': [{'text': ''}]}])
            inner['contents'][0]['parts'][0]['text'] = 'x' * (size - len(framed(inner).encode()))
            raw = framed(inner)
            self.assertEqual(len(raw.encode()), size)
            return raw
        _, reserved, _, _ = self.validate(sized(MAX_BYTES))
        moment = datetime.fromisoformat('2026-10-10T09:00:00+00:00')
        self.assertEqual(reserved, reservation(sized(MAX_BYTES), moment))
        with self.refused('REQUEST_SCOPE_INVALID'):
            self.validate(sized(MAX_BYTES + 1))
        # The engine's own cap on a native body (256 KiB) always fits once framed.
        self.assertGreaterEqual(MAX_BYTES, 256 * 1024 + len(framed({})) - 2)

    def test_the_probe_body_is_a_contract_body(self):
        raw = json.dumps(GOOGLE.probe_body(GOOGLE.rows[GEMINI]), ensure_ascii=False, separators=(',', ':'))
        outgoing, _, _, _ = self.validate(raw, probe=True)
        self.assertEqual(json.loads(outgoing), {'contents': [{'role': 'user', 'parts': [{'text': 'Reply exactly: OK'}]}],
                                                'generationConfig': {'maxOutputTokens': 1024,
                                                                     'thinkingConfig': {'thinkingLevel': 'high'}}})


class SettlementTests(GoogleTest):
    def test_a_fixture_reply_settles_exactly_with_thoughts_billed_as_output(self):
        gate = self.gate().ready()
        result, sent = gate.gcall('op-1', response=reply(prompt=1000, candidates=200, thoughts=300))
        self.assertEqual(result['status'], 200)
        self.assertEqual(sent, [(helper.canonical(native()), FAKE_KEY)])
        entry = gate.entry('op-1')
        expected = (1000 * Decimal('0.75') + (200 + 300) * Decimal('3.75')) / Decimal(1000000)
        self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', expected))
        self.assertEqual({k: entry['accounting'][k] for k in ('prompt_tokens', 'completion_tokens', 'candidates_tokens',
                                                              'reasoning_tokens', 'total_tokens', 'usage_valid')},
                         {'prompt_tokens': 1000, 'completion_tokens': 500, 'candidates_tokens': 200,
                          'reasoning_tokens': 300, 'total_tokens': 1500, 'usage_valid': True})
        self.assertEqual((entry['provider'], entry['model'], entry['maker'], entry['output_bound'], entry['reply_model']),
                         ('google', GEMINI, 'Google', BOUND, GEMINI))
        self.assertEqual(gate.status()['state'], 'active')
        # Thoughts alone, and counts left out (proto3 drops zeros), settle too.
        gate.gcall('op-2', response=reply(prompt=10, candidates=None, thoughts=40, total=50))
        self.assertEqual(Decimal(gate.entry('op-2')['held_usd']), (10 * Decimal('0.75') + 40 * Decimal('3.75')) / Decimal(1000000))
        gate.gcall('op-3', response=reply(prompt=10, candidates=5, thoughts=None, total=15,
                                          promptTokensDetails=[{'modality': 'TEXT', 'tokenCount': 10}]))
        self.assertEqual(gate.entry('op-3')['state'], 'settled')
        self.assertEqual(gate.status()['state'], 'active')

    def test_missing_or_inconsistent_usage_keeps_the_hold_and_halts(self):
        cases = {'no_usage': {k: v for k, v in reply().items() if k != 'usageMetadata'},
                 'usage_not_object': dict(reply(), usageMetadata=[1]),
                 'total_short': reply(total=1499), 'total_long': reply(total=1501),
                 'no_total': reply(total=None) | {'usageMetadata': {'promptTokenCount': 1000, 'candidatesTokenCount': 200}},
                 'no_prompt': dict(reply(), usageMetadata={'candidatesTokenCount': 200, 'totalTokenCount': 200}),
                 'cached': reply(cachedContentTokenCount=10, total=1510),
                 'tool_use': reply(toolUsePromptTokenCount=10, total=1510),
                 'unknown_field': reply(trafficType='ON_DEMAND'),
                 'negative': reply(prompt=-1, total=499), 'bool': reply(thoughts=True, total=1201),
                 'text_count': reply(prompt='1000', total=1500), 'float_count': reply(prompt=1000.0, total=1500),
                 'details_over': reply(promptTokensDetails=[{'modality': 'TEXT', 'tokenCount': 1001}]),
                 'details_shape': reply(promptTokensDetails={'TEXT': 1000}),
                 'cache_details': reply(cacheTokensDetails=[{'modality': 'TEXT', 'tokenCount': 1}])}
        for name, response in cases.items():
            with self.subTest(name=name):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.gcall('op-1', response=response)
                entry = gate.entry('op-1')
                self.assertEqual((entry['state'], entry['held_usd']), ('uncertain', entry['reserved_usd']))
                self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'uncertain_charge'))

    def test_another_model_version_halts(self):
        for named in ('gemini-3.8-flash-001', 'models/gemini-3.8-flash', 'gemini-3.8-pro', None):
            with self.subTest(named=named):
                gate = self.gate().ready()
                response = reply(model=named)
                if named is None:
                    del response['modelVersion']
                with self.refused('AUTHORITY_HALTED'):
                    gate.gcall('op-1', response=response)
                self.assertEqual((gate.entry('op-1')['state'], gate.status()['reason']),
                                 ('settled', 'provider_error_or_model_identity'))

    def test_thoughts_past_the_bound_overrun_the_hold_and_halt(self):
        gate = self.gate().ready()
        raw = framed(native())
        moment = datetime.fromisoformat('2026-10-10T09:00:00+00:00')
        held = reservation(raw, moment)
        thoughts = 2 * BOUND  # Thinking that did not count toward maxOutputTokens.
        with self.refused('AUTHORITY_HALTED'):
            gate.gcall('op-1', response=reply(prompt=100, candidates=100, thoughts=thoughts))
        entry = gate.entry('op-1')
        self.assertGreater(Decimal(entry['held_usd']), held)
        self.assertEqual(gate.status()['reason'], 'charge_overrun')


class UnsentTests(GoogleTest):
    def error_body(self, status, text, **changes):
        error = {'code': status, 'status': text, 'message': 'Resource has been exhausted (e.g. check quota).'}
        error.update(changes)
        return {'error': {k: v for k, v in error.items() if v is not None}}

    def test_a_429_or_503_error_only_body_is_unsent_and_releases_the_hold(self):
        for status, text in ((429, 'RESOURCE_EXHAUSTED'), (503, 'UNAVAILABLE')):
            for changes in ({}, {'details': []}, {'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo',
                                                               'retryDelay': '30s'}]}):
                with self.subTest(status=status, changes=changes):
                    gate = self.gate().ready()
                    with self.refused('PROVIDER_REFUSED_UNBILLED'):
                        gate.gcall('op-1', status=status, response=self.error_body(status, text, **changes))
                    self.assertIsNone(gate.day('2026-10-10')['entries'].get('preview-test:' + SCOPE + ':op-1'))
                    self.assertEqual((gate.status()['state'], gate.control()['unsent_streak']), ('active', 1))
                    self.assertEqual(json.loads(bridge.refusal_body(bridge.CallNotSent('PROVIDER_REFUSED_UNBILLED'))),
                                     {'error': 'PROVIDER_REFUSED_UNBILLED'})

    def test_anything_short_of_a_provably_unbilled_refusal_stays_uncertain(self):
        cases = {'usage_too': (429, dict(self.error_body(429, 'RESOURCE_EXHAUSTED'), usageMetadata={'promptTokenCount': 1})),
                 'nested_candidates': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', details=[{'candidates': []}])),
                 'nested_model': (503, self.error_body(503, 'UNAVAILABLE', details=[{'modelVersion': GEMINI}])),
                 'nested_response_id': (503, self.error_body(503, 'UNAVAILABLE', details=[{'responseId': 'x'}])),
                 'tokens_key': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', details=[{'tokens_used': 1}])),
                 'extra_top_key': (429, dict(self.error_body(429, 'RESOURCE_EXHAUSTED'), x=1)),
                 'code_mismatch': (429, self.error_body(503, 'RESOURCE_EXHAUSTED')),
                 'status_mismatch': (429, self.error_body(429, 'UNAVAILABLE')),
                 'status_503_wrong_text': (503, self.error_body(503, 'RESOURCE_EXHAUSTED')),
                 'no_message': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', message=None)),
                 'extra_error_key': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', reason='x')),
                 'details_not_list': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', details={})),
                 'code_text': (429, self.error_body(429, 'RESOURCE_EXHAUSTED', code='429')),
                 'other_status_500': (500, self.error_body(500, 'INTERNAL')),
                 'bad_request_400': (400, self.error_body(400, 'INVALID_ARGUMENT')),
                 'not_json': (429, {'_invalid_json': True})}
        for name, (status, response) in cases.items():
            with self.subTest(name=name):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.gcall('op-1', status=status, response=response)
                self.assertEqual((gate.entry('op-1')['state'], gate.status()['state']), ('uncertain', 'halted'))

    def test_a_failed_connect_is_unsent_and_the_gate_stays_open(self):
        gate = self.gate().ready()

        def unreachable(_outgoing, _key):
            raise helper.RequestNotSent('request_not_sent')
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.gcall('op-1', dispatch=unreachable)
        self.assertEqual((gate.status()['state'], gate.status()['today_posts']), ('active', 0))


class KeyTests(GoogleTest):
    def test_the_key_goes_only_in_x_goog_api_key_and_never_in_the_url(self):
        seen = []

        class FakeConnection:
            def __init__(self, host, timeout=None, context=None):
                seen.append(('host', host))
                self.sock = None

            def connect(self):
                pass

            def request(self, method, path, body=None, headers=None):
                seen.append((method, path, body, headers))

            def getresponse(self):
                class Response:
                    status = 200

                    def __init__(self):
                        self.chunks = [json.dumps(reply()).encode(), b'']

                    def read(self, _size):
                        return self.chunks.pop(0)
                return Response()

            def close(self):
                pass
        with patch.object(http.client, 'HTTPSConnection', FakeConnection):
            transport = _HTTPS(30, GOOGLE, GOOGLE.path_for(GOOGLE.rows[GEMINI]))
            status, _ = transport(helper.canonical(native()), FAKE_KEY)
        self.assertEqual(status, 200)
        self.assertEqual(seen[0], ('host', 'generativelanguage.googleapis.com'))
        method, path, sent, headers = seen[1]
        self.assertEqual((method, path, sent), ('POST', '/v1beta/models/gemini-3.8-flash:generateContent',
                                                helper.canonical(native())))
        self.assertEqual(headers, {'x-goog-api-key': FAKE_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        self.assertNotIn('?', path)
        self.assertNotIn(FAKE_KEY.encode(), sent)

    def test_the_key_and_any_google_key_shape_never_reach_a_ledger_status_log_or_reply(self):
        other_key = 'AIza' + 'Zz' + 'another' + '0123456789' + 'ABCDEFGHIJKLMNOP'
        self.assertRegex(other_key, r'^AIza[0-9A-Za-z_-]{35}$')
        gate = self.gate().ready()
        response = reply(text='echo ' + FAKE_KEY + ' and ' + other_key)
        result, _ = gate.gcall('op-1', response=response)
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.gcall('op-2', status=500, response={'error': {'code': 500, 'message': 'bad key ' + other_key,
                                                               'status': 'INTERNAL'}})
        texts = [result['body'], json.dumps(gate.status()), self.out.getvalue(),
                 *(path.read_text() for path in gate.private.iterdir() if path.suffix == '.json')]
        for text in texts:
            self.assertNotIn(FAKE_KEY, text)
            self.assertNotIn(other_key, text)
        self.assertIn('[REDACTED]', result['body'])


class ProbeAndRemainingTests(GoogleTest):
    def probe(self, gate, response, status=200):
        sent = []

        def dispatch(outgoing, key):
            sent.append((json.loads(outgoing), key))
            return status, response
        summary = bridge.probe(gate.private, gate.go_path, GEMINI, dispatch=dispatch, key_loader=lambda _p: FAKE_KEY,
                               host=HOST, platform='linux', uid=0, now=gate.clock)
        return summary, sent

    def test_the_probe_reports_the_echoed_version_and_whether_thoughts_stayed_within_the_bound(self):
        gate = self.gate().ready()
        summary, sent = self.probe(gate, reply(prompt=8, candidates=1, thoughts=600))
        self.assertEqual(sent[0][0]['generationConfig'], {'maxOutputTokens': 1024, 'thinkingConfig': {'thinkingLevel': 'high'}})
        self.assertEqual({k: summary[k] for k in ('provider', 'model', 'maker', 'http_status', 'model_echoed_exactly',
                                                  'completion_within_max_tokens', 'entry_state', 'halt_reason', 'reply_excerpt')},
                         {'provider': 'google', 'model': GEMINI, 'maker': 'Google', 'http_status': 200,
                          'model_echoed_exactly': True, 'completion_within_max_tokens': True, 'entry_state': 'settled',
                          'halt_reason': None, 'reply_excerpt': 'OK'})
        self.assertEqual((summary['usage']['completion_tokens'], summary['usage']['reasoning_tokens']), (601, 600))
        gate = self.gate().ready()
        summary, _ = self.probe(gate, reply(prompt=8, candidates=1, thoughts=1500, model='gemini-3.8-flash-preview-10-2026'))
        self.assertEqual((summary['completion_within_max_tokens'], summary['model_echoed_exactly'], summary['reply_model'],
                          summary['halt_reason']),
                         (False, False, 'gemini-3.8-flash-preview-10-2026', 'provider_error_or_model_identity'))

    def test_remaining_reports_the_ceiling_worst_case(self):
        gate = self.gate().ready()
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, now=gate.clock)
        self.assertEqual(Decimal(report['largest_reservation_usd']),
                         (Decimal(MAX_BYTES + 2048) * Decimal('1.50') + BOUND * Decimal('7.50')) / Decimal(1000000))
        self.assertEqual((report['enabled_models'], report['max_concurrent_calls'], report['remaining_usd']),
                         ([GEMINI], CONCURRENCY, '1.00'))


if __name__ == '__main__':
    unittest.main()
