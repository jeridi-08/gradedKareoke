// UI layer. Presentation only: it never imports app logic and never calls the API.
// It watches the DOM that js/main.js already produces (which screen is visible, whether #stop is shown,
// the count-in number, the score) and drives the hardware: status light, keys, side wheel, timer, count-up.
// If this file fails to load, the app still works. The keys just stay in their initial state.

const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
const pad2 = n => String(n).padStart(2, '0');

/* ── Mode: derived from what main.js shows and hides ─────────────── */
const LABEL = { off: 'Mic off', ready: 'Ready', count: 'Count-in', singing: 'Singing', scored: 'Scored' };

function mode() {
  if (!$('intro').hidden) return 'off';
  if (!$('results').hidden) return 'scored';
  if (!$('stop').hidden) return $('count').hidden ? 'singing' : 'count';
  return 'ready';
}

let lastMode = null, takeStart = null;

function setDisabled(el, v) { if (el.disabled !== v) el.disabled = v; }

function apply() {
  const m = mode();
  if (m !== lastMode) onMode(lastMode, m);
  lastMode = m;

  // Keys can only do what the app can currently do. (#go is "held down" while a take runs.)
  setDisabled($('go'), m !== 'ready');
  setDisabled($('stop'), !(m === 'count' || m === 'singing'));
  setDisabled($('guide'), m === 'off');
  setDisabled($('again'), m !== 'scored');
  setDisabled($('enable'), m !== 'off');
  setDisabled($('jog'), m !== 'ready' || $('song').disabled);
}

function onMode(prev, m) {
  document.body.dataset.mode = m;
  $('state').textContent = LABEL[m];
  $('pill-label').textContent = m === 'off' ? 'Enable mic' : 'Mic on';
  if (m === 'count' || m === 'off' || (m === 'ready' && prev === 'scored')) { takeStart = null; $('clock').textContent = '00:00:00'; }
  if (m === 'singing' && prev === 'count') takeStart = performance.now(); // count-in just ended: song time 0
}

/* ── Clock, take timer, mic level ────────────────────────────────── */
function tickClock() {
  const d = new Date(); let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  $('clk').textContent = `${pad2(h)}.${pad2(d.getMinutes())} ${ap}`;
  $('clk').dateTime = d.toTimeString().slice(0, 5);
}

const fmt = ms => `${pad2(Math.floor(ms / 60000))}:${pad2(Math.floor(ms / 1000) % 60)}:${pad2(Math.floor(ms / 10) % 100)}`;

let lastLevel = -1;
function frame() {
  if (lastMode === 'singing' && takeStart != null) $('clock').textContent = fmt(performance.now() - takeStart);
  const w = parseFloat($('lv').style.width) || 0;           // main.js writes the mic level here
  const lvl = lastMode === 'off' ? 0 : w > 40 ? 3 : w > 15 ? 2 : w > 2 ? 1 : 0;
  if (lvl !== lastLevel) { $('signal').dataset.level = lvl; lastLevel = lvl; }
  requestAnimationFrame(frame);
}

/* ── Side wheel: drives #song exactly like the dropdown does ─────── */
let spin = 0, prevIdx = 0;
const song = $('song'), jog = $('jog');

function stepSong(dir) {
  const n = song.options.length;
  if (jog.disabled || n < 2) return;
  song.selectedIndex = (song.selectedIndex + dir + n) % n;
  song.dispatchEvent(new Event('change', { bubbles: true }));   // main.js listens via onchange
}
song.addEventListener('change', () => {                        // also fires for the native dropdown
  const n = song.options.length, d = song.selectedIndex - prevIdx;
  const dir = Math.abs(d) > n / 2 ? -Math.sign(d) : Math.sign(d);
  prevIdx = song.selectedIndex;
  spin -= dir * 4.4;                                           // 4 knurl periods: lands on a stripe
  jog.style.setProperty('--spin', spin);
});
jog.addEventListener('click', e => stepSong(e.shiftKey ? -1 : 1));
jog.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); stepSong(1); }
  if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); stepSong(-1); }
});
let acc = 0;
jog.addEventListener('wheel', e => {
  if (jog.disabled) return;                                    // let the page scroll when the wheel is locked
  e.preventDefault(); acc += e.deltaY;
  if (Math.abs(acc) >= 40) { stepSong(acc > 0 ? 1 : -1); acc = 0; }
}, { passive: false });

/* ── Count-in: restart the pop animation when the number changes ─── */
const count = $('count');
let lastCount = '', countWasHidden = true;
function syncCount(force) {
  const n = count.textContent;
  if (n === lastCount && !force) return;
  lastCount = n; count.dataset.n = n;
  if (!n) return;
  count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
}
new MutationObserver(() => syncCount(false)).observe(count, { childList: true, characterData: true, subtree: true });

/* ── Score: count up with an ease-out, rows stagger in ───────────── */
const tot = $('tot');
let countUp = 0;
function syncScore() {
  const target = parseInt(tot.textContent, 10);
  if (Number.isNaN(target) || tot.dataset.counting) return;
  cancelAnimationFrame(countUp);
  if (reduceMotion.matches || target === 0) return;
  const t0 = performance.now(), dur = 1400;
  tot.dataset.counting = '1';
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    tot.textContent = Math.round(target * easeOutQuint(p));
    scoreObs.takeRecords();                                    // our own writes are not new scores
    if (p < 1) countUp = requestAnimationFrame(step);
    else delete tot.dataset.counting;
  };
  tot.textContent = '0'; scoreObs.takeRecords();
  countUp = requestAnimationFrame(step);
}
const scoreObs = new MutationObserver(syncScore);
scoreObs.observe(tot, { childList: true, characterData: true, subtree: true });

const rows = $('rows');
new MutationObserver(() => [...rows.children].forEach((r, i) => r.style.setProperty('--i', i)))
  .observe(rows, { childList: true });

/* ── Wire up ─────────────────────────────────────────────────────── */
// main.js toggles `hidden` / `disabled` all the time (even to the same value), so keep this callback cheap.
new MutationObserver(() => {
  apply();
  const h = count.hidden;
  if (countWasHidden && !h) syncCount(true);                  // count-in started: pop even if the number repeats
  countWasHidden = h;
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });

tickClock(); setInterval(tickClock, 5000);
apply(); frame();
