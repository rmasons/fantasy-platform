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

    @property
    def origins(self) -> list[str]:
        """`allowed_origins` parsed into the list CORS middleware wants.

        TODO(spec 01 section 1): split on commas, strip whitespace, and drop
        blanks — `"http://a, http://b,"` must yield two origins, not three with
        one empty.

        The field itself stays a plain `str` on purpose: for any complex field
        type, pydantic-settings JSON-parses the environment value first, so
        `ALLOWED_ORIGINS=http://a,http://b` against a `list[str]` field raises a
        JSON decode error rather than a useful one.
        """
        raise NotImplementedError

@lru_cache
def get_settings() -> Settings:
    return Settings()
