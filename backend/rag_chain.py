"""
rag_chain.py
------------
LangChain RAG pipeline with:
 - Conversational memory (windowed buffer)
 - Source-cited streaming responses
 - Dynamic system prompt injected with video metadata
 - MMR retrieval scoped to session
"""

from __future__ import annotations
import os, json, logging
from typing import AsyncIterator, Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain.memory import ConversationBufferWindowMemory
from langchain_core.documents import Document
from vector_store import get_retriever

logger = logging.getLogger(__name__)


# In-memory session store: session_id → { memory, video_meta }
_sessions: Dict[str, Dict[str, Any]] = {}


def init_session(session_id: str, video_meta_a: dict, video_meta_b: dict):
    """Initialize (or reset) a chat session with video metadata context."""
    _sessions[session_id] = {
        "memory": ConversationBufferWindowMemory(
            k=10,
            return_messages=True,
            memory_key="chat_history",
        ),
        "video_a": video_meta_a,
        "video_b": video_meta_b,
    }
    logger.info(f"Session {session_id} initialized.")


def _build_system_prompt(video_a: dict, video_b: dict) -> str:
    """Construct dynamic system prompt from actual video metadata."""
    def fmt(v: dict) -> str:
        return (
            f"  Title: {v.get('title', 'N/A')}\n"
            f"  Creator: {v.get('creator', 'N/A')} "
            f"({v.get('follower_count', 0):,} followers)\n"
            f"  Platform: {v.get('platform', 'N/A')}\n"
            f"  Views: {v.get('views', 0):,} | Likes: {v.get('likes', 0):,} | "
            f"Comments: {v.get('comments', 0):,}\n"
            f"  Engagement Rate: {v.get('engagement_rate', 0):.2f}%\n"
            f"  Hashtags: {v.get('hashtags', 'N/A')}\n"
            f"  Upload Date: {v.get('upload_date', 'N/A')}\n"
            f"  Duration: {v.get('duration_seconds', 0)} seconds\n"
            f"  URL: {v.get('url', 'N/A')}"
        )

    return f"""You are a sharp, data-driven social media analyst helping creators grow.

You have analyzed two videos:

=== VIDEO A ===
{fmt(video_a)}

=== VIDEO B ===
{fmt(video_b)}

CONTEXT CHUNKS:
{{context}}

RULES:
1. Every factual claim must be grounded in the retrieved transcript chunks or the metadata above.
2. Always cite sources as [Video A – chunk N] or [Video B – chunk N] inline.
3. When comparing engagement, use the exact engagement rates: A={video_a.get('engagement_rate', 0):.2f}%, B={video_b.get('engagement_rate', 0):.2f}%.
4. Be specific, analytical, and actionable — not generic.
5. If asked about hooks, quote or paraphrase the FIRST chunk of the relevant video.
6. Structure long answers with clear headers.
7. Do NOT hallucinate statistics or transcript content.
"""


def _format_docs(docs: List[Document]) -> str:
    """Format retrieved docs into context string with citations."""
    parts = []
    for i, doc in enumerate(docs):
        vid = doc.metadata.get("video_id", "?")
        chunk_idx = doc.metadata.get("chunk_index", i)
        parts.append(
            f"[Video {vid} – chunk {chunk_idx}]\n{doc.page_content}"
        )
    return "\n\n---\n\n".join(parts)


def _build_llm():
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=gemini_key,
            temperature=0.3,
            streaming=True,
        )
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "gpt-4o"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        temperature=0.3,
        streaming=True,
    )


async def stream_chat(
    session_id: str,
    user_message: str,
) -> AsyncIterator[str]:
    """
    Core RAG streaming function.
    Yields text tokens as they stream from the LLM.
    Sources are appended at the end as a JSON block.
    """
    if session_id not in _sessions:
        yield "[ERROR] Session not found. Please ingest videos first."
        return

    session = _sessions[session_id]
    memory: ConversationBufferWindowMemory = session["memory"]
    video_a = session["video_a"]
    video_b = session["video_b"]

    # ── Retrieve relevant chunks ─────────────────────────────────
    retriever = get_retriever(session_id, k=5)
    docs: List[Document] = retriever.invoke(user_message)
    context = _format_docs(docs)

    # ── Build source citations payload ───────────────────────────
    sources = [
        {
            "video_id": d.metadata.get("video_id"),
            "chunk_index": d.metadata.get("chunk_index"),
            "title": d.metadata.get("title"),
            "platform": d.metadata.get("platform"),
            "snippet": d.page_content[:120] + "...",
        }
        for d in docs
    ]

    # ── Assemble prompt ──────────────────────────────────────────
    system_content = _build_system_prompt(video_a, video_b).replace(
        "{context}", context
    )

    # Build message list: system + history + current user message
    history = memory.chat_memory.messages  # list of HumanMessage / AIMessage
    messages = [SystemMessage(content=system_content)] + history + [
        HumanMessage(content=user_message)
    ]

    llm = _build_llm()

    # ── Stream tokens ────────────────────────────────────────────
    full_response = ""
    async for chunk in llm.astream(messages):
        token = chunk.content
        if token:
            full_response += token
            yield token

    # ── Append sources JSON block ─────────────────────────────────
    sources_block = "\n\n__SOURCES__" + json.dumps(sources)
    yield sources_block

    # ── Save to memory ───────────────────────────────────────────
    memory.chat_memory.add_user_message(user_message)
    memory.chat_memory.add_ai_message(full_response)


def get_session_metadata(session_id: str) -> dict | None:
    """Return video metadata for a session (used by frontend for initial render)."""
    if session_id not in _sessions:
        return None
    s = _sessions[session_id]
    return {
        "video_a": s["video_a"],
        "video_b": s["video_b"],
    }


def clear_session(session_id: str):
    """Remove session from memory store."""
    _sessions.pop(session_id, None)
