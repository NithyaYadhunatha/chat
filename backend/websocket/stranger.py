"""
Stranger chat: queueing, matching, relaying messages through moderation, and
acting on what moderation finds.

Partners are anonymous to each other — no user id, username or avatar ever
crosses the wire until both people press "connect".
"""
import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional, Set, Tuple

from beanie import PydanticObjectId
from beanie.operators import Or

from auth import age_on
from bots import service as bots
from config import settings
from matching import icebreakers
from matching.matchmaker import matchmaker
from matching.sessions import ActiveSession, Line, sessions
from messaging import EDIT_WINDOW, valid_reaction
from models import (
    Block, ChatSession, Conversation, Friendship, FriendshipStatus, ReportReason, User, utcnow,
)
from moderation import ai, enforcement
from moderation.engine import Verdict, check_profile_text, evaluate
from moderation.normalize import clean_user_text, normalize
from moderation.trust import is_low_trust
from ratelimit import limiter
from websocket.manager import manager

log = logging.getLogger("stranger")

MAX_MESSAGE_LENGTH = 1000
MAX_INTERESTS = 5
MIN_MESSAGES_BEFORE_CONNECT = 6
SERVE_COOLDOWN_SECONDS = 8

# Copy-paste bot detection: the same longish opener sent to many different
# strangers in a short window is a spam bot, whatever the text says.
BOT_MIN_LENGTH = 30
BOT_SESSIONS = 5          # same text in this many different chats → stop relaying it
BOT_STRIKE_SESSIONS = 10  # ...and in this many → it's a bot: strike + end chat
BOT_WINDOW_SECONDS = 15 * 60
_recent_texts: Dict[str, Deque[Tuple[str, str, float]]] = defaultdict(lambda: deque(maxlen=40))

SUPPORT_MESSAGE = (
    "It sounds like things might be really hard right now. You don't have to go through it alone. "
    "If you're in danger, contact local emergency services. In India you can call Tele-MANAS on 14416 "
    "or KIRAN on 1800-599-0019; in the US call or text 988; elsewhere, findahelpline.com lists free, "
    "confidential lines."
)


async def _send(user_id: str, type_: str, **data) -> None:
    await manager.send(user_id, {"type": type_, **data})


def clean_interests(raw) -> List[str]:
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw[:MAX_INTERESTS * 2]:
        if not isinstance(item, str):
            continue
        tag = " ".join(clean_user_text(item, 24).lower().split())
        if 2 <= len(tag) <= 24 and tag not in out and check_profile_text(tag) is None:
            out.append(tag)
        if len(out) >= MAX_INTERESTS:
            break
    return out


async def _excluded_for(user_oid: PydanticObjectId) -> Set[str]:
    blocks = await Block.find(Or(Block.blocker_id == user_oid, Block.blocked_id == user_oid)).to_list()
    return {str(b.blocked_id if b.blocker_id == user_oid else b.blocker_id) for b in blocks}


# ── Queue ─────────────────────────────────────────────────────────────────────

async def join(user_id: str, interests_raw) -> None:
    if not limiter.hit(f"join:{user_id}", 8, 10):
        await _send(user_id, "error", code="rate_limited", detail="Slow down a little.")
        return

    user = await User.get(PydanticObjectId(user_id))
    if user is None:
        return

    ban = enforcement.chat_ban_status(user)
    if ban.banned:
        await manager.send(user_id, ban.to_event())
        return

    if not user.birth_date or not user.accepted_rules_at:
        await _send(user_id, "error", code="onboarding_required",
                    detail="Confirm your date of birth and accept the rules first.")
        return
    if age_on(user.birth_date) < settings.MIN_AGE:
        await _send(user_id, "error", code="underage", detail="Stranger chat is for adults 18+.")
        return

    current = sessions.for_user(user_id)
    if current:
        await _send(user_id, "stranger.matched", session_id=current.session_id,
                    common_interests=current.common_interests, resumed=True)
        return

    interests = clean_interests(interests_raw) if interests_raw is not None else list(user.interests)
    await matchmaker.join(user_id, set(interests), await _excluded_for(user.id), low_trust=is_low_trust(user))
    await _send(user_id, "stranger.searching", interests=interests)
    await run_matching()


