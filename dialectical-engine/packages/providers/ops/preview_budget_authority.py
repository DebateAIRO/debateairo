#!/usr/bin/env python3
"""Root-owned private preview spending gate, v3: one provider, its reviewed model table, one pot
per Bucharest day. No retries.

The GO (schema v3, root-owned, bound by hash at activate) names one provider profile (`provider`)
and the reviewed models of that profile it switches on (`enabled_models`). The profile and its
model rows (prices, output bound, effort, JSON mode) live in the helper's code, so the GO's
helper_sha256 binds them: a price change is a reviewed code change, never a GO edit. A v2 GO (one
fixed model) is refused. A model the GO does not enable is refused before any reservation or key
read; each call reserves its own row's worst case ((request bytes + 2048) x input price + output
bound x output price, per million, at the profile's reservation prices for that moment, never
above the row's ceiling prices; the caller may hold more, up to the request at ceiling prices)
and settles at the profile's prices for that row at the moment it was priced (or
the provider's reported cost, the larger); its ledger entry records the model, its maker, the
reservation and settlement prices and the bound; and a reply naming any other model than that
entry's halts. No reviewed row may reserve more than its profile's per_call_cap_usd for a
full-size request (profile.max_request_bytes, at its ceiling prices), and activate refuses a GO
whose max_concurrent_calls x largest enabled worst case exceeds daily_budget_usd. The profile
API (the helper's DeepInfraProfile docstring lists it) is all the core calls, so a new provider
is one reviewed profile class.

init creates fresh v3 state from a hash-bound GO; activate opens it on the reviewed Linux host
for open_days; serve is Root-operated Unix IPC and, with probe, the only reader of Root's
provider key; stop halts; status is read-only (and shows today's spend per model); probe (root
only) makes one tiny paid call to a reviewed model, enabled or not, through the same
reserve/settle/halt path, to measure it before the owner enables it. Before any phase, the helper's custody (root-owned,
writable by no one else) and, with a GO, its bound hash are checked; only then do those exact
bytes run.
Each call reserves its worst case under a short ledger lock, the lock is released for the one
fixed upstream HTTPS request, and the charge is then settled under the lock. Uncertainty,
missing usage, overrun, a provider error, another model, a lost reply or any failure after the
reservation halts every new call until Root re-activates; calls already in flight finish and
settle. A halt is written before the ledger entry it explains, and serve start halts on any
call a crash interrupted. If a settlement or a halt cannot be written, the running server
reserves nothing more until it is restarted. A probe runs in its own process beside serve and
holds the probe lock while it runs: serve start refuses while it is held (PROBE_RUNNING), and a
probe entry left in flight once the lock is free (a probe that died or could not settle) halts
serve's next reservation (interrupted_probe).
The v2 and v1 state (other schemas, other folders) is never opened, and serve refuses the retired
socket names (v1's provider-budget.sock, v2's team-budget-v2.sock): v3 always serves on its own,
explicitly named socket.

IPC (one Unix socket, the same peer-uid allow-list for both paths): POST /complete makes one
paid call; POST /remaining is read-only (shared lock, no file created or written, the key never
read) and answers what is left of today's pot and call count, the concurrency, the largest
enabled reservation and the enabled models, so the app can refuse a debate before it starts. It
reads the state at most once per REMAINING_MIN_SECONDS (answers in between reuse that read), so
peers asking in a loop cannot starve the exclusive lock that reservations and halts need.

Stopping and restarting serve: SIGTERM (systemctl stop) closes the socket at once, reserves
nothing more, lets the calls already in flight finish and settle (a reply that cannot be written
within DRAIN_REPLY_SECONDS halts, as any lost reply does), removes the socket file and exits 0.
If serve dies without
that (SIGKILL, a crash), the next serve start removes the left-over socket file only when it is
provably stale: a socket owned by root, in a root-owned folder no one else can write, that no
process is listening on (a connect is refused). Anything else at that path refuses serve start.

Provably unsent calls (by design): if the TCP connect or the TLS handshake fails before any request
byte is written, nothing billable reached the provider. That call's hold is released and only it
fails; the gate does not halt. UNSENT_HALT_STREAK such failures in a row (kept in the control
file, so a restart does not reset them) halt with provider_unreachable. Any settled reply or an
activation resets the streak. Anything after the connect stays uncertain and halts as before,
with one exception (owner ruling 5, 2026-10-10): a reply the profile's unbilled_refusal proves
unbilled (DeepInfra: a 429 with an error and no usage, choices or estimated_cost anywhere) is
handled exactly like a provably unsent call. The caller sees PROVIDER_NOT_REACHED or
PROVIDER_REFUSED_UNBILLED for these two (nothing billed, hold released); every other refusal
outside the three pot codes is the opaque PREVIEW_TEST_AUTHORITY_STOPPED.

Day boundary (by design): a call is charged to the Bucharest day on which it was reserved, even
when it settles after midnight. So the real upstream charges made within one calendar day can
exceed daily_budget_usd by up to max_concurrent_calls x the largest enabled reservation (at most
the profile's per_call_cap_usd each): calls reserved just before midnight are paid just after it, while
the new day's pot is already open. A probe runs beside serve, so for its one call up to
max_concurrent_calls + 1 calls may be in flight; the pot itself is still checked under the lock.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import signal
import socket
import stat
import struct
import sys
import threading
import time
import types
from datetime import datetime, timedelta, timezone
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
GO_SCHEMA = 'preview-provider-budget-go-v3'
CONTROL_SCHEMA = 'preview-provider-budget-control-v3'
DAY_SCHEMA = 'preview-provider-budget-day-v3'
RESERVATION_OVERHEAD_BYTES = 2048  # Bytes the provider may add around the request (the app reserves the same).
# Outer bounds on what a profile may declare as its own per-call cap and request size (DeepInfra:
# $0.25 and 256 KiB). A unit test pins every reviewed row under its profile's cap.
MAX_PROFILE_CALL_CAP_USD = Decimal('1.00')
MAX_PROFILE_REQUEST_BYTES = 1024 * 1024
MAX_PRICE_USD_PER_M = Decimal('10.00')  # A price above this is a typo, not a preview model.
MAX_OUTPUT_BOUND = 1048576
MODEL_ID_PATTERN = re.compile(r'([A-Za-z0-9][A-Za-z0-9._-]{0,63}/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}')
MAX_REMAINING_IPC_BYTES = 4096
# A caller's hold above the gate's own figure: plain decimal text, at most 9 decimals (nano-USD).
CLIENT_RESERVATION_PATTERN = re.compile(r'(0|[1-9][0-9]{0,2})\.[0-9]{1,9}')
REMAINING_MIN_SECONDS = 1.0  # /remaining reads the state at most this often (see RemainingAnswers).
TEAM_DAY_ZONE = 'Europe/Bucharest'
CONTROL_NAME = 'team-control.json'
LOCK_NAME = 'team.lock'
SERVE_LOCK_NAME = 'team-serve.lock'
CONTROL_BYTES = 1024 * 1024
MAX_HALT_EVENTS = 2048  # About 0.6 MiB at most, so a halt always fits the control file.
DAY_LEDGER_BYTES = 16 * 1024 * 1024
DAY_LEDGER_RESERVE_BYTES = 15 * 1024 * 1024  # Headroom so in-flight settlements always fit.
LOCK_TIMEOUT_SECONDS = 10
SLOT_WAIT_SECONDS = 60
# From acceptance, slot wait + reservation lock + upstream call share this deadline; after it a
# settlement lock wait and a fallback halt lock wait (2 x 10 s) and the reply still fit inside the
# caller's 630 s timeout (preview-test.ts: PREVIEW_GLM_DEADLINE_MS + 30 s).
CALL_DEADLINE_SECONDS = 600
REPLY_TIMEOUT_SECONDS = 630
DRAIN_REPLY_SECONDS = 30  # Once stopping (or tripped), a reply must be taken this fast or the gate halts.
STOP_SIGNALS = (signal.SIGTERM, signal.SIGINT)
SERVE_POLL_SECONDS = 0.5  # How often the accept loop checks for a stop (bounds the stop's first step).
MAX_IPC_BYTES = 1024 * 1024
IPC_READ_TIMEOUT_SECONDS = 10  # Each header or body read on the 0666 socket.
MAX_IPC_CONNECTIONS = 32  # Connections beyond this are closed unread, without a thread.
UNSENT_HALT_STREAK = 5  # Provably unsent calls in a row before the gate halts (provider_unreachable).
STOPPED = 'PREVIEW_TEST_AUTHORITY_STOPPED'
# Codes the caller may see. The last two mean this call's hold is already released and nothing was
# billed (not reached; an unbilled refusal), so the app may treat them as a transient failure.
PUBLIC_REFUSALS = frozenset({'TEAM_DAILY_BUDGET_REACHED', 'DAILY_CALL_LIMIT_REACHED', 'CONCURRENCY_LIMIT_REACHED',
                             'PROVIDER_NOT_REACHED', 'PROVIDER_REFUSED_UNBILLED'})
GO_REQUIRED = frozenset({'schema', 'allow_paid_calls', 'bridge_sha256', 'helper_sha256', 'provider', 'enabled_models',
                         'scope_id', 'target_host', 'allowed_peer_uids', 'daily_budget_usd', 'max_paid_posts_per_day',
                         'max_concurrent_calls', 'open_days'})
GO_OPTIONAL = frozenset({'predecessor_ledger_sha256'})
DAY_PATTERN = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')
SOCKET_PATTERN = re.compile(r'/run/debateai-v3-preview/[a-z0-9-]+\.sock')
# v1's and v2's names: a client still configured for an older gate must never reach this one.
RETIRED_SOCKET_NAMES = frozenset({'provider-budget.sock', 'team-budget-v2.sock'})
STALE_PROBE_SECONDS = 2
CALL_ENTRY_PREFIX = 'preview-test:'
PROBE_ENTRY_PREFIX = 'preview-probe:'
PROBE_LOCK_NAME = 'team-probe.lock'  # Held by a running probe; serve start and reservations check it.
PROBE_EXCERPT_CHARS = 80
ENTRY_STATES = ('pending', 'settled', 'uncertain')


def sha_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def sha(path):
    return sha_bytes(Path(path).read_bytes())


class SafetyError(Exception):
    """A refusal with a fixed code. The gate hands this class to the helper it runs, so both raise it."""


BRIDGE_PATH = Path(__file__).resolve()
HELPER_PATH = BRIDGE_PATH.parent / 'preview_budget_helper.py'
BRIDGE_SHA256 = sha(BRIDGE_PATH)
helper = HELPER_SHA256 = None  # Set by load_helper, which main() runs before any phase.
_emit_lock = threading.Lock()


def _custody_ok(info, kind, owner_uid):
    if not kind(info.st_mode) or info.st_uid != owner_uid or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        raise SafetyError('HELPER_CUSTODY_INVALID')


def read_helper_in_custody(owner_uid=0):
    """The helper's bytes, read once from a checked descriptor. The gate's directory, the gate file
    and the helper must be owned by root (owner_uid), writable by no one else, and not symlinks."""
    try:
        dir_fd = os.open(HELPER_PATH.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise SafetyError('HELPER_CUSTODY_INVALID') from None
    try:
        _custody_ok(os.fstat(dir_fd), stat.S_ISDIR, owner_uid)
        _custody_ok(os.stat(BRIDGE_PATH.name, dir_fd=dir_fd, follow_symlinks=False), stat.S_ISREG, owner_uid)
        with os.fdopen(os.open(HELPER_PATH.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=dir_fd), 'rb') as stream:
            _custody_ok(os.fstat(stream.fileno()), stat.S_ISREG, owner_uid)
            return stream.read()
    except OSError:
        raise SafetyError('HELPER_CUSTODY_INVALID') from None
    finally:
        os.close(dir_fd)


def load_helper(expected_sha256=None, *, skip_custody_for_tests=False):
    """Run the helper once per process, from exactly the bytes that were checked.

    Custody comes first (read_helper_in_custody); with a GO in play the bytes must then match its
    helper_sha256 before any of them runs. skip_custody_for_tests is the offline tests' seam (they
    run as the developer, not root); main() never passes it.
    """
    global helper, HELPER_SHA256
    if helper is None:
        source = HELPER_PATH.read_bytes() if skip_custody_for_tests else read_helper_in_custody()
        digest = sha_bytes(source)
        if expected_sha256 is not None and digest != expected_sha256:
            raise SafetyError('ROOT_GO_INVALID')
        module = types.ModuleType('preview_budget_helper')
        module.__file__ = str(HELPER_PATH)
        module.SafetyError = SafetyError
        exec(compile(source, str(HELPER_PATH), 'exec'), module.__dict__)
        helper, HELPER_SHA256 = module, digest
    elif expected_sha256 is not None and HELPER_SHA256 != expected_sha256:
        raise SafetyError('ROOT_GO_INVALID')
    return helper


def go_helper_sha256(path):
    """Only the helper hash a GO binds, read before any helper code runs; load_go validates the rest."""
    try:
        go = json.loads(Path(path).read_bytes())
    except (OSError, ValueError, TypeError):
        raise SafetyError('ROOT_GO_REQUIRED') from None
    value = go.get('helper_sha256') if isinstance(go, dict) else None
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
        raise SafetyError('ROOT_GO_INVALID')
    return value


def emit(value):
    line = json.dumps(value, ensure_ascii=False, default=str) + '\n'
    with _emit_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def log_event(value):
    """Best effort: the ledger is the record, so a broken log stream never costs a settled reply.
    If the reply cannot be delivered either, the IPC handler halts."""
    try:
        emit(value)
    except Exception:  # noqa: BLE001 - logging only
        pass


def iso(moment):
    return moment.astimezone(timezone.utc).isoformat()


def current(now):
    moment = now()
    if not isinstance(moment, datetime) or moment.tzinfo is None:
        raise SafetyError('CLOCK_INVALID')
    return moment


def bucharest_day(moment):
    if moment.tzinfo is None:
        raise SafetyError('CLOCK_INVALID')
    return moment.astimezone(ZoneInfo(TEAM_DAY_ZONE)).date().isoformat()


def _int_in(value, low, high):
    return type(value) is int and low <= value <= high


def reservation_for(request_bytes, row, prices):
    """One call's hold: (request bytes + 2048) x input price + output bound x output price, per
    million tokens, at the given (input, output) prices. The app computes the same figure in nano-USD."""
    input_price, output_price = prices
    return (Decimal(request_bytes + RESERVATION_OVERHEAD_BYTES) * input_price
            + Decimal(row.output_bound) * output_price) / Decimal(1000000)


def worst_case_reservation(profile, row):
    """A full-size request at the highest prices the row can ever reserve at (ceiling_prices):
    one figure for the per-call cap, the activate check and /remaining, whatever the date."""
    return reservation_for(profile.max_request_bytes, row, profile.ceiling_prices(row))


def _price_ok(value):
    return type(value) is Decimal and value.is_finite() and Decimal(0) < value <= MAX_PRICE_USD_PER_M


def prices_ok(prices):
    return isinstance(prices, tuple) and len(prices) == 2 and all(_price_ok(price) for price in prices)


def row_reviewed(profile, model, row):
    """A row the gate will price with: positive ceiling prices under MAX_PRICE_USD_PER_M, a sane
    bound, a known effort rule, a valid path, and a full-size request that reserves no more than
    the profile's per-call cap."""
    return bool(isinstance(model, str) and MODEL_ID_PATTERN.fullmatch(model) and '..' not in model
                and getattr(row, 'model', None) == model and isinstance(row.maker, str) and 1 <= len(row.maker) <= 64
                and prices_ok(profile.ceiling_prices(row)) and helper.path_valid(profile.path_for(row))
                and _int_in(row.output_bound, 1, MAX_OUTPUT_BOUND) and row.effort in ('high', None)
                and type(row.json_object) is bool and worst_case_reservation(profile, row) <= profile.per_call_cap_usd)


