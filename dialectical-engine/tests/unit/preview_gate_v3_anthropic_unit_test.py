"""The Anthropic gate's systemd files and its address check (deploy/preview-gate/v3).

Offline only: no DNS, no network, no systemd. A fake resolver stands in for getaddrinfo.
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
UNIT = SYSTEMD / 'debateai-preview-anthropic-budget.service'
HALT_UNIT, HALT_TIMER = SYSTEMD / 'debateai-preview-anthropic-halt-watch.service', SYSTEMD / 'debateai-preview-anthropic-halt-watch.timer'
CHECK_UNIT, CHECK_TIMER = SYSTEMD / 'debateai-preview-anthropic-addresses.service', SYSTEMD / 'debateai-preview-anthropic-addresses.timer'
TARGET_DROPIN = SYSTEMD / 'debateai-preview.target.d/50-anthropic-gate.conf'
DEEPINFRA_UNIT = SYSTEMD / 'debateai-preview-provider-budget.service'
DEEPINFRA_HALT, DEEPINFRA_CHECK = SYSTEMD / 'debateai-preview-gate-halt-watch.service', SYSTEMD / 'debateai-preview-gate-addresses.service'
README = V3 / 'README-anthropic.md'
GATE = ROOT / 'packages/providers/ops/preview_budget_authority.py'
OPERATOR = '/opt/debateai-v3-preview/operator/anthropic-budget-v1/'
PRIVATE = '/var/lib/debateai-v3-preview/provider-anthropic-authority-v1'
GO = '/etc/debateai-v3-preview/provider-anthropic-go-v1.json'
SOCKET = '/run/debateai-v3-preview/anthropic-budget-v1.sock'
DEEPINFRA_PRIVATE = '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3'
GOOGLE_PRIVATE = '/var/lib/debateai-v3-preview/provider-google-authority-v1'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


addresses = load(V3 / 'anthropic_addresses.py', 'anthropic_addresses')
gate = load(GATE, 'production_preview_budget_authority_for_readme')


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


class GateUnitTests(unittest.TestCase):
    def test_exec_lines_name_the_anthropic_gate_go_state_and_socket(self):
        gate = load(GATE, 'gate_for_anthropic_unit_test')  # Import only: no helper runs, no phase starts.
        self.assertEqual(values(UNIT, 'ExecStartPre'), ['/usr/bin/python3 -I ' + OPERATOR + 'anthropic_addresses.py check'])
        start = values(UNIT, 'ExecStart')
        self.assertEqual(len(start), 1)
        start = start[0].split()
        self.assertEqual(start[:4], ['/usr/bin/python3', '-I', OPERATOR + 'preview_budget_authority.py', 'serve'])
        self.assertEqual(dict(zip(start[4::2], start[5::2])), {'--private': PRIVATE, '--go': GO, '--socket': SOCKET})
        self.assertTrue(gate.socket_path_allowed(SOCKET))
        self.assertEqual(values(UNIT, 'ReadWritePaths'), [PRIVATE + ' /run/debateai-v3-preview'])
        self.assertEqual(values(UNIT, 'Documentation'), ['file://' + OPERATOR + 'README-anthropic.md'])

    def test_the_start_check_sends_no_key_and_reads_no_model_list(self):
        text = UNIT.read_text()
        self.assertNotIn('deepinfra_models', text)
        self.assertIn('never sends\n# the key', text)
        script = (V3 / 'anthropic_addresses.py').read_text()
        for absent in ('api-key', 'x-api-key', 'urllib', 'http.client', 'HTTPSConnection', 'create_connection', 'PROFILES'):
            self.assertNotIn(absent, script)

    def test_egress_is_ipv4_only_to_the_published_range_and_the_resolver_stub(self):
        self.assertEqual(values(UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(values(UNIT, 'IPAddressAllow'), ['127.0.0.53/32 ' + str(addresses.ALLOWED)])
        self.assertEqual(str(addresses.ALLOWED), '160.79.104.0/23')
        self.assertEqual(values(UNIT, 'RestrictAddressFamilies'), ['AF_UNIX AF_INET'])
        self.assertNotIn('2607:6bc0', UNIT.read_text())

    def test_everything_else_is_the_reviewed_deepinfra_v3_unit(self):
        changed = {'Description', 'Documentation', 'ExecStartPre', 'ExecStart', 'ReadWritePaths', 'InaccessiblePaths',
                   'RestrictAddressFamilies', 'IPAddressAllow'}
        self.assertEqual(without(UNIT, changed), without(DEEPINFRA_UNIT, changed))
        hidden = set(' '.join(values(UNIT, 'InaccessiblePaths')).split())
        deepinfra_hidden = set(' '.join(values(DEEPINFRA_UNIT, 'InaccessiblePaths')).split())
        # Each gate hides the other's state and GO (and both hide Google's); nothing else differs.
        self.assertEqual(hidden - deepinfra_hidden, {'-' + DEEPINFRA_PRIVATE, '-/etc/debateai-v3-preview/provider-deepinfra-go-v3.json'})
        self.assertEqual(deepinfra_hidden - hidden, {'-' + PRIVATE, '-' + GO})
        self.assertNotIn('-' + PRIVATE, hidden)

    def test_watchers_follow_the_anthropic_gate_with_their_own_state(self):
        start = values(HALT_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[:3], ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py'])
        options = dict(zip(start[3::2], start[4::2]))
        self.assertEqual(options['--private'], PRIVATE)
        self.assertEqual(values(HALT_UNIT, 'StateDirectory'), ['debateai-preview-anthropic-halt-watch'])
        self.assertTrue(options['--state'].startswith('/var/lib/debateai-preview-anthropic-halt-watch/'))
        hidden = ' '.join(values(HALT_UNIT, 'InaccessiblePaths')).split()
        for path in ('-' + PRIVATE + '/api-key.txt', '-' + DEEPINFRA_PRIVATE, '-' + GOOGLE_PRIVATE):
            self.assertIn(path, hidden)
        same = {'Description', 'ExecStart', 'StateDirectory', 'InaccessiblePaths'}
        self.assertEqual(without(HALT_UNIT, same), without(DEEPINFRA_HALT, same))
        check = values(CHECK_UNIT, 'ExecStart')[0].split()
        self.assertEqual(check[:4], ['/usr/bin/python3', '-I', OPERATOR + 'anthropic_addresses.py', 'watch'])
        self.assertEqual(values(CHECK_UNIT, 'StateDirectory'), ['debateai-preview-anthropic-addresses'])
        self.assertTrue(check[5].startswith('/var/lib/debateai-preview-anthropic-addresses/'))
        # Its own notice (anthropic-addresses): the email names this unit and the Anthropic check,
        # never DeepInfra's update command.
        self.assertEqual(values(CHECK_UNIT, 'OnFailure'), ['debateai-preview-notice@anthropic-addresses-mismatch.service'])
        self.assertEqual(options['--notice'], 'anthropic-halted')
        same = {'Description', 'ExecStart', 'StateDirectory', 'OnFailure'}
        self.assertEqual(without(CHECK_UNIT, same), without(DEEPINFRA_CHECK, same))
        for timer, v2 in ((HALT_TIMER, V2 / 'systemd/debateai-preview-gate-halt-watch.timer'),
                          (CHECK_TIMER, V2 / 'systemd/debateai-preview-gate-addresses.timer')):
            with self.subTest(timer=timer.name):
                self.assertEqual(without(timer, {'Description'}), without(v2, {'Description'}))
        # The watcher script is v2's (with its notice kinds); the operator copies it into the Anthropic folder.
        self.assertTrue((V2 / 'gate_watch.py').is_file())

    def test_the_halt_watcher_queues_the_anthropic_notice_unit(self):
        gate_watch = load(V2 / 'gate_watch.py', 'gate_watch_anthropic')
        calls = []

        def run(argv, **_kwargs):
            calls.append(argv)
            return type('Completed', (), {'returncode': 0})()
        self.assertIn('anthropic-halted', gate_watch.NOTICE_KINDS)
        self.assertEqual(gate_watch.queue_notice('uncertain_charge', run, 'anthropic-halted'),
                         'debateai-preview-notice@anthropic-halted-uncertain_charge.service')
        self.assertEqual(calls[-1], [gate_watch.SYSTEMCTL, 'start', '--no-block', 'debateai-preview-notice@anthropic-halted-uncertain_charge.service'])
        with self.assertRaises(gate_watch.WatchError):
            gate_watch.queue_notice('uncertain_charge', run, 'anthropic-addresses')

    def test_every_unit_hides_every_gate_state_it_does_not_need(self):
        """Each gate unit hides every OTHER gate's private folder (its key, ledgers) and GO; each halt
        watcher hides the other gates' folders and GOs and its own key file; a unit that reads no gate
        state (the address checks) hides the whole preview state and configuration."""
        gates = {
            'deepinfra': (DEEPINFRA_PRIVATE, '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json'),
            'anthropic': (PRIVATE, GO),
            'google': (GOOGLE_PRIVATE, '/etc/debateai-v3-preview/provider-google-go-v1.json'),
            'team-v2': ('/var/lib/debateai-v3-preview/provider-team-authority-v2', '/etc/debateai-v3-preview/provider-team-go-v2.json'),
        }
        units = sorted(SYSTEMD.glob('*.service'))
        self.assertGreaterEqual(len(units), 6)
        for unit in units:
            with self.subTest(unit=unit.name):
                hidden = set(' '.join(values(unit, 'InaccessiblePaths')).split())
                start = ' '.join(values(unit, 'ExecStart')).split()
                own = start[start.index('--private') + 1] if '--private' in start else None
                if own is None:
                    self.assertLessEqual({'-/var/lib/debateai-v3-preview', '-/etc/debateai-v3-preview'}, hidden)
                    continue
                self.assertIn(own, [state for state, _go in gates.values()])
                for state, go in gates.values():
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
        self.assertEqual([pair[0] for pair in directives(TARGET_DROPIN)], ['Wants', 'Wants'])
        for path in (UNIT, HALT_UNIT, CHECK_UNIT, HALT_TIMER, CHECK_TIMER, TARGET_DROPIN):
            self.assertNotIn('[Install]', path.read_text().splitlines())

    def test_readme_names_the_same_paths_the_proposed_go_and_the_key_command(self):
        readme = README.read_text()
        for name in (OPERATOR, PRIVATE, GO, SOCKET, 'preview-provider-budget-go-v3', '"anthropic"', '"1.00"', '400', '$4.00', 'systemctl show -p InaccessiblePaths', '3a.',
                     'claude-haiku-5-5', '0.24704', '0.98816', '160.79.104.0/23', 'getent ahostsv4 api.anthropic.com',
                     'preview_key.py install anthropic', 'probe', '--model claude-haiku-5-5', 'model_echoed_exactly',
                     'completion_within_max_tokens', 'anthropic_budget_socket', '429', '529', UNIT.name, HALT_TIMER.name,
                     CHECK_TIMER.name, TARGET_DROPIN.name):
            self.assertIn(name, readme)
        self.assertIn('README-anthropic.md', (V3 / 'README.md').read_text())


    def test_the_pot_is_the_owners_ruling_everywhere(self):
        # Owner's ruling 2026-10-10: Anthropic $1.00, 400 calls, 2 at once; with DeepInfra's $4.00, $5.00.
        readme, deepinfra = README.read_text(), (V3 / 'README.md').read_text()
        go = re.search(r"jq -n [^\n]*provider:\"anthropic\"[^\n]*", readme).group(0)
        for field in ('daily_budget_usd:"1.00"', 'max_paid_posts_per_day:400', 'max_concurrent_calls:2'):
            self.assertIn(field, go)
        for stale in ('1.50', '$3.50', '$50 a month'):
            self.assertNotIn(stale, readme)
        self.assertIn('DeepInfra $4.00 and Anthropic $1.00, $5.00 together', deepinfra)
        self.assertNotIn('Anthropic $1.50', deepinfra)
        self.assertIn('TEAM_TOTAL_BUDGET_EXCEEDED', readme)

    def test_install_order_reinstalls_the_deepinfra_units_before_the_key_and_checks_them_live(self):
        readme = README.read_text()
        step3a, step4 = readme.index('**3a. Re-install the two DeepInfra units'), readme.index('**4. The Anthropic key.')
        self.assertLess(step3a, step4)
        block = readme[step3a:step4]
        for needed in (DEEPINFRA_UNIT.name, DEEPINFRA_HALT.name, 'systemctl daemon-reload',
                       'systemctl restart debateai-preview-provider-budget.service',
                       'systemctl show -p InaccessiblePaths debateai-preview-provider-budget.service',
                       'systemctl show -p InaccessiblePaths debateai-preview-gate-halt-watch.service', PRIVATE, GO):
            self.assertIn(needed, block)

    def test_the_probe_runs_in_the_generic_fence_and_must_pass_before_haiku_is_switched_on(self):
        readme = README.read_text()
        line = next(text for text in readme.splitlines() if text.startswith('systemd-run') and ' probe ' in text)
        self.assertIn('--unit=' + gate.probe_unit_name('anthropic').removesuffix('.service') + ' ', line)
        for needed in ('IPAddressDeny=any', 'NoNewPrivileges=yes', '-p CapabilityBoundingSet= ', '--model claude-haiku-5-5'):
            self.assertIn(needed, line)
        hidden = re.search(r"InaccessiblePaths=([^']*)'", line).group(1).split()
        others = [path for name, pair in gate.GATE_PATHS.items() if name != 'anthropic' for path in pair]
        for path in [*others, *gate.RETIRED_GATE_PATHS]:
            self.assertIn('-' + path, hidden)
        self.assertFalse(any(path in hidden or '-' + path in hidden for path in gate.GATE_PATHS['anthropic']))
        probe, switch_on = readme.index('**8. Probe'), readme.index('## Switch it on')
        self.assertLess(probe, switch_on)
        self.assertIn('It must pass before Haiku is switched on.', readme[probe:switch_on])
        self.assertIn('**Only after the step-8 probe has passed**', readme[switch_on:])
        for code in ('PROBE_FENCE_REQUIRED', 'PROVIDER_REFUSED_UNBILLED', 'PROVIDER_NOT_REACHED'):
            self.assertIn(code, readme[probe:switch_on])

    def test_the_first_debate_config_is_all_five_and_matches_the_reviewed_ui_flag(self):
        readme = README.read_text()
        api = json.loads(re.search(r"`(\{\"deployment\":\"v3-preview\"[^`]*)`", readme).group(1))
        five = ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'XiaomiMiMo/MiMo-V2.6-Pro',
                'Qwen/Qwen3.8-Flash', 'claude-haiku-5-5']
        self.assertEqual((api['free_model_ids'], api['premium_model_ids']), (five, five))
        self.assertEqual((api['budget_socket'], api['anthropic_budget_socket']),
                         ('/run/debateai-v3-preview/deepinfra-budget-v3.sock', SOCKET))
        self.assertEqual(sorted(api), sorted(['deployment', 'requested_thinking_level', 'budget_socket',
                                              'anthropic_budget_socket', 'scope_id', 'free_model_ids', 'premium_model_ids']))
        self.assertIn('--models all-models', readme)
        flag = re.search(r"NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON=(\{[^`]*)`", readme).group(1)
        self.assertEqual(json.loads(flag), {'free': five, 'premium': five})
        # The same text as the reviewed build value the website may be built with.
        environment = (ROOT / 'deploy/preview-auth-dev/v1/environment.mjs').read_text()
        self.assertEqual(re.search(r"'all-models':'([^']*)'", environment).group(1), flag)
        go = re.search(r'scope_id:"([^"]+)"', readme).group(1)
        self.assertEqual(api['scope_id'], go)  # Every gate is asked with the app's one scope_id.


class AddressCheckTests(unittest.TestCase):
    def run_main(self, argv, resolver):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=resolver)
        lines = out.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        return code, json.loads(lines[0])

    def state(self):
        folder = Path(tempfile.mkdtemp(prefix='anthropic-addresses-'))
        self.addCleanup(shutil.rmtree, folder, True)
        return folder / 'announced'

    def test_every_address_inside_the_range_passes_and_only_a_records_are_asked_for(self):
        resolver = FakeResolver([answer('160.79.104.10'), answer('160.79.104.0'), answer('160.79.105.255')])
        self.assertEqual(self.run_main(['check'], resolver),
                         (0, {'status': 'ok', 'host': 'api.anthropic.com', 'allowed': '160.79.104.0/23', 'resolved': 3,
                              'outside': []}))
        self.assertEqual(resolver.calls, [('api.anthropic.com', 443, socket.AF_INET, socket.SOCK_STREAM)])

    def test_one_address_outside_refuses_and_is_named(self):
        for outside in ('160.79.106.0', '160.79.103.255', '1.1.1.1', '127.0.0.1', '10.0.0.1'):
            with self.subTest(outside=outside):
                code, line = self.run_main(['check'], FakeResolver([answer('160.79.104.10'), answer(outside)]))
                self.assertEqual((code, line['status'], line['error'], line['outside']),
                                 (2, 'refused', 'ANTHROPIC_ADDRESSES_OUTSIDE_RANGE', [outside]))

    def test_no_ipv4_answer_refuses(self):
        for name, result in (('none', []), ('ipv6_only', [answer('2607:6bc0::10', socket.AF_INET6)]),
                             ('resolver_error', socket.gaierror(socket.EAI_NONAME, 'unknown')),
                             ('timeout', TimeoutError('slow')), ('garbage', [('x',)]),
                             ('not_an_address', [answer('api.anthropic.com')])):
            with self.subTest(name):
                self.assertEqual(self.run_main(['check'], FakeResolver(result)),
                                 (2, {'status': 'refused', 'error': 'DNS_UNAVAILABLE'}))

    def test_ipv6_answers_beside_ipv4_ones_are_ignored(self):
        resolver = FakeResolver([answer('2607:6bc0::10', socket.AF_INET6), answer('160.79.104.10')])
        self.assertEqual(self.run_main(['check'], resolver)[1]['resolved'], 1)

    def test_watch_announces_a_change_once_and_forgets_it_when_back_in_range(self):
        state = self.state()
        bad = FakeResolver([answer('160.79.104.10'), answer('8.8.8.8')])
        code, line = self.run_main(['watch', '--state', str(state)], bad)
        self.assertEqual((code, line['error'], line['announced']), (3, 'ANTHROPIC_ADDRESSES_OUTSIDE_RANGE', 'now'))
        self.assertEqual(oct(state.stat().st_mode & 0o777), '0o600')
        code, line = self.run_main(['watch', '--state', str(state)], bad)
        self.assertEqual((code, line['announced']), (0, 'before'))
        other = FakeResolver([answer('9.9.9.9')])
        self.assertEqual(self.run_main(['watch', '--state', str(state)], other)[0], 3)  # A new change: announced.
        self.assertEqual(self.run_main(['watch', '--state', str(state)], FakeResolver(socket.gaierror(-2, 'x'))),
                         (0, {'status': 'dns_unavailable', 'announced': False}))
        self.assertTrue(state.exists())
        self.assertEqual(self.run_main(['watch', '--state', str(state)], FakeResolver([answer('160.79.105.1')]))[0], 0)
        self.assertFalse(state.exists())
        self.assertEqual(self.run_main(['watch', '--state', str(state)], bad)[0], 3)

    def test_watch_needs_its_state_and_nothing_else_is_accepted(self):
        self.assertEqual(self.run_main(['watch'], FakeResolver([])), (2, {'status': 'refused', 'error': 'STATE_REQUIRED'}))
        for argv in (['update'], ['render'], ['check', '--dropin', 'x'], []):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                addresses.main(argv, lookup=FakeResolver([]))
            self.assertEqual(raised.exception.code, 2)


if __name__ == '__main__':
    unittest.main()
