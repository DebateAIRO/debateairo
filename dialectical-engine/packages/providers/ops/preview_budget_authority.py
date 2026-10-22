#!/usr/bin/env python3
"""Root-owned private preview spending gate, v3: one provider, its reviewed model table, one pot
per Bucharest day. No retries.

The GO (schema v3, root-owned, bound by hash at activate) names one provider profile (`provider`)
and the reviewed models of that profile it switches on (`enabled_models`). The profile and its
model rows (prices, output bound, effort, JSON mode, sampling) live in the helper's code, so the GO's
helper_sha256 binds them: a price change is a reviewed code change, never a GO edit. A v2 GO (one
fixed model) is refused. A model the GO does not enable is refused before any reservation or key
read; each call reserves its own row's worst case ((request bytes + 2048) x input price + output
bound x output price, per million, at the profile's reservation prices for that moment, never
above the row's ceiling prices) and settles at the profile's prices for that row and moment (or
the provider's reported cost, the larger); its ledger entry records the model, its maker, the
reservation and settlement prices and the bound; and a reply naming any other model than that
entry's halts. No reviewed row may reserve more than its profile's per_call_cap_usd for a
full-size request (profile.max_request_bytes, at its ceiling prices), nor, for a final-writer request
(LG-B, callTier FINAL_WRITER, only under a GO that names max_final_writer_calls F), more than the
profile's final_writer_per_call_cap_usd for a full-size one (final_writer_max_request_bytes, reserved at
the row's final_writer_output_bound). activate refuses a GO whose in_flight_worst_case exceeds
daily_budget_usd: (max_concurrent_calls - F) x the largest enabled standard worst case + F x the
largest enabled final-writer worst case (F = 0 without the member: max_concurrent_calls x the
largest standard worst case, as before LG-B). The profile
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
reservation halts every new call until Root re-activates (except a connection failure after the
send, which is booked at its reservation: below); calls already in flight finish and
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
fails (PROVIDER_NOT_REACHED; it leaves no entry: no byte reached the vendor, so there is nothing it
could bill); the gate does not halt. UNSENT_HALT_STREAK such failures (and not-busy unbilled
errors, below) with no settled reply in between (kept in the control file, so a restart does not
reset them) halt with provider_unreachable. Only a settled reply or an activation resets the streak.
Calls in flight together count once (spec 2026-10-12 parallel calls section 3.4, owner ruling O8): when
the streak grows, the control file keeps that moment ('unsent_counted_at'); a later such failure
grows it again only if its call was not reserved before that moment (a call reserved earlier was
in flight with the counted one), so one network blip under many parallel calls counts once. A
settled reply also deletes 'unsent_counted_at'. Calls reserved one after another count one each.

Booked at the reservation (owner ruling 2026-10-12, "Book max cost, keep going"): when the vendor
connection fails or times out AFTER the request may have been sent (the transport raised an OSError,
e.g. the CALL_DEADLINE_SECONDS timeout, a reset or a TLS error, or an http.client.HTTPException, e.g.
the vendor closed the connection mid-reply), no reply was read, so the charge is unknown; but the
call's own reservation already prices its request bytes (+ 2048) and its row's whole output bound at
the reserve prices, so it bounds what the vendor can bill. The gate then books exactly that amount as
the call's charge: the entry becomes 'settled_reserved_max' (held_usd = reserved_usd, reason
'transport_failure', the error class and the elapsed time), the gate stays active, the day's spend,
pot and call count include it like any settled call, the caller sees PROVIDER_CHARGE_BOOKED_MAX, and
the journal line carries alert 'charge_booked_at_reservation'. status counts the day's bookings
(today_booked_max, today_booked_max_usd) and the halt watcher emails the owner once per new booking.
A booking neither grows nor resets the unsent streak and never cools or uncools a model (a cool-off
trial that is booked proves nothing: the next call may be the trial).
A vendor's server error (owner ruling 2026-10-15, after two GLM answers of HTTP 500 with no usage and no
model each halted the gate): a reply the profile's optional bookable_server_error accepts (DeepInfra:
HTTP 500 to 599 with none of the billing keys anywhere in the raw reply) is booked the same way, with
reason 'vendor_server_error', its HTTP status and the vendor facts an unbilled release keeps (Retry-After,
rate-limit header names, the short redacted error). The same reservation bounds whatever was billed.
A profile without that hook (Anthropic) books its server errors only as below.
An unreported charge (owner answer M3, 2026-10-15; rulings R1-R3, 2026-10-16): a paid reply whose usage or cost is
unreported (assess_reply's usage_or_cost_unreported) that the profile's optional bookable_unreported accepts, judged
on the RAW reply with its accounting and the call's reservation, is booked the same way, with reason
'charge_unreported', its HTTP status and its accounting (DeepInfra: a 2xx or 5xx whose counts cannot be priced, when no
cost it reports anywhere and none of the counts it does report price above the reservation; Anthropic: a message,
status 200, without usage or with unreadable input/output counts whose usage names no premium speed, tier, region,
server tool or cache write, and a 5xx that is no message and carries no billing key, content, model, token count,
speed, tier or region, its 504 timeout_error among them). Only a reply that names no model or this call's own model is
booked. M3 books a reply that carries NO usable bill, never one that carries evidence of a bigger one (fix round 1,
2026-10-16): a count written as a float or as numeric text, or a cost that is an object or a list, halts. A hook that
fails halts (accounting_failure). Everything else still halts exactly as before: any other failure while sending or
reading (a reply too large, a fault in the transport itself), a hook that fails on a reply, a 4xx without accountable
usage (a key, billing or request problem root must see), a reply whose own reported cost is above its reservation, any
usage member, speed, service tier, region, server tool, cache count or content block the profile cannot price, a
charge above the reservation (charge_overrun), a reply naming another model (with or without usable counts), a non-200
reply with accountable usage, a key, identity or configuration problem, a hold that cannot be released, a lost reply or
an interrupted call (a booking still in flight at serve start halts, as a settled call does).

Unbilled refusals (owner ruling 5, 2026-10-10; per model since 2026-10-12): anything after the connect
stays uncertain and halts as before, with one exception: a reply the profile's unbilled_refusal
proves unbilled (DeepInfra: a 429 with an error and no usage, choices or estimated_cost anywhere;
Anthropic: its well-formed error answers 400, 404, 413, 429, 500 and 529) has its hold released
and stays on the record: its entry is kept as 'released_unbilled' with held_usd "0" and its HTTP
status, reason and time. Those entries never count toward the pot or max_paid_posts_per_day, and
there is no daily ceiling any more (the day's count is in status as today_unbilled_releases).
The profile's busy_refusal then picks one of two paths (review 2026-10-12):
- Busy (DeepInfra's 429; Anthropic's 429 rate_limit_error and 529 overloaded_error): the caller sees
  PROVIDER_REFUSED_UNBILLED. Owner direction 2026-10-11: it proves the vendor is reachable and costs
  nothing, so it never halts the gate and neither grows nor resets the unsent streak. Busy-ness is
  handled per model instead: COOL_OFF_AFTER_REFUSALS such refusals for one model with no settled
  reply of that model in between start a cool-off for that model only. While it runs, a new call
  for that model is refused before any reservation and without contacting the vendor, with
  MODEL_COOLING and retry_after seconds. The window starts at COOL_OFF_FIRST_SECONDS; when it ends,
  ONE call for that model goes through (the trial; others are still refused while it is in flight).
  If the trial is refused busy again the window doubles, up to COOL_OFF_MAX_SECONDS; a call that was
  already in flight when the cool-off began and comes back refused restarts the current window (never
  ending it sooner) without doubling it. A settled reply for that model ends its cool-off and its
  count. Other models are never affected. The cool-off state lives in the control file ('cooling',
  one record per model), written with the same atomic writes.
- Not busy (Anthropic's 400, 404, 413 and 500): the caller sees PROVIDER_ERROR_UNBILLED. As before gate
  v4 it grows the unsent streak (so UNSENT_HALT_STREAK of them, or of them and connect failures, with
  no settled reply in between halt with provider_unreachable) and never cools the model.
What bounds the unbilled refusals if a vendor billed them after all (none is ever a gate halt by
itself): while a model is cooling, at most one call for it per window reaches the vendor (the trial),
plus the calls already in flight when the cool-off began; when no model is cooling, nothing limits
the rate but the concurrency: at most max_concurrent_calls calls are in flight at once, and two busy
refusals of one model start its cool-off. Over a day the count is bounded only by the day ledger's
size (DAY_LEDGER_RESERVE_BYTES; past it every reservation is refused DAY_LEDGER_FULL), and every one
stays on that ledger. The halt watcher (deploy/preview-gate/v2/gate_watch.py) emails the owner once
per gate per Bucharest day when today_unbilled_releases reaches its threshold (default 100), so the
owner can check the vendor's billing page; nothing is halted for it.
A probe (root, one deliberate call) is never refused for a cool-off, but its outcome counts.

Refusal codes the caller sees (PUBLIC_REFUSALS): the three pot codes, PROVIDER_NOT_REACHED,
PROVIDER_REFUSED_UNBILLED and PROVIDER_ERROR_UNBILLED (nothing billed, hold released; only the second
says the model is busy), MODEL_COOLING (nothing reserved or sent), PROVIDER_CHARGE_BOOKED_MAX (sent,
then the connection failed, the vendor answered a server error without a bill, or its charge went unreported;
booked at the reservation; the gate stays active),
AUTHORITY_HALTED: the gate was already halted (or halted at that moment on an interrupted probe)
when this call was checked, before anything was reserved, and (side-by-side spec §9) MODEL_NOT_ALLOWED and
RESERVATION_MISMATCH: refused before any reservation: this model or this price is not served by this GO (during
an upload an older release's debate may still ask for a row or a price the new GO no longer carries; the app
reads either as that model sitting out, never as money). Every other refusal, among them every
failure after a reservation, is the opaque PREVIEW_TEST_AUTHORITY_STOPPED.

Team total (owner, 2026-10-10; raised by owner answer M1, 2026-10-15): one GO's daily_budget_usd is at most
MAX_GO_BUDGET_USD ($12.00, the DeepInfra pot), and activate (root, in a shell, so outside every unit's sandbox) also adds
the daily_budget_usd of the other provider gates' GO files (GATE_PATHS) and refuses when the sum is over
TEAM_TOTAL_BUDGET_USD ($16.00: DeepInfra $12.00 + Anthropic $4.00).

Probe fence: a probe refuses (PROBE_FENCE_REQUIRED) unless it runs inside the fenced transient
unit the README gives (check_probe_fence), so a bare run never reads the key without the network
allow-list or while another gate's folder or GO is visible.

Day boundary (by design): a call is charged to the Bucharest day on which it was reserved, even
when it settles after midnight. So the real upstream charges made within one calendar day can
exceed daily_budget_usd by up to the GO's in_flight_worst_case ((max_concurrent_calls - F) x the
largest enabled standard reservation, at most per_call_cap_usd each, + F x the largest enabled
final-writer reservation, at most final_writer_per_call_cap_usd each; F = max_final_writer_calls, 0
without it): calls reserved just before midnight are paid just after it, while
the new day's pot is already open. A probe runs beside serve, so for its one call up to
max_concurrent_calls + 1 calls may be in flight; the pot itself is still checked under the lock.
"""
import argparse
import fcntl
import hashlib
import http.client
import json
import math
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
# $0.25 and 256 KiB, owner ruling 2026-10-10). A unit test pins every reviewed row under its profile's cap.
MAX_PROFILE_CALL_CAP_USD = Decimal('1.00')
MAX_PROFILE_REQUEST_BYTES = 1024 * 1024
MAX_PRICE_USD_PER_M = Decimal('10.00')  # A price above this is a typo, not a preview model.
MAX_OUTPUT_BOUND = 1048576
MODEL_ID_PATTERN = re.compile(r'([A-Za-z0-9][A-Za-z0-9._-]{0,63}/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}')
MAX_REMAINING_IPC_BYTES = 4096
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
# app's own 1,260 s call deadline (preview-test.ts: PREVIEW_GLM_DEADLINE_MS), so the gate, not the
# app, decides a slow call (owner ruling 2026-10-12: 20 minutes, was 600 s). REPLY_TIMEOUT_SECONDS is
# the caller's IPC timeout (PREVIEW_GLM_DEADLINE_MS + 30 s): how long writing the reply may take.
CALL_DEADLINE_SECONDS = 1200
REPLY_TIMEOUT_SECONDS = 1290
DRAIN_REPLY_SECONDS = 30  # Once stopping (or tripped), a reply must be taken this fast or the gate halts.
STOP_SIGNALS = (signal.SIGTERM, signal.SIGINT)
SERVE_POLL_SECONDS = 0.5  # How often the accept loop checks for a stop (bounds the stop's first step).
# LG-B: a final writer's 1 MiB body travels JSON-escaped inside the message (a quote becomes 4 bytes there), so the
# message may be up to 3 MiB.
MAX_IPC_BYTES = 3 * 1024 * 1024
IPC_READ_TIMEOUT_SECONDS = 10  # Each header or body read on the 0666 socket.
MAX_IPC_CONNECTIONS = 32  # Connections beyond this are closed unread, without a thread.
# Provably unsent calls (PROVIDER_NOT_REACHED) and not-busy unbilled errors (PROVIDER_ERROR_UNBILLED)
# with no settled reply in between before the gate halts (provider_unreachable). A vendor's busy
# unbilled refusal (PROVIDER_REFUSED_UNBILLED) neither grows nor resets this count (2026-10-12).
# Failures of calls that were in flight together count once (grow_unsent_streak; 2026-10-12 section 3.4).
UNSENT_HALT_STREAK = 5
# Per-model cool-off (owner direction 2026-10-11): this many unbilled refusals for one model with no
# settled reply of that model in between (one app call + its 60 s resend) cool that model off.
COOL_OFF_AFTER_REFUSALS = 2
COOL_OFF_FIRST_SECONDS = 60  # The first window; each refused trial doubles it ...
COOL_OFF_MAX_SECONDS = 600  # ... up to ten minutes.
# The longest stored window a control file may hold (any whole number 0..this). A stored window above
# today's COOL_OFF_MAX_SECONDS is clamped to it when read (cooling_clamped), never refused, so a later,
# lower maximum can never make the state unreadable (CONTROL_INVALID would block stop and status too).
COOLING_RECORD_MAX_SECONDS = 600
# A GO's max_concurrent_calls is 1 to this (owner ruling, 2026-10-10: "10 at once"). Gate v2 kept its
# own bound of 8 in its own installed bytes (its GO binds them by hash); this code refuses every v2 GO.
MAX_CONCURRENT_CALLS = 10
STOPPED = 'PREVIEW_TEST_AUTHORITY_STOPPED'
# Codes the caller may see. PROVIDER_NOT_REACHED, PROVIDER_REFUSED_UNBILLED and PROVIDER_ERROR_UNBILLED
# mean this call's hold is already released and nothing was billed (not reached; the vendor was busy;
# the vendor answered with another error that bills nothing, e.g. Anthropic's 400/404/413/500), so the
# app may treat them as a transient failure; only PROVIDER_REFUSED_UNBILLED says the model is busy. MODEL_COOLING (with retry_after seconds): this model is cooling off
# after unbilled refusals; nothing was reserved or sent. AUTHORITY_HALTED: the gate is halted, found
# by the state check before anything was reserved (never after a reservation: every failure there
# stays the opaque STOPPED).
# PROVIDER_CHARGE_BOOKED_MAX (owner ruling 2026-10-12; owner answer M3): this call was sent and its charge cannot be
# known (the connection failed or timed out, a server error without a bill, or an unreported charge); its full
# reservation is booked as its charge; the gate stays active.
# MODEL_NOT_ALLOWED and RESERVATION_MISMATCH (side-by-side spec §9, both raised in validate_request): refused before
# any reservation: this model or this price is not served by this GO; nothing was reserved or sent.
PUBLIC_REFUSALS = frozenset({'TEAM_DAILY_BUDGET_REACHED', 'DAILY_CALL_LIMIT_REACHED', 'CONCURRENCY_LIMIT_REACHED',
                             'PROVIDER_NOT_REACHED', 'PROVIDER_REFUSED_UNBILLED', 'PROVIDER_ERROR_UNBILLED',
                             'MODEL_COOLING', 'AUTHORITY_HALTED', 'PROVIDER_CHARGE_BOOKED_MAX',
                             'MODEL_NOT_ALLOWED', 'RESERVATION_MISMATCH'})
