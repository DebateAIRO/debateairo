"""Custody, accounting and transport primitives, and the provider profiles, for the private
preview spending gate.

Adapted from the reviewed DeepInfra benchmark helper; it keeps only what the gate needs.
The gate runs this file from its own directory, only after checking that root owns it and no one
else can write it, and that its hash is the one the GO binds. It is never imported on its own.
No retries, external packages, environment proxies, redirects, or credential artifacts.

A provider profile is everything the gate knows about one vendor: its host and path, its auth
header, the exact request shape it forwards (and the bytes it sends), how a reply's usage is
priced, where a reply names its model, extra key shapes to blank, and its reviewed model rows
(prices, output bound, thinking-level menu, JSON mode, sampling). The GO names one profile (`provider`) and the rows it
enables; the GO binds this file's hash, so it binds every profile and every row too. A price
change is a reviewed code change here (plus the app's parity fixture), never a GO edit. Adding a
vendor means adding one profile class to PROFILES; the gate's core does not change.
"""
import fcntl
import http.client
import json
import os
import re
import ssl
import stat
import threading
import time
import unicodedata
from collections import namedtuple
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime

MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 1200  # The gate's CALL_DEADLINE_SECONDS (owner ruling 2026-10-12: 20 minutes, was 600).
CONNECT_TIMEOUT_SECONDS = 15  # TCP connect + TLS handshake; a black-holed address fails (unsent) fast.


# SafetyError is not defined here: the gate checks this file's custody and hash, then runs it with
# its own SafetyError already in the namespace, so the gate and the helper raise one class.


class ResponseTooLarge(SafetyError):  # noqa: F821 - provided by the gate
    pass


class RequestNotSent(SafetyError):  # noqa: F821 - provided by the gate
    """Provably unsent: the TCP connect or the TLS handshake failed, or the deadline passed, before
    http.client was asked to write any byte of the request. Nothing billable reached the provider."""


def utc_now():
    return datetime.now(timezone.utc)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str).encode('utf-8')


