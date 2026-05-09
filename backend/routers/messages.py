from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from beanie import PydanticObjectId
from beanie.operators import Set, In

from models import User, ConversationMember, Message
from schemas import MessageCreate, MessageOut, MessagePage
from auth import get_current_user
from websocket.manager import manager

router = APIRouter(prefix="/conversations", tags=["messages"])


async def _assert_member(conv_id: PydanticObjectId, user_id: PydanticObjectId):
    member = await ConversationMember.find_one({"conversation_id": conv_id, "user_id": user_id})
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")


async def populate_message(msg: Message) -> dict:
    sender = await User.get(msg.sender_id)
    msg_dict = msg.dict()
    msg_dict["id"] = str(msg.id)
    msg_dict["conversation_id"] = str(msg.conversation_id)
    msg_dict["sender_id"] = str(msg.sender_id)
    if sender:
        msg_dict["sender"] = {**sender.dict(), "id": str(sender.id)}
    else:
        msg_dict["sender"] = None
    return msg_dict


@router.get("/{conversation_id}/messages", response_model=MessagePage)
async def get_messages(
    conversation_id: str,
    before: Optional[str] = None,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
):
    try:
        conv_oid = PydanticObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    await _assert_member(conv_oid, current_user.id)

    query = {"conversation_id": conv_oid}
    if before is not None:
        try:
            before_oid = PydanticObjectId(before)
            query["_id"] = {"$lt": before_oid}
        except Exception:
            pass

    messages = await Message.find(query).sort("-_id").limit(limit + 1).to_list()

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    # Mark messages as read
    unread_ids = [m.id for m in messages if not m.is_read and m.sender_id != current_user.id]
    if unread_ids:
        await Message.find(In(Message.id, unread_ids)).update(Set({Message.is_read: True}))

        # Notify conversation members about read receipt
        members = await ConversationMember.find(
            {"conversation_id": conv_oid, "user_id": {"$ne": current_user.id}}
        ).to_list()
        
        for member in members:
            await manager.send_to_user(str(member.user_id), {
                "type": "read_receipt",
                "conversation_id": conversation_id,
                "user_id": str(current_user.id),
            })

    messages = list(reversed(messages))  # chronological order
    
    # Populate sender
    populated_messages = [await populate_message(m) for m in messages]
    
    next_cursor = str(messages[0].id) if has_more and messages else None
    return MessagePage(messages=populated_messages, next_cursor=next_cursor)


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
):
    try:
        conv_oid = PydanticObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    await _assert_member(conv_oid, current_user.id)

    msg = Message(
        conversation_id=conv_oid,
        sender_id=current_user.id,
        content=body.content,
        message_type=body.message_type,
    )
    await msg.insert()

    populated_msg = await populate_message(msg)

    # Broadcast to all members
    members = await ConversationMember.find({"conversation_id": conv_oid}).to_list()
    
    payload = {
        "type": "message",
        **populated_msg,
        "message_type": populated_msg["message_type"].value if hasattr(populated_msg["message_type"], "value") else populated_msg["message_type"],
        "created_at": msg.created_at.isoformat(),
        "sender": {
            **populated_msg["sender"],
            "last_seen": populated_msg["sender"]["last_seen"].isoformat() if hasattr(populated_msg["sender"]["last_seen"], "isoformat") else populated_msg["sender"]["last_seen"]
        } if populated_msg["sender"] else None
    }
    
    for member in members:
        await manager.send_to_user(str(member.user_id), payload)

    return populated_msg
