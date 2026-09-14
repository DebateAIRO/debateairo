# Human-owned FIX-13 test catalog

The production catalog intentionally ships empty. Only V may author and pin an
entry. With no entry, patch validation returns `REFUSED_CATALOG_EMPTY`; with the
production bundle's empty allowlist, it returns `REFUSED_ALLOWLIST_EMPTY` first.

The file format is:

```json
{
  "invariants": [
    {
      "id": "INV-EXAMPLE-ONE",
      "description": "closed invariant description",
      "command": "pnpm vitest run tests/unit/example.test.ts",
      "ownedBy": "V"
    }
  ]
}
```

Commands are executed as catalog data by the proof runner's argument parser;
they are never passed through a shell. Fixture tests construct local entries in
memory and do not modify this production file.
