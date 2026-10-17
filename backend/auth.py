import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import bcrypt
import jwt
from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from models import RefreshToken, Role, User, utcnow, as_utc

bearer_scheme = HTTPBearer(auto_error=False)

# Used so that a login for a non-existent email costs the same as a real one.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt()).decode()


# ── Passwords ────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), (hashed or _DUMMY_HASH).encode()) and hashed is not None
    except ValueError:
        return False


def identity_hash(value: str) -> str:
    """Keyed hash used to remember banned emails without storing them in clear."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{value.strip().lower()}".encode()).hexdigest()


# ── Tokens ───────────────────────────────────────────────────────────────────

def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "tv": user.token_version,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def issue_refresh_token(user: User, family_id: Optional[str] = None) -> str:
    jti = uuid.uuid4().hex
    expires = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await RefreshToken(
        jti=jti, user_id=user.id, family_id=family_id or uuid.uuid4().hex, expires_at=expires
    ).insert()
    payload = {"sub": str(user.id), "type": "refresh", "jti": jti, "exp": expires}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


async def rotate_refresh_token(token: str) -> Tuple[User, str]:
    """Exchange a refresh token for a new one. Reusing an old token revokes the whole family."""
    payload = decode_token(token, "refresh")
    record = await RefreshToken.find_one(RefreshToken.jti == payload.get("jti"))
    if record is None:
        raise HTTPException(status_code=401, detail="Session expired")

    if record.revoked_at is not None:
        # Token replay: someone is using a token that was already rotated. Kill the family.
        await RefreshToken.find(
            RefreshToken.family_id == record.family_id, RefreshToken.revoked_at == None  # noqa: E711
        ).update({"$set": {"revoked_at": utcnow()}})
        raise HTTPException(status_code=401, detail="Session expired")

    user = await User.get(record.user_id)
    if user is None or user.is_suspended:
        raise HTTPException(status_code=401, detail="Session expired")

    record.revoked_at = utcnow()
    await record.save()
    return user, await issue_refresh_token(user, record.family_id)


async def revoke_refresh_token(token: str) -> None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return
    record = await RefreshToken.find_one(RefreshToken.jti == payload.get("jti"))
    if record:
        await RefreshToken.find(RefreshToken.family_id == record.family_id).update(
            {"$set": {"revoked_at": utcnow()}}
        )


async def revoke_all_sessions(user: User) -> None:
    user.token_version += 1
    await user.save()
    await RefreshToken.find(RefreshToken.user_id == user.id).update({"$set": {"revoked_at": utcnow()}})


async def user_from_access_token(token: str) -> User:
    payload = decode_token(token, "access")
    try:
        user = await User.get(PydanticObjectId(payload["sub"]))
    except Exception:
        user = None
    if user is None or payload.get("tv") != user.token_version:
        raise HTTPException(status_code=401, detail="Session expired")
    if user.is_suspended:
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


# ── Dependencies ─────────────────────────────────────────────────────────────

async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    return await user_from_access_token(creds.credentials)


async def require_moderator(user: User = Depends(get_current_user)) -> User:
    if user.role not in (Role.moderator, Role.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderators only")
    return user


# ── Helpers ──────────────────────────────────────────────────────────────────

def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def age_on(birth: datetime, today: Optional[datetime] = None) -> int:
    today = today or utcnow()
    birth = as_utc(birth)
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
