"""Owner: Speech/lyrics. Thin ElevenLabs wrappers (Scribe speech-to-text, multilingual text-to-speech)."""
import os

import httpx

BASE = "https://api.elevenlabs.io/v1"


def _headers() -> dict:
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set (copy .env.example to .env)")
    return {"xi-api-key": key}


async def transcribe(audio: bytes, filename: str, language: str | None = None) -> dict:
    data = {"model_id": "scribe_v1"}
    if language:
        data["language_code"] = language
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{BASE}/speech-to-text", headers=_headers(), data=data, files={"file": (filename, audio)})
        r.raise_for_status()
        j = r.json()
    return {"text": j.get("text", ""), "words": j.get("words", [])}


async def speak(text: str) -> bytes:
    voice = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{BASE}/text-to-speech/{voice}",
            headers={**_headers(), "Accept": "audio/mpeg"},
            json={"text": text, "model_id": "eleven_multilingual_v2"},
        )
        r.raise_for_status()
        return r.content
