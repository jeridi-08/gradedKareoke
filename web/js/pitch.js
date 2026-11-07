// Owner: Audio/pitch. Pure functions, no DOM. Normalised square difference (McLeod-style).
export const NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
export const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = m => { const k = Math.round(m); return NAMES[((k % 12) + 12) % 12] + (Math.floor(k / 12) - 1); };

/** @returns {{rms:number, hz:number, midi:number|null}} midi is null when unvoiced */
const MIN_HZ = 80, MAX_HZ = 700, SILENCE_RMS = 0.015, CLARITY = 0.85, PEAK_K = 0.9;

/** @returns {{rms:number, clarity:number, hz:number, midi:number|null}} */
export function detectPitch(x, sampleRate) {
  let rms = 0;
  for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
  rms = Math.sqrt(rms / x.length);
  const none = { rms, clarity: 0, hz: 0, midi: null };
  if (rms < SILENCE_RMS) return none;
  const N = x.length >> 1, min = Math.floor(sampleRate / MAX_HZ), max = Math.min(N - 1, Math.floor(sampleRate / MIN_HZ));
  const n = new Float32Array(max + 2);
  for (let t = min; t <= max + 1; t++) {
    let a = 0, m = 0;
    for (let i = 0; i < N; i++) { const p = x[i], q = x[i + t]; a += p * q; m += p * p + q * q; }
    n[t] = m ? 2 * a / m : 0;
  }
  let t = min; while (t < max && n[t] > 0) t++;          // skip the first lobe
  const peaks = []; let top = 0;
  while (t < max) {
    while (t < max && n[t] <= 0) t++;
    let pk = t, v = n[t];
    while (t < max && n[t] > 0) { if (n[t] > v) { v = n[t]; pk = t; } t++; }
    if (v > 0) { peaks.push([pk, v]); if (v > top) top = v; }
  }
  if (top < CLARITY) return { ...none, clarity: top };
  const [pk] = peaks.find(p => p[1] >= PEAK_K * top);
  const a = n[pk - 1], b = n[pk], c = n[pk + 1], d = a - 2 * b + c, sh = d ? (a - c) / (2 * d) : 0;
  const hz = sampleRate / (pk + sh);
  return { rms, clarity: top, hz, midi: hzToMidi(hz) };
}