// Owner: Audio/pitch. Turns noisy per-frame pitch into a steady value:
// median filter, a lock band that holds the note, onset gating, a short hold through dropouts,
// and a clean snap (no glide) when you really change note.
export class PitchTracker {
  constructor({
    medianFrames = 5,     // frames in the median (higher = steadier, slower)
    lockCents = 35,       // stay on the current note while within this many cents
    releaseFrames = 5,    // frames a new pitch must persist before the output jumps to it
    onsetFrames = 3,      // clean frames needed before a note starts (ignores consonant blips)
    holdMs = 120,         // keep the last note through dropouts shorter than this
    drift = 0.08,         // how quickly the output follows slow drift inside the lock band
    minClarity = 0.9      // ignore frames less periodic than this (noise, breath, bleed)
  } = {}) {
    Object.assign(this, { medianFrames, lock: lockCents / 100, releaseFrames, onsetFrames, holdSec: holdMs / 1000, drift, minClarity });
    this.reset();
  }

  reset() {
    this.hist = []; this.out = null; this.pending = 0; this.run = 0; this.lastVoiced = -Infinity;
  }

  /** raw = detectPitch() result; nowSec = audioContext.currentTime. Returns raw with midi smoothed. */
  update(raw, nowSec) {
    if (raw.midi != null && raw.clarity >= this.minClarity) {
      this.lastVoiced = nowSec; this.run++;
      this.hist.push(raw.midi);
      if (this.hist.length > this.medianFrames) this.hist.shift();
      const m = [...this.hist].sort((a, b) => a - b)[this.hist.length >> 1];
      if (this.out == null) { if (this.run >= this.onsetFrames) this.out = m; }                                      // note onset
      else if (Math.abs(m - this.out) <= this.lock) { this.pending = 0; this.out += (m - this.out) * this.drift; }  // hold, follow drift
      else if (++this.pending >= this.releaseFrames) { this.out = m; this.pending = 0; }                              // real change: snap
    } else if (nowSec - this.lastVoiced > this.holdSec) {
      this.out = null; this.hist = []; this.pending = 0; this.run = 0;                                                // silence for good
    }
    return { ...raw, rawMidi: raw.midi, midi: this.out };
  }
}