def profile_of(provider):
    """The reviewed profile a GO names, or None. Its cap and size must be in bounds and every row
    of it must pass review."""
    profile = helper.PROFILES.get(provider) if isinstance(provider, str) else None
    try:
        reviewed = bool(
            profile is not None and getattr(profile, 'name', None) == provider and profile.rows
            and type(profile.per_call_cap_usd) is Decimal and Decimal(0) < profile.per_call_cap_usd <= MAX_PROFILE_CALL_CAP_USD
            and _int_in(profile.max_request_bytes, 1024, MAX_PROFILE_REQUEST_BYTES)
            and all(row_reviewed(profile, m, r) for m, r in profile.rows.items()))
    except Exception:  # noqa: BLE001 - a profile that cannot even be checked is not reviewed
        reviewed = False
    return profile if reviewed else None


def enabled_models_valid(models, profile):
    return bool(profile is not None and isinstance(models, list) and models
                and all(isinstance(model, str) and model in profile.rows for model in models)
                and len(set(models)) == len(models))


def largest_reservation(profile, models):
    return max(worst_case_reservation(profile, profile.rows[model]) for model in models)


def valid_go(go):
    if not isinstance(go, dict) or not GO_REQUIRED <= set(go) or not set(go) <= GO_REQUIRED | GO_OPTIONAL:
        return False
    budget, uids = go['daily_budget_usd'], go['allowed_peer_uids']
    predecessor = go.get('predecessor_ledger_sha256', '0' * 64)
    profile = profile_of(go['provider'])
    return bool(
        go['schema'] == GO_SCHEMA and go['allow_paid_calls'] is True
        and go['bridge_sha256'] == BRIDGE_SHA256 and go['helper_sha256'] == HELPER_SHA256
        and enabled_models_valid(go['enabled_models'], profile)
        and isinstance(go['scope_id'], str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,95}', go['scope_id'])
        and isinstance(go['target_host'], str) and re.fullmatch(r'[A-Za-z0-9.-]{1,128}', go['target_host'])
        and isinstance(uids, list) and uids and all(type(uid) is int and uid >= 0 for uid in uids)
        and isinstance(budget, str) and re.fullmatch(r'(0|[1-9][0-9]?)\.[0-9]{2}', budget)
        and Decimal('0.01') <= Decimal(budget) <= Decimal('50.00')
        and _int_in(go['max_paid_posts_per_day'], 1, 5000) and _int_in(go['max_concurrent_calls'], 1, 8)
        and _int_in(go['open_days'], 1, 31)
        and isinstance(predecessor, str) and re.fullmatch(r'[0-9a-f]{64}', predecessor))


