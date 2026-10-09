# Merge — development notes

Merge is a grant-proposal collaboration app: a React client (`client/`) and an Express + Prisma API (`server/`), deployed as two Vercel projects (`mergev1-78hi` for the client, `mergev1-backend1` for the API) from this repo's `main` branch.

## Run locally

```bash
# API (port 5050 — macOS uses 5000 for AirPlay)
cd server && npm install && cp .env.example .env   # fill in values
node index.cjs

# Client
cd client && npm install
echo "REACT_APP_API_URL=http://localhost:5050" > .env.development.local
npm start
```

Create a local Postgres database and apply migrations with `npx prisma migrate deploy` (or `psql -f` each `server/prisma/migrations/*/migration.sql` in order).

## Server environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon in production) |
| `JWT_SECRET` | yes | Signs session tokens (7-day expiry) |
| `GEMINI_API_KEY` | for AI reviewer | Google Gemini key |
| `APP_URL` | recommended | Public client URL used in invite and reset links (defaults to the production client) |
| `BREVO_API_KEY` | optional | Enables invitation and password-reset emails via Brevo. Without it, admins copy links from the Team page. |
| `EMAIL_FROM` | optional | Sender for those emails, e.g. `Merge <hello@yourdomain.com>` |

## Auth model

- **Sign up** creates a workspace (Company) and its first admin.
- **Invites** (admin → Team page) create an `Invitation` with a 7-day link; accepting it creates the user in that workspace with the chosen role.
- **Login** is email + password. Legacy usernames still work as the identifier.
- **Password reset**: self-service by email when Brevo is configured, or an admin generates a 2-hour link from the Team page.
- Roles: `admin`, `editor`, `approver`, `viewer`.

## Feature notes (added 2026-09-12)

- **Writing assistant** (`POST /api/ai/chat`): workspace-level chatbot (Gemini) that knows the organization profile (`Company.profile`), the partners directory, and the project the user has open. Conversation stored per user in `AssistantMessage`.
- **Organization profile**: Settings → Organization profile; "Draft from website" scrapes a page and asks Gemini to fill the fields.
- **Answer bank**: every saved answer is searchable (`GET /api/projects/answers/bank`); opening a question shows similar past answers (`GET /api/projects/questions/:id/similar`) with one-click reuse.
- **Partners** (`/api/partners`): directory of collaborators; the assistant recommends them for a grant.
- **Exports**: `GET /api/projects/:id/export/pdf|docx` builds the merged narrative with pdfkit / docx.
- **Grant calendar**: built-in month view of project deadlines, with Google Calendar and .ics export links.
- **File cabinet**: 4 MB per file (Vercel request bodies are capped at 4.5 MB); files carry a category and notes.

## Customer feedback (added 2026-09-15, simplified 2026-09-17)
- Every signed-in page has a green **Feedback** tab. Type, message, optional rating and screenshot. Nothing is stored: the API emails it to `FEEDBACK_NOTIFY` (default feedback@badjrtech.com) with the sender as reply-to and the screenshot attached. Requires Brevo.

## Stupid-proofing checklist (what a new deploy should always have)
Custom 404 · sitemap.xml · robots.txt · llms.txt · per-route titles and descriptions · Open Graph image · loading and error states on every fetch · compressed images with alt text · mobile breakpoints and hamburger nav · sticky mobile CTA · privacy and terms pages · cookie notice · contact email in footer · welcome page after signup · Vercel Web Analytics with private URLs masked · feedback widget that emails you · 4 MB upload cap enforced on both sides · plan gating checked on the server, never only in the UI.

## Unsubscribe (added 2026-10-06)

Reminder emails carry a one-click unsubscribe: a signed, single-purpose HMAC of email + list name
(`unsubscribeUrl` in `utils/email.cjs`), handled by `/api/unsubscribe` with both GET (a page for a
human) and POST (RFC 8058, what mail clients call). `List-Unsubscribe` and `List-Unsubscribe-Post`
headers go out whenever `sendEmail` is passed `unsubscribe: { email, list }`. Transactional mail —
password resets, invitations, approval decisions — must never pass it. The only list today is
`deadlines`, which flips `User.deadlineEmails`; the cron filters on that flag before sending. The
endpoint answers "Unsubscribed" for an address that does not exist, so it cannot be used to test
whether someone has an account.

## User notifications (added 2026-10-09)

**Assignment** — `notifyAssigned()` in `routes/projects.cjs` emails whoever a question is now
assigned to, from all four paths: creating a project with assignees, adding a question, changing
the assignee, and `PUT /api/projects/:id/assign-section`. That last one exists so assigning a whole
section is a single call and therefore a single email listing the questions, instead of one per
question. It never emails the person doing the assigning, never fires when the assignee has not
changed, and respects `User.assignmentEmails` (Settings → Profile, plus the `assignments`
unsubscribe list).

**Approval requested** — the approver is now emailed when someone asks for their approval. Before
this the request sat unseen until they happened to log in.

Already in place: welcome, invitation, password reset, "all answers are in" to the owner and
approvers, approval decision to the owner, review-link requests and responses, trial reminders,
and deadline reminders at 30/14/7/3/1 days and on the day.

## Owner notifications (added 2026-10-09)

Two emails go to you rather than to users, both to `SIGNUP_NOTIFY` (monthly report prefers
`OWNER_NOTIFY`), defaulting to dakotah@badjrtech.com:

- **Every signup** — workspace name, person, track, trial plan, referral code, and the running
  workspace count. `replyTo` is the new user, so replying reaches them. Fire-and-forget: a failure
  never blocks the signup, and the user still gets their welcome email.
