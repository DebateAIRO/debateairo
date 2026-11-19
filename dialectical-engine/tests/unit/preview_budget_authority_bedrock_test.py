"""The v3 spending gate's Amazon Bedrock profile: one reviewed row, OpenAI's GPT-6 Luna through the United States
inference profile.

Offline only: temporary directories and fake dispatch functions. No real key, no DNS, no upstream call. The key below is
a made-up value in the long-term Bedrock key shape, built from pieces so a secret scanner does not read it as one. The
replies are written from OpenAI's Chat Completions reference and Bedrock's prompt-caching page; none was recorded from
Amazon.
"""
import hashlib
import json
import re
import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import HOST, PEER, SCOPE, Gate, load_bridge  # noqa: E402

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
BEDROCK = bridge.helper.PROFILES['bedrock']
PARITY = json.loads((Path(__file__).resolve().parent / 'fixtures/preview-model-rows-bedrock.json').read_text())
LUNA = 'us.openai.gpt-6-luna'
ROW = BEDROCK.rows[LUNA]
KEY = 'AB' + 'SK' + 'U3ludGhldGljVGVzdFZhbHVl' + 'MDEyMzQ1Njc4OWFiY2RlZg=='  # A made-up test value.
DAY = '2026-10-08'
LOWER, UPPER = PARITY['settlement_steps']


def request(**changes):
    """A valid request as the app's adapter sends it."""
    value = {'model': LUNA, 'max_completion_tokens': 8192, 'reasoning_effort': 'high',
             'messages': [{'role': 'user', 'content': 'Offline synthetic test'}]}
    value.update(changes)
    return value


def hold(raw_bytes, bound=32768, upper=False):
    """Written out independently of the gate, from the parity file."""
    price_in, price_out = ((PARITY['reservation']['upper_input_usd_per_m'], PARITY['reservation']['upper_output_usd_per_m'])
                           if upper else (PARITY['rows'][0]['input_usd_per_m'], PARITY['rows'][0]['output_usd_per_m']))
    return (Decimal(raw_bytes + 2048) * Decimal(price_in) + Decimal(bound) * Decimal(price_out)) / Decimal(1000000)


def envelope(value, operation_id='op-1', reserved=None, **extra):
    raw = json.dumps(value)
    reserved = hold(len(raw.encode())) if reserved is None else reserved
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reserved), **extra}


def reply(prompt=1000, completion=50, **changes):
    """A Chat Completions answer with the usage members OpenAI documents."""
    value = {'id': 'chatcmpl-synthetic', 'object': 'chat.completion', 'model': LUNA, 'service_tier': 'default',
             'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'OK'}, 'finish_reason': 'stop'}],
             'usage': {'prompt_tokens': prompt, 'completion_tokens': completion, 'total_tokens': prompt + completion,
                       'prompt_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0},
                       'completion_tokens_details': {'reasoning_tokens': 0}}}
    value.update(changes)
    return value


def usage(prompt, completion, write=0, read=0, reasoning=0, **more):
    return {'prompt_tokens': prompt, 'completion_tokens': completion, 'total_tokens': prompt + completion,
            'prompt_tokens_details': {'cached_tokens': read, 'cache_write_tokens': write},
            'completion_tokens_details': {'reasoning_tokens': reasoning}, **more}


def gate(**go_changes):
    go = {'provider': 'bedrock', 'enabled_models': [LUNA], 'max_concurrent_calls': 4, 'daily_budget_usd': '5.50'}
    go.update(go_changes)
    return Gate(bridge, **go).ready()


def run(g, value=None, operation_id='op-1', status=200, answer=None, **kwargs):
    sent = {}

    def dispatch(payload, key):
        sent.update(payload=payload, key=key)
        return status, reply() if answer is None else answer
    options = {'peer_uid': PEER, 'slots': g.slots, 'dispatch': dispatch, 'key_loader': lambda _private: KEY, 'host': HOST,
               'platform': 'linux', 'now': g.clock, 'slot_wait': 0.2}
    options.update(kwargs)
    return g.bridge.execute_request(g.private, g.go_path, envelope(value or request(), operation_id), **options), sent


def entry_of(g, operation_id='op-1'):
    return g.day(DAY)['entries']['preview-test:' + SCOPE + ':' + operation_id]


