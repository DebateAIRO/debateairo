#!/usr/bin/env python3
"""Emails the owner once per halt of the spending gate (run every minute by a timer).

It asks the gate itself for `status` (read-only: a shared lock, nothing written; the key file is
hidden from this unit). If the gate is halted and this halt (its halted_at and reason) has not
been announced yet, it records the halt first and then queues one notice,
debateai-preview-notice@<kind>-<reason>.service, without waiting for it
(`systemctl start --no-block`). So the halt itself is never blocked or slowed by mail, and each
halt is announced at most once: a failed notice is not retried. A halt that is re-opened within
the same minute may go unannounced; status still lists every halt.

Daily unbilled alert (2026-10-12 ruling: alert, never halt): in the same run, whether or not the
gate is halted, it reads status's today_unbilled_releases (calls the vendor refused without billing
them: busy or rejected). When that count reaches --unbilled-alert-at (default 100, 1..100000) it
queues one notice per gate per Bucharest day (status's own `today`),
debateai-preview-notice@<gate>-unbilled-<count>_<YYYY>_<MM>_<DD>.service. The day is recorded
first, in announced-unbilled.json next to the --state file (same folder, 0600, atomic), so a
failed notice is not retried that day. Nothing is halted and the gate is never touched. A status
without the count (an older gate) or with a bad count or day is skipped quietly. The Google gate
(google-halted) has no unbilled notice.

Booked-at-maximum alert (owner ruling 2026-10-12, "Book max cost, keep going"): when the vendor
connection fails or times out after a call was sent, the gate books that call's full reservation as
its charge (ledger state settled_reserved_max) and keeps working; it never halts for it. In the same
run the watcher reads status's today_booked_max (that day's count of such calls). Whenever the count
is above the one it last announced for that Bucharest day, it queues one notice,
debateai-preview-notice@<gate>-booked-<count>_<YYYY>_<MM>_<DD>.service: one email per new booking
(several bookings between two runs share one email, with the day's count). The day and count are
recorded first, in announced-booked.json next to the --state file (same folder, 0600, atomic), so a
failed notice is not retried. A status without the count (an older gate) or with a bad count or day
is skipped quietly. The Google gate has no booked notice.
One JSON line on stdout; exit 0, or 1 when status or the notice could not be run (the unit then
fails, and its OnFailure= alert emails that the watcher itself is broken).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
GATE = Path(__file__).resolve().parent / 'preview_budget_authority.py'
PYTHON = '/usr/bin/python3'
SYSTEMCTL = '/usr/bin/systemctl'
REASON = re.compile(r'[a-z0-9_]{1,64}')
STATE_BYTES = 4096
# The notice kind names which gate halted, so the email carries that gate's own re-open command:
# gate-halted (DeepInfra, the default) or google-halted (the Google gate, v3 README "Google").
NOTICE_KINDS = ('gate-halted', 'google-halted')


UNBILLED_STATE_NAME = 'announced-unbilled.json'
UNBILLED_ALERT_DEFAULT = 100
UNBILLED_ALERT_MAX = 100000
UNBILLED_COUNT_MAX = 999999999
# The gate's `today` (its Bucharest day): ASCII digits only, then checked as a real date.
DAY = re.compile(r'([0-9]{4})-([0-9]{2})-([0-9]{2})')


class WatchError(Exception):
    """A fixed public code."""


# PR B: the Anthropic gate's halt watcher passes --notice anthropic-halted, so its email carries
# the Anthropic gate's own re-open command (README-anthropic.md).
NOTICE_KINDS = NOTICE_KINDS + ('anthropic-halted',)
# Plan 2026-10-30, task W1-1: the Perplexity (web search) gate's halt watcher passes --notice perplexity-halted
# (README-perplexity.md), with its own unbilled and booked notices.
NOTICE_KINDS = NOTICE_KINDS + ('perplexity-halted',)
# Each gate's own daily unbilled notice, by its halt kind. Google is parked: none.
UNBILLED_KINDS = {'gate-halted': 'gate-unbilled', 'anthropic-halted': 'anthropic-unbilled',
                  'perplexity-halted': 'perplexity-unbilled'}
# Each gate's own booked-at-maximum notice (owner ruling 2026-10-12), by its halt kind. Google: none.
BOOKED_KINDS = {'gate-halted': 'gate-booked', 'anthropic-halted': 'anthropic-booked',
                'perplexity-halted': 'perplexity-booked'}
BOOKED_STATE_NAME = 'announced-booked.json'


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


def queue_notice(code, run=subprocess.run, kind='gate-halted'):
    if kind not in NOTICE_KINDS and kind not in UNBILLED_KINDS.values() and kind not in BOOKED_KINDS.values():
        raise WatchError('NOTICE_KIND_INVALID')
    unit = 'debateai-preview-notice@%s-%s.service' % (kind, code)
    try:
        result = run([SYSTEMCTL, 'start', '--no-block', unit], env={}, stdin=subprocess.DEVNULL, capture_output=True,
                     timeout=30)
    except (OSError, subprocess.SubprocessError):
        raise WatchError('NOTICE_NOT_QUEUED') from None
    if result.returncode != 0:
        raise WatchError('NOTICE_NOT_QUEUED')
    return unit


def unbilled_state_path(state_path):
    """The daily unbilled marker: announced-unbilled.json in the --state file's own folder."""
    return Path(state_path).with_name(UNBILLED_STATE_NAME)


