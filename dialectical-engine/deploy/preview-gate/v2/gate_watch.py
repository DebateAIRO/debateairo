#!/usr/bin/env python3
"""Emails the owner once per halt of the spending gate (run every minute by a timer).

It asks the gate itself for `status` (read-only: a shared lock, nothing written; the key file is
hidden from this unit). If the gate is halted and this halt (its halted_at and reason) has not
been announced yet, it records the halt first and then queues one notice,
debateai-preview-notice@gate-halted-<reason>.service, without waiting for it
(`systemctl start --no-block`). So the halt itself is never blocked or slowed by mail, and each
halt is announced at most once: a failed notice is not retried. A halt that is re-opened within
the same minute may go unannounced; status still lists every halt.
One JSON line on stdout; exit 0, or 1 when status or the notice could not be run (the unit then
fails, and its OnFailure= alert emails that the watcher itself is broken).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
GATE = Path(__file__).resolve().parent / 'preview_budget_authority.py'
PYTHON = '/usr/bin/python3'
SYSTEMCTL = '/usr/bin/systemctl'
REASON = re.compile(r'[a-z0-9_]{1,64}')
STATE_BYTES = 4096


class WatchError(Exception):
    """A fixed public code."""


def read_status(private, run=subprocess.run):
    try:
        # Short: status holds the gate's shared lock, which must never outlast the gate's 10 s wait.
        result = run([PYTHON, '-I', str(GATE), 'status', '--private', str(private)], env={}, stdin=subprocess.DEVNULL,
                     capture_output=True, timeout=8)
        lines = result.stdout.decode('utf-8', 'replace').splitlines()
        value = json.loads(lines[-1]) if lines else None
    except (OSError, ValueError, subprocess.SubprocessError):
        raise WatchError('STATUS_UNAVAILABLE') from None
    if result.returncode != 0 or not isinstance(value, dict) or not isinstance(value.get('state'), str):
        raise WatchError('STATUS_UNAVAILABLE')
    return value


def read_announced(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    except OSError:
        raise WatchError('STATE_UNREADABLE') from None
    with os.fdopen(fd, 'rb') as stream:
        raw = stream.read(STATE_BYTES + 1)
    try:
        value = json.loads(raw) if len(raw) <= STATE_BYTES else None
    except ValueError:
        value = None
    return value if isinstance(value, dict) else None


def write_announced(path, value):
    path = Path(path)
    temporary = path.with_name('.%s.%d.tmp' % (path.name, os.getpid()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(json.dumps(value, sort_keys=True).encode() + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, path)
        folder = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(folder)
        finally:
            os.close(folder)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def queue_notice(code, run=subprocess.run):
    unit = 'debateai-preview-notice@gate-halted-%s.service' % code
    try:
        result = run([SYSTEMCTL, 'start', '--no-block', unit], env={}, stdin=subprocess.DEVNULL, capture_output=True,
                     timeout=30)
    except (OSError, subprocess.SubprocessError):
        raise WatchError('NOTICE_NOT_QUEUED') from None
    if result.returncode != 0:
        raise WatchError('NOTICE_NOT_QUEUED')
    return unit


def watch(private, state_path, run=subprocess.run):
    status = read_status(private, run)
    if status['state'] != 'halted':
        return {'status': 'ok', 'state': status['state']}
    reason = status.get('reason')
    code = reason if isinstance(reason, str) and REASON.fullmatch(reason) else 'unknown'
    halted_at = status.get('halted_at') if isinstance(status.get('halted_at'), str) else None
    halt = {'halted_at': halted_at, 'reason': code}
    if read_announced(state_path) == halt:
        return {'status': 'halted', 'reason': code, 'announced': 'before'}
    write_announced(state_path, halt)  # Recorded first: at most one notice per halt.
    return {'status': 'halted', 'reason': code, 'announced': 'now', 'notice': queue_notice(code, run)}


def main(argv=None, run=subprocess.run):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(watch(args.private, args.state, run)))
        return 0
    except (WatchError, OSError) as error:
        print(json.dumps({'status': 'refused', 'error': str(error) if isinstance(error, WatchError) else 'STATE_UNWRITABLE'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
