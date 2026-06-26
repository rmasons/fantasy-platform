from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import health, leagues
from core.config import get_settings
from core.db.pool import close_pool, get_pool


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    get_pool()  # open the pool eagerly so the first request isn't slow
    if settings.firebase_project_id:
        import firebase_admin

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
    yield
    close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Fantasy Platform API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(leagues.router)
    return app


app = create_app()
