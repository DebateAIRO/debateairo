"""Coordinator-side citation-resolution check for retrieval EVIDENCE nodes
(Task 10 / P1.1).

Best-effort, always: fetching a cited URL and confirming the quote can never
fail the evidence job or its node -- it only *stamps* a `resolution_status`
onto the node's evidence_metadata. Run fire-and-forget off the worker
completion POST (see trigger_citation_resolution), the same thread pattern
app.scoring.jobs.trigger_internal_scoring_after_completion uses.

Honesty + safety laws (binding):
  - No fabricated confirmation: a quote is "found" only when its normalized
    first-80-char prefix is a substring of the normalized fetched page text.
  - SSRF guard (`evidence_url_is_safe`): http/https only, standard ports only,
    and hard-refuse loopback/private/link-local/reserved hosts so a
    model-supplied URL can never make the coordinator probe internal
    infrastructure or cloud metadata endpoints.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import threading
from urllib.parse import urlsplit

import httpx

from app.core.db import SessionLocal
from app.core.write_lock import commit_write
from app.models.entities import Node

LOGGER = logging.getLogger(__name__)

# Resolution status vocabulary (stored in Node.evidence_metadata["resolution_status"]).
RESOLVED_QUOTE_FOUND = "resolved_quote_found"
RESOLVED_QUOTE_MISSING = "resolved_quote_missing"
UNREACHABLE = "unreachable"

# Fetch bounds (see brief P1.1 item 7).
CITATION_FETCH_TIMEOUT_SECONDS = 15.0
CITATION_MAX_REDIRECTS = 3
CITATION_MAX_BYTES = 1_000_000
CITATION_QUOTE_PREFIX_CHARS = 80

_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_PORTS = {None, 80, 443}
_WHITESPACE = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# SSRF guard: pure, deterministic, no I/O, unit-tested in isolation.
# ---------------------------------------------------------------------------


def evidence_url_is_safe(url: str) -> bool:
    """True only for a fetchable public http/https URL.

    Refuses non-http(s) schemes, non-standard ports, empty/absent hosts,
    `localhost`/`*.localhost`, and any IP literal that is loopback, private,
    link-local, reserved, multicast, or unspecified. Hostnames are NOT
    DNS-resolved here (that would need the network); the literal-IP and
    localhost checks cover the common SSRF footguns without live lookups.
    """
    if not isinstance(url, str) or not url.strip():
        return False
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return False
    if parts.scheme.lower() not in _ALLOWED_SCHEMES:
        return False
    host = parts.hostname
    if not host:
        return False
    try:
        port = parts.port
    except ValueError:
        return False
    if port not in _ALLOWED_PORTS:
        return False
    lowered = host.lower()
    if lowered == "localhost" or lowered.endswith(".localhost"):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return False
    return True


def _normalize_whitespace(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip().lower()


def _normalized_contains(page_text: str, quote: str) -> bool:
    if not quote:
        return False
    needle = _normalize_whitespace(quote)[:CITATION_QUOTE_PREFIX_CHARS]
    if not needle:
        return False
    return needle in _normalize_whitespace(page_text)


# ---------------------------------------------------------------------------
# Fetch + classify one citation. Never raises: any error -> "unreachable".
# ---------------------------------------------------------------------------


async def check_citation_resolution(client: httpx.AsyncClient, url: str, quote: str) -> str:
    if not evidence_url_is_safe(url):
        return UNREACHABLE
    try:
        response = await client.get(url, follow_redirects=True)
    except Exception:
        return UNREACHABLE
    if response.status_code >= 400:
        return UNREACHABLE
    try:
        content = response.content
    except Exception:
        return UNREACHABLE
    if content is not None and len(content) > CITATION_MAX_BYTES:
        return UNREACHABLE
    try:
        page_text = response.text
    except Exception:
        return RESOLVED_QUOTE_MISSING
    return RESOLVED_QUOTE_FOUND if _normalized_contains(page_text, quote) else RESOLVED_QUOTE_MISSING


# ---------------------------------------------------------------------------
# DB-backed driver + fire-and-forget trigger.
# ---------------------------------------------------------------------------


async def _resolve_and_stamp_async(debate_id: str, node_ids: list[str], *, transport=None) -> None:
    async with httpx.AsyncClient(
        transport=transport,
        timeout=CITATION_FETCH_TIMEOUT_SECONDS,
        follow_redirects=True,
        max_redirects=CITATION_MAX_REDIRECTS,
    ) as client:
        with SessionLocal() as db:
            for node_id in node_ids:
                node = db.get(Node, node_id)
                if node is None:
                    continue
                metadata = dict(node.evidence_metadata or {})
                url = str(metadata.get("url") or "")
                quote = str(metadata.get("quote") or "")
                metadata["resolution_status"] = await check_citation_resolution(client, url, quote)
                node.evidence_metadata = metadata
                db.add(node)
            commit_write(db)


def resolve_and_stamp_citations(debate_id: str, node_ids: list[str], *, transport=None) -> None:
    """Fetch each node's cited URL and stamp its resolution_status. Best-effort:
    never raises. `transport` is an httpx transport injection seam for tests
    (production passes None -> real network client)."""
    try:
        asyncio.run(_resolve_and_stamp_async(debate_id, list(node_ids), transport=transport))
    except Exception:
        LOGGER.exception("citation resolution failed (non-fatal) debate=%s", debate_id)


def trigger_citation_resolution(debate_id: str, node_ids: list[str]) -> threading.Thread | None:
    """Start the citation-resolution check on a daemon thread so the worker's
    completion POST is never blocked by network fetches. Returns the thread
    (production ignores it; tests can join it). Never raises."""
    ids = list(node_ids)

    def _run() -> None:
        try:
            resolve_and_stamp_citations(debate_id, ids)
        except Exception:
            LOGGER.exception("citation resolution thread failed (non-fatal) debate=%s", debate_id)

    try:
        thread = threading.Thread(target=_run, name=f"evidence-citations-{debate_id}", daemon=True)
        thread.start()
        return thread
    except Exception:
        LOGGER.exception("citation resolution trigger failed (non-fatal) debate=%s", debate_id)
        return None