- **Monthly report**, `/api/cron/monthly-report`, Vercel cron `0 14 1 * *`, covering the month that
  just ended: MRR and paying count, AI spend and actions, margin after AI, new workspaces split by
  track, trials ended and converted, totals, grants started, answers submitted, support tickets,
  AI by feature, and the five costliest workspaces. Numbers come from `utils/monthlyReport.cjs`.

There is no MRR history table, so the report states the current MRR rather than month-over-month
change.

## Per-feature AI limits (added 2026-10-06)

Team plans use a **shared pool sized by seats** (`monthPerSeat`), not a hard per-person cap, so a
few people doing the writing inside a large workspace are not starved. The rate is 75% of a
notional per-person allowance, since not everyone uses theirs, and a `perDayPerUser` burst guard
stops one account draining the month in an afternoon. Single-seat plans keep flat monthly numbers.

Extra AI reviewer runs are $1.99 (`extraPrice`); the price appears in every limit message, on the
pricing cards, and in the Settings usage card. Nothing charges for them yet.

Admins see their allowances and usage in Settings (`AiUsageCard`, from `GET /api/ai/usage`).
Staff see total AI spend, margin after AI, spend by feature and the costliest workspaces on the
staff overview, priced from `utils/aicost.cjs` — measured token counts at Gemini 2.5 Flash rates.
That is an estimate from our own counts, not a Google invoice.


`AI_LIMITS` in `utils/plans.cjs` sets a separate limit per feature per plan; `checkAi(req, feature,
{projectId})` in `routes/ai.cjs` enforces it and `recordAi` logs one `AiUsage` row per action.
Windows: `month` / `monthPerSeat`, `perDay`, `perDayPerProject`, `everyDays`, `once`. Staff and
comped workspaces are unmetered; `AI_MONTHLY_CAP` overrides monthly limits. `GET /api/ai/usage`
reports each feature with what's used and when it next resets.

Grant writer track is final; the organization track holds placeholders pending a decision.
`extraPrice: 1.99` on the Premium reviewer is **surfaced in the error but not yet chargeable** —
buying an extra run needs a Stripe one-off (invoice item on the subscription, or Checkout).

Note: profile import is deliberately NOT behind `requireFeature('assistant')`, because the Free
plan may run it once.

## AI allowances and brevity (added 2026-10-06)

One monthly allowance per workspace, set by plan in `plans.cjs` (`limits.aiMonthly`, or `aiPerSeat`
on per-person plans; `aiAllowance(plan, seats)` resolves it). Chat messages, drafts, and AI reviews
all count against it — the reviewer used to be uncapped and is the most expensive call. Staff and
comped workspaces are unmetered; `AI_MONTHLY_CAP` still overrides everything if set.
`GET /api/ai/usage` returns cap, used and left. Allowances: Premium 1,000 · Professional 5,000 ·
Solo Writer 750 · Small and Large Teams 400/seat · Companies 500/seat. At ~$0.003 a call, worst-case
cost runs about 4-5% of revenue at every size.

Chat replies are capped at 600 output tokens and the system prompt forbids preamble, "why this
works" explanations and closing offers; history sent back to Gemini is 10 turns, down from 16.
Drafts are capped to their question's limit plus slack.

## Help me answer this (added 2026-10-05)

`POST /api/ai/draft` streams a first-draft answer for one question (SSE, same shape as the chat).
The prompt carries the organization profile, the project name and description, the other questions
in the application, the partners directory, the question's limit, and the three closest past
answers from the answer bank, so the draft uses the workspace's own facts and voice. It is told
never to invent numbers or names and to leave `[bracketed]` placeholders instead. Each draft counts
against `AI_MONTHLY_CAP` like a chat message. The button (`client/src/components/DraftAnswer.js`)
appears on My tasks and the project page for anyone who can answer, is hidden without the
`assistant` feature, says "Help me improve this" when there is already a draft, and can be stopped
mid-write. Nothing is saved until the writer saves it.

## Seat billing on per-person plans (added 2026-10-03)

A seat is charged from the day it is added and paid for through the end of the billing period in
which it is removed. `syncSeats` therefore only ever raises the Stripe quantity mid-period (with
prorations); it never lowers it. The drop happens at renewal: the `invoice.paid` webhook with
`billing_reason: 'subscription_cycle'` calls `applySeatsAtRenewal`, which sets the quantity to the
seats actually in use with `proration_behavior: 'none'`. `GET /api/billing/status` returns
`billedSeats` alongside `seats` so the Team page and Settings can explain the gap, the removal
confirmation says the seat stays on the bill until the period ends, and the terms say the same.
Re-adding someone into a seat you are still paying for costs nothing extra.

**Stripe dashboard:** the webhook endpoint must have `invoice.paid` (or `invoice.payment_succeeded`)
enabled, or removed seats will keep billing after renewal.

## Deadline reminders (added 2026-10-02)

A second daily Vercel cron (`/api/cron/deadline-reminders`, same `CRON_SECRET`) emails the project
owner and anyone holding an unsubmitted question at 30, 14, 7, 3, and 1 days before a project's due
date, and on the day itself. Each email says how many answers are still open and lists the
recipient's own. `Project.deadlineReminderDay` records the tightest milestone already sent so a
project never repeats one; wording uses the real day count, so a project 2 days out says "2 days".
Completed, archived, removed, and overdue projects are skipped. Users opt out with
`User.deadlineEmails` (Settings → Profile).

## RFP phase (planned)

See [docs/rfp-phase.md](docs/rfp-phase.md) — project kind, references directory, pricing
references and rate card, two new question types, and the branded proposal document. Not built.
