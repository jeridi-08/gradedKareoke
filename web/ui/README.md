# ui/ — the hardware skin

Everything that decides how Graded Karaoke *looks and moves* lives here. The app logic (`js/main.js`, `audio.js`,
`pitch.js`, `scoring.js`, `api.js`) and the whole `api/` backend know nothing about it.

```
ui/
  index.css    entry point, imports the rest in order
  tokens.css   colours, easing, durations, device width. Edit values here.
  fonts.css    THE FONT SWAP POINT (see below)
  base.css     reset, page backdrop, [hidden], .sr
  device.css   shell, side wheel, mic pill, speaker grille, key pad
  screen.css   LCD, status bar, lyrics, lane, meter, timer, results
  motion.css   every animation (all ease-out) + reduced-motion rules
  ui.js        observes the DOM and drives the hardware (see "How it hooks in")
  fonts/       Inter TTFs (Latin subset, SIL OFL 1.1)
```

## Swap the font for your own .ttf

The UI uses one family name, **`Device Sans`**, set in `tokens.css` as `--font-ui`. `fonts.css` decides what that name
means. The canvas pitch lane reads the same variable, so it follows too.

1. Put your file in `web/ui/fonts/` (for example `MyFont.ttf`).
2. In `web/ui/fonts.css`, delete (or comment out) the five Inter `@font-face` blocks.
3. Uncomment the **CUSTOM** block and set `src:url("fonts/MyFont.ttf")`.
   - Variable font: keep `font-weight:100 900`.
   - Static font: set the real weight (e.g. `400`), or add one block per weight (200, 300, 400, 500, 600 are used).

Inter has no `♯`, so the note names (C♯, F♯…) fall back to a system symbol font. If your font has `♯` it will be used.

## Tuning

- **Size**: `--device-w` in `tokens.css`. All parts are measured in `cqw` (1% of device width), so the unit scales as one piece.
- **Colour**: `--shell*`, `--key`, `--lcd-*`, `--red` and friends in `tokens.css`. The lane colours (`--target`, `--sung`,
  `--playhead`, ...) are read by `js/lane.js`.
- **Motion**: `--ease-out` (default quint-out), `--ease-out-soft`, and `--t-press/-fast/-base/-slow`. Under
  `prefers-reduced-motion` all movement is removed and state changes still apply.

## How it hooks in (no logic changes)

`index.html` keeps every `id` that `js/main.js` uses. `ui.js` only reads the state `main.js` already produces:

| Hardware | Driven by |
|---|---|
| Status light + label (Mic off / Ready / Count-in / Singing / Scored) | which section is visible, `#stop`/`#count` hidden state |
| Record key latched down + LED | `#go` gets `hidden` while a take runs (shown as "held" instead of removed) |
| Key enable/disable | derived from the same mode, so keys can never fire when the app cannot handle them |
| Side wheel | sets `#song.selectedIndex` and fires `change`, exactly like the dropdown |
| Take timer (mm:ss:cs) | starts when the count-in overlay hides |
| Signal arcs | mic level that `main.js` writes to `#lv` |
| Count-in pop, score count-up, row stagger | observe `#count`, `#tot`, `#rows` |

If `ui.js` fails to load, the app still runs.
