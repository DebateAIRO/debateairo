#!/usr/bin/env python3
"""gate-relay.py - a byte-for-byte relay in front of the DebateAI v3 preview spending gates.

What it is
  The preview server has two spending gates for the AIs, and (plan 2026-10-30, task W1-1) a
  third one for web search. Each gate is a unix-socket service that holds
  a vendor API key and answers only peers whose unix uid is 994 or 992. This relay listens
  on two unix sockets in one directory (deepinfra.sock and anthropic.sock), and on a third,
  perplexity.sock, only when it is started with --perplexity-gate (the search gate is then
  required, like the other two). Every connection
  it accepts is forwarded, byte for byte, to the matching gate socket, so the gate sees the
  relay's uid (992) as the peer. An operator's ssh -L forward can then reach the relay even
  though the ssh user cannot reach the gates directly.

How it is started
  Never as root. It is started as uid 992 (the preview runner account) through systemd-run,
  with the listen directory already present (created by systemd RuntimeDirectory or by
  root). It refuses to start when its effective uid is 0.

What it never does
  It never reads, parses, stores, or logs request or reply bytes. It speaks no HTTP. It only
  copies bytes and counts them. Its log lines (one JSON object per event, on stderr) carry
  event names and counts only: no bytes, no headers, no peer credentials, no client paths.

Stopping
  On SIGTERM or SIGINT, and at --lifetime-seconds, it stops accepting, lets in-flight calls
  finish for up to --drain-seconds (killing a model call mid-flight makes the gate halt),
  removes its own two sockets, and exits 0.
"""

import argparse
import grp
import json
import os
import signal
import socket
import stat
import sys
import threading
import time

DEFAULT_DEEPINFRA_GATE = "/run/debateai-v3-preview/deepinfra-budget-v3.sock"
DEFAULT_ANTHROPIC_GATE = "/run/debateai-v3-preview/anthropic-budget-v1.sock"
# The web search gate's socket (README-perplexity.md): relayed only when --perplexity-gate names it.
DEFAULT_PERPLEXITY_GATE = "/run/debateai-v3-preview/perplexity-budget-v1.sock"
DEFAULT_MODE = 0o660
DEFAULT_MAX_CONNECTIONS = 4
DEFAULT_LIFETIME_SECONDS = 28800.0
# Slow answer (owner ruling 2026-10-12): the gate gives a vendor 1,200 s, the app waits 1,260 s and its socket 1,290 s.
# A quiet connection (the gate sends nothing until the vendor answers) and an in-flight call at a stop outlast both.
DEFAULT_DRAIN_SECONDS = 1500.0
DEFAULT_IDLE_TIMEOUT_SECONDS = 1500.0

NAMES = ("deepinfra", "anthropic")
OPTIONAL_NAMES = ("perplexity",)
SOCKET_FILE_NAMES = {"deepinfra": "deepinfra.sock", "anthropic": "anthropic.sock", "perplexity": "perplexity.sock"}

CHUNK_BYTES = 65536
LISTEN_BACKLOG = 16
ACCEPT_TICK_SECONDS = 0.2
PROBE_TIMEOUT_SECONDS = 0.5
CONNECT_TIMEOUT_SECONDS = 5.0
MIN_TICK_SECONDS = 0.05
MAX_TICK_SECONDS = 2.0
FORCED_GRACE_SECONDS = 5.0

# Every key a log line may carry. Counts and fixed words only; never bytes or peer data.
ALLOWED_LOG_KEYS = frozenset({
    "event", "pid", "listen", "max_connections", "lifetime_seconds", "drain_seconds",
    "idle_timeout_seconds", "socket", "active", "total", "bytes_up", "bytes_down",
    "reason", "refused_cap", "gate_connect_failed", "forced_closed",
})


class RelayRefusal(Exception):
    """A startup refusal. `token` is the plain word printed on stderr (exit code 2)."""

    def __init__(self, token):
        super().__init__(token)
        self.token = token


