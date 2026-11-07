"""Spoken feedback for the results screen (the text is sent to ElevenLabs TTS)."""

T = {
    "en": {
        "open": "You scored {total} out of 100.",
        "best": "Your strongest part was {k}.",
        "weak": "Work on your {k} next.",
        "line": "The line to practise is: {line}.",
        "k": {"pitch": "pitch", "lyrics": "lyrics", "timing": "timing"},
        "tier": [(90, "Wonderful. Pitch perfect."), (75, "Great take. The crowd is pleased."), (50, "Getting there. Try the guide tone."), (0, "Warm-up round. Headphones help.")],
        "early": "You tend to come in early.",
        "late": "You tend to come in late.",
    },
    "fr": {
        "open": "Vous avez obtenu {total} sur 100.",
        "best": "Votre point fort : {k}.",
        "weak": "À travailler : {k}.",
        "line": "La ligne à retravailler : {line}.",
        "k": {"pitch": "la justesse", "lyrics": "les paroles", "timing": "le rythme"},
        "tier": [(90, "Magnifique. Une justesse parfaite."), (75, "Très belle prise. Le public est conquis."), (50, "Vous y êtes presque. Essayez avec la note guide."), (0, "Séance d'échauffement. Un casque aide beaucoup.")],
        "early": "Vous avez tendance à partir trop tôt.",
        "late": "Vous avez tendance à partir trop tard.",
    },
}


def coach_text(language: str | None, total: float, pitch: float | None, lyrics: float | None, timing: float | None,
               worst_line: str | None = None, mean_start_offset: float | None = None) -> str:
    t = T.get((language or "en")[:2], T["en"])
    parts = [t["open"].format(total=round(total * 100))]
    parts.append(next(msg for floor, msg in t["tier"] if total * 100 >= floor))
    scores = {k: v for k, v in {"pitch": pitch, "lyrics": lyrics, "timing": timing}.items() if v is not None}
    if len(scores) >= 2:
        best, worst = max(scores, key=scores.get), min(scores, key=scores.get)
        if scores[best] - scores[worst] > 0.05:
            parts.append(t["best"].format(k=t["k"][best]))
            parts.append(t["weak"].format(k=t["k"][worst]))
    if mean_start_offset is not None and abs(mean_start_offset) > 0.3:
        parts.append(t["late"] if mean_start_offset > 0 else t["early"])
    if worst_line and total < 0.95:
        parts.append(t["line"].format(line=worst_line.strip(" ,.!?")))
    return " ".join(parts)
