"""
Turning moderation verdicts into consequences: strikes, chat bans, suspensions,
age reviews and reports for human moderators. Everything is written to the
ModerationEvent audit log.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

from beanie import PydanticObjectId

from models import (
    BannedIdentity, EvidenceLine, ModerationEvent, Report, ReportReason, User, as_utc, utcnow,
)

# Strike points → stranger-chat ban. Points decay by STRIKE_DECAY_PER_WEEK.
BAN_LADDER = [
    (12.0, None),                 # permanent
    (8.0, timedelta(days=7)),
    (5.0, timedelta(hours=24)),
    (3.0, timedelta(hours=1)),
]
STRIKE_DECAY_PER_WEEK = 1.0


@dataclass
class BanStatus:
    banned: bool
    until: Optional[datetime] = None
    permanent: bool = False
    reason: Optional[str] = None

    def to_event(self) -> dict:
        return {
            "type": "moderation.banned",
            "until": self.until.isoformat() if self.until else None,
            "permanent": self.permanent,
            "reason": self.reason,
        }


async def log_event(
    user_id: PydanticObjectId, source: str, category: str, severity: str, action: str,
    detail: Optional[str] = None, excerpt: Optional[str] = None,
    session_id: Optional[PydanticObjectId] = None, actor_id: Optional[PydanticObjectId] = None,
) -> None:
    await ModerationEvent(
        user_id=user_id, source=source, category=category, severity=severity, action=action,
        detail=detail, excerpt=(excerpt or "")[:500] or None, session_id=session_id, actor_id=actor_id,
    ).insert()


def chat_ban_status(user: User) -> BanStatus:
    if user.is_suspended:
        return BanStatus(True, permanent=True, reason=user.suspension_reason or "Account suspended")
    if user.age_review_required:
        return BanStatus(True, permanent=True,
                         reason="Your account needs an age check before you can chat with strangers.")
    if user.chat_ban_permanent:
        return BanStatus(True, permanent=True, reason=user.chat_ban_reason)
    until = as_utc(user.chat_banned_until)
    if until and until > utcnow():
        return BanStatus(True, until=until, reason=user.chat_ban_reason)
    return BanStatus(False)


async def add_strike(
    user: User, points: float, category: str, source: str, reason: str,
    excerpt: Optional[str] = None, session_id: Optional[PydanticObjectId] = None,
) -> BanStatus:
    now = utcnow()
    last = as_utc(user.last_strike_at)
    if last:
        weeks = (now - last).total_seconds() / (7 * 24 * 3600)
        user.strike_points = max(0.0, user.strike_points - weeks * STRIKE_DECAY_PER_WEEK)
    user.strike_points = round(user.strike_points + points, 2)
    user.last_strike_at = now

    action = "strike"
    for threshold, duration in BAN_LADDER:
        if user.strike_points >= threshold:
            if duration is None:
                user.chat_ban_permanent = True
                action = "chat_ban_permanent"
            else:
                until = now + duration
                current = as_utc(user.chat_banned_until)
                user.chat_banned_until = max(until, current) if current else until
                action = f"chat_ban_{int(duration.total_seconds() // 3600)}h"
            user.chat_ban_reason = f"Repeated violations ({reason})"
            break
    await user.save()

    await log_event(user.id, source, category, "medium" if points < 2 else "high", action,
                    detail=f"{reason} (+{points} → {user.strike_points})", excerpt=excerpt, session_id=session_id)
    return chat_ban_status(user)


async def suspend(user: User, reason: str, source: str, category: str,
                  excerpt: Optional[str] = None, session_id: Optional[PydanticObjectId] = None,
                  actor_id: Optional[PydanticObjectId] = None) -> None:
    from auth import identity_hash, revoke_all_sessions

    user.is_suspended = True
    user.suspension_reason = reason
    user.chat_ban_permanent = True
    user.chat_ban_reason = reason
    await revoke_all_sessions(user)  # also saves the user

    for ident in filter(None, [user.email, user.google_id]):
        h = identity_hash(ident)
        if not await BannedIdentity.find_one(BannedIdentity.identity_hash == h):
            await BannedIdentity(identity_hash=h, reason=reason).insert()

    await log_event(user.id, source, category, "critical", "suspended",
                    detail=reason, excerpt=excerpt, session_id=session_id, actor_id=actor_id)


async def require_age_review(user: User, source: str, excerpt: Optional[str],
                             session_id: Optional[PydanticObjectId] = None) -> None:
    user.age_review_required = True
    await user.save()
    await log_event(user.id, source, "minor_age", "high", "age_review_required",
                    detail="User stated an age under 18", excerpt=excerpt, session_id=session_id)


async def open_system_report(
    reported: PydanticObjectId, reason: ReportReason, details: str, priority: int,
    evidence: List[EvidenceLine], session_id: Optional[PydanticObjectId] = None,
    source: str = "system",
) -> Report:
    """Automated report so a human reviews what the filter (or AI monitor) caught."""
    report = Report(
        reporter_id=reported,  # self-referential for system reports; source marks it
        reported_user_id=reported, session_id=session_id, source=source, reason=reason,
        details=details, evidence=evidence, priority=priority,
    )
    await report.insert()
    return report


async def lift_bans(user: User, actor: User, note: str) -> None:
    user.chat_banned_until = None
    user.chat_ban_permanent = False
    user.chat_ban_reason = None
    user.age_review_required = False
    user.strike_points = 0
    if user.is_suspended:
        from auth import identity_hash
        user.is_suspended = False
        user.suspension_reason = None
        for ident in filter(None, [user.email, user.google_id]):
            await BannedIdentity.find(BannedIdentity.identity_hash == identity_hash(ident)).delete()
    await user.save()
    await log_event(user.id, "admin", "manual", "low", "lifted", detail=note, actor_id=actor.id)
