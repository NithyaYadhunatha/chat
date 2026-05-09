"""
Strike system for the stranger chat moderation pipeline.
Tracks strikes in MongoDB. Auto-bans at 3 strikes.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass

from beanie import PydanticObjectId


@dataclass
class StrikeResult:
    strike_count: int
    is_banned: bool
    ban_expires_at: Optional[datetime]
    message: str


async def add_strike(user_id: str, reason: str) -> StrikeResult:
    """
    Increment a user's strike count. Ban at 3.
    
    Ban durations:
        strike 1: warn (no ban)
        strike 2: 1-hour temp ban
        strike 3+: 24-hour ban (escalating)
    """
    # Import here to avoid circular imports at module load time
    from models import User

    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        return StrikeResult(
            strike_count=0, is_banned=False,
            ban_expires_at=None, message="Invalid user ID"
        )

    user = await User.get(oid)
    if not user:
        return StrikeResult(
            strike_count=0, is_banned=False,
            ban_expires_at=None, message="User not found"
        )

    user.strike_count += 1
    count = user.strike_count

    ban_expires_at = None
    is_banned = False

    if count >= 3:
        # 24-hour ban per 3 strikes
        hours = 24 * ((count - 3) // 3 + 1)
        ban_expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        user.is_banned = True
        user.ban_reason = reason
        user.ban_expires_at = ban_expires_at
        is_banned = True
        msg = f"Banned for {hours}h due to repeated violations: {reason}"
    elif count == 2:
        ban_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        user.is_banned = True
        user.ban_reason = reason
        user.ban_expires_at = ban_expires_at
        is_banned = True
        msg = f"Temporarily banned for 1h: {reason}"
    else:
        msg = f"Strike {count}/3 for: {reason}"

    await user.save()

    return StrikeResult(
        strike_count=count,
        is_banned=is_banned,
        ban_expires_at=ban_expires_at,
        message=msg,
    )


async def check_ban_status(user_id: str) -> tuple[bool, Optional[str]]:
    """
    Returns (is_banned, reason).
    Automatically lifts expired bans.
    """
    from models import User

    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        return False, None

    user = await User.get(oid)
    if not user or not user.is_banned:
        return False, None

    # Auto-lift expired bans
    if user.ban_expires_at and datetime.now(timezone.utc) > user.ban_expires_at:
        user.is_banned = False
        user.ban_reason = None
        user.ban_expires_at = None
        await user.save()
        return False, None

    return True, user.ban_reason
