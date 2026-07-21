"""Workers stream the v2 JSON envelope ({"title": ..., "content": ...});
readers must see prose. presentable_stream_text extracts whatever prefix is
already parseable instead of dumping raw JSON into the tree."""


def test_plain_text_passes_through():
    from app.services.serialization import presentable_stream_text
    assert presentable_stream_text("Thinking about ethics…") == "Thinking about ethics…"


def test_partial_envelope_extracts_title_and_content_prefix():
    from app.services.serialization import presentable_stream_text
    raw = '{"title":"Ethical Viability","content":"Convergence is not the same as tru'
    out = presentable_stream_text(raw)
    assert "Ethical Viability" in out
    assert "Convergence is not the same as tru" in out
    assert "{" not in out


def test_envelope_with_no_fields_yet_shows_drafting():
    from app.services.serialization import presentable_stream_text
    assert presentable_stream_text('{"ti') == "Drafting…"


def test_escapes_are_unescaped():
    from app.services.serialization import presentable_stream_text
    raw = '{"title":"A \\"quoted\\" claim","content":"line one\\nline two'
    out = presentable_stream_text(raw)
    assert '"quoted"' in out
    assert "line one\nline two" in out


def test_empty_buffer_stays_empty():
    from app.services.serialization import presentable_stream_text
    assert presentable_stream_text("") == ""
