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
| `RESEND_API_KEY` | optional | Enables invitation and password-reset emails via Resend. Without it, admins copy links from the Team page. |
| `EMAIL_FROM` | optional | Sender for those emails, e.g. `Merge <hello@yourdomain.com>` |

## Auth model

- **Sign up** creates a workspace (Company) and its first admin.
- **Invites** (admin → Team page) create an `Invitation` with a 7-day link; accepting it creates the user in that workspace with the chosen role.
- **Login** is email + password. Legacy usernames still work as the identifier.
- **Password reset**: self-service by email when Resend is configured, or an admin generates a 2-hour link from the Team page.
- Roles: `admin`, `editor`, `approver`, `viewer`.