def load_go(path):
    """Returns the validated GO and the hash of the exact bytes that were validated."""
    try:
        raw = Path(path).read_bytes()
        go = json.loads(raw)
    except (OSError, ValueError, TypeError):
        raise SafetyError('ROOT_GO_REQUIRED') from None
    if not valid_go(go):
        raise SafetyError('ROOT_GO_INVALID')
    return go, sha_bytes(raw)


def read_go(path):
    return load_go(path)[0]


def limits_of(go):
    return {name: go[name] for name in ('daily_budget_usd', 'max_paid_posts_per_day', 'max_concurrent_calls', 'open_days')}


def day_ledger_name(day):
    if not isinstance(day, str) or not DAY_PATTERN.fullmatch(day):
        raise SafetyError('LEDGER_DAY_INVALID')
    return 'team-ledger-' + day + '.json'


def day_spend(ledger):
    """Held amounts of every entry reserved on this day: pending, settled and uncertain."""
    total = Decimal(0)
    for entry in ledger['entries'].values():
        held = helper.decimal_amount(entry.get('held_usd')) if isinstance(entry, dict) else None
        reserved = helper.decimal_amount(entry.get('reserved_usd')) if isinstance(entry, dict) else None
        if held is None or reserved is None or entry.get('state') not in ENTRY_STATES:
            raise SafetyError('LEDGER_ENTRY_INVALID')
        if entry['state'] != 'settled' and held < reserved:
            raise SafetyError('LEDGER_ENTRY_UNDER_RESERVED')
        total += held
    return total


def validate_control(control):
    # Only the shape of provider and enabled_models: a later code change that drops a row must never
    # make the state unreadable, or stop and status (the emergency switch) would refuse too. The
    # GO check, run before every paid call, is where rows are judged.
    in_flight = control.get('in_flight') if isinstance(control, dict) else None
    models = control.get('enabled_models') if isinstance(control, dict) else None
    if not (isinstance(control, dict) and control.get('schema') == CONTROL_SCHEMA
            and isinstance(control.get('provider'), str) and isinstance(models, list) and models
            and all(isinstance(model, str) for model in models)
            and control.get('state') in ('initialized', 'active', 'halted') and isinstance(control.get('limits'), dict)
            and isinstance(in_flight, dict) and all(isinstance(k, str) and isinstance(v, str) and DAY_PATTERN.fullmatch(v)
                                                    for k, v in in_flight.items())):
        raise SafetyError('CONTROL_INVALID')
    return control


class TeamStore:
    """Owner-only state in the 0700 private directory: one control file plus one ledger per team day.

    A blocking lock with a short timeout guards every read-modify-write. It is never held
    while an upstream call runs.
    """

    def __init__(self, private, lock_timeout=None, shared=False, create=False):
        lock_timeout = LOCK_TIMEOUT_SECONDS if lock_timeout is None else lock_timeout
        self.private, self.lock_timeout, self.shared, self.create = Path(private), lock_timeout, shared, create
        self.dir_fd = self.lock_fd = None

    def __enter__(self):
        self.dir_fd = helper.private_dir_fd(self.private)
        try:
            if not self.create and not helper.file_exists(self.dir_fd, LOCK_NAME):
                raise SafetyError('STATE_MISSING')
            self.lock_fd = helper.secure_open(self.dir_fd, LOCK_NAME, os.O_RDONLY if self.shared else os.O_RDWR,
                                              create=self.create)
            helper.lock(self.lock_fd, fcntl.LOCK_SH if self.shared else fcntl.LOCK_EX, self.lock_timeout)
            return self
        except BaseException:
            self.__exit__()
            raise

    def __exit__(self, *_args):
        for name in ('lock_fd', 'dir_fd'):
            fd = getattr(self, name)
            if fd is not None:
                os.close(fd)
                setattr(self, name, None)

    def has_control(self):
        return helper.file_exists(self.dir_fd, CONTROL_NAME)

    def control(self):
        if not self.has_control():
            raise SafetyError('STATE_MISSING')
        return validate_control(helper.read_json(self.dir_fd, CONTROL_NAME, CONTROL_BYTES))

    def save_control(self, control):
        helper.write_json(self.dir_fd, CONTROL_NAME, validate_control(control), CONTROL_BYTES)

    def ledger(self, day):
        name = day_ledger_name(day)
        if not helper.file_exists(self.dir_fd, name):
            return {'schema': DAY_SCHEMA, 'day': day, 'zone': TEAM_DAY_ZONE, 'entries': {}}
        ledger = helper.read_json(self.dir_fd, name, DAY_LEDGER_BYTES)
        if not isinstance(ledger, dict) or ledger.get('schema') != DAY_SCHEMA or ledger.get('day') != day \
                or not isinstance(ledger.get('entries'), dict):
            raise SafetyError('LEDGER_INVALID')
        day_spend(ledger)
        return ledger

    def save_ledger(self, ledger, data=None):
        data = helper.encode_json(ledger) if data is None else data
        if len(data) > DAY_LEDGER_BYTES:
            raise SafetyError('DAY_LEDGER_FULL')
        helper.write_bytes(self.dir_fd, day_ledger_name(ledger['day']), data)


def _halt(control, reason, moment, entry_id=None):
    # The first reason stands while halted; every halt is also appended to the history, which
    # re-activation keeps. Past the bound only a count grows, so a halt never fails for room.
    if control['state'] != 'halted':
        control.update(state='halted', reason=reason, halted_at=iso(moment))
    halts = control.setdefault('halts', [])
    if len(halts) < MAX_HALT_EVENTS:
        halts.append({'reason': reason, 'at': iso(moment), **({} if entry_id is None else {'entry_id': entry_id})})
    else:
        control['halts_dropped'] = control.get('halts_dropped', 0) + 1


def spend_by_model(ledger):
    """Today's held amount and call count per model (every entry records its model)."""
    totals = {}
    for entry in ledger['entries'].values():
        model = entry.get('model') if isinstance(entry.get('model'), str) else 'unknown'
        spend, posts = totals.get(model, (Decimal(0), 0))
        totals[model] = (spend + helper.decimal_amount(entry['held_usd']), posts + 1)
    return {model: {'spend_usd': format(spend, 'f'), 'posts': posts} for model, (spend, posts) in sorted(totals.items())}


def window_open(control, moment):
    return control['state'] == 'active' and moment < datetime.fromisoformat(control['open_until_utc'])


def day_summary(control, ledger, moment):
    budget, spend = Decimal(control['limits']['daily_budget_usd']), day_spend(ledger)
    open_until = control.get('open_until_utc')
    return {'state': control['state'], 'reason': control['reason'], 'halted_at': control.get('halted_at'),
            'provider': control['provider'], 'enabled_models': control['enabled_models'],
            'unsent_streak': control.get('unsent_streak', 0), 'open_until_utc': open_until,
            'window_open': window_open(control, moment),
            'today': ledger['day'], 'daily_budget_usd': control['limits']['daily_budget_usd'],
            'today_spend_usd': format(spend, 'f'), 'remaining_today_usd': format(max(Decimal(0), budget - spend), 'f'),
            'today_posts': len(ledger['entries']), 'max_paid_posts_per_day': control['limits']['max_paid_posts_per_day'],
            'in_flight': len(control['in_flight']),
            'today_uncertain': sum(1 for entry in ledger['entries'].values() if entry['state'] == 'uncertain'),
            'today_by_model': spend_by_model(ledger),
            'halts': control.get('halts', []), 'halts_dropped': control.get('halts_dropped', 0)}


def init_state(private, go_path, now=None):
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    with TeamStore(private, create=True) as store:
        if store.has_control():
            raise SafetyError('STATE_ALREADY_EXISTS')
        control = {'schema': CONTROL_SCHEMA, 'scope_id': go['scope_id'], 'target_host': go['target_host'],
                   'provider': go['provider'], 'enabled_models': go['enabled_models'], 'state': 'initialized', 'reason': None, 'go_sha256': go_sha, 'limits': limits_of(go),
                   'predecessor_ledger_sha256': go.get('predecessor_ledger_sha256'),
                   'initialized_at': iso(current(now)), 'activated_at': None, 'active_host': None,
                   'open_until_utc': None, 'halted_at': None, 'activations': 0, 'in_flight': {},
                   'halts': [], 'halts_dropped': 0}
        store.save_control(control)
    return {'state': 'initialized', 'scope_id': go['scope_id'], 'target_host': go['target_host'],
            'provider': go['provider'], 'enabled_models': go['enabled_models'], 'go_sha256': go_sha, 'predecessor_ledger_sha256': control['predecessor_ledger_sha256']}


