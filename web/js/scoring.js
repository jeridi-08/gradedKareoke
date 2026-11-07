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

export class ScoreKeeper {
  constructor(song, graceSec = 0.1) {
    this.song = song; this.grace = graceSec;
    this.sums = song.lines.map(l => l.notes.map(() => ({ sum: 0, cnt: 0 })));
    this.trail = song.lines.map(() => []);
  }
  lineAt(t) { const i = this.song.lines.findIndex(l => t < l.end + 0.3); return i < 0 ? this.song.lines.length - 1 : i; }
  record(t, midi) {
    const li = this.lineAt(t), line = this.song.lines[li];
    if (midi != null) this.trail[li].push({ t, pc: ((midi % 12) + 12) % 12 });
    const ni = line.notes.findIndex(n => t >= n.time + this.grace && t <= n.time + n.duration);
    if (ni >= 0) { const s = this.sums[li][ni]; s.cnt++; s.sum += frameScore(midi, line.notes[ni].midi); }
  }
  /** Returns the Score result contract: {lineIndex, pitchScore, lyricScore} */
  lineResult(li) {
    let w = 0, s = 0;
    this.song.lines[li].notes.forEach((n, i) => { const k = this.sums[li][i]; w += n.duration; s += n.duration * (k.cnt ? k.sum / k.cnt : 0); });
    return { lineIndex: li, pitchScore: w ? s / w : 0, lyricScore: null };
  }
  results() { return this.song.lines.map((_, i) => this.lineResult(i)); }
  total() { const r = this.results(); return r.reduce((a, b) => a + b.pitchScore, 0) / r.length; }
}
