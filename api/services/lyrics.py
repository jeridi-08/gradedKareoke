"""Owner: Speech/lyrics. Fuzzy word matching between expected lyrics and an STT transcript."""
import re
import unicodedata

from rapidfuzz import fuzz


def _norm(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))  # strip accents
    return re.findall(r"[\w']+", text)


def score_lyrics(expected: str, transcript: str, threshold: int = 75) -> dict:
    exp, heard = _norm(expected), _norm(transcript)
    pool, words, hits = list(heard), [], 0
    for w in exp:
        best = max(pool, key=lambda h: fuzz.ratio(w, h), default=None)
        ok = best is not None and fuzz.ratio(w, best) >= threshold
        if ok:
            pool.remove(best)
            hits += 1
        words.append({"word": w, "ok": ok})
    return {"score": hits / len(exp) if exp else 0.0, "words": words}
