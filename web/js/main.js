// Owner: Integration. Wires mic, pitch, backing, lyrics, lane and scoring together.
import { startMic, micErrorMessage, Backing } from './audio.js';
import { detectPitch, noteName } from './pitch.js';
import { ScoreKeeper } from './scoring.js';
import { buildLyrics, syncLyrics } from './lyrics.js';
import { drawLane } from './lane.js';
import { loadSongList, loadSong } from './api.js';

const $ = id => document.getElementById(id);
const show = id => ['intro', 'stage', 'results'].forEach(s => $(s).hidden = s !== id);
let mic, song, keeper, backing, t0 = 0, playing = false;

async function enable() {
  $('msg').textContent = 'Waiting for microphone permission…'; $('msg').className = 'hint';
  try {
    mic = await startMic(); backing = new Backing(mic.ctx);
    const list = await loadSongList();
    $('song').innerHTML = list.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    await pick(list[0].id); show('stage'); loop();
  } catch (e) { $('msg').textContent = micErrorMessage(e); $('msg').className = 'hint err'; console.error(e); }
}
async function pick(id) { song = await loadSong(id); keeper = new ScoreKeeper(song); buildLyrics(song); syncLyrics(song, 0, -1, false); }

async function start() {
  keeper = new ScoreKeeper(song);
  t0 = mic.ctx.currentTime + 0.2 + 4 * (60 / song.bpm);
  await backing.play(song, t0, $('guide').checked);
  playing = true; $('go').hidden = true; $('stop').hidden = false; $('song').disabled = true;
}
function stop() { playing = false; backing.stop(); $('go').hidden = false; $('stop').hidden = true; $('song').disabled = false; $('count').hidden = true; syncLyrics(song, 0, -1, false); }
function finish() {
  stop();
  const res = keeper.results(), tot = Math.round(keeper.total() * 100);
  $('tot').textContent = tot;
  $('grade').textContent = tot >= 90 ? 'Pitch perfect.' : tot >= 75 ? 'Crowd-pleaser.' : tot >= 50 ? 'Getting there. Try the guide tone.' : 'Warm-up round. Headphones help.';
  $('rows').innerHTML = '';
  res.forEach(r => {
    const p = Math.round(r.pitchScore * 100), row = document.createElement('div'); row.className = 'row';
    const t = document.createElement('span'); t.textContent = song.lines[r.lineIndex].text;
    const b = document.createElement('div'); b.className = 'b'; b.innerHTML = `<i style="width:${p}%"></i>`;
    const v = document.createElement('b'); v.textContent = p + '%';
    row.append(t, b, v); $('rows').appendChild(row);
  });
  show('results');
}

function loop() {
  mic.analyser.getFloatTimeDomainData(mic.buf);
  const r = detectPitch(mic.buf, mic.ctx.sampleRate);
  $('lv').style.width = Math.min(100, r.rms * 700) + '%';
  if (r.midi != null) { $('nn').textContent = noteName(r.midi); const c = Math.round((r.midi - Math.round(r.midi)) * 100); $('cc').textContent = (c > 0 ? '+' : '') + c + ' cents'; }
  else { $('nn').textContent = '–'; $('cc').textContent = ''; }
  let t = -1;
  if (playing) {
    t = mic.ctx.currentTime - t0;
    const end = song.lines[song.lines.length - 1].end + 0.6;
    if (t >= end) return finish(), requestAnimationFrame(loop);
    if (t < 0) { $('count').hidden = false; $('count').textContent = Math.ceil(-t / (60 / song.bpm)); }
    else { $('count').hidden = true; keeper.record(t, r.midi); }
  }
  if (!$('stage').hidden) {
    const li = playing ? keeper.lineAt(t) : 0;
    syncLyrics(song, li, t, playing); drawLane($('cv'), song, li, t, keeper.trail, playing);
  }
  requestAnimationFrame(loop);
}

$('enable').onclick = enable;
$('go').onclick = start;
$('stop').onclick = stop;
$('again').onclick = () => { keeper = new ScoreKeeper(song); show('stage'); };
$('song').onchange = e => pick(e.target.value);
$('guide').onchange = e => backing.setGuide(e.target.checked);
