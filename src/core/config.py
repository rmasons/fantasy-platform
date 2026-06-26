from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven config. Identical code, different values per environment
    (local Docker vs Railway private Postgres) — nothing here is host-specific."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: str = "local"
    database_url: str = "postgresql://fantasy:fantasy@localhost:5432/fantasy"
    sleeper_base_url: str = "https://api.sleeper.app/v1"
    allowed_origins: str = "http://localhost:5173"
    firebase_project_id: str | None = None

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
