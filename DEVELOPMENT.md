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

## Customer feedback (added 2026-09-15)
- Every signed-in page has a green **Feedback** tab on the right edge. Type (bug / idea / question / praise), message, optional 1–5 rating and screenshot. The current page path and user agent are recorded.
- Stored in `Feedback`. Each submission emails `FEEDBACK_NOTIFY` (defaults to `FEEDBACK_ADMINS`).
- Staff inbox at `/app/feedback-inbox` for accounts whose email is listed in `FEEDBACK_ADMINS` (comma-separated). Filter by status/type/search, open to see screenshot, set status (new → seen → planned → done / closed), keep internal notes, reply by email.

## Stupid-proofing checklist (what a new deploy should always have)
Custom 404 · sitemap.xml · robots.txt · llms.txt · per-route titles and descriptions · Open Graph image · loading and error states on every fetch · compressed images with alt text · mobile breakpoints and hamburger nav · sticky mobile CTA · privacy and terms pages · cookie notice · contact email in footer · welcome page after signup · Vercel Web Analytics with private URLs masked · feedback widget + inbox · 4 MB upload cap enforced on both sides · plan gating checked on the server, never only in the UI.
