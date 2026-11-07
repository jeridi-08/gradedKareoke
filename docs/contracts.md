# Data contracts (agree on these first, change only via PR + team ping)

## Song  (`web/data/songs/<id>.json`)
```json
{
  "id": "frere-jacques-fr", "title": "Frère Jacques", "language": "fr", "bpm": 100,
  "audioUrl": null,
  "lines": [{
    "start": 0.0, "end": 4.8, "text": "Frère Jacques, Frère Jacques,",
    "notes": [{ "time": 0.0, "duration": 0.6, "midi": 60, "syl": "Frè" }]
  }]
}
```
Times are seconds from the start of the song (after the count-in). `audioUrl: null` means "use the synthesised backing track".
Only use songs you have the right to use (public domain, or your own).

## Score result
```json
{ "lineIndex": 0, "pitchScore": 0.82, "lyricScore": null }
```
`pitchScore` and `lyricScore` are 0..1. `lyricScore` is null until Phase 2.

## API (FastAPI, prefix `/api`)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/health | | `{ok:true}` |
| GET | /api/songs, /api/songs/{id} | | song list / song |
| POST | /api/score/pitch | `{target:[midi], sung:[midi or null]}` | `{score}` |
| POST | /api/score/lyrics | `{expected, transcript}` | `{score, words:[{word,ok}]}` |
| POST | /api/stt | multipart `file`, `language?` | `{text, words}` (ElevenLabs Scribe) |
| POST | /api/tts | `{text, language?}` | `audio/mpeg` (ElevenLabs) |