def private_dir_fd(private):
    try:
        fd = os.open(private, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise SafetyError('private_directory_not_safe') from None
    info = os.fstat(fd)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(fd)
        raise SafetyError('private_directory_owner_or_mode')
    return fd


def secure_open(dir_fd, name, flags, create=False):
    try:
        fd = os.open(name, flags | os.O_NOFOLLOW | (os.O_CREAT if create else 0), 0o600, dir_fd=dir_fd)
    except OSError:
        raise SafetyError('private_file_not_safe') from None
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        os.close(fd)
        raise SafetyError('private_file_owner_mode_or_links')
    return fd


def file_exists(dir_fd, name):
    try:
        os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return True


def lock(fd, operation, timeout):
    """Blocking flock with a deadline. Separate opens conflict across threads and processes."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            fcntl.flock(fd, operation | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise SafetyError('ledger_lock_timeout') from None
            time.sleep(0.005)


def read_json(dir_fd, name, limit):
    fd = secure_open(dir_fd, name, os.O_RDONLY)
    with os.fdopen(fd, 'rb') as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise SafetyError('state_file_too_large')
    try:
        return json.loads(raw)
    except ValueError:
        raise SafetyError('state_file_invalid') from None


def encode_json(value):
    return canonical(value) + b'\n'


def write_bytes(dir_fd, name, data):
    """Atomic owner-only replacement: temporary file, fsync, rename, directory fsync."""
    temporary = '.%s.%d.%d.%d.tmp' % (name, os.getpid(), threading.get_ident(), time.time_ns())
    try:
        fd = secure_open(dir_fd, temporary, os.O_WRONLY | os.O_EXCL, create=True)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        os.fsync(dir_fd)
    finally:
        try:
            os.unlink(temporary, dir_fd=dir_fd)
        except FileNotFoundError:
            pass


def write_json(dir_fd, name, value, limit):
    data = encode_json(value)
    if len(data) > limit:
        raise SafetyError('state_file_too_large')
    write_bytes(dir_fd, name, data)


def read_key(private):
    directory = private_dir_fd(private)
    try:
        fd = secure_open(directory, 'api-key.txt', os.O_RDONLY)
        with os.fdopen(fd, 'rb') as stream:
            if os.fstat(stream.fileno()).st_size > 513:
                raise SafetyError('key_file_too_large')
            raw = stream.read(514)
        key = raw.decode('ascii').strip()
        if not 16 <= len(key) <= 512 or any(ord(c) < 33 or ord(c) > 126 for c in key):
            raise SafetyError('invalid_key_format')
        return key
    except (UnicodeError, OSError):
        raise SafetyError('invalid_key_file') from None
    finally:
        os.close(directory)


def decimal_amount(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return amount if amount.is_finite() and amount >= 0 else None


def integer(value):
    return type(value) is int and value >= 0


def billed_output_tokens(prompt, completion, total, reasoning):
    """Output tokens to charge, on the careful side, or None when the counts contradict each other.

    Reasoning (thinking) tokens are charged as output. They count inside completion_tokens only
    when the reply proves it: total_tokens equal to prompt + completion, with reasoning no larger
    than completion. Otherwise (reasoning larger than completion, total equal to prompt +
    completion + reasoning, or no total at all) they are charged on top: completion + reasoning.
    Any other total does not add up, and the usage is not valid.
    """
    if reasoning is None or reasoning == 0:
        return completion if total is None or total == prompt + completion else None
    if total is None:
        return completion + reasoning  # Inclusion cannot be shown: charge both.
    if total == prompt + completion:
        return completion if reasoning <= completion else completion + reasoning
    if total == prompt + completion + reasoning:
        return completion + reasoning  # The total says reasoning was counted outside completion.
    return None


def account_response(response, input_price, output_price):
    """OpenAI-shape usage priced at one row's list prices (USD per million tokens). Reasoning
    tokens (in completion_tokens_details or at the top level of usage) are charged as
    billed_output_tokens says."""
    usage = response.get('usage')
    usage = usage if isinstance(usage, dict) else {}
    prompt, completion, total = usage.get('prompt_tokens'), usage.get('completion_tokens'), usage.get('total_tokens')
    prompt_details = usage.get('prompt_tokens_details') or {}
    completion_details = usage.get('completion_tokens_details') or {}
    details_valid = isinstance(prompt_details, dict) and isinstance(completion_details, dict)
    cached = prompt_details.get('cached_tokens', usage.get('cached_tokens')) if isinstance(prompt_details, dict) else None
    # Reasoning may be reported in the details, at the top level, or both: the larger one counts.
    reported = [value for value in (completion_details.get('reasoning_tokens') if isinstance(completion_details, dict) else None,
                                    usage.get('reasoning_tokens')) if value is not None]
    reasoning = max(reported) if reported and all(integer(value) for value in reported) else None
    valid = integer(prompt) and integer(completion) and details_valid
    valid = valid and all(integer(value) for value in reported)
    valid = valid and (total is None or integer(total))
    valid = valid and (cached is None or integer(cached) and cached <= prompt)
    output = billed_output_tokens(prompt, completion, total, reasoning) if valid else None
    valid = valid and output is not None
    configured = ((Decimal(prompt) * input_price + Decimal(output) * output_price) / Decimal(1000000)) if valid else None
    provider = decimal_amount(usage.get('estimated_cost', response.get('estimated_cost')))
    reliable = [value for value in (configured, provider) if value is not None]
    return {'input_usd_per_m': str(input_price), 'output_usd_per_m': str(output_price),  # The settlement prices.
            'prompt_tokens': prompt if integer(prompt) else None, 'completion_tokens': completion if integer(completion) else None,
            'total_tokens': total if integer(total) else None, 'cached_tokens': cached if integer(cached) else None,
            'reasoning_tokens': reasoning, 'billed_output_tokens': output if valid else None, 'usage_valid': valid,
            'configured_price_cost_usd': str(configured) if configured is not None else None,
            'provider_estimated_cost_usd': str(provider) if provider is not None else None,
            'guard_charge_usd': str(max(reliable)) if reliable else None,
            'cost_basis': 'max(configured uncached list-price usage, provider estimated cost)' if reliable else 'unknown; full reservation retained'}


def redact(value, key, patterns=()):
    """The key itself, any Bearer token and the profile's own key shapes are blanked everywhere."""
    sensitive = {'authorization', 'proxy-authorization', 'api_key', 'api-key', 'apikey', 'x-api-key', 'x-goog-api-key',
                 'headers', 'request_headers', 'access_token', 'refresh_token', 'secret'}
    if isinstance(value, dict):
        return {redact(str(k), key, patterns): redact(v, key, patterns) for k, v in value.items() if str(k).lower() not in sensitive}
    if isinstance(value, list):
        return [redact(v, key, patterns) for v in value]
    if isinstance(value, str):
        text = re.sub(r'(?i)bearer\s+[^\s"<>]+', 'Bearer [REDACTED]', value.replace(key, '[REDACTED]'))
        for pattern in patterns:
            text = re.sub(pattern, '[REDACTED]', text)
        return text
    return value


# What the gate keeps of a vendor answer it released unbilled (2026-10-12), so the owner can tell an
# account rate limit from a busy model: the Retry-After value and the NAMES of rate-limit headers (never
# their values, never any other header), and the error's type, code and a short, redacted message.
MAX_RETRY_AFTER_CHARS = 64
MAX_RETRY_AFTER_SECONDS = 3600
MAX_RATE_LIMIT_HEADER_NAMES = 16
RATE_LIMIT_HEADER_NAME = re.compile(r'(?:x-|anthropic-)?ratelimit-[a-z0-9-]{1,48}')
VENDOR_LABEL = re.compile(r'[A-Za-z0-9_.:-]{1,64}')
MAX_VENDOR_MESSAGE_CHARS = 200
VENDOR_MESSAGE_SCAN_CHARS = 2000
# Anything that may be a credential, an address or a link becomes [REDACTED] (in this order).
VENDOR_MESSAGE_REDACTIONS = tuple(re.compile(pattern) for pattern in (
    r'(?i)\b(?:[a-z][a-z0-9+.-]*)://\S+',                       # any URL
    r'(?i)\bwww\.\S+',
    r'[^\s@]+@[^\s@]+',                                       # an email (or any user@host)
    r'(?i)\bbearer\s+\S+',
    r'(?i)[\w.-]*(?:key|token|secret|passw|pwd|auth|credential|signature|session|cookie)[\w.-]*\s*[=:]\s*\S+',
    r'\S*\?\S*=\S*',                                          # a path with a query
    r'(?i)\b(?:sk|pk|rk|ak|key|tok|api)[-_][A-Za-z0-9_-]{6,}',   # prefixed key shapes (sk-..., tok_...)
    r'(?=[A-Za-z0-9_+/=.-]*[0-9])(?=[A-Za-z0-9_+/=.-]*[A-Za-z])[A-Za-z0-9_+/=.-]{24,}'))  # long mixed tokens
VENDOR_MESSAGE_SUSPECT = re.compile(r'(?i)@|://|bearer|[A-Za-z0-9_+/=.-]{40,}')


def vendor_headers(items):
    """What the gate keeps of an answer's headers: the first Retry-After value (trimmed, at most
    MAX_RETRY_AFTER_CHARS) and the sorted, lower-case names of its rate-limit headers (x-ratelimit-*,
    ratelimit-*, anthropic-ratelimit-*; at most MAX_RATE_LIMIT_HEADER_NAMES). No other header, and
    no rate-limit value, is ever kept."""
    retry_after, names = None, set()
    for item in items if isinstance(items, (list, tuple)) else ():
        if not (isinstance(item, tuple) and len(item) == 2 and isinstance(item[0], str) and isinstance(item[1], str)):
            continue
        name = item[0].strip().lower()
        if name == 'retry-after' and retry_after is None:
            retry_after = item[1].strip()[:MAX_RETRY_AFTER_CHARS]
        elif RATE_LIMIT_HEADER_NAME.fullmatch(name):
            names.add(name)
    return {'retry_after': retry_after, 'rate_limit_header_names': sorted(names)[:MAX_RATE_LIMIT_HEADER_NAMES]}


def retry_after_seconds(value, moment):
    """A Retry-After value as whole seconds from moment: delta-seconds (ASCII digits only) or an
    HTTP-date (a part second counts as a whole one; a past date is 0), clamped to 0..3600. Anything
    else (absent, empty, signed, decimal, junk) is None."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if re.fullmatch(r'[0-9]+', text):
        return min(int(text[:12]), MAX_RETRY_AFTER_SECONDS)
    if not text or not re.search(r'[A-Za-z]', text):
        return None
    try:
        when = parsedate_to_datetime(text)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    seconds = (when - moment).total_seconds()
    return max(0, min(MAX_RETRY_AFTER_SECONDS, int(-(-seconds // 1))))


def safe_vendor_message(text):
    """An error message fit to keep: control and format characters gone, whitespace collapsed,
    anything like a key, token, email, address or link replaced by [REDACTED], then cut to
    MAX_VENDOR_MESSAGE_CHARS. When in doubt (an address-like trace left after that) it is dropped."""
    if not isinstance(text, str):
        return None
    text = ''.join(' ' if unicodedata.category(char)[0] == 'C' else char for char in text[:VENDOR_MESSAGE_SCAN_CHARS])
    text = re.sub(r'\s+', ' ', text).strip()
    for pattern in VENDOR_MESSAGE_REDACTIONS:
        text = pattern.sub('[REDACTED]', text)
    text = text[:MAX_VENDOR_MESSAGE_CHARS]
    if not text or VENDOR_MESSAGE_SUSPECT.search(text):
        return None
    return text


def _vendor_label(value):
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value) if type(value) is int else None
    return text if text is not None and VENDOR_LABEL.fullmatch(text) else '(other)'


def vendor_error_summary(response):
    """From a (redacted) JSON answer only: its error's type and code (each a short label, else
    "(other)") and safe_vendor_message of its message; a plain-text error is the message alone.
    None when the answer has no error object or text."""
    error = response.get('error') if isinstance(response, dict) else None
    if isinstance(error, str):
        return {'type': None, 'code': None, 'message': safe_vendor_message(error)}
    if not isinstance(error, dict):
        return None
    return {'type': _vendor_label(error.get('type')), 'code': _vendor_label(error.get('code')),
            'message': safe_vendor_message(error.get('message'))}


# Any of these keys anywhere in a reply means it may have been billed (ruling 5 refuses to call it unsent).
BILLED_KEYS = ('usage', 'choices', 'estimated_cost', 'cost', 'inference_status')


def names_any_key_prefixed(value, prefix):
    """Whether any object at any depth of a parsed JSON value has a key starting with prefix."""
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if any(isinstance(key, str) and key.startswith(prefix) for key in item):
                return True
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return False


def names_any_key(value, names):
    """Whether any object at any depth of a parsed JSON value has one of these keys."""
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if any(name in item for name in names):
                return True
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return False


# Owner answer M3 (2026-10-15): the members under which a reply may report what it cost, at any depth.
REPORTED_COST_KEYS = ('estimated_cost', 'cost')


def reported_costs(value):
    """Every amount a parsed reply reports under REPORTED_COST_KEYS, at any depth, as Decimals (a null one reports
    nothing); None when one of them is not a plain non-negative amount (such a reply is never booked: M3)."""
    found, stack = [], [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            for key, inner in item.items():
                if key in REPORTED_COST_KEYS and not isinstance(inner, (dict, list)):
                    if inner is None:
                        continue
                    amount = decimal_amount(inner)
                    if amount is None:
                        return None
                    found.append(amount)
                else:
                    stack.append(inner)
        elif isinstance(item, list):
            stack.extend(item)
    return found


# One reviewed model of a profile. Prices are the vendor's LIST prices in USD per million tokens
# (the careful side while a vendor runs a promotion); the gate reserves and settles with them.
# output_bound is both the max_tokens ceiling and what a call reserves for output. efforts (spec 2026-10-12
# section 4.1) is the reviewed thinking-level menu: a non-empty tuple of distinct words from the profile's
# effort_words, where None means the request carries no effort member at all (the vendor's default); a request's
# level must be on it. Its first element is the level the app sends by default (today's request), and the one the
# probe sends. A menu change is a reviewed row change. json_object says whether JSON mode may be asked for. sampling
# (reviewed 2026-10-12) is None (the request must carry none of the profile's sampling_keys) or a tuple
# of (name, number) pairs: the request must carry exactly those members with exactly those values.
ModelRow = namedtuple('ModelRow', 'model maker input_usd_per_m output_usd_per_m output_bound efforts json_object sampling',
                      defaults=(None,))


PATH_PATTERN = re.compile(r'/[A-Za-z0-9._~:/-]{0,511}')


def path_valid(path):
    """A fixed request path: no query (so never a key in a URL), no fragment, no '..'."""
    return isinstance(path, str) and bool(PATH_PATTERN.fullmatch(path)) and '..' not in path


class DeepInfraProfile:
    """api.deepinfra.com, OpenAI chat-completions shape, Bearer key. Rows reviewed 2026-10-10
    (contract A section 1); whether each model takes reasoning_effort and echoes its exact id is
    measured by the gate's root-only probe before a row is enabled.

    The profile API (every profile implements all of it; the gate's core calls nothing else):
      name, host                         the GO's `provider` value; the HTTPS host (port 443)
      per_call_cap_usd (Decimal)         no row may reserve more than this for one full-size request
      max_request_bytes (int)            the largest request body accepted (and priced)
      redaction_patterns (tuple of str)  regexes for the vendor's key shapes, blanked in replies
      key_pattern (str, optional)        the shape this vendor's key must have (re.fullmatch); the
                                         gate refuses any other key before a reservation, so a
                                         key of another provider in this gate's folder is never sent
      rows {model: ModelRow}             the reviewed models
      sampling_keys (tuple of str)       the sampling members a row of this profile may set (row.sampling);
                                         empty or absent: no row of the profile may set any
      path_for(row) -> str               the POST path (checked: no '?', starts with '/')
      auth_headers(key) -> dict          the header(s) carrying the key
      requested_model(body) -> str|None  where the request names its model
      body_valid(body, row) -> bool      the exact request shape this row accepts
      request_bytes(body) -> bytes       the bytes sent (never longer than the bytes priced)
      reservation_prices(row, moment, request_bytes=None) -> (in, out)  USD per million used to
                                         reserve at moment for a request of that many bytes (None:
                                         any size, so the dearest prices the size could need)
      ceiling_prices(row) -> (in, out)   the highest prices the row can ever reserve at (worst cases)
      account(response, row, moment) -> dict  usage and guard charge (see account_response's keys)
      cache_write_requested(body) -> bool  OPTIONAL (2026-10-12): True when an accepted request asks the
                                         vendor for a prompt-cache write. A profile without it never
                                         caches. Only when it says True does the core call
                                         reservation_prices(..., cache_write=True) and
                                         account(..., cache_write=True), so a profile that has it
                                         takes that keyword on both (AnthropicProfile)
      reply_model(response) -> str|None  where the reply names the model that answered
      unbilled_refusal(status, response) -> bool  a refusal that provably billed nothing (the gate
                                         keeps a $0 'released_unbilled' entry)
      busy_refusal(status, response) -> bool  asked only of an unbilled refusal: True when it says
                                         the vendor is busy (the gate cools that model off and
                                         never halts for it); False for any other unbilled error
                                         (counted toward the unsent streak, never cools the model)
      bookable_server_error(status, response) -> bool  OPTIONAL (2026-10-15): asked of a reply that is not
                                         an unbilled refusal; True books the call at its reservation
                                         (settled_reserved_max, reason vendor_server_error) and the
                                         gate stays active. A profile without it (AnthropicProfile)
                                         accounts every such reply as before
      bookable_unreported(status, response, accounting, reserved) -> bool  OPTIONAL (owner answer M3, 2026-10-15):
                                         asked only of a paid reply whose usage or cost is unreported
                                         (assess_reply's usage_or_cost_unreported), with its accounting and the
                                         call's reservation; True books the call at its reservation
                                         (settled_reserved_max, reason charge_unreported) and the gate stays
                                         active. A profile without it accounts every such reply as before (halt)
      probe_body(row) -> dict            the probe's tiny request (max_tokens <= 1024), with the row's sampling
      reply_text(response) -> str|None   answer or error text, for the probe's short excerpt
    """
    name = 'deepinfra'
    host = 'api.deepinfra.com'
    path = '/v1/openai/chat/completions'
    per_call_cap_usd = Decimal('0.25')
    # Per-call caps (owner rulings 2026-10-10), the same for every row: a hard 256 KiB request body
    # cap here, and output_bound 32768 (the max_tokens ceiling and the reservation's output term)
    # in each row below. The 256 KiB is kept because story requests reach about 236 KiB at the
    # "high" story size (the largest ordinary request seen was about 51 KB). No call the app makes
    # asks for more than 24,000 answer tokens (debate 8,192, health checks 8,192, storyteller
    # 12,000 then 24,000 on retry). Full-size worst cases ((262,144 + 2,048) x input + 32,768 x
    # output): GLM $0.0560128, DeepSeek $0.0724992, MiMo $0.14211072, Qwen $0.042371072
    # (tests/unit/fixtures/preview-model-rows.json).
    max_request_bytes = 256 * 1024
    redaction_patterns = ()  # DeepInfra keys have no fixed shape; the key itself and Bearer are always blanked.
    # No fixed shape either, but never another provider's key (Anthropic sk-ant-, Google AIza).
    key_pattern = r'(?!sk-ant-|AIza)[!-~]{16,512}'
    # Reviewed sampling (2026-10-12): the members a row may set, in the order the app's body carries them.
    sampling_keys = ('temperature', 'top_p', 'top_k')
    # Spec 2026-10-12 section 4.1: the words a row's menu may hold. None is no reasoning_effort member at all (the
    # vendor's default); 'none' asks DeepInfra to switch thinking off.
    effort_words = (None, 'none', 'low', 'medium', 'high')
    rows = {row.model: row for row in (
        # Thinking levels (spec 2026-10-12 section 2): Z.AI documents low, high and max only; thinking cannot be off.
        ModelRow('zai-org/GLM-5.3-Flash', 'Z.AI', Decimal('0.15'), Decimal('0.50'), 32768, ('high', 'low'), True),
        # Thinking levels: DeepSeek documents none, low, high and max ('medium' is treated as high).
        ModelRow('deepseek-ai/DeepSeek-V4.1-Flash', 'DeepSeek', Decimal('0.20'), Decimal('0.60'), 32768,
                 ('high', 'low', 'none'), False),
        # Owner approval 2026-10-12: MiMo closed Romanian quotation marks with a straight double quote inside its JSON
        # in a live practice run. Its DeepInfra page recommends temperature 1.0 and top_p 0.95; owner ruling 2026-10-12
        # (reply language): temperature 0.7, after MiMo wrote 10 of its 71 practice replies at 1.0 in another language
        # than the question's. Every request carries exactly those two (no top_k). JSON mode was tried the same day and withdrawn: DeepInfra's JSON constraint
        # turned that slip into garbage, which the app's reader repairs when JSON mode is off.
        # Thinking levels: Xiaomi documents thinking on or off only, no levels.
        ModelRow('XiaomiMiMo/MiMo-V2.6-Pro', 'Xiaomi', Decimal('0.43'), Decimal('0.87'), 32768, (None, 'none'), False,
                 (('temperature', 0.7), ('top_p', 0.95))),
        # Owner swap 2026-10-10 (Qwen in place of Gemini): flat list price over the whole 1M window,
        # no promotion, no tiers; reasoning_effort is not listed, so none is sent.
        # Reviewed sampling 2026-10-12: at DeepInfra's defaults (temperature 1, top_p 1, top_k off) it slid
        # mid-answer into random multilingual tokens (a live practice run, 2 of its first 4 calls). It thinks by
        # default, so it runs at its makers' thinking-mode settings.
        # Thinking levels: Alibaba documents low, medium and xhigh (its default); 'high' is not a Qwen value.
        ModelRow('Qwen/Qwen3.8-Flash', 'Alibaba', Decimal('0.113'), Decimal('0.382'), 32768,
                 (None, 'low', 'medium', 'none'), False,
                 (('temperature', 0.6), ('top_p', 0.95), ('top_k', 20))))}

    def path_for(self, row):
        return self.path

    def auth_headers(self, key):
        return {'Authorization': 'Bearer ' + key}

    def reservation_prices(self, row, moment, request_bytes=None):
        """DeepInfra's list prices do not change with the date or the prompt size."""
        return row.input_usd_per_m, row.output_usd_per_m

    def ceiling_prices(self, row):
        return row.input_usd_per_m, row.output_usd_per_m

    def requested_model(self, body):
        """Where the request names its model (looked up before anything else is checked)."""
        return body.get('model') if isinstance(body, dict) else None

    def body_valid(self, body, row):
        """Exactly model, max_tokens and messages; a reasoning_effort word on the row's menu, or none where the menu
        holds None (spec 2026-10-12 section 4.5); the row's reviewed sampling members with exactly its numbers iff it
        has one (none of them otherwise); an optional response_format {"type": "json_object"} only for a row that
        allows it."""
        if not isinstance(body, dict) or body.get('model') != row.model:
            return False
        sampling = dict(row.sampling or ())
        effort_member = 'reasoning_effort' in body
        fields = {'model', 'max_tokens', 'messages'} | ({'reasoning_effort'} if effort_member else set()) | set(sampling)
        extra = set(body) - fields
        if not fields <= set(body) or extra - {'response_format'}:
            return False
        if extra:
            mode = body['response_format']
            if not row.json_object or not (isinstance(mode, dict) and set(mode) == {'type'} and mode['type'] == 'json_object'):
                return False
        # Spec 2026-10-12 section 4.5: the level is on the row's reviewed menu; no member only where the menu holds None.
        if effort_member:
            if not (isinstance(body['reasoning_effort'], str) and body['reasoning_effort'] in row.efforts):
                return False
        elif None not in row.efforts:
            return False
        # The same number exactly (20 and 20.0 are one JSON number to the app too); never a bool, text or null.
        if any(type(body[name]) not in (int, float) or body[name] != value for name, value in sampling.items()):
            return False
        return (type(body['max_tokens']) is int and 1 <= body['max_tokens'] <= row.output_bound
                and isinstance(body['messages'], list) and bool(body['messages'])
                and all(isinstance(m, dict) and set(m) == {'role', 'content'} and m['role'] in ('system', 'user', 'assistant')
                        and isinstance(m['content'], str) for m in body['messages']))

    def body_effort(self, body):
        """The level a body carries (spec 2026-10-12 section 4.5): its reasoning_effort, or None for no member."""
        value = body.get('reasoning_effort') if isinstance(body, dict) else None
        return value if isinstance(value, str) else None

    def request_bytes(self, body):
        """The exact bytes sent upstream for a body that passed body_valid."""
        return canonical(body)

    def account(self, response, row, moment):
        return account_response(response, row.input_usd_per_m, row.output_usd_per_m)

    def reply_model(self, response):
        """Where the reply names the model that answered."""
        return response.get('model')

    def unbilled_refusal(self, status, response):
        """True only for a refusal that provably billed nothing (owner ruling 5, 2026-10-10): HTTP
        429, a JSON object with an error field, and no usage, choices, cost, estimated_cost,
        inference_status (DeepInfra's native cost block) or tokens_* key at any depth. The gate then
        releases the hold, keeps the entry at $0 as 'released_unbilled' (so it stays on the record)
        and counts it toward that model's cool-off (never a gate halt; 2026-10-12). Anything else is
        accounted (and halts) as before."""
        return (status == 429 and isinstance(response, dict) and bool(response.get('error'))
                and not names_any_key(response, BILLED_KEYS)
                and not names_any_key_prefixed(response, 'tokens_'))

    def busy_refusal(self, status, response):
        """DeepInfra's only unbilled refusal is its 429 ("too many requests"): always busy."""
        return status == 429

    def bookable_server_error(self, status, response):
        """Owner ruling 2026-10-15: True for a server error (HTTP 500 to 599) whose reply carries none of
        the billing keys unbilled_refusal looks for, at any depth. Not proof that nothing was billed: the
        gate books the call at its reservation, which bounds any bill, as for a connection that failed
        after the send, and stays active. A reply with any of those keys is accounted (and halts) as before."""
        return (type(status) is int and 500 <= status <= 599 and isinstance(response, dict)
                and not names_any_key(response, BILLED_KEYS)
                and not names_any_key_prefixed(response, 'tokens_'))

    def bookable_unreported(self, status, response, accounting, reserved):
        """Owner answer M3 (2026-10-15; OVERVIEW B-3; ruling R2, 2026-10-16): asked only of a paid reply whose usage or
        cost is unreported (assess_reply's usage_or_cost_unreported), on the RAW reply. True for an answer (HTTP 200 to
        299) or a server error (500 to 599, one bookable_server_error did not take: it names a billing field) whose
        counts cannot be priced, when nothing in it says it cost more than the reservation: every cost it reports
        anywhere is a plain amount at most `reserved`, and the counts it does report, at the row's list prices, price
        at most `reserved` too. The gate then books the call at its reservation (reason charge_unreported) and stays
        active. False for every other status (a 4xx is a key, billing or request problem root must see) and for an
        accounting the gate had to cut short (oversized_accounting)."""
        if not (type(status) is int and (200 <= status <= 299 or 500 <= status <= 599)):
            return False
        if not isinstance(response, dict) or not isinstance(accounting, dict) or accounting.get('usage_valid') is True \
                or accounting.get('oversized_accounting') is True:
            return False
        costs = reported_costs(response)
        if costs is None or any(cost > reserved for cost in costs):
            return False
        prompt = accounting.get('prompt_tokens') or 0
        output = (accounting.get('completion_tokens') or 0) + (accounting.get('reasoning_tokens') or 0)
        listed = (Decimal(prompt) * Decimal(accounting['input_usd_per_m'])
                  + Decimal(output) * Decimal(accounting['output_usd_per_m'])) / Decimal(1000000)
        return listed <= reserved

    def probe_body(self, row):
        body = {'model': row.model, 'max_tokens': min(1024, row.output_bound),
                'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
        if row.efforts[0] is not None:  # Spec 2026-10-12 section 4.5: the row's default level, as the app sends it.
            body['reasoning_effort'] = row.efforts[0]
        body.update(row.sampling or ())  # The probe asks as the app's calls do: the row's own sampling, if any.
        return body

    def reply_text(self, response):
        """The answer's text, or a provider error's message (for the probe's short excerpt only)."""
        choices = response.get('choices')
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            message = choices[0].get('message')
            return message.get('content') if isinstance(message, dict) else None
        error = response.get('error')
        if isinstance(error, dict):
            return error.get('message')
        return error if isinstance(error, str) else None


# Anthropic's list prices (USD per million tokens) for the reviewed row, in two steps by the size
# of the prompt (platform.claude.com/docs/en/about-claude/pricing, read 2026-10-10). The prompt
# total counts every input token: plain input, cache writes and cache reads.
PriceStep = namedtuple('PriceStep', 'name prompt_tokens_up_to input_usd_per_m cache_write_5m_usd_per_m '
                                    'cache_write_1h_usd_per_m cache_read_usd_per_m output_usd_per_m')
ANTHROPIC_USAGE_KEYS = frozenset({'input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens',
                                  'cache_creation', 'server_tool_use', 'service_tier', 'inference_geo',
                                  'output_tokens_details', 'speed'})
# usage.output_tokens_details (Messages reference, read 2026-10-11): a read-only split of output_tokens,
# which stays the inclusive billed total; thinking_tokens <= output_tokens. Nothing in it is charged.
# usage.speed (Fast mode page, platform.claude.com/docs/en/build-with-claude/fast-mode, read 2026-10-16):
# "fast" or "standard", the speed the call ran at. Haiku replies carry it since 2026-10-16 (the first one
# halted the gate). Only "standard" (or no speed at all) is the list price; "fast" is premium pricing, and
# any other value is unknown, so both stay uncertain and halt, as a service_tier other than standard does.
ANTHROPIC_OUTPUT_DETAIL_KEYS = frozenset({'thinking_tokens'})
ANTHROPIC_CACHE_SPLIT_KEYS = frozenset({'ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'})
# The characters JavaScript's String.prototype.trim() removes (WhiteSpace and LineTerminator):
# the app's adapter refuses text that is only these, and body_valid refuses exactly the same text.
JS_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
# The only content blocks a reply the gate settles may carry: text, and thinking it never shows.
ANTHROPIC_CONTENT_BLOCKS = frozenset({'text', 'thinking', 'redacted_thinking'})
# Top-level reply members that mean work the token usage may not cover (a code container, context
# editing): the usage is then invalid, unless the member is null (the reference documents both as
# "X or null"; null means none was used). Any other top-level key naming usage or tokens is invalid too.
ANTHROPIC_UNPRICED_REPLY_KEYS = frozenset({'container', 'context_management'})
# The outline an unreadable reply leaves in its ledger entry: names and kinds only (see reply_outline).
OUTLINE_NAME = re.compile(r'[a-z0-9_]{1,64}')
OUTLINE_LABEL = re.compile(r'[a-z0-9_]{1,32}')
OUTLINE_MAX_ITEMS = 40


def names_any_key_suffixed(value, suffix):
    """Whether any object at any depth of a parsed JSON value has a key ending with suffix."""
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if any(isinstance(key, str) and key.endswith(suffix) for key in item):
                return True
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return False


def outline_kind(value):
    """A parsed JSON value's kind, never the value itself."""
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float, Decimal)):
        return 'number'
    if isinstance(value, str):
        return 'string'
    return 'array' if isinstance(value, list) else 'object' if isinstance(value, dict) else 'other'


def outline_name(name):
    return name if isinstance(name, str) and OUTLINE_NAME.fullmatch(name) else '(other)'


def outline_capped(items):
    return items if len(items) <= OUTLINE_MAX_ITEMS else items[:OUTLINE_MAX_ITEMS] + ['(+%d more)' % (len(items) - OUTLINE_MAX_ITEMS)]


def outline_block(block):
    if not isinstance(block, dict):
        return '(not an object)'
    return outline_name(block['type']) if isinstance(block.get('type'), str) else '(no type)'


def reply_outline(response):
    """What an unreadable Anthropic reply looked like, for the operator: its top-level field names
    with each value's kind, its content block types, its usage field names (one level into nested
    objects) with kinds, and the service_tier, inference_geo and speed labels. Never text, a number, an id
    or a name outside lowercase snake_case (it shows as (other)); at most 40 items a list."""
    if not isinstance(response, dict):
        return {'reply_kind': outline_kind(response)}
    outline = {'reply': outline_capped(sorted('%s:%s' % (outline_name(key), outline_kind(value))
                                              for key, value in response.items()))}
    content = response.get('content')
    if isinstance(content, list):
        outline['content'] = outline_capped([outline_block(block) for block in content])
    usage = response.get('usage')
    if isinstance(usage, dict):
        names = []
        for key, value in usage.items():
            names.append('%s:%s' % (outline_name(key), outline_kind(value)))
            if isinstance(value, dict):
                names.extend('%s.%s:%s' % (outline_name(key), outline_name(inner), outline_kind(item))
                             for inner, item in value.items())
        outline['usage'] = outline_capped(sorted(names))
        labels = {}
        for key in ('service_tier', 'inference_geo', 'speed'):
            if key in usage:
                value = usage[key]
                labels[key] = (value if OUTLINE_LABEL.fullmatch(value) else '(other)') if isinstance(value, str) \
                    else outline_kind(value)
        if labels:
            outline['usage_labels'] = labels
    return outline


class AnthropicProfile:
    """api.anthropic.com, Messages API (POST /v1/messages), x-api-key plus anthropic-version.
    One reviewed row (Claude Haiku 5.5), 2026-10-10. The profile API is DeepInfraProfile's.

    Reservation (owner ruling 2026-10-10, evening): every request byte (+2048) counts as an input
    token. When that count is above the lower step's 100,000 tokens the call reserves at the UPPER
    step's prices (input 0.50, output 2.50); otherwise the prompt cannot reach the upper step, and
    it reserves at the lower step's (0.10, 0.50), the row's own prices. A full 256 KiB request
    reserves (264,192 x 0.50 + 32,768 x 2.50) / 1e6 = $0.214016.

    Prompt caching (owner approval 2026-10-12, "caching before the upload"): a request may carry ONE
    cache mark, {"type": "ephemeral"} (5 minutes, no ttl), on the first of exactly two system text
    blocks (the app's adapter puts the engine's stable instruction and safety frame in the first block
    and the per-call markers in the second; nothing else anywhere may carry a mark). Such a request
    (cache_write_requested) reserves its WHOLE input at the step's 5-minute cache-write price (lower
    0.125, upper 0.625), the simplest safe rule: the write can never cover more than the input. So the
    dearest request is a full-size cached one, (264,192 x 0.625 + 32,768 x 2.50) / 1e6 = $0.24704, the
    ceiling, under the $0.25 cap. A reply that reports cache tokens is settled at their own prices on
    any call, marked or not (no new halt). A reply that still costs more than its hold (for example a
    1-hour write, which no request can ask for, or a write on an unmarked call) is charged in full and
    halts (charge_overrun). Settlement: the real step (prompt total <= 100,000 tokens: the lower one),
    each kind of input token at its own price: plain input, the 5-minute and 1-hour writes, and reads; a
    write reported without its split is the 5-minute kind on a marked call and is charged at the dearer
    1-hour price on any other call (as before caching). Anthropic reports no cost,
    so the guard charge is that list-price charge. Any usage field this profile does not know, any
    server-tool use, another service tier or region, or a tool block makes the usage invalid: uncertain,
    and the gate halts. Owner answer M3 (2026-10-15; rulings R1-R3, 2026-10-16): bookable_unreported books, at the
    call's reservation, a message without usage or with unreadable input/output counts whose usage names nothing that
    may bill above the list price (premium_free), and a server error (500 to 599) that is no message and names no
    billing field; everything named here still halts.
    A reply with a container or context editing (a null one means none was
    used), usage or token counts outside `usage`, or a content block other than text or thinking is
    invalid too. An invalid reply's ledger entry names the check it failed and keeps an outline of
    the reply (field names and kinds only: reply_outline).
    """
    name = 'anthropic'
    host = 'api.anthropic.com'
    path = '/v1/messages'
    api_version = '2023-06-01'
    per_call_cap_usd = Decimal('0.25')
    max_request_bytes = 256 * 1024
    redaction_patterns = (r'sk-ant-[A-Za-z0-9_-]+',)
    # Only the ordinary API form (sk-ant-api + two digits + '-', e.g. api03): an Admin form
    # (sk-ant-admin...) or any other Anthropic credential is refused (platform.claude.com, Admin API
    # and Authentication pages, read 2026-10-10).
    key_pattern = r'sk-ant-api[0-9]{2}-[A-Za-z0-9_-]+'
    # Spec 2026-10-12 section 4.1: the words a row's menu may hold, each sent as output_config {"effort": word}.
    # No None: an Anthropic row always carries its level (Haiku 5.5's own default is medium, not today's high).
    effort_words = ('low', 'medium', 'high')
    rows = {row.model: row for row in (
        # The row holds the lower step's prices (the estimate's and a small call's); see reservation_prices.
        # Thinking levels (spec 2026-10-12 section 2): Anthropic documents low, medium, high, xhigh and max for Haiku 5.5.
        ModelRow('claude-haiku-5-5', 'Anthropic', Decimal('0.10'), Decimal('0.50'), 32768, ('high', 'medium', 'low'), False),)}
    settlement_steps = (
        PriceStep('up_to_100k', 100000, Decimal('0.10'), Decimal('0.125'), Decimal('0.20'), Decimal('0.01'), Decimal('0.50')),
        PriceStep('over_100k', None, Decimal('0.50'), Decimal('0.625'), Decimal('1.00'), Decimal('0.05'), Decimal('2.50')))
    # Request fields beyond these are refused (no thinking, tools, stream, sampling, top-level cache_control...).
    BODY_FIELDS = frozenset({'model', 'max_tokens', 'messages', 'system', 'output_config'})
    # The one cache mark a request may carry, on the first of its two system blocks: 5 minutes (no ttl).
    CACHE_MARK = {'type': 'ephemeral'}

    def path_for(self, row):
        return self.path

    def auth_headers(self, key):
        return {'x-api-key': key, 'anthropic-version': self.api_version}

    # Bytes the core adds to every request on the input side (preview_budget_authority's
    # RESERVATION_OVERHEAD_BYTES; the app adds the same).
    RESERVATION_OVERHEAD_BYTES = 2048

    def reservation_prices(self, row, moment, request_bytes=None, cache_write=False):
        """Anthropic's list prices do not change with the date. (request bytes + 2048) above the
        lower step's 100,000 tokens, or an unknown size: the upper step's input and output prices;
        otherwise the row's own (the lower step's). A request that asks for a cache write
        (cache_write=True) reserves its input at that step's 5-minute cache-write price instead.
        See the class docstring."""
        lower, upper = self.settlement_steps
        small = (type(request_bytes) is int and request_bytes >= 0
                 and request_bytes + self.RESERVATION_OVERHEAD_BYTES <= lower.prompt_tokens_up_to)
        if cache_write is True:
            step = lower if small else upper
            return step.cache_write_5m_usd_per_m, step.output_usd_per_m
        if small:
            return row.input_usd_per_m, row.output_usd_per_m
        return upper.input_usd_per_m, upper.output_usd_per_m

    def ceiling_prices(self, row):
        """The upper step's 5-minute cache-write input price and its output price: the dearest any
        accepted request (a cached one above the step) reserves at."""
        upper = self.settlement_steps[1]
        return upper.cache_write_5m_usd_per_m, upper.output_usd_per_m

    def requested_model(self, body):
        return body.get('model') if isinstance(body, dict) else None

    def system_valid(self, system):
        """A system text that is not only whitespace, or exactly two text blocks whose texts are not only
        whitespace: the first exactly {type, text, cache_control: {"type": "ephemeral"}}, the second exactly
        {type, text}. No ttl, no other key, no third block, no mark on the second (prompt caching, 2026-10-12)."""
        if isinstance(system, str):
            return bool(system.strip(JS_WHITESPACE))
        if not (isinstance(system, list) and len(system) == 2 and all(isinstance(block, dict) for block in system)):
            return False
        first, second = system
        return (set(first) == {'type', 'text', 'cache_control'} and set(second) == {'type', 'text'}
                and all(block['type'] == 'text' and isinstance(block['text'], str) and block['text'].strip(JS_WHITESPACE)
                        for block in system)
                and isinstance(first['cache_control'], dict) and first['cache_control'] == self.CACHE_MARK)

    def cache_write_requested(self, body):
        """True exactly for a body whose system is the accepted two-block form (its one cache mark)."""
        return bool(isinstance(body, dict) and isinstance(body.get('system'), list) and self.system_valid(body['system']))

    def body_valid(self, body, row):
        """Exactly model, max_tokens and messages, an optional system (system_valid: a string, or the two
        blocks that carry the one cache mark), and output_config exactly {"effort": <a word on the row's menu>}
        (spec 2026-10-12 section 4.5; absent only where the menu holds None, which no Anthropic row does). Nothing else anywhere (contract-BC-wire, Anthropic). It mirrors what the app's
        adapter (anthropic-messages.ts) can send, no more: text content that is not only whitespace
        (JavaScript's trim set), roles alternating user/assistant starting AND ending with a user turn
        (the adapter joins same-role turns and refuses a final assistant turn), and a system whose text is
        not only whitespace when present."""
        if not isinstance(body, dict) or body.get('model') != row.model:
            return False
        effort_member = 'output_config' in body
        required = {'model', 'max_tokens', 'messages'} | ({'output_config'} if effort_member else set())
        allowed = required | {'system'}
        if not required <= set(body) <= allowed:
            return False
        # Spec 2026-10-12 section 4.5: the level is on the row's reviewed menu; no member only where the menu holds None.
        if effort_member:
            config = body['output_config']
            if not (isinstance(config, dict) and set(config) == {'effort'} and isinstance(config['effort'], str)
                    and config['effort'] in row.efforts):
                return False
        elif None not in row.efforts:
            return False
        if 'system' in body and not self.system_valid(body['system']):
            return False
        messages = body['messages']
        return (type(body['max_tokens']) is int and 1 <= body['max_tokens'] <= row.output_bound
                and isinstance(messages, list) and len(messages) % 2 == 1
                and all(isinstance(m, dict) and set(m) == {'role', 'content'}
                        and m['role'] == ('user' if index % 2 == 0 else 'assistant')
                        and isinstance(m['content'], str) and m['content'].strip(JS_WHITESPACE)
                        for index, m in enumerate(messages)))

    def body_effort(self, body):
        """The level a body carries (spec 2026-10-12 section 4.5): output_config's effort, or None for no member."""
        config = body.get('output_config') if isinstance(body, dict) else None
        value = config.get('effort') if isinstance(config, dict) else None
        return value if isinstance(value, str) else None

    def request_bytes(self, body):
        return canonical(body)

    def usage_counts(self, response, cache_write=False):
        """(input, cache creation, cache read, 1-hour part of the creation, output) from a reply
        whose usage this profile fully understands, else None (uncertain)."""
        return self.usage_check(response, cache_write)[1]

    def usage_check(self, response, cache_write=False):
        """(None, counts) for a reply whose usage this profile fully understands, else (the name of
        the check it failed, None): the gate is then uncertain and halts. Cache tokens are settled on
        every call; cache_write=True (the call carried the cache mark) only makes a write reported
        without its split the 5-minute kind."""
        if not isinstance(response, dict) or response.get('type') != 'message':
            return 'not_a_message', None
        # A container or context editing (unless null: none used) may bill beyond the usage.
        if any(key in ANTHROPIC_UNPRICED_REPLY_KEYS and value is not None for key, value in response.items()):
            return 'unpriced_reply_member', None
        # So may usage or token counts outside `usage`.
        if any(key not in ANTHROPIC_UNPRICED_REPLY_KEYS and key != 'usage' and ('usage' in key or 'tokens' in key)
               for key in response):
            return 'counts_outside_usage', None
        content = response.get('content')
        if not isinstance(content, list) or not all(isinstance(block, dict) for block in content):
            return 'content_block', None
        # Only text and thinking: any tool activity (client or server side), a container upload or
        # any block this profile does not know may bill beyond the tokens.
        if not all(block.get('type') in ANTHROPIC_CONTENT_BLOCKS for block in content):
            return 'content_block', None
        usage = response.get('usage')
        if not isinstance(usage, dict):
            return 'usage_missing', None
        if not set(usage) <= ANTHROPIC_USAGE_KEYS:
            return 'usage_unknown_field', None
        input_tokens, output_tokens = usage.get('input_tokens'), usage.get('output_tokens')
        creation, read = usage.get('cache_creation_input_tokens'), usage.get('cache_read_input_tokens')
        if not (integer(input_tokens) and integer(output_tokens)):
            return 'token_counts', None
        # The thinking split is informational: output_tokens already includes it. A split this profile does
        # not know, or one larger than the billed total, makes the usage invalid.
        details = usage.get('output_tokens_details')
        if details is not None and not (isinstance(details, dict) and set(details) <= ANTHROPIC_OUTPUT_DETAIL_KEYS
                                        and all(integer(value) for value in details.values())
                                        and details.get('thinking_tokens', 0) <= output_tokens):
            return 'output_tokens_details', None
        if not all(value is None or integer(value) for value in (creation, read)):
            return 'cache_counts', None
        creation, read = creation or 0, read or 0
        tools = usage.get('server_tool_use')
        if tools is not None and not (isinstance(tools, dict) and all(type(v) is int and v == 0 for v in tools.values())):
            return 'server_tool_use', None
        if usage.get('service_tier') not in (None, 'standard'):
            return 'service_tier', None
        if usage.get('inference_geo') not in (None, 'global'):
            return 'inference_geo', None
        if usage.get('speed') not in (None, 'standard'):
            return 'speed', None
        # A cache write reported without its 5-minute/1-hour split: on a call that carried the cache mark it
        # is the 5-minute kind (the only mark a request may carry); on any other call it is charged at the
        # dearer 1-hour price (a write the gate did not ask for is priced on the safe side). A split names each part.
        hour = 0 if cache_write is True else creation
        split = usage.get('cache_creation')
        if split is not None:
            if not (isinstance(split, dict) and set(split) == ANTHROPIC_CACHE_SPLIT_KEYS
                    and all(integer(value) for value in split.values())
                    and split['ephemeral_5m_input_tokens'] + split['ephemeral_1h_input_tokens'] == creation):
                return 'cache_split', None
            hour = split['ephemeral_1h_input_tokens']
        return None, (input_tokens, creation, read, hour, output_tokens)

    def step_for(self, prompt_total):
        lower, upper = self.settlement_steps
        return lower if prompt_total <= lower.prompt_tokens_up_to else upper

    def account(self, response, row, moment, cache_write=False):
        reason, counts = self.usage_check(response, cache_write)
        if counts is None:
            # The check that failed and an outline of the reply (names and kinds only) stay in the
            # ledger entry, so the operator can see why without the reply's text or numbers.
            return {'input_usd_per_m': None, 'output_usd_per_m': None, 'prompt_tokens': None, 'completion_tokens': None,
                    'total_tokens': None, 'cached_tokens': None, 'reasoning_tokens': None, 'usage_valid': False,
                    'configured_price_cost_usd': None, 'provider_estimated_cost_usd': None, 'guard_charge_usd': None,
                    'cost_basis': 'unknown; full reservation retained', 'invalid_reason': reason,
                    'reply_shape': reply_outline(response)}
        input_tokens, creation, read, hour, output_tokens = counts
        prompt = input_tokens + creation + read
        step = self.step_for(prompt)
        charge = (Decimal(input_tokens) * step.input_usd_per_m + Decimal(creation - hour) * step.cache_write_5m_usd_per_m
                  + Decimal(hour) * step.cache_write_1h_usd_per_m + Decimal(read) * step.cache_read_usd_per_m
                  + Decimal(output_tokens) * step.output_usd_per_m) / Decimal(1000000)
        text = format(charge, 'f')
        return {'input_usd_per_m': str(step.input_usd_per_m), 'output_usd_per_m': str(step.output_usd_per_m),
                'prompt_tokens': prompt, 'completion_tokens': output_tokens, 'total_tokens': prompt + output_tokens,
                'cached_tokens': read, 'reasoning_tokens': None, 'usage_valid': True,
                'configured_price_cost_usd': text, 'provider_estimated_cost_usd': None, 'guard_charge_usd': text,
                'cost_basis': 'Anthropic list prices at the prompt-size step; no provider-reported cost',
                'price_step': step.name, 'input_tokens': input_tokens, 'cache_creation_input_tokens': creation,
                'cache_read_input_tokens': read, 'cache_write_5m_tokens': creation - hour, 'cache_write_1h_tokens': hour,
                'cache_write_5m_usd_per_m': str(step.cache_write_5m_usd_per_m),
                'cache_write_1h_usd_per_m': str(step.cache_write_1h_usd_per_m),
                'cache_read_usd_per_m': str(step.cache_read_usd_per_m)}

    def reply_model(self, response):
        return response.get('model')

    # Anthropic's well-formed error answers that bill nothing, by HTTP status: the error types each
    # status may carry (platform.claude.com, API Errors page, read 2026-10-10). Judge round on PR B:
    # the same released_unbilled entry as DeepInfra's 429s. Only the busy ones (BUSY_STATUSES: 429 and
    # 529) cool the model off like DeepInfra's 429s; 400, 404, 413 and 500 are not busy (review
    # 2026-10-12): they count toward the gate-wide unsent streak as before gate v4. Never here, so they halt:
    # 401 authentication_error and 403 permission_error (the key is wrong: root must look),
    # 402 billing_error, 504 timeout_error (the work may have run; since owner answer M3 it is booked at the
    # reservation by bookable_unreported, never released), and any other status or type.
    UNBILLED_ERRORS = {
        400: frozenset({'invalid_request_error'}),
        404: frozenset({'not_found_error'}),
        413: frozenset({'request_too_large'}),
        429: frozenset({'rate_limit_error', 'overloaded_error'}),
        500: frozenset({'api_error'}),
        529: frozenset({'rate_limit_error', 'overloaded_error'}),
    }
    BUSY_STATUSES = frozenset({429, 529})  # rate_limit_error / overloaded_error: the vendor is busy.

    def unbilled_refusal(self, status, response):
        """True only for Anthropic's own well-formed error answers that bill nothing (owner ruling 5,
        2026-10-10, widened by the judge round): a status in UNBILLED_ERRORS, a body of exactly
        type "error", error (and an optional request_id string), an error type that status may
        carry, and no usage, content or model key, no other billed key (BILLED_KEYS) and no
        tokens_* or *_tokens key at any depth. The core passes the RAW reply (before redaction
        drops any subtree), releases the hold and keeps a $0 'released_unbilled' entry (a busy one
        counts toward that model's cool-off, any other toward the unsent streak: busy_refusal).
        Anything else is accounted (and halts) as before."""
        if status not in self.UNBILLED_ERRORS or not isinstance(response, dict):
            return False
        if set(response) not in ({'type', 'error'}, {'type', 'error', 'request_id'}):
            return False
        error = response['error']
        return (response['type'] == 'error' and isinstance(error, dict)
                and error.get('type') in self.UNBILLED_ERRORS[status]
                and isinstance(response.get('request_id', ''), str)
                and not names_any_key(response, BILLED_KEYS + ('content', 'model'))
                and not names_any_key_prefixed(response, 'tokens_')
                and not names_any_key_suffixed(response, '_tokens'))

    def busy_refusal(self, status, response):
        """Of the unbilled errors above, only 429 and 529 (rate_limit_error, overloaded_error) say the
        vendor is busy. 400 invalid_request_error, 404 not_found_error and 413 request_too_large
        are deterministic for that request, and 500 api_error is Anthropic's own fault: none of them
        is a reason to sit the model out, so the gate counts them toward the unsent streak instead."""
        return status in self.BUSY_STATUSES

    def bookable_unreported(self, status, response, accounting, reserved):
        """Owner answer M3 (2026-10-15) with rulings R1-R3 (2026-10-16): asked only of a paid reply whose usage is
        unreported, on the RAW reply. True for (a) a message (HTTP 200) whose usage is missing or whose input and output
        counts cannot be read (invalid_reason usage_missing or token_counts), when its usage names nothing that may bill
        above the list price the reservation holds (premium_free); (b) R1: a server error (500 to 599) that is no
        message and carries no billing key, content, model or token count at any depth (the unbilled_refusal key
        test): its 504 timeout_error, a 503, a 529 api_error. The gate then books the call at its reservation (reason
        charge_unreported). Never a 4xx (R2: 401, 402, 403 and the rest: root must look), an unknown usage member (R3,
        usage_unknown_field: a new member may be a new billing dimension, as speed was on 2026-10-16), a premium speed,
        tier or region, a server tool, an unpriced reply member, counts outside usage, a tool or other content block,
        or a cache count it cannot read. `reserved` is not needed here: nothing Anthropic reports is a cost."""
        if type(status) is not int or not isinstance(response, dict) or not isinstance(accounting, dict):
            return False
        reason = accounting.get('invalid_reason')
        if status == 200 and reason in ('usage_missing', 'token_counts'):
            usage = response.get('usage')
            return not isinstance(usage, dict) or self.premium_free(usage)
        return (500 <= status <= 599 and reason == 'not_a_message'
                and not names_any_key(response, BILLED_KEYS + ('content', 'model'))
                and not names_any_key_prefixed(response, 'tokens_')
                and not names_any_key_suffixed(response, '_tokens'))

    @staticmethod
    def premium_free(usage):
        """M3: a usage that names nothing that may bill above the reservation's list prices: standard speed, tier and
        region (or none), no server tool used, and no cache write (the reservation prices a call's input at the plain
        input price unless the call asked for a write)."""
        tools = usage.get('server_tool_use')
        creation = usage.get('cache_creation_input_tokens')
        return (usage.get('speed') in (None, 'standard') and usage.get('service_tier') in (None, 'standard')
                and usage.get('inference_geo') in (None, 'global')
                and (tools is None or isinstance(tools, dict) and all(type(v) is int and v == 0 for v in tools.values()))
                and (creation is None or type(creation) is int and creation == 0) and usage.get('cache_creation') is None)

    def probe_body(self, row):
        body = {'model': row.model, 'max_tokens': min(1024, row.output_bound),
                'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
        if row.efforts[0] is not None:  # Spec 2026-10-12 section 4.5: the row's default level, as the app sends it.
            body['output_config'] = {'effort': row.efforts[0]}
        return body

    def reply_text(self, response):
        """Every text block's text, joined in order; else a provider error's message."""
        content = response.get('content')
        if isinstance(content, list):
            texts = [block['text'] for block in content
                     if isinstance(block, dict) and block.get('type') == 'text' and isinstance(block.get('text'), str)]
            if texts:
                return ''.join(texts)
        error = response.get('error')
        return error.get('message') if isinstance(error, dict) and isinstance(error.get('message'), str) else None


# The providers this gate can serve. Google is a reserved name: a GO naming it is refused until
# its reviewed profile is added here.
PROFILES = {profile.name: profile for profile in (DeepInfraProfile(), AnthropicProfile())}


class HttpsTransport:
    """Direct verified HTTPS only. http.client follows no redirects or env proxies."""

    def __init__(self, timeout, profile, path, max_response_bytes=MAX_RESPONSE_BYTES):
        # Host and auth header come from the GO's profile, the path from its path_for(row); the
        # path carries no query (no key in a URL).
        if not path_valid(path):
            raise SafetyError('profile_path_invalid')  # noqa: F821 - provided by the gate
        self.profile, self.path = profile, path
        self.max_response_bytes = min(max_response_bytes, MAX_RESPONSE_BYTES)
        self.timeout = min(timeout, MAX_TIMEOUT_SECONDS)
        # After an answer: what vendor_headers kept of its headers (the gate reads it for an unbilled release).
        self.vendor_headers = None

    def __call__(self, payload, key):
        # The gate checks and prices these exact bytes before it reserves; they are sent unchanged.
        if not isinstance(payload, bytes):
            raise SafetyError('request_bytes_required')
        deadline = time.monotonic() + self.timeout
        # The connect gets its own short timeout; remaining() then gives the socket the rest.
        connection = http.client.HTTPSConnection(self.profile.host, timeout=min(CONNECT_TIMEOUT_SECONDS, self.timeout),
                                                 context=ssl.create_default_context())

        def remaining():
            seconds = deadline - time.monotonic()
            if seconds <= 0:
                raise TimeoutError('deadline')
            if connection.sock is not None:
                connection.sock.settimeout(seconds)
        try:
            try:
                # Only the TCP connect and the TLS handshake: no request byte exists on the wire
                # before connection.request() below, so a failure here is provably unsent.
                connection.connect()
                remaining()
            except Exception:  # noqa: BLE001 - every failure before the request is the same fact
                raise RequestNotSent('request_not_sent') from None
            connection.request('POST', self.path, body=payload,
                               headers={**self.profile.auth_headers(key), 'Content-Type': 'application/json',
                                        'Accept': 'application/json'})
            remaining()
            response = connection.getresponse()
            getheaders = getattr(response, 'getheaders', None)
            self.vendor_headers = vendor_headers(getheaders() if callable(getheaders) else [])
            chunks, size = [], 0
            while True:
                remaining()
                chunk = response.read(min(65536, self.max_response_bytes + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > self.max_response_bytes:
                    raise ResponseTooLarge('response_too_large')
                chunks.append(chunk)
            try:
                result = json.loads(b''.join(chunks), parse_float=Decimal)
            except (ValueError, UnicodeError):
                result = {'_invalid_json': True}
            return response.status, result if isinstance(result, dict) else {'_invalid_json': True}
        finally:
            connection.close()
