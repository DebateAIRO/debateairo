"""The Perplexity gate's systemd files, its address check and its install guide (deploy/preview-gate/v3; plan 2026-10-30,
task W1-1).

Offline only: no DNS, no network, no systemd. A fake resolver stands in for getaddrinfo and a fake runner for systemctl.
"""
import contextlib
import importlib.util
import io
import json
import re
import shutil
import socket
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
V3 = ROOT / 'deploy/preview-gate/v3'
V2 = ROOT / 'deploy/preview-gate/v2'
SYSTEMD = V3 / 'systemd'
UNIT = SYSTEMD / 'debateai-preview-perplexity-budget.service'
HALT_UNIT, HALT_TIMER = SYSTEMD / 'debateai-preview-perplexity-halt-watch.service', SYSTEMD / 'debateai-preview-perplexity-halt-watch.timer'
CHECK_UNIT, CHECK_TIMER = SYSTEMD / 'debateai-preview-perplexity-addresses.service', SYSTEMD / 'debateai-preview-perplexity-addresses.timer'
TARGET_DROPIN = SYSTEMD / 'debateai-preview.target.d/50-perplexity-gate.conf'
ANTHROPIC_UNIT, ANTHROPIC_HALT = SYSTEMD / 'debateai-preview-anthropic-budget.service', SYSTEMD / 'debateai-preview-anthropic-halt-watch.service'
DEEPINFRA_UNIT = SYSTEMD / 'debateai-preview-provider-budget.service'
DEEPINFRA_HALT, DEEPINFRA_CHECK = SYSTEMD / 'debateai-preview-gate-halt-watch.service', SYSTEMD / 'debateai-preview-gate-addresses.service'
README = V3 / 'README-perplexity.md'
GATE = ROOT / 'packages/providers/ops/preview_budget_authority.py'
ALERT = ROOT / 'deploy/preview-lifecycle/v1/alert.mjs'
RELAY = ROOT / 'tools/preview-practice/gate-relay.py'
OPERATOR = '/opt/debateai-v3-preview/operator/perplexity-budget-v1/'
PRIVATE = '/var/lib/debateai-v3-preview/provider-perplexity-authority-v1'
GO = '/etc/debateai-v3-preview/provider-perplexity-go-v1.json'
SOCKET = '/run/debateai-v3-preview/perplexity-budget-v1.sock'
DROPIN = '/etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf'
GATES = {
    'deepinfra': ('/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json'),
    'anthropic': ('/var/lib/debateai-v3-preview/provider-anthropic-authority-v1', '/etc/debateai-v3-preview/provider-anthropic-go-v1.json'),
    'perplexity': (PRIVATE, GO),
    'google': ('/var/lib/debateai-v3-preview/provider-google-authority-v1', '/etc/debateai-v3-preview/provider-google-go-v1.json'),
    'team-v2': ('/var/lib/debateai-v3-preview/provider-team-authority-v2', '/etc/debateai-v3-preview/provider-team-go-v2.json'),
}


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


addresses = load(V3 / 'perplexity_addresses.py', 'perplexity_addresses')
gate = load(GATE, 'production_preview_budget_authority_for_perplexity_units')  # Import only: no helper runs.
gate_watch = load(V2 / 'gate_watch.py', 'gate_watch_perplexity_unit')


def directives(path):
    pairs = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith(('#', '[')):
            key, _, value = line.partition('=')
            pairs.append((key, value))
    return pairs


def values(path, key):
    return [value for name, value in directives(path) if name == key]


def without(path, changed):
    return [pair for pair in directives(path) if pair[0] not in changed]


def hidden_of(path):
    return set(' '.join(values(path, 'InaccessiblePaths')).split())


def answer(address, family=socket.AF_INET):
    return (family, socket.SOCK_STREAM, 6, '', (address, 443) if family == socket.AF_INET else (address, 443, 0, 0))


class FakeResolver:
    def __init__(self, result):
        self.result, self.calls = result, []

    def __call__(self, host, port, family, kind):
        self.calls.append((host, port, family, kind))
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


class Completed:
    def __init__(self, code):
        self.returncode = code


