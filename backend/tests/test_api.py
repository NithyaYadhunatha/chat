from conftest import ORIGIN, match_pair, receive_until, register, ws_connect


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_register_rejects_minors_and_weak_passwords(client):
    base = {"username": "kiddo", "email": "kid@example.com", "password": "hunter2hunter2!", "accept_rules": True}
    assert client.post("/auth/register", json={**base, "birth_date": "2012-01-01"}).status_code == 403
    assert client.post("/auth/register", json={**base, "birth_date": "1990-01-01", "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={**base, "birth_date": "1990-01-01", "accept_rules": False}).status_code == 400
    assert client.post("/auth/register", json={**base, "username": "a b", "birth_date": "1990-01-01"}).status_code == 422


def test_refresh_rotation_and_replay_detection(client):
    res = client.post("/auth/register", json={
        "username": "rotator", "email": "rot@example.com", "password": "hunter2hunter2!",
        "birth_date": "1990-01-01", "accept_rules": True})
    first_cookie = res.cookies.get("rt")
    assert first_cookie

    # Without the CSRF header, refresh is refused.
    assert client.post("/auth/refresh").status_code == 403

    ok = client.post("/auth/refresh", headers={"X-Requested-With": "fetch"})
    assert ok.status_code == 200 and ok.json()["access_token"]
    second_cookie = client.cookies.get("rt")
    assert second_cookie != first_cookie

    # Replaying the old token kills the whole family, including the new one.
    client.cookies.set("rt", first_cookie)
    assert client.post("/auth/refresh", headers={"X-Requested-With": "fetch"}).status_code == 401
    client.cookies.set("rt", second_cookie)
    assert client.post("/auth/refresh", headers={"X-Requested-With": "fetch"}).status_code == 401


def test_login_lockout(client):
    register(client, name="locky", email="locky@example.com")
    for _ in range(8):
        assert client.post("/auth/login", json={"email": "locky@example.com", "password": "wrongwrong1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "locky@example.com", "password": "hunter2hunter2!"}).status_code == 429


def test_logout_all_invalidates_access_tokens(client):
    u = register(client)
    assert client.post("/users/me/logout-all", headers=u["headers"]).status_code == 204
    assert client.get("/users/me", headers=u["headers"]).status_code == 401


def test_bad_origin_and_bad_token_rejected(client):
    import pytest
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws", headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws", headers=ORIGIN) as ws:
            ws.send_json({"type": "auth", "token": "nope"})
            ws.receive_json()


# ── Stranger chat ────────────────────────────────────────────────────────────

def test_match_and_anonymous_messaging(client):
    a, b = register(client), register(client)
    wa, wb, sid = match_pair(client, a, b, interests=("music", "films"))

    wa.send_json({"type": "stranger.message", "text": "hey, where are you from?", "client_id": "c1"})
    ack = receive_until(wa, "stranger.ack")
    assert ack["client_id"] == "c1"
    got = receive_until(wb, "stranger.message")
    assert got["text"] == "hey, where are you from?"
    assert "sender_id" not in got and "user_id" not in got  # partners stay anonymous
    wa.close(); wb.close()


def test_explicit_message_blocked_and_struck(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)

    wa.send_json({"type": "stranger.message", "text": "s3nd n u d e s", "client_id": "x"})
    rejected = receive_until(wa, "stranger.rejected")
    assert rejected["client_id"] == "x" and "Sexual" in rejected["notice"]

    wa.send_json({"type": "stranger.message", "text": "sorry, what music do you like?", "client_id": "y"})
    # The partner's next message is the clean one: the explicit one was never relayed.
    assert receive_until(wb, "stranger.message")["text"] == "sorry, what music do you like?"

    admin = register(client, name="boss", email="admin@example.com")
    events = client.get("/admin/events", headers=admin["headers"]).json()
    assert any(e["user_id"] == a["id"] and e["action"].startswith("strike") for e in events)
    wa.close(); wb.close()


def test_contact_sharing_blocked(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)
    wa.send_json({"type": "stranger.message", "text": "add me on snap: cooldude99", "client_id": "s"})
    assert "contact" in receive_until(wa, "stranger.rejected")["notice"]
    wa.close(); wb.close()


def test_self_declared_minor_ends_chat_and_requires_age_review(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)
    wb.send_json({"type": "stranger.message", "text": "im 15 f", "client_id": "m"})
    assert receive_until(wb, "stranger.ended")["reason"] == "safety"
    assert receive_until(wa, "stranger.ended")["reason"] == "safety"
    banned = receive_until(wb, "moderation.banned")
    assert banned["permanent"]

    me = client.get("/users/me", headers=b["headers"]).json()
    assert me["chat_ban"]["age_review"] is True

    wb.send_json({"type": "stranger.join", "interests": []})
    assert receive_until(wb, "moderation.banned")
    wa.close(); wb.close()


def test_csam_suspends_account(client):
    a, b = register(client, name="badactor", email="bad@example.com"), register(client)
    wa, wb, _ = match_pair(client, a, b)
    wa.send_json({"type": "stranger.message", "text": "anyone trading cp links", "client_id": "z"})
    assert receive_until(wa, "account.suspended")
    assert receive_until(wb, "stranger.ended")["reason"] == "moderation"

    assert client.get("/users/me", headers=a["headers"]).status_code in (401, 403)
    login = client.post("/auth/login", json={"email": "bad@example.com", "password": "hunter2hunter2!"})
    assert login.status_code == 403
    # Can't come back with the same email either.
    again = client.post("/auth/register", json={"username": "badactor2", "email": "bad@example.com",
                                               "password": "hunter2hunter2!", "birth_date": "1990-01-01",
                                               "accept_rules": True})
    assert again.status_code == 403
    wb.close()


def test_report_attaches_server_side_evidence_and_blocks(client):
    a, b = register(client), register(client)
    admin = register(client, name="modboss", email="admin@example.com")
    wa, wb, sid = match_pair(client, a, b)
    wb.send_json({"type": "stranger.message", "text": "you are pathetic", "client_id": "h"})
    receive_until(wb, "stranger.rejected")
    wb.send_json({"type": "stranger.message", "text": "whatever loser", "client_id": "h2"})
    receive_until(wa, "stranger.message")

    res = client.post("/stranger/report", headers=a["headers"],
                      json={"session_id": sid, "reason": "harassment", "details": "rude", "block": True})
    assert res.status_code == 201, res.text
    assert receive_until(wa, "stranger.ended")["reason"] == "reported"
    assert receive_until(wb, "stranger.ended")["reason"] == "partner_left"

    # Second report for the same chat is refused.
    assert client.post("/stranger/report", headers=a["headers"],
                       json={"session_id": sid, "reason": "harassment"}).status_code == 409

    reports = client.get("/admin/reports", headers=admin["headers"]).json()
    report = next(r for r in reports if r["reported"]["id"] == b["id"])
    detail = client.get(f"/admin/reports/{report['id']}", headers=admin["headers"]).json()
    texts = [(e["author"], e["text"], e["blocked"]) for e in detail["evidence"]]
    assert ("reported", "you are pathetic", True) in texts
    assert ("reported", "whatever loser", False) in texts

    # Moderator bans the user; they're told immediately and can't queue.
    res = client.post(f"/admin/reports/{report['id']}/resolve", headers=admin["headers"],
                      json={"action": "ban_24h", "note": "harassment"})
    assert res.json()["status"] == "actioned"
    assert receive_until(wb, "moderation.banned")["until"]

    blocks = client.get("/users/blocks", headers=a["headers"]).json()
    assert blocks and blocks[0]["username"] is None  # stranger stays anonymous
    wa.close(); wb.close()


def test_non_admins_cannot_use_admin_api(client):
    u = register(client)
    assert client.get("/admin/reports", headers=u["headers"]).status_code == 403


def test_connect_reveals_identity_only_when_both_agree(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)
    for i in range(6):
        sender, receiver = (wa, wb) if i % 2 == 0 else (wb, wa)
        sender.send_json({"type": "stranger.message", "text": f"message number {i} about films", "client_id": str(i)})
        receive_until(receiver, "stranger.message")

    wa.send_json({"type": "stranger.connect"})
    receive_until(wa, "stranger.connect_pending")
    receive_until(wb, "stranger.connect_requested")
    wb.send_json({"type": "stranger.connect"})
    ca, cb = receive_until(wa, "stranger.connected"), receive_until(wb, "stranger.connected")
    assert ca["friend"]["username"] == b["username"] and cb["friend"]["username"] == a["username"]

    # They can now DM; explicit DMs are still refused.
    conv_id = ca["conversation_id"]
    ok = client.post(f"/conversations/{conv_id}/messages", headers=a["headers"], json={"content": "hi again!"})
    assert ok.status_code == 201
    bad = client.post(f"/conversations/{conv_id}/messages", headers=a["headers"], json={"content": "send nudes"})
    assert bad.status_code == 422
    wa.close(); wb.close()


def test_strangers_cannot_dm_without_friendship(client):
    a, b = register(client), register(client)
    assert client.post("/conversations", headers=a["headers"], json={"user_id": b["id"]}).status_code == 403


def test_search_is_regex_safe(client):
    u = register(client)
    assert client.get("/users/search", params={"q": ".*(a+)+$"}, headers=u["headers"]).json() == []


def test_onboarding_required_for_google_style_accounts(client):
    import asyncio
    from models import User

    u = register(client)
    # Simulate an account created via Google, which has no birth date yet.
    async def strip_birth():
        user = await User.find_one(User.username == u["username"])
        user.birth_date = None
        await user.save()
    client.portal.call(strip_birth)

    ws = ws_connect(client, u)
    ws.send_json({"type": "stranger.join", "interests": []})
    assert receive_until(ws, "error")["code"] == "onboarding_required"
    res = client.post("/users/me/onboarding", headers=u["headers"], json={"birth_date": "2011-05-05", "accept_rules": True})
    assert res.status_code == 403
    ws.close()


def test_ai_monitor_verdict_is_enforced(client, monkeypatch):
    from config import settings
    from moderation import ai

    calls = []

    async def fake_review(lines):
        calls.append(lines)
        return ai.AIVerdict(category="grooming", severity="high", offender="A", minor_suspected="none",
                            rationale="pressuring the other person to move to another app")

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(ai, "review_conversation", fake_review)

    a, b = register(client), register(client)
    admin = register(client, name="aiadmin", email="admin@example.com")
    wa, wb, _ = match_pair(client, a, b)
    wa.send_json({"type": "stranger.message", "text": "you seem cute, are you single?", "client_id": "1"})
    receive_until(wb, "stranger.message")
    assert receive_until(wb, "stranger.ended")["reason"] == "moderation"
    assert calls and calls[0][-1][1] == "you seem cute, are you single?"

    reports = client.get("/admin/reports", headers=admin["headers"]).json()
    assert any(r["source"] == "ai" and r["priority"] == 3 for r in reports)
    wa.close(); wb.close()


# ── Ops / hardening ──────────────────────────────────────────────────────────

def test_health_ready_and_request_id(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").status_code == 200
    res = client.get("/stranger/status")
    assert res.headers["x-request-id"] and res.headers["x-content-type-options"] == "nosniff"


def test_oversized_body_rejected(client):
    res = client.post("/auth/login", content=b"{" + b" " * (70 * 1024) + b"}",
                      headers={"content-type": "application/json"})
    assert res.status_code == 413


def test_validation_errors_do_not_echo_passwords(client):
    res = client.post("/auth/register", json={"username": "ok_name", "email": "x@example.com",
                                              "password": "short", "birth_date": "1990-01-01", "accept_rules": True})
    assert res.status_code == 422 and "short" not in res.text


def test_production_guardrails():
    import pytest
    from config import Settings
    with pytest.raises(ValueError):
        Settings(ENV="production", USE_INMEMORY_DB=True, SECRET_KEY="x" * 40, ALLOWED_ORIGINS="http://example.com")
    ok = Settings(ENV="production", USE_INMEMORY_DB=False, SECRET_KEY="9f2c1ab47e6d0c3b8a5f1e2d7c4b9a06f3e8d1c2",
                  ALLOWED_ORIGINS="https://pingpong.example")
    assert ok.is_production


# ── Serve, rate, bots ────────────────────────────────────────────────────────

def test_match_includes_icebreaker_and_serve_reaches_both(client):
    a, b = register(client), register(client)
    wa, wb = ws_connect(client, a), ws_connect(client, b)
    wa.send_json({"type": "stranger.join", "interests": ["music"]})
    receive_until(wa, "stranger.searching")
    wb.send_json({"type": "stranger.join", "interests": ["music"]})
    ma, mb = receive_until(wa, "stranger.matched"), receive_until(wb, "stranger.matched")
    assert ma["icebreaker"] and ma["icebreaker"] == mb["icebreaker"]

    from matching.sessions import sessions
    sessions.find(ma["session_id"]).last_serve = 0  # skip the cooldown
    wb.send_json({"type": "stranger.serve"})
    sa, sb = receive_until(wa, "stranger.serve"), receive_until(wb, "stranger.serve")
    assert sa["text"] == sb["text"] != ma["icebreaker"]
    assert sa["by"] == "stranger" and sb["by"] == "you"
    wa.close(); wb.close()


def test_rating_is_private_and_counted_once(client):
    from models import User
    a, b = register(client), register(client)
    wa, wb, sid = match_pair(client, a, b)
    for i in range(2):
        wa.send_json({"type": "stranger.message", "text": f"hello there number {i}", "client_id": str(i)})
        receive_until(wb, "stranger.message")
    wa.send_json({"type": "stranger.leave"})
    receive_until(wb, "stranger.ended")

    for _ in range(3):  # repeats are ignored
        wa.send_json({"type": "stranger.rate", "session_id": sid, "value": -1})
    assert receive_until(wa, "stranger.rated")["value"] == -1

    async def counts():
        u = await User.find_one(User.username == b["username"])
        return u.rating_up, u.rating_down
    assert client.portal.call(counts) == (0, 1)
    # Not exposed on the profile.
    assert "rating" not in str(client.get("/users/me", headers=b["headers"]).json())
    wa.close(); wb.close()


def test_copy_paste_bot_is_stopped(client):
    from websocket import stranger as st
    st._recent_texts.clear()
    from ratelimit import limiter
    users = []
    for _ in range(6):
        limiter.reset("register:testclient")  # the sign-up limit is 5/hour per network
        users.append(register(client))
    bot, *others = users
    spam = "hey cutie check out my profile for something fun ;)"
    wb = ws_connect(client, bot)
    last = None
    for other in others:
        wo = ws_connect(client, other)
        wb.send_json({"type": "stranger.join", "interests": []})
        receive_until(wb, "stranger.searching")
        wo.send_json({"type": "stranger.join", "interests": []})
        receive_until(wb, "stranger.matched")
        receive_until(wo, "stranger.matched")
        wb.send_json({"type": "stranger.message", "text": spam, "client_id": "s"})
        last = wb.receive_json()
        while last["type"] not in ("stranger.ack", "stranger.rejected"):
            last = wb.receive_json()
        wb.send_json({"type": "stranger.leave"})
        receive_until(wb, "stranger.idle")
        wo.close()
    assert last["type"] == "stranger.rejected" and "lot of people" in last["notice"]
    wb.close()


# ── CPU opponents ────────────────────────────────────────────────────────────

def _fast_bots(monkeypatch):
    from bots import service
    monkeypatch.setattr(service, "_typing_delay", lambda text: 0)
    monkeypatch.setattr(service.random, "uniform", lambda a, b: 0)


def test_play_cpu_is_labelled_and_replies(client, monkeypatch):
    _fast_bots(monkeypatch)
    u = register(client)
    ws = ws_connect(client, u)
    ws.send_json({"type": "stranger.join", "interests": []})
    receive_until(ws, "stranger.searching")
    ws.send_json({"type": "stranger.play_cpu"})
    matched = receive_until(ws, "stranger.matched")
    assert matched["cpu"] is True and matched["icebreaker"]

    opener = receive_until(ws, "stranger.message")  # the CPU serves first
    assert opener["text"]
    ws.send_json({"type": "stranger.message", "text": "are you a bot?", "client_id": "q"})
    reply = receive_until(ws, "stranger.message")
    assert "bot" in reply["text"] or "cpu" in reply["text"]

    # Can't befriend the CPU; it doesn't count as someone online.
    ws.send_json({"type": "stranger.connect"})
    assert "CPU" in receive_until(ws, "stranger.notice")["text"]
    assert client.get("/stranger/status").json()["online"] == 1
    ws.close()


def test_long_wait_falls_back_to_cpu(client, monkeypatch):
    from config import settings
    _fast_bots(monkeypatch)
    monkeypatch.setattr(settings, "BOT_AFTER_SECONDS", 0.5)
    u = register(client)
    ws = ws_connect(client, u)
    ws.send_json({"type": "stranger.join", "interests": ["origami"]})
    receive_until(ws, "stranger.searching")
    assert receive_until(ws, "stranger.matched")["cpu"] is True
    ws.close()


def test_humans_still_match_each_other_first(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)
    wa.close(); wb.close()


def test_cpu_accounts_hidden_from_search_and_friend_requests(client):
    from models import User
    u = register(client)
    assert client.get("/users/search", params={"q": "cpu"}, headers=u["headers"]).json() == []

    async def bot_id():
        return str((await User.find_one(User.username == "cpu_film")).id)
    res = client.post(f"/friends/request/{client.portal.call(bot_id)}", headers=u["headers"])
    assert res.status_code == 404


# ── Replies, reactions, edits, unsends ───────────────────────────────────────

def test_stranger_reply_react_edit_unsend(client):
    a, b = register(client), register(client)
    admin = register(client, name="msgadmin", email="admin@example.com")
    wa, wb, sid = match_pair(client, a, b)

    wa.send_json({"type": "stranger.message", "text": "what's your favourite film?", "client_id": "c1"})
    ack = receive_until(wa, "stranger.ack")
    first = receive_until(wb, "stranger.message")
    assert ack["id"] == first["id"]

    # Reply to a specific message.
    wb.send_json({"type": "stranger.message", "text": "spirited away", "client_id": "c2", "reply_to": first["id"]})
    reply = receive_until(wa, "stranger.message")
    assert reply["reply_to"] == first["id"]

    # React (only from the fixed palette); reacting twice with the same emoji removes it.
    wa.send_json({"type": "stranger.react", "message_id": reply["id"], "emoji": "<script>"})
    wa.send_json({"type": "stranger.react", "message_id": reply["id"], "emoji": "🔥"})
    r = receive_until(wb, "stranger.reaction")
    assert r["emoji"] == "🔥" and r["by"] == "stranger"
    assert receive_until(wa, "stranger.reaction")["by"] == "you"

    # Edit your own message; edits are moderated too.
    wa.send_json({"type": "stranger.edit", "message_id": first["id"], "text": "what's your favourite movie?"})
    assert receive_until(wb, "stranger.edited")["text"] == "what's your favourite movie?"
    wa.send_json({"type": "stranger.edit", "message_id": first["id"], "text": "send nudes"})
    assert receive_until(wa, "stranger.edit_rejected")["message_id"] == first["id"]
    # You can't edit someone else's message.
    wb.send_json({"type": "stranger.edit", "message_id": first["id"], "text": "hijacked"})

    # Unsend for everyone; read receipts reach the author.
    wb.send_json({"type": "stranger.seen", "message_id": first["id"]})
    assert receive_until(wa, "stranger.seen")["message_id"] == first["id"]
    wa.send_json({"type": "stranger.unsend", "message_id": first["id"]})
    assert receive_until(wb, "stranger.unsent")["message_id"] == first["id"]

    # The report still shows the unsent message and its edit history.
    res = client.post("/stranger/report", headers=b["headers"], json={"session_id": sid, "reason": "other"})
    rid = res.json()["id"]
    texts = [e["text"] for e in client.get(f"/admin/reports/{rid}", headers=admin["headers"]).json()["evidence"]]
    assert any(t.startswith("[unsent]") and "favourite movie" in t and "favourite film" in t for t in texts)
    assert not any("hijacked" in t for t in texts)
    wa.close(); wb.close()


def test_dm_reply_react_edit_unsend(client):
    a, b = register(client), register(client)
    wa, wb, _ = match_pair(client, a, b)
    for i in range(6):
        s, r = (wa, wb) if i % 2 == 0 else (wb, wa)
        s.send_json({"type": "stranger.message", "text": f"chatting about films {i}", "client_id": str(i)})
        receive_until(r, "stranger.message")
    wa.send_json({"type": "stranger.connect"}); receive_until(wa, "stranger.connect_pending")
    wb.send_json({"type": "stranger.connect"})
    conv = receive_until(wa, "stranger.connected")["conversation_id"]
    base = f"/conversations/{conv}/messages"

    m1 = client.post(base, headers=a["headers"], json={"content": "first!"}).json()
    m2 = client.post(base, headers=b["headers"], json={"content": "replying", "reply_to": m1["id"]}).json()
    assert m2["reply_to"]["id"] == m1["id"] and m2["reply_to"]["content"] == "first!"

    r = client.put(f"{base}/{m2['id']}/reaction", headers=a["headers"], json={"emoji": "😂"})
    assert r.json()["reactions"] == [{"user_id": a["id"], "emoji": "😂"}]
    assert client.put(f"{base}/{m2['id']}/reaction", headers=a["headers"], json={"emoji": "hi"}).status_code == 400

    assert client.patch(f"{base}/{m1['id']}", headers=b["headers"], json={"content": "nope"}).status_code == 403
    e = client.patch(f"{base}/{m1['id']}", headers=a["headers"], json={"content": "first (edited)"})
    assert e.json()["edited"] and e.json()["content"] == "first (edited)"
    assert client.patch(f"{base}/{m1['id']}", headers=a["headers"], json={"content": "send nudes"}).status_code == 422

    assert client.delete(f"{base}/{m1['id']}", headers=a["headers"]).status_code == 204
    page = client.get(base, headers=b["headers"]).json()["messages"]
    gone = next(m for m in page if m["id"] == m1["id"])
    assert gone["deleted"] and gone["content"] == ""
    replying = next(m for m in page if m["id"] == m2["id"])
    assert replying["reply_to"]["deleted"]
    wa.close(); wb.close()
