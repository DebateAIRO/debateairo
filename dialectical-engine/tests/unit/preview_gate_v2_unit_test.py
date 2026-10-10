"""The reviewed gate v2 systemd files and the DeepInfra address check.

Offline only: no DNS, no network, no systemd. A fake resolver stands in for getaddrinfo.
"""
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import socket
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / 'deploy/preview-gate/v2'
UNIT = V2 / 'systemd/debateai-preview-provider-budget.service'
DROPIN = V2 / 'systemd/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf'
CHECK_UNIT = V2 / 'systemd/debateai-preview-gate-addresses.service'
TIMER = V2 / 'systemd/debateai-preview-gate-addresses.timer'
HALT_UNIT = V2 / 'systemd/debateai-preview-gate-halt-watch.service'
HALT_TIMER = V2 / 'systemd/debateai-preview-gate-halt-watch.timer'
LIFECYCLE = ROOT / 'deploy/preview-lifecycle/v1/systemd'
GATE = ROOT / 'packages/providers/ops/preview_budget_authority.py'
INSTALLED_DROPIN = '/etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf'
OPERATOR = '/opt/debateai-v3-preview/operator/team-budget-v2/'
MEASURED = ['38.101.151.%d' % n for n in (13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 29, 30)]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


addresses = load(V2 / 'deepinfra_addresses.py', 'deepinfra_addresses')
gate_watch = load(V2 / 'gate_watch.py', 'gate_watch')


def directives(path):
    """(key, value) pairs of a unit file, comments and section headers dropped."""
    pairs = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith(('#', '[')):
            key, _, value = line.partition('=')
            pairs.append((key, value))
    return pairs


def values(path, key):
    return [value for name, value in directives(path) if name == key]


def fake_dns(*ips):
    def lookup(host, port, family, kind):
        assert (host, port, family, kind) == ('api.deepinfra.com', 443, socket.AF_INET, socket.SOCK_STREAM)
        return [(socket.AF_INET, kind, 6, '', (ip, port)) for ip in ips]
    return lookup


def broken_dns(*_args):
    raise socket.gaierror('temporary failure in name resolution')


