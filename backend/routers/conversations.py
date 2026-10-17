from collections import OrderedDict
from typing import Dict, List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from messaging import EDIT_WINDOW, valid_reaction
from models import Conversation, LastMessageEmbed, Message, ReportReason, User, as_utc, utcnow
from moderation import enforcement
from moderation.engine import ParticipantState, evaluate
from moderation.normalize import clean_user_text
from ratelimit import limiter
from routers.friends import are_friends, is_blocked_either_way
from schemas import MessageCreate, MessageEdit, ReactionSet, StartConversationRequest, public_user
from websocket.manager import manager
from websocket.stranger import SUPPORT_MESSAGE

router = APIRouter(prefix="/conversations", tags=["conversations"])

MAX_DM_LENGTH = 4000

# Per-conversation moderation context (sexual score, repeats...). Bounded LRU.
_dm_context: "OrderedDict[str, Dict[str, ParticipantState]]" = OrderedDict()


def _context(conv_id: str) -> Dict[str, ParticipantState]:
    ctx = _dm_context.pop(conv_id, None) or {}
    _dm_context[conv_id] = ctx
    while len(_dm_context) > 5000:
        _dm_context.popitem(last=False)
    return ctx


def _oid(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def message_out(m: Message, replied: Optional[Message] = None) -> dict:
    deleted = m.deleted_at is not None
    out = {
        "id": str(m.id), "conversation_id": str(m.conversation_id), "sender_id": str(m.sender_id),
        "content": "" if deleted else m.content, "is_read": m.is_read, "created_at": as_utc(m.created_at),
        "edited": m.edited_at is not None, "deleted": deleted,
        "reactions": [{"user_id": uid, "emoji": e} for uid, e in m.reactions.items()] if not deleted else [],
        "reply_to": None,
    }
    if m.reply_to_id:
        out["reply_to"] = {
            "id": str(m.reply_to_id),
            "sender_id": str(replied.sender_id) if replied else None,
            "content": (replied.content[:160] if replied and not replied.deleted_at else ""),
            "deleted": replied is None or replied.deleted_at is not None,
        }
    return out


async def messages_out(msgs: List[Message]) -> List[dict]:
    reply_ids = list({m.reply_to_id for m in msgs if m.reply_to_id})
    replied = {r.id: r for r in await Message.find({"_id": {"$in": reply_ids}}).to_list()} if reply_ids else {}
    return [message_out(m, replied.get(m.reply_to_id)) for m in msgs]


async def _own_message(conv: Conversation, message_id: str, user: User) -> Message:
    msg = await Message.get(_oid(message_id))
    if msg is None or msg.conversation_id != conv.id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != user.id:
        raise HTTPException(status_code=403, detail="You can only change your own messages")
    if msg.deleted_at:
        raise HTTPException(status_code=409, detail="That message was unsent")
    return msg


async def _broadcast(conv: Conversation, user: User, event: dict) -> None:
    for member in conv.member_ids:
        if member != user.id:
            await manager.send(str(member), event)


async def _member_conversation(conv_id: str, user: User) -> Conversation:
    conv = await Conversation.get(_oid(conv_id))
    if conv is None or user.id not in conv.member_ids:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _other_id(conv: Conversation, user: User) -> Optional[PydanticObjectId]:
    return next((m for m in conv.member_ids if m != user.id), None)


async def _can_message(user_id: PydanticObjectId, other_id: PydanticObjectId) -> bool:
    return await are_friends(user_id, other_id) and not await is_blocked_either_way(user_id, other_id)


async def conversation_out(conv: Conversation, user: User) -> Optional[dict]:
    other_id = _other_id(conv, user)
    other = await User.get(other_id) if other_id else None
    if other is None:
        return None
    last = conv.last_message
    return {
        "id": str(conv.id),
        "other_user": public_user(other),
        "last_message": {"id": last.id, "sender_id": last.sender_id, "content": last.content,
                         "created_at": as_utc(last.created_at)} if last else None,
        "unread_count": conv.unread_counts.get(str(user.id), 0),
        "updated_at": as_utc(conv.updated_at),
        "can_message": not other.is_suspended and await _can_message(user.id, other.id),
    }


@router.get("")
async def list_conversations(user: User = Depends(get_current_user)):
    convs = await Conversation.find({"member_ids": user.id}).sort("-updated_at").limit(200).to_list()
    return [c for c in [await conversation_out(conv, user) for conv in convs] if c]


@router.post("", status_code=201)
async def start_conversation(body: StartConversationRequest, user: User = Depends(get_current_user)):
    other_id = _oid(body.user_id)
    if other_id == user.id or not await _can_message(user.id, other_id):
        raise HTTPException(status_code=403, detail="You can only message friends")
    conv = await Conversation.find_one({"member_ids": {"$all": [user.id, other_id]}})
    if conv is None:
        conv = Conversation(member_ids=[user.id, other_id])
        await conv.insert()
    return await conversation_out(conv, user)


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user: User = Depends(get_current_user)):
    out = await conversation_out(await _member_conversation(conversation_id, user), user)
    if out is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return out


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, before: Optional[str] = None, limit: int = 40,
                       user: User = Depends(get_current_user)):
    conv = await _member_conversation(conversation_id, user)
    limit = max(1, min(limit, 100))
    query: dict = {"conversation_id": conv.id}
    if before:
        query["_id"] = {"$lt": _oid(before)}

    page = await Message.find(query).sort("-_id").limit(limit + 1).to_list()
    has_more = len(page) > limit
    page = list(reversed(page[:limit]))

    unread = [m.id for m in page if not m.is_read and m.sender_id != user.id]
    if unread or conv.unread_counts.get(str(user.id)):
        if unread:
            await Message.find({"_id": {"$in": unread}}).update({"$set": {"is_read": True}})
        conv.unread_counts[str(user.id)] = 0
        await conv.save()
        for member in conv.member_ids:
            if member != user.id:
                await manager.send(str(member), {"type": "dm.read", "conversation_id": str(conv.id),
                                                 "user_id": str(user.id)})

    return {"messages": await messages_out(page),
            "next_cursor": str(page[0].id) if has_more and page else None}


