"""Graded Karaoke API. Run: uvicorn main:app --reload --port 8000  (from the api/ folder)."""
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services import elevenlabs, lyrics, scoring

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
SONGS = ROOT / "web" / "data" / "songs"

app = FastAPI(title="Graded Karaoke API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class PitchReq(BaseModel):
    target: list[float]
    sung: list[float | None]


class LyricsReq(BaseModel):
    expected: str
    transcript: str


class TtsReq(BaseModel):
    text: str
    language: str | None = None


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/songs")
def list_songs():
    return json.loads((SONGS / "index.json").read_text(encoding="utf-8"))


@app.get("/api/songs/{song_id}")
def get_song(song_id: str):
    f = SONGS / f"{Path(song_id).name}.json"  # .name blocks path traversal
    if not f.exists():
        raise HTTPException(404, "Song not found")
    return json.loads(f.read_text(encoding="utf-8"))


@app.post("/api/score/pitch")
def score_pitch(req: PitchReq):
    return {"score": scoring.pitch_score(req.target, req.sung)}


@app.post("/api/score/lyrics")
def score_lyrics(req: LyricsReq):
    return lyrics.score_lyrics(req.expected, req.transcript)


@app.post("/api/stt")
async def stt(file: UploadFile = File(...), language: str | None = Form(None)):
    try:
        return await elevenlabs.transcribe(await file.read(), file.filename or "take.webm", language)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/tts")
async def tts(req: TtsReq):
    try:
        return Response(await elevenlabs.speak(req.text), media_type="audio/mpeg")
    except RuntimeError as e:
        raise HTTPException(503, str(e))


# Serve the front end from the same port (must be last so /api routes win).
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
