#!/usr/bin/env python3
"""Root-owned private preview spending gate, v2: one shared team pot per Bucharest day. No retries.

init creates fresh v2 state from a hash-bound GO; activate opens it on the reviewed Linux host
for open_days; serve is Root-operated Unix IPC and the only reader of Root's provider key;
stop halts; status is read-only. Each call reserves its worst case under a short ledger lock,
the lock is released for the one fixed upstream HTTPS request, and the charge is then settled
under the lock. Uncertainty, overrun, a provider error, another model or a lost reply halts
every new call until Root re-activates; calls already in flight finish and settle.
The retired v1 ledger (budget-ledger.json) is never opened.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import socket
import struct
import sys
import threading
import time
import types
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
MODEL = 'zai-org/GLM-5.3-Flash'
OUTPUT_BOUND = 163840
GO_SCHEMA = 'preview-provider-budget-go-v2'
CONTROL_SCHEMA = 'preview-provider-budget-control-v2'
DAY_SCHEMA = 'preview-provider-budget-day-v2'
TEAM_DAY_ZONE = 'Europe/Bucharest'
CONTROL_NAME = 'team-control.json'
LOCK_NAME = 'team.lock'
SERVE_LOCK_NAME = 'team-serve.lock'
CONTROL_BYTES = 64 * 1024
DAY_LEDGER_BYTES = 16 * 1024 * 1024
DAY_LEDGER_RESERVE_BYTES = 15 * 1024 * 1024  # Headroom so in-flight settlements always fit.
LOCK_TIMEOUT_SECONDS = 10
SLOT_WAIT_SECONDS = 60
CALL_DEADLINE_SECONDS = 600  # Slot wait plus upstream call, inside the caller's 630 s timeout.
REPLY_TIMEOUT_SECONDS = 630
MAX_IPC_BYTES = 1024 * 1024
STOPPED = 'PREVIEW_TEST_AUTHORITY_STOPPED'
PUBLIC_REFUSALS = frozenset({'TEAM_DAILY_BUDGET_REACHED', 'DAILY_CALL_LIMIT_REACHED', 'CONCURRENCY_LIMIT_REACHED'})
GO_REQUIRED = frozenset({'schema', 'allow_paid_calls', 'bridge_sha256', 'helper_sha256', 'model', 'requested_effort',
                         'scope_id', 'target_host', 'allowed_peer_uids', 'daily_budget_usd', 'max_paid_posts_per_day',
                         'max_concurrent_calls', 'open_days'})
GO_OPTIONAL = frozenset({'predecessor_ledger_sha256'})
DAY_PATTERN = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')
SOCKET_PATTERN = re.compile(r'/run/debateai-v3-preview/[a-z0-9-]+\.sock')
ENTRY_STATES = ('pending', 'settled', 'uncertain')


def sha_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def sha(path):
    return sha_bytes(Path(path).read_bytes())


HELPER_PATH = Path(__file__).resolve().parent / 'preview_budget_helper.py'


def _load_helper():
    # Execute exactly the bytes that were hashed, so the GO binds the helper that runs.
    source = HELPER_PATH.read_bytes()
    module = types.ModuleType('preview_budget_helper')
    module.__file__ = str(HELPER_PATH)
    exec(compile(source, str(HELPER_PATH), 'exec'), module.__dict__)
    return module, sha_bytes(source)


helper, HELPER_SHA256 = _load_helper()
BRIDGE_SHA256 = sha(Path(__file__).resolve())
SafetyError = helper.SafetyError
_emit_lock = threading.Lock()


def emit(value):
    line = json.dumps(value, ensure_ascii=False, default=str) + '\n'
    with _emit_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


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


def valid_go(go):
    if not isinstance(go, dict) or not GO_REQUIRED <= set(go) or not set(go) <= GO_REQUIRED | GO_OPTIONAL:
        return False
    budget, uids = go['daily_budget_usd'], go['allowed_peer_uids']
    predecessor = go.get('predecessor_ledger_sha256', '0' * 64)
    return bool(
        go['schema'] == GO_SCHEMA and go['allow_paid_calls'] is True
        and go['bridge_sha256'] == BRIDGE_SHA256 and go['helper_sha256'] == HELPER_SHA256
        and go['model'] == MODEL and go['requested_effort'] == 'high'
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
    in_flight = control.get('in_flight') if isinstance(control, dict) else None
    if not (isinstance(control, dict) and control.get('schema') == CONTROL_SCHEMA
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

    def __init__(self, private, lock_timeout=LOCK_TIMEOUT_SECONDS, shared=False, create=False):
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


def _halt(control, reason, moment):
    # The first reason stands while halted; each entry keeps its own outcome.
    if control['state'] != 'halted':
        control.update(state='halted', reason=reason, halted_at=iso(moment))


def day_summary(control, ledger, moment):
    budget, spend = Decimal(control['limits']['daily_budget_usd']), day_spend(ledger)
    open_until = control.get('open_until_utc')
    return {'state': control['state'], 'reason': control['reason'], 'open_until_utc': open_until,
            'window_open': control['state'] == 'active' and moment < datetime.fromisoformat(open_until),
            'today': ledger['day'], 'daily_budget_usd': control['limits']['daily_budget_usd'],
            'today_spend_usd': str(spend), 'remaining_today_usd': str(max(Decimal(0), budget - spend)),
            'today_posts': len(ledger['entries']), 'max_paid_posts_per_day': control['limits']['max_paid_posts_per_day'],
            'in_flight': len(control['in_flight'])}


def init_state(private, go_path, now=None):
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    with TeamStore(private, create=True) as store:
        if store.has_control():
            raise SafetyError('STATE_ALREADY_EXISTS')
        control = {'schema': CONTROL_SCHEMA, 'scope_id': go['scope_id'], 'target_host': go['target_host'],
                   'state': 'initialized', 'reason': None, 'go_sha256': go_sha, 'limits': limits_of(go),
                   'predecessor_ledger_sha256': go.get('predecessor_ledger_sha256'),
                   'initialized_at': iso(current(now)), 'activated_at': None, 'active_host': None,
                   'open_until_utc': None, 'halted_at': None, 'activations': 0, 'in_flight': {}}
        store.save_control(control)
    return {'state': 'initialized', 'scope_id': go['scope_id'], 'target_host': go['target_host'],
            'go_sha256': go_sha, 'predecessor_ledger_sha256': control['predecessor_ledger_sha256']}


def activate(private, go_path, host=None, platform=None, now=None):
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host']:
        raise SafetyError('ACTIVATION_REFUSED')
    with TeamStore(private) as store:
        control = store.control()
        if control['state'] not in ('initialized', 'halted') or control['scope_id'] != go['scope_id']:
            raise SafetyError('ACTIVATION_REFUSED')
        moment = current(now)
        control.update(state='active', last_halt_reason=control['reason'], reason=None, go_sha256=go_sha,
                       limits=limits_of(go), target_host=go['target_host'], active_host=host,
                       activated_at=iso(moment), open_until_utc=iso(moment + timedelta(days=go['open_days'])),
                       activations=control['activations'] + 1)
        store.save_control(control)
        return day_summary(control, store.ledger(bucharest_day(moment)), moment)


def halt(private, reason, now=None):
    now = now or helper.utc_now
    with TeamStore(private) as store:
        control = store.control()
        _halt(control, reason, current(now))
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


def valid_response_format(body):
    if not isinstance(body, dict):
        return False
    fields = {'model', 'reasoning_effort', 'max_tokens', 'messages'}
    if set(body) == fields:
        return True
    if set(body) != fields | {'response_format'}:
        return False
    mode = body['response_format']
    return isinstance(mode, dict) and set(mode) == {'type'} and mode['type'] == 'json_object'


def validate_request(input, go):
    if not isinstance(input, dict) or set(input) != {'scope_id', 'operationId', 'requestBody', 'requestSha256', 'reservedUsd'} \
            or input['scope_id'] != go['scope_id'] or not isinstance(input['operationId'], str) \
            or not re.fullmatch(r'[A-Za-z0-9-]{1,96}', input['operationId']) or not isinstance(input['requestBody'], str) \
            or len(input['requestBody'].encode()) > 256 * 1024 \
            or hashlib.sha256(input['requestBody'].encode()).hexdigest() != input['requestSha256']:
        raise SafetyError('REQUEST_SCOPE_INVALID')
    try:
        body = json.loads(input['requestBody'])
    except ValueError:
        raise SafetyError('REQUEST_INVALID') from None
    if not valid_response_format(body) or body['model'] != MODEL or body['reasoning_effort'] != 'high' \
            or type(body['max_tokens']) is not int or not 1 <= body['max_tokens'] <= OUTPUT_BOUND \
            or not isinstance(body['messages'], list) or not body['messages'] \
            or any(not isinstance(m, dict) or set(m) != {'role', 'content'} or m['role'] not in ('system', 'user', 'assistant')
                   or not isinstance(m['content'], str) for m in body['messages']):
        raise SafetyError('REQUEST_PARAMETERS_INVALID')
    reserved = (Decimal(len(input['requestBody'].encode()) + 2048) * Decimal('0.15') + Decimal(OUTPUT_BOUND) * Decimal('0.50')) / Decimal(1000000)
    if helper.decimal_amount(input['reservedUsd']) != reserved:
        raise SafetyError('RESERVATION_MISMATCH')
    return body, reserved


def reserve_call(private, go, go_sha, input, reserved, host, peer_uid, now):
    """Lock, check state and today's team limits, durably write the pending hold, unlock."""
    with TeamStore(private) as store:
        control = store.control()
        if control['state'] != 'active' or control['go_sha256'] != go_sha or control['active_host'] != host \
                or control['scope_id'] != go['scope_id']:
            raise SafetyError('AUTHORITY_STOPPED')
        moment = current(now)
        if moment >= datetime.fromisoformat(control['open_until_utc']):
            _halt(control, 'open_window_expired', moment)
            store.save_control(control)
            raise SafetyError('AUTHORITY_EXPIRED')
        day = bucharest_day(moment)
        ledger = store.ledger(day)
        entry_id = 'preview-test:' + go['scope_id'] + ':' + input['operationId']
        if entry_id in ledger['entries'] or entry_id in control['in_flight']:
            raise SafetyError('DUPLICATE_OPERATION')
        if len(ledger['entries']) >= go['max_paid_posts_per_day']:
            raise SafetyError('DAILY_CALL_LIMIT_REACHED')
        if day_spend(ledger) + reserved > Decimal(go['daily_budget_usd']):
            raise SafetyError('TEAM_DAILY_BUDGET_REACHED')
        ledger['entries'][entry_id] = {'state': 'pending', 'reserved_usd': str(reserved), 'held_usd': str(reserved),
                                       'reserved_at': iso(moment), 'request_sha256': input['requestSha256'],
                                       'requested_effort': 'high', 'model': MODEL, 'peer_uid': peer_uid}
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
    """Lock, settle the entry on its reservation day (or halt), unlock."""
    with TeamStore(private) as store:
        control = store.control()
        moment = current(now)
        ledger = store.ledger(day)
        entry = ledger['entries'].get(entry_id)
        if entry is None or entry['state'] != 'pending':
            _halt(control, 'settlement_state_invalid', moment)
            store.save_control(control)
            raise SafetyError('SETTLEMENT_STATE_INVALID')
        entry.update(changes, reconciled_at=iso(moment))
        if halt_reason is None and day_spend(ledger) > budget:
            halt_reason = 'charge_overrun'
        store.save_ledger(ledger)
        control['in_flight'].pop(entry_id, None)
        if halt_reason is not None:
            _halt(control, halt_reason, moment)
        store.save_control(control)
        return {'authority': control['state'], 'day_held_usd': str(day_spend(ledger))}


