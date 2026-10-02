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

## 3a. Addenda

Issuers amend an RFP after it goes out: a new due date, extra questions, an answer to someone
else's question that changes what you write. Today Merge has no idea this happened — the project
keeps the original deadline and the original question list, and whoever saw the email has to
remember to tell everyone. This is the most common way a bid gets disqualified.

```prisma
model Addendum {
  id          String   @id @default(cuid())
  projectId   String
  number      String?               // "Addendum 3", as the issuer labels it
  summary     String                // what changed, in a sentence
  issuedAt    DateTime?
  fileId      String?               // the PDF, in the file cabinet
  newDeadline DateTime?             // set when the addendum moves the due date
  source      String   @default("upload") // upload | email | manual
  createdById String?
  acknowledgedAt DateTime?
  createdAt   DateTime @default(now())
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  file        File?    @relation(fields: [fileId], references: [id], onDelete: SetNull)

  @@index([projectId])
}
```

**On the project page** — an *Addenda* tab next to Questions, numbered, newest first, each with its
summary, date, and the attached document. A count badge appears when any addendum is unacknowledged.

**Moving the deadline.** When an addendum carries `newDeadline`, Merge updates
`Project.deadlineDate`, keeps the old one in the addendum record so the history is visible, resets
`deadlineReminderDay` to null so the reminder milestones recalculate against the new date, and emails
everyone on the project: *"The deadline for X moved from A to B (Addendum 3)."* The deadline change
is the single highest-value piece of this.

**Getting them in.** Three ways, cheapest first:

1. **Upload** — drag the PDF into the Addenda tab, type one line about what changed, optionally set
   a new due date. Works day one, no infrastructure.
2. **Email in** — every project gets an address like `addenda+<token>@mergeworkspace.com`. Forward
   the issuer's email and Merge files the attachment, records the body as the summary, and flags it
   for review. Needs inbound email (Brevo and Postmark both do inbound webhooks; the token in the
   address is the auth, and anything from an unknown sender is held for confirmation rather than
   trusted).
3. **Read it** — once an addendum is in, Gemini extracts the proposed new deadline and any new
   questions and offers them as suggestions the owner accepts or rejects. Never applied silently:
   an AI misreading a date and moving a real deadline is worse than not having the feature.

New questions arriving by addendum get added as normal questions, tagged to the addendum so it is
clear they came late and may need assigning.

**Acknowledgement** — the owner marks an addendum read, which is what RFPs usually require you to
confirm in the response ("Bidder acknowledges Addenda 1–4"). The merged document can then print
that list automatically.

Build order: upload first (step 1 above, a day or two including the deadline move and the email),
email-in second, extraction last.

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
2. Addenda by upload, including the deadline move and the notification email.
3. References: model, routes, `/app/references`, `type: "reference"`, merge + export, parser.
4. Pricing: models, routes, `/app/pricing`, `type: "pricing"`, merge + export, parser.
5. Plan gating and the upgrade copy for references and pricing.
6. Addenda by email, then AI extraction of dates and new questions.
7. Branded proposal document for `kind: "rfp"` — cover page, numbering, issuer ordering.

Steps 3 and 4 each stand on their own and are useful on grants too (grants ask for references
more than people expect, and every grant has a budget narrative).

---

## 8. Open questions

- Should a reference be shareable across workspaces on multi-workspace plans, or stay per
  workspace? (Partners are per workspace today; same answer probably applies.)
- Does pricing need per-project overrides of a rate-card line, or is quantity enough?
- Should addenda apply to grants too? Funders amend guidelines less often, but they do it, and the
  deadline-move machinery is identical — probably yes, with the tab hidden until one exists.
- Do we want to track RFP outcome (won/lost/no decision) on the project, so past pricing fills
  itself in from submitted proposals instead of being entered by hand?