GO_REQUIRED = frozenset({'schema', 'allow_paid_calls', 'bridge_sha256', 'helper_sha256', 'provider', 'enabled_models',
                         'scope_id', 'target_host', 'allowed_peer_uids', 'daily_budget_usd', 'max_paid_posts_per_day',
                         'max_concurrent_calls', 'open_days'})
GO_OPTIONAL = frozenset({'predecessor_ledger_sha256', 'max_final_writer_calls'})
DAY_PATTERN = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')
SOCKET_PATTERN = re.compile(r'/run/debateai-v3-preview/[a-z0-9-]+\.sock')
# v1's and v2's names: a client still configured for an older gate must never reach this one.
RETIRED_SOCKET_NAMES = frozenset({'provider-budget.sock', 'team-budget-v2.sock'})
STALE_PROBE_SECONDS = 2
CALL_ENTRY_PREFIX = 'preview-test:'
PROBE_ENTRY_PREFIX = 'preview-probe:'
PROBE_LOCK_NAME = 'team-probe.lock'  # Held by a running probe; serve start and reservations check it.
PROBE_EXCERPT_CHARS = 80
# released_unbilled: a refusal the profile proved unbilled; its hold is released (held_usd "0") but
# the entry stays on the day's record (status counts them as today_unbilled_releases; never a halt).
# settled_reserved_max (owner ruling 2026-10-12): sent, then the vendor connection failed or timed out;
# booked at exactly its reservation (held_usd == reserved_usd), counted like a settled call, never a halt
# (status counts them as today_booked_max).
BOOKED_MAX = 'settled_reserved_max'
ENTRY_STATES = ('pending', 'settled', 'uncertain', 'released_unbilled', BOOKED_MAX)
# What the transport raises when the connection fails or times out after the request may have been
# sent (socket timeouts, resets, TLS errors, a closed or cut reply). Only these are booked at the
# reservation; anything else after the reservation stays uncertain and halts.
BOOKABLE_TRANSPORT_FAILURES = (OSError, http.client.HTTPException)
# Owner ruling 2026-10-10, raised by owner answer M1 (2026-10-15): one GO may ask for at most $12.00 a day (the
# DeepInfra pot), and the daily team total over every provider gate's pot is $16.00 (DeepInfra $12.00 + Anthropic $4.00).
MAX_GO_BUDGET_USD = Decimal('12.00')
TEAM_TOTAL_BUDGET_USD = Decimal('16.00')  # Checked only by activate's sum over every gate's GO.
TEAM_GO_BYTES = 64 * 1024
# Every provider gate on the preview host, by GO provider: (private folder, GO file). Reviewed:
# activate sums the other gates' GOs from here, and the probe fence checks every other gate's
# folder and GO is hidden. The units hide each gate's paths from the others.
GATE_PATHS = {
    'deepinfra': ('/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3',
                  '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json'),
    'anthropic': ('/var/lib/debateai-v3-preview/provider-anthropic-authority-v1',
                  '/etc/debateai-v3-preview/provider-anthropic-go-v1.json'),
    'google': ('/var/lib/debateai-v3-preview/provider-google-authority-v1',
               '/etc/debateai-v3-preview/provider-google-go-v1.json'),
}
# The retired gates' state (v1, v2) and v2's GO: hidden from every probe too.
RETIRED_GATE_PATHS = ('/var/lib/debateai-v3-preview/provider-test-authority',
                      '/var/lib/debateai-v3-preview/provider-team-authority-v2',
                      '/etc/debateai-v3-preview/provider-team-go-v2.json')
