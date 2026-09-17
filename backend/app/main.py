from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.auth import SESSION_SECRET_KEY
from app.auth import router as auth_router
from app.board import router as board_router
from app.chat import router as chat_router
from app.checklists import router as checklist_router
from app.db import init_db
from app.labels import router as label_router

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY, same_site="lax")

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(board_router)
app.include_router(chat_router)
app.include_router(label_router)
app.include_router(checklist_router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
