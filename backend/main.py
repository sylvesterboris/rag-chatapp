"""
main.py
-------
FastAPI backend for the RAG Creator Chatbot.

Endpoints:
  POST /api/ingest          — takes two video URLs, ingests data, returns session_id
  GET  /api/session/{id}    — returns metadata for both videos
  POST /api/chat/{id}       — streaming SSE chat endpoint
  DELETE /api/session/{id}  — clean up session + vector data
  GET  /health              — health check
"""

from __future__ import annotations
import os, uuid, logging, asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl

from video_ingestion import fetch_video, VideoMetadata
from vector_store import chunk_and_embed, delete_session
from rag_chain import init_session, stream_chat, get_session_metadata, clear_session

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────── App Setup ────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("RAG Creator Chatbot API starting up...")
    yield
    logger.info("Shutting down.")

app = FastAPI(
    title="RAG Creator Chatbot API",
    description="Full-stack RAG chatbot for comparing social media videos.",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────── Schemas ──────────────────────────

class IngestRequest(BaseModel):
    url_a: str   # YouTube URL (Video A)
    url_b: str   # Instagram Reel URL (Video B)


class IngestResponse(BaseModel):
    session_id: str
    video_a: dict
    video_b: dict
    message: str


class ChatRequest(BaseModel):
    message: str


# ─────────────────────────── Routes ───────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest_videos(payload: IngestRequest):
    """
    1. Fetch transcript + metadata for both URLs.
    2. Compute engagement rates.
    3. Chunk, embed, store in ChromaDB.
    4. Initialize LangChain memory session.
    5. Return session_id + metadata for frontend rendering.
    """
    session_id = str(uuid.uuid4())
    logger.info(f"Starting ingestion | session={session_id}")

    # ── Fetch video data (parallel) ──────────────────────────────
    try:
        loop = asyncio.get_event_loop()
        video_a, video_b = await asyncio.gather(
            loop.run_in_executor(None, fetch_video, payload.url_a, "A"),
            loop.run_in_executor(None, fetch_video, payload.url_b, "B"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected ingestion error")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

    # ── Chunk + Embed + Store ────────────────────────────────────
    try:
        await asyncio.gather(
            loop.run_in_executor(None, chunk_and_embed, video_a, session_id),
            loop.run_in_executor(None, chunk_and_embed, video_b, session_id),
        )
    except Exception as e:
        logger.exception("Vector store error")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

    # ── Serialize metadata (strip transcript to save bandwidth) ──
    def meta_dict(v: VideoMetadata) -> dict:
        return {
            "video_id": v.video_id_label,
            "platform": v.platform,
            "url": v.url,
            "title": v.title,
            "creator": v.creator,
            "follower_count": v.follower_count,
            "views": v.views,
            "likes": v.likes,
            "comments": v.comments,
            "engagement_rate": v.engagement_rate,
            "hashtags": v.hashtags,
            "upload_date": v.upload_date,
            "duration_seconds": v.duration_seconds,
            "chunk_count": len(v.transcript_chunks),
        }

    meta_a = meta_dict(video_a)
    meta_b = meta_dict(video_b)

    # ── Init RAG session ─────────────────────────────────────────
    init_session(session_id, meta_a, meta_b)

    logger.info(
        f"Ingestion complete | session={session_id} | "
        f"A:{video_a.title[:30]} | B:{video_b.title[:30]}"
    )

    return IngestResponse(
        session_id=session_id,
        video_a=meta_a,
        video_b=meta_b,
        message="Videos ingested successfully. Chat is ready.",
    )


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Return metadata for an existing session."""
    meta = get_session_metadata(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")
    return meta


@app.post("/api/chat/{session_id}")
async def chat(session_id: str, payload: ChatRequest):
    """
    Streaming SSE endpoint. Yields:
      - text tokens as they arrive from the LLM
      - a final __SOURCES__ JSON block for citations
    
    Uses Server-Sent Events (text/event-stream).
    """
    meta = get_session_metadata(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for token in stream_chat(session_id, payload.message):
                # SSE format: "data: <payload>\n\n"
                yield f"data: {token}\n\n"
        except Exception as e:
            logger.exception("Chat streaming error")
            yield f"data: [ERROR] {e}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/api/session/{session_id}")
async def delete_session_endpoint(session_id: str, background_tasks: BackgroundTasks):
    """Clean up session memory + ChromaDB chunks."""
    meta = get_session_metadata(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")
    
    background_tasks.add_task(delete_session, session_id)
    clear_session(session_id)
    return {"message": f"Session {session_id} deleted.", "session_id": session_id}