async def run_matching() -> None:
    for u, v, common in await matchmaker.take_pairs():
        if not (manager.is_connected(u.user_id) and manager.is_connected(v.user_id)):
            # Someone vanished between queueing and matching — put the other back.
            for w in (u, v):
                if manager.is_connected(w.user_id):
                    await matchmaker.join(w.user_id, w.interests, w.excluded, w.low_trust)
            continue
        session = await sessions.create(u.user_id, v.user_id, common, icebreakers.pick())
        session.last_serve = time.monotonic()
        for uid in (u.user_id, v.user_id):
            await _send(uid, "stranger.matched", session_id=session.session_id, common_interests=common,
                        icebreaker=session.icebreaker)


async def start_cpu_match(user_id: str) -> None:
    """Pair a waiting person with a CPU (a clearly-labelled practice bot)."""
    bot_id = bots.pick_bot()
    if bot_id is None or not manager.is_connected(user_id):
        return
    session = await sessions.create(user_id, bot_id, [], icebreakers.pick())
    session.last_serve = time.monotonic()
    bots.attach(session, bot_id)
    await _send(user_id, "stranger.matched", session_id=session.session_id, common_interests=[],
                icebreaker=session.icebreaker, cpu=True)
    asyncio.create_task(bots.start(session, _send))


async def play_cpu(user_id: str) -> None:
    """Skip the wait and play the CPU now (only from the queue)."""
    if settings.BOTS_ENABLED and await matchmaker.take(user_id):
        await start_cpu_match(user_id)


async def matching_loop() -> None:
    """Background task: keeps matching people, and offers the CPU to anyone who's waited too long."""
    while True:
        try:
            await run_matching()
            if settings.BOTS_ENABLED:
                for w in await matchmaker.take_stale(settings.BOT_AFTER_SECONDS):
                    await start_cpu_match(w.user_id)
        except Exception:
            log.exception("matching loop error")
        await asyncio.sleep(1.0)


async def end_session(session: ActiveSession, reason: str, actor: Optional[str] = None,
               partner_reason: str = "partner_left") -> None:
    if await sessions.end(session.session_id, reason) is None:
        return
    for p in (session.a, session.b):
        if p.user_id == actor:
            await _send(p.user_id, "stranger.ended", session_id=session.session_id, reason=reason)
        else:
            await _send(p.user_id, "stranger.ended", session_id=session.session_id,
                        reason=partner_reason if actor else reason)
        await _send(p.user_id, "stranger.typing", typing=False)


async def leave(user_id: str) -> None:
    await matchmaker.leave(user_id)
    session = sessions.for_user(user_id)
    if session:
        await end_session(session, "left", actor=user_id)
    await _send(user_id, "stranger.idle")


async def skip(user_id: str, interests_raw) -> None:
    if not limiter.hit(f"skip:{user_id}", 1, 1.0):
        return
    session = sessions.for_user(user_id)
    if session:
        await end_session(session, "skipped", actor=user_id)
    await join(user_id, interests_raw)


async def disconnect(user_id: str) -> None:
    await matchmaker.leave(user_id)
    session = sessions.for_user(user_id)
    if session:
        await end_session(session, "disconnected", actor=user_id)


# ── Messages ─────────────────────────────────────────────────────────────────

async def typing(user_id: str, is_typing: bool) -> None:
    session = sessions.for_user(user_id)
    if session and limiter.hit(f"typing:{user_id}", 12, 5):
        await _send(session.partner(user_id).user_id, "stranger.typing", typing=bool(is_typing))


