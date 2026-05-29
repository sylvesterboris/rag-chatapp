"""
vector_store.py
---------------
Chunks transcripts, embeds them with OpenAI text-embedding-3-small,
and stores them in ChromaDB with rich metadata tags.

Design decisions:
- ChromaDB: zero-infra, runs in-process, free, persisted to disk.
  At 1000 creators/day with ~10 min avg video → ~1500 tokens/video,
  chunked at 500 tokens = ~3 chunks each = 6 chunks per pair = 6000 docs/day.
  ChromaDB handles millions of docs; no cost until you need managed hosting.
- Embedding model: text-embedding-3-small @ $0.00002/1K tokens.
  6 chunks × 500 tokens × 1000 creators = 3M tokens/day ≈ $0.06/day.
  Far cheaper than ada-002 ($0.10/1K) or any GPU-hosted model at scale.
- If cost must drop to zero: use BAAI/bge-small-en (free, runs on CPU,
  768-dim, MTEB score ~63 — still solid for RAG).
"""

from __future__ import annotations
import os, hashlib, logging, threading
from typing import List
import chromadb
import requests
from chromadb.config import Settings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from video_ingestion import VideoMetadata

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME = "video_transcripts"

# ── Singleton ChromaDB client ────────────────────────────────────────────────
# Concurrent calls to chunk_and_embed (one per video) both hit this on first
# ingestion. A lock guarantees only one thread initialises the SQLite DB,
# which prevents the "Could not connect to tenant default_tenant" race.
_chroma_client: chromadb.ClientAPI | None = None
_chroma_lock = threading.Lock()


def _get_chroma_client() -> chromadb.ClientAPI:
    """Return the module-level singleton ChromaDB persistent client."""
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client
    with _chroma_lock:
        # Double-checked locking: re-test after acquiring the lock
        if _chroma_client is not None:
            return _chroma_client
        os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
        client = chromadb.PersistentClient(
            path=CHROMA_PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
        # Pre-create the collection under the lock to prevent thread races
        # where concurrent calls try to create the same collection simultaneously
        client.get_or_create_collection(name=COLLECTION_NAME)
        _chroma_client = client
        logger.info(f"ChromaDB initialised at {CHROMA_PERSIST_DIR} with collection {COLLECTION_NAME}")
    return _chroma_client


class GeminiRESTEmbeddings(Embeddings):
    """Custom REST-based Gemini embeddings to completely bypass gRPC-in-Docker bugs."""
    def __init__(self, api_key: str, model: str = "models/gemini-embedding-2"):
        self.api_key = api_key
        self.model = model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        url = f"https://generativelanguage.googleapis.com/v1beta/{self.model}:embedContent?key={self.api_key}"
        for text in texts:
            try:
                resp = requests.post(
                    url,
                    json={
                        "model": self.model,
                        "content": {"parts": [{"text": text}]},
                        "outputDimensionality": 768,
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=15,
                )
                resp.raise_for_status()
                embedding = resp.json()["embedding"]["values"]
                embeddings.append(embedding)
            except Exception as e:
                logger.error(f"Gemini REST embedding failed for chunk: {e}")
                # Fallback to zero vector if a single chunk fails, so we don't crash
                embeddings.append([0.0] * 768)
        return embeddings

    def embed_query(self, text: str) -> List[float]:
        url = f"https://generativelanguage.googleapis.com/v1beta/{self.model}:embedContent?key={self.api_key}"
        try:
            resp = requests.post(
                url,
                json={
                    "model": self.model,
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": 768,
                },
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()["embedding"]["values"]
        except Exception as e:
            logger.error(f"Gemini REST query embedding failed: {e}")
            return [0.0] * 768


def get_embeddings():
    """Return configured embedding model. Swappable to Gemini, BGE or Cohere."""
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        return GeminiRESTEmbeddings(api_key=gemini_key)
    model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    return OpenAIEmbeddings(
        model=model,
        openai_api_key=os.getenv("OPENAI_API_KEY"),
    )


def get_vector_store() -> Chroma:
    """Get or create the persistent ChromaDB vector store."""
    client = _get_chroma_client()
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings(),
        client=client,
    )


def chunk_and_embed(video: VideoMetadata, session_id: str) -> List[Document]:
    """
    Split transcript into chunks, attach metadata, embed + store in ChromaDB.
    Returns list of LangChain Documents (for inspection / testing).

    Metadata schema per chunk:
        video_id        : "A" or "B"
        session_id      : UUID for this ingestion session
        platform        : "youtube" | "instagram"
        title           : video title
        creator         : channel/account name
        follower_count  : int
        views, likes, comments : int
        engagement_rate : float
        hashtags        : comma-separated string
        upload_date     : YYYY-MM-DD
        duration_seconds: int
        chunk_index     : int (position within transcript)
        source          : "<platform>:<url>"
    """
    chunk_size = int(os.getenv("CHUNK_SIZE", 500))
    chunk_overlap = int(os.getenv("CHUNK_OVERLAP", 50))

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", "! ", "? ", " "],
    )

    chunks = splitter.split_text(video.transcript)
    if not chunks:
        chunks = ["[No transcript content available]"]

    # Store back on the VideoMetadata object
    video.transcript_chunks = chunks

    base_metadata = {
        "video_id":         video.video_id_label,
        "session_id":       session_id,
        "platform":         video.platform,
        "title":            video.title,
        "creator":          video.creator,
        "follower_count":   video.follower_count,
        "views":            video.views,
        "likes":            video.likes,
        "comments":         video.comments,
        "engagement_rate":  video.engagement_rate,
        "hashtags":         ", ".join(video.hashtags),
        "upload_date":      video.upload_date,
        "duration_seconds": video.duration_seconds,
        "source":           f"{video.platform}:{video.url}",
        "url":              video.url,
    }

    documents: List[Document] = []
    doc_ids: List[str] = []
    for idx, chunk_text in enumerate(chunks):
        doc_id = _stable_doc_id(session_id, video.video_id_label, idx)
        doc = Document(
            page_content=chunk_text,
            metadata={**base_metadata, "chunk_index": idx, "doc_id": doc_id},
        )
        documents.append(doc)
        doc_ids.append(doc_id)

    # Upsert into ChromaDB
    vs = get_vector_store()
    vs.add_documents(documents, ids=doc_ids)
    logger.info(
        f"[{video.video_id_label}] Stored {len(documents)} chunks "
        f"(session={session_id}) in ChromaDB."
    )
    return documents


def _stable_doc_id(session_id: str, label: str, idx: int) -> str:
    """Create deterministic doc ID to allow safe re-ingestion (upsert)."""
    raw = f"{session_id}:{label}:{idx}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def get_retriever(session_id: str, k: int = 4):
    """
    Return a LangChain retriever scoped to a specific session.
    Filters by session_id so chat sessions don't bleed into each other.
    """
    vs = get_vector_store()
    return vs.as_retriever(
        search_type="mmr",           # Max Marginal Relevance — reduces redundancy
        search_kwargs={
            "k": k,
            "fetch_k": k * 3,
            "filter": {"session_id": session_id},
        },
    )


def delete_session(session_id: str) -> int:
    """Remove all chunks for a given session (cleanup on demand)."""
    vs = get_vector_store()
    results = vs.get(where={"session_id": session_id})
    ids = results.get("ids", [])
    if ids:
        vs.delete(ids=ids)
    logger.info(f"Deleted {len(ids)} chunks for session={session_id}")
    return len(ids)
