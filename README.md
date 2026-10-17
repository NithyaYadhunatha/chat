# PingPong

*Text strangers. Keep the rally going.* Anonymous one-on-one **text** chat with random adults — Omegle without the camera, built so it stays adults-only and non-sexual.

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind, Zustand. Arcade design — a homage to the 1972 Pong cabinet: black screen, white blocks, a dashed net, pixel score digits (Press Start 2P) and IBM Plex Mono. Player 2 on the left with a white paddle, you on the right with a yellow one.
- **Backend:** FastAPI, Beanie/Motor, MongoDB, native WebSockets
- **Moderation:** context-aware pattern filter + optional Claude conversation monitor + human review queue

- **Deploy for free:** [`docs/DEPLOY-FREE.md`](docs/DEPLOY-FREE.md) (Vercel + Render + MongoDB Atlas)
- **Competitor research:** [`docs/competitor-research.md`](docs/competitor-research.md)

## What it does

| Area | Details |
|---|---|
| Stranger chat | Random matching with optional shared interests, typing indicator, `Esc Esc` to skip, End match, mutual "Add friend" that reveals usernames only if both press it |
| Messaging features | WhatsApp/iMessage-style in both stranger chat and DMs: reply to a specific message (tap the quote to jump to it), emoji reactions, emoji picker, edit within 15 minutes (re-moderated), unsend for everyone, copy, sent/seen receipts, long-press actions on mobile. Unsent and edited messages keep their originals privately so reports still show what was said. No photos, voice notes or link previews — those are the main abuse vectors on anonymous apps |
| Serves | Every match opens with a shared conversation starter; either player can serve a new one |
| Rally scoreboard | Rally count (each time the ball changes sides), match clock, match-over card with stats, downloadable log |
| Private ratings | "Good rally?" after a match. Never shown to anyone; players many strangers rate badly are matched mostly with each other (a low-trust pool) instead of being publicly shamed or banned |
| CPU opponents | When it's quiet, a clearly-labelled AI practice bot ("the CPU") plays you after ~12 s, or right away via "Play the CPU". Five personas; free scripted brain, or Claude when `ANTHROPIC_API_KEY` is set. Always honest about being a bot, filtered like humans, never counted as "online", can't be befriended |
| Bot defence | The same long message pasted into many chats is stopped, and struck at bot-level volume |
| Friends & DMs | Friend list, requests, 1:1 messages with read receipts and presence. Only friends can message each other |
| Age gate | Date of birth at sign-up (18+), onboarding for Google accounts; anyone who says they're under 18 is pulled out of stranger chat until a moderator checks |
| Content filter | Normalises evasions (l33t, Cyrillic look-alikes, zero-width chars, `s e x`, `seeexxx`) then scores sexual content, grooming, minors, hate, harassment, threats, self-harm, contact/PII/links, scams |
| Context rules | Sexual remarks escalate (warn → block → end chat). Anything sexual towards someone who said they're a minor, or CSAM terms, suspends the account. Asking for a Snapchat after sexual talk ends the chat |
| AI monitor (optional) | With `ANTHROPIC_API_KEY` set, recent conversation windows are classified by Claude in the background (grooming, escalation, minors) — no added latency |
| Enforcement | Strike points with decay → 1h / 24h / 7d / permanent chat bans; suspensions revoke all sessions and block re-registration with the same email |
| Reports | Stranger reports reference the chat session; the **server** attaches the transcript (can't be forged), optional block. 3 reporters in 24h → temporary ban; 2 "looks under 18" reports → age check |
| Moderation dashboard | `/admin` for moderators: prioritised report queue with evidence, user lookup, actions (warn, bans, suspend, confirm 18+), audit log |
| Privacy | Strangers never see identity. Stranger messages aren't stored; the last part of a chat is kept in memory for 15 minutes for reporting |
| Self-harm support | Messages expressing risk get crisis resources (Tele-MANAS 14416, KIRAN, 988, findahelpline.com) |

### Security
- Short-lived access token kept **in memory only**; refresh token in an **httpOnly, SameSite cookie**, rotated on every use with **replay detection** (reusing an old token kills the whole session family)
- The browser talks to the API through Next.js `/api` rewrites, so cookies stay first-party
- WebSocket auth in the first frame (token never in a URL), Origin check, frame size cap, one socket per user
- PyJWT (replacing python-jose), bcrypt, constant-time login, per-email lockout, rate limits on login/sign-up/messages/reports/friend requests/skips
- CSRF header on cookie endpoints, regex-safe user search, strict CSP and security headers on both apps, `/docs` hidden in production
- Partner user IDs never cross the wire in stranger chat

---

## Run it locally

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env           # macOS/Linux: cp .env.example .env
```
Edit `.env`: set `SECRET_KEY` (`python -c "import secrets; print(secrets.token_hex(32))"`), point `MONGODB_URL` at MongoDB **or** set `USE_INMEMORY_DB=true` for a throwaway demo, and put your email in `ADMIN_EMAILS` to get the moderation dashboard.

```bash
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
copy .env.example .env.local     # macOS/Linux: cp ...
npm run dev
```
Open http://localhost:3000.

### Tests
```bash
cd backend
python -m pytest
```
Covers the filter (evasions + false positives), escalation/grooming logic, matchmaking, auth rotation/replay, lockout, WebSocket matching, blocking, minor detection, suspensions, reports with server-side evidence, admin actions, mutual connect, DM restrictions and the AI-monitor enforcement path (mocked).

---

## Configuration

`backend/.env` — see `backend/.env.example`:

| Variable | Purpose |
|---|---|
| `ENV` | `production` turns on secure cookies, HSTS, hides `/docs` |
| `SECRET_KEY` | 32+ chars, required |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins (CORS + WebSocket Origin check) |
| `TRUST_PROXY` | Honour `X-Forwarded-For` for rate limits — only behind your own proxy |
| `ADMIN_EMAILS` | Accounts that become admins on sign-in |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `ANTHROPIC_API_KEY` | Optional AI conversation monitor |
| `MODERATION_MODEL` | Defaults to `claude-opus-5-5`; a cheaper model (e.g. `claude-haiku-5-5`) works if cost matters |

`frontend/.env.local` — `BACKEND_URL` (server-side proxy target), `NEXT_PUBLIC_WS_URL` (`wss://…/ws` in production), optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## Deploying

Everything fails closed: the API refuses to start with `ENV=production` and an in-memory DB, a placeholder secret, or non-https origins, and the frontend build fails if `NEXT_PUBLIC_WS_URL` isn't `wss://`.

### Option A — one box with Docker
```bash
SECRET_KEY=$(openssl rand -hex 32) docker compose up --build
```
Runs MongoDB, the API and the web app (http://localhost:3000). For the public internet, put a TLS reverse proxy (Caddy, Nginx, Traefik) in front, then set `ENV=production`, `ALLOWED_ORIGINS=https://your.domain` and build the frontend with `NEXT_PUBLIC_WS_URL=wss://your.domain/ws` and `NEXT_PUBLIC_SITE_URL=https://your.domain`.

### Option B — managed services
1. **Database:** a MongoDB Atlas cluster → copy the connection string.
2. **API on Render:** "New → Blueprint" with this repo; `render.yaml` creates `PingPong-api` (Docker, health check on `/ready`, generated `SECRET_KEY`). Fill in `MONGODB_URL`, `ALLOWED_ORIGINS` (your Vercel URL), `ADMIN_EMAILS`, optionally `ANTHROPIC_API_KEY`.
3. **Web on Vercel:** import the repo with root directory `frontend`, and set
   `BACKEND_URL=https://PingPong-api.onrender.com`, `NEXT_PUBLIC_WS_URL=wss://PingPong-api.onrender.com/ws`, `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`.

### Notes
- Matchmaking, live sessions and rate limits are in-process: run **exactly one** API instance (the blueprint pins `numInstances: 1`). Moving that state to Redis is the step before scaling out.
- `/health` is liveness, `/ready` checks MongoDB. Every response carries an `X-Request-ID`, which also appears in logs and in 500 responses.
- Request bodies are capped at 64 KB (`MAX_BODY_BYTES`), WebSocket frames at 16 KB.
- CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend lint, type-check and production build on every push and PR.