async def message(user_id: str, raw_text, client_id, reply_to=None) -> None:
    client_id = str(client_id)[:64] if client_id is not None else None
    session = sessions.for_user(user_id)
    if session is None:
        await _send(user_id, "stranger.rejected", client_id=client_id, notice="You're not in a chat.")
        return

    if not (limiter.hit(f"msg:{user_id}", 5, 3) and limiter.hit(f"msg-min:{user_id}", 45, 60)):
        await _send(user_id, "stranger.rejected", client_id=client_id,
                    notice="You're sending messages too fast.")
        return

    text = clean_user_text(raw_text if isinstance(raw_text, str) else "", MAX_MESSAGE_LENGTH)
    if not text:
        return

    me, partner = session.me(user_id), session.partner(user_id)
    verdict = evaluate(text, me.mod, partner.mod, mode="stranger")
    spread = _paste_spread(user_id, session.session_id, text) if verdict.deliver else 0
    if spread >= BOT_SESSIONS:
        verdict.deliver = False
        verdict.categories.append("bot_spam")
        verdict.reason = "same message pasted to many strangers"
        verdict.notice = "You've sent that exact message to a lot of people. Say something to this person instead."
        if spread >= BOT_STRIKE_SESSIONS:
            verdict.strike = max(verdict.strike, 1.0)
            verdict.end_session = True

    now = utcnow()
    quoted = session.line(reply_to)
    reply_id = quoted.id if quoted and not quoted.blocked else None
    line = Line(user_id, text, now, blocked=not verdict.deliver, reply_to=reply_id)
    session.transcript.append(line)

    if verdict.deliver:
        session.message_count += 1
        if session.bot is not None:
            bots.on_human_message(session, _send, text)
        await _send(partner.user_id, "stranger.message", id=line.id, text=text, at=now.isoformat(), reply_to=reply_id)
        await _send(user_id, "stranger.ack", client_id=client_id, id=line.id, at=now.isoformat(), reply_to=reply_id)
        await _send(partner.user_id, "stranger.typing", typing=False)
        if verdict.notice:
            await _send(user_id, "stranger.notice", level="warning", text=verdict.notice)
    else:
        await _send(user_id, "stranger.rejected", client_id=client_id, notice=verdict.notice)

    if verdict.support:
        await _send(user_id, "stranger.support", text=SUPPORT_MESSAGE)

    if verdict.flagged:
        if verdict.strike > 0 or verdict.critical or verdict.minor_detected or verdict.urgent_review:
            session.flagged = True  # real violations block "Add friend"; a merely blocked message doesn't
        await _enforce(session, user_id, text, verdict)

    _maybe_schedule_ai_review(session, verdict)


async def _enforce(session: ActiveSession, user_id: str, text: str, v: Verdict) -> None:
    """Apply consequences for a rule-based verdict on a message from `user_id`."""
    user = await User.get(PydanticObjectId(user_id))
    if user is None:
        return
    sid = PydanticObjectId(session.session_id)
    partner_id = session.partner(user_id).user_id
    category = v.categories[0] if v.categories else "policy"

    if v.critical:
        await enforcement.suspend(user, v.reason or "child safety", "stranger", category, excerpt=text, session_id=sid)
        await enforcement.open_system_report(user.id, ReportReason.minor, f"Auto-suspended: {v.reason}", 3,
                                             session.neutral_evidence(), session_id=sid)
        await end_session(session, "moderation", actor=user_id, partner_reason="moderation")
        await _send(user_id, "account.suspended", reason="Your account has been suspended pending review.")
        await close_user(user_id)
        return

    if v.minor_detected:
        await enforcement.require_age_review(user, "stranger", text, session_id=sid)
        await end_session(session, "safety", actor=user_id, partner_reason="safety")
        await manager.send(user_id, enforcement.chat_ban_status(user).to_event())
        if v.escalate_partner:
            partner = await User.get(PydanticObjectId(partner_id))
            if partner:
                await enforcement.open_system_report(
                    partner.id, ReportReason.minor,
                    "Sexual remarks in a chat where the other person said they were under 18.", 3,
                    session.neutral_evidence(), session_id=sid)
                status = await enforcement.add_strike(partner, 3.0, "sexual_minor", "stranger",
                                                      "sexual remarks to a minor", session_id=sid)
                if status.banned:
                    await manager.send(partner_id, status.to_event())
        return

    if v.urgent_review:
        await enforcement.open_system_report(user.id, ReportReason.sexual, v.reason or "", 3,
                                             session.neutral_evidence(), session_id=sid)

    status = None
    if v.strike > 0:
        status = await enforcement.add_strike(user, v.strike, category, "stranger", v.reason or category,
                                              excerpt=text, session_id=sid)

    if v.end_session or (status and status.banned):
        await end_session(session, "moderation", actor=user_id, partner_reason="moderation")
    if status and status.banned:
        await manager.send(user_id, status.to_event())


