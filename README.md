# ChatApp

A full-stack real-time chat application.

## Stack
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Zustand, Axios
- **Backend**: Python FastAPI, Beanie/Motor (async)
- **Database**: MongoDB
- **Real-time**: Native FastAPI WebSockets
- **Auth**: JWT (email/password + Google sign-in)

---

## Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB running locally (or a MongoDB Atlas URI)
- A Google OAuth client ID/secret (for Google sign-in)

---

## Quick Start (two terminals)

1. Start MongoDB (local `mongod`, or use an Atlas URI in `MONGODB_URL`).
2. Terminal 1 - backend: follow **Backend Setup** below (runs on :8000).
3. Terminal 2 - frontend: follow **Frontend Setup** below (runs on :3000).
4. Open http://localhost:3000, register or sign in with Google, then add a friend or try Stranger chat.

## Google Sign-in Setup
1. In Google Cloud Console, create an OAuth 2.0 Client ID (type: Web application).
2. Add `http://localhost:3000` to Authorized JavaScript origins.
3. Put the client ID in both `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env.local` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`), and the secret in `backend/.env` (`GOOGLE_CLIENT_SECRET`).

---

## Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Copy env file and configure
copy .env.example .env      # Linux/Mac: cp .env.example .env
# Edit .env: set MONGODB_URL, SECRET_KEY, GOOGLE_CLIENT_ID/SECRET

# Run the server
uvicorn main:app --reload --port 8000
```

The API will be available at http://localhost:8000  
Interactive docs: http://localhost:8000/docs

---

## Frontend Setup

```bash
cd frontend

npm install
copy .env.example .env.local   # Linux/Mac: cp ...; then fill in values
npm run dev
```

The app will be available at http://localhost:3000

---

## Environment Variables

### backend/.env
See `backend/.env.example`. Never commit the real `.env`.

### frontend/.env.local
See `frontend/.env.example`.

---

## Deployment notes
- Frontend: deploy `frontend/` to Vercel; set the three `NEXT_PUBLIC_*` variables. Use `wss://` for `NEXT_PUBLIC_WS_URL` in production.
- Backend: any host that runs `uvicorn main:app --host 0.0.0.0 --port $PORT` (Python 3.11, see `runtime.txt`).
- Add your deployed frontend URL to the `allow_origins` list in `backend/main.py` and set `FRONTEND_ORIGIN`.

---

## Features
- 🔐 JWT auth with access + refresh token rotation
- 💬 Real-time messaging via WebSockets
- 👥 Friend system (request / accept / reject)
- 🟢 Live presence (online/offline status)
- ✍️ Typing indicators with 1.5s debounce
- ✅ Read receipts
- 📜 Infinite scroll message history (cursor-based)
- 🌙 Dark theme UI with indigo accent
- 📱 Mobile responsive (bottom nav on small screens)