class RelayConfig:
    def __init__(
        self,
        listen_dir,
        deepinfra_gate=DEFAULT_DEEPINFRA_GATE,
        anthropic_gate=DEFAULT_ANTHROPIC_GATE,
        group=None,
        perplexity_gate=None,
        mode=DEFAULT_MODE,
        max_connections=DEFAULT_MAX_CONNECTIONS,
        lifetime_seconds=DEFAULT_LIFETIME_SECONDS,
        drain_seconds=DEFAULT_DRAIN_SECONDS,
        idle_timeout_seconds=DEFAULT_IDLE_TIMEOUT_SECONDS,
    ):
        self.listen_dir = listen_dir
        self.gate_paths = {"deepinfra": deepinfra_gate, "anthropic": anthropic_gate}
        if perplexity_gate is not None:
            self.gate_paths["perplexity"] = perplexity_gate
        self.group = group
        self.mode = mode
        self.max_connections = max_connections
        self.lifetime_seconds = lifetime_seconds
        self.drain_seconds = drain_seconds
        self.idle_timeout_seconds = idle_timeout_seconds


# ---------------------------------------------------------------- preflight checks

def check_not_root():
    if os.geteuid() == 0:
        raise RelayRefusal("GATE_RELAY_REFUSES_ROOT")


def relay_names(gate_paths):
    """The gates this relay carries: the two AI gates always, the search gate when it was named."""
    return NAMES + tuple(name for name in OPTIONAL_NAMES if name in gate_paths)


def check_gates(gate_paths):
    for name in relay_names(gate_paths):
        try:
            mode = os.stat(gate_paths[name]).st_mode
        except OSError:
            raise RelayRefusal("GATE_RELAY_GATE_MISSING:" + name) from None
        if not stat.S_ISSOCK(mode):
            raise RelayRefusal("GATE_RELAY_GATE_MISSING:" + name)


def resolve_group(value):
    if value is None:
        return None
    text = str(value)
    if text.isdigit():
        return int(text)
    try:
        return grp.getgrnam(text).gr_gid
    except KeyError:
        raise RelayRefusal("GATE_RELAY_UNKNOWN_GROUP") from None


def check_listen_dir(path):
    if not os.path.lexists(path):
        raise RelayRefusal("GATE_RELAY_LISTEN_DIR_MISSING")
    if os.path.islink(path):
        raise RelayRefusal("GATE_RELAY_LISTEN_DIR_IS_SYMLINK")
    if not os.path.isdir(path):
        raise RelayRefusal("GATE_RELAY_LISTEN_DIR_NOT_A_DIRECTORY")


def probe_socket_path(path):
    """Return "absent" or "stale" for a path this relay may use. Refuse anything else.

    A socket file is stale only when a connect is refused (nobody listens behind it).
    Regular files, directories, live sockets and unknown errors are all refused, and nothing
    is deleted here.
    """
    try:
        mode = os.lstat(path).st_mode
    except FileNotFoundError:
        return "absent"
    if not stat.S_ISSOCK(mode):
        raise RelayRefusal("GATE_RELAY_SOCKET_PATH_OCCUPIED")
    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        probe.settimeout(PROBE_TIMEOUT_SECONDS)
        probe.connect(path)
    except FileNotFoundError:
        return "absent"
    except ConnectionRefusedError:
        return "stale"
    except socket.timeout:
        raise RelayRefusal("GATE_RELAY_SOCKET_IN_USE") from None
    except OSError:
        raise RelayRefusal("GATE_RELAY_SOCKET_PATH_OCCUPIED") from None
    else:
        raise RelayRefusal("GATE_RELAY_SOCKET_IN_USE")
    finally:
        probe.close()


def _unlink_if_present(path):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def _shutdown_quietly(sock, how=socket.SHUT_RDWR):
    try:
        sock.shutdown(how)
    except OSError:
        pass


# ---------------------------------------------------------------- logging

class EventLog:
    """One JSON object per line on stderr (or on the given stream). Only ALLOWED_LOG_KEYS."""

    def __init__(self, stream=None):
        self._stream = stream
        self._lock = threading.Lock()

    def __call__(self, event, **fields):
        unknown = set(fields) - ALLOWED_LOG_KEYS
        if unknown:
            raise ValueError("log key not allowed: " + ", ".join(sorted(unknown)))
        record = {"event": event}
        record.update(fields)
        line = json.dumps(record, separators=(",", ":"))
        out = self._stream if self._stream is not None else sys.stderr
        with self._lock:
            out.write(line + "\n")
            out.flush()


# ---------------------------------------------------------------- forwarding