def activate(private, go_path, host=None, platform=None, now=None):
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host']:
        raise SafetyError('ACTIVATION_REFUSED')
    # Every slot holding the largest enabled worst case at once must still fit the day's pot.
    profile = profile_of(go['provider'])
    if go['max_concurrent_calls'] * largest_reservation(profile, go['enabled_models']) > Decimal(go['daily_budget_usd']):
        raise SafetyError('CONCURRENCY_EXCEEDS_BUDGET')
    with TeamStore(private) as store:
        control = store.control()
        if control['state'] not in ('initialized', 'halted') or control['scope_id'] != go['scope_id'] \
                or control['provider'] != go['provider']:
            raise SafetyError('ACTIVATION_REFUSED')
        moment = current(now)
        control.update(state='active', last_halt_reason=control['reason'], reason=None, go_sha256=go_sha,
                       enabled_models=go['enabled_models'],
                       limits=limits_of(go), target_host=go['target_host'], active_host=host,
                       activated_at=iso(moment), open_until_utc=iso(moment + timedelta(days=go['open_days'])),
                       activations=control['activations'] + 1, unsent_streak=0)
        store.save_control(control)
        return day_summary(control, store.ledger(bucharest_day(moment)), moment)


def halt(private, reason, now=None, entry_id=None):
    now = now or helper.utc_now
    with TeamStore(private) as store:
        control = store.control()
        _halt(control, reason, current(now), entry_id)
        store.save_control(control)
        return {'state': control['state'], 'reason': control['reason'], 'halted_at': control['halted_at']}


def stop_authority(private, now=None):
    return halt(private, 'operator_stop', now)


def status(private, now=None):
    """Read-only: shared lock, no file is created or written."""
    now = now or helper.utc_now
    with TeamStore(private, shared=True) as store:
        control = store.control()
        moment = current(now)
        return day_summary(control, store.ledger(bucharest_day(moment)), moment)


def validate_request(input, go, probe=False, moment=None):
    """The exact outgoing bytes, the reservation, the model row and the reservation prices of one
    request, or a refusal.

    Pure: no state, no key. The model is looked up first: a model that is not a reviewed row of the
    GO's profile, or (outside a probe) not in the GO's enabled_models, is refused here, so before
    any reservation or key read. Then the row's own request rules (effort, JSON mode, max_tokens
    bound) and the reservation at the profile's prices for this moment (never above the row's
    ceiling). The caller's figure must equal it, or exceed it by no more than the same request at
    the row's ceiling prices (then the caller's figure is held).
    """
    profile = profile_of(go['provider'])
    if profile is None:
        raise SafetyError('ROOT_GO_INVALID')
    if not isinstance(input, dict) or set(input) != {'scope_id', 'operationId', 'requestBody', 'requestSha256', 'reservedUsd'} \
            or input['scope_id'] != go['scope_id'] or not isinstance(input['operationId'], str) \
            or not re.fullmatch(r'[A-Za-z0-9-]{1,96}', input['operationId']) or not isinstance(input['requestBody'], str) \
            or len(input['requestBody'].encode()) > profile.max_request_bytes \
            or hashlib.sha256(input['requestBody'].encode()).hexdigest() != input['requestSha256']:
        raise SafetyError('REQUEST_SCOPE_INVALID')
    try:
        body = json.loads(input['requestBody'])
    except ValueError:
        raise SafetyError('REQUEST_INVALID') from None
    model = profile.requested_model(body)
    if not isinstance(model, str):
        raise SafetyError('REQUEST_PARAMETERS_INVALID')
    row = profile.rows.get(model)
    if row is None or not (probe or model in go['enabled_models']):
        raise SafetyError('MODEL_NOT_ALLOWED')
    if not profile.body_valid(body, row):
        raise SafetyError('REQUEST_PARAMETERS_INVALID')
    raw = input['requestBody'].encode()
    # The exact bytes that will go upstream, fixed before any reservation: a body that cannot be
    # encoded (a lone UTF-16 surrogate) is refused here, never after the connection opens. The
    # reservation prices len(raw), so the bytes sent may never be longer than that.
    try:
        outgoing = profile.request_bytes(body)
    except (UnicodeError, ValueError, TypeError):
        raise SafetyError('REQUEST_INVALID') from None
    if not isinstance(outgoing, bytes) or len(outgoing) > len(raw):
        raise SafetyError('REQUEST_INVALID')
    prices, ceiling = profile.reservation_prices(row, moment or helper.utc_now()), profile.ceiling_prices(row)
    if not prices_ok(prices) or prices[0] > ceiling[0] or prices[1] > ceiling[1] \
            or not helper.path_valid(profile.path_for(row)):
        raise SafetyError('REQUEST_INVALID')  # Cannot happen for a reviewed profile; checked anyway.
    reserved = reservation_for(len(raw), row, prices)
    if reserved > profile.per_call_cap_usd:
        raise SafetyError('REQUEST_INVALID')  # Cannot happen for a reviewed row; checked anyway.
    # The caller's hold must be at least the gate's own figure and at most this request's figure at
    # the row's ceiling prices; the gate then holds the caller's figure. For a provider whose prices
    # never change by date the two figures are equal, so this stays exact equality in practice. For
    # dated prices it lets the app reserve a little ahead (Google: the next days' prices), so a few
    # milliseconds between the app's clock and the gate's at a price step never refuse a call.
    claimed = helper.decimal_amount(input['reservedUsd'])
    if claimed != reserved:
        ceiling = reservation_for(len(raw), row, profile.ceiling_prices(row))
        text = input['reservedUsd']
        if claimed is None or not (reserved < claimed <= ceiling) or not isinstance(text, str) \
                or not CLIENT_RESERVATION_PATTERN.fullmatch(text):
            raise SafetyError('RESERVATION_MISMATCH')
        reserved = claimed
    return outgoing, reserved, row, prices