PROBE_UNIT_PREFIX = 'debateai-preview-probe-'  # + provider + '.service': the probe's transient unit.
# TEST-NET-1 (RFC 5737): reserved for documentation, never routed. Inside the fence an empty
# datagram to it is refused at once; outside it leaves the process, which proves there is no fence.
FENCE_TEST_ADDRESS = ('192.0.2.1', 9)


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


def cache_write_of(profile, body):
    """Whether an accepted request asks its provider for a prompt-cache write: the profile's optional
    cache_write_requested(body) (a profile without it never caches). Only an exact True counts."""
    asks = getattr(profile, 'cache_write_requested', None)
    return asks is not None and asks(body) is True


# Length guidance LG-B (L26, L29): the two kinds of request the app declares. No callTier key is STANDARD: every request
# before LG-B, and the probe's.
CALL_TIERS = ('STANDARD', 'FINAL_WRITER')


def request_tier(input):
    """The tier an app request declares (callTier), STANDARD when it names none; anything else refuses."""
    if isinstance(input, dict) and 'callTier' in input:
        if input['callTier'] not in CALL_TIERS:
            raise SafetyError('PREVIEW_CALL_TIER_INVALID')
        return input['callTier']
    return 'STANDARD'


def final_writer_tier_of(profile):
    """(largest request bytes, per-call cap) of the profile's final-writer tier, or None when it has none."""
    size = getattr(profile, 'final_writer_max_request_bytes', None)
    cap = getattr(profile, 'final_writer_per_call_cap_usd', None)
    return None if size is None or cap is None else (size, cap)


def final_writer_slots(go):
    """How many final-writer calls the GO lets through at once: its max_final_writer_calls, 0 without it (no tier)."""
    return go.get('max_final_writer_calls', 0)


def tier_limits(profile, tier):
    """(largest request bytes, per-call cap) of one tier."""
    if tier == 'STANDARD':
        return profile.max_request_bytes, profile.per_call_cap_usd
    limits = final_writer_tier_of(profile)
    if tier != 'FINAL_WRITER' or limits is None:
        raise SafetyError('PREVIEW_CALL_TIER_INVALID')
    return limits


def tier_row(profile, row, tier):
    """The row as a request of this tier is checked and reserved: a final writer's carries the row's own maximum as its
    output bound."""
    if tier == 'STANDARD':
        return row
    bound = getattr(row, 'final_writer_output_bound', None)
    if tier != 'FINAL_WRITER' or final_writer_tier_of(profile) is None or bound is None:
        raise SafetyError('PREVIEW_CALL_TIER_INVALID')
    return row._replace(output_bound=bound)


def worst_case_reservation(profile, row, tier='STANDARD'):
    """A full-size request of the tier at the highest prices the row can ever reserve at (ceiling_prices): one figure for
    the per-call cap, the activate check and /remaining, whatever the date."""
    return reservation_for(tier_limits(profile, tier)[0], tier_row(profile, row, tier), profile.ceiling_prices(row))


def _price_ok(value):
    return type(value) is Decimal and value.is_finite() and Decimal(0) < value <= MAX_PRICE_USD_PER_M


def prices_ok(prices):
    return isinstance(prices, tuple) and len(prices) == 2 and all(_price_ok(price) for price in prices)


def sampling_reviewed(profile, sampling):
    """None, or a non-empty tuple of (name, number) pairs: each name one of the profile's
    sampling_keys, named once, each number a finite int or float (never a bool)."""
    if sampling is None:
        return True
    keys = getattr(profile, 'sampling_keys', ())
    return (type(sampling) is tuple and len(sampling) >= 1
            and all(type(pair) is tuple and len(pair) == 2 and pair[0] in keys and type(pair[1]) in (int, float)
                    and math.isfinite(pair[1]) for pair in sampling)
            and len({pair[0] for pair in sampling}) == len(sampling))


def efforts_reviewed(profile, efforts):
    """Spec 2026-10-12 section 4.5: a non-empty tuple of distinct words from the profile's effort_words
    (None there is no effort member at all). Membership is checked first, so an unhashable item is refused, not raised."""
    words = getattr(profile, 'effort_words', ())
    return (type(efforts) is tuple and 1 <= len(efforts) <= len(words)
            and all(word is None or type(word) is str for word in efforts)
            and all(word in words for word in efforts) and len(set(efforts)) == len(efforts))


def effort_word(value):
    """Spec 2026-10-12 section 4.5: a level as the records name it, 'default' for no effort member (None)."""
    return 'default' if value is None else value


def row_reviewed(profile, model, row):
    """A row the gate will price with: positive ceiling prices under MAX_PRICE_USD_PER_M, a sane
    bound, a reviewed thinking-level menu (efforts_reviewed), a well-formed sampling (if any), a valid path, and a
    full-size request that reserves no more than the profile's per-call cap."""
    return bool(isinstance(model, str) and MODEL_ID_PATTERN.fullmatch(model) and '..' not in model
                and getattr(row, 'model', None) == model and isinstance(row.maker, str) and 1 <= len(row.maker) <= 64
                and prices_ok(profile.ceiling_prices(row)) and helper.path_valid(profile.path_for(row))
                and _int_in(row.output_bound, 1, MAX_OUTPUT_BOUND)
                and efforts_reviewed(profile, getattr(row, 'efforts', None))
                and type(row.json_object) is bool and sampling_reviewed(profile, getattr(row, 'sampling', None))
                and worst_case_reservation(profile, row) <= profile.per_call_cap_usd
                and final_writer_row_reviewed(profile, row))


def final_writer_row_reviewed(profile, row):
    """LG-B: a row without its own maximum, or on a profile without the tier, has no final-writer tier (it is refused for
    one). Otherwise its maximum is between its standard bound and MAX_OUTPUT_BOUND, and a full-size final-writer request
    reserves no more than the tier's cap."""
    bound = getattr(row, 'final_writer_output_bound', None)
    limits = final_writer_tier_of(profile)
    if bound is None or limits is None:
        return True
    return (_int_in(bound, row.output_bound, MAX_OUTPUT_BOUND)
            and worst_case_reservation(profile, row, 'FINAL_WRITER') <= limits[1])


def final_writer_profile_reviewed(profile):
    """LG-B: a profile's final-writer tier, when it has one: a cap above 0 and at most MAX_PROFILE_CALL_CAP_USD, and a
    request size from its standard size up to MAX_PROFILE_REQUEST_BYTES."""
    limits = final_writer_tier_of(profile)
    if limits is None:
        return True
    size, cap = limits
    return (type(cap) is Decimal and Decimal(0) < cap <= MAX_PROFILE_CALL_CAP_USD
            and _int_in(size, profile.max_request_bytes, MAX_PROFILE_REQUEST_BYTES))


def profile_of(provider):
    """The reviewed profile a GO names, or None. Its cap and size must be in bounds and every row
    of it must pass review."""
    profile = helper.PROFILES.get(provider) if isinstance(provider, str) else None
    try:
        reviewed = bool(
            profile is not None and getattr(profile, 'name', None) == provider and profile.rows
            and type(profile.per_call_cap_usd) is Decimal and Decimal(0) < profile.per_call_cap_usd <= MAX_PROFILE_CALL_CAP_USD
            and _int_in(profile.max_request_bytes, 1024, MAX_PROFILE_REQUEST_BYTES)
            and final_writer_profile_reviewed(profile)
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


def largest_final_writer_reservation(profile, models):
    """LG-B: the largest full-size final-writer hold among these models (0 when none has the tier)."""
    worst = [worst_case_reservation(profile, profile.rows[model], 'FINAL_WRITER') for model in models
             if final_writer_tier_of(profile) is not None
             and getattr(profile.rows[model], 'final_writer_output_bound', None) is not None]
    return max(worst) if worst else Decimal(0)


def in_flight_worst_case(profile, models, max_concurrent, final_writer_calls):
    """What every call slot may hold at once: up to final_writer_calls of them at the largest final-writer worst case,
    the rest at the largest standard one. With no final-writer calls (every GO before LG-B): max_concurrent x the
    largest standard worst case, exactly as before."""
    standard = largest_reservation(profile, models)
    final_writer = min(final_writer_calls, max_concurrent)
    if final_writer == 0:
        return max_concurrent * standard
    return ((max_concurrent - final_writer) * standard
            + final_writer * max(standard, largest_final_writer_reservation(profile, models)))


def final_writer_models_valid(profile, models):
    """LG-B (fix round 1): a GO may name max_final_writer_calls only when its profile has the final-writer tier and every
    model it enables has its own maximum (final_writer_output_bound); otherwise no final writer could ever be served."""
    return final_writer_tier_of(profile) is not None and all(
        getattr(profile.rows[model], 'final_writer_output_bound', None) is not None for model in models)


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
        and Decimal('0.01') <= Decimal(budget) <= MAX_GO_BUDGET_USD
        and _int_in(go['max_paid_posts_per_day'], 1, 5000) and _int_in(go['max_concurrent_calls'], 1, MAX_CONCURRENT_CALLS)
        and ('max_final_writer_calls' not in go or (_int_in(go['max_final_writer_calls'], 1, go['max_concurrent_calls'])
                                                    and final_writer_models_valid(profile, go['enabled_models'])))
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
    limits = {name: go[name] for name in ('daily_budget_usd', 'max_paid_posts_per_day', 'max_concurrent_calls', 'open_days')}
    # LG-B: only a GO that names it carries it, so older states read exactly as before.
    if 'max_final_writer_calls' in go:
        limits['max_final_writer_calls'] = go['max_final_writer_calls']
    return limits


def day_ledger_name(day):
    if not isinstance(day, str) or not DAY_PATTERN.fullmatch(day):
        raise SafetyError('LEDGER_DAY_INVALID')
    return 'team-ledger-' + day + '.json'


def day_spend(ledger):
    """Held amounts of every entry reserved on this day: pending, settled, booked at the reservation and
    uncertain. A released_unbilled entry holds exactly 0 (its reservation stays recorded beside it); a
    settled_reserved_max entry holds exactly its reservation."""
    total = Decimal(0)
    for entry in ledger['entries'].values():
        held = helper.decimal_amount(entry.get('held_usd')) if isinstance(entry, dict) else None
        reserved = helper.decimal_amount(entry.get('reserved_usd')) if isinstance(entry, dict) else None
        if held is None or reserved is None or entry.get('state') not in ENTRY_STATES:
            raise SafetyError('LEDGER_ENTRY_INVALID')
        if entry['state'] == 'released_unbilled':
            if held != 0:
                raise SafetyError('LEDGER_ENTRY_INVALID')
        elif entry['state'] == BOOKED_MAX:
            if held != reserved:
                raise SafetyError('LEDGER_ENTRY_INVALID')
        elif entry['state'] != 'settled' and held < reserved:
            raise SafetyError('LEDGER_ENTRY_UNDER_RESERVED')
        total += held
    return total


def unbilled_releases(ledger):
    """Today's refusals released as unbilled (kept on the record at $0)."""
    return sum(1 for entry in ledger['entries'].values() if entry['state'] == 'released_unbilled')


def booked_max(ledger):
    """Today's calls booked at their reservation (settled_reserved_max): (count, amount)."""
    booked = [entry for entry in ledger['entries'].values() if entry['state'] == BOOKED_MAX]
    return len(booked), sum((helper.decimal_amount(entry['held_usd']) for entry in booked), Decimal(0))


def paid_posts(ledger):
    """Today's calls that count toward max_paid_posts_per_day: every entry but the unbilled releases."""
    return len(ledger['entries']) - unbilled_releases(ledger)


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
                                                    for k, v in in_flight.items())
            and cooling_valid(control.get('cooling', {}))):
        raise SafetyError('CONTROL_INVALID')
    return control


