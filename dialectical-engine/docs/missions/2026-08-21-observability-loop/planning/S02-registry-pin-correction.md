# S02 REGISTRY PIN — CORRECTION of Pg0-a §7

**Seat:** ARCHITECTURE (Claude Opus), intake amendment A4 · mission
`2026-08-21-observability-loop` · third Router correction.
**Occasion:** the S02 blocker on `t_8e040ec2` (2026-08-22 13:16), accepted and
attributed to the Router at 13:17.
**Replaces:** `Pg0-a-PIN-DRAFT.md` §7 only. §§1–6 and §8 are untouched and are
not reopened here. E6-02 is SINGLE CUSTODIAN; nothing below asserts a
two-token property.

---

## 0. The defect, stated once

Ratified §7 reads: *"Ratify the PROCEDURE and the resulting hash, not 173
hand-read codes … S02 reproduces the pinned hash."*

Its referent is **the registry** — an artifact that does not exist until S02
writes it. So the hash cannot exist before the implementation, and if the
implementation produces it, the acceptance test degenerates to `H == H`. That
is not a pin; it is the implementation grading itself. Verified independently
by this seat: zero 64-hex values in `Pg0-a-PIN-DRAFT.md`, in
`research/POST-SYNTHESIS-RULINGS.md`, or on the `observability-loop` board;
`t_192aaea9`'s workspace is empty. **The S02 seat was right to block.** It also
recorded the correct reason — that inventing a payload and hashing it would be
self-certification — rather than the merely procedural "input missing".

Two further defects were found while repairing this one, both recorded below:
the ratified §2 "production file" glob **misses a real workspace package**
(§10.3), and S17's G0 drill criterion still asserts a **two-token** property
that the 2026-08-22 amendment voided (§8.2).

---

## 1. The repair, in one sentence

**Repoint the hash from the artifact to the tree.** The error codes are facts
in a frozen git object. A hash of *those* is computable by anyone, before any
registry code exists, and is not movable by the party that will write the
registry.

### 1.1 Is first-creation "reproduce the pin" coherent? — YES, once repointed

The task the Router set asks whether reproduction is coherent at first
creation, or whether S02's first pass should ESTABLISH the artifact with V
ratifying its hash thereafter.

**Reproduction is coherent, and establish-then-ratify is not acceptable.** The
discriminator is a single question:

> **Can a party who has never seen the implementation compute the expected
> value?**

- Under **tree derivation** (this document): yes. `sh <recipe> seed | shasum -a
  256` at base commit `29f370e`. The value below was computed by this seat, and
  then reproduced a second time by an independently written Python
  implementation of the same specification (§3.4). Neither run touched the
  registry, because the registry does not exist.
- Under **establish-then-ratify**: no. V would be ratifying a number whose only
  warrant is "the implementation emitted it". V's act carries **zero
  independent information**; the gate is procedurally present and
  epistemically empty. It is the same self-certification, in slower motion,
  with a custodian signature laundering it. Immutability-after-ratification
  does not repair this: freezing a number nobody could have predicted freezes
  the implementation's opinion, not a requirement.

### 1.2 The anti-self-certification property, argued rather than assumed

The property to be earned is: *S02 cannot cause its own acceptance criterion to
be satisfiable by anything it writes.* Four independent reasons, each checkable:

1. **Frozen referent.** The recipe reads `git show 29f370e:<path>`. It never
   reads the working tree, never reads `HEAD`, and never reads the index. The
   working tree at time of writing is dirty with a concurrent mission's edits
   (`packages/db/src/identity.ts`, `apps/api/src/registration.ts`, and 12
   others); the derivation is provably indifferent to them — it reproduced
   identically across three runs with that dirt present.
2. **Out-of-reach scope.** S02's entire `allowed:` set is
   `packages/obs-capture/src/registry/**` plus `tests/unit/obs-l2-s02-*`.
   `packages/obs-capture/` did not exist at `29f370e` (verified: zero blobs),
   and the recipe additionally **excludes `packages/obs-capture/**` by an
   explicit filter** so that the exclusion survives any future forward re-pin.
   S02 therefore cannot add a code to the set it must reproduce even in
   principle.
3. **Seat separation is real, not nominal.** This seat authors the recipe and
   writes no code; S02 is a distinct Codex session in a distinct worktree
   (`obs-lane-2-capture`) whose contract forbids editing anything under
   `docs/`. The recipe is authored *upstream of and blind to* the artifact.
4. **Ratification is over values, not over a black box.** The full 276-name
   payload is enumerated in §6. V's spot-check cost is a `grep`, not trust in
   the recipe. This is the residual honesty requirement: canonicalization is
   *definitionally* authored, so the guard is that its output is legible, not
   that its author is disinterested.

**What this does NOT claim.** It does not claim the derived set is the complete
set of codes the tree can throw. It is the complete set the *specified recipe*
yields. The difference is measured, bounded, and pinned as its own fact (§4,
§5) rather than hidden.

---

## 2. Scope of the derivation

```
base commit  : 29f370e            (= current dev HEAD 7918f4f; identical trees,
                                   tree 0ce8a3fd…, subtree dialectical-engine
                                   d1dfa82a10e98720ec1280a64d2cb9a40e0e607a)
scope        : dialectical-engine/apps/<app>/src/**            *.ts, *.tsx
               dialectical-engine/apps/ui/{app,components,lib}/**
               dialectical-engine/packages/**/src/**
               minus *.d.ts
               minus packages/obs-capture/**          (self-certification bar)
files        : 115
sha256       : 63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da
```

Three scope decisions, each argued:

- **The positive globs are §2's already-ratified "production file"
  enumeration**, *except* that `packages/*/src/**` is widened to
  `packages/**/src/**`. **This is a defect report against ratified §2, not a
  liberty**: the workspace declares `packages/battery/*` as package roots
  (`pnpm-workspace.yaml`), and `packages/battery/decision/src/index.ts` is a
  real production module with **8 `TypedDomainError` call sites** that §2's
  single-star glob silently excludes. §2's glob should be corrected wherever
  else it governs; that is a Router act outside this document.
- **§2's deny list is deliberately NOT subtracted.** The deny list governs
  **fix authority** (which paths ESCALATE); the registry governs **capture
  vocabulary**. Subtracting it would blind obs to `packages/crypto/**` and the
  security zone — exactly the subsystems whose failures matter most. Naming a
  failure and being allowed to fix it are different authorities and must not
  share a list.
- **`tests/**`, `acceptance/**`, `tools/**`, `web/**` are excluded.** Test and
  acceptance fixtures are not product codes (they would add 2 and 9 codes
  respectively); `tools/**` is ops; `web/**` is the H.4 leftover slated for
  removal at P0. Because `web/**` is out of scope, **the P0 web-removal ride
  cannot move this hash** — a stability property worth having.

---

## 3. The recipe — byte-exact

Form imitated from `TYPECHECK-BASELINE.md`. Save verbatim as
`obs-code-seed.sh`; run with `sh obs-code-seed.sh {files|direct|forwarders|forwarded|seed}`.
It is read-only, touches no working-tree file, and needs only `git`, `grep`,
`sort`, `perl` and `sha256`.

### 3.1 Canonicalization (POLICY — this is the part V ratifies as procedure)

Every payload below is: **UTF-8, no BOM, LF only, one record per line,
`LC_ALL=C sort -u`, terminated by a final LF, hashed with SHA-256.** Verified:
zero CR bytes, final byte is `0x0a`. `shasum -a 256`, `sha256sum` and
`openssl dgst -sha256` were cross-checked and agree.

A code record is the literal code string. A forwarder record is
`path<TAB>function<TAB>parameter<TAB>argIndex`. A file record is the
repo-root-relative path.

### 3.2 The script