def settle_or_halt(private, entry_id, day, changes, halt_reason, budget, now):
    try:
        return record_settlement(private, entry_id, day, changes, halt_reason, budget, now)
    except BaseException:
        # The pending hold stays in the ledger and in flight; serve start turns it uncertain.
        try:
            halt(private, 'settlement_failure', now=now)
        except BaseException:
            pass
        raise SafetyError('SETTLEMENT_FAILED') from None


def bounded_accounting(accounting):
    # Every stored amount stays short, so settlements always fit the day ledger's headroom.
    if any(isinstance(value, str) and len(value) > 64 for name, value in accounting.items() if name != 'cost_basis'):
        return {'usage_valid': False, 'oversized_accounting': True, 'guard_charge_usd': None}
    return accounting


class CallSlots:
    def __init__(self, limit):
        self.limit = limit
        self._semaphore = threading.BoundedSemaphore(limit)

    def acquire(self, wait):
        return self._semaphore.acquire(timeout=wait)

    def release(self):
        self._semaphore.release()


def execute_request(private, go_path, input, *, peer_uid, slots, dispatch=None, key_loader=None, host=None,
                    platform=None, now=None, slot_wait=SLOT_WAIT_SECONDS, cancelled=None):
    accepted = time.monotonic()
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    body, reserved = validate_request(input, go)
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host'] or type(peer_uid) is not int or peer_uid not in go['allowed_peer_uids']:
        raise SafetyError('EXECUTION_AUTHORITY_REFUSED')
    if slots.limit != go['max_concurrent_calls']:
        raise SafetyError('SERVE_RESTART_REQUIRED')
    if not slots.acquire(slot_wait):
        raise SafetyError('CONCURRENCY_LIMIT_REACHED')
    try:
        if cancelled is not None and cancelled():
            raise SafetyError('CALLER_CANCELED_BEFORE_DISPATCH')
        key = (key_loader or helper.read_key)(private)
        if dispatch is None:
            dispatch = helper.HttpsTransport(timeout=max(1.0, CALL_DEADLINE_SECONDS - (time.monotonic() - accepted)))
        entry_id, day = reserve_call(private, go, go_sha, input, reserved, host, peer_uid, now)
        budget, started = Decimal(go['daily_budget_usd']), time.monotonic()
        event = {'event': 'preview_provider_paid_post', 'operation_id': input['operationId'], 'day': day}
        try:
            status, response = dispatch(body, key)
            response = helper.redact(response if isinstance(response, dict) else {}, key)
        except BaseException as error:
            outcome = settle_or_halt(private, entry_id, day, {
                'state': 'uncertain', 'held_usd': str(reserved), 'reason': 'transport_failure',
                'error_class': type(error).__name__, 'elapsed_seconds': round(time.monotonic() - started, 6)},
                'uncertain_charge', budget, now)
            emit({**event, 'status': 'uncertain', **outcome})
            raise SafetyError('NEW_CHARGE_UNCERTAIN') from None
        elapsed = round(time.monotonic() - started, 6)
        try:
            changes, halt_reason, charge, reply = assess_reply(status, response, reserved, elapsed)
        except BaseException:
            # Paid but unaccountable: keep the full hold and stop, as for a transport failure.
            changes, halt_reason, charge, reply = ({'state': 'uncertain', 'held_usd': str(reserved),
                                                    'reason': 'accounting_failure', 'elapsed_seconds': elapsed},
                                                   'uncertain_charge', None, None)
        outcome = settle_or_halt(private, entry_id, day, changes, halt_reason, budget, now)
        emit({**event, 'status': changes['state'], 'halt_reason': halt_reason, 'guard_charge_usd': charge,
              'elapsed_seconds': elapsed, **outcome})
        if charge is None:
            raise SafetyError('NEW_CHARGE_UNCERTAIN')
        if halt_reason is not None:
            raise SafetyError('AUTHORITY_HALTED')
        return reply
    finally:
        slots.release()


