"""The Amazon Bedrock gate's systemd files, its address check and its install guide (deploy/preview-gate/v3).

Offline only: no DNS, no network, no systemd. A fake resolver stands in for getaddrinfo, a fake runner for systemctl,
and a made-up ranges file for Amazon's (documentation addresses are not public, so the made-up ranges use public ones).
"""
import contextlib
import importlib.util
import io
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
V3 = ROOT / 'deploy/preview-gate/v3'
V2 = ROOT / 'deploy/preview-gate/v2'
SYSTEMD = V3 / 'systemd'
UNIT = SYSTEMD / 'debateai-preview-bedrock-budget.service'
HALT_UNIT, HALT_TIMER = SYSTEMD / 'debateai-preview-bedrock-halt-watch.service', SYSTEMD / 'debateai-preview-bedrock-halt-watch.timer'
CHECK_UNIT, CHECK_TIMER = SYSTEMD / 'debateai-preview-bedrock-addresses.service', SYSTEMD / 'debateai-preview-bedrock-addresses.timer'
TARGET_DROPIN = SYSTEMD / 'debateai-preview.target.d/50-bedrock-gate.conf'
PERPLEXITY_UNIT, PERPLEXITY_HALT = SYSTEMD / 'debateai-preview-perplexity-budget.service', SYSTEMD / 'debateai-preview-perplexity-halt-watch.service'
PERPLEXITY_CHECK = SYSTEMD / 'debateai-preview-perplexity-addresses.service'
README = V3 / 'README-bedrock.md'
GATE = ROOT / 'packages/providers/ops/preview_budget_authority.py'
ALERT = ROOT / 'deploy/preview-lifecycle/v1/alert.mjs'
COMMON = ROOT / 'deploy/preview-lifecycle/v1/common.mjs'
OPERATOR = '/opt/debateai-v3-preview/operator/bedrock-budget-v1/'
PRIVATE = '/var/lib/debateai-v3-preview/provider-bedrock-authority-v1'
GO = '/etc/debateai-v3-preview/provider-bedrock-go-v1.json'
SOCKET = '/run/debateai-v3-preview/bedrock-budget-v1.sock'
DROPIN = '/etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf'
RANGES = '/root/preview-archive/aws-ip-ranges.json'
HOST = 'bedrock-runtime.us-east-1.amazonaws.com'
LUNA = 'us.openai.gpt-6-luna'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


addresses = load(V3 / 'bedrock_addresses.py', 'bedrock_addresses')
gate = load(GATE, 'production_preview_budget_authority_for_bedrock_units')  # Import only: no helper runs.
gate_watch = load(V2 / 'gate_watch.py', 'gate_watch_bedrock_unit')


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


def answer(address):
    return (socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))


def ranges_document(*entries, created='2026-11-19-20-13-07'):
    """Amazon's file format, with made-up entries: (ip_prefix, region, service)."""
    return {'syncToken': '1', 'createDate': created,
            'prefixes': [{'ip_prefix': prefix, 'region': region, 'service': service, 'network_border_group': region}
                         for prefix, region, service in entries],
            'ipv6_prefixes': [{'ipv6_prefix': '2600:1f18::/33', 'region': 'us-east-1', 'service': 'AMAZON'}]}


