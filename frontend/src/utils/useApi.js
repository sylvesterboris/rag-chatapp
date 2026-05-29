// useApi.js — API calls and streaming SSE hook

const API_BASE = '/api'

export async function ingestVideos(urlA, urlB) {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url_a: urlA, url_b: urlB }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ingestion failed')
  }
  return res.json()
}

export async function deleteSession(sessionId) {
  await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' })
}

/**
 * sendMessage — streams chat from the SSE endpoint.
 * @param {string} sessionId
 * @param {string} message
 * @param {(token: string) => void} onToken  — called for each streamed token
 * @param {(sources: Array) => void} onSources — called with parsed sources array
 * @param {() => void} onDone — called when stream ends
 */
export async function sendMessage(sessionId, message, onToken, onSources, onDone) {
  const res = await fetch(`${API_BASE}/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Chat request failed')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Parse SSE lines
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)

      if (data === '[DONE]') {
        onDone?.()
        return
      }

      // Sources block appended at end of stream
      if (data.startsWith('__SOURCES__')) {
        try {
          const sources = JSON.parse(data.slice(11))
          onSources?.(sources)
        } catch (_) {}
        continue
      }

      if (data.startsWith('[ERROR]')) {
        throw new Error(data.slice(8))
      }

      onToken?.(data)
    }
  }
  onDone?.()
}

export function formatNumber(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export function platformColor(platform) {
  return platform === 'youtube' ? '#ff4444' : '#e1306c'
}

export const SUGGESTED_QUESTIONS = [
  'Why did Video A get more engagement than Video B?',
  "What's the engagement rate of each video?",
  'Compare the hooks in the first 5 seconds.',
  "Who's the creator of Video B and what's their follower count?",
  'Suggest improvements for B based on what worked in A.',
]
