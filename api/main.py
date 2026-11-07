"""Graded Karaoke API. Run: uvicorn main:app --reload --port 8000  (from the api/ folder)."""
import base64
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services import coach, elevenlabs, grading, lyrics, scoring

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


class CoachReq(BaseModel):
    language: str | None = None
    total: float
    pitch: float | None = None
    lyrics: float | None = None
    timing: float | None = None
    worstLine: str | None = None
    meanStartOffset: float | None = None


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


def _fail(e: Exception):
    status = getattr(e, "status", 502)
    raise HTTPException(status if status in (401, 503) else 502, str(e))


@app.get("/api/status")
def status():
    """Lets the front end know which ElevenLabs features are live before a take starts."""
    return {"ok": True, "elevenlabs": elevenlabs.features()}


@app.post("/api/stt")
async def stt(file: UploadFile = File(...), language: str | None = Form(None)):
    try:
        return await elevenlabs.transcribe(await file.read(), file.filename or "take.webm", language)
    except elevenlabs.ElevenLabsError as e:
        _fail(e)


@app.post("/api/grade/line")
async def grade_line(
    file: UploadFile = File(...),
    expected: str = Form(...),
    language: str | None = Form(None),
    line_start: float = Form(...),
    line_end: float = Form(...),
    offset: float = Form(0.0),
    isolate: bool = Form(True),
):
    """Grade one sung line: Voice Isolation -> Scribe (lyrics) + Forced Alignment (timing). Times are song-clock seconds."""
    try:
        return await grading.grade_line(await file.read(), expected, language, line_start, line_end, offset, isolate, file.filename or "take.wav")
    except elevenlabs.ElevenLabsError as e:
        _fail(e)


@app.post("/api/tts")
async def tts(req: TtsReq):
    try:
        return Response(await elevenlabs.speak(req.text), media_type="audio/mpeg")
    except elevenlabs.ElevenLabsError as e:
        _fail(e)


@app.post("/api/coach")
async def coach_feedback(req: CoachReq):
    """Short spoken summary of the take, written locally and voiced by ElevenLabs TTS."""
    text = coach.coach_text(req.language, req.total, req.pitch, req.lyrics, req.timing, req.worstLine, req.meanStartOffset)
    try:
        audio = await elevenlabs.speak(text)
    except elevenlabs.ElevenLabsError as e:
        _fail(e)
    return {"text": text, "audio": base64.b64encode(audio).decode(), "mime": "audio/mpeg"}


# Serve the front end from the same port (must be last so /api routes win).
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
