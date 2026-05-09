from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from config import settings
import models


async def init_db():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    database = client[settings.DB_NAME]

    await init_beanie(
        database=database,
        document_models=[
            models.User,
            models.Friendship,
            models.Conversation,
            models.ConversationMember,
            models.Message,
            models.ChatSession,
            models.Report,
            models.BannedPhrase,
        ]
    )
