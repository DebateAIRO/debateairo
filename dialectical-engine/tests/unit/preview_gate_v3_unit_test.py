"""The reviewed gate v3 systemd files and the enabled-model start check.

Offline only: no DNS, no network, no systemd. A fake opener stands in for urllib. The v2 files
(still what the server runs until the cutover) keep their own test, preview_gate_v2_unit_test.py.
"""
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / 'deploy/preview-gate/v2'
V3 = ROOT / 'deploy/preview-gate/v3'
UNIT, V2_UNIT = V3 / 'systemd/debateai-preview-provider-budget.service', V2 / 'systemd/debateai-preview-provider-budget.service'
HALT_UNIT, V2_HALT_UNIT = V3 / 'systemd/debateai-preview-gate-halt-watch.service', V2 / 'systemd/debateai-preview-gate-halt-watch.service'
CHECK_UNIT, V2_CHECK_UNIT = V3 / 'systemd/debateai-preview-gate-addresses.service', V2 / 'systemd/debateai-preview-gate-addresses.service'
ALERT = ROOT / 'deploy/preview-lifecycle/v1/alert.mjs'
GATE = ROOT / 'packages/providers/ops/preview_budget_authority.py'
OPERATOR = '/opt/debateai-v3-preview/operator/deepinfra-budget-v3/'
PRIVATE = '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3'
GO = '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json'
SOCKET = '/run/debateai-v3-preview/deepinfra-budget-v3.sock'
V2_PRIVATE = '/var/lib/debateai-v3-preview/provider-team-authority-v2'
DROPIN = '/etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf'
GLM, DEEPSEEK, MIMO = 'zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'XiaomiMiMo/MiMo-V2.6-Pro'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


models = load(V3 / 'deepinfra_models.py', 'deepinfra_models')


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


class Reply:
    def __init__(self, status, raw):
        self.status, self.raw = status, raw

    def read(self, size):
        return self.raw[:size]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeOpener:
    """Records each URL; answers from a {model: (status, bytes) | exception} table."""

    def __init__(self, answers):
        self.answers, self.urls = answers, []

    def open(self, url, timeout):
        self.urls.append((url, timeout))
        answer = self.answers[url.rsplit('/models/', 1)[1]]
        if isinstance(answer, BaseException):
            raise answer
        return Reply(*answer)


