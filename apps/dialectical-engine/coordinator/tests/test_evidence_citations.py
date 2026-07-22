"""Task 10 (P1.1) citation-resolution check: coordinator-side, best-effort URL
fetch that stamps each retrieval-evidence node with a resolution_status. NO
live network here -- httpx MockTransport for every fetch case, and the SSRF
guard is a pure function unit-tested in isolation."""
from __future__ import annotations

import asyncio

import httpx

from app.evidence.citations import (
    RESOLVED_QUOTE_FOUND,
    RESOLVED_QUOTE_MISSING,
    UNREACHABLE,
    check_citation_resolution,
    evidence_url_is_safe,
    resolve_and_stamp_citations,
)
from app.models.entities import Debate, Generation, Node, Worker


# ---------------------------------------------------------------------------
# SSRF guard: pure, deterministic, no I/O.
# ---------------------------------------------------------------------------


def test_url_guard_allows_plain_http_and_https_hostnames() -> None:
    assert evidence_url_is_safe("http://example.org/study") is True
    assert evidence_url_is_safe("https://www.example.com/a/b?c=d") is True


def test_url_guard_refuses_non_http_schemes() -> None:
    assert evidence_url_is_safe("ftp://example.org/file") is False
    assert evidence_url_is_safe("file:///etc/passwd") is False
    assert evidence_url_is_safe("gopher://example.org") is False
    assert evidence_url_is_safe("data:text/plain,hello") is False


def test_url_guard_refuses_loopback_and_localhost() -> None:
    assert evidence_url_is_safe("http://localhost/x") is False
    assert evidence_url_is_safe("http://LOCALHOST/x") is False
    assert evidence_url_is_safe("http://sub.localhost/x") is False
    assert evidence_url_is_safe("http://127.0.0.1/x") is False
    assert evidence_url_is_safe("http://[::1]/x") is False


def test_url_guard_refuses_private_and_link_local_ips() -> None:
    assert evidence_url_is_safe("http://10.0.0.5/x") is False
    assert evidence_url_is_safe("http://192.168.1.10/x") is False
    assert evidence_url_is_safe("http://172.16.4.4/x") is False
    assert evidence_url_is_safe("http://169.254.169.254/latest/meta-data") is False


def test_url_guard_refuses_nonstandard_ports() -> None:
    assert evidence_url_is_safe("http://example.org:8080/x") is False
    assert evidence_url_is_safe("https://example.org:8443/x") is False
    # Standard ports (explicit or implicit) are allowed.
    assert evidence_url_is_safe("http://example.org:80/x") is True
    assert evidence_url_is_safe("https://example.org:443/x") is True


def test_url_guard_refuses_garbage_and_empty() -> None:
    assert evidence_url_is_safe("") is False
    assert evidence_url_is_safe("not a url") is False
    assert evidence_url_is_safe("http://") is False


# ---------------------------------------------------------------------------
# check_citation_resolution: httpx MockTransport (no live network).
# ---------------------------------------------------------------------------


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _run(coro):
    return asyncio.run(coro)


def test_check_returns_found_when_quote_prefix_present_normalized_whitespace() -> None:
    quote = "Renewable capacity grew by 40 percent over the study window"

    def handler(request: httpx.Request) -> httpx.Response:
        # Different whitespace shape than the quote -- normalization must match.
        body = "<html><body>Renewable   capacity  grew\nby 40 percent over the study window, the report said.</body></html>"
        return httpx.Response(200, text=body)

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(client, "https://example.org/study", quote)

    assert _run(go()) == RESOLVED_QUOTE_FOUND


def test_check_returns_missing_when_quote_absent() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="An unrelated page with none of the claimed wording.")

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(
                client, "https://example.org/study", "A very specific quote that does not appear anywhere"
            )

    assert _run(go()) == RESOLVED_QUOTE_MISSING


def test_check_returns_unreachable_on_server_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(client, "https://example.org/study", "anything")

    assert _run(go()) == UNREACHABLE


def test_check_returns_unreachable_on_transport_exception() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(client, "https://example.org/study", "anything")

    assert _run(go()) == UNREACHABLE


def test_check_refuses_private_ip_without_fetching() -> None:
    fetched: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        fetched.append(str(request.url))
        return httpx.Response(200, text="should never be read")

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(client, "http://169.254.169.254/latest", "anything")

    assert _run(go()) == UNREACHABLE
    assert fetched == []  # guard short-circuits before any request


def test_check_returns_unreachable_when_body_exceeds_size_cap() -> None:
    quote = "needle in the haystack"

    def handler(request: httpx.Request) -> httpx.Response:
        oversize = ("x" * 1_000) + " needle in the haystack " + ("y" * 2_000_000)
        return httpx.Response(200, text=oversize)

    async def go():
        async with _client(handler) as client:
            return await check_citation_resolution(client, "https://example.org/huge", quote)

    assert _run(go()) == UNREACHABLE


# ---------------------------------------------------------------------------
# resolve_and_stamp_citations: DB-backed, stamps resolution_status onto each
# evidence node's evidence_metadata. Uses its own SessionLocal like the
# scoring driver -- the `db` fixture's committed rows are visible to it.
# ---------------------------------------------------------------------------


def _evidence_node(db, *, node_id: str, url: str, quote: str) -> tuple[Debate, Node]:
    debate = Debate(topic="Does transit reduce congestion?", status="generating")
    worker = Worker(id=f"w-{node_id}", name=f"w-{node_id}", token_hash="h", capabilities=["m"])
    claim = Node(
        id=f"claim-{node_id}",
        debate=debate,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Transit reduces congestion.",
        status="complete",
        materialized_path="/0",
    )
    ev = Node(
        id=node_id,
        debate=debate,
        parent_id=claim.id,
        node_type="EVIDENCE",
        depth=2,
        position=2000,
        claim=quote,
        status="complete",
        materialized_path="/0/2000",
        evidence_metadata={"method": "retrieval", "url": url, "quote": quote, "resolution_status": "pending"},
    )
    db.add_all([debate, worker, claim, ev])
    db.commit()
    return debate, ev


def test_resolve_and_stamp_marks_found_missing_and_unreachable(db) -> None:
    d1, n_found = _evidence_node(
        db, node_id="ev-found", url="https://example.org/a", quote="forty two percent improvement"
    )
    _, n_missing = _evidence_node(
        db, node_id="ev-missing", url="https://example.org/b", quote="a quote that is nowhere on the page"
    )
    _, n_refused = _evidence_node(
        db, node_id="ev-refused", url="http://127.0.0.1/secret", quote="whatever"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/a":
            return httpx.Response(200, text="The report shows a forty two percent improvement overall.")
        return httpx.Response(200, text="unrelated content with no matching quote")

    resolve_and_stamp_citations(
        d1.id,
        ["ev-found", "ev-missing", "ev-refused"],
        transport=httpx.MockTransport(handler),
    )

    db.expire_all()
    assert db.get(Node, "ev-found").evidence_metadata["resolution_status"] == RESOLVED_QUOTE_FOUND
    assert db.get(Node, "ev-missing").evidence_metadata["resolution_status"] == RESOLVED_QUOTE_MISSING
    assert db.get(Node, "ev-refused").evidence_metadata["resolution_status"] == UNREACHABLE


def test_resolve_and_stamp_never_raises_on_bad_node_ids(db) -> None:
    # Best-effort contract: unknown node ids are skipped, never raised.
    resolve_and_stamp_citations(
        "no-such-debate",
        ["does-not-exist"],
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="")),
    )
