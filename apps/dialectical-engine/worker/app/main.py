from __future__ import annotations

import argparse
import asyncio
import json
import math
import signal
import time
from typing import Any

import httpx

from app.capabilities import detect_adapters
from app.client import CoordinatorClient
from app.config import load_config, save_config


class StructuredOutputError(ValueError):
    pass


def extract_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise StructuredOutputError("Model output did not contain a valid JSON object")


def parse_result(job: dict[str, Any], text: str) -> Any:
    if job["job_type"] in {
        "decompose",
        "synthesize",
        "v2_skill_create",
        "v2_agent_create",
        "v2_agent_argument",
        "v2_plan",
        "v2_pov",
        "v2_expand",
        "v2_agent_run",
        "v2_synthesize",
    }:
        return extract_json_object(text)
    return {"argument": text.strip()}


def enrich_v2_result(job: dict[str, Any], result: Any, worker_id: str | None) -> Any:
    if not isinstance(result, dict):
        return result
    job_type = str(job.get("job_type") or "")
    if not job_type.startswith("v2_"):
        return result
    enriched = dict(result)
    job_id = str(job.get("id") or "")
    model_id = str(job.get("required_model") or "")
    worker = str(worker_id or "")
    if job_type in {"v2_skill_create", "v2_agent_create"}:
        enriched["provenance"] = {
            **(enriched.get("provenance") if isinstance(enriched.get("provenance"), dict) else {}),
            "created_by_model": model_id,
            "created_by_worker_id": worker,
            "creation_prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        }
    else:
        enriched["provenance"] = {
            **(enriched.get("provenance") if isinstance(enriched.get("provenance"), dict) else {}),
            "model_id": model_id,
            "worker_id": worker,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        }
    return enriched


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


# Transient network errors that warrant a bounded retry of /complete before we
# give up and fall back to fail(). These typically come from the coordinator
# dropping in-flight connections (e.g. an uvicorn --reload restart), not from a
# genuine job problem, so retrying recovers the completion instead of wastefully
# failing (and re-generating) the job.
TRANSIENT_NETWORK_ERRORS = (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError)
COMPLETE_RETRY_ATTEMPTS = 3
COMPLETE_RETRY_BACKOFF_SECONDS = 0.5


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
    of times with a short backoff before letting the last error propagate."""
    for attempt in range(1, COMPLETE_RETRY_ATTEMPTS + 1):
        try:
            await client.complete(job_id, result, started_at, tokens_in, tokens_out)
            return
        except TRANSIENT_NETWORK_ERRORS as exc:
            if attempt >= COMPLETE_RETRY_ATTEMPTS:
                raise
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

        await client.stream_chunks(job["id"], chunks())
        text = "".join(output)
        result = parse_result(job, text)
        client_config = getattr(client, "config", None)
        result = enrich_v2_result(job, result, getattr(client_config, "worker_id", None))
        if str(job.get("job_type") or "").startswith("v2_"):
            print(f"V2 result for {job['id']}: {json.dumps(result, default=str)[:2000]}", flush=True)
        await complete_with_retry(client, job["id"], result, started_at, tokens_in, estimate_tokens(text))
    except Exception as exc:
        if stale_job_coordinator_error(exc):
            print(f"Coordinator no longer accepts job {job['id']}: {exc}", flush=True)
            return
        try:
            await client.fail(
                job["id"],
                failure_reason_for(exc),
                retryable=not isinstance(exc, StructuredOutputError)
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
        raise RuntimeError(
            "Worker blocked_auth: identity recovery failed "
            f"{recovery_attempts} consecutive times. Fix DIALECTICAL_USER_TOKEN "
            "or the worker registration on the coordinator, then restart the worker."
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
    config = load_config()
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
    asyncio.run(worker_loop(run_once=args.once))


if __name__ == "__main__":
    main()
