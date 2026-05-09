"""
In-memory queue for stranger chat matchmaking.
Thread-safe with asyncio.Lock.
"""
import asyncio
from typing import Optional

_queue: list[str] = []  # user_id strings
_lock = asyncio.Lock()


async def add_to_queue(user_id: str) -> None:
    """Add user to the waiting queue. Idempotent."""
    async with _lock:
        if user_id not in _queue:
            _queue.append(user_id)


async def remove_from_queue(user_id: str) -> None:
    """Remove user from queue (e.g. they disconnected)."""
    async with _lock:
        try:
            _queue.remove(user_id)
        except ValueError:
            pass


async def try_match() -> Optional[tuple[str, str]]:
    """
    Try to pop two users from the queue and return them as a matched pair.
    Returns None if fewer than 2 users are waiting.
    """
    async with _lock:
        if len(_queue) < 2:
            return None
        u1 = _queue.pop(0)
        u2 = _queue.pop(0)
        return u1, u2


async def queue_size() -> int:
    async with _lock:
        return len(_queue)


async def is_in_queue(user_id: str) -> bool:
    async with _lock:
        return user_id in _queue
