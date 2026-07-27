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
import socket
import threading
from urllib.parse import urljoin, urlsplit

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
# SSRF guard.
#
# `evidence_url_is_safe` is a pure, DNS-free SYNTACTIC guard (scheme, port, and
# host-literal checks including numeric IP encodings) -- safe to call in the
# hot contract-validation path with no network I/O. The FETCH path additionally
# resolves hostnames (`_url_is_fetch_safe`) and re-runs the guard on every
# redirect hop, so a public-looking URL that 30x-redirects to an internal
# target, or a hostname that resolves to a private address, is refused.
#
# Residual limitation (accepted): DNS is resolved BEFORE the connection, so a
# classic DNS-rebinding attacker who flips the record between our getaddrinfo
# and httpx's own connection-time resolution could still reach an internal host
# (TOCTOU). Mitigating that fully needs pinning the vetted IP into the socket
# connect, which httpx does not expose cleanly. For this single-user deployment
# with the feature default OFF and evidence URLs coming from the debate's own
# search worker (not arbitrary attacker input), the pre-connection check is the
# accepted bound; revisit if evidence acquisition is ever exposed to untrusted
# URL sources.
# ---------------------------------------------------------------------------


def _ip_is_unsafe(ip: ipaddress._BaseAddress) -> bool:
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _host_as_ip(host: str) -> ipaddress._BaseAddress | None:
    """Parse an IP literal from a URL host, covering the dotted/IPv6 forms AND
    the bare-integer/hex/octal encodings resolvers accept (e.g. 2130706433,
    0x7f000001, 017700000001 all == 127.0.0.1). Returns None for real
    hostnames."""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    stripped = host.strip()
    candidates: list[int] = []
    if re.fullmatch(r"[0-9]+", stripped):
        candidates.append(int(stripped, 10))
        if len(stripped) > 1 and stripped.startswith("0"):
            try:
                candidates.append(int(stripped, 8))
            except ValueError:
                pass
    elif re.fullmatch(r"0[xX][0-9a-fA-F]+", stripped):
        candidates.append(int(stripped, 16))
    for value in candidates:
        if 0 <= value <= 0xFFFFFFFF:
            try:
                return ipaddress.ip_address(value)
            except ValueError:
                continue
    return None


def evidence_url_is_safe(url: str) -> bool:
    """Syntactic (DNS-free) SSRF guard: True only for a well-formed http/https
    URL on a standard port whose host is neither `localhost`/`*.localhost` nor
    an IP literal (in ANY numeric encoding) that is loopback, private,
    link-local, reserved, multicast, or unspecified. Hostnames are not resolved
    here -- the fetch path does that (see `_url_is_fetch_safe`)."""
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
    ip = _host_as_ip(host)
    if ip is not None and _ip_is_unsafe(ip):
        return False
    return True


def _resolved_addresses_are_safe(host: str) -> bool:
    """Resolve a hostname and refuse if ANY returned A/AAAA address is unsafe.
    Fail-closed: an unresolvable host is treated as unsafe."""
    try:
        infos = socket.getaddrinfo(host, None)
    except (OSError, UnicodeError):
        return False
    if not infos:
        return False
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            return False
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            return False
        if _ip_is_unsafe(ip):
            return False
    return True


def _url_is_fetch_safe(url: str) -> bool:
    """Fetch-time guard: the syntactic guard PLUS DNS validation for hostnames.
    Run on the original URL and on every redirect hop before it is fetched."""
    if not evidence_url_is_safe(url):
        return False
    parts = urlsplit(url.strip())
    host = parts.hostname or ""
    if _host_as_ip(host) is not None:
        return True  # IP literal already vetted syntactically
    return _resolved_addresses_are_safe(host)


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
    """Fetch `url` (following up to CITATION_MAX_REDIRECTS redirects MANUALLY,
    guarding every hop) and classify whether `quote` resolves. Never raises: any
    guard refusal, transport error, non-2xx, redirect-budget overrun, or
    oversize body maps to "unreachable". Redirects are followed by hand
    (`follow_redirects=False` per request) precisely so the SSRF guard runs on
    each Location target before it is fetched -- httpx's own redirect following
    would fetch unvalidated hops."""
    current = url
    # range(MAX + 1): the original request plus up to MAX redirect hops. A chain
    # that is still redirecting after that budget -> unreachable.
    for _ in range(CITATION_MAX_REDIRECTS + 1):
        if not _url_is_fetch_safe(current):
            return UNREACHABLE
        try:
            async with client.stream("GET", current, follow_redirects=False) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        return UNREACHABLE
                    # Resolve relative redirects against the current URL; the
                    # next loop iteration re-guards the absolute target.
                    current = urljoin(str(response.url), location)
                    continue
                if response.status_code >= 400:
                    return UNREACHABLE
                total = 0
                chunks: list[bytes] = []
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > CITATION_MAX_BYTES:
                        return UNREACHABLE  # abort early, do not buffer the rest
                    chunks.append(chunk)
        except Exception:
            return UNREACHABLE
        body = b"".join(chunks)
        try:
            page_text = body.decode(response.encoding or "utf-8", errors="replace")
        except (LookupError, ValueError):
            page_text = body.decode("utf-8", errors="replace")
        return RESOLVED_QUOTE_FOUND if _normalized_contains(page_text, quote) else RESOLVED_QUOTE_MISSING
    return UNREACHABLE


# ---------------------------------------------------------------------------
# DB-backed driver + fire-and-forget trigger.
# ---------------------------------------------------------------------------


async def _resolve_and_stamp_async(debate_id: str, node_ids: list[str], *, transport=None) -> None:
    # 2026-07-26 pool-exhaustion fix: this used to hold ONE session open across
    # every fetch. The session's first db.get checks a QueuePool connection out
    # and keeps it until commit/rollback/close, so each citation thread pinned
    # one of the pool's slots for its entire network run (fetches are bounded
    # at CITATION_FETCH_TIMEOUT_SECONDS EACH, and the trigger spawns a thread
    # per v2_evidence completion). Three phases instead: read the fetch targets
    # in a short session, fetch with NO session at all, stamp in a second short
    # session. Stamping re-reads evidence_metadata so a concurrent update
    # landing mid-fetch (the entailment/verification stampers share this
    # column) is merged onto, never clobbered by, the pre-fetch snapshot.
    targets: list[tuple[str, str, str]] = []
    with SessionLocal() as db:
        for node_id in node_ids:
            node = db.get(Node, node_id)
            if node is None:
                continue
            metadata = node.evidence_metadata or {}
            targets.append((node_id, str(metadata.get("url") or ""), str(metadata.get("quote") or "")))
    if not targets:
        return
    # follow_redirects=False: check_citation_resolution follows redirects itself
    # so the SSRF guard runs on every hop (httpx's own follower would not).
    statuses: dict[str, str] = {}
    async with httpx.AsyncClient(
        transport=transport,
        timeout=CITATION_FETCH_TIMEOUT_SECONDS,
        follow_redirects=False,
    ) as client:
        for node_id, url, quote in targets:
            statuses[node_id] = await check_citation_resolution(client, url, quote)
    with SessionLocal() as db:
        for node_id, status in statuses.items():
            node = db.get(Node, node_id)
            if node is None:
                continue
            metadata = dict(node.evidence_metadata or {})
            metadata["resolution_status"] = status
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
