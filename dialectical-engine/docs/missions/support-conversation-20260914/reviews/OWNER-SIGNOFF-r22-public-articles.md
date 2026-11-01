# Owner sign-off: four public-debate help articles for R22 (2026-11-01)

**Who:** the owner (recorded as `V` in the review file).
**Read on / signed on:** 2026-11-01, both, on a question card in the coordinator's Claude Code session `254b8d87-040e-44fc-bef6-c5c6150a7428` (answered 08:16 UTC).
**Articles:** `unpublish-a-debate`, `publish-a-debate`, `delete-a-private-debate`, `public-answer-disclosure`.

**The owner's words.** The card asked: "Do you approve these page lines and help articles? I've removed the promise about personal details, as you chose." The owner chose **"Approve (Recommended)"**, with no note. The coordinator's record of it (`OWNER-ANSWERS-2026-10-29.md`, section "Public, second card (1 Nov)", kept outside this repository) reads: "Page lines and four help articles approved as shown, with the personal-details promise removed; the owner has read them."

The promise itself was taken off by the owner's earlier answer the same day: "Take the promise off for now".

## What the owner read, and what they did not

- **Read:** the English body of each of the four articles, on the card. The English body of each file below is word for word what the card showed.
- **Romanian, not read:** the card showed English only. The Romanian article files are recorded under the owner's approval because they say the same thing as the English they approved, but the owner did not read the Romanian words. Each Romanian record says so in its `reviewerSession`.
- **Titles and front matter, not read:** the card named the articles by short labels ("Unpublish a debate", "Publish a debate", "Delete a private debate", "Public answer disclosure"). It did not show the file titles ("Can I unpublish a debate?", "Publish a debate", "Delete a private debate", "Limits of a published debate"), their Romanian titles, or the front matter. The hashes below cover the whole file, so they cover those parts too.
- **Support chat texts, not read:** each article also has two short chat texts in `packages/support-kb/recovery/components.json`, a model projection and a fallback. The card did not show them. So the recovery rows in the review file are **not** recorded as the owner's:
  - `unpublish-a-debate` (en, ro): the promise sentence was removed from both chat texts on the owner's ruling. The rows say this in `reviewerSession` (`r22-public2-lane-2026-11-01`), and they point at this note. No separate editor read the result.
  - the other three articles (en, ro): chat texts and rows are unchanged from the earlier lane record `r22-public-lane-2026-11-01`.

## What the signature covers

Article hashes are computed from the exact files. The chat-text hashes are listed so the rows above can be checked; they are not covered by the owner's signature.

| Article | Article sha256 (signed) | Model projection sha256 (not signed) | Fallback sha256 (not signed) |
|---|---|---|---|
| `unpublish-a-debate` en | `9dfb849df4115b35d8f736dccb902be68f65c77433c58c135e77dd095ce52c07` | `30c30d9f80f041a0c80b290e5755ae941d3ba1b01cbcc961371c38aa328288e1` | `83dd3ad252070dc8804863359ca155991f610de2f2e65a48376efa572c4dd202` |
| `unpublish-a-debate` ro | `71b31a6f7f64ca0147867bc8a4dd85e6fd38fbdc034c85d1d95120b15a188b8d` | `cec6010a9c9282f300696b462389aaf9ce843a877f71745228f019cc985ecf47` | `5db84e41dbf8e9d58c292c664865dbc560c602afc075c942794fcfbc4f876cc0` |
| `publish-a-debate` en | `de9b228a97db85a2d698261244fd673b59f901e528353e48b3d7f517b20cec72` | `7b5a96bd61e669dc0251d91c0c34bd7dbe1913b33f0cec72ca35eabd1c2eb39a` | `e4a1f1ff700c9ed6fe6ddb8351ede30de6e8d8b6f0e9145a9a0ccd30e3aecc1a` |
| `publish-a-debate` ro | `f84f19deb5e5465871020b36370ed37b4c932ff6e896eec6354d5e13748bad28` | `2e4c0469601c8391568029df044c634eef61de4e9997b656efb869e41bdcbae7` | `d147192e989cdda9b24a145e67d7ba59529ab910f059596696a36eeca7d2802b` |
| `delete-a-private-debate` en | `ecb340c8a317b82fbaa060c1d1b8840ef03b57f28fd2d78864bfd348371afce0` | `233cc1a4385cb709cbb5c23b345c3d2c215aec3507fae93b7bd9c8d9a7c5969e` | `a3ef34c66ac4cd438be2d1ca36bd551aeaa8062e66f3a19641f184368f5ca2b6` |
| `delete-a-private-debate` ro | `77a76700d6e7dddc43505d46d1eb292f84621e8b9f70306fc108dfe1061adfc8` | `48a79bb15437ff9aee066e2d7bc43d50ffa1e0a3ddf846e22c19fdd949825212` | `982b1328852aa5e134c264786a6134de1b4d5d4166c2aad6569bf4f07b38bdaa` |
| `public-answer-disclosure` en | `61d56f01ff035362e1f914c60421fe1c782a3056ade12614b149f05ee76a13af` | `60a27bba95e78ac17fc1216c033643bbe1d72f65165b52c11e648dbdc269edf5` | `97aacd2bedecdd8d85d11d40e5d50f19133b40f208c19fe5596a275310ed2449` |
| `public-answer-disclosure` ro | `30008ba74a9957ef8ae51bd1fdf9c9e42b556dfd3d6ef21e0fbf02326304cca4` | `1383cecd46eeada55d783e65e39f8d8d2717e7c46de79165153fc04a81e9ae64` | `4963b641418c33acf975d910260a45c20ae29efed8d802ea7a02ff767501f02d` |

**Why the front matter stays blank:** the loader takes an OWNER record from the review file and does not need `ratified_by` in the article. Leaving it blank also leaves the three unchanged articles byte for byte as they were. The owner's older signed records are untouched.
