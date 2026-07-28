from __future__ import annotations

import argparse
import asyncio
import json
import math
import signal
import sys
import time
from typing import Any

import httpx

from app.capabilities import detect_adapters
from app.client import CoordinatorClient
from app.config import (
    MissingCredentialsError,
    WorkerConfig,
    ensure_identity_persisted,
    identity_snapshot_path,
    load_config,
    resolve_user_token,
    resolved_config_path,
    save_config,
    snapshot_identity,
)
from app.result_contracts import (
    StructuredOutputError,
    enrich_v2_result,
    extract_json_object,
    failure_is_permanent,
    parse_model_result,
)

# sysexits.h EX_CONFIG: shows up in `launchctl list` as status 78, so an
# unconfigured worker is distinguishable from any other crash (status 1).
EX_CONFIG = 78


def startup_credentials_check(config: WorkerConfig) -> None:
    """Fail loudly, and distinguishably from other crashes, when the worker
    can neither authenticate (stored worker_id/worker_token) nor register
    (user token from config, env, or keychain).

    Without this, a worker whose config file lost its identity crash-loops
    under launchd KeepAlive on a generic RuntimeError raised deep inside
    registration -- the 2026-07-26/27 outage shape.
    """
    if config.worker_id and config.worker_token:
        return
    if config.user_token:
        return
    config_path = resolved_config_path(None)
    snapshot_path = identity_snapshot_path(None)
    lines = [
        "Worker cannot start: no stored identity and no registration credential.",
        f"  config file: {config_path}",
        f"  worker_id: {'present' if config.worker_id else 'MISSING'}, "
        f"worker_token: {'present' if config.worker_token else 'MISSING'}",
        "  user_token: not set (config user_token / DIALECTICAL_USER_TOKEN env)",
        f"  Keychain: no token obtained (service {config.keychain_service!r}, account "
        f"{config.keychain_account!r}) -- item missing, keychain locked, or lookup failed",
        "Fix one of:",
        f"  - restore worker_id and worker_token in {config_path}",
        "  - store the operator token once in the macOS Keychain so launchd restarts recover unattended:",
        f"      security add-generic-password -s {config.keychain_service} -a {config.keychain_account} -w",
        "  - run one registration with DIALECTICAL_USER_TOKEN set; the worker persists the identity for later restarts",
    ]
    if snapshot_path.exists():
        lines.insert(
            1,
            f"  An identity snapshot exists at {snapshot_path} -- restore worker_id/worker_token from it.",
        )
    raise MissingCredentialsError("\n".join(lines))


def parse_result(job: dict[str, Any], text: str) -> Any:
    return parse_model_result(job, text)


def estimate_tokens(*parts: str) -> int:
    text = "\n".join(part for part in parts if part)
    if not text.strip():
        return 0
    return max(1, len(text.split()), math.ceil(len(text) / 4))


async def handle_job(client: CoordinatorClient, adapters: dict[str, Any], job: dict[str, Any]) -> None:
    await handle_job_with_heartbeats(client, adapters, job)


def retryable_coordinator_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.RequestError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return 500 <= exc.response.status_code < 600
    return False


