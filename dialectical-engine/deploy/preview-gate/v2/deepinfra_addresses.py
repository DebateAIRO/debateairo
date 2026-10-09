#!/usr/bin/env python3
"""Keeps the spending gate's network allow-list in step with api.deepinfra.com.

systemd's IPAddressAllow= takes addresses, not host names, so the gate unit allows exactly the
IPv4 addresses listed in one drop-in (50-deepinfra-addresses.conf). If DeepInfra moves to an
address that is not listed, every connect is refused by the kernel. This script makes that
visible instead of silent:

  check  --dropin PATH   compares today's DNS answer for api.deepinfra.com with the drop-in. Every
                         address DNS gives must be listed; otherwise it refuses with
                         DEEPINFRA_ADDRESSES_CHANGED and names the new ones. Listed addresses DNS
                         no longer gives are reported as "stale" (not a refusal).
  render                 prints the drop-in for today's DNS answer (deterministic: no time stamp),
                         so `render | diff - installed-file` is empty when nothing changed.

The gate unit runs `check` before every start (ExecStartPre); the optional hourly timer runs it
too and emails the owner through the preview alert when it refuses. It needs no key, no state and
no internet access beyond the local DNS resolver. One JSON line on stdout; exit 0, or 2 on refusal.
"""
import argparse
import ipaddress
import json
import socket
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HOST = 'api.deepinfra.com'
DROPIN_BYTES = 64 * 1024
MAX_ADDRESSES = 256
HEADER = (
    '# Install as /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf\n'
    '# The only internet addresses the spending gate may reach: the IPv4 addresses of ' + HOST + '.\n'
    '# Made by `python3 -I deepinfra_addresses.py render`; never edit by hand (README "DeepInfra addresses").\n'
)


class Refusal(Exception):
    """A refusal with a fixed public code."""


def parse_dropin(text):
    """The allowed addresses, from a drop-in holding only comments, one [Service] line and
    IPAddressAllow=<IPv4>/32 lines. Anything else refuses, so the file can only add DeepInfra /32s."""
    allowed, section = [], False
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line == '[Service]' and not section:
            section = True
            continue
        name, equals, value = line.partition('=')
        if not section or name != 'IPAddressAllow' or not equals:
            raise Refusal('DROPIN_INVALID')
        try:
            network = ipaddress.IPv4Network(value, strict=True)
        except ValueError:
            raise Refusal('DROPIN_INVALID') from None
        if value != str(network) or network.prefixlen != 32 or not network.network_address.is_global:
            raise Refusal('DROPIN_INVALID')
        allowed.append(network.network_address)
    if not allowed or len(allowed) != len(set(allowed)) or len(allowed) > MAX_ADDRESSES:
        raise Refusal('DROPIN_INVALID')
    return set(allowed)


def read_dropin(path):
    try:
        with open(path, 'rb') as stream:
            raw = stream.read(DROPIN_BYTES + 1)
        if len(raw) > DROPIN_BYTES:
            raise Refusal('DROPIN_INVALID')
        return parse_dropin(raw.decode('ascii'))
    except (OSError, UnicodeError):
        raise Refusal('DROPIN_UNREADABLE') from None


def resolve(lookup=socket.getaddrinfo):
    """The IPv4 addresses the system resolver gives today (what `getent ahostsv4` shows)."""
    try:
        answers = lookup(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)
        addresses = {ipaddress.IPv4Address(answer[4][0]) for answer in answers}
    except (OSError, ValueError, IndexError, TypeError):
        raise Refusal('DNS_UNAVAILABLE') from None
    if not addresses:
        raise Refusal('DNS_UNAVAILABLE')
    return addresses


def check(allowed, resolved):
    new, stale = sorted(resolved - allowed), sorted(allowed - resolved)
    result = {'host': HOST, 'allowed': len(allowed), 'resolved': len(resolved),
              'new': [str(a) for a in new], 'stale': [str(a) for a in stale]}
    if new:
        raise Refusal('DEEPINFRA_ADDRESSES_CHANGED', result)
    return {'status': 'ok', **result}


def render(resolved):
    return HEADER + '[Service]\n' + ''.join('IPAddressAllow=%s/32\n' % a for a in sorted(resolved))


def main(argv=None, lookup=socket.getaddrinfo):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check', 'render'))
    parser.add_argument('--dropin', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == 'render':
            sys.stdout.write(render(resolve(lookup)))
            return 0
        if args.dropin is None:
            raise Refusal('DROPIN_REQUIRED')
        print(json.dumps(check(read_dropin(args.dropin), resolve(lookup))))
        return 0
    except Refusal as refusal:
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        print(json.dumps({'status': 'refused', 'error': refusal.args[0], **detail}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