class GateUnitTests(unittest.TestCase):
    def test_exec_lines_name_the_perplexity_gate_go_state_socket_and_its_address_check(self):
        self.assertEqual(values(UNIT, 'ExecStartPre'),
                         ['/usr/bin/python3 -I ' + OPERATOR + 'perplexity_addresses.py check --dropin ' + DROPIN])
        start = values(UNIT, 'ExecStart')
        self.assertEqual(len(start), 1)
        start = start[0].split()
        self.assertEqual(start[:4], ['/usr/bin/python3', '-I', OPERATOR + 'preview_budget_authority.py', 'serve'])
        self.assertEqual(dict(zip(start[4::2], start[5::2])), {'--private': PRIVATE, '--go': GO, '--socket': SOCKET})
        self.assertTrue(gate.socket_path_allowed(SOCKET))
        self.assertEqual(values(UNIT, 'ReadWritePaths'), [PRIVATE + ' /run/debateai-v3-preview'])
        self.assertEqual(values(UNIT, 'Documentation'), ['file://' + OPERATOR + 'README-perplexity.md'])
        self.assertEqual(gate.GATE_PATHS['perplexity'], (PRIVATE, GO))

    def test_egress_is_ipv4_only_to_the_resolver_stub_and_the_checked_dropin(self):
        self.assertEqual(values(UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(values(UNIT, 'IPAddressAllow'), ['127.0.0.53/32'])  # The /32s come from the drop-in only.
        self.assertEqual(values(UNIT, 'RestrictAddressFamilies'), ['AF_UNIX AF_INET'])
        self.assertEqual(addresses.HOST, 'api.perplexity.ai')
        self.assertIn(DROPIN, addresses.HEADER)

    def test_everything_else_is_the_reviewed_anthropic_unit(self):
        changed = {'Description', 'Documentation', 'ExecStartPre', 'ExecStart', 'ReadWritePaths', 'InaccessiblePaths',
                   'IPAddressAllow'}
        self.assertEqual(without(UNIT, changed), without(ANTHROPIC_UNIT, changed))
        hidden, anthropic = hidden_of(UNIT), hidden_of(ANTHROPIC_UNIT)
        self.assertEqual(hidden - anthropic, {'-' + GATES['anthropic'][0], '-' + GATES['anthropic'][1]})
        self.assertEqual(anthropic - hidden, {'-' + PRIVATE, '-' + GO})

    def test_watchers_follow_the_perplexity_gate_with_their_own_state_and_notices(self):
        start = values(HALT_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[:3], ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py'])
        args = gate_watch.parse_args(start[3:])
        self.assertEqual((str(args.private), args.notice, args.unbilled_alert_at), (PRIVATE, 'perplexity-halted', 100))
        self.assertEqual(values(HALT_UNIT, 'StateDirectory'), ['debateai-preview-perplexity-halt-watch'])
        self.assertTrue(str(args.state).startswith('/var/lib/debateai-preview-perplexity-halt-watch/'))
        self.assertIn('-' + PRIVATE + '/api-key.txt', hidden_of(HALT_UNIT))
        same = {'Description', 'ExecStart', 'StateDirectory', 'InaccessiblePaths'}
        self.assertEqual(without(HALT_UNIT, same), without(ANTHROPIC_HALT, same))
        check = values(CHECK_UNIT, 'ExecStart')[0].split()
        self.assertEqual(check[:4], ['/usr/bin/python3', '-I', OPERATOR + 'perplexity_addresses.py', 'watch'])
        options = dict(zip(check[4::2], check[5::2]))
        self.assertEqual(options['--dropin'], DROPIN)
        self.assertTrue(options['--state'].startswith('/var/lib/debateai-preview-perplexity-addresses/'))
        self.assertEqual(values(CHECK_UNIT, 'StateDirectory'), ['debateai-preview-perplexity-addresses'])
        self.assertEqual(values(CHECK_UNIT, 'OnFailure'), ['debateai-preview-notice@perplexity-addresses-mismatch.service'])
        same = {'Description', 'ExecStart', 'StateDirectory', 'OnFailure'}
        self.assertEqual(without(CHECK_UNIT, same), without(DEEPINFRA_CHECK, same))
        for timer, v2 in ((HALT_TIMER, V2 / 'systemd/debateai-preview-gate-halt-watch.timer'),
                          (CHECK_TIMER, V2 / 'systemd/debateai-preview-gate-addresses.timer')):
            with self.subTest(timer=timer.name):
                self.assertEqual(without(timer, {'Description'}), without(v2, {'Description'}))

    def test_the_halt_watcher_knows_the_three_perplexity_notices(self):
        self.assertIn('perplexity-halted', gate_watch.NOTICE_KINDS)
        self.assertEqual((gate_watch.UNBILLED_KINDS['perplexity-halted'], gate_watch.BOOKED_KINDS['perplexity-halted']),
                         ('perplexity-unbilled', 'perplexity-booked'))
        calls = []

        def run(argv, **_kwargs):
            calls.append(argv)
            return Completed(0)
        self.assertEqual(gate_watch.queue_notice('uncertain_charge', run, 'perplexity-halted'),
                         'debateai-preview-notice@perplexity-halted-uncertain_charge.service')
        self.assertEqual(gate_watch.queue_notice('3_2026_10_30', run, 'perplexity-booked'),
                         'debateai-preview-notice@perplexity-booked-3_2026_10_30.service')
        with self.assertRaises(gate_watch.WatchError):
            gate_watch.queue_notice('x', run, 'perplexity-addresses')

    def test_the_alert_mails_each_perplexity_notice_with_this_gates_own_command(self):
        text = ALERT.read_text()
        self.assertIn('perplexity-halted|perplexity-addresses|perplexity-unbilled|perplexity-booked', text)
        self.assertIn("PERPLEXITY_PRIVATE = '%s'" % PRIVATE, text)
        self.assertIn('preview_budget_authority.py activate --private ${PERPLEXITY_PRIVATE} --go %s' % GO, text)
        self.assertIn('perplexity_addresses.py update --dropin %s && systemctl restart debateai-preview-perplexity-budget'
                      % DROPIN, text)
        self.assertIn("PERPLEXITY_FOLDER = '%s'" % OPERATOR.rstrip('/'), text)

    def test_every_unit_hides_every_gate_state_it_does_not_need(self):
        """Each gate unit hides every OTHER gate's private folder (its key, ledgers) and GO, Perplexity's included; each
        halt watcher also hides its own key file; a unit that reads no gate state (the address checks) hides the whole
        preview state and configuration."""
        units = sorted(SYSTEMD.glob('*.service'))
        self.assertGreaterEqual(len(units), 9)
        for unit in units:
            with self.subTest(unit=unit.name):
                hidden = hidden_of(unit)
                start = ' '.join(values(unit, 'ExecStart')).split()
                own = start[start.index('--private') + 1] if '--private' in start else None
                if own is None:
                    self.assertLessEqual({'-/var/lib/debateai-v3-preview', '-/etc/debateai-v3-preview'}, hidden)
                    continue
                self.assertIn(own, [state for state, _go in GATES.values()])
                for state, go in GATES.values():
                    if state != own:
                        self.assertLessEqual({'-' + state, '-' + go}, hidden)
                self.assertNotIn('-' + own, hidden)
                if 'gate_watch.py' in ' '.join(start):
                    self.assertIn('-' + own + '/api-key.txt', hidden)

    def test_the_target_dropin_wants_exactly_the_three_new_units(self):
        wanted = ' '.join(values(TARGET_DROPIN, 'Wants')).split()
        self.assertEqual(sorted(wanted), sorted([UNIT.name, HALT_TIMER.name, CHECK_TIMER.name]))
        for name in wanted:
            self.assertTrue((SYSTEMD / name).is_file(), name)
        for path in (UNIT, HALT_UNIT, CHECK_UNIT, HALT_TIMER, CHECK_TIMER, TARGET_DROPIN):
            self.assertNotIn('[Install]', path.read_text().splitlines())


class ReadmeTests(unittest.TestCase):
    def setUp(self):
        self.readme = README.read_text()

    def test_readme_names_the_paths_the_price_the_pot_and_the_key_command(self):
        for name in (OPERATOR, PRIVATE, GO, SOCKET, DROPIN, 'preview-provider-budget-go-v3', '"perplexity"',
                     'perplexity-search-fast', '$0.001', '"1.00"', '1000', '$17.00', 'TEAM_TOTAL_BUDGET_EXCEEDED',
                     'preview_key.py install perplexity', 'perplexity_budget_socket', 'api.perplexity.ai', '/search',
                     'search_type', '"fast"', 'getent ahostsv4 api.perplexity.ai', 'perplexity_addresses.py render',
                     'PERPLEXITY_ADDRESSES_CHANGED', 'MODEL_COOLING', 'PROVIDER_REFUSED_UNBILLED', 'PROVIDER_ERROR_UNBILLED',
                     'PROVIDER_CHARGE_BOOKED_MAX', '429', '422', UNIT.name, HALT_TIMER.name, CHECK_TIMER.name,
                     TARGET_DROPIN.name, 'systemctl show -p InaccessiblePaths', 'Other hosted servers', 'web search'):
            self.assertIn(name, self.readme)
        self.assertIn('README-perplexity.md', (V3 / 'README.md').read_text())

    def test_the_go_is_the_owners_pot(self):
        go = re.search(r"jq -n [^\n]*provider:\"perplexity\"[^\n]*", self.readme).group(0)
        for field in ('daily_budget_usd:"1.00"', 'max_paid_posts_per_day:1000', 'max_concurrent_calls:10',
                      'enabled_models:["perplexity-search-fast"]'):
            self.assertIn(field, go)
        self.assertNotIn('max_final_writer_calls', go)
        api_scope = re.search(r'scope_id:"([^"]+)"', go).group(1)
        self.assertEqual(api_scope, 'preview-deepinfra-v3-20261010')  # Every gate is asked with the app's one scope_id.

    def test_the_older_units_are_reinstalled_and_checked_live_before_the_key(self):
        step, key = self.readme.index('**3a. Re-install the four older gate units'), self.readme.index('**4. The Perplexity key.')
        self.assertLess(step, key)
        block = self.readme[step:key]
        for needed in (DEEPINFRA_UNIT.name, DEEPINFRA_HALT.name, ANTHROPIC_UNIT.name, ANTHROPIC_HALT.name,
                       'systemctl daemon-reload', 'systemctl show -p InaccessiblePaths debateai-preview-provider-budget.service',
                       'systemctl show -p InaccessiblePaths debateai-preview-anthropic-budget.service', PRIVATE, GO):
            self.assertIn(needed, block)

    def test_the_probe_runs_in_the_generic_fence_and_must_pass_before_the_search_is_switched_on(self):
        line = next(text for text in self.readme.splitlines() if text.startswith('systemd-run') and ' probe ' in text)
        self.assertIn('--unit=' + gate.probe_unit_name('perplexity').removesuffix('.service') + ' ', line)
        for needed in ('IPAddressDeny=any', 'NoNewPrivileges=yes', '-p CapabilityBoundingSet= ', '--model perplexity-search-fast',
                       "-p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' " + DROPIN + ')',
                       "'RestrictAddressFamilies=AF_UNIX AF_INET'"):
            self.assertIn(needed, line)
        hidden = re.search(r"InaccessiblePaths=([^']*)'", line).group(1).split()
        others = [path for name, pair in gate.GATE_PATHS.items() if name != 'perplexity' for path in pair]
        for path in [*others, *gate.RETIRED_GATE_PATHS]:
            self.assertIn('-' + path, hidden)
        self.assertFalse(any('-' + path in hidden for path in gate.GATE_PATHS['perplexity']))
        probe, switch_on = self.readme.index('**8. Probe'), self.readme.index('## Switch it on')
        self.assertLess(probe, switch_on)
        self.assertIn('It must pass before web search is switched on.', self.readme[probe:switch_on])

    def test_every_other_gates_probe_line_hides_the_perplexity_gate(self):
        for readme, provider in ((V3 / 'README.md', 'deepinfra'), (V3 / 'README-anthropic.md', 'anthropic')):
            with self.subTest(provider=provider):
                line = next(text for text in readme.read_text().splitlines()
                            if text.startswith('systemd-run') and ' probe ' in text)
                hidden = re.search(r"InaccessiblePaths=([^']*)'", line).group(1).split()
                self.assertLessEqual({'-' + PRIVATE, '-' + GO}, set(hidden))


class AddressCheckTests(unittest.TestCase):
    def run_main(self, argv, resolver, run=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=resolver, **({} if run is None else {'run': run}))
        lines = out.getvalue().splitlines()
        return code, (json.loads(lines[0]) if len(lines) == 1 and lines[0].startswith('{') else out.getvalue())

    def folder(self):
        folder = Path(tempfile.mkdtemp(prefix='perplexity-addresses-'))
        self.addCleanup(shutil.rmtree, folder, True)
        return folder

    def test_render_check_and_a_new_address(self):
        folder = self.folder()
        dropin = folder / '50-perplexity-addresses.conf'
        resolver = FakeResolver([answer('104.18.27.48'), answer('104.18.26.48'), answer('104.18.27.48')])
        code, text = self.run_main(['render'], resolver)
        self.assertEqual(code, 0)
        self.assertEqual(text, addresses.HEADER + '[Service]\nIPAddressAllow=104.18.26.48/32\nIPAddressAllow=104.18.27.48/32\n')
        self.assertEqual(resolver.calls, [('api.perplexity.ai', 443, socket.AF_INET, socket.SOCK_STREAM)])
        dropin.write_text(text)
        self.assertEqual(self.run_main(['check', '--dropin', str(dropin)], resolver),
                         (0, {'status': 'ok', 'host': 'api.perplexity.ai', 'allowed': 2, 'resolved': 2, 'new': [], 'stale': []}))
        code, line = self.run_main(['check', '--dropin', str(dropin)], FakeResolver([answer('104.18.28.48')]))
        self.assertEqual((code, line['error'], line['new'], line['stale']),
                         (2, 'PERPLEXITY_ADDRESSES_CHANGED', ['104.18.28.48'], ['104.18.26.48', '104.18.27.48']))

    def test_render_refuses_a_non_public_address_and_dns_failure_refuses(self):
        for result in ([answer('10.0.0.1')], [answer('127.0.0.1')], [answer('192.168.1.1')]):
            with self.subTest(result=result):
                self.assertEqual(self.run_main(['render'], FakeResolver(result)), (2, {'status': 'refused', 'error': 'DROPIN_INVALID'}))
        self.assertEqual(self.run_main(['render'], FakeResolver(socket.gaierror(-2, 'x'))),
                         (2, {'status': 'refused', 'error': 'DNS_UNAVAILABLE'}))

    def test_watch_announces_a_change_once(self):
        folder = self.folder()
        dropin, state = folder / 'd.conf', folder / 'announced'
        dropin.write_text(addresses.render({addresses.ipaddress.IPv4Address('104.18.26.48')}))
        bad = FakeResolver([answer('104.18.99.1')])
        code, line = self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)], bad)
        self.assertEqual((code, line['error'], line['announced']), (3, 'PERPLEXITY_ADDRESSES_CHANGED', 'now'))
        self.assertEqual(self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)], bad)[0], 0)
        self.assertEqual(self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)],
                                       FakeResolver([answer('104.18.26.48')]))[0], 0)
        self.assertFalse(state.exists())

    def test_update_adds_todays_answer_reloads_and_names_the_perplexity_restart(self):
        folder = self.folder()
        dropin = folder / 'd.conf'
        dropin.write_text(addresses.render({addresses.ipaddress.IPv4Address('104.18.26.48')}))
        calls = []
        code, line = self.run_main(['update', '--dropin', str(dropin)], FakeResolver([answer('104.18.27.48')]),
                                   run=lambda argv, **_k: calls.append(argv) or Completed(0))
        self.assertEqual((code, line['added'], line['stale'], line['next']),
                         (0, ['104.18.27.48'], ['104.18.26.48'], 'systemctl restart debateai-preview-perplexity-budget'))
        self.assertEqual(calls, [['/usr/bin/systemctl', 'daemon-reload']])
        self.assertEqual(oct(dropin.stat().st_mode & 0o777), '0o644')
        self.assertIn('IPAddressAllow=104.18.26.48/32\nIPAddressAllow=104.18.27.48/32\n', dropin.read_text())

    def test_the_script_sends_no_key_and_opens_no_connection(self):
        script = (V3 / 'perplexity_addresses.py').read_text()
        for absent in ('api-key', 'Authorization', 'urllib', 'http.client', 'HTTPSConnection', 'create_connection', 'PROFILES'):
            self.assertNotIn(absent, script)


class PracticeRelayTests(unittest.TestCase):
    def test_the_relay_can_carry_the_perplexity_gate_when_asked(self):
        relay = load(RELAY, 'gate_relay_perplexity_unit')
        self.assertEqual(relay.DEFAULT_PERPLEXITY_GATE, SOCKET)
        self.assertEqual(relay.SOCKET_FILE_NAMES['perplexity'], 'perplexity.sock')
        args = relay.build_parser().parse_args(['--listen-dir', '/tmp/x', '--perplexity-gate', SOCKET])
        self.assertEqual(args.perplexity_gate, SOCKET)
        self.assertIsNone(relay.build_parser().parse_args(['--listen-dir', '/tmp/x']).perplexity_gate)


if __name__ == '__main__':
    unittest.main()
