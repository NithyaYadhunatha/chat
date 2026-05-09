from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from beanie import PydanticObjectId
from models import Report, User
from auth import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportCreate(BaseModel):
    reported_user_id: str
    session_id: Optional[str] = None
    reason: str
    description: Optional[str] = None


@router.post("", status_code=201)
async def submit_report(
    body: ReportCreate,
    current_user: User = Depends(get_current_user),
):
    try:
        reported_oid = PydanticObjectId(body.reported_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reported_user_id")

    session_oid = None
    if body.session_id:
        try:
            session_oid = PydanticObjectId(body.session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session_id")

    target = await User.get(reported_oid)
    if not target:
        raise HTTPException(status_code=404, detail="Reported user not found")

    # Increment report count on target
    target.report_count = (target.report_count or 0) + 1
    await target.save()

    report = Report(
        reporter_id=current_user.id,
        reported_user_id=reported_oid,
        session_id=session_oid,
        reason=body.reason,
        description=body.description,
        created_at=datetime.now(timezone.utc),
    )
    await report.insert()

    return {"detail": "Report submitted", "report_id": str(report.id)}
