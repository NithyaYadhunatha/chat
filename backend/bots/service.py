"""
Running CPU matches.

Each persona is a real (flagged) User record so sessions, reports and ratings
work unchanged. A CPU never has a socket; instead, when a human sends it a
message, we schedule a reply with a human-ish delay and typing indicator.
"""
import asyncio
import logging
import random
from typing import Dict, Optional

from bots.brain import BotMemory, ScriptedBrain, claude_reply, safe
from bots.personas import PERSONAS, Persona, by_key
from matching.sessions import ActiveSession, Line
from models import Role, User, utcnow

log = logging.getLogger("bots")

MAX_BOT_TURNS = 40          # the CPU says goodbye after this many replies
_bot_ids: Dict[str, str] = {}        # persona key -> user id
_persona_by_id: Dict[str, str] = {}  # user id -> persona key


class BotState:
    def __init__(self, persona: Persona):
        self.persona = persona
        self.brain = ScriptedBrain(persona)
        self.memory = BotMemory()
        self.busy = False
        self.pending: Optional[str] = None  # newest unanswered human message


async def ensure_bot_users() -> None:
    for p in PERSONAS:
        username = f"cpu_{p.key}"
        user = await User.find_one(User.username == username)
        if user is None:
            user = User(username=username, email=f"{username}@bots.pingpong.invalid", is_bot=True, role=Role.user,
                        accepted_rules_at=utcnow())
            await user.insert()
        _bot_ids[p.key] = str(user.id)
        _persona_by_id[str(user.id)] = p.key


def is_bot(user_id: str) -> bool:
    return user_id in _persona_by_id


def pick_bot() -> Optional[str]:
    return random.choice(list(_bot_ids.values())) if _bot_ids else None


def attach(session: ActiveSession, bot_user_id: str) -> None:
    session.bot = BotState(by_key(_persona_by_id[bot_user_id]))  # type: ignore[attr-defined]


def _typing_delay(text: str) -> float:
    # Read for a moment, then "type" at ~9 chars/sec, capped so it never drags.
    return min(1.0 + len(text) / 9 + random.uniform(0.2, 1.2), 7.5)


async def start(session: ActiveSession, send) -> None:
    """Called right after a CPU match: the CPU serves first."""
    state: BotState = session.bot  # type: ignore[attr-defined]
    await asyncio.sleep(random.uniform(1.2, 2.5))
    await _speak(session, send, state, user_text=None)


def on_human_message(session: ActiveSession, send, text: str) -> None:
    state: BotState = session.bot  # type: ignore[attr-defined]
    state.memory.history.append(("user", text))
    state.pending = text
    if not state.busy:
        asyncio.create_task(_run(session, send, state))


async def _run(session: ActiveSession, send, state: BotState) -> None:
    state.busy = True
    try:
        # Let quick double-texts arrive before answering the newest one.
        await asyncio.sleep(random.uniform(0.6, 1.4))
        while state.pending is not None and _alive(session):
            text, state.pending = state.pending, None
            await _speak(session, send, state, text)
    except Exception:
        log.exception("CPU failed to reply")
    finally:
        state.busy = False


def _alive(session: ActiveSession) -> bool:
    return session.ended_at is None


async def _speak(session: ActiveSession, send, state: BotState, user_text: Optional[str]) -> None:
    if not _alive(session):
        return
    mem = state.memory
    reply = await claude_reply(state.persona, mem, user_text)
    if not reply or not safe(reply):
        reply = state.brain.reply(user_text, mem) if user_text else state.brain.opener(mem)
    if not safe(reply):
        reply = "ha, ok. " + state.brain.opener(mem)

    human = session.a.user_id if not is_bot(session.a.user_id) else session.b.user_id
    bot_id = session.partner(human).user_id

    await send(human, "stranger.typing", typing=True)
    await asyncio.sleep(_typing_delay(reply))
    if not _alive(session):
        return

    now = utcnow()
    line = Line(bot_id, reply, now)
    session.transcript.append(line)
    session.message_count += 1
    mem.history.append(("bot", reply))
    mem.turns += 1
    await send(human, "stranger.message", id=line.id, text=reply, at=now.isoformat(), reply_to=None)
    await send(human, "stranger.typing", typing=False)

    if mem.turns >= MAX_BOT_TURNS:
        await asyncio.sleep(2)
        if _alive(session):
            bye = "this was fun! i'm heading off — go find a human, the tables are probably busier now."
            bye_line = Line(bot_id, bye, utcnow())
            session.transcript.append(bye_line)
            await send(human, "stranger.message", id=bye_line.id, text=bye, at=bye_line.at.isoformat(), reply_to=None)
            from websocket.stranger import end_session
            await end_session(session, "partner_left", actor=bot_id, partner_reason="partner_left")

