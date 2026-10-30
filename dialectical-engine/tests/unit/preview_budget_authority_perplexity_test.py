"""The v3 spending gate's Perplexity profile (plan 2026-10-30, task W1-1): one reviewed search row, fast mode.

Offline only: temporary directories and fake dispatch functions. No real key, no DNS, no upstream call. The key below
is a made-up value in Perplexity's key shape, built from pieces so a secret scanner does not read it as one. The pages
in the replies are made up (no saved page text is used).

Perplexity charges per request and reports no usage: each search reserves, and is charged, exactly $0.001 (owner,
2026-10-30: fast mode, a $1.00 daily pot, the team total raised from $16.00 to $17.00).
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
from preview_budget_authority_fixture import HOST, PEER, SCOPE, Gate, load_bridge  # noqa: E402

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
PERPLEXITY = bridge.helper.PROFILES['perplexity']
_HTTPS = bridge.helper.HttpsTransport
PARITY = Path(__file__).resolve().parent / 'fixtures/preview-search-rows.json'
SEARCH = 'perplexity-search-fast'
KEY = 'pp' + 'lx-' + 'Synthetic0123456789' + 'abcdefghijklmnop'  # A made-up test value.
OTHER_SHAPE = 'pp' + 'lx-' + 'LEAKEDvalue42xyz'  # Any other string of the same shape.
# Written out independently of the gate: one search costs $0.001 (Perplexity's fast-mode list price, owner 2026-10-30).
PRICE = Decimal('0.001')
DAY = '2026-10-08'


# A made-up DeepInfra-shaped key, built from pieces so the secret scanner never reads it as a key (PR #224).
SYNTHETIC_DEEPINFRA_KEY = 'synthetic' + '-key-' + ''.join(str(digit) for digit in range(10))

def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


def request(**changes):
    """A valid search as the app's adapter sends it: 10 results, whole pages, fast mode."""
    value = {'query': 'nurse net salary Germany 2026', 'max_results': 10, 'max_tokens_per_page': 21000,
             'max_tokens': 210000, 'search_type': 'fast'}
    value.update(changes)
    return value


def without(name, value=None):
    return {k: v for k, v in (value or request()).items() if k != name}


def envelope(value, operation_id='op-1', reserved=PRICE):
    raw = json.dumps(value)
    return {'scope_id': SCOPE, 'operationId': operation_id, 'requestBody': raw,
            'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': str(reserved)}


def page(n=1, **changes):
    value = {'title': 'Made-up page %d' % n, 'url': 'https://example.org/page-%d' % n,
             'snippet': 'Made-up page text number %d, written for this test only.' % n,
             'date': '2026-09-01', 'last_updated': '2026-09-02'}
    value.update(changes)
    return value


def answer(results=None, **changes):
    """A search reply as Perplexity documents it: id and results (and an optional server_time)."""
    value = {'id': 'synthetic-search-id', 'results': [page(1), page(2)] if results is None else results}
    value.update(changes)
    return value


def entry_of(gate, operation_id='op-1'):
    return gate.day(DAY)['entries']['preview-test:' + SCOPE + ':' + operation_id]


class PerplexityTest(unittest.TestCase):
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
        # The proposed GO (README-perplexity.md): $1.00 and 1,000 searches a day, 10 at once.
        go = {'provider': 'perplexity', 'enabled_models': [SEARCH], 'daily_budget_usd': '1.00',
              'max_paid_posts_per_day': 1000, 'max_concurrent_calls': 10, **changes}
        gate = Gate(bridge, **go)
        self.gates.append(gate)
        return gate

    def ready(self, **changes):
        return self.gate(**changes).ready()

    def call(self, gate, operation_id='op-1', reply=None, status=200, value=None, dispatch=None, reserved=PRICE, **kwargs):
        if dispatch is None:
            def dispatch(_sent, _key):
                return status, json.loads(json.dumps(answer() if reply is None else reply), parse_float=Decimal)
        options = {'peer_uid': PEER, 'slots': gate.slots, 'dispatch': dispatch, 'key_loader': lambda _private: KEY,
                   'host': HOST, 'platform': 'linux', 'now': gate.clock, 'slot_wait': 0.2}
        options.update(kwargs)
        return bridge.execute_request(gate.private, gate.go_path, envelope(value or request(), operation_id, reserved),
                                      **options)

    def refused(self, code):
        return self.assertRaisesRegex(SafetyError, '^' + code + '$')

    def assert_uncertain_halt(self, gate, operation_id='op-1'):
        entry = entry_of(gate, operation_id)
        self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('uncertain', PRICE))
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'uncertain_charge'))


