# Ostinato Builder: octave editing, raw ABC, save/load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Ostinato Builder, let every bordun scale degree have a low/high octave choice, let any part's ABC be hand-edited directly (e.g. to fix one note's octave), and let a built ostinato be saved and reloaded so a teacher doesn't have to rebuild it every session.

**Architecture:** All changes live in the single existing file `layouts/_default/ostinato-builder.html` (no new files — this tool is intentionally self-contained, matching Rhythm Builder's pattern). Three additive, independently-shippable pieces: (1) a data-table extension to `KEYS[key].palette`; (2) a `rawAbc`/`rawMode` field pair on each part plus two new pure string functions (`splitRawAbcBars`, `tileRawAbcBars`) that let a part's voice come from hand-typed ABC instead of the cell grid; (3) `localStorage`-backed autosave + a named save/load library + file export/import, following the exact patterns already used by the Chord Diagram Generator (`mtim_chord_library`) and Visual Schedule Builder (`mtim_visual_schedule_draft`, confirm-to-restore prompt).

**Tech Stack:** Hugo (Go templates, only at the very top/bottom of this file — the `<script>` body itself has zero Hugo template syntax in it), vanilla JS, ABCJS 6.4.4. No Node/npm required to build or run the site. Verification is `hugo --gc --quiet` build success, `node` smoke-checks (Node is available on this machine even though the project doesn't require it) for the two new pure functions and the new data table, and browser preview for everything DOM-related.

Design spec: [`docs/superpowers/specs/2026-09-18-ostinato-builder-abc-edit-save-load-design.md`](../specs/2026-09-18-ostinato-builder-abc-edit-save-load-design.md)

---

## Background facts (read before starting)

- The whole tool is one file: `layouts/_default/ostinato-builder.html`. `{{ define "extra_head" }}...{{ end }}` holds CSS + the ABCJS CDN `<script src>` tag; `{{ define "main" }}...{{ end }}` holds the HTML markup and one big inline `<script>...</script>` block with all the JS. The only Hugo template syntax inside that `<script>` block is the very last two lines (`{{ partial "tool-footer.html" . }}` / `{{ end }}`), which come *after* the closing `</script>` tag — the JS body itself is plain, untemplated JavaScript.
- State lives in one global `project = { meter, subdiv, tempo, key, parts: [] }` object (`var project`, module-level). Each part is `{ id, kind, instrumentId, bars, cells, lyricsOn }` today (`kind` is `'bordun'` or `'perc'`).
- `renderApp()` rebuilds the entire `#parts-host` DOM from `project.parts` and ends by calling `scheduleRender()`. `scheduleRender()` debounces (`setTimeout`, 130ms) a call to `renderScore()`, which regenerates ABC via `generateScoreABC()` and re-renders it with `ABCJS.renderAbc`. Almost every state-changing control (add/remove part, instrument/preset/key/meter/subdiv change, lyrics toggle) calls `renderApp()`; a few high-frequency ones (tempo slider, lyric size/bold) call `scheduleRender()` directly to skip the full DOM rebuild. **`scheduleRender()` is therefore the one chokepoint nearly every mutation passes through** — this plan hooks autosave there instead of instrumenting every individual mutator.
- `part.bars` is the single source of truth for a part's bar count, consumed by `longestBars()`, the loop-badge display, and `flattenPart(part, targetBars)`'s `b % part.bars` wraparound tiling. This plan keeps that invariant for raw-ABC parts too: whenever raw ABC text changes, `part.bars` is recomputed from the text's bar-line count, so all the existing `Lbars`/loop-badge/tiling code keeps working unmodified.
- `KEYS[key]` (5 keys: C, F, G, D, A) has a `palette` array of `[abcToken, solfegeLabel]` pairs, rendered as `<option>`s by `buildBordunCell()`. Today each key has 7 entries ascending in pitch: `so, do re mi so la do'` (so/do each appear twice, at different octaves; re/mi/la once).
- Two different fields can hold different octaves for the "same" scale degree — e.g. for key C, the top-level `K.do` field is `'C'` (used as the bordun chord root) while the *palette's* `do` entry is `'c'`, a full octave higher. This plan only touches `palette`, not the top-level `do`/`re`/`mi`/`so`/`la` fields, and computes new entries from the palette's own re/mi/la values (not the top-level fields, which can differ).
- No test framework exists in this repo and none should be added — verification here follows the pattern already used in `docs/superpowers/plans/2026-06-15-multi-notation-panels.md`: build success + targeted `node` smoke-checks for pure logic + browser preview for UI.

---

## Task 1: Extend the bordun pitch palette with low-octave choices

**Files:**
- Modify: `layouts/_default/ostinato-builder.html` (the `const KEYS = {...}` block)

Gives every scale degree (do, re, mi, so, la) a low and high octave option, matching the span so/do already have. Pure data change — `buildBordunCell()` already renders whatever is in `palette` as dropdown options, so no other code changes.

- [ ] **Step 1: Replace the `KEYS` constant**

In `layouts/_default/ostinato-builder.html`, find this exact block (it starts a few lines below the `BORDUN_PRESETS` comment, above `const KEY_LABELS`):

```js
const KEYS = {
  'C': { do:'C', re:'D', mi:'E', so:'G', la:'A', soLow:'G,', doUp:"c",
         palette:[['G','so,'],['c','do'],['d','re'],['e','mi'],['g','so'],['a','la'],["c'","do'"]] },
  'F': { do:'F', re:'G', mi:'A', so:"c", la:"d", soLow:'C', doUp:"f",
         palette:[['c','so,'],['f','do'],['g','re'],['a','mi'],["c'","so"],["d'","la"],["f'","do'"]] },
  'G': { do:'G', re:'A', mi:'B', so:"d'", la:"e'", soLow:'D', doUp:"g",
         palette:[['d','so,'],['g','do'],['a','re'],['b','mi'],["d'","so"],["e'","la"],["g'","do'"]] },
  'D': { do:'d', re:'e', mi:'^f', so:'a', la:'b', soLow:'A', doUp:"d'",
         palette:[['A','so,'],['d','do'],['e','re'],['^f','mi'],['a','so'],['b','la'],["d'","do'"]] },
  'A': { do:'a', re:'b', mi:"^c'", so:"e'", la:"^f'", soLow:'E', doUp:"a'",
         palette:[['E','so,'],['a','do'],['b','re'],["^c'","mi"],["e'","so"],["^f'","la"],["a'","do'"]] },
};
```

Replace it with:

```js
const KEYS = {
  'C': { do:'C', re:'D', mi:'E', so:'G', la:'A', soLow:'G,', doUp:"c",
         palette:[['D','re,'],['E','mi,'],['G','so,'],['A','la,'],['c','do'],['d','re'],['e','mi'],['g','so'],['a','la'],["c'","do'"]] },
  'F': { do:'F', re:'G', mi:'A', so:"c", la:"d", soLow:'C', doUp:"f",
         palette:[['G','re,'],['A','mi,'],['c','so,'],['d','la,'],['f','do'],['g','re'],['a','mi'],["c'","so"],["d'","la"],["f'","do'"]] },
  'G': { do:'G', re:'A', mi:'B', so:"d'", la:"e'", soLow:'D', doUp:"g",
         palette:[['A','re,'],['B','mi,'],['d','so,'],['e','la,'],['g','do'],['a','re'],['b','mi'],["d'","so"],["e'","la"],["g'","do'"]] },
  'D': { do:'d', re:'e', mi:'^f', so:'a', la:'b', soLow:'A', doUp:"d'",
         palette:[['E','re,'],['^F','mi,'],['A','so,'],['B','la,'],['d','do'],['e','re'],['^f','mi'],['a','so'],['b','la'],["d'","do'"]] },
  'A': { do:'a', re:'b', mi:"^c'", so:"e'", la:"^f'", soLow:'E', doUp:"a'",
         palette:[['E','so,'],['B','re,'],['^c','mi,'],['^f','la,'],['a','do'],['b','re'],["^c'","mi"],["e'","so"],["^f'","la"],["a'","do'"]] },
};
```

(`^` prefix = sharp, matching the existing D/A key convention for mi. Key A's `so,` stays lowest — that pre-existing entry already sits more than an octave below `do`, a quirk of the original hand-tuned table this plan doesn't touch.)

- [ ] **Step 2: Verify the new palette with a Node smoke-check**

This table was hand-derived from music theory and is easy to get subtly wrong (a duplicate pitch, a token one octave off, wrong ascending order in the dropdown) — this check catches that class of mistake by parsing each ABC token to a comparable pitch number and asserting strict ascending order, no duplicates, and the right set of 10 labels per key.

Run:
```bash
cd /Users/eric/meettheminmusic-blog
node <<'EOF'
const fs = require('fs');
const src = fs.readFileSync('layouts/_default/ostinato-builder.html', 'utf8');
const m = src.match(/const KEYS = \{[\s\S]*?\n\};/);
if (!m) { console.error('FAIL: could not find KEYS block'); process.exit(1); }
const literal = m[0].replace(/^const KEYS = /, '').replace(/;\s*$/, '');
const KEYS = eval('(' + literal + ')');

function pitchValue(tok) {
  var mm = tok.match(/^(\^?)([A-Ga-g])([,']*)$/);
  if (!mm) throw new Error('unparseable token: ' + tok);
  var acc = mm[1] === '^' ? 1 : 0, letter = mm[2], marks = mm[3];
  var letterSemi = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[letter.toUpperCase()];
  var octave = (letter === letter.toLowerCase()) ? 5 : 4;
  for (var i=0;i<marks.length;i++) { if (marks[i] === "'") octave++; else if (marks[i] === ',') octave--; }
  return octave*12 + letterSemi + acc;
}

let failed = false;
Object.keys(KEYS).forEach(function(k){
  var pal = KEYS[k].palette;
  if (pal.length !== 10) { console.error('FAIL', k, 'expected 10 palette entries, got', pal.length); failed = true; return; }
  var pitches = pal.map(function(e){ return pitchValue(e[0]); });
  for (var i=1;i<pitches.length;i++) {
    if (pitches[i] <= pitches[i-1]) { console.error('FAIL', k, 'not strictly ascending at index', i, pal[i-1], pal[i]); failed = true; }
  }
  var labels = pal.map(function(e){ return e[1]; }).sort();
  var expected = ['do',"do'",'la','la,','mi','mi,','re','re,','so','so,'];
  if (JSON.stringify(labels) !== JSON.stringify(expected)) { console.error('FAIL', k, 'label set mismatch:', labels); failed = true; }
  console.log('PASS', k, pal.map(function(e){return e[1]+':'+e[0];}).join(' '));
});
process.exit(failed ? 1 : 0);
EOF
echo "exit: $?"
```
Expected: five `PASS` lines (one per key) and `exit: 0`.

- [ ] **Step 3: Build the site to confirm nothing broke**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`, no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Add low-octave palette options for re/mi/la in Ostinato Builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Add raw-ABC state fields and the bar-splitting/tiling helpers

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Adds the `rawAbc`/`rawMode` fields every part needs, and the two pure functions that turn hand-typed ABC text into tiled voice output. No UI yet (Task 4) and no score-generation wiring yet (Task 3) — this task only adds the building blocks and proves them correct in isolation.

- [ ] **Step 1: Add the two new fields to `addPart()`**

Find:
```js
function addPart(kind) {
  var bars = 1;
  var part = {
    id: 'p' + (++partSeq),
    kind: kind,
    instrumentId: kind === 'bordun' ? 'marimba' : 'clap',
    bars: bars,
    cells: makeCells(cellsPerBar() * bars),
    lyricsOn: false,
  };
  project.parts.push(part);
  if (kind === 'bordun') applyBordunPreset(part, 'simple');
  renderApp();
}
```

Replace with:
```js
function addPart(kind) {
  var bars = 1;
  var part = {
    id: 'p' + (++partSeq),
    kind: kind,
    instrumentId: kind === 'bordun' ? 'marimba' : 'clap',
    bars: bars,
    cells: makeCells(cellsPerBar() * bars),
    lyricsOn: false,
    rawAbc: null,
    rawMode: false,
  };
  project.parts.push(part);
  if (kind === 'bordun') applyBordunPreset(part, 'simple');
  renderApp();
}
```

- [ ] **Step 2: Add the same fields to `addPartSilent()`**

Find (near the bottom of the file, inside the `seed()` helper section):
```js
function addPartSilent(kind, instId, bars, fill) {
  var part = { id:'p'+(++partSeq), kind:kind, instrumentId:instId, bars:bars, cells:makeCells(cellsPerBar()*bars), lyricsOn:false };
  if (fill) fill(part);
  project.parts.push(part);
}
```

Replace with:
```js
function addPartSilent(kind, instId, bars, fill) {
  var part = { id:'p'+(++partSeq), kind:kind, instrumentId:instId, bars:bars, cells:makeCells(cellsPerBar()*bars), lyricsOn:false, rawAbc:null, rawMode:false };
  if (fill) fill(part);
  project.parts.push(part);
}
```

- [ ] **Step 3: Add `splitRawAbcBars` and `tileRawAbcBars`**

Find:
```js
function near(a, b)   { return Math.abs(a - b) < 0.001; }
function isBeamable(it){ return !it.isRest && it.beats < 1; }
```

Replace with:
```js
function near(a, b)   { return Math.abs(a - b) < 0.001; }
function isBeamable(it){ return !it.isRest && it.beats < 1; }

// Split raw ABC text into bar-strings on literal '|' boundaries. Drops an
// empty trailing chunk (text ending in '|'); trims whitespace so chunks can
// be re-joined cleanly by tileRawAbcBars.
function splitRawAbcBars(text) {
  var raw = (text || '').trim();
  if (!raw) return [];
  var chunks = raw.split('|').map(function(s){ return s.trim(); });
  if (chunks.length && chunks[chunks.length - 1] === '') chunks.pop();
  return chunks.filter(function(s){ return s.length > 0; });
}

// Tile a raw part's bars to targetBars, wrapping the same way flattenPart
// wraps cell-based bars (b % sourceBars), joining with ' |' the same way
// buildVoiceMusic does. `bars` must already be the result of splitRawAbcBars
// (already split/trimmed) — this function does not re-split.
function tileRawAbcBars(bars, targetBars) {
  if (!bars.length) return '';
  var out = [];
  for (var b = 0; b < targetBars; b++) out.push(bars[b % bars.length]);
  return out.join(' | ') + ' |]';
}
```

- [ ] **Step 4: Verify the new functions with a Node smoke-check**

This evaluates the *actual* inline `<script>` body from the real file inside a minimal sandboxed `vm` context (stubbing just enough of `document`/`ABCJS`/etc. that the file's own top-level init code — event listener wiring, `seed()` — doesn't throw), then calls the two new functions directly. This is a real regression check against the shipped code, not a reimplementation.

Run:
```bash
cd /Users/eric/meettheminmusic-blog
node <<'EOF'
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('layouts/_default/ostinato-builder.html', 'utf8');
const scriptBody = src.split(/<script>\n/)[1].split('</script>')[0];

function fakeEl() {
  return {
    value: '', checked: false, textContent: '', innerHTML: '', className: '',
    style: {}, options: [], disabled: false,
    appendChild(){}, removeChild(){}, addEventListener(){},
    classList: { add(){}, remove(){}, toggle(){} },
    createTextNode(){ return fakeEl(); },
    getContext(){ return { fillRect(){}, scale(){}, drawImage(){} }; },
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    setAttribute(){}, getAttribute(){ return null; },
    click(){}, parentElement: { clientWidth: 900 },
  };
}
const sandbox = {
  document: {
    getElementById(){ return fakeEl(); },
    createElement(){ return fakeEl(); },
    createTextNode(){ return fakeEl(); },
    addEventListener(){}, head: fakeEl(), body: { appendChild(){}, removeChild(){} },
  },
  window: {}, navigator: { clipboard: { writeText(){ return Promise.resolve(); } } },
  ABCJS: { renderAbc(){ return [{}]; } },
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
  console, setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat,
  confirm(){ return false; }, alert(){},
  XMLSerializer: function(){ this.serializeToString = function(){ return ''; }; },
  Image: function(){}, Blob: function(){},
};
sandbox.self = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(scriptBody, sandbox, { filename: 'ostinato-builder-inline.js' });

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error('FAIL:', msg, '-- got', a, 'expected', e); process.exitCode = 1; }
  else console.log('PASS:', msg);
}

