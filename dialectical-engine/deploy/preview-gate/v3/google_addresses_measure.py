#!/usr/bin/env python3
"""Measures, on the server, whether Google's addresses can be pinned in a fixed allow-list.

The owner runs this ON THE SERVER as an ordinary user (no root, no key, DNS only) before choosing
the Google gate's egress mode (google_addresses.py explains both modes). A sample taken on another
computer proves nothing about the server: Google answers each place differently.

  run --out FILE [--hours 24] [--interval-seconds 60] [--resume]
        Every interval, for the whole run, asks the system resolver for the IPv4 addresses of
        generativelanguage.googleapis.com with `getent ahostsv4` (found on PATH; it refuses with
        GETENT_NOT_FOUND if there is none). Each answer goes at once as one JSON line into FILE,
        so a crash keeps what was measured. It refuses (OUT_EXISTS) if FILE already exists,
        unless --resume, which carries on the same run (the same plan, the same clock: time
        slots missed while it was down count as samples that did not succeed). At the end it
        prints the report below.
  report --samples FILE
        Plain words: samples planned, taken and failed; each address with when it was first and
        last seen and how often; the /24 networks that cover them; how often a sample brought an
        address never seen before, and when the last such one appeared. Then the VERDICT:
          "pinnable" only if ALL of these hold:
            - at least 90% of the planned samples succeeded,
            - every address is a public internet address,
            - there are at most 64 different addresses,
            - no new address appeared in the second half of the run;
          otherwise "not pinnable: use the proxy (README)", with each failing reason.
        The last line is the same facts as one JSON line, for a machine.

Exit 0 when the report is printed (whatever the verdict), 2 on a refusal (one JSON line).
"""
import argparse
import datetime
import ipaddress
import json
import math
import os
import shutil
import subprocess
import sys
import time

sys.dont_write_bytecode = True
HOST = 'generativelanguage.googleapis.com'
PLAN_SCHEMA = 'google-addresses-measure-v1'
LOOKUP_SECONDS = 30
SAMPLES_BYTES = 32 * 1024 * 1024
MAX_HOURS = 168
MIN_SUCCESS_SHARE = 0.9
MAX_DISTINCT = 64


class Refusal(Exception):
    """A refusal with a fixed public code."""


class LookupFailed(Exception):
    """One sample that did not give an answer; its code is written into the sample line."""


