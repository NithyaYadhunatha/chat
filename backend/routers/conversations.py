from fastapi import APIRouter, Depends, HTTPException
from typing import List
from beanie import PydanticObjectId

from models import User, Conversation, ConversationMember, Message
from schemas import ConversationCreate, ConversationOut
from auth import get_current_user

router = APIRouter(prefix="/conversations", tags=["conversations"])


async def _get_or_create_dm(user_a: PydanticObjectId, user_b: PydanticObjectId) -> Conversation:
    """Return existing DM conversation between two users or create one."""
    members_a = await ConversationMember.find({"user_id": user_a}).to_list()
    conv_ids_a = [m.conversation_id for m in members_a]

    member_b = await ConversationMember.find_one(
        {"user_id": user_b, "conversation_id": {"$in": conv_ids_a}}
    )

    if member_b:
        return await Conversation.get(member_b.conversation_id)

    conv = Conversation()
    await conv.insert()

    await ConversationMember(conversation_id=conv.id, user_id=user_a).insert()
    await ConversationMember(conversation_id=conv.id, user_id=user_b).insert()

    return conv


@router.post("", status_code=201)
async def create_or_get_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
):
    try:
        target_oid = PydanticObjectId(body.user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")
        
    other = await User.get(target_oid)
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    conv = await _get_or_create_dm(current_user.id, target_oid)
    return {"conversation_id": str(conv.id)}


@router.get("", response_model=List[ConversationOut])
async def list_conversations(
    current_user: User = Depends(get_current_user),
):
    members = await ConversationMember.find({"user_id": current_user.id}).to_list()
    conv_ids = [m.conversation_id for m in members]
    if not conv_ids:
        return []

    conversations = await Conversation.find({"_id": {"$in": conv_ids}}).sort("-id").to_list()

    output = []
    for conv in conversations:
        conv_members = await ConversationMember.find({"conversation_id": conv.id}).to_list()
        other_member_link = next((m for m in conv_members if m.user_id != current_user.id), None)
        if not other_member_link:
            continue

        other_member = await User.get(other_member_link.user_id)
        if not other_member:
            continue

        messages = await Message.find({"conversation_id": conv.id}).sort("created_at").to_list()
        last_message = messages[-1] if messages else None

        if last_message:
            last_message_sender = await User.get(last_message.sender_id)
            last_msg_dict = last_message.dict()
            last_msg_dict["id"] = str(last_message.id)
            last_msg_dict["conversation_id"] = str(last_message.conversation_id)
            last_msg_dict["sender_id"] = str(last_message.sender_id)
            if last_message_sender:
                last_msg_dict["sender"] = {**last_message_sender.dict(), "id": str(last_message_sender.id)}
            else:
                last_msg_dict["sender"] = None
            last_message = last_msg_dict

        unread_count = sum(
            1 for m in messages
            if not m.is_read and m.sender_id != current_user.id
        )

        output.append(
            {
                "id": str(conv.id),
                "created_at": conv.created_at,
                "other_user": {**other_member.dict(), "id": str(other_member.id)},
                "last_message": last_message,
                "unread_count": unread_count,
            }
        )
    return output
