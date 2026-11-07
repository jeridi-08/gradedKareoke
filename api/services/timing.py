"""Timing score: did you start and end the line on time?

Inputs are song-clock seconds. Early and late are treated the same. Tolerances are generous on purpose:
alignment of sung syllables is fuzzy (about +/-100 ms) and singers rarely hold the last note to its full length.
"""


def _tol(err: float, full: float, zero: float) -> float:
    """1.0 within `full` seconds of perfect, falling linearly to 0 at `zero`."""
    e = abs(err)
    if e <= full:
        return 1.0
    if e >= zero:
        return 0.0
    return 1 - (e - full) / (zero - full)


def timing_score(exp_start: float, exp_end: float, got_start: float, got_end: float) -> dict:
    ds, de = got_start - exp_start, got_end - exp_end  # + = late, - = early
    s = _tol(ds, 0.25, 1.0)
    e = _tol(de, 0.40, 1.4)
    return {
        "score": 0.5 * s + 0.5 * e,
        "startOffset": ds,
        "endOffset": de,
        "startScore": s,
        "endScore": e,
        "expected": {"start": exp_start, "end": exp_end},
        "actual": {"start": got_start, "end": got_end},
    }