@router.post("/{conversation_id}/read", status_code=204)
async def mark_read(conversation_id: str, user: User = Depends(get_current_user)):
    conv = await _member_conversation(conversation_id, user)
    await Message.find({"conversation_id": conv.id, "sender_id": {"$ne": user.id}, "is_read": False}).update(
        {"$set": {"is_read": True}})
    if conv.unread_counts.get(str(user.id)):
        conv.unread_counts[str(user.id)] = 0
        await conv.save()
    other = _other_id(conv, user)
    if other:
        await manager.send(str(other), {"type": "dm.read", "conversation_id": str(conv.id), "user_id": str(user.id)})


@router.post("/{conversation_id}/messages", status_code=201)
async def send_message(conversation_id: str, body: MessageCreate, user: User = Depends(get_current_user)):
    conv = await _member_conversation(conversation_id, user)
    other_id = _other_id(conv, user)
    if other_id is None or not await _can_message(user.id, other_id):
        raise HTTPException(status_code=403, detail="You can only message friends")
    limiter.enforce(f"dm:{user.id}", 8, 5, "You're sending messages too fast.")

    text = clean_user_text(body.content, MAX_DM_LENGTH)
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")

    ctx = _context(str(conv.id))
    me = ctx.setdefault(str(user.id), ParticipantState())
    partner = ctx.setdefault(str(other_id), ParticipantState())
    verdict = evaluate(text, me, partner, mode="dm")
    category = verdict.categories[0] if verdict.categories else "policy"

    if verdict.critical:
        await enforcement.suspend(user, verdict.reason or "child safety", "dm", category, excerpt=text)
        await enforcement.open_system_report(user.id, ReportReason.minor, f"Auto-suspended in DMs: {verdict.reason}",
                                             3, [], source="dm")
        await manager.close(str(user.id))
        raise HTTPException(status_code=403, detail="Account suspended")
    if verdict.urgent_review:
        await enforcement.open_system_report(user.id, ReportReason.sexual, verdict.reason or "", 3, [], source="dm")
    if verdict.strike > 0:
        await enforcement.add_strike(user, verdict.strike, category, "dm", verdict.reason or category, excerpt=text)
    if not verdict.deliver:
        raise HTTPException(status_code=422, detail=verdict.notice or "Message not allowed")

    replied = None
    if body.reply_to:
        replied = await Message.get(_oid(body.reply_to))
        if replied is None or replied.conversation_id != conv.id:
            replied = None
    msg = Message(conversation_id=conv.id, sender_id=user.id, content=text,
                  reply_to_id=replied.id if replied else None)
    await msg.insert()
    conv.last_message = LastMessageEmbed(id=str(msg.id), sender_id=str(user.id), content=text[:200],
                                         created_at=msg.created_at)
    conv.updated_at = utcnow()
    conv.unread_counts[str(other_id)] = conv.unread_counts.get(str(other_id), 0) + 1
    await conv.save()

    out = message_out(msg, replied)
    await manager.send(str(other_id), {"type": "dm.message", "message": out})
    if verdict.notice:
        out["notice"] = verdict.notice
    if verdict.support:
        out["support"] = SUPPORT_MESSAGE
    return out


