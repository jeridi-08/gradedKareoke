import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import elevenlabs as el  # noqa: E402
from services import grading, lyrics, timing  # noqa: E402

EXPECTED = "Are you sleeping, Are you sleeping,"


def test_repeated_line_is_order_aware():
    r = lyrics.score_lyrics(EXPECTED, "are you sleeping")
    assert [w["ok"] for w in r["words"]] == [True, True, True, False, False, False]
    assert abs(r["score"] - 0.5) < 1e-9


def test_accents_and_apostrophes():
    assert lyrics.score_lyrics("Frère Jacques", "frere jacques")["score"] == 1.0
    assert lyrics.score_lyrics("l’ami", "l'ami")["score"] == 1.0


def test_extra_words_cost_points():
    clean = lyrics.score_lyrics("ding dang dong", "ding dang dong")["score"]
    noisy = lyrics.score_lyrics("ding dang dong", "ding dang dong blah blah")["score"]
    assert clean == 1.0 and noisy < clean


def test_timing_tolerances():
    on = timing.timing_score(10, 14.8, 10.1, 14.6)
    assert on["score"] == 1.0
    late = timing.timing_score(10, 14.8, 11.0, 15.0)
    assert late["startScore"] == 0.0 and late["startOffset"] == 1.0 and 0 < late["score"] < 1
    assert timing.timing_score(10, 14, 12, 18)["score"] == 0.0


def _fake(monkeypatch, stt_words, align_words, fail_isolation=False):
    calls = []

    async def isolate(audio, filename="x"):
        calls.append("isolate")
        if fail_isolation:
            raise el.ElevenLabsError("boom", 502)
        return b"clean"

    async def transcribe(audio, filename="x", language=None, keyterms=None):
        calls.append(("stt", audio, keyterms))
        return {"text": " ".join(w["text"] for w in stt_words), "language": "eng", "words": stt_words}

    async def align(audio, text, filename="x"):
        calls.append(("align", audio, text))
        return {"words": align_words, "loss": 0.1}

    monkeypatch.setattr(el, "isolate", isolate)
    monkeypatch.setattr(el, "transcribe", transcribe)
    monkeypatch.setattr(el, "align", align)
    return calls


def _words(texts, t0, step=0.6, dur=0.5):
    return [{"text": t, "start": t0 + i * step, "end": t0 + i * step + dur, "loss": 0.1} for i, t in enumerate(texts)]


def test_full_pipeline_on_time(monkeypatch):
    # clip starts at song time 4.5 (line starts at 4.8); words are sung 0.4 s into the clip -> song time 4.9
    toks = ["Are", "you", "sleeping", "Are", "you", "sleeping"]
    calls = _fake(monkeypatch, _words(toks, 0.4), _words(toks, 0.4))
    out = asyncio.run(grading.grade_line(b"raw", EXPECTED, "en", 4.8, 8.4, 4.5, isolate=True))
    assert out["isolated"] is True and calls[0] == "isolate"
    assert ("stt", b"clean") == calls[1][:2] and "sleeping" in calls[1][2]
    assert out["lyric"]["score"] == 1.0
    assert out["timing"]["source"] == "forced-alignment"
    assert abs(out["timing"]["startOffset"] - 0.1) < 1e-9
    assert out["timing"]["score"] > 0.9
    assert out["lyric"]["words"][0]["start"] == 4.9


def test_late_and_partial_line(monkeypatch):
    toks = ["Are", "you", "sleeping"]  # only half sung, and 1.2 s late
    stt = _words(toks, 1.5)
    align = _words(["Are", "you", "sleeping", "Are", "you", "sleeping"], 1.5)
    _fake(monkeypatch, stt, align)
    out = asyncio.run(grading.grade_line(b"raw", EXPECTED, "en", 4.8, 8.4, 4.5, isolate=False))
    assert out["isolated"] is False
    assert abs(out["lyric"]["score"] - 0.5) < 1e-9
    assert out["timing"]["startOffset"] > 1.0 and out["timing"]["startScore"] == 0.0


def test_silence_scores_zero_and_isolation_failure_is_soft(monkeypatch):
    _fake(monkeypatch, [], [], fail_isolation=True)
    out = asyncio.run(grading.grade_line(b"raw", EXPECTED, "en", 4.8, 8.4, 4.5, isolate=True))
    assert out["lyric"]["score"] == 0 and out["timing"] == {"score": 0.0, "reason": "no-voice"}
    assert any("isolation" in w for w in out["warnings"])


def test_neighbour_line_words_are_ignored(monkeypatch):
    toks = ["Are", "you", "sleeping", "Are", "you", "sleeping"]
    stt = [{"text": "ing", "start": 0.0, "end": 0.15}] + _words(toks, 0.4)  # tail of the previous line at the clip start
    _fake(monkeypatch, stt, _words(toks, 0.4))
    out = asyncio.run(grading.grade_line(b"raw", EXPECTED, "en", 4.8, 8.4, 4.5, isolate=False))
    assert out["lyric"]["score"] == 1.0