class _Pair:
    """One accepted client, plus its gate socket once connected."""

    def __init__(self, name, client, idle_timeout):
        self.name = name
        self.client = client
        self.gate = None
        self.idle_timeout = idle_timeout
        self.bytes_up = 0
        self.bytes_down = 0
        self.last_activity = time.monotonic()
        self.aborted = False
        self.reason = None
        self._lock = threading.Lock()

    def touch(self):
        self.last_activity = time.monotonic()

    def idle_expired(self):
        return time.monotonic() - self.last_activity >= self.idle_timeout

    def add_bytes(self, direction, count):
        # Each counter has exactly one writer thread (one thread per direction).
        if direction == "up":
            self.bytes_up += count
        else:
            self.bytes_down += count

    def attach_gate(self, gate):
        with self._lock:
            self.gate = gate
            aborted = self.aborted
        if aborted:
            _shutdown_quietly(gate)

    def abort(self, reason):
        with self._lock:
            if self.reason is None:
                self.reason = reason
            self.aborted = True
            socks = [sock for sock in (self.client, self.gate) if sock is not None]
        for sock in socks:
            _shutdown_quietly(sock)


def _half_close(sock):
    _shutdown_quietly(sock, socket.SHUT_WR)


def _pump(pair, src, dst, direction):
    """Copy bytes from src to dst until src ends, errors, or the pair is idle too long.

    The bytes are never inspected: they go straight from one socket to the other.
    """
    try:
        while not pair.aborted:
            try:
                chunk = src.recv(CHUNK_BYTES)
            except socket.timeout:
                if pair.idle_expired():
                    pair.abort("idle")
                continue
            if not chunk:
                _half_close(dst)
                return
            pair.touch()
            view = memoryview(chunk)
            while len(view):
                try:
                    sent = dst.send(view)
                except socket.timeout:
                    if pair.aborted:
                        return
                    if pair.idle_expired():
                        pair.abort("idle")
                        return
                    continue
                view = view[sent:]
                pair.touch()
            pair.add_bytes(direction, len(chunk))
    except OSError:
        pair.abort("error")


# ---------------------------------------------------------------- server

