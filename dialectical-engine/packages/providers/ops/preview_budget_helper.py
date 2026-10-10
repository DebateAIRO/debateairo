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
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

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


# Anthropic's list prices (USD per million tokens) for the reviewed row, in two steps by the size
# of the prompt (platform.claude.com/docs/en/about-claude/pricing, read 2026-10-10). The prompt
# total counts every input token: plain input, cache writes and cache reads.
PriceStep = namedtuple('PriceStep', 'name prompt_tokens_up_to input_usd_per_m cache_write_5m_usd_per_m '
                                    'cache_write_1h_usd_per_m cache_read_usd_per_m output_usd_per_m')
ANTHROPIC_USAGE_KEYS = frozenset({'input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens',
                                  'cache_creation', 'server_tool_use', 'service_tier', 'inference_geo'})
ANTHROPIC_CACHE_SPLIT_KEYS = frozenset({'ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'})


class AnthropicProfile:
    """api.anthropic.com, Messages API (POST /v1/messages), x-api-key plus anthropic-version.
    One reviewed row (Claude Haiku 5.5), 2026-10-10. The profile API is DeepInfraProfile's.

    Reservation: the row's prices are the dearest the request can meet: the upper step's
    5-minute cache-write price for every input token (0.625) and its output price (2.50), so a
    full 256 KiB request reserves (264,192 x 0.625 + 32,768 x 2.50) / 1e6 = $0.24704, under the
    $0.25 cap. Settlement: the real step (prompt total <= 100,000 tokens: the lower one), each
    kind of input token at its own price. Anthropic reports no cost, so the guard charge is that
    list-price charge. Any usage field this profile does not know, any server-tool use, another
    service tier or region, or a tool block makes the usage invalid: uncertain, and the gate halts.
    """
    name = 'anthropic'
    host = 'api.anthropic.com'
    path = '/v1/messages'
    api_version = '2023-06-01'
    per_call_cap_usd = Decimal('0.25')
    max_request_bytes = 256 * 1024
    redaction_patterns = (r'sk-ant-[A-Za-z0-9_-]+',)
    rows = {row.model: row for row in (
        ModelRow('claude-haiku-5-5', 'Anthropic', Decimal('0.625'), Decimal('2.50'), 32768, 'high', False),)}
    settlement_steps = (
        PriceStep('up_to_100k', 100000, Decimal('0.10'), Decimal('0.125'), Decimal('0.20'), Decimal('0.01'), Decimal('0.50')),
        PriceStep('over_100k', None, Decimal('0.50'), Decimal('0.625'), Decimal('1.00'), Decimal('0.05'), Decimal('2.50')))
    # Request fields beyond these are refused (no thinking, tools, stream, sampling, cache_control...).
    BODY_FIELDS = frozenset({'model', 'max_tokens', 'messages', 'system', 'output_config'})

    def path_for(self, row):
        return self.path

    def auth_headers(self, key):
        return {'x-api-key': key, 'anthropic-version': self.api_version}

    def reservation_prices(self, row, moment):
        """Anthropic's list prices do not change with the date; the row holds the upper step's
        dearest input price and its output price, so the reservation covers either step."""
        return row.input_usd_per_m, row.output_usd_per_m

    def ceiling_prices(self, row):
        return row.input_usd_per_m, row.output_usd_per_m

    def requested_model(self, body):
        return body.get('model') if isinstance(body, dict) else None

    def body_valid(self, body, row):
        """Exactly model, max_tokens and messages, an optional system string, and output_config
        {"effort": "high"} iff the row says so (then required). Messages are text only, first
        role user; nothing else anywhere (contract-BC-wire, Anthropic)."""
        if not isinstance(body, dict) or body.get('model') != row.model:
            return False
        required = {'model', 'max_tokens', 'messages'} | ({'output_config'} if row.effort else set())
        allowed = required | {'system'}
        if not required <= set(body) <= allowed:
            return False
        if row.effort:
            config = body['output_config']
            if not (isinstance(config, dict) and set(config) == {'effort'} and isinstance(config['effort'], str)
                    and config['effort'] == row.effort):
                return False
        if 'system' in body and not isinstance(body['system'], str):
            return False
        messages = body['messages']
        return (type(body['max_tokens']) is int and 1 <= body['max_tokens'] <= row.output_bound
                and isinstance(messages, list) and bool(messages)
                and all(isinstance(m, dict) and set(m) == {'role', 'content'} and m['role'] in ('user', 'assistant')
                        and isinstance(m['content'], str) for m in messages)
                and messages[0]['role'] == 'user')

    def request_bytes(self, body):
        return canonical(body)

    def usage_counts(self, response):
        """(input, cache creation, cache read, 1-hour part of the creation, output) from a reply
        whose usage this profile fully understands, else None (uncertain)."""
        if not isinstance(response, dict) or response.get('type') != 'message':
            return None
        content = response.get('content')
        if not isinstance(content, list) or not all(isinstance(block, dict) for block in content):
            return None
        for block in content:  # Any tool activity (client or server side) may bill beyond the tokens.
            kind = block.get('type')
            if not isinstance(kind, str) or 'tool_use' in kind or 'tool_result' in kind:
                return None
        usage = response.get('usage')
        if not isinstance(usage, dict) or not set(usage) <= ANTHROPIC_USAGE_KEYS:
            return None
        input_tokens, output_tokens = usage.get('input_tokens'), usage.get('output_tokens')
        creation, read = usage.get('cache_creation_input_tokens'), usage.get('cache_read_input_tokens')
        if not (integer(input_tokens) and integer(output_tokens)):
            return None
        if not all(value is None or integer(value) for value in (creation, read)):
            return None
        creation, read = creation or 0, read or 0
        tools = usage.get('server_tool_use')
        if tools is not None and not (isinstance(tools, dict) and all(type(v) is int and v == 0 for v in tools.values())):
            return None
        if usage.get('service_tier') not in (None, 'standard') or usage.get('inference_geo') not in (None, 'global'):
            return None
        hour = 0
        split = usage.get('cache_creation')
        if split is not None:
            if not (isinstance(split, dict) and set(split) == ANTHROPIC_CACHE_SPLIT_KEYS
                    and all(integer(value) for value in split.values())
                    and split['ephemeral_5m_input_tokens'] + split['ephemeral_1h_input_tokens'] == creation):
                return None
            hour = split['ephemeral_1h_input_tokens']
        return input_tokens, creation, read, hour, output_tokens

    def step_for(self, prompt_total):
        lower, upper = self.settlement_steps
        return lower if prompt_total <= lower.prompt_tokens_up_to else upper

    def account(self, response, row, moment):
        counts = self.usage_counts(response)
        if counts is None:
            return {'input_usd_per_m': None, 'output_usd_per_m': None, 'prompt_tokens': None, 'completion_tokens': None,
                    'total_tokens': None, 'cached_tokens': None, 'reasoning_tokens': None, 'usage_valid': False,
                    'configured_price_cost_usd': None, 'provider_estimated_cost_usd': None, 'guard_charge_usd': None,
                    'cost_basis': 'unknown; full reservation retained'}
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

    def unbilled_refusal(self, status, response):
        """True only for Anthropic's own "slow down" answers (owner ruling 5, 2026-10-10): HTTP 429
        or 529, a body of exactly type "error", error (and an optional request_id string), an
        error type of rate_limit_error or overloaded_error, and no usage, content or model key, no
        other billed key (BILLED_KEYS) and no tokens_* key at any depth. The core passes the RAW
        reply (before redaction drops any subtree). Anything else is accounted (and halts) as before."""
        if status not in (429, 529) or not isinstance(response, dict):
            return False
        if set(response) not in ({'type', 'error'}, {'type', 'error', 'request_id'}):
            return False
        error = response['error']
        return (response['type'] == 'error' and isinstance(error, dict)
                and error.get('type') in ('rate_limit_error', 'overloaded_error')
                and isinstance(response.get('request_id', ''), str)
                and not names_any_key(response, BILLED_KEYS + ('content', 'model'))
                and not names_any_key_prefixed(response, 'tokens_'))

    def probe_body(self, row):
        body = {'model': row.model, 'max_tokens': min(1024, row.output_bound),
                'messages': [{'role': 'user', 'content': 'Reply exactly: OK'}]}
        if row.effort:
            body['output_config'] = {'effort': row.effort}
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
