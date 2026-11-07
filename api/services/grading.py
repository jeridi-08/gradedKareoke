"""One sung line in, lyric + timing result out. This is where the ElevenLabs products are combined:

   take.wav --(Voice Isolation, optional)--> clean voice --+--> Scribe v2        : what was sung   -> lyric score
                                                           +--> Forced Alignment : when each word  -> timing score
"""
import asyncio

from . import elevenlabs as el
from . import lyrics, timing

# Heard words further than this outside the line's window belong to the neighbouring line, so ignore them.
LEAD, TAIL = 0.20, 0.40


async def grade_line(
    audio: bytes,
    expected: str,
    language: str | None,
    line_start: float,
    line_end: float,
    offset: float,
    isolate: bool = True,
    filename: str = "take.wav",
) -> dict:
    """`offset` is the song time (s) at which `audio` begins, so every returned time is on the song clock."""
    warnings: list[str] = []
    src, fname, isolated = audio, filename, False

    if isolate and el.features()["isolation"]:
        try:
            src, fname, isolated = await el.isolate(audio, filename), "isolated.mp3", True
        except el.ElevenLabsError as e:
            if e.status in (401, 503):
                raise
            warnings.append(f"Voice isolation skipped: {e}")

    tokens = lyrics.tokenize(expected)
    jobs = [el.transcribe(src, fname, language, keyterms=sorted({lyrics.norm(t) for t in tokens if len(lyrics.norm(t)) > 1}))]
    use_align = el.features()["forced_alignment"] and bool(tokens)
    if use_align:
        jobs.append(el.align(src, " ".join(tokens), fname))
    results = await asyncio.gather(*jobs, return_exceptions=True)

    stt = results[0]
    if isinstance(stt, Exception):
        raise stt
    aligned = None
    if use_align:
        if isinstance(results[1], Exception):
            if isinstance(results[1], el.ElevenLabsError) and results[1].status in (401, 503):
                raise results[1]
            warnings.append(f"Forced alignment failed, using Scribe timestamps: {results[1]}")
        else:
            aligned = results[1]

    # ── Lyrics: what Scribe heard inside this line's window ──
    heard = [
        w for w in stt["words"]
        if line_start - LEAD <= offset + (w["start"] + w["end"]) / 2 <= line_end + TAIL
    ]
    heard_tokens = [t for w in heard for t in (lyrics.tokenize(w["text"]) or [])]
    lr = lyrics.score_words(tokens, heard_tokens)

    # ── Per-word times from the aligner (1:1 with `tokens` because that is exactly what we sent) ──
    a_words = aligned["words"] if aligned and len(aligned["words"]) == len(tokens) else None
    words = []
    for i, w in enumerate(lr["words"]):
        item = dict(w)
        if a_words:
            item["start"], item["end"] = offset + float(a_words[i]["start"]), offset + float(a_words[i]["end"])
            item["loss"] = a_words[i].get("loss")
        words.append(item)

    # ── Timing: first and last word that was really sung, on the song clock ──
    sung = [w for w in words if w["ok"]]
    if not heard_tokens:
        tm = {"score": 0.0, "reason": "no-voice"}
    elif a_words and sung:
        tm = timing.timing_score(line_start, line_end, min(w["start"] for w in sung), max(w["end"] for w in sung))
        tm["source"] = "forced-alignment"
    else:
        tm = timing.timing_score(line_start, line_end, offset + heard[0]["start"], offset + heard[-1]["end"])
        tm["source"] = "scribe"

    return {
        "lyric": {"score": lr["score"], "words": words, "transcript": " ".join(w["text"] for w in heard), "extra": lr["extra"]},
        "timing": tm,
        "isolated": isolated,
        "alignmentLoss": aligned["loss"] if aligned else None,
        "language": stt.get("language"),
        "warnings": warnings,
    }
