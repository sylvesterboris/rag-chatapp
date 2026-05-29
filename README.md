# CreatorIQ — Full-Stack RAG Video Analyst

> A production-grade RAG chatbot that ingests two social media videos (YouTube + Instagram Reel), embeds their transcripts into a vector database, and powers a streaming chat interface where creators can ask nuanced questions about engagement, hooks, and content strategy.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│   React + Vite  ·  Side-by-side video cards  ·  SSE chat   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP + SSE
┌───────────────────────────▼─────────────────────────────────┐
│                        FastAPI Backend                      │
│                                                             │
│  /api/ingest ──► video_ingestion.py                         │
│                  ├─ YouTube: youtube-transcript-api         │
│                  │          + YouTube Data API v3           │
│                  └─ Instagram: yt-dlp captions              │
│                              + RapidAPI scraper             │
│                                                             │
│  /api/chat/{id} ──► rag_chain.py (LangChain)               │
│                     ├─ ConversationBufferWindowMemory       │
│                     ├─ MMR retrieval from ChromaDB          │
│                     ├─ Dynamic system prompt w/ metadata    │
│                     └─ GPT-4o streaming + source citations  │
│                                                             │
│  vector_store.py                                            │
│  ├─ RecursiveCharacterTextSplitter (500 tokens, 50 overlap) │
│  ├─ OpenAI text-embedding-3-small                          │
│  └─ ChromaDB (persistent, session-scoped)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast HMR, lightweight bundle (172 KB gzipped: 54 KB) |
| Backend | FastAPI | Async-native, perfect for SSE streaming |
| Orchestration | LangChain | `ConversationBufferWindowMemory` + `Chroma` retriever |
| Embeddings | `text-embedding-3-small` | $0.00002/1K tokens — cheapest OpenAI embedding |
| Vector DB | ChromaDB | Zero infra, in-process, persisted to disk |
| LLM | GPT-4o | Best quality/cost for analytical reasoning |
| YT Transcript | `youtube-transcript-api` | No API key needed for public videos |
| YT Metadata | YouTube Data API v3 | Free tier: 10,000 units/day |
| IG Transcript | `yt-dlp` + Whisper fallback | Auto-subs first, audio transcription fallback |
| IG Metadata | RapidAPI Instagram Scraper | Free tier: 100 req/month |

---

## Quickstart

### 1. Clone & configure

```bash
git clone https://github.com/your-handle/rag-creator-chatbot
cd rag-creator-chatbot
cp .env.example .env
# Fill in OPENAI_API_KEY, YOUTUBE_API_KEY, RAPIDAPI_KEY
```

### 2. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev   # → http://localhost:3000
```

### 4. Docker (optional)

```bash
docker-compose up --build
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Ingest two video URLs, returns `session_id` + metadata |
| `GET` | `/api/session/{id}` | Get video metadata for a session |
| `POST` | `/api/chat/{id}` | **Streaming SSE** — send a message, receive streamed tokens + `__SOURCES__` block |
| `DELETE` | `/api/session/{id}` | Clean up session memory + ChromaDB vectors |
| `GET` | `/health` | Health check |

### Ingest payload
```json
{
  "url_a": "https://youtube.com/watch?v=...",
  "url_b": "https://instagram.com/reel/..."
}
```

### Chat SSE format
```
data: token1
data: token2
data: ...
data: __SOURCES__[{"video_id":"A","chunk_index":0,"title":"...","snippet":"..."}]
data: [DONE]
```

---

## Cost & Scalability Analysis

### At 1,000 creators/day

| Component | Volume | Cost/day |
|---|---|---|
| Embeddings (`text-embedding-3-small`) | ~3M tokens (6 chunks × 500 tokens × 1000 pairs) | **$0.06** |
| GPT-4o (chat) | ~10 queries × 1000 creators × ~1500 tokens avg | **~$3.00** |
| YouTube Data API | 1000 video + 1000 channel calls = 2000 units | **Free** (10K/day quota) |
| ChromaDB | Self-hosted / local | **$0** |
| yt-dlp + Whisper (IG audio fallback) | ~20% of IG videos (180s avg @ $0.006/min) | **~$0.50** |
| **Total** | | **~$3.56/day** |

### Why this stack is optimal

1. **ChromaDB over Pinecone**: Pinecone Starter is capped at 1 index with 100K vectors. At 6 chunks/pair × 1000/day = 6K vectors/day, you'd hit the limit in 16 days. ChromaDB is unlimited and free until you need managed infra (then switch to Qdrant Cloud at ~$25/mo).

2. **`text-embedding-3-small` over `ada-002`**: Same dimensions (1536), 5× cheaper, comparable MTEB scores. At scale, swap to `BAAI/bge-small-en-v1.5` (free, runs on CPU, 384-dim) to eliminate embedding costs entirely — at a ~5% quality trade-off.

3. **MMR retrieval over simple similarity**: `search_type="mmr"` reduces redundant chunk retrieval without extra cost. Fetch 15 chunks, return top 5 diverse ones — better coverage for comparison queries.

4. **SSE over WebSockets**: SSE is HTTP/1.1 compatible, simpler, and perfectly sufficient for unidirectional streaming. No connection overhead. Works through every CDN/reverse proxy without configuration.

5. **Session-scoped ChromaDB filters**: Each ingestion is tagged with a `session_id`. Retrieval filters by session, so 1000 concurrent creator sessions don't bleed into each other.

### Scaling beyond 1,000/day

- **Embeddings**: Switch to `bge-small-en` on a `t3.medium` instance → $0 marginal cost
- **Vector DB**: Migrate ChromaDB → Qdrant Cloud (horizontal scaling, ANN indexing, ~$25/mo for 10M vectors)
- **LLM**: Add a caching layer (semantic cache with Redis) to avoid re-answering identical queries — can cut GPT-4o costs by 40–60% at scale
- **Ingestion**: Queue via Celery + Redis; parallel worker pool for yt-dlp + embedding calls
- **Frontend**: Deploy on Vercel (free); backend on Railway/Fly.io ($5–20/mo)

---

## Environment Variables

See `.env.example` for all required variables.

```
OPENAI_API_KEY      — required for embeddings + LLM
YOUTUBE_API_KEY     — YouTube Data API v3 key
RAPIDAPI_KEY        — RapidAPI key for Instagram scraper
CHROMA_PERSIST_DIR  — where to store ChromaDB files (default: ./chroma_db)
LLM_MODEL           — default: gpt-4o
EMBEDDING_MODEL     — default: text-embedding-3-small
CHUNK_SIZE          — default: 500
CHUNK_OVERLAP       — default: 50
```

---

## Project Structure

```
rag-creator-chatbot/
├── backend/
│   ├── main.py              # FastAPI app, all routes
│   ├── video_ingestion.py   # YouTube + Instagram transcript + metadata
│   ├── vector_store.py      # Chunking, embedding, ChromaDB
│   ├── rag_chain.py         # LangChain RAG with memory + streaming
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root layout
│   │   ├── components/
│   │   │   ├── VideoCard.jsx    # Video metadata card
│   │   │   ├── ChatPanel.jsx    # Streaming chat with citations
│   │   │   └── IngestForm.jsx   # URL input modal with progress
│   │   ├── utils/
│   │   │   └── useApi.js        # API calls + SSE parsing
│   │   └── index.css            # Design system variables
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## License

MIT
