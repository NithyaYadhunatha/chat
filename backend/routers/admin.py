"""Moderator tools: review reports with evidence, act on users, read the audit log."""
import re
from datetime import timedelta
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

from auth import require_moderator
from matching.sessions import sessions
from models import ModerationEvent, Report, ReportStatus, Role, User, as_utc, utcnow
from moderation import enforcement
from schemas import ResolveReportRequest, UserActionRequest
from websocket.manager import manager

router = APIRouter(prefix="/admin", tags=["admin"])

BAN_DURATIONS = {"ban_24h": timedelta(hours=24), "ban_7d": timedelta(days=7)}


def _oid(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def user_summary(u: Optional[User]) -> Optional[dict]:
    if u is None:
        return None
    ban = enforcement.chat_ban_status(u)
    return {
        "id": str(u.id), "username": u.username, "email": u.email, "role": u.role.value,
        "created_at": as_utc(u.created_at), "strike_points": u.strike_points, "report_count": u.report_count,
        "is_suspended": u.is_suspended, "age_review_required": u.age_review_required,
        "chat_banned": ban.banned, "chat_banned_until": ban.until, "chat_ban_permanent": u.chat_ban_permanent,
        "ban_reason": ban.reason, "is_online": manager.is_connected(str(u.id)),
    }


def event_out(e: ModerationEvent) -> dict:
    return {"id": str(e.id), "user_id": str(e.user_id), "source": e.source, "category": e.category,
            "severity": e.severity, "action": e.action, "detail": e.detail, "excerpt": e.excerpt,
            "created_at": as_utc(e.created_at)}


async def report_out(r: Report, full: bool = False) -> dict:
    reported = await User.get(r.reported_user_id)
    reporter = None if r.source in ("system", "ai") else await User.get(r.reporter_id)
    out = {
        "id": str(r.id), "source": r.source, "reason": r.reason.value, "details": r.details,
        "priority": r.priority, "status": r.status.value, "created_at": as_utc(r.created_at),
        "reported": user_summary(reported),
        "reporter": {"id": str(reporter.id), "username": reporter.username} if reporter else None,
        "evidence_count": len(r.evidence),
        "resolution_note": r.resolution_note, "resolved_at": as_utc(r.resolved_at),
    }
    if full:
        out["evidence"] = [{"author": e.author, "text": e.text, "at": as_utc(e.at), "blocked": e.blocked}
                           for e in r.evidence]
        events = await ModerationEvent.find(ModerationEvent.user_id == r.reported_user_id) \
            .sort("-created_at").limit(25).to_list()
        out["history"] = [event_out(e) for e in events]
        out["other_reports"] = await Report.find(Report.reported_user_id == r.reported_user_id,
                                                 Report.id != r.id).count()
    return out


async def apply_action(target: User, action: str, actor: User, note: Optional[str]) -> None:
    note = note or f"Moderator action: {action}"
    if action == "lift":
        await enforcement.lift_bans(target, actor, note)
    elif action == "warn":
        await enforcement.log_event(target.id, "admin", "manual", "low", "warned", detail=note, actor_id=actor.id)
        await manager.send(str(target.id), {"type": "moderation.warning", "text": note})
    elif action in BAN_DURATIONS:
        target.chat_banned_until = utcnow() + BAN_DURATIONS[action]
        target.chat_ban_reason = note
        await target.save()
        await enforcement.log_event(target.id, "admin", "manual", "high", action, detail=note, actor_id=actor.id)
        await manager.send(str(target.id), enforcement.chat_ban_status(target).to_event())
    elif action == "ban_permanent":
        target.chat_ban_permanent = True
        target.chat_ban_reason = note
        await target.save()
        await enforcement.log_event(target.id, "admin", "manual", "high", action, detail=note, actor_id=actor.id)
        await manager.send(str(target.id), enforcement.chat_ban_status(target).to_event())
    elif action == "suspend":
        if target.role != Role.user and actor.role != Role.admin:
            raise HTTPException(status_code=403, detail="Only admins can suspend staff")
        await enforcement.suspend(target, note, "admin", "manual", actor_id=actor.id)
        await manager.send(str(target.id), {"type": "account.suspended", "reason": note})
        await manager.close(str(target.id))
    elif action == "clear_age_review":
        target.age_review_required = False
        await target.save()
        await enforcement.log_event(target.id, "admin", "minor_age", "low", "age_review_cleared",
                                    detail=note, actor_id=actor.id)
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    if action in BAN_DURATIONS or action in ("ban_permanent", "suspend"):
        session = sessions.for_user(str(target.id))
        if session:
            from websocket.stranger import end_session
            await end_session(session, "moderation", actor=str(target.id), partner_reason="moderation")


@router.get("/stats")
async def stats(_: User = Depends(require_moderator)):
    since = utcnow() - timedelta(hours=24)
    return {
        "open_reports": await Report.find(Report.status == ReportStatus.open).count(),
        "urgent_reports": await Report.find(Report.status == ReportStatus.open, Report.priority >= 3).count(),
        "events_24h": await ModerationEvent.find(ModerationEvent.created_at >= since).count(),
        "suspended_users": await User.find(User.is_suspended == True).count(),  # noqa: E712
        "age_reviews": await User.find(User.age_review_required == True).count(),  # noqa: E712
        "online": manager.online_count(),
        "active_chats": sessions.active_count(),
    }


@router.get("/reports")
async def list_reports(status: str = "open", skip: int = 0, _: User = Depends(require_moderator)):
    query = {} if status == "all" else {"status": status}
    reports = await Report.find(query).sort([("priority", -1), ("created_at", -1)]) \
        .skip(max(skip, 0)).limit(50).to_list()
    return [await report_out(r) for r in reports]


@router.get("/reports/{report_id}")
async def get_report(report_id: str, _: User = Depends(require_moderator)):
    r = await Report.get(_oid(report_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return await report_out(r, full=True)


@router.post("/reports/{report_id}/resolve")
async def resolve_report(report_id: str, body: ResolveReportRequest, mod: User = Depends(require_moderator)):
    r = await Report.get(_oid(report_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if body.action != "dismiss":
        target = await User.get(r.reported_user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Reported user no longer exists")
        await apply_action(target, body.action, mod, body.note)
    r.status = ReportStatus.dismissed if body.action == "dismiss" else ReportStatus.actioned
    r.resolved_at = utcnow()
    r.resolved_by = mod.id
    r.resolution_note = body.note or body.action
    await r.save()
    return await report_out(r, full=True)


@router.get("/users")
async def search_users(q: str, _: User = Depends(require_moderator)):
    q = q.strip()
    if len(q) < 2:
        return []
    pattern = {"$regex": f"^{re.escape(q)}", "$options": "i"}
    found = await User.find({"$or": [{"username": pattern}, {"email": pattern}]}).limit(20).to_list()
    return [user_summary(u) for u in found]


@router.get("/users/{user_id}")
async def get_user(user_id: str, _: User = Depends(require_moderator)):
    u = await User.get(_oid(user_id))
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    events = await ModerationEvent.find(ModerationEvent.user_id == u.id).sort("-created_at").limit(50).to_list()
    reports = await Report.find(Report.reported_user_id == u.id).sort("-created_at").limit(20).to_list()
    return {**user_summary(u), "events": [event_out(e) for e in events],
            "reports": [await report_out(r) for r in reports]}


@router.post("/users/{user_id}/action")
async def user_action(user_id: str, body: UserActionRequest, mod: User = Depends(require_moderator)):
    target = await User.get(_oid(user_id))
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == mod.id:
        raise HTTPException(status_code=400, detail="You can't moderate yourself")
    if body.action == "set_role":
        if mod.role != Role.admin or body.role not in {r.value for r in Role}:
            raise HTTPException(status_code=403, detail="Only admins can change roles")
        target.role = Role(body.role)
        await target.save()
        await enforcement.log_event(target.id, "admin", "manual", "low", f"role_{body.role}", actor_id=mod.id)
    else:
        await apply_action(target, body.action, mod, body.note)
    return user_summary(await User.get(target.id))


@router.get("/events")
async def recent_events(_: User = Depends(require_moderator)):
    events = await ModerationEvent.find().sort("-created_at").limit(100).to_list()
    names = {}
    for e in events:
        if e.user_id not in names:
            u = await User.get(e.user_id)
            names[e.user_id] = u.username if u else "deleted"
    return [{**event_out(e), "username": names[e.user_id]} for e in events]