def probe_running(store):
    """Whether a probe process holds the probe lock right now (a non-blocking try; never waits)."""
    if not helper.file_exists(store.dir_fd, PROBE_LOCK_NAME):
        return False
    fd = helper.secure_open(store.dir_fd, PROBE_LOCK_NAME, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    finally:
        os.close(fd)
    return False


def entry_id_of(go, input, probe=False):
    # A probe's entries have their own prefix, which no IPC operationId can produce.
    return (PROBE_ENTRY_PREFIX if probe else CALL_ENTRY_PREFIX) + go['scope_id'] + ':' + input['operationId']


def reserve_call(private, go, go_sha, input, reserved, row, host, peer_uid, now, probe=False, prices=None):
    """Lock, check state and today's team limits, durably write the pending hold, unlock."""
    prices = (row.input_usd_per_m, row.output_usd_per_m) if prices is None else prices
    with TeamStore(private) as store:
        control = store.control()
        if control['state'] != 'active' or control['go_sha256'] != go_sha or control['active_host'] != host \
                or control['scope_id'] != go['scope_id']:
            raise SafetyError('AUTHORITY_STOPPED')
        moment = current(now)
        # A probe id still in flight while no probe holds the probe lock: that probe died or could
        # not settle, so its hold may be paid and unrecorded. Halt, as serve start does for a crash.
        probes = sorted(i for i in control['in_flight'] if i.startswith(PROBE_ENTRY_PREFIX))
        if probes and not probe_running(store):
            _halt(control, 'interrupted_probe', moment, probes[0])
            store.save_control(control)
            raise SafetyError('AUTHORITY_STOPPED')
        if moment >= datetime.fromisoformat(control['open_until_utc']):
            _halt(control, 'open_window_expired', moment)
            store.save_control(control)
            raise SafetyError('AUTHORITY_EXPIRED')
        day = bucharest_day(moment)
        ledger = store.ledger(day)
        entry_id = entry_id_of(go, input, probe)
        if entry_id in ledger['entries'] or entry_id in control['in_flight']:
            raise SafetyError('DUPLICATE_OPERATION')
        if len(ledger['entries']) >= go['max_paid_posts_per_day']:
            raise SafetyError('DAILY_CALL_LIMIT_REACHED')
        if day_spend(ledger) + reserved > Decimal(go['daily_budget_usd']):
            raise SafetyError('TEAM_DAILY_BUDGET_REACHED')
        # The entry records what this call was priced as: identity checks and settlement use it.
        ledger['entries'][entry_id] = {'state': 'pending', 'reserved_usd': str(reserved), 'held_usd': str(reserved),
                                       'reserved_at': iso(moment), 'request_sha256': input['requestSha256'],
                                       'provider': go['provider'], 'model': row.model, 'maker': row.maker,
                                       'reserve_input_usd_per_m': str(prices[0]), 'reserve_output_usd_per_m': str(prices[1]),
                                       'output_bound': row.output_bound,
                                       'requested_effort': row.effort or 'none', 'peer_uid': peer_uid,
                                       **({'probe': True} if probe else {})}
        data = helper.encode_json(ledger)
        if len(data) > DAY_LEDGER_RESERVE_BYTES:
            raise SafetyError('DAY_LEDGER_FULL')
        # In-flight first: a crash before the ledger write leaves an id recovery drops as never dispatched.
        control['in_flight'][entry_id] = day
        store.save_control(control)
        try:
            store.save_ledger(ledger, data)
        except BaseException:
            control['in_flight'].pop(entry_id, None)
            try:
                store.save_control(control)
            except BaseException:
                pass
            raise
        return entry_id, day


def record_settlement(private, entry_id, day, changes, halt_reason, budget, now):
    """Lock, settle the entry on its reservation day (or halt), unlock.

    A halt reaches the control file before the ledger entry it explains, and the in-flight id is
    cleared last: a process that dies between any two writes leaves the id in flight, and the
    next serve start halts on it.
    """
    with TeamStore(private) as store:
        control = store.control()
        moment = current(now)
        ledger = store.ledger(day)
        entry = ledger['entries'].get(entry_id)
        if entry is None or entry['state'] != 'pending':
            _halt(control, 'settlement_state_invalid', moment, entry_id)
            store.save_control(control)
            raise SafetyError('SETTLEMENT_STATE_INVALID')
        entry.update(changes, reconciled_at=iso(moment))
        if entry['state'] == 'settled':
            control['unsent_streak'] = 0  # The provider answered with accountable usage.
        if halt_reason is None and day_spend(ledger) > budget:
            halt_reason = 'charge_overrun'
        if halt_reason is not None:
            _halt(control, halt_reason, moment, entry_id)
            store.save_control(control)
        store.save_ledger(ledger)
        control['in_flight'].pop(entry_id, None)
        store.save_control(control)
        return {'authority': control['state'], 'day_held_usd': str(day_spend(ledger))}


class CallNotSent(SafetyError):
    """This call failed before any request byte was written, and its hold was released. The IPC
    handler does not halt for it: nothing paid can have been lost."""


class UnbilledRefusal(Exception):
    """The provider answered with a refusal its profile proves unbilled: handled as not sent."""


def release_unsent(private, entry_id, day, now):
    """Lock, count one provably unsent call (halting at UNSENT_HALT_STREAK in a row), drop its
    pending hold from the day ledger, clear it from in flight, unlock.

    Write order as for a settlement: the control file (streak, and any halt) first, then the
    ledger, then in flight is cleared. Dying after the first write leaves a pending entry in flight
    (serve start halts on it: fail closed); after the second, an in-flight id without an entry,
    which serve start drops as never dispatched.
    """
    with TeamStore(private) as store:
        control = store.control()
        moment = current(now)
        ledger = store.ledger(day)
        entry = ledger['entries'].get(entry_id)
        if entry is None or entry['state'] != 'pending' or control['in_flight'].get(entry_id) != day:
            raise SafetyError('SETTLEMENT_STATE_INVALID')
        streak = control.get('unsent_streak', 0) + 1
        control['unsent_streak'] = streak
        if streak >= UNSENT_HALT_STREAK:
            _halt(control, 'provider_unreachable', moment, entry_id)
        store.save_control(control)
        del ledger['entries'][entry_id]
        store.save_ledger(ledger)
        control['in_flight'].pop(entry_id, None)
        store.save_control(control)
        return {'authority': control['state'], 'unsent_streak': streak}


def settle_or_halt(private, entry_id, day, changes, halt_reason, budget, now, slots):
    try:
        return record_settlement(private, entry_id, day, changes, halt_reason, budget, now)
    except BaseException:
        # The pending hold stays in the ledger and in flight; serve start turns it uncertain.
        # This server reserves nothing more, even when the halt below cannot be written either.
        slots.trip()
        try:
            halt(private, 'settlement_failure', now=now, entry_id=entry_id)
        except BaseException:
            pass
        raise SafetyError('SETTLEMENT_FAILED') from None


def bounded_accounting(accounting):
    # Every stored amount stays short, so settlements always fit the day ledger's headroom.
    if any(isinstance(value, str) and len(value) > 64 for name, value in accounting.items() if name != 'cost_basis'):
        return {'usage_valid': False, 'oversized_accounting': True, 'guard_charge_usd': None}
    return accounting


class CallSlots:
    """One server's call slots, plus its trip: after a failed settlement or a failed halt this
    process reserves nothing more until it is restarted (restart recovery then halts on the
    interrupted entry)."""

    def __init__(self, limit):
        self.limit = limit
        self._semaphore = threading.BoundedSemaphore(limit)
        self.tripped = False

    def trip(self):
        self.tripped = True

    def acquire(self, wait):
        return self._semaphore.acquire(timeout=wait)

    def release(self):
        self._semaphore.release()


def execute_request(private, go_path, input, *, peer_uid, slots, dispatch=None, key_loader=None, host=None,
                    platform=None, now=None, slot_wait=SLOT_WAIT_SECONDS, cancelled=None, on_reserved=None,
                    probe=False, on_settled=None):
    """One paid call. probe is only ever passed by probe() (root, checked there): it allows a
    reviewed model the GO does not enable and root as the caller; everything else is the same."""
    accepted = time.monotonic()
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    profile = profile_of(go['provider'])
    # The moment this call is priced: its reservation AND its settlement use this moment's prices,
    # so a call that runs past a dated price step settles at the prices it was reserved at.
    priced_at = current(now)
    outgoing, reserved, row, prices = validate_request(input, go, probe=probe, moment=priced_at)
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host'] or type(peer_uid) is not int \
            or not (peer_uid in go['allowed_peer_uids'] or probe and peer_uid == 0):
        raise SafetyError('EXECUTION_AUTHORITY_REFUSED')
    if slots.limit != go['max_concurrent_calls']:
        raise SafetyError('SERVE_RESTART_REQUIRED')
    if not slots.acquire(slot_wait):
        raise SafetyError('CONCURRENCY_LIMIT_REACHED')
    try:
        if cancelled is not None and cancelled():
            raise SafetyError('CALLER_CANCELED_BEFORE_DISPATCH')
        key = (key_loader or helper.read_key)(private)
        if slots.tripped:
            raise SafetyError('AUTHORITY_STOPPED')
        entry_id, day = reserve_call(private, go, go_sha, input, reserved, row, host, peer_uid, now, probe, prices)
        if on_reserved is not None:
            on_reserved(entry_id)
        budget, started = Decimal(go['daily_budget_usd']), time.monotonic()
        event = {'event': 'preview_provider_paid_post', 'operation_id': input['operationId'], 'day': day}
        try:
            # The upstream timeout is what remains after the slot wait and the reservation lock.
            send = dispatch or helper.HttpsTransport(timeout=max(1.0, CALL_DEADLINE_SECONDS - (time.monotonic() - accepted)),
                                                     profile=profile, path=profile.path_for(row))
            status, raw_response = send(outgoing, key)
            raw_response = raw_response if isinstance(raw_response, dict) else {}
            # Owner ruling 5 (2026-10-10): a refusal the profile proves unbilled (DeepInfra: a 429
            # with an error and no usage, choices or cost anywhere) counts as not sent. It is judged
            # on the RAW reply: redaction drops whole subtrees (headers, secrets), which could hide a
            # billing field. A hook that fails lands in the uncertain branch below, as any doubt does.
            unbilled = profile.unbilled_refusal(status, raw_response)
            response = helper.redact(raw_response, key, profile.redaction_patterns)
            if unbilled:
                raise UnbilledRefusal()
        except (helper.RequestNotSent, UnbilledRefusal) as unsent:
            try:
                outcome = release_unsent(private, entry_id, day, now)
            except BaseException:
                # The hold could not be released: treat it exactly like an uncertain call.
                outcome = settle_or_halt(private, entry_id, day, {
                    'state': 'uncertain', 'held_usd': str(reserved), 'reason': 'release_failure',
                    'elapsed_seconds': round(time.monotonic() - started, 6)}, 'uncertain_charge', budget, now, slots)
                log_event({**event, 'status': 'uncertain', **outcome})
                raise SafetyError('NEW_CHARGE_UNCERTAIN') from None
            refused = isinstance(unsent, UnbilledRefusal)
            log_event({**event, 'status': 'not_sent', 'reason': 'unbilled_refusal' if refused else 'not_reached', **outcome})
            raise CallNotSent('PROVIDER_REFUSED_UNBILLED' if refused else 'PROVIDER_NOT_REACHED') from None
        except BaseException as error:
            outcome = settle_or_halt(private, entry_id, day, {
                'state': 'uncertain', 'held_usd': str(reserved), 'reason': 'transport_failure',
                'error_class': type(error).__name__, 'elapsed_seconds': round(time.monotonic() - started, 6)},
                'uncertain_charge', budget, now, slots)
            log_event({**event, 'status': 'uncertain', **outcome})
            raise SafetyError('NEW_CHARGE_UNCERTAIN') from None
        elapsed = round(time.monotonic() - started, 6)
        try:
            changes, halt_reason, charge, reply = assess_reply(status, response, reserved, elapsed, profile, row,
                                                               priced_at)
        except BaseException:
            # Paid but unaccountable: keep the full hold and stop, as for a transport failure.
            changes, halt_reason, charge, reply = ({'state': 'uncertain', 'held_usd': str(reserved),
                                                    'reason': 'accounting_failure', 'elapsed_seconds': elapsed},
                                                   'uncertain_charge', None, None)
        outcome = settle_or_halt(private, entry_id, day, changes, halt_reason, budget, now, slots)
        log_event({**event, 'model': row.model, 'status': changes['state'], 'halt_reason': halt_reason,
                   'guard_charge_usd': charge, 'elapsed_seconds': elapsed, **outcome})
        if on_settled is not None:
            on_settled({'changes': changes, 'halt_reason': halt_reason, 'response': response, 'row': row, **outcome})
        if charge is None:
            raise SafetyError('NEW_CHARGE_UNCERTAIN')
        if halt_reason is not None:
            raise SafetyError('AUTHORITY_HALTED')
        return reply
    finally:
        slots.release()


def bounded_model_name(value):
    """What a reply named as its model, kept short in the ledger (any other value is recorded as None)."""
    return value if isinstance(value, str) and len(value) <= 128 else None


def assess_reply(status, response, reserved, elapsed, profile, row, moment):
    """Ledger changes, halt reason, guard charge and caller reply for one redacted provider reply.
    Settled at the profile's prices for this row at moment, the moment the call was priced (its
    reservation's), recorded in the entry; the reply
    must name this call's own model, not just any reviewed or enabled one."""
    accounting = bounded_accounting(profile.account(response, row, moment))
    charge = accounting.get('guard_charge_usd')
    named = profile.reply_model(response)
    changes = {'accounting': accounting, 'elapsed_seconds': elapsed, 'http_status': status if type(status) is int else None,
               'reply_model': bounded_model_name(named),
               'settle_input_usd_per_m': accounting.get('input_usd_per_m'),
               'settle_output_usd_per_m': accounting.get('output_usd_per_m')}
    if charge is None or accounting.get('usage_valid') is not True:
        # A reported cost alone is not usage: without valid token counts the charge is uncertain.
        # With both, the guard charge is the larger of the token list price and the reported cost.
        changes.update(state='uncertain', held_usd=str(reserved), reason='usage_or_cost_unreported')
        return changes, 'uncertain_charge', None, None
    amount = Decimal(charge)
    changes.update(state='settled', held_usd=str(amount), overrun_usd=str(max(Decimal(0), amount - reserved)))
    if amount > reserved:
        halt_reason = 'charge_overrun'
    elif status != 200 or named != row.model:
        halt_reason = 'provider_error_or_model_identity'
    else:
        halt_reason = None
    # ASCII escapes keep any lone surrogate in a provider reply encodable all the way to the caller.
    return changes, halt_reason, charge, {'status': status, 'body': json.dumps(response, ensure_ascii=True, default=str)}


NANO_USD = Decimal('0.000000001')  # /remaining's amounts: the app parses at most 9 decimals.


def nano_text(amount, rounding):
    """Plain decimal text with at most 9 decimals; only an amount with more is rounded (as told)."""
    if amount.as_tuple().exponent < -9:
        amount = amount.quantize(NANO_USD, rounding=rounding)
    return format(amount, 'f')


def remaining_input_valid(input):
    return isinstance(input, dict) and set(input) == {'scope_id'} and isinstance(input['scope_id'], str)


def remaining_snapshot(private, go_path, slots=None, now=None):
    """(scope_id, allowed peer uids, reply) for POST /remaining: what is left today, read-only
    (shared lock; no file is created or written; the key is never read). The uids are those of the
    GO on disk now (none if it does not load), as /complete re-checks them on every call.

    window_open says whether a call could be reserved right now apart from money and count: the
    state is active, the window has not run out, the GO on disk is the one activated, and this
    server has not stopped reserving (a stop, a trip, or a concurrency change awaiting restart).
    """
    now = now or helper.utc_now
    with TeamStore(private, shared=True) as store:
        control = store.control()
        moment = current(now)
        ledger = store.ledger(bucharest_day(moment))
    try:
        go, go_sha = load_go(go_path)
        go_current, allowed = go_sha == control['go_sha256'], frozenset(go['allowed_peer_uids'])
    except SafetyError:
        go_current, allowed = False, frozenset()
    limits = control['limits']
    serving = slots is None or (not slots.tripped and slots.limit == limits['max_concurrent_calls'])
    # A probe id in flight (running, or left by a probe that died) makes the next reservation wait
    # or halt (interrupted_probe): say the window is shut, so no debate starts into that.
    serving = serving and not any(entry_id.startswith(PROBE_ENTRY_PREFIX) for entry_id in control['in_flight'])
    budget, spend = Decimal(limits['daily_budget_usd']), day_spend(ledger)
    profile = profile_of(control['provider'])
    if profile is None or not all(model in profile.rows for model in control['enabled_models']):
        raise SafetyError('REMAINING_UNAVAILABLE')  # The state names a row this code no longer reviews.
    return control['scope_id'], allowed, {
            'state': control['state'], 'window_open': bool(window_open(control, moment) and go_current and serving),
            # The app reads amounts as exact nano-USD (at most 9 decimals). A provider's reported cost
            # can carry more, so what is left is rounded DOWN and the largest hold UP: never in the
            # app's favour.
            'remaining_usd': nano_text(max(Decimal(0), budget - spend), ROUND_FLOOR),
            'remaining_calls': max(0, limits['max_paid_posts_per_day'] - len(ledger['entries'])),
            'max_concurrent_calls': limits['max_concurrent_calls'],
            'largest_reservation_usd': nano_text(largest_reservation(profile, control['enabled_models']), ROUND_CEILING),
            'enabled_models': list(control['enabled_models'])}


def remaining_answer(snapshot, input, uid):
    scope_id, allowed, reply = snapshot
    if uid is not None and uid not in allowed:
        raise SafetyError('IPC_REQUEST_REFUSED')
    if input['scope_id'] != scope_id:
        raise SafetyError('REMAINING_REQUEST_INVALID')
    return reply


def remaining_report(private, go_path, input, slots=None, now=None, uid=None):
    """One /remaining answer for exactly {"scope_id": <this state's scope>} (and, with uid, a peer
    the GO on disk allows); anything else refuses."""
    if not remaining_input_valid(input):
        raise SafetyError('REMAINING_REQUEST_INVALID')
    return remaining_answer(remaining_snapshot(private, go_path, slots, now), input, uid)


class RemainingAnswers:
    """serve's /remaining: the state is read at most once per REMAINING_MIN_SECONDS, by one thread
    at a time, and every answer in between reuses that read (or its refusal). So a peer asking in a
    loop, even on every connection slot, cannot keep the shared lock held and starve the exclusive
    lock that reservations, settlements and halts need. The input is checked on every request."""

    def __init__(self, private, go_path, slots, min_seconds=None, clock=time.monotonic, now=None):
        self.private, self.go_path, self.slots, self.clock, self.now = private, go_path, slots, clock, now
        self.min_seconds = REMAINING_MIN_SECONDS if min_seconds is None else min_seconds
        self._lock, self._at, self._snapshot = threading.Lock(), None, None

    def __call__(self, input, uid=None):
        if not remaining_input_valid(input):
            raise SafetyError('REMAINING_REQUEST_INVALID')
        with self._lock:
            if self._at is None or self.clock() - self._at >= self.min_seconds:
                try:
                    self._snapshot = remaining_snapshot(self.private, self.go_path, self.slots, self.now)
                except SafetyError:
                    self._snapshot = None
                self._at = self.clock()
            snapshot = self._snapshot
        if snapshot is None:
            raise SafetyError('REMAINING_UNAVAILABLE')
        return remaining_answer(snapshot, input, uid)


def probe_summary(observed, profile):
    """The probe's printout: no key (the reply was redacted with it) and no reply text beyond a
    short, single-line excerpt."""
    response, row, accounting = observed['response'], observed['row'], observed['changes'].get('accounting') or {}
    text = profile.reply_text(response)
    excerpt = re.sub(r'\s+', ' ', text)[:PROBE_EXCERPT_CHARS] if isinstance(text, str) else None
    max_tokens, completion = min(1024, row.output_bound), accounting.get('completion_tokens')
    return {'status': 'probed', 'provider': profile.name, 'model': row.model, 'maker': row.maker,
            'sent': {'max_tokens': max_tokens, 'effort': row.effort or 'none'},
            # A model that bills past max_tokens would overrun its reservation in real use: do not enable it.
            'completion_within_max_tokens': completion <= max_tokens if type(completion) is int else None,
            'http_status': observed['changes'].get('http_status'),
            'model_echoed_exactly': observed['changes'].get('reply_model') == row.model,
            'reply_model': observed['changes'].get('reply_model'),
            'usage': {name: accounting.get(name) for name in ('prompt_tokens', 'completion_tokens', 'total_tokens',
                                                             'reasoning_tokens', 'cached_tokens', 'usage_valid')},
            'guard_charge_usd': accounting.get('guard_charge_usd'),
            'provider_estimated_cost_usd': accounting.get('provider_estimated_cost_usd'),
            'entry_state': observed['changes'].get('state'), 'halt_reason': observed['halt_reason'],
            'authority': observed.get('authority'), 'reply_excerpt': excerpt}


def probe(private, go_path, model, *, dispatch=None, key_loader=None, host=None, platform=None, uid=None, now=None):
    """Root only: one tiny paid call ("Reply exactly: OK") to a reviewed model of the GO's provider,
    even one the GO does not enable yet, through the normal reserve/settle/halt path. It counts in
    today's pot and call count, and a non-200 reply or another model in the reply halts the gate
    like any call. Prints status, whether the reply named the exact model, usage and the charge."""
    go = read_go(go_path)
    host, platform = host or socket.gethostname(), platform or sys.platform
    uid = os.getuid() if uid is None else uid
    if platform != 'linux' or uid != 0 or host != go['target_host']:
        raise SafetyError('ROOT_PROBE_REFUSED')
    profile = profile_of(go['provider'])
    row = profile.rows.get(model) if isinstance(model, str) else None
    if row is None:
        raise SafetyError('MODEL_NOT_REVIEWED')
    raw = json.dumps(profile.probe_body(row), ensure_ascii=False, separators=(',', ':'))
    prices = profile.reservation_prices(row, current(now or helper.utc_now))
    request = {'scope_id': go['scope_id'], 'operationId': 'probe-%x' % time.time_ns(), 'requestBody': raw,
               'requestSha256': hashlib.sha256(raw.encode()).hexdigest(),
               'reservedUsd': str(reservation_for(len(raw.encode()), row, prices))}
    observed = {}
    # Held for the whole probe: serve start refuses while it is held (so a restart cannot turn the
    # probe's call into a recovery halt), and a probe id left in flight without it halts serve's
    # next reservation (a probe that died or could not settle).
    lock_fd = hold_probe_lock(private)
    try:
        execute_request(private, go_path, request, peer_uid=0, slots=CallSlots(go['max_concurrent_calls']),
                        dispatch=dispatch, key_loader=key_loader, host=host, platform=platform, now=now, probe=True,
                        on_settled=observed.update)
    except SafetyError:
        if not observed:
            raise  # Refused, not sent, or uncertain: the refusal code says which.
    finally:
        os.close(lock_fd)
    return probe_summary(observed, profile)


def hold_probe_lock(private):
    dir_fd = helper.private_dir_fd(private)
    try:
        fd = helper.secure_open(dir_fd, PROBE_LOCK_NAME, os.O_RDWR, create=True)
    finally:
        os.close(dir_fd)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise SafetyError('PROBE_ALREADY_RUNNING') from None
    return fd


def recover_interrupted(private, now=None):
    """Serve start only (one server per state).

    Every id still in flight was interrupted. If its entry reached the ledger, its charge, its
    halt or its reply may be lost whatever state the entry shows, so the gate halts; a pending
    entry becomes uncertain. An id without an entry was never dispatched and is dropped. An
    uncertain entry that no recorded halt names (on today's or an in-flight day's ledger) also
    halts. The halt is written first, so dying here repeats the recovery.
    """
    now = now or helper.utc_now
    with TeamStore(private) as store:
        if probe_running(store):
            raise SafetyError('PROBE_RUNNING')  # Its call is live, not interrupted; systemd retries the start.
        control = store.control()
        moment, in_flight = current(now), control['in_flight']
        ledgers = {day: store.ledger(day) for day in sorted(set(in_flight.values()) | {bucharest_day(moment)})}
        named = {event.get('entry_id') for event in control.get('halts', [])}
        interrupted = [(entry_id, day) for entry_id, day in sorted(in_flight.items()) if entry_id in ledgers[day]['entries']]
        unrecorded = [entry_id for ledger in ledgers.values() for entry_id, entry in sorted(ledger['entries'].items())
                      if entry['state'] == 'uncertain' and entry_id not in named and entry_id not in in_flight]
        if not in_flight and not unrecorded:
            return {'interrupted': 0, 'unrecorded_uncertain': 0}
        for entry_id, day in interrupted:
            pending = ledgers[day]['entries'][entry_id]['state'] == 'pending'
            _halt(control, 'interrupted_call_uncertain' if pending else 'interrupted_after_settlement', moment, entry_id)
        for entry_id in unrecorded:
            _halt(control, 'uncertain_entry_unrecorded', moment, entry_id)
        if interrupted or unrecorded:
            store.save_control(control)
        touched = set()
        for entry_id, day in interrupted:
            entry = ledgers[day]['entries'][entry_id]
            if entry['state'] == 'pending':
                entry.update(state='uncertain', held_usd=entry['reserved_usd'], reason='interrupted_before_reconciliation',
                             reconciled_at=iso(moment))
                touched.add(day)
        for day in sorted(touched):
            store.save_ledger(ledgers[day])
        control['in_flight'] = {}
        store.save_control(control)
        return {'interrupted': len(interrupted), 'unrecorded_uncertain': len(unrecorded)}


def hold_serve_lock(private):
    dir_fd = helper.private_dir_fd(private)
    try:
        fd = helper.secure_open(dir_fd, SERVE_LOCK_NAME, os.O_RDWR, create=True)
    finally:
        os.close(dir_fd)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise SafetyError('SERVE_ALREADY_RUNNING') from None
    return fd


def linux_peer_uid(connection):
    return struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]


