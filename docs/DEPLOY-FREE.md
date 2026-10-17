# Deploy PingPong for free

Total cost: **$0/month**. Three free services:

| Piece | Service | Free tier (Oct 2026) |
|---|---|---|
| Database | **MongoDB Atlas** — Free cluster | ~512 MB storage, shared, no time limit |
| Backend (FastAPI + WebSockets) | **Render** — Free web service | 750 instance-hours/month, sleeps after 15 min idle, ~1 min cold start. Since Feb 2026, WebSocket messages count as activity, so it stays awake during chats. |
| Frontend (Next.js) | **Vercel** — Hobby | Free for personal, non-commercial projects |

> The CPU bots work for free with their built-in scripted brain. Only `ANTHROPIC_API_KEY` (optional) costs money.

---

## 0. Push the code to GitHub

Render and Vercel deploy from a Git repo. Push this project to a GitHub repository you own (private is fine).

## 1. Database — MongoDB Atlas (5 min)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register> and create a **Free** cluster (pick a region near your users, e.g. Mumbai).
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add `0.0.0.0/0` (Render's free tier has no fixed IP; the password protects the DB).
4. **Connect → Drivers** → copy the connection string, e.g.
   `mongodb+srv://pingpong:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 2. Backend — Render (10 min)

1. Sign up at <https://render.com> with GitHub.
2. **New → Blueprint** → pick your repo. Render reads `render.yaml` and creates **pingpong-api** (Docker, free plan, health check `/ready`). A random `SECRET_KEY` is generated for you.
3. Fill in the variables it asks for:
   - `MONGODB_URL` — the Atlas string from step 1
   - `ALLOWED_ORIGINS` — your Vercel URL from step 3, e.g. `https://pingpong-yourname.vercel.app` (you can come back and set this after step 3)
   - `ADMIN_EMAILS` — your email, to get the moderation dashboard
   - `ANTHROPIC_API_KEY` — leave empty to stay free
4. Deploy. When it's live, open `https://pingpong-api.onrender.com/ready` — it should say `{"status":"ready"}`.

## 3. Frontend — Vercel (5 min)

1. Sign up at <https://vercel.com> with GitHub → **Add New → Project** → pick the repo.
2. **Root Directory**: `frontend`.
3. Environment variables:
   - `BACKEND_URL` = `https://pingpong-api.onrender.com`
   - `NEXT_PUBLIC_WS_URL` = `wss://pingpong-api.onrender.com/ws`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-project>.vercel.app`
4. Deploy. Then go back to Render and make sure `ALLOWED_ORIGINS` is exactly your Vercel URL (no trailing slash) and redeploy the backend.

## 4. Keep the backend awake (optional, still free)

Free Render services sleep after 15 minutes without traffic, and the first visitor then waits about a minute. One free service running 24/7 uses ~744 of the 750 free hours, so you can keep it awake:

- Create a free monitor at <https://uptimerobot.com> (or cron-job.org) that requests `https://pingpong-api.onrender.com/health` every 10 minutes.

## 5. Check it works

1. Open your Vercel URL, sign up with the email you put in `ADMIN_EMAILS`.
2. Press start — with nobody else online, the CPU steps in after ~12 seconds.
3. Open **Moderation** in the sidebar to see the admin dashboard.

---

## Things to know about free hosting

- **Restarts wipe live chats.** Matching and live sessions are in memory, so a Render restart or sleep ends ongoing chats (accounts, friends and DMs are in MongoDB and are safe). Users just press start again.
- **One backend instance only.** That's what the free tier gives you anyway, and the app is designed for it.
- **Vercel Hobby is non-commercial.** If you add ads or payments, move to Vercel Pro (or host the frontend's Docker image elsewhere).
- **Google sign-in** is optional: create an OAuth client in Google Cloud, add your Vercel URL as an authorised JavaScript origin, and set `GOOGLE_CLIENT_ID` (backend), `GOOGLE_CLIENT_SECRET` (backend) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend).

## Alternatives

- **Koyeb** free instance (512 MB, sleeps after 1 h idle, open WebSockets keep it awake) can replace Render — use the `backend/Dockerfile`. It may ask for a card for verification.
- **Everything on one VPS** with `docker compose up` (see the main README) once you outgrow free tiers — a $4–6/month VPS runs MongoDB, API and web comfortably.

Sources: [Render: free services stay active with WebSocket messages](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages) · [Render pricing notes](https://temps.sh/blog/render-pricing-2026) · [Koyeb scale-to-zero docs](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) · [MongoDB Atlas free cluster limits](https://mongodb.com/docs/atlas/reference/free-shared-limitations/) · [Vercel free tier limits](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
