# PingPong

*Text strangers. Keep the rally going.* Anonymous one-on-one **text** chat with random adults — Omegle without the camera, built so it stays adults-only and non-sexual.

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind, Zustand. Arcade design — a homage to the 1972 Pong cabinet: black screen, white blocks, a dashed net, pixel score digits (Press Start 2P) and IBM Plex Mono. Player 2 on the left with a white paddle, you on the right with a yellow one.
- **Backend:** FastAPI, Beanie/Motor, MongoDB, native WebSockets
- **Moderation:** context-aware pattern filter + optional Claude conversation monitor + human review queue

**Live:** <https://chat-sage-ten.vercel.app> · API: <https://veil-ffjk.onrender.com> (`/health`, `/ready`)

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
| Chats (friends & DMs) | One **Chats** tab holds friend requests, add-by-username, conversations and friends you haven't messaged yet. 1:1 messages with read receipts and presence. Only friends can message each other. Settings open from your username |
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

## Project layout

```
backend/            FastAPI app
  main.py           app, CORS, /health, /ready, /ws, background matcher
  config.py         all settings (env vars) + production guardrails
  database.py       MongoDB (Motor/Beanie) or in-memory for demos
  auth.py           JWT access tokens, refresh rotation, replay detection
  moderation/       normalise -> rules -> engine -> enforcement, AI monitor, trust
  matching/         matchmaker, live sessions, conversation starters
  bots/             CPU personas and brain
  websocket/        socket handler, connection manager, stranger chat
  routers/          auth, users, friends, conversations, reports, stranger, admin
  tests/            pytest suite (in-memory Mongo)
frontend/           Next.js 14 app
  app/              landing, rules, login/register, chat, messages, settings, admin
  components/       app shell, chat message + composer, report dialog, UI kit
  lib/              API client (silent refresh), session, socket, stores
docs/               free deploy guide, competitor research
render.yaml         Render blueprint for the API
docker-compose.yml  MongoDB + API + web on one box
```

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

### Backend (`backend/.env`, or the Render dashboard)

| Variable | Default | Purpose |
|---|---|---|
| `ENV` | `development` | `production` turns on secure cookies, HSTS, hides `/docs`, and enforces the guardrails below |
| `MONGODB_URL` | `mongodb://localhost:27017` | Atlas: the exact `mongodb+srv://…` string from **Connect → Drivers** |
| `DB_NAME` | `chatapp` | Database name (`pingpong` in production) |
| `USE_INMEMORY_DB` | `false` | `true` = throwaway in-memory DB for demos. Not allowed in production |
| `SECRET_KEY` | — | **Required**, 32+ random chars: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `14` | Refresh cookie lifetime |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated frontend origins, no trailing slash. Used for CORS **and** the WebSocket Origin check |
| `TRUST_PROXY` | `false` | Honour `X-Forwarded-For` for rate limits. `true` on Render |
| `ADMIN_EMAILS` | — | Comma-separated emails that get the moderation dashboard on sign-in |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Optional Google sign-in |
| `ANTHROPIC_API_KEY` | — | Optional. Enables the AI conversation monitor and Claude-powered CPU bots |
| `MODERATION_MODEL` | `claude-opus-5-5` | Model for the monitor; `claude-haiku-5-5` is cheaper |
| `AI_MODERATION_INTERVAL_SECONDS` | `6` | Minimum gap between AI checks per chat |
| `BOTS_ENABLED` | `true` | CPU opponents on/off |
| `BOT_AFTER_SECONDS` | `12` | How long someone waits before the CPU is offered |
| `BOT_MODEL` | `claude-opus-5-5` | Used only when `ANTHROPIC_API_KEY` is set |
| `LOG_LEVEL` | `INFO` | Logging level |
| `MAX_BODY_BYTES` | `65536` | Request body cap |

With `ENV=production` the API **refuses to start** if `USE_INMEMORY_DB=true`, `SECRET_KEY` looks like a placeholder, or any `ALLOWED_ORIGINS` entry isn't `https://`. The log line says which one.

### Frontend (`frontend/.env.local`, or Vercel → Settings → Environment Variables)

| Variable | Example (production) | Purpose |
|---|---|---|
| `BACKEND_URL` | `https://veil-ffjk.onrender.com` | Where the `/api` proxy sends requests (server-side only) |
| `NEXT_PUBLIC_WS_URL` | `wss://veil-ffjk.onrender.com/ws` | WebSocket the browser connects to. Must be `wss://` or the build fails |
| `NEXT_PUBLIC_SITE_URL` | `https://chat-sage-ten.vercel.app` | Canonical URL for metadata, HSTS and CSP |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | — | Optional; shows "Continue with Google" |

These are read **at build time**, so redeploy on Vercel after changing any of them.

## Deploying

