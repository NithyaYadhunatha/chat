"""
MatchManager: tracks active stranger chat sessions in memory.
Persists ChatSession metadata to MongoDB for reporting/analytics.
"""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from beanie import PydanticObjectId

from models import ChatSession


@dataclass
class ActiveSession:
    session_id: str
    user1_id: str
    user2_id: str
    started_at: datetime
    message_count: int = 0
    recent_messages: List[str] = field(default_factory=list)  # for spam detection

    def other_user(self, user_id: str) -> Optional[str]:
        if self.user1_id == user_id:
            return self.user2_id
        if self.user2_id == user_id:
            return self.user1_id
        return None


class MatchManager:
    def __init__(self):
        # session_id -> ActiveSession
        self._sessions: Dict[str, ActiveSession] = {}
        # user_id -> session_id
        self._user_sessions: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create_session(self, user1_id: str, user2_id: str) -> ActiveSession:
        """Create a new active session between two users."""
        # Persist to MongoDB
        db_session = ChatSession(
            user1_id=PydanticObjectId(user1_id),
            user2_id=PydanticObjectId(user2_id),
        )
        await db_session.insert()
        session_id = str(db_session.id)

        session = ActiveSession(
            session_id=session_id,
            user1_id=user1_id,
            user2_id=user2_id,
            started_at=datetime.now(timezone.utc),
        )

        async with self._lock:
            self._sessions[session_id] = session
            self._user_sessions[user1_id] = session_id
            self._user_sessions[user2_id] = session_id

        return session

    async def end_session(self, session_id: str, reason: str = "left") -> Optional[ActiveSession]:
        """End a session and clean up."""
        async with self._lock:
            session = self._sessions.pop(session_id, None)
            if not session:
                return None
            self._user_sessions.pop(session.user1_id, None)
            self._user_sessions.pop(session.user2_id, None)

        # Update MongoDB record
        try:
            db_session = await ChatSession.get(PydanticObjectId(session_id))
            if db_session:
                db_session.ended_at = datetime.now(timezone.utc)
                db_session.end_reason = reason
                db_session.message_count = session.message_count
                await db_session.save()
        except Exception:
            pass  # Non-critical

        return session

    async def get_session_for_user(self, user_id: str) -> Optional[ActiveSession]:
        async with self._lock:
            sid = self._user_sessions.get(user_id)
            if sid:
                return self._sessions.get(sid)
        return None

    async def get_session(self, session_id: str) -> Optional[ActiveSession]:
        async with self._lock:
            return self._sessions.get(session_id)

    async def increment_message_count(self, session_id: str, content: str) -> None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.message_count += 1
                session.recent_messages.append(content)
                # Keep only last 20 messages for spam detection
                if len(session.recent_messages) > 20:
                    session.recent_messages = session.recent_messages[-20:]

    def get_active_session_count(self) -> int:
        return len(self._sessions)


# Global singleton
match_manager = MatchManager()