class ModelCheckTests(unittest.TestCase):
    def go(self, **fields):
        folder = Path(tempfile.mkdtemp(prefix='gate-models-'))
        self.addCleanup(shutil.rmtree, folder, True)
        path = folder / 'go.json'
        path.write_text(json.dumps({'schema': 'preview-provider-budget-go-v3', 'provider': 'deepinfra',
                                    'enabled_models': [GLM], **fields}))
        return path

    def run_main(self, path, opener):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = models.main(['check', '--go', str(path)], opener=opener)
        lines = out.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        return code, json.loads(lines[0])

    def test_one_keyless_get_per_enabled_model(self):
        opener = FakeOpener({GLM: (200, b'{"model_name": "x"}'), DEEPSEEK: (200, b'{}'), MIMO: (200, b'{}')})
        code, line = self.run_main(self.go(enabled_models=[GLM, DEEPSEEK, MIMO]), opener)
        self.assertEqual((code, line), (0, {'status': 'ok', 'host': 'api.deepinfra.com', 'models': [GLM, DEEPSEEK, MIMO]}))
        self.assertEqual(opener.urls, [('https://api.deepinfra.com/models/' + m, 20) for m in (GLM, DEEPSEEK, MIMO)])

    def test_a_model_deepinfra_no_longer_lists_refuses_and_is_named(self):
        for answer in ((404, b'{}'), urllib.error.HTTPError('u', 404, 'Not Found', {}, None), (200, b'not json'),
                       (200, b'[]'), (204, b''), (200, b'{' + b' ' * (2 * 1024 * 1024) + b'}')):
            with self.subTest(answer=answer if not isinstance(answer, tuple) else answer[0]):
                opener = FakeOpener({GLM: (200, b'{}'), DEEPSEEK: answer})
                code, line = self.run_main(self.go(enabled_models=[GLM, DEEPSEEK]), opener)
                self.assertEqual((code, line), (2, {'status': 'refused', 'error': 'MODEL_NOT_LISTED', 'missing': [DEEPSEEK]}))

    def test_network_failure_refuses_with_its_own_code(self):
        for failure in (urllib.error.URLError('down'), TimeoutError('slow'), ConnectionRefusedError()):
            with self.subTest(failure=type(failure).__name__):
                code, line = self.run_main(self.go(), FakeOpener({GLM: failure}))
                self.assertEqual((code, line), (2, {'status': 'refused', 'error': 'MODEL_CHECK_UNAVAILABLE', 'model': GLM}))

    def test_only_a_deepinfra_go_with_safe_unique_ids_is_checked(self):
        opener = FakeOpener({})
        for fields, error in (({'provider': 'anthropic'}, 'GO_PROVIDER_NOT_DEEPINFRA'), ({'provider': None}, 'GO_PROVIDER_NOT_DEEPINFRA'),
                              ({'enabled_models': []}, 'GO_MODELS_INVALID'), ({'enabled_models': GLM}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': [GLM, GLM]}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['zai-org/../admin']}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['a/b/c']}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['a b']}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['x?key=1']}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['x#y']}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': [7]}, 'GO_MODELS_INVALID'),
                              ({'enabled_models': ['m%d' % n for n in range(17)]}, 'GO_MODELS_INVALID')):
            with self.subTest(fields=fields):
                self.assertEqual(self.run_main(self.go(**fields), opener), (2, {'status': 'refused', 'error': error}))
        self.assertEqual(opener.urls, [])
        for broken in ('{', '[]', ''):
            path = self.go()
            path.write_text(broken)
            self.assertEqual(self.run_main(path, opener)[1]['error'], 'GO_UNREADABLE')
        self.assertEqual(self.run_main(Path('/nonexistent/go.json'), opener)[1]['error'], 'GO_UNREADABLE')

    def test_the_real_opener_uses_no_proxy_and_follows_no_redirect(self):
        with patch.dict(os.environ, {'https_proxy': 'http://proxy.invalid:3128', 'HTTPS_PROXY': 'http://proxy.invalid:3128'}):
            opener = models.build_opener()
            default = urllib.request.build_opener()
        proxies = [h for h in opener.handlers if isinstance(h, urllib.request.ProxyHandler)]
        redirects = [h for h in opener.handlers if isinstance(h, urllib.request.HTTPRedirectHandler)]
        self.assertEqual(proxies, [])  # The empty handler has no proxy to open through, so none is installed.
        self.assertTrue([h for h in default.handlers if isinstance(h, urllib.request.ProxyHandler)])  # The control.
        self.assertEqual([type(h) for h in redirects], [models.NoRedirect])
        self.assertIsNone(redirects[0].redirect_request(None, None, 302, 'Found', {}, 'https://elsewhere.invalid/'))

    def test_it_never_sends_a_key_or_writes_anything(self):
        text = (V3 / 'deepinfra_models.py').read_text()
        for absent in ('api-key', 'Authorization', 'Bearer', "'w'", "'wb'", "'a'", '.write(', 'unlink', 'rename'):
            self.assertNotIn(absent, text)
        self.assertIn("open(go_path, 'rb')", text)


class UnitFileTests(unittest.TestCase):
    def test_exec_lines_name_the_v3_gate_go_state_and_fresh_socket(self):
        gate = load(GATE, 'gate_for_v3_unit_test')  # Import only: no helper runs, no phase starts.
        execs = values(UNIT, 'ExecStartPre') + values(UNIT, 'ExecStart')
        self.assertEqual(len(execs), 3)
        for line in execs:
            self.assertTrue(line.startswith('/usr/bin/python3 -I ' + OPERATOR), line)
        self.assertEqual(values(UNIT, 'ExecStartPre')[0].split()[2:], [OPERATOR + 'deepinfra_addresses.py', 'check', '--dropin', DROPIN])
        self.assertEqual(values(UNIT, 'ExecStartPre')[1].split()[2:], [OPERATOR + 'deepinfra_models.py', 'check', '--go', GO])
        start = values(UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[2:4], [OPERATOR + 'preview_budget_authority.py', 'serve'])
        self.assertEqual(dict(zip(start[4::2], start[5::2])), {'--private': PRIVATE, '--go': GO, '--socket': SOCKET})
        self.assertTrue(gate.socket_path_allowed(SOCKET))
        self.assertFalse(gate.socket_path_allowed('/run/debateai-v3-preview/team-budget-v2.sock'))
        self.assertEqual(values(UNIT, 'ReadWritePaths'), [PRIVATE + ' /run/debateai-v3-preview'])
        self.assertNotIn('GLM', ' '.join(execs))  # No model is fixed in the unit any more.

    def test_everything_else_is_the_reviewed_v2_unit(self):
        changed = {'Description', 'Documentation', 'ExecStartPre', 'ExecStart', 'ReadWritePaths', 'InaccessiblePaths'}
        self.assertEqual([pair for pair in directives(UNIT) if pair[0] not in changed],
                         [pair for pair in directives(V2_UNIT) if pair[0] not in changed])
        hidden, v2_hidden = ' '.join(values(UNIT, 'InaccessiblePaths')).split(), ' '.join(values(V2_UNIT, 'InaccessiblePaths')).split()
        self.assertEqual(set(hidden) - set(v2_hidden), {'-' + V2_PRIVATE, '-/etc/debateai-v3-preview/provider-team-go-v2.json'})
        self.assertLessEqual(set(v2_hidden), set(hidden))
        self.assertEqual((values(UNIT, 'IPAddressDeny'), values(UNIT, 'IPAddressAllow')), (['any'], ['127.0.0.53/32']))

    def test_watchers_follow_the_v3_gate(self):
        start = values(HALT_UNIT, 'ExecStart')[0].split()
        self.assertEqual(start[:3], ['/usr/bin/python3', '-I', OPERATOR + 'gate_watch.py'])
        self.assertEqual(dict(zip(start[3::2], start[4::2]))['--private'], PRIVATE)
        hidden = ' '.join(values(HALT_UNIT, 'InaccessiblePaths')).split()
        self.assertIn('-' + PRIVATE + '/api-key.txt', hidden)
        self.assertIn('-' + V2_PRIVATE, hidden)
        self.assertEqual(values(CHECK_UNIT, 'ExecStart')[0].split()[2:4], [OPERATOR + 'deepinfra_addresses.py', 'watch'])
        for v3, v2 in ((HALT_UNIT, V2_HALT_UNIT), (CHECK_UNIT, V2_CHECK_UNIT)):
            with self.subTest(unit=v3.name):
                same = {'ExecStart', 'InaccessiblePaths'}
                self.assertEqual([p for p in directives(v3) if p[0] not in same], [p for p in directives(v2) if p[0] not in same])
        # The two scripts the watchers run are v2's, unchanged; the operator copies them into the v3 folder.
        self.assertTrue((V2 / 'gate_watch.py').is_file() and (V2 / 'deepinfra_addresses.py').is_file())
        self.assertFalse((V3 / 'gate_watch.py').exists() or (V3 / 'deepinfra_addresses.py').exists())

    def test_the_halt_email_names_the_v3_reopen_command(self):
        text = ALERT.read_text()
        self.assertIn("const GATE_FOLDER = '%s';" % OPERATOR.rstrip('/'), text)
        self.assertIn('preview_budget_authority.py activate --private %s --go %s' % (PRIVATE, GO), text)
        self.assertNotIn('team-budget-v2', text)

    def test_readme_names_the_same_paths_and_the_proposed_go(self):
        readme = (V3 / 'README.md').read_text()
        for name in (OPERATOR, PRIVATE, GO, SOCKET, 'preview-provider-budget-go-v3', '"3.00"', '1200',
                     'max_concurrent_calls', GLM, DEEPSEEK, MIMO, ' probe '):
            self.assertIn(name, readme)

    def test_no_secret_or_machine_specific_path_in_the_folder(self):
        for path in sorted(V3.rglob('*')):
            if path.is_file():
                text = path.read_text()
                with self.subTest(path=path.name):
                    self.assertNotIn('/Users/', text)
                    self.assertNotIn('/home/', text)
                    self.assertIsNone(re.search(r'(?i)bearer\s+[a-z0-9]{8}', text))
                    self.assertFalse(os.stat(path).st_mode & 0o022, path)
                    self.assertNotIn('[Install]', text.splitlines())


if __name__ == '__main__':
    unittest.main()
