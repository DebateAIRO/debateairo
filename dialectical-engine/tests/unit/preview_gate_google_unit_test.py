"""The Google spending gate's reviewed systemd files, its halt notice and its README.

Offline only: no systemd, DNS, network or keys. The address tools have their own test
(preview_google_addresses_test.py); the gate's Google profile has preview_budget_authority_google_test.py.
"""
import contextlib
import importlib.util
import io
import re
import subprocess
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
V3 = ROOT / 'deploy/preview-gate/v3'
SYSTEMD = V3 / 'systemd'
UNIT = SYSTEMD / 'debateai-preview-google-budget.service'
LIST = SYSTEMD / 'debateai-preview-google-budget.service.d/40-google-egress-list.conf'
FORWARDER_DROPIN = SYSTEMD / 'debateai-preview-google-budget.service.d/40-google-egress-forwarder.conf'
SOCKET = SYSTEMD / 'debateai-preview-google-forwarder.socket'
FORWARDER = SYSTEMD / 'debateai-preview-google-forwarder.service'
HALT_UNIT = SYSTEMD / 'debateai-preview-google-halt-watch.service'
HALT_TIMER = SYSTEMD / 'debateai-preview-google-halt-watch.timer'
TARGET = SYSTEMD / 'debateai-preview.target.d/60-google-gate.conf'
HOSTS = V3 / 'google-gate-hosts'
README = V3 / 'README-google.md'
OPERATOR = '/opt/debateai-v3-preview/operator/google-budget-v1/'
PRIVATE = '/var/lib/debateai-v3-preview/provider-google-authority-v1'
GO = '/etc/debateai-v3-preview/provider-google-go-v1.json'
GATE_SOCKET = '/run/debateai-v3-preview/google-budget-v1.sock'
GOOGLE_FILES = (UNIT, LIST, FORWARDER_DROPIN, SOCKET, FORWARDER, HALT_UNIT, HALT_TIMER, TARGET, HOSTS, README)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate_watch = load(ROOT / 'deploy/preview-gate/v2/gate_watch.py', 'gate_watch_google')
bridge = load(ROOT / 'packages/providers/ops/preview_budget_authority.py', 'google_unit_bridge')


def entries(path, name):
    """Every value of one key, in file order (comments skipped)."""
    return [line.split('=', 1)[1] for line in path.read_text().splitlines()
            if not line.startswith('#') and line.startswith(name + '=')]


