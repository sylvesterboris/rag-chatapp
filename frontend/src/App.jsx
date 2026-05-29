import React, { useState, useCallback } from 'react'
import { RefreshCw, Github, Zap } from 'lucide-react'
import VideoCard from './components/VideoCard.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import IngestForm from './components/IngestForm.jsx'
import { deleteSession } from './utils/useApi.js'

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  topbar: {
    height: 48,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 16,
    flexShrink: 0,
    background: 'var(--bg)',
    position: 'relative',
    zIndex: 10,
  },
  topbarLogo: {
    fontFamily: 'var(--font-sans)',
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: -0.3,
    color: 'var(--text)',
  },
  topbarAccent: {
    color: 'var(--accent)',
  },
  topbarDivider: {
    width: 1,
    height: 20,
    background: 'var(--border)',
  },
  topbarSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  topbarRight: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 3,
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'border-color 0.15s, color 0.15s',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1.6fr',
    gridTemplateRows: '1fr',
    gap: 12,
    padding: 12,
    overflow: 'hidden',
    minHeight: 0,
  },
  sessionBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
    letterSpacing: 0.5,
  },
}

export default function App() {
  const [session, setSession] = useState(null)   // { session_id, video_a, video_b }
  const [showForm, setShowForm] = useState(true)

  const handleIngestSuccess = useCallback((result) => {
    setSession(result)
    setShowForm(false)
  }, [])

  const handleReset = useCallback(async () => {
    if (session?.session_id) {
      try { await deleteSession(session.session_id) } catch (_) {}
    }
    setSession(null)
    setShowForm(true)
  }, [session])

  const maxEng = session
    ? Math.max(
        session.video_a?.engagement_rate ?? 0,
        session.video_b?.engagement_rate ?? 0
      )
    : 0

  return (
    <div style={styles.app}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <span style={styles.topbarLogo}>
          Creator<span style={styles.topbarAccent}>IQ</span>
        </span>
        <div style={styles.topbarDivider} />
        <span style={styles.topbarSub}>RAG Video Analyst</span>

        {session && (
          <>
            <div style={styles.topbarDivider} />
            <span style={styles.sessionBadge}>session: {session.session_id?.slice(0, 8)}</span>
          </>
        )}

        <div style={styles.topbarRight}>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            style={{ ...styles.iconBtn, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Github size={14} />
          </a>
          <button
            style={styles.iconBtn}
            onClick={handleReset}
            title="Reset — analyze new videos"
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-dim)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Main layout: [Video A] [Video B] [Chat] */}
      <div style={styles.main}>
        <VideoCard video={session?.video_a} maxEngagement={maxEng} />
        <VideoCard video={session?.video_b} maxEngagement={maxEng} />
        <ChatPanel sessionId={session?.session_id} disabled={!session} />
      </div>

      {/* Ingest modal */}
      {showForm && <IngestForm onSuccess={handleIngestSuccess} />}
    </div>
  )
}
