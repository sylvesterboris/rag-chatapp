"""
video_ingestion.py
------------------
Pulls transcripts + metadata for YouTube and Instagram Reels.
Computes engagement rate and returns structured VideoData objects.
"""

from __future__ import annotations
import os, re, json, logging
import httpx
from typing import Optional
from dataclasses import dataclass, asdict
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


@dataclass
class VideoMetadata:
    video_id_label: str          # "A" or "B"
    platform: str                # "youtube" | "instagram"
    url: str
    title: str
    creator: str
    follower_count: int
    views: int
    likes: int
    comments: int
    hashtags: list[str]
    upload_date: str
    duration_seconds: int
    engagement_rate: float       # (likes + comments) / views * 100
    transcript: str              # full plain-text transcript
    transcript_chunks: list[str] # will be populated during chunking


# ─────────────────────────── YouTube ───────────────────────────

def _extract_youtube_id(url: str) -> str:
    """Extract video ID from any YouTube URL format."""
    patterns = [
        r"(?:v=|/v/|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    raise ValueError(f"Cannot extract YouTube video ID from: {url}")


def fetch_youtube_data(url: str, label: str, api_key: str) -> VideoMetadata:
    """Fetch YouTube transcript + metadata via YouTube Data API v3."""
    vid_id = _extract_youtube_id(url)

    # ── Transcript ──────────────────────────────────────────────
    def _seg_text(seg) -> str:
        """Extract text from a transcript segment (dict or object)."""
        if isinstance(seg, dict):
            return seg.get("text", "")
        return getattr(seg, "text", "")

    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(vid_id)
        transcript_text = " ".join(_seg_text(seg) for seg in transcript_list)
    except NoTranscriptFound:
        # Fallback: try auto-generated captions
        try:
            transcripts = YouTubeTranscriptApi.list_transcripts(vid_id)
            transcript_list = transcripts.find_generated_transcript(["en"]).fetch()
            transcript_text = " ".join(_seg_text(seg) for seg in transcript_list)
        except Exception as e:
            logger.warning(f"No transcript for {vid_id}: {e}")
            transcript_text = "[Transcript unavailable]"
    except Exception as e:
        # Catches ParseError (empty XML from rate limiting), network errors, etc.
        logger.warning(f"Transcript fetch failed for {vid_id}: {e}")
        transcript_text = "[Transcript unavailable — YouTube may be rate limiting]"

    # ── Metadata via YouTube Data API ───────────────────────────
    youtube = build("youtube", "v3", developerKey=api_key)

    # Video stats + snippet
    video_resp = youtube.videos().list(
        part="snippet,statistics,contentDetails",
        id=vid_id
    ).execute()

    if not video_resp.get("items"):
        raise ValueError(f"YouTube API returned no data for video: {vid_id}")

    item = video_resp["items"][0]
    snippet = item["snippet"]
    stats = item.get("statistics", {})
    content = item.get("contentDetails", {})

    title = snippet.get("title", "Unknown Title")
    upload_date = snippet.get("publishedAt", "")[:10]
    # YouTube API returns tags as a list of plain strings
    hashtags = [t for t in snippet.get("tags", []) if isinstance(t, str)]
    channel_id = snippet.get("channelId", "")
    views = int(stats.get("viewCount", 0))
    likes = int(stats.get("likeCount", 0))
    comments = int(stats.get("commentCount", 0))

    # Duration ISO 8601 → seconds
    dur_str = content.get("duration", "PT0S")
    duration_seconds = _parse_iso_duration(dur_str)

    # Channel info (creator + subscriber count)
    ch_resp = youtube.channels().list(
        part="snippet,statistics",
        id=channel_id
    ).execute()
    creator = "Unknown"
    follower_count = 0
    if ch_resp.get("items"):
        ch = ch_resp["items"][0]
        creator = ch["snippet"].get("title", "Unknown")
        follower_count = int(ch.get("statistics", {}).get("subscriberCount", 0))

    engagement_rate = round((likes + comments) / views * 100, 4) if views > 0 else 0.0

    return VideoMetadata(
        video_id_label=label,
        platform="youtube",
        url=url,
        title=title,
        creator=creator,
        follower_count=follower_count,
        views=views,
        likes=likes,
        comments=comments,
        hashtags=hashtags,
        upload_date=upload_date,
        duration_seconds=duration_seconds,
        engagement_rate=engagement_rate,
        transcript=transcript_text,
        transcript_chunks=[],
    )


def _parse_iso_duration(duration: str) -> int:
    """Convert ISO 8601 duration string to total seconds."""
    pattern = r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"
    m = re.match(pattern, duration)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mn = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mn * 60 + s


# ─────────────────────────── Instagram ─────────────────────────

def fetch_instagram_data(url: str, label: str, rapidapi_key: str) -> VideoMetadata:
    """
    Fetch Instagram Reel transcript + metadata.
    Transcript: extracted via yt-dlp (downloads auto-captions or audio→Whisper fallback).
    Metadata: Instaloader (Free Scraper) with RapidAPI as a fallback.
    """
    shortcode = _extract_instagram_shortcode(url)
    
    meta = None
    # ── Try Instaloader first (100% Free, no API keys) ───────────
    try:
        meta = _fetch_instagram_meta_instaloader(shortcode)
    except Exception as e:
        logger.warning(f"Instaloader fetch failed: {e}. Trying RapidAPI fallback...")

    # ── Try RapidAPI fallback if Instaloader failed ──────────────
    if not meta:
        meta = _fetch_instagram_meta_rapidapi(shortcode, rapidapi_key)

    # ── Transcript via yt-dlp subtitles or Whisper ───────────────
    transcript_text = _fetch_instagram_transcript(url)

    engagement_rate = round(
        (meta["likes"] + meta["comments"]) / meta["views"] * 100, 4
    ) if meta["views"] > 0 else 0.0

    return VideoMetadata(
        video_id_label=label,
        platform="instagram",
        url=url,
        title=meta.get("title", f"Instagram Reel {shortcode}"),
        creator=meta.get("creator", "Unknown"),
        follower_count=meta.get("follower_count", 0),
        views=meta["views"],
        likes=meta["likes"],
        comments=meta["comments"],
        hashtags=meta.get("hashtags", []),
        upload_date=meta.get("upload_date", ""),
        duration_seconds=meta.get("duration_seconds", 0),
        engagement_rate=engagement_rate,
        transcript=transcript_text,
        transcript_chunks=[],
    )


def _extract_instagram_shortcode(url: str) -> str:
    """Extract shortcode from Instagram reel/post URL."""
    m = re.search(r"/reel(?:s)?/([A-Za-z0-9_-]+)", url)
    if not m:
        m = re.search(r"/p/([A-Za-z0-9_-]+)", url)
    if m:
        return m.group(1)
    raise ValueError(f"Cannot extract Instagram shortcode from: {url}")


def _fetch_instagram_meta_instaloader(shortcode: str) -> dict:
    """
    Fetch Instagram Reel metadata using the open-source Instaloader library.
    No API key or authentication required for public posts!
    """
    import instaloader
    logger.info(f"Attempting free metadata fetch for post {shortcode} using Instaloader...")
    try:
        L = instaloader.Instaloader(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        
        caption = post.caption or ""
        hashtags = post.caption_hashtags or []
        
        owner = post.owner_profile
        creator = owner.username if owner else "Unknown"
        followers = owner.followers if owner else 0
        
        views = post.video_view_count or 0
        likes = post.likes or 0
        comments = post.comments or 0
        
        return {
            "title": caption[:100] if caption else f"Instagram Reel {shortcode}",
            "creator": creator,
            "follower_count": followers,
            "views": views if views > 0 else 1,
            "likes": likes,
            "comments": comments,
            "hashtags": hashtags,
            "duration_seconds": int(post.video_duration) if post.video_duration else 0,
            "upload_date": post.date_utc.strftime("%Y-%m-%d") if post.date_utc else "",
        }
    except Exception as e:
        logger.error(f"Instaloader metadata fetch failed: {e}")
        raise e


def _fetch_instagram_meta_rapidapi(shortcode: str, api_key: str) -> dict:
    """
    Use RapidAPI Instagram Scraper to get reel metadata.
    Endpoint: instagram-scraper-api2.p.rapidapi.com
    Free tier: 100 req/month
    """
    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "instagram-scraper-api2.p.rapidapi.com",
    }
    url = f"https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url={shortcode}"

    try:
        resp = httpx.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json().get("data", {})
        owner = data.get("owner", {})
        caption_text = data.get("caption", {}).get("text", "")
        hashtags = re.findall(r"#(\w+)", caption_text)
        views = data.get("play_count") or data.get("video_view_count") or 0
        likes = data.get("like_count") or 0
        comments = data.get("comment_count") or 0
        return {
            "title": caption_text[:100] if caption_text else f"Reel {shortcode}",
            "creator": owner.get("username", "Unknown"),
            "follower_count": owner.get("follower_count", 0),
            "views": int(views),
            "likes": int(likes),
            "comments": int(comments),
            "hashtags": hashtags,
            "upload_date": str(data.get("taken_at", ""))[:10],
            "duration_seconds": int(data.get("video_duration") or 0),
        }
    except Exception as e:
        logger.warning(f"RapidAPI Instagram fetch failed: {e}. Using stub data.")
        # Graceful fallback — return zeroed metadata so app doesn't crash
        return {
            "title": f"Instagram Reel {shortcode}",
            "creator": "Unknown",
            "follower_count": 0,
            "views": 1,
            "likes": 0,
            "comments": 0,
            "hashtags": [],
            "upload_date": "",
            "duration_seconds": 0,
        }


def _fetch_instagram_transcript(url: str) -> str:
    """
    Try yt-dlp auto-subs first; if unavailable, download audio and transcribe
    with OpenAI Whisper API (fallback). Returns plain text transcript.
    """
    import subprocess, tempfile, pathlib

    with tempfile.TemporaryDirectory() as tmpdir:
        # Attempt 1: auto-subtitles / embedded captions
        sub_path = pathlib.Path(tmpdir) / "subs"
        cmd_subs = [
            "yt-dlp", "--write-auto-subs", "--sub-format", "vtt",
            "--skip-download", "-o", str(sub_path), url
        ]
        result = subprocess.run(cmd_subs, capture_output=True, text=True, timeout=60)
        vtt_files = list(pathlib.Path(tmpdir).glob("*.vtt"))
        if vtt_files:
            return _parse_vtt(vtt_files[0].read_text())

        # Attempt 2: download audio + Whisper transcription
        audio_path = pathlib.Path(tmpdir) / "audio.mp3"
        cmd_audio = [
            "yt-dlp", "-x", "--audio-format", "mp3",
            "-o", str(audio_path), url
        ]
        subprocess.run(cmd_audio, capture_output=True, timeout=120)
        if audio_path.exists():
            return _transcribe_with_whisper(str(audio_path))

    return "[Transcript unavailable — no captions or audio extracted]"


def _parse_vtt(vtt_text: str) -> str:
    """Strip VTT timing tags and return plain text."""
    lines = []
    for line in vtt_text.splitlines():
        line = line.strip()
        if not line or "-->" in line or line.startswith("WEBVTT") or line.isdigit():
            continue
        # Remove inline tags like <00:00:01.000><c>
        line = re.sub(r"<[^>]+>", "", line)
        if line:
            lines.append(line)
    return " ".join(lines)


def _transcribe_with_whisper(audio_path: str) -> str:
    """Transcribe audio file using OpenAI Whisper API."""
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    with open(audio_path, "rb") as f:
        resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text"
        )
    return resp


# ─────────────────────────── Dispatcher ────────────────────────

def fetch_video(url: str, label: str) -> VideoMetadata:
    """Route to the correct platform fetcher based on URL."""
    youtube_api_key = os.getenv("YOUTUBE_API_KEY", "")
    rapidapi_key = os.getenv("RAPIDAPI_KEY", "")

    if "youtube.com" in url or "youtu.be" in url:
        if not youtube_api_key:
            raise EnvironmentError("YOUTUBE_API_KEY not set in environment.")
        return fetch_youtube_data(url, label, youtube_api_key)
    elif "instagram.com" in url:
        return fetch_instagram_data(url, label, rapidapi_key)
    else:
        raise ValueError(f"Unsupported URL platform: {url}")
