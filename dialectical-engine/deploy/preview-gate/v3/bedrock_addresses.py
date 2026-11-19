#!/usr/bin/env python3
"""Keeps the Amazon Bedrock gate's network allow-list in step with Amazon's published address ranges.

The Bedrock gate calls one host, bedrock-runtime.us-east-1.amazonaws.com. Its addresses change every minute or so, drawn
from a large pool, so they cannot be pinned one by one as the DeepInfra and Perplexity gates' are, and Amazon publishes
no range for Bedrock alone. What Amazon does publish is every IPv4 range of each Region
(https://ip-ranges.amazonaws.com/ip-ranges.json, described in the VPC user guide, "AWS IP address ranges"). So the gate
unit allows exactly the published IPv4 ranges of the Region us-east-1 (service AMAZON, which holds every other
service's ranges), listed in one drop-in (50-bedrock-addresses.conf).

That fence is wider than the other gates': any address Amazon runs in that Region. The gate still talks to one host
only: every connection checks the certificate of bedrock-runtime.us-east-1.amazonaws.com, and the key goes nowhere else.

systemd's IPAddressAllow= takes addresses, not host names. If Amazon moves the host to a range that is not listed, every
connect is refused by the kernel. This script makes that visible instead of silent:

  check  --dropin PATH   compares today's DNS answer for the host with the drop-in. Every address DNS gives must be
                         inside a listed range; otherwise it refuses with BEDROCK_ADDRESSES_OUTSIDE_RANGES and names
                         them.
  render --ranges FILE   prints the drop-in for Amazon's ranges file FILE (a copy of ip-ranges.json that root fetched):
                         the us-east-1 AMAZON IPv4 ranges, merged where they touch. Deterministic for a given file, so
                         `render --ranges FILE | diff - installed-file` is empty when nothing changed. It refuses
                         (RANGES_FILE_INVALID) a file that is not Amazon's format or lists a non-public range.
  watch  --dropin PATH --state FILE
                         the hourly timer's form of check: exit 3 (the unit fails, and its OnFailure= notice emails
                         the owner) only for a mismatch not announced before, so the owner gets at most one email per
                         change. A temporary DNS failure is logged, not announced (the gate's own start check refuses
                         on it).
  update --dropin PATH --ranges FILE
                         root, by hand (the command in the email): write the drop-in for FILE in place atomically
                         (0644) and run `systemctl daemon-reload`. It refuses (RANGES_DO_NOT_COVER_DNS) when FILE does
                         not cover today's DNS answer: the file is then stale or not Amazon's. Then restart the gate.
`check` reads the file, not what systemd has loaded: after installing a new file by hand, always run
`systemctl daemon-reload` before restarting the gate.

The gate unit runs `check` before every start (ExecStartPre); the hourly timer runs `watch`. check and watch need no
key and no internet access beyond the local DNS resolver; render and update read only the file they are given. One JSON
line on stdout; exit 0, 2 on refusal, 3 for a newly announced mismatch (watch).
"""
import argparse
import hashlib
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HOST = 'bedrock-runtime.us-east-1.amazonaws.com'
REGION = 'us-east-1'
SERVICE = 'AMAZON'
DROPIN_BYTES = 512 * 1024
RANGES_BYTES = 16 * 1024 * 1024
MAX_RANGES = 4096
MAX_ADDRESSES = 256
# A published range is never wider than this (a /8 would be a sixteen-million-address hole in the fence).
WIDEST_PREFIX = 9
CREATE_DATE = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}')
HEADER = (
    '# Install as /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf\n'
    '# The only internet addresses the Amazon Bedrock gate may reach: Amazon\'s published IPv4 ranges of ' + REGION + '.\n'
    '# Made by `python3 -I bedrock_addresses.py render`; never edit by hand (README-bedrock.md "Addresses").\n'
)


class Refusal(Exception):
    """A refusal with a fixed public code."""


