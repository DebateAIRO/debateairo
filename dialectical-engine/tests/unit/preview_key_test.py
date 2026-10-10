"""The guided key command shared by every provider gate (deploy/preview-gate/v3/preview_key.py).

Offline only: temporary folders owned by the developer stand in for root's, through the
script's test seams (no command-line argument reaches them). Never a real key: the values below
are made up and built from pieces so a secret scanner does not read them as keys.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import pty
import select
import shutil
import sys
import tempfile
import termios
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[2] / 'deploy/preview-gate/v3/preview_key.py'
spec = importlib.util.spec_from_file_location('preview_key', SCRIPT)
preview_key = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview_key)
Refusal = preview_key.Refusal
KEYS = {'deepinfra': ('synthetic' + '-deepinfra-' + '0123456789').encode(),
        'anthropic': ('sk-' + 'ant-' + 'synthetic_test-' + '0123456789').encode(),
        'google': ('AI' + 'za' + 'Synthetic_test-' + 'x' * 20).encode()}


class KeyCommandTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='preview-key-'))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.folders = {}
        for name in preview_key.FOLDERS:
            folder = self.root / name
            folder.mkdir()
            os.chmod(folder, 0o700)
            self.folders[name] = str(folder)
        self.reads = []

    def install(self, provider, replace=False, key=None, **seams):
        def read_line(name):
            self.reads.append(name)
            return KEYS[provider] if key is None else key
        options = {'read_line': read_line, 'euid': lambda: 0, 'stdin_isatty': lambda: True, 'folders': self.folders,
                   'owner_uid': os.getuid()}
        options.update(seams)
        return preview_key.install(provider, replace, **options)

    def refused(self, code):
        return self.assertRaisesRegex(Refusal, '^' + code + '$')

    def key_file(self, provider):
        return Path(self.folders[provider]) / 'api-key.txt'

    def listing(self, provider):
        return sorted(os.listdir(self.folders[provider]))


class InstallTests(KeyCommandTest):
    def test_each_provider_installs_its_key_as_one_root_only_file(self):
        previous = os.umask(0)  # Even a lax umask gives exactly 600.
        self.addCleanup(os.umask, previous)
        for provider in ('deepinfra', 'anthropic', 'google'):
            with self.subTest(provider):
                result = self.install(provider)
                path = self.key_file(provider)
                info = path.stat()
                self.assertEqual(result, {'status': 'installed', 'provider': provider, 'mode': '600',
                                          'owner': '%d:%d' % (info.st_uid, info.st_gid), 'links': 1,
                                          'size': len(KEYS[provider]) + 1})
                self.assertEqual(path.read_bytes(), KEYS[provider] + b'\n')
                self.assertEqual((oct(info.st_mode & 0o777), info.st_nlink), ('0o600', 1))
                self.assertEqual(self.listing(provider), ['api-key.txt'])  # No temporary file left.
                self.assertNotIn(KEYS[provider].decode(), json.dumps(result))
                self.assertNotIn(hashlib.sha256(KEYS[provider]).hexdigest(), json.dumps(result))
        self.assertEqual(self.reads, ['deepinfra', 'anthropic', 'google'])

    def test_an_existing_key_is_kept_without_replace_and_replaced_with_it(self):
        self.install('anthropic')
        newer = ('sk-' + 'ant-' + 'synthetic_newer-' + '9876543210').encode()
        self.reads.clear()
        with self.refused('KEY_EXISTS'):
            self.install('anthropic', key=newer)
        self.assertEqual(self.reads, [])  # Refused before the prompt.
        self.assertEqual(self.key_file('anthropic').read_bytes(), KEYS['anthropic'] + b'\n')
        result = self.install('anthropic', replace=True, key=newer)
        self.assertEqual((result['links'], result['size']), (1, len(newer) + 1))
        self.assertEqual(self.key_file('anthropic').read_bytes(), newer + b'\n')
        self.assertEqual(self.listing('anthropic'), ['api-key.txt'])
        self.install('google', replace=True)  # --replace with nothing there yet is fine.
        self.assertEqual(self.key_file('google').read_bytes(), KEYS['google'] + b'\n')

    def test_a_key_that_appears_while_the_owner_types_is_never_overwritten(self):
        def read_line(_name):
            self.key_file('anthropic').write_bytes(b'placed meanwhile\n')
            return KEYS['anthropic']
        with self.refused('KEY_EXISTS'):
            self.install('anthropic', read_line=read_line)
        self.assertEqual(self.key_file('anthropic').read_bytes(), b'placed meanwhile\n')
        self.assertEqual(self.listing('anthropic'), ['api-key.txt'])

    def test_another_providers_key_is_refused(self):
        self.key_file('deepinfra').write_bytes(KEYS['anthropic'] + b'\n')
        with self.refused('KEY_USED_BY_OTHER_PROVIDER'):
            self.install('anthropic')
        self.assertEqual(self.listing('anthropic'), [])
        self.key_file('deepinfra').unlink()
        self.key_file('google').write_bytes(KEYS['deepinfra'])  # No newline: compared as the gate reads it.
        with self.refused('KEY_USED_BY_OTHER_PROVIDER'):
            self.install('deepinfra')
        self.assertEqual(self.listing('deepinfra'), [])

    def test_the_temporary_file_is_removed_when_writing_fails(self):
        real_fsync, calls = os.fsync, []

        def failing_fsync(fd):
            calls.append(fd)
            raise OSError(5, 'synthetic I/O error')
        with patch.object(preview_key.os, 'fsync', failing_fsync), self.assertRaises(OSError):
            self.install('anthropic')
        self.assertTrue(calls)
        self.assertEqual(self.listing('anthropic'), [])
        self.assertIs(os.fsync, real_fsync)

    def test_a_file_that_is_not_root_only_after_writing_is_refused(self):
        # The written file is checked once more: here it is judged against another owner than the
        # developer who wrote it, as a file not owned by root would be on the server.
        original = preview_key.write_key

        def other_owner(dir_fd, raw, replace, _owner):
            return original(dir_fd, raw, replace, os.getuid() + 1)
        with patch.object(preview_key, 'write_key', other_owner), self.refused('KEY_FILE_NOT_SAFE'):
            self.install('anthropic')


class RefusalTests(KeyCommandTest):
    def test_only_install_and_a_known_provider_are_accepted(self):
        for argv in ([], ['install'], ['install', 'openai'], ['install', 'Anthropic'], ['install', 'anthropic', '--force'],
                     ['install', '--replace', 'anthropic'], ['install', 'anthropic', '--replace', 'x'],
                     ['remove', 'anthropic'], ['install', 'anthropic', '--folders', '/tmp'], ['install', 'anthropic', '-r'],
                     ['install', 'anthropic', '--replac'], ['install', 'anthropic', KEYS['anthropic'].decode()]):
            with self.subTest(argv=argv), self.refused('USAGE'):
                preview_key.parse(argv)
        self.assertEqual(preview_key.parse(['install', 'google']), ('google', False))
        self.assertEqual(preview_key.parse(['install', 'deepinfra', '--replace']), ('deepinfra', True))

    def test_main_refuses_with_one_line_and_never_prompts_without_a_terminal(self):
        for argv, error in ((['install', 'openai'], 'USAGE'), (['install', 'anthropic'], 'NOT_A_TERMINAL'),
                            (['install', 'anthropic', '--replace'], 'NOT_A_TERMINAL')):
            with self.subTest(argv=argv):
                out = io.StringIO()
                with contextlib.redirect_stdout(out), patch.object(preview_key.os, 'isatty', return_value=False), \
                        patch.object(preview_key, 'read_hidden', side_effect=AssertionError('prompted')):
                    code = preview_key.main(argv)
                self.assertEqual((code, json.loads(out.getvalue())), (2, {'status': 'refused', 'error': error}))

    def test_no_terminal_or_not_root_refuses_before_the_prompt_and_any_file(self):
        with self.refused('NOT_A_TERMINAL'):
            self.install('anthropic', stdin_isatty=lambda: False)
        with self.refused('ROOT_REQUIRED'):
            self.install('anthropic', euid=lambda: 1000)
        self.assertEqual((self.reads, self.listing('anthropic')), ([], []))

    def test_wrong_key_shapes_are_refused_without_showing_the_key(self):
        long = b'sk-ant-' + b'a' * 506
        cases = {'anthropic': [b'sk-ant-short', long, b'sk-ant-has space-0123456789', b'sk-ant-\xc3\xbc0123456789abcdef',
                               b'sk-ant-0123456789abcdef\n', KEYS['google'], KEYS['deepinfra'], b'', b'sk-ant-01234/56789ab'],
                 'google': [b'AIza' + b'x' * 34, b'AIza' + b'x' * 36, b'AIzb' + b'x' * 35, b'AIza' + b'x' * 34 + b'.',
                            KEYS['anthropic']],
                 # Another provider's key pasted at the DeepInfra prompt is refused too.
                 'deepinfra': [b'x' * 15, b'x' * 513, b'has a space in it here', b'tab\tinside-0123456789', b'\x7f' * 20, b'',
                               KEYS['anthropic'], KEYS['google'], b'sk-ant-anything-0123456789', b'AIza-anything-0123456789']}
        self.assertEqual(len(long), 513)
        for provider, keys in cases.items():
            for key in keys:
                with self.subTest(provider=provider, key=key[:20]):
                    with self.assertRaises(Refusal) as refused:
                        self.install(provider, key=key)
                    self.assertEqual(str(refused.exception), 'KEY_SHAPE_INVALID')
                    if key:
                        self.assertNotIn(key.decode('latin-1'), str(refused.exception))
                    self.assertEqual(self.listing(provider), [])
        self.assertTrue(preview_key.shape_ok('anthropic', b'sk-ant-' + b'a' * 505))  # 512 characters in all.
        self.assertTrue(preview_key.shape_ok('deepinfra', b'!' * 16))
        self.assertTrue(preview_key.shape_ok('deepinfra', b'sk-other-0123456789'))  # Only the known prefixes are refused.

    def test_a_folder_that_is_not_roots_700_folder_is_refused(self):
        loose = self.root / 'loose'
        loose.mkdir()
        os.chmod(loose, 0o755)
        link = self.root / 'link'
        link.symlink_to(self.folders['anthropic'])
        plain = self.root / 'plain'
        plain.write_bytes(b'')
        for folder in (loose, link, plain, self.root / 'missing'):
            with self.subTest(folder=folder.name), self.refused('FOLDER_NOT_SAFE'):
                self.install('anthropic', folders={**self.folders, 'anthropic': str(folder)})
        with self.refused('FOLDER_NOT_SAFE'):
            self.install('anthropic', owner_uid=os.getuid() + 1)
        self.assertEqual(self.reads, [])

    def test_the_script_reads_the_key_only_from_the_terminal(self):
        text = SCRIPT.read_text()
        for absent in ('os.environ', 'getenv', 'input(', 'sys.stdin', 'getpass', 'print(raw', 'print(key', 'argv[1:]) +'):
            self.assertNotIn(absent, text, absent)
        self.assertIn("tty_path='/dev/tty'", text)
        self.assertIn('RLIMIT_CORE, (0, 0)', text)
        self.assertIn('os.umask(0o077)', text)
        self.assertEqual(set(preview_key.FOLDERS), {'deepinfra', 'anthropic', 'google'})
        self.assertEqual(preview_key.FOLDERS['anthropic'], '/var/lib/debateai-v3-preview/provider-anthropic-authority-v1')


class TerminalTests(unittest.TestCase):
    """read_hidden on a real pseudo-terminal: the prompt shows, the key does not, echo comes back."""

    def drain(self, master, seconds=2.0, until=None):
        data, deadline = b'', time.monotonic() + seconds
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.05)
            if ready:
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                data += chunk
                if until is not None and until in data:
                    break
        return data

    def run_reader(self, typed):
        master, slave = pty.openpty()
        self.addCleanup(os.close, master)
        self.addCleanup(os.close, slave)
        before = termios.tcgetattr(slave)
        self.assertTrue(before[3] & termios.ECHO)
        result, echo_during = {}, []

        def reader():
            try:
                result['value'] = preview_key.read_hidden('anthropic', tty_path=os.ttyname(slave))
            except Refusal as refusal:
                result['refusal'] = str(refusal)
        thread = threading.Thread(target=reader)
        thread.start()
        shown = self.drain(master, until=b': ')
        echo_during.append(termios.tcgetattr(slave)[3] & termios.ECHO)
        os.write(master, typed)
        thread.join(5)
        self.assertFalse(thread.is_alive())
        shown += self.drain(master, seconds=0.3)
        self.assertEqual(termios.tcgetattr(slave)[3] & termios.ECHO, before[3] & termios.ECHO)  # Restored.
        return result, shown, echo_during[0]

    def test_the_key_is_read_without_echo_and_the_terminal_is_restored(self):
        key = KEYS['anthropic']
        result, shown, echo = self.run_reader(key + b'\n')
        self.assertEqual(result, {'value': key})
        self.assertEqual(echo, 0)
        self.assertIn(b'Paste the anthropic key', shown)
        self.assertNotIn(key, shown)
        self.assertNotIn(b'synthetic', shown)

    def test_a_windows_line_ending_is_dropped_and_end_of_input_refuses(self):
        result, _, _ = self.run_reader(KEYS['google'] + b'\r\n')
        self.assertEqual(result, {'value': KEYS['google']})
        result, _, _ = self.run_reader(b'\x04')  # Ctrl-D on an empty line: no key, no line.
        self.assertEqual(result, {'refusal': 'KEY_SHAPE_INVALID'})

    def test_no_terminal_refuses(self):
        missing = Path(tempfile.mkdtemp(prefix='preview-key-tty-'))
        self.addCleanup(shutil.rmtree, missing, True)
        plain = missing / 'plain'
        plain.write_bytes(b'')
        for path in (missing / 'nothing', plain):
            with self.subTest(path=path.name), self.assertRaisesRegex(Refusal, '^NOT_A_TERMINAL$'):
                preview_key.read_hidden('anthropic', tty_path=str(path))


if __name__ == '__main__':
    unittest.main()