class ParityTests(unittest.TestCase):
    def test_the_profile_is_reviewed_and_equals_the_parity_file(self):
        self.assertIs(bridge.profile_of('bedrock'), BEDROCK)
        self.assertEqual((BEDROCK.host, BEDROCK.path_for(ROW)),
                         ('bedrock-runtime.us-east-1.amazonaws.com', '/openai/v1/chat/completions'))
        self.assertEqual(list(BEDROCK.rows), [LUNA])
        row = PARITY['rows'][0]
        self.assertEqual((ROW.model, ROW.maker, str(ROW.input_usd_per_m), str(ROW.output_usd_per_m), ROW.output_bound,
                          list(ROW.efforts), ROW.json_object, ROW.sampling),
                         (row['model'], row['maker'], row['input_usd_per_m'], row['output_usd_per_m'], row['output_bound'],
                          row['efforts'], row['json_object'], None))
        self.assertEqual([(step.prompt_tokens_up_to, str(step.input_usd_per_m), str(step.cache_write_usd_per_m),
                           str(step.cache_read_usd_per_m), str(step.output_usd_per_m)) for step in BEDROCK.settlement_steps],
                         [(step['prompt_tokens_up_to'], step['input_usd_per_m'], step['cache_write_usd_per_m'],
                           step['cache_read_usd_per_m'], step['output_usd_per_m']) for step in PARITY['settlement_steps']])
        reservation = PARITY['reservation']
        self.assertEqual((BEDROCK.max_request_bytes, str(BEDROCK.per_call_cap_usd), BEDROCK.RESERVATION_OVERHEAD_BYTES),
                         (reservation['worst_case_request_bytes'], reservation['per_call_cap_usd'], reservation['overhead_bytes']))
        self.assertEqual(tuple(str(price) for price in BEDROCK.ceiling_prices(ROW)),
                         (reservation['upper_input_usd_per_m'], reservation['upper_output_usd_per_m']))
        final = PARITY['final_writer']
        self.assertEqual((BEDROCK.final_writer_max_request_bytes, str(BEDROCK.final_writer_per_call_cap_usd),
                          ROW.final_writer_output_bound),
                         (final['request_bytes'], final['per_call_cap_usd'], final['rows'][0]['output_bound']))

    def test_the_hold_price_is_never_below_what_an_input_token_can_cost(self):
        for step, held in zip(BEDROCK.settlement_steps, (ROW.input_usd_per_m, BEDROCK.UPPER_HOLD_PRICES[0])):
            self.assertGreaterEqual(held, max(step.input_usd_per_m, step.cache_write_usd_per_m, step.cache_read_usd_per_m))
        self.assertEqual(ROW.output_usd_per_m, BEDROCK.settlement_steps[0].output_usd_per_m)
        self.assertEqual(BEDROCK.UPPER_HOLD_PRICES[1], BEDROCK.settlement_steps[1].output_usd_per_m)

    def test_the_worst_cases_are_the_parity_files_and_stay_under_the_caps(self):
        row, final = PARITY['rows'][0], PARITY['final_writer']['rows'][0]
        self.assertEqual(hold(262144), Decimal(row['worst_case_reservation_usd']))
        self.assertEqual(bridge.worst_case_reservation(BEDROCK, ROW), Decimal(row['ceiling_reservation_usd']))
        self.assertEqual(bridge.worst_case_reservation(BEDROCK, ROW, 'FINAL_WRITER'), Decimal(final['worst_case_reservation_usd']))
        self.assertLessEqual(bridge.worst_case_reservation(BEDROCK, ROW), BEDROCK.per_call_cap_usd)
        self.assertLessEqual(bridge.worst_case_reservation(BEDROCK, ROW, 'FINAL_WRITER'), BEDROCK.final_writer_per_call_cap_usd)

    def test_bytes_plus_overhead_up_to_the_step_reserve_at_the_row_and_one_more_at_the_upper_step(self):
        step = PARITY['reservation']['step_tokens']
        self.assertEqual(BEDROCK.reservation_prices(ROW, None, step - 2048), (ROW.input_usd_per_m, ROW.output_usd_per_m))
        self.assertEqual(BEDROCK.reservation_prices(ROW, None, step - 2047), BEDROCK.UPPER_HOLD_PRICES)
        self.assertEqual(BEDROCK.reservation_prices(ROW, None), BEDROCK.UPPER_HOLD_PRICES)  # An unknown size.


