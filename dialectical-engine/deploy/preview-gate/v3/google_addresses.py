#!/usr/bin/env python3
"""Keeps the Google spending gate's network fence honest, in either of its two egress modes.

The Google gate (debateai-preview-google-budget.service) talks to exactly one host,
generativelanguage.googleapis.com, on port 443. The owner picks one of two ways to fence it, after
measuring Google's addresses on the server with google_addresses_measure.py:

Measured-list mode. systemd's IPAddressAllow= takes addresses, not host names, so the gate unit
allows exactly the IPv4 addresses listed in one drop-in (50-google-addresses.conf). If Google
moves to an address that is not listed, every connect is refused by the kernel. These actions make
that visible instead of silent (the same rules as the DeepInfra gate's deepinfra_addresses.py):

  check  --dropin PATH   compares today's DNS answer for the host with the drop-in. Every address
                         DNS gives must be listed; otherwise it refuses with
                         GOOGLE_ADDRESSES_CHANGED and names the new ones. Listed addresses DNS no
                         longer gives are reported as "stale" (not a refusal).
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

Proxy mode. The gate has no internet at all. Its own private /etc/hosts says the host is
127.0.0.1, inside its own private network, where a forwarder with one fixed target leads on to
Google. One action checks that, before every start of the gate (ExecStartPre, inside the gate's
own sandbox):

  check-proxy            the system resolver must give exactly 127.0.0.1 for the host, and nothing
                         else (no other IPv4 address, no IPv6 address at all), else it refuses with
                         GOOGLE_EGRESS_NOT_PROXIED. Then a plain TCP connect to 127.0.0.1:443 must
                         succeed within 5 seconds (the forwarder is there), else it refuses with
                         GOOGLE_PROXY_UNREACHABLE. It sends no byte, reads nothing, and closes.

No action ever reads a key or talks to Google. One JSON line on stdout; exit 0, 2 on refusal, 3
for a newly announced mismatch (watch).
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
HOST = 'generativelanguage.googleapis.com'
PORT = 443
DROPIN_BYTES = 64 * 1024
MAX_ADDRESSES = 256
LOOPBACK = ipaddress.IPv4Address('127.0.0.1')
PROXY_CONNECT_SECONDS = 5
GATE_UNIT = 'debateai-preview-google-budget'
HEADER = (
    '# Install as /etc/systemd/system/' + GATE_UNIT + '.service.d/50-google-addresses.conf\n'
    '# The only internet addresses the Google spending gate may reach: the IPv4 addresses of ' + HOST + '.\n'
    '# Made by `python3 -I google_addresses.py render`; never edit by hand (README "Google addresses").\n'
)


class Refusal(Exception):
    """A refusal with a fixed public code."""


def parse_dropin(text):
    """The allowed addresses, from a drop-in holding only comments, one [Service] line and
    IPAddressAllow=<IPv4>/32 lines. Anything else refuses, so the file can only add public /32s."""
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
        answers = lookup(HOST, PORT, socket.AF_INET, socket.SOCK_STREAM)
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
        raise Refusal('GOOGLE_ADDRESSES_CHANGED', result)
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
    `render` by hand."""
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
            'next': 'systemctl restart ' + GATE_UNIT}


def check_proxy(lookup, port):
    """Proxy mode, before the gate starts: the host must lead only to the local forwarder.
    Asks for every address family at once, so an IPv6 answer (even ::1) refuses too."""
    try:
        answers = lookup(HOST, PORT, socket.AF_UNSPEC, socket.SOCK_STREAM)
        resolved = {ipaddress.ip_address(answer[4][0]) for answer in answers}
    except (OSError, ValueError, IndexError, TypeError):
        raise Refusal('GOOGLE_EGRESS_NOT_PROXIED', {'host': HOST, 'resolved': []}) from None
    if resolved != {LOOPBACK}:
        # Sorted IPv4 first, then IPv6; at most a handful of entries are shown.
        shown = sorted(resolved, key=lambda a: (a.version, int(a)))[:16]
        raise Refusal('GOOGLE_EGRESS_NOT_PROXIED', {'host': HOST, 'resolved': [str(a) for a in shown]})
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(PROXY_CONNECT_SECONDS)
            connection.connect((str(LOOPBACK), port))  # Only the TCP handshake: nothing is sent or read.
    except OSError:
        raise Refusal('GOOGLE_PROXY_UNREACHABLE', {'host': HOST, 'proxy': '%s:%d' % (LOOPBACK, port)}) from None
    return {'status': 'ok', 'host': HOST, 'resolved': [str(LOOPBACK)], 'proxy': '%s:%d' % (LOOPBACK, port)}


def main(argv=None, lookup=socket.getaddrinfo, run=subprocess.run, proxy_port=PORT):
    """`proxy_port` exists only so the offline tests can point check-proxy at their own listener;
    there is no command-line flag for it, so the server always checks 127.0.0.1:443."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check', 'render', 'watch', 'update', 'check-proxy'))
    parser.add_argument('--dropin', type=Path)
    parser.add_argument('--state', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == 'check-proxy':
            if args.dropin is not None or args.state is not None:
                raise Refusal('ARGUMENTS_INVALID')
            print(json.dumps(check_proxy(lookup, proxy_port)))
            return 0
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
