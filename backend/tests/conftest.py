import os
import sys
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")
os.environ["USE_INMEMORY_DB"] = "true"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ADMIN_EMAILS"] = "admin@example.com"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

ORIGIN = {"origin": "http://localhost:3000"}
_counter = itertools.count()


@pytest.fixture()
def client():
    from main import app
    from matching.matchmaker import matchmaker
    from matching.sessions import sessions
    from ratelimit import limiter

    limiter._hits.clear()
    matchmaker._queue.clear()
    matchmaker._recent.clear()
    sessions._sessions.clear()
    sessions._by_user.clear()
    sessions._ended.clear()
    with TestClient(app) as c:
        yield c


def register(client, name=None, email=None, birth="1995-04-02", password="hunter2hunter2!"):
    n = next(_counter)
    name = name or f"user{n}"
    res = client.post("/auth/register", json={
        "username": name, "email": email or f"{name}@example.com", "password": password,
        "birth_date": birth, "accept_rules": True,
    })
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    me = client.get("/users/me", headers={"Authorization": f"Bearer {token}"}).json()
    return {"token": token, "id": me["id"], "username": name, "headers": {"Authorization": f"Bearer {token}"}}


def ws_connect(client, user):
    ws = client.websocket_connect("/ws", headers=ORIGIN).__enter__()
    ws.send_json({"type": "auth", "token": user["token"]})
    assert receive_until(ws, "auth.ok")["user_id"] == user["id"]
    return ws


def receive_until(ws, type_, limit=30):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == type_:
            return msg
    raise AssertionError(f"never received {type_}")


def match_pair(client, a, b, interests=("music",)):
    wa, wb = ws_connect(client, a), ws_connect(client, b)
    wa.send_json({"type": "stranger.join", "interests": list(interests)})
    receive_until(wa, "stranger.searching")
    wb.send_json({"type": "stranger.join", "interests": list(interests)})
    ma = receive_until(wa, "stranger.matched")
    mb = receive_until(wb, "stranger.matched")
    assert ma["session_id"] == mb["session_id"]
    return wa, wb, ma["session_id"]