class RequestTests(unittest.TestCase):
    def test_only_the_exact_body_is_accepted(self):
        self.assertTrue(BEDROCK.body_valid(request(), ROW))
        for effort in ROW.efforts:
            self.assertTrue(BEDROCK.body_valid(request(reasoning_effort=effort), ROW))
        refused = [request(reasoning_effort='xhigh'), request(reasoning_effort='max'), request(reasoning_effort=None),
                   {k: v for k, v in request().items() if k != 'reasoning_effort'},
                   {k: v for k, v in request().items() if k != 'max_completion_tokens'},
                   {**{k: v for k, v in request().items() if k != 'max_completion_tokens'}, 'max_tokens': 8192},
                   request(max_tokens=8192), request(max_completion_tokens=0), request(max_completion_tokens=32769),
                   request(max_completion_tokens=True), request(max_completion_tokens=8192.0),
                   request(model='openai.gpt-6-luna'), request(model='global.openai.gpt-6-luna'),
                   request(store=False), request(stream=True), request(temperature=1), request(service_tier='priority'),
                   request(response_format={'type': 'json_object'}), request(prompt_cache_options={'mode': 'explicit'}),
                   request(tools=[]), request(messages=[]), request(messages=[{'role': 'tool', 'content': 'x'}]),
                   request(messages=[{'role': 'user', 'content': [{'type': 'text', 'text': 'x'}]}])]
        for value in refused:
            with self.subTest(value=value):
                self.assertFalse(BEDROCK.body_valid(value, ROW))

    def test_a_call_goes_out_unchanged_with_the_bearer_key_and_is_settled_at_list_prices(self):
        g = gate()
        self.addCleanup(g.close)
        result, sent = run(g, answer=reply(prompt=1000, completion=50))
        # The gate sends its own canonical bytes of the accepted body: the same members, nothing added.
        self.assertEqual(json.loads(sent['payload']), request())
        self.assertEqual(sent['payload'], BEDROCK.request_bytes(request()))
        self.assertEqual(BEDROCK.auth_headers(sent['key']), {'Authorization': 'Bearer ' + KEY})
        self.assertEqual(result['status'], 200)
        entry = entry_of(g)
        expected = (Decimal(1000) * Decimal(LOWER['input_usd_per_m']) + Decimal(50) * Decimal(LOWER['output_usd_per_m'])) / Decimal(1000000)
        self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', expected))
        self.assertEqual(g.status()['state'], 'active')

    def test_a_reservation_at_another_price_is_refused_before_anything_is_sent(self):
        g = gate()
        self.addCleanup(g.close)
        raw = json.dumps(request())
        wrong = envelope(request(), reserved=hold(len(raw.encode()), upper=True))
        with self.assertRaises(SafetyError) as refused:
            g.bridge.execute_request(g.private, g.go_path, wrong, peer_uid=PEER, slots=g.slots,
                                     dispatch=lambda *_: self.fail('sent'), key_loader=lambda _private: KEY, host=HOST,
                                     platform='linux', now=g.clock, slot_wait=0.2)
        self.assertEqual(str(refused.exception), 'RESERVATION_MISMATCH')

    def test_a_key_of_another_shape_is_never_sent(self):
        for key in ('bedrock-api-key-' + 'c2hvcnQtdGVybS1zeW50aGV0aWM=', 'sk-ant-' + 'api03-synthetic0123456789',
                    'pp' + 'lx-' + 'Synthetic0123456789abcdef', 'synthetic' + '-key-' + '0123456789'):
            with self.subTest(prefix=key[:8]):
                g = gate()
                self.addCleanup(g.close)
                with self.assertRaises(SafetyError):
                    run(g, key_loader=lambda _private, key=key: key, dispatch=lambda *_: self.fail('sent'))
        self.assertTrue(re.fullmatch(BEDROCK.key_pattern, KEY))
        for other in ('deepinfra', 'anthropic', 'perplexity'):
            pattern = getattr(bridge.helper.PROFILES[other], 'key_pattern', None)
            self.assertFalse(pattern is not None and re.fullmatch(pattern, KEY), other)


