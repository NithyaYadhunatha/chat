import re
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from models import ReportReason, User, as_utc

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")


def validate_username(v: str) -> str:
    v = v.strip()
    if not USERNAME_RE.match(v):
        raise ValueError("Username must be 3–20 characters: letters, numbers and underscores")
    return v


def validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode()) > 72:
        raise ValueError("Password is too long")
    if v.isdigit() or v.isalpha() and v.lower() == v:
        raise ValueError("Use a mix of letters and numbers or symbols")
    return v


# ── Auth ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    birth_date: date
    accept_rules: bool

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        return validate_username(v)

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ── Users ───────────────────────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    birth_date: date
    accept_rules: bool


class UpdateMeRequest(BaseModel):
    username: Optional[str] = None
    interests: Optional[List[str]] = None

    @field_validator("username")
    @classmethod
    def _username(cls, v):
        return validate_username(v) if v is not None else v


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password(v)


class DeleteAccountRequest(BaseModel):
    password: Optional[str] = None
    confirm: str  # must equal the username


class UserPublic(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: datetime


def public_user(u: User) -> dict:
    return {"id": str(u.id), "username": u.username, "avatar_url": u.avatar_url,
            "is_online": u.is_online, "last_seen": as_utc(u.last_seen)}


# ── Messages ────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    reply_to: Optional[str] = None


class MessageEdit(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ReactionSet(BaseModel):
    emoji: Optional[str] = None  # None removes your reaction


class StartConversationRequest(BaseModel):
    user_id: str


# ── Reports & blocks ────────────────────────────────────────────────────────

class StrangerReportRequest(BaseModel):
    session_id: str
    reason: ReportReason
    details: Optional[str] = Field(default=None, max_length=1000)
    block: bool = True


class StrangerBlockRequest(BaseModel):
    session_id: str


class UserReportRequest(BaseModel):
    user_id: str
    reason: ReportReason
    details: Optional[str] = Field(default=None, max_length=1000)
    conversation_id: Optional[str] = None


# ── Admin ───────────────────────────────────────────────────────────────────

class ResolveReportRequest(BaseModel):
    action: str  # "dismiss" | "warn" | "ban_24h" | "ban_7d" | "ban_permanent" | "suspend"
    note: Optional[str] = Field(default=None, max_length=1000)


class UserActionRequest(BaseModel):
    action: str  # "lift" | "ban_24h" | "ban_7d" | "ban_permanent" | "suspend" | "clear_age_review" | "set_role"
    note: Optional[str] = Field(default=None, max_length=1000)
    role: Optional[str] = None
