// Owner: Integration. After the take: cut each line out of the recording and send it to the backend,
// which uses ElevenLabs (Voice Isolation -> Scribe + Forced Alignment) to grade lyrics and timing.
import { gradeLine } from './api.js';

const LEAD = 0.3, TAIL = 0.5;      // seconds of context around each line

/** onLine(li, analysis) fires as each line comes back. Resolves to {ok, failed, firstError}. */
export async function gradeTake({ song, keeper, recorder, songT0, isolate, onLine, concurrency = 3 }) {
  const jobs = song.lines.map((_, li) => li);
  let ok = 0, failed = 0, firstError = null;
  const worker = async () => {
    for (let li = jobs.shift(); li !== undefined; li = jobs.shift()) {
      const L = song.lines[li];
      if (!keeper.hasVoice(li)) { onLine(li, { skipped: true, lyric: { score: 0, words: [], transcript: '' }, timing: { score: 0, reason: 'no-voice' } }); ok++; continue; }
      const clip = recorder.clip(songT0, L.start - LEAD, L.end + TAIL);
      if (!clip) { onLine(li, { skipped: true, lyric: { score: 0, words: [], transcript: '' }, timing: { score: 0, reason: 'no-voice' } }); ok++; continue; }
      try {
        const res = await gradeLine(clip.blob, {
          expected: L.text, language: song.language, lineStart: L.start, lineEnd: L.end, offset: clip.offset, isolate
        });
        onLine(li, res); ok++;
      } catch (e) { failed++; firstError ||= e; onLine(li, { error: e.message }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, song.lines.length) }, worker));
  return { ok, failed, firstError };
}
