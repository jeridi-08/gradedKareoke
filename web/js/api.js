// Owner: Integration. Songs load from static JSON (works without the backend); the rest calls the FastAPI service.
export const API = '/api'; // when web and api run on different ports, set e.g. 'http://localhost:8000/api'

export const loadSongList = () => fetch('data/songs/index.json').then(r => r.json());
export const loadSong = id => fetch(`data/songs/${id}.json`).then(r => r.json());

const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function ok(r) {
  if (r.ok) return r;
  let detail = ''; try { detail = (await r.json()).detail; } catch { /* not json */ }
  throw Object.assign(new Error(detail || `HTTP ${r.status}`), { status: r.status });
}

/** {elevenlabs:{configured, isolation, forced_alignment, ...}} or null when the API is not running. */
export const status = () => fetch(`${API}/status`).then(r => (r.ok ? r.json() : null)).catch(() => null);

/** ElevenLabs grading of one sung line (Voice Isolation -> Scribe + Forced Alignment). Times are on the song clock. */
export async function gradeLine(blob, { expected, language, lineStart, lineEnd, offset, isolate = true }) {
  const f = new FormData();
  f.append('file', blob, 'line.wav'); f.append('expected', expected);
  if (language) f.append('language', language);
  f.append('line_start', lineStart); f.append('line_end', lineEnd); f.append('offset', offset); f.append('isolate', isolate);
  return (await ok(await fetch(`${API}/grade/line`, { method: 'POST', body: f }))).json();
}

export const scoreLyrics = (expected, transcript) => fetch(`${API}/score/lyrics`, json({ expected, transcript })).then(ok).then(r => r.json());

/** ElevenLabs text-to-speech. Resolves to an object URL for an <audio>. */
export async function speak(text, language) {
  return URL.createObjectURL(await (await ok(await fetch(`${API}/tts`, json({ text, language })))).blob());
}

/** Spoken coach summary: {text, url}. */
export async function coach(summary) {
  const j = await (await ok(await fetch(`${API}/coach`, json(summary)))).json();
  const bin = atob(j.audio), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { text: j.text, url: URL.createObjectURL(new Blob([u8], { type: j.mime })) };
}
