from typing import Any, Optional

from beanie import init_beanie

from config import settings
import models

DOCUMENT_MODELS = [
    models.User,
    models.RefreshToken,
    models.Friendship,
    models.Conversation,
    models.ConversationMember,
    models.Message,
    models.ChatSession,
    models.Report,
    models.Block,
    models.ModerationEvent,
    models.BannedIdentity,
]

_client: Optional[Any] = None


async def init_db():
    global _client
    if settings.USE_INMEMORY_DB:
        # Local demos and tests only — data is lost on restart.
        from mongomock_motor import AsyncMongoMockClient
        _client = AsyncMongoMockClient()
    else:
        from motor.motor_asyncio import AsyncIOMotorClient
        _client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            appname="pingpong-api",
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            retryWrites=True,
            tz_aware=True,
        )

    await init_beanie(database=_client[settings.DB_NAME], document_models=DOCUMENT_MODELS)
    await _backfill_conversation_members()


async def ping_db() -> bool:
    if _client is None:
        return False
    if settings.USE_INMEMORY_DB:
        return True
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        return False


def close_db() -> None:
    if _client is not None and not settings.USE_INMEMORY_DB:
        _client.close()


async def _backfill_conversation_members():
    """Older data stored membership only in ConversationMember; copy it onto Conversation."""
    async for conv in models.Conversation.find({"member_ids": {"$size": 0}}):
        links = await models.ConversationMember.find({"conversation_id": conv.id}).to_list()
        if links:
            conv.member_ids = [m.user_id for m in links]
            await conv.save()
