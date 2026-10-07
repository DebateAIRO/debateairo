"""Custody, accounting and transport primitives for the private preview spending gate.

Adapted from the reviewed DeepInfra benchmark helper; it keeps only what the gate needs.
The gate runs this file from its own directory, only after checking that root owns it and no one
else can write it, and that its hash is the one the GO binds. It is never imported on its own.
No retries, external packages, environment proxies, redirects, or credential artifacts.
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
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

INPUT_PRICE = Decimal('0.15')
OUTPUT_PRICE = Decimal('0.50')
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 600


# SafetyError is not defined here: the gate checks this file's custody and hash, then runs it with
# its own SafetyError already in the namespace, so the gate and the helper raise one class.


class ResponseTooLarge(SafetyError):  # noqa: F821 - provided by the gate
    pass


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


def account_response(response):
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
    configured = ((Decimal(prompt) * INPUT_PRICE + Decimal(completion) * OUTPUT_PRICE) / Decimal(1000000)) if valid else None
    provider = decimal_amount(usage.get('estimated_cost', response.get('estimated_cost')))
    reliable = [value for value in (configured, provider) if value is not None]
    return {'prompt_tokens': prompt if integer(prompt) else None, 'completion_tokens': completion if integer(completion) else None,
            'total_tokens': total if integer(total) else None, 'cached_tokens': cached if integer(cached) else None,
            'reasoning_tokens': reasoning if integer(reasoning) else None, 'usage_valid': valid,
            'configured_price_cost_usd': str(configured) if configured is not None else None,
            'provider_estimated_cost_usd': str(provider) if provider is not None else None,
            'guard_charge_usd': str(max(reliable)) if reliable else None,
            'cost_basis': 'max(configured uncached list-price usage, provider estimated cost)' if reliable else 'unknown; full reservation retained'}


def redact(value, key):
    sensitive = {'authorization', 'proxy-authorization', 'api_key', 'api-key', 'apikey', 'headers', 'request_headers', 'access_token', 'refresh_token', 'secret'}
    if isinstance(value, dict):
        return {redact(str(k), key): redact(v, key) for k, v in value.items() if str(k).lower() not in sensitive}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str):
        return re.sub(r'(?i)bearer\s+[^\s"<>]+', 'Bearer [REDACTED]', value.replace(key, '[REDACTED]'))
    return value


class HttpsTransport:
    """Direct verified HTTPS only. http.client follows no redirects or env proxies."""

    def __init__(self, timeout, max_response_bytes=MAX_RESPONSE_BYTES):
        self.max_response_bytes = min(max_response_bytes, MAX_RESPONSE_BYTES)
        self.timeout = min(timeout, MAX_TIMEOUT_SECONDS)

    def __call__(self, payload, key):
        # The gate checks and prices these exact bytes before it reserves; they are sent unchanged.
        if not isinstance(payload, bytes):
            raise SafetyError('request_bytes_required')
        deadline = time.monotonic() + self.timeout
        connection = http.client.HTTPSConnection('api.deepinfra.com', timeout=self.timeout, context=ssl.create_default_context())

        def remaining():
            seconds = deadline - time.monotonic()
            if seconds <= 0:
                raise TimeoutError('deadline')
            if connection.sock is not None:
                connection.sock.settimeout(seconds)
        try:
            connection.connect()
            remaining()
            connection.request('POST', '/v1/openai/chat/completions', body=payload,
                               headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
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
