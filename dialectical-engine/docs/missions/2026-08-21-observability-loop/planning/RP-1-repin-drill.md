# RP-1 — `zone_manifest_hash` re-pin drill

**Status: NOT YET ACTIONABLE.** Prepared 2026-08-27 by Claude-Router so that it is
ready the moment its real precondition lands. Router prepared the drill and
verified its mechanics; **Router did not compute the hash.** The value is the
custodian's to compute and read.

## 1. Readiness — correcting the record

RP-1's `Depends-on` names S04, and **S04 is approved** (Grok GREEN, 2026-08-26
14:47; the board column reads `todo` and is stale). On that basis RP-1 was
previously described as newly actionable. **That was wrong**, and the ticket body
says so in its own NOTE: the `zone_manifest_hash` **slot field** is authored
declared-unset by **S17** (`t_f6593842`) at §4 step 6. S17 is unbuilt —
`tools/obs-listener/policy/` does not exist in the repo or in the lane worktree.

So there is nowhere to pin. RP-1's true blocker is **S17, not S04**. Handing V a
custodian act with no slot to write into would have wasted a custodian pass.

## 2. What S04 actually produced

`packages/obs-capture/src/zone/manifest.ts` (sha256 begins `18f872e4…`, matching
Grok's independent 14:37 baseline). It carries its own **canonical recipe** in a
docstring — and that recipe is the right shape:

> UTF-8 `JSON.stringify` of the object, keys and array members in written order,
> followed by one LF byte; lowercase SHA-256 of those exact bytes.

This hashes the **data**, not the source file. It is therefore stable under
comments and reformatting and moves exactly when the zone set moves — the same
semantic-over-coordinate principle V ruled for the zone boundary on 2026-08-26.
Adopt it.

`apps/api/src/mfa.ts` **is** in `zone_path_prefixes`, so V's "zone for now"
ruling is honoured in the artifact RP-1 pins.

## 3. THE RISK — a pin that cannot fail

The module also exports `ZONE_MANIFEST_HASH`, computed from `ZONE_MANIFEST` in
the same file. **If S17 fills the slot from that export, or if the G1 acceptance
compares the slot against it, the pin is vacuous**: the manifest would be hashing
itself, and no edit to the zone set could ever produce a mismatch. That is the
defect class already charged twice in this mission — a criterion that cannot
fail, and "asserting from the ticket text would only echo the manifest."

**The slot must be filled from an independent reconstruction of the declared
contents, never from the module's own export.** The export's legitimate job is
the runtime's self-check against the pinned slot — it is one side of a
comparison, never both.

## 4. The drill — two sides that must agree

**Side A — implementation.** From the lane worktree:

```
node --experimental-strip-types -e 'import("./packages/obs-capture/src/zone/manifest.ts").then(m => console.log(m.ZONE_MANIFEST_HASH))'
```

**Side B — independent.** Transcribe the manifest's declared contents into
compact JSON, one LF at the end, and hash the bytes. No import of the module:

```
shasum -a 256 rp1-independent.json
```

`rp1-independent.json` is 772 bytes, ending in a single LF, holding the eight
`zone_path_prefixes`, the eight `compiled_alternate_prefixes`, the three
`mount_list` mounts in ruled order, and `identity_table_deny_set`, in written
order. A prepared copy sits in this session's scratchpad; **transcribe it fresh
rather than trusting a copy** — the transcription is the independence.

**Router verified 2026-08-27, read-only:** both sides run, both yield a 64-hex
value, and **the two agree**. The value was compared but never printed or
recorded here, so ratification is still a real custodian act and not a
transcription of something Router already knew.

Before pinning, read the sixteen path strings against the mission's zone rulings.
That reading — not the hash — is the substance of the custodian act; the hash only
freezes what was read.

## 5. Custody

Single custodian: V alone, per the **E6-02 amendment of 2026-08-22**. The
"requires BOTH custodian tokens" wording in RP-1's ACCEPTANCE is stale and is
**not a gate**. The one-token property is what the S17 drill asserts.

## 6. Order

S17 authors the slot declared-unset → V runs §4 and pins → G1. RP-1 stays
`blocked` until S17 lands. Nothing here asks V for anything today.
