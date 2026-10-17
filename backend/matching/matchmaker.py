"""
Stranger matchmaking.

Users wait in a FIFO queue with optional interests. A pair is made when:
  - neither has blocked the other,
  - they weren't just paired (so "next" doesn't bounce you back to the same person),
  - and they share an interest — or either has waited long enough that we stop insisting.
"""
import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Set, Tuple

INTEREST_WAIT_SECONDS = 8.0     # after this, match on anything
REMATCH_COOLDOWN_SECONDS = 120  # don't re-pair the same two people within this window
LOW_TRUST_WAIT_SECONDS = 60.0   # low-trust users only meet each other until they've waited this long


@dataclass
class Waiting:
    user_id: str
    interests: Set[str]
    excluded: Set[str]          # users this person blocked or was blocked by
    low_trust: bool = False     # rated badly by many people (see moderation.trust)
    joined_at: float = field(default_factory=time.monotonic)

    def waited(self, now: float) -> float:
        return now - self.joined_at


class Matchmaker:
    def __init__(self) -> None:
        self._queue: Dict[str, Waiting] = {}  # insertion-ordered
        self._recent: Dict[str, Deque[Tuple[str, float]]] = {}
        self._lock = asyncio.Lock()

    async def join(self, user_id: str, interests: Set[str], excluded: Set[str], low_trust: bool = False) -> None:
        async with self._lock:
            self._queue.pop(user_id, None)
            self._queue[user_id] = Waiting(user_id, interests, excluded, low_trust)

    async def leave(self, user_id: str) -> None:
        async with self._lock:
            self._queue.pop(user_id, None)

    def is_waiting(self, user_id: str) -> bool:
        return user_id in self._queue

    def size(self) -> int:
        return len(self._queue)

    def remember_pair(self, a: str, b: str) -> None:
        now = time.monotonic()
        for x, y in ((a, b), (b, a)):
            self._recent.setdefault(x, deque(maxlen=5)).append((y, now))

    def _recently_paired(self, a: str, b: str, now: float) -> bool:
        return any(p == b and now - t < REMATCH_COOLDOWN_SECONDS for p, t in self._recent.get(a, ()))

    async def take_pairs(self) -> List[Tuple[Waiting, Waiting, List[str]]]:
        """Remove and return every pair that can be matched right now."""
        async with self._lock:
            now = time.monotonic()
            waiting = list(self._queue.values())
            used: Set[str] = set()
            pairs = []

            for i, u in enumerate(waiting):
                if u.user_id in used:
                    continue
                best, best_common = None, []
                for v in waiting[i + 1:]:
                    if v.user_id in used or not self._compatible(u, v, now):
                        continue
                    common = sorted(u.interests & v.interests)
                    if len(common) > len(best_common) or best is None:
                        if common or self._flexible(u, now) and self._flexible(v, now):
                            best, best_common = v, common
                            if common and len(common) == len(u.interests):
                                break
                if best is not None:
                    used.update((u.user_id, best.user_id))
                    pairs.append((u, best, best_common))

            for u, v, _ in pairs:
                self._queue.pop(u.user_id, None)
                self._queue.pop(v.user_id, None)
                self.remember_pair(u.user_id, v.user_id)
            return pairs

    async def take(self, user_id: str) -> Optional[Waiting]:
        async with self._lock:
            return self._queue.pop(user_id, None)

    async def take_stale(self, min_wait: float) -> List[Waiting]:
        """Remove and return everyone who has waited at least `min_wait` seconds."""
        async with self._lock:
            now = time.monotonic()
            stale = [w for w in self._queue.values() if w.waited(now) >= min_wait]
            for w in stale:
                self._queue.pop(w.user_id, None)
            return stale

    def _compatible(self, u: Waiting, v: Waiting, now: float) -> bool:
        if u.low_trust != v.low_trust:
            # Keep the low-trust pool separate, unless the queue is so thin that
            # both have been waiting a long time.
            bad, good = (u, v) if u.low_trust else (v, u)
            if bad.waited(now) < LOW_TRUST_WAIT_SECONDS or good.waited(now) < INTEREST_WAIT_SECONDS * 2:
                return False
        return (
            v.user_id not in u.excluded and u.user_id not in v.excluded
            and not self._recently_paired(u.user_id, v.user_id, now)
        )

    @staticmethod
    def _flexible(w: Waiting, now: float) -> bool:
        return not w.interests or w.waited(now) >= INTEREST_WAIT_SECONDS


matchmaker = Matchmaker()
