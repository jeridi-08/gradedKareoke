# Graded Karaoke

Sing along, get graded per line. Pitch scoring runs in the browser (octave-invariant); the Python API adds lyric checking and ElevenLabs speech.

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

## Who owns what
| Person | Owns |
|---|---|
| 1. Audio/pitch | `web/js/pitch.js`, `scoring.js`, `api/services/scoring.py` |
| 2. Speech/lyrics | `api/services/lyrics.py`, `elevenlabs.py`, song data in other languages |
| 3. Frontend | `index.html`, `ui/` (all styling, fonts, motion), `js/lyrics.js`, `lane.js` |
| 4. Integration | repo, deploy, `main.js`, `api/main.py`, demo and pitch |

## Checklist
Phase 1 (in this scaffold, verify it): mic permission flow, live pitch, synced lyrics, target notes JSON, octave-invariant per-line scoring, end screen.
Phase 2: pitch graph polish, lyric accuracy (`/api/stt` + `/api/score/lyrics`), timing score, song picker, leaderboard.
Phase 3: translation/romanization, "hear this line" (`/api/tts`), per-word feedback, practice loop.

## Team habits
Agree contracts first, small PRs to `main`, deploy on day one, mock everything, sync every 60 to 90 minutes, feature freeze 2 hours before the deadline, record a backup demo video.
