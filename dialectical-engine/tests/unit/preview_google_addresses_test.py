"""The Google spending gate's address tools and their hourly watcher units.

Offline only: no DNS, no internet, no systemd, and the real getent is never run. A fake resolver
stands in for getaddrinfo, a fake runner for getent, and a fake clock for time. The one real
socket is a listener on 127.0.0.1 (a free port picked by the system) for the proxy check.
"""
import contextlib
import importlib.util
import inspect
import io
import ipaddress
import json
import os
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
CHECK_UNIT = V3 / 'systemd/debateai-preview-google-addresses.service'
TIMER = V3 / 'systemd/debateai-preview-google-addresses.timer'
DEEPINFRA_CHECK_UNIT = V3 / 'systemd/debateai-preview-gate-addresses.service'
OPERATOR = '/opt/debateai-v3-preview/operator/google-budget-v1/'
INSTALLED_DROPIN = '/etc/systemd/system/debateai-preview-google-budget.service.d/50-google-addresses.conf'
STATE = '/var/lib/debateai-preview-google-addresses/announced'
HOST = 'generativelanguage.googleapis.com'
# The shape of a sample taken on a Mac (it proves nothing about the server; it is only test data).
MEASURED = ['172.217.%d.4' % n for n in range(112, 120)]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


addresses = load(V3 / 'google_addresses.py', 'google_addresses')
measure = load(V3 / 'google_addresses_measure.py', 'google_addresses_measure')


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


def fake_dns(*ips, family=socket.AF_INET):
    def lookup(host, port, asked_family, kind):
        assert (host, port, asked_family, kind) == (HOST, 443, family, socket.SOCK_STREAM)
        return [(socket.AF_INET6 if ':' in ip else socket.AF_INET, kind, 6, '', (ip, port)) for ip in ips]
    return lookup


def broken_dns(*_args):
    raise socket.gaierror('temporary failure in name resolution')


def temp_folder(test):
    folder = Path(tempfile.mkdtemp(prefix='google-addresses-'))
    test.addCleanup(shutil.rmtree, folder, True)
    return folder


class Completed:
    def __init__(self, returncode=0, stdout=b''):
        self.returncode, self.stdout = returncode, stdout