Everything fails closed: the API refuses to start with `ENV=production` and an in-memory DB, a placeholder secret, or non-https origins, and the frontend build fails if `NEXT_PUBLIC_WS_URL` isn't `wss://`.

### Option A — one box with Docker
```bash
SECRET_KEY=$(openssl rand -hex 32) docker compose up --build
```
Runs MongoDB, the API and the web app (http://localhost:3000). For the public internet, put a TLS reverse proxy (Caddy, Nginx, Traefik) in front, then set `ENV=production`, `ALLOWED_ORIGINS=https://your.domain` and build the frontend with `NEXT_PUBLIC_WS_URL=wss://your.domain/ws` and `NEXT_PUBLIC_SITE_URL=https://your.domain`.

### Option B — managed services
1. **Database:** a MongoDB Atlas cluster → copy the connection string.
2. **API on Render:** "New → Blueprint" with this repo; `render.yaml` creates `pingpong-api` (Docker, health check on `/ready`, generated `SECRET_KEY`). Fill in `MONGODB_URL`, `ALLOWED_ORIGINS` (your Vercel URL), `ADMIN_EMAILS`, optionally `ANTHROPIC_API_KEY`.
3. **Web on Vercel:** import the repo with root directory `frontend`, and set
   `BACKEND_URL=https://pingpong-api.onrender.com`, `NEXT_PUBLIC_WS_URL=wss://pingpong-api.onrender.com/ws`, `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`.

### Current production setup

| Piece | Where | Notes |
|---|---|---|
| Web | Vercel → <https://chat-sage-ten.vercel.app> | Root directory `frontend`, deploys from `main` |
| API | Render web service `veil` → <https://veil-ffjk.onrender.com> | Root directory `backend`, Python runtime, start command `uvicorn main:app --host 0.0.0.0 --port 10000`, free plan, one instance |
| Database | MongoDB Atlas free cluster | Network Access allows `0.0.0.0/0` |
| Google sign-in | Google Cloud OAuth client | Authorized JavaScript origin: `https://chat-sage-ten.vercel.app` |

The three must agree: the Vercel URL goes in `NEXT_PUBLIC_SITE_URL`, in the API's `ALLOWED_ORIGINS`, and in Google's authorized origins.

Use the **production** Vercel domain, not a branch preview URL (`chat-git-<branch>-….vercel.app`). Previews sit behind Vercel login, so nobody else can open them, and their address changes with the branch.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Render deploy fails with `ConfigurationError: The DNS query name does not exist: _mongodb._tcp.…` | `MONGODB_URL` points at a cluster host that doesn't exist (typo, partial paste, deleted cluster) | Re-copy the string from Atlas → Connect → Drivers, paste without quotes or spaces, URL-encode special characters in the password. Check with `nslookup -type=SRV _mongodb._tcp.<cluster-host>` |
| Render deploy fails with `ServerSelectionTimeoutError` | Atlas is blocking Render's IP, or the DB user/password is wrong | Atlas → Network Access → add `0.0.0.0/0`; check the database user |
| Render deploy fails with `Unsafe production config: …` | A production guardrail tripped | Fix the setting named in the message (secret, https origins, in-memory DB) |
| Sign-up shows **"Request failed"** | Vercel's `/api` proxy can't reach the API — usually `BACKEND_URL` missing, or set after the last build | Set `BACKEND_URL` on Vercel and **redeploy** |
| Signed in, but chat never connects | API's `ALLOWED_ORIGINS` doesn't contain the exact site origin, or `NEXT_PUBLIC_WS_URL` is wrong | `ALLOWED_ORIGINS=https://chat-sage-ten.vercel.app` (no trailing slash), `NEXT_PUBLIC_WS_URL=wss://veil-ffjk.onrender.com/ws`, redeploy both |
| Google: **Error 400: origin_mismatch** | The site's URL isn't an authorized JavaScript origin | Google Cloud Console → Credentials → OAuth client → add the Vercel URL. Takes a few minutes to apply |
| First request takes ~1 minute | Render free instance was asleep | Normal on the free plan; a free uptime monitor hitting `/health` every 10 minutes keeps it awake |
| Live chats end after a deploy | Matching and live sessions are in memory | Expected; accounts, friends and DMs are in MongoDB and survive |

Quick checks: `https://veil-ffjk.onrender.com/ready` should return `{"status":"ready"}`, and `https://chat-sage-ten.vercel.app/api/ready` should return the same through the proxy.

### Notes
- Matchmaking, live sessions and rate limits are in-process: run **exactly one** API instance (the blueprint pins `numInstances: 1`). Moving that state to Redis is the step before scaling out.
- `/health` is liveness, `/ready` checks MongoDB. Every response carries an `X-Request-ID`, which also appears in logs and in 500 responses.
- Request bodies are capped at 64 KB (`MAX_BODY_BYTES`), WebSocket frames at 16 KB.
- CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend lint, type-check and production build on every push and PR.