class ParityAndPriceTests(PerplexityTest):
    def test_the_profile_equals_the_parity_fixture_the_app_also_asserts(self):
        parity = json.loads(PARITY.read_text())
        self.assertEqual((parity['provider'], parity['host'], parity['path'], Decimal(parity['per_call_cap_usd']),
                          parity['max_request_bytes']),
                         ('perplexity', PERPLEXITY.host, PERPLEXITY.path, PERPLEXITY.per_call_cap_usd,
                          PERPLEXITY.max_request_bytes))
        self.assertEqual([row['model'] for row in parity['rows']], list(PERPLEXITY.rows))
        row = PERPLEXITY.rows[SEARCH]
        self.assertEqual({'model': row.model, 'maker': row.maker, 'request_usd': str(row.request_usd),
                          'request_nano_usd': int(row.request_usd * 10 ** 9), 'search_type': PERPLEXITY.SEARCH_TYPE,
                          'worst_case_reservation_usd': str(bridge.worst_case_reservation(PERPLEXITY, row))},
                         parity['rows'][0])
        self.assertEqual(parity['request_fields'], {'required': list(PERPLEXITY.REQUIRED_FIELDS),
                                                    'optional': list(PERPLEXITY.OPTIONAL_FIELDS)})
        self.assertEqual(parity['bounds'], {'query_chars': list(PERPLEXITY.QUERY_CHARS),
                                            'max_results': list(PERPLEXITY.MAX_RESULTS),
                                            'max_tokens_per_page': list(PERPLEXITY.MAX_TOKENS_PER_PAGE),
                                            'max_tokens': list(PERPLEXITY.MAX_TOKENS),
                                            'search_language_filter_items': PERPLEXITY.LANGUAGE_ITEMS})
        replies = parity['reply_fields']
        self.assertEqual((set(replies['top_level']), set(replies['required_top_level']), set(replies['result']),
                          set(replies['required_result']), replies['max_results']),
                         (bridge.helper.SEARCH_REPLY_KEYS, bridge.helper.SEARCH_REPLY_REQUIRED,
                          bridge.helper.SEARCH_RESULT_KEYS, bridge.helper.SEARCH_RESULT_REQUIRED, PERPLEXITY.MAX_RESULTS[1]))
        self.assertEqual(parity['unbilled_refusals'], {'busy': sorted(PERPLEXITY.BUSY_STATUSES),
                                                      'not_busy': sorted(set(PERPLEXITY.UNBILLED_STATUSES)
                                                                         - PERPLEXITY.BUSY_STATUSES)})
        self.assertTrue(KEY.startswith(parity['key_prefix']))
        # And the independent copy these tests use.
        self.assertEqual((row.request_usd, row.maker, PERPLEXITY.SEARCH_TYPE), (PRICE, 'Perplexity', 'fast'))

    def test_the_profile_is_served_at_the_exact_search_url_only(self):
        self.assertEqual(set(bridge.helper.PROFILES), {'deepinfra', 'anthropic', 'perplexity'})
        self.assertEqual((PERPLEXITY.name, PERPLEXITY.host, PERPLEXITY.path_for(PERPLEXITY.rows[SEARCH])),
                         ('perplexity', 'api.perplexity.ai', '/search'))
        self.assertIs(bridge.profile_of('perplexity'), PERPLEXITY)
        self.assertEqual(list(PERPLEXITY.rows), [SEARCH])

    def test_a_search_reserves_exactly_its_price_whatever_its_size_and_never_tokens(self):
        row, now = PERPLEXITY.rows[SEARCH], bridge.helper.utc_now()
        self.assertEqual(PERPLEXITY.reservation_prices(row, now, 100), (Decimal(0), Decimal(0)))
        self.assertEqual(PERPLEXITY.ceiling_prices(row), (Decimal(0), Decimal(0)))
        for size in (0, 100, PERPLEXITY.max_request_bytes):
            with self.subTest(size=size):
                self.assertEqual(bridge.reservation_for(size, row, (Decimal(0), Decimal(0))), PRICE)
        self.assertEqual(bridge.worst_case_reservation(PERPLEXITY, row), PRICE)
        self.assertLessEqual(PRICE, PERPLEXITY.per_call_cap_usd)
        self.assertLessEqual(PERPLEXITY.per_call_cap_usd, bridge.MAX_PROFILE_CALL_CAP_USD)
        go = bridge.read_go(self.gate().go_path)
        for value in (request(), request(query='x'), request(query='y' * 500)):
            with self.subTest(size=len(json.dumps(value))):
                outgoing, reserved, checked, prices = bridge.validate_request(envelope(value), go)
                self.assertEqual((json.loads(outgoing), reserved, checked.model, prices),
                                 (value, PRICE, SEARCH, (Decimal(0), Decimal(0))))

    def test_the_hold_must_equal_the_apps_to_the_digit(self):
        go = bridge.read_go(self.gate().go_path)
        for text in ('0.001', '0.0010', '0.001000000'):  # The same amount, as the app's nano-USD text may write it.
            with self.subTest(text=text):
                self.assertEqual(bridge.validate_request({**envelope(request()), 'reservedUsd': text}, go)[1], PRICE)
        for text in ('0.0009', '0.0011', '0.002', '0', '1', 'abc', '-0.001'):
            with self.subTest(text=text), self.refused('RESERVATION_MISMATCH'):
                bridge.validate_request({**envelope(request()), 'reservedUsd': text}, go)

    def test_row_review_refuses_a_request_price_out_of_bounds_or_a_token_price_beside_it(self):
        row = PERPLEXITY.rows[SEARCH]
        self.assertTrue(bridge.row_reviewed(PERPLEXITY, SEARCH, row))
        for bad in (row._replace(request_usd=Decimal(0)), row._replace(request_usd=Decimal('-0.001')),
                    row._replace(request_usd=Decimal('0.002')),  # Above the profile's own cap of one search.
                    row._replace(request_usd=0.001), row._replace(request_usd='0.001'),
                    row._replace(request_usd=Decimal('NaN')), row._replace(input_usd_per_m=Decimal('0.10'))):
            with self.subTest(bad=bad):
                self.assertFalse(bridge.row_reviewed(PERPLEXITY, SEARCH, bad))
        # A token row never carries a per-request price.
        deepinfra = bridge.helper.PROFILES['deepinfra']
        glm = deepinfra.rows['zai-org/GLM-5.3-Flash']
        self.assertIsNone(glm.request_usd)
        self.assertFalse(bridge.row_reviewed(deepinfra, glm.model, glm._replace(request_usd=Decimal('0.001'))))

    def test_a_go_for_perplexity_loads_only_with_its_own_row(self):
        gate = self.gate()
        self.assertEqual(bridge.read_go(gate.go_path)['enabled_models'], [SEARCH])
        for models in (['zai-org/GLM-5.3-Flash'], ['claude-haiku-5-5'], [SEARCH, SEARCH], [], ['perplexity-search']):
            with self.subTest(models=models), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(gate.write_go(name='bad.json', provider='perplexity', enabled_models=models))
        with self.refused('ROOT_GO_INVALID'):  # Perplexity has no final-writer tier.
            bridge.read_go(gate.write_go(name='fw.json', provider='perplexity', enabled_models=[SEARCH],
                                         max_final_writer_calls=1))

    def test_activate_checks_ten_searches_in_flight_against_the_pot(self):
        self.assertEqual(bridge.in_flight_worst_case(PERPLEXITY, [SEARCH], 10, 0), Decimal('0.010'))
        self.assertEqual(self.ready().status()['state'], 'active')
        gate = self.gate(daily_budget_usd='0.01', max_concurrent_calls=10)
        gate.init()
        self.assertEqual(gate.activate()['state'], 'active')  # 10 x $0.001 = $0.01 exactly.


