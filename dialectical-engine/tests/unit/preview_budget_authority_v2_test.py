"""Team daily pot (v2) tests for the preview spending gate.

Offline only: temporary directories, fake dispatch functions, local socket pairs.
No private files, real keys, real ledgers, or upstream calls.
"""
import contextlib
import io
import json
import os
import re
import socket
import sys
import threading
import time
import types
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview_budget_authority_fixture import (  # noqa: E402
    HELPER_SOURCE, HOST, KEY, PEER, REMOVE, RESERVED, SCOPE, SOURCE, Gate, body, envelope,
    file_sha, go_document, load_bridge, provider_response)

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never build the real HTTPS transport')


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


class HelperBindingTests(GateTest):
    def test_helper_is_loaded_from_the_gate_directory_and_hash_is_bound_to_loaded_bytes(self):
        self.assertEqual(Path(bridge.HELPER_PATH), HELPER_SOURCE)
        self.assertEqual(Path(bridge.helper.__file__), HELPER_SOURCE)
        self.assertEqual(bridge.HELPER_SHA256, file_sha(HELPER_SOURCE))
        self.assertEqual(bridge.BRIDGE_SHA256, file_sha(SOURCE))

    def test_helper_contains_only_the_gate_needs(self):
        for name in ('SafetyError', 'utc_now', 'private_dir_fd', 'secure_open', 'read_key', 'decimal_amount',
                     'account_response', 'redact', 'HttpsTransport'):
            self.assertTrue(callable(getattr(bridge.helper, name)), name)
        for absent in ('build_manifest', 'run_calls', 'render_report', 'PROMPTS', 'Ledger', 'PRIVATE', 'BUDGET'):
            self.assertFalse(hasattr(bridge.helper, absent), absent)

    def test_no_machine_specific_user_paths_in_gate_or_helper(self):
        for path in (SOURCE, HELPER_SOURCE):
            self.assertNotIn('/Users/', path.read_text(), path.name)
            self.assertNotIn('/home/', path.read_text(), path.name)

    def test_cli_has_no_helper_path_flag(self):
        with patch.object(sys, 'argv', ['gate', 'status', '--private', '/nonexistent', '--helper', 'x']), \
             contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            bridge.main()


class GoValidationTests(GateTest):
    def write(self, **changes):
        gate = self.gate()
        return gate, gate.write_go(name='candidate.json', **changes)

    def test_valid_go_is_accepted_with_bounds_inclusive(self):
        for changes in ({}, {'daily_budget_usd': '0.01'}, {'daily_budget_usd': '50.00'},
                        {'max_paid_posts_per_day': 1}, {'max_paid_posts_per_day': 5000},
                        {'max_concurrent_calls': 1}, {'max_concurrent_calls': 8},
                        {'open_days': 1}, {'open_days': 31}, {'scope_id': 'a'}, {'scope_id': 'a' + 'b' * 95},
                        {'allowed_peer_uids': [0, 992, 994]}, {'predecessor_ledger_sha256': 'ab' * 32}):
            with self.subTest(changes=changes):
                _, path = self.write(**changes)
                self.assertEqual(bridge.read_go(path), go_document(**changes))

    def test_each_bound_and_field_is_refused(self):
        invalid = [
            {'schema': 'preview-provider-budget-go-v1'}, {'allow_paid_calls': False}, {'allow_paid_calls': 'true'},
            {'bridge_sha256': '0' * 64}, {'helper_sha256': '0' * 64}, {'model': 'other/model'},
            {'requested_effort': 'max'}, {'scope_id': ''}, {'scope_id': 'Upper'}, {'scope_id': '-lead'},
            {'scope_id': 'a' * 97}, {'scope_id': 7}, {'target_host': ''}, {'target_host': 'bad host'},
            {'target_host': 'h' * 129}, {'allowed_peer_uids': []}, {'allowed_peer_uids': [-1]},
            {'allowed_peer_uids': [True]}, {'allowed_peer_uids': ['994']}, {'allowed_peer_uids': 994},
            {'daily_budget_usd': '0.00'}, {'daily_budget_usd': '50.01'}, {'daily_budget_usd': '5'},
            {'daily_budget_usd': '5.001'}, {'daily_budget_usd': 5.0}, {'daily_budget_usd': '-1.00'},
            {'daily_budget_usd': 'NaN'}, {'daily_budget_usd': '1e1'}, {'max_paid_posts_per_day': 0},
            {'max_paid_posts_per_day': 5001}, {'max_paid_posts_per_day': True}, {'max_paid_posts_per_day': 2.0},
            {'max_concurrent_calls': 0}, {'max_concurrent_calls': 9}, {'max_concurrent_calls': True},
            {'open_days': 0}, {'open_days': 32}, {'open_days': '7'}, {'predecessor_ledger_sha256': 'abc'},
            {'predecessor_ledger_sha256': 'AB' * 32}, {'predecessor_ledger_sha256': None},
            {'total_budget_usd': '1.00'}, {'unknown': True}]
        for field in ('schema', 'allow_paid_calls', 'bridge_sha256', 'helper_sha256', 'model', 'requested_effort',
                      'scope_id', 'target_host', 'allowed_peer_uids', 'daily_budget_usd',
                      'max_paid_posts_per_day', 'max_concurrent_calls', 'open_days'):
            invalid.append({field: REMOVE})
        for changes in invalid:
            with self.subTest(changes=changes), self.refused('ROOT_GO_INVALID'):
                bridge.read_go(self.write(**changes)[1])

    def test_missing_unreadable_or_non_object_go(self):
        gate = self.gate()
        with self.refused('ROOT_GO_REQUIRED'):
            bridge.read_go(gate.root / 'absent.json')
        (gate.root / 'broken.json').write_text('{')
        with self.refused('ROOT_GO_REQUIRED'):
            bridge.read_go(gate.root / 'broken.json')
        (gate.root / 'list.json').write_text('[]')
        with self.refused('ROOT_GO_INVALID'):
            bridge.read_go(gate.root / 'list.json')


