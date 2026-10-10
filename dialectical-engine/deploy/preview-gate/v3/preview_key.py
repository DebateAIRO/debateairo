#!/usr/bin/env python3
"""The guided way to put a provider key into its spending gate's private folder (all providers).

Run by the owner, as root, at a real terminal:

  /usr/bin/python3 -I preview_key.py install <provider> [--replace]

<provider> is one of deepinfra, anthropic, google; each has one fixed private folder (FOLDERS).
The key is typed or pasted at a hidden prompt: it is read from /dev/tty with echo off, never
from the command line, the environment or a pipe. It is never printed, nor its hash; what is
printed at the end is only the new file's mode, owner, link count and size, and how many stale
temporary files (`.api-key.txt.<pid>.tmp`, regular files only, links never followed) an
interrupted earlier run had left in the folder and this run removed first.

What it refuses (one JSON line, exit 2, the key never in it):
  - anything but `install <provider>` or `install <provider> --replace` (USAGE);
  - standard input that is not a terminal (NOT_A_TERMINAL), or not running as root (ROOT_REQUIRED);
  - a private folder that is not a real folder owned by root with mode 700 (FOLDER_NOT_SAFE);
  - an existing api-key.txt without --replace (KEY_EXISTS; checked before the prompt, and again,
    atomically, when the file is put in place);
  - a key of the wrong shape for that provider (KEY_SHAPE_INVALID);
  - a key equal to the one in another provider's folder (KEY_USED_BY_OTHER_PROVIDER).

How it writes: umask 077 and no core dumps for the whole run (what `set -C`, `umask 077` and
`ulimit -c 0` give a shell script); a temporary file created exclusively (O_CREAT|O_EXCL|
O_NOFOLLOW, mode 600) inside the private folder, written and fsynced, then linked into place as
api-key.txt (refused if one appeared meanwhile) or, with --replace, renamed over the old one;
then the folder is fsynced. The temporary file is removed on every path. The result must be a
regular file, mode 600, owned by root, with one link.
"""
import errno
import hashlib
import json
import os
import re
import resource
import stat
import sys
import termios

sys.dont_write_bytecode = True
KEY_NAME = 'api-key.txt'
FOLDERS = {
    'deepinfra': '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3',
    'anthropic': '/var/lib/debateai-v3-preview/provider-anthropic-authority-v1',
    'google': '/var/lib/debateai-v3-preview/provider-google-authority-v1',
}
# The key shapes, the same as the gate profiles' key_pattern. DeepInfra's keys have no fixed shape:
# the gate's own read_key rule (16 to 512 printable ASCII characters, no spaces), but never another
# provider's key (Anthropic sk-ant-, Google AIza) pasted at the wrong prompt.
SHAPES = {
    'deepinfra': re.compile(r'(?!sk-ant-|AIza)[!-~]{16,512}'),
    # Only Anthropic's ordinary API form (sk-ant-api + two digits + '-'); an Admin form or any other
    # Anthropic credential is refused, as the gate's AnthropicProfile.key_pattern does.
    'anthropic': re.compile(r'(?=.{16,512}\Z)sk-ant-api[0-9]{2}-[A-Za-z0-9_-]+', re.ASCII),
    'google': re.compile(r'AIza[0-9A-Za-z_-]{35}', re.ASCII),
}
MAX_LINE_BYTES = 1024
PROMPT = 'Paste the %s key and press Enter (nothing will show while you paste): '


class Refusal(Exception):
    """A refusal with a fixed public code (never the key)."""


def parse(argv):
    if len(argv) == 2 and argv[0] == 'install' and argv[1] in FOLDERS:
        return argv[1], False
    if len(argv) == 3 and argv[0] == 'install' and argv[1] in FOLDERS and argv[2] == '--replace':
        return argv[1], True
    raise Refusal('USAGE')


def read_hidden(provider, tty_path='/dev/tty'):
    """One line from the terminal with echo off; the terminal's settings are restored after.
    Returns bytes (the line without its line ending)."""
    try:
        fd = os.open(tty_path, os.O_RDWR | os.O_NOCTTY)
    except OSError:
        raise Refusal('NOT_A_TERMINAL') from None
    try:
        if not os.isatty(fd):
            raise Refusal('NOT_A_TERMINAL')
        before = termios.tcgetattr(fd)
        hidden = list(before)
        hidden[3] = hidden[3] & ~(termios.ECHO | termios.ECHONL)
        termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        try:
            os.write(fd, (PROMPT % provider).encode('ascii'))
            line = bytearray()
            while b'\n' not in line and len(line) <= MAX_LINE_BYTES:
                chunk = os.read(fd, MAX_LINE_BYTES + 1 - len(line))
                if not chunk:
                    break
                line += chunk
        finally:
            termios.tcsetattr(fd, termios.TCSAFLUSH, before)
            os.write(fd, b'\n')
        if b'\n' not in line or len(line) > MAX_LINE_BYTES:
            raise Refusal('KEY_SHAPE_INVALID')
        return bytes(line.split(b'\n', 1)[0].rstrip(b'\r'))
    finally:
        os.close(fd)


def shape_ok(provider, raw):
    try:
        key = raw.decode('ascii')
    except UnicodeError:
        return False
    return bool(SHAPES[provider].fullmatch(key))


