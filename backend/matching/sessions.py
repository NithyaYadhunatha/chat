"""
Live stranger-chat sessions, held in memory.

Message text is never written to the database. We keep a short rolling
transcript per session so that (a) a report can attach real evidence that the
reporter can't forge, and (b) the AI monitor has context. When a session ends
the transcript is kept for REPORT_WINDOW so people can still report after
skipping, then it is dropped.
"""
import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Deque, Dict, List, Optional, Tuple

from beanie import PydanticObjectId

from messaging import new_message_id
from models import ChatSession, EvidenceLine, utcnow
from moderation.engine import ParticipantState

TRANSCRIPT_LINES = 120
REPORT_WINDOW_SECONDS = 15 * 60


@dataclass
class Line:
    author: str  # user id
    text: str
    at: datetime
    blocked: bool = False
    id: str = field(default_factory=new_message_id)
    reply_to: Optional[str] = None
    reactions: Dict[str, str] = field(default_factory=dict)  # user id -> emoji
    edited: bool = False
    deleted: bool = False
    history: List[str] = field(default_factory=list)  # earlier versions, kept for reports

    def evidence_text(self) -> str:
        text = f"[unsent] {self.text}" if self.deleted else self.text
        if self.history:
            text += f"  [edited; before: {' | '.join(self.history)}]"
        return text


@dataclass
class Participant:
    user_id: str
    mod: ParticipantState = field(default_factory=ParticipantState)
    wants_connect: bool = False


@dataclass
class ActiveSession:
    session_id: str
    a: Participant
    b: Participant
    common_interests: List[str]
    icebreaker: str = ""
    started_at: datetime = field(default_factory=utcnow)
    transcript: Deque[Line] = field(default_factory=lambda: deque(maxlen=TRANSCRIPT_LINES))
    message_count: int = 0
    flagged: bool = False
    # AI monitor bookkeeping
    last_ai_review: float = 0.0
    ai_running: bool = False
    lines_since_review: int = 0
    ended_at: Optional[float] = None
    ratings: Dict[str, int] = field(default_factory=dict)  # rater user id -> 1 / -1
    last_serve: float = 0.0
    bot: Optional[object] = None  # bots.service.BotState when the partner is a CPU

    def has(self, user_id: str) -> bool:
        return user_id in (self.a.user_id, self.b.user_id)

    def me(self, user_id: str) -> Participant:
        return self.a if self.a.user_id == user_id else self.b

    def partner(self, user_id: str) -> Participant:
        return self.b if self.a.user_id == user_id else self.a

    def evidence_for(self, reporter_id: str, limit: int = 60) -> List[EvidenceLine]:
        lines = list(self.transcript)[-limit:]
        return [
            EvidenceLine(author="reporter" if l.author == reporter_id else "reported",
                         text=l.evidence_text(), at=l.at, blocked=l.blocked)
            for l in lines
        ]

    def neutral_evidence(self, limit: int = 60) -> List[EvidenceLine]:
        return [EvidenceLine(author="a" if l.author == self.a.user_id else "b", text=l.evidence_text(), at=l.at,
                             blocked=l.blocked) for l in list(self.transcript)[-limit:]]

    def line(self, message_id) -> Optional[Line]:
        if not isinstance(message_id, str):
            return None
        return next((l for l in reversed(self.transcript) if l.id == message_id), None)

    def ai_window(self, limit: int = 30) -> List[Tuple[str, str]]:
        return [("A" if l.author == self.a.user_id else "B", l.text)
                for l in list(self.transcript)[-limit:] if not l.blocked and not l.deleted]


class SessionManager:
    def __init__(self) -> None:
        self._sessions: Dict[str, ActiveSession] = {}
        self._by_user: Dict[str, str] = {}
        self._ended: Dict[str, ActiveSession] = {}
        self._lock = asyncio.Lock()

    async def create(self, u1: str, u2: str, common: List[str], icebreaker: str = "") -> ActiveSession:
        record = ChatSession(user1_id=PydanticObjectId(u1), user2_id=PydanticObjectId(u2), common_interests=common)
        await record.insert()
        session = ActiveSession(str(record.id), Participant(u1), Participant(u2), common, icebreaker)
        async with self._lock:
            self._sessions[session.session_id] = session
            self._by_user[u1] = session.session_id
            self._by_user[u2] = session.session_id
        return session

    def for_user(self, user_id: str) -> Optional[ActiveSession]:
        sid = self._by_user.get(user_id)
        return self._sessions.get(sid) if sid else None

    def find(self, session_id: str) -> Optional[ActiveSession]:
        """Live or recently-ended session (for reports)."""
        self._sweep()
        return self._sessions.get(session_id) or self._ended.get(session_id)

    async def end(self, session_id: str, reason: str) -> Optional[ActiveSession]:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is None:
                return None
            for p in (session.a, session.b):
                if self._by_user.get(p.user_id) == session_id:
                    self._by_user.pop(p.user_id, None)
            session.ended_at = time.monotonic()
            self._ended[session_id] = session

        try:
            record = await ChatSession.get(PydanticObjectId(session_id))
            if record:
                record.ended_at = utcnow()
                record.end_reason = reason
                record.message_count = session.message_count
                record.flagged = session.flagged
                await record.save()
        except Exception:
            pass  # metadata only; never block the chat on it
        self._sweep()
        return session

    def active_count(self) -> int:
        return len(self._sessions)

    def _sweep(self) -> None:
        cutoff = time.monotonic() - REPORT_WINDOW_SECONDS
        for sid in [sid for sid, s in self._ended.items() if (s.ended_at or 0) < cutoff]:
            self._ended.pop(sid, None)


sessions = SessionManager()