class PhaseTests(GateTest):
    def test_init_creates_private_owner_only_state_and_refuses_existing_state(self):
        gate = self.gate(predecessor_ledger_sha256='cd' * 32)
        result = gate.init()
        self.assertEqual(result['state'], 'initialized')
        control = gate.control()
        self.assertEqual((control['state'], control['scope_id'], control['predecessor_ledger_sha256']),
                         ('initialized', SCOPE, 'cd' * 32))
        for path in gate.private.iterdir():
            self.assertEqual(oct(path.stat().st_mode & 0o777), oct(0o600), path.name)
        with self.refused('STATE_ALREADY_EXISTS'):
            gate.init()

    def test_init_refuses_unsafe_private_directory(self):
        gate = self.gate()
        os.chmod(gate.private, 0o755)
        with self.assertRaises(SafetyError):
            gate.init()
        self.assertEqual(list(gate.private.iterdir()), [])

    def test_activate_requires_linux_exact_host_and_initialized_or_halted_state(self):
        gate = self.gate()
        with self.refused('STATE_MISSING'):
            gate.activate()
        gate.init()
        for kwargs in ({'platform': 'darwin'}, {'host': 'other-host'}):
            with self.subTest(kwargs=kwargs), self.refused('ACTIVATION_REFUSED'):
                gate.activate(**kwargs)
        self.assertEqual(gate.control()['state'], 'initialized')
        result = gate.activate()
        self.assertEqual(result['state'], 'active')
        self.assertEqual(result['open_until_utc'], '2026-10-15T09:00:00+00:00')
        with self.refused('ACTIVATION_REFUSED'):
            gate.activate()

    def test_activate_refuses_a_go_for_another_scope(self):
        gate = self.gate()
        gate.init()
        gate.go_path = gate.write_go(name='other.json', scope_id='another-scope')
        with self.refused('ACTIVATION_REFUSED'):
            gate.activate()

    def test_changed_go_is_refused_until_stop_and_reactivation_binds_it(self):
        gate = self.gate().ready()
        gate.go_path = gate.write_go(name='raised.json', daily_budget_usd='6.00')
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-before')
        bridge.stop_authority(gate.private, now=gate.clock)
        gate.activate()
        self.assertEqual(gate.call('op-after')['status'], 200)
        self.assertEqual(gate.status()['daily_budget_usd'], '6.00')

    def test_stop_halts_with_operator_stop_and_later_calls_refuse(self):
        gate = self.gate().ready()
        result = bridge.stop_authority(gate.private, now=gate.clock)
        self.assertEqual((result['state'], result['reason']), ('halted', 'operator_stop'))
        dispatched = []
        with self.refused('AUTHORITY_STOPPED'):
            gate.call(dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])

    def test_status_reports_the_team_day_and_is_read_only(self):
        gate = self.gate().ready()
        gate.call('op-1', charge='0.05')
        before = gate.snapshot()
        opened = []
        real_open = os.open

        def recording_open(path, flags, *args, **kwargs):
            opened.append((str(path), flags))
            return real_open(path, flags, *args, **kwargs)
        with patch.object(os, 'open', recording_open):
            result = gate.status()
        self.assertEqual(gate.snapshot(), before)
        for name, flags in opened:
            self.assertEqual(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC), 0, name)
        self.assertEqual(result, {
            'state': 'active', 'reason': None, 'open_until_utc': '2026-10-15T09:00:00+00:00', 'window_open': True,
            'today': '2026-10-08', 'daily_budget_usd': '5.00', 'today_spend_usd': '0.05',
            'remaining_today_usd': '4.95', 'today_posts': 1, 'max_paid_posts_per_day': 500, 'in_flight': 0})

    def test_status_of_uninitialized_directory_refuses_without_creating_files(self):
        gate = self.gate()
        with self.refused('STATE_MISSING'):
            gate.status()
        self.assertEqual(list(gate.private.iterdir()), [])

    def test_v1_ledger_is_never_opened_modified_or_required(self):
        gate = self.gate()
        legacy = gate.private / 'budget-ledger.json'
        legacy.write_text('{"schema":"deepinfra-global-dollar-ledger-v1","budget_usd":"1.00"}\n')
        (gate.private / 'budget-ledger.lock').write_text('')
        for path in gate.private.iterdir():
            os.chmod(path, 0o600)
        before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in gate.private.iterdir()}
        opened = []
        real_open = os.open

        def recording_open(path, flags, *args, **kwargs):
            opened.append(os.path.basename(str(path)))
            return real_open(path, flags, *args, **kwargs)
        with patch.object(os, 'open', recording_open):
            gate.ready()
            gate.call('op-1')
            gate.status()
            bridge.stop_authority(gate.private, now=gate.clock)
        self.assertTrue(opened)
        self.assertNotIn('budget-ledger.json', opened)
        self.assertNotIn('budget-ledger.lock', opened)
        self.assertEqual({p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in gate.private.iterdir()
                          if p.name.startswith('budget-ledger')}, before)

    def test_cli_prints_one_json_line_and_refuses_with_exit_two(self):
        gate = self.gate()
        for argv, code, expected in (
                (['init', '--private', str(gate.private), '--go', str(gate.go_path)], 0, {'state': 'initialized'}),
                (['init', '--private', str(gate.private), '--go', str(gate.go_path)], 2,
                 {'status': 'refused', 'error_class': 'SafetyError', 'error': 'STATE_ALREADY_EXISTS'}),
                (['activate', '--private', str(gate.private)], 2,
                 {'status': 'refused', 'error_class': 'SafetyError', 'error': 'ROOT_GO_REQUIRED'}),
                (['activate', '--private', str(gate.private), '--go', str(gate.go_path)], 2,
                 {'status': 'refused', 'error_class': 'SafetyError', 'error': 'ACTIVATION_REFUSED'}),
                (['stop', '--private', str(gate.private)], 0, {'state': 'halted', 'reason': 'operator_stop'}),
                (['status', '--private', str(gate.private)], 0, {'state': 'halted', 'reason': 'operator_stop'})):
            with self.subTest(argv=argv):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(bridge.main(argv), code)
                lines = out.getvalue().splitlines()
                self.assertEqual(len(lines), 1)
                result = json.loads(lines[0])
                self.assertEqual({k: result.get(k) for k in expected}, expected)