class TeamTotalTests(PerplexityTest):
    def other_go(self, gate, provider, budget):
        path = gate.root / ('team-go-' + provider + '.json')
        path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': provider,
                                    'daily_budget_usd': budget}))
        os.chmod(path, 0o600)
        return path

    def test_the_owners_pots_twelve_four_and_one_reach_seventeen_and_one_cent_more_refuses(self):
        # Owner answers of 2026-10-30 (Q12): Perplexity $1.00 a day; the team total rises from $16.00 to $17.00.
        self.assertEqual((bridge.TEAM_TOTAL_BUDGET_USD, bridge.MAX_GO_BUDGET_USD), (Decimal('17.00'), Decimal('12.00')))
        gate = self.gate()
        gate.init()
        self.other_go(gate, 'deepinfra', '12.00')
        self.other_go(gate, 'anthropic', '4.00')
        self.assertEqual(gate.activate()['state'], 'active')  # 1.00 + 12.00 + 4.00 = 17.00 exactly.
        gate = self.gate(daily_budget_usd='1.01')
        gate.init()
        self.other_go(gate, 'deepinfra', '12.00')
        self.other_go(gate, 'anthropic', '4.00')
        with self.refused('TEAM_TOTAL_BUDGET_EXCEEDED'):  # 1.01 + 12.00 + 4.00 = 17.01.
            gate.activate()
        self.assertEqual(gate.control()['state'], 'initialized')
        # The same sum seen from the DeepInfra side: Perplexity's GO is counted there too.
        deepinfra = {'provider': 'deepinfra', 'daily_budget_usd': '12.00'}
        self.assertEqual(bridge.team_total(deepinfra, {'anthropic': str(self.other_go(gate, 'anthropic', '4.00')),
                                                       'perplexity': str(self.other_go(gate, 'perplexity', '1.01'))},
                                           os.getuid()), Decimal('17.01'))

    def test_the_gate_table_names_the_perplexity_folder_and_go(self):
        self.assertEqual(bridge.GATE_PATHS['perplexity'],
                         ('/var/lib/debateai-v3-preview/provider-perplexity-authority-v1',
                          '/etc/debateai-v3-preview/provider-perplexity-go-v1.json'))


