"""
In-process sliding-window rate limiter.

Good enough for a single API instance. If you run several replicas, move this to
Redis (same interface) so limits are shared.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException


class RateLimiter:
    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def hit(self, key: str, limit: int, window: float) -> bool:
        """Record a hit. Returns False when `key` has exceeded `limit` hits in `window` seconds."""
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        self._maybe_sweep(now)
        return True

    def count(self, key: str, window: float) -> int:
        now = time.monotonic()
        q = self._hits.get(key)
        if not q:
            return 0
        while q and q[0] <= now - window:
            q.popleft()
        return len(q)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def enforce(self, key: str, limit: int, window: float, detail: str = "Too many requests. Slow down.") -> None:
        if not self.hit(key, limit, window):
            raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(int(window))})

    def _maybe_sweep(self, now: float) -> None:
        # Drop idle keys every few minutes so memory doesn't grow without bound.
        if now - self._last_sweep < 300:
            return
        self._last_sweep = now
        for key in [k for k, q in self._hits.items() if not q or q[-1] < now - 3600]:
            self._hits.pop(key, None)


limiter = RateLimiter()