class DailyPotTests(GateTest):
    def test_exactly_at_the_daily_cap_is_allowed(self):
        gate = self.gate(daily_budget_usd='0.16').ready()
        gate.call('op-1', charge=str(Decimal('0.16') - RESERVED))
        self.assertEqual(gate.call('op-2')['status'], 200)
        self.assertEqual(gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-2']['state'], 'settled')

    def test_one_cent_over_the_daily_cap_is_refused_with_team_budget_code(self):
        gate = self.gate(daily_budget_usd='0.15').ready()
        gate.call('op-1', charge=str(Decimal('0.16') - RESERVED))
        dispatched = []
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            gate.call('op-2', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])
        self.assertEqual(len(gate.day('2026-10-08')['entries']), 1)
        self.assertEqual(gate.status()['state'], 'active')

    def test_daily_post_limit_refuses_with_its_own_code_and_resets_next_day(self):
        gate = self.gate(max_paid_posts_per_day=2).ready()
        gate.call('op-1')
        gate.call('op-2')
        with self.refused('DAILY_CALL_LIMIT_REACHED'):
            gate.call('op-3')
        self.assertEqual(gate.status()['today_posts'], 2)
        gate.clock.set('2026-10-08T21:00:00+00:00')  # 00:00 in Bucharest (UTC+3)
        self.assertEqual(gate.call('op-3')['status'], 200)

    def test_day_rolls_over_at_bucharest_midnight_not_utc_midnight(self):
        gate = self.gate(daily_budget_usd='0.10').ready()
        gate.clock.set('2026-10-08T20:59:59+00:00')  # 23:59:59 local
        gate.call('op-1', charge=str(RESERVED))
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            gate.call('op-2')
        gate.clock.set('2026-10-08T21:00:00+00:00')  # 00:00:00 local, still 2026-10-08 in UTC
        self.assertEqual(gate.status()['today'], '2026-10-09')
        self.assertEqual(gate.call('op-2')['status'], 200)
        self.assertIn('preview-test:' + SCOPE + ':op-2', gate.day('2026-10-09')['entries'])

    def test_bucharest_day_follows_daylight_saving_changes(self):
        cases = {'2026-03-28T21:59:59+00:00': '2026-03-28', '2026-03-28T22:00:00+00:00': '2026-03-29',
                 '2026-03-29T20:59:59+00:00': '2026-03-29', '2026-03-29T21:00:00+00:00': '2026-03-30',
                 '2026-10-24T20:59:59+00:00': '2026-10-24', '2026-10-24T21:00:00+00:00': '2026-10-25',
                 '2026-10-25T21:30:00+00:00': '2026-10-25', '2026-10-25T22:00:00+00:00': '2026-10-26'}
        for moment, day in cases.items():
            with self.subTest(moment=moment):
                self.assertEqual(bridge.bucharest_day(datetime.fromisoformat(moment)), day)

    def test_spring_forward_day_has_twenty_three_hours_of_team_budget(self):
        gate = self.gate(daily_budget_usd='0.10')
        gate.clock.set('2026-03-28T22:00:00+00:00')  # 00:00 on 2026-03-29, UTC+2
        gate.ready()
        gate.clock.set('2026-03-29T20:59:59+00:00')  # 23:59:59 on 2026-03-29, UTC+3
        gate.call('op-1', charge=str(RESERVED))
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            gate.call('op-2')
        gate.clock.set('2026-03-29T21:00:00+00:00')
        self.assertEqual(gate.call('op-2')['status'], 200)
        self.assertEqual(len(gate.day('2026-03-29')['entries']), 1)
        self.assertEqual(len(gate.day('2026-03-30')['entries']), 1)

    def test_reservation_counts_on_the_day_it_was_made_even_if_it_settles_after_midnight(self):
        gate = self.gate().ready()
        gate.clock.set('2026-10-08T20:59:59+00:00')

        def slow(_body, _key):
            gate.clock.set('2026-10-08T21:05:00+00:00')
            return 200, provider_response('0.07')
        gate.call('op-1', dispatch=slow)
        entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
        self.assertEqual((entry['state'], entry['held_usd']), ('settled', '0.07'))
        self.assertIsNone(gate.day('2026-10-09'))
        status = gate.status()
        self.assertEqual((status['today'], status['today_spend_usd'], status['today_posts']), ('2026-10-09', '0', 0))

    def test_pending_reservation_holds_the_full_amount_until_settled(self):
        gate = self.gate().ready()
        seen = {}

        def observe(_body, _key):
            seen.update(gate.status())
            return 200, provider_response('0.02')
        gate.call('op-1', dispatch=observe)
        self.assertEqual(Decimal(seen['today_spend_usd']), RESERVED)
        self.assertEqual(seen['in_flight'], 1)
        self.assertEqual(gate.status()['today_spend_usd'], '0.02')

    def test_duplicate_operation_peer_scope_and_host_are_refused_before_reservation(self):
        gate = self.gate().ready()
        gate.call('op-1')
        with self.refused('DUPLICATE_OPERATION'):
            gate.call('op-1')
        for kwargs in ({'peer_uid': 7}, {'host': 'other-host'}, {'platform': 'darwin'}):
            with self.subTest(kwargs=kwargs), self.refused('EXECUTION_AUTHORITY_REFUSED'):
                gate.call('op-2', **kwargs)
        with self.refused('REQUEST_SCOPE_INVALID'):
            bridge.execute_request(gate.private, gate.go_path, envelope(body(), 'op-3', scope='other-scope'),
                                   peer_uid=PEER, slots=gate.slots, key_loader=lambda _: KEY, host=HOST,
                                   platform='linux', now=gate.clock)
        self.assertEqual(len(gate.day('2026-10-08')['entries']), 1)

    def test_key_failure_refuses_before_any_reservation(self):
        gate = self.gate().ready()

        def broken(_private):
            raise SafetyError('invalid_key_file')
        with self.assertRaises(SafetyError):
            gate.call('op-1', key_loader=broken)
        self.assertIsNone(gate.day('2026-10-08'))
        self.assertEqual(gate.status()['state'], 'active')

    def test_day_ledger_has_a_size_limit_and_all_files_stay_owner_only(self):
        gate = self.gate().ready()
        gate.call('op-1')
        with patch.object(bridge, 'DAY_LEDGER_RESERVE_BYTES', 10):
            with self.refused('DAY_LEDGER_FULL'):
                gate.call('op-2')
        self.assertEqual(gate.control()['in_flight'], {})
        self.assertEqual(oct(gate.private.stat().st_mode & 0o777), oct(0o700))
        for path in gate.private.iterdir():
            self.assertEqual(oct(path.stat().st_mode & 0o777), oct(0o600), path.name)

    def test_window_expiry_halts_with_open_window_expired(self):
        gate = self.gate(open_days=1).ready()
        gate.clock.set('2026-10-09T08:59:59+00:00')
        self.assertEqual(gate.call('op-1')['status'], 200)
        gate.clock.set('2026-10-09T09:00:00+00:00')
        self.assertFalse(gate.status()['window_open'])
        with self.refused('AUTHORITY_EXPIRED'):
            gate.call('op-2')
        self.assertEqual((gate.status()['state'], gate.status()['reason']), ('halted', 'open_window_expired'))
        self.assertEqual(gate.activate()['open_until_utc'], '2026-10-10T09:00:00+00:00')

    def test_successful_call_redacts_key_and_logs_no_request_or_response_bytes(self):
        gate = self.gate().ready()
        secret_answer = 'synthetic answer text ' + KEY
        result = gate.call('op-1', dispatch=lambda _b, _k: (200, provider_response('0.01', content=secret_answer)))
        self.assertNotIn(KEY, result['body'])
        self.assertIn('[REDACTED]', result['body'])
        log = self.out.getvalue()
        self.assertIn('preview_provider_paid_post', log)
        for leaked in (KEY, 'synthetic answer text', 'Offline synthetic test'):
            self.assertNotIn(leaked, log)

    def test_default_transport_gets_the_remaining_six_hundred_second_deadline(self):
        gate = self.gate().ready()
        seen = []

        class Recorder:
            def __init__(self, timeout):
                seen.append(timeout)

            def __call__(self, _body, _key):
                return 200, provider_response('0.01')
        with patch.object(bridge.helper, 'HttpsTransport', Recorder):
            bridge.execute_request(gate.private, gate.go_path, envelope(body(), 'op-1'), peer_uid=PEER,
                                   slots=gate.slots, key_loader=lambda _: KEY, host=HOST, platform='linux',
                                   now=gate.clock)
        self.assertEqual(len(seen), 1)
        self.assertTrue(590 < seen[0] <= 600, seen)


