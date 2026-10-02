# RFP phase — spec

Status: **planned, not built.** Written 2026-10-02.

Merge today is built around a grant application: a funder asks questions, people answer them,
an approver signs off, the owner merges everything into one plain narrative and downloads it.

An RFP is the same shape with three things grants rarely ask for:

1. **References** — "list three clients we can call," with contact details and dates.
2. **Pricing** — a rate sheet or line-item cost proposal, usually on the issuer's template.
3. **A presentable document** — RFP responses are read by a selection committee, so the
   output needs a cover page, section numbering, and the issuer's required ordering.
   (Grants stay plain. This is the "proposal workflow" parked earlier.)

This spec covers all three, with references and pricing as the pieces to build first.

---

## 1. Project kind

Add `Project.kind` — `"grant"` (default) or `"rfp"`. Chosen on the New project page; it changes
labels ("Funder" → "Issuer", "grant" → "proposal") and unlocks the RFP-only sections below.
Everything else — questions, sections, assignment, limits, approvals, merge — works unchanged.

```prisma
model Project {
  kind String @default("grant") // grant | rfp
}
```

Nothing about existing grants changes; they're all `kind: "grant"` after the migration.

---

## 2. References

A workspace-level directory of people who will vouch for your work, reused across proposals —
the same relationship the **Partners** directory already has to a workspace, so it should look
and behave like Partners (`server/routes/partners.cjs`, `client/src/pages/Partners.js`).

```prisma
model Reference {
  id            String   @id @default(cuid())
  companyId     String
  organization  String              // "Wesley Housing"
  contactName   String
  title         String?             // "Director of Property Management"
  email         String?
  phone         String?
  relationship  String?             // "Client, lease-up marketing"
  projectName   String?             // the work they can speak to
  startedAt     DateTime?
  endedAt       DateTime?           // null = ongoing
  contractValue String?             // free text: "$48,000 over 18 months"
  summary       String?             // 2–4 sentences, drops straight into a response
  tags          String?             // comma-separated, same convention as Partner.tags
  permissionConfirmedAt DateTime?   // they said yes to being listed
  lastUsedAt    DateTime?           // so you can rotate and not overuse one contact
  notes         String?             // internal only, never exported
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now()) @updatedAt
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}
```

**UI** — `/app/references`, under Tools, next to Partners. List with search across organization,
contact, relationship, and tags. Add/edit in a modal. Each row shows when the reference was last
used and whether permission is confirmed; both are nudges, not blockers.

**On a project** — a question with `type: "reference"` (see §4) renders a picker: choose N
references, reorder them, and the answer is rendered from a fixed block per reference
(organization, contact, title, email, phone, dates, one-line scope). Selecting a reference stamps
`lastUsedAt`.

**Guard rails**
- Warn, don't block, when a reference has no `permissionConfirmedAt`, or was used on another
  proposal in the last 30 days.
- `notes` is internal: excluded from merge, exports, and review links. Worth a test.

---

## 3. Pricing references

Past pricing, kept so you can quote consistently instead of re-deriving a number each time.
Two levels, because RFPs ask for both "your rates" and "what you charged someone comparable."

```prisma
model PricingItem {          // the rate card — what you charge
  id          String   @id @default(cuid())
  companyId   String
  name        String                // "Lease-up marketing — monthly retainer"
  unit        String                // hour | month | project | unit | word
  rate        Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")
  category    String?               // "Marketing", "Reporting", "Design"
  description String?               // what the line includes — shows in the cost narrative
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, active])
}

model PricingPrecedent {     // what you actually charged, per past engagement
  id          String   @id @default(cuid())
  companyId   String
  referenceId String?               // optional link to the Reference for the same client
  client      String
  scope       String                // one paragraph
  total       Decimal  @db.Decimal(12, 2)
  term        String?               // "18 months"
  awardedAt   DateTime?
  won         Boolean  @default(true)   // losing bids are useful pricing data too
  notes       String?
  company     Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  reference   Reference? @relation(fields: [referenceId], references: [id], onDelete: SetNull)

  @@index([companyId])
}
```

**UI** — `/app/pricing`, two tabs: **Rate card** (PricingItem) and **Past pricing**
(PricingPrecedent). Money formatting via a shared helper; store `Decimal`, never float.

**On a project** — a question with `type: "pricing"` renders a small builder: pick rate-card
lines, set quantities, and Merge totals them. The saved answer holds both the structured rows
(in `Question.pricing` as JSON, so it can be re-edited and re-totaled) and a rendered table for
export. A sibling "cost narrative" text question can pull each line's `description`.

**Guard rails**
- Totals recompute on open; never trust a stored total.
- Changing the rate card does not retro-change a submitted answer — the rows are copied into the
  answer at save time.
- Past pricing is internal by default; it only exports if the question explicitly asks for it.

---

## 4. Question types

`Question.type` exists today as `text | upload`. Add two:

| type | How it's answered | Exports as |
|---|---|---|
| `text` | written answer, limit-checked | the text |
| `upload` | pick a file from the cabinet, mark uploaded | `[Attachment: filename]` |
| `reference` | pick references, reorder | formatted reference block |
| `pricing` | build from the rate card | line-item table + total |

The paste parser (`client/src/lib/parseQuestions.js`) should detect the new two the way it
already detects uploads:
- `reference` — "Provide three client references", "List references", a section named
  *References* / *Past performance* / *Qualifications*.
- `pricing` — "Provide your fee schedule", "Cost proposal", "Rate sheet", "Pricing", a section
  named *Cost* / *Fee* / *Budget* / *Pricing*. A pricing item that says "upload our template"
  stays an `upload` — template wins over type.

Every detection stays a suggestion: the type dropdown on each row is editable, as now.

---

## 5. Merge, export, and review

- Merge (`mergeNarrative` in `server/routes/projects.cjs`) renders reference and pricing blocks
  in question order, under their section headings, like any other answer.
- Export (`server/utils/export.cjs`) renders references as a block per reference and pricing as a
  real table in both PDF and Word. Grants keep today's plain output; only `kind: "rfp"` gets the
  cover page and section numbering, and that comes last — after references and pricing work.
- Review links show references and pricing read-only, with internal `notes` stripped.

---

## 6. Plans

Two new feature keys in `server/utils/plans.cjs`:

- `references` — bundled with `partners` (Premium / Small Teams and up). Same shape of feature,
  same tier.
- `pricing` — the RFP differentiator. Professional (writer track) and Large Teams / Companies
  (team track), since solo grant writers rarely bid cost proposals.

Add both to `FEATURE_LABELS`, gate the routes with `requireFeature`, and gate the nav items with
`has(...)` so they show the upgrade card rather than disappearing.

---

## 7. Build order

1. `Project.kind`, plus the label swaps. Small, unblocks the rest.
2. References: model, routes, `/app/references`, `type: "reference"`, merge + export, parser.
3. Pricing: models, routes, `/app/pricing`, `type: "pricing"`, merge + export, parser.
4. Plan gating and the upgrade copy for both.
5. Branded proposal document for `kind: "rfp"` — cover page, numbering, issuer ordering.

Steps 2 and 3 each stand on their own and are useful on grants too (grants ask for references
more than people expect, and every grant has a budget narrative).

---

## 8. Open questions

- Should a reference be shareable across workspaces on multi-workspace plans, or stay per
  workspace? (Partners are per workspace today; same answer probably applies.)
- Does pricing need per-project overrides of a rate-card line, or is quantity enough?
- Do we want to track RFP outcome (won/lost/no decision) on the project, so past pricing fills
  itself in from submitted proposals instead of being entered by hand?