def identity_desync_error(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    status = exc.response.status_code
    if status in {401, 404}:
        return True
    if status == 403:
        # A 403 on a worker-identity endpoint (register / heartbeat / poll)
        # means the coordinator no longer recognizes this worker identity, so
        # recover by re-registering a fresh identity -- same path as 401/404.
        # Job-endpoint 403s ("not claimed by this worker" / stale mutation) are
        # a different signal handled by stale_job_coordinator_error, so this is
        # scoped to /api/workers/ to avoid conflating the two.
        return "/api/workers/" in str(exc.request.url)
    return False


def stale_job_coordinator_error(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    if exc.response.status_code not in {403, 404, 409}:
        return False
    detail = ""
    try:
        payload = exc.response.json()
        if isinstance(payload, dict):
            detail = str(payload.get("detail") or "")
    except Exception:  # noqa: BLE001 - best-effort classification for stale job responses.
        detail = exc.response.text
    return detail.startswith("Job ") or "cannot be mutated" in detail


def nonretryable_coordinator_completion_error(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    return exc.response.status_code == 400 and "/complete" in str(exc.request.url)


# Transient network errors that warrant a bounded retry of /complete. These
# typically mean the acknowledgement was lost—not that the completion itself
# failed—so exhausting the retries produces CompletionDeliveryUncertain and
# must never be converted into /fail.
TRANSIENT_NETWORK_ERRORS = (
    httpx.TimeoutException,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.RemoteProtocolError,
)
COMPLETE_RETRY_ATTEMPTS = 3
COMPLETE_RETRY_BACKOFF_SECONDS = 0.5


class CompletionDeliveryUncertain(RuntimeError):
    """The coordinator may have committed /complete before the reply was lost."""


def failure_reason_for(exc: Exception) -> str:
    """A non-empty failure reason for the coordinator FailRequest contract.

    Some exceptions stringify to "" (e.g. str(httpx.ReadError()) == ""), which
    would violate the coordinator's min_length=1 reason and crash the worker.
    Fall back to the exception class name when the message is empty.
    """
    message = str(exc).strip()
    if message:
        return message
    return f"worker error: {type(exc).__name__}"


async def complete_with_retry(
    client: CoordinatorClient,
    job_id: str,
    result: Any,
    started_at: float,
    tokens_in: int,
    tokens_out: int,
) -> None:
    """Call client.complete, retrying transient network errors a bounded number
    of times before surfacing an explicitly ambiguous delivery outcome."""
    for attempt in range(1, COMPLETE_RETRY_ATTEMPTS + 1):
        try:
            await client.complete(job_id, result, started_at, tokens_in, tokens_out)
            return
        except TRANSIENT_NETWORK_ERRORS as exc:
            if attempt >= COMPLETE_RETRY_ATTEMPTS:
                raise CompletionDeliveryUncertain(
                    f"Completion acknowledgement remained unavailable after "
                    f"{COMPLETE_RETRY_ATTEMPTS} attempts"
                ) from exc
            print(
                f"Transient network error completing job {job_id} "
                f"(attempt {attempt}/{COMPLETE_RETRY_ATTEMPTS}): {exc!r}. Retrying.",
                flush=True,
            )
            await asyncio.sleep(COMPLETE_RETRY_BACKOFF_SECONDS)


async def wait_or_stop(stop: asyncio.Event, seconds: float) -> None:
    if seconds <= 0:
        await asyncio.sleep(0)
        return
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except asyncio.TimeoutError:
        return


async def register_with_backoff(
    client: CoordinatorClient,
    capabilities: list[str],
    stop: asyncio.Event,
    initial_backoff_seconds: float = 1,
    max_backoff_seconds: float = 30,
    status: str = "online",
    rotate_token: bool = False,
) -> None:
    backoff_seconds = initial_backoff_seconds
    while not stop.is_set():
        try:
            await client.register(capabilities, rotate_token=rotate_token)
            await client.heartbeat(capabilities, status=status)
            return
        except Exception as exc:
            if not retryable_coordinator_error(exc):
                raise
            print(f"Coordinator unavailable during registration: {exc}. Retrying in {backoff_seconds}s.", flush=True)
            await wait_or_stop(stop, backoff_seconds)
            backoff_seconds = min(max_backoff_seconds, backoff_seconds * 2 if backoff_seconds else max_backoff_seconds)


async def handle_job_with_heartbeats(
    client: CoordinatorClient,
    adapters: dict[str, Any],
    job: dict[str, Any],
    capabilities: list[str] | None = None,
    heartbeat_seconds: float = 30,
) -> None:
    adapter = adapters[job["required_model"]]
    prompt = job["prompt"]
    output: list[str] = []
    started_at = time.monotonic()
    tokens_in = estimate_tokens(prompt["system"], prompt["user"])
    stop_heartbeat = asyncio.Event()

    async def heartbeat_loop() -> None:
        if not capabilities or heartbeat_seconds <= 0:
            return
        while not stop_heartbeat.is_set():
            try:
                await asyncio.wait_for(stop_heartbeat.wait(), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                try:
                    await client.heartbeat(capabilities)
                except Exception as exc:  # noqa: BLE001 - keep the in-flight generation running.
                    print(f"Heartbeat failed during job {job['id']}: {exc}", flush=True)

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    try:
        async def chunks():
            async for delta in adapter.stream(prompt["system"], prompt["user"], prompt["max_tokens"]):
                output.append(delta)
                yield delta

        timeout_seconds = max(
            1,
            int(getattr(getattr(client, "config", None), "generation_timeout_seconds", 540)),
        )
        try:
            async with asyncio.timeout(timeout_seconds):
                await client.stream_chunks(job["id"], chunks())
        except TimeoutError as exc:
            raise RuntimeError(
                f"{job['required_model']} generation exceeded the worker deadline "
                f"of {timeout_seconds}s"
            ) from exc
        text = "".join(output)
        result = parse_result(job, text)
        client_config = getattr(client, "config", None)
        result = enrich_v2_result(job, result, getattr(client_config, "worker_id", None))
        if str(job.get("job_type") or "").startswith("v2_"):
            print(f"V2 result for {job['id']}: {json.dumps(result, default=str)[:2000]}", flush=True)
        await complete_with_retry(client, job["id"], result, started_at, tokens_in, estimate_tokens(text))
    except Exception as exc:
        if isinstance(exc, CompletionDeliveryUncertain):
            # Never turn an ambiguous /complete acknowledgement into /fail.
            # The coordinator may already have durably completed the job while
            # its response was delayed or lost. A false /fail races that
            # transaction and can reopen/requeue successful work. If none of
            # the completion attempts arrived, the coordinator's lease expiry
            # safely requeues the still-running job instead.
            print(
                f"Completion delivery uncertain for job {job['id']}; "
                "leaving coordinator state authoritative.",
                flush=True,
            )
            return
        if stale_job_coordinator_error(exc):
            print(f"Coordinator no longer accepts job {job['id']}: {exc}", flush=True)
            return
        try:
            await client.fail(
                job["id"],
                failure_reason_for(exc),
                retryable=not failure_is_permanent(exc)
                and not nonretryable_coordinator_completion_error(exc),
            )
        except Exception as fail_exc:
            if stale_job_coordinator_error(fail_exc):
                print(f"Coordinator no longer accepts failure for job {job['id']}: {fail_exc}", flush=True)
                return
            if isinstance(fail_exc, (httpx.HTTPStatusError, httpx.RequestError)):
                # Reporting a job failure is best-effort: a 4xx/5xx or a network
                # drop on /fail must NEVER kill the worker process. The job is
                # coordinator-side recoverable (its deadline reaper re-queues
                # it), so log and continue the worker loop instead of raising.
                print(
                    f"Failed to report failure for job {job['id']} ({fail_exc!r}); "
                    "continuing worker loop.",
                    flush=True,
                )
                return
            raise
    finally:
        stop_heartbeat.set()
        await heartbeat_task


RECOVERY_ATTEMPT_CAP = 5


async def handle_identity_desync(
    client: CoordinatorClient,
    capabilities: list[str],
    stop: asyncio.Event,
    recovery_attempts: int,
) -> int:
    """One identity-recovery cycle with a hard cap.

    Clears local identity and re-registers with token rotation. Repeated
    auth-class failures increment the attempt counter; at the cap the worker
    sends a best-effort blocked_auth heartbeat (so the coordinator reports the
    true state) and exits loudly instead of looping forever. Returns the
    updated attempt counter; callers reset it to 0 only after a healthy poll.
    """
    recovery_attempts += 1
    if client.config.worker_id and client.config.worker_token:
        client.last_known_identity = (client.config.worker_id, client.config.worker_token)
        # A desync detection can be wrong (coordinator restoring from backup,
        # transient auth misconfiguration). Snapshot the identity to disk
        # before wiping so the operator can restore it; best-effort only.
        try:
            snapshot_path = snapshot_identity(
                client.config,
                reason=f"identity desync (attempt {recovery_attempts}/{RECOVERY_ATTEMPT_CAP})",
            )
            if snapshot_path is not None:
                print(f"Saved pre-wipe identity snapshot to {snapshot_path}.", flush=True)
        except Exception as exc:  # noqa: BLE001 - recovery must not die on snapshot IO.
            print(f"WARNING: could not snapshot worker identity before wipe: {exc!r}.", flush=True)
    if recovery_attempts >= RECOVERY_ATTEMPT_CAP:
        identity = (client.config.worker_id, client.config.worker_token)
        if not all(identity):
            identity = getattr(client, "last_known_identity", (None, None))
        if all(identity):
            # Restore the last-known identity for one best-effort truthful
            # state report; a rejection here is swallowed (best-effort only).
            client.config.worker_id, client.config.worker_token = identity
            try:
                await client.heartbeat(capabilities, status="blocked_auth")
            except Exception:  # noqa: BLE001 - best-effort truthful state report.
                pass
        snapshot_hint = ""
        snapshot_path = identity_snapshot_path(None)
        if snapshot_path.exists():
            snapshot_hint = f" A pre-wipe identity snapshot exists at {snapshot_path}."
        raise RuntimeError(
            "Worker blocked_auth: identity recovery failed "
            f"{recovery_attempts} consecutive times. Fix DIALECTICAL_USER_TOKEN "
            "or the worker registration on the coordinator, then restart the worker."
            + snapshot_hint
        )
    print(
        f"Worker identity desync (attempt {recovery_attempts}/{RECOVERY_ATTEMPT_CAP}); "
        "re-registering with token rotation.",
        flush=True,
    )
    client.config.worker_id = None
    client.config.worker_token = None
    try:
        await register_with_backoff(client, capabilities, stop, rotate_token=True)
    except Exception as recovery_exc:
        is_blocked_auth = identity_desync_error(recovery_exc) or (
            isinstance(recovery_exc, httpx.HTTPStatusError)
            and recovery_exc.response.status_code == 403
        )
        if is_blocked_auth:
            print(
                f"Worker blocked_auth: re-registration rejected ({recovery_exc}); retrying in 30s.",
                flush=True,
            )
            await wait_or_stop(stop, 30)
        elif retryable_coordinator_error(recovery_exc):
            print(f"Coordinator unavailable during recovery: {recovery_exc}. Retrying in 5s.", flush=True)
            await wait_or_stop(stop, 5)
        else:
            raise
    return recovery_attempts


async def worker_loop(run_once: bool = False) -> None:
    try:
        config = load_config()
    except (ValueError, OSError) as exc:
        # tomllib.TOMLDecodeError subclasses ValueError, so this catches a
        # torn/corrupt config file (and unreadable-file OSErrors) and routes
        # them onto the same loud, exit-78 path as missing credentials
        # instead of a generic crash-loop that KeepAlive cannot escape.
        config_path = resolved_config_path(None)
        snapshot_path = identity_snapshot_path(None)
        lines = [
            f"Worker config file is unreadable or corrupt: {config_path}",
            f"  read/parse error: {exc!r}",
            "  Fix or restore the file; the worker will not guess at a broken identity.",
        ]
        if snapshot_path.exists():
            lines.append(
                f"  An identity snapshot exists at {snapshot_path} -- "
                "worker_id/worker_token can be restored from it."
            )
        raise MissingCredentialsError("\n".join(lines)) from exc
    # Resolved eagerly at startup (not lazily inside registration) so a
    # mid-run identity desync still holds a credential without re-entering
    # the keychain; a token added while the worker is running is picked up
    # on the next KeepAlive restart (the exit-78 path).
    if resolve_user_token(config):
        print(
            f"Using registration credential from the macOS Keychain (service {config.keychain_service!r}).",
            flush=True,
        )
    startup_credentials_check(config)
    client = CoordinatorClient(config)
    stop = asyncio.Event()

    def request_stop() -> None:
        stop.set()

    loop = asyncio.get_running_loop()
    for signame in ("SIGINT", "SIGTERM"):
        try:
            loop.add_signal_handler(getattr(signal, signame), request_stop)
        except NotImplementedError:
            pass

    try:
        recovery_attempts = 0
        early_registered = False
        if config.worker_id and config.worker_token and config.last_capabilities:
            while not stop.is_set():
                try:
                    await register_with_backoff(client, config.last_capabilities, stop, status="starting")
                    early_registered = True
                    break
                except Exception as exc:
                    if not identity_desync_error(exc):
                        raise
                    recovery_attempts = await handle_identity_desync(
                        client, config.last_capabilities, stop, recovery_attempts
                    )
                    if client.config.worker_id and client.config.worker_token:
                        early_registered = True
                        break

        adapters = await detect_adapters(config)
        if not adapters:
            if early_registered:
                await client.heartbeat(config.last_capabilities, status="degraded")
            raise RuntimeError("No healthy model adapters detected")

        capabilities = sorted(adapters)
        if config.last_capabilities != capabilities:
            config.last_capabilities = capabilities
            save_config(config)
        try:
            if early_registered:
                await client.heartbeat(capabilities, status="online")
            else:
                await register_with_backoff(client, capabilities, stop)
        except Exception as exc:
            if not identity_desync_error(exc):
                raise
            # Funnel startup desync into the capped recovery path; the poll
            # loop below re-attempts and re-enters recovery if still broken.
            recovery_attempts = await handle_identity_desync(client, capabilities, stop, recovery_attempts)
        # Durability invariant: whatever identity this process will poll with
        # must be on disk BEFORE the poll loop starts, or the next restart
        # needs a user token nobody supplies (the 2026-07-27 outage).
        # register() persists fresh registrations itself; this covers the
        # short-circuit/heartbeat paths where memory has an identity the
        # file lost. Best-effort: a full disk must not kill a live worker.
        try:
            if ensure_identity_persisted(config):
                print("Persisted worker identity to the config file for restart durability.", flush=True)
        except Exception as exc:  # noqa: BLE001 - durability is best-effort at runtime.
            print(
                f"WARNING: could not persist worker identity: {exc!r}. "
                "The next restart may require DIALECTICAL_USER_TOKEN.",
                flush=True,
            )
        try:
            # A restarted process cannot still be running whatever job it
            # held before. register() short-circuits without a network call
            # once worker_id/worker_token are persisted (the common case for
            # this worker), so it can't be trusted to carry the restart
            # signal. The heartbeat channel always authenticates and always
            # fires, so announce the restart there instead: the coordinator
            # then releases any held job immediately rather than waiting for
            # the stuck cap.
            await client.heartbeat(capabilities, fresh_start=True)
        except Exception as exc:  # noqa: BLE001 - best-effort; the stuck cap remains the backstop.
            print(f"Fresh-start heartbeat failed: {exc}. Continuing; the stuck cap remains the backstop.", flush=True)
        last_heartbeat = time.monotonic()
        backoff_seconds = 1
        while not stop.is_set():
            try:
                if time.monotonic() - last_heartbeat >= config.heartbeat_seconds:
                    await client.heartbeat(capabilities)
                    last_heartbeat = time.monotonic()
                job = await client.poll()
                backoff_seconds = 1
                recovery_attempts = 0
                if job:
                    await handle_job_with_heartbeats(client, adapters, job, capabilities, config.heartbeat_seconds)
            except Exception as exc:
                if identity_desync_error(exc):
                    recovery_attempts = await handle_identity_desync(client, capabilities, stop, recovery_attempts)
                elif not retryable_coordinator_error(exc):
                    raise
                else:
                    print(f"Coordinator unavailable: {exc}. Retrying in {backoff_seconds}s.", flush=True)
                    await wait_or_stop(stop, backoff_seconds)
                    backoff_seconds = min(backoff_seconds * 2, 30)
            if run_once:
                break
    finally:
        await client.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Dialectical Engine worker")
    parser.add_argument("--once", action="store_true", help="Poll and handle at most one job")
    args = parser.parse_args()
    try:
        asyncio.run(worker_loop(run_once=args.once))
    except MissingCredentialsError as exc:
        print(f"FATAL: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(EX_CONFIG) from exc


if __name__ == "__main__":
    main()
