"""
Authentication.

Access tokens are short-lived and kept in memory by the frontend. Refresh
tokens live in an httpOnly cookie (JavaScript can't read them), rotate on every
use, and replaying an old one revokes the whole session family.
"""
import re
import secrets
from datetime import datetime, time, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Cookie, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from beanie.operators import Or

from auth import (
    age_on, client_ip, create_access_token, hash_password, identity_hash, issue_refresh_token,
    revoke_refresh_token, rotate_refresh_token, verify_password,
)
from config import settings
from models import BannedIdentity, Role, User
from moderation.engine import check_profile_text
from ratelimit import limiter
from schemas import GoogleAuthRequest, LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "rt"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE, token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True, secure=settings.is_production, samesite="lax", path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path="/", httponly=True, secure=settings.is_production, samesite="lax")


async def _session_response(user: User, response: Response) -> dict:
    _set_refresh_cookie(response, await issue_refresh_token(user))
    return {"access_token": create_access_token(user), "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


def _require_xhr(x_requested_with: Optional[str]) -> None:
    # Cookie-authenticated endpoints need a custom header, which a cross-site
    # form post can't add. Cheap CSRF protection on top of SameSite=Lax.
    if x_requested_with != "fetch":
        raise HTTPException(status_code=403, detail="Missing request header")


async def _is_banned_identity(*values: Optional[str]) -> bool:
    hashes = [identity_hash(v) for v in values if v]
    return bool(hashes) and await BannedIdentity.find({"identity_hash": {"$in": hashes}}).count() > 0


def _apply_admin_role(user: User) -> bool:
    if user.email.lower() in settings.admin_emails and user.role != Role.admin:
        user.role = Role.admin
        return True
    return False


def _to_datetime(d) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, request: Request, response: Response):
    limiter.enforce(f"register:{client_ip(request)}", 5, 3600, "Too many sign-ups from this network. Try later.")

    if not body.accept_rules:
        raise HTTPException(status_code=400, detail="You need to accept the community rules")
    birth = _to_datetime(body.birth_date)
    age = age_on(birth)
    if age < settings.MIN_AGE:
        raise HTTPException(status_code=403, detail=f"You must be {settings.MIN_AGE} or older to use this service")
    if age > 120:
        raise HTTPException(status_code=400, detail="Enter a valid date of birth")
    if check_profile_text(body.username):
        raise HTTPException(status_code=400, detail="Choose a different username")

    email = body.email.lower()
    if await _is_banned_identity(email):
        raise HTTPException(status_code=403, detail="This email can't be used to create an account")
    if await User.find_one(Or(User.email == email, User.username == body.username)):
        raise HTTPException(status_code=409, detail="Email or username already taken")

    user = User(
        username=body.username, email=email, password_hash=hash_password(body.password),
        birth_date=birth, accepted_rules_at=datetime.now(timezone.utc),
    )
    _apply_admin_role(user)
    await user.insert()
    return await _session_response(user, response)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    ip = client_ip(request)
    email = body.email.lower()
    limiter.enforce(f"login-ip:{ip}", 20, 300)
    if limiter.count(f"login-fail:{email}", 900) >= 8:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    user = await User.find_one(User.email == email)
    if not verify_password(body.password, user.password_hash if user else None):
        limiter.hit(f"login-fail:{email}", 1000, 900)
        raise HTTPException(status_code=401, detail="Wrong email or password")
    if user.is_suspended:
        raise HTTPException(status_code=403, detail="This account has been suspended")

    limiter.reset(f"login-fail:{email}")
    if _apply_admin_role(user):
        await user.save()
    return await _session_response(user, response)


@router.post("/google", response_model=TokenResponse)
async def google_login(body: GoogleAuthRequest, request: Request, response: Response):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured")
    limiter.enforce(f"google:{client_ip(request)}", 20, 300)

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    token = body.credential
    if body.code:
        if not settings.GOOGLE_CLIENT_SECRET:
            raise HTTPException(status_code=503, detail="Google sign-in isn't configured")
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post("https://oauth2.googleapis.com/token", data={
                "code": body.code, "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": "postmessage", "grant_type": "authorization_code",
            })
        token = res.json().get("id_token") if res.status_code == 200 else None
    if not token:
        raise HTTPException(status_code=400, detail="Google sign-in failed")

    try:
        info = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=401, detail="Google sign-in failed")

    email = (info.get("email") or "").lower()
    google_id = info.get("sub")
    if not email or not info.get("email_verified"):
        raise HTTPException(status_code=400, detail="Your Google email isn't verified")
    if await _is_banned_identity(email, google_id):
        raise HTTPException(status_code=403, detail="This account can't be used")

    user = await User.find_one(User.email == email)
    if user is None:
        base = re.sub(r"[^A-Za-z0-9_]", "", (info.get("given_name") or email.split("@")[0]))[:14] or "user"
        if check_profile_text(base):
            base = "user"
        username = base if len(base) >= 3 else f"{base}_{secrets.token_hex(2)}"
        while await User.find_one(User.username == username):
            username = f"{base}_{secrets.token_hex(2)}"
        user = User(username=username, email=email, auth_provider="google", google_id=google_id,
                    avatar_url=info.get("picture"))
        _apply_admin_role(user)
        await user.insert()
    else:
        if user.is_suspended:
            raise HTTPException(status_code=403, detail="This account has been suspended")
        if user.google_id != google_id:
            user.google_id = google_id
        if not user.avatar_url and info.get("picture"):
            user.avatar_url = info.get("picture")
        _apply_admin_role(user)
        await user.save()

    return await _session_response(user, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    rt: Optional[str] = Cookie(default=None),
    x_requested_with: Optional[str] = Header(default=None),
):
    _require_xhr(x_requested_with)
    limiter.enforce(f"refresh:{client_ip(request)}", 60, 60)
    if not rt:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        user, new_refresh = await rotate_refresh_token(rt)
    except HTTPException as e:
        failed = JSONResponse({"detail": e.detail}, status_code=e.status_code)
        _clear_refresh_cookie(failed)
        return failed
    _set_refresh_cookie(response, new_refresh)
    return {"access_token": create_access_token(user), "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    rt: Optional[str] = Cookie(default=None),
    x_requested_with: Optional[str] = Header(default=None),
):
    _require_xhr(x_requested_with)
    if rt:
        await revoke_refresh_token(rt)
    _clear_refresh_cookie(response)
    response.status_code = 204
    return response