class AddressCheckTests(unittest.TestCase):
    def run_main(self, argv, lookup):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=lookup)
        return code, out.getvalue()

    def dropin_file(self, text):
        folder = Path(tempfile.mkdtemp(prefix='gate-addresses-'))
        self.addCleanup(shutil.rmtree, folder, True)
        path = folder / '50-deepinfra-addresses.conf'
        path.write_text(text)
        return path

    def test_same_addresses_pass_and_dns_subset_passes_with_stale_named(self):
        code, out = self.run_main(['check', '--dropin', str(DROPIN)], fake_dns(*MEASURED))
        self.assertEqual((code, json.loads(out)['status'], json.loads(out)['stale']), (0, 'ok', []))
        code, out = self.run_main(['check', '--dropin', str(DROPIN)], fake_dns(*MEASURED[:3]))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)['stale'], MEASURED[3:])

    def test_a_new_address_refuses_with_a_clear_code_and_names_it(self):
        code, out = self.run_main(['check', '--dropin', str(DROPIN)], fake_dns(*MEASURED, '38.101.151.31'))
        result = json.loads(out)
        self.assertEqual((code, result['status'], result['error'], result['new']),
                         (2, 'refused', 'DEEPINFRA_ADDRESSES_CHANGED', ['38.101.151.31']))
        code, out = self.run_main(['check', '--dropin', str(DROPIN)], fake_dns('203.0.113.9'))
        self.assertEqual((code, json.loads(out)['error'], json.loads(out)['stale']), (2, 'DEEPINFRA_ADDRESSES_CHANGED', MEASURED))

    def test_dns_failure_and_missing_dropin_refuse(self):
        self.assertEqual(json.loads(self.run_main(['check', '--dropin', str(DROPIN)], broken_dns)[1])['error'],
                         'DNS_UNAVAILABLE')
        self.assertEqual(json.loads(self.run_main(['check', '--dropin', str(DROPIN)], fake_dns())[1])['error'],
                         'DNS_UNAVAILABLE')
        self.assertEqual(json.loads(self.run_main(['check', '--dropin', '/nonexistent/x.conf'], fake_dns(*MEASURED))[1])
                         ['error'], 'DROPIN_UNREADABLE')
        self.assertEqual(json.loads(self.run_main(['check'], fake_dns(*MEASURED))[1])['error'], 'DROPIN_REQUIRED')

    def test_dropin_may_only_add_global_ipv4_slash_32s(self):
        good = '[Service]\nIPAddressAllow=38.101.151.13/32\n'
        self.assertEqual({str(a) for a in addresses.parse_dropin(good)}, {'38.101.151.13'})
        for text in ('', '# only a comment\n', 'IPAddressAllow=38.101.151.13/32\n',
                     '[Service]\nIPAddressAllow=38.101.151.0/24\n', '[Service]\nIPAddressAllow=0.0.0.0/0\n',
                     '[Service]\nIPAddressAllow=any\n', '[Service]\nIPAddressAllow=10.0.0.1/32\n',
                     '[Service]\nIPAddressAllow=127.0.0.1/32\n', '[Service]\nIPAddressAllow=38.101.151.13\n',
                     '[Service]\nIPAddressAllow=38.101.151.13/32 38.101.151.14/32\n',
                     '[Service]\nIPAddressAllow=38.101.151.13/32\nIPAddressAllow=38.101.151.13/32\n',
                     '[Service]\nIPAddressAllow=38.101.151.13/32\nExecStart=/bin/sh\n',
                     '[Service]\nIPAddressAllow=38.101.151.13/32\n[Service]\n',
                     '[Unit]\nIPAddressAllow=38.101.151.13/32\n',
                     '[Service]\nIPAddressAllow=2001:db8::1/128\n', '[Service]\nIPAddressDeny=\n'):
            with self.subTest(text=text), self.assertRaises(addresses.Refusal):
                addresses.parse_dropin(text)
        code, out = self.run_main(['check', '--dropin', str(self.dropin_file('[Service]\nIPAddressAllow=any\n'))],
                                  fake_dns(*MEASURED))
        self.assertEqual((code, json.loads(out)['error']), (2, 'DROPIN_INVALID'))

    def test_render_refuses_a_non_public_address_from_dns(self):
        for ip in ('169.254.169.254', '10.1.2.3', '127.0.0.1'):
            with self.subTest(ip=ip):
                code, out = self.run_main(['render'], fake_dns(*MEASURED, ip))
                self.assertEqual((code, json.loads(out)['error']), (2, 'DROPIN_INVALID'))

    def test_render_is_deterministic_and_equals_the_reviewed_dropin_for_the_measured_answer(self):
        code, out = self.run_main(['render'], fake_dns(*reversed(MEASURED)))
        self.assertEqual(code, 0)
        self.assertEqual(out, DROPIN.read_text())
        self.assertEqual({str(a) for a in addresses.parse_dropin(out)}, set(MEASURED))


class Completed:
    def __init__(self, returncode=0, stdout=b''):
        self.returncode, self.stdout = returncode, stdout


