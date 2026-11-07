# Graded Karaoke

Sing along, get graded per line on three things: **pitch** (browser, octave-invariant), **lyrics** and **timing** (ElevenLabs via the Python API).

```
web/   static front end (no build step): index.html, ui/ (look & motion), js/ modules, data/songs/*.json
api/   FastAPI: song data, lyric scoring, ElevenLabs STT/TTS
docs/  contracts.md  (read this first)
```

## Run it
```bash
# Option A: API + web on one port
cd api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env      # add your ElevenLabs key
uvicorn main:app --reload --port 8000   # open http://localhost:8000

# Option B: web only (Phase 1 needs no backend)
python -m http.server 5173 -d web       # open http://localhost:5173
```
Microphone access needs `localhost` or https. Use headphones.

## How the grading works

```
mic ──► pitch tracker ──► live pitch graph (target bars vs. your line, Singstar-style)      [browser]
mic ──► TakeRecorder (raw PCM on the audio clock) ──► per-line 16 kHz WAV clips             [browser]
                                   │
                    POST /api/grade/line  (one call per sung line)                          [FastAPI]
                                   │
            ElevenLabs Voice Isolation   removes backing-track bleed from the clip
                       ├─► ElevenLabs Scribe v2        what you actually sang  ─► lyric score
                       │     (word timestamps, expected lyrics sent as keyterms)
                       └─► ElevenLabs Forced Alignment when each lyric word was sung ─► timing score
            ElevenLabs TTS                "Hear this line" and the spoken coach summary
```

| Score | How | Weight |
|---|---|---|
| Pitch | per-frame, octave-invariant, 50 cents = full marks, 2 semitones = 0 (`web/js/scoring.js`) | 50% |
| Lyrics | Scribe transcript vs. expected words, order-aware fuzzy match (`api/services/lyrics.py`); extra words cost half a miss | 30% |
| Timing | Forced Alignment start of the first sung word and end of the last vs. the line's notes: full marks within 0.25 s (start) / 0.4 s (end), zero at 1.0 s / 1.4 s (`api/services/timing.py`) | 20% |

If lyrics/timing are unavailable (no API, no key, an error) the total falls back to pitch only and says so. Lines with no voiced frames are scored 0 locally, without calling the API.

Results screen: tap a line to see its pitch graph (target vs. you, with word spans from Forced Alignment underneath), which words were heard, "started 320 ms late, ended 40 ms early", and a "Hear this line" button. "Hear feedback" speaks a short coach summary (English or French, by song language).

### ElevenLabs configuration (`.env`)
`ELEVENLABS_API_KEY` is the only required value. Optional: `ELEVENLABS_ISOLATE` (default on; turn off with headphones for faster grading), `ELEVENLABS_ALIGNMENT`, `ELEVENLABS_KEYTERMS`, `ELEVENLABS_STT_MODEL`, `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_CONCURRENCY` (lower on free plans). `GET /api/status` reports what is live.

### Tests
```bash
pip install pytest && cd api && python -m pytest tests
```
Covers lyric matching, timing tolerances and the full grading pipeline against a faked ElevenLabs (no key needed).

## Who owns what
| Person | Owns |
|---|---|
| 1. Audio/pitch | `web/js/pitch.js`, `scoring.js`, `api/services/scoring.py` |
| 2. Speech/lyrics | `api/services/lyrics.py`, `elevenlabs.py`, song data in other languages |
| 3. Frontend | `index.html`, `ui/` (all styling, fonts, motion), `js/lyrics.js`, `lane.js` |
| 4. Integration | repo, deploy, `main.js`, `api/main.py`, demo and pitch |

## Checklist
Phase 1 (in this scaffold, verify it): mic permission flow, live pitch, synced lyrics, target notes JSON, octave-invariant per-line scoring, end screen.
Phase 2: ~~pitch graph~~, ~~lyric accuracy~~, ~~timing score~~ (done), song picker (done), leaderboard.
Phase 3: ~~"hear this line"~~, ~~per-word feedback~~ (done); translation/romanization, practice loop (re-sing one line), ElevenLabs Music for generated backing tracks.

## Team habits
Agree contracts first, small PRs to `main`, deploy on day one, mock everything, sync every 60 to 90 minutes, feature freeze 2 hours before the deadline, record a backup demo video.
