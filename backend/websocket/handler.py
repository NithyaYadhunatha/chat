"""
WebSocket entry point.

Protocol
  1. Client connects to /ws (Origin must be an allowed origin).
  2. First frame must be {"type": "auth", "token": "<access token>"} within 10s.
     The token is never put in the URL, so it doesn't end up in proxy logs.
  3. Every frame afterwards is {"type": "<namespace>.<action>", ...}.
"""
import asyncio
import json
import logging

from beanie import PydanticObjectId
from beanie.operators import Or
from fastapi import HTTPException, WebSocket, WebSocketDisconnect

from auth import user_from_access_token
from config import settings
from models import Conversation, Friendship, FriendshipStatus, User, utcnow
from ratelimit import limiter
from websocket import stranger
from websocket.manager import manager

log = logging.getLogger("ws")

AUTH_TIMEOUT_SECONDS = 10
MAX_FRAME_BYTES = 8 * 1024


async def friend_ids(user_oid: PydanticObjectId) -> list[str]:
    friends = await Friendship.find(
        Friendship.status == FriendshipStatus.accepted,
        Or(Friendship.requester_id == user_oid, Friendship.receiver_id == user_oid),
    ).to_list()
    return [str(f.receiver_id if f.requester_id == user_oid else f.requester_id) for f in friends]


async def _set_presence(user: User, online: bool) -> None:
    user.is_online = online
    if not online:
        user.last_seen = utcnow()
    await user.save()
    await manager.broadcast(await friend_ids(user.id), {
        "type": "presence", "user_id": str(user.id), "online": online,
        "last_seen": user.last_seen.isoformat(),
    })


async def _dm_typing(user: User, data: dict) -> None:
    try:
        conv_oid = PydanticObjectId(str(data.get("conversation_id")))
    except Exception:
        return
    conv = await Conversation.get(conv_oid)
    if conv is None or user.id not in conv.member_ids:
        return
    for member in conv.member_ids:
        if member != user.id:
            await manager.send(str(member), {
                "type": "dm.typing", "conversation_id": str(conv.id),
                "user_id": str(user.id), "typing": bool(data.get("typing")),
            })


async def _dispatch(user: User, data: dict) -> None:
    uid = str(user.id)
    kind = data.get("type")

    if kind == "ping":
        await manager.send(uid, {"type": "pong"})
    elif kind == "stranger.join":
        await stranger.join(uid, data.get("interests"))
    elif kind == "stranger.next":
        await stranger.skip(uid, data.get("interests"))
    elif kind == "stranger.leave":
        await stranger.leave(uid)
    elif kind == "stranger.message":
        await stranger.message(uid, data.get("text"), data.get("client_id"), data.get("reply_to"))
    elif kind == "stranger.react":
        await stranger.react(uid, data.get("message_id"), data.get("emoji"))
    elif kind == "stranger.edit":
        await stranger.edit(uid, data.get("message_id"), data.get("text"))
    elif kind == "stranger.unsend":
        await stranger.unsend(uid, data.get("message_id"))
    elif kind == "stranger.seen":
        await stranger.seen(uid, data.get("message_id"))
    elif kind == "stranger.typing":
        await stranger.typing(uid, bool(data.get("typing")))
    elif kind == "stranger.connect":
        await stranger.connect(uid)
    elif kind == "stranger.play_cpu":
        await stranger.play_cpu(uid)
    elif kind == "stranger.serve":
        await stranger.serve(uid)
    elif kind == "stranger.rate":
        await stranger.rate(uid, data.get("session_id"), data.get("value"))
    elif kind == "dm.typing":
        if limiter.hit(f"dmtyping:{uid}", 12, 5):
            await _dm_typing(user, data)


def _origin_allowed(ws: WebSocket) -> bool:
    origin = (ws.headers.get("origin") or "").rstrip("/")
    # Non-browser clients send no Origin; browsers always do. Only browsers can be
    # tricked into cross-site WebSocket hijacking, so that's what we check.
    return not origin or origin in settings.allowed_origins


async def websocket_endpoint(ws: WebSocket) -> None:
    if not _origin_allowed(ws):
        await ws.close(code=4403)
        return
    await ws.accept()

    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
        frame = json.loads(raw) if len(raw) <= MAX_FRAME_BYTES else {}
        if frame.get("type") != "auth":
            raise ValueError("expected auth")
        user = await user_from_access_token(str(frame.get("token", "")))
    except (asyncio.TimeoutError, ValueError, json.JSONDecodeError, HTTPException, WebSocketDisconnect, AttributeError):
        try:
            await ws.close(code=4001)
        except Exception:
            pass
        return

    uid = str(user.id)
    previous = await manager.register(uid, ws)
    if previous is not None:
        await stranger.disconnect(uid)
        try:
            await previous.close(code=4000)  # replaced by a newer connection
        except Exception:
            pass

    await manager.send(uid, {"type": "auth.ok", "user_id": uid})
    await _set_presence(user, True)

    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME_BYTES:
                await ws.close(code=1009)
                break
            if not limiter.hit(f"ws:{uid}", 40, 5):
                continue  # flood: drop silently
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                try:
                    await _dispatch(user, data)
                except Exception:
                    log.exception("error handling %s", data.get("type"))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        removed = manager.unregister(uid, ws)
        if removed or not manager.is_connected(uid):
            await stranger.disconnect(uid)
            fresh = await User.get(user.id)
            if fresh:
                await _set_presence(fresh, False)