```sh
#!/bin/sh
# Pg0-a §7-R  obs code-seed recipe  v1
set -eu
R="${OBS_REPO:-/Users/vladmihaimiron/Documents/DebateAIRO}"
B="${OBS_BASE:-29f370e}"
P='dialectical-engine'
ID='[A-Za-z_\$][A-Za-z0-9_\$]*'

files() {
  git -C "$R" ls-tree -r --name-only "$B" -- "$P" \
  | grep -E '\.tsx?$' | grep -vE '\.d\.ts$' \
  | grep -E "^$P/(apps/[^/]+/src/|apps/ui/(app|components|lib)/|packages/([^/]+/)+src/)" \
  | grep -vE "^$P/packages/obs-capture/" \
  | LC_ALL=C sort
}
stream() { files | while IFS= read -r f; do printf '\n//__OBSFILE__ %s\n' "$f"; git -C "$R" show "$B:$f"; done; }

PL_DIRECT='
my %a; while(/^\s*(?:export\s+)?const\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*(?::[^=\n]+)?=\s*"([A-Z][A-Z0-9_]*)"\s*;/gm){$a{$1}=$2}
while(/\bnew\s+TypedDomainError\s*\(\s*([^,]*?)\s*,/gs){my $x=$1;
  if($x=~/^"([A-Z][A-Z0-9_]*)"$/){print "$1\n"}elsif(exists $a{$x}){print "$a{$x}\n"}}'

PL_FWD='
my @F=split /^\/\/__OBSFILE__ /m,$_;
for my $b (@F){ next unless $b=~/\S/; my ($p,$y)=$b=~/^(\S+)\n(.*)$/s or next;
 my %a; while($y=~/^\s*(?:export\s+)?const\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*(?::[^=\n]+)?=\s*"([A-Z][A-Z0-9_]*)"\s*;/gm){$a{$1}=$2}
 while($y=~/\bnew\s+TypedDomainError\s*\(\s*([A-Za-z_\$][A-Za-z0-9_\$]*)\s*,/gs){ my $v=$1; next if exists $a{$v};
  my $pre=substr($y,0,pos($y)); my $fn="?"; my $ix=-1;
  while($pre=~/(?:function\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)|(?:const|let)\s+([A-Za-z_\$][A-Za-z0-9_\$]*)\s*(?::[^=\n]*)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=>]*)?=>)/gs){
    my $n=defined $1?$1:$3; my $ps=defined $2?$2:$4; my @q=split /\s*,\s*/,$ps;
    for my $i (0..$#q){ if($q[$i]=~/^\s*(?:readonly\s+)?([A-Za-z_\$][A-Za-z0-9_\$]*)\s*[:?]/ && $1 eq $v){$fn=$n;$ix=$i} } }
  print "$p\t$fn\t$v\t$ix\n"; } }'

PL_HARVEST='
my %f; open(my $M,"<",$ARGV[0]) or die; while(<$M>){chomp; my($p,$n,$v,$i)=split /\t/; next if $i<0; $f{$n}=$i} close $M; shift @ARGV;
local $/; my $s=<STDIN>;
for my $n (sort keys %f){ my $w=$f{$n};
 while($s=~/\b\Q$n\E\s*\(/g){ my $d=1; my $i=pos($s); my @g=(); my $c="";
  while($i<length($s) && $d>0){ my $ch=substr($s,$i,1);
   if($ch=~/[\(\[\{]/){$d++} elsif($ch=~/[\)\]\}]/){$d--; last if $d==0}
   if($d==1 && $ch eq ","){push @g,$c;$c="";$i++;next} $c.=$ch;$i++ }
  push @g,$c; next unless defined $g[$w]; my $x=$g[$w]; $x=~s/^\s+|\s+$//g;
  print "$1\n" if $x=~/^"([A-Z][A-Z0-9_]*)"$/ } }'

case "${1:-seed}" in
  files)      files ;;
  direct)     stream | perl -0777 -ne "$PL_DIRECT" | LC_ALL=C sort -u ;;
  forwarders) stream | perl -0777 -ne "$PL_FWD" | LC_ALL=C sort -u ;;
  forwarded)  T=$(mktemp); stream | perl -0777 -ne "$PL_FWD" | LC_ALL=C sort -u > "$T"
              stream | perl -e "$PL_HARVEST" "$T" | LC_ALL=C sort -u; rm -f "$T" ;;
  seed)       D=$(mktemp); F=$(mktemp); T=$(mktemp)
              stream | perl -0777 -ne "$PL_DIRECT" | LC_ALL=C sort -u > "$D"
              stream | perl -0777 -ne "$PL_FWD"    | LC_ALL=C sort -u > "$T"
              stream | perl -e "$PL_HARVEST" "$T"  | LC_ALL=C sort -u > "$F"
              LC_ALL=C sort -u "$D" "$F"; rm -f "$D" "$F" "$T" ;;
esac
```

### 3.2a RECIPE v1.1 — the additive `subclass` pass (Router, 2026-08-26; V-authorized)

> **v1 IS BYTE-UNCHANGED.** The `files | direct | forwarders | forwarded | seed`
> modes above are untouched, so the ratified `code_seed` hash
> `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451` remains
> reproducible by v1 exactly as written. v1.1 **adds one mode and changes none.**
> Registering the new codes into `derived[]` was **rejected** precisely because it
> would have broken that hash; they go into `declared_gap[]` instead, which
> `REGISTRY_CODE_SET` treats identically for resolution.

**Why the pass exists.** Recipe v1's `direct` pass matches only literal
`new TypedDomainError("CODE",`. It is structurally blind to a code declared by a
**subclass**. `packages/providers/src/index.ts` contains **zero** occurrences of
`new TypedDomainError` — it declares its codes through class declarations — so
two real, reachable product codes were invisible to the pin. Unregistered codes
redact to a capture-self fallback with `fallback_minimized: true`, which is the
exact outcome §4.2's `declared_gap` partition was pinned to prevent: the hole
becomes *"an unexplained `fallback_minimized`"* instead of a ratified fact.

**The rule, stated so a party who has never seen the implementation can apply it.**
A code is yielded when it is declared by a class extending `TypedDomainError`,
bound either by an `override readonly code = "LITERAL"` field **or** by a
`super("LITERAL", …)` call inside that class body, and is absent from
`code_seed`. Class bodies are located by **brace matching** from the class's
opening brace, so nested braces cannot leak a code out of one class into another.

**Scope, canonicalization and base are unchanged** — the same frozen 115-file
`files()` scope at `29f370e`, the same §3.1 canonicalization (UTF-8, no BOM, LF
only, `LC_ALL=C sort -u`, final LF, SHA-256).

```sh
# append to the v1 script; add `subclass` to the case dispatch
PL_SUBCLASS='
local $/; my $s = <STDIN>;
while ($s =~ /\bclass\s+[A-Za-z_\$][A-Za-z0-9_\$]*\s+extends\s+TypedDomainError\s*\{/g) {
  my $st = pos($s); my $d = 1; my $i = $st;
  while ($i < length($s) && $d > 0) {
    my $ch = substr($s, $i, 1);
    $d++ if $ch eq "{"; $d-- if $ch eq "}";
    $i++;
  }
  my $body = substr($s, $st, $i - $st - 1);
  while ($body =~ /(?:override\s+)?readonly\s+code\s*(?::[^=\n]+)?=\s*"([A-Z][A-Z0-9_]*)"/g) { print "$1\n" }
  while ($body =~ /\bsuper\s*\(\s*"([A-Z][A-Z0-9_]*)"\s*,/g) { print "$1\n" }
}'

  subclass) stream | perl -e "$PL_SUBCLASS" | LC_ALL=C sort -u ;;
```

**Router-executed verification, read-only, before this was recorded.** Scope
reproduces at **115** files. The pass yields **exactly two** codes:

```
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
```

This is an **independent derivation from the rule**, written without reference to
the architecture seat's answer, and it agrees with that seat's enumeration.
**Router computed no hash** — the union with the existing seven `declared_gap`
members and its SHA-256 are the custodian's act on **RP-0 (`t_4deda7ab`)**, and a
pin computed by the party that authored the recipe is not a pin.

**STOP CONDITION, binding on the custodian and on the implementing seat alike:**
if the `subclass` run yields anything other than exactly `PROVIDER_CALL_FAILED`
and `PROVIDER_CONTENT_UNACCEPTED`, **stop** — the tree has moved or the rule was
implemented differently, and either is a finding, not a number to absorb.