# Two ranges that touch (merged into one /23), one apart, and ranges of another Region and another service.
SAMPLE = ranges_document(('3.208.0.0/24', 'us-east-1', 'AMAZON'), ('3.208.1.0/24', 'us-east-1', 'AMAZON'),
                         ('54.84.0.0/16', 'us-east-1', 'AMAZON'), ('13.48.0.0/15', 'eu-north-1', 'AMAZON'),
                         ('52.94.0.0/22', 'us-east-1', 'EC2'))


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
    def test_exec_lines_name_the_bedrock_gate_go_state_socket_and_its_address_check(self):
        self.assertEqual(values(UNIT, 'ExecStartPre'),
                         ['/usr/bin/python3 -I ' + OPERATOR + 'bedrock_addresses.py check --dropin ' + DROPIN])
        start = values(UNIT, 'ExecStart')
        self.assertEqual(len(start), 1)
        start = start[0].split()
        self.assertEqual(start[:4], ['/usr/bin/python3', '-I', OPERATOR + 'preview_budget_authority.py', 'serve'])
        self.assertEqual(dict(zip(start[4::2], start[5::2])), {'--private': PRIVATE, '--go': GO, '--socket': SOCKET})
        self.assertTrue(gate.socket_path_allowed(SOCKET))
        self.assertEqual(values(UNIT, 'ReadWritePaths'), [PRIVATE + ' /run/debateai-v3-preview'])
        self.assertEqual(values(UNIT, 'Documentation'), ['file://' + OPERATOR + 'README-bedrock.md'])
        self.assertEqual(gate.GATE_PATHS['bedrock'], (PRIVATE, GO))

    def test_egress_is_ipv4_only_to_the_resolver_stub_and_the_checked_dropin(self):
        self.assertEqual(values(UNIT, 'IPAddressDeny'), ['any'])
        self.assertEqual(values(UNIT, 'IPAddressAllow'), ['127.0.0.53/32'])  # Amazon's ranges come from the drop-in only.
        self.assertEqual(values(UNIT, 'RestrictAddressFamilies'), ['AF_UNIX AF_INET'])
        self.assertEqual(addresses.HOST, HOST)
        self.assertEqual((addresses.REGION, addresses.SERVICE), ('us-east-1', 'AMAZON'))
        self.assertIn(DROPIN, addresses.HEADER)

    def test_everything_else_is_the_reviewed_perplexity_unit(self):
        changed = {'Description', 'Documentation', 'ExecStartPre', 'ExecStart', 'ReadWritePaths', 'InaccessiblePaths'}
        self.assertEqual(without(UNIT, changed), without(PERPLEXITY_UNIT, changed))
        hidden, perplexity = hidden_of(UNIT), hidden_of(PERPLEXITY_UNIT)
        self.assertEqual(hidden - perplexity, {'-' + path for path in gate.GATE_PATHS['perplexity']})
        self.assertEqual(perplexity - hidden, {'-' + PRIVATE, '-' + GO})

    def test_watchers_follow_the_bedrock_gate_with_their_own_state_and_notices(self):
        start = values(HALT_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[:3], ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py'])
        args = gate_watch.parse_args(start[3:])
        self.assertEqual((str(args.private), args.notice, args.unbilled_alert_at), (PRIVATE, 'bedrock-halted', 100))
        self.assertEqual(values(HALT_UNIT, 'StateDirectory'), ['debateai-preview-bedrock-halt-watch'])
        self.assertTrue(str(args.state).startswith('/var/lib/debateai-preview-bedrock-halt-watch/'))
        self.assertIn('-' + PRIVATE + '/api-key.txt', hidden_of(HALT_UNIT))
        same = {'Description', 'ExecStart', 'StateDirectory', 'InaccessiblePaths'}
        self.assertEqual(without(HALT_UNIT, same), without(PERPLEXITY_HALT, same))
        check = values(CHECK_UNIT, 'ExecStart')[0].split()
        self.assertEqual(check[:4], ['/usr/bin/python3', '-I', OPERATOR + 'bedrock_addresses.py', 'watch'])
        options = dict(zip(check[4::2], check[5::2]))
        self.assertEqual(options['--dropin'], DROPIN)
        self.assertTrue(options['--state'].startswith('/var/lib/debateai-preview-bedrock-addresses/'))
        self.assertEqual(values(CHECK_UNIT, 'StateDirectory'), ['debateai-preview-bedrock-addresses'])
        self.assertEqual(values(CHECK_UNIT, 'OnFailure'), ['debateai-preview-notice@bedrock-addresses-mismatch.service'])
        same = {'Description', 'ExecStart', 'StateDirectory', 'OnFailure'}
        self.assertEqual(without(CHECK_UNIT, same), without(PERPLEXITY_CHECK, same))
        for timer, v2 in ((HALT_TIMER, V2 / 'systemd/debateai-preview-gate-halt-watch.timer'),
                          (CHECK_TIMER, V2 / 'systemd/debateai-preview-gate-addresses.timer')):
            with self.subTest(timer=timer.name):
                self.assertEqual(without(timer, {'Description'}), without(v2, {'Description'}))

    def test_the_halt_watcher_knows_the_three_bedrock_notices(self):
        self.assertIn('bedrock-halted', gate_watch.NOTICE_KINDS)
        self.assertEqual((gate_watch.UNBILLED_KINDS['bedrock-halted'], gate_watch.BOOKED_KINDS['bedrock-halted']),
                         ('bedrock-unbilled', 'bedrock-booked'))
        calls = []

        def run(argv, **_kwargs):
            calls.append(argv)
            return Completed(0)
        self.assertEqual(gate_watch.queue_notice('uncertain_charge', run, 'bedrock-halted'),
                         'debateai-preview-notice@bedrock-halted-uncertain_charge.service')
        self.assertEqual(gate_watch.queue_notice('3_2026_11_20', run, 'bedrock-booked'),
                         'debateai-preview-notice@bedrock-booked-3_2026_11_20.service')
        with self.assertRaises(gate_watch.WatchError):
            gate_watch.queue_notice('x', run, 'bedrock-addresses')

    def test_the_alert_mails_each_bedrock_notice_with_this_gates_own_command(self):
        text = ALERT.read_text()
        self.assertIn('bedrock-halted|bedrock-addresses|bedrock-unbilled|bedrock-booked', text)
        self.assertIn("BEDROCK_PRIVATE = '%s'" % PRIVATE, text)
        self.assertIn("BEDROCK_FOLDER = '%s'" % OPERATOR.rstrip('/'), text)
        # A refused or expired key has its own halt name, and the email says to put a new key in first.
        self.assertIn("code === '%s'" % gate.KEY_REFUSED_HALT, text)
        self.assertIn('"A new key"', text)
        self.assertIn('preview_budget_authority.py activate --private ${BEDROCK_PRIVATE} --go %s' % GO, text)
        self.assertIn('bedrock_addresses.py update --dropin %s --ranges %s && systemctl restart debateai-preview-bedrock-budget'
                      % (DROPIN, RANGES), text)

    def test_the_release_tools_list_this_gate_with_the_gate_tables_own_paths(self):
        text = COMMON.read_text()
        self.assertIn("name: 'bedrock', folder: '%s', privateDir: '%s', go: '%s'" % (OPERATOR.rstrip('/'), PRIVATE, GO), text)

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

    def test_readme_names_the_paths_the_model_the_route_and_the_key_command(self):
        for name in (OPERATOR, PRIVATE, GO, SOCKET, DROPIN, RANGES, 'preview-provider-budget-go-v3', '"bedrock"', LUNA,
                     'us-east-1', HOST, 'max_completion_tokens', 'reasoning_effort', 'TEAM_TOTAL_BUDGET_EXCEEDED',
                     'CONCURRENCY_EXCEEDS_BUDGET', 'preview_key.py install bedrock', 'preview_key.py install bedrock --replace',
                     'bedrock_budget_socket', 'preview:gpt-6-luna', 'getent ahostsv4 ' + HOST, 'bedrock_addresses.py render',
                     'bedrock_addresses.py update', 'BEDROCK_ADDRESSES_OUTSIDE_RANGES', 'RANGES_DO_NOT_COVER_DNS',
                     'https://ip-ranges.amazonaws.com/ip-ranges.json', 'MODEL_COOLING', 'PROVIDER_REFUSED_UNBILLED',
                     'ABSK', 'AmazonBedrockLimitedAccess', 'end date', 'provider_key_refused', UNIT.name, HALT_TIMER.name, CHECK_TIMER.name,
                     TARGET_DROPIN.name, 'Run it twice', 'What only the server can prove'):
            self.assertIn(name, self.readme)

    def test_the_readme_carries_no_price_and_no_pot(self):
        """The owner's figures live on the server, and Amazon's prices in the reviewed row and its parity file."""
        self.assertIsNone(re.search(r'\$[0-9]*[1-9]', self.readme))
        self.assertIsNone(re.search(r'per million', self.readme))
        for figure in ('0.11', '0.1375', '0.138', '0.55', '0.275', '0.825'):
            self.assertNotIn(figure, self.readme)

    def test_the_go_takes_the_owners_figures_from_the_server(self):
        go = re.search(r"jq -n [^\n]*provider:\"bedrock\"[^\n]*", self.readme).group(0)
        for field in ('daily_budget_usd:$d', 'max_paid_posts_per_day:$c', 'max_concurrent_calls:4',
                      'max_final_writer_calls:1', 'enabled_models:["%s"]' % LUNA):
            self.assertIn(field, go)
        self.assertEqual(re.search(r'scope_id:"([^"]+)"', go).group(1), 'preview-deepinfra-v3-20261010')
        self.assertIn('DAILY_BUDGET=<the owner\'s figure>; DAILY_CALLS=<the owner\'s figure>', self.readme)

    def test_the_older_units_are_reinstalled_and_checked_live_before_the_key(self):
        step, key = self.readme.index('**3a. Re-install the six older gate units'), self.readme.index('**4. The Amazon key.')
        self.assertLess(step, key)
        block = self.readme[step:key]
        for needed in ('debateai-preview-provider-budget.service', 'debateai-preview-gate-halt-watch.service',
                       'debateai-preview-anthropic-budget.service', 'debateai-preview-anthropic-halt-watch.service',
                       PERPLEXITY_UNIT.name, PERPLEXITY_HALT.name, 'systemctl daemon-reload',
                       'systemctl show -p InaccessiblePaths', 'provider-bedrock-authority-v1', 'provider-bedrock-go-v1.json'):
            self.assertIn(needed, block)

    def test_the_probe_runs_in_the_generic_fence_and_must_pass_before_luna_is_switched_on(self):
        line = next(text for text in self.readme.splitlines() if text.startswith('systemd-run') and ' probe ' in text)
        self.assertIn('--unit=' + gate.probe_unit_name('bedrock').removesuffix('.service') + ' ', line)
        for needed in ('IPAddressDeny=any', 'NoNewPrivileges=yes', '-p CapabilityBoundingSet= ', '--model ' + LUNA,
                       "-p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' " + DROPIN + ')',
                       "'RestrictAddressFamilies=AF_UNIX AF_INET'", 'ProtectSystem=strict', 'ReadWritePaths=$P '):
            self.assertIn(needed, line)
        hidden = re.search(r"InaccessiblePaths=([^']*)'", line).group(1).split()
        others = [path for name, pair in gate.GATE_PATHS.items() if name != 'bedrock' for path in pair]
        for path in [*others, *gate.RETIRED_GATE_PATHS]:
            self.assertIn('-' + path, hidden)
        self.assertFalse(any('-' + path in hidden for path in gate.GATE_PATHS['bedrock']))
        probe, switch_on = self.readme.index('**8. Probe'), self.readme.index('## Switch it on')
        self.assertLess(probe, switch_on)
        self.assertIn('It must pass before Luna is switched on.', self.readme[probe:switch_on])

    def test_the_key_waits_for_the_probe_and_switch_on_starts_the_gate_first(self):
        flat = ' '.join(self.readme.split())
        # The first real Amazon call is the owner's probe, with the halt watcher on: the key goes in right before it,
        # never at the upload. A release from before the rule that an ask checks only its line-up's models checks Luna
        # at every ask once the key is in, so the guide says how to tell one and to keep the key out while it runs.
        self.assertIn('**The key goes in right before the first probe, never at the upload.**', flat)
        self.assertIn('**A release from before that rule checks every declared model at every ask.**', flat)
        self.assertIn('So while such a release runs, keep the key out.', flat)
        step4, step5 = self.readme.index('**4. The Amazon key.'), self.readme.index('**5. The GO')
        self.assertIn('Not at the upload: on the day of the probe, right before step 8', ' '.join(self.readme[step4:step5].split()))
        # R is the upload's own release folder, read from its names file, never a typed placeholder.
        self.assertIn('. /root/preview-archive/rNN-names.sh; R=$CAPI/dialectical-engine', self.readme)
        self.assertNotIn('REVIEWED_RELEASE', self.readme)
        # Step 3a reads what the install would change before it installs.
        step, key = self.readme.index('**3a. Re-install the six older gate units'), self.readme.index('**4. The Amazon key.')
        block = self.readme[step:key]
        self.assertLess(block.index('diff "/etc/systemd/system/$U" "$D/$U"'), block.index('install -o root -g root -m 0644 $S/debateai-preview-provider-budget.service'))
        # Nothing starts the gate at boot before "Switch it on", so its step 1 starts the gate before anything else,
        # and it waits for the notice when anyone outside the team has an account.
        switch_on = self.readme[self.readme.index('## Switch it on'):self.readme.index('## Daily operations')]
        self.assertLess(switch_on.index('systemctl start debateai-preview-bedrock-budget; systemctl is-active debateai-preview-bedrock-budget'),
                        switch_on.index('50-bedrock-gate.conf /etc/systemd/system/debateai-preview.target.d/'))
        self.assertIn('when any account outside the team exists by then, the Privacy Policy section 14 notice has gone out', ' '.join(switch_on.split()))
        self.assertIn('GATE_CAPACITY_UNREAD', switch_on)

    def test_switch_on_sets_r_proves_the_boot_dropin_and_puts_the_key_in_after_the_watchers(self):
        switch_on = self.readme[self.readme.index('## Switch it on'):self.readme.index('## Daily operations')]
        # Luna's day comes in a new root shell: R is set there from the newest names file before the drop-in is installed.
        names = switch_on.index('. /root/preview-archive/rNN-names.sh; R=$CAPI/dialectical-engine')
        self.assertLess(names, switch_on.index('test -f "$R/deploy/preview-gate/v3/systemd/debateai-preview.target.d/50-bedrock-gate.conf" && echo \'R ok\''))
        install = switch_on.index('50-bedrock-gate.conf /etc/systemd/system/debateai-preview.target.d/')
        self.assertLess(names, install)
        # The target's Wants proves the drop-in is read, so a skipped install cannot pass as done.
        self.assertLess(install, switch_on.index('systemctl show -p Wants debateai-preview.target | grep -c debateai-preview-bedrock-budget'))
        # The notice (when owed), then the watchers, then the key and the probe, then the runner, then the line-up.
        steps = [switch_on.index(head) for head in ('**1. The notice, when it is owed.**', '**2. The gate running, start at boot, and the two watchers.**',
                                                    '**3. The key and the probe', '**4. The runner.**', '**6. The line-up, by a settings activation**')]
        self.assertEqual(steps, sorted(steps))
        self.assertLess(steps[1], switch_on.index('systemctl start debateai-preview-bedrock-halt-watch.timer debateai-preview-bedrock-addresses.timer'))
        self.assertLess(switch_on.index('systemctl start debateai-preview-bedrock-halt-watch.timer'), steps[2])
        # The key's step first re-checks, read-only, that the older units still hide this gate's folder and GO.
        step4, step5 = self.readme.index('**4. The Amazon key.'), self.readme.index('**5. The GO')
        key = self.readme[step4:step5]
        self.assertLess(key.index('systemctl show -p InaccessiblePaths debateai-preview-$U.service'), key.index('preview_key.py install bedrock'))
        self.assertIn('after "Switch it on" steps 1 and 2', ' '.join(key.split()))

    def test_the_pot_range_block_prints_what_activate_accepts(self):
        # Step 5's first block, run on made-up caps and GO files; the gate's own test seams stand in for root's custody.
        block = re.search(r"<<'PY'\n(.*?)\nPY\n", self.readme, re.S).group(1)
        self.assertIn('gate.load_helper()', block.splitlines())
        check = ('\nworst = gate.in_flight_worst_case(gate.profile_of("bedrock"), ["us.openai.gpt-6-luna"], 4, 1)'
                 '\nassert worst <= smallest < worst + Decimal("0.01"), (worst, smallest)\nprint("CHECKED")\n')
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            for name in ('preview_budget_authority.py', 'preview_budget_helper.py'):
                shutil.copy(GATE.parent / name, base / name)
            (base / 'caps.json').write_text(json.dumps({'schema': 'preview-provider-budget-caps-v1', 'max_go_budget_usd': '33.00',
                                                         'team_total_budget_usd': '44.00'}))
            seams = ("import os; gate.load_helper(skip_custody_for_tests=True); gate.CAPS_PATH = %r; gate.CAPS_OWNER_UID = os.getuid(); "
                     "gate.GATE_PATHS = {n: ('-', %r + '/' + n + '.json') for n in ('deepinfra', 'anthropic', 'perplexity', 'google', 'bedrock')}"
                     % (str(base / 'caps.json'), folder))

            def run(pot):
                for name in ('deepinfra', 'anthropic', 'perplexity'):
                    (base / ('%s.json' % name)).write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': name,
                                                                       'daily_budget_usd': pot}))
                done = subprocess.run([sys.executable, '-I', '-', str(base)], input=block.replace('gate.load_helper()', seams) + check,
                                      capture_output=True, text=True, check=False)
                self.assertEqual(done.returncode, 0, done.stderr)
                return done.stdout.splitlines()
            lines = run('10.00')
            self.assertEqual(lines[:5], ['anthropic: pot 10.00', 'deepinfra: pot 10.00', 'google: pot 0', 'perplexity: pot 10.00',
                                         'caps file: team total 44.00, one GO at most 33.00'])
            self.assertRegex(lines[5], r'^the Amazon pot activate accepts: from [0-9]+\.[0-9]{2} to 14\.00$')
            self.assertEqual(lines[6], 'CHECKED')
            self.assertRegex(run('15.00')[5], r"^NO ROOM: the Amazon pot must be at least [0-9]+\.[0-9]{2}, and only -1\.00 is left: lower another gate's pot first$")

    def test_every_other_gates_probe_line_hides_the_bedrock_gate(self):
        for name in ('README.md', 'README-anthropic.md', 'README-perplexity.md'):
            with self.subTest(readme=name):
                line = next(text for text in (V3 / name).read_text().splitlines()
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
        folder = Path(tempfile.mkdtemp(prefix='bedrock-addresses-'))
        self.addCleanup(shutil.rmtree, folder, True)
        return folder

    def ranges_file(self, document=SAMPLE):
        path = self.folder() / 'ip-ranges.json'
        path.write_text(json.dumps(document) if not isinstance(document, str) else document)
        return path

    def test_render_takes_only_the_regions_amazon_ranges_and_merges_those_that_touch(self):
        code, text = self.run_main(['render', '--ranges', str(self.ranges_file())], FakeResolver([]))
        self.assertEqual(code, 0)
        self.assertEqual(text, addresses.HEADER
                         + "# Amazon's ranges file: createDate 2026-11-19-20-13-07, region us-east-1, service AMAZON.\n"
                         + '[Service]\nIPAddressAllow=3.208.0.0/23\nIPAddressAllow=54.84.0.0/16\n')
        self.assertEqual([str(network) for network in addresses.parse_dropin(text)], ['3.208.0.0/23', '54.84.0.0/16'])

    def test_check_passes_inside_the_ranges_and_names_an_address_outside(self):
        folder = self.folder()
        dropin = folder / '50-bedrock-addresses.conf'
        dropin.write_text(addresses.render(*addresses.read_ranges(self.ranges_file())))
        inside = FakeResolver([answer('3.208.1.77'), answer('54.84.22.50'), answer('3.208.1.77')])
        self.assertEqual(self.run_main(['check', '--dropin', str(dropin)], inside),
                         (0, {'status': 'ok', 'host': HOST, 'ranges': 2, 'resolved': 2, 'outside': []}))
        self.assertEqual(inside.calls, [(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)])
        code, line = self.run_main(['check', '--dropin', str(dropin)], FakeResolver([answer('54.84.22.50'), answer('13.48.0.9')]))
        self.assertEqual((code, line['error'], line['outside']), (2, 'BEDROCK_ADDRESSES_OUTSIDE_RANGES', ['13.48.0.9']))
        self.assertEqual(self.run_main(['check', '--dropin', str(dropin)], FakeResolver(socket.gaierror(-2, 'x'))),
                         (2, {'status': 'refused', 'error': 'DNS_UNAVAILABLE'}))

    def test_a_ranges_file_that_is_not_amazons_or_lists_a_non_public_or_over_wide_range_is_refused(self):
        bad = ['not json', json.dumps([]), json.dumps({'prefixes': []}), json.dumps({**SAMPLE, 'createDate': 'today'}),
               json.dumps(ranges_document(('13.48.0.0/15', 'eu-north-1', 'AMAZON'))),  # Nothing for the Region.
               json.dumps(ranges_document(('10.0.0.0/16', 'us-east-1', 'AMAZON'))),
               json.dumps(ranges_document(('127.0.0.0/24', 'us-east-1', 'AMAZON'))),
               json.dumps(ranges_document(('2.0.0.0/7', 'us-east-1', 'AMAZON'))),
               json.dumps(ranges_document(('0.0.0.0/0', 'us-east-1', 'AMAZON'))),
               json.dumps(ranges_document(('3.208.0.5/24', 'us-east-1', 'AMAZON'))),
               json.dumps({**SAMPLE, 'prefixes': ['3.208.0.0/24']})]
        for document in bad:
            with self.subTest(document=document[:60]):
                self.assertEqual(self.run_main(['render', '--ranges', str(self.ranges_file(document))], FakeResolver([])),
                                 (2, {'status': 'refused', 'error': 'RANGES_FILE_INVALID'}))
        self.assertEqual(self.run_main(['render'], FakeResolver([]))[1], {'status': 'refused', 'error': 'RANGES_REQUIRED'})
        self.assertEqual(self.run_main(['render', '--ranges', str(self.folder() / 'absent.json')], FakeResolver([]))[1],
                         {'status': 'refused', 'error': 'RANGES_FILE_UNREADABLE'})

    def test_ranges_that_merge_wider_than_a_slash_8_are_written_as_slash_8s(self):
        document = ranges_document(('2.0.0.0/8', 'us-east-1', 'AMAZON'), ('3.0.0.0/9', 'us-east-1', 'AMAZON'),
                                   ('3.128.0.0/9', 'us-east-1', 'AMAZON'))
        _created, networks = addresses.read_ranges(self.ranges_file(document))
        self.assertEqual([str(network) for network in networks], ['2.0.0.0/8', '3.0.0.0/8'])
        addresses.parse_dropin(addresses.render('2026-11-19-20-13-07', networks))

    def test_a_dropin_can_only_hold_public_ranges(self):
        for line in ('IPAddressAllow=10.0.0.0/8', 'IPAddressAllow=0.0.0.0/0', 'IPAddressAllow=2.0.0.0/7',
                     'IPAddressAllow=3.208.0.1/24', 'IPAddressAllow=any', 'IPAddressDeny=3.208.0.0/24',
                     'ExecStartPre=/bin/true', 'IPAddressAllow=2600:1f18::/33'):
            with self.subTest(line=line):
                with self.assertRaises(addresses.Refusal):
                    addresses.parse_dropin('[Service]\n' + line + '\n')
        with self.assertRaises(addresses.Refusal):
            addresses.parse_dropin('[Service]\n')
        with self.assertRaises(addresses.Refusal):
            addresses.parse_dropin('[Service]\nIPAddressAllow=3.208.0.0/24\nIPAddressAllow=3.208.0.0/24\n')

    def test_watch_announces_a_spell_outside_the_ranges_once_whatever_the_addresses(self):
        folder = self.folder()
        dropin, state = folder / 'd.conf', folder / 'announced'
        dropin.write_text(addresses.render(*addresses.read_ranges(self.ranges_file())))
        code, line = self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)], FakeResolver([answer('13.48.0.9')]))
        self.assertEqual((code, line['error'], line['announced']), (3, 'BEDROCK_ADDRESSES_OUTSIDE_RANGES', 'now'))
        # The host's addresses change every minute: another address outside the list is the same spell.
        code, line = self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)], FakeResolver([answer('13.48.0.10')]))
        self.assertEqual((code, line['announced']), (0, 'before'))
        self.assertEqual(self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)],
                                       FakeResolver(socket.gaierror(-2, 'x'))), (0, {'status': 'dns_unavailable', 'announced': False}))
        self.assertTrue(state.exists())
        self.assertEqual(self.run_main(['watch', '--dropin', str(dropin), '--state', str(state)],
                                       FakeResolver([answer('3.208.0.4')]))[0], 0)
        self.assertFalse(state.exists())

    def test_update_writes_the_list_from_a_file_that_covers_todays_answer_and_reloads(self):
        folder = self.folder()
        dropin = folder / 'd.conf'
        dropin.write_text(addresses.HEADER + '[Service]\nIPAddressAllow=54.84.0.0/16\n')
        calls = []
        run = lambda argv, **_k: calls.append(argv) or Completed(0)  # noqa: E731
        stale = self.run_main(['update', '--dropin', str(dropin), '--ranges', str(self.ranges_file())],
                              FakeResolver([answer('13.48.0.9')]), run=run)
        self.assertEqual((stale[0], stale[1]['error'], stale[1]['outside']), (2, 'RANGES_DO_NOT_COVER_DNS', ['13.48.0.9']))
        self.assertEqual(calls, [])
        self.assertNotIn('3.208.0.0/23', dropin.read_text())
        code, line = self.run_main(['update', '--dropin', str(dropin), '--ranges', str(self.ranges_file())],
                                   FakeResolver([answer('3.208.0.4')]), run=run)
        self.assertEqual((code, line['status'], line['ranges'], line['next']),
                         (0, 'updated', 2, 'systemctl restart debateai-preview-bedrock-budget'))
        self.assertEqual(calls, [['/usr/bin/systemctl', 'daemon-reload']])
        self.assertEqual(oct(dropin.stat().st_mode & 0o777), '0o644')
        self.assertIn('IPAddressAllow=3.208.0.0/23\nIPAddressAllow=54.84.0.0/16\n', dropin.read_text())
        failed = self.run_main(['update', '--dropin', str(dropin), '--ranges', str(self.ranges_file())],
                               FakeResolver([answer('3.208.0.4')]), run=lambda argv, **_k: Completed(1))
        self.assertEqual(failed, (2, {'status': 'refused', 'error': 'DAEMON_RELOAD_FAILED'}))

    def test_the_script_sends_no_key_and_opens_no_connection(self):
        script = (V3 / 'bedrock_addresses.py').read_text()
        for absent in ('api-key', 'Authorization', 'urllib', 'http.client', 'HTTPSConnection', 'create_connection', 'PROFILES'):
            self.assertNotIn(absent, script)


if __name__ == '__main__':
    unittest.main()