class DropinTests(unittest.TestCase):
    def run_main(self, argv, lookup, run=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=lookup, **({'run': run} if run else {}))
        return code, out.getvalue()

    def dropin(self, text=None):
        path = temp_folder(self) / '50-google-addresses.conf'
        path.write_text(addresses.render(set(map(ipaddress.IPv4Address, MEASURED))) if text is None else text)
        return path

    def test_render_parse_round_trip_is_deterministic(self):
        code, out = self.run_main(['render'], fake_dns(*reversed(MEASURED)))
        self.assertEqual(code, 0)
        self.assertEqual({str(a) for a in addresses.parse_dropin(out)}, set(MEASURED))
        self.assertEqual(self.run_main(['render'], fake_dns(*MEASURED))[1], out)
        self.assertTrue(out.startswith('# Install as ' + INSTALLED_DROPIN + '\n'))
        self.assertEqual([line for line in out.splitlines() if not line.startswith('#')],
                         ['[Service]'] + ['IPAddressAllow=%s/32' % a for a in MEASURED])

    def test_dropin_may_only_add_public_ipv4_slash_32s(self):
        for text in ('', '# only a comment\n', '[Service]\n', 'IPAddressAllow=172.217.112.4/32\n',
                     '[Service]\nIPAddressAllow=172.217.112.0/24\n', '[Service]\nIPAddressAllow=172.217.112.4/31\n',
                     '[Service]\nIPAddressAllow=0.0.0.0/0\n', '[Service]\nIPAddressAllow=any\n',
                     '[Service]\nIPAddressAllow=10.0.0.1/32\n', '[Service]\nIPAddressAllow=127.0.0.1/32\n',
                     '[Service]\nIPAddressAllow=169.254.169.254/32\n', '[Service]\nIPAddressAllow=172.217.112.4\n',
                     '[Service]\nIPAddressAllow=2607:f8b0:4004:c1b::5f/128\n',
                     '[Service]\nIPAddressAllow=172.217.112.4/32 172.217.113.4/32\n',
                     '[Service]\nIPAddressAllow=172.217.112.4/32\nIPAddressAllow=172.217.112.4/32\n',
                     '[Service]\nIPAddressAllow=172.217.112.4/32\nExecStart=/bin/sh\n',
                     '[Service]\nIPAddressAllow=172.217.112.4/32\nIPAddressDeny=\n',
                     '[Service]\nIPAddressAllow=172.217.112.4/32\n[Service]\n',
                     '[Unit]\nIPAddressAllow=172.217.112.4/32\n'):
            with self.subTest(text=text), self.assertRaises(addresses.Refusal) as caught:
                addresses.parse_dropin(text)
            self.assertEqual(caught.exception.args[0], 'DROPIN_INVALID')
        code, out = self.run_main(['check', '--dropin', str(self.dropin('[Service]\nIPAddressAllow=any\n'))], fake_dns(*MEASURED))
        self.assertEqual((code, json.loads(out)['error']), (2, 'DROPIN_INVALID'))

    def test_check_passes_same_and_subset_with_stale_named(self):
        dropin = str(self.dropin())
        code, out = self.run_main(['check', '--dropin', dropin], fake_dns(*MEASURED))
        self.assertEqual((code, json.loads(out)), (0, {'status': 'ok', 'host': HOST, 'allowed': 8, 'resolved': 8, 'new': [], 'stale': []}))
        code, out = self.run_main(['check', '--dropin', dropin], fake_dns(*MEASURED[:3]))
        self.assertEqual((code, json.loads(out)['stale']), (0, MEASURED[3:]))

    def test_check_refuses_a_new_address_and_names_it(self):
        dropin = str(self.dropin())
        code, out = self.run_main(['check', '--dropin', dropin], fake_dns(*MEASURED, '142.250.1.95'))
        line = json.loads(out)
        self.assertEqual((code, line['status'], line['error'], line['new'], line['stale']),
                         (2, 'refused', 'GOOGLE_ADDRESSES_CHANGED', ['142.250.1.95'], []))

    def test_dns_failure_and_missing_inputs_refuse(self):
        dropin = str(self.dropin())
        for lookup in (broken_dns, fake_dns(), fake_dns('not-an-address')):
            self.assertEqual(json.loads(self.run_main(['check', '--dropin', dropin], lookup)[1])['error'], 'DNS_UNAVAILABLE')
        self.assertEqual(json.loads(self.run_main(['render'], broken_dns)[1])['error'], 'DNS_UNAVAILABLE')
        self.assertEqual(json.loads(self.run_main(['check', '--dropin', str(temp_folder(self) / 'x.conf')], fake_dns(*MEASURED))[1])
                         ['error'], 'DROPIN_UNREADABLE')
        self.assertEqual(json.loads(self.run_main(['check'], fake_dns(*MEASURED))[1])['error'], 'DROPIN_REQUIRED')
        self.assertEqual(json.loads(self.run_main(['watch', '--dropin', dropin], fake_dns(*MEASURED))[1])['error'], 'STATE_REQUIRED')

    def test_render_refuses_a_non_public_address_from_dns(self):
        for ip in ('169.254.169.254', '10.1.2.3', '127.0.0.1', '100.64.0.1'):
            with self.subTest(ip=ip):
                code, out = self.run_main(['render'], fake_dns(*MEASURED, ip))
                self.assertEqual((code, json.loads(out)['error']), (2, 'DROPIN_INVALID'))