class AccountingTests(unittest.TestCase):
    def charge(self, answer):
        return BEDROCK.account(answer, ROW, None)

    def test_each_kind_of_token_is_charged_at_its_own_price_of_the_lower_step(self):
        accounting = self.charge(reply(usage=usage(5000, 300, write=3000, read=1500, reasoning=200)))
        expected = (Decimal(500) * Decimal(LOWER['input_usd_per_m']) + Decimal(3000) * Decimal(LOWER['cache_write_usd_per_m'])
                    + Decimal(1500) * Decimal(LOWER['cache_read_usd_per_m']) + Decimal(300) * Decimal(LOWER['output_usd_per_m'])) / Decimal(1000000)
        self.assertTrue(accounting['usage_valid'])
        self.assertEqual(Decimal(accounting['guard_charge_usd']), expected)
        self.assertEqual((accounting['price_step'], accounting['cache_write_tokens'], accounting['cache_read_tokens'],
                          accounting['billed_output_tokens']), ('up_to_272k', 3000, 1500, 300))

    def test_a_prompt_above_the_step_is_charged_at_the_upper_step_and_exactly_at_it_at_the_lower(self):
        at, above = self.charge(reply(usage=usage(272000, 10))), self.charge(reply(usage=usage(272001, 10)))
        self.assertEqual((at['price_step'], above['price_step']), ('up_to_272k', 'over_272k'))
        self.assertEqual(Decimal(above['guard_charge_usd']),
                         (Decimal(272001) * Decimal(UPPER['input_usd_per_m']) + Decimal(10) * Decimal(UPPER['output_usd_per_m'])) / Decimal(1000000))

    def test_a_full_cache_write_never_costs_more_than_the_hold(self):
        for raw_bytes, upper in ((6000, False), (262144, False), (1048576, True)):
            tokens = raw_bytes + 2048
            bound = 128000 if upper else 32768
            accounting = self.charge(reply(usage=usage(tokens, bound, write=tokens)))
            self.assertLessEqual(Decimal(accounting['guard_charge_usd']), hold(raw_bytes, bound=bound, upper=upper))

    def test_details_may_be_absent_or_null_and_reasoning_outside_the_total_is_charged_on_top(self):
        plain = self.charge(reply(usage={'prompt_tokens': 100, 'completion_tokens': 20}))
        self.assertTrue(plain['usage_valid'])
        nulls = self.charge(reply(usage={'prompt_tokens': 100, 'completion_tokens': 20, 'total_tokens': 120,
                                         'prompt_tokens_details': None, 'completion_tokens_details': {'reasoning_tokens': None}}))
        self.assertEqual(nulls['guard_charge_usd'], plain['guard_charge_usd'])
        outside = self.charge(reply(usage={'prompt_tokens': 100, 'completion_tokens': 20, 'total_tokens': 150,
                                           'completion_tokens_details': {'reasoning_tokens': 30}}))
        self.assertEqual(outside['billed_output_tokens'], 50)

    def test_a_usage_the_profile_does_not_understand_is_uncertain_and_names_its_check(self):
        cases = {
            'usage_missing': reply(usage=None),
            'usage_unknown_field': reply(usage=usage(100, 20, speed='fast')),
            'token_counts': reply(usage={**usage(100, 20), 'prompt_tokens': '100'}),
            'prompt_tokens_details': reply(usage={**usage(100, 20), 'prompt_tokens_details': {'cached_tokens': 0, 'new_kind_tokens': 1}}),
            'completion_tokens_details': reply(usage={**usage(100, 20), 'completion_tokens_details': {'reasoning_tokens': 0, 'audio_tokens': 5}}),
            'cache_counts': reply(usage=usage(100, 20, write=80, read=30)),
            'token_total': reply(usage={**usage(100, 20), 'total_tokens': 999}),
            'service_tier': reply(service_tier='priority'),
        }
        cases['prompt_tokens_details_image'] = reply(usage={**usage(100, 20), 'prompt_tokens_details': {'image_tokens': 4}})
        for name, answer in cases.items():
            with self.subTest(name=name):
                accounting = self.charge(answer)
                self.assertFalse(accounting['usage_valid'])
                self.assertIsNone(accounting['guard_charge_usd'])
                self.assertEqual(accounting['invalid_reason'], name.removesuffix('_image'))
                self.assertIn('reply', accounting['reply_shape'])

    def test_an_unknown_usage_member_halts_but_a_reply_without_usage_is_booked_at_its_hold(self):
        g = gate()
        self.addCleanup(g.close)
        with self.assertRaises(SafetyError):
            run(g, answer=reply(usage=usage(100, 20, speed='fast')))
        self.assertEqual(g.status()['state'], 'halted')
        g2 = gate()
        self.addCleanup(g2.close)
        with self.assertRaises(SafetyError) as booked:
            run(g2, answer={k: v for k, v in reply().items() if k != 'usage'})
        self.assertEqual(str(booked.exception), 'PROVIDER_CHARGE_BOOKED_MAX')
        self.assertEqual((g2.status()['state'], entry_of(g2)['state']), ('active', bridge.BOOKED_MAX))

    def test_another_model_name_in_the_reply_halts(self):
        for named in ('openai.gpt-6-luna', 'gpt-6-luna', 'global.openai.gpt-6-luna'):
            with self.subTest(named=named):
                g = gate()
                self.addCleanup(g.close)
                with self.assertRaises(SafetyError):
                    run(g, answer=reply(model=named))
                self.assertEqual(g.status()['state'], 'halted')


