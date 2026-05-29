import React from 'react'
import { Eye, Heart, MessageCircle, Users, Calendar, Clock, Hash } from 'lucide-react'
import { formatNumber } from '../utils/useApi.js'

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  label: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    padding: '3px 8px',
    borderRadius: 2,
    background: 'var(--accent)',
    color: '#0a0a0b',
  },
  thumb: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    background: 'var(--bg-input)',
    display: 'block',
  },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: '16 / 9',
    background: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    color: 'var(--text-dim)',
  },
  body: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  creator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent), var(--blue))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: '#000',
    flexShrink: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6,
  },
  statBox: {
    background: 'var(--bg-input)',
    borderRadius: 4,
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 800,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text)',
  },
  engagementBar: {
    background: 'var(--bg-input)',
    borderRadius: 4,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  engLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  engValue: {
    fontSize: 16,
    fontWeight: 800,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
  },
  trackOuter: {
    flex: 1,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  metaRow: {
    display: 'flex',
    gap: 12,
    fontSize: 11,
    color: 'var(--text-dim)',
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hashtagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  hashtag: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  platformBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: '2px 7px',
    borderRadius: 3,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '0 -16px',
  },
}

export default function VideoCard({ video, maxEngagement }) {
  if (!video) return <VideoCardSkeleton />

  const platform = video.platform || 'youtube'
  const isYT = platform === 'youtube'
  const engPct = maxEngagement > 0 ? (video.engagement_rate / maxEngagement) * 100 : 0
  const initials = (video.creator || '?').slice(0, 2).toUpperCase()
  const durationStr = formatDuration(video.duration_seconds)

  // YouTube thumbnail
  let thumb = null
  if (isYT && video.url) {
    const m = video.url.match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/)
    if (m) thumb = `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg`
  }

  return (
    <div style={styles.card} className="fade-in">
      <div style={styles.label}>VIDEO {video.video_id}</div>

      {/* Thumbnail */}
      {thumb ? (
        <img src={thumb} alt={video.title} style={styles.thumb} loading="lazy" />
      ) : (
        <div style={styles.thumbPlaceholder}>
          {isYT ? '▶' : '🎵'}
        </div>
      )}

      <div style={styles.body}>
        {/* Platform + Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            ...styles.platformBadge,
            background: isYT ? 'rgba(255,68,68,0.12)' : 'rgba(225,48,108,0.12)',
            color: isYT ? '#ff6b6b' : '#ff7aab',
            border: `1px solid ${isYT ? 'rgba(255,68,68,0.2)' : 'rgba(225,48,108,0.2)'}`,
            width: 'fit-content',
          }}>
            {isYT ? '● YouTube' : '◆ Instagram'}
          </span>
          <div style={styles.title}>{video.title}</div>
        </div>

        {/* Creator */}
        <div style={styles.creator}>
          <div style={styles.avatar}>{initials}</div>
          <span style={{ fontWeight: 600 }}>{video.creator}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: 2 }}>
            · <Users size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {formatNumber(video.follower_count)}
          </span>
        </div>

        <div style={styles.divider} />

        {/* Stats grid */}
        <div style={styles.statsGrid}>
          <StatBox icon={<Eye size={9} />} label="Views" value={formatNumber(video.views)} />
          <StatBox icon={<Heart size={9} />} label="Likes" value={formatNumber(video.likes)} />
          <StatBox icon={<MessageCircle size={9} />} label="Comments" value={formatNumber(video.comments)} />
        </div>

        {/* Engagement rate */}
        <div style={styles.engagementBar}>
          <div>
            <div style={styles.engLabel}>Engagement Rate</div>
            <div style={styles.engValue}>{video.engagement_rate?.toFixed(2)}%</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.trackOuter}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, engPct)}%`,
                background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
                borderRadius: 2,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Date + Duration */}
        <div style={styles.metaRow}>
          {video.upload_date && (
            <span style={styles.metaItem}>
              <Calendar size={10} /> {video.upload_date}
            </span>
          )}
          {video.duration_seconds > 0 && (
            <span style={styles.metaItem}>
              <Clock size={10} /> {durationStr}
            </span>
          )}
          {video.chunk_count > 0 && (
            <span style={styles.metaItem}>
              <span style={{ fontSize: 9 }}>◈</span> {video.chunk_count} chunks
            </span>
          )}
        </div>

        {/* Hashtags */}
        {video.hashtags?.length > 0 && (
          <div style={styles.hashtagWrap}>
            {video.hashtags.slice(0, 8).map(tag => (
              <span key={tag} style={styles.hashtag}>#{tag}</span>
            ))}
            {video.hashtags.length > 8 && (
              <span style={{ ...styles.hashtag, color: 'var(--text-dim)' }}>
                +{video.hashtags.length - 8}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ icon, label, value }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{icon} {label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

function VideoCardSkeleton() {
  return (
    <div style={{ ...styles.card, gap: 10, padding: 16 }}>
      <div className="skeleton" style={{ height: 160, borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 14, width: '80%' }} />
      <div className="skeleton" style={{ height: 12, width: '50%' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}
      </div>
      <div className="skeleton" style={{ height: 52 }} />
    </div>
  )
}

function formatDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
