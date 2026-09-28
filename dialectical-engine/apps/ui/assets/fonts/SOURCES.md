# Where the report's fonts come from

The full report (PDF) is printed on the server with these fonts. They are read
from this directory when a report is rendered. They are never sent to the
browser and never fetched from a CDN. Every family is under the SIL Open Font
License 1.1; its `OFL.txt` sits beside its files.

Every file below was fetched at the pinned commit shown in its URL. The sha256
column is checked by `apps/ui/lib/report/fonts.test.mjs`, so a changed file
fails the test.

## How each file was verified (2026-09-27)

- The git blob hash of each downloaded file equals the blob GitHub lists for
  that path at the pinned commit.
- The Noto Sans, Hebrew and Devanagari files are byte-identical to the same
  files inside the upstream release archives: NotoSans-v2.015,
  NotoSansHebrew-v3.001 and NotoSansDevanagari-v2.007. These are the builds
  google/fonts pins in its `METADATA.pb` files. The Devanagari archive also
  matches the sha256 digest GitHub publishes for it.
- The CJK files come from `notofonts/noto-cjk` at the commit that google/fonts
  pins for Noto Sans SC, JP and KR.
- Only static instances are used, never variable fonts. Only the weights the
  report prints are included: regular, bold, and italic where the script has
  one. The report prints the italic style in the regular face for scripts
  that have no italic.

## Files

| File | Version | Source (pinned commit) | sha256 | Bytes |
|---|---|---|---|---|
| `fraunces/Fraunces9pt-SemiBold.ttf` | Fraunces | https://raw.githubusercontent.com/undercasetype/Fraunces/d6d385783609ceb11ac0f220f3abd9f1631c8a36/fonts/static/ttf/Fraunces9pt-SemiBold.ttf | 68a5bf2872cde75f01e98681ab1633e19f73ca6783932fdff2e5459755528cf5 | 64856 |
| `fraunces/OFL.txt` | | https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/fraunces/OFL.txt | bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b | 4391 |
| `plus-jakarta-sans/PlusJakartaSans-Regular.ttf` | Plus Jakarta Sans | https://raw.githubusercontent.com/tokotype/PlusJakartaSans/18d1cd2f7ea10481919d2f05c1f7064b7307fc26/fonts/ttf/PlusJakartaSans-Regular.ttf | bd6276d4060e3b1ebc45047469e0bb86b08f301ba681cdf1ceb6245ea10478d2 | 128972 |
| `plus-jakarta-sans/PlusJakartaSans-Italic.ttf` | Plus Jakarta Sans | https://raw.githubusercontent.com/tokotype/PlusJakartaSans/18d1cd2f7ea10481919d2f05c1f7064b7307fc26/fonts/ttf/PlusJakartaSans-Italic.ttf | 140ae2bc35471386ca0a4a2a91cdae2f7ed600e70745a25293cc8db08754cd7c | 132492 |
| `plus-jakarta-sans/PlusJakartaSans-Bold.ttf` | Plus Jakarta Sans | https://raw.githubusercontent.com/tokotype/PlusJakartaSans/18d1cd2f7ea10481919d2f05c1f7064b7307fc26/fonts/ttf/PlusJakartaSans-Bold.ttf | 5f5342ef76862b5b5365d1dff1a667629dfa484e388dd602552f647219c3870f | 128988 |
| `plus-jakarta-sans/OFL.txt` | | https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/plusjakartasans/OFL.txt | 995c7199cab65954f545996326755daee7b63cc6b42b06c13da1f9502ab08a99 | 4402 |
| `noto-sans/NotoSans-Regular.ttf` | 2.015 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf | f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8 | 431364 |
| `noto-sans/NotoSans-Italic.ttf` | 2.015 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSans/unhinted/ttf/NotoSans-Italic.ttf | 678288f868807d4d64a6f3b51466871d117d915780381ce9d0ed4b3bcbd06d37 | 446880 |
| `noto-sans/NotoSans-Bold.ttf` | 2.015 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSans/unhinted/ttf/NotoSans-Bold.ttf | 87cb2d84472a7d66da659ee47b6cdb9552326e8c128245231f191b6ac72529d9 | 432376 |
| `noto-sans/OFL.txt` | | https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/c4a321e123e4d4ff315f57f4e0adf294fe3a95be/OFL.txt | cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a | 4396 |
| `noto-sans-hebrew/NotoSansHebrew-Regular.ttf` | 3.001 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSansHebrew/unhinted/ttf/NotoSansHebrew-Regular.ttf | 04272f5600d0ec816d31d0df73b23aa8d3501ea359ebe820da31c11ffcf00853 | 16836 |
| `noto-sans-hebrew/NotoSansHebrew-Bold.ttf` | 3.001 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSansHebrew/unhinted/ttf/NotoSansHebrew-Bold.ttf | dfdb3056de1f4542b888c77a1a8a750548a802e271479f56e52152423b64dde8 | 16900 |
| `noto-sans-hebrew/OFL.txt` | | https://raw.githubusercontent.com/notofonts/hebrew/036f3206f67caac235cf8546a7751d3440771a7e/OFL.txt | 9b9fe028b5ba74d231659a1bbaf0ed09b11e759d1ca6a070999e16d151616b47 | 4382 |
| `noto-sans-devanagari/NotoSansDevanagari-Regular.ttf` | 2.007 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Regular.ttf | 9c7d935139ea6a1e6ad9dbac4f6d27ece1e04bca8123c8888d00a0f9df4724cd | 184228 |
| `noto-sans-devanagari/NotoSansDevanagari-Bold.ttf` | 2.007 | https://raw.githubusercontent.com/notofonts/notofonts.github.io/f145d86c53996717bc4c25d4602eb9294e43dccc/fonts/NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Bold.ttf | ff2f76a23aad41e0608c2d7dbc4bacd247ff3bec78f0ec2a8fb106b561636e58 | 183412 |
| `noto-sans-devanagari/OFL.txt` | | https://raw.githubusercontent.com/notofonts/devanagari/e123d230c160ebe949d731cc19017cdb354180d1/OFL.txt | a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331 | 4386 |
| `noto-sans-sc/NotoSansSC-Regular.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf | faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9 | 8331336 |
| `noto-sans-sc/NotoSansSC-Bold.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf | c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0 | 8543168 |
| `noto-sans-sc/OFL.txt` | | https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosanssc/OFL.txt | 1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9 | 4388 |
| `noto-sans-jp/NotoSansJP-Regular.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf | dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073 | 4533028 |
| `noto-sans-jp/NotoSansJP-Bold.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf | 1b0edfb500b73a4fa8a4fcaae1bbbd403994e08e73e3e0da37e70d3853f42c5f | 4656448 |
| `noto-sans-jp/OFL.txt` | | https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosansjp/OFL.txt | 1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9 | 4388 |
| `noto-sans-kr/NotoSansKR-Regular.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf | 69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68 | 4644748 |
| `noto-sans-kr/NotoSansKR-Bold.otf` | 2.004 | https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf | 5a6ceb287ed2fc6cfc6213144ebea68cbd94b20fc9eb873d8486493bf02d9bda | 4816044 |
| `noto-sans-kr/OFL.txt` | | https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosanskr/OFL.txt | 1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9 | 4388 |

## Not vendored

- **Arabic.** No Arabic face ships yet, because the report cannot print Arabic
  correctly (see `lib/report/reportLanguage.ts`). The Noto Arabic fonts place
  the dots and vowel marks of Arabic letters with vertical adjustments, and
  @react-pdf/renderer 4.9.0 prints no vertical adjustment.
