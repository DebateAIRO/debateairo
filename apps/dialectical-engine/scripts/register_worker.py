from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "worker"))

from app.config import WorkerConfig, load_file_config, parse_model_list, save_config
from app.capabilities import detect_adapters
from app.client import CoordinatorClient

HOSTNAME_RE = re.compile(
    r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?",
    re.IGNORECASE,
)


def user_token() -> str:
    token = os.getenv("DIALECTICAL_USER_TOKEN") or os.getenv("USER_TOKEN")
    if token:
        return token
    if not sys.stdin.isatty():
        raise RuntimeError("DIALECTICAL_USER_TOKEN or USER_TOKEN is required when registering a worker")
    return getpass.getpass("User token: ")


def require_capabilities(capabilities: list[str], allowed_models: list[str] | None) -> None:
    if capabilities:
        return
    if allowed_models:
        allowed = ", ".join(allowed_models)
        raise RuntimeError(
            f"no healthy adapters detected for allowed models: {allowed}. "
            "Install or authenticate one of those adapters before registering this worker, "
            "or clear ALLOWED_MODELS intentionally."
        )
    raise RuntimeError(
        "no healthy adapters detected. Install or authenticate at least one real adapter, "
        "or pass --enable-mock only for local testing."
    )


def named_https_url_issue(value: str) -> str | None:
    cleaned = value.strip().rstrip("/")
    if not cleaned:
        return "empty URL"
    if "<" in cleaned or ">" in cleaned or "debate.<your-domain>" in cleaned:
        return "placeholder URL"
    parsed = urlsplit(cleaned)
    if parsed.scheme != "https" or not parsed.netloc:
        return "must be an HTTPS URL"
    if parsed.username or parsed.password:
        return "must not include credentials"
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return "must be the coordinator origin without a path, query, or fragment"
    hostname = (parsed.hostname or "").strip().rstrip(".").lower()
    if hostname == "trycloudflare.com" or hostname.endswith(".trycloudflare.com"):
        return "must be a stable named Cloudflare hostname, not a trycloudflare.com quick tunnel"
    if not HOSTNAME_RE.fullmatch(hostname):
        return "must use a DNS hostname such as debate.example.com"
    return None


def require_named_coordinator_url(args: argparse.Namespace) -> None:
    if getattr(args, "require_named_https", False):
        if issue := named_https_url_issue(args.coordinator_url):
            raise RuntimeError(f"Invalid named coordinator URL: {issue}")


def same_origin(left: str, right: str) -> bool:
    return left.strip().rstrip("/") == right.strip().rstrip("/")


def existing_registration_for(config_path: Path, coordinator_url: str, name: str) -> WorkerConfig | None:
    try:
        config = load_file_config(config_path)
    except Exception:
        return None
    if not config.worker_id or not config.worker_token:
        return None
    if config.name != name:
        return None
    if not same_origin(config.coordinator_url, coordinator_url):
        return None
    return config


async def run(args: argparse.Namespace) -> None:
    require_named_coordinator_url(args)
    config_path = Path(args.config).expanduser()
    rotate_token = getattr(args, "rotate_token", False)
    existing = None if rotate_token else existing_registration_for(config_path, args.coordinator_url, args.name)
    config = WorkerConfig(
        coordinator_url=args.coordinator_url,
        name=args.name,
        enable_mock=args.enable_mock,
        allowed_models=parse_model_list(args.allowed_models),
    )
    adapters = await detect_adapters(config)
    capabilities = sorted(adapters)
    require_capabilities(capabilities, config.allowed_models)
    if existing is not None:
        config.worker_id = existing.worker_id
        config.worker_token = existing.worker_token
        print(f"Reusing existing worker registration for {config.name}.")
    else:
        config.user_token = user_token()
    client = CoordinatorClient(config)
    try:
        if rotate_token:
            await client.register(capabilities, persist=False, rotate_token=True)
        else:
            await client.register(capabilities, persist=False)
        await client.heartbeat(capabilities)
        save_config(config, config_path)
        print(f"Registered {config.name} as {config.worker_id}")
        if rotate_token:
            print("Worker token rotated; restart or reload any already-running worker process with the saved config.")
    finally:
        await client.aclose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--coordinator-url", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--config", default="~/.dialectical-worker/config.toml")
    parser.add_argument("--enable-mock", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument(
        "--allowed-models",
        default=os.getenv("DIALECTICAL_ALLOWED_MODELS"),
        help="comma-separated model IDs this worker may advertise, for example codex-gpt-5.5",
    )
    parser.add_argument(
        "--require-named-https",
        action="store_true",
        help="reject placeholder, non-HTTPS, local, or trycloudflare.com coordinator URLs",
    )
    parser.add_argument(
        "--rotate-token",
        action="store_true",
        help="explicitly rotate an existing same-name worker token; restart/reload any running worker after this",
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
