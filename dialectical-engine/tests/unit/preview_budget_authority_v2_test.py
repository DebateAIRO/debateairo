"""Team daily pot tests for the preview spending gate: every v2 behaviour, run on the v3 gate.

Offline only: temporary directories, fake dispatch functions, local socket pairs.
No private files, real keys, real ledgers, or upstream calls. The v3 model table has its own
file (preview_budget_authority_v3_test.py). v3 changes seen here: the GO names a provider and
its enabled models; activate refuses max_concurrent_calls x the largest enabled worst case
(GLM: $0.1215488) above the pot, so the small-pot tests run with one slot.
"""
import contextlib
import hashlib
import io
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
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
    HELPER_SOURCE, HOST, KEY, MODEL, PEER, REMOVE, RESERVED, SCOPE, SOURCE, Gate, body, custody_copy, envelope,
    file_sha, go_document, load_bridge, load_bridge_copy, provider_response)

bridge = load_bridge()
SafetyError = bridge.helper.SafetyError
DEEPINFRA = bridge.helper.PROFILES['deepinfra']
_HTTPS = bridge.helper.HttpsTransport  # Kept before setUp swaps in no_network.


def REAL_TRANSPORT(timeout):  # noqa: N802 - the real transport class, bound to the DeepInfra profile
    return _HTTPS(timeout=timeout, profile=DEEPINFRA)


def file_sha_text(text):
    return hashlib.sha256(text.encode()).hexdigest()


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