COOLING_KEYS = frozenset({'refusals', 'window_seconds', 'until_utc', 'trial'})


def _utc_text_valid(value):
    try:
        return datetime.fromisoformat(value).tzinfo is not None
    except (TypeError, ValueError):
        return False


def cooling_valid(cooling):
    """The per-model cool-off records: {model: {refusals, window_seconds, until_utc, trial}}. Only
    this gate writes them. A window is 0 (not cooling yet, and then there is no end time) or any
    whole number of seconds up to COOLING_RECORD_MAX_SECONDS, with a timezone-aware end time; a
    window above today's COOL_OFF_MAX_SECONDS is accepted here and clamped on read (cooling_clamped)."""
    return isinstance(cooling, dict) and all(
        isinstance(model, str) and isinstance(record, dict) and set(record) == COOLING_KEYS
        and _int_in(record['refusals'], 0, 2 ** 62)
        and _int_in(record['window_seconds'], 0, COOLING_RECORD_MAX_SECONDS)
        and (record['window_seconds'] == 0) == (record['until_utc'] is None)
        and (record['until_utc'] is None or _utc_text_valid(record['until_utc']))
        and (record['trial'] is None or isinstance(record['trial'], str))
        for model, record in cooling.items())


def cooling_clamped(control):
    """On read: every stored window above today's COOL_OFF_MAX_SECONDS is cut down to it (a later,
    lower maximum). The stored end time is kept: it was at most COOLING_RECORD_MAX_SECONDS ahead
    when written, so it runs out by itself, and the next refusal doubles from the clamped window."""
    for record in control.get('cooling', {}).values():
        record['window_seconds'] = min(record['window_seconds'], COOL_OFF_MAX_SECONDS)
    return control


