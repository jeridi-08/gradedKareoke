// Owner: Audio/pitch. Octave-invariant: only the pitch class matters.
export function semitoneError(sung, target) {
  return Math.abs((((sung - target + 6) % 12) + 12) % 12 - 6);
}
/** 1 within 50 cents, falling linearly to 0 at 2 semitones. Unvoiced frames score 0. */
export function frameScore(sung, target) {
  if (sung == null) return 0;
  const d = semitoneError(sung, target);
  return d <= 0.5 ? 1 : d >= 2 ? 0 : 1 - (d - 0.5) / 1.5;
}

/** Final grade = weighted blend. A part that could not be measured (no backend, API error) is left out and the rest re-weighted. */
export const WEIGHTS = { pitch: 0.5, lyric: 0.3, timing: 0.2 };
export function blend({ pitch, lyric, timing }) {
  let w = WEIGHTS.pitch, s = WEIGHTS.pitch * (pitch ?? 0);
  if (lyric != null) { w += WEIGHTS.lyric; s += WEIGHTS.lyric * lyric; }
  if (timing != null) { w += WEIGHTS.timing; s += WEIGHTS.timing * timing; }
  return s / w;
}

export class ScoreKeeper {
  constructor(song, graceSec = 0.1) {
    this.song = song; this.grace = graceSec;
    this.sums = song.lines.map(l => l.notes.map(() => ({ sum: 0, cnt: 0 })));
    this.trail = song.lines.map(() => []);            // [{t, m}] per line: song time and the sung MIDI value (octave kept)
    this.analysis = song.lines.map(() => null);       // ElevenLabs result per line (lyric, timing, ...) once it arrives
  }
  lineAt(t) { const i = this.song.lines.findIndex(l => t < l.end + 0.3); return i < 0 ? this.song.lines.length - 1 : i; }
  record(t, midi) {
    const li = this.lineAt(t), line = this.song.lines[li];
    if (midi != null) this.trail[li].push({ t, m: midi });
    const ni = line.notes.findIndex(n => t >= n.time + this.grace && t <= n.time + n.duration);
    if (ni >= 0) { const s = this.sums[li][ni]; s.cnt++; s.sum += frameScore(midi, line.notes[ni].midi); }
  }
  hasVoice(li) { return this.trail[li].length >= 8; }
  setAnalysis(li, a) { this.analysis[li] = a; }
  pitchScore(li) {
    let w = 0, s = 0;
    this.song.lines[li].notes.forEach((n, i) => { const k = this.sums[li][i]; w += n.duration; s += n.duration * (k.cnt ? k.sum / k.cnt : 0); });
    return w ? s / w : 0;
  }
  /** Score result contract: {lineIndex, pitchScore, lyricScore, timingScore, total}. lyric/timing are null until (or unless) ElevenLabs answers. */
  lineResult(li) {
    const a = this.analysis[li], pitchScore = this.pitchScore(li);
    const lyricScore = a?.lyric ? a.lyric.score : null, timingScore = a?.timing ? a.timing.score : null;
    return { lineIndex: li, pitchScore, lyricScore, timingScore, total: blend({ pitch: pitchScore, lyric: lyricScore, timing: timingScore }) };
  }
  results() { return this.song.lines.map((_, i) => this.lineResult(i)); }
  mean(key) {
    const v = this.results().map(r => r[key]).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  total() { const r = this.results(); return r.reduce((a, b) => a + b.total, 0) / r.length; }
}