def utc(seconds):
    return datetime.datetime.fromtimestamp(seconds, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_getent(text):
    """The IPv4 addresses in `getent ahostsv4` output: the first word of each line (each address
    appears once per socket type, so duplicates are folded)."""
    found = set()
    for line in text.splitlines():
        words = line.split()
        if not words:
            continue
        try:
            found.add(ipaddress.IPv4Address(words[0]))
        except ValueError:
            raise LookupFailed('LOOKUP_UNPARSABLE') from None
    if not found:
        raise LookupFailed('LOOKUP_EMPTY')
    return [str(a) for a in sorted(found)]


def getent_lookup(getent, run=subprocess.run):
    """One sample through getent: a fixed argument list, no shell, no environment."""
    def lookup():
        try:
            done = run([getent, 'ahostsv4', HOST], env={}, stdin=subprocess.DEVNULL, capture_output=True,
                       timeout=LOOKUP_SECONDS, check=False)
        except subprocess.TimeoutExpired:
            raise LookupFailed('LOOKUP_TIMEOUT') from None
        except (OSError, subprocess.SubprocessError):
            raise LookupFailed('LOOKUP_FAILED') from None
        if done.returncode != 0:
            raise LookupFailed('LOOKUP_FAILED')
        try:
            text = done.stdout.decode('ascii')
        except (UnicodeError, AttributeError):
            raise LookupFailed('LOOKUP_UNPARSABLE') from None
        return parse_getent(text)
    return lookup


def find_getent(which=shutil.which):
    path = which('getent')
    if not path:
        raise Refusal('GETENT_NOT_FOUND')
    return os.path.abspath(path)


def make_plan(hours, interval, started):
    if not (isinstance(hours, (int, float)) and 0 < hours <= MAX_HOURS
            and isinstance(interval, int) and 1 <= interval <= 3600):
        raise Refusal('ARGUMENTS_INVALID')
    planned = int(hours * 3600 // interval)
    if planned < 1:
        raise Refusal('ARGUMENTS_INVALID')
    return {'schema': PLAN_SCHEMA, 'host': HOST, 'hours': hours, 'interval_seconds': interval,
            'planned_samples': planned, 'started': started}


def read_samples(path):
    """(plan, samples, length of the finished lines) from a samples file. An unfinished last line
    (a crash in mid-write) is ignored; anything else odd refuses SAMPLES_UNREADABLE."""
    try:
        with open(path, 'rb') as stream:
            raw = stream.read(SAMPLES_BYTES + 1)
        if len(raw) > SAMPLES_BYTES:
            raise Refusal('SAMPLES_UNREADABLE')
        text = raw.decode('ascii')
    except (OSError, UnicodeError):
        raise Refusal('SAMPLES_UNREADABLE') from None
    lines = text.split('\n')
    lines.pop()  # After the last newline: empty, or an unfinished line.
    try:
        plan = json.loads(lines[0])
        if not (isinstance(plan, dict) and plan.get('schema') == PLAN_SCHEMA and plan.get('host') == HOST):
            raise ValueError
        check = make_plan(plan['hours'], plan['interval_seconds'], plan['started'])
        if check != plan or not isinstance(plan['started'], (int, float)):
            raise ValueError
        samples, seen = [], set()
        for line in lines[1:]:
            sample = json.loads(line)
            slot = sample['slot']
            if not (isinstance(slot, int) and 0 <= slot < plan['planned_samples'] and slot not in seen
                    and isinstance(sample['at'], (int, float)) and isinstance(sample['ok'], bool)):
                raise ValueError
            seen.add(slot)
            if sample['ok']:
                if not (isinstance(sample['addresses'], list) and sample['addresses']):
                    raise ValueError
                for address in sample['addresses']:
                    ipaddress.IPv4Address(address)
            samples.append(sample)
    except (ValueError, KeyError, TypeError, IndexError, RecursionError):
        raise Refusal('SAMPLES_UNREADABLE') from None
    return plan, samples, text.rfind('\n') + 1


def append_line(stream, record):
    stream.write((json.dumps(record, sort_keys=True) + '\n').encode('ascii'))
    stream.flush()
    os.fsync(stream.fileno())


def measure(out, hours, interval, resume, lookup, now, sleep):
    """Takes the samples into `out`, one line each; returns the finished report's facts."""
    if resume:
        if not os.path.exists(out):
            raise Refusal('OUT_MISSING')
        plan, samples, finished = read_samples(out)
        if (plan['hours'], plan['interval_seconds']) != (hours, interval):
            raise Refusal('PLAN_MISMATCH', {'hours': plan['hours'], 'interval_seconds': plan['interval_seconds']})
        next_slot = max((s['slot'] for s in samples), default=-1) + 1
        fd = os.open(out, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
        stream = os.fdopen(fd, 'wb')
        os.ftruncate(fd, finished)  # Drop an unfinished line left by a crash, so the next line starts clean.
    else:
        plan = make_plan(hours, interval, now())
        try:
            fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_APPEND | os.O_NOFOLLOW, 0o644)
        except FileExistsError:
            raise Refusal('OUT_EXISTS') from None
        stream = os.fdopen(fd, 'wb')
        append_line(stream, plan)
        next_slot = 0
    with stream:
        for slot in range(next_slot, plan['planned_samples']):
            due = plan['started'] + slot * interval
            moment = now()
            if moment >= due + interval:
                continue  # This slot passed while the run was down: it stays a missing sample.
            if moment < due:
                sleep(due - moment)
            at = now()
            try:
                record = {'slot': slot, 'at': at, 'ok': True, 'addresses': lookup()}
            except LookupFailed as failure:
                record = {'slot': slot, 'at': at, 'ok': False, 'error': failure.args[0]}
            append_line(stream, record)
    plan, samples, _ = read_samples(out)
    return summarize(plan, samples)


def summarize(plan, samples):
    planned = plan['planned_samples']
    good = sorted((s for s in samples if s['ok']), key=lambda s: s['slot'])
    seen, new_slots = {}, []
    for sample in good:
        fresh = False
        for address in sample['addresses']:
            entry = seen.get(address)
            if entry is None:
                seen[address] = entry = {'address': address, 'first_seen': sample['at'], 'last_seen': sample['at'], 'count': 0}
                fresh = True
            entry['last_seen'] = max(entry['last_seen'], sample['at'])
            entry['count'] += 1
        if fresh:
            new_slots.append(sample)
    addresses = sorted(seen.values(), key=lambda e: int(ipaddress.IPv4Address(e['address'])))
    networks = sorted({str(ipaddress.IPv4Network(e['address'] + '/24', strict=False)) for e in addresses},
                      key=lambda n: int(ipaddress.IPv4Network(n).network_address))
    non_public = [e['address'] for e in addresses if not ipaddress.IPv4Address(e['address']).is_global]
    last_new = new_slots[-1] if new_slots else None
    reasons = []
    if len(good) < math.ceil(MIN_SUCCESS_SHARE * planned):
        reasons.append('TOO_FEW_SAMPLES')
    if non_public:
        reasons.append('NON_PUBLIC_ADDRESS')
    if len(addresses) > MAX_DISTINCT:
        reasons.append('TOO_MANY_ADDRESSES')
    if last_new is not None and last_new['slot'] >= planned / 2:
        reasons.append('NEW_ADDRESS_IN_SECOND_HALF')
    return {'host': HOST, 'started': utc(plan['started']), 'hours': plan['hours'],
            'interval_seconds': plan['interval_seconds'], 'planned': planned, 'taken': len(samples),
            'succeeded': len(good), 'failed': len(samples) - len(good),
            'distinct': len(addresses),
            'addresses': [{**e, 'first_seen': utc(e['first_seen']), 'last_seen': utc(e['last_seen'])} for e in addresses],
            'networks_24': networks, 'non_public': non_public,
            'samples_with_new_address': max(len(new_slots) - 1, 0),
            'last_new_at': utc(last_new['at']) if last_new else None,
            'last_new_slot': last_new['slot'] if last_new else None,
            'verdict': 'not_pinnable' if reasons else 'pinnable', 'reasons': reasons}


REASON_WORDS = {
    'TOO_FEW_SAMPLES': lambda f: 'only %d of %d planned samples succeeded (at least 90%% are needed)' % (f['succeeded'], f['planned']),
    'NON_PUBLIC_ADDRESS': lambda f: 'DNS gave addresses that are not public internet addresses: ' + ', '.join(f['non_public']),
    'TOO_MANY_ADDRESSES': lambda f: '%d different addresses (at most %d can be pinned)' % (f['distinct'], MAX_DISTINCT),
    'NEW_ADDRESS_IN_SECOND_HALF': lambda f: 'a new address still appeared in the second half of the run (last at %s), so the list was not settling' % f['last_new_at'],
}


def report_text(facts):
    lines = ['Google address measurement for %s' % facts['host'],
             'Started %s; planned %d samples, one every %d seconds for %s hours.'
             % (facts['started'], facts['planned'], facts['interval_seconds'], facts['hours']),
             'Samples taken: %d (succeeded %d, failed %d); missed while not running: %d.'
             % (facts['taken'], facts['succeeded'], facts['failed'], facts['planned'] - facts['taken']),
             'Different addresses seen: %d' % facts['distinct']]
    for e in facts['addresses']:
        lines.append('  %-15s  first %s  last %s  in %d samples' % (e['address'], e['first_seen'], e['last_seen'], e['count']))
    lines.append('Covered by these /24 networks: ' + (', '.join(facts['networks_24']) or 'none'))
    if facts['last_new_at']:
        lines.append('After the first sample, %d samples brought an address never seen before; the last new address appeared at %s.'
                     % (facts['samples_with_new_address'], facts['last_new_at']))
    else:
        lines.append('No sample succeeded, so no address was seen.')
    if facts['verdict'] == 'pinnable':
        lines.append('VERDICT: pinnable')
    else:
        lines.append('VERDICT: not pinnable: use the proxy (README)')
        lines.extend('  - ' + REASON_WORDS[code](facts) for code in facts['reasons'])
    return '\n'.join(lines) + '\n'


def print_report(facts):
    sys.stdout.write(report_text(facts))
    print(json.dumps(facts, sort_keys=True))


def main(argv=None, lookup=None, now=time.time, sleep=time.sleep, which=shutil.which):
    """`lookup`, `now`, `sleep` and `which` are there for the offline tests; on the server the
    defaults are used (getent from PATH, the real clock)."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    actions = parser.add_subparsers(dest='action', required=True)
    run = actions.add_parser('run')
    run.add_argument('--out', required=True)
    run.add_argument('--hours', type=float, default=24)
    run.add_argument('--interval-seconds', type=int, default=60)
    run.add_argument('--resume', action='store_true')
    report = actions.add_parser('report')
    report.add_argument('--samples', required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == 'report':
            plan, samples, _ = read_samples(args.samples)
            print_report(summarize(plan, samples))
            return 0
        hours = int(args.hours) if args.hours.is_integer() else args.hours
        make_plan(hours, args.interval_seconds, 0)  # Refuse bad numbers before anything is written.
        if lookup is None:
            lookup = getent_lookup(find_getent(which))
        print_report(measure(args.out, hours, args.interval_seconds, args.resume, lookup, now, sleep))
        return 0
    except Refusal as refusal:
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        print(json.dumps({'status': 'refused', 'error': refusal.args[0], **detail}))
        return 2
    except OSError:
        print(json.dumps({'status': 'refused', 'error': 'WRITE_FAILED'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
