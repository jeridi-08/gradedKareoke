// Owner: Audio. Records the whole take as raw PCM on the same audio clock as the backing track,
// so any window of SONG time can be cut out later as a 16 kHz mono WAV for ElevenLabs.
const WORKLET = `
class TakeRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; this.t = 0; }
  process(inputs) {
    const c = inputs[0] && inputs[0][0];
    if (!c) return true;
    for (let i = 0; i < c.length; i++) {
      if (this.n === 0) this.t = currentTime + i / sampleRate;
      this.buf[this.n++] = c[i];
      if (this.n === this.buf.length) { this.port.postMessage({ t: this.t, d: this.buf.slice() }); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('take-recorder', TakeRecorder);`;

const loaded = new WeakSet();
const OUT_RATE = 16000;

export class TakeRecorder {
  constructor(ctx, stream) { this.ctx = ctx; this.stream = stream; this.chunks = []; this.total = 0; this.tFirst = null; this.pcm = null; }

  static supported(ctx) { return !!(ctx.audioWorklet && window.AudioWorkletNode); }

  async start() {
    const ctx = this.ctx;
    if (!loaded.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url); loaded.add(ctx);
    }
    this.chunks = []; this.total = 0; this.tFirst = null; this.pcm = null;
    this.src = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'take-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    this.node.port.onmessage = e => { if (this.tFirst == null) this.tFirst = e.data.t; this.chunks.push(e.data.d); this.total += e.data.d.length; };
    this.mute = ctx.createGain(); this.mute.gain.value = 0;          // keeps the node "pulled" without playing the mic back
    this.src.connect(this.node); this.node.connect(this.mute); this.mute.connect(ctx.destination);
  }

  stop() {
    if (!this.node) return;
    this.src.disconnect(); this.node.disconnect(); this.mute.disconnect(); this.node.port.onmessage = null; this.node = null;
    const pcm = new Float32Array(this.total); let o = 0;
    for (const c of this.chunks) { pcm.set(c, o); o += c.length; }
    this.pcm = pcm; this.chunks = [];
  }

  get ready() { return !!this.pcm && this.pcm.length > 0 && this.tFirst != null; }

  /** Cuts song-time window [a, b] (songT0 = audio-clock time of song time 0). Returns {blob, offset} where offset is the song time of the first sample. */
  clip(songT0, a, b) {
    const sr = this.ctx.sampleRate, pcm = this.pcm;
    let i0 = Math.round((songT0 + a - this.tFirst) * sr), i1 = Math.round((songT0 + b - this.tFirst) * sr);
    i0 = Math.max(0, i0); i1 = Math.min(pcm.length, i1);
    if (i1 - i0 < sr * 0.2) return null;
    return { blob: encodeWav(downsample(pcm, i0, i1, sr, OUT_RATE), OUT_RATE), offset: (this.tFirst + i0 / sr) - songT0 };
  }
}

function downsample(x, i0, i1, from, to) {                       // box filter: averages the source samples under each output sample
  const r = from / to, n = Math.floor((i1 - i0) / r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i0 + Math.floor(i * r), b = Math.max(a + 1, i0 + Math.floor((i + 1) * r));
    let s = 0; for (let k = a; k < b; k++) s += x[k];
    out[i] = s / (b - a);
  }
  return out;
}

function encodeWav(f32, rate) {
  const buf = new ArrayBuffer(44 + f32.length * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, f32.length * 2, true);
  for (let i = 0; i < f32.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