class AddressWatchAndUpdateTests(unittest.TestCase):
    def folder(self):
        folder = Path(tempfile.mkdtemp(prefix='gate-watch-'))
        self.addCleanup(shutil.rmtree, folder, True)
        return folder

    def run_main(self, argv, lookup, run=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=lookup, **({'run': run} if run else {}))
        return code, json.loads(out.getvalue().splitlines()[-1])

    def test_watch_announces_each_change_once_and_again_after_it_is_resolved(self):
        state = self.folder() / 'announced'
        argv = ['watch', '--dropin', str(DROPIN), '--state', str(state)]
        changed = fake_dns(*MEASURED, '38.101.151.31')
        code, line = self.run_main(argv, changed)
        self.assertEqual((code, line['error'], line['new'], line['announced']), (3, 'DEEPINFRA_ADDRESSES_CHANGED', ['38.101.151.31'], 'now'))
        self.assertEqual(oct(os.stat(state).st_mode & 0o777), '0o600')
        self.assertEqual(self.run_main(argv, changed)[0], 0)  # Same change: no second email.
        self.assertEqual(self.run_main(argv, changed)[1]['announced'], 'before')
        code, line = self.run_main(argv, fake_dns(*MEASURED, '38.101.151.32'))  # A different change.
        self.assertEqual((code, line['announced']), (3, 'now'))
        code, line = self.run_main(argv, fake_dns(*MEASURED))
        self.assertEqual((code, line['status']), (0, 'ok'))
        self.assertFalse(state.exists())  # In step again: the next change is announced.
        self.assertEqual(self.run_main(argv, changed)[0], 3)

    def test_watch_does_not_announce_a_temporary_dns_failure_but_does_a_broken_list(self):
        state = self.folder() / 'announced'
        self.assertEqual(self.run_main(['watch', '--dropin', str(DROPIN), '--state', str(state)], broken_dns),
                         (0, {'status': 'dns_unavailable', 'announced': False}))
        code, line = self.run_main(['watch', '--dropin', '/nonexistent/x.conf', '--state', str(state)], fake_dns(*MEASURED))
        self.assertEqual((code, line['error']), (3, 'DROPIN_UNREADABLE'))

    def test_update_writes_the_list_atomically_then_reloads_systemd(self):
        dropin = self.folder() / '50-deepinfra-addresses.conf'
        dropin.write_text(DROPIN.read_text())
        calls = []

        def run(argv, **kwargs):
            calls.append((argv, kwargs['env']))
            return Completed()
        old_umask = os.umask(0o077)
        try:
            code, line = self.run_main(['update', '--dropin', str(dropin)], fake_dns(*MEASURED[1:], '38.101.151.31'), run)
        finally:
            os.umask(old_umask)
        self.assertEqual((code, line['added'], line['stale'], line['allowed']), (0, ['38.101.151.31'], ['38.101.151.13'], 15))
        # Nothing listed is dropped: a DNS pool answering with changing subsets cannot flip the list.
        self.assertEqual(dropin.read_text(), addresses.render(addresses.resolve(fake_dns(*MEASURED, '38.101.151.31'))))
        self.assertEqual(oct(os.stat(dropin).st_mode & 0o777), '0o644')
        self.assertEqual(calls, [(['/usr/bin/systemctl', 'daemon-reload'], {})])
        self.assertEqual(sorted(p.name for p in dropin.parent.iterdir()), [dropin.name])

    def test_update_refuses_a_non_public_dns_answer_and_writes_nothing(self):
        dropin = self.folder() / '50-deepinfra-addresses.conf'
        dropin.write_text(DROPIN.read_text())
        code, line = self.run_main(['update', '--dropin', str(dropin)], fake_dns('10.0.0.1'),
                                   lambda *a, **k: self.fail('no reload'))
        self.assertEqual((code, line['error']), (2, 'DROPIN_INVALID'))
        self.assertEqual(dropin.read_text(), DROPIN.read_text())

    def test_update_reports_a_failed_reload(self):
        dropin = self.folder() / '50-deepinfra-addresses.conf'
        code, line = self.run_main(['update', '--dropin', str(dropin)], fake_dns(*MEASURED), lambda *a, **k: Completed(1))
        self.assertEqual((code, line['error']), (2, 'DAEMON_RELOAD_FAILED'))