class HelperCustodyTests(GateTest):
    def copy(self):
        root = Path(tempfile.mkdtemp(prefix='preview-custody-'))
        self.addCleanup(shutil.rmtree, root, True)
        marker = root / 'helper-ran'
        suffix = ('\nimport pathlib as _marker\n_marker.Path(%r).write_text("ran")\n' % str(marker)).encode()
        ops, gate_copy, helper_copy = custody_copy(root, suffix)
        return root, ops, gate_copy, helper_copy, marker

    def run_main(self, module, argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = module.main(argv)
        return code, json.loads(out.getvalue().splitlines()[-1])

    def go_for(self, root, gate_copy, helper_bytes):
        path = root / 'go.json'
        path.write_text(json.dumps(go_document(bridge_sha256=file_sha(gate_copy),
                                               helper_sha256=hashlib.sha256(helper_bytes).hexdigest())))
        return path

    @staticmethod
    def symlinked_helper(root, ops, gate_copy, helper_copy):
        target = root / 'elsewhere.py'
        target.write_bytes(helper_copy.read_bytes())
        helper_copy.unlink()
        helper_copy.symlink_to(target)

    UNSAFE = {
        'directory_group_writable': lambda root, ops, gate_copy, helper_copy: os.chmod(ops, 0o775),
        'directory_other_writable': lambda root, ops, gate_copy, helper_copy: os.chmod(ops, 0o757),
        'helper_group_writable': lambda root, ops, gate_copy, helper_copy: os.chmod(helper_copy, 0o664),
        'helper_other_writable': lambda root, ops, gate_copy, helper_copy: os.chmod(helper_copy, 0o646),
        'gate_group_writable': lambda root, ops, gate_copy, helper_copy: os.chmod(gate_copy, 0o664),
        'helper_is_a_symlink': symlinked_helper.__func__,
    }

    def test_every_phase_checks_custody_before_any_helper_code_runs(self):
        for name, spoil in self.UNSAFE.items():
            for phase in ('status', 'stop', 'init', 'activate'):
                with self.subTest(unsafe=name, phase=phase):
                    root, ops, gate_copy, helper_copy, marker = self.copy()
                    helper_bytes = helper_copy.read_bytes()
                    spoil(root, ops, gate_copy, helper_copy)
                    copied = load_bridge_copy(gate_copy)
                    self.assertFalse(marker.exists(), 'importing the gate ran helper code')
                    argv = [phase, '--private', str(root / 'private')]
                    if phase in ('init', 'activate'):
                        argv += ['--go', str(self.go_for(root, gate_copy, helper_bytes))]
                    self.assertEqual(self.run_main(copied, argv), (2, {'status': 'refused', 'error_class': 'SafetyError',
                                                                       'error': 'HELPER_CUSTODY_INVALID'}))
                    self.assertFalse(marker.exists())

    def test_main_refuses_a_helper_that_root_does_not_own(self):
        if os.getuid() == 0:
            self.skipTest('needs a non-root owner')
        root, _ops, gate_copy, _helper_copy, marker = self.copy()
        copied = load_bridge_copy(gate_copy)
        code, result = self.run_main(copied, ['status', '--private', str(root / 'private')])
        self.assertEqual((code, result.get('error')), (2, 'HELPER_CUSTODY_INVALID'))
        self.assertFalse(marker.exists())

    def test_custody_check_returns_the_helper_bytes_only_when_every_path_is_safe(self):
        root, ops, gate_copy, helper_copy, marker = self.copy()
        copied = load_bridge_copy(gate_copy)
        self.assertEqual(copied.read_helper_in_custody(owner_uid=os.getuid()), helper_copy.read_bytes())
        with self.assertRaisesRegex(copied.SafetyError, '^HELPER_CUSTODY_INVALID$'):
            copied.read_helper_in_custody(owner_uid=os.getuid() + 1)
        for name, spoil in list(self.UNSAFE.items()) + [('helper_missing', lambda r, o, g, h: h.unlink())]:
            with self.subTest(unsafe=name):
                root, ops, gate_copy, helper_copy, marker = self.copy()
                copied = load_bridge_copy(gate_copy)
                spoil(root, ops, gate_copy, helper_copy)
                with self.assertRaisesRegex(copied.SafetyError, '^HELPER_CUSTODY_INVALID$'):
                    copied.read_helper_in_custody(owner_uid=os.getuid())
        self.assertFalse(marker.exists())

    def test_go_bound_helper_hash_is_checked_before_the_helper_runs(self):
        root, _ops, gate_copy, helper_copy, marker = self.copy()
        copied = load_bridge_copy(gate_copy)
        reviewed = root / 'go.json'
        reviewed.write_text(json.dumps(go_document()))  # Binds the reviewed helper, not this altered copy.
        with patch.object(copied, 'read_helper_in_custody', lambda owner_uid=0: helper_copy.read_bytes()):
            result = self.run_main(copied, ['init', '--private', str(root / 'private'), '--go', str(reviewed)])
        self.assertEqual(result, (2, {'status': 'refused', 'error_class': 'SafetyError', 'error': 'ROOT_GO_INVALID'}))
        self.assertFalse(marker.exists())
        self.assertIsNone(copied.helper)
        copied.load_helper(expected_sha256=file_sha(helper_copy), skip_custody_for_tests=True)
        self.assertTrue(marker.exists())
        self.assertEqual(copied.HELPER_SHA256, file_sha(helper_copy))
        self.assertIs(copied.helper.SafetyError, copied.SafetyError)


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
        for field in ('schema', 'allow_paid_calls', 'bridge_sha256', 'helper_sha256', 'provider', 'enabled_models',
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
            'state': 'active', 'reason': None, 'halted_at': None, 'unsent_streak': 0,
            'provider': 'deepinfra', 'enabled_models': [MODEL],
            'today_by_model': {MODEL: {'spend_usd': '0.05', 'posts': 1}},
            'open_until_utc': '2026-10-15T09:00:00+00:00', 'window_open': True,
            'today': '2026-10-08', 'daily_budget_usd': '5.00', 'today_spend_usd': '0.05',
            'remaining_today_usd': '4.95', 'today_posts': 1, 'max_paid_posts_per_day': 500, 'in_flight': 0,
            'today_uncertain': 0, 'halts': [], 'halts_dropped': 0})

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
        gate = self.gate(daily_budget_usd='0.16', max_concurrent_calls=1).ready()
        gate.call('op-1', charge=str(Decimal('0.16') - RESERVED))
        self.assertEqual(gate.call('op-2')['status'], 200)
        self.assertEqual(gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-2']['state'], 'settled')

    def test_one_cent_over_the_daily_cap_is_refused_with_team_budget_code(self):
        gate = self.gate(daily_budget_usd='0.15', max_concurrent_calls=1).ready()
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
        gate = self.gate(daily_budget_usd='0.13', max_concurrent_calls=1).ready()
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
        gate = self.gate(daily_budget_usd='0.13', max_concurrent_calls=1)
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
            def __init__(self, timeout, profile):
                seen.append(timeout)
                self.profile = profile

            def __call__(self, _body, _key):
                return 200, provider_response('0.01')
        with patch.object(bridge.helper, 'HttpsTransport', Recorder):
            bridge.execute_request(gate.private, gate.go_path, envelope(body(), 'op-1'), peer_uid=PEER,
                                   slots=gate.slots, key_loader=lambda _: KEY, host=HOST, platform='linux',
                                   now=gate.clock)
        self.assertEqual(len(seen), 1)
        self.assertTrue(590 < seen[0] <= 600, seen)

    def test_upstream_timeout_is_what_remains_after_the_reservation_lock_wait(self):
        gate = self.gate().ready()
        seen, clock = [], [1000.0]

        class Recorder:
            def __init__(self, timeout, profile):
                seen.append(timeout)

            def __call__(self, _body, _key):
                return 200, provider_response('0.01')
        real_reserve = bridge.reserve_call

        def slow_reserve(*args):
            clock[0] += bridge.LOCK_TIMEOUT_SECONDS  # The ledger lock took its whole wait.
            return real_reserve(*args)
        with patch.object(bridge.helper, 'HttpsTransport', Recorder), patch.object(bridge, 'reserve_call', slow_reserve), \
                patch.object(bridge.time, 'monotonic', lambda: clock[0]):
            bridge.execute_request(gate.private, gate.go_path, envelope(body(), 'op-1'), peer_uid=PEER,
                                   slots=gate.slots, key_loader=lambda _: KEY, host=HOST, platform='linux',
                                   now=gate.clock)
        self.assertEqual(seen, [bridge.CALL_DEADLINE_SECONDS - bridge.LOCK_TIMEOUT_SECONDS])

    def test_worst_case_call_fits_inside_the_callers_630_second_timeout(self):
        # From acceptance: slot wait + reservation lock + upstream share CALL_DEADLINE_SECONDS. After the
        # upstream deadline: a settlement lock wait, a fallback halt lock wait, the state writes and the reply.
        caller_timeout = 630  # preview-test.ts: PREVIEW_GLM_DEADLINE_MS + 30_000
        writes_and_reply = 5
        self.assertEqual(bridge.REPLY_TIMEOUT_SECONDS, caller_timeout)
        self.assertLessEqual(bridge.CALL_DEADLINE_SECONDS + 2 * bridge.LOCK_TIMEOUT_SECONDS + writes_and_reply,
                             caller_timeout)
        self.assertGreaterEqual(bridge.CALL_DEADLINE_SECONDS - bridge.SLOT_WAIT_SECONDS - bridge.LOCK_TIMEOUT_SECONDS, 500)
        self.assertLessEqual(bridge.CALL_DEADLINE_SECONDS, bridge.helper.MAX_TIMEOUT_SECONDS)


class RequestBytesTests(GateTest):
    def test_prompt_that_cannot_be_encoded_is_refused_before_any_reservation(self):
        # TS JSON.stringify writes half of a split emoji as the escape \ud83d; Python decodes a lone surrogate.
        gate = self.gate().ready()
        value = body(messages=[{'role': 'user', 'content': 'split emoji \ud83d'}])
        self.assertIn('\\ud83d', envelope(value)['requestBody'])
        dispatched = []
        with self.refused('REQUEST_INVALID'):
            gate.call('op-1', value=value, dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])
        self.assertIsNone(gate.day('2026-10-08'))
        self.assertEqual((gate.status()['state'], gate.status()['in_flight']), ('active', 0))

    def test_dispatch_receives_exactly_the_bytes_checked_before_reservation(self):
        gate = self.gate().ready()
        value = body(messages=[{'role': 'user', 'content': 'café \U0001F600'}])
        dispatched = []

        def record(request, key):
            dispatched.append((request, key))
            return 200, provider_response('0.01')
        gate.call('op-1', value=value, dispatch=record)
        self.assertEqual(dispatched, [(bridge.helper.canonical(value), KEY)])
        self.assertEqual(json.loads(dispatched[0][0]), value)

    def test_outgoing_bytes_longer_than_the_reserved_request_are_refused(self):
        gate = self.gate().ready()
        request = envelope(body(), 'op-1')
        longer = b'x' * (len(request['requestBody'].encode()) + 1)
        dispatched = []
        with patch.object(bridge.helper, 'canonical', lambda _value: longer), self.refused('REQUEST_INVALID'):
            gate.call('op-1', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])
        self.assertIsNone(gate.day('2026-10-08'))

    def test_https_transport_sends_the_given_bytes_verbatim_and_refuses_anything_else(self):
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
                sent.append(('connect', self.host))

            def request(self, method, path, body, headers):
                sent.append((method, path, body))

            def getresponse(self):
                return Response()

            def close(self):
                pass
        payload = b'{"exact":"bytes \\ud83d"}'
        with patch.object(bridge.helper.http.client, 'HTTPSConnection', Connection):
            self.assertEqual(REAL_TRANSPORT(timeout=5)(payload, KEY), (200, {'model': 'm'}))
            self.assertEqual(sent, [('connect', 'api.deepinfra.com'), ('POST', '/v1/openai/chat/completions', payload)])
            with self.refused('request_bytes_required'):
                REAL_TRANSPORT(timeout=5)({'model': 'm'}, KEY)
        self.assertEqual(len(sent), 2)

    def test_typescript_nine_decimal_reservation_string_is_accepted(self):
        # preview-test.ts formats nano-USD with exactly nine decimals, so the string ends in 0.
        raw = json.dumps(body(), separators=(',', ':'))
        raw = json.dumps(body(messages=[{'role': 'user', 'content': 'x' * (141 - len(raw) + len('Offline synthetic test'))}]),
                         separators=(',', ':'))
        self.assertEqual(len(raw.encode()), 141)
        nano = (len(raw.encode()) + 2048) * 150 + 163840 * 500
        typescript = '%d.%09d' % (nano // 10 ** 9, nano % 10 ** 9)
        self.assertEqual(typescript, '0.082248350')
        request = {'scope_id': SCOPE, 'operationId': 'op-1', 'requestBody': raw,
                   'requestSha256': file_sha_text(raw), 'reservedUsd': typescript}
        _, reserved, _row = bridge.validate_request(request, bridge.read_go(self.gate().go_path))
        self.assertEqual(reserved, Decimal('0.08224835'))


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

    def test_reported_cost_without_valid_token_counts_is_uncertain_and_halts(self):
        for usage in ({'estimated_cost': 0}, {'estimated_cost': '0.01'},
                      {'prompt_tokens': 'many', 'completion_tokens': 1, 'estimated_cost': '0.01'},
                      {'prompt_tokens': 3, 'estimated_cost': '0.01'},
                      {'prompt_tokens': 3, 'completion_tokens': 4, 'total_tokens': 99, 'estimated_cost': '0.01'}):
            with self.subTest(usage=usage):
                gate = self.gate().ready()
                with self.refused('NEW_CHARGE_UNCERTAIN'):
                    gate.call('op-1', dispatch=lambda _b, _k, u=usage: (200, {'model': MODEL, 'usage': u}))
                entry = self.assert_halted(gate, 'uncertain_charge', 'uncertain')
                self.assertEqual(Decimal(entry['held_usd']), RESERVED)

    def test_charge_is_the_larger_of_token_price_and_reported_cost(self):
        for usage, held in (({'prompt_tokens': 100000, 'completion_tokens': 0, 'estimated_cost': '0.01'}, '0.015'),
                            ({'prompt_tokens': 0, 'completion_tokens': 2000, 'estimated_cost': '0.02'}, '0.02'),
                            ({'prompt_tokens': 100000, 'completion_tokens': 2000}, '0.016')):
            with self.subTest(usage=usage):
                gate = self.gate().ready()
                self.assertEqual(gate.call('op-1', dispatch=lambda _b, _k, u=usage: (200, {'model': MODEL, 'usage': u}))['status'], 200)
                entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
                self.assertEqual((entry['state'], Decimal(entry['held_usd'])), ('settled', Decimal(held)))
                self.assertEqual(gate.status()['state'], 'active')

    def test_unexpected_failure_after_a_paid_reply_holds_full_reservation_and_halts(self):
        gate = self.gate().ready()

        def broken_accounting(*_args):
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

    def test_every_halt_is_kept_and_status_shows_the_first_reason_all_events_and_uncertain_count(self):
        gate = self.gate().ready()

        def broken(_body, _key):
            raise OSError('synthetic')
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=broken)
        gate.clock.set('2026-10-08T09:05:00+00:00')
        bridge.stop_authority(gate.private, now=gate.clock)
        status = gate.status()
        first = {'reason': 'uncertain_charge', 'at': '2026-10-08T09:00:00+00:00', 'entry_id': 'preview-test:' + SCOPE + ':op-1'}
        self.assertEqual((status['state'], status['reason'], status['today_uncertain']), ('halted', 'uncertain_charge', 1))
        self.assertEqual(status['halts'], [first, {'reason': 'operator_stop', 'at': '2026-10-08T09:05:00+00:00'}])
        gate.activate()
        gate.clock.set('2026-10-08T09:10:00+00:00')
        bridge.stop_authority(gate.private, now=gate.clock)
        status = gate.status()
        self.assertEqual((status['reason'], len(status['halts']), status['halts'][0]), ('operator_stop', 3, first))

    def test_halt_history_is_bounded_but_a_halt_is_never_refused_for_room(self):
        gate = self.gate().ready()
        with patch.object(bridge, 'MAX_HALT_EVENTS', 2):
            for minute in range(4):
                gate.clock.set('2026-10-08T09:0%d:00+00:00' % minute)
                bridge.stop_authority(gate.private, now=gate.clock)
                gate.activate()
            bridge.stop_authority(gate.private, now=gate.clock)
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], len(status['halts']), status['halts_dropped']),
                         ('halted', 'operator_stop', 2, 3))
        self.assertEqual(status['halts'][0]['at'], '2026-10-08T09:00:00+00:00')

    def test_reactivation_after_halt_keeps_history_and_uncertain_amount_counts_on_its_own_day(self):
        gate = self.gate(daily_budget_usd='0.13', max_concurrent_calls=1).ready()

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
        _, reserved, row = bridge.validate_request(request, go)
        bridge.reserve_call(gate.private, go, file_sha(gate.go_path), request, reserved, row, HOST, PEER, gate.clock)
        self.assertEqual(gate.status()['in_flight'], 1)
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 1, 'unrecorded_uncertain': 0})
        self.assert_halted(gate, 'interrupted_call_uncertain', 'uncertain')

    def test_clean_serve_start_recovers_nothing_and_stays_active(self):
        gate = self.gate().ready()
        gate.call('op-1')
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0, 'unrecorded_uncertain': 0})
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
                              ({}, '/run/debateai-v3-preview/../budget.sock'),
                              ({}, '/run/debateai-v3-preview/provider-budget.sock')):  # v1's retired name
            with self.subTest(changes=changes, path=path), self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
                bridge.serve(gate.private, gate.go_path, path, **{**good, **changes})
        # These refusals need no state: nothing in the private folder was touched.
        self.assertFalse((gate.private / 'team-serve.lock').exists())
        # A regular file where the socket goes (in an otherwise safe folder) is never removed.
        with patch.object(bridge, 'SOCKET_PATTERN', re.compile(re.escape(str(existing)))), \
                self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
            bridge.serve(gate.private, gate.go_path, existing, owner_uid=os.getuid(), **good)
        self.assertEqual(existing.read_text(), '')
        self.assertEqual(gate.status()['state'], 'active')

    def test_serve_without_a_socket_name_refuses_there_is_no_built_in_name(self):
        gate = self.gate().ready()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = bridge.main(['serve', '--private', str(gate.private), '--go', str(gate.go_path)])
        self.assertEqual((code, json.loads(out.getvalue())),
                         (2, {'status': 'refused', 'error_class': 'SafetyError', 'error': 'ROOT_SOCKET_REQUIRED'}))
        self.assertNotIn("default=Path('/run", SOURCE.read_text())
        self.assertEqual(bridge.RETIRED_SOCKET_NAMES, frozenset({'provider-budget.sock', 'team-budget-v2.sock'}))

    def test_only_one_server_may_hold_the_authority(self):
        gate = self.gate().ready()
        first = bridge.hold_serve_lock(gate.private)
        try:
            with self.refused('SERVE_ALREADY_RUNNING'):
                bridge.hold_serve_lock(gate.private)
        finally:
            os.close(first)
        os.close(bridge.hold_serve_lock(gate.private))


