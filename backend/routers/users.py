import re
from datetime import datetime, time, timezone

from beanie import PydanticObjectId
from beanie.operators import Or
from fastapi import APIRouter, Depends, HTTPException

from auth import age_on, get_current_user, hash_password, revoke_all_sessions, verify_password
from config import settings
from models import Block, Conversation, Friendship, Message, RefreshToken, User, as_utc
from moderation import enforcement
from moderation.engine import check_profile_text
from ratelimit import limiter
from schemas import (
    ChangePasswordRequest, DeleteAccountRequest, OnboardingRequest, UpdateMeRequest, public_user,
)
from websocket.stranger import clean_interests

router = APIRouter(prefix="/users", tags=["users"])


def me_out(user: User) -> dict:
    ban = enforcement.chat_ban_status(user)
    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "role": user.role.value,
        "auth_provider": user.auth_provider,
        "has_password": bool(user.password_hash),
        "interests": user.interests,
        "birth_date": as_utc(user.birth_date).date().isoformat() if user.birth_date else None,
        "needs_onboarding": not (user.birth_date and user.accepted_rules_at),
        "created_at": as_utc(user.created_at),
        "chat_ban": {
            "banned": ban.banned,
            "until": ban.until,
            "permanent": ban.permanent,
            "reason": ban.reason,
            "age_review": user.age_review_required,
        },
    }


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return me_out(user)


@router.patch("/me")
async def update_me(body: UpdateMeRequest, user: User = Depends(get_current_user)):
    if body.username is not None and body.username != user.username:
        limiter.enforce(f"rename:{user.id}", 3, 86400, "You can change your username 3 times a day.")
        if check_profile_text(body.username):
            raise HTTPException(status_code=400, detail="Choose a different username")
        if await User.find_one({"username": body.username, "_id": {"$ne": user.id}}):
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = body.username
    if body.interests is not None:
        user.interests = clean_interests(body.interests)
    await user.save()
    return me_out(user)


@router.post("/me/onboarding")
async def onboarding(body: OnboardingRequest, user: User = Depends(get_current_user)):
    if not body.accept_rules:
        raise HTTPException(status_code=400, detail="You need to accept the community rules")
    if user.birth_date is None:
        # Date of birth can be set once; changing it later would make the age gate pointless.
        birth = datetime.combine(body.birth_date, time.min, tzinfo=timezone.utc)
        age = age_on(birth)
        if age > 120:
            raise HTTPException(status_code=400, detail="Enter a valid date of birth")
        user.birth_date = birth
        if age < settings.MIN_AGE:
            await user.save()
            raise HTTPException(status_code=403, detail=f"You must be {settings.MIN_AGE} or older to chat with strangers")
    user.accepted_rules_at = datetime.now(timezone.utc)
    await user.save()
    return me_out(user)


@router.post("/me/password", status_code=204)
async def change_password(body: ChangePasswordRequest, user: User = Depends(get_current_user)):
    limiter.enforce(f"pw:{user.id}", 5, 3600)
    if user.password_hash and not verify_password(body.current_password or "", user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    await revoke_all_sessions(user)


@router.post("/me/logout-all", status_code=204)
async def logout_everywhere(user: User = Depends(get_current_user)):
    await revoke_all_sessions(user)


@router.delete("/me", status_code=204)
async def delete_account(body: DeleteAccountRequest, user: User = Depends(get_current_user)):
    if body.confirm != user.username:
        raise HTTPException(status_code=400, detail="Type your username to confirm")
    if user.password_hash and not verify_password(body.password or "", user.password_hash):
        raise HTTPException(status_code=400, detail="Password is wrong")
    if user.is_suspended or user.chat_ban_permanent:
        # Keep the record so a ban can't be shed by deleting and re-registering.
        raise HTTPException(status_code=403, detail="Accounts under a moderation ban can't be deleted. Contact support.")

    convs = await Conversation.find({"member_ids": user.id}).to_list()
    for conv in convs:
        await Message.find(Message.conversation_id == conv.id).delete()
        await conv.delete()
    await Friendship.find(Or(Friendship.requester_id == user.id, Friendship.receiver_id == user.id)).delete()
    await Block.find(Block.blocker_id == user.id).delete()
    await RefreshToken.find(RefreshToken.user_id == user.id).delete()
    # Reports and moderation events about this user are kept for safety records.
    await user.delete()


@router.get("/search")
async def search_users(q: str, user: User = Depends(get_current_user)):
    q = q.strip()
    if len(q) < 3 or not re.fullmatch(r"[A-Za-z0-9_]+", q):
        return []
    limiter.enforce(f"search:{user.id}", 30, 60)
    blocked = await Block.find(Or(Block.blocker_id == user.id, Block.blocked_id == user.id)).to_list()
    hidden = {b.blocked_id for b in blocked} | {b.blocker_id for b in blocked} | {user.id}
    # Prefix match on an escaped pattern: no regex injection, no ReDoS.
    found = await User.find(
        {"username": {"$regex": f"^{re.escape(q)}", "$options": "i"}, "is_suspended": {"$ne": True}, "is_bot": {"$ne": True}}
    ).limit(25).to_list()
    return [public_user(u) for u in found if u.id not in hidden][:15]


@router.get("/blocks")
async def list_blocks(user: User = Depends(get_current_user)):
    blocks = await Block.find(Block.blocker_id == user.id).sort("-created_at").to_list()
    out = []
    for b in blocks:
        # Strangers stay anonymous even in your block list.
        name = None
        if b.source != "stranger":
            other = await User.get(b.blocked_id)
            name = other.username if other else None
        out.append({"id": str(b.id), "source": b.source, "username": name, "created_at": as_utc(b.created_at)})
    return out


@router.post("/{user_id}/block", status_code=201)
async def block_user(user_id: str, user: User = Depends(get_current_user)):
    try:
        target = PydanticObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user")
    if target == user.id or not await User.get(target):
        raise HTTPException(status_code=404, detail="User not found")
    if not await Block.find_one(Block.blocker_id == user.id, Block.blocked_id == target):
        await Block(blocker_id=user.id, blocked_id=target, source="profile").insert()
    # Blocking also ends any friendship.
    await Friendship.find(Or(
        {"requester_id": user.id, "receiver_id": target}, {"requester_id": target, "receiver_id": user.id},
    )).delete()
    return {"detail": "Blocked"}


@router.delete("/blocks/{block_id}", status_code=204)
async def unblock(block_id: str, user: User = Depends(get_current_user)):
    try:
        block = await Block.get(PydanticObjectId(block_id))
    except Exception:
        block = None
    if block is None or block.blocker_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await block.delete()
