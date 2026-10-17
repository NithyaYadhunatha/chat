import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from bots.service import ensure_bot_users
from database import close_db, init_db, ping_db
from middleware import BodySizeLimitMiddleware, RequestContextMiddleware
from routers import admin, auth, conversations, friends, reports, stranger, users
from websocket.handler import websocket_endpoint
from websocket.manager import manager
from websocket.stranger import matching_loop

logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("pingpong")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if settings.BOTS_ENABLED:
        await ensure_bot_users()
    matcher = asyncio.create_task(matching_loop())
    log.info("PingPong API started (env=%s, ai_moderation=%s)", settings.ENV, settings.ai_moderation_enabled)
    yield
    matcher.cancel()
    with suppress(asyncio.CancelledError):
        await matcher
    # Tell connected clients we're going away so they reconnect to the new instance.
    await manager.close_all(code=1012)  # 1012 = service restart
    close_db()


app = FastAPI(
    title="PingPong API",
    version="3.1.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Order matters: the last added runs first.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.MAX_BODY_BYTES)
app.add_middleware(RequestContextMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Don't echo the submitted input back (it may contain passwords).
    errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    request_id = request.scope.get("state", {}).get("request_id", "-")
    log.exception("unhandled error id=%s %s %s", request_id, request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on our side.", "request_id": request_id}, status_code=500)


for r in (auth, users, friends, conversations, reports, stranger, admin):
    app.include_router(r.router)


@app.get("/health", include_in_schema=False)
async def health():
    """Liveness: the process is up."""
    return {"status": "ok"}


@app.get("/ready", include_in_schema=False)
async def ready():
    """Readiness: the database is reachable."""
    if await ping_db():
        return {"status": "ready"}
    return JSONResponse({"status": "database unavailable"}, status_code=503)


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket_endpoint(websocket)
