"""
WebSocket event handler.
Routes events by `mode` field:
  - mode == "friends"  → friends_handler
  - mode == "stranger" → stranger_handler
  - (no mode)          → friends_handler (backwards compat)
"""
import json
from datetime import datetime, timezone
from beanie.operators import Or
from beanie import PydanticObjectId

from fastapi import WebSocket, WebSocketDisconnect

from models import User, Friendship, FriendshipStatus, ConversationMember
from websocket.manager import manager
from matching.queue import add_to_queue, remove_from_queue, try_match, is_in_queue
from matching.manager import match_manager
from moderation.filter import check_message, is_spam
from moderation.strikes import add_strike, check_ban_status


# ── Helpers ───────────────────────────────────────────────────────────────────

async def get_friend_ids(user_id: PydanticObjectId) -> list[str]:
    friends = await Friendship.find(
        {"status": FriendshipStatus.accepted},
        Or(
            {"requester_id": user_id},
            {"receiver_id": user_id},
        )
    ).to_list()

    ids = []
    for f in friends:
        ids.append(str(f.receiver_id) if f.requester_id == user_id else str(f.requester_id))
    return ids


# ── Friends event handler ─────────────────────────────────────────────────────

async def handle_friends_event(data: dict, user_id: str, user_oid: PydanticObjectId):
    event_type = data.get("type")

    if event_type == "typing":
        conv_id = data.get("conversation_id")
        is_typing = data.get("is_typing", False)

        try:
            conv_oid = PydanticObjectId(conv_id)
        except Exception:
            return

        members = await ConversationMember.find(
            {"conversation_id": conv_oid, "user_id": {"$ne": user_oid}}
        ).to_list()

        for member in members:
            await manager.send_to_user(str(member.user_id), {
                "type": "typing",
                "mode": "friends",
                "conversation_id": str(conv_id),
                "user_id": str(user_id),
                "is_typing": is_typing,
            })


# ── Stranger event handler ────────────────────────────────────────────────────

