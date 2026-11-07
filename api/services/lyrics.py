"""Fuzzy, order-aware matching between expected lyrics and what Scribe heard."""
import re
import unicodedata

from rapidfuzz import fuzz

TOKEN = re.compile(r"[\w'’]+")


def tokenize(text: str) -> list[str]:
    """Words as written (accents kept) so they can be sent to Forced Alignment unchanged."""
    return TOKEN.findall(text)


def norm(word: str) -> str:
    w = unicodedata.normalize("NFKD", word.lower().replace("’", "'"))
    return "".join(c for c in w if not unicodedata.combining(c)).strip("'")


def _sim(a: str, b: str) -> float:
    return fuzz.ratio(a, b)


def match_words(expected: list[str], heard: list[str], threshold: int = 75) -> list[int | None]:
    """For each expected word, the index of the heard word it matched (or None).

    Order-preserving (an LCS with fuzzy equality), so a repeated line like "Are you sleeping, are you
    sleeping" cannot match the same heard word twice and a word sung in the wrong place does not count.
    """
    e, h = [norm(w) for w in expected], [norm(w) for w in heard]
    n, m = len(e), len(h)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = _sim(e[i - 1], h[j - 1])
            best = max(dp[i - 1][j], dp[i][j - 1])
            if s >= threshold:
                best = max(best, dp[i - 1][j - 1] + s / 100)
            dp[i][j] = best
    out: list[int | None] = [None] * n
    i, j = n, m
    eps = 1e-9
    while i > 0 and j > 0:
        if abs(dp[i - 1][j] - dp[i][j]) < eps:    # expected word i is not needed: prefer matching EARLIER words
            i -= 1
        elif abs(dp[i][j - 1] - dp[i][j]) < eps:  # heard word j is surplus
            j -= 1
        else:
            out[i - 1] = j - 1
            i -= 1
            j -= 1
    return out


def score_words(expected: list[str], heard: list[str], threshold: int = 75, extra_weight: float = 0.5) -> dict:
    """score = hits / (expected + extra_weight * extra words), so mumbling and babbling both cost points."""
    matches = match_words(expected, heard, threshold)
    hits = sum(m is not None for m in matches)
    used = {m for m in matches if m is not None}
    extra = len(heard) - len(used)
    denom = len(expected) + extra_weight * extra
    return {
        "score": hits / denom if denom else 0.0,
        "words": [
            {"word": w, "ok": matches[i] is not None, "heard": heard[matches[i]] if matches[i] is not None else None}
            for i, w in enumerate(expected)
        ],
        "extra": extra,
    }


def score_lyrics(expected: str, transcript: str, threshold: int = 75) -> dict:
    """Text-only convenience (used by /api/score/lyrics)."""
    r = score_words(tokenize(expected), tokenize(transcript), threshold)
    return {"score": r["score"], "words": [{"word": w["word"], "ok": w["ok"]} for w in r["words"]]}