class SettlementTests(PerplexityTest):
    def test_a_search_settles_at_exactly_its_price_and_counts_in_the_pot(self):
        gate = self.ready()
        reply = self.call(gate)
        self.assertEqual((reply['status'], json.loads(reply['body'])), (200, answer()))
        entry = entry_of(gate)
        self.assertEqual((entry['state'], Decimal(entry['held_usd']), Decimal(entry['reserved_usd']), entry['model'],
                          entry['maker'], entry['provider'], entry['reply_model'], entry['reserve_request_usd']),
                         ('settled', PRICE, PRICE, SEARCH, 'Perplexity', 'perplexity', SEARCH, '0.001'))
        self.assertEqual((entry['accounting']['usage_valid'], Decimal(entry['accounting']['guard_charge_usd']),
                          entry['accounting']['results']), (True, PRICE, 2))
        status = gate.status()
        self.assertEqual((Decimal(status['today_spend_usd']), status['today_posts'], status['state']),
                         (PRICE, 1, 'active'))
        self.assertEqual(status['today_by_model'], {SEARCH: {'spend_usd': '0.001', 'posts': 1}})

    def test_documented_reply_shapes_settle(self):
        for name, reply in (('no_results', answer([])), ('server_time_text', answer(server_time='2026-10-30T10:00:00Z')),
                            ('server_time_null', answer(server_time=None)),
                            ('dates_null', answer([page(1, date=None, last_updated=None)])),
                            ('dates_absent', answer([{k: v for k, v in page(1).items() if k not in ('date', 'last_updated')}])),
                            ('ten_results', answer([page(n) for n in range(10)]))):
            with self.subTest(name):
                gate = self.ready()
                self.call(gate, reply=reply)
                self.assertEqual((entry_of(gate)['state'], gate.status()['state']), ('settled', 'active'))

    def test_an_unknown_reply_field_halts_with_the_hold_kept_and_the_outline_names_it(self):
        # As Anthropic's usage.speed did on 2026-10-16: a new member may be a new way to bill.
        cases = (('top_level_usage', answer(usage={'cost': 0.001}), 'reply_unknown_field'),
                 ('top_level_cost', answer(cost='0.005'), 'reply_unknown_field'),
                 ('result_field', answer([page(1, score=0.9)]), 'result_unknown_field'),
                 ('no_id', {'results': [page(1)]}, 'reply_missing_field'),
                 ('no_results', {'id': 'x'}, 'reply_missing_field'),
                 ('results_not_a_list', answer({'a': page(1)}), 'results_invalid'),
                 ('nested_list', answer([[page(1)]]), 'result_invalid'),
                 ('title_missing', answer([{k: v for k, v in page(1).items() if k != 'title'}]), 'result_invalid'),
                 ('url_number', answer([page(1, url=5)]), 'result_invalid'),
                 ('date_number', answer([page(1, date=20260901)]), 'result_invalid'),
                 ('server_time_number', answer(server_time=5), 'reply_invalid'),
                 ('id_number', answer(id=5), 'reply_invalid'),
                 ('eleven_results', answer([page(n) for n in range(11)]), 'results_invalid'),
                 ('not_json', {'_invalid_json': True}, 'reply_unknown_field'))
        for name, reply, reason in cases:
            with self.subTest(name):
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply=reply)
                self.assert_uncertain_halt(gate)
                accounting = entry_of(gate)['accounting']
                self.assertEqual((accounting['usage_valid'], accounting['invalid_reason']), (False, reason))
                self.assertNotIn('Made-up page text', json.dumps(accounting))  # Names and kinds only, never text.

    def test_the_outline_holds_field_names_and_kinds_only(self):
        outline = bridge.helper.search_outline(answer([page(1, score=0.9, url='https://example.org/secret?q=1')],
                                                      usage={'cost': 1}))
        self.assertEqual(outline, {'reply': ['id:string', 'results:array', 'usage:object'],
                                   'result': ['date:string', 'last_updated:string', 'score:number', 'snippet:string',
                                              'title:string', 'url:string']})
        self.assertNotIn('example.org', json.dumps(outline))
        self.assertEqual(bridge.helper.search_outline([1]), {'reply_kind': 'array'})

    def test_a_non_200_reply_with_results_settles_and_halts(self):
        gate = self.ready()
        with self.refused('SETTLED_INTO_HALT'):
            self.call(gate, status=201)
        self.assertEqual((entry_of(gate)['state'], gate.status()['reason']), ('settled', 'provider_error_or_model_identity'))