class HaltWatchTests(unittest.TestCase):
    PRIVATE = '/var/lib/debateai-v3-preview/provider-team-authority-v2'

    def setUp(self):
        folder = Path(tempfile.mkdtemp(prefix='gate-halt-watch-'))
        self.addCleanup(shutil.rmtree, folder, True)
        self.state = folder / 'announced-halt.json'
        self.calls = []

    def runner(self, status, status_code=0, notice_code=0):
        def run(argv, **kwargs):
            self.calls.append(argv)
            self.assertEqual(kwargs['env'], {})
            if argv[0] == gate_watch.PYTHON:
                return Completed(status_code, (json.dumps(status) + '\n').encode())
            return Completed(notice_code)
        return run

    def watch(self, status, **kwargs):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = gate_watch.main(['--private', self.PRIVATE, '--state', str(self.state)], run=self.runner(status, **kwargs))
        return code, json.loads(out.getvalue())

    def notices(self):
        return [argv for argv in self.calls if argv[0] == gate_watch.SYSTEMCTL]

    def test_asks_the_gate_for_read_only_status_and_does_nothing_while_active(self):
        self.assertEqual(self.watch({'state': 'active', 'reason': None, 'halted_at': None}), (0, {'status': 'ok', 'state': 'active'}))
        self.assertEqual(self.calls, [[gate_watch.PYTHON, '-I', str(V2 / 'preview_budget_authority.py'), 'status', '--private', self.PRIVATE]])
        self.assertFalse(self.state.exists())

    def test_one_notice_per_halt_queued_without_waiting(self):
        halted = {'state': 'halted', 'reason': 'provider_unreachable', 'halted_at': '2026-10-09T18:00:00+00:00',
                  'today_spend_usd': '1.23'}
        code, line = self.watch(halted)
        self.assertEqual((code, line['announced'], line['reason']), (0, 'now', 'provider_unreachable'))
        self.assertEqual(self.notices(), [[gate_watch.SYSTEMCTL, 'start', '--no-block',
                                           'debateai-preview-notice@gate-halted-provider_unreachable.service']])
        self.assertEqual(oct(os.stat(self.state).st_mode & 0o777), '0o600')
        self.assertEqual(self.watch(halted)[1]['announced'], 'before')
        self.watch({'state': 'active', 'reason': None, 'halted_at': halted['halted_at']})
        self.watch(halted)  # Still the same halt (re-activation then the same moment is impossible).
        self.assertEqual(len(self.notices()), 1)
        self.watch({**halted, 'halted_at': '2026-10-09T19:00:00+00:00', 'reason': 'uncertain_charge'})
        self.assertEqual(self.notices()[-1][-1], 'debateai-preview-notice@gate-halted-uncertain_charge.service')
        self.assertEqual(len(self.notices()), 2)
        self.assertNotIn('1.23', json.dumps(self.calls))

    def test_an_odd_reason_never_reaches_a_unit_name(self):
        self.watch({'state': 'halted', 'reason': 'x.service; rm -rf /', 'halted_at': 't'})
        self.assertEqual(self.notices()[-1][-1], 'debateai-preview-notice@gate-halted-unknown.service')

    def test_broken_status_or_notice_fails_the_watcher_so_the_alert_emails(self):
        self.assertEqual(self.watch({'status': 'refused', 'error': 'STATE_MISSING'}, status_code=2),
                         (1, {'status': 'refused', 'error': 'STATUS_UNAVAILABLE'}))
        code, line = self.watch({'state': 'halted', 'reason': 'operator_stop', 'halted_at': 't'}, notice_code=1)
        self.assertEqual((code, line['error']), (1, 'NOTICE_NOT_QUEUED'))
        self.assertTrue(self.state.exists())  # Recorded before queuing: never two emails for one halt.

    def test_halt_watch_unit_is_root_without_network_and_never_sees_the_key(self):
        start = values(HALT_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[:3], ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py'])
        options = dict(zip(start[3::2], start[4::2]))
        self.assertEqual(options['--private'], self.PRIVATE)
        self.assertTrue(options['--state'].startswith('/var/lib/debateai-preview-gate-watch/'))
        self.assertEqual(values(HALT_UNIT, 'StateDirectory'), ['debateai-preview-gate-watch'])
        self.assertIn('-' + self.PRIVATE + '/api-key.txt', ' '.join(values(HALT_UNIT, 'InaccessiblePaths')).split())
        self.assertEqual((values(HALT_UNIT, 'RestrictAddressFamilies'), values(HALT_UNIT, 'IPAddressDeny'),
                          values(HALT_UNIT, 'IPAddressAllow')), (['AF_UNIX'], ['any'], []))
        self.assertEqual(values(HALT_UNIT, 'CapabilityBoundingSet'), [''])
        self.assertEqual(values(HALT_UNIT, 'ReadWritePaths'), [])
        self.assertEqual(values(HALT_UNIT, 'OnFailure'), ['debateai-preview-alert@%n.service'])

    def test_notice_template_runs_the_alert_with_the_notice_name_only(self):
        notice = LIFECYCLE / 'debateai-preview-notice@.service'
        self.assertEqual(values(notice, 'ExecStart'), [
            '/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node '
            '/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --notice %i'])
        self.assertEqual(values(notice, 'OnFailure'), [])


class UnitFileTests(unittest.TestCase):
    def test_exec_lines_are_isolated_python_with_the_v2_command_line_and_fresh_socket(self):
        gate = load(GATE, 'gate_for_unit_test')  # Import only: no helper runs, no phase starts.
        execs = values(UNIT, 'ExecStartPre') + values(UNIT, 'ExecStart')
        self.assertEqual(len(execs), 3)
        for line in execs:
            self.assertTrue(line.startswith('/usr/bin/python3 -I '), line)
        start = values(UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[2:4], [OPERATOR + 'preview_budget_authority.py', 'serve'])
        self.assertNotIn('--helper', start)
        options = dict(zip(start[4::2], start[5::2]))
        self.assertEqual(set(options), {'--private', '--go', '--socket'})
        self.assertTrue(gate.socket_path_allowed(options['--socket']))
        self.assertEqual(options['--socket'], '/run/debateai-v3-preview/team-budget-v2.sock')
        self.assertEqual(values(UNIT, 'ReadWritePaths'), [options['--private'] + ' /run/debateai-v3-preview'])
        check = values(UNIT, 'ExecStartPre')[0].split()
        self.assertEqual(check[2:], [OPERATOR + 'deepinfra_addresses.py', 'check', '--dropin', INSTALLED_DROPIN])
        watch = values(CHECK_UNIT, 'ExecStart')[0].split()
        self.assertEqual(watch[2:], [OPERATOR + 'deepinfra_addresses.py', 'watch', '--dropin', INSTALLED_DROPIN,
                                     '--state', '/var/lib/debateai-preview-gate-addresses/announced'])
        self.assertEqual(values(CHECK_UNIT, 'StateDirectory'), ['debateai-preview-gate-addresses'])
        self.assertEqual(values(CHECK_UNIT, 'DynamicUser'), ['yes'])
        self.assertEqual(values(CHECK_UNIT, 'OnFailure'), ['debateai-preview-notice@gate-addresses-mismatch.service'])

    def test_network_is_deny_all_but_localhost_with_deepinfra_only_from_the_checked_dropin(self):
        self.assertEqual(values(UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(values(UNIT, 'IPAddressAllow'), ['127.0.0.53/32'])  # The resolver stub only.
        self.assertEqual(values(UNIT, 'RestrictAddressFamilies'), ['AF_UNIX AF_INET AF_INET6'])
        self.assertEqual({key for key, _ in directives(DROPIN)}, {'IPAddressAllow'})
        self.assertEqual(values(CHECK_UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(values(CHECK_UNIT, 'IPAddressAllow'), ['127.0.0.53/32'])

    def test_measured_v1_hardening_is_kept(self):
        expected = {'User': 'root', 'Group': 'root', 'UMask': '0077', 'NoNewPrivileges': 'yes',
                    'CapabilityBoundingSet': '', 'AmbientCapabilities': '', 'LimitCORE': '0', 'PrivateTmp': 'yes',
                    'PrivateDevices': 'yes', 'ProtectSystem': 'strict', 'ProtectHome': 'yes',
                    'ProtectKernelTunables': 'yes', 'ProtectKernelModules': 'yes', 'ProtectKernelLogs': 'yes',
                    'ProtectControlGroups': 'yes', 'ProtectClock': 'yes', 'ProtectProc': 'invisible',
                    'ProcSubset': 'pid', 'RestrictNamespaces': 'yes', 'RestrictRealtime': 'yes',
                    'RestrictSUIDSGID': 'yes', 'LockPersonality': 'yes', 'RemoveIPC': 'yes', 'Type': 'simple'}
        self.assertEqual({key: values(UNIT, key) for key in expected}, {key: [v] for key, v in expected.items()})
        hidden = ' '.join(values(UNIT, 'InaccessiblePaths')).split()
        for path in ('/etc/debateai-v3-preview/api', '/etc/debateai-v3-preview/runner', '/etc/debateai-v3-preview/api.env',
                     '/root', '/var/lib/postgresql', '/etc/postfix', '/etc/debateai-v3-preview/auth-dev-v1',
                     '/var/lib/debateai-v3-preview/provider-test-authority', '/var/lib/debateai-v3-preview/api'):
            self.assertIn('-' + path, hidden)

    def test_restart_policy_and_stop_budget(self):
        gate = load(GATE, 'gate_for_stop_test')
        self.assertEqual([values(UNIT, k) for k in ('Restart', 'RestartMode', 'RestartSec', 'StartLimitBurst',
                                                    'StartLimitIntervalSec', 'OnFailure', 'KillSignal')],
                         [['on-failure'], ['direct'], ['30'], ['4'], ['900'], ['debateai-preview-alert@%n.service'],
                          ['SIGTERM']])
        stop = int(values(UNIT, 'TimeoutStopSec')[0])
        # A call in flight: request read, its whole deadline, two lock waits, then the drain reply.
        self.assertGreaterEqual(stop, gate.IPC_READ_TIMEOUT_SECONDS + gate.CALL_DEADLINE_SECONDS
                                + 2 * gate.LOCK_TIMEOUT_SECONDS + gate.DRAIN_REPLY_SECONDS + 10)

    def test_no_install_section_the_lifecycle_target_pulls_it_in(self):
        target = LIFECYCLE / 'debateai-preview.target'
        wanted = ' '.join(values(target, 'Wants')).split()
        for name in ('debateai-preview-provider-budget.service', 'debateai-preview-gate-halt-watch.timer',
                     'debateai-preview-gate-addresses.timer'):
            self.assertIn(name, wanted)
        for path in (UNIT, TIMER, HALT_TIMER, HALT_UNIT, CHECK_UNIT):  # Only the target starts them.
            self.assertNotIn('[Install]', path.read_text().splitlines(), path.name)
        self.assertEqual((values(TIMER, 'OnUnitActiveSec'), values(HALT_TIMER, 'OnUnitActiveSec')), (['1h'], ['1min']))

    def test_no_secret_or_machine_specific_path_in_the_folder(self):
        for path in sorted(V2.rglob('*')):
            if path.is_file():
                text = path.read_text()
                with self.subTest(path=path.name):
                    self.assertNotIn('/Users/', text)
                    self.assertNotIn('/home/', text)
                    self.assertIsNone(re.search(r'(?i)bearer\s+[a-z0-9]{8}', text))
                    if path.suffix != '.md':  # The README names the retired socket to explain it.
                        self.assertNotIn('provider-budget.sock', text)

    def test_files_have_no_world_writable_mode_in_git(self):
        for path in (UNIT, DROPIN, CHECK_UNIT, TIMER, HALT_UNIT, HALT_TIMER, V2 / 'deepinfra_addresses.py', V2 / 'gate_watch.py'):
            self.assertFalse(os.stat(path).st_mode & 0o022, path)


if __name__ == '__main__':
    unittest.main()
