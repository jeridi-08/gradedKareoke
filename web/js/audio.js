// Owner: Audio/pitch. Mic capture plus backing track (synth fallback when song.audioUrl is null).
import { midiToHz } from './pitch.js';

export async function startMic() {
  if (!navigator.mediaDevices?.getUserMedia) throw { name: 'Unsupported' };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  return { ctx, stream, analyser, buf: new Float32Array(analyser.fftSize) };
}

export function micErrorMessage(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Microphone access is blocked. Allow it in your browser’s site settings and try again.';
  if (n === 'NotFoundError') return 'No microphone found. Plug one in and try again.';
  return 'This browser can’t capture audio here. Try Chrome, Edge or Safari on localhost or https.';
}

function tone(ctx, f, t, d, type, v, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + d * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.02);
}

export class Backing {
  constructor(ctx) { this.ctx = ctx; this.out = null; this.guide = null; }
  /** Schedules everything. Song time 0 plays at audio-clock time t0. */
  async play(song, t0, guideOn) {
    const ctx = this.ctx, beat = 60 / song.bpm;
    this.out = ctx.createGain(); this.out.gain.value = 0.8; this.out.connect(ctx.destination);
    this.guide = ctx.createGain(); this.guide.gain.value = guideOn ? 1 : 0; this.guide.connect(this.out);
    for (let i = 4; i >= 1; i--) tone(ctx, 1400, t0 - i * beat, 0.06, 'square', 0.08, this.out); // count-in
    if (song.audioUrl) {
      const buf = await ctx.decodeAudioData(await (await fetch(song.audioUrl)).arrayBuffer());
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(this.out); s.start(t0);
    } else {
      const end = song.lines[song.lines.length - 1].end;
      for (let b = 0; b * beat < end; b++) tone(ctx, b % 4 ? 1800 : 1200, t0 + b * beat, 0.04, 'square', b % 4 ? 0.03 : 0.06, this.out);
    }
    song.lines.forEach(l => l.notes.forEach(n => tone(ctx, midiToHz(n.midi), t0 + n.time, n.duration * 0.95, 'triangle', 0.3, this.guide)));
  }
  setGuide(on) { if (this.guide) this.guide.gain.value = on ? 1 : 0; }
  stop() { if (this.out) { this.out.disconnect(); this.out = null; } }
}