class GateUnitTests(unittest.TestCase):
    def test_the_gate_serves_its_own_state_go_and_socket(self):
        (start,) = entries(UNIT, 'ExecStart')
        self.assertEqual(start.split(), ['/usr/bin/python3', '-I', OPERATOR + 'preview_budget_authority.py', 'serve',
                                         '--private', PRIVATE, '--go', GO, '--socket', GATE_SOCKET])
        self.assertTrue(bridge.socket_path_allowed(GATE_SOCKET))
        self.assertEqual(entries(UNIT, 'ReadWritePaths'), [PRIVATE + ' /run/debateai-v3-preview'])
        self.assertEqual(entries(UNIT, 'User'), ['root'])

    def test_the_gate_alone_has_no_internet_and_no_key_sending_start_check(self):
        self.assertEqual(entries(UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(entries(UNIT, 'IPAddressAllow'), ['127.0.0.53/32'])
        self.assertEqual(entries(UNIT, 'ExecStartPre'), [])  # Each egress mode brings its own check.
        hidden = ' '.join(entries(UNIT, 'InaccessiblePaths'))
        for path in ('/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json',
                     '/var/lib/debateai-v3-preview/provider-team-authority-v2', '/etc/debateai-v3-preview/api'):
            self.assertIn('-' + path, hidden)
        for path in GOOGLE_FILES[:-2]:
            self.assertIsNone(re.search(r'^\[Install\]', path.read_text(), re.M), path)

    def test_list_mode_checks_the_rendered_list_before_every_start(self):
        (check,) = entries(LIST, 'ExecStartPre')
        self.assertEqual(check.split(), ['/usr/bin/python3', '-I', OPERATOR + 'google_addresses.py', 'check', '--dropin',
                                         '/etc/systemd/system/debateai-preview-google-budget.service.d/50-google-addresses.conf'])
        self.assertEqual(entries(LIST, 'Wants'), ['debateai-preview-google-addresses.timer'])
        self.assertEqual(entries(LIST, 'IPAddressAllow'), [])  # Only the rendered 50- file adds addresses.

    def test_forwarder_mode_gives_the_gate_only_a_private_loopback_and_its_own_hosts_file(self):
        self.assertEqual(entries(FORWARDER_DROPIN, 'PrivateNetwork'), ['yes'])
        self.assertEqual(entries(FORWARDER_DROPIN, 'JoinsNamespaceOf'), ['debateai-preview-google-forwarder.socket'])
        self.assertEqual(entries(FORWARDER_DROPIN, 'Requires'), ['debateai-preview-google-forwarder.socket'])
        self.assertEqual(entries(FORWARDER_DROPIN, 'BindReadOnlyPaths'), [OPERATOR + 'gate-hosts:/etc/hosts'])
        self.assertEqual(entries(FORWARDER_DROPIN, 'IPAddressAllow'), ['127.0.0.1/32'])
        (check,) = entries(FORWARDER_DROPIN, 'ExecStartPre')
        self.assertEqual(check.split(), ['/usr/bin/python3', '-I', OPERATOR + 'google_addresses.py', 'check-proxy'])
        lines = [line for line in HOSTS.read_text().splitlines() if line and not line.startswith('#')]
        self.assertEqual(lines, ['127.0.0.1 localhost', '127.0.0.1 generativelanguage.googleapis.com'])

    def test_the_forwarder_is_fixed_to_one_name_and_port_and_refuses_local_addresses(self):
        self.assertEqual(entries(SOCKET, 'ListenStream'), ['127.0.0.1:443'])
        self.assertEqual(entries(SOCKET, 'PrivateNetwork'), ['yes'])
        self.assertEqual(entries(SOCKET, 'JoinsNamespaceOf'), ['debateai-preview-google-budget.service'])
        (start,) = entries(FORWARDER, 'ExecStart')
        self.assertEqual(start.split()[-1], 'generativelanguage.googleapis.com:443')
        self.assertTrue(start.split()[0].endswith('/systemd-socket-proxyd'))
        self.assertEqual(entries(FORWARDER, 'DynamicUser'), ['yes'])
        self.assertEqual(entries(FORWARDER, 'PrivateNetwork'), [])  # It is the one unit with the normal network.
        self.assertEqual(entries(FORWARDER, 'IPAddressAllow'), ['127.0.0.53/32'])
        denied = ' '.join(entries(FORWARDER, 'IPAddressDeny')).split()
        for network in ('127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10',
                        '0.0.0.0/8', '224.0.0.0/3', 'fc00::/7', 'fe80::/10', '::ffff:0:0/96', '::/127'):
            self.assertIn(network, denied)
        hidden = ' '.join(entries(FORWARDER, 'InaccessiblePaths'))
        for path in ('/etc/debateai-v3-preview', '/var/lib/debateai-v3-preview', '/opt/debateai-v3-preview'):
            self.assertIn('-' + path, hidden)

    def test_the_halt_watcher_queues_the_google_notice_and_never_sees_the_key(self):
        (start,) = entries(HALT_UNIT, 'ExecStart')
        self.assertEqual(start.split(), ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py', '--private', PRIVATE, '--state',
                                         '/var/lib/debateai-preview-google-halt-watch/announced-halt.json', '--notice', 'google-halted'])
        self.assertIn('-' + PRIVATE + '/api-key.txt', ' '.join(entries(HALT_UNIT, 'InaccessiblePaths')))
        self.assertEqual(entries(HALT_UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(entries(HALT_TIMER, 'OnUnitActiveSec'), ['1min'])
        self.assertEqual(entries(TARGET, 'Wants'), ['debateai-preview-google-budget.service debateai-preview-google-halt-watch.timer'])

    def test_gate_watch_names_the_notice_kind_and_refuses_any_other(self):
        calls = []

        def run(argv, **_kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 0, b'', b'')
        self.assertEqual(gate_watch.queue_notice('charge_overrun', run, 'google-halted'),
                         'debateai-preview-notice@google-halted-charge_overrun.service')
        self.assertEqual(gate_watch.queue_notice('charge_overrun', run), 'debateai-preview-notice@gate-halted-charge_overrun.service')
        with self.assertRaisesRegex(gate_watch.WatchError, '^NOTICE_KIND_INVALID$'):
            gate_watch.queue_notice('x', run, 'other-halted')
        self.assertEqual(len(calls), 2)
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            gate_watch.main(['--private', PRIVATE, '--state', '/nonexistent/x', '--notice', 'gate-addresses'], run=run)


class ReadmeTests(unittest.TestCase):
    def test_the_readme_covers_every_server_step_in_plain_words(self):
        text = README.read_text()
        for needle in ('paid', 'Generative Language API', 'budget alert', 'google_addresses_measure.py', 'pinnable',
                       'debateai-preview-google-budget.service', PRIVATE, GO, GATE_SOCKET, OPERATOR, 'probe',
                       'completion_within_max_tokens', 'model_echoed_exactly', 'Re-open after a halt', 'Egress',
                       'Threat model', 'google_budget_socket', '"daily_budget_usd": "1.00"', '"max_paid_posts_per_day": 400',
                       '"max_concurrent_calls": 1', 'x-goog-api-key'):
            self.assertIn(needle, text)

    def test_no_file_holds_a_one_computer_path_or_a_key_shape(self):
        for path in GOOGLE_FILES:
            text = path.read_text()
            with self.subTest(path=path.name):
                self.assertNotIn('/Users/', text)
                self.assertNotIn('/home/', text)
                self.assertIsNone(re.search(r'AIza[0-9A-Za-z_-]{35}', text))


if __name__ == '__main__':
    unittest.main()
