// Owner: Frontend. Pitch lane: target bars vs. your voice, folded to one octave (12 rows).
import { NAMES } from './pitch.js';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

export function drawLane(cv, song, li, t, trail, playing) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 200;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
  const c = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), col = k => cs.getPropertyValue(k).trim();
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const L = song.lines[li], w0 = L.start - 0.6, w1 = L.end + 0.2, pad = 34, rh = H / 12;
  const X = v => pad + (v - w0) / (w1 - w0) * (W - pad - 6), Y = pc => H - (pc + 0.5) * rh;
  c.font = '11px system-ui,sans-serif';
  for (let pc = 0; pc < 12; pc++) {
    if (!NATURAL.includes(pc)) { c.fillStyle = col('--lane'); c.fillRect(pad, H - (pc + 1) * rh, W - pad, rh); }
    c.fillStyle = col('--mute'); c.fillText(NAMES[pc], 6, Y(pc) + 4);
  }
  c.fillStyle = col('--target');
  L.notes.forEach(n => { const x = X(n.time), w = Math.max(4, X(n.time + n.duration) - x - 3); c.beginPath(); c.roundRect(x, Y(n.midi % 12) - rh * 0.35, w, rh * 0.7, 5); c.fill(); });
  c.fillStyle = col('--sung');
  (trail[li] || []).forEach(p => { c.beginPath(); c.arc(X(p.t), Y(p.pc), 3.5, 0, 7); c.fill(); });
  if (playing) { c.fillStyle = col('--ink'); c.fillRect(X(t), 0, 2, H); }
}