class RelayServer:
    """Owns the two listening sockets, the connection cap, and the shutdown sequence.

    Use start() (may raise RelayRefusal), then wait() (blocks until lifetime or a stop
    request, then drains and removes its sockets). request_stop() only sets a flag, so it is
    safe to call from a signal handler.
    """

    def __init__(self, config, log_stream=None):
        self.config = config
        self._log = EventLog(log_stream)
        self._gate_paths = dict(config.gate_paths)
        self._tick = max(MIN_TICK_SECONDS, min(config.idle_timeout_seconds, MAX_TICK_SECONDS))
        self._cond = threading.Condition()
        self._stop_requested = False
        self._active = 0
        self._total = 0
        self._refused_cap = 0
        self._gate_connect_failed = 0
        self._forced_closed = 0
        self._pairs = set()
        self._listeners = {}
        self._accept_threads = []
        self._owned = []
        self._started_at = None

    # -- public

    def start(self):
        cfg = self.config
        check_not_root()
        check_gates(cfg.gate_paths)
        gid = resolve_group(cfg.group)
        check_listen_dir(cfg.listen_dir)
        names = relay_names(cfg.gate_paths)
        paths = {name: os.path.join(cfg.listen_dir, SOCKET_FILE_NAMES[name]) for name in names}
        # Check every path before removing anything, so a refusal leaves the directory alone.
        states = {name: probe_socket_path(paths[name]) for name in names}
        try:
            for name in names:
                if states[name] == "stale":
                    _unlink_if_present(paths[name])
                self._bind(name, paths[name], cfg.mode, gid)
        except RelayRefusal:
            self._cleanup_owned()
            raise
        except OSError:
            self._cleanup_owned()
            raise RelayRefusal("GATE_RELAY_BIND_FAILED") from None
        self._started_at = time.monotonic()
        self._log(
            "start",
            pid=os.getpid(),
            listen=list(names),
            max_connections=cfg.max_connections,
            lifetime_seconds=cfg.lifetime_seconds,
            drain_seconds=cfg.drain_seconds,
            idle_timeout_seconds=cfg.idle_timeout_seconds,
        )
        for name in names:
            thread = threading.Thread(
                target=self._accept_loop,
                args=(name, self._listeners[name]),
                name="accept-" + name,
                daemon=True,
            )
            thread.start()
            self._accept_threads.append(thread)

    def request_stop(self):
        self._stop_requested = True

    def wait(self):
        if self._started_at is None:
            raise RuntimeError("start() must succeed before wait()")
        deadline = self._started_at + self.config.lifetime_seconds
        try:
            while not self._stop_requested and time.monotonic() < deadline:
                time.sleep(0.1)
            if self._stop_requested:
                self._log("stop_requested")
            else:
                self._log("lifetime_reached")
        finally:
            self._shutdown()
        return 0

    def stats(self):
        with self._cond:
            return self._stats_locked()

    # -- internals

    def _bind(self, name, path, mode, gid):
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        old_umask = os.umask(0o177)  # the new socket file is 0600 until the chmod below
        try:
            listener.bind(path)
        except OSError:
            listener.close()
            raise
        finally:
            os.umask(old_umask)
        self._listeners[name] = listener
        st = os.lstat(path)
        self._owned.append((path, st.st_dev, st.st_ino))
        try:
            os.chmod(path, mode)
            if gid is not None:
                os.chown(path, -1, gid)
        except OSError:
            raise RelayRefusal("GATE_RELAY_CHMOD_OR_CHOWN_FAILED") from None
        listener.listen(LISTEN_BACKLOG)

    def _accept_loop(self, name, listener):
        listener.settimeout(ACCEPT_TICK_SECONDS)
        while not self._stop_requested:
            try:
                client, _ = listener.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            self._admit(name, client)

    def _admit(self, name, client):
        pair = None
        refused_active = refused_count = 0
        with self._cond:
            if self._stop_requested:
                outcome = "stopping"
            elif self._active >= self.config.max_connections:
                self._refused_cap += 1
                refused_active = self._active
                refused_count = self._refused_cap
                outcome = "cap"
            else:
                self._active += 1
                self._total += 1
                pair = _Pair(name, client, self.config.idle_timeout_seconds)
                self._pairs.add(pair)
                outcome = "admitted"
        if outcome == "admitted":
            threading.Thread(target=self._run_pair, args=(pair,), daemon=True).start()
            return
        client.close()
        if outcome == "cap":
            self._log("refused_cap", socket=name, active=refused_active, refused_cap=refused_count)

    def _run_pair(self, pair):
        gate = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            gate.settimeout(CONNECT_TIMEOUT_SECONDS)
            gate.connect(self._gate_paths[pair.name])
        except OSError:
            gate.close()
            self._finish(pair, gate_failed=True)
            return
        gate.settimeout(self._tick)
        pair.client.settimeout(self._tick)
        pair.attach_gate(gate)
        with self._cond:
            active, total = self._active, self._total
        self._log("open", socket=pair.name, active=active, total=total)
        up = threading.Thread(
            target=_pump, args=(pair, pair.client, gate, "up"), name="pump-up", daemon=True
        )
        up.start()
        _pump(pair, gate, pair.client, "down")
        up.join()
        self._finish(pair)

    def _finish(self, pair, gate_failed=False):
        for sock in (pair.client, pair.gate):
            if sock is not None:
                sock.close()
        with self._cond:
            self._active -= 1
            self._pairs.discard(pair)
            if gate_failed:
                self._gate_connect_failed += 1
            active, total = self._active, self._total
            self._cond.notify_all()
        if gate_failed:
            self._log("gate_connect_failed", socket=pair.name)
        else:
            self._log(
                "close",
                socket=pair.name,
                active=active,
                total=total,
                bytes_up=pair.bytes_up,
                bytes_down=pair.bytes_down,
                reason=pair.reason or "done",
            )

    def _close_listeners(self):
        for listener in self._listeners.values():
            listener.close()

    def _cleanup_owned(self):
        self._close_listeners()
        for path, dev, ino in self._owned:
            try:
                st = os.lstat(path)
            except OSError:
                continue
            # Remove only the socket this process created, never a replacement.
            if stat.S_ISSOCK(st.st_mode) and st.st_dev == dev and st.st_ino == ino:
                _unlink_if_present(path)
        self._owned = []

    def _stats_locked(self):
        return {
            "active": self._active,
            "total": self._total,
            "refused_cap": self._refused_cap,
            "gate_connect_failed": self._gate_connect_failed,
            "forced_closed": self._forced_closed,
        }

    def _shutdown(self):
        self._stop_requested = True
        for thread in self._accept_threads:
            thread.join(timeout=ACCEPT_TICK_SECONDS * 10)
        self._close_listeners()
        drain_deadline = time.monotonic() + self.config.drain_seconds
        with self._cond:
            while self._active > 0 and time.monotonic() < drain_deadline:
                self._cond.wait(min(0.5, max(0.0, drain_deadline - time.monotonic())))
            leftover = list(self._pairs)
        for pair in leftover:
            pair.abort("forced")
        with self._cond:
            self._forced_closed += len(leftover)
            grace_deadline = time.monotonic() + FORCED_GRACE_SECONDS
            while self._active > 0 and time.monotonic() < grace_deadline:
                self._cond.wait(0.2)
            snapshot = self._stats_locked()
        self._cleanup_owned()
        self._log(
            "exit",
            total=snapshot["total"],
            refused_cap=snapshot["refused_cap"],
            gate_connect_failed=snapshot["gate_connect_failed"],
            forced_closed=snapshot["forced_closed"],
        )


