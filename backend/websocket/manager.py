import asyncio
import json
from dataclasses import dataclass, field
from typing import Dict, Iterable, Optional

from fastapi import WebSocket


@dataclass
class Connection:
    ws: WebSocket
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ConnectionManager:
    """One live socket per user. A new login on another tab replaces the old socket."""

    def __init__(self) -> None:
        self._connections: Dict[str, Connection] = {}

    async def register(self, user_id: str, ws: WebSocket) -> Optional[WebSocket]:
        previous = self._connections.get(user_id)
        self._connections[user_id] = Connection(ws)
        return previous.ws if previous else None

    def unregister(self, user_id: str, ws: WebSocket) -> bool:
        """Remove the user's socket if it is still `ws`. Returns True if it was removed."""
        current = self._connections.get(user_id)
        if current and current.ws is ws:
            del self._connections[user_id]
            return True
        return False

    def is_connected(self, user_id: str) -> bool:
        return user_id in self._connections

    def online_count(self) -> int:
        return len(self._connections)

    async def send(self, user_id: str, data: dict) -> None:
        conn = self._connections.get(user_id)
        if not conn:
            return
        try:
            async with conn.lock:
                await conn.ws.send_text(json.dumps(data, default=str))
        except Exception:
            self.unregister(user_id, conn.ws)

    async def close(self, user_id: str, code: int = 4003) -> None:
        conn = self._connections.pop(user_id, None)
        if conn:
            try:
                await conn.ws.close(code=code)
            except Exception:
                pass

    async def close_all(self, code: int = 1012) -> None:
        for uid in list(self._connections):
            await self.close(uid, code=code)

    async def broadcast(self, user_ids: Iterable[str], data: dict) -> None:
        for uid in user_ids:
            await self.send(uid, data)


manager = ConnectionManager()
