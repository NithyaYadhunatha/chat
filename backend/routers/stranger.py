from fastapi import APIRouter, Depends

from auth import get_current_user
from models import User
from matching.queue import queue_size
from matching.manager import match_manager

router = APIRouter(prefix="/stranger", tags=["stranger"])


@router.get("/status")
async def stranger_status(current_user: User = Depends(get_current_user)):
    """
    Returns the number of users in the queue and active sessions.
    Frontend shows this as "X people online now".
    """
    waiting = await queue_size()
    active_sessions = match_manager.get_active_session_count()
    # People online in stranger mode: waiting + those in sessions (×2)
    online_count = waiting + (active_sessions * 2)

    return {
        "waiting_count": waiting,
        "active_sessions": active_sessions,
        "online_count": online_count,
    }