def cooling_wait(control, model, moment):
    """Seconds until this model's cool-off lets a call through, or None when it may go now. When
    the window has ended, one call (the trial) goes through: while it is in flight the others wait."""
    record = control.get('cooling', {}).get(model)
    if record is None or record['until_utc'] is None:
        return None
    left = (datetime.fromisoformat(record['until_utc']) - moment).total_seconds()
    if left > 0:
        return min(COOL_OFF_MAX_SECONDS, max(1, int(-(-left // 1))))
    if record['trial'] is not None and record['trial'] in control['in_flight']:
        return COOL_OFF_FIRST_SECONDS  # The trial is still out; its answer decides.
    return None


def note_unbilled_refusal(control, model, entry_id, moment, retry_after=None):
    """One unbilled refusal for model: count it and, from COOL_OFF_AFTER_REFUSALS on, cool the model
    off. A refused trial doubles the window (up to COOL_OFF_MAX_SECONDS); a refusal of a call that was
    already in flight restarts the current window from now without doubling it. 2026-10-12: when the
    vendor named a Retry-After (whole seconds), the cool-off lasts max(window, retry_after), still never
    more than COOL_OFF_MAX_SECONDS; the stored window (what a refused trial doubles) stays the gate's own."""
    if not isinstance(model, str):
        return
    cooling = control.setdefault('cooling', {})
    record = cooling.get(model) or {'refusals': 0, 'window_seconds': 0, 'until_utc': None, 'trial': None}
    was_trial = record['trial'] == entry_id
    record['refusals'] += 1
    if was_trial:
        record['trial'] = None
    if record['refusals'] >= COOL_OFF_AFTER_REFUSALS:
        if record['window_seconds'] == 0:
            window = COOL_OFF_FIRST_SECONDS
        elif was_trial:
            window = min(COOL_OFF_MAX_SECONDS, record['window_seconds'] * 2)
        else:
            window = record['window_seconds']
        wait = window if not _int_in(retry_after, 0, 2 ** 31) else min(COOL_OFF_MAX_SECONDS, max(window, retry_after))
        until = moment + timedelta(seconds=wait)
        if record['until_utc'] is not None:
            until = max(until, datetime.fromisoformat(record['until_utc']))
        record.update(window_seconds=window, until_utc=iso(until))
    cooling[model] = record


def clear_cooling(control, model):
    """A settled reply for model: its cool-off and its count end."""
    if isinstance(model, str) and model in control.get('cooling', {}):
        del control['cooling'][model]


def clear_trial(control, model, entry_id):
    """A trial that was not reached proves nothing: the next call may be the trial."""
    record = control.get('cooling', {}).get(model) if isinstance(model, str) else None
    if record is not None and record['trial'] == entry_id:
        record['trial'] = None


def cooling_summary(control, moment):
    """status's view of every model's cool-off record (read-only)."""
    return {model: {**record, 'cooling_now': cooling_wait(control, model, moment) is not None}
            for model, record in sorted(control.get('cooling', {}).items())}


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
        return cooling_clamped(validate_control(helper.read_json(self.dir_fd, CONTROL_NAME, CONTROL_BYTES)))

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
    """Today's held amount and call count per model (every entry records its model). Unbilled
    releases are counted apart (day_summary's today_unbilled_releases)."""
    totals = {}
    for entry in ledger['entries'].values():
        if entry['state'] == 'released_unbilled':
            continue
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
            'today_posts': paid_posts(ledger), 'max_paid_posts_per_day': control['limits']['max_paid_posts_per_day'],
            'today_unbilled_releases': unbilled_releases(ledger), 'cooling': cooling_summary(control, moment),
            'today_booked_max': booked_max(ledger)[0], 'today_booked_max_usd': format(booked_max(ledger)[1], 'f'),
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


def other_gate_budget(path, provider, owner_uid=0):
    """The daily_budget_usd of another provider gate's GO file, for the team total.

    A missing file counts 0 (that gate is not installed). A file that exists must be a regular
    file (not a symlink: O_NOFOLLOW) owned by owner_uid (root) that group and others cannot
    write, holding a GO object with this schema, the expected provider and a valid
    daily_budget_usd; anything else refuses TEAM_TOTAL_UNVERIFIABLE. Only these three fields are
    judged: that gate's own activate checks the rest against its own code."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)  # NONBLOCK: a FIFO cannot hang it.
    except FileNotFoundError:
        return Decimal(0)
    except OSError:
        raise SafetyError('TEAM_TOTAL_UNVERIFIABLE') from None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != owner_uid or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            raise SafetyError('TEAM_TOTAL_UNVERIFIABLE')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(TEAM_GO_BYTES + 1)
        go = json.loads(raw) if len(raw) <= TEAM_GO_BYTES else None
    except SafetyError:
        raise
    except (OSError, ValueError, TypeError, RecursionError):
        raise SafetyError('TEAM_TOTAL_UNVERIFIABLE') from None
    finally:
        os.close(fd)
    budget = go.get('daily_budget_usd') if isinstance(go, dict) else None
    if not (isinstance(go, dict) and go.get('schema') == GO_SCHEMA and go.get('provider') == provider
            and isinstance(budget, str) and re.fullmatch(r'(0|[1-9][0-9]?)\.[0-9]{2}', budget)
            and Decimal('0.01') <= Decimal(budget) <= MAX_GO_BUDGET_USD):
        raise SafetyError('TEAM_TOTAL_UNVERIFIABLE')
    return Decimal(budget)


def team_total(go, gate_go_paths=None, owner_uid=0):
    """This GO's daily_budget_usd plus every other provider gate's (GATE_PATHS). gate_go_paths
    ({provider: GO path}) and owner_uid are the offline tests' seam; main() never passes them."""
    paths = {name: go_file for name, (_private, go_file) in GATE_PATHS.items()} if gate_go_paths is None else gate_go_paths
    total = Decimal(go['daily_budget_usd'])
    for provider, path in sorted(paths.items()):
        if provider != go['provider']:  # This provider's pot is the GO being activated.
            total += other_gate_budget(path, provider, owner_uid)
    return total


def activate(private, go_path, host=None, platform=None, now=None, gate_go_paths=None, owner_uid=0):
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host']:
        raise SafetyError('ACTIVATION_REFUSED')
    # Every slot holding the largest enabled worst case it may hold at once must still fit the day's pot (LG-B: the GO's
    # final-writer slots at the final-writer worst case).
    profile = profile_of(go['provider'])
    if in_flight_worst_case(profile, go['enabled_models'], go['max_concurrent_calls'], final_writer_slots(go)) \
            > Decimal(go['daily_budget_usd']):
        raise SafetyError('CONCURRENCY_EXCEEDS_BUDGET')
    # Root runs activate in a shell, outside the units that hide the gates' GOs from each other.
    if team_total(go, gate_go_paths, owner_uid) > TEAM_TOTAL_BUDGET_USD:
        raise SafetyError('TEAM_TOTAL_BUDGET_EXCEEDED')
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
    ceiling), which must equal the caller's to the digit.
    """
    profile = profile_of(go['provider'])
    if profile is None:
        raise SafetyError('ROOT_GO_INVALID')
    if not isinstance(input, dict) \
            or set(input) - {'callTier'} != {'scope_id', 'operationId', 'requestBody', 'requestSha256', 'reservedUsd'} \
            or input['scope_id'] != go['scope_id'] or not isinstance(input['operationId'], str) \
            or not re.fullmatch(r'[A-Za-z0-9-]{1,96}', input['operationId']) or not isinstance(input['requestBody'], str) \
            or hashlib.sha256(input['requestBody'].encode()).hexdigest() != input['requestSha256']:
        raise SafetyError('REQUEST_SCOPE_INVALID')
    # Length guidance LG-B (controller ruling 5): the tier is the app's declaration; the gate cannot see the step. A
    # final-writer request needs a GO that names max_final_writer_calls; the probe never sends one.
    tier = request_tier(input)
    if tier == 'FINAL_WRITER' and (probe or final_writer_slots(go) == 0):
        raise SafetyError('PREVIEW_CALL_TIER_INVALID')
    max_bytes, cap = tier_limits(profile, tier)
    if len(input['requestBody'].encode()) > max_bytes:
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
    checked = tier_row(profile, row, tier)  # The tier's own output bound (a final writer's: the row's own maximum).
    if not profile.body_valid(body, checked):
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
    # A request that asks for a cache write reserves at the profile's cache-write prices (never above the ceiling).
    moment = moment or helper.utc_now()
    prices = (profile.reservation_prices(row, moment, len(raw), cache_write=True) if cache_write_of(profile, body)
              else profile.reservation_prices(row, moment, len(raw)))
    ceiling = profile.ceiling_prices(row)
    if not prices_ok(prices) or prices[0] > ceiling[0] or prices[1] > ceiling[1] \
            or not helper.path_valid(profile.path_for(row)):
        raise SafetyError('REQUEST_INVALID')  # Cannot happen for a reviewed profile; checked anyway.
    reserved = reservation_for(len(raw), checked, prices)
    if reserved > cap:
        raise SafetyError('REQUEST_INVALID')  # Cannot happen for a reviewed row; checked anyway.
    if helper.decimal_amount(input['reservedUsd']) != reserved:
        raise SafetyError('RESERVATION_MISMATCH')
    return outgoing, reserved, checked, prices


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


class ModelCooling(SafetyError):
    """MODEL_COOLING: this model is cooling off after unbilled refusals (note_unbilled_refusal).
    Nothing was reserved and the vendor was not contacted; retry_after is in whole seconds."""

    def __init__(self, retry_after):
        super().__init__('MODEL_COOLING')
        self.retry_after = retry_after


def reserve_call(private, go, go_sha, input, reserved, row, host, peer_uid, now, probe=False, prices=None,
                 cache_write=False):
    """Lock, check state, today's team limits and the model's cool-off, durably write the pending
    hold, unlock. A halted gate refuses AUTHORITY_HALTED here, before anything is reserved. A call that
    asked for a cache write says so in its entry (cache_write_requested: '5m')."""
    prices = (row.input_usd_per_m, row.output_usd_per_m) if prices is None else prices
    # Spec 2026-10-12 section 4.5: the entry records the level the BODY carried ('default' for no member).
    # validate_request accepted these exact bytes for this GO's profile, so they parse.
    requested_effort = effort_word(helper.PROFILES[go['provider']].body_effort(json.loads(input['requestBody'])))
    with TeamStore(private) as store:
        control = store.control()
        if control['state'] == 'halted':
            raise SafetyError('AUTHORITY_HALTED')
        if control['state'] != 'active' or control['go_sha256'] != go_sha or control['active_host'] != host \
                or control['scope_id'] != go['scope_id']:
            raise SafetyError('AUTHORITY_STOPPED')
        moment = current(now)
        # A probe id still in flight while no probe holds the probe lock: that probe died or could
        # not settle, so its hold may be paid and unrecorded. Halt, as serve start does for a crash.
        # Nothing of this call is reserved yet, so it is told the gate is halted.
        probes = sorted(i for i in control['in_flight'] if i.startswith(PROBE_ENTRY_PREFIX))
        if probes and not probe_running(store):
            _halt(control, 'interrupted_probe', moment, probes[0])
            store.save_control(control)
            raise SafetyError('AUTHORITY_HALTED')
        if moment >= datetime.fromisoformat(control['open_until_utc']):
            _halt(control, 'open_window_expired', moment)
            store.save_control(control)
            raise SafetyError('AUTHORITY_EXPIRED')
        day = bucharest_day(moment)
        ledger = store.ledger(day)
        entry_id = entry_id_of(go, input, probe)
        if entry_id in ledger['entries'] or entry_id in control['in_flight']:
            raise SafetyError('DUPLICATE_OPERATION')
        if paid_posts(ledger) >= go['max_paid_posts_per_day']:
            raise SafetyError('DAILY_CALL_LIMIT_REACHED')
        if day_spend(ledger) + reserved > Decimal(go['daily_budget_usd']):
            raise SafetyError('TEAM_DAILY_BUDGET_REACHED')
        # This model only: nothing is reserved and the vendor is not contacted. A probe (root, one
        # deliberate call) is never refused for it; when the window has ended, this call is the trial.
        if not probe:
            wait = cooling_wait(control, row.model, moment)
            if wait is not None:
                raise ModelCooling(wait)
            record = control.get('cooling', {}).get(row.model)
            if record is not None and record['until_utc'] is not None:
                record['trial'] = entry_id
        # The entry records what this call was priced as: identity checks and settlement use it.
        ledger['entries'][entry_id] = {'state': 'pending', 'reserved_usd': str(reserved), 'held_usd': str(reserved),
                                       'reserved_at': iso(moment), 'request_sha256': input['requestSha256'],
                                       'provider': go['provider'], 'model': row.model, 'maker': row.maker,
                                       'reserve_input_usd_per_m': str(prices[0]), 'reserve_output_usd_per_m': str(prices[1]),
                                       'output_bound': row.output_bound,
                                       # LG-B (controller ruling 5): logged per tier; a standard entry is unchanged.
                                       **({'call_tier': 'FINAL_WRITER'} if request_tier(input) == 'FINAL_WRITER' else {}),
                                       'requested_effort': requested_effort, 'peer_uid': peer_uid,
                                       **({'cache_write_requested': '5m'} if cache_write else {}),
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
            control.pop('unsent_counted_at', None)  # So the next failure starts a new streak (section 3.4).
            clear_cooling(control, entry.get('model'))  # And this model answered: its cool-off ends.
        elif entry['state'] == BOOKED_MAX:
            # No answer: the streak and the model's cool-off stay as they are; a trial proves nothing.
            clear_trial(control, entry.get('model'), entry_id)
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


class ChargeBookedMax(SafetyError):
    """PROVIDER_CHARGE_BOOKED_MAX: this call was sent and its charge cannot be known (the vendor connection then
    failed or timed out, a server error without a bill, or, owner answer M3, an unreported charge), and its full
    reservation is booked as its charge (settled_reserved_max). The gate stays active and the IPC handler does not
    halt for it: the booking is already on the record."""


class _FailedAfterSend(Exception):
    """Internal: a call to book at its reservation. Either the transport raised one of
    BOOKABLE_TRANSPORT_FAILURES (error_class: its class name; reason transport_failure), or (owner ruling
    2026-10-15) the vendor answered a server error its profile's bookable_server_error found without any
    billing field (reason vendor_server_error, with the HTTP status and vendor_refusal_facts)."""

    def __init__(self, error_class=None, http_status=None, facts=None):
        super().__init__('failed_after_send')
        if error_class is not None:
            self.reason, self.details = 'transport_failure', {'error_class': error_class}
        else:
            self.reason = 'vendor_server_error'
            self.details = {'http_status': http_status if type(http_status) is int else None,
                            **(facts if isinstance(facts, dict) else no_vendor_facts())}


class UnbilledRefusal(Exception):
    """The provider answered with a refusal its profile proves unbilled (profile.unbilled_refusal):
    released by release_unbilled, which keeps the entry at $0. busy (profile.busy_refusal): the
    vendor said it is busy (cools the model off) rather than another error (grows the unsent streak)."""

    def __init__(self, status, busy, facts=None):
        super().__init__('unbilled_refusal')
        self.status = status if type(status) is int else None
        self.busy = busy is True
        self.facts = facts if isinstance(facts, dict) else no_vendor_facts()


def no_vendor_facts():
    return {'vendor_retry_after_seconds': None, 'vendor_rate_limit_headers': [], 'vendor_error': None}


def vendor_refusal_facts(response, kept, moment):
    """What an unbilled release keeps of the vendor's answer (2026-10-12), so the owner can tell an
    account rate limit from a busy model: its Retry-After as whole seconds (0..3600, else None), the
    names of its rate-limit headers (from the transport's vendor_headers; anything malformed is none),
    and its error's type, code and short, redacted message (helper.vendor_error_summary of the
    already-redacted answer). Never the request, never another header, never a rate-limit value."""
    try:
        kept = kept if isinstance(kept, dict) else {}
        names = kept.get('rate_limit_header_names')
        if not (isinstance(names, list) and all(isinstance(name, str) and helper.RATE_LIMIT_HEADER_NAME.fullmatch(name)
                                                for name in names)):
            names = []
        return {'vendor_retry_after_seconds': helper.retry_after_seconds(kept.get('retry_after'), moment),
                'vendor_rate_limit_headers': sorted(set(names))[:helper.MAX_RATE_LIMIT_HEADER_NAMES],
                'vendor_error': helper.vendor_error_summary(response)}
    except Exception:  # noqa: BLE001 - facts are a record only: a bad answer must never make the release uncertain
        return no_vendor_facts()


def grow_unsent_streak(control, entry, moment):
    """Grow the unsent streak for this released entry unless its call was in flight together with the
    last counted failure (spec 2026-10-12 parallel calls section 3.4, owner ruling O8): a call reserved
    BEFORE 'unsent_counted_at' was already in flight when that failure was counted, so the same blip
    is not counted twice. Full-precision times, compared as times (not text). Reserve and release
    each read the clock under the store lock, so a call reserved after a counted release is never
    earlier than it; an equal time (only a frozen test clock) counts, as before this rule (fail
    closed). Returns True when the streak grew; only then may the caller halt."""
    counted = control.get('unsent_counted_at')
    if counted is not None and datetime.fromisoformat(entry['reserved_at']) < datetime.fromisoformat(counted):
        return False
    control['unsent_streak'] = control.get('unsent_streak', 0) + 1
    control['unsent_counted_at'] = iso(moment)
    return True


def release_unsent(private, entry_id, day, now):
    """Lock, count one provably unsent call (halting at UNSENT_HALT_STREAK with no settled reply in
    between), drop its pending hold from the day ledger, clear it from in flight, unlock. A cool-off
    trial that was not reached proves nothing about the model: the next call may be the trial.

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
        grew = grow_unsent_streak(control, entry, moment)  # Calls in flight together count once (section 3.4).
        streak = control.get('unsent_streak', 0)
        clear_trial(control, entry.get('model'), entry_id)
        if grew and streak >= UNSENT_HALT_STREAK:
            _halt(control, 'provider_unreachable', moment, entry_id)
        store.save_control(control)
        del ledger['entries'][entry_id]
        store.save_ledger(ledger)
        control['in_flight'].pop(entry_id, None)
        store.save_control(control)
        return {'authority': control['state'], 'unsent_streak': streak}


def release_unbilled(private, entry_id, day, http_status, now, busy=True, facts=None):
    """Lock, release the hold of a refusal the profile proved unbilled, unlock.

    Unlike a provably unsent call, the entry stays on its reservation day's ledger: state
    'released_unbilled', held_usd "0", with the HTTP status, the reason, the time and the vendor's
    facts (vendor_refusal_facts: Retry-After seconds, rate-limit header names, error). There is no
    daily ceiling (status shows the day's count; the halt watcher emails once a day past a threshold).

    busy (the profile's busy_refusal: DeepInfra's 429, Anthropic's 429 and 529) never halts the gate
    (owner direction 2026-10-11: the vendor answered, and nothing was billed): it neither grows nor
    resets the unsent streak and counts toward its model's cool-off instead (note_unbilled_refusal).
    Not busy (Anthropic's 400, 404, 413 and 500; review 2026-10-12): as before gate v4, it grows the
    unsent streak (UNSENT_HALT_STREAK with no settled reply in between halt with provider_unreachable)
    and never cools the model; a cool-off trial answered so proves nothing, so the next call may be
    the trial (as for a trial that was not reached).

    Write order as for a settlement: the control file (the model's cool-off, or the streak and any
    halt) first, then the ledger, then in flight is cleared. Dying after the first write leaves a pending entry in flight
    (serve start halts on it: fail closed); after the second, a released_unbilled entry still in
    flight, which serve start drops (its record is complete and nothing was billed).
    """
    with TeamStore(private) as store:
        control = store.control()
        moment = current(now)
        ledger = store.ledger(day)
        entry = ledger['entries'].get(entry_id)
        if entry is None or entry['state'] != 'pending' or control['in_flight'].get(entry_id) != day:
            raise SafetyError('SETTLEMENT_STATE_INVALID')
        released = unbilled_releases(ledger) + 1
        facts = facts if isinstance(facts, dict) else no_vendor_facts()
        if busy:
            note_unbilled_refusal(control, entry.get('model'), entry_id, moment, facts.get('vendor_retry_after_seconds'))
        else:
            grew = grow_unsent_streak(control, entry, moment)  # Calls in flight together count once (section 3.4).
            clear_trial(control, entry.get('model'), entry_id)
            if grew and control['unsent_streak'] >= UNSENT_HALT_STREAK:
                _halt(control, 'provider_unreachable', moment, entry_id)
        store.save_control(control)
        entry.update(state='released_unbilled', held_usd='0', reason='unbilled_refusal',
                     http_status=http_status if type(http_status) is int else None, released_at=iso(moment), **facts)
        store.save_ledger(ledger)
        control['in_flight'].pop(entry_id, None)
        store.save_control(control)
        record = control.get('cooling', {}).get(entry.get('model'), {})
        return {'authority': control['state'], 'unsent_streak': control.get('unsent_streak', 0),
                'unbilled_releases_today': released, 'model_cooling_until_utc': record.get('until_utc')}


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
    interrupted entry). LG-B: final_writer_limit of the slots (the GO's max_final_writer_calls, 0: none) may hold a
    final-writer call at once."""

    def __init__(self, limit, final_writer_limit=0):
        self.limit = limit
        self.final_writer_limit = final_writer_limit
        self._semaphore = threading.BoundedSemaphore(limit)
        self._final_writer = threading.BoundedSemaphore(final_writer_limit) if final_writer_limit > 0 else None
        self.tripped = False

    def trip(self):
        self.tripped = True

    def acquire(self, wait):
        return self._semaphore.acquire(timeout=wait)

    def release(self):
        self._semaphore.release()

    def acquire_final_writer(self, wait):
        return self._final_writer is not None and self._final_writer.acquire(timeout=wait)

    def release_final_writer(self):
        self._final_writer.release()


def execute_request(private, go_path, input, *, peer_uid, slots, dispatch=None, key_loader=None, host=None,
                    platform=None, now=None, slot_wait=SLOT_WAIT_SECONDS, cancelled=None, on_reserved=None,
                    probe=False, on_settled=None):
    """One paid call. probe is only ever passed by probe() (root, checked there): it allows a
    reviewed model the GO does not enable and root as the caller; everything else is the same."""
    accepted = time.monotonic()
    now = now or helper.utc_now
    go, go_sha = load_go(go_path)
    profile = profile_of(go['provider'])
    outgoing, reserved, row, prices = validate_request(input, go, probe=probe, moment=current(now))
    # validate_request accepted these exact bytes, so they parse; its reservation already priced the write.
    cache_write = cache_write_of(profile, json.loads(input['requestBody']))
    host, platform = host or socket.gethostname(), platform or sys.platform
    if platform != 'linux' or host != go['target_host'] or type(peer_uid) is not int \
            or not (peer_uid in go['allowed_peer_uids'] or probe and peer_uid == 0):
        raise SafetyError('EXECUTION_AUTHORITY_REFUSED')
    if slots.limit != go['max_concurrent_calls'] or getattr(slots, 'final_writer_limit', 0) != final_writer_slots(go):
        raise SafetyError('SERVE_RESTART_REQUIRED')
    # LG-B (fix round 1): a final writer first takes one of the GO's final-writer slots, waiting for it while it holds
    # nothing, and only then a general slot; either refusal is unbilled, like a full gate. No deadlock: only a final
    # writer ever waits on the final-writer slots, and it does so before it holds a general slot, so no holder of a
    # general slot ever waits on them (the one wait while holding something is a final writer's wait for a general
    # slot, which every holder frees without waiting on anything). And a waiting final writer never keeps a standard
    # call out of a general slot.
    final_writer_held = False
    if request_tier(input) == 'FINAL_WRITER':
        if not slots.acquire_final_writer(slot_wait):
            raise SafetyError('CONCURRENCY_LIMIT_REACHED')
        final_writer_held = True
    general_held = False
    try:
        general_held = slots.acquire(slot_wait)
    finally:
        if final_writer_held and not general_held:
            slots.release_final_writer()
    if not general_held:
        raise SafetyError('CONCURRENCY_LIMIT_REACHED')
    try:
        if cancelled is not None and cancelled():
            raise SafetyError('CALLER_CANCELED_BEFORE_DISPATCH')
        key = (key_loader or helper.read_key)(private)
        # A key of another shape (another provider's key put in this gate's folder) is never sent.
        key_pattern = getattr(profile, 'key_pattern', None)
        if key_pattern is not None and not (isinstance(key, str) and re.fullmatch(key_pattern, key)):
            raise SafetyError('KEY_SHAPE_INVALID')
        if slots.tripped:
            raise SafetyError('AUTHORITY_STOPPED')
        # The keyword only when it is True, as for the profile calls: every other call keeps its old shape.
        entry_id, day = reserve_call(private, go, go_sha, input, reserved, row, host, peer_uid, now, probe, prices,
                                     **({'cache_write': True} if cache_write else {}))
        if on_reserved is not None:
            on_reserved(entry_id)
        budget, started = Decimal(go['daily_budget_usd']), time.monotonic()
        event = {'event': 'preview_provider_paid_post', 'operation_id': input['operationId'], 'day': day}
        try:
            # The upstream timeout is what remains after the slot wait and the reservation lock.
            send = dispatch or helper.HttpsTransport(timeout=max(1.0, CALL_DEADLINE_SECONDS - (time.monotonic() - accepted)),
                                                     profile=profile, path=profile.path_for(row))
            try:
                status, raw_response = send(outgoing, key)
            except helper.RequestNotSent:
                raise
            except BOOKABLE_TRANSPORT_FAILURES as failure:
                # Owner ruling 2026-10-12: sent, then the connection failed or timed out (no reply read).
                raise _FailedAfterSend(type(failure).__name__) from None
            raw_response = raw_response if isinstance(raw_response, dict) else {}
            # 2026-10-12: what the transport kept of the answer's headers (Retry-After, rate-limit header names).
            kept_headers = getattr(send, 'vendor_headers', None)
            # Owner ruling 5 (2026-10-10): a refusal the profile proves unbilled (DeepInfra: a 429
            # with an error and no usage, choices or cost anywhere) counts as not sent. It is judged
            # on the RAW reply: redaction drops whole subtrees (headers, secrets), which could hide a
            # billing field. A hook that fails lands in the uncertain branch below, as any doubt does.
            unbilled = profile.unbilled_refusal(status, raw_response)
            # Review 2026-10-12: only a busy refusal cools the model off; any other unbilled error
            # (Anthropic's 400/404/413/500) grows the unsent streak instead, as before gate v4.
            busy = bool(unbilled) and profile.busy_refusal(status, raw_response) is True
            response = helper.redact(raw_response, key, profile.redaction_patterns)
            if unbilled:
                raise UnbilledRefusal(status, busy, vendor_refusal_facts(response, kept_headers, current(now)))
            # Owner ruling 2026-10-15: a server error the profile finds without any billing field (DeepInfra's
            # 5xx, judged on the RAW reply as above) is booked at the reservation, as a connection that failed
            # after the send is. A profile without the hook (Anthropic) is unchanged; a hook that fails halts.
            bookable = getattr(profile, 'bookable_server_error', None)
            if bookable is not None and bookable(status, raw_response) is True:
                raise _FailedAfterSend(http_status=status, facts=vendor_refusal_facts(response, kept_headers, current(now)))
        except (helper.RequestNotSent, UnbilledRefusal) as unsent:
            try:
                # Unsent: no entry kept. Unbilled: kept at $0 on the record, and cools its model off.
                outcome = (release_unbilled(private, entry_id, day, unsent.status, now, unsent.busy, unsent.facts)
                           if isinstance(unsent, UnbilledRefusal) else release_unsent(private, entry_id, day, now))
            except BaseException:
                # The hold could not be released: treat it exactly like an uncertain call.
                outcome = settle_or_halt(private, entry_id, day, {
                    'state': 'uncertain', 'held_usd': str(reserved), 'reason': 'release_failure',
                    'elapsed_seconds': round(time.monotonic() - started, 6)}, 'uncertain_charge', budget, now, slots)
                log_event({**event, 'status': 'uncertain', **outcome})
                raise SafetyError('NEW_CHARGE_UNCERTAIN') from None
            refused = isinstance(unsent, UnbilledRefusal)
            log_event({**event, 'status': 'not_sent', 'reason': 'unbilled_refusal' if refused else 'not_reached',
                       **({'vendor_busy': unsent.busy, **unsent.facts} if refused else {}), **outcome})
            if not refused:
                raise CallNotSent('PROVIDER_NOT_REACHED') from None
            raise CallNotSent('PROVIDER_REFUSED_UNBILLED' if unsent.busy else 'PROVIDER_ERROR_UNBILLED') from None
        except _FailedAfterSend as failed:
            # The reservation bounds the bill: book it as the charge and keep the gate active (no halt reason).
            # A settlement that cannot be written still halts (settle_or_halt), as for any call.
            outcome = settle_or_halt(private, entry_id, day, {
                'state': BOOKED_MAX, 'held_usd': str(reserved), 'reason': failed.reason, **failed.details,
                'elapsed_seconds': round(time.monotonic() - started, 6)},
                None, budget, now, slots)
            log_event({**event, 'model': row.model, 'status': BOOKED_MAX, 'alert': 'charge_booked_at_reservation',
                       'booked_usd': str(reserved), 'reason': failed.reason, **failed.details, **outcome})
            raise ChargeBookedMax('PROVIDER_CHARGE_BOOKED_MAX') from None
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
                                                               current(now), cache_write=cache_write)
        except BaseException:
            # Paid but unaccountable: keep the full hold and stop, as for a transport failure.
            changes, halt_reason, charge, reply = ({'state': 'uncertain', 'held_usd': str(reserved),
                                                    'reason': 'accounting_failure', 'elapsed_seconds': elapsed},
                                                   'uncertain_charge', None, None)
        # Owner answer M3 (2026-10-15; OVERVIEW B-3; rulings R1-R3, 2026-10-16): a paid reply whose usage or cost is
        # unreported is booked at its reservation when the profile's optional bookable_unreported finds the reservation
        # bounds it (judged on the RAW reply, as above, with its accounting): settled_reserved_max, reason
        # charge_unreported, no halt. Anything that may bill above the list price still halts; a hook that fails halts.
        # Controller ruling (Task 4b review, 2026-10-16): only a reply that names no model or exactly this call's model
        # (read as for provider_error_or_model_identity: profile.reply_model) is booked; another model may bill above
        # this row's prices, so it keeps halting (uncertain_charge) as before M3.
        if halt_reason == 'uncertain_charge' and changes.get('reason') == 'usage_or_cost_unreported':
            unreported = getattr(profile, 'bookable_unreported', None)
            try:
                bookable = (unreported is not None and profile.reply_model(raw_response) in (None, row.model)
                            and unreported(status, raw_response, changes['accounting'], reserved) is True)
            except BaseException:
                bookable = False
                changes = {**changes, 'reason': 'accounting_failure'}
            if bookable:
                changes = {**changes, 'state': BOOKED_MAX, 'held_usd': str(reserved), 'reason': 'charge_unreported'}
                outcome = settle_or_halt(private, entry_id, day, changes, None, budget, now, slots)
                log_event({**event, 'model': row.model, 'status': BOOKED_MAX, 'alert': 'charge_booked_at_reservation',
                           'booked_usd': str(reserved), 'reason': 'charge_unreported', 'http_status': changes['http_status'],
                           'elapsed_seconds': elapsed, **outcome})
                if on_settled is not None:  # The probe still prints what it measured.
                    on_settled({'changes': changes, 'halt_reason': None, 'response': response, 'row': row, **outcome})
                raise ChargeBookedMax('PROVIDER_CHARGE_BOOKED_MAX')
        outcome = settle_or_halt(private, entry_id, day, changes, halt_reason, budget, now, slots)
        log_event({**event, 'model': row.model, 'status': changes['state'], 'halt_reason': halt_reason,
                   'guard_charge_usd': charge, 'elapsed_seconds': elapsed, **outcome})
        if on_settled is not None:
            on_settled({'changes': changes, 'halt_reason': halt_reason, 'response': response, 'row': row, **outcome})
        if charge is None:
            raise SafetyError('NEW_CHARGE_UNCERTAIN')
        if halt_reason is not None:
            # Opaque to the caller (STOPPED): this call was reserved and sent. AUTHORITY_HALTED is
            # only ever the state check before a reservation.
            raise SafetyError('SETTLED_INTO_HALT')
        return reply
    finally:
        slots.release()  # In reverse: the general slot, then the final-writer slot.
        if final_writer_held:
            slots.release_final_writer()


def bounded_model_name(value):
    """What a reply named as its model, kept short in the ledger (any other value is recorded as None)."""
    return value if isinstance(value, str) and len(value) <= 128 else None


def assess_reply(status, response, reserved, elapsed, profile, row, moment, cache_write=False):
    """Ledger changes, halt reason, guard charge and caller reply for one redacted provider reply.
    Settled at the profile's prices for this row and moment (recorded in the entry); the reply
    must name this call's own model, not just any reviewed or enabled one. Only a call that asked for
    a cache write is settled with cache_write=True (its reply's cache tokens are then understood)."""
    accounting = bounded_accounting(profile.account(response, row, moment, cache_write=True) if cache_write
                                    else profile.account(response, row, moment))
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
    serving = slots is None or (not slots.tripped and slots.limit == limits['max_concurrent_calls']
                                and getattr(slots, 'final_writer_limit', 0) == limits.get('max_final_writer_calls', 0))
    # A probe id in flight (running, or left by a probe that died) makes the next reservation wait
    # or halt (interrupted_probe): say the window is shut, so no debate starts into that.
    serving = serving and not any(entry_id.startswith(PROBE_ENTRY_PREFIX) for entry_id in control['in_flight'])
    budget, spend = Decimal(limits['daily_budget_usd']), day_spend(ledger)
    profile = profile_of(control['provider'])
    if profile is None or not all(model in profile.rows for model in control['enabled_models']):
        raise SafetyError('REMAINING_UNAVAILABLE')  # The state names a row this code no longer reviews.
    reply = {
            'state': control['state'], 'window_open': bool(window_open(control, moment) and go_current and serving),
            # The app reads amounts as exact nano-USD (at most 9 decimals). A provider's reported cost
            # can carry more, so what is left is rounded DOWN and the largest hold UP: never in the
            # app's favour.
            'remaining_usd': nano_text(max(Decimal(0), budget - spend), ROUND_FLOOR),
            'remaining_calls': max(0, limits['max_paid_posts_per_day'] - paid_posts(ledger)),
            'max_concurrent_calls': limits['max_concurrent_calls'],
            'largest_reservation_usd': nano_text(largest_reservation(profile, control['enabled_models']), ROUND_CEILING),
            'enabled_models': list(control['enabled_models'])}
    # LG-B: only a state activated with a GO that names max_final_writer_calls answers its final-writer room.
    if limits.get('max_final_writer_calls', 0) > 0:
        reply['largest_final_writer_reservation_usd'] = nano_text(
            largest_final_writer_reservation(profile, control['enabled_models']), ROUND_CEILING)
        reply['final_writer_max_in_flight'] = limits['max_final_writer_calls']
    return control['scope_id'], allowed, reply


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
    # What was billed as output (completion, plus reasoning counted outside it), else completion.
    max_tokens = min(1024, row.output_bound)
    billed = accounting.get('billed_output_tokens')
    completion = billed if billed is not None else accounting.get('completion_tokens')
    return {'status': 'probed', 'provider': profile.name, 'model': row.model, 'maker': row.maker,
            'sent': {'max_tokens': max_tokens, 'effort': effort_word(row.efforts[0]),  # The row's default (probe_body).
                     **({'sampling': dict(row.sampling)} if getattr(row, 'sampling', None) else {})},
            # A model that bills past max_tokens would overrun its reservation in real use: do not enable it.
            'completion_within_max_tokens': completion <= max_tokens if type(completion) is int else None,
            'http_status': observed['changes'].get('http_status'),
            'model_echoed_exactly': observed['changes'].get('reply_model') == row.model,
            'reply_model': observed['changes'].get('reply_model'),
            'usage': {name: accounting.get(name) for name in ('prompt_tokens', 'completion_tokens', 'total_tokens',
                                                             'reasoning_tokens', 'billed_output_tokens', 'cached_tokens',
                                                             'usage_valid')},
            'guard_charge_usd': accounting.get('guard_charge_usd'),
            'provider_estimated_cost_usd': accounting.get('provider_estimated_cost_usd'),
            'entry_state': observed['changes'].get('state'), 'halt_reason': observed['halt_reason'],
            'authority': observed.get('authority'), 'reply_excerpt': excerpt}


class FenceRequired(SafetyError):
    """PROBE_FENCE_REQUIRED, with the names of the fence checks that failed (`missing`)."""

    def __init__(self, missing):
        super().__init__('PROBE_FENCE_REQUIRED')
        self.missing = list(missing)


def probe_unit_name(provider):
    return PROBE_UNIT_PREFIX + provider + '.service'


def path_hidden(path):
    """Whether this process can see nothing of path: it is absent, or it is the mode-0000 node
    that systemd's InaccessiblePaths= mounts over it and it cannot be opened. A real folder or
    file, or a symlink, is visible."""
    try:
        info = os.stat(path, follow_symlinks=False)
    except (FileNotFoundError, PermissionError):
        return True  # Absent, or a folder above it cannot be searched.
    except OSError:
        return False  # Cannot even tell: not proved hidden.
    if stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0:
        return False
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        return True
    os.close(fd)
    return False  # Mode 0000 but still opened (a capability such as CAP_DAC_OVERRIDE is left).


def datagram_leaves():
    """Whether an empty UDP datagram to FENCE_TEST_ADDRESS (a documentation address that is never
    routed) leaves this process. Under IPAddressDeny=any it is refused at once (EPERM); any error
    means it did not leave."""
    sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sender.sendto(b'', FENCE_TEST_ADDRESS)
    except OSError:
        return False
    finally:
        sender.close()
    return True


def check_probe_fence(provider, *, proc_root='/proc', gate_paths=None, retired_paths=None, datagram=None):
    """Refuses (PROBE_FENCE_REQUIRED, naming what is missing) unless this process runs inside the
    probe fence the README gives for this provider. Generic: every provider's probe runs it.

    unit         /proc/self/cgroup names the transient unit debateai-preview-probe-<provider>.service
                 (systemd-run --unit=debateai-preview-probe-<provider>)
    privileges   /proc/self/status shows NoNewPrivs 1 and no effective or bounding capability
                 (NoNewPrivileges=yes, CapabilityBoundingSet= empty)
    other_gates  every other provider gate's private folder and GO (GATE_PATHS) and the retired
                 gates' state (RETIRED_GATE_PATHS) are hidden (InaccessiblePaths=)
    network      a datagram to an address outside the allow-list does not leave (IPAddressDeny=any)

    proc_root, gate_paths, retired_paths and datagram are the offline tests' seam; probe() and
    main() never pass them.
    """
    gate_paths = GATE_PATHS if gate_paths is None else gate_paths
    retired_paths = RETIRED_GATE_PATHS if retired_paths is None else retired_paths
    datagram = datagram_leaves if datagram is None else datagram
    missing = []
    try:
        cgroup = Path(proc_root, 'self', 'cgroup').read_text()
    except (OSError, UnicodeError):
        cgroup = ''
    units = set()
    for line in cgroup.splitlines():
        parts = line.split(':', 2)
        if len(parts) == 3 and parts[1] in ('', 'name=systemd'):
            units.add(parts[2].rstrip('/').rsplit('/', 1)[-1])
    if not isinstance(provider, str) or probe_unit_name(provider) not in units:
        missing.append('unit')
    try:
        fields = dict(line.split(':', 1) for line in Path(proc_root, 'self', 'status').read_text().splitlines()
                      if ':' in line)
        fields = {name.strip(): value.strip() for name, value in fields.items()}
        privileges = (fields.get('NoNewPrivs') == '1' and int(fields.get('CapEff', 'x'), 16) == 0
                      and int(fields.get('CapBnd', 'x'), 16) == 0)
    except (OSError, UnicodeError, ValueError):
        privileges = False
    if not privileges:
        missing.append('privileges')
    others = [path for name, pair in sorted(gate_paths.items()) if name != provider for path in pair]
    if not all(path_hidden(path) for path in [*others, *retired_paths]):
        missing.append('other_gates')
    if datagram():
        missing.append('network')
    if missing:
        raise FenceRequired(missing)


def probe(private, go_path, model, *, dispatch=None, key_loader=None, host=None, platform=None, uid=None, now=None,
          fence=None):
    """Root only, inside the probe fence (check_probe_fence; fence is the offline tests' seam): one
    tiny paid call ("Reply exactly: OK") to a reviewed model of the GO's provider,
    even one the GO does not enable yet, through the normal reserve/settle/halt path. It counts in
    today's pot and call count, and a non-200 reply or another model in the reply halts the gate
    like any call. Prints status, whether the reply named the exact model, usage and the charge."""
    go = read_go(go_path)
    host, platform = host or socket.gethostname(), platform or sys.platform
    uid = os.getuid() if uid is None else uid
    if platform != 'linux' or uid != 0 or host != go['target_host']:
        raise SafetyError('ROOT_PROBE_REFUSED')
    # Before the key is read or anything is reserved.
    (fence or (lambda provider: check_probe_fence(provider)))(go['provider'])
    profile = profile_of(go['provider'])
    row = profile.rows.get(model) if isinstance(model, str) else None
    if row is None:
        raise SafetyError('MODEL_NOT_REVIEWED')
    raw = json.dumps(profile.probe_body(row), ensure_ascii=False, separators=(',', ':'))
    prices = profile.reservation_prices(row, current(now or helper.utc_now), len(raw.encode()))
    request = {'scope_id': go['scope_id'], 'operationId': 'probe-%x' % time.time_ns(), 'requestBody': raw,
               'requestSha256': hashlib.sha256(raw.encode()).hexdigest(),
               'reservedUsd': str(reservation_for(len(raw.encode()), row, prices))}
    observed = {}
    # Held for the whole probe: serve start refuses while it is held (so a restart cannot turn the
    # probe's call into a recovery halt), and a probe id left in flight without it halts serve's
    # next reservation (a probe that died or could not settle).
    lock_fd = hold_probe_lock(private)
    try:
        execute_request(private, go_path, request, peer_uid=0,
                        slots=CallSlots(go['max_concurrent_calls'], final_writer_slots(go)),
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
    entry becomes uncertain. An id without an entry was never dispatched and is dropped, as is an
    id whose entry is already released_unbilled (release_unbilled wrote its model's cool-off and
    its $0 record before dying; nothing was billed). An uncertain entry that no recorded halt names
    (on today's or an in-flight day's ledger) also halts. The halt is written first, so dying here
    repeats the recovery.
    """
    now = now or helper.utc_now
    with TeamStore(private) as store:
        if probe_running(store):
            raise SafetyError('PROBE_RUNNING')  # Its call is live, not interrupted; systemd retries the start.
        control = store.control()
        moment, in_flight = current(now), control['in_flight']
        ledgers = {day: store.ledger(day) for day in sorted(set(in_flight.values()) | {bucharest_day(moment)})}
        named = {event.get('entry_id') for event in control.get('halts', [])}
        interrupted = [(entry_id, day) for entry_id, day in sorted(in_flight.items()) if entry_id in ledgers[day]['entries']
                       and ledgers[day]['entries'][entry_id]['state'] != 'released_unbilled']
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
    if code == 'MODEL_COOLING' and isinstance(error, ModelCooling) and _int_in(error.retry_after, 1, COOL_OFF_MAX_SECONDS):
        return json.dumps({'error': code, 'retry_after': error.retry_after}).encode()
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
                if reserved and not isinstance(error, (CallNotSent, ChargeBookedMax)):
                    # Once a hold exists, any failure may lose a paid reply: halt, as for a lost reply.
                    # A provably unsent call released its hold already; nothing paid can be lost. A call
                    # booked at its reservation has no reply to lose and its charge is already recorded.
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
    # listen() backlog: socketserver's default (5) is below MAX_CONCURRENT_CALLS, and a full backlog
    # refuses a non-blocking Unix connect at once (EAGAIN) instead of queueing it.
    request_queue_size = MAX_IPC_CONNECTIONS

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
        slots = CallSlots(go['max_concurrent_calls'], final_writer_slots(go))

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
        if isinstance(error, FenceRequired):
            refusal['missing'] = error.missing  # Fixed check names: which part of the fence is absent.
        emit(refusal)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