**What is deliberately NOT closed here.** The crypto error family
(`CryptoError` / `CryptoInputError` / `Argon2InfrastructureError`, ~11 reachable
codes) stays **outside** this pass. `CryptoError extends Error`, not
`TypedDomainError`, and most of its codes are declared as constructor-parameter
**union types**, so closing the family needs a **type-aware** rule rather than a
wider class rule. Widening the class rule was **rejected**: it would harvest
excluded-zone `Error` subclasses, breaking §10.1's ratified *"no zone code enters
any pinned payload"* and colliding with V's Batch-8 no-metadata rule. V ruled
(H-1, 2026-08-26) that this is closed **later, as recipe v2, explicitly confined
to non-zone paths, on its own re-pin card**. Until then crypto failures —
including a boot-time KEK failure in `apps/runner` — degrade to
`OBS_CAPTURE_SELF` with `fallback_minimized: true`: honest and counted, but
uninformative. Recorded as a named accepted residual, not an oversight.

**Authority.** §7-R requires V for a **recipe** change. V gave that sign-off on
2026-08-26 when authorizing the L2 addendum, which stated the registry recipe
change explicitly. The resulting `declared_gap` hash still requires the
custodian's independent computation on RP-0.

### 3.3 What each pass does, and why it is a fact and not an opinion

| pass | rule | authored content |
|---|---|---|
| `direct` | first argument of `new TypedDomainError(…)` is a double-quoted `^[A-Z][A-Z0-9_]*$` literal — **or** a bare identifier bound by a same-file `const X = "LITERAL";`. | the two match patterns. Nothing selects *which* codes. |
| `forwarders` | a function is an **error-code forwarder** iff its body constructs `TypedDomainError` from one of its own formal parameters. The forwarder list and the parameter's argument index **fall out of the tree** — no helper is named by hand. | the definition of "forwarder". |
| `forwarded` | for each derived `(function, argIndex)`, harvest string literals appearing at that exact argument index in calls to that function, with balanced-delimiter argument splitting. | none beyond the above. |
| `seed` | union of `direct` and `forwarded`. | none. |

The `const`-alias rule in `direct` is load-bearing and yields no phantom: it
contributes **exactly one** code across the whole tree — `DATABASE_POOL_FAILED`
(`packages/db/src/index.ts:9,17`), the plan's named "first offender"
(FinalPlan §C.1 / D05d). Without the rule the derivation is 233 and silently
loses the database pool-failure code. `direct` without the alias rule hashes
`e9f235c6c0cc7c750430d39eb56ab3f28875084918d4db69762d97d40fc14a12`.

**Why argument-index precision matters, demonstrated.** A looser regex that
harvests any screaming-snake literal near a forwarder call admits
`MATCHED_EXISTING` — which is not an error code at all but a member of the
`decision` union in `packages/evaluator/src/index.ts:798`. The index-precise
rule rejects it. This phantom is the reason the recipe resolves argument
positions rather than scanning proximity, and it is the reason §4's residual
gap is left *declared* rather than closed by widening the regex.

### 3.4 Independent reproduction

Both the file list and `direct` were recomputed from the same written
specification by a **separately authored Python implementation** and produced
byte-identical hashes. `seed`, `forwarders` and `forwarded` reproduced
identically across three consecutive shell runs with the working tree dirty.

---

## 4. The pinned values

```
base commit         : 29f370e
recipe              : obs-code-seed.sh  v1  (§3.2, verbatim)
canonicalization    : UTF-8 / LF / LC_ALL=C sort -u / trailing LF / sha256

scope_file_list      count 115   63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da
code_seed_direct     count 234   1be8394c0c01dcf859b70e2c3b7df7f6efe8f8d376fbf28b01caf9615628f790
forwarder_manifest   count   7   e2f70b4b78fd6e02e3c9078bb99c6cf81cd75379debdcfe69f5517c39dd152a9
code_seed_forwarded  count  44   09409f1d74005898154830ffe93678099826352e4961cd9877e338974133f793
code_seed  (TARGET)  count 276   65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451
known_gap            count   7   d1e9b67d17efa3a2e8f8a2be386f59517fbd7769e193b2d5f042f24c53d4ae9a
```

`code_seed` = `code_seed_direct ∪ code_seed_forwarded` (234 + 44 with 2 shared
= 276). `known_gap ∩ code_seed = ∅` (verified). Registered domain codes at G0 =
**283**.

### 4.1 The forwarder manifest (7 rows) — pinned as `e2f70b4b…`

```
dialectical-engine/apps/runner/src/index.ts	callWithContentContract	organFailureCode	2
dialectical-engine/apps/runner/src/index.ts	parseContent	code	2
dialectical-engine/packages/evaluator/src/index.ts	requireNonblank	code	1
dialectical-engine/packages/evidence/src/index.ts	nonBlank	code	1
dialectical-engine/packages/serve/src/index.ts	requiredText	code	1
dialectical-engine/packages/settlement/src/index.ts	?	code	-1
dialectical-engine/packages/valuation/src/index.ts	requireNonBlank	code	1
```

The last-but-one row is the recipe reporting its own limit honestly: in
`packages/settlement/src/index.ts` the code is a **function-local
`const code = cond ? "A" : "B"`**, not a parameter, so no function name or
argument index exists — the recipe emits `?` / `-1` and the harvest skips it
rather than guessing.

### 4.2 `known_gap` (7) — the measured incompleteness, pinned as `d1e9b67d…`

```
EVALUATOR_DOMAIN_MODEL_ID_INVALID
EVALUATOR_DOMAIN_MODEL_VERSION_INVALID
EVALUATOR_DOMAIN_PROVENANCE_INVALID
EVALUATOR_DOMAIN_PROVIDER_INVALID
EVALUATOR_DOMAIN_RUN_ID_INVALID
SCORECARD_TASK_CLASS_AMBIGUOUS
SCORECARD_TASK_CLASS_UNRESOLVED
```

Five reach a forwarder through a destructured tuple loop
(`for (const [value, code] of [[input.runId, "…"], …] as const) requireNonblank(value, code)`,
`packages/evaluator/src/index.ts:934-942`); two are the settlement ternary
above. They are **real, reachable codes that recipe v1 provably does not
yield**. They are pinned separately so the hole is a ratified fact with a hash
rather than a surprise found at G1. Closing them by widening the regex was
rejected: the widened form admits `MATCHED_EXISTING` (§3.3). Closing them
properly is **D05d's** job — literalize the seven call sites — after which a
Router re-pin moves them from `known_gap` into `code_seed`.

---

## 5. What the registry must contain — four partitions

The pin governs only the first, third and fourth. The split is what lets a
real pin coexist with obs' own codes without either contaminating the other.

| partition | membership | pinned? | provenance tag |
|---|---|---|---|
| `derived[]` | **exactly** the 276 of `code_seed` | YES — `65ba47df…` | `RECIPE-v1` |
| `declared_gap[]` | **exactly** the 7 of `known_gap` | YES — `d1e9b67d…` | `GAP-v1` |
| `indirect_origins[]` | **exactly** the 7 forwarder rows | YES — `e2f70b4b…` | `FORWARDER-v1` |
| `authored[]` | obs' own self-observation + health-counter codes | NO | `OBS-SELF` |

`authored[]` is S02's to write, but is fenced statically: every member matches
`^OBS_[A-Z0-9_]+$`. Verified at base: **zero** of the 276 derived codes begin
with `OBS_`, so the two namespaces are provably disjoint and the disjointness
is a one-line test, not a review obligation.

`indirect_origins[]` is not decoration. Publishing it in the registry is what
makes the recipe's blind spot **machine-visible to the listener**: an
occurrence whose code is unknown can be attributed to a declared forwarder site
instead of vanishing into an unexplained `fallback_minimized`.

### 5.1 Safe templates — derived by rule, not by 276 decisions

