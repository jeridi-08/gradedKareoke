"""Owner: Audio/pitch. Server-side mirror of web/js/scoring.js (octave-invariant)."""


def semitone_error(sung: float, target: float) -> float:
    return abs(((sung - target + 6) % 12) - 6)


def frame_score(sung: float | None, target: float) -> float:
    if sung is None:
        return 0.0
    d = semitone_error(sung, target)
    if d <= 0.5:
        return 1.0
    if d >= 2:
        return 0.0
    return 1 - (d - 0.5) / 1.5


def pitch_score(target: list[float], sung: list[float | None]) -> float:
    """target and sung are equal-length per-frame MIDI values; sung uses None for unvoiced frames."""
    n = min(len(target), len(sung))
    if n == 0:
        return 0.0
    return sum(frame_score(sung[i], target[i]) for i in range(n)) / n
