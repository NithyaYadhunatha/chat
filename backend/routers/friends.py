from fastapi import APIRouter, Depends, HTTPException
from typing import List
from beanie.operators import Or
from beanie import PydanticObjectId

from models import User, Friendship, FriendshipStatus
from schemas import FriendshipOut, FriendOut
from auth import get_current_user
from websocket.manager import manager

router = APIRouter(prefix="/friends", tags=["friends"])

async def populate_friendship(friendship: Friendship) -> dict:
    requester = await User.get(friendship.requester_id)
    receiver = await User.get(friendship.receiver_id)
    return {
        **friendship.dict(),
        "requester": requester,
        "receiver": receiver,
        "id": str(friendship.id),
        "requester_id": str(friendship.requester_id),
        "receiver_id": str(friendship.receiver_id)
    }

@router.post("/request/{user_id}", response_model=FriendshipOut, status_code=201)
async def send_request(
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        target_oid = PydanticObjectId(user_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if target_oid == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")

    target = await User.get(target_oid)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await Friendship.find_one(
        Or(
            {"requester_id": current_user.id, "receiver_id": target_oid},
            {"requester_id": target_oid, "receiver_id": current_user.id}
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="Friendship already exists")

    friendship = Friendship(requester_id=current_user.id, receiver_id=target_oid)
    await friendship.insert()

    # Notify target via WS
    await manager.send_to_user(str(target_oid), {
        "type": "friend_request",
        "from_user_id": str(current_user.id),
        "friendship_id": str(friendship.id),
    })

    return await populate_friendship(friendship)


@router.post("/accept/{friendship_id}", response_model=FriendshipOut)
async def accept_request(
    friendship_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        fid = PydanticObjectId(friendship_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID")

    friendship = await Friendship.get(fid)
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")
    if friendship.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request to accept")
    if friendship.status != FriendshipStatus.pending:
        raise HTTPException(status_code=400, detail="Request already handled")

    friendship.status = FriendshipStatus.accepted
    await friendship.save()
    return await populate_friendship(friendship)


@router.post("/reject/{friendship_id}", response_model=FriendshipOut)
async def reject_request(
    friendship_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        fid = PydanticObjectId(friendship_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID")

    friendship = await Friendship.get(fid)
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")
    if friendship.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request to reject")
    if friendship.status != FriendshipStatus.pending:
        raise HTTPException(status_code=400, detail="Request already handled")

    friendship.status = FriendshipStatus.rejected
    await friendship.save()
    return await populate_friendship(friendship)


@router.get("", response_model=List[FriendOut])
async def list_friends(
    current_user: User = Depends(get_current_user),
):
    friendships = await Friendship.find(
        {"status": FriendshipStatus.accepted},
        Or(
            {"requester_id": current_user.id},
            {"receiver_id": current_user.id}
        )
    ).to_list()

    friends = []
    for f in friendships:
        other_id = f.receiver_id if f.requester_id == current_user.id else f.requester_id
        other = await User.get(other_id)
        if other:
            friends.append(
                FriendOut(
                    id=str(other.id),
                    username=other.username,
                    avatar_url=other.avatar_url,
                    is_online=other.is_online,
                    last_seen=other.last_seen,
                    friendship_id=str(f.id),
                )
            )
    return friends


@router.get("/pending", response_model=List[FriendshipOut])
async def pending_requests(
    current_user: User = Depends(get_current_user),
):
    friendships = await Friendship.find(
        {"status": FriendshipStatus.pending, "receiver_id": current_user.id}
    ).to_list()
    
    return [await populate_friendship(f) for f in friendships]
