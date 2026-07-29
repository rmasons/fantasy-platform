from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file = '.env',
        env_file_encoding = 'utf-8',
    )

    app_env: str = 'local'
    database_url: str = 'postgresql://fantasy:fantasy@127.0.0.1:5432/fantasy'
    sleeper_base_url: str = 'https://api.sleeper.app/v1'
    allowed_origins: str = 'http://localhost:5173'
    firebase_project_id: str | None = None

@lru_cache
def get_settings() -> Settings:
    return Settings()