def assess_reply(status, response, reserved, elapsed):
    """Ledger changes, halt reason, guard charge and caller reply for one redacted provider reply."""
    accounting = bounded_accounting(helper.account_response(response))
    charge = accounting.get('guard_charge_usd')
    changes = {'accounting': accounting, 'elapsed_seconds': elapsed, 'http_status': status if type(status) is int else None}
    if charge is None or accounting.get('usage_valid') is not True:
        # A reported cost alone is not usage: without valid token counts the charge is uncertain.
        # With both, the guard charge is the larger of the token list price and the reported cost.
        changes.update(state='uncertain', held_usd=str(reserved), reason='usage_or_cost_unreported')
        return changes, 'uncertain_charge', None, None
    amount = Decimal(charge)
    changes.update(state='settled', held_usd=str(amount), overrun_usd=str(max(Decimal(0), amount - reserved)))
    if amount > reserved:
        halt_reason = 'charge_overrun'
    elif status != 200 or response.get('model') != MODEL:
        halt_reason = 'provider_error_or_model_identity'
    else:
        halt_reason = None
    return changes, halt_reason, charge, {'status': status, 'body': json.dumps(response, ensure_ascii=False, default=str)}


def recover_interrupted(private, now=None):
    """Serve start only (one server per state): leftover holds were interrupted, so their charge is uncertain."""
    now = now or helper.utc_now
    with TeamStore(private) as store:
        control = store.control()
        if not control['in_flight']:
            return {'interrupted': 0}
        moment, interrupted = current(now), 0
        for entry_id, day in sorted(control['in_flight'].items()):
            ledger = store.ledger(day)
            entry = ledger['entries'].get(entry_id)
            if entry is not None and entry['state'] == 'pending':
                entry.update(state='uncertain', held_usd=entry['reserved_usd'], reason='interrupted_before_reconciliation',
                             reconciled_at=iso(moment))
                store.save_ledger(ledger)
                interrupted += 1
        control['in_flight'] = {}
        if interrupted:
            _halt(control, 'interrupted_call_uncertain', moment)
        store.save_control(control)
        return {'interrupted': interrupted}


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


