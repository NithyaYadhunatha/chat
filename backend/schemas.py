from datetime import datetime
from typing import Optional, List, Any

from pydantic import BaseModel, EmailStr, field_validator, model_validator


def _str_id(v: Any) -> str:
    """Convert ObjectId / PydanticObjectId to str."""
    if v is None:
        return v
    return str(v)


# ── User ────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    avatar_url: Optional[str] = None


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: datetime
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v: Any) -> str:
        return str(v)


class UserPublic(BaseModel):
    """Minimal user info exposed to other users."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v: Any) -> str:
        return str(v)


# ── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    code: Optional[str] = None


# ── Friendship ───────────────────────────────────────────────────────────────

class FriendshipOut(BaseModel):
    id: str
    requester_id: str
    receiver_id: str
    status: str
    created_at: datetime
    requester: UserPublic
    receiver: UserPublic

    model_config = {"from_attributes": True}

    @field_validator("id", "requester_id", "receiver_id", mode="before")
    @classmethod
    def coerce_ids(cls, v: Any) -> str:
        return str(v)


class FriendOut(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: datetime
    friendship_id: str

    model_config = {"from_attributes": True}

    @field_validator("id", "friendship_id", mode="before")
    @classmethod
    def coerce_ids(cls, v: Any) -> str:
        return str(v)


# ── Message ──────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    content: str
    message_type: str
    is_read: bool
    created_at: datetime
    sender: UserPublic

    model_config = {"from_attributes": True}

    @field_validator("id", "conversation_id", "sender_id", mode="before")
    @classmethod
    def coerce_ids(cls, v: Any) -> str:
        return str(v)


# ── Conversation ─────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    user_id: str  # the other participant


class ConversationOut(BaseModel):
    id: str
    created_at: datetime
    other_user: UserPublic
    last_message: Optional[MessageOut] = None
    unread_count: int

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v: Any) -> str:
        return str(v)


# ── Paginated messages ───────────────────────────────────────────────────────

class MessagePage(BaseModel):
    messages: List[MessageOut]
    next_cursor: Optional[str]  # id of the oldest message returned — pass as ?before=
