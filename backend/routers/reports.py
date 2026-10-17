"""
User reports.

Stranger reports reference the chat session, never a user id — the reporter
doesn't know who the stranger is. The server attaches the transcript it holds
for that session, so evidence can't be fabricated or edited by the reporter.
"""
from datetime import timedelta
from typing import List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from models import Block, EvidenceLine, Message, Report, ReportReason, User, as_utc, utcnow
from moderation import enforcement
from ratelimit import limiter
from schemas import UserReportRequest

router = APIRouter(prefix="/reports", tags=["reports"])

PRIORITY = {ReportReason.minor: 3, ReportReason.sexual: 2, ReportReason.threats: 2, ReportReason.self_harm: 2}
AUTO_BAN_DISTINCT_REPORTERS = 3   # within 24h → temporary chat ban pending review
AUTO_AGE_REVIEW_REPORTERS = 2     # "looks under 18" from this many people → age check


async def file_report(
    reporter: User, reported_id: PydanticObjectId, reason: ReportReason, details: Optional[str],
    evidence: List[EvidenceLine], source: str,
    session_id: Optional[PydanticObjectId] = None, conversation_id: Optional[PydanticObjectId] = None,
) -> Report:
    limiter.enforce(f"report:{reporter.id}", 15, 86400, "You've sent a lot of reports today.")

    if session_id and await Report.find_one(Report.reporter_id == reporter.id, Report.session_id == session_id):
        raise HTTPException(status_code=409, detail="You already reported this chat")

    report = Report(
        reporter_id=reporter.id, reported_user_id=reported_id, session_id=session_id,
        conversation_id=conversation_id, source=source, reason=reason,
        details=(details or "").strip()[:1000] or None, evidence=evidence, priority=PRIORITY.get(reason, 1),
    )
    await report.insert()

    reported = await User.get(reported_id)
    if reported:
        reported.report_count += 1
        await reported.save()
        await _auto_actions(reported, reason)
    return report


async def _auto_actions(user: User, reason: ReportReason) -> None:
    since = utcnow() - timedelta(hours=24)
    recent = await Report.find(
        Report.reported_user_id == user.id, Report.created_at >= since, Report.source != "system",
    ).to_list()
    reporters = {r.reporter_id for r in recent}
    minor_reporters = {r.reporter_id for r in recent if r.reason == ReportReason.minor}

    if len(minor_reporters) >= AUTO_AGE_REVIEW_REPORTERS and not user.age_review_required:
        await enforcement.require_age_review(user, "reports", f"{len(minor_reporters)} reports say this user is under 18")

    if len(reporters) >= AUTO_BAN_DISTINCT_REPORTERS:
        until = utcnow() + timedelta(hours=24)
        current = as_utc(user.chat_banned_until)
        if not current or current < until:
            user.chat_banned_until = until
            user.chat_ban_reason = "Multiple reports — under review"
            await user.save()
            await enforcement.log_event(user.id, "reports", reason.value, "high", "chat_ban_24h",
                                        detail=f"{len(reporters)} distinct reporters in 24h")


async def ensure_block(blocker: PydanticObjectId, blocked: PydanticObjectId, source: str) -> None:
    if not await Block.find_one(Block.blocker_id == blocker, Block.blocked_id == blocked):
        await Block(blocker_id=blocker, blocked_id=blocked, source=source).insert()


@router.post("/user", status_code=201)
async def report_user(body: UserReportRequest, user: User = Depends(get_current_user)):
    """Report a friend / DM contact. Attaches the last messages they sent you."""
    try:
        reported_id = PydanticObjectId(body.user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user")
    if reported_id == user.id or not await User.get(reported_id):
        raise HTTPException(status_code=404, detail="User not found")

    evidence: List[EvidenceLine] = []
    conv_oid = None
    if body.conversation_id:
        from models import Conversation
        try:
            conv = await Conversation.get(PydanticObjectId(body.conversation_id))
        except Exception:
            conv = None
        if conv and user.id in conv.member_ids and reported_id in conv.member_ids:
            conv_oid = conv.id
            msgs = await Message.find(Message.conversation_id == conv.id).sort("-_id").limit(40).to_list()
            def shown(m):
                if m.deleted_at:
                    return f"[unsent] {m.content}"
                return f"{m.content}  [edited; before: {' | '.join(m.previous_versions)}]" if m.previous_versions else m.content
            evidence = [EvidenceLine(author="reporter" if m.sender_id == user.id else "reported",
                                     text=shown(m), at=m.created_at) for m in reversed(msgs)]

    report = await file_report(user, reported_id, body.reason, body.details, evidence, "dm",
                               conversation_id=conv_oid)
    return {"id": str(report.id), "detail": "Thanks — a moderator will review this."}