def make_handler(private, allowed_uids, execute, peer_uid_of=linux_peer_uid, now=None):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, code, payload):
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            try:
                uid = peer_uid_of(self.connection)
                length = int(self.headers.get('content-length', '0'))
                if self.path != '/complete' or uid not in allowed_uids or not 1 <= length <= MAX_IPC_BYTES:
                    raise SafetyError('IPC_REQUEST_REFUSED')
                self.connection.settimeout(5)
                data = json.loads(self.rfile.read(length))
                encoded = json.dumps(execute(data, uid, lambda: caller_canceled(self.connection)), ensure_ascii=False).encode()
            except BaseException as error:
                try:
                    self.reply(409, refusal_body(error))
                except BaseException:
                    pass
                return
            try:
                self.reply(200, encoded)
            except BaseException:
                # A lost reply follows a paid settled call; preserve the charge and stop.
                try:
                    halt(private, 'ipc_or_delivery_failure', now=now)
                except BaseException:
                    pass
    return Handler


class UnixThreadingServer(ThreadingMixIn, HTTPServer):
    address_family = socket.AF_UNIX
    daemon_threads = False

    def server_bind(self):
        self.socket.bind(self.server_address)
        self.server_name = 'localhost'
        self.server_port = 0


def serve(private, go_path, socket_path, platform=None, uid=None, host=None):
    go = read_go(go_path)
    platform = platform or sys.platform
    uid = os.getuid() if uid is None else uid
    host = host or socket.gethostname()
    if platform != 'linux' or uid != 0 or host != go['target_host'] \
            or not SOCKET_PATTERN.fullmatch(str(socket_path)) or Path(socket_path).exists():
        raise SafetyError('ROOT_IPC_CUSTODY_REQUIRED')
    bucharest_day(helper.utc_now())  # Fail fast without the time zone database.
    serve_lock = hold_serve_lock(private)
    try:
        recovered = recover_interrupted(private)
        slots = CallSlots(go['max_concurrent_calls'])

        def execute(data, uid, cancelled):
            return execute_request(private, go_path, data, peer_uid=uid, slots=slots, cancelled=cancelled)
        server = UnixThreadingServer(str(socket_path), make_handler(private, go['allowed_peer_uids'], execute))
        os.chmod(socket_path, 0o666)
        emit({'status': 'serving', 'socket': str(socket_path), 'max_concurrent_calls': slots.limit,
              'interrupted_calls_found': recovered['interrupted']})
        try:
            server.serve_forever()
        finally:
            server.server_close()
            Path(socket_path).unlink(missing_ok=True)
    finally:
        os.close(serve_lock)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('init', 'activate', 'serve', 'stop', 'status'))
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--go', type=Path)
    parser.add_argument('--socket', type=Path, default=Path('/run/debateai-v3-preview/provider-budget.sock'))
    args = parser.parse_args(argv)
    try:
        if args.phase in ('init', 'activate', 'serve') and args.go is None:
            raise SafetyError('ROOT_GO_REQUIRED')
        if args.phase == 'init':
            result = init_state(args.private, args.go)
        elif args.phase == 'activate':
            result = activate(args.private, args.go)
        elif args.phase == 'stop':
            result = stop_authority(args.private)
        elif args.phase == 'status':
            result = status(args.private)
        else:
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
