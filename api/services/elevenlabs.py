"""ElevenLabs wrappers. Four products are used:

  * Scribe v2 (speech-to-text)   -> what was actually sung, with word timestamps
  * Forced Alignment             -> exactly WHEN each expected lyric word was sung (drives the timing score)
  * Voice Isolation              -> strips backing-track bleed from the mic take before STT / alignment
  * Text-to-Speech (multilingual) -> "hear this line" pronunciation guide and the spoken coach summary

Everything reads its configuration lazily (after main.py has loaded .env) and raises ElevenLabsError
with an HTTP-ish status so the API layer can answer cleanly.
"""
import asyncio
import os

import httpx


class ElevenLabsError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _base() -> str:
    return os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").rstrip("/") + "/v1"


def configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY"))


def _flag(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def features() -> dict:
    """What the front end may rely on (reported by /api/status)."""
    return {
        "configured": configured(),
        "stt_model": os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2"),
        "forced_alignment": _flag("ELEVENLABS_ALIGNMENT", True),
        "isolation": _flag("ELEVENLABS_ISOLATE", True),
        "keyterms": _flag("ELEVENLABS_KEYTERMS", True),
        "tts_model": os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2"),
    }


_sem: asyncio.Semaphore | None = None


def _limiter() -> asyncio.Semaphore:
    """Free/starter plans have low concurrency limits, so every outbound call shares one small gate."""
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(int(os.getenv("ELEVENLABS_CONCURRENCY", "4")))
    return _sem


async def _post(path: str, *, data=None, files=None, json=None, accept: str | None = None, timeout: float = 90, retries: int = 2) -> httpx.Response:
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise ElevenLabsError("ELEVENLABS_API_KEY is not set (copy .env.example to .env)", 503)
    headers = {"xi-api-key": key}
    if accept:
        headers["Accept"] = accept
    r = None
    async with _limiter():
        async with httpx.AsyncClient(timeout=timeout) as c:
            for attempt in range(retries + 1):
                try:
                    r = await c.post(f"{_base()}{path}", headers=headers, data=data, files=files, json=json)
                except httpx.HTTPError as e:
                    if attempt == retries:
                        raise ElevenLabsError(f"ElevenLabs {path} unreachable: {e}", 502)
                    await asyncio.sleep(0.6 * (attempt + 1))
                    continue
                if r.status_code in (429, 500, 502, 503) and attempt < retries:
                    await asyncio.sleep(0.8 * (attempt + 1))  # back off, then try again
                    continue
                break
    if r.is_error:
        try:
            detail = r.json().get("detail")
            detail = detail.get("message") if isinstance(detail, dict) else detail
        except Exception:
            detail = r.text[:200]
        raise ElevenLabsError(f"ElevenLabs {path} failed ({r.status_code}): {detail}", 401 if r.status_code == 401 else 502)
    return r


# ── Scribe: speech-to-text ─────────────────────────────────────────────────────────────────────
async def transcribe(audio: bytes, filename: str = "take.wav", language: str | None = None, keyterms: list[str] | None = None) -> dict:
    """Returns {"text", "language", "words": [{"text","start","end"}]} (times in seconds from the start of `audio`).

    `keyterms` biases Scribe towards the lyrics we expect, which matters a lot for sung (smeared) vowels.
    """
    base = {"model_id": features()["stt_model"], "timestamps_granularity": "word", "tag_audio_events": "false"}
    if language:
        base["language_code"] = language
    attempts = []
    if keyterms and features()["keyterms"]:
        attempts.append({**base, "keyterms": keyterms[:100]})
    attempts.append(base)  # fallback: models/plans that reject keyterms still work
    last: ElevenLabsError | None = None
    for data in attempts:
        try:
            r = await _post("/speech-to-text", data=data, files={"file": (filename, audio)})
            break
        except ElevenLabsError as e:
            last = e
            if e.status in (401, 503):
                raise
    else:
        raise last  # type: ignore[misc]
    j = r.json()
    words = [
        {"text": w.get("text", "").strip(), "start": float(w.get("start", 0)), "end": float(w.get("end", 0))}
        for w in j.get("words", [])
        if w.get("type", "word") == "word" and w.get("text", "").strip()
    ]
    return {"text": j.get("text", "").strip(), "language": j.get("language_code"), "words": words}


# ── Forced alignment: when was each expected word sung? ────────────────────────────────────────
async def align(audio: bytes, text: str, filename: str = "take.wav") -> dict:
    """Returns {"words": [{"text","start","end","loss"}], "loss": float}. Words come back in the order of `text`."""
    r = await _post("/forced-alignment", data={"text": text}, files={"file": (filename, audio)})
    j = r.json()
    return {"words": j.get("words", []), "loss": j.get("loss")}


# ── Voice isolation: remove backing track / room noise ────────────────────────────────────────
async def isolate(audio: bytes, filename: str = "take.wav") -> bytes:
    r = await _post("/audio-isolation", files={"audio": (filename, audio, "audio/wav")}, timeout=120)
    return r.content


# ── Text to speech ─────────────────────────────────────────────────────────────────────────────
async def speak(text: str, voice_id: str | None = None) -> bytes:
    voice = voice_id or os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    r = await _post(
        f"/text-to-speech/{voice}",
        json={"text": text, "model_id": features()["tts_model"]},
        accept="audio/mpeg",
    )
    return r.content