class Crash(BaseException):
    """The process dies: no state write after this point lands."""


class CrashRecoveryTests(GateTest):
    ENTRY = 'preview-test:' + SCOPE + ':op-1'

    def die_during_settlement(self, gate, outcome, writes_before_death):
        real, written = bridge.helper.write_bytes, []

        def dying(dir_fd, name, data):
            if len(written) >= writes_before_death:
                raise Crash()
            written.append(name)
            return real(dir_fd, name, data)
        death = patch.object(bridge.helper, 'write_bytes', dying)

        def dispatch(_body, _key):
            death.start()  # Reservation is durable; the process dies during settlement.
            return outcome()
        try:
            with self.assertRaises(SafetyError):
                gate.call('op-1', dispatch=dispatch)
        finally:
            death.stop()

    def restart(self, gate):
        return bridge.recover_interrupted(gate.private, now=gate.clock)

    def test_death_between_any_two_settlement_writes_still_halts_after_restart(self):
        def transport_failure():
            raise OSError('synthetic')
        outcomes = {'uncertain': (transport_failure, 3),
                    'overrun': (lambda: (200, provider_response(str(RESERVED + Decimal('0.01')))), 3),
                    'non_200': (lambda: (500, provider_response('0.02')), 3),
                    'settled_reply_lost': (lambda: (200, provider_response('0.01')), 2)}
        for name, (outcome, writes) in outcomes.items():
            for writes_before_death in range(writes):
                with self.subTest(outcome=name, writes_before_death=writes_before_death):
                    gate = self.gate().ready()
                    self.die_during_settlement(gate, outcome, writes_before_death)
                    self.restart(gate)
                    status = gate.status()
                    self.assertEqual((status['state'], status['in_flight']), ('halted', 0))
                    self.assertIn(gate.day('2026-10-08')['entries'][self.ENTRY]['state'], ('uncertain', 'settled'))
                    self.assertIn(self.ENTRY, [event.get('entry_id') for event in status['halts']])

    def test_leftover_in_flight_entry_halts_at_serve_start_whatever_its_state(self):
        for state in ('settled', 'uncertain'):
            with self.subTest(state=state):
                gate = self.gate().ready()
                go = bridge.read_go(gate.go_path)
                request = envelope(body(), 'op-1')
                _, reserved, row = bridge.validate_request(request, go)
                bridge.reserve_call(gate.private, go, file_sha(gate.go_path), request, reserved, row, HOST, PEER,
                                    gate.clock)
                ledger_path = gate.private / 'team-ledger-2026-10-08.json'
                ledger = json.loads(ledger_path.read_text())
                entry = ledger['entries'][self.ENTRY]
                entry.update(state=state, held_usd='0.01' if state == 'settled' else entry['reserved_usd'])
                ledger_path.write_text(json.dumps(ledger))
                self.assertEqual(self.restart(gate), {'interrupted': 1, 'unrecorded_uncertain': 0})
                status = gate.status()
                self.assertEqual((status['state'], status['reason'], status['in_flight']),
                                 ('halted', 'interrupted_after_settlement', 0))
                self.assertEqual(gate.day('2026-10-08')['entries'][self.ENTRY]['state'], state)

    def test_uncertain_entry_without_a_recorded_halt_halts_at_serve_start_once(self):
        gate = self.gate().ready()

        def broken(_body, _key):
            raise OSError('synthetic')
        with self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=broken)
        control_path = gate.private / 'team-control.json'
        control = json.loads(control_path.read_text())
        control.update(state='active', reason=None, halts=[])  # The halt was lost.
        control_path.write_text(json.dumps(control))
        self.assertEqual(self.restart(gate), {'interrupted': 0, 'unrecorded_uncertain': 1})
        status = gate.status()
        self.assertEqual((status['state'], status['reason']), ('halted', 'uncertain_entry_unrecorded'))
        self.assertEqual(status['halts'][0]['entry_id'], self.ENTRY)
        gate.activate()  # Root has seen it; the entry is now named by a halt.
        self.assertEqual(self.restart(gate), {'interrupted': 0, 'unrecorded_uncertain': 0})
        self.assertEqual(gate.status()['state'], 'active')

    def test_failed_settlement_and_failed_halt_trip_the_server_so_nothing_new_is_reserved(self):
        gate = self.gate().ready()

        def disk_full(*_args):
            raise OSError('synthetic disk full')
        failing = patch.object(bridge.helper, 'write_bytes', disk_full)

        def dispatch(_body, _key):
            failing.start()
            return 200, provider_response('0.01')
        try:
            with self.refused('SETTLEMENT_FAILED'):
                gate.call('op-1', dispatch=dispatch)
        finally:
            failing.stop()
        self.assertEqual(gate.status()['state'], 'active')  # The disk refused the halt too.
        dispatched = []
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-2', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])
        self.assertNotIn('preview-test:' + SCOPE + ':op-2', gate.day('2026-10-08')['entries'])

    def test_settlement_lock_timeout_trips_the_server(self):
        gate = self.gate().ready()
        holder = []

        def dispatch(_body, _key):
            holder.append(bridge.TeamStore(gate.private, lock_timeout=0).__enter__())
            return 200, provider_response('0.01')
        with patch.object(bridge, 'LOCK_TIMEOUT_SECONDS', 0.05), self.refused('SETTLEMENT_FAILED'):
            gate.call('op-1', dispatch=dispatch)
        holder[0].__exit__()
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-2')


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
            with bridge.TeamStore(gate.private, lock_timeout=0):
                pass  # One non-blocking try: the exclusive ledger lock is free while four upstream calls run.
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

    def test_racing_calls_at_the_budget_edge_reserve_exactly_what_fits(self):
        for fits, budget in ((1, '0.10'), (2, '0.17')):
            with self.subTest(fits=fits):
                self.assertTrue(fits * RESERVED <= Decimal(budget) < (fits + 1) * RESERVED)
                gate = self.gate(daily_budget_usd=budget, max_concurrent_calls=8)
                # This test races eight slots over a pot that fits one or two holds, which activate
                # now refuses (8 x the GLM worst case > pot); only the race itself is tested here.
                with patch.object(bridge, 'largest_reservation', lambda *_args: Decimal(0)):
                    gate.ready()
                start, release, results = threading.Barrier(8), threading.Event(), {}

                def held(_body, _key):
                    release.wait(5)  # Holds stay pending until every racer has been answered.
                    return 200, provider_response('0.01')

                def race(operation_id):
                    start.wait(5)
                    try:
                        results[operation_id] = gate.call(operation_id, dispatch=held, slot_wait=5)
                    except BaseException as error:  # noqa: BLE001 - recorded for assertions
                        results[operation_id] = error
                threads = [threading.Thread(target=race, args=('op-%d' % n,)) for n in range(8)]
                for thread in threads:
                    thread.start()
                deadline = time.monotonic() + 10
                while len(results) < 8 - fits and time.monotonic() < deadline:
                    time.sleep(0.01)
                release.set()
                for thread in threads:
                    thread.join(10)
                outcomes = sorted('ok' if isinstance(v, dict) else str(v) for v in results.values())
                self.assertEqual(outcomes, ['TEAM_DAILY_BUDGET_REACHED'] * (8 - fits) + ['ok'] * fits)
                status = gate.status()
                self.assertEqual((status['today_posts'], status['in_flight'], status['state']), (fits, 0, 'active'))

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
    def exchange(self, gate, dispatch, path='/complete', uid=PEER, payload=None, after_send=None, after_execute=None):
        server_side, client_side = socket.socketpair()
        data = json.dumps(payload if payload is not None else envelope(body(), 'op-1')).encode()
        client_side.sendall(b'POST ' + path.encode() + b' HTTP/1.0\r\nContent-Type: application/json\r\n'
                            b'Content-Length: ' + str(len(data)).encode() + b'\r\n\r\n' + data)
        if after_send:
            after_send(client_side)

        def execute(request, peer_uid, cancelled, on_reserved):
            result = bridge.execute_request(gate.private, gate.go_path, request, peer_uid=peer_uid, slots=gate.slots,
                                            dispatch=dispatch(client_side), key_loader=lambda _: KEY, host=HOST,
                                            platform='linux', now=gate.clock, cancelled=cancelled,
                                            on_reserved=on_reserved)
            if after_execute:
                after_execute()
            return result
        handler = bridge.make_handler(gate.private, [PEER], execute, gate.slots, peer_uid_of=lambda _connection: uid,
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
        gate = self.gate(daily_budget_usd='0.13', max_concurrent_calls=1).ready()
        gate.call('op-0', charge='0.06')  # 0.06 + one more hold (about 0.082) is over 0.13.
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

    def test_any_failure_after_the_reservation_halts_even_when_a_refusal_is_delivered(self):
        gate = self.gate().ready()

        def fail_after_settlement():
            raise BrokenPipeError('synthetic failure after the paid call settled')
        line, payload = self.exchange(gate, self.ok, after_execute=fail_after_settlement)
        self.assertIn(b' 409 ', line)
        status = gate.status()
        self.assertEqual((status['state'], status['reason']), ('halted', 'ipc_or_delivery_failure'))
        entry = gate.day('2026-10-08')['entries']['preview-test:' + SCOPE + ':op-1']
        self.assertEqual((entry['state'], entry['held_usd']), ('settled', '0.01'))

    def test_broken_log_stream_does_not_lose_a_settled_reply(self):
        gate = self.gate().ready()

        class Broken(io.StringIO):
            def write(self, _text):
                raise BrokenPipeError('synthetic closed stdout')
        with contextlib.redirect_stdout(Broken()):
            line, payload = self.exchange(gate, self.ok)
        self.assertIn(b' 200 ', line)
        self.assertEqual(json.loads(payload)['status'], 200)
        self.assertEqual(gate.status()['state'], 'active')

    def test_reply_holding_a_lone_surrogate_is_delivered_escaped(self):
        gate = self.gate().ready()
        lone = 'half \ud83d'  # A JSON reply may escape half of a surrogate pair; Python decodes it alone.

        def reply(_client):
            return lambda _body, _key: (200, provider_response('0.01', content=lone))
        line, payload = self.exchange(gate, reply)
        self.assertIn(b' 200 ', line)
        self.assertTrue(payload.isascii())
        result = json.loads(payload)
        self.assertEqual(json.loads(result['body'])['choices'][0]['message']['content'], lone)
        self.assertEqual(gate.status()['state'], 'active')

    def test_lost_reply_whose_halt_cannot_be_written_trips_the_server(self):
        gate = self.gate().ready()

        def vanish(client):
            def dispatch(_body, _key):
                client.close()
                return 200, provider_response('0.01')
            return dispatch
        real_halt = bridge.halt

        def halt_fails(*args, **kwargs):
            if args[1] == 'ipc_or_delivery_failure':
                raise OSError('synthetic disk full')
            return real_halt(*args, **kwargs)
        with patch.object(bridge, 'halt', halt_fails):
            self.exchange(gate, vanish)
        self.assertEqual(gate.status()['state'], 'active')
        dispatched = []
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-2', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual(dispatched, [])


class UnsentCallTests(GateTest):
    """A call is provably unsent only when the TCP connect or TLS handshake failed before any
    request byte was written: its hold is released and only it fails. Five in a row halt."""
    ENTRY = 'preview-test:' + SCOPE + ':op-1'

    @staticmethod
    def unsent(_body, _key):
        raise bridge.helper.RequestNotSent('request_not_sent')

    def call_unsent(self, gate, operation_id='op-1'):
        with self.refused('PROVIDER_NOT_REACHED'):
            gate.call(operation_id, dispatch=self.unsent)

    def transport_with(self, steps, **connection_behaviour):
        class Response:
            status = 200

            def __init__(self):
                self.chunks = [b'{"model": "m"}']

            def read(self, _size):
                return self.chunks.pop() if self.chunks else b''

        class Connection:
            def __init__(self, host, timeout, context):
                self.sock = None
                steps.append(('timeout', timeout))

            def connect(self):
                steps.append('connect')
                if 'connect' in connection_behaviour:
                    raise connection_behaviour['connect']

            def request(self, method, path, body, headers):
                steps.append('request')
                if 'request' in connection_behaviour:
                    raise connection_behaviour['request']

            def getresponse(self):
                steps.append('getresponse')
                if 'getresponse' in connection_behaviour:
                    raise connection_behaviour['getresponse']
                return Response()

            def close(self):
                steps.append('close')
        return Connection

    def test_transport_marks_only_connect_and_handshake_failures_as_not_sent(self):
        import ssl
        for name, failure in (('tcp_refused', ConnectionRefusedError()), ('egress_blocked', PermissionError(1, 'EPERM')),
                              ('dns', OSError('name resolution')), ('tls_handshake', ssl.SSLError('handshake')),
                              ('tls_certificate', ssl.SSLCertVerificationError('bad certificate')),
                              ('connect_timeout', TimeoutError('timed out'))):
            with self.subTest(name):
                steps = []
                with patch.object(bridge.helper.http.client, 'HTTPSConnection', self.transport_with(steps, connect=failure)), \
                        self.assertRaises(bridge.helper.RequestNotSent):
                    REAL_TRANSPORT(timeout=600)(b'{}', KEY)
                self.assertEqual(steps, [('timeout', 15), 'connect', 'close'])  # No request was ever asked for.

    def test_deadline_passing_during_the_connect_is_not_sent(self):
        steps = []
        clock = iter([0.0, 10.0])  # The deadline, then the check right after the connect.
        with patch.object(bridge.helper.http.client, 'HTTPSConnection', self.transport_with(steps)), \
                patch.object(bridge.helper.time, 'monotonic', lambda: next(clock)), \
                self.assertRaises(bridge.helper.RequestNotSent):
            REAL_TRANSPORT(timeout=5)(b'{}', KEY)
        self.assertEqual(steps, [('timeout', 5), 'connect', 'close'])

    def test_failures_once_the_request_may_have_been_written_are_never_not_sent(self):
        for stage in ('request', 'getresponse'):
            with self.subTest(stage):
                steps = []
                connection = self.transport_with(steps, **{stage: ConnectionResetError('reset')})
                with patch.object(bridge.helper.http.client, 'HTTPSConnection', connection), \
                        self.assertRaises(ConnectionResetError):
                    REAL_TRANSPORT(timeout=5)(b'{}', KEY)
                self.assertIn('request', steps)
        self.assertFalse(issubclass(bridge.helper.ResponseTooLarge, bridge.helper.RequestNotSent))

    def test_unsent_call_releases_its_hold_fails_alone_and_does_not_halt(self):
        gate = self.gate().ready()
        self.call_unsent(gate)
        status = gate.status()
        self.assertEqual((status['state'], status['in_flight'], status['today_posts'], status['today_spend_usd'],
                          status['unsent_streak']), ('active', 0, 0, '0', 1))
        self.assertEqual(gate.day('2026-10-08')['entries'], {})
        self.assertEqual(gate.call('op-1')['status'], 200)  # The same operation may be tried again.
        self.assertEqual(gate.status()['unsent_streak'], 0)  # A settled reply resets the streak.
        self.assertIn('"status": "not_sent"', self.out.getvalue())
        self.assertNotIn(KEY, self.out.getvalue())

    def test_five_unsent_in_a_row_halt_with_provider_unreachable(self):
        gate = self.gate().ready()
        for number in range(1, 5):
            self.call_unsent(gate, 'op-%d' % number)
            self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', number))
        self.call_unsent(gate, 'op-5')
        status = gate.status()
        self.assertEqual((status['state'], status['reason'], status['in_flight'], status['today_posts']),
                         ('halted', 'provider_unreachable', 0, 0))
        self.assertEqual(status['halts'][-1]['entry_id'], 'preview-test:' + SCOPE + ':op-5')
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-6')
        self.assertEqual(bridge.UNSENT_HALT_STREAK, 5)

    def test_any_settled_reply_resets_the_streak(self):
        gate = self.gate().ready()
        for number in range(4):
            self.call_unsent(gate, 'a-%d' % number)
        gate.call('ok-1')
        for number in range(4):
            self.call_unsent(gate, 'b-%d' % number)
        self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', 4))

    def test_streak_survives_a_restart_and_activation_resets_it(self):
        gate = self.gate().ready()
        for number in range(4):
            self.call_unsent(gate, 'a-%d' % number)
        self.assertEqual(bridge.recover_interrupted(gate.private, now=gate.clock), {'interrupted': 0, 'unrecorded_uncertain': 0})
        self.assertEqual(gate.status()['unsent_streak'], 4)
        self.call_unsent(gate, 'a-4')
        self.assertEqual(gate.status()['reason'], 'provider_unreachable')
        gate.activate()
        self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', 0))
        self.call_unsent(gate, 'b-0')
        self.assertEqual(gate.status()['state'], 'active')

    def test_a_hold_that_cannot_be_released_is_uncertain_and_halts(self):
        gate = self.gate().ready()

        def broken_release(*_args):
            raise SafetyError('ledger_lock_timeout')
        with patch.object(bridge, 'release_unsent', broken_release), self.refused('NEW_CHARGE_UNCERTAIN'):
            gate.call('op-1', dispatch=self.unsent)
        status = gate.status()
        self.assertEqual((status['state'], status['reason']), ('halted', 'uncertain_charge'))
        entry = gate.day('2026-10-08')['entries'][self.ENTRY]
        self.assertEqual((entry['state'], Decimal(entry['held_usd']), entry['reason']), ('uncertain', RESERVED, 'release_failure'))

    def test_death_during_the_release_fails_closed_or_drops_a_never_sent_hold(self):
        for writes_before_death, expected in ((0, ('halted', 'interrupted_call_uncertain')),
                                              (1, ('halted', 'interrupted_call_uncertain')),
                                              (2, ('active', None))):
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
                    raise bridge.helper.RequestNotSent('request_not_sent')
                try:
                    with self.assertRaises(SafetyError):
                        gate.call('op-1', dispatch=dispatch)
                finally:
                    death.stop()
                bridge.recover_interrupted(gate.private, now=gate.clock)
                status = gate.status()
                self.assertEqual((status['state'], status['reason']), expected)
                self.assertEqual(status['in_flight'], 0)

    def test_ipc_does_not_halt_for_an_unsent_call(self):
        gate = self.gate().ready()
        line, payload = IpcTests.exchange(self, gate, lambda _client: self.unsent)
        self.assertEqual((line, json.loads(payload)), (b'HTTP/1.0 409 Conflict', {'error': 'PREVIEW_TEST_AUTHORITY_STOPPED'}))
        self.assertEqual((gate.status()['state'], gate.status()['unsent_streak']), ('active', 1))


class StaleSocketTests(GateTest):
    """serve start removes a left-over socket only when it is provably stale; anything else refuses
    and is left exactly as it was. The tests run as the developer, so owner_uid is the developer."""

    def folder(self):
        gate = self.gate()
        folder = gate.root / 'run'
        folder.mkdir(mode=0o755)
        os.chmod(folder, 0o755)
        return folder

    @staticmethod
    def stale_socket(path):
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(str(path))
        server.close()  # Like a killed server: the file stays and no one listens.
        return path

    def clear(self, path, **kwargs):
        return bridge.clear_stale_socket(path, owner_uid=os.getuid(), **kwargs)

    def test_free_path_is_left_alone(self):
        path = self.folder() / 'gate.sock'
        self.assertFalse(self.clear(path))
        self.assertFalse(path.exists())

    def test_stale_socket_is_removed(self):
        path = self.stale_socket(self.folder() / 'gate.sock')
        self.assertTrue(self.clear(path))
        self.assertFalse(os.path.lexists(path))

    def test_socket_with_a_listener_is_in_use_and_kept(self):
        path = self.folder() / 'gate.sock'
        live = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(live.close)
        live.bind(str(path))
        live.listen(8)
        with self.refused('IPC_SOCKET_IN_USE'):
            self.clear(path)
        self.assertTrue(path.exists())
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(client.close)
        client.connect(str(path))  # Still the live server's socket.

    def test_connect_that_neither_answers_nor_is_refused_counts_as_in_use(self):
        path = self.stale_socket(self.folder() / 'gate.sock')

        class Silent:
            def __init__(self, *_args):
                pass

            def settimeout(self, seconds):
                self.seconds = seconds

            def connect(self, _address):
                raise TimeoutError('timed out')  # A live server whose backlog is full.

            def close(self):
                pass
        with patch.object(bridge.socket, 'socket', Silent), self.refused('IPC_SOCKET_IN_USE'):
            self.clear(path)
        self.assertTrue(os.path.lexists(path))
        self.assertEqual(bridge.STALE_PROBE_SECONDS, 2)

    def test_anything_but_a_lone_stale_socket_is_refused_and_kept(self):
        def regular_file(folder):
            (folder / 'gate.sock').write_text('x')

        def plain_folder(folder):
            (folder / 'gate.sock').mkdir()

        def symlink_to_stale_socket(folder):
            self.stale_socket(folder / 'elsewhere.sock')
            (folder / 'gate.sock').symlink_to(folder / 'elsewhere.sock')

        def dangling_symlink(folder):
            (folder / 'gate.sock').symlink_to(folder / 'missing.sock')

        def hard_linked_socket(folder):
            self.stale_socket(folder / 'gate.sock')
            try:
                os.link(folder / 'gate.sock', folder / 'second-name.sock')
            except OSError:
                self.skipTest('this file system cannot hard-link a socket')
        for name, spoil in (('regular_file', regular_file), ('plain_folder', plain_folder),
                            ('symlink_to_stale_socket', symlink_to_stale_socket),
                            ('dangling_symlink', dangling_symlink), ('hard_linked_socket', hard_linked_socket)):
            with self.subTest(name):
                folder = self.folder()
                spoil(folder)
                before = sorted((p.name, os.lstat(p).st_ino) for p in folder.iterdir())
                with self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
                    self.clear(folder / 'gate.sock')
                self.assertEqual(sorted((p.name, os.lstat(p).st_ino) for p in folder.iterdir()), before)

    def test_unsafe_folder_or_other_owner_is_refused_and_kept(self):
        for name in ('group_writable', 'other_writable', 'folder_is_a_symlink', 'owned_by_someone_else'):
            with self.subTest(name):
                folder = self.folder()
                path = self.stale_socket(folder / 'gate.sock')
                owner = os.getuid()
                if name == 'group_writable':
                    os.chmod(folder, 0o775)
                elif name == 'other_writable':
                    os.chmod(folder, 0o757)
                elif name == 'folder_is_a_symlink':
                    link = folder.parent / 'run-link'
                    link.symlink_to(folder)
                    path = link / 'gate.sock'
                else:
                    owner = os.getuid() + 1
                with self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
                    bridge.clear_stale_socket(path, owner_uid=owner)
                self.assertTrue(os.path.lexists(folder / 'gate.sock'))

    def test_entry_swapped_during_the_probe_is_not_removed(self):
        folder = self.folder()
        path = self.stale_socket(folder / 'gate.sock')
        real_socket = socket.socket

        class Swapping:
            def __init__(self, *_args):
                pass

            def settimeout(self, _seconds):
                pass

            def connect(self, _address):
                os.rename(path, folder / 'checked.sock')
                fresh = real_socket(socket.AF_UNIX, socket.SOCK_STREAM)
                fresh.bind(str(path))  # Someone else's socket now has the name.
                fresh.close()
                raise ConnectionRefusedError()

            def close(self):
                pass
        with patch.object(bridge.socket, 'socket', Swapping), self.refused('ROOT_IPC_CUSTODY_REQUIRED'):
            self.clear(path)
        self.assertTrue(os.path.lexists(path))
        self.assertTrue(os.path.lexists(folder / 'checked.sock'))


SERVE_SCRIPT = r"""
import os, re, sys
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
from preview_budget_authority_fixture import HOST, load_bridge
bridge = load_bridge()
private, go, path = sys.argv[2:5]
bridge.SOCKET_PATTERN = re.compile(re.escape(path))
bridge.SERVE_POLL_SECONDS = 0.02  # A fast stop for the test; production keeps 0.5 s.
bridge.serve(private, go, path, platform='linux', uid=0, host=HOST, owner_uid=os.getuid())
"""


class ServeLifecycleTests(GateTest):
    """A real serve process: SIGTERM stops it cleanly, SIGKILL leaves a stale socket that the next
    start removes. Synthetic state only; no request reaches execution."""

    def start(self, gate, path):
        process = subprocess.Popen([sys.executable, '-I', '-c', SERVE_SCRIPT, str(Path(__file__).resolve().parent),
                                    str(gate.private), str(gate.go_path), str(path)],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(process.stderr.close)
        self.addCleanup(process.stdout.close)
        self.addCleanup(lambda: process.poll() is None and (process.kill(), process.wait(10)))
        line = process.stdout.readline()
        self.assertTrue(line, process.stderr.read() if process.poll() is not None else 'no serving line')
        return process, json.loads(line)

    def test_sigterm_stops_cleanly_and_sigkill_leftover_is_removed_on_the_next_start(self):
        gate = self.gate().ready()
        folder = gate.root / 'run'
        folder.mkdir(mode=0o755)
        os.chmod(folder, 0o755)
        path = folder / 'gate.sock'

        process, serving = self.start(gate, path)
        self.assertEqual((serving['status'], serving['stale_socket_removed']), ('serving', False))
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o666)
        process.send_signal(signal.SIGKILL)
        process.wait(10)
        self.assertTrue(os.path.lexists(path))  # What a crash leaves behind.

        process, serving = self.start(gate, path)
        self.assertEqual((serving['status'], serving['stale_socket_removed'], serving['interrupted_calls_found']),
                         ('serving', True, 0))
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        client.connect(str(path))  # The new server listens on the reclaimed name.
        client.close()
        process.send_signal(signal.SIGTERM)
        self.assertEqual(process.wait(10), 0)
        self.assertEqual([json.loads(line)['status'] for line in process.stdout.read().splitlines()], ['stopped'])
        self.assertFalse(os.path.lexists(path))
        self.assertEqual(gate.status()['state'], 'active')

    def test_a_second_serve_on_a_live_socket_refuses_and_leaves_it(self):
        gate = self.gate().ready()
        folder = gate.root / 'run'
        folder.mkdir(mode=0o755)
        os.chmod(folder, 0o755)
        path = folder / 'gate.sock'
        process, _ = self.start(gate, path)
        with patch.object(bridge, 'SOCKET_PATTERN', re.compile(re.escape(str(path)))), \
                self.refused('SERVE_ALREADY_RUNNING'):
            bridge.serve(gate.private, gate.go_path, path, platform='linux', uid=0, host=HOST, owner_uid=os.getuid())
        other = self.gate().ready()
        with patch.object(bridge, 'SOCKET_PATTERN', re.compile(re.escape(str(path)))), \
                self.refused('IPC_SOCKET_IN_USE'):
            bridge.serve(other.private, other.go_path, path, platform='linux', uid=0, host=HOST, owner_uid=os.getuid())
        process.send_signal(signal.SIGTERM)
        self.assertEqual(process.wait(10), 0)


class SignalStopTests(GateTest):
    def serve_on(self, gate, execute, **server_options):
        path = gate.root / 's.sock'
        handler = bridge.make_handler(gate.private, [PEER], execute, gate.slots, peer_uid_of=lambda _c: PEER,
                                      now=gate.clock)
        server = bridge.UnixThreadingServer(str(path), handler, **server_options)
        loop = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05}, daemon=True)
        loop.start()
        self.addCleanup(server.server_close)
        self.addCleanup(lambda: loop.is_alive() and server.shutdown())  # A failing test must not hang the run.
        return path, server, loop

    def post(self, path):
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(client.close)
        client.connect(str(path))
        client.sendall(b'POST /complete HTTP/1.0\r\nContent-Length: 2\r\n\r\n{}')
        return client

    @staticmethod
    def read_all(client):
        client.settimeout(5)
        reply = b''
        while True:
            chunk = client.recv(65536)
            if not chunk:
                return reply
            reply += chunk

    def test_stop_lets_the_call_in_flight_finish_and_be_delivered(self):
        gate = self.gate().ready()
        started, finished = threading.Event(), []

        def execute(_data, _uid, _cancelled, _on_reserved):
            started.set()
            time.sleep(0.2)
            finished.append(time.monotonic())
            return {'status': 200, 'body': '{}'}
        path, server, loop = self.serve_on(gate, execute)
        client = self.post(path)
        self.assertTrue(started.wait(5))
        bridge.begin_stop(server, gate.slots)
        loop.join(5)
        self.assertFalse(loop.is_alive())
        server.server_close()  # Waits for the call in flight.
        self.assertTrue(finished and finished[0] <= time.monotonic())
        reply = self.read_all(client)
        self.assertTrue(reply.startswith(b'HTTP/1.0 200'), reply[:40])

    def test_after_stop_nothing_new_is_reserved(self):
        gate = self.gate().ready()
        bridge.begin_stop(types.SimpleNamespace(shutdown=lambda: None), gate.slots)
        dispatched = []
        with self.refused('AUTHORITY_STOPPED'):
            gate.call('op-1', dispatch=lambda *args: dispatched.append(args))
        self.assertEqual((dispatched, gate.status()['today_posts'], gate.status()['state']), ([], 0, 'active'))

    def test_while_stopping_a_reply_gets_the_short_drain_timeout(self):
        gate = self.gate().ready()
        seen = []

        def execute(_data, _uid, _cancelled, _on_reserved):
            gate.slots.trip()  # The stop arrives while this call runs.
            return {'status': 200, 'body': '{}'}
        path, server, loop = self.serve_on(gate, execute)
        real_reply = None

        def record_timeout(handler, code, payload):
            result = real_reply(handler, code, payload)
            seen.append(handler.connection.gettimeout())
            return result
        handler_class = server.RequestHandlerClass
        real_reply = handler_class.reply
        with patch.object(handler_class, 'reply', record_timeout):
            reply = self.read_all(self.post(path))
        self.assertTrue(reply.startswith(b'HTTP/1.0 200'), reply[:40])
        self.assertEqual((seen, bridge.DRAIN_REPLY_SECONDS), ([30], 30))

    def test_a_peer_outside_the_allowed_uids_is_closed_before_it_gets_a_thread(self):
        gate = self.gate().ready()

        def execute(*_args):
            raise AssertionError('never reached')
        path, server, loop = self.serve_on(gate, execute, allowed_uids=frozenset({PEER}), peer_uid_of=lambda _r: 7)
        with patch.object(server, 'process_request', side_effect=AssertionError('no thread for a stranger')):
            client = self.post(path)
            client.settimeout(5)
            # Closed without one reply byte. Linux answers a close with unread request bytes by a
            # reset (ECONNRESET); macOS by a plain end of stream. Both mean "closed, no reply";
            # any byte received before either one still fails the test.
            reply = b''
            try:
                while chunk := client.recv(65536):
                    reply += chunk
            except ConnectionResetError:
                pass
            self.assertEqual(reply, b'')
        broken = bridge.UnixThreadingServer.__new__(bridge.UnixThreadingServer)
        broken.allowed_uids, broken.peer_uid_of = frozenset({PEER}), lambda _r: 1 / 0
        self.assertFalse(broken.verify_request(None, None))