def _paste_spread(user_id: str, session_id: str, text: str) -> int:
    """How many different chats this user has sent this exact (longish) text to recently."""
    if len(text) < BOT_MIN_LENGTH:
        return 0
    key = normalize(text).collapsed
    now = time.monotonic()
    history = _recent_texts[user_id]
    history.append((key, session_id, now))
    return len({sid for k, sid, t in history if k == key and now - t < BOT_WINDOW_SECONDS})


# ── Reactions, edits, unsends, read receipts ─────────────────────────────────

def _relative(viewer: str, author: str) -> str:
    return "you" if viewer == author else "stranger"


async def react(user_id: str, message_id, emoji) -> None:
    session = sessions.for_user(user_id)
    line = session.line(message_id) if session else None
    if line is None or line.blocked or line.deleted or not valid_reaction(emoji):
        return
    if not limiter.hit(f"react:{user_id}", 20, 10):
        return
    if emoji is None or line.reactions.get(user_id) == emoji:
        line.reactions.pop(user_id, None)
        emoji = None
    else:
        line.reactions[user_id] = emoji
    for p in (session.a, session.b):
        await _send(p.user_id, "stranger.reaction", message_id=line.id, by=_relative(p.user_id, user_id), emoji=emoji)


async def edit(user_id: str, message_id, raw_text) -> None:
    session = sessions.for_user(user_id)
    line = session.line(message_id) if session else None
    if line is None or line.author != user_id or line.blocked or line.deleted:
        return
    if utcnow() - line.at > EDIT_WINDOW:
        await _send(user_id, "stranger.edit_rejected", message_id=line.id, notice="Messages can only be edited for 15 minutes.")
        return
    if not limiter.hit(f"edit:{user_id}", 6, 30):
        return
    text = clean_user_text(raw_text if isinstance(raw_text, str) else "", MAX_MESSAGE_LENGTH)
    if not text or text == line.text:
        return

    # An edit is a new message as far as moderation is concerned.
    me, partner = session.me(user_id), session.partner(user_id)
    verdict = evaluate(text, me.mod, partner.mod, mode="stranger")
    if not verdict.deliver:
        await _send(user_id, "stranger.edit_rejected", message_id=line.id, notice=verdict.notice or "That edit isn't allowed.")
        if verdict.flagged:
            session.transcript.append(Line(user_id, f"[attempted edit] {text}", utcnow(), blocked=True))
            await _enforce(session, user_id, text, verdict)
        return

    line.history.append(line.text)
    line.text, line.edited = text, True
    for p in (session.a, session.b):
        await _send(p.user_id, "stranger.edited", message_id=line.id, text=text)


async def unsend(user_id: str, message_id) -> None:
    session = sessions.for_user(user_id)
    line = session.line(message_id) if session else None
    if line is None or line.author != user_id or line.deleted:
        return
    line.deleted = True  # the text stays in the private transcript so it can still be reported
    for p in (session.a, session.b):
        await _send(p.user_id, "stranger.unsent", message_id=line.id)