class RefusalTests(PerplexityTest):
    BUSY = {'error': {'message': 'Request rate limit exceeded.', 'type': 'request_rate_limit_exceeded', 'code': 429}}
    TOKENS = {'error': {'message': 'Token rate limit exceeded (TPM).', 'type': 'token_rate_limit_exceeded', 'code': 429}}
    OVERLOADED = {'error': {'message': 'Overloaded.', 'type': 'overloaded', 'code': 429}}
    INVALID = {'error': {'message': 'Invalid request.', 'type': 'invalid_request', 'code': 400}}
    VALIDATION = {'detail': [{'loc': ['body', 'max_results'], 'msg': 'too large', 'type': 'value_error'}]}

    def test_a_429_rate_limit_costs_nothing_and_cools_the_search_off(self):
        for reply in (self.BUSY, self.TOKENS, self.OVERLOADED):
            with self.subTest(reply['error']['type']):
                self.assertTrue(PERPLEXITY.unbilled_refusal(429, reply))
                self.assertTrue(PERPLEXITY.busy_refusal(429, reply))
                gate = self.ready()
                with self.refused('PROVIDER_REFUSED_UNBILLED'):
                    self.call(gate, reply=reply, status=429)
                status = gate.status()
                self.assertEqual((status['state'], status['today_spend_usd'], status['today_posts'],
                                  status['today_unbilled_releases'], status['unsent_streak']), ('active', '0', 0, 1, 0))
                self.assertEqual([(e['state'], e['held_usd'], e['http_status']) for e in gate.day(DAY)['entries'].values()],
                                 [('released_unbilled', '0', 429)])
        gate = self.ready()
        for n in (1, 2):
            with self.refused('PROVIDER_REFUSED_UNBILLED'):
                self.call(gate, 'op-%d' % n, reply=self.BUSY, status=429)
        with self.assertRaises(bridge.ModelCooling):  # Two busy refusals: the search cools off, nothing reserved.
            self.call(gate, 'op-3')
        self.assertNotIn('preview-test:' + SCOPE + ':op-3', gate.day(DAY)['entries'])

    def test_400_and_422_cost_nothing_and_never_cool_the_search(self):
        for status, reply in ((400, self.INVALID), (422, self.VALIDATION)):
            with self.subTest(status=status):
                self.assertTrue(PERPLEXITY.unbilled_refusal(status, reply))
                self.assertFalse(PERPLEXITY.busy_refusal(status, reply))
                gate = self.ready()
                with self.refused('PROVIDER_ERROR_UNBILLED'):
                    self.call(gate, reply=reply, status=status)
                now = gate.status()
                self.assertEqual((now['state'], now['today_spend_usd'], now['today_posts'], now['unsent_streak'],
                                  now['cooling']), ('active', '0', 0, 1, {}))

    def test_five_not_busy_refusals_in_a_row_halt_provider_unreachable(self):
        gate = self.ready()
        for n in range(5):
            with self.refused('PROVIDER_ERROR_UNBILLED'):
                self.call(gate, 'op-%d' % n, reply=self.VALIDATION, status=422)
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'provider_unreachable'))

    def test_a_refusal_that_carries_anything_billable_or_an_unknown_shape_is_not_unbilled(self):
        for status, reply in ((429, {**self.BUSY, 'results': []}), (429, {**self.BUSY, 'id': 'x'}),
                              (429, {'error': {'message': 'x'}, 'usage': {}}), (429, {'error': 'text only'}),
                              (429, {'error': self.BUSY['error'], 'detail': []}), (422, {'detail': 'text'}),
                              (422, {**self.VALIDATION, 'cost': 1}), (400, {**self.INVALID, 'tokens_used': 1}),
                              (401, {'error': {'message': 'bad key', 'type': 'authentication_error'}}),
                              (402, self.INVALID), (403, self.INVALID), (404, self.INVALID), (200, self.BUSY)):
            with self.subTest(status=status, reply=reply):
                self.assertFalse(PERPLEXITY.unbilled_refusal(status, reply))

    def test_key_billing_and_other_client_errors_halt_with_the_hold_kept(self):
        for status in (401, 402, 403, 404):
            with self.subTest(status=status):
                gate = self.ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    self.call(gate, reply={'error': {'message': 'synthetic', 'type': 'x', 'code': status}}, status=status)
                self.assert_uncertain_halt(gate)

    def test_a_server_error_without_results_is_booked_at_its_price_and_the_gate_stays_active(self):
        for status in (500, 502, 503, 504):
            with self.subTest(status=status):
                gate = self.ready()
                with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
                    self.call(gate, reply={'error': {'message': 'synthetic'}}, status=status)
                entry = entry_of(gate)
                self.assertEqual((entry['state'], Decimal(entry['held_usd']), entry['reason']),
                                 ('settled_reserved_max', PRICE, 'vendor_server_error'))
                self.assertEqual((gate.status()['state'], gate.status()['today_booked_max']), ('active', 1))
        self.assertFalse(PERPLEXITY.bookable_server_error(500, answer()))  # A server error WITH results: accounted, halts.
        gate = self.ready()
        with self.refused('SETTLED_INTO_HALT'):
            self.call(gate, reply=answer(), status=500)

    def test_a_connection_failure_after_the_send_is_booked_and_a_failed_connect_is_unsent(self):
        gate = self.ready()

        def cut(_raw, _key):
            raise TimeoutError('synthetic')
        with self.refused('PROVIDER_CHARGE_BOOKED_MAX'):
            self.call(gate, dispatch=cut)
        self.assertEqual((entry_of(gate)['state'], gate.status()['state']), ('settled_reserved_max', 'active'))

        def unsent(_raw, _key):
            raise bridge.helper.RequestNotSent('request_not_sent')
        with self.refused('PROVIDER_NOT_REACHED'):
            self.call(gate, 'op-2', dispatch=unsent)
        self.assertNotIn('preview-test:' + SCOPE + ':op-2', gate.day(DAY)['entries'])