def booked_state_path(state_path):
    """The booked-at-maximum marker: announced-booked.json in the --state file's own folder."""
    return Path(state_path).with_name(BOOKED_STATE_NAME)


def unbilled_today(status, field='today_unbilled_releases'):
    """(count, day) from status, or None when either is missing or not exactly as the gate writes it."""
    count, today = status.get(field), status.get('today')
    if type(count) is not int or not 0 <= count <= UNBILLED_COUNT_MAX:
        return None
    match = DAY.fullmatch(today) if isinstance(today, str) else None
    if match is None:
        return None
    try:
        date(*(int(part) for part in match.groups()))
    except ValueError:
        return None
    return count, today


def watch_unbilled(status, state_path, run, kind, alert_at):
    unbilled_kind = UNBILLED_KINDS.get(kind)
    found = unbilled_today(status) if unbilled_kind else None
    if found is None or found[0] < alert_at:
        return {}
    count, today = found
    path, marker = unbilled_state_path(state_path), {'today': today}
    if read_announced(path) == marker:
        return {'unbilled': 'before', 'today': today}
    write_announced(path, marker)  # Recorded first: at most one notice per gate per day.
    code = '%d_%s' % (count, today.replace('-', '_'))
    return {'unbilled': 'now', 'today': today, 'unbilled_notice': queue_notice(code, run, unbilled_kind)}


def watch_booked(status, state_path, run, kind):
    """One notice whenever today's count of calls booked at their reservation is above the count last
    announced for that day. Recorded first: a failed notice is not retried for that count."""
    booked_kind = BOOKED_KINDS.get(kind)
    found = unbilled_today(status, 'today_booked_max') if booked_kind else None
    if found is None or found[0] < 1:
        return {}
    count, today = found
    path = booked_state_path(state_path)
    announced = read_announced(path)
    if (isinstance(announced, dict) and announced.get('today') == today and type(announced.get('count')) is int
            and announced['count'] >= count):
        return {'booked': 'before', 'today': today}
    write_announced(path, {'today': today, 'count': count})
    code = '%d_%s' % (count, today.replace('-', '_'))
    return {'booked': 'now', 'today': today, 'booked_notice': queue_notice(code, run, booked_kind)}


def watch_halt(status, state_path, run, kind):
    if status['state'] != 'halted':
        return {'status': 'ok', 'state': status['state']}
    reason = status.get('reason')
    code = reason if isinstance(reason, str) and REASON.fullmatch(reason) else 'unknown'
    halted_at = status.get('halted_at') if isinstance(status.get('halted_at'), str) else None
    halt = {'halted_at': halted_at, 'reason': code}
    if read_announced(state_path) == halt:
        return {'status': 'halted', 'reason': code, 'announced': 'before'}
    write_announced(state_path, halt)  # Recorded first: at most one notice per halt.
    return {'status': 'halted', 'reason': code, 'announced': 'now', 'notice': queue_notice(code, run, kind)}


def watch(private, state_path, run=subprocess.run, kind='gate-halted', alert_at=UNBILLED_ALERT_DEFAULT):
    """The three checks run on one status; a failure in one never skips the others. Any failure fails the run."""
    status = read_status(private, run)
    line, errors = {}, []
    for check in (lambda: watch_halt(status, state_path, run, kind),
                  lambda: watch_unbilled(status, state_path, run, kind, alert_at),
                  lambda: watch_booked(status, state_path, run, kind)):
        try:
            line.update(check())
        except WatchError as error:
            errors.append(str(error))
        except OSError:
            errors.append('STATE_UNWRITABLE')
    if errors:
        raise WatchError(errors[0])
    return line


def alert_threshold(text):
    if not re.fullmatch(r'[1-9][0-9]{0,5}', text) or int(text) > UNBILLED_ALERT_MAX:
        raise argparse.ArgumentTypeError('a whole number from 1 to %d' % UNBILLED_ALERT_MAX)
    return int(text)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--notice', choices=NOTICE_KINDS, default='gate-halted')
    parser.add_argument('--unbilled-alert-at', type=alert_threshold, default=UNBILLED_ALERT_DEFAULT,
                        help='daily unbilled-refusal count that emails once a day (default %(default)s)')
    return parser.parse_args(argv)


def main(argv=None, run=subprocess.run):
    args = parse_args(argv)
    try:
        if args.state.name in (UNBILLED_STATE_NAME, BOOKED_STATE_NAME):
            raise WatchError('STATE_PATH_INVALID')  # The halt marker and the other two markers are three files.
        print(json.dumps(watch(args.private, args.state, run, args.notice, args.unbilled_alert_at)))
        return 0
    except (WatchError, OSError) as error:
        print(json.dumps({'status': 'refused', 'error': str(error) if isinstance(error, WatchError) else 'STATE_UNWRITABLE'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