class HaltTests(GateTest):
    def assert_halted(self, gate, reason, entry_state):
        status = gate.status()
        self.assertEqual((status['state'], status['reason']), ('halted', reason))
        self.assertEqual(status['in_flight'], 0)
        entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
        self.assertEqual(entry['state'], entry_state)
        dispatched = []
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-later', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])
        return entry

    def test_transport_failure_after_dispatch_holds_full_reservation_and_halts(self):
        gate = self.gate().ready()

        def broken(_body, _key):
            raise OSError('synthetic transport failure ' + KEY)
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=broken)
        entry = self.assert_halted(gate, 'uncertain_charge', 'uncertain')
        self.assertEqual(Decimal(entry['held_usd']), RESERVED)
        self.assertNotIn(KEY, json.dumps(gate.day('2026-10-08')))

    def test_missing_usage_and_cost_holds_full_reservation_and_halts(self):
        gate = self.gate().ready()
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', charge=None)
        entry = self.assert_halted(gate, 'uncertain_charge', 'uncertain')
        self.assertEqual(Decimal(entry['held_usd']), RESERVED)

    def test_unexpected_failure_after_a_paid_reply_holds_full_reservation_and_halts(self):
        gate = self.gate().ready()

        def broken_accounting(_response):
            raise RuntimeError('synthetic accounting failure')
        with patch.object(bridge.helper, 'account_response', broken_accounting), self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1')
        entry = self.assert_halted(gate, 'uncertain_charge', 'uncertain')
        self.assertEqual((Decimal(entry['held_usd']), entry['reason']), (RESERVED, 'accounting_failure'))

    def test_charge_above_reservation_is_recorded_and_halts(self):
        gate = self.gate().ready()
        over = str(RESERVED + Decimal('0.000000001'))
        with self.refused('AUTHORITY_HALTED'):
            gate.call('op-1', charge=over)
        entry = self.assert_halted(gate, 'charge_overrun', 'settled')
        self.assertEqual((entry['held_usd'], entry['overrun_usd']), (over, '1E-9'))

    def test_non_200_and_other_model_are_settled_and_halt(self):
        for kwargs in ({'status': 500}, {'status': 429}, {'model': 'other/model'}, {'model': None}):
            with self.subTest(kwargs=kwargs):
                gate = self.gate().ready()
                with self.refused('AUTHORITY_HALTED'):
                    gate.call('op-1', charge='0.02', **kwargs)
                entry = self.assert_halted(gate, 'provider_error_or_model_identity', 'settled')
                self.assertEqual(entry['held_usd'], '0.02')

    def test_reactivation_after_halt_keeps_history_and_uncertain_amount_counts_on_its_own_day(self):
        gate = self.gate(daily_budget_usd='0.10').ready()

        def broken(_body, _key):
            raise TimeoutError('deadline')
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=broken)
        gate.activate()
        with self.refused('TEAM_DAILY_BUDGET_REACHED'):
            gate.call('op-2')
        self.assertEqual(gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']['state'], 'uncertain')
        gate.clock.set('2026-10-08T21:00:00+00:00')
        self.assertEqual(gate.call('op-2')['status'], 200)

    def test_interrupted_reservation_found_at_serve_start_becomes_uncertain_and_halts(self):
        gate = self.gate().ready()
        go = bridge.read_go(gate.go_path)
        request = envelope(body(), 'op-1')
        _, reserved = bridge.validate_request(request, go)
        bridge.reserve_call(gate.private, go, file_sha(gate.go_path), request, reserved, HOST, PEER, gate.clock)
        self.assertEqual(gate.status()['in_flight'], 1)
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 1})
        self.assert_halted(gate, 'interrupted_call_uncertain', 'uncertain')

    def test_clean_serve_start_recovers_nothing_and_stays_active(self):
        gate = self.gate().ready()
        gate.call('op-1')
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0})
        self.assertEqual(gate.status()['state'], 'active')

    def test_serve_refuses_without_root_linux_exact_host_and_fresh_run_socket(self):
        gate = self.gate().ready()
        good = {'platform': 'linux', 'uid': 0, 'host': HOST}
        existing = gate.root / 'existing.sock'
        existing.write_text('')
        for changes, path in (({'platform': 'darwin'}, '/run/debateai-v3-preview/budget.sock'),
                              ({'uid': 994}, '/run/debateai-v3-preview/budget.sock'),
                              ({'host': 'other-host'}, '/run/debateai-v3-preview/budget.sock'),
                              ({}, '/tmp/budget.sock'), ({}, '/run/debateai-v3-preview/Budget.sock'),
                              ({}, '/run/debateai-v3-preview/../budget.sock')):
            with self.subTest(changes=changes, path=path), self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
                bridge.serve(gate.private, gate.go_path, path, **{**good, **changes})
        with patch.object(bridge, 'SOCKET_PATTERN', re.compile(re.escape(str(existing)))), \
                self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
            bridge.serve(gate.private, gate.go_path, existing, **good)
        self.assertFalse((gate.private / 'team-serve.lock').exists())

    def test_only_one_server_may_hold_the_authority(self):
        gate = self.gate().ready()
        first = bridge.hold_serve_lock(gate.private)
        try:
            with self.refused('SERVE_ALREADY_RUNNING'):
                bridge.hold_serve_lock(gate.private)
        finally:
            os.close(first)
        os.close(bridge.hold_serve_lock(gate.private))


