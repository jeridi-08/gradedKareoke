// Owner: Frontend. Scrolling, syllable-highlighted lyrics.
const ol = () => document.getElementById('ol');
let lineEls = [], spans = [];

export function buildLyrics(song) {
  ol().innerHTML = ''; lineEls = []; spans = [];
  song.lines.forEach(line => {
    const li = document.createElement('li');
    spans.push(line.notes.map(n => { const s = document.createElement('span'); s.textContent = n.syl; li.appendChild(s); return s; }));
    ol().appendChild(li); lineEls.push(li);
  });
}

/** t < 0 means "not playing": show the first line, nothing highlighted. */
export function syncLyrics(song, li, t, playing) {
  lineEls.forEach((e, i) => e.classList.toggle('act', i === li));
  song.lines.forEach((l, i) => l.notes.forEach((n, j) =>
    spans[i][j].classList.toggle('done', playing && (i < li || (i === li && t >= n.time)))));
  const a = lineEls[li], ph = document.getElementById('lyr').clientHeight;
  ol().style.transform = `translateY(${ph / 2 - (a.offsetTop + a.offsetHeight / 2)}px)`;
}