def public_range(value):
    """One published range as a network: canonical IPv4 text, public, between /WIDEST_PREFIX and /32. None otherwise."""
    try:
        network = ipaddress.IPv4Network(value, strict=True)
    except (ValueError, TypeError):
        return None
    if value != str(network) or not WIDEST_PREFIX <= network.prefixlen <= 32:
        return None
    if not (network.network_address.is_global and network.broadcast_address.is_global):
        return None
    return network


def parse_dropin(text):
    """The allowed ranges, from a drop-in holding only comments, one [Service] line and IPAddressAllow=<IPv4 range>
    lines. Anything else refuses, so the file can only add public Amazon ranges."""
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
        network = public_range(value)
        if network is None:
            raise Refusal('DROPIN_INVALID')
        allowed.append(network)
    if not allowed or len(allowed) != len(set(allowed)) or len(allowed) > MAX_RANGES:
        raise Refusal('DROPIN_INVALID')
    return allowed


def read_dropin(path):
    try:
        with open(path, 'rb') as stream:
            raw = stream.read(DROPIN_BYTES + 1)
        if len(raw) > DROPIN_BYTES:
            raise Refusal('DROPIN_INVALID')
        return parse_dropin(raw.decode('ascii'))
    except (OSError, UnicodeError):
        raise Refusal('DROPIN_UNREADABLE') from None


def read_ranges(path):
    """(createDate, merged networks) of Amazon's ranges file: its IPv4 prefixes for REGION and SERVICE."""
    try:
        with open(path, 'rb') as stream:
            raw = stream.read(RANGES_BYTES + 1)
    except OSError:
        raise Refusal('RANGES_FILE_UNREADABLE') from None
    if len(raw) > RANGES_BYTES:
        raise Refusal('RANGES_FILE_INVALID')
    try:
        document = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeError):
        raise Refusal('RANGES_FILE_INVALID') from None
    prefixes = document.get('prefixes') if isinstance(document, dict) else None
    created = document.get('createDate') if isinstance(document, dict) else None
    if not isinstance(prefixes, list) or not isinstance(created, str) or not CREATE_DATE.fullmatch(created):
        raise Refusal('RANGES_FILE_INVALID')
    networks = []
    for entry in prefixes:
        if not isinstance(entry, dict):
            raise Refusal('RANGES_FILE_INVALID')
        if entry.get('region') != REGION or entry.get('service') != SERVICE:
            continue
        network = public_range(entry.get('ip_prefix'))
        if network is None:
            raise Refusal('RANGES_FILE_INVALID')
        networks.append(network)
    # Ranges that touch are merged; a merge wider than /WIDEST_PREFIX is cut back into ranges of that width.
    merged = [part for network in ipaddress.collapse_addresses(networks)
              for part in (network.subnets(new_prefix=WIDEST_PREFIX) if network.prefixlen < WIDEST_PREFIX else (network,))]
    if not merged or len(merged) > MAX_RANGES:
        raise Refusal('RANGES_FILE_INVALID')
    return created, merged


def resolve(lookup=socket.getaddrinfo):
    """The IPv4 addresses the system resolver gives today (what `getent ahostsv4` shows)."""
    try:
        answers = lookup(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)
        addresses = {ipaddress.IPv4Address(answer[4][0]) for answer in answers}
    except (OSError, ValueError, IndexError, TypeError):
        raise Refusal('DNS_UNAVAILABLE') from None
    if not addresses or len(addresses) > MAX_ADDRESSES:
        raise Refusal('DNS_UNAVAILABLE')
    return addresses


def outside_of(allowed, resolved):
    return sorted(address for address in resolved if not any(address in network for network in allowed))


def check(allowed, resolved):
    outside = outside_of(allowed, resolved)
    result = {'host': HOST, 'ranges': len(allowed), 'resolved': len(resolved), 'outside': [str(a) for a in outside]}
    if outside:
        raise Refusal('BEDROCK_ADDRESSES_OUTSIDE_RANGES', result)
    return {'status': 'ok', **result}