assertEqual(sandbox.splitRawAbcBars('C2 D2 | E2 F2 | G2 A2'), ['C2 D2', 'E2 F2', 'G2 A2'], 'splits 3 bars, no trailing pipe');
assertEqual(sandbox.splitRawAbcBars('C2 D2 | E2 F2 |'), ['C2 D2', 'E2 F2'], 'drops empty trailing chunk after final |');
assertEqual(sandbox.splitRawAbcBars('  z4  '), ['z4'], 'single bar, trims whitespace');
assertEqual(sandbox.splitRawAbcBars(''), [], 'empty text -> no bars');
assertEqual(sandbox.splitRawAbcBars('   '), [], 'whitespace-only text -> no bars');

const bars2 = sandbox.splitRawAbcBars('C2 D2 | E2 F2');
assertEqual(sandbox.tileRawAbcBars(bars2, 2), 'C2 D2 | E2 F2 |]', 'tile exact length, terminates with |]');
assertEqual(sandbox.tileRawAbcBars(bars2, 4), 'C2 D2 | E2 F2 | C2 D2 | E2 F2 |]', 'tile double length wraps with modulo');
assertEqual(sandbox.tileRawAbcBars(bars2, 3), 'C2 D2 | E2 F2 | C2 D2 |]', 'tile non-multiple length (matches flattenPart b % sourceBars wraparound)');
assertEqual(sandbox.tileRawAbcBars([], 4), '', 'no bars -> empty string');

