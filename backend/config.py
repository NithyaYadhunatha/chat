from typing import List, Optional

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Core ────────────────────────────────────────────────────────────────
    ENV: str = "development"  # "development" | "production"
    MONGODB_URL: str = "mongodb://localhost:27017"
    DB_NAME: str = "chatapp"
    # Set to true to run against an in-memory database (local demos / tests only).
    USE_INMEMORY_DB: bool = False

    # ── Auth ────────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    # Comma-separated emails that are granted the admin role on sign-in.
    ADMIN_EMAILS: str = ""

    # ── HTTP ────────────────────────────────────────────────────────────────
    # Comma-separated list of origins allowed for CORS and WebSocket handshakes.
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    # Honour X-Forwarded-For (only enable behind a proxy you control).
    TRUST_PROXY: bool = False

    # ── Safety ──────────────────────────────────────────────────────────────
    MIN_AGE: int = 18
    # Optional AI conversation monitor (Claude). Disabled when no key is set.
    ANTHROPIC_API_KEY: Optional[str] = None
    MODERATION_MODEL: str = "claude-opus-5-5"
    # Run the AI monitor at most once per session per this many seconds.
    AI_MODERATION_INTERVAL_SECONDS: float = 6.0

    # ── CPU opponents (bots) ────────────────────────────────────────────────
    # Clearly-labelled practice bots so nobody waits forever while it's quiet.
    BOTS_ENABLED: bool = True
    BOT_AFTER_SECONDS: float = 12.0   # offer a CPU match after waiting this long
    BOT_MODEL: str = "claude-opus-5-5"  # used only when ANTHROPIC_API_KEY is set

    # ── Ops ─────────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    MAX_BODY_BYTES: int = 64 * 1024

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_strength(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters (use `openssl rand -hex 32`)")
        return v

    @model_validator(mode="after")
    def production_guardrails(self) -> "Settings":
        """Refuse to boot in production with settings that would be unsafe."""
        if not self.is_production:
            return self
        problems = []
        if self.USE_INMEMORY_DB:
            problems.append("USE_INMEMORY_DB must be false")
        if "replace-me" in self.SECRET_KEY or len(set(self.SECRET_KEY)) < 10:
            problems.append("SECRET_KEY looks like a placeholder")
        insecure = [o for o in self.allowed_origins if not o.startswith("https://")]
        if not self.allowed_origins or insecure:
            problems.append(f"ALLOWED_ORIGINS must be https:// origins (got {self.ALLOWED_ORIGINS!r})")
        if problems:
            raise ValueError("Unsafe production config: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def allowed_origins(self) -> List[str]:
        return [o.strip().rstrip("/") for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def ai_moderation_enabled(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY)


settings = Settings()