class RefusalTests(unittest.TestCase):
    ERROR = {'error': {'message': 'Too many requests', 'type': 'rate_limit_error', 'param': None, 'code': 'throttling'}}

    def test_busy_answers_bill_nothing_and_never_halt(self):
        for status in (429, 503, 529):
            with self.subTest(status=status):
                self.assertTrue(BEDROCK.unbilled_refusal(status, self.ERROR))
                self.assertTrue(BEDROCK.unbilled_refusal(status, {'message': 'Service unavailable'}))
                self.assertTrue(BEDROCK.busy_refusal(status, self.ERROR))
                g = gate()
                self.addCleanup(g.close)
                with self.assertRaises(SafetyError) as refused:
                    run(g, status=status, answer=self.ERROR)
                self.assertEqual(str(refused.exception), 'PROVIDER_REFUSED_UNBILLED')
                self.assertEqual((g.status()['state'], entry_of(g)['state'], Decimal(entry_of(g)['held_usd'])),
                                 ('active', 'released_unbilled', Decimal(0)))

    def test_a_refusal_that_names_a_bill_or_another_status_is_not_unbilled(self):
        self.assertFalse(BEDROCK.unbilled_refusal(429, {**self.ERROR, 'usage': {'prompt_tokens': 1}}))
        self.assertFalse(BEDROCK.unbilled_refusal(429, {'error': {'message': 'x', 'completion_tokens': 1}}))
        self.assertFalse(BEDROCK.unbilled_refusal(429, {}))
        for status in (400, 401, 403, 404, 500):
            self.assertFalse(BEDROCK.unbilled_refusal(status, self.ERROR))

    def test_a_refused_key_halts_under_its_own_name_and_a_refused_request_under_the_general_one(self):
        denied = {'error': {'message': 'Invalid API Key format', 'type': 'permission_denied_error', 'param': None, 'code': 'access_denied'}}
        for status, reason in ((401, 'provider_key_refused'), (403, 'provider_key_refused'), (400, 'uncertain_charge'),
                               (404, 'uncertain_charge')):
            with self.subTest(status=status):
                g = gate()
                self.addCleanup(g.close)
                with self.assertRaises(SafetyError):
                    run(g, status=status, answer=denied)
                status_now = g.status()
                self.assertEqual((status_now['state'], status_now['reason']), ('halted', reason))
                # Nothing is released: the call's whole hold stays counted until root has looked.
                self.assertEqual((entry_of(g)['state'], entry_of(g)['http_status']), ('uncertain', status))
        self.assertEqual(bridge.KEY_REFUSED_HALT, 'provider_key_refused')

    def test_only_a_plain_401_or_403_is_a_refused_key(self):
        denied = {'error': {'message': 'The security token included in the request is expired', 'type': 'permission_denied_error'}}
        self.assertTrue(BEDROCK.key_refused(401, denied))
        self.assertTrue(BEDROCK.key_refused(403, {'message': 'Forbidden'}))
        for status in (400, 404, 429, 500, 200):
            self.assertFalse(BEDROCK.key_refused(status, denied))
        self.assertFalse(BEDROCK.key_refused(403, {**denied, 'usage': {'prompt_tokens': 1}}))
        self.assertFalse(BEDROCK.key_refused(403, {}))
        # The other gates' profiles have no such hook: their halts keep their names.
        for other in ('deepinfra', 'anthropic', 'perplexity'):
            self.assertFalse('key_refused' in type(bridge.helper.PROFILES[other]).__dict__)


class ProbeTests(unittest.TestCase):
    def test_the_probe_asks_as_the_app_does_with_a_question_long_enough_to_be_cached(self):
        body = BEDROCK.probe_body(ROW)
        self.assertTrue(BEDROCK.body_valid(body, ROW))
        self.assertEqual((body['max_completion_tokens'], body['reasoning_effort']), (1024, ROW.efforts[0]))
        content = body['messages'][0]['content']
        self.assertTrue(content.endswith('Reply exactly: OK'))
        # Amazon keeps a prompt of 1,024 tokens or more; a token is never longer than a few characters of plain English.
        self.assertGreater(len(content.split()), 1024)
        self.assertLess(len(json.dumps(body)), 16 * 1024)
        self.assertEqual(BEDROCK.reply_text(reply()), 'OK')


if __name__ == '__main__':
    unittest.main()
