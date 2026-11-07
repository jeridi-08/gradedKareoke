// Owner: Integration. Songs load from static JSON (works without the backend); the rest calls the FastAPI service.
export const API = '/api'; // when web and api run on different ports, set e.g. 'http://localhost:8000/api'

export const loadSongList = () => fetch('data/songs/index.json').then(r => r.json());
export const loadSong = id => fetch(`data/songs/${id}.json`).then(r => r.json());

// Phase 2 / 3 helpers (need the backend running):
export const scoreLyrics = (expected, transcript) =>
  fetch(`${API}/score/lyrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected, transcript }) }).then(r => r.json());
export async function transcribe(blob, language) {
  const f = new FormData(); f.append('file', blob, 'take.webm'); if (language) f.append('language', language);
  return (await fetch(`${API}/stt`, { method: 'POST', body: f })).json();
}
export async function speak(text, language) {
  const r = await fetch(`${API}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language }) });
  return URL.createObjectURL(await r.blob());
}
