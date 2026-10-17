# Project context

Omegle-style anonymous **text** chat ("PingPong"), 18+, no sexual content. Friends + DMs are a secondary feature reached through mutual "Add friend".

## Layout
```
backend/
  main.py                 FastAPI app, CORS, security headers, /ws, background matcher
  config.py               Settings (env)            auth.py      JWT, refresh rotation, deps
  models.py               Beanie documents          schemas.py   request schemas
  ratelimit.py            in-process sliding-window limiter
  moderation/
    normalize.py          evasion-resistant text variants
    rules.py              categorised regex rules + spelled-out stems
    engine.py             scan() + evaluate() with per-participant context → Verdict
    enforcement.py        strikes/ban ladder, suspensions, age reviews, system reports, audit log
    ai.py                 optional Claude conversation monitor (structured output)
  matching/
    matchmaker.py         interest/block/cooldown aware queue
    sessions.py           live sessions, rolling transcript, 15-min post-chat report window
  websocket/
    handler.py            first-frame auth, Origin check, dispatch
    stranger.py           join/skip/message/typing/connect + applying verdicts
    manager.py            one socket per user
  routers/                auth, users, friends, conversations, reports, stranger, admin
  tests/                  pytest (in-memory Mongo via mongomock-motor)
frontend/
  app/                    landing, rules, (auth)/login|register, (app)/chat|messages|friends|settings|admin|onboarding
  components/             ui primitives, app shell, report dialog, etc.
  lib/                    api (fetch + silent refresh), session, socket, stranger & messages stores
```

## WebSocket protocol
Client → `auth`, `stranger.join|next|leave|message(reply_to)|typing|connect|serve|rate|play_cpu|react|edit|unsend|seen`, `dm.typing`, `ping`.
Server → `auth.ok`, `stranger.searching|matched(cpu)|message(id, reply_to)|ack(id)|rejected|notice|support|typing|ended|serve|rated|reaction|edited|edit_rejected|unsent|seen|connect_pending|connect_requested|connected|idle`, `moderation.banned|warning`, `account.suspended`, `dm.message|typing|read|edited|deleted|reaction`, `presence`, `friend.request|accepted|removed`, `error`.

## Decisions
- Stranger message text is never persisted; transcripts live in memory and are copied into a Report only when reported/flagged.
- Reports reference the session, not a user id, so reporters can't target arbitrary accounts and evidence comes from the server.
- Overlapping rules in one category count once; sexual score decays per message so old remarks fade.
- Ambiguous child-safety hits (explicit + "kid") open an urgent human review instead of auto-suspending; clear ones (CSAM terms, explicit + stated minor age, explicit towards a self-declared minor) auto-suspend.
- AI monitor verdicts strike/ban and file reports but never auto-suspend — a human confirms.
- Reactions are limited to a fixed 16-emoji palette (no free text), so they can't carry messages past the filter.
- Edits are re-moderated like new messages; unsend hides a message for both sides but the original (and edit history) is kept for reports.
- CPU bots are always disclosed as bots and never counted as online players.
