"""Local dev guardian: honest worker/readiness truth on a loop.

Read-only by design: it calls /api/backends/status, whose server-side logic
already marks stale workers offline and requeues their jobs. The guardian
reports; it never fakes green and never mutates state client-side.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request


def fetch_status(base_url: str, token: str | None) -> dict:
    request = urllib.request.Request(f"{base_url.rstrip('/')}/api/backends/status")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def summarize_status(payload: dict) -> str:
    readiness = payload.get("v2_generation_readiness") or {}
    workers = payload.get("workers") or []
    worker_bits = []
    for worker in workers:
        bit = f"{worker.get('name')}:{worker.get('status')}"
        if worker.get("current_job_id"):
            bit += f" job={worker['current_job_id']}"
        worker_bits.append(bit)
    state = "ready" if readiness.get("ready") else f"NOT READY ({readiness.get('reason_code', 'unknown')})"
    reason = readiness.get("reason", "")
    workers_text = ", ".join(worker_bits) if worker_bits else "no workers"
    return f"[dev-guardian] {state} — {reason} — workers: {workers_text}"


def exit_code_for(payload: dict) -> int:
    readiness = payload.get("v2_generation_readiness")
    if not isinstance(readiness, dict) or "ready" not in readiness:
        return 2
    return 0 if readiness.get("ready") else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Honest local readiness guardian")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--user-token", default=None)
    parser.add_argument("--interval-seconds", type=float, default=15.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    while True:
        try:
            payload = fetch_status(args.base_url, args.user_token)
        except Exception as exc:  # noqa: BLE001 - guardian reports, never crashes the loop
            print(f"[dev-guardian] COORDINATOR UNREACHABLE — {exc}", flush=True)
            payload = {}
        print(summarize_status(payload) if payload else "", flush=True)
        if args.once:
            return exit_code_for(payload)
        time.sleep(args.interval_seconds)


if __name__ == "__main__":
    sys.exit(main())
