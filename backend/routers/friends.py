from beanie import PydanticObjectId
from beanie.operators import Or
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from models import Block, Conversation, Friendship, FriendshipStatus, User, as_utc
from ratelimit import limiter
from schemas import public_user
from websocket.manager import manager

router = APIRouter(prefix="/friends", tags=["friends"])


def _oid(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def _between(a: PydanticObjectId, b: PydanticObjectId):
    return Or({"requester_id": a, "receiver_id": b}, {"requester_id": b, "receiver_id": a})


async def is_blocked_either_way(a: PydanticObjectId, b: PydanticObjectId) -> bool:
    return await Block.find(Or(
        {"blocker_id": a, "blocked_id": b}, {"blocker_id": b, "blocked_id": a},
    )).count() > 0


async def are_friends(a: PydanticObjectId, b: PydanticObjectId) -> bool:
    f = await Friendship.find_one(_between(a, b))
    return bool(f and f.status == FriendshipStatus.accepted)


async def _request_out(f: Friendship, me: User) -> dict:
    other_id = f.receiver_id if f.requester_id == me.id else f.requester_id
    other = await User.get(other_id)
    return {
        "id": str(f.id),
        "direction": "outgoing" if f.requester_id == me.id else "incoming",
        "user": public_user(other) if other else None,
        "created_at": as_utc(f.created_at),
    }


@router.get("")
async def list_friends(user: User = Depends(get_current_user)):
    friendships = await Friendship.find(
        Friendship.status == FriendshipStatus.accepted,
        Or(Friendship.requester_id == user.id, Friendship.receiver_id == user.id),
    ).to_list()
    out = []
    for f in friendships:
        other = await User.get(f.receiver_id if f.requester_id == user.id else f.requester_id)
        if other and not other.is_suspended:
            out.append({**public_user(other), "friendship_id": str(f.id)})
    return sorted(out, key=lambda x: (not x["is_online"], x["username"].lower()))


@router.get("/requests")
async def list_requests(user: User = Depends(get_current_user)):
    pending = await Friendship.find(
        Friendship.status == FriendshipStatus.pending,
        Or(Friendship.requester_id == user.id, Friendship.receiver_id == user.id),
    ).sort("-created_at").to_list()
    return [r for r in [await _request_out(f, user) for f in pending] if r["user"]]


@router.post("/request/{user_id}", status_code=201)
async def send_request(user_id: str, user: User = Depends(get_current_user)):
    target_id = _oid(user_id)
    if target_id == user.id:
        raise HTTPException(status_code=400, detail="You can't add yourself")
    limiter.enforce(f"friendreq:{user.id}", 20, 3600, "You've sent a lot of requests. Try again later.")

    target = await User.get(target_id)
    if target is None or target.is_suspended or target.is_bot or await is_blocked_either_way(user.id, target_id):
        raise HTTPException(status_code=404, detail="User not found")

    existing = await Friendship.find_one(_between(user.id, target_id))
    if existing:
        if existing.status == FriendshipStatus.accepted:
            raise HTTPException(status_code=409, detail="Already friends")
        if existing.status == FriendshipStatus.pending:
            if existing.receiver_id == user.id:
                # They already asked you — treat this as accepting.
                return await accept_request(str(existing.id), user)
            raise HTTPException(status_code=409, detail="Request already sent")
        await existing.delete()  # an old rejection; allow asking again

    f = Friendship(requester_id=user.id, receiver_id=target_id)
    await f.insert()
    await manager.send(str(target_id), {"type": "friend.request", "request_id": str(f.id),
                                        "from": public_user(user)})
    return await _request_out(f, user)


@router.post("/accept/{request_id}")
async def accept_request(request_id: str, user: User = Depends(get_current_user)):
    f = await Friendship.get(_oid(request_id))
    if f is None or f.receiver_id != user.id or f.status != FriendshipStatus.pending:
        raise HTTPException(status_code=404, detail="Request not found")
    f.status = FriendshipStatus.accepted
    await f.save()
    await manager.send(str(f.requester_id), {"type": "friend.accepted", "user": public_user(user)})
    return await _request_out(f, user)


@router.post("/decline/{request_id}", status_code=204)
async def decline_request(request_id: str, user: User = Depends(get_current_user)):
    """Decline an incoming request or cancel an outgoing one."""
    f = await Friendship.get(_oid(request_id))
    if f is None or f.status != FriendshipStatus.pending or user.id not in (f.requester_id, f.receiver_id):
        raise HTTPException(status_code=404, detail="Request not found")
    if f.receiver_id == user.id:
        f.status = FriendshipStatus.rejected
        await f.save()
    else:
        await f.delete()


@router.delete("/{user_id}", status_code=204)
async def unfriend(user_id: str, user: User = Depends(get_current_user)):
    other = _oid(user_id)
    await Friendship.find(_between(user.id, other)).delete()
    # The conversation stays, but nobody can post in it until they're friends again.
    conv = await Conversation.find_one({"member_ids": {"$all": [user.id, other]}})
    if conv:
        await manager.send(user_id, {"type": "friend.removed", "user_id": str(user.id)})