def open_folder(path, owner_uid):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise Refusal('FOLDER_NOT_SAFE') from None
    info = os.fstat(fd)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != owner_uid or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(fd)
        raise Refusal('FOLDER_NOT_SAFE')
    return fd


def key_exists(dir_fd):
    try:
        os.stat(KEY_NAME, dir_fd=dir_fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return True


def other_key_digests(provider, folders):
    """sha256 of each other provider's key (stripped, as the gate reads it); only compared, never shown.
    Opened without following a link and without blocking, and read only if it is a regular file, so
    a FIFO or device put in its place cannot hang the command."""
    digests = []
    for name, path in folders.items():
        if name == provider:
            continue
        try:
            fd = os.open(os.path.join(path, KEY_NAME), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            continue
        except OSError:
            raise Refusal('OTHER_KEY_UNREADABLE') from None
        with os.fdopen(fd, 'rb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise Refusal('OTHER_KEY_UNREADABLE')
            digests.append(hashlib.sha256(stream.read(MAX_LINE_BYTES).strip()).digest())
    return digests


STALE_TEMPORARY = re.compile(r'\.%s\.[0-9]+\.tmp' % re.escape(KEY_NAME))


def remove_stale_temporaries(dir_fd):
    """Remove temporary files an interrupted earlier run left in the private folder: regular files
    named like this script's own temporary file only (never a link, folder or anything else, and
    no link is followed). Returns how many were removed."""
    removed = 0
    for name in os.listdir(dir_fd):
        if not STALE_TEMPORARY.fullmatch(name):
            continue
        info = os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
        if stat.S_ISREG(info.st_mode):
            os.unlink(name, dir_fd=dir_fd)
            removed += 1
    return removed


def write_key(dir_fd, raw, replace, owner_uid):
    temporary = '.%s.%d.tmp' % (KEY_NAME, os.getpid())
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dir_fd)
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.rename(temporary, KEY_NAME, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        else:
            try:
                os.link(temporary, KEY_NAME, src_dir_fd=dir_fd, dst_dir_fd=dir_fd, follow_symlinks=False)
            except FileExistsError:
                raise Refusal('KEY_EXISTS') from None
            os.unlink(temporary, dir_fd=dir_fd)  # Before the folder fsync, so no copy can come back.
        os.fsync(dir_fd)
    finally:
        try:
            os.unlink(temporary, dir_fd=dir_fd)
        except FileNotFoundError:
            pass
    info = os.stat(KEY_NAME, dir_fd=dir_fd, follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != owner_uid \
            or info.st_nlink != 1:
        raise Refusal('KEY_FILE_NOT_SAFE')
    return info


def install(provider, replace, *, read_line=read_hidden, euid=os.geteuid, stdin_isatty=None, folders=None,
            owner_uid=0):
    """The whole install. The keyword arguments are the offline tests' seams; main() passes none
    of them, so no command-line argument can change a folder, the owner or the terminal check."""
    folders = FOLDERS if folders is None else folders
    if not (os.isatty(0) if stdin_isatty is None else stdin_isatty()):
        raise Refusal('NOT_A_TERMINAL')
    if euid() != 0:
        raise Refusal('ROOT_REQUIRED')
    dir_fd = open_folder(folders[provider], owner_uid)
    raw = None
    removed = 0
    try:
        removed = remove_stale_temporaries(dir_fd)
        if key_exists(dir_fd) and not replace:
            raise Refusal('KEY_EXISTS')
        raw = bytearray(read_line(provider))
        if not shape_ok(provider, bytes(raw)):
            raise Refusal('KEY_SHAPE_INVALID')
        if hashlib.sha256(bytes(raw)).digest() in other_key_digests(provider, folders):
            raise Refusal('KEY_USED_BY_OTHER_PROVIDER')
        info = write_key(dir_fd, bytes(raw), replace, owner_uid)
    except Refusal as refusal:
        refusal.stale_temporary_files_removed = removed
        raise
    finally:
        if raw is not None:
            raw[:] = bytes(len(raw))  # Best effort: the copy this script holds is overwritten.
        os.close(dir_fd)
    return {'status': 'installed', 'provider': provider, 'stale_temporary_files_removed': removed,
            'mode': '%o' % stat.S_IMODE(info.st_mode), 'owner': '%d:%d' % (info.st_uid, info.st_gid),
            'links': info.st_nlink, 'size': info.st_size}


def main(argv=None):
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    try:
        provider, replace = parse(sys.argv[1:] if argv is None else list(argv))
        print(json.dumps(install(provider, replace)))
        return 0
    except Refusal as refusal:
        removed = getattr(refusal, 'stale_temporary_files_removed', None)
        print(json.dumps({'status': 'refused', 'error': str(refusal),
                          **({} if removed is None else {'stale_temporary_files_removed': removed})}))
        return 2
    except OSError as error:
        print(json.dumps({'status': 'refused', 'error': 'WRITE_FAILED', 'errno': errno.errorcode.get(error.errno)}))
        return 2
    except KeyboardInterrupt:
        print(json.dumps({'status': 'refused', 'error': 'INTERRUPTED'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