**Rule:** `safe_template_id(C) = "tpl." + C`, total and injective over
`derived ∪ declared_gap ∪ authored`. **Seed parameter list: EMPTY for every
code.**

Why this is the right seed rather than a shortcut:

- It removes the 276-hand-mapping burden that §7 was rightly trying to avoid,
  without replacing it with a fiction.
- **At G0 the injection wall (OBS-R048 / OBS-R103) holds by absence, not by
  validation.** A template with no parameters has no text-shaped surface at
  all. Batch-3 row 6 already removed every free-text column; zero-parameter
  templates remove the last thing that could carry attacker-influenced bytes.
- It matches the posture V already ratified twice in this pin: §3's allowlist
  is EMPTY and grows only by re-pin; the severity override table (§5.2) is
  EMPTY on the same terms. Three fail-closed empties, one rule.
- Parameters are added **per code, by re-pin, with evidence** — never in bulk,
  never by the implementing seat.

**Typed parameter declarations** are a closed vocabulary of exactly the four
types A.3 already ratified: `id` · `registry_code` · `closed_enum` ·
`bounded_int`. There is **no `string` member and no `free_text` member**, so
"no string parameter admits unvalidated input" is *not* a runtime check that
could be bypassed — **it is a type that cannot be spelled.** S02 must implement
and test all four validators plus the drop-with-`fallback_minimized` path even
though the seed declares no parameters; the validators are provable against the
pinned type vocabulary without any seed row exercising them, and that is
strictly better than seeding parameters merely to have something to test.

### 5.2 Severity — a deterministic total function, not a 276-row table

**Rule:** `severity(code) = SEVERITY_OVERRIDES[code] ?? SEVERITY_DEFAULT`,
with `SEVERITY_DEFAULT = DEGRADED` and `SEVERITY_OVERRIDES` **seeded EMPTY**.
This is a deterministic table in the sense §5 requires — total, pure, no
ordering imposed on `CONDITION_MARKS` (28 members, read unordered per RT-41).

`DEGRADED`, not `INFO` (a thrown domain error is not informational) and not
`SEVERE` (which would put the entire code space above `obs.severeThreshold` on
day one). Nothing is lost by the conservative choice, because §5 already
establishes that the threshold governs **urgency class and routing only, never
whether V is asked** — every above-QUICK proposal notifies regardless. Real
severity comes from the ratified deterministic promotion rules (breadth,
duration, recurrence, affected runs — A.3/OBS-R010), which are evidence-driven
and cannot be gamed by a seed value.

### 5.3 Taxonomy — the registry carries NO per-code class

Per A.3, `taxonomy_class` is an **envelope** field resolved at capture from the
capture point and the detector, not a property of the code. §7 therefore never
needed 276 class assignments and this document authors none. S02's "no dangling
member" obligation over taxonomy is exactly: the 12 members of §4 resolve, and
`SUSPICIOUS_SUCCESS` carries its three subclasses. Any per-code class binding
is a later, separate re-pin — not a G0 input.

---

## 6. FACT / POLICY split — every element marked

**FACT-derived** means: mechanically recomputable from `29f370e` by §3.2;
ratifying it authors nothing; a disagreement is a bug in the recipe or a moved
tree, never a difference of opinion.

| element | FACT / POLICY | note |
|---|---|---|
| the 115-file scope **list** | **FACT** | given the scope expression |
| the scope **expression** | **POLICY** | which globs; §2 reuse + the `packages/**` widening + the deny-list non-subtraction |
| `code_seed_direct` (234) | **FACT** | |
| `forwarder_manifest` (7) | **FACT** | forwarder set falls out of the tree |
| `code_seed_forwarded` (44) | **FACT** | given the forwarder rule |
| `code_seed` (276) | **FACT** | given scope + recipe |
| `known_gap` (7) | **FACT** | measured; enumerated in §4.2 |
| the **recipe text** (match patterns, forwarder definition, argument-index harvesting) | **POLICY** | authored here; V ratifies the procedure |
| **canonicalization** (UTF-8 / LF / `LC_ALL=C sort -u` / trailing LF / sha256) | **POLICY** | |
| the six **hash values** | **FACT** | given the two policies above |
| base commit `29f370e` | **POLICY** | which commit is "the tree" |
| `safe_template_id = "tpl."+code` | **POLICY** | one rule, replaces 276 decisions |
| seed parameter list EMPTY | **POLICY** | fail-closed |
| parameter type vocabulary = the four A.3 types, **no string member** | **FACT** from ratified A.3 | transcription, not authorship |
| `SEVERITY_DEFAULT = DEGRADED`, overrides EMPTY | **POLICY** | fail-closed |
| registry has **no** per-code taxonomy class | **FACT** from ratified A.3 | class is an envelope field |
| `authored[]` fenced to `^OBS_` | **POLICY** | disjointness is then a test |
| `CONDITION_MARKS` read unordered, 28 members | **FACT** | `packages/kernel/src/index.ts:69` |
| §2 glob misses `packages/battery/decision` | **FACT** | defect report, §10.3 |

Everything in the POLICY column that is a *value* rather than a *rule* is
seeded at its most conservative setting — EMPTY, zero, or the lowest
non-trivial rung — and grows only by re-pin. That is deliberate: it means a
wrong ratification under-reports rather than over-authorizes.

---

## 7. §7-R — the replacement text

> Delete Pg0-a §7 in full and substitute:

```
## 7. Code-registry seed  (source: FinalPlan §A / D06a; corrected 2026-08-22
##    after the S02 blocker on t_8e040ec2)

The seed is DERIVED FROM THE TREE, not from the registry. Its referent is the
frozen git object `29f370e`, so the target exists before the implementation
does and cannot be moved by the seat that writes the implementation.

Recipe: `obs-code-seed.sh v1`, reproduced verbatim in
`planning/S02-registry-pin-correction.md` §3.2. Read-only; reads git objects,
never the working tree; excludes `packages/obs-capture/**`.

Canonicalization: UTF-8, no BOM, LF only, one record per line,
`LC_ALL=C sort -u`, trailing LF, SHA-256.

    base commit         : 29f370e
    scope_file_list      count 115   63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da
    code_seed_direct     count 234   1be8394c0c01dcf859b70e2c3b7df7f6efe8f8d376fbf28b01caf9615628f790
    forwarder_manifest   count   7   e2f70b4b78fd6e02e3c9078bb99c6cf81cd75379debdcfe69f5517c39dd152a9
    code_seed_forwarded  count  44   09409f1d74005898154830ffe93678099826352e4961cd9877e338974133f793
    code_seed  (TARGET)  count 276   65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451
    known_gap            count   7   d1e9b67d17efa3a2e8f8a2be386f59517fbd7769e193b2d5f042f24c53d4ae9a

The 276 members are enumerated in that document §11.1, the 7 gap members in
§4.2, the 7 forwarder rows in §4.1. Ratification is over those VALUES and over
the recipe, not over a black box.

The registry has four partitions. `derived[]` must hash-equal `code_seed`;
`declared_gap[]` must hash-equal `known_gap`; `indirect_origins[]` must
hash-equal `forwarder_manifest`; `authored[]` holds obs' own codes, is not
hashed, and every member matches `^OBS_[A-Z0-9_]+$` (disjoint from `derived[]`
by construction — no derived code begins with `OBS_`).

Safe templates: `safe_template_id(C) = "tpl." + C`, total and injective. SEED
PARAMETER LIST IS EMPTY FOR EVERY CODE. The parameter TYPE vocabulary is
closed to the four A.3 types — `id`, `registry_code`, `closed_enum`,
`bounded_int`. THERE IS NO STRING OR FREE-TEXT TYPE, so OBS-R048/R103's "no
string parameter admits unvalidated input" holds by absence rather than by
validation. Parameters are added per code by re-pin with evidence, never in
bulk and never by the implementing seat.

Severity: `severity(code) = SEVERITY_OVERRIDES[code] ?? DEGRADED`, with
SEVERITY_OVERRIDES SEEDED EMPTY. Total, deterministic, imposes no order on
CONDITION_MARKS. The threshold governs urgency and routing only (§5); real
severity comes from the ratified deterministic promotion rules.

Taxonomy: the registry carries NO per-code taxonomy class. Per A.3 the class
is an envelope field resolved at capture. §4's 12-member vocabulary must
resolve; nothing more is pinned here.

RE-PINNING. The pin is against a commit, so it does not rot silently, but it
does go stale. DOWNWARD or SIDEWAYS movement caused by a merge that adds or
removes an in-scope code is a ROUTER act at the merge boundary, recorded on the
board with the new count/sha256 and the causing commit; it is MANDATORY, not
optional. Any change to the SCOPE EXPRESSION, the RECIPE, the
CANONICALIZATION, the SAFE-TEMPLATE RULE, the PARAMETER TYPE VOCABULARY, the
SEVERITY DEFAULT, or any move of a member out of `known_gap` requires V. No
lane may do either: nothing under `docs/` is in any lane's allowed set.
Expected next re-pin: after D05d literalizes the seven `known_gap` call sites.
```

---

## 8. Corrected acceptance

### 8.1 S02 (`t_8e040ec2`) — replaces the RED→GREEN clause

The current clause is unsatisfiable ("reproduce the Pg0-a hash" — no hash
existed) and, where satisfiable, unfalsifiable. Replacement:

> **RED** (must be captured before any registry file is authored, and must
> genuinely fail): the test computes `sha256` over the canonical projection of
> `registry.derived[]` and asserts equality with
> `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451`. With no
> registry present the projection is empty and hashes
> `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` — a
> concrete, reproducible mismatch against a concrete, reproducible target.
> This is the sense in which the acceptance can now "genuinely go red": the
> expected value is a literal in the test, traceable to §7-R, and no code S02
> writes can change it.
>
> **GREEN** — all of:
> 1. `sha256(canon(registry.derived)) == 65ba47df…` and `|derived| == 276`.
> 2. `sha256(canon(registry.declared_gap)) == d1e9b67d…` and `|gap| == 7`.
> 3. `sha256(canon(registry.indirect_origins)) == e2f70b4b…` and `|rows| == 7`.
> 4. `derived ∩ declared_gap ∩ authored == ∅` pairwise; every `authored`
>    member matches `^OBS_[A-Z0-9_]+$`; no `derived` or `declared_gap` member
>    does.
> 5. No dangling id: every registry code resolves to exactly one
>    `safe_template_id`; every `safe_template_id` resolves to a declared
>    template; `safe_template_id(C) == "tpl." + C` for all C; the mapping is
>    injective.
> 6. The parameter type vocabulary is exactly `{id, registry_code,
>    closed_enum, bounded_int}` — asserted **structurally** (the union admits
>    no other member, checked at type level and at runtime), which is how
>    OBS-R048/R103 is met. Every seed template declares zero parameters.
> 7. All four validators exist; for each type, a value failing it is **dropped
>    and `fallback_minimized` is set** — proven per type, against the pinned
>    vocabulary, not against a fixture S02 chose.
> 8. `severity()` is total over `derived ∪ declared_gap ∪ authored`, lands in
>    `INFO<DEGRADED<SEVERE<FATAL`, returns `DEGRADED` for every seed code, and
>    `SEVERITY_OVERRIDES` is empty. `CONDITION_MARKS` (28 members) is consumed
>    unordered and neither extended nor re-ordered (RT-41).
> 9. The 12-member taxonomy vocabulary resolves with `SUSPICIOUS_SUCCESS`'s
>    three subclasses; the registry declares **no** per-code taxonomy class.
> 10. **Drift report (non-blocking):** the test additionally re-runs the
>     recipe against the lane's own merge base and reports the hash. A
>     difference from `65ba47df…` is a **Router re-pin event**, recorded on the
>     board — explicitly **not** an S02 failure, and S02 must not "fix" it by
>     editing the registry. This keeps the RED→GREEN honest and non-flaky
>     while the tree moves under a long-running lane.

Contract deltas required: `contract.readonly` changes from "the Pg0-a pinned
registry-seed / taxonomy / severity-map hashes" to
"`planning/S02-registry-pin-correction.md` §4 pinned values and §3.2 recipe".
`Depends-on: Pg0-a (the hashes to reproduce)` is satisfied by §7-R once
ratified. Everything else on the ticket stands. rework_round unchanged — the
worker produced no defect. Return to the same worker/session.

### 8.2 S17 (`t_f6593842`) — AFFECTED, on two counts

**(a) It inherits the §7 circularity, and §7-R does not fully clear it.**
S17 must "REPRODUCE the Pg0-a hashes" and its `contract.readonly` names "the
Pg0-a target hashes". For the code-registry component, §7-R supplies real
targets and S17 is unblocked. For the *bundle* hash it is not, and the reason
is worse than a missing value:

> S17's `contract.allowed` gives it **the bundle FORMAT and LOADER**. If the
> byte format is S17's to invent, then a pre-pinned hash **of the file** is
> impossible without self-certification — the same defect, one level up.

**The fix is to pin content, not bytes.** Define `bundle_content_hash` over a
**canonical, format-independent projection** of the Pg0-a data — the same
canonicalization as §3.1, one `key=value` record per leaf, `LC_ALL=C sort -u`.
Then S17 may choose any file format it likes; its acceptance is: *load the
bundle through the loader, project it, hash it, match the pin.* That target is
computable by V in advance from §§1–6/§8's already-ratified text, is invariant
to S17's format choices, and goes genuinely red if a taxonomy member is dropped
or the allowlist is non-empty.

Producing that projection for §§1–6 and §8 is a **Router act** — call it
**Pg0-b** — and is out of this document's S02 scope. This document supplies the
§7 component of it (`code_seed`, `known_gap`, `forwarder_manifest`,
`safe_template` rule, severity rule) in already-canonical form. **Until Pg0-b
exists, S17's bundle-hash criterion remains unpinnable and S17 must not be
dispatched against it.**

**(b) Its G0 drill criterion asserts a VOIDED two-token property.** S17's GREEN
still reads *"a RE-PIN WITHOUT BOTH CUSTODIAN TOKENS FAILS in drill (E6-02)"*,
and Pg0-a's "What V is being asked" item 2 still asks V to **name a second
custodian**. The 2026-08-22 amendment made E6-02 **SINGLE CUSTODIAN**. As
written the criterion is unsatisfiable by design and would force the seat to
either fake a second token or block. Corrected criterion:

> a re-pin attempted **without the custodian token** fails in drill; a re-pin
> **with** it succeeds and is audited. Exactly one token exists; no test, no
> loader, and no bundle field may reference a second.

Pg0-a's ask-item 2 should be struck for the same reason.

**Not affected:** S04 (RP-1) *produces* the zone-manifest hash rather than
reproducing one, so it never had this defect — the H5-04 "S02/S17 reproduce;
S04 produces" split was right, and it is precisely the reproduce side that was
hollow. RP-2 and RP-3 pin values that do not exist yet and are correctly
declared UNSET.

---

## 9. THE ONE QUESTION V MUST ANSWER

Everything in the POLICY column of §6 is seeded at its most conservative
value — EMPTY allowlist of parameters, EMPTY severity overrides, zero
parameters per template, no per-code taxonomy, lowest non-trivial severity
rung. Each is fail-closed: a wrong answer under-reports and is repaired by a
later re-pin. **Exactly one policy choice is not fail-closed**, because getting
it wrong loses observability silently rather than loudly:

> ### Which set is `code_seed`?
>
> **(A) 276** — `direct` ∪ `forwarded`, hash
> `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451`.
> Includes the 42 codes that reach `TypedDomainError` through a derived
> forwarder. **Recommended.**
>
> **(B) 234** — `direct` only, hash
> `1be8394c0c01dcf859b70e2c3b7df7f6efe8f8d376fbf28b01caf9615628f790`.
> Every member is literally the first argument of a construction — maximally
> auditable, no balanced-delimiter argument parsing in the trusted path. Cost:
> 42 real, reachable codes fall to the unknown-code degrade path and every
> occurrence of them carries `fallback_minimized` indefinitely — a permanently
> blurred 15% of the code space.
>
> Under either answer `known_gap` (7, `d1e9b67d…`) and `forwarder_manifest`
> (7, `e2f70b4b…`) are pinned unchanged; under (B) the 42 move into
> `declared_gap[]` and its hash is recomputed by the Router.

Both values are already computed, so the answer is one word and nothing is
blocked on arithmetic.

**Ratifying §7-R with answer (A) requires no further input.** If V wants any
of the fail-closed defaults changed — the base commit, the scope expression,
`SEVERITY_DEFAULT`, the `tpl.` prefix — naming it is enough; each is a single
substitution and the Router recomputes.

**Struck, not asked:** Pg0-a's ask-item 2 ("name the second custodian"). E6-02
is single-custodian as of 2026-08-22; there is no second custodian to name and
nothing in this document asserts a two-token property.

---

## 10. Collateral findings

### 10.1 Excluded security zone — untouched

Three zone paths — `apps/api/src/registration.ts`,
`apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` — fall inside the
scope globs and therefore **appear in `scope_file_list` (§11.3) as path
strings**, exactly as they appear in the D03 manifest. Their bytes were scanned
for `TypedDomainError` call sites and they contain **zero**, so the question of
whether zone codes belong in the registry does not arise at this base and **no
zone code enters any pinned payload**. Nothing in the zone was modified,
imported, or referenced other than by path string; the
`packages/db/src/index.ts:587-603` re-export block was not touched. If a future
re-pin finds a zone code, that is a V question, not a Router one — capture
vocabulary and fix authority diverge there.

### 10.2 A mission-general rule this episode earns

> **A pin whose expected value cannot be computed by a party that has never
> seen the implementation is not a pin.**

Applied as a checklist before any future "reproduce the hash" criterion is
written: name the referent; confirm it exists *now*; confirm the implementing
seat cannot alter it; confirm the recipe is authored upstream of and blind to
the artifact; enumerate the payload so ratification is over values. §7 failed
the first two. S17's bundle criterion (§8.2a) fails the third. Both failures
were invisible because the sentence *sounded* like a pin.

### 10.3 DEFECT in ratified §2's "production file" enumeration

§2 defines production files as `apps/*/src/**`, `packages/*/src/**`,
`apps/ui/{app,components,lib}/**`. `pnpm-workspace.yaml` declares
`packages/battery/*` as package roots, so
`packages/battery/decision/src/index.ts` — a real production module with **8
`TypedDomainError` call sites** — matches none of those globs. Wherever §2's
enumeration governs QUICK-tier eligibility, that file is currently
**unclassified**, which is a fix-authority question, not merely a registry one.
This document widens the glob for its own scope only. **The §2 correction is a
Router act and is not performed here.**

---

## 11. Appendices

### 11.1 `code_seed` — the 276 pinned codes (payload, verbatim)

Hash `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451`.
Members marked `+` are the 42 contributed only by the forwarder pass; under
answer (B) exactly those move to `declared_gap[]`.

```
  ABSENT_SIGNAL_HAS_FRESHNESS
+ AMENDED_QUERY_REQUIRED
+ AMENDMENT_REASON_REQUIRED
  ANSWER_INDEX_PAGE_INVALID
  ARROW_ENDPOINT_ABSENT
  ASK_AS_OF_INVALID
  ASK_RISK_TIER_DEFAULT_UNAVAILABLE
  ATTEMPT_ACCESS_DEPTH_MISSING
  AUTH_POLICY_INVALID
  AUTH_POLICY_UNRESOLVED
  BAND_CEILING_BAND_UNKNOWN
  BAND_CEILING_BASIS_EMPTY
  BAND_CEILING_BASIS_INVALID
  BAND_CEILING_BASIS_MISMATCH
  BAND_CEILING_CUT_EMPTY
  BAND_CEILING_CUT_INVALID
  BAND_CEILING_DECISION_INVALID
  BAND_CEILING_LABELS_INVALID
+ BAND_CEILING_LABEL_INVALID
  BAND_CEILING_LABEL_UNKNOWN
+ BAND_CEILING_LIFT_PATH_INVALID
+ BAND_CEILING_ROW_INVALID
+ BAND_CEILING_SOURCE_INVALID
  BAND_CEILING_VERSION_INVALID
+ BAND_LABEL_INVALID
  BAND_LABEL_UNKNOWN
  BAND_ORDER_INVALID
+ BLANK_QUERY_REFUSED
  BLOCKED_TERMINAL_RETIRED
  BUDGET_SKIP_AFFECTED_NODES_REQUIRED
  CALIBRATION_STRATEGY_INVALID
  CALL_BUDGET_EXHAUSTED
  CATCH_UP_ANSWER_NOT_FOUND
  CATCH_UP_DISCLOSURE_MISMATCH
  CATCH_UP_SOURCE_VERSION_CHANGED
  CATEGORICAL_SPAWN_CHILD_MISSING
  CENSUS_PARTITION_INVALID
  CLAIM_TYPE_COMPOSITION_MAP_INVALID
  CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING
  CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED
  COMPLETENESS_GATE_FAILED
  COMPOSITION_BUDGET_UNRESOLVED
  COMPOSITION_CONTRACT_ERROR
  COMPOSITION_MEASUREMENT_INVALID
  COMPOSITION_UNRESOLVED
  CONDITION_MARK_AFFECTED_NODES_REQUIRED
  CONDITION_MARK_RECORD_REQUIRED
  CONDITION_MARK_RECORD_WITHOUT_MARK
  CONFIGURED_PROVIDER_SET_INVALID
  CONFIGURED_PROVIDER_SET_UNRESOLVED
+ CONFORMANCE_CONTRACT_ERROR
  CONSUMER_AUTHORIZATION_FAILED
  CONSUMER_CONTENT_REFUSED
  CONVERGENCE_CONTROLS_INVALID
  CONVERGENCE_CONTROLS_PROVENANCE_MISSING
  CONVERGENCE_CONTROLS_UNRESOLVED
  CRITERION_ID_DUPLICATE
+ CRITERION_ID_INVALID
+ CRITERION_LABEL_INVALID
  CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED
  CRITIQUE_CONTEXT_NOT_ISOLATED
  DATABASE_POOL_FAILED
  DEBATE_EXPANSION_PARENT_MISSING
  DEBATE_MAKER_UNRESOLVED
  DEBATE_ROOT_MISSING
  DECISION_IDEMPOTENCY_CONFLICT
  DECISION_IDENTITY_UNSERIALIZABLE
  DECISION_SPAWN_COUNT_INVALID
  DEEPENING_IDENTITY_MISSING
  DEEPENING_ROUND_INVALID
  DEPLOYMENT_REGISTER_UNAVAILABLE
  DERIVED_STANDING_RECORD_INVALID
  DIFFERENT_MAKER_REVIEWER_UNAVAILABLE
  DISPUTED_RESOLUTION_REQUIRES_HUMAN
  DISTINCT_CERTIFICATION_CAPTURES_REQUIRED
  DUPLICATE_SNAPSHOT_NODE
  EDGE_IDENTITY_CONFLICT
  EDGE_INTEGRITY_ERROR
  EDGE_MEASURED_MAGNITUDE_MISSING
  EDGE_TARGET_MISSING
  EMPIRICAL_FINDINGS_MISSING
  EMPIRICAL_SETTLEMENT_MISSING
  EMPTY_DECISION_REASON
  EMPTY_EVENT_STREAM
  EMPTY_OVERLAY_OWNER
  EMPTY_PROPAGATION
  ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS
  ENVELOPE_VERIFIED_NODE_SET_EMPTY
  EVALUATOR_ADDON_OUTPUT_INVALID
  EVALUATOR_ADDON_POLICY_INVALID
+ EVALUATOR_ADDON_RUN_ID_INVALID
  EVALUATOR_CATALOG_UNAVAILABLE
  EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED
  EVALUATOR_DOMAIN_ASSIGNMENT_ADMISSION_MISMATCH
+ EVALUATOR_DOMAIN_ID_INVALID
  EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH
+ EVALUATOR_DOMAIN_REFUSAL_REASON_INVALID
  EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED
+ EVALUATOR_HARVEST_RUN_ID_INVALID
  EVALUATOR_MAKER_PANEL_COLLISION
  EVALUATOR_PROFILE_DERIVATION_CONFLICT
+ EVALUATOR_PROFILE_STRATEGY_ROW_KEY_INVALID
+ EVALUATOR_PROFILE_STRATEGY_SOURCE_REF_INVALID
  EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN
  EVALUATOR_PROVIDER_FAMILY_INVALID
  EVALUATOR_PROVIDER_FAMILY_UNRESOLVED
  EVALUATOR_PROVIDER_PANEL_COLLISION
  EVALUATOR_RANK_DERIVATION_CONFLICT
  EVALUATOR_TAGGER_ARTIFACT_REQUIRED
  EVALUATOR_TAGGER_MAKER_MISMATCH
  EVALUATOR_TAGGER_OUTPUT_INVALID
+ EVALUATOR_TAG_EVENT_REASON_INVALID
+ EVALUATOR_TAG_INPUT_HASH_INVALID
+ EVALUATOR_TAG_PROVENANCE_INVALID
+ EVALUATOR_TAG_QUESTION_INVALID
+ EVALUATOR_TAG_RUN_ID_INVALID
+ EVIDENCE_ITEM_REF_REQUIRED
+ EVIDENCE_REPLAY_HANDLE_REQUIRED
  EXPLORATION_FLOOR_INVALID
  EXTERNAL_RESOLVER_REQUIRED
  FINAL_STRENGTH_WITHHELD
  FIXED_SINGLE_ROOT_SERVE_VIOLATED
  FRESHNESS_BOUND_INVALID
+ FRESHNESS_REGISTER_ROW_REQUIRED
  FRESHNESS_SOURCE_MISSING
  GRAPH_CHILD_STRUCTURE_INVALID
  GRAPH_CYCLE_DETECTED
  GRAPH_CYCLE_WRITE_REJECTED
  GRAPH_PARENT_NOT_FOUND
  GRAPH_ROOT_STRUCTURE_INVALID
  GRAPH_RUN_MISMATCH
  HIDDEN_CONDITION_MARK_RECORD_INVALID
  HIDDEN_NODE_SCORE_THRESHOLD_UNRESOLVED
  HONESTY_FIELD_MISSING
  INCONSISTENT_PRE_COMPOSITION_EVIDENCE
  INDEPENDENT_BUDGET_MARKS_CONFLATED
+ INSTRUMENT_REF_REQUIRED
  INVALID_COMPOSITION_ATTEMPT
  JUDGEMENT_POLICY_UNRESOLVED
  JUDGE_PARSE_FAILURE
  JUDGE_SCHEMA_FAILURE
  LEVERAGE_ROUND_INCOMPLETE
  LIFT_TARGET_ABSENT
  LIVENESS_AFFECTED_EMPTY
  LIVENESS_NODE_NOT_FOUND
  LIVENESS_PARENT_CYCLE
  LIVENESS_POLICY_INVALID
  LIVENESS_POLICY_PROVENANCE_MISSING
  LIVENESS_POLICY_UNRESOLVED
  LIVENESS_QUERY_INVALID
  LIVENESS_THRESHOLD_INVALID
  LIVENESS_TIME_INVALID
  MAKER_INVENTORY_UNSATISFIED
  MAKER_POLICY_INVALID
  MAKER_POSITION_UNAVAILABLE
  MALFORMED_ARROW_ORDER
  MAX_RECOMPOSE_INVALID
  MEMORY_DIFFERENCE_REQUIRED
  MEMORY_DISCLOSURE_GATE_FAILED
  MEMORY_LINK_NOT_FOUND
  MEMORY_MATCH_FACT_REQUIRED
  MEMORY_MATCH_PREDICATE_DRIFT
  MEMORY_PRIOR_ANSWER_MISSING
  MEMORY_PULL_CAP_EXCEEDED
  MEMORY_PULL_POLICY_INVALID
  MEMORY_PULL_UNPINNED
  MEMORY_QUESTION_EMPTY
  MEMORY_QUESTION_NOT_CANONICAL
  MISSING_COMPOSITION_ARTIFACT
  MODEL_ASSERTED_EVIDENCE_SCORE_REFUSED
+ MODEL_FAMILY_REQUIRED
  MULTI_MAKER_PLAN_REQUIRES_MULTIPLE_MAKERS
+ NEGATIVE_CAPTURE_REQUIRED
+ NODE_ID_REQUIRED
  NODE_REVIEW_PARSE_FAILURE
  NODE_REVIEW_SCHEMA_FAILURE
  NODE_REVIEW_UNAVAILABLE
  NONSPAWNING_DECISION_HAS_CHILD
  NO_ELIGIBLE_MODEL
  NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW
  NO_USABLE_JUDGEMENTS
  OFF_PLAN_QUERY_REFUSED
+ OFF_SUBJECT_SHARE_REQUIRED
  OPERATOR_RESOLUTION_MISSING
  OPPOSITION_QUERY_REQUIRED
  OPTION_CRITERION_UNRESOLVED
  OPTION_ID_DUPLICATE
+ OPTION_ID_INVALID
+ OPTION_LABEL_INVALID
+ ORG_POLICY_PROFILE_INVALID
  OVERLAY_DETACHMENT_VIOLATION
  OVERLAY_RUN_MISMATCH
  PANEL_DISCOVERY_POLICY_UNRESOLVED
  PARTIAL_SCORE_RUN_IDENTITY
+ POSITIVE_CAPTURE_REQUIRED
+ POST_COMPOSE_R9_CONTRACT_ERROR
  PRESENT_SIGNAL_FRESHNESS_UNKNOWN
  PRODUCER_GRADING_FORBIDDEN
+ PRODUCING_RUN_REQUIRED
  PROPAGATION_MAGNITUDE_INVALID
  PROPAGATION_RECEIPT_INVALID
  PROPAGATION_RECEIPT_MISSING
  PROPAGATION_STRENGTH_INVALID
  PROPER_SCORE_INVALID
  PROTECTED_CITATION_COMPARE_SKIPPED
  PROTECTED_CORE_NOT_VERIFIED
  PROVIDER_CALL_INSIDE_TRANSACTION
+ QUERY_SET_REF_REQUIRED
  RECONSTRUCTION_INPUT_MISSING
  REGENERATION_POLICY_MISMATCH
  REGENERATION_POLICY_UNRECORDED
  REGENERATION_REJECTION_EVIDENCE_MISSING
  REVISION_TRIGGER_NOT_FOUND
  RISK_TIER_POLICY_INVALID
  RISK_TIER_POLICY_PROVENANCE_MISSING
  RISK_TIER_POLICY_UNRESOLVED
  RIVAL_CARVER_UNAVAILABLE
  RUNNER_FAILURE_STATE_NOT_RECORDED
  RUN_COST_ENVELOPE_EXHAUSTED
  RUN_COST_ENVELOPE_UNRESOLVED
  RUN_DEPTH_PARAMS_INVALID
  RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM
  RUN_HOLD_RECORDER_UNRESOLVED
  RUN_MAKER_COUNT_INVALID
  RUN_NOT_FOUND
  SCALAR_DECISION_CANNOT_SPAWN
  SCORECARD_INTERVAL_INVALID
  SCORECARD_TASK_CLASS_MAP_INVALID
  SCORED_REJECTED_EVIDENCE_REFUSED
  SCORING_OPERATOR_UNRESOLVED
  SELF_ROUTING_FORBIDDEN
  SENSITIVITY_FEEDBACK_ORDER_INVALID
  SEQUENCE_ALLOCATION_FAILED
  SERVED_NUMBER_NOT_FOUND
  SERVED_ROOT_UNRESOLVED
  SERVE_ITEMS_NOT_A_LIST
  SERVE_ITEM_INVALID
  SERVE_ITEM_OUT_OF_NODE_SET
  SERVE_NODE_SET_EMPTY
  SERVE_OUTPUT_NOT_FROM_LEDGER
  SERVE_POLICY_UNRESOLVED
  SERVE_STATUS_UNKNOWN
  SETTLEMENT_FIELD_REQUIRED
  SETTLEMENT_IDENTITY_INVALID
  SETTLEMENT_NUMBER_INVALID
  SETTLEMENT_PROVENANCE_INVALID
  SETTLEMENT_RACE_WITHOUT_WINNER
  SETTLEMENT_READ_BACK_FAILED
+ SHADOW_SUBJECT_REQUIRED
+ SHADOW_UNLOCK_REQUIRED
+ SOURCE_REF_REQUIRED
  SPAWN_SLOT_IDENTITY_CONFLICT
  STORED_RESULT_MISSING
  STRENGTH_LINEAGE_UNRESOLVED
  STRUCTURAL_CEILING_INPUTS_UNRESOLVED
  SUPERSEDED_ANSWER_IDENTITY_MISMATCH
  SUPERSEDED_ANSWER_NOT_FOUND
  TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED
  TERMINAL_ACTIVATION_UNRESOLVED
  TERMINAL_FACT_READ_FAILED
  TERMINAL_ROW_NOT_EVALUATABLE
  TIER_PROVENANCE_MISSING
  UNDERCUT_TARGET_INVALID
  UNSERVED_MAKER_POSITION_UNRESOLVED
+ UNSUPPRESSED_BAND_REQUIRED
  VALUE_CRITERIA_EMPTY
  VALUE_OPTIONS_INSUFFICIENT
  VALUE_PHASE_NOT_READY
  WAIT_RESOLUTION_INCOMPLETE
  WAIT_RESOLUTION_NOT_CURRENT
+ WEIGHT_CRITERION_INVALID
  WEIGHT_VALUE_INVALID
  WEIGHT_VECTOR_CRITERIA_MISMATCH
  WEIGHT_VECTOR_EMPTY
  WEIGHT_VECTOR_ZERO
  WORK_ITEM_WITHOUT_RUN
```

### 11.2 Literal call-site census (`direct` pass, 287 sites)

Evidence only — **not hashed**, because line numbers move and a pin that
breaks on unrelated edits is a pin nobody can hold.

```
    48  packages/serve
    40  apps/runner
    30  packages/evaluator
    21  packages/valuation
    21  packages/register
    18  packages/battery
    14  packages/propagation
    13  packages/settlement
    11  packages/memory
    11  packages/graph
     9  packages/evidence
     9  packages/critique
     8  packages/ledger
     8  packages/judgement
     8  packages/db
     7  packages/liveness
     5  packages/budget
     5  apps/ui
     1  apps/api
```

### 11.3 `scope_file_list` — the 115 in-scope source files

Hash `63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da`.

```
apps/api/src/index.ts
apps/api/src/mail-channel.ts
apps/api/src/main.ts
apps/api/src/registration.ts
apps/evaluator-worker/src/index.ts
apps/replay/src/cli.ts
apps/replay/src/index.ts
apps/runner/src/index.ts
apps/runner/src/main.ts
apps/runner/src/migrate-cli.ts
apps/scheduler/src/cli.ts
apps/scheduler/src/index.ts
apps/ui/app/admin/workers/page.tsx
apps/ui/app/api/[...path]/route.ts
apps/ui/app/debate/[id]/DebatePageClient.tsx
apps/ui/app/debate/[id]/DebatePageGate.tsx
apps/ui/app/debate/[id]/page.tsx
apps/ui/app/layout.tsx
apps/ui/app/new/defaults.tsx
apps/ui/app/new/page.tsx
apps/ui/app/page.tsx
apps/ui/app/settings/page.tsx
apps/ui/components/AnswerHonestyDrawer.tsx
apps/ui/components/ArgumentFocusView.tsx
apps/ui/components/AuthGate.tsx
apps/ui/components/CanvasViewport.tsx
apps/ui/components/ChallengePopover.tsx
apps/ui/components/DebateCanvas.tsx
apps/ui/components/DebateMap.tsx
apps/ui/components/DebateOutline.tsx
apps/ui/components/DebateSplit.tsx
apps/ui/components/DebateThread.tsx
apps/ui/components/DebateTree.tsx
apps/ui/components/DebateWorkspaceDrawer.tsx
apps/ui/components/DebatesBuffer.tsx
apps/ui/components/EvaluatorDevMenu.tsx
apps/ui/components/GuideModal.tsx
apps/ui/components/InvestigationDrawer.tsx
apps/ui/components/LibraryComposer.tsx
apps/ui/components/ModelPresentation.tsx
apps/ui/components/NodeDetailDrawer.tsx
apps/ui/components/RecommendedInvestigations.tsx
apps/ui/components/ScoringErrorBoundary.tsx
apps/ui/components/SynthesisPanel.tsx
apps/ui/components/Toast.tsx
apps/ui/components/TopBar.tsx
apps/ui/components/VerdictBanner.tsx
apps/ui/lib/api.ts
apps/ui/lib/canvasViewport.ts
apps/ui/lib/debateHeaderOverflow.ts
apps/ui/lib/debatePresentation.ts
apps/ui/lib/debateTreeUtils.ts
apps/ui/lib/format.ts
apps/ui/lib/makerIdentity.ts
apps/ui/lib/models.ts
apps/ui/lib/observability/index.ts
apps/ui/lib/observability/logger.ts
apps/ui/lib/observability/suspiciousScoring.ts
apps/ui/lib/recommendation.ts
apps/ui/lib/scoring/scoringResponseSpecification.ts
apps/ui/lib/scoringFormat.ts
apps/ui/lib/scoringResponse.ts
apps/ui/lib/scoringStatusCopy.ts
apps/ui/lib/scrutiny.ts
apps/ui/lib/scrutinyDepth.ts
apps/ui/lib/serverApi.ts
apps/ui/lib/types.ts
apps/ui/lib/v3/adapter.ts
apps/ui/lib/v3/answerExport.ts
apps/ui/lib/v3/census.ts
apps/ui/lib/v3/labels.ts
apps/ui/lib/v3/liveEvents.ts
apps/ui/lib/v3/missingCapabilities.ts
apps/ui/lib/v3/tokenUnlock.ts
packages/battery/decision/src/index.ts
packages/battery/src/index.ts
packages/battery/src/split.ts
packages/battery/src/terminal.ts
packages/budget/src/index.ts
packages/contract/src/client.ts
packages/contract/src/generate.ts
packages/contract/src/index.ts
packages/critique/src/index.ts
packages/crypto/src/argon2-worker-pool.ts
packages/crypto/src/argon2-worker.ts
packages/crypto/src/index.ts
packages/db/src/identity.ts
packages/db/src/index.ts
packages/db/src/obs-schema.ts
packages/db/src/schema.ts
packages/evaluator/src/blind-sample.ts
packages/evaluator/src/consumer-postgres.ts
packages/evaluator/src/consumer.ts
packages/evaluator/src/dev-menu.ts
packages/evaluator/src/dispatch-binding.ts
packages/evaluator/src/harvest-constants.ts
packages/evaluator/src/index.ts
packages/evidence/src/index.ts
packages/graph/src/index.ts
packages/judgement/src/index.ts
packages/judgement/src/s04.ts
packages/kernel/src/index.ts
packages/ledger/src/index.ts
packages/liveness/src/index.ts
packages/memory/src/index.ts
packages/propagation/src/index.ts
packages/providers/src/index.ts
packages/published-arithmetic/src/index.ts
packages/register/src/auth-policy.ts
packages/register/src/compose-env.ts
packages/register/src/index.ts
packages/register/src/runtime-environment.ts
packages/serve/src/index.ts
packages/settlement/src/index.ts
packages/valuation/src/index.ts
```

---

*Authored by the ARCHITECTURE seat. No ticket edited, no code written, no
other file touched — the Router applies this. `docs/` is in no lane's allowed
set.*