class SocketServerTests(GateTest):
    def serve_on(self, gate):
        path = gate.root / 's.sock'

        def execute(*_args):
            raise AssertionError('no request reaches execution in these tests')
        handler = bridge.make_handler(gate.private, [PEER], execute, gate.slots, peer_uid_of=lambda _c: PEER,
                                      now=gate.clock)
        server = bridge.UnixThreadingServer(str(path), handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05})
        thread.start()
        return path, server, thread

    def connect(self, path):
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(client.close)
        client.connect(str(path))
        client.settimeout(3)
        return client

    def close_hangs(self, server, thread):
        server.shutdown()
        thread.join(5)
        closer = threading.Thread(target=server.server_close)
        closer.start()
        closer.join(5)
        return closer.is_alive()

    def test_idle_connection_is_dropped_after_the_read_timeout_so_server_close_cannot_hang(self):
        gate = self.gate().ready()
        with patch.object(bridge, 'IPC_READ_TIMEOUT_SECONDS', 0.2):
            path, server, thread = self.serve_on(gate)
        idle = self.connect(path)
        try:
            self.assertEqual(idle.recv(1), b'')  # The server gave up waiting for request headers.
        finally:
            idle.close()
            self.assertFalse(self.close_hangs(server, thread))

    def test_connections_beyond_the_cap_are_closed_without_a_thread(self):
        gate = self.gate().ready()
        with patch.object(bridge, 'IPC_READ_TIMEOUT_SECONDS', 5), \
                patch.object(bridge.UnixThreadingServer, 'max_connections', 2):
            path, server, thread = self.serve_on(gate)
        held = [self.connect(path) for _ in range(2)]
        extra = self.connect(path)
        try:
            self.assertEqual(extra.recv(1), b'')
            for client in held:
                client.setblocking(False)
                with self.assertRaises(BlockingIOError):
                    client.recv(1)  # Still open: their threads wait for request headers.
        finally:
            for client in held + [extra]:
                client.close()
            self.assertFalse(self.close_hangs(server, thread))

    def test_production_read_timeout_and_connection_cap(self):
        self.assertEqual((bridge.IPC_READ_TIMEOUT_SECONDS, bridge.UnixThreadingServer.max_connections), (10, 32))
        handler = bridge.make_handler(Path('/nonexistent'), [PEER], None, bridge.CallSlots(1))
        self.assertEqual(handler.timeout, 10)


if __name__ == '__main__':
    unittest.main()
