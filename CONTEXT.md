# Project: ChatApp

## Stack snapshot
- Frontend: Next.js 14 (App Router), Tailwind CSS, Zustand, Axios, date-fns
- Backend: Python FastAPI, Motor (async MongoDB driver), Beanie ODM
- Database: MongoDB 8.2 (no SQLAlchemy, no Alembic, no PostgreSQL)
- Real-time: Native FastAPI WebSockets (single connection, mode-routed)
- Auth: JWT access token (in Zustand memory + window.__access_token) + refresh token (httpOnly cookie)

## Current state
- [x] MongoDB migration: COMPLETE — all Beanie documents, all routers migrated, E2E tested
- [x] Stranger chat merge: COMPLETE — backend + frontend fully implemented and integrated

## File map
CONTEXT.md — single source of truth
README.md — setup and run instructions

backend/requirements.txt — Python deps: fastapi, uvicorn, motor, beanie, pymongo, bcrypt, python-jose, pydantic-settings
backend/.env — MONGODB_URL, DB_NAME, SECRET_KEY, etc.
backend/config.py — Pydantic Settings with MONGODB_URL + DB_NAME
backend/database.py — Motor + Beanie init_db() with all 8 document models
backend/models.py — Beanie Documents: User, Friendship, Conversation, ConversationMember, Message, ChatSession, Report, BannedPhrase + embedded types
backend/schemas.py — Pydantic schemas with ObjectId→str coercion validators
backend/auth.py — bcrypt (direct, no passlib), JWT create/decode, get_current_user
backend/main.py — FastAPI app: CORS, all routers, WS endpoint, lifespan init_db
backend/routers/auth.py — POST /auth/register /login /refresh /logout
backend/routers/users.py — GET/PATCH /users/me, GET /users/search
backend/routers/friends.py — POST /friends/request /accept /reject; GET /friends /friends/pending
backend/routers/conversations.py — POST /conversations, GET /conversations
backend/routers/messages.py — GET/POST /conversations/{id}/messages
backend/routers/reports.py — POST /reports (stranger chat reports)
backend/routers/stranger.py — GET /stranger/status (queue depth + online count)
backend/websocket/manager.py — ConnectionManager: per-user WS dict
backend/websocket/handler.py — Routes by mode field: friends handler + stranger handler
backend/matching/queue.py — asyncio-safe in-memory FIFO match queue
backend/matching/manager.py — MatchManager: active session tracking + MongoDB persistence
backend/moderation/patterns.py — Regex banned pattern list with severity levels
backend/moderation/filter.py — check_message(), is_spam() content filter
backend/moderation/strikes.py — add_strike() with escalating bans, check_ban_status()

frontend/.env.local — NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL
frontend/lib/store.ts — Zustand store: all IDs as string (MongoDB ObjectID); friends slice + stranger slice
frontend/hooks/useWebSocket.ts — WS hook routed by mode; exposes joinQueue/leaveQueue/sendStrangerMessage/findNext
frontend/hooks/useMessages.ts — cursor-based infinite scroll (string cursor IDs)
frontend/app/(app)/stranger/page.tsx — Stranger chat page: IDLE/WAITING/CHATTING states, violet theme
frontend/components/sidebar/Sidebar.tsx — Sidebar with stranger section (live state badge) + mobile nav

## Last change
Full MongoDB migration + stranger chat feature merge implemented and E2E tested.
All 17 API endpoints return 2xx. Backend module imports clean.

## Decisions made
- passlib replaced by direct bcrypt calls — passlib 1.7.4 is broken with bcrypt 5.0+
- ObjectId→str coercion via field_validator(mode="before") in all Pydantic response schemas
- Stranger chat messages are in-memory only (ChatSession records metadata to MongoDB)
- Content filter: low severity → warn (message still delivered); medium/high → strike + block
- Strike escalation: 1=warn, 2=1h ban, 3+=24h ban per violation cycle
- Stranger WS events use mode:"stranger" field; friends events use mode:"friends"
- Sidebar: stranger section at bottom, violet accent to distinguish from friends (indigo)