@router.patch("/{conversation_id}/messages/{message_id}")
async def edit_message(conversation_id: str, message_id: str, body: MessageEdit, user: User = Depends(get_current_user)):
    conv = await _member_conversation(conversation_id, user)
    msg = await _own_message(conv, message_id, user)
    if utcnow() - as_utc(msg.created_at) > EDIT_WINDOW:
        raise HTTPException(status_code=403, detail="Messages can only be edited for 15 minutes")
    limiter.enforce(f"dmedit:{user.id}", 10, 60)

    text = clean_user_text(body.content, MAX_DM_LENGTH)
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    if text == msg.content:
        return message_out(msg)

    other_id = _other_id(conv, user)
    ctx = _context(str(conv.id))
    verdict = evaluate(text, ctx.setdefault(str(user.id), ParticipantState()),
                       ctx.setdefault(str(other_id), ParticipantState()), mode="dm")
    if verdict.strike > 0:
        await enforcement.add_strike(user, verdict.strike, verdict.categories[0] if verdict.categories else "policy",
                                     "dm", verdict.reason or "edit", excerpt=text)
    if not verdict.deliver or verdict.critical:
        raise HTTPException(status_code=422, detail=verdict.notice or "That edit isn't allowed")

    msg.previous_versions.append(msg.content)
    msg.content, msg.edited_at = text, utcnow()
    await msg.save()
    if conv.last_message and conv.last_message.id == str(msg.id):
        conv.last_message.content = text[:200]
        await conv.save()
    replied = await Message.get(msg.reply_to_id) if msg.reply_to_id else None
    out = message_out(msg, replied)
    await _broadcast(conv, user, {"type": "dm.edited", "message": out})
    return out


@router.delete("/{conversation_id}/messages/{message_id}", status_code=204)
async def unsend_message(conversation_id: str, message_id: str, user: User = Depends(get_current_user)):
    """Unsend for everyone. The original text is kept privately so it can still be reported."""
    conv = await _member_conversation(conversation_id, user)
    msg = await _own_message(conv, message_id, user)
    msg.deleted_at = utcnow()
    msg.reactions = {}
    await msg.save()
    if conv.last_message and conv.last_message.id == str(msg.id):
        conv.last_message.content = "Message unsent"
        await conv.save()
    await _broadcast(conv, user, {"type": "dm.deleted", "conversation_id": str(conv.id), "message_id": str(msg.id)})


@router.put("/{conversation_id}/messages/{message_id}/reaction")
async def react_to_message(conversation_id: str, message_id: str, body: ReactionSet, user: User = Depends(get_current_user)):
    conv = await _member_conversation(conversation_id, user)
    msg = await Message.get(_oid(message_id))
    if msg is None or msg.conversation_id != conv.id or msg.deleted_at:
        raise HTTPException(status_code=404, detail="Message not found")
    if not valid_reaction(body.emoji):
        raise HTTPException(status_code=400, detail="Unsupported reaction")
    limiter.enforce(f"dmreact:{user.id}", 30, 10)

    key = str(user.id)
    if body.emoji is None or msg.reactions.get(key) == body.emoji:
        msg.reactions.pop(key, None)
    else:
        msg.reactions[key] = body.emoji
    await msg.save()
    reactions = [{"user_id": uid, "emoji": e} for uid, e in msg.reactions.items()]
    await _broadcast(conv, user, {"type": "dm.reaction", "conversation_id": str(conv.id),
                                  "message_id": str(msg.id), "reactions": reactions})
    return {"message_id": str(msg.id), "reactions": reactions}
