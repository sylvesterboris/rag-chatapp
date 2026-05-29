import React, { useState } from 'react'
import { Youtube, Instagram, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { ingestVideos } from '../utils/useApi.js'

const EXAMPLE_YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const EXAMPLE_IG = 'https://www.instagram.com/reel/XXXXXXX/'

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 32,
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  logo: {
    fontFamily: 'var(--font-sans)',
    fontWeight: 800,
    fontSize: 24,
    letterSpacing: -0.5,
    color: 'var(--text)',
  },
  badge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'var(--accent)',
    background: 'rgba(180,255,60,0.1)',
    border: '1px solid rgba(180,255,60,0.2)',
    padding: '2px 6px',
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginTop: -14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '10px 12px',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  hint: {
    fontSize: 10,
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
  },
  btn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 4,
    padding: '11px 20px',
    color: '#0a0a0b',
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    letterSpacing: 0.3,
    transition: 'opacity 0.15s, transform 0.1s',
    width: '100%',
  },
  error: {
    background: 'rgba(255,77,106,0.08)',
    border: '1px solid rgba(255,77,106,0.25)',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 12,
    color: '#ff7a8a',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    lineHeight: 1.5,
  },
  progress: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  progressBar: {
    height: 3,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  },
  stepText: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
}

const STEPS = [
  { label: 'Fetching transcripts...', pct: 20 },
  { label: 'Fetching metadata...', pct: 45 },
  { label: 'Computing engagement rates...', pct: 60 },
  { label: 'Chunking transcripts...', pct: 75 },
  { label: 'Embedding & storing vectors...', pct: 90 },
  { label: 'Initializing RAG session...', pct: 98 },
]

export default function IngestForm({ onSuccess }) {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stepIdx, setStepIdx] = useState(0)

  const handleSubmit = async () => {
    if (!urlA.trim() || !urlB.trim()) {
      setError('Both URLs are required.')
      return
    }
    setError('')
    setLoading(true)
    setStepIdx(0)

    // Simulate step progression while waiting for API
    const interval = setInterval(() => {
      setStepIdx(prev => Math.min(prev + 1, STEPS.length - 1))
    }, 1500)

    try {
      const result = await ingestVideos(urlA.trim(), urlB.trim())
      clearInterval(interval)
      onSuccess(result)
    } catch (err) {
      clearInterval(interval)
      setError(err.message || 'Something went wrong. Check your URLs and API keys.')
      setLoading(false)
    }
  }

  const step = STEPS[stepIdx] || STEPS[STEPS.length - 1]

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="fade-in">
        {/* Logo */}
        <div>
          <div style={styles.logoRow}>
            <span style={styles.logo}>CreatorIQ</span>
            <span style={styles.badge}>RAG · Beta</span>
          </div>
          <p style={styles.subtitle}>
            Compare two social videos with AI-powered analysis. Paste a YouTube and an Instagram Reel URL to begin.
          </p>
        </div>

        {/* URL A */}
        <div style={styles.field}>
          <label style={styles.label}>
            <Youtube size={12} style={{ color: '#ff6b6b' }} /> Video A — YouTube URL
          </label>
          <input
            style={styles.input}
            placeholder={EXAMPLE_YT}
            value={urlA}
            onChange={e => setUrlA(e.target.value)}
            disabled={loading}
            onFocus={e => e.target.style.borderColor = 'var(--border-hi)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <span style={styles.hint}>youtube.com/watch?v=... or youtu.be/...</span>
        </div>

        {/* URL B */}
        <div style={styles.field}>
          <label style={styles.label}>
            <Instagram size={12} style={{ color: '#ff7aab' }} /> Video B — Instagram Reel URL
          </label>
          <input
            style={styles.input}
            placeholder={EXAMPLE_IG}
            value={urlB}
            onChange={e => setUrlB(e.target.value)}
            disabled={loading}
            onFocus={e => e.target.style.borderColor = 'var(--border-hi)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <span style={styles.hint}>instagram.com/reel/...</span>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.error}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Progress */}
        {loading && (
          <div style={styles.progress}>
            <div style={styles.stepText}>
              <Loader2 size={10} style={{ display: 'inline', marginRight: 6, animation: 'spin 1s linear infinite' }} />
              {step.label}
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${step.pct}%` }} />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
          onMouseEnter={e => { if (!loading) e.target.style.opacity = 0.9 }}
          onMouseLeave={e => e.target.style.opacity = loading ? 0.6 : 1}
        >
          {loading ? (
            <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing videos...</>
          ) : (
            <>Analyze Videos <ArrowRight size={14} /></>
          )}
        </button>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
