import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Zap, AlertCircle, ChevronDown } from 'lucide-react'
import { sendMessage, SUGGESTED_QUESTIONS } from '../utils/useApi.js'

const styles = {
  panel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'var(--text)',
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  messagesWrap: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minHeight: 0,
  },
  suggestionsWrap: {
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  suggestionChip: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '4px 10px',
    fontSize: 11,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
    fontFamily: 'var(--font-sans)',
    lineHeight: 1.4,
  },
  inputRow: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: 8,
    flexShrink: 0,
    background: 'var(--bg)',
  },
  textarea: {
    flex: 1,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '8px 12px',
    color: 'var(--text)',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    minHeight: 36,
    maxHeight: 120,
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 4,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    alignSelf: 'flex-end',
    transition: 'opacity 0.15s, transform 0.1s',
    color: '#0a0a0b',
  },
  msgUser: {
    alignSelf: 'flex-end',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-hi)',
    borderRadius: '8px 8px 2px 8px',
    padding: '8px 12px',
    maxWidth: '80%',
    fontSize: 13,
    lineHeight: 1.5,
  },
  msgAI: {
    alignSelf: 'flex-start',
    maxWidth: '95%',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  msgAIBubble: {
    background: 'rgba(180,255,60,0.04)',
    border: '1px solid rgba(180,255,60,0.12)',
    borderRadius: '2px 8px 8px 8px',
    padding: '10px 14px',
    fontSize: 13,
    lineHeight: 1.7,
    color: 'var(--text)',
    whiteSpace: 'pre-wrap',
  },
  sourcesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  sourceChip: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '2px 8px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-dim)',
    cursor: 'default',
  },
  errorMsg: {
    background: 'rgba(255,77,106,0.08)',
    border: '1px solid rgba(255,77,106,0.2)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    color: '#ff7a8a',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: 'var(--text-dim)',
    padding: 24,
    textAlign: 'center',
  },
  scrollBtn: {
    position: 'absolute',
    bottom: 70,
    right: 20,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-hi)',
    borderRadius: '50%',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    zIndex: 5,
  },
}

function renderAIText(text) {
  // Bold **text** and inline `code` rendering
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[Video [AB] – chunk \d+\])/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{part.slice(1, -1)}</code>
    if (part.match(/^\[Video [AB] – chunk \d+\]$/))
      return <span key={i} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{part}</span>
    return part
  })
}

export default function ChatPanel({ sessionId, disabled }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesWrapRef = useRef(null)
  const textareaRef = useRef(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useEffect(() => {
    const el = messagesWrapRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      setShowScroll(!atBottom)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const handleSend = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || isStreaming || !sessionId) return
    setInput('')
    textareaRef.current?.focus()

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: msg }])

    // Add blank AI message (streaming target)
    const aiId = Date.now()
    setMessages(prev => [...prev, { role: 'ai', content: '', sources: [], id: aiId, streaming: true }])
    setIsStreaming(true)

    setTimeout(() => scrollToBottom(), 50)

    try {
      let full = ''
      await sendMessage(
        sessionId,
        msg,
        // onToken
        (token) => {
          full += token
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: full } : m
          ))
          // Auto-scroll if near bottom
          const el = messagesWrapRef.current
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
            el.scrollTop = el.scrollHeight
          }
        },
        // onSources
        (sources) => {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, sources } : m
          ))
        },
        // onDone
        () => {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, streaming: false } : m
          ))
          setIsStreaming(false)
          scrollToBottom()
        }
      )
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === aiId
          ? { ...m, content: '', error: err.message, streaming: false }
          : m
      ))
      setIsStreaming(false)
    }
  }, [input, isStreaming, sessionId, scrollToBottom])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ ...styles.panel, position: 'relative' }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ ...styles.statusDot, ...(isStreaming ? { animation: 'glowPulse 1s ease-in-out infinite' } : {}) }} />
        <div style={styles.headerTitle}>RAG Chat Analyst</div>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {messages.filter(m => m.role === 'ai').length} responses
        </span>
      </div>

      {/* Messages */}
      <div style={styles.messagesWrap} ref={messagesWrapRef}>
        {isEmpty ? (
          <div style={styles.emptyState}>
            <Zap size={28} style={{ color: 'var(--accent)', opacity: 0.4 }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Ask anything about the videos</div>
            <div style={{ fontSize: 11, maxWidth: 220 }}>
              Tap a suggestion below or type your own question.
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id || i} className="fade-in">
              {msg.role === 'user' ? (
                <div style={styles.msgUser}>{msg.content}</div>
              ) : (
                <div style={styles.msgAI}>
                  <div style={styles.msgAIBubble}>
                    {msg.error ? (
                      <span style={{ color: '#ff7a8a' }}>{msg.error}</span>
                    ) : (
                      <>
                        {renderAIText(msg.content)}
                        {msg.streaming && <span className="cursor" />}
                      </>
                    )}
                  </div>
                  {/* Source citations */}
                  {msg.sources?.length > 0 && (
                    <div style={styles.sourcesRow}>
                      {msg.sources.map((s, si) => (
                        <span key={si} style={styles.sourceChip} title={s.snippet}>
                          Video {s.video_id} · chunk {s.chunk_index} · {s.platform}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScroll && (
        <button style={styles.scrollBtn} onClick={() => scrollToBottom()}>
          <ChevronDown size={14} />
        </button>
      )}

      {/* Suggested questions */}
      {!disabled && isEmpty && (
        <div style={styles.suggestionsWrap}>
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              style={styles.suggestionChip}
              onMouseEnter={e => {
                e.target.style.borderColor = 'var(--accent-dim)'
                e.target.style.color = 'var(--accent)'
              }}
              onMouseLeave={e => {
                e.target.style.borderColor = 'var(--border)'
                e.target.style.color = 'var(--text-muted)'
              }}
              onClick={() => handleSend(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          style={{
            ...styles.textarea,
            borderColor: isStreaming ? 'var(--border)' : undefined,
            opacity: disabled ? 0.5 : 1,
          }}
          placeholder={disabled ? 'Ingest videos to start chatting...' : 'Ask about engagement, hooks, creator info...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
          onFocus={e => e.target.style.borderColor = 'var(--border-hi)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: (!input.trim() || disabled || isStreaming) ? 0.4 : 1,
          }}
          onClick={() => handleSend()}
          disabled={!input.trim() || disabled || isStreaming}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