process.exit(process.exitCode || 0);
EOF
echo "exit: $?"
```
Expected: nine `PASS` lines and `exit: 0`.

- [ ] **Step 5: Build the site to confirm nothing broke**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Add rawAbc/rawMode part fields and bar split/tile helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Wire raw-ABC parts into score generation

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Makes `partHasContent`, `generateScoreABC`, and `generatePartABC` use a part's raw text (tiled to the target bar count) instead of the cell grid whenever `part.rawMode` is true. No UI to trigger this yet (Task 4) — after this task, a part manually flipped to `rawMode:true` in the console would render correctly.

- [ ] **Step 1: Update `partHasContent`**

Find:
```js
function partHasContent(part) { return part.cells.some(function(c){ return c != null; }); }
function anyContent() { return project.parts.some(partHasContent); }
```

Replace with:
```js
function partHasContent(part) {
  if (part.rawMode) return splitRawAbcBars(part.rawAbc).length > 0;
  return part.cells.some(function(c){ return c != null; });
}
function anyContent() { return project.parts.some(partHasContent); }
```

- [ ] **Step 2: Update `generateScoreABC`**

Find:
```js
  var anyLyrics = showLyricsGlobal && parts.some(function(p){
    return p.lyricsOn && p.cells.some(function(c){ return c && c.lyric && c.lyric.trim(); });
  });
  if (anyLyrics) hdr += lyricFontDirective();

  parts.forEach(function(p,i){ hdr += voiceHeader(p, vids[i]) + '\n'; });
  hdr += 'K:C\n';

  var body = '';
  parts.forEach(function(p,i){
    var items = flattenPart(p, Lbars);
    body += 'V:' + vids[i] + '\n';
    body += voiceMidi(p);
    body += buildVoiceMusic(items, bpb) + '\n';
    var showThis = showLyricsGlobal && p.lyricsOn && items.some(function(it){ return it.lyric && it.lyric.trim(); });
    if (showThis) body += 'w: ' + buildVoiceLyrics(items, bpb) + '\n';
  });
