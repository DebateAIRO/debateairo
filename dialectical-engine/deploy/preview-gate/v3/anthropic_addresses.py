#!/usr/bin/env python3
"""Checks that api.anthropic.com still lives inside the Anthropic gate's network allow-list.

The Anthropic gate unit allows exactly one internet range: 160.79.104.0/23, Anthropic's published
inbound IPv4 range for the API (platform.claude.com/docs/en/api/ip-addresses, read 2026-10-10;
Anthropic says it will not change without notice). Unlike DeepInfra, there is no address list
to update: the range is written in the unit and here, and changing it is a reviewed code change.

IPv4 only. The gate unit has no IPv6 egress at all (no AF_INET6 sockets, no IPv6 range allowed),
so the gate always connects over IPv4. This script therefore asks only for A records (IPv4); any
IPv6 answer a test resolver gives is ignored. One pinned family keeps the allow-list small and
this check simple.

  check                  every IPv4 address DNS gives today for api.anthropic.com must be inside
                         160.79.104.0/23, or it refuses: ANTHROPIC_ADDRESSES_OUTSIDE_RANGE (and
                         names them), or DNS_UNAVAILABLE when there is no IPv4 answer at all.
  watch  --state FILE    the hourly timer's form of check: exit 3 (the unit fails, and its
                         OnFailure= alert emails the owner) only for a mismatch not announced
                         before, so the owner gets at most one email per change. A temporary DNS
                         failure is logged, not announced (the gate's own start check refuses on it).

This is also the gate's whole start check. Anthropic has no model list that can be read without
a key, so there is no model check: the start check never sends the key, or any request, to
Anthropic. It reads only DNS (through the local resolver stub); no key, no gate state.
One JSON line on stdout; exit 0, 2 on refusal, 3 for a newly announced mismatch (watch).
"""
import argparse
import hashlib
import ipaddress
import json
import os
import socket
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HOST = 'api.anthropic.com'
ALLOWED = ipaddress.IPv4Network('160.79.104.0/23')  # Must equal the unit's IPAddressAllow (a unit test checks).
MAX_ADDRESSES = 256


class Refusal(Exception):
    """A refusal with a fixed public code."""


def resolve(lookup=socket.getaddrinfo):
    """The IPv4 addresses the system resolver gives today (what `getent ahostsv4` shows).
    Answers of any other family are ignored: the gate cannot use them."""
    try:
        answers = lookup(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)
        addresses = {ipaddress.IPv4Address(answer[4][0]) for answer in answers if answer[0] == socket.AF_INET}
    except (OSError, ValueError, IndexError, TypeError):
        raise Refusal('DNS_UNAVAILABLE') from None
    if not addresses or len(addresses) > MAX_ADDRESSES:
        raise Refusal('DNS_UNAVAILABLE')
    return addresses


def check(resolved):
    outside = sorted(address for address in resolved if address not in ALLOWED)
    result = {'host': HOST, 'allowed': str(ALLOWED), 'resolved': len(resolved), 'outside': [str(a) for a in outside]}
    if outside:
        raise Refusal('ANTHROPIC_ADDRESSES_OUTSIDE_RANGE', result)
    return {'status': 'ok', **result}


def atomic_write(path, data, mode):
    path = Path(path)
    temporary = path.with_name('.%s.%d.tmp' % (path.name, os.getpid()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def fingerprint(refusal):
    detail = refusal.args[1] if len(refusal.args) > 1 else {}
    return hashlib.sha256(json.dumps({'error': refusal.args[0], 'outside': detail.get('outside', [])},
                                     sort_keys=True).encode()).hexdigest()


def watch(state, lookup):
    """0 when nothing new to announce, 3 for a mismatch not announced before (recorded first)."""
    try:
        result = check(resolve(lookup))
    except Refusal as refusal:
        if refusal.args[0] == 'DNS_UNAVAILABLE':
            return 0, {'status': 'dns_unavailable', 'announced': False}
        mark = fingerprint(refusal)
        try:
            announced = Path(state).read_text().strip() == mark
        except OSError:
            announced = False
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        line = {'status': 'refused', 'error': refusal.args[0], **detail, 'announced': 'before' if announced else 'now'}
        if announced:
            return 0, line
        atomic_write(state, (mark + '\n').encode(), 0o600)
        return 3, line
    try:
        os.unlink(state)  # Back in range: the next change is announced again.
    except FileNotFoundError:
        pass
    return 0, result


def main(argv=None, lookup=socket.getaddrinfo):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                     allow_abbrev=False)
    parser.add_argument('action', choices=('check', 'watch'))
    parser.add_argument('--state', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == 'watch':
            if args.state is None:
                raise Refusal('STATE_REQUIRED')
            code, line = watch(args.state, lookup)
            print(json.dumps(line))
            return code
        print(json.dumps(check(resolve(lookup))))
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