def caller_canceled(connection):
    # Timeout-mode recv waits for readiness even with MSG_DONTWAIT. Check
    # cancellation in nonblocking mode, then restore the reply timeout.
    connection.setblocking(False)
    try:
        return connection.recv(1, socket.MSG_PEEK) == b''
    except (BlockingIOError, InterruptedError):
        return False
    except OSError:
        return True
    finally:
        connection.settimeout(REPLY_TIMEOUT_SECONDS)


def refusal_body(error):
    code = str(error) if isinstance(error, SafetyError) and str(error) in PUBLIC_REFUSALS else STOPPED
    return json.dumps({'error': code}).encode()


def make_handler(private, allowed_uids, execute, slots, peer_uid_of=linux_peer_uid, now=None, remaining=None):
    class Handler(BaseHTTPRequestHandler):
        timeout = IPC_READ_TIMEOUT_SECONDS  # An idle or slow client cannot hold a thread forever.

        def log_message(self, *_args):
            pass

        def reply(self, code, payload):
            if slots.tripped:
                # Stopping (or tripped): a reply must not hold the stop for the full reply timeout.
                self.connection.settimeout(DRAIN_REPLY_SECONDS)
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def stop_gate(self, entry_id):
            # A paid reply may be lost: keep the charge and stop. If even the halt cannot be
            # written, this server reserves nothing more until it is restarted.
            try:
                halt(private, 'ipc_or_delivery_failure', now=now, entry_id=entry_id)
            except BaseException:
                slots.trip()

        def answer_remaining(self):
            # Read-only: nothing is reserved, so a refused or lost reply needs no halt.
            try:
                uid = peer_uid_of(self.connection)
                length = int(self.headers.get('content-length', '0'))
                if remaining is None or uid not in allowed_uids or not 1 <= length <= MAX_REMAINING_IPC_BYTES:
                    raise SafetyError('IPC_REQUEST_REFUSED')
                encoded = json.dumps(remaining(json.loads(self.rfile.read(length)), uid), ensure_ascii=True).encode('ascii')
            except BaseException as error:  # noqa: BLE001 - every refusal is the same fixed body
                try:
                    self.reply(409, refusal_body(error))
                except BaseException:
                    pass
                return
            try:
                self.reply(200, encoded)
            except BaseException:
                pass

        def do_POST(self):
            if self.path == '/remaining':
                self.answer_remaining()
                return
            reserved = []
            try:
                uid = peer_uid_of(self.connection)
                length = int(self.headers.get('content-length', '0'))
                if self.path != '/complete' or uid not in allowed_uids or not 1 <= length <= MAX_IPC_BYTES:
                    raise SafetyError('IPC_REQUEST_REFUSED')
                data = json.loads(self.rfile.read(length))
                result = execute(data, uid, lambda: caller_canceled(self.connection), reserved.append)
                encoded = json.dumps(result, ensure_ascii=True).encode('ascii')
            except BaseException as error:
                if reserved and not isinstance(error, CallNotSent):
                    # Once a hold exists, any failure may lose a paid reply: halt, as for a lost reply.
                    # A provably unsent call released its hold already; nothing paid can be lost.
                    self.stop_gate(reserved[0])
                try:
                    self.reply(409, refusal_body(error))
                except BaseException:
                    pass
                return
            try:
                self.reply(200, encoded)
            except BaseException:
                self.stop_gate(reserved[0] if reserved else None)
    return Handler


