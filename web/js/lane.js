// Owner: Frontend. Singstar-style pitch graph: target notes (bars) against your voice (a continuous line).
// The vertical axis is real semitones, zoomed to the current line. Your voice is drawn at the octave nearest
// the target, so singing an octave away still lines up (scoring is octave-invariant too).
// Colours come from ui/tokens.css (--target, --sung, --mute, --lane, --line, --playhead, --font-ui).
import { noteName } from './pitch.js';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const wrap = d => ((d + 6) % 12 + 12) % 12 - 6;

/** The target note a sung point should be compared against: the one sounding at t, else the nearest one in time. */
function refAt(notes, t) {
  let best = notes[0], bd = Infinity;
  for (const n of notes) {
    const d = t < n.time ? n.time - t : t > n.time + n.duration ? t - n.time - n.duration : 0;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/**
 * @param opts.review  true for the results graph: no playhead, whole take visible
 * @param opts.words   [{start,end,ok}] word spans from ElevenLabs Forced Alignment (song time), drawn as a strip under the notes
 */
export function drawLane(cv, song, li, t, trail, playing, opts = {}) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight || 200;
  if (!W) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), col = k => cs.getPropertyValue(k).trim();
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);

  const L = song.lines[li], notes = L.notes, review = !!opts.review, words = opts.words || [];
  const w0 = L.start - (review ? 0.35 : 0.6), w1 = L.end + (review ? 0.6 : 0.2);

  // Pitch axis: the line's range plus a little room, at least ~9 semitones tall.
  let lo = Math.min(...notes.map(n => n.midi)) - 2, hi = Math.max(...notes.map(n => n.midi)) + 2;
  if (hi - lo < 8) { const m = (hi + lo) / 2; lo = Math.floor(m - 4); hi = lo + 8; }
  const rows = hi - lo + 1, stripH = words.length ? Math.max(6, H * 0.07) : 0, top = 3, plotH = H - top - stripH - (stripH ? 3 : 0), rh = plotH / rows;
  const fs = Math.max(8, Math.min(Math.round(W * 0.03), Math.floor(rh * 0.9))), pad = Math.round(fs * 3.4);
  const X = v => pad + (v - w0) / (w1 - w0) * (W - pad - 6);
  const Y = m => top + (hi - m + 0.5) * rh;

  c.font = `400 ${fs}px ${col('--font-ui')}`; c.textBaseline = 'middle';
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12, y = Y(m);
    if (!NATURAL.includes(pc)) { c.fillStyle = col('--lane'); c.fillRect(pad, y - rh / 2, W - pad, rh); }
    else {
      c.strokeStyle = col('--line'); c.lineWidth = 1; c.setLineDash([1, 5]); c.beginPath(); c.moveTo(pad, Math.round(y) + 0.5); c.lineTo(W, Math.round(y) + 0.5); c.stroke(); c.setLineDash([]);
      c.fillStyle = col('--mute'); c.fillText(noteName(m), 2, y + 0.5);
    }
  }

  // Target: the line you should sing. Bars, plus a faint connector between consecutive notes.
  c.strokeStyle = col('--line'); c.lineWidth = 1;
  c.beginPath(); notes.forEach((n, i) => { const x = X(n.time), y = Y(n.midi); i ? c.lineTo(x, y) : c.moveTo(x, y); c.lineTo(X(n.time + n.duration), y); }); c.stroke();
  c.fillStyle = col('--target');
  notes.forEach(n => { const x = X(n.time), w = Math.max(4, X(n.time + n.duration) - x - 3); c.beginPath(); c.roundRect(x, Y(n.midi) - rh * 0.3, w, rh * 0.6, 2); c.fill(); });

  // Your voice: one continuous line, folded to the octave nearest the target. Thick where you are on pitch (within half a semitone).
  const pts = (trail[li] || []).map(p => { const r = refAt(notes, p.t); const d = wrap(p.m - r.midi); return { t: p.t, y: r.midi + d, on: Math.abs(d) <= 0.5 }; });
  c.strokeStyle = col('--sung'); c.fillStyle = col('--sung'); c.lineCap = 'round'; c.lineJoin = 'round';
  const base = Math.max(1.6, rh * 0.09), thick = Math.max(3.4, rh * 0.26);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.t - a.t > 0.12) continue;                                // a gap (you stopped singing): lift the pen
    c.lineWidth = a.on && b.on ? thick : base;
    c.beginPath(); c.moveTo(X(a.t), Y(Math.max(lo - 0.5, Math.min(hi + 0.5, a.y)))); c.lineTo(X(b.t), Y(Math.max(lo - 0.5, Math.min(hi + 0.5, b.y)))); c.stroke();
  }
  const last = pts[pts.length - 1];
  if (playing && last && t - last.t < 0.15) { c.beginPath(); c.arc(X(last.t), Y(Math.max(lo - 0.5, Math.min(hi + 0.5, last.y))), Math.max(3, rh * 0.22), 0, 7); c.fill(); }

  // Where each word really landed in time (ElevenLabs Forced Alignment), under the notes. Missed words are hollow.
  if (stripH) {
    const y = H - stripH - 1;
    words.forEach(w => {
      if (w.start == null) return;
      const x = X(w.start), ww = Math.max(3, X(w.end) - x - 1);
      c.beginPath(); c.roundRect(x, y, ww, stripH, 2);
      if (w.ok) { c.fillStyle = col('--mute'); c.fill(); } else { c.strokeStyle = col('--mute'); c.lineWidth = 1; c.stroke(); }
    });
  }

  if (playing && !review) { const x = Math.round(X(t)); c.fillStyle = col('--playhead'); c.fillRect(x, 4, 1.5, H - 4); c.beginPath(); c.arc(x + 0.75, 4, 3, 0, 7); c.fill(); }
}