```

Replace with:
```js
  var anyLyrics = showLyricsGlobal && parts.some(function(p){
    return !p.rawMode && p.lyricsOn && p.cells.some(function(c){ return c && c.lyric && c.lyric.trim(); });
  });
  if (anyLyrics) hdr += lyricFontDirective();

  parts.forEach(function(p,i){ hdr += voiceHeader(p, vids[i]) + '\n'; });
  hdr += 'K:C\n';

  var body = '';
  parts.forEach(function(p,i){
    body += 'V:' + vids[i] + '\n';
    body += voiceMidi(p);
    if (p.rawMode) {
      body += tileRawAbcBars(splitRawAbcBars(p.rawAbc), Lbars) + '\n';
      return;
    }
    var items = flattenPart(p, Lbars);
    body += buildVoiceMusic(items, bpb) + '\n';
    var showThis = showLyricsGlobal && p.lyricsOn && items.some(function(it){ return it.lyric && it.lyric.trim(); });
    if (showThis) body += 'w: ' + buildVoiceLyrics(items, bpb) + '\n';
  });
```

- [ ] **Step 3: Update `generatePartABC`**

Find:
```js
function generatePartABC(part) {
  if (!partHasContent(part)) return null;
  var bpb = beatsPerBar();
  var items = flattenPart(part, part.bars);
  var showLyrics = document.getElementById('vis-lyrics').checked && part.lyricsOn &&
                   items.some(function(it){ return it.lyric && it.lyric.trim(); });
  var hdr = 'X:1\nT:\nM:' + project.meter + '\nL:' + abcLen() + '\n';
  if (showLyrics) hdr += lyricFontDirective();
  hdr += voiceHeader(part, 'V1', false) + '\nK:C\n';
  var body = 'V:V1\n' + voiceMidi(part) + buildVoiceMusic(items, bpb) + '\n';
  if (showLyrics) body += 'w: ' + buildVoiceLyrics(items, bpb) + '\n';
  return hdr + body;
}
```

Replace with:
```js
function generatePartABC(part) {
  if (!partHasContent(part)) return null;
  var bpb = beatsPerBar();
  var hdr = 'X:1\nT:\nM:' + project.meter + '\nL:' + abcLen() + '\n';
  if (part.rawMode) {
    hdr += voiceHeader(part, 'V1', false) + '\nK:C\n';
    var rawBars = splitRawAbcBars(part.rawAbc);
    return hdr + 'V:V1\n' + voiceMidi(part) + tileRawAbcBars(rawBars, rawBars.length) + '\n';
  }
  var items = flattenPart(part, part.bars);
  var showLyrics = document.getElementById('vis-lyrics').checked && part.lyricsOn &&
                   items.some(function(it){ return it.lyric && it.lyric.trim(); });
  if (showLyrics) hdr += lyricFontDirective();
  hdr += voiceHeader(part, 'V1', false) + '\nK:C\n';
  var body = 'V:V1\n' + voiceMidi(part) + buildVoiceMusic(items, bpb) + '\n';
  if (showLyrics) body += 'w: ' + buildVoiceLyrics(items, bpb) + '\n';
  return hdr + body;
}
```

(`tileRawAbcBars(rawBars, rawBars.length)` just joins the part's own bars in order with the right `|]` terminator — no wraparound needed since the target length equals the source length. Reuses the Task 2 function instead of writing a second joiner.)

- [ ] **Step 4: Build the site to confirm nothing broke**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Route raw-ABC parts through score/part ABC generation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Raw-ABC editor UI (the "Edit as ABC" toggle)

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Adds the per-part toggle button, the textarea that replaces the grid in raw mode, and hides the bars stepper / bordun preset dropdown / lyrics checkbox while a part is in raw mode (per the approved spec).

- [ ] **Step 1: Add the toggle button, and hide the preset dropdown in raw mode**

Find (inside `renderApp()`, right after the instrument-select block):
```js
    instSel.addEventListener('change', function(){ part.instrumentId = this.value; renderApp(); });
    instWrap.appendChild(instSel);
    head.appendChild(instWrap);

    // Bordun preset
    if (part.kind === 'bordun') {
```

Replace with:
```js
    instSel.addEventListener('change', function(){ part.instrumentId = this.value; renderApp(); });
    instWrap.appendChild(instSel);
    head.appendChild(instWrap);

    // Raw ABC editor toggle
    var rawToggle = document.createElement('button');
    rawToggle.className = 'ob-btn ob-btn-sm' + (part.rawMode ? ' is-active' : '');
    rawToggle.textContent = 'Edit as ABC';
    rawToggle.title = "Hand-edit this part's ABC notation, e.g. to change a note's octave";
    rawToggle.addEventListener('click', function(){
      if (!part.rawMode) {
        if (part.rawAbc == null) part.rawAbc = buildVoiceMusic(flattenPart(part, part.bars), beatsPerBar());
        part.rawMode = true;
        part.bars = Math.max(1, splitRawAbcBars(part.rawAbc).length);
      } else {
        part.rawMode = false;
        part.bars = part.cells.length / cellsPerBar();
      }
      renderApp();
    });
    head.appendChild(rawToggle);

    // Bordun preset (hidden in raw-ABC mode — the preset applies to the grid, not raw text)
    if (part.kind === 'bordun' && !part.rawMode) {
```

- [ ] **Step 2: Hide the bars stepper in raw mode, show a readout instead**

Find:
```js
    // Bars stepper
    var barsWrap = document.createElement('span'); barsWrap.className = 'part-ctl';
    var barsLabel = document.createElement('span'); barsLabel.textContent = 'Bars';
    var stepper = document.createElement('span'); stepper.className = 'stepper';
    var minus = document.createElement('button'); minus.textContent = '−';
    minus.addEventListener('click', function(){ setPartBars(part, part.bars - 1); });
    var val = document.createElement('span'); val.className='val'; val.textContent = part.bars;
    var plus = document.createElement('button'); plus.textContent = '+';
    plus.addEventListener('click', function(){ setPartBars(part, part.bars + 1); });
    stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
    barsWrap.appendChild(barsLabel); barsWrap.appendChild(stepper);
    head.appendChild(barsWrap);
```

Replace with:
```js
    // Bars stepper (hidden in raw-ABC mode — bar count is inferred from the typed | marks)
    if (!part.rawMode) {
      var barsWrap = document.createElement('span'); barsWrap.className = 'part-ctl';
      var barsLabel = document.createElement('span'); barsLabel.textContent = 'Bars';
      var stepper = document.createElement('span'); stepper.className = 'stepper';
      var minus = document.createElement('button'); minus.textContent = '−';
      minus.addEventListener('click', function(){ setPartBars(part, part.bars - 1); });
      var val = document.createElement('span'); val.className='val'; val.textContent = part.bars;
      var plus = document.createElement('button'); plus.textContent = '+';
      plus.addEventListener('click', function(){ setPartBars(part, part.bars + 1); });
      stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
      barsWrap.appendChild(barsLabel); barsWrap.appendChild(stepper);
      head.appendChild(barsWrap);
    } else {
      var barsReadout = document.createElement('span'); barsReadout.className = 'part-ctl';
      barsReadout.textContent = 'Bars: ' + part.bars + ' (from your ABC)';
      head.appendChild(barsReadout);
    }
```

- [ ] **Step 3: Hide the lyrics toggle in raw mode**

Find:
```js
    // Lyrics toggle
    var lyrLabel = document.createElement('label'); lyrLabel.className = 'vis-check';
    var lyrCb = document.createElement('input'); lyrCb.type='checkbox'; lyrCb.checked = part.lyricsOn;
    lyrCb.addEventListener('change', function(){ part.lyricsOn = this.checked; renderApp(); });
    lyrLabel.appendChild(lyrCb); lyrLabel.appendChild(document.createTextNode(' Lyrics'));
    head.appendChild(lyrLabel);
```

Replace with:
```js
    // Lyrics toggle (raw-ABC parts have no per-cell lyric data to drive this)
    if (!part.rawMode) {
      var lyrLabel = document.createElement('label'); lyrLabel.className = 'vis-check';
      var lyrCb = document.createElement('input'); lyrCb.type='checkbox'; lyrCb.checked = part.lyricsOn;
      lyrCb.addEventListener('change', function(){ part.lyricsOn = this.checked; renderApp(); });
      lyrLabel.appendChild(lyrCb); lyrLabel.appendChild(document.createTextNode(' Lyrics'));
      head.appendChild(lyrLabel);
    }
```

- [ ] **Step 4: Swap the grid for the raw-ABC textarea when in raw mode**

Find:
```js
    card.appendChild(head);

    // Grid
    card.appendChild(buildGrid(part));
    document.getElementById('parts-host').appendChild(card);
```

Replace with:
```js
    card.appendChild(head);

    // Grid (or raw ABC editor, if this part is in raw mode)
    card.appendChild(part.rawMode ? buildRawAbcEditor(part) : buildGrid(part));
    document.getElementById('parts-host').appendChild(card);
```

- [ ] **Step 5: Add the `buildRawAbcEditor` function**

Find:
```js
function showToast(msg) {
```

Replace with:
```js
function buildRawAbcEditor(part) {
  var wrap = document.createElement('div'); wrap.className = 'raw-abc-editor';
  var ta = document.createElement('textarea');
  ta.className = 'raw-abc-textarea';
  ta.spellcheck = false;
  ta.rows = 3;
  ta.value = part.rawAbc || '';
  ta.addEventListener('input', function(){
    part.rawAbc = this.value;
    part.bars = Math.max(1, splitRawAbcBars(this.value).length);
    scheduleRender();
  });
  wrap.appendChild(ta);
  var hint = document.createElement('div'); hint.className = 'raw-abc-hint';
  hint.textContent = 'Hand-edit the ABC for this part. Bar count is inferred from the | marks you type.';
  wrap.appendChild(hint);
  return wrap;
}

function showToast(msg) {
```

- [ ] **Step 6: Add CSS for the toggle's active state and the textarea**

Find (near the end of the `<style>` block):
```css
@media (max-width: 600px) {
  .main { padding: 12px 12px 150px; gap: 12px; }
  .grid-col { width: 44px; }
}
</style>
```

Replace with:
```css
.ob-btn.is-active { background: var(--ob-accent); border-color: var(--ob-accent); color: #fff; }
.raw-abc-editor { margin-top: 8px; }
.raw-abc-textarea {
  width: 100%;
  min-height: 72px;
  padding: 8px 10px;
  border: 1px solid var(--ob-border);
  border-radius: var(--ob-radius);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.8rem;
  color: var(--ob-text);
  background: var(--ob-bg);
  resize: vertical;
}
.raw-abc-textarea:focus { outline: 2px solid var(--ob-accent); outline-offset: 1px; border-color: var(--ob-accent); }
.raw-abc-hint { margin-top: 4px; font-size: 0.72rem; color: var(--ob-text-muted); }

@media (max-width: 600px) {
  .main { padding: 12px 12px 150px; gap: 12px; }
  .grid-col { width: 44px; }
}
</style>
```

- [ ] **Step 7: Build the site**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 8: Browser check**

Start the dev server and open the Ostinato Builder page (`preview_start` with the Hugo dev server config, then navigate to `/ostinato-builder/`). Click "Edit as ABC" on the seeded marimba (bordun) part. Confirm:
- A textarea appears pre-filled with ABC text (not empty), the grid disappears, the "Preset"/"Bars" stepper/"Lyrics" checkbox disappear and a "Bars: N (from your ABC)" readout appears instead.
- Editing a pitch token in the textarea (e.g. change `C` to `C,`) updates the rendered score preview after ~130ms.
- Clicking "Edit as ABC" again returns to the grid view with the original cell pattern intact.
- No console errors (`read_console_messages`).

- [ ] **Step 9: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Add raw-ABC editor toggle and textarea UI to Ostinato Builder parts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Autosave draft + restore-on-load

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Adds `serializeProject`/`loadProjectData`, the `mtim_ostinato_draft` autosave (hooked into the existing `scheduleRender` chokepoint), and the confirm-to-restore prompt on page load — same UX Visual Schedule Builder already uses for its draft.

- [ ] **Step 1: Add the persistence functions**

Find:
```js
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

// ── UI: build the parts + grid ─────────────────────────────
```

Replace with:
```js
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

// ── Persistence (save/load) ─────────────────────────────────
var DRAFT_KEY = 'mtim_ostinato_draft';

function serializeProject() { return JSON.parse(JSON.stringify(project)); }

function loadProjectData(data) {
  stopPlayback();
  project = data;
  partSeq = project.parts.reduce(function(max, p){
    var n = parseInt(String(p.id).replace('p', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  document.getElementById('key-sel').value = project.key;
  document.getElementById('meter-sel').value = project.meter;
  document.getElementById('subdiv-sel').value = String(project.subdiv);
  document.getElementById('tempo-slider').value = project.tempo;
  document.getElementById('tempo-display').textContent = project.tempo;
  renderApp();
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeProject())); } catch (e) {}
}

function restoreDraftIfAvailable() {
  var raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  var data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data || !Array.isArray(data.parts) || !data.parts.length) return false;
  if (!confirm('Restore your last unsaved ostinato?')) return false;
  loadProjectData(data);
  return true;
}

// ── UI: build the parts + grid ─────────────────────────────
```

- [ ] **Step 2: Hook autosave into the existing render debounce**

Find:
```js
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderScore, 130); }
```

Replace with:
```js
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(function(){ renderScore(); saveDraft(); }, 130); }
```

- [ ] **Step 3: Remove the internal `buildKeyOptions()` call from `seed()`**

Find:
```js
function seed() {
  buildKeyOptions();

  // Clap part (V1)
```

Replace with:
```js
function seed() {
  // Clap part (V1)
```

(`buildKeyOptions()` is hoisted to the top-level init sequence in the next step, so it always runs exactly once, whether or not `seed()` itself runs.)

- [ ] **Step 4: Update the init sequence to try restoring a draft first**

Find:
```js
applyVisibilityOverrides();
seed();
</script>
```

Replace with:
```js
buildKeyOptions();
applyVisibilityOverrides();
if (!restoreDraftIfAvailable()) seed();
</script>
```

- [ ] **Step 5: Build the site**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 6: Browser check**

Open `/ostinato-builder/`. Add a percussion part and change the tempo. Reload the page. Confirm a browser `confirm()` dialog appears asking "Restore your last unsaved ostinato?" — accept it and confirm the added part and tempo change are back. Reload again and decline the dialog — confirm the seeded starter arrangement loads instead (not a blank tool).

- [ ] **Step 7: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Autosave Ostinato Builder work as a draft, restore on reload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Named save/load library

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Adds the "Save ostinato" / "Load ▾" / delete controls to the action toolbar, backed by `mtim_ostinato_library` in `localStorage` — the same array-of-named-items pattern the Chord Diagram Generator already uses for `mtim_chord_library`.

- [ ] **Step 1: Add the toolbar controls**

Find:
```html
  <button id="copy-abc-btn" class="ob-btn">&#128203; Copy ABC</button>
</div>
```

Replace with:
```html
  <button id="copy-abc-btn" class="ob-btn">&#128203; Copy ABC</button>
  <button id="save-ostinato-btn" class="ob-btn">&#128190; Save ostinato</button>
  <select id="load-ostinato-sel"><option value="">Load ostinato…</option></select>
  <button id="delete-ostinato-btn" class="ob-btn ob-btn-danger ob-btn-sm" title="Delete the selected saved ostinato" disabled>&#128465;</button>
</div>
```

- [ ] **Step 2: Add the library functions**

Find:
```js
function restoreDraftIfAvailable() {
  var raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  var data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data || !Array.isArray(data.parts) || !data.parts.length) return false;
  if (!confirm('Restore your last unsaved ostinato?')) return false;
  loadProjectData(data);
  return true;
}

// ── UI: build the parts + grid ─────────────────────────────
```

Replace with:
```js
function restoreDraftIfAvailable() {
  var raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  var data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data || !Array.isArray(data.parts) || !data.parts.length) return false;
  if (!confirm('Restore your last unsaved ostinato?')) return false;
  loadProjectData(data);
  return true;
}

var LIBRARY_KEY = 'mtim_ostinato_library';

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); } catch (e) { return []; }
}
function saveLibrary(list) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); } catch (e) {}
}
function populateLibrarySelect() {
  var sel = document.getElementById('load-ostinato-sel');
  var current = sel.value;
  sel.innerHTML = '';
  sel.appendChild(new Option('Load ostinato…', ''));
  loadLibrary().forEach(function(item){ sel.appendChild(new Option(item.name, item.id)); });
  sel.value = current;
  document.getElementById('delete-ostinato-btn').disabled = !sel.value;
}
function saveToLibrary() {
  var name = prompt('Name this ostinato:');
  if (!name) return;
  var list = loadLibrary();
  var existing = list.find(function(item){ return item.name === name; });
  if (existing) {
    if (!confirm('"' + name + '" already exists. Overwrite it?')) return;
    existing.project = serializeProject();
    existing.savedAt = new Date().toISOString();
  } else {
    existing = { id: 'o' + Date.now(), name: name, savedAt: new Date().toISOString(), project: serializeProject() };
    list.push(existing);
  }
  saveLibrary(list);
  populateLibrarySelect();
  document.getElementById('load-ostinato-sel').value = existing.id;
  document.getElementById('delete-ostinato-btn').disabled = false;
  showToast('Saved "' + name + '".');
}
function loadFromLibrary(id) {
  var item = loadLibrary().find(function(i){ return i.id === id; });
  if (!item) return;
  loadProjectData(item.project);
  showToast('Loaded "' + item.name + '".');
}
function deleteFromLibrary(id) {
  var list = loadLibrary();
  var item = list.find(function(i){ return i.id === id; });
  if (!item) return;
  if (!confirm('Delete "' + item.name + '"? This can\'t be undone.')) return;
  saveLibrary(list.filter(function(i){ return i.id !== id; }));
  populateLibrarySelect();
  showToast('Deleted "' + item.name + '".');
}