async def seen(user_id: str, message_id) -> None:
    session = sessions.for_user(user_id)
    line = session.line(message_id) if session else None
    if line is None or line.author == user_id or not limiter.hit(f"seen:{user_id}", 10, 5):
        return
    await _send(line.author, "stranger.seen", message_id=line.id)


# ── Serve & rate ──────────────────────────────────────────────────────────────

async def serve(user_id: str) -> None:
    """Serve a new conversation starter that both players see."""
    session = sessions.for_user(user_id)
    if session is None or time.monotonic() - session.last_serve < SERVE_COOLDOWN_SECONDS:
        return
    session.last_serve = time.monotonic()
    session.icebreaker = icebreakers.pick(exclude=session.icebreaker)
    for p in (session.a, session.b):
        await _send(p.user_id, "stranger.serve", text=session.icebreaker,
                    by="you" if p.user_id == user_id else "stranger")
    if session.bot is not None:
        bots.on_human_message(session, _send, session.icebreaker)


async def rate(user_id: str, session_id, value) -> None:
    """Private thumbs up/down after a chat. One per person per chat; never shown to anyone."""
    if value not in (1, -1) or not isinstance(session_id, str):
        return
    session = sessions.find(session_id)
    if session is None or not session.has(user_id) or user_id in session.ratings:
        return
    if session.message_count < 2:
        return  # a chat that never started isn't worth rating
    session.ratings[user_id] = value
    partner_id = session.partner(user_id).user_id

    partner = None if bots.is_bot(partner_id) else await User.get(PydanticObjectId(partner_id))
    if partner:
        await partner.inc({User.rating_up if value > 0 else User.rating_down: 1})
    try:
        record = await ChatSession.get(PydanticObjectId(session_id))
        if record:
            field = "rating_by_user1" if str(record.user1_id) == user_id else "rating_by_user2"
            setattr(record, field, value)
            await record.save()
    except Exception:
        pass
    await _send(user_id, "stranger.rated", session_id=session_id, value=value)


# ── AI monitor ────────────────────────────────────────────────────────────────

def _maybe_schedule_ai_review(session: ActiveSession, verdict: Verdict) -> None:
    if not settings.ai_moderation_enabled or session.ai_running or session.bot is not None:
        return
    session.lines_since_review += 1
    interesting = bool(verdict.categories) or session.a.mod.sexual_score > 0 or session.b.mod.sexual_score > 0
    due = time.monotonic() - session.last_ai_review >= settings.AI_MODERATION_INTERVAL_SECONDS
    if due and (interesting or session.lines_since_review >= 6):
        session.ai_running = True
        session.lines_since_review = 0
        session.last_ai_review = time.monotonic()
        asyncio.create_task(_ai_review(session))


async def _ai_review(session: ActiveSession) -> None:
    try:
        result = await ai.review_conversation(session.ai_window())
        if result is not None:
            await _apply_ai_verdict(session, result)
    except Exception:
        log.exception("AI review failed")
    finally:
        session.ai_running = False


def _sides(session: ActiveSession, label: str) -> List[str]:
    return {"A": [session.a.user_id], "B": [session.b.user_id],
            "both": [session.a.user_id, session.b.user_id]}.get(label, [])


