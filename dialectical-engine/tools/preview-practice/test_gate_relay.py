"""Tests for gate-relay.py (stdlib unittest only; no root needed).

Run from the worktree root:
  python3 -m unittest -v dialectical-engine/tools/preview-practice/test_gate_relay.py
or from dialectical-engine/:
  python3 tools/preview-practice/test_gate_relay.py

The fake gates in these tests answer b"ECHO:" + whatever they read. A gate reads until the
client half-closes, so every exchange also proves that half-close reaches the gate.
"""

import contextlib
import importlib.util
import io
import json
import os
import shutil
import socket
import stat
import tempfile
import threading
import time
import unittest
from unittest import mock

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("gate_relay", os.path.join(_HERE, "gate-relay.py"))
gate_relay = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gate_relay)

# Built at runtime so the marker never sits in the source as one literal string.
MARKER = "".join(["SECRET", "-MARKER-", "xyz"])
MIB_BODY = bytes(range(256)) * 4096  # exactly 1 MiB, deterministic


def make_short_dir():
    """AF_UNIX paths are limited to about 104 bytes on macOS, so keep the temp dir short."""
    base = "/tmp" if os.path.isdir("/tmp") else None
    return tempfile.mkdtemp(prefix="gr-", dir=base)


def connect(path):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect(path)
    return sock


def recv_all(sock):
    chunks = []
    while True:
        data = sock.recv(65536)
        if not data:
            return b"".join(chunks)
        chunks.append(data)


def exchange(path, body):
    """One request and its response, the way HTTP with Connection: close behaves."""
    with connect(path) as sock:
        sock.sendall(body)
        sock.shutdown(socket.SHUT_WR)
        return recv_all(sock)


def wait_until(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while True:
        if predicate():
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.02)


class FakeGate:
    """Stands in for a spending gate. Each connection is read until the peer half-closes,
    then answered with b"ECHO:" + everything read. With hold=True the answer waits until
    release is set, which keeps a call in flight for the cap and drain tests."""

    def __init__(self, path):
        self.path = path
        self.hold = False
        self.release = threading.Event()
        self.accepted = 0
        self._closing = False
        self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._sock.bind(path)
        self._sock.listen(16)
        self._sock.settimeout(0.05)
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()

    def _accept_loop(self):
        while not self._closing:
            try:
                conn, _ = self._sock.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            self.accepted += 1
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        try:
            if self.hold:
                self.release.wait(timeout=30)
            chunks = []
            while True:
                data = conn.recv(65536)
                if not data:
                    break
                chunks.append(data)
            conn.sendall(b"ECHO:" + b"".join(chunks))
        except OSError:
            pass
        finally:
            conn.close()

    def close(self):
        self._closing = True
        self.release.set()
        self._thread.join(timeout=5)
        self._sock.close()
        try:
            os.unlink(self.path)
        except FileNotFoundError:
            pass