class UnixThreadingServer(ThreadingMixIn, HTTPServer):
    """One thread per connection, at most max_connections at once. Every read has a timeout and
    every call a deadline, so server_close (which lets in-flight calls finish and settle) is bounded."""
    address_family = socket.AF_UNIX
    daemon_threads = False
    max_connections = MAX_IPC_CONNECTIONS

    def __init__(self, *args, allowed_uids=None, peer_uid_of=None, **kwargs):
        self.connection_slots = threading.BoundedSemaphore(self.max_connections)
        # With allowed_uids, a peer outside them is closed before it gets a thread or a slot, so it
        # cannot hold connections (or a stop) open by sending headers slowly.
        self.allowed_uids, self.peer_uid_of = allowed_uids, peer_uid_of or linux_peer_uid
        super().__init__(*args, **kwargs)

    def verify_request(self, request, client_address):
        if self.allowed_uids is None:
            return True
        try:
            return self.peer_uid_of(request) in self.allowed_uids
        except Exception:  # noqa: BLE001 - an unreadable peer is refused, never fatal to the loop
            return False

    def process_request(self, request, client_address):
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()

    def server_bind(self):
        self.socket.bind(self.server_address)
        self.server_name = 'localhost'
        self.server_port = 0


def clear_stale_socket(socket_path, owner_uid=0, probe_seconds=None):
    """Before serve binds: True if a provably stale socket file was removed, False if the path was
    free. Anything else refuses, and the path is left exactly as it was.

    Stale means all of: the folder is a real folder (not a symlink) owned by owner_uid (root) that
    group and others cannot write, so no one but root can create, swap or remove what is in it;
    the entry is a socket (not a symlink, file or folder) owned by owner_uid with one link; and a
    connect to it is refused (ECONNREFUSED: no process is listening). A listener, a full backlog,
    a timeout or any other connect error refuses with IPC_SOCKET_IN_USE. The entry is unlinked
    relative to the checked folder only if it is still the same inode that was checked. Callers
    hold the serve lock, so no other serve on this state can race this.
    """
    probe_seconds = STALE_PROBE_SECONDS if probe_seconds is None else probe_seconds
    path = Path(socket_path)
    try:
        dir_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED') from None
    try:
        folder = os.fstat(dir_fd)
        if folder.st_uid != owner_uid or folder.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
        try:
            entry = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
        except FileNotFoundError:
            return False
        except OSError:
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED') from None
        if not stat.S_ISSOCK(entry.st_mode) or entry.st_uid != owner_uid or entry.st_nlink != 1:
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            probe.settimeout(probe_seconds)
            probe.connect(str(path))
        except ConnectionRefusedError:
            # Nothing listens: the file is what a killed server left behind. (On Linux, the only
            # platform serve runs on, a live listener with a full backlog answers EAGAIN instead,
            # which refuses below. A socket another root process has bound but not yet put into
            # listen also answers ECONNREFUSED; only root can do that in this folder.)
            pass
        except OSError:
            raise SafetyError('IPC_SOCKET_IN_USE') from None
        else:
            raise SafetyError('IPC_SOCKET_IN_USE')
        finally:
            probe.close()
        try:
            again = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
        except OSError:
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED') from None
        if (again.st_dev, again.st_ino, again.st_mode, again.st_uid) != (entry.st_dev, entry.st_ino, entry.st_mode, entry.st_uid):
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
        try:
            os.unlink(path.name, dir_fd=dir_fd)
        except OSError:
            raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED') from None
        return True
    finally:
        os.close(dir_fd)