class WatchAndUpdateTests(unittest.TestCase):
    def run_main(self, argv, lookup, run=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(argv, lookup=lookup, **({'run': run} if run else {}))
        return code, json.loads(out.getvalue().splitlines()[-1])

    def setUp(self):
        self.folder = temp_folder(self)
        self.dropin = self.folder / '50-google-addresses.conf'
        self.dropin.write_text(addresses.render(set(map(ipaddress.IPv4Address, MEASURED))))

    def test_watch_announces_each_change_once_and_again_after_it_is_resolved(self):
        state = self.folder / 'announced'
        argv = ['watch', '--dropin', str(self.dropin), '--state', str(state)]
        changed = fake_dns(*MEASURED, '142.250.1.95')
        code, line = self.run_main(argv, changed)
        self.assertEqual((code, line['error'], line['new'], line['announced']), (3, 'GOOGLE_ADDRESSES_CHANGED', ['142.250.1.95'], 'now'))
        self.assertEqual(oct(os.stat(state).st_mode & 0o777), '0o600')
        self.assertEqual(self.run_main(argv, changed), (0, {**line, 'announced': 'before'}))  # Same change: quiet.
        code, line = self.run_main(argv, fake_dns(*MEASURED, '142.250.1.96'))  # A different change.
        self.assertEqual((code, line['new'], line['announced']), (3, ['142.250.1.96'], 'now'))
        code, line = self.run_main(argv, fake_dns(*MEASURED[:2]))
        self.assertEqual((code, line['status']), (0, 'ok'))
        self.assertFalse(state.exists())  # In step again: the next change is announced.
        self.assertEqual(self.run_main(argv, changed)[0], 3)

    def test_watch_does_not_announce_a_temporary_dns_failure_but_does_a_broken_list(self):
        state = self.folder / 'announced'
        self.assertEqual(self.run_main(['watch', '--dropin', str(self.dropin), '--state', str(state)], broken_dns),
                         (0, {'status': 'dns_unavailable', 'announced': False}))
        self.assertFalse(state.exists())
        code, line = self.run_main(['watch', '--dropin', str(self.folder / 'missing.conf'), '--state', str(state)], fake_dns(*MEASURED))
        self.assertEqual((code, line['error'], line['announced']), (3, 'DROPIN_UNREADABLE', 'now'))

    def test_update_adds_never_drops_writes_0644_atomically_then_reloads(self):
        calls = []

        def run(argv, **kwargs):
            calls.append((argv, kwargs['env']))
            return Completed()
        old_umask = os.umask(0o077)
        try:
            code, line = self.run_main(['update', '--dropin', str(self.dropin)], fake_dns(*MEASURED[1:], '142.250.1.95'), run)
        finally:
            os.umask(old_umask)
        self.assertEqual((code, line['added'], line['stale'], line['allowed'], line['next']),
                         (0, ['142.250.1.95'], [MEASURED[0]], 9, 'systemctl restart debateai-preview-google-budget'))
        self.assertEqual({str(a) for a in addresses.read_dropin(self.dropin)}, set(MEASURED) | {'142.250.1.95'})
        self.assertEqual(oct(os.stat(self.dropin).st_mode & 0o777), '0o644')
        self.assertEqual(calls, [(['/usr/bin/systemctl', 'daemon-reload'], {})])
        self.assertEqual(sorted(p.name for p in self.folder.iterdir()), [self.dropin.name])  # No temporary file left.

    def test_update_refuses_a_non_public_dns_answer_and_writes_nothing(self):
        before = self.dropin.read_text()
        code, line = self.run_main(['update', '--dropin', str(self.dropin)], fake_dns('10.0.0.1'), lambda *a, **k: self.fail('no reload'))
        self.assertEqual((code, line['error']), (2, 'DROPIN_INVALID'))
        self.assertEqual(self.dropin.read_text(), before)

    def test_update_reports_a_failed_reload(self):
        code, line = self.run_main(['update', '--dropin', str(self.dropin)], fake_dns(*MEASURED), lambda *a, **k: Completed(1))
        self.assertEqual((code, line['error']), (2, 'DAEMON_RELOAD_FAILED'))


class ProxyCheckTests(unittest.TestCase):
    def run_main(self, lookup, port, argv=('check-proxy',)):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = addresses.main(list(argv), lookup=lookup, run=lambda *a, **k: self.fail('nothing is run'), proxy_port=port)
        lines = out.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        return code, json.loads(lines[0])

    def listener(self):
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.addCleanup(server.close)
        server.bind(('127.0.0.1', 0))
        server.listen(4)
        server.settimeout(5)
        return server

    def closed_port(self):
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
        probe.close()  # Nobody listens there now.
        return port

    def test_accepts_only_loopback_and_a_listening_forwarder_sending_nothing(self):
        server = self.listener()
        port = server.getsockname()[1]
        code, line = self.run_main(fake_dns('127.0.0.1', '127.0.0.1', family=socket.AF_UNSPEC), port)
        self.assertEqual((code, line), (0, {'status': 'ok', 'host': HOST, 'resolved': ['127.0.0.1'], 'proxy': '127.0.0.1:%d' % port}))
        connection, _ = server.accept()
        with connection:
            connection.settimeout(5)
            self.assertEqual(connection.recv(1), b'')  # It closed without sending a single byte.

    def test_any_answer_other_than_exactly_loopback_refuses_before_connecting(self):
        port = self.closed_port()  # Would be unreachable: the address refusal must come first.
        for ips in (('127.0.0.1', '::1'), ('::1',), ('172.217.112.4',), ('127.0.0.1', '172.217.112.4'),
                    ('127.0.0.2',), ('2607:f8b0:4004:c1b::5f',), ()):
            with self.subTest(ips=ips):
                code, line = self.run_main(fake_dns(*ips, family=socket.AF_UNSPEC), port)
                self.assertEqual((code, line['error'], line['resolved']),
                                 (2, 'GOOGLE_EGRESS_NOT_PROXIED', sorted(set(ips), key=lambda a: (':' in a, a))))
        code, line = self.run_main(broken_dns, port)
        self.assertEqual((code, line), (2, {'status': 'refused', 'error': 'GOOGLE_EGRESS_NOT_PROXIED', 'host': HOST, 'resolved': []}))

    def test_no_forwarder_listening_refuses(self):
        port = self.closed_port()
        code, line = self.run_main(fake_dns('127.0.0.1', family=socket.AF_UNSPEC), port)
        self.assertEqual((code, line), (2, {'status': 'refused', 'error': 'GOOGLE_PROXY_UNREACHABLE', 'host': HOST,
                                            'proxy': '127.0.0.1:%d' % port}))

    def test_takes_no_file_arguments_and_the_server_always_checks_port_443(self):
        self.assertEqual(self.run_main(broken_dns, 1, ('check-proxy', '--dropin', '/x'))[1]['error'], 'ARGUMENTS_INVALID')
        self.assertEqual(inspect.signature(addresses.main).parameters['proxy_port'].default, 443)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            addresses.main(['check-proxy', '--port', '1'])

    def test_no_key_and_no_payload_anywhere_in_the_scripts(self):
        source = inspect.getsource(addresses.check_proxy)
        for absent in ('open(', '.send', '.recv', '.read', '.write'):
            self.assertNotIn(absent, source)
        for path in (V3 / 'google_addresses.py', V3 / 'google_addresses_measure.py'):
            text = path.read_text()
            for absent in ('api-key', 'api_key', 'Authorization', 'Bearer', 'x-goog-api-key', 'shell=True', '/' + 'Users/', '/' + 'home/'):
                self.assertNotIn(absent, text, path.name)


class Clock:
    """A fake clock: sleeping moves time forward; each lookup takes a moment."""

    def __init__(self, start=1_760_000_000.0):
        self.t, self.sleeps = start, []

    def now(self):
        return self.t

    def sleep(self, seconds):
        self.assertive(seconds)
        self.sleeps.append(seconds)
        self.t += seconds

    @staticmethod
    def assertive(seconds):
        assert seconds > 0, seconds


class MeasureTests(unittest.TestCase):
    def setUp(self):
        self.folder = temp_folder(self)
        self.out = self.folder / 'samples.jsonl'
        self.clock = Clock()

    def lookup_from(self, answers):
        """answers(slot) -> list of addresses, or a LookupFailed code string."""
        calls = []

        def lookup():
            calls.append(self.clock.t)
            answer = answers(len(calls) - 1)
            self.clock.t += 0.2
            if isinstance(answer, str):
                raise measure.LookupFailed(answer)
            return answer
        return lookup, calls

    def run_measure(self, answers, hours='1', interval='60', extra=(), which=None):
        lookup, calls = self.lookup_from(answers) if answers else (None, [])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = measure.main(['run', '--out', str(self.out), '--hours', hours, '--interval-seconds', interval, *extra],
                                lookup=lookup, now=self.clock.now, sleep=self.clock.sleep,
                                which=which or (lambda name: self.fail('getent is never looked up when faked')))
        return code, out.getvalue(), calls

    def facts(self, text):
        return json.loads(text.splitlines()[-1])

    def rotating(self, slot):
        return sorted({MEASURED[slot % 8], MEASURED[(slot + 3) % 8]})

    def test_pinnable_when_every_rule_holds(self):
        code, text, calls = self.run_measure(self.rotating)
        facts = self.facts(text)
        self.assertEqual(code, 0)
        self.assertEqual((facts['planned'], facts['taken'], facts['succeeded'], facts['failed'], facts['distinct']), (60, 60, 60, 0, 8))
        self.assertEqual((facts['verdict'], facts['reasons']), ('pinnable', []))
        self.assertEqual(facts['networks_24'], ['172.217.%d.0/24' % n for n in range(112, 120)])
        self.assertEqual([e['address'] for e in facts['addresses']], MEASURED)
        self.assertEqual(sum(e['count'] for e in facts['addresses']), 120)
        self.assertEqual(facts['addresses'][0]['first_seen'], measure.utc(self.clock.t - 0.2 - 59 * 60))
        self.assertEqual(facts['samples_with_new_address'], 4)  # Slots 1, 2, 3, 4 each bring one or two new ones.
        self.assertEqual(facts['last_new_slot'], 4)
        self.assertIn('VERDICT: pinnable\n', text)
        self.assertIn('Samples taken: 60 (succeeded 60, failed 0)', text)
        # On schedule: one sample per slot, each at its own minute, no drift from the lookup time.
        self.assertEqual([round(t - calls[0], 6) for t in calls], [60.0 * n for n in range(60)])
        lines = self.out.read_text().splitlines()
        self.assertEqual(len(lines), 61)  # The plan line, then one line per sample.
        self.assertEqual(json.loads(lines[0])['planned_samples'], 60)
        # `report` on the file says the same thing as the end of the run.
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(measure.main(['report', '--samples', str(self.out)]), 0)
        self.assertEqual(out.getvalue(), text)

    def verdict(self, answers):
        code, text, _ = self.run_measure(answers)
        self.assertEqual(code, 0)
        facts = self.facts(text)
        if facts['reasons']:
            self.assertIn('VERDICT: not pinnable: use the proxy (README)\n', text)
        return facts['reasons']

    def test_too_few_successful_samples(self):
        self.assertEqual(self.verdict(lambda s: 'LOOKUP_FAILED' if s < 6 else self.rotating(s)), [])  # 54 of 60 is 90%.
        self.out.unlink()
        self.assertEqual(self.verdict(lambda s: 'LOOKUP_TIMEOUT' if s < 7 else self.rotating(s)), ['TOO_FEW_SAMPLES'])
        self.assertIn('"error": "LOOKUP_TIMEOUT"', self.out.read_text())

    def test_a_non_public_address(self):
        self.assertEqual(self.verdict(lambda s: self.rotating(s) + (['10.0.0.1'] if s == 2 else [])), ['NON_PUBLIC_ADDRESS'])

    def test_too_many_addresses(self):
        many = lambda count: (lambda s: ['142.250.%d.%d' % (n // 200, n % 200 + 1) for n in range(count)])
        self.assertEqual(self.verdict(many(64)), [])
        self.out.unlink()
        self.assertEqual(self.verdict(many(65)), ['TOO_MANY_ADDRESSES'])

    def test_a_new_address_in_the_second_half(self):
        self.assertEqual(self.verdict(lambda s: self.rotating(s) + (['142.250.1.95'] if s == 29 else [])), [])
        self.out.unlink()
        self.assertEqual(self.verdict(lambda s: self.rotating(s) + (['142.250.1.95'] if s == 30 else [])), ['NEW_ADDRESS_IN_SECOND_HALF'])

    def test_every_failing_reason_is_listed_together(self):
        reasons = self.verdict(lambda s: 'LOOKUP_FAILED' if s % 2 else ['10.0.0.%d' % (s + 1)] + ['142.250.%d.1' % n for n in range(64)])
        self.assertEqual(reasons, ['TOO_FEW_SAMPLES', 'NON_PUBLIC_ADDRESS', 'TOO_MANY_ADDRESSES', 'NEW_ADDRESS_IN_SECOND_HALF'])

    def test_refuses_an_existing_out_file_unless_resume(self):
        self.out.write_text('owner data\n')
        code, text, calls = self.run_measure(self.rotating)
        self.assertEqual((code, json.loads(text), calls), (2, {'status': 'refused', 'error': 'OUT_EXISTS'}, []))
        self.assertEqual(self.out.read_text(), 'owner data\n')
        self.out.unlink()
        code, text, _ = self.run_measure(self.rotating, extra=('--resume',))
        self.assertEqual((code, json.loads(text)['error']), (2, 'OUT_MISSING'))
        self.assertFalse(self.out.exists())

    def test_resume_carries_on_the_same_plan_after_a_crash(self):
        def crash(slot):
            if slot == 20:
                raise KeyboardInterrupt  # The run dies after 20 samples.
            return self.rotating(slot)
        with self.assertRaises(KeyboardInterrupt):
            self.run_measure(crash)
        with open(self.out, 'ab') as stream:
            stream.write(b'{"slot": 20, "at": 1')  # Half a line, as a power cut could leave it.
        self.clock.t += 10 * 60  # Down for ten minutes: those slots are missed.
        code, text, calls = self.run_measure(lambda s: self.rotating(s + 20), extra=('--resume',))
        facts = self.facts(text)
        self.assertEqual(code, 0)
        self.assertEqual((facts['planned'], facts['taken'], facts['succeeded']), (60, 50, 50))
        self.assertEqual(facts['reasons'], ['TOO_FEW_SAMPLES'])
        self.assertIn('missed while not running: 10.', text)
        slots = [json.loads(line)['slot'] for line in self.out.read_text().splitlines()[1:]]
        self.assertEqual(slots, list(range(20)) + list(range(30, 60)))

    def test_resume_refuses_a_different_plan_and_a_broken_file(self):
        self.run_measure(self.rotating)
        code, text, _ = self.run_measure(self.rotating, hours='2', extra=('--resume',))
        self.assertEqual((code, json.loads(text)), (2, {'status': 'refused', 'error': 'PLAN_MISMATCH', 'hours': 1, 'interval_seconds': 60}))
        for broken in ('', 'not json\n', '{"schema": "other"}\n',
                       self.out.read_text().replace('"ok": true', '"ok": "yes"', 1),
                       self.out.read_text().replace('172.217.112.4', '172.217.112.999', 1),
                       self.out.read_text() + self.out.read_text().splitlines()[-1] + '\n'):  # A slot twice.
            with self.subTest(broken=broken[:40]):
                path = self.folder / 'broken.jsonl'
                path.write_text(broken)
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(measure.main(['report', '--samples', str(path)]), 2)
                self.assertEqual(json.loads(out.getvalue())['error'], 'SAMPLES_UNREADABLE')

    def test_bad_numbers_refuse_before_anything_is_written(self):
        for hours, interval in (('0', '60'), ('-1', '60'), ('169', '60'), ('nan', '60'), ('1', '0'), ('1', '3601'), ('0.01', '60')):
            with self.subTest(hours=hours, interval=interval):
                code, text, calls = self.run_measure(self.rotating, hours=hours, interval=interval)
                self.assertEqual((code, json.loads(text)['error'], calls), (2, 'ARGUMENTS_INVALID', []))
                self.assertFalse(self.out.exists())

    def test_getent_missing_from_path_refuses_loudly_and_writes_nothing(self):
        code, text, _ = self.run_measure(None, which=lambda name: None)
        self.assertEqual((code, json.loads(text)), (2, {'status': 'refused', 'error': 'GETENT_NOT_FOUND'}))
        self.assertFalse(self.out.exists())
        self.assertEqual(measure.find_getent(lambda name: 'bin/getent' if name == 'getent' else None),
                         os.path.abspath('bin/getent'))

    def test_getent_is_run_with_a_fixed_argument_list_and_its_answer_parsed(self):
        calls = []

        def run(argv, **kwargs):
            calls.append((argv, kwargs))
            return Completed(0, b'172.217.113.4   STREAM ' + HOST.encode() + b'\n172.217.113.4   DGRAM  \n'
                                b'172.217.113.4   RAW    \n172.217.112.4   STREAM \n')
        self.assertEqual(measure.getent_lookup('/found/on/path/getent', run)(), ['172.217.112.4', '172.217.113.4'])
        argv, kwargs = calls[0]
        self.assertEqual(argv, ['/found/on/path/getent', 'ahostsv4', HOST])
        self.assertEqual((kwargs['env'], kwargs['timeout'], kwargs.get('shell', False)), ({}, 30, False))
        for answer, code in ((Completed(2), 'LOOKUP_FAILED'), (Completed(0, b''), 'LOOKUP_EMPTY'),
                             (Completed(0, b'garbage STREAM\n'), 'LOOKUP_UNPARSABLE'),
                             (Completed(0, b'2607:f8b0::5f STREAM\n'), 'LOOKUP_UNPARSABLE'),
                             (Completed(0, b'\xff\n'), 'LOOKUP_UNPARSABLE'),
                             (subprocess.TimeoutExpired('getent', 30), 'LOOKUP_TIMEOUT'), (OSError(), 'LOOKUP_FAILED')):
            def failing(argv, answer=answer, **kwargs):
                if isinstance(answer, BaseException):
                    raise answer
                return answer
            with self.subTest(code=code), self.assertRaises(measure.LookupFailed) as caught:
                measure.getent_lookup('getent', failing)()
            self.assertEqual(caught.exception.args[0], code)


class UnitFileTests(unittest.TestCase):
    def test_the_watcher_runs_the_google_script_unprivileged_with_only_the_resolver(self):
        start = values(CHECK_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start, ['/usr/bin/python3', '-I', OPERATOR + 'google_addresses.py', 'watch',
                                 '--dropin', INSTALLED_DROPIN, '--state', STATE])
        self.assertEqual(values(CHECK_UNIT, 'DynamicUser'), ['yes'])
        self.assertEqual(values(CHECK_UNIT, 'StateDirectory'), ['debateai-preview-google-addresses'])
        self.assertEqual((values(CHECK_UNIT, 'IPAddressDeny'), values(CHECK_UNIT, 'IPAddressAllow')), (['any'], ['127.0.0.53/32']))
        self.assertEqual(values(CHECK_UNIT, 'OnFailure'), ['debateai-preview-notice@google-addresses-mismatch.service'])
        self.assertEqual(values(CHECK_UNIT, 'CapabilityBoundingSet'), [''])

    def test_everything_else_is_the_reviewed_deepinfra_watcher(self):
        changed = {'Description', 'OnFailure', 'ExecStart', 'StateDirectory'}
        self.assertEqual([p for p in directives(CHECK_UNIT) if p[0] not in changed],
                         [p for p in directives(DEEPINFRA_CHECK_UNIT) if p[0] not in changed])

    def test_the_timer_is_hourly(self):
        self.assertEqual(directives(TIMER), [('Description', "DebateAI preview: hourly check of the Google spending gate's allow-list"),
                                             ('OnCalendar', 'hourly'), ('RandomizedDelaySec', '5min'), ('Persistent', 'yes')])

    def test_both_say_measured_list_mode_only_and_have_no_install_section(self):
        for path in (CHECK_UNIT, TIMER):
            with self.subTest(unit=path.name):
                text = path.read_text()
                self.assertIn('ONLY in measured-list mode', text)
                self.assertNotIn('[Install]', text.splitlines())
                self.assertFalse(os.stat(path).st_mode & 0o022)


if __name__ == '__main__':
    unittest.main()
