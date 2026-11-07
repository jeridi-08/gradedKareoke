// Owner: Integration. Wires mic, pitch, backing, lyrics, lane, scoring and the ElevenLabs grading together.
import { startMic, micErrorMessage, Backing } from './audio.js';
import { detectPitch, noteName } from './pitch.js';
import { PitchTracker } from './pitchTrack.js';
import { ScoreKeeper } from './scoring.js';
import { buildLyrics, syncLyrics } from './lyrics.js';
import { drawLane } from './lane.js';
import { TakeRecorder } from './recorder.js';
import { gradeTake } from './grader.js';
import { renderRows, updateRow, updateSummary, playUrl, stopAudio } from './results.js';
import { loadSongList, loadSong, status, coach } from './api.js';

const $ = id => document.getElementById(id);
const show = id => ['intro', 'stage', 'results'].forEach(s => $(s).hidden = s !== id);
let mic, song, keeper, backing, recorder, t0 = 0, playing = false, takeId = 0;
let el11 = null;                                   // /api/status -> elevenlabs features (null when the API is not running)
const tracker = new PitchTracker();

let shown = null, cand = null, candN = 0;
function stableNote(m) {                      // changes only after ~130 ms of agreement
  if (m == null) { shown = cand = null; candN = 0; return null; }
  const k = Math.round(m);
  if (k === cand) candN++; else { cand = k; candN = 1; }
  if (shown == null || candN >= 8) shown = cand;
  return shown;
}

async function enable() {
  $('msg').textContent = 'Waiting for microphone permission…'; $('msg').className = 'hint';
  try {
    mic = await startMic(); backing = new Backing(mic.ctx);
    recorder = TakeRecorder.supported(mic.ctx) ? new TakeRecorder(mic.ctx, mic.stream) : null;
    el11 = (await status())?.elevenlabs || null;
    const list = await loadSongList();
    $('song').innerHTML = list.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    await pick(list[0].id); show('stage'); loop();
  } catch (e) { $('msg').textContent = micErrorMessage(e); $('msg').className = 'hint err'; console.error(e); }
}
async function pick(id) { song = await loadSong(id); keeper = new ScoreKeeper(song); buildLyrics(song); syncLyrics(song, 0, -1, false); }

async function start() {
  keeper = new ScoreKeeper(song);
  tracker.reset();
  try { await recorder?.start(); } catch (e) { console.warn('Take recording unavailable', e); recorder = null; }
  t0 = mic.ctx.currentTime + 0.2 + 4 * (60 / song.bpm);
  await backing.play(song, t0, $('guide').checked);
  playing = true; $('go').hidden = true; $('stop').hidden = false; $('song').disabled = true;
}
function stop() { playing = false; backing.stop(); recorder?.stop(); $('go').hidden = false; $('stop').hidden = true; $('song').disabled = false; $('count').hidden = true; syncLyrics(song, 0, -1, false); }

const gradeLabel = tot => tot >= 90 ? 'Pitch perfect.' : tot >= 75 ? 'Crowd-pleaser.' : tot >= 50 ? 'Getting there. Try the guide tone.' : 'Warm-up round. Headphones help.';

function finish() {
  stop();
  const take = ++takeId, canGrade = !!(el11?.configured && recorder?.ready);
  stopAudio(); $('coach').hidden = true;
  renderRows(song, keeper, canGrade);
  updateSummary(keeper, canGrade);
  const pitchOnly = Math.round(keeper.total() * 100);
  $('tot').textContent = canGrade ? '…' : pitchOnly;     // the headline counts up once, when the final score is known
  $('grade').textContent = canGrade ? 'Checking lyrics and timing…' : gradeLabel(pitchOnly);
  $('rstatus').textContent = canGrade ? 'ElevenLabs is listening back to your take.'
    : !el11 ? 'Pitch only: start the API (uvicorn) to score lyrics and timing.'
    : !el11.configured ? 'Pitch only: add ELEVENLABS_API_KEY to .env to score lyrics and timing.'
    : 'Pitch only: this browser could not record the take.';
  show('results');
  if (canGrade) grade(take);
}

async function grade(take) {
  let done = 0; const n = song.lines.length;
  const onLine = (li, a) => {
    if (take !== takeId) return;                     // a newer take has started: drop stale results
    keeper.setAnalysis(li, a); updateRow(li, song, keeper); updateSummary(keeper, true);
    $('rstatus').textContent = `ElevenLabs is listening back to your take… ${++done}/${n} lines`;
  };
  const r = await gradeTake({ song, keeper, recorder, songT0: t0, isolate: el11.isolation, onLine });
  if (take !== takeId) return;
  const usable = keeper.analysis.some(a => a && !a.error);
  updateSummary(keeper, false);
  const tot = Math.round(keeper.total() * 100);
  $('tot').textContent = tot; $('grade').textContent = gradeLabel(tot);
  const isolated = keeper.analysis.some(a => a?.isolated), warn = keeper.analysis.flatMap(a => a?.warnings || [])[0];
  $('rstatus').textContent = !usable ? `Pitch only: ${r.firstError?.message || 'ElevenLabs did not answer.'}`
    : r.failed ? `${r.failed} line(s) could not be checked: ${r.firstError?.message}`
    : warn ? warn
    : `Lyrics and timing checked with ElevenLabs${isolated ? ', voice isolated first' : ''}. Tap a line for its graph.`;
  if (usable) $('coach').hidden = false;
}

async function giveFeedback() {
  const b = $('coach'), old = b.textContent; b.disabled = true; b.textContent = 'Loading…';
  const rs = keeper.results(), worst = rs.reduce((a, r) => (r.total < a.total ? r : a), rs[0]);
  const offs = keeper.analysis.map(a => a?.timing?.startOffset).filter(x => x != null);
  try {
    const c = await coach({
      language: song.language, total: keeper.total(), pitch: keeper.mean('pitchScore'), lyrics: keeper.mean('lyricScore'), timing: keeper.mean('timingScore'),
      worstLine: song.lines[worst.lineIndex].text, meanStartOffset: offs.length ? offs.reduce((x, y) => x + y, 0) / offs.length : null
    });
    $('rstatus').textContent = c.text; playUrl(c.url);
  } catch (e) { $('rstatus').textContent = `Feedback unavailable: ${e.message}`; }
  b.textContent = old; b.disabled = false;
}

function loop() {
  mic.analyser.getFloatTimeDomainData(mic.buf);
  const r = tracker.update(detectPitch(mic.buf, mic.ctx.sampleRate), mic.ctx.currentTime);
  $('lv').style.width = Math.min(100, r.rms * 700) + '%';
  const k = stableNote(r.midi);
  if (k != null) { $('nn').textContent = noteName(k); const c = Math.round((r.midi - k) * 100); $('cc').textContent = (c > 0 ? '+' : '') + c + ' cents'; }
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
$('again').onclick = () => { takeId++; stopAudio(); keeper = new ScoreKeeper(song); show('stage'); };
$('coach').onclick = giveFeedback;
$('song').onchange = e => pick(e.target.value);
$('guide').onchange = e => backing.setGuide(e.target.checked);