class RelayTestCase(unittest.TestCase):
    def setUp(self):
        self._servers = []
        self.tmp = make_short_dir()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.listen_dir = os.path.join(self.tmp, "relay")
        os.mkdir(self.listen_dir)
        self.dgate_path = os.path.join(self.tmp, "dg.sock")
        self.agate_path = os.path.join(self.tmp, "ag.sock")
        self.dgate = FakeGate(self.dgate_path)
        self.addCleanup(self.dgate.close)
        self.agate = FakeGate(self.agate_path)
        self.addCleanup(self.agate.close)
        self.log = io.StringIO()
        # Cleanups run last-in first-out, so relays stop before the fake gates close.
        self.addCleanup(self._stop_servers)

    # -- helpers

    def relay_path(self, name):
        return os.path.join(self.listen_dir, gate_relay.SOCKET_FILE_NAMES[name])

    def make_config(self, **overrides):
        values = dict(
            listen_dir=self.listen_dir,
            deepinfra_gate=self.dgate_path,
            anthropic_gate=self.agate_path,
            group=None,
            mode=0o660,
            max_connections=4,
            lifetime_seconds=600.0,
            drain_seconds=2.0,
            idle_timeout_seconds=60.0,
        )
        values.update(overrides)
        return gate_relay.RelayConfig(**values)

    def start_relay(self, **overrides):
        server = gate_relay.RelayServer(self.make_config(**overrides), log_stream=self.log)
        server.start()
        thread = threading.Thread(target=server.wait, daemon=True)
        thread.start()
        self._servers.append((server, thread))
        return server

    def _stop_servers(self):
        for server, thread in self._servers:
            server.request_stop()
            thread.join(timeout=10)

    def records(self):
        return [json.loads(line) for line in self.log.getvalue().splitlines() if line.strip()]

    def has_event(self, event, **fields):
        def found():
            return any(
                record.get("event") == event
                and all(record.get(key) == value for key, value in fields.items())
                for record in self.records()
            )
        return wait_until(found)

    def close_record(self, socket_name):
        for record in self.records():
            if record.get("event") == "close" and record.get("socket") == socket_name:
                return record
        return None

    def main_argv(self, **overrides):
        values = dict(
            listen_dir=self.listen_dir,
            deepinfra_gate=self.dgate_path,
            anthropic_gate=self.agate_path,
        )
        values.update(overrides)
        return [
            "--listen-dir", values["listen_dir"],
            "--deepinfra-gate", values["deepinfra_gate"],
            "--anthropic-gate", values["anthropic_gate"],
        ]

    def run_main(self, argv):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = gate_relay.main(argv)
        return code, err.getvalue()

    # -- forwarding

    def test_forwards_both_sockets_with_half_close(self):
        self.start_relay()
        self.assertEqual(exchange(self.relay_path("deepinfra"), b"hello-deepinfra"),
                         b"ECHO:hello-deepinfra")
        self.assertEqual(exchange(self.relay_path("anthropic"), b"hello-anthropic"),
                         b"ECHO:hello-anthropic")
        self.assertTrue(self.has_event("open", socket="deepinfra"))
        self.assertTrue(self.has_event("open", socket="anthropic"))
        self.assertEqual(self.dgate.accepted, 1)
        self.assertEqual(self.agate.accepted, 1)

    def test_the_search_gate_is_relayed_only_when_named(self):
        # Plan 2026-10-30, task W1-1: the Perplexity gate gets its own perplexity.sock when --perplexity-gate names it.
        self.start_relay()
        self.assertFalse(os.path.lexists(self.relay_path("perplexity")))
        self._stop_servers()
        self._servers.clear()
        pgate_path = os.path.join(self.tmp, "pg.sock")
        pgate = FakeGate(pgate_path)
        self.addCleanup(pgate.close)
        self.start_relay(perplexity_gate=pgate_path)
        self.assertEqual(exchange(self.relay_path("perplexity"), b"hello-search"), b"ECHO:hello-search")
        self.assertEqual(exchange(self.relay_path("deepinfra"), b"hello-deepinfra"), b"ECHO:hello-deepinfra")
        self.assertTrue(self.has_event("open", socket="perplexity"))
        self.assertEqual(pgate.accepted, 1)
        code, text = self.run_main(self.main_argv() + ["--perplexity-gate", os.path.join(self.tmp, "missing.sock")])
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_GATE_MISSING:perplexity", text)

    def test_one_mebibyte_body_is_byte_exact_and_counted(self):
        self.start_relay()
        self.assertEqual(len(MIB_BODY), 1 << 20)
        reply = exchange(self.relay_path("deepinfra"), MIB_BODY)
        self.assertEqual(reply, b"ECHO:" + MIB_BODY)
        self.assertTrue(wait_until(lambda: self.close_record("deepinfra") is not None))
        record = self.close_record("deepinfra")
        self.assertEqual(record["bytes_up"], len(MIB_BODY))
        self.assertEqual(record["bytes_down"], len(MIB_BODY) + len(b"ECHO:"))
        self.assertEqual(record["reason"], "done")

    def test_concurrency_cap_is_shared_and_recovers(self):
        server = self.start_relay(max_connections=2)
        self.dgate.hold = True
        first = connect(self.relay_path("deepinfra"))
        second = connect(self.relay_path("deepinfra"))
        try:
            self.assertTrue(wait_until(
                lambda: self.dgate.accepted >= 2 and server.stats()["active"] == 2))
            # The cap is shared: a third client on the OTHER socket is refused too.
            third = connect(self.relay_path("anthropic"))
            try:
                third.settimeout(5)
                started = time.monotonic()
                self.assertEqual(third.recv(65536), b"")
                self.assertLess(time.monotonic() - started, 4)
            finally:
                third.close()
            self.assertEqual(server.stats()["refused_cap"], 1)
            self.assertTrue(self.has_event("refused_cap", socket="anthropic"))

            self.dgate.release.set()
            for sock in (first, second):
                sock.shutdown(socket.SHUT_WR)
                self.assertEqual(recv_all(sock), b"ECHO:")
                sock.close()
        finally:
            first.close()
            second.close()

        self.assertTrue(wait_until(lambda: server.stats()["active"] == 0))
        self.assertEqual(exchange(self.relay_path("deepinfra"), b"after"), b"ECHO:after")
        self.assertEqual(server.stats()["refused_cap"], 1)

    def test_bodies_and_client_details_never_reach_the_log(self):
        self.start_relay()
        body = (b"POST /v1/chat HTTP/1.1\r\nX-Note: " + MARKER.encode()
                + b"\r\n\r\n" + MARKER.encode() * 50)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            reply = exchange(self.relay_path("deepinfra"), body)
        self.assertEqual(reply, b"ECHO:" + body)  # the marker really went through
        self.assertTrue(self.has_event("close", socket="deepinfra"))

        text = self.log.getvalue()
        for forbidden in (MARKER, "SECRET", "X-Note", "HTTP/1.1", "POST"):
            self.assertNotIn(forbidden, text)
            self.assertNotIn(forbidden, err.getvalue())

        events = set()
        for record in self.records():
            self.assertLessEqual(set(record), gate_relay.ALLOWED_LOG_KEYS)
            for value in record.values():
                self.assertIsInstance(value, (str, int, float, list))
            events.add(record["event"])
        self.assertIn("open", events)
        self.assertIn("close", events)
        self.assertEqual(self.close_record("deepinfra")["bytes_up"], len(body))

    # -- startup refusals

    def test_refuses_to_run_as_root(self):
        with mock.patch("os.geteuid", return_value=0):
            code, text = self.run_main(self.main_argv())
            server = gate_relay.RelayServer(self.make_config(), log_stream=io.StringIO())
            with self.assertRaises(gate_relay.RelayRefusal) as raised:
                server.start()
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_REFUSES_ROOT", text)
        self.assertEqual(raised.exception.token, "GATE_RELAY_REFUSES_ROOT")
        self.assertEqual(os.listdir(self.listen_dir), [])

    def test_refuses_missing_or_non_socket_gate(self):
        code, text = self.run_main(
            self.main_argv(deepinfra_gate=os.path.join(self.tmp, "no-such.sock")))
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_GATE_MISSING:deepinfra", text)

        plain = os.path.join(self.tmp, "plain-file")
        with open(plain, "w") as handle:
            handle.write("not a socket")
        code, text = self.run_main(self.main_argv(anthropic_gate=plain))
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_GATE_MISSING:anthropic", text)
        self.assertEqual(os.listdir(self.listen_dir), [])

    def test_refuses_socket_path_occupied_by_regular_file(self):
        path = self.relay_path("deepinfra")
        with open(path, "w") as handle:
            handle.write("keep me")
        code, text = self.run_main(self.main_argv())
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_SOCKET_PATH_OCCUPIED", text)
        with open(path) as handle:
            self.assertEqual(handle.read(), "keep me")  # the regular file was not touched
        self.assertFalse(os.path.lexists(self.relay_path("anthropic")))

    def test_refuses_missing_or_symlinked_listen_dir(self):
        code, text = self.run_main(
            self.main_argv(listen_dir=os.path.join(self.tmp, "absent")))
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_LISTEN_DIR_MISSING", text)

        link = os.path.join(self.tmp, "dir-link")
        os.symlink(self.listen_dir, link)
        code, text = self.run_main(self.main_argv(listen_dir=link))
        self.assertEqual(code, 2)
        self.assertIn("GATE_RELAY_LISTEN_DIR_IS_SYMLINK", text)
        self.assertFalse(os.path.lexists(self.relay_path("deepinfra")))

    def test_stale_socket_is_replaced_and_live_socket_is_refused(self):
        path = self.relay_path("deepinfra")
        stale = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        stale.bind(path)
        stale.close()  # the file stays behind and nobody listens on it
        self.start_relay()
        self.assertTrue(stat.S_ISSOCK(os.stat(path).st_mode))

        second = gate_relay.RelayServer(self.make_config(), log_stream=io.StringIO())
        with self.assertRaises(gate_relay.RelayRefusal) as raised:
            second.start()
        self.assertEqual(raised.exception.token, "GATE_RELAY_SOCKET_IN_USE")
        self.assertTrue(stat.S_ISSOCK(os.stat(path).st_mode))  # the live socket was left alone

    def test_socket_mode_and_group_are_applied(self):
        self.start_relay(mode=0o640, group=str(os.getgid()))
        for name in gate_relay.NAMES:
            st = os.stat(self.relay_path(name))
            self.assertTrue(stat.S_ISSOCK(st.st_mode))
            self.assertEqual(st.st_mode & 0o777, 0o640)
            self.assertEqual(st.st_gid, os.getgid())

    def test_group_resolution(self):
        self.assertIsNone(gate_relay.resolve_group(None))
        self.assertEqual(gate_relay.resolve_group(str(os.getgid())), os.getgid())
        with self.assertRaises(gate_relay.RelayRefusal) as raised:
            gate_relay.resolve_group("gr-no-such-group-" + str(os.getpid()))
        self.assertEqual(raised.exception.token, "GATE_RELAY_UNKNOWN_GROUP")

    def test_cli_defaults_and_octal_mode(self):
        args = gate_relay.build_parser().parse_args(["--listen-dir", self.listen_dir])
        self.assertEqual(args.deepinfra_gate, "/run/debateai-v3-preview/deepinfra-budget-v3.sock")
        self.assertEqual(args.anthropic_gate, "/run/debateai-v3-preview/anthropic-budget-v1.sock")
        self.assertEqual(args.mode, 0o660)
        self.assertEqual(args.max_connections, 4)
        self.assertEqual(args.lifetime_seconds, 28800.0)
        # Slow answer (owner ruling 2026-10-12): the gate gives a vendor 1,200 s and answers within 30 s more; the app
        # waits 1,260 s and its socket 1,290 s. A quiet connection, and an in-flight call at a stop, outlast both.
        self.assertEqual(args.drain_seconds, 1500.0)
        self.assertEqual(args.idle_timeout_seconds, 1500.0)
        args = gate_relay.build_parser().parse_args(["--listen-dir", self.listen_dir, "--mode", "640"])
        self.assertEqual(args.mode, 0o640)

    # -- lifetime, idle, failure and shutdown

    def test_lifetime_stops_accepting_removes_sockets_and_exits_cleanly(self):
        server = gate_relay.RelayServer(
            self.make_config(lifetime_seconds=1.0, drain_seconds=1.0), log_stream=self.log)
        server.start()
        thread = threading.Thread(target=server.wait, daemon=True)
        begun = time.monotonic()
        thread.start()
        thread.join(timeout=10)
        self.assertFalse(thread.is_alive())
        self.assertLess(time.monotonic() - begun, 8)
        for name in gate_relay.NAMES:
            path = self.relay_path(name)
            self.assertFalse(os.path.lexists(path))
            probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                with self.assertRaises(OSError):
                    probe.connect(path)
            finally:
                probe.close()
        self.assertTrue(self.has_event("lifetime_reached"))
        self.assertTrue(self.has_event("exit"))

    def test_idle_pair_is_closed_after_idle_timeout(self):
        self.start_relay(idle_timeout_seconds=1.0)
        client = connect(self.relay_path("deepinfra"))
        try:
            started = time.monotonic()
            data = client.recv(65536)  # nothing is sent by either side
            elapsed = time.monotonic() - started
        finally:
            client.close()
        self.assertEqual(data, b"")
        self.assertLess(elapsed, 8)
        self.assertGreaterEqual(elapsed, 0.5)
        self.assertTrue(self.has_event("close", socket="deepinfra", reason="idle"))

    def test_gate_connect_failure_closes_client_and_is_counted(self):
        stale_gate = os.path.join(self.tmp, "stale-gate.sock")
        leftover = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        leftover.bind(stale_gate)
        leftover.close()  # a socket file with nobody listening behind it
        server = self.start_relay(deepinfra_gate=stale_gate)
        client = connect(self.relay_path("deepinfra"))
        try:
            self.assertEqual(recv_all(client), b"")
        finally:
            client.close()
        self.assertTrue(wait_until(lambda: server.stats()["gate_connect_failed"] == 1))
        self.assertTrue(self.has_event("gate_connect_failed", socket="deepinfra"))

    def test_stop_drains_in_flight_call_then_exits(self):
        server = self.start_relay(drain_seconds=5.0)
        thread = self._servers[-1][1]
        self.dgate.hold = True
        call = connect(self.relay_path("deepinfra"))
        try:
            call.sendall(b"long-call")
            self.assertTrue(wait_until(lambda: self.dgate.accepted >= 1))
            server.request_stop()
            time.sleep(0.5)
            self.assertTrue(thread.is_alive(), "relay exited while a call was in flight")
            self.dgate.release.set()
            call.shutdown(socket.SHUT_WR)
            self.assertEqual(recv_all(call), b"ECHO:long-call")
        finally:
            call.close()
        thread.join(timeout=10)
        self.assertFalse(thread.is_alive())
        self.assertFalse(os.path.lexists(self.relay_path("deepinfra")))
        self.assertFalse(os.path.lexists(self.relay_path("anthropic")))


if __name__ == "__main__":
    unittest.main()
