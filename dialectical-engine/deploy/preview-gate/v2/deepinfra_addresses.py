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
                         so `render | diff - installed-file` is empty when nothing changed. It
                         refuses (DROPIN_INVALID) if DNS gives a non-public address.
  watch  --dropin PATH --state FILE
                         the hourly timer's form of check: exit 3 (the unit fails, and its
                         OnFailure= notice emails the owner) only for a mismatch not announced
                         before, so the owner gets at most one email per change. A temporary DNS
                         failure is logged, not announced (the gate's own start check refuses on it).
  update --dropin PATH   root, by hand (the command in the email): add today's DNS answer to the
                         list (nothing listed is dropped), write it in place atomically (0644),
                         and run `systemctl daemon-reload`. Then restart the gate.
`check` reads the file, not what systemd has loaded: after installing a new file by hand, always
run `systemctl daemon-reload` before restarting the gate.

The gate unit runs `check` before every start (ExecStartPre); the hourly timer runs `watch`, which
emails the owner once per change through the preview notice. check/watch/render need no key and
no internet access beyond the local DNS resolver. One JSON line on stdout; exit 0, 2 on refusal,
3 for a newly announced mismatch (watch).
"""
import argparse
import hashlib
import ipaddress
import json
import os
import socket
import subprocess
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
    """The drop-in for these addresses. It must pass the same parse as `check`, so DNS can never
    put a private, local or link-local address (or too many) into the allow-list."""
    text = HEADER + '[Service]\n' + ''.join('IPAddressAllow=%s/32\n' % a for a in sorted(resolved))
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


def mismatch_fingerprint(refusal):
    detail = refusal.args[1] if len(refusal.args) > 1 else {}
    return hashlib.sha256(json.dumps({'error': refusal.args[0], 'new': detail.get('new', [])},
                                     sort_keys=True).encode()).hexdigest()


def watch(dropin, state, lookup):
    """0 when nothing new to announce, 3 for a mismatch not announced before (recorded first)."""
    try:
        result = check(read_dropin(dropin), resolve(lookup))
    except Refusal as refusal:
        if refusal.args[0] == 'DNS_UNAVAILABLE':
            return 0, {'status': 'dns_unavailable', 'announced': False}
        fingerprint = mismatch_fingerprint(refusal)
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


def update(dropin, lookup, run=subprocess.run):
    """Adds today's DNS answer to the list; never drops an address that is listed (a DNS pool that
    answers with changing subsets must not flip the list). Removing stale addresses is a reviewed
    `render` (README step 6)."""
    resolved = resolve(lookup)
    try:
        before = read_dropin(dropin)
    except Refusal:
        before = set()
    text = render(resolved | before)
    atomic_write(dropin, text.encode('ascii'), 0o644)
    reload = run(['/usr/bin/systemctl', 'daemon-reload'], env={}, stdin=subprocess.DEVNULL, capture_output=True, timeout=60)
    if reload.returncode != 0:
        raise Refusal('DAEMON_RELOAD_FAILED')
    return {'status': 'updated', 'dropin': str(dropin), 'allowed': len(resolved | before),
            'added': [str(a) for a in sorted(resolved - before)], 'stale': [str(a) for a in sorted(before - resolved)],
            'next': 'systemctl restart debateai-preview-provider-budget'}


def main(argv=None, lookup=socket.getaddrinfo, run=subprocess.run):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check', 'render', 'watch', 'update'))
    parser.add_argument('--dropin', type=Path)
    parser.add_argument('--state', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == 'render':
            sys.stdout.write(render(resolve(lookup)))
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
            print(json.dumps(update(args.dropin, lookup, run)))
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
