from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from matching.matchmaker import matchmaker
from matching.sessions import sessions
from models import User
from routers.reports import ensure_block, file_report
from schemas import StrangerBlockRequest, StrangerReportRequest
from websocket import stranger as stranger_ws
from websocket.manager import manager

router = APIRouter(prefix="/stranger", tags=["stranger"])


@router.get("/status")
async def status():
    """Public: how many people are around. Shown on the landing page."""
    return {
        "online": manager.online_count(),
        "searching": matchmaker.size(),
        "chatting": sessions.active_count() * 2,
    }


def _session_for(session_id: str, user: User):
    session = sessions.find(session_id)
    if session is None or not session.has(str(user.id)):
        raise HTTPException(status_code=404, detail="That chat is too old to report. Chats can be reported for 15 minutes.")
    return session


@router.post("/report", status_code=201)
async def report_stranger(body: StrangerReportRequest, user: User = Depends(get_current_user)):
    session = _session_for(body.session_id, user)
    uid = str(user.id)
    partner_id = PydanticObjectId(session.partner(uid).user_id)

    report = await file_report(
        user, partner_id, body.reason, body.details, session.evidence_for(uid), "stranger",
        session_id=PydanticObjectId(session.session_id),
    )
    session.flagged = True
    if body.block:
        await ensure_block(user.id, partner_id, "stranger")
    if sessions.for_user(uid) is session:
        await stranger_ws.end_session(session, "reported", actor=uid, partner_reason="partner_left")
    return {"id": str(report.id), "detail": "Thanks — a moderator will review this chat."}


@router.post("/block", status_code=201)
async def block_stranger(body: StrangerBlockRequest, user: User = Depends(get_current_user)):
    session = _session_for(body.session_id, user)
    uid = str(user.id)
    await ensure_block(user.id, PydanticObjectId(session.partner(uid).user_id), "stranger")
    if sessions.for_user(uid) is session:
        await stranger_ws.end_session(session, "blocked", actor=uid, partner_reason="partner_left")
    return {"detail": "You won't be matched with this person again."}