class ConcurrencyTests(GateTest):
    def start(self, gate, operation_id, dispatch, results, **kwargs):
        def run():
            try:
                results[operation_id] = gate.call(operation_id, dispatch=dispatch, **kwargs)
            except BaseException as error:  # noqa: BLE001 - recorded for assertions
                results[operation_id] = error
        thread = threading.Thread(target=run)
        thread.start()
        return thread

    def test_four_calls_dispatch_in_parallel_without_the_ledger_lock_and_a_fifth_is_refused(self):
        gate = self.gate().ready()
        entered, release, results = threading.Semaphore(0), threading.Event(), {}

        def blocking(_body, _key):
            entered.release()
            if not release.wait(5):
                raise AssertionError('never released')
            return 200, provider_response('0.01')
        threads = [self.start(gate, 'op-%d' % n, blocking, results) for n in range(4)]
        try:
            for _ in range(4):
                self.assertTrue(entered.acquire(timeout=3), 'four dispatches must be in flight at once')
            with bridge.TeamStore(gate.private, lock_timeout=0.5):
                pass  # The exclusive ledger lock is free while all four upstream calls are running.
            self.assertEqual(gate.status()['in_flight'], 4)
            fifth = []
            started = time.monotonic()
            with self.refused('CONCURRENCY_LIMIT_REACHED'):
                gate.call('op-5', dispatch=lambda *args: fifth.append(args), slot_wait=0.3)
            self.assertGreaterEqual(time.monotonic() - started, 0.3)
            self.assertEqual(fifth, [])
        finally:
            release.set()
            for thread in threads:
                thread.join(5)
        self.assertEqual({k: v['status'] for k, v in results.items()}, {'op-%d' % n: 200 for n in range(4)})
        status = gate.status()
        self.assertEqual((status['in_flight'], status['today_posts'], status['today_spend_usd']), (0, 4, '0.04'))

    def test_waiting_call_proceeds_when_a_slot_frees_within_the_wait(self):
        gate = self.gate(max_concurrent_calls=1).ready()
        entered, release, results = threading.Event(), threading.Event(), {}

        def blocking(_body, _key):
            entered.set()
            release.wait(5)
            return 200, provider_response('0.01')
        thread = self.start(gate, 'op-1', blocking, results)
        self.assertTrue(entered.wait(3))
        threading.Timer(0.1, release.set).start()
        self.assertEqual(gate.call('op-2', slot_wait=3)['status'], 200)
        thread.join(5)
        self.assertEqual(results['op-1']['status'], 200)

    def test_slot_count_must_match_the_bound_go(self):
        gate = self.gate().ready()
        with self.refused('SERVE_RESTART_REQUIRED'):
            gate.call('op-1', slots=bridge.CallSlots(8))

    def test_halt_stops_new_calls_while_in_flight_calls_finish_and_settle(self):
        gate = self.gate().ready()
        entered, release, results = threading.Event(), threading.Event(), {}

        def blocking(_body, _key):
            entered.set()
            release.wait(5)
            return 200, provider_response('0.03')
        thread = self.start(gate, 'op-1', blocking, results)
        try:
            self.assertTrue(entered.wait(3))

            def broken(_body, _key):
                raise ConnectionResetError('synthetic')
            with self.refused('NEW_CHARGE_UNCERTAIN'):
                gate.call('op-2', dispatch=broken)
            with self.refused('AUTHORITY_STOPPED'):
                gate.call('op-3')
        finally:
            release.set()
            thread.join(5)
        self.assertEqual(results['op-1']['status'], 200)
        entries = gate.day('2026-10-08')['entries']
        self.assertEqual({k.rsplit(':', 1)[1]: (v['state'], v['held_usd']) for k, v in entries.items()},
                         {'op-1': ('settled', '0.03'), 'op-2': ('uncertain', str(RESERVED))})
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], status['in_flight']), ('halted', 'uncertain_charge', 0))


