from __future__ import annotations

import os
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "chatbox.db"
DEFAULT_MODELS = [
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "deep-research-pro-preview-12-2025",
]


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                interaction_id TEXT NOT NULL,
                last_model TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(chat_id) REFERENCES chats(id)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
            """
        )
        existing = conn.execute("SELECT COUNT(*) FROM models").fetchone()[0]
        if existing == 0:
            now = _utc_now()
            conn.executemany(
                "INSERT INTO models (name, created_at) VALUES (?, ?)",
                [(name, now) for name in DEFAULT_MODELS],
            )


def _fetch_models(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT id, name, created_at FROM models ORDER BY id").fetchall()
    return [dict(row) for row in rows]


def _fetch_chats(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, interaction_id, last_model, created_at, updated_at "
        "FROM chats ORDER BY updated_at DESC"
    ).fetchall()
    return [dict(row) for row in rows]


def _fetch_messages(conn: sqlite3.Connection, chat_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT id, chat_id, role, content, created_at "
        "FROM messages WHERE chat_id = ? ORDER BY id",
        (chat_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _ensure_api_key() -> None:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Missing GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable.",
        )
    if not os.getenv("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = key


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def _run_interaction(
    model_name: str, content: str, previous_interaction_id: str | None
) -> tuple[str, str]:
    _ensure_api_key()
    client = genai.Client()
    use_agent = model_name.startswith("deep-research")

    if use_agent:
        interaction = client.interactions.create(
            input=content,
            agent=model_name,
            previous_interaction_id=previous_interaction_id,
            background=True,
        )
        interaction_id = interaction.id
        for _ in range(60):
            interaction = client.interactions.get(interaction_id)
            status = interaction.status
            if status == "completed":
                break
            if status in ["failed", "cancelled"]:
                raise HTTPException(status_code=502, detail=f"Deep research {status}.")
            time.sleep(2)
        else:
            raise HTTPException(
                status_code=504,
                detail="Deep research is still running. Try again shortly.",
            )
        outputs = interaction.outputs or []
    else:
        interaction = client.interactions.create(
            model=model_name,
            input=content,
            previous_interaction_id=previous_interaction_id,
        )
        interaction_id = interaction.id
        outputs = interaction.outputs or []

    if not outputs:
        raise HTTPException(status_code=502, detail="Gemini returned no output.")
    text = outputs[-1].text or ""
    if not text.strip():
        raise HTTPException(status_code=502, detail="Gemini returned an empty response.")
    return text, interaction_id


app = FastAPI()
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.on_event("startup")
def _startup() -> None:
    _init_db()


@app.get("/")
def root() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/models")
def list_models() -> dict:
    with _get_db() as conn:
        return {"models": _fetch_models(conn)}


@app.post("/api/models")
def create_model(payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Model name is required.")

    with _get_db() as conn:
        now = _utc_now()
        try:
            cursor = conn.execute(
                "INSERT INTO models (name, created_at) VALUES (?, ?)", (name, now)
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Model already exists.")
        model_id = cursor.lastrowid
    return {"model": {"id": model_id, "name": name, "created_at": now}}


@app.put("/api/models/{model_id}")
def update_model(model_id: int, payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Model name is required.")

    with _get_db() as conn:
        try:
            cursor = conn.execute(
                "UPDATE models SET name = ? WHERE id = ?", (name, model_id)
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Model already exists.")
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Model not found.")
    return {"model": {"id": model_id, "name": name}}


@app.delete("/api/models/{model_id}")
def delete_model(model_id: int) -> dict:
    with _get_db() as conn:
        cursor = conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Model not found.")
    return {"deleted": True}


@app.get("/api/chats")
def list_chats() -> dict:
    with _get_db() as conn:
        return {"chats": _fetch_chats(conn)}


@app.post("/api/chats")
def create_chat(payload: dict | None = None) -> dict:
    payload = payload or {}
    title = (payload.get("title") or "New Chat").strip() or "New Chat"
    interaction_id = ""
    now = _utc_now()
    with _get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO chats (title, interaction_id, last_model, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (title, interaction_id, payload.get("model_name"), now, now),
        )
        chat_id = cursor.lastrowid
    return {
        "chat": {
            "id": chat_id,
            "title": title,
            "interaction_id": interaction_id,
            "last_model": payload.get("model_name"),
            "created_at": now,
            "updated_at": now,
        }
    }


@app.get("/api/chats/{chat_id}")
def get_chat(chat_id: int) -> dict:
    with _get_db() as conn:
        chat_row = conn.execute(
            "SELECT id, title, interaction_id, last_model, created_at, updated_at "
            "FROM chats WHERE id = ?",
            (chat_id,),
        ).fetchone()
        if not chat_row:
            raise HTTPException(status_code=404, detail="Chat not found.")
        messages = _fetch_messages(conn, chat_id)
    return {"chat": dict(chat_row), "messages": messages}


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: int) -> dict:
    with _get_db() as conn:
        conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
        cursor = conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Chat not found.")
    return {"deleted": True}


@app.post("/api/chats/{chat_id}/messages")
def send_message(chat_id: int, payload: dict) -> dict:
    content = (payload.get("content") or "").strip()
    model_name = (payload.get("model_name") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content is required.")
    if not model_name:
        raise HTTPException(status_code=400, detail="Model name is required.")

    with _get_db() as conn:
        chat_row = conn.execute(
            "SELECT id, title, interaction_id FROM chats WHERE id = ?", (chat_id,)
        ).fetchone()
        if not chat_row:
            raise HTTPException(status_code=404, detail="Chat not found.")

        now = _utc_now()
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (chat_id, "user", content, now),
        )

    interaction_id = chat_row["interaction_id"] or ""
    previous_interaction_id = None
    if interaction_id and not _is_uuid(interaction_id):
        previous_interaction_id = interaction_id

    reply_text, interaction_id = _run_interaction(
        model_name, content, previous_interaction_id
    )

    with _get_db() as conn:
        now = _utc_now()
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (chat_id, "model", reply_text, now),
        )
        title = chat_row["title"]
        if title == "New Chat":
            title = content[:60].strip() or "New Chat"
            conn.execute("UPDATE chats SET title = ? WHERE id = ?", (title, chat_id))
        conn.execute(
            "UPDATE chats SET interaction_id = ?, last_model = ?, updated_at = ? WHERE id = ?",
            (interaction_id, model_name, now, chat_id),
        )
        message_row = conn.execute(
            "SELECT id, chat_id, role, content, created_at "
            "FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1",
            (chat_id,),
        ).fetchone()
        chat_row = conn.execute(
            "SELECT id, title, interaction_id, last_model, created_at, updated_at "
            "FROM chats WHERE id = ?",
            (chat_id,),
        ).fetchone()

    return {"message": dict(message_row), "chat": dict(chat_row)}
