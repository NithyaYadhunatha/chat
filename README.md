# ChatApp

A full-stack real-time chat application.

## Stack
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Zustand, Axios
- **Backend**: Python FastAPI, SQLAlchemy async, asyncpg
- **Database**: PostgreSQL
- **Real-time**: Native FastAPI WebSockets
- **Auth**: JWT (access token in memory + refresh token in httpOnly cookie)

---

## Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL running locally

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
copy .env.example .env
# Edit .env: set DATABASE_URL, SECRET_KEY

# Create database (PostgreSQL must be running)
# createdb chatapp

# Run the server (tables auto-created on startup)
uvicorn main:app --reload --port 8000
```

The API will be available at http://localhost:8000  
Interactive docs: http://localhost:8000/docs

---

## Frontend Setup

```bash
cd frontend

npm install
npm run dev
```

The app will be available at http://localhost:3000

---

## Environment Variables

### backend/.env
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/chatapp
SECRET_KEY=your-super-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_ORIGIN=http://localhost:3000
```

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

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