class IpcTests(GateTest):
    def exchange(self, gate, dispatch, path='/complete', uid=PEER, payload=None, after_send=None):
        server_side, client_side = socket.socketpair()
        data = json.dumps(payload if payload is not None else envelope(body(), 'op-1')).encode()
        client_side.sendall(b'POST ' + path.encode() + b' HTTP/1.0\r\nContent-Type: application/json\r\n'
                            b'Content-Length: ' + str(len(data)).encode() + b'\r\n\r\n' + data)
        if after_send:
            after_send(client_side)

        def execute(request, peer_uid, cancelled):
            return bridge.execute_request(gate.private, gate.go_path, request, peer_uid=peer_uid, slots=gate.slots,
                                          dispatch=dispatch(client_side), key_loader=lambda _: KEY, host=HOST,
                                          platform='linux', now=gate.clock, cancelled=cancelled)
        handler = bridge.make_handler(gate.private, [PEER], execute, peer_uid_of=lambda _connection: uid,
                                      now=gate.clock)
        thread = threading.Thread(target=handler, args=(server_side, '', types.SimpleNamespace()))
        thread.start()
        thread.join(10)
        server_side.close()
        chunks = []
        try:
            while True:
                chunk = client_side.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
        except OSError:
            pass
        client_side.close()
        raw = b''.join(chunks)
        head, _, payload_bytes = raw.partition(b'\r\n\r\n')
        return head.split(b'\r\n')[0] if head else b'', payload_bytes

    def ok(self, _client):
        return lambda _body, _key: (200, provider_response('0.01'))

    def test_settled_call_is_delivered(self):
        gate = self.gate().ready()
        line, payload = self.exchange(gate, self.ok)
        self.assertIn(b' 200 ', line)
        self.assertEqual(json.loads(payload)['status'], 200)

    def test_budget_and_limit_refusals_reach_the_409_body_with_their_own_code(self):
        gate = self.gate(daily_budget_usd='0.01').ready()
        line, payload = self.exchange(gate, self.ok)
        self.assertIn(b' 409 ', line)
        self.assertEqual(json.loads(payload), {'error': 'TEAM_DAILY_BUDGET_REACHED'})
        self.assertEqual(gate.status()['state'], 'active')

    def test_refusal_body_maps_only_the_three_team_codes(self):
        for code in ('TEAM_DAILY_BUDGET_REACHED', 'DAILY_CALL_LIMIT_REACHED', 'CONCURRENCY_LIMIT_REACHED'):
            self.assertEqual(json.loads(bridge.refusal_body(SafetyError(code))), {'error': code})
        for error in (SafetyError('AUTHORITY_STOPPED'), SafetyError('NEW_CHARGE_UNCERTAIN'),
                      ValueError('TEAM_DAILY_BUDGET_REACHED'), KeyboardInterrupt()):
            self.assertEqual(json.loads(bridge.refusal_body(error)), {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})

    def test_wrong_path_or_peer_is_refused_without_execution(self):
        gate = self.gate().ready()
        for kwargs in ({'path': '/other'}, {'uid': 7}):
            with self.subTest(kwargs=kwargs):
                line, payload = self.exchange(gate, lambda _c: no_network, **kwargs)
                self.assertIn(b' 409 ', line)
                self.assertEqual(json.loads(payload), {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})
        self.assertIsNone(gate.day('2026-10-08'))
        self.assertEqual(gate.status()['state'], 'active')

    def test_caller_cancel_before_dispatch_reserves_nothing(self):
        gate = self.gate().ready()
        line, payload = self.exchange(gate, lambda _c: no_network, after_send=lambda c: c.shutdown(socket.SHUT_WR))
        self.assertEqual(json.loads(payload), {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'})
        self.assertIsNone(gate.day('2026-10-08'))
        self.assertEqual(gate.status()['state'], 'active')

    def test_lost_reply_after_a_settled_paid_call_halts(self):
        gate = self.gate().ready()

        def vanish(client):
            def dispatch(_body, _key):
                client.close()
                return 200, provider_response('0.01')
            return dispatch
        self.exchange(gate, vanish)
        status = gate.status()
        self.assertEqual((status['state'], status['reason']), ('halted', 'ipc_or_delivery_failure'))
        entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
        self.assertEqual((entry['state'], entry['held_usd']), ('settled', '0.01'))


if __name__ == '__main__':
    unittest.main()