def render(created, networks):
    """The drop-in for these ranges. It must pass the same parse as `check`, so a ranges file can never put a private,
    local or over-wide range (or too many) into the allow-list."""
    text = (HEADER + '# Amazon\'s ranges file: createDate ' + created + ', region ' + REGION + ', service ' + SERVICE + '.\n'
            + '[Service]\n' + ''.join('IPAddressAllow=%s\n' % network for network in sorted(networks)))
    parse_dropin(text)
    return text


def atomic_write(path, data, mode):
    path = Path(path)
    temporary = path.with_name('.%s.%d.tmp' % (path.name, os.getpid()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)  # Exactly this mode, whatever the umask.
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


def watch(dropin, state, lookup):
    """0 when nothing new to announce, 3 for a mismatch not announced before (recorded first). The fingerprint is the
    error code alone for addresses outside the ranges: the host's addresses change every minute, and one email per
    spell outside the list is enough."""
    try:
        result = check(read_dropin(dropin), resolve(lookup))
    except Refusal as refusal:
        if refusal.args[0] == 'DNS_UNAVAILABLE':
            return 0, {'status': 'dns_unavailable', 'announced': False}
        fingerprint = hashlib.sha256(refusal.args[0].encode()).hexdigest()
        try:
            announced = Path(state).read_text().strip() == fingerprint
        except OSError:
            announced = False
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        line = {'status': 'refused', 'error': refusal.args[0], **detail, 'announced': 'before' if announced else 'now'}
        if announced:
            return 0, line
        atomic_write(state, (fingerprint + '\n').encode(), 0o600)
        return 3, line
    try:
        os.unlink(state)  # Back in step: the next change is announced again.
    except FileNotFoundError:
        pass
    return 0, result


def update(dropin, ranges, lookup, run=subprocess.run):
    """Writes the drop-in for Amazon's ranges file, once that file covers today's DNS answer."""
    created, networks = read_ranges(ranges)
    outside = outside_of(networks, resolve(lookup))
    if outside:
        raise Refusal('RANGES_DO_NOT_COVER_DNS', {'outside': [str(a) for a in outside], 'create_date': created})
    atomic_write(dropin, render(created, networks).encode('ascii'), 0o644)
    reload = run(['/usr/bin/systemctl', 'daemon-reload'], env={}, stdin=subprocess.DEVNULL, capture_output=True, timeout=60)
    if reload.returncode != 0:
        raise Refusal('DAEMON_RELOAD_FAILED')
    return {'status': 'updated', 'dropin': str(dropin), 'ranges': len(networks), 'create_date': created,
            'next': 'systemctl restart debateai-preview-bedrock-budget'}


def main(argv=None, lookup=socket.getaddrinfo, run=subprocess.run):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check', 'render', 'watch', 'update'))
    parser.add_argument('--dropin', type=Path)
    parser.add_argument('--state', type=Path)
    parser.add_argument('--ranges', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action in ('render', 'update') and args.ranges is None:
            raise Refusal('RANGES_REQUIRED')
        if args.action == 'render':
            sys.stdout.write(render(*read_ranges(args.ranges)))
            return 0
        if args.dropin is None:
            raise Refusal('DROPIN_REQUIRED')
        if args.action == 'watch':
            if args.state is None:
                raise Refusal('STATE_REQUIRED')
            code, line = watch(args.dropin, args.state, lookup)
            print(json.dumps(line))
            return code
        if args.action == 'update':
            print(json.dumps(update(args.dropin, args.ranges, lookup, run)))
            return 0
        print(json.dumps(check(read_dropin(args.dropin), resolve(lookup))))
        return 0
    except Refusal as refusal:
        detail = refusal.args[1] if len(refusal.args) > 1 else {}
        print(json.dumps({'status': 'refused', 'error': refusal.args[0], **detail}))
        return 2
    except (OSError, subprocess.SubprocessError):
        print(json.dumps({'status': 'refused', 'error': 'WRITE_FAILED'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
