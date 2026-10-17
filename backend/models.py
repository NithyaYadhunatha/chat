import enum
from datetime import datetime, timezone
from typing import Dict, List, Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Mongo returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ── Enums ────────────────────────────────────────────────────────────────────

class Role(str, enum.Enum):
    user = "user"
    moderator = "moderator"
    admin = "admin"


class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class ReportReason(str, enum.Enum):
    sexual = "sexual"                # sexual content or solicitation
    minor = "minor"                  # user appears to be under 18
    harassment = "harassment"        # harassment, hate, slurs
    threats = "threats"              # threats of violence, doxxing
    self_harm = "self_harm"          # encouraging self-harm
    spam = "spam"                    # spam, scams, advertising
    other = "other"


class ReportStatus(str, enum.Enum):
    open = "open"
    actioned = "actioned"
    dismissed = "dismissed"


# ── Embedded models ──────────────────────────────────────────────────────────

class LastMessageEmbed(BaseModel):
    id: str
    sender_id: str
    content: str
    created_at: datetime


class EvidenceLine(BaseModel):
    """One line of a stranger-chat transcript captured for a report or flag."""
    author: str          # "reporter" | "reported" | "a" | "b"
    text: str
    at: datetime
    blocked: bool = False


# ── Documents ────────────────────────────────────────────────────────────────

class User(Document):
    username: Indexed(str, unique=True)
    email: Indexed(str, unique=True)
    password_hash: Optional[str] = None
    auth_provider: str = "local"
    google_id: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Role = Role.user
    is_bot: bool = False  # the "CPU" practice opponents

    # Profile / onboarding
    birth_date: Optional[datetime] = None  # stored as UTC midnight (BSON has no date type)
    accepted_rules_at: Optional[datetime] = None
    interests: List[str] = []

    # Presence
    is_online: bool = False
    last_seen: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)

    # Session invalidation: bumping this kills every outstanding access token.
    token_version: int = 0

    # Moderation — stranger-chat ban (temporary or permanent)
    chat_banned_until: Optional[datetime] = None
    chat_ban_permanent: bool = False
    chat_ban_reason: Optional[str] = None
    strike_points: float = 0
    last_strike_at: Optional[datetime] = None
    report_count: int = 0

    # Private post-chat ratings ("good rally?"). Never shown to anyone; used to
    # steer people others keep rating badly into a separate matching pool.
    rating_up: int = 0
    rating_down: int = 0

    # Moderation — account-level suspension (cannot sign in)
    is_suspended: bool = False
    suspension_reason: Optional[str] = None

    # Set when the user appears to be under age; blocks stranger chat until reviewed.
    age_review_required: bool = False

    class Settings:
        name = "users"


class RefreshToken(Document):
    jti: Indexed(str, unique=True)
    user_id: Indexed(PydanticObjectId)
    family_id: str
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "refresh_tokens"
        indexes = [IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0)]


class Friendship(Document):
    requester_id: Indexed(PydanticObjectId)
    receiver_id: Indexed(PydanticObjectId)
    status: FriendshipStatus = FriendshipStatus.pending
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "friendships"


class Conversation(Document):
    member_ids: List[PydanticObjectId] = []
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_message: Optional[LastMessageEmbed] = None
    unread_counts: Dict[str, int] = {}

    class Settings:
        name = "conversations"
        indexes = [[("member_ids", ASCENDING)]]


class ConversationMember(Document):
    """Legacy membership link. Kept only to backfill Conversation.member_ids."""
    conversation_id: Indexed(PydanticObjectId)
    user_id: Indexed(PydanticObjectId)

    class Settings:
        name = "conversation_members"


class Message(Document):
    conversation_id: Indexed(PydanticObjectId)
    sender_id: Indexed(PydanticObjectId)
    content: str
    is_read: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    reply_to_id: Optional[PydanticObjectId] = None
    reactions: Dict[str, str] = {}             # user id -> emoji
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None      # "unsent for everyone"
    previous_versions: List[str] = []          # never returned by the API; kept for reports

    class Settings:
        name = "messages"
        indexes = [[("conversation_id", ASCENDING), ("_id", DESCENDING)]]


class ChatSession(Document):
    """Metadata for an anonymous stranger chat. Message content is not stored."""
    user1_id: PydanticObjectId
    user2_id: PydanticObjectId
    common_interests: List[str] = []
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: Optional[datetime] = None
    end_reason: Optional[str] = None
    message_count: int = 0
    flagged: bool = False
    rating_by_user1: Optional[int] = None  # user1's rating of user2: 1 / -1
    rating_by_user2: Optional[int] = None

    class Settings:
        name = "chat_sessions"


class Report(Document):
    reporter_id: Indexed(PydanticObjectId)
    reported_user_id: Indexed(PydanticObjectId)
    session_id: Optional[PydanticObjectId] = None
    conversation_id: Optional[PydanticObjectId] = None
    source: str = "stranger"  # "stranger" | "dm" | "system"
    reason: ReportReason
    details: Optional[str] = None
    evidence: List[EvidenceLine] = []
    priority: int = 1  # 1 normal · 2 elevated · 3 urgent (child safety)
    status: ReportStatus = ReportStatus.open
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[PydanticObjectId] = None
    resolution_note: Optional[str] = None

    class Settings:
        name = "reports"
        indexes = [[("status", ASCENDING), ("priority", DESCENDING), ("created_at", DESCENDING)]]


class Block(Document):
    blocker_id: Indexed(PydanticObjectId)
    blocked_id: Indexed(PydanticObjectId)
    source: str = "stranger"  # where the block happened
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "blocks"


class ModerationEvent(Document):
    """Audit log of every automated or manual moderation decision."""
    user_id: Indexed(PydanticObjectId)
    source: str              # "stranger" | "dm" | "profile" | "ai" | "reports" | "admin"
    category: str
    severity: str            # "low" | "medium" | "high" | "critical"
    action: str              # "blocked" | "warned" | "strike" | "chat_ban" | "suspended" | ...
    detail: Optional[str] = None
    excerpt: Optional[str] = None
    session_id: Optional[PydanticObjectId] = None
    actor_id: Optional[PydanticObjectId] = None  # moderator, for manual actions
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "moderation_events"


class BannedIdentity(Document):
    """Hashed email / Google ID of suspended accounts, to stop instant re-registration."""
    identity_hash: Indexed(str, unique=True)
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "banned_identities"
