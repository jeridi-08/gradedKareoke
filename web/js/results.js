// Owner: Frontend. The results screen: headline score, Pitch / Words / Time summary, and one expandable row per line
// (pitch graph of target vs. your voice, which words were heard, how early or late you were, "hear this line").
import { drawLane } from './lane.js';
import { speak } from './api.js';

const $ = id => document.getElementById(id);
const pct = x => Math.round(x * 100);
const cell = v => (v == null ? '–' : String(pct(v)));

let audio = null;
const lineAudio = new Map();
export function playUrl(url) { audio?.pause(); audio = new Audio(url); audio.play().catch(() => {}); }
export function stopAudio() { audio?.pause(); audio = null; lineAudio.clear(); }

function timingText(t) {
  if (!t) return '';
  if (t.reason === 'no-voice') return 'No singing detected on this line.';
  const f = s => (Math.abs(s) < 0.1 ? 'on time' : `${Math.round(Math.abs(s) * 1000)} ms ${s > 0 ? 'late' : 'early'}`);
  return `Started ${f(t.startOffset)}, ended ${f(t.endOffset)}.`;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** pending = lyrics/timing will arrive later, so show a placeholder instead of a dash. */
export function renderRows(song, keeper, pending) {
  const rows = $('rows'); rows.innerHTML = '';
  song.lines.forEach((line, li) => {
    const row = el('div', 'row'); row.dataset.li = li; row.dataset.pending = pending ? '1' : '';
    const head = el('button', 'row-head'); head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    head.append(el('span', 't', line.text), el('b', 'p'), el('b', 'l'), el('b', 'm'));
    const detail = el('div', 'detail'); detail.hidden = true;
    const cv = el('canvas', 'rv'); cv.setAttribute('aria-label', `Pitch graph for “${line.text}”: target notes and your voice`);
    detail.append(cv, el('p', 'words'), el('p', 'tm'), el('p', 'heard'));
    const hear = el('button', 'lcd-btn hear', 'Hear this line'); hear.type = 'button';
    detail.append(hear);
    row.append(head, detail); rows.appendChild(row);
    head.onclick = () => toggle(row, song, keeper);
    hear.onclick = async () => {
      hear.disabled = true; const old = hear.textContent; hear.textContent = 'Loading…';
      try {
        if (!lineAudio.has(li)) lineAudio.set(li, await speak(line.text, song.language));
        playUrl(lineAudio.get(li));
      } catch (e) { hear.textContent = e.status === 503 ? 'Needs ElevenLabs key' : 'Unavailable'; setTimeout(() => { hear.textContent = old; hear.disabled = false; }, 2200); return; }
      hear.textContent = old; hear.disabled = false;
    };
    updateRow(li, song, keeper);
  });
}

export function updateRow(li, song, keeper) {
  const row = $('rows').children[li]; if (!row) return;
  const r = keeper.lineResult(li), a = keeper.analysis[li], pending = row.dataset.pending && !a;
  const set = (cls, v) => { const b = row.querySelector('.' + cls); b.textContent = pending ? '…' : cell(v); b.dataset.state = pending ? 'pending' : v == null ? 'none' : ''; };
  row.querySelector('.p').textContent = cell(r.pitchScore);
  set('l', a?.error ? null : r.lyricScore); set('m', a?.error ? null : r.timingScore);
  // detail text
  const words = row.querySelector('.words'); words.innerHTML = '';
  (a?.lyric?.words || []).forEach(w => { const s = el('span', w.ok ? 'ok' : 'miss', w.word); s.title = w.ok ? 'Heard' : 'Not heard'; words.append(s, ' '); });
  row.querySelector('.tm').textContent = a?.error ? `Lyrics and timing unavailable: ${a.error}` : timingText(a?.timing);
  const heard = row.querySelector('.heard');
  heard.textContent = a?.lyric && !a.skipped ? `Scribe heard: “${a.lyric.transcript || '…nothing'}”` : '';
  if (!row.querySelector('.detail').hidden) drawDetail(row, li, song, keeper);
}

function drawDetail(row, li, song, keeper) {
  const words = (keeper.analysis[li]?.lyric?.words || []).filter(w => w.start != null);
  drawLane(row.querySelector('.rv'), song, li, 0, keeper.trail, false, { review: true, words });
}

function toggle(row, song, keeper) {
  const head = row.querySelector('.row-head'), d = row.querySelector('.detail'), open = d.hidden;
  d.hidden = !open; head.setAttribute('aria-expanded', String(open));
  if (open) { drawDetail(row, +row.dataset.li, song, keeper); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

export function updateSummary(keeper, pending) {
  [['sp', 'pitchScore'], ['sl', 'lyricScore'], ['st', 'timingScore']].forEach(([id, k]) => {
    const v = keeper.mean(k); $(id).textContent = pending && k !== 'pitchScore' ? '…' : cell(v);
  });
}
