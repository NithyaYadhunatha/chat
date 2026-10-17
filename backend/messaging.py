"""Shared rules for message features: replies, reactions, edits, unsends."""
import secrets
from datetime import timedelta

EDIT_WINDOW = timedelta(minutes=15)

# Reactions are limited to a fixed palette — no free text, so they can't be
# used to smuggle messages past the filter.
REACTIONS = (
    "👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🙏",
    "👎", "😅", "🤔", "😎", "🥲", "🤯", "💯", "🎉",
)


def valid_reaction(emoji) -> bool:
    return emoji is None or emoji in REACTIONS


def new_message_id() -> str:
    return secrets.token_hex(6)
