// Owner: Frontend. Pitch lane: target bars vs. your voice, folded to one octave (12 rows).
// Look & feel comes from the CSS tokens in ui/tokens.css (--target, --sung, --mute, --lane, --line, --playhead, --font-ui),
// and the canvas takes its height from CSS, so restyling never needs a change here.
import { NAMES } from './pitch.js';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

export function drawLane(cv, song, li, t, trail, playing) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight || 200;
  if (!W) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), col = k => cs.getPropertyValue(k).trim();
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const L = song.lines[li], w0 = L.start - 0.6, w1 = L.end + 0.2, rh = H / 12, fs = Math.max(8, Math.min(Math.round(W * 0.03), Math.floor(rh * 0.88))), pad = Math.round(fs * 3);
  const X = v => pad + (v - w0) / (w1 - w0) * (W - pad - 6), Y = pc => H - (pc + 0.5) * rh;
  c.font = `400 ${fs}px ${col('--font-ui')}`; c.textBaseline = 'middle';
  for (let pc = 0; pc < 12; pc++) {
    if (!NATURAL.includes(pc)) { c.fillStyle = col('--lane'); c.fillRect(pad, H - (pc + 1) * rh, W - pad, rh); }
    else { c.strokeStyle = col('--line'); c.lineWidth = 1; c.setLineDash([1, 5]); c.beginPath(); c.moveTo(pad, Math.round(Y(pc)) + 0.5); c.lineTo(W, Math.round(Y(pc)) + 0.5); c.stroke(); c.setLineDash([]); }
    c.fillStyle = col('--mute'); c.fillText(NAMES[pc], 2, Y(pc) + 0.5);
  }
  c.fillStyle = col('--target');
  L.notes.forEach(n => { const x = X(n.time), w = Math.max(4, X(n.time + n.duration) - x - 3); c.beginPath(); c.roundRect(x, Y(n.midi % 12) - rh * 0.3, w, rh * 0.6, 2); c.fill(); });
  c.fillStyle = col('--sung');
  (trail[li] || []).forEach(p => { c.beginPath(); c.arc(X(p.t), Y(p.pc), Math.max(2, rh * 0.2), 0, 7); c.fill(); });
  if (playing) { const x = Math.round(X(t)); c.fillStyle = col('--playhead'); c.fillRect(x, 4, 1.5, H - 4); c.beginPath(); c.arc(x + 0.75, 4, 3, 0, 7); c.fill(); }
}