class PotTests(PerplexityTest):
    def test_the_daily_pot_refuses_the_search_that_would_pass_it(self):
        gate = self.ready(daily_budget_usd='0.01', max_concurrent_calls=1)
        for n in range(10):
            self.call(gate, 'op-%d' % n)
        self.assertEqual(Decimal(gate.status()['today_spend_usd']), Decimal('0.010'))
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            self.call(gate, 'op-10')

    def test_the_daily_search_limit_refuses_the_next_search(self):
        gate = self.ready(max_paid_posts_per_day=3)
        for n in range(3):
            self.call(gate, 'op-%d' % n)
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            self.call(gate, 'op-3')
        self.assertEqual(gate.status()['today_posts'], 3)

    def test_remaining_answers_for_the_perplexity_pot(self):
        gate = self.ready()
        self.call(gate)
        report = bridge.remaining_report(gate.private, gate.go_path, {'scope_id': SCOPE}, slots=gate.slots, now=gate.clock)
        self.assertEqual(report, {'state': 'active', 'window_open': True, 'remaining_usd': '0.999', 'remaining_calls': 999,
                                  'max_concurrent_calls': 10, 'largest_reservation_usd': '0.001',
                                  'enabled_models': [SEARCH]})


class RequestShapeTests(PerplexityTest):
    def test_every_documented_member_the_app_may_send_is_accepted(self):
        go = bridge.read_go(self.gate().go_path)
        for value in (request(), request(max_results=1), request(max_results=5), request(max_tokens_per_page=1),
                      request(max_tokens_per_page=32768), request(max_tokens=327680), request(max_tokens=1),
                      request(search_after_date_filter='10/30/2025'), request(search_after_date_filter='02/29/2024'),
                      request(country='RO', search_language_filter=['ro']), request(country='DE'),
                      request(search_language_filter=['en']), request(query='a' * 500), request(query='salariu net asistentă Cluj')):
            with self.subTest(value=value):
                outgoing, reserved, row, _ = bridge.validate_request(envelope(value), go)
                self.assertEqual((json.loads(outgoing), reserved, row.model), (value, PRICE, SEARCH))

    def test_every_other_member_or_value_is_refused_before_any_reservation(self):
        go = bridge.read_go(self.gate().go_path)
        bad = [without('query'), without('max_results'), without('max_tokens_per_page'), without('max_tokens'),
               without('search_type'), request(search_type='web'), request(search_type='people'), request(search_type=None),
               request(model=SEARCH), request(model='sonar'), request(stream=True), request(search_mode='web'),
               request(search_domain_filter=['example.org']), request(search_recency_filter='year'),
               request(search_before_date_filter='01/01/2026'), request(last_updated_after_filter='01/01/2026'),
               request(query=['a', 'b']), request(query=''), request(query='   '), request(query='a' * 501), request(query=5),
               request(max_results=0), request(max_results=11), request(max_results=20), request(max_results=True),
               request(max_results=5.0), request(max_results='5'), request(max_tokens_per_page=0),
               request(max_tokens_per_page=32769), request(max_tokens=0), request(max_tokens=327681),
               request(search_after_date_filter='2025-10-30'), request(search_after_date_filter='13/01/2025'),
               request(search_after_date_filter='02/30/2025'), request(search_after_date_filter='10/30/25'),
               request(search_after_date_filter=None), request(country='ro'), request(country='ROU'), request(country=''),
               request(search_language_filter='ro'), request(search_language_filter=[]),
               request(search_language_filter=['ro', 'en']), request(search_language_filter=['RO']),
               request(search_language_filter=['ron']), []]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(SafetyError) as refused:
                bridge.validate_request(envelope(value), go)
            self.assertIn(str(refused.exception), ('REQUEST_PARAMETERS_INVALID', 'MODEL_NOT_ALLOWED'))

    def test_a_request_over_the_size_cap_is_refused(self):
        go = bridge.read_go(self.gate().go_path)
        raw = json.dumps(request()) + ' ' * PERPLEXITY.max_request_bytes
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.validate_request({'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                                     'requestSha256': hashlib.sha256(raw.encode()).hexdigest(), 'reservedUsd': '0.001'}, go)

    def test_a_final_writer_request_is_refused(self):
        go = bridge.read_go(self.gate().go_path)
        with self.refused('PREVIEW_CALL_TIER_INVALID'):
            bridge.validate_request({**envelope(request()), 'callTier': 'FINAL_WRITER'}, go)

    def test_a_refused_shape_reserves_nothing_and_reads_no_key(self):
        gate = self.ready()
        read = []
        with self.refused('REQUEST_PARAMETERS_INVALID'):
            self.call(gate, value=request(search_type='web'), key_loader=lambda _p: read.append(1) or KEY)
        self.assertEqual((read, gate.day(DAY)), ([], None))


class KeyAndTransportTests(PerplexityTest):
    def test_only_a_pplx_key_is_sent_and_the_other_gates_refuse_one(self):
        self.assertTrue(re.fullmatch(PERPLEXITY.key_pattern, KEY))
        for other in (SYNTHETIC_DEEPINFRA_KEY, 'sk-' + 'ant-api03-' + 'x' * 20, 'AIza' + 'x' * 35, 'pplx_' + 'x' * 20,
                      'pplx-' + 'x' * 10 + ' y'):
            with self.subTest(other=other):
                self.assertFalse(re.fullmatch(PERPLEXITY.key_pattern, other))
        deepinfra, anthropic = bridge.helper.PROFILES['deepinfra'], bridge.helper.PROFILES['anthropic']
        self.assertFalse(re.fullmatch(deepinfra.key_pattern, KEY))  # A Perplexity key in the DeepInfra gate is refused.
        self.assertFalse(re.fullmatch(anthropic.key_pattern, KEY))
        self.assertTrue(re.fullmatch(deepinfra.key_pattern, SYNTHETIC_DEEPINFRA_KEY))
        gate = self.ready()
        with self.refused('KEY_SHAPE_INVALID'):
            self.call(gate, key_loader=lambda _p: SYNTHETIC_DEEPINFRA_KEY)
        self.assertIsNone(gate.day(DAY))

    def test_redaction_blanks_perplexity_key_shapes(self):
        self.assertEqual(PERPLEXITY.redaction_patterns, (r'pplx-[A-Za-z0-9_-]+',))
        value = {'a': 'x ' + OTHER_SHAPE + ' y', 'b': [KEY]}
        self.assertEqual(bridge.helper.redact(value, 'unrelated-key-value', PERPLEXITY.redaction_patterns),
                         {'a': 'x [REDACTED] y', 'b': ['[REDACTED]']})

    def test_the_key_never_reaches_a_log_the_ledger_status_or_the_reply(self):
        gate = self.ready()
        reply = self.call(gate, reply=answer([page(1, snippet='leaked ' + KEY)]))
        text = reply['body'] + self.out.getvalue() + json.dumps(gate.status()) + json.dumps(gate.day(DAY))
        self.assertNotIn(KEY, text)

    def test_transport_sends_the_bearer_key_to_the_search_path_of_the_search_host(self):
        sent = []

        class Response:
            status = 200

            def __init__(self):
                self.chunks = [b'{"id": "x", "results": []}']

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
            _HTTPS(timeout=5, profile=PERPLEXITY, path=PERPLEXITY.path_for(PERPLEXITY.rows[SEARCH]))(b'{}', KEY)
        self.assertEqual(sent, ['api.perplexity.ai', ('POST', '/search', b'{}', {
            'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json'})])


class ProbeTests(PerplexityTest):
    def probe(self, gate, dispatch, **kwargs):
        options = {'dispatch': dispatch, 'key_loader': lambda _private: KEY, 'host': HOST, 'platform': 'linux', 'uid': 0,
                   'now': gate.clock, 'fence': lambda _provider: None}
        options.update(kwargs)
        return bridge.probe(gate.private, gate.go_path, SEARCH, **options)

    def test_probe_runs_the_perplexity_fence_first(self):
        gate = self.ready()
        asked, sent = [], []

        def fence(provider):
            asked.append(provider)
            raise bridge.FenceRequired(['unit'])
        with self.assertRaises(bridge.FenceRequired):
            self.probe(gate, lambda request, _k: sent.append(request) or (200, answer()), fence=fence)
        self.assertEqual((asked, sent), (['perplexity'], []))
        self.assertIsNone(gate.day(DAY))

    def test_probe_sends_one_tiny_search_and_reports_what_it_measured(self):
        gate = self.ready()
        sent = []

        def dispatch(raw, key):
            sent.append((json.loads(raw), key))
            return 200, answer([page(1)])
        summary = self.probe(gate, dispatch)
        self.assertEqual(sent, [({'query': 'European Parliament', 'max_results': 1, 'max_tokens_per_page': 256,
                                  'max_tokens': 256, 'search_type': 'fast'}, KEY)])
        self.assertEqual(PERPLEXITY.probe_body(PERPLEXITY.rows[SEARCH]), sent[0][0])
        self.assertEqual({k: summary[k] for k in ('status', 'provider', 'model', 'maker', 'http_status', 'entry_state',
                                                  'halt_reason', 'authority', 'reply_excerpt', 'results')},
                         {'status': 'probed', 'provider': 'perplexity', 'model': SEARCH, 'maker': 'Perplexity',
                          'http_status': 200, 'entry_state': 'settled', 'halt_reason': None, 'authority': 'active',
                          'reply_excerpt': 'Made-up page 1', 'results': 1})
        self.assertEqual((Decimal(summary['guard_charge_usd']), summary['usage']['usage_valid']), (PRICE, True))
        self.assertNotIn(KEY, json.dumps(summary) + self.out.getvalue())

    def test_probe_of_an_unknown_reply_field_halts_and_says_so(self):
        gate = self.ready()
        summary = self.probe(gate, lambda _r, _k: (200, answer(usage={'cost': 0.001})))
        self.assertEqual((summary['usage']['usage_valid'], summary['halt_reason'], summary['authority'], summary['results']),
                         (False, 'uncertain_charge', 'halted', None))


if __name__ == '__main__':
    unittest.main()
