# P4-12 Grok 4.6 verdict

Review session: `01a03cde-0fa7-7d70-a816-9b20edf13472`

Final verdict: **GREENLIGHT**

## Initial BLOCK

Grok found that `SIZE-01` named UTF-8 byte limits but could still be implemented using ASCII-only vectors. Such a corpus would not kill a buggy `string.length`/UTF-16 code-unit counter.

The concrete missing vector was a payload whose UTF-8 size is max+1 while its JavaScript code-unit length remains below the allowed maximum.

## Repair

- Added a pinned multibyte boundary: 32,768 × `é` = 65,536 UTF-8 bytes / 32,768 UTF-16 code units.
- Added max+1: the same content plus ASCII `a` = 65,537 UTF-8 bytes / 32,769 UTF-16 code units.
- Added `MUT-CODE-UNIT-SIZE` and bound it to `SIZE-01`.
- Strengthened the architecture test to require the exact multibyte object and mutation reference.

Grok's final verdict:

> **GREENLIGHT**
>
> The SIZE-01 repair closes the code-unit bypass. `multibyteUtf8Boundary` is 32,768 × `é` (65,536 UTF-8 bytes / 32,768 UTF-16 code units) and the same plus ASCII `a` (65,537 UTF-8 bytes / 32,769 code units). Both stay under 65,536 code units, so a `string.length` cap would accept the max+1 case and `MUT-CODE-UNIT-SIZE` can kill it. The architecture test pins that object and requires `MUT-CODE-UNIT-SIZE` on `SIZE-01`.

Final local evidence:

- focused architecture contract: `1/1`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0;
- corpus spec SHA-256: `6bdd6e00dbe2bdc54074ce1ce9168e0296d92d65bfb99fff36411fc7d7782b57`;
- architecture test SHA-256: `80b69a1028d79a61a75b2a5207faf46c032f0a55bdcfab2d58a8c1ad76a0c8d8`.