// ── UI: build the parts + grid ─────────────────────────────
```

- [ ] **Step 3: Wire the toolbar controls and populate the list on load**

Find:
```js
buildKeyOptions();
applyVisibilityOverrides();
if (!restoreDraftIfAvailable()) seed();
</script>
```

Replace with:
```js
document.getElementById('save-ostinato-btn').addEventListener('click', saveToLibrary);
document.getElementById('load-ostinato-sel').addEventListener('change', function(){
  document.getElementById('delete-ostinato-btn').disabled = !this.value;
  if (this.value) loadFromLibrary(this.value);
});
document.getElementById('delete-ostinato-btn').addEventListener('click', function(){
  var sel = document.getElementById('load-ostinato-sel');
  if (sel.value) deleteFromLibrary(sel.value);
});

buildKeyOptions();
applyVisibilityOverrides();
populateLibrarySelect();
if (!restoreDraftIfAvailable()) seed();
</script>
```

- [ ] **Step 4: Add minimal `<select>` styling for the toolbar**

Find:
```css
.ob-btn.is-active { background: var(--ob-accent); border-color: var(--ob-accent); color: #fff; }
```

Replace with:
```css
.ob-btn.is-active { background: var(--ob-accent); border-color: var(--ob-accent); color: #fff; }
.action-toolbar select {
  border: 1px solid var(--ob-border);
  border-radius: var(--ob-radius);
  padding: 6px 10px;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--ob-text);
  background: var(--ob-card);
  cursor: pointer;
}
```

- [ ] **Step 5: Build the site**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 6: Browser check**

Open `/ostinato-builder/`. Click "Save ostinato", enter a name (e.g. "Test 1"), confirm a toast appears and the name shows up in the "Load ostinato…" dropdown with the delete button now enabled. Change something (e.g. add a part), then pick "Test 1" from the dropdown — confirm the tool reverts to the saved state (the added part disappears). Save a second ostinato under the same name and confirm the overwrite `confirm()` dialog appears. Delete one via the trash button and confirm it disappears from the dropdown.

- [ ] **Step 7: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Add named save/load library to Ostinato Builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: File export/import

**Files:**
- Modify: `layouts/_default/ostinato-builder.html`

Adds "Export file" / "Import file" so a teacher can move an ostinato to a different computer, or hand one to another teacher — the library and draft are both browser-local only.

- [ ] **Step 1: Add the toolbar controls**

Find:
```html
  <button id="delete-ostinato-btn" class="ob-btn ob-btn-danger ob-btn-sm" title="Delete the selected saved ostinato" disabled>&#128465;</button>
</div>
```

Replace with:
```html
  <button id="delete-ostinato-btn" class="ob-btn ob-btn-danger ob-btn-sm" title="Delete the selected saved ostinato" disabled>&#128465;</button>
  <button id="export-file-btn" class="ob-btn">&#8595; Export file</button>
  <button id="import-file-btn" class="ob-btn">&#8593; Import file</button>
  <input type="file" id="import-file-input" accept=".json" style="display:none;">
</div>
```

- [ ] **Step 2: Add the export/import functions**

Find:
```js
function deleteFromLibrary(id) {
  var list = loadLibrary();
  var item = list.find(function(i){ return i.id === id; });
  if (!item) return;
  if (!confirm('Delete "' + item.name + '"? This can\'t be undone.')) return;
  saveLibrary(list.filter(function(i){ return i.id !== id; }));
  populateLibrarySelect();
  showToast('Deleted "' + item.name + '".');
}

// ── UI: build the parts + grid ─────────────────────────────
```

Replace with:
```js
function deleteFromLibrary(id) {
  var list = loadLibrary();
  var item = list.find(function(i){ return i.id === id; });
  if (!item) return;
  if (!confirm('Delete "' + item.name + '"? This can\'t be undone.')) return;
  saveLibrary(list.filter(function(i){ return i.id !== id; }));
  populateLibrarySelect();
  showToast('Deleted "' + item.name + '".');
}

function exportProjectFile() {
  if (!anyContent()) { showToast('Nothing to export yet!'); return; }
  var data = { name: 'ostinato', savedAt: new Date().toISOString(), project: serializeProject() };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ostinato.json'; a.click();
  showToast('Ostinato file saved!');
}
function importProjectFile(file) {
  var reader = new FileReader();
  reader.onload = function(){
    var data;
    try { data = JSON.parse(reader.result); } catch (e) { showToast('That file is not a valid ostinato file.'); return; }
    if (!data || !data.project || !Array.isArray(data.project.parts)) { showToast('That file is not a valid ostinato file.'); return; }
    loadProjectData(data.project);
    showToast('Loaded "' + (data.name || 'ostinato') + '" from file.');
  };
  reader.onerror = function(){ showToast('Could not read that file.'); };
  reader.readAsText(file);
}

// ── UI: build the parts + grid ─────────────────────────────
```

- [ ] **Step 3: Wire the toolbar controls**

Find:
```js
document.getElementById('delete-ostinato-btn').addEventListener('click', function(){
  var sel = document.getElementById('load-ostinato-sel');
  if (sel.value) deleteFromLibrary(sel.value);
});

buildKeyOptions();
```

Replace with:
```js
document.getElementById('delete-ostinato-btn').addEventListener('click', function(){
  var sel = document.getElementById('load-ostinato-sel');
  if (sel.value) deleteFromLibrary(sel.value);
});
document.getElementById('export-file-btn').addEventListener('click', exportProjectFile);
document.getElementById('import-file-btn').addEventListener('click', function(){ document.getElementById('import-file-input').click(); });
document.getElementById('import-file-input').addEventListener('change', function(){
  if (this.files && this.files[0]) importProjectFile(this.files[0]);
  this.value = '';
});

buildKeyOptions();
```

- [ ] **Step 4: Build the site**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 5: Browser check**

Open `/ostinato-builder/`. Click "Export file" — confirm an `ostinato.json` file downloads and a toast appears. Change the arrangement (e.g. remove a part), then click "Import file" and select the file just downloaded — confirm the tool reverts to the exported state (the removed part is back) and a toast names the loaded file. Try importing a non-JSON or malformed file and confirm the "not a valid ostinato file" toast appears instead of a crash (check console for no uncaught errors).

- [ ] **Step 6: Commit**

```bash
cd /Users/eric/meettheminmusic-blog
git add layouts/_default/ostinato-builder.html
git commit -m "Add file export/import to Ostinato Builder for cross-device reuse

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Integrated verification pass

**Files:** none modified — this task only verifies Tasks 1–7 together.

- [ ] **Step 1: Full build**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet && echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 2: Combined browser walkthrough**

Open `/ostinato-builder/` fresh (clear `localStorage` for the site first, or use a private window, so there's no leftover draft/library from earlier testing). Do all of the following in one session and confirm no console errors at any point:

1. Add a bordun part. In a bordun cell's dropdown, confirm the new low-octave options (`re,`, `mi,`, `la,`) appear alongside the existing entries, in ascending pitch order. Pick a `la,` note and confirm it renders visibly lower on the staff than a plain `la`.
2. Switch key to F, then back to C — confirm the palette dropdown repopulates without duplicate or missing entries (spot-check the option count is still 10 + the 3 fixed options `·`/rest/chord = 13 total `<option>`s per bordun cell).
3. Add a percussion part, toggle "Edit as ABC" on it, hand-edit a note, toggle back off, confirm the grid reflects the pre-edit pattern (not the raw edit).
4. Play the full arrangement (Play button) and confirm audio starts and the raw-ABC part's pitch/rhythm plays as edited.
5. Save the current arrangement under a name, refresh the page, decline the draft-restore prompt (to prove it's not just showing the autosaved copy), then load the saved name from the "Load ostinato…" dropdown and confirm the arrangement (including the raw-ABC part) comes back correctly.
6. Export the arrangement to a file, clear all parts ("Remove all"), import the file back, confirm full restoration.

- [ ] **Step 3: No commit needed** (verification only; report any failures found back before considering the plan complete rather than committing broken state).
