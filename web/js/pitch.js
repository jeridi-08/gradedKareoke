// Owner: Audio/pitch. Pure functions, no DOM. Normalised square difference (McLeod-style).
export const NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
export const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = m => { const k = Math.round(m); return NAMES[((k % 12) + 12) % 12] + (Math.floor(k / 12) - 1); };

/** @returns {{rms:number, hz:number, midi:number|null}} midi is null when unvoiced */
export function detectPitch(x, sampleRate) {
  let rms = 0;
  for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
  rms = Math.sqrt(rms / x.length);
  if (rms < 0.012) return { rms, hz: 0, midi: null };
  const N = x.length >> 1, min = Math.floor(sampleRate / 900), max = Math.min(N - 1, Math.floor(sampleRate / 70));
  const n = new Float32Array(max + 2);
  let best = 0;
  for (let t = min; t <= max + 1; t++) {
    let a = 0, m = 0;
    for (let i = 0; i < N; i++) { const p = x[i], q = x[i + t]; a += p * q; m += p * p + q * q; }
    n[t] = m ? 2 * a / m : 0;
    if (t <= max && n[t] > best) best = n[t];
  }
  if (best < 0.8) return { rms, hz: 0, midi: null };
  for (let t = min + 1; t <= max; t++) {
    if (n[t] > n[t - 1] && n[t] >= n[t + 1] && n[t] >= 0.9 * best) {
      const a = n[t - 1], b = n[t], c = n[t + 1], d = a - 2 * b + c, sh = d ? (a - c) / (2 * d) : 0;
      const hz = sampleRate / (t + sh);
      return { rms, hz, midi: hzToMidi(hz) };
    }
  }
  return { rms, hz: 0, midi: null };
}