def socket_path_allowed(socket_path):
    text = str(socket_path)
    return bool(SOCKET_PATTERN.fullmatch(text)) and Path(text).name not in RETIRED_SOCKET_NAMES


def begin_stop(server, slots):
    """Stop: nothing more is reserved (the trip), and serve_forever returns. Calls already running
    finish and settle; server_close then waits for them."""
    slots.trip()
    server.shutdown()


def remove_own_socket(socket_path, bound):
    """Unlink the socket file only if it is still the one this server bound."""
    try:
        now = os.stat(socket_path, follow_symlinks=False)
    except OSError:
        return
    if (now.st_dev, now.st_ino) == bound:
        os.unlink(socket_path)


def serve(private, go_path, socket_path, platform=None, uid=None, host=None, owner_uid=0):
    go = read_go(go_path)
    platform = platform or sys.platform
    uid = os.getuid() if uid is None else uid
    host = host or socket.gethostname()
    if platform != 'linux' or uid != 0 or host != go['target_host'] or not socket_path_allowed(socket_path):
        raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
    bucharest_day(helper.utc_now())  # Fail fast without the time zone database.
    serve_lock = hold_serve_lock(private)
    try:
        # Under the serve lock: no other serve on this state can be clearing or binding meanwhile.
        stale_removed = clear_stale_socket(socket_path, owner_uid=owner_uid)
        recovered = recover_interrupted(private)
        slots = CallSlots(go['max_concurrent_calls'])

        def execute(data, uid, cancelled, on_reserved):
            return execute_request(private, go_path, data, peer_uid=uid, slots=slots, cancelled=cancelled,
                                   on_reserved=on_reserved)
        # Stop signals are blocked before any thread exists, so every thread inherits the block and
        # this (main) thread takes them with sigwait: no Python signal handler runs at all. A stop
        # signal that came earlier ended the process the default way (the next start recovers).
        signal.pthread_sigmask(signal.SIG_BLOCK, STOP_SIGNALS)
        server = UnixThreadingServer(str(socket_path), make_handler(private, go['allowed_peer_uids'], execute, slots,
                                                                    remaining=RemainingAnswers(private, go_path, slots)),
                                     allowed_uids=frozenset(go['allowed_peer_uids']))
        info = os.stat(socket_path, follow_symlinks=False)
        bound, failure = (info.st_dev, info.st_ino), []

        def loop():
            try:
                server.serve_forever(poll_interval=SERVE_POLL_SECONDS)
            except BaseException as error:  # noqa: BLE001 - reported by the main thread
                failure.append(error)
                os.kill(os.getpid(), signal.SIGTERM)  # Wakes the sigwait below.
        runner = threading.Thread(target=loop, name='serve-loop')
        try:
            os.chmod(socket_path, 0o666)
            runner.start()
            emit({'status': 'serving', 'socket': str(socket_path), 'provider': go['provider'],
                  'enabled_models': go['enabled_models'], 'max_concurrent_calls': slots.limit,
                  'stale_socket_removed': stale_removed, 'interrupted_calls_found': recovered['interrupted'],
                  'unrecorded_uncertain_found': recovered['unrecorded_uncertain']})
            signal.sigwait(STOP_SIGNALS)
            begin_stop(server, slots)
            runner.join()
        finally:
            slots.trip()
            if runner.is_alive():  # Only if something above failed before the stop.
                server.shutdown()
                runner.join()
            # Closes the listening socket first, then waits for in-flight calls to finish and settle.
            server.server_close()
            remove_own_socket(socket_path, bound)
        if failure:
            raise failure[0]
        log_event({'status': 'stopped', 'socket': str(socket_path)})
    finally:
        os.close(serve_lock)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('init', 'activate', 'serve', 'stop', 'status', 'probe'))
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--go', type=Path)
    parser.add_argument('--socket', type=Path)  # serve only, and required there: no built-in name.
    parser.add_argument('--model')  # probe only, and required there.
    args = parser.parse_args(argv)
    try:
        uses_go = args.phase in ('init', 'activate', 'serve', 'probe')
        if uses_go and args.go is None:
            raise SafetyError('ROOT_GO_REQUIRED')
        # No helper code runs before its custody, and with a GO its bound hash, are checked.
        load_helper(go_helper_sha256(args.go) if uses_go else None)
        if args.phase == 'init':
            result = init_state(args.private, args.go)
        elif args.phase == 'activate':
            result = activate(args.private, args.go)
        elif args.phase == 'stop':
            result = stop_authority(args.private)
        elif args.phase == 'status':
            result = status(args.private)
        elif args.phase == 'probe':
            if args.model is None:
                raise SafetyError('MODEL_REQUIRED')
            result = probe(args.private, args.go, args.model)
        else:
            if args.socket is None:
                raise SafetyError('ROOT_SOCKET_REQUIRED')
            serve(args.private, args.go, args.socket)
            return 0
        emit(result)
        return 0
    except BaseException as error:
        refusal = {'status': 'refused', 'error_class': type(error).__name__}
        if isinstance(error, SafetyError):
            refusal['error'] = str(error)  # Fixed public codes only; never exception text from elsewhere.
        emit(refusal)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