# ---------------------------------------------------------------- command line

def _parse_mode(text):
    try:
        value = int(text, 8)
    except ValueError:
        raise argparse.ArgumentTypeError("mode must be octal, for example 660") from None
    if not 0 <= value <= 0o777:
        raise argparse.ArgumentTypeError("mode must be between 0 and 777 (octal)")
    return value


def _positive_int(text):
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return value


def _positive_float(text):
    value = float(text)
    if not value > 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return value


def _nonnegative_float(text):
    value = float(text)
    if not value >= 0:
        raise argparse.ArgumentTypeError("must not be negative")
    return value


def build_parser():
    parser = argparse.ArgumentParser(
        prog="gate-relay.py",
        description="Byte-for-byte relay for the DebateAI v3 preview spending gates. It never reads bodies.",
    )
    parser.add_argument("--listen-dir", required=True,
                        help="existing directory where deepinfra.sock and anthropic.sock are created")
    parser.add_argument("--deepinfra-gate", default=DEFAULT_DEEPINFRA_GATE,
                        help="path of the DeepInfra gate socket")
    parser.add_argument("--anthropic-gate", default=DEFAULT_ANTHROPIC_GATE,
                        help="path of the Anthropic gate socket")
    parser.add_argument("--perplexity-gate", default=None,
                        help="path of the Perplexity web search gate socket (usually " + DEFAULT_PERPLEXITY_GATE
                        + "); relayed as perplexity.sock only when given")
    parser.add_argument("--group", default=None,
                        help="group name or numeric gid to give the two relay sockets")
    parser.add_argument("--mode", type=_parse_mode, default=DEFAULT_MODE,
                        help="octal permission bits for the relay sockets (default 660)")
    parser.add_argument("--max-connections", type=_positive_int, default=DEFAULT_MAX_CONNECTIONS,
                        help="concurrent connections allowed across both sockets (default 4)")
    parser.add_argument("--lifetime-seconds", type=_positive_float, default=DEFAULT_LIFETIME_SECONDS,
                        help="stop accepting and exit after this many seconds (default 28800)")
    parser.add_argument("--drain-seconds", type=_nonnegative_float, default=DEFAULT_DRAIN_SECONDS,
                        help="grace for in-flight calls at lifetime end or on SIGTERM/SIGINT (default 1500)")
    parser.add_argument("--idle-timeout-seconds", type=_positive_float, default=DEFAULT_IDLE_TIMEOUT_SECONDS,
                        help="close a connection after this long with no bytes either way (default 1500)")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    config = RelayConfig(
        listen_dir=args.listen_dir,
        deepinfra_gate=args.deepinfra_gate,
        anthropic_gate=args.anthropic_gate,
        perplexity_gate=args.perplexity_gate,
        group=args.group,
        mode=args.mode,
        max_connections=args.max_connections,
        lifetime_seconds=args.lifetime_seconds,
        drain_seconds=args.drain_seconds,
        idle_timeout_seconds=args.idle_timeout_seconds,
    )
    server = RelayServer(config)
    try:
        server.start()
    except RelayRefusal as refusal:
        print(refusal.token, file=sys.stderr)
        return 2
    if threading.current_thread() is threading.main_thread():
        def _on_signal(signum, frame):
            server.request_stop()
        signal.signal(signal.SIGTERM, _on_signal)
        signal.signal(signal.SIGINT, _on_signal)
    return server.wait()


if __name__ == "__main__":
    sys.exit(main())