async def _apply_ai_verdict(session: ActiveSession, r: ai.AIVerdict) -> None:
    sid = PydanticObjectId(session.session_id)
    live = sessions.for_user(session.a.user_id) is session

    for uid in _sides(session, r.minor_suspected):
        user = await User.get(PydanticObjectId(uid))
        if user and not user.age_review_required:
            session.me(uid).mod.said_minor = True
            await enforcement.require_age_review(user, "ai", r.rationale, session_id=sid)
            await manager.send(uid, enforcement.chat_ban_status(user).to_event())
            if live:
                await end_session(session, "safety", actor=uid, partner_reason="safety")
                live = False

    if r.category == "self_harm_risk":
        for uid in _sides(session, r.offender):
            await _send(uid, "stranger.support", text=SUPPORT_MESSAGE)
        return

    if not r.actionable:
        return

    session.flagged = True
    high = r.severity == "high"
    points = {
        "sexual_minor": 3.0, "grooming": 3.0, "sexual": 2.0 if high else 1.5, "threat": 2.0,
        "self_harm_incite": 2.0, "hate": 1.5, "harassment": 1.5 if high else 1.0, "scam": 0.5,
    }.get(r.category, 1.0)
    reason = {"sexual_minor": ReportReason.minor, "grooming": ReportReason.minor, "sexual": ReportReason.sexual,
              "threat": ReportReason.threats, "self_harm_incite": ReportReason.self_harm, "hate": ReportReason.harassment,
              "harassment": ReportReason.harassment, "scam": ReportReason.spam}.get(r.category, ReportReason.other)

    for uid in _sides(session, r.offender):
        user = await User.get(PydanticObjectId(uid))
        if user is None:
            continue
        if high or r.category in ("sexual_minor", "grooming"):
            await enforcement.open_system_report(user.id, reason, f"AI monitor: {r.rationale}",
                                                 3 if r.category in ("sexual_minor", "grooming") else 2,
                                                 session.neutral_evidence(), session_id=sid, source="ai")
        status = await enforcement.add_strike(user, points, r.category, "ai", r.rationale, session_id=sid)
        if status.banned:
            await manager.send(uid, status.to_event())
        if live and (high or status.banned or r.category in ("sexual", "sexual_minor", "grooming")):
            await _send(uid, "stranger.notice", level="danger", text="This chat was ended for breaking the rules.")
            await end_session(session, "moderation", actor=uid, partner_reason="moderation")
            live = False


# ── Connect (reveal identities) ───────────────────────────────────────────────

async def connect(user_id: str) -> None:
    session = sessions.for_user(user_id)
    if session is None:
        return
    if session.bot is not None:
        await _send(user_id, "stranger.notice", level="info",
                    text="The CPU can’t be added as a friend — skip to find a human for that.")
        return
    if session.message_count < MIN_MESSAGES_BEFORE_CONNECT or session.flagged:
        await _send(user_id, "stranger.notice", level="info",
                    text="Chat a little longer before adding each other as friends.")
        return

    me, partner = session.me(user_id), session.partner(user_id)
    if me.wants_connect:
        return
    me.wants_connect = True
    if not partner.wants_connect:
        await _send(user_id, "stranger.connect_pending")
        await _send(partner.user_id, "stranger.connect_requested")
        return

    a, b = await User.get(PydanticObjectId(me.user_id)), await User.get(PydanticObjectId(partner.user_id))
    if not a or not b:
        return
    existing = await Friendship.find_one(Or(
        {"requester_id": a.id, "receiver_id": b.id}, {"requester_id": b.id, "receiver_id": a.id}))
    if existing:
        existing.status = FriendshipStatus.accepted
        await existing.save()
    else:
        await Friendship(requester_id=a.id, receiver_id=b.id, status=FriendshipStatus.accepted).insert()

    conv = await Conversation.find_one({"member_ids": {"$all": [a.id, b.id]}})
    if conv is None:
        conv = Conversation(member_ids=[a.id, b.id])
        await conv.insert()

    for viewer, other in ((a, b), (b, a)):
        await _send(str(viewer.id), "stranger.connected", conversation_id=str(conv.id),
                    friend={"id": str(other.id), "username": other.username, "avatar_url": other.avatar_url})


async def close_user(user_id: str) -> None:
    """Force-close a user's socket (e.g. after suspension)."""
    await manager.close(user_id, code=4003)
