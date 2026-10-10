"""Custody, accounting and transport primitives, and the provider profiles, for the private
preview spending gate.

Adapted from the reviewed DeepInfra benchmark helper; it keeps only what the gate needs.
The gate runs this file from its own directory, only after checking that root owns it and no one
else can write it, and that its hash is the one the GO binds. It is never imported on its own.
No retries, external packages, environment proxies, redirects, or credential artifacts.

A provider profile is everything the gate knows about one vendor: its host and path, its auth
header, the exact request shape it forwards (and the bytes it sends), how a reply's usage is
priced, where a reply names its model, extra key shapes to blank, and its reviewed model rows
(prices, output bound, effort, JSON mode). The GO names one profile (`provider`) and the rows it
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
from collections import namedtuple
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 600
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


def account_response(response, input_price, output_price):
    """OpenAI-shape usage priced at one row's list prices (USD per million tokens)."""
    usage = response.get('usage')
    usage = usage if isinstance(usage, dict) else {}
    prompt, completion, total = usage.get('prompt_tokens'), usage.get('completion_tokens'), usage.get('total_tokens')
    prompt_details = usage.get('prompt_tokens_details') or {}
    completion_details = usage.get('completion_tokens_details') or {}
    details_valid = isinstance(prompt_details, dict) and isinstance(completion_details, dict)
    cached = prompt_details.get('cached_tokens', usage.get('cached_tokens')) if isinstance(prompt_details, dict) else None
    reasoning = completion_details.get('reasoning_tokens') if isinstance(completion_details, dict) else None
    valid = integer(prompt) and integer(completion) and details_valid
    valid = valid and (total is None or integer(total) and total == prompt + completion)
    valid = valid and (cached is None or integer(cached) and cached <= prompt)
    valid = valid and (reasoning is None or integer(reasoning) and reasoning <= completion)
    configured = ((Decimal(prompt) * input_price + Decimal(completion) * output_price) / Decimal(1000000)) if valid else None
    provider = decimal_amount(usage.get('estimated_cost', response.get('estimated_cost')))
    reliable = [value for value in (configured, provider) if value is not None]
    return {'input_usd_per_m': str(input_price), 'output_usd_per_m': str(output_price),  # The settlement prices.
            'prompt_tokens': prompt if integer(prompt) else None, 'completion_tokens': completion if integer(completion) else None,
            'total_tokens': total if integer(total) else None, 'cached_tokens': cached if integer(cached) else None,
            'reasoning_tokens': reasoning if integer(reasoning) else None, 'usage_valid': valid,
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


# One reviewed model of a profile. Prices are the vendor's LIST prices in USD per million tokens
# (the careful side while a vendor runs a promotion); the gate reserves and settles with them.
# output_bound is both the max_tokens ceiling and what a call reserves for output. effort is
# 'high' (the request must carry the profile's effort field with exactly that value) or None (the
# request must not carry it at all). json_object says whether JSON mode may be asked for.
ModelRow = namedtuple('ModelRow', 'model maker input_usd_per_m output_usd_per_m output_bound effort json_object')


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
      rows {model: ModelRow}             the reviewed models
      path_for(row) -> str               the POST path (checked: no '?', starts with '/')
      auth_headers(key) -> dict          the header(s) carrying the key
      requested_model(body) -> str|None  where the request names its model
      body_valid(body, row) -> bool      the exact request shape this row accepts
      request_bytes(body) -> bytes       the bytes sent (never longer than the bytes priced)
      reservation_prices(row, moment) -> (in, out)  USD per million used to reserve at moment
      ceiling_prices(row) -> (in, out)   the highest prices the row can ever reserve at (worst cases)
      account(response, row, moment) -> dict  usage and guard charge (see account_response's keys)
      reply_model(response) -> str|None  where the reply names the model that answered
      unbilled_refusal(status, response) -> bool  a refusal that provably billed nothing
      probe_body(row) -> dict            the probe's tiny request (max_tokens <= 1024)
      reply_text(response) -> str|None   answer or error text, for the probe's short excerpt
    """
    name = 'deepinfra'
    host = 'api.deepinfra.com'
    path = '/v1/openai/chat/completions'
    per_call_cap_usd = Decimal('0.25')
    max_request_bytes = 256 * 1024
    redaction_patterns = ()  # DeepInfra keys have no fixed shape; the key itself and Bearer are always blanked.
    rows = {row.model: row for row in (
        ModelRow('zai-org/GLM-5.3-Flash', 'Z.AI', Decimal('0.15'), Decimal('0.50'), 163840, 'high', True),
        ModelRow('deepseek-ai/DeepSeek-V4.1-Flash', 'DeepSeek', Decimal('0.20'), Decimal('0.60'), 131072, 'high', False),
        ModelRow('XiaomiMiMo/MiMo-V2.6-Pro', 'Xiaomi', Decimal('0.43'), Decimal('0.87'), 131072, None, False))}

    def path_for(self, row):
        return self.path

    def auth_headers(self, key):
        return {'Authorization': 'Bearer ' + key}

    def reservation_prices(self, row, moment):
        """DeepInfra's list prices do not change with the date or the prompt size."""
        return row.input_usd_per_m, row.output_usd_per_m

    def ceiling_prices(self, row):
        return row.input_usd_per_m, row.output_usd_per_m

    def requested_model(self, body):
        """Where the request names its model (looked up before anything else is checked)."""
        return body.get('model') if isinstance(body, dict) else None

    def body_valid(self, body, row):
        """Exactly model, max_tokens and messages; reasoning_effort "high" iff the row says so; an
        optional response_format {"type": "json_object"} only for a row that allows it."""
        if not isinstance(body, dict) or body.get('model') != row.model:
            return False
        fields = {'model', 'max_tokens', 'messages'} | ({'reasoning_effort'} if row.effort else set())
        extra = set(body) - fields
        if not fields <= set(body) or extra - {'response_format'}:
            return False
        if extra:
            mode = body['response_format']
            if not row.json_object or not (isinstance(mode, dict) and set(mode) == {'type'} and mode['type'] == 'json_object'):
                return False
        if row.effort and body['reasoning_effort'] != row.effort:
            return False
        return (type(body['max_tokens']) is int and 1 <= body['max_tokens'] <= row.output_bound
                and isinstance(body['messages'], list) and bool(body['messages'])
                and all(isinstance(m, dict) and set(m) == {'role', 'content'} and m['role'] in ('system', 'user', 'assistant')
                        and isinstance(m['content'], str) for m in body['messages']))

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
        inference_status (DeepInfra's native cost block) or tokens_* key at any depth. The gate then releases the hold as for a call never sent (it counts toward the
        unsent streak). Anything else is accounted (and halts) as before."""
        return (status == 429 and isinstance(response, dict) and bool(response.get('error'))
                and not names_any_key(response, BILLED_KEYS)
                and not names_any_key_prefixed(response, 'tokens_'))

    def probe_body(self, row):
        body = {'model': row.model, 'max_tokens': min(1024, row.output_bound),
                'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
        if row.effort:
            body['reasoning_effort'] = row.effort
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


# The providers this gate can serve. A provider name without a reviewed profile here (Anthropic,
# until its profile is added) is refused.
PROFILES = {profile.name: profile for profile in (DeepInfraProfile(),)}


def _is_text_part_list(parts):
    """Exactly one part, and that part is exactly {"text": <string>}."""
    return (isinstance(parts, list) and len(parts) == 1 and isinstance(parts[0], dict)
            and set(parts[0]) == {'text'} and isinstance(parts[0]['text'], str))


def _whole(value):
    return type(value) is int and 0 <= value <= 2 ** 31 - 1


GOOGLE_PRICE_ZONE = 'Europe/Bucharest'
# Gemini 3.8 Flash list prices, USD per million tokens, by the vendor's dated table
# (ai.google.dev/gemini-api/docs/pricing, read 2026-10-10): thinking is billed as output. Each step
# is (first day it applies, input, output); the last step's prices are the ceiling.
GOOGLE_PRICE_STEPS = (('0001-01-01', Decimal('0.75'), Decimal('3.75')),
                      ('2027-01-01', Decimal('1.50'), Decimal('7.50')))
# Google's own day boundary is not stated, so a price is taken as in force from the start of the
# Bucharest day BEFORE the vendor's date (Bucharest is behind every zone from UTC+3 to UTC+14, and a
# day earlier covers the zones behind it): the gate never prices a call below the vendor's price.


def google_prices_on(day):
    """The dated (input, output) list prices for one ISO day (YYYY-MM-DD)."""
    prices = None
    for first_day, input_price, output_price in GOOGLE_PRICE_STEPS:
        if day >= first_day:
            prices = (input_price, output_price)
    return prices


def google_careful_prices(moment):
    """The higher of the prices for moment's Bucharest day and for the next Bucharest day.

    Used for both the reservation (at the moment the gate checks the request) and the settlement
    (at the moment the reply is accounted). The app computes the very same figure for its
    reservation (preview-google.ts, parity fixture). Prices only ever rise in the table, so
    'higher' is element-wise and the next day's prices win at a step."""
    if not isinstance(moment, datetime) or moment.tzinfo is None:
        raise SafetyError('CLOCK_INVALID')  # noqa: F821 - provided by the gate
    today = moment.astimezone(ZoneInfo(GOOGLE_PRICE_ZONE)).date()
    first, second = google_prices_on(today.isoformat()), google_prices_on((today + timedelta(days=1)).isoformat())
    return max(first[0], second[0]), max(first[1], second[1])


# The usage fields a Gemini generateContent reply may carry. Counts left out mean 0 (proto3 JSON
# drops zero values); the detail lists are per-modality splits of the counts above them.
GOOGLE_USAGE_COUNTS = ('promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount',
                       'cachedContentTokenCount', 'toolUsePromptTokenCount')
GOOGLE_USAGE_DETAILS = {'promptTokensDetails': 'promptTokenCount', 'candidatesTokensDetails': 'candidatesTokenCount',
                        'cacheTokensDetails': 'cachedContentTokenCount',
                        'toolUsePromptTokensDetails': 'toolUsePromptTokenCount'}
# Any of these anywhere in a refusal means it may have produced (and billed) an answer.
GOOGLE_BILLED_KEYS = ('candidates', 'usageMetadata', 'modelVersion', 'responseId', 'promptFeedback')
GOOGLE_UNBILLED_STATUSES = {429: 'RESOURCE_EXHAUSTED', 503: 'UNAVAILABLE'}


def _details_valid(details, ceiling):
    """A per-modality split: a list of {"modality": str, "tokenCount": int} whose counts sum to no
    more than the count it splits."""
    if not isinstance(details, list) or not all(
            isinstance(item, dict) and set(item) <= {'modality', 'tokenCount'} and isinstance(item.get('modality'), str)
            and _whole(item.get('tokenCount', 0)) for item in details):
        return False
    return sum(item.get('tokenCount', 0) for item in details) <= ceiling


def account_gemini_usage(response, input_price, output_price):
    """Gemini usageMetadata priced at one (input, output) pair: input = promptTokenCount, output =
    candidatesTokenCount + thoughtsTokenCount (thinking is billed as output). Valid only if every
    field is a known one, the total adds up exactly (tool-use prompt tokens must be absent or 0,
    as no tools are ever sent), no cached tokens are reported (no cache is ever asked for) and
    the prompt and total are present. Anything else is invalid usage: the call stays uncertain
    and the gate halts."""
    usage = response.get('usageMetadata') if isinstance(response, dict) else None
    known = isinstance(usage, dict) and set(usage) <= set(GOOGLE_USAGE_COUNTS) | set(GOOGLE_USAGE_DETAILS)
    usage = usage if isinstance(usage, dict) else {}
    counts = {name: usage.get(name, 0) for name in GOOGLE_USAGE_COUNTS}
    whole = all(_whole(value) for value in counts.values())
    prompt, candidates, thoughts = counts['promptTokenCount'], counts['candidatesTokenCount'], counts['thoughtsTokenCount']
    total, cached, tool = counts['totalTokenCount'], counts['cachedContentTokenCount'], counts['toolUsePromptTokenCount']
    valid = (known and whole and 'promptTokenCount' in usage and 'totalTokenCount' in usage
             and cached == 0 and tool == 0 and total == prompt + candidates + thoughts + tool
             and all(_details_valid(usage[name], counts[count]) for name, count in GOOGLE_USAGE_DETAILS.items()
                     if name in usage))
    completion = candidates + thoughts if whole else None
    configured = ((Decimal(prompt) * input_price + Decimal(completion) * output_price) / Decimal(1000000)) if valid else None

    def reported(name):
        value = usage.get(name)
        return value if _whole(value) else None
    return {'input_usd_per_m': str(input_price), 'output_usd_per_m': str(output_price),  # The settlement prices.
            'prompt_tokens': reported('promptTokenCount'), 'completion_tokens': completion if valid else None,
            'candidates_tokens': reported('candidatesTokenCount'), 'reasoning_tokens': reported('thoughtsTokenCount'),
            'total_tokens': reported('totalTokenCount'), 'cached_tokens': reported('cachedContentTokenCount'),
            'tool_use_prompt_tokens': reported('toolUsePromptTokenCount'), 'usage_valid': valid,
            'configured_price_cost_usd': str(configured) if configured is not None else None,
            'provider_estimated_cost_usd': None,
            'guard_charge_usd': str(configured) if configured is not None else None,
            'cost_basis': ('dated list price x (prompt; candidates + thoughts)' if configured is not None
                           else 'unknown; full reservation retained')}


class GoogleProfile:
    """generativelanguage.googleapis.com, native Gemini generateContent, key in x-goog-api-key.
    One row reviewed 2026-10-10 (gemini-3.8-flash). The profile API is DeepInfraProfile's.

    The app frames each request as {"model": <id>, "request": <native body>} (exactly those two
    keys): the model is read from the frame, the path is built from the row (never from the
    request, and never with a query, so the key can never travel in a URL), and the bytes sent are
    the canonical inner native body, which is always shorter than the framed bytes the reservation
    priced. Prices are dated (GOOGLE_PRICE_STEPS): a call reserves and settles at the higher of the
    prices of its Bucharest day and the next one; the worst cases use the ceiling (the last step).

    Unmeasured until the root-only probe's paid call: the exact modelVersion the reply echoes (the
    gate accepts exactly the row's id and halts on anything else), and whether thought tokens stay
    within maxOutputTokens for generateContent (if they do not, a charge can pass its reservation
    and the gate halts on charge_overrun; the probe prints completion_within_max_tokens)."""
    name = 'google'
    host = 'generativelanguage.googleapis.com'
    per_call_cap_usd = Decimal('0.55')
    # The engine never sends a native body over 256 KiB (MAX_PROVIDER_REQUEST_PACKET_BYTES); the
    # frame adds 40 bytes for this model id. A smaller limit could refuse a call mid-debate.
    max_request_bytes = 256 * 1024 + 64
    redaction_patterns = (r'AIza[0-9A-Za-z_-]{35}',)
    rows = {row.model: row for row in (
        # The row's own prices are the ceiling (the last dated step); calls use google_careful_prices.
        ModelRow('gemini-3.8-flash', 'Google', Decimal('1.50'), Decimal('7.50'), 16384, 'high', False),)}

    def path_for(self, row):
        return '/v1beta/models/' + row.model + ':generateContent'

    def auth_headers(self, key):
        return {'x-goog-api-key': key}

    def reservation_prices(self, row, moment):
        return google_careful_prices(moment)

    def ceiling_prices(self, row):
        return GOOGLE_PRICE_STEPS[-1][1], GOOGLE_PRICE_STEPS[-1][2]

    def requested_model(self, body):
        return body.get('model') if isinstance(body, dict) else None

    def body_valid(self, body, row):
        """The frame, then the native body exactly as the wire contract fixes it: contents (user
        and model turns, one text part each, the user first), an optional systemInstruction with
        one text part, and generationConfig with exactly maxOutputTokens (1..the row's bound) and,
        iff the row's effort is "high", thinkingConfig {"thinkingLevel": "high"}. No tools, cache,
        safety settings, labels, stop sequences, sampling or JSON mode (no row allows it)."""
        if not isinstance(body, dict) or set(body) != {'model', 'request'} or body['model'] != row.model:
            return False
        native = body['request']
        if not isinstance(native, dict) or not {'contents', 'generationConfig'} <= set(native) \
                or not set(native) <= {'contents', 'generationConfig', 'systemInstruction'}:
            return False
        contents = native['contents']
        if not (isinstance(contents, list) and contents and all(
                isinstance(turn, dict) and set(turn) == {'role', 'parts'} and turn['role'] in ('user', 'model')
                and _is_text_part_list(turn['parts']) for turn in contents) and contents[0]['role'] == 'user'):
            return False
        if 'systemInstruction' in native:
            system = native['systemInstruction']
            if not (isinstance(system, dict) and set(system) == {'parts'} and _is_text_part_list(system['parts'])):
                return False
        config = native['generationConfig']
        expected = {'maxOutputTokens'} | ({'thinkingConfig'} if row.effort else set())
        if not isinstance(config, dict) or set(config) != expected:
            return False
        if row.effort and config['thinkingConfig'] != {'thinkingLevel': row.effort}:
            return False
        return type(config['maxOutputTokens']) is int and 1 <= config['maxOutputTokens'] <= row.output_bound

    def request_bytes(self, body):
        """The canonical inner native body: never longer than the framed bytes that were priced."""
        return canonical(body['request'])

    def account(self, response, row, moment):
        return account_gemini_usage(response, *google_careful_prices(moment))

    def reply_model(self, response):
        return response.get('modelVersion')

    def unbilled_refusal(self, status, response):
        """True only for a 429 RESOURCE_EXHAUSTED or a 503 UNAVAILABLE whose body is exactly
        {"error": {"code", "status", "message", "details"?}} with the code equal to the HTTP status,
        and with no candidates, usageMetadata, modelVersion, responseId, promptFeedback (or any
        other billed key) at any depth. Judged on the raw reply."""
        expected = GOOGLE_UNBILLED_STATUSES.get(status) if type(status) is int else None
        if expected is None or not isinstance(response, dict) or set(response) != {'error'}:
            return False
        error = response['error']
        return bool(isinstance(error, dict) and {'code', 'status', 'message'} <= set(error)
                    and set(error) <= {'code', 'status', 'message', 'details'}
                    and type(error['code']) is int and error['code'] == status and error['status'] == expected
                    and isinstance(error['message'], str) and isinstance(error.get('details', []), list)
                    and not names_any_key(response, GOOGLE_BILLED_KEYS + BILLED_KEYS)
                    and not names_any_key_prefixed(response, 'tokens_'))

    def probe_body(self, row):
        config = {'maxOutputTokens': min(1024, row.output_bound)}
        if row.effort:
            config['thinkingConfig'] = {'thinkingLevel': row.effort}
        return {'model': row.model, 'request': {'contents': [{'role': 'user', 'parts': [{'text': 'Reply exactly: OK'}]}],
                                                'generationConfig': config}}

    def reply_text(self, response):
        """The answer's text parts (thought parts left out), or a provider error's message."""
        candidates = response.get('candidates')
        if isinstance(candidates, list) and candidates and isinstance(candidates[0], dict):
            content = candidates[0].get('content')
            parts = content.get('parts') if isinstance(content, dict) else None
            if not isinstance(parts, list):
                return None
            return ''.join(part['text'] for part in parts
                           if isinstance(part, dict) and isinstance(part.get('text'), str) and part.get('thought') is not True)
        error = response.get('error')
        return error.get('message') if isinstance(error, dict) and isinstance(error.get('message'), str) else None


PROFILES[GoogleProfile.name] = GoogleProfile()


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
