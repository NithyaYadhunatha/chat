import enum
from datetime import datetime, timezone
from typing import Optional, List, Dict

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class MessageType(str, enum.Enum):
    text = "text"
    image = "image"


# ── Embedded models (not Documents) ──────────────────────────────────────────

class LastMessageEmbed(BaseModel):
    id: str
    sender_id: str
    content: str
    message_type: str = "text"
    created_at: datetime


class FriendRequest(BaseModel):
    from_user_id: PydanticObjectId
    status: FriendshipStatus = FriendshipStatus.pending
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Beanie Documents ──────────────────────────────────────────────────────────

class User(Document):
    username: Indexed(str, unique=True)
    email: Indexed(str, unique=True)
    password_hash: Optional[str] = None
    auth_provider: str = "local"
    google_id: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Stranger chat moderation fields
    is_banned: bool = False
    ban_reason: Optional[str] = None
    ban_expires_at: Optional[datetime] = None
    strike_count: int = 0
    report_count: int = 0

    class Settings:
        name = "users"


class Friendship(Document):
    requester_id: Indexed(PydanticObjectId)
    receiver_id: Indexed(PydanticObjectId)
    status: FriendshipStatus = FriendshipStatus.pending
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "friendships"


class Conversation(Document):
    member_ids: List[PydanticObjectId] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_message: Optional[LastMessageEmbed] = None
    unread_counts: Dict[str, int] = {}

    class Settings:
        name = "conversations"
        indexes = [[("member_ids", 1)]]


class ConversationMember(Document):
    conversation_id: Indexed(PydanticObjectId)
    user_id: Indexed(PydanticObjectId)

    class Settings:
        name = "conversation_members"


class Message(Document):
    conversation_id: Indexed(PydanticObjectId)
    sender_id: Indexed(PydanticObjectId)
    content: str
    message_type: MessageType = MessageType.text
    is_read: bool = False
    read_by: List[PydanticObjectId] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "messages"
        indexes = [
            [("conversation_id", 1), ("created_at", -1)]
        ]


class ChatSession(Document):
    """Records anonymous stranger chat sessions."""
    user1_id: PydanticObjectId
    user2_id: PydanticObjectId
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    end_reason: Optional[str] = None
    message_count: int = 0

    class Settings:
        name = "chat_sessions"


class Report(Document):
    reporter_id: PydanticObjectId
    reported_user_id: PydanticObjectId
    session_id: Optional[PydanticObjectId] = None
    reason: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_reviewed: bool = False
    moderator_action: Optional[str] = None

    class Settings:
        name = "reports"


class BannedPhrase(Document):
    phrase: str
    severity: str = "medium"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "banned_phrases"
