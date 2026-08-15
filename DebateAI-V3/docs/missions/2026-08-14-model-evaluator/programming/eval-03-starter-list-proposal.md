# V STARTER-LIST PROPOSAL PACKET — evaluator domains

Status: **V APPROVED AS WRITTEN — 2026-08-15**  
Mission lane: `PROG-03` / `codex/eval-03-domains`  
Decision recorded: V approved this 26-domain starter list as written; migration
0024 remains pending integration wiring.

The list favors stable, broad subject areas that ordinary questions can match
without forcing early registry growth. Guardrails normalize Unicode/case/space,
match exact names, and reject proposals at or above the versioned near-duplicate
threshold. More specialized labels can still enter later as provenance-bearing
grown domains when they are genuinely distinct.

| # | Proposed domain | One-line rationale |
|---:|---|---|
| 1 | Agriculture & Food | Covers farming, food systems, nutrition supply chains, and culinary production. |
| 2 | Arts & Culture | Groups visual arts, performing arts, literature, cultural practices, and criticism. |
| 3 | Business & Management | Covers organizations, operations, strategy, entrepreneurship, and workplace management. |
| 4 | Computing & Software | Captures programming, software engineering, computer systems, and digital infrastructure. |
| 5 | Economics | Covers markets, macroeconomics, labor, trade, and economic analysis. |
| 6 | Education | Covers teaching, learning, curricula, institutions, and education policy. |
| 7 | Engineering | Groups applied design and engineering disciplines outside software-specific work. |
| 8 | Environment & Climate | Covers ecosystems, conservation, climate science, impacts, and adaptation. |
| 9 | Ethics & Philosophy | Covers moral reasoning, epistemology, logic, metaphysics, and applied ethics. |
| 10 | Finance & Investing | Covers personal/corporate finance, capital markets, accounting, and investment analysis. |
| 11 | Geography | Covers places, spatial relationships, cartography, and human/physical geography. |
| 12 | Government & Public Policy | Covers public administration, institutions, regulation, and policy design. |
| 13 | Health & Medicine | Covers clinical health, public health, disease, treatment, and healthcare systems. |
| 14 | History | Covers historical events, periods, sources, causation, and historiography. |
| 15 | Law & Justice | Covers legal doctrine, courts, rights, enforcement, and justice systems. |
| 16 | Linguistics & Languages | Covers language structure, usage, translation, language learning, and philology. |
| 17 | Mathematics | Covers pure/applied mathematics, statistics, probability, and quantitative proofs. |
| 18 | Media & Communication | Covers journalism, publishing, advertising, platforms, rhetoric, and audience effects. |
| 19 | Natural Sciences | Provides a broad home for physics, chemistry, biology, astronomy, and earth science. |
| 20 | Politics & Elections | Covers political actors, ideologies, campaigns, voting, and comparative politics. |
| 21 | Psychology | Covers cognition, behavior, mental processes, development, and psychological research. |
| 22 | Religion & Spirituality | Covers beliefs, traditions, theology, religious history, and spiritual practice. |
| 23 | Security & Defense | Covers national security, military affairs, intelligence, conflict, and resilience. |
| 24 | Society & Demographics | Covers sociology, communities, inequality, population trends, and social change. |
| 25 | Sports & Recreation | Covers sports, games, training, competition, leisure, and outdoor recreation. |
| 26 | Technology & Innovation | Covers emerging technologies, product innovation, adoption, and cross-domain tech impacts. |

Approval consequences:

- Approval authorizes integration to move
  `migrations/pending/0024_evaluator_domain_seed.sql` into the migration runner's
  top-level list.
- Until approval, the seed remains unwired and no starter row is applied.
- V's final list can be substituted by editing only the migration's `seed_data`
  values; registry/admission code does not change.