async def handle_stranger_event(data: dict, user_id: str):
    event_type = data.get("type")

    if event_type == "join_queue":
        # Check ban status first
        banned, ban_reason = await check_ban_status(user_id)
        if banned:
            await manager.send_to_user(user_id, {
                "type": "banned",
                "mode": "stranger",
                "reason": ban_reason or "You are banned from stranger chat.",
            })
            return

        # Don't add if already in session
        existing = await match_manager.get_session_for_user(user_id)
        if existing:
            await manager.send_to_user(user_id, {
                "type": "already_in_session",
                "mode": "stranger",
                "session_id": existing.session_id,
            })
            return

        await add_to_queue(user_id)
        await manager.send_to_user(user_id, {
            "type": "queued",
            "mode": "stranger",
        })

        # Try to match
        pair = await try_match()
        if pair:
            u1, u2 = pair
            session = await match_manager.create_session(u1, u2)
            matched_payload = {
                "type": "matched",
                "mode": "stranger",
                "session_id": session.session_id,
            }
            await manager.send_to_user(u1, matched_payload)
            await manager.send_to_user(u2, matched_payload)

    elif event_type == "message":
        session_id = data.get("session_id")
        content = data.get("content", "").strip()
        if not content:
            return

        session = await match_manager.get_session_for_user(user_id)
        if not session or session.session_id != session_id:
            await manager.send_to_user(user_id, {
                "type": "error",
                "mode": "stranger",
                "detail": "No active session or session mismatch",
            })
            return

        # Spam check
        if is_spam(content, session.recent_messages):
            await manager.send_to_user(user_id, {
                "type": "warning",
                "mode": "stranger",
                "reason": "You are sending too many identical messages.",
            })
            return

        # Content filter
        verdict, severity, label = check_message(content)

        if verdict == "warn":
            await manager.send_to_user(user_id, {
                "type": "warning",
                "mode": "stranger",
                "reason": f"Your message contained inappropriate content ({label}). Please keep it civil.",
            })
            # Still deliver (low severity), but with a warning
        elif verdict == "strike":
            strike_result = await add_strike(user_id, label or "policy violation")
            await manager.send_to_user(user_id, {
                "type": "warning",
                "mode": "stranger",
                "reason": strike_result.message,
            })
            if strike_result.is_banned:
                # End session + disconnect
                partner_id = session.other_user(user_id)
                await match_manager.end_session(session.session_id, reason="user_banned")
                if partner_id:
                    await manager.send_to_user(partner_id, {
                        "type": "partner_left",
                        "mode": "stranger",
                        "session_id": session.session_id,
                    })
            return  # Don't deliver struck message

        # Deliver to partner
        partner_id = session.other_user(user_id)
        if partner_id:
            await manager.send_to_user(partner_id, {
                "type": "message",
                "mode": "stranger",
                "session_id": session.session_id,
                "content": content,
                "sender_id": user_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        # Echo back to sender (for message_id consistency; sender sees own msg too)
        await manager.send_to_user(user_id, {
            "type": "message_sent",
            "mode": "stranger",
            "session_id": session.session_id,
            "content": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        await match_manager.increment_message_count(session.session_id, content)

    elif event_type == "next":
        # User wants a new partner
        session = await match_manager.get_session_for_user(user_id)
        session_id = data.get("session_id")

        if session and (not session_id or session.session_id == session_id):
            partner_id = session.other_user(user_id)
            await match_manager.end_session(session.session_id, reason="skipped")

            if partner_id:
                await manager.send_to_user(partner_id, {
                    "type": "partner_left",
                    "mode": "stranger",
                    "session_id": session.session_id,
                })

        # Re-queue this user
        banned, ban_reason = await check_ban_status(user_id)
        if banned:
            await manager.send_to_user(user_id, {
                "type": "banned",
                "mode": "stranger",
                "reason": ban_reason or "You are banned from stranger chat.",
            })
            return

        await add_to_queue(user_id)
        await manager.send_to_user(user_id, {
            "type": "queued",
            "mode": "stranger",
        })

        pair = await try_match()
        if pair:
            u1, u2 = pair
            new_session = await match_manager.create_session(u1, u2)
            matched_payload = {
                "type": "matched",
                "mode": "stranger",
                "session_id": new_session.session_id,
            }
            await manager.send_to_user(u1, matched_payload)
            await manager.send_to_user(u2, matched_payload)

    elif event_type == "leave":
        # User explicitly leaves (goes back to idle)
        session = await match_manager.get_session_for_user(user_id)
        if session:
            partner_id = session.other_user(user_id)
            await match_manager.end_session(session.session_id, reason="left")
            if partner_id:
                await manager.send_to_user(partner_id, {
                    "type": "partner_left",
                    "mode": "stranger",
                    "session_id": session.session_id,
                })
        # Also remove from queue if queued
        await remove_from_queue(user_id)


# ── Main handler ──────────────────────────────────────────────────────────────

async def handle_websocket(websocket: WebSocket, user_id: str):
    user_oid = PydanticObjectId(user_id)
    await manager.connect(user_id, websocket)

    # Mark online
    user = await User.get(user_oid)
    if user:
        user.is_online = True
        await user.save()

        friend_ids = await get_friend_ids(user_oid)
        await manager.broadcast_to_users(friend_ids, {
            "type": "presence",
            "mode": "friends",
            "user_id": user_id,
            "is_online": True,
        })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue

            mode = data.get("mode", "friends")

            if mode == "stranger":
                await handle_stranger_event(data, user_id)
            else:
                # Default: friends mode
                await handle_friends_event(data, user_id, user_oid)

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id)

        # Clean up stranger state
        await remove_from_queue(user_id)
        session = await match_manager.get_session_for_user(user_id)
        if session:
            partner_id = session.other_user(user_id)
            await match_manager.end_session(session.session_id, reason="disconnected")
            if partner_id:
                await manager.send_to_user(partner_id, {
                    "type": "partner_left",
                    "mode": "stranger",
                    "session_id": session.session_id,
                })

        # Mark offline
        user = await User.get(user_oid)
        if user:
            user.is_online = False
            user.last_seen = datetime.now(timezone.utc)
            await user.save()

            friend_ids = await get_friend_ids(user_oid)
            await manager.broadcast_to_users(friend_ids, {
                "type": "presence",
                "mode": "friends",
                "user_id": user_id,
                "is_online": False,
            })
