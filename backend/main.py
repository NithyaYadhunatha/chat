from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routers import auth, users, friends, conversations, messages  # noqa: F401
from routers import reports, stranger  # noqa: F401
from websocket.handler import handle_websocket
from auth import decode_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle for the FastAPI application."""
    await init_db()
    yield

app = FastAPI(title="ChatApp API", version="2.0.0", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://chat-zeta-five-46.vercel.app",
        "https://chat-git-main-nithyas-projects-cac39a3b.vercel.app",
        "https://chat-iota-wine.vercel.app",
        "https://chat-nithyas-projects-cac39a3b.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers — friends chat
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(friends.router)
app.include_router(conversations.router)
app.include_router(messages.router)

# Include routers — stranger chat
app.include_router(reports.router)
app.include_router(stranger.router)



@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    user_id: str,
    websocket: WebSocket,
    token: str = Query(...),
):
    # Validate token
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or payload.get("sub") != user_id:
            await websocket.close(code=4001)
            return
    except HTTPException:
        await websocket.close(code=4001)
        return

    await handle_websocket(websocket, user_id)
