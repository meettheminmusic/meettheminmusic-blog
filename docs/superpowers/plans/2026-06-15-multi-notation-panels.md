# Multiple notation panels per song — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a song entry contain multiple notation panels stacked down the page, each with its own heading, score(s) (tabs only when 2+), and optional Music Braille — without changing how legacy entries render.

**Architecture:** Extract today's CASE A/B/C notation rendering from `layouts/songs/single.html` into one reusable partial `layouts/partials/notation-panel.html`, parameterized by a unique id suffix. `single.html` loads assets once, then either loops a new `panels` frontmatter array (one `<section>` per panel) or normalizes the legacy fields into a single virtual panel and calls the partial once. Legacy entries pass `suffix = <uid>`, reproducing today's element IDs exactly.

**Tech Stack:** Hugo (Go templates), vanilla JS (ABCJS coordinator, braille.js, lyrics.js), Sveltia CMS (config.yml). No Node/test framework — verification is build + generated-HTML comparison + browser preview.

---

## Background facts (read before starting)

- `layouts/songs/single.html` currently renders one notation block with these cases:
  - **A1** multi-score + braille: fused tab strip (score tabs + Braille ASCII + Braille dots).
  - **A2** single score + braille: single notation tab + braille tabs.
  - **B** notation only: tabbed if 2+ scores; plain single player otherwise.
  - **C** braille only: standalone braille tabs.
- Element ID schemes that MUST be preserved for legacy (suffix = `uid` = `.File.UniqueID`):
  - A1 / B-multi: `abc-tab-{sfx}-{i}`, `abc-panel-{sfx}-{i}`, `abcplayer-{sfx}-{i}`, `abc-data-abcplayer-{sfx}-{i}`, `score-abcplayer-{sfx}-{i}`, `controls-abcplayer-{sfx}-{i}`.
  - A2: `abc-single-tab-{sfx}`, `abc-single-panel-{sfx}`, `abcplayer-{sfx}` (+ `abc-data-`/`score-`/`controls-` variants).
  - B-single: `abcplayer-{sfx}` (plain, no `.abc-tabs` wrapper).
  - Braille (A1/A2/C): `braille-src-{sfx}`, `braille-tab-ascii-{sfx}`, `braille-tab-dots-{sfx}`, `braille-ascii-{sfx}`, `braille-dots-{sfx}`, `braille-ascii-pre-{sfx}`, `braille-dots-pre-{sfx}`.
- `abc_scores` items use keys: `label`, `notation`, `image`, `tempo`.
- The page keeps ONE outer `<div class="song-notation-block">` (mobile ordering depends on it, style.css:638). Panels are `<section class="song-notation-panel">` nested inside it.
- The generic `.abc-tabs` tab-switch JS is scoped per `.abc-tabs` container, so it can be emitted once per page.
- Allowed cosmetic differences in legacy output (do NOT fail the gate on these): relocation of the hidden `braille-src` script into the block, and de-duplication of the identical tab-switch IIFE to a single copy. The **gate** is: identical sorted element-ID set and identical ABC/braille payloads per legacy page, plus identical browser behavior.

---

## Task 1: Capture the legacy baseline (the test fixture)

**Files:** none modified. Builds into `/tmp` only.

- [ ] **Step 1: Confirm clean working tree on the pre-change commit**

Run: `cd /Users/eric/meettheminmusic-blog && git status --short`
Expected: no output (clean).

- [ ] **Step 2: Build the current site as the baseline**

Run:
```bash
cd /Users/eric/meettheminmusic-blog
rm -rf /tmp/mtim-baseline && hugo --gc --quiet -d /tmp/mtim-baseline
echo "exit: $?"
```
Expected: `exit: 0` and `/tmp/mtim-baseline/songs/` populated.

- [ ] **Step 3: Snapshot the legacy fidelity signature for representative pages**

Run:
```bash
cd /Users/eric/meettheminmusic-blog
mkdir -p /tmp/mtim-sig
for p in go-round-the-mountain haul-away-joe a-qua-qua-de-la-omar a-ram-sam-sam ally-bally; do
  f=/tmp/mtim-baseline/songs/$p/index.html
  grep -o 'id="[^"]*"' "$f" | sort > /tmp/mtim-sig/$p.ids.base
  # extract notation + braille payloads (order-independent)
  python3 - "$f" "/tmp/mtim-sig/$p.payload.base" <<'PY'
import sys,re
html=open(sys.argv[1]).read()
blocks=re.findall(r'<script type="text/abc(?:-sanitized)?"[^>]*>(.*?)</script>', html, re.S)
open(sys.argv[2],'w').write('\n--PAYLOAD--\n'.join(sorted(blocks)))
PY
done
echo "baseline signatures written:"; ls /tmp/mtim-sig
```
Expected: ten files (`*.ids.base`, `*.payload.base`) listed.

- [ ] **Step 4: No commit** (build artifacts only; `/public` and `/tmp` are not tracked).

---

## Task 2: Create the `notation-panel.html` partial

**Files:**
- Create: `layouts/partials/notation-panel.html`

This partial renders ONLY the inner notation/braille content for one panel. It does NOT emit the outer `.song-notation-block`, the `<section>`/heading, the lyrics mount, the asset `<link>`/`<script>` tags, or the generic tab-switch JS — those belong to `single.html`.

- [ ] **Step 1: Write the partial**

Create `layouts/partials/notation-panel.html` with this exact content:

```go-html-template
{{- /* Renders one notation panel's inner content.
       Params: page, suffix, scores (slice of {label,notation,image,tempo}),
               sanitizedAbc (string), defaultTempo (int). */ -}}
{{- $page    := .page -}}
{{- $uid     := .suffix -}}
{{- $scores  := .scores -}}
{{- $abc     := .sanitizedAbc -}}
{{- $defTempo := .defaultTempo -}}
{{- $title   := $page.Title -}}
{{- $hasNote := gt (len $scores) 0 -}}

{{- if $abc -}}
<script type="text/abc-sanitized" id="braille-src-{{ $uid }}">{{ $abc | safeHTML }}</script>
{{- end -}}

{{- if and $hasNote $abc -}}

  {{- if gt (len $scores) 1 -}}
  {{- /* A1: multiple scores + braille */ -}}
  <div class="abc-tabs">
    <div class="abc-tabs-label" aria-hidden="true">Notation</div>
    <div class="abc-tabs-nav" role="tablist" aria-label="Score and braille views">
      {{- range $i, $score := $scores -}}
        <button class="abc-tab-btn{{ if eq $i 0 }} is-active{{ end }}" role="tab"
                aria-selected="{{ if eq $i 0 }}true{{ else }}false{{ end }}"
                aria-controls="abc-panel-{{ $uid }}-{{ $i }}" id="abc-tab-{{ $uid }}-{{ $i }}">
          {{- $score.label | default (printf "Score %d" (add $i 1)) -}}
        </button>
      {{- end -}}
      <button class="abc-tab-btn" role="tab" aria-selected="false"
              aria-controls="braille-ascii-{{ $uid }}" id="braille-tab-ascii-{{ $uid }}">Braille ASCII</button>
      <button class="abc-tab-btn" role="tab" aria-selected="false"
              aria-controls="braille-dots-{{ $uid }}" id="braille-tab-dots-{{ $uid }}">Braille dots</button>
    </div>
    {{- range $i, $score := $scores -}}
      {{- $abcId := printf "abcplayer-%s-%d" $uid $i -}}
      {{- $abcTempo := int ($score.tempo | default $defTempo) -}}
      <div class="abc-tab-panel{{ if eq $i 0 }} is-active{{ end }}" role="tabpanel"
           id="abc-panel-{{ $uid }}-{{ $i }}" aria-labelledby="abc-tab-{{ $uid }}-{{ $i }}">
        <script type="text/abc" id="abc-data-{{ $abcId }}">{{ $score.notation | safeHTML }}</script>
        <div class="abc-player" id="{{ $abcId }}" data-cursor="true">
          {{- with $score.image -}}<figure class="abc-player-fallback"><img src="{{ . }}" alt="{{ $score.label | default $title }} notation"></figure>{{- end -}}
          <div class="abc-player-score" id="score-{{ $abcId }}"></div>
          <div class="abc-player-controls" id="controls-{{ $abcId }}"></div>
        </div>
        <script>
        window.AbcPlayerCoordinator.registerPlayer({ id: '{{ $abcId }}', abcElementId: 'score-{{ $abcId }}', controlsElementId: 'controls-{{ $abcId }}', defaultTempo: {{ $abcTempo }} });
        </script>
      </div>
    {{- end -}}
    <div class="abc-tab-panel" role="tabpanel" id="braille-ascii-{{ $uid }}" aria-labelledby="braille-tab-ascii-{{ $uid }}">
      <div class="braille-output"><pre class="ascii-out" aria-label="ASCII music braille" id="braille-ascii-pre-{{ $uid }}"></pre></div>
    </div>
    <div class="abc-tab-panel" role="tabpanel" id="braille-dots-{{ $uid }}" aria-labelledby="braille-tab-dots-{{ $uid }}">
      <div class="braille-output"><pre class="dots-out" aria-label="Music Braille dot notation" id="braille-dots-pre-{{ $uid }}"></pre></div>
    </div>
  </div>
  {{ partial "notation-braille-render.html" $uid }}

  {{- else -}}
  {{- /* A2: single score + braille */ -}}
  {{- $score := index $scores 0 -}}
  {{- $abcId := printf "abcplayer-%s" $uid -}}
  {{- $tabLabel := $score.label | default "Notation" -}}
  {{- $abcTempo := int ($score.tempo | default $defTempo) -}}
  <div class="abc-tabs">
    <div class="abc-tabs-label" aria-hidden="true">Notation</div>
    <div class="abc-tabs-nav" role="tablist" aria-label="Score and braille views">
      <button class="abc-tab-btn is-active" role="tab" aria-selected="true"
              aria-controls="abc-single-panel-{{ $uid }}" id="abc-single-tab-{{ $uid }}">{{ $tabLabel }}</button>
      <button class="abc-tab-btn" role="tab" aria-selected="false"
              aria-controls="braille-ascii-{{ $uid }}" id="braille-tab-ascii-{{ $uid }}">Braille ASCII</button>
      <button class="abc-tab-btn" role="tab" aria-selected="false"
              aria-controls="braille-dots-{{ $uid }}" id="braille-tab-dots-{{ $uid }}">Braille dots</button>
    </div>
    <div class="abc-tab-panel is-active" role="tabpanel" id="abc-single-panel-{{ $uid }}" aria-labelledby="abc-single-tab-{{ $uid }}">
      <script type="text/abc" id="abc-data-{{ $abcId }}">{{ $score.notation | safeHTML }}</script>
      <div class="abc-player" id="{{ $abcId }}" data-cursor="true">
        {{- with $score.image -}}<figure class="abc-player-fallback"><img src="{{ . }}" alt="{{ $tabLabel }} notation"></figure>{{- end -}}
        <div class="abc-player-score" id="score-{{ $abcId }}"></div>
        <div class="abc-player-controls" id="controls-{{ $abcId }}"></div>
      </div>
      <script>
      window.AbcPlayerCoordinator.registerPlayer({ id: '{{ $abcId }}', abcElementId: 'score-{{ $abcId }}', controlsElementId: 'controls-{{ $abcId }}', defaultTempo: {{ $abcTempo }} });
      </script>
    </div>
    <div class="abc-tab-panel" role="tabpanel" id="braille-ascii-{{ $uid }}" aria-labelledby="braille-tab-ascii-{{ $uid }}">
      <div class="braille-output"><pre class="ascii-out" aria-label="ASCII music braille" id="braille-ascii-pre-{{ $uid }}"></pre></div>
    </div>
    <div class="abc-tab-panel" role="tabpanel" id="braille-dots-{{ $uid }}" aria-labelledby="braille-tab-dots-{{ $uid }}">
      <div class="braille-output"><pre class="dots-out" aria-label="Music Braille dot notation" id="braille-dots-pre-{{ $uid }}"></pre></div>
    </div>
  </div>
  {{ partial "notation-braille-render.html" $uid }}
  {{- end -}}

{{- else if $hasNote -}}

  {{- if gt (len $scores) 1 -}}
  {{- /* B: multiple scores, no braille */ -}}
  <div class="abc-tabs">
    <div class="abc-tabs-label" aria-hidden="true">Notation</div>
    <div class="abc-tabs-nav" role="tablist" aria-label="Score views">
      {{- range $i, $score := $scores -}}
        <button class="abc-tab-btn{{ if eq $i 0 }} is-active{{ end }}" role="tab"
                aria-selected="{{ if eq $i 0 }}true{{ else }}false{{ end }}"
                aria-controls="abc-panel-{{ $uid }}-{{ $i }}" id="abc-tab-{{ $uid }}-{{ $i }}">
          {{- $score.label | default (printf "Score %d" (add $i 1)) -}}
        </button>
      {{- end -}}
    </div>
    {{- range $i, $score := $scores -}}
      {{- $abcId := printf "abcplayer-%s-%d" $uid $i -}}
      {{- $abcTempo := int ($score.tempo | default $defTempo) -}}
      <div class="abc-tab-panel{{ if eq $i 0 }} is-active{{ end }}" role="tabpanel"
           id="abc-panel-{{ $uid }}-{{ $i }}" aria-labelledby="abc-tab-{{ $uid }}-{{ $i }}">
        <script type="text/abc" id="abc-data-{{ $abcId }}">{{ $score.notation | safeHTML }}</script>
        <div class="abc-player" id="{{ $abcId }}" data-cursor="true">
          {{- with $score.image -}}<figure class="abc-player-fallback"><img src="{{ . }}" alt="{{ $score.label | default $title }} notation"></figure>{{- end -}}
          <div class="abc-player-score" id="score-{{ $abcId }}"></div>
          <div class="abc-player-controls" id="controls-{{ $abcId }}"></div>
        </div>
        <script>
        window.AbcPlayerCoordinator.registerPlayer({ id: '{{ $abcId }}', abcElementId: 'score-{{ $abcId }}', controlsElementId: 'controls-{{ $abcId }}', defaultTempo: {{ $abcTempo }} });
        </script>
      </div>
    {{- end -}}
  </div>

  {{- else -}}
  {{- /* B: single score, no braille — plain player, no tabs */ -}}
  {{- $score := index $scores 0 -}}
  {{- $abcId := printf "abcplayer-%s" $uid -}}
  {{- $abcTempo := int ($score.tempo | default $defTempo) -}}
  <script type="text/abc" id="abc-data-{{ $abcId }}">{{ $score.notation | safeHTML }}</script>
  <div class="abc-player" id="{{ $abcId }}" data-cursor="true">
    {{- with $score.image -}}<figure class="abc-player-fallback"><img src="{{ . }}" alt="{{ $title }} notation"></figure>{{- end -}}
    <div class="abc-player-score" id="score-{{ $abcId }}"></div>
    <div class="abc-player-controls" id="controls-{{ $abcId }}"></div>
  </div>
  <script>
  window.AbcPlayerCoordinator.registerPlayer({ id: '{{ $abcId }}', abcElementId: 'score-{{ $abcId }}', controlsElementId: 'controls-{{ $abcId }}', defaultTempo: {{ $abcTempo }} });
  </script>
  {{- end -}}

{{- else if $abc -}}
  {{- /* C: braille only */ -}}
  <div class="abc-tabs">
    <div class="abc-tabs-label" aria-hidden="true">Music Braille</div>
    <div class="abc-tabs-nav" role="tablist" aria-label="Braille notation format">
      <button class="abc-tab-btn is-active" role="tab" aria-selected="true"
              aria-controls="braille-ascii-{{ $uid }}" id="braille-tab-ascii-{{ $uid }}">Braille ASCII</button>
      <button class="abc-tab-btn" role="tab" aria-selected="false"
              aria-controls="braille-dots-{{ $uid }}" id="braille-tab-dots-{{ $uid }}">Braille dots</button>
    </div>
    <div class="abc-tab-panel is-active" role="tabpanel" id="braille-ascii-{{ $uid }}" aria-labelledby="braille-tab-ascii-{{ $uid }}">
      <div class="braille-output"><pre class="ascii-out" aria-label="ASCII music braille" id="braille-ascii-pre-{{ $uid }}"></pre></div>
    </div>
    <div class="abc-tab-panel" role="tabpanel" id="braille-dots-{{ $uid }}" aria-labelledby="braille-tab-dots-{{ $uid }}">
      <div class="braille-output"><pre class="dots-out" aria-label="Music Braille dot notation" id="braille-dots-pre-{{ $uid }}"></pre></div>
    </div>
  </div>
  {{ partial "notation-braille-render.html" $uid }}
{{- end -}}
```

- [ ] **Step 2: Create the braille-render helper partial**

Create `layouts/partials/notation-braille-render.html` (the per-panel braille IIFE; the only argument is the suffix string):

```go-html-template
{{- $uid := . -}}
<script>
(function () {
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  try {
    var abc = document.getElementById('braille-src-{{ $uid }}').textContent;
    var r   = window.MusicBraille.renderBraille(abc);
    document.getElementById('braille-ascii-pre-{{ $uid }}').textContent = r.ascii;
    document.getElementById('braille-dots-pre-{{ $uid }}').textContent  = r.unicode;
  } catch (e) {
    var msg = e.message;
    ['braille-ascii-{{ $uid }}', 'braille-dots-{{ $uid }}'].forEach(function (panelId) {
      var p = document.getElementById(panelId);
      if (p) p.innerHTML = '<div class="braille-error" role="alert">' + esc(msg) + '</div>';
    });
  }
}());
</script>
```

- [ ] **Step 3: Commit**

```bash
git add layouts/partials/notation-panel.html layouts/partials/notation-braille-render.html
git commit -m "Add notation-panel partial (not yet wired up)"
```

---

## Task 3: Route legacy entries through the partial (fidelity gate)

**Files:**
- Modify: `layouts/songs/single.html:99-563` (replace the notation section)

- [ ] **Step 1: Replace the notation section**

In `layouts/songs/single.html`, replace everything from line 99 (`{{- $scores := .Params.abc_scores -}}`) through line 564 (the `{{- end }}` that closes the `if or $hasNote $abc` block, i.e. the line right before `{{ with .Content }}`) with:

```go-html-template
    {{- $single    := .Params.abc_notation -}}
    {{- $scoresL   := .Params.abc_scores -}}
    {{- $defTempo  := int (.Params.abc_tempo | default 120) -}}
    {{- $abcLegacy := .Params.sanitized_abc -}}
    {{- $panels    := .Params.panels -}}
    {{- $uid       := .File.UniqueID -}}

    {{/* page-level capability flags across legacy fields AND panels */}}
    {{- $anyNote    := or $scoresL $single -}}
    {{- $anyBraille := $abcLegacy -}}
    {{- range $panels -}}
      {{- if gt (len .scores) 0 -}}{{- $anyNote = true -}}{{- end -}}
      {{- if .sanitized_abc -}}{{- $anyBraille = true -}}{{- end -}}
    {{- end -}}

    {{- if or $anyNote $anyBraille -}}

      {{/* ── Asset loading (once per page) ── */}}
      {{- if $anyNote -}}
        {{- if not ($.Store.Get "abc-css-loaded") -}}{{- $.Store.Set "abc-css-loaded" true -}}<link rel="stylesheet" href="/css/abc-player.css">{{- end -}}
        {{- if not ($.Store.Get "abc-js-loaded") -}}{{- $.Store.Set "abc-js-loaded" true -}}<script src="/js/abcjs-6.4.4-min.js"></script><script src="/js/abc-player-coordinator.js"></script>{{- end -}}
      {{- end -}}
      {{- if $anyBraille -}}
        {{- if not ($.Store.Get "abc-css-loaded") -}}{{- $.Store.Set "abc-css-loaded" true -}}<link rel="stylesheet" href="/css/abc-player.css">{{- end -}}
        {{- if not ($.Store.Get "braille-css-loaded") -}}{{- $.Store.Set "braille-css-loaded" true -}}<link rel="stylesheet" href="/css/braille-panel.css">{{- end -}}
        {{- if not ($.Store.Get "braille-js-loaded") -}}{{- $.Store.Set "braille-js-loaded" true -}}<script src="/js/braille.js"></script>{{- end -}}
      {{- end -}}
      {{- if $anyNote -}}
        <link rel="stylesheet" href="/css/lyrics-panel.css">
        <script src="/js/lyrics.js" defer></script>
      {{- end -}}

      <div class="song-notation-block">
      {{- if $panels -}}
        {{- range $i, $p := $panels -}}
          {{- $sfx := printf "%s-p%d" $uid $i -}}
          <section class="song-notation-panel">
            {{- with $p.heading -}}<h2 class="song-panel-heading">{{ . }}</h2>{{- end -}}
            {{- partial "notation-panel.html" (dict "page" $ "suffix" $sfx "scores" $p.scores "sanitizedAbc" $p.sanitized_abc "defaultTempo" $defTempo) -}}
            {{- if gt (len $p.scores) 0 -}}<div class="lyrics-panel-mount" data-song-uid="{{ $sfx }}"></div>{{- end -}}
          </section>
        {{- end -}}
      {{- else -}}
        {{/* legacy: normalize old fields into a single virtual panel */}}
        {{- $scores := slice -}}
        {{- if $scoresL -}}
          {{- $scores = $scoresL -}}
        {{- else if $single -}}
          {{- $scores = slice (dict "notation" $single "image" $.Params.abc_image) -}}
        {{- end -}}
        {{- partial "notation-panel.html" (dict "page" $ "suffix" $uid "scores" $scores "sanitizedAbc" $abcLegacy "defaultTempo" $defTempo) -}}
        {{- if $anyNote -}}<div class="lyrics-panel-mount" data-song-uid="{{ $uid }}"></div>{{- end -}}
      {{- end -}}
      </div>{{/* end .song-notation-block */}}

      {{/* generic tab switcher (once per page; scoped per .abc-tabs) */}}
      <script>
      (function () {
        document.querySelectorAll('.abc-tabs').forEach(function (tabs) {
          tabs.querySelectorAll('.abc-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
              tabs.querySelectorAll('.abc-tab-btn').forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
              tabs.querySelectorAll('.abc-tab-panel').forEach(function (p) { p.classList.remove('is-active'); });
              btn.classList.add('is-active');
              btn.setAttribute('aria-selected', 'true');
              document.getElementById(btn.getAttribute('aria-controls')).classList.add('is-active');
            });
            btn.addEventListener('keydown', function (e) {
              var allBtns = Array.from(tabs.querySelectorAll('.abc-tab-btn'));
              var idx = allBtns.indexOf(btn);
              var target = null;
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { target = allBtns[(idx + 1) % allBtns.length]; }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { target = allBtns[(idx - 1 + allBtns.length) % allBtns.length]; }
              else if (e.key === 'Home') { target = allBtns[0]; }
              else if (e.key === 'End')  { target = allBtns[allBtns.length - 1]; }
              if (target) { e.preventDefault(); target.focus(); target.click(); }
            });
          });
        });
      }());
      </script>
    {{- end }}
```

NOTE: the lyrics mount in the legacy path stays inside `.song-notation-block` exactly as before. Confirm the old `<div class="lyrics-panel-mount" ...>` line (old line 562) is now removed from its old location and only exists in the new code above.

- [ ] **Step 2: Build and confirm no errors**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet -d /tmp/mtim-new; echo "exit: $?"`
Expected: `exit: 0`, no ERROR lines.

- [ ] **Step 3: Run the legacy fidelity gate**

Run:
```bash
cd /Users/eric/meettheminmusic-blog
fail=0
for p in go-round-the-mountain haul-away-joe a-qua-qua-de-la-omar a-ram-sam-sam ally-bally; do
  f=/tmp/mtim-new/songs/$p/index.html
  grep -o 'id="[^"]*"' "$f" | sort > /tmp/mtim-sig/$p.ids.new
  python3 - "$f" "/tmp/mtim-sig/$p.payload.new" <<'PY'
import sys,re
html=open(sys.argv[1]).read()
blocks=re.findall(r'<script type="text/abc(?:-sanitized)?"[^>]*>(.*?)</script>', html, re.S)
open(sys.argv[2],'w').write('\n--PAYLOAD--\n'.join(sorted(blocks)))
PY
  if ! diff -q /tmp/mtim-sig/$p.ids.base /tmp/mtim-sig/$p.ids.new >/dev/null; then echo "ID MISMATCH: $p"; diff /tmp/mtim-sig/$p.ids.base /tmp/mtim-sig/$p.ids.new; fail=1; fi
  if ! diff -q /tmp/mtim-sig/$p.payload.base /tmp/mtim-sig/$p.payload.new >/dev/null; then echo "PAYLOAD MISMATCH: $p"; fail=1; fi
done
[ $fail -eq 0 ] && echo "GATE PASS: legacy IDs + payloads identical" || echo "GATE FAIL"
```
Expected: `GATE PASS: legacy IDs + payloads identical`. If FAIL, fix the partial/single.html until IDs and payloads match the baseline before continuing. Do not proceed on FAIL.

- [ ] **Step 4: Commit**

```bash
git add layouts/songs/single.html
git commit -m "Route legacy notation rendering through notation-panel partial"
```

---

## Task 4: Update lyrics.js for per-panel scoping

**Files:**
- Modify: `static/js/lyrics.js:72-79` (`findAbcWithLyrics`) and `:140-147` (`init`)

- [ ] **Step 1: Make `findAbcWithLyrics` accept a root**

Replace the function at `static/js/lyrics.js:72-79`:

```javascript
  function findAbcWithLyrics(root) {
    var scripts = (root || document).querySelectorAll('script[type="text/abc"]');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent;
      if (text && /(^|\n)\s*w:/.test(text)) return text;
    }
    return null;
  }
```

- [ ] **Step 2: Scope each mount to its panel in `init`**

Replace `init` at `static/js/lyrics.js:140-147`:

```javascript
  function init() {
    var mounts = document.querySelectorAll('.lyrics-panel-mount');
    if (!mounts.length) return;
    mounts.forEach(function (m) {
      var scope = m.closest('.song-notation-panel');
      var abc = findAbcWithLyrics(scope || document);
      if (!abc) return;
      var verses = stripVerseNumbers(assemble(parseVerses(abc)));
      render(m, verses);
    });
  }
```

- [ ] **Step 3: Verify legacy lyrics unchanged**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet -d /tmp/mtim-new; echo "exit: $?"`
Expected: `exit: 0`. (Behavioral check happens in Task 8 preview: a legacy page with lyrics, e.g. `john-the-rabbit`, still shows its lyrics panel. Legacy mounts have no `.song-notation-panel` ancestor, so `scope` is null and behavior matches the old global lookup.)

- [ ] **Step 4: Commit**

```bash
git add static/js/lyrics.js
git commit -m "Scope lyrics extraction per notation panel"
```

---

## Task 5: Add panel CSS

**Files:**
- Modify: `assets/css/style.css` (append in the "Song single" section, after line ~642)

- [ ] **Step 1: Add spacing + heading styles**

Insert after the `/* --- Song single --- */` heading block (around line 644 in `assets/css/style.css`):

```css
/* Stacked notation panels */
.song-notation-panel + .song-notation-panel {
  margin-top: 2.5rem;
  padding-top: 2.5rem;
  border-top: 0.5px solid var(--neutral-100);
}
.song-panel-heading {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
  color: var(--charcoal, #2C2C2A);
}
```

- [ ] **Step 2: Build**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet; echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 3: Commit**

```bash
git add assets/css/style.css
git commit -m "Add styles for stacked notation panels"
```

---

## Task 6: Add the `panels` field to the CMS config

**Files:**
- Modify: `static/admin/config.yml` (songs collection, around lines 51-98)

- [ ] **Step 1: Insert the `panels` widget**

In `static/admin/config.yml`, immediately BEFORE the `- label: "ABC Notation (single score)"` field (currently line 51), insert:

```yaml
      - label: "Notation panels"
        name: panels
        widget: list
        required: false
        hint: "Stack multiple notation sections down the page. Each panel can hold one score or several tabbed scores. Leave empty to use the legacy single-block fields below."
        fields:
          - { label: "Heading", name: heading, widget: string, required: false }
          - label: "Sanitized ABC (Braille source)"
            name: sanitized_abc
            widget: text
            required: false
            hint: "Optional. Fill to add Braille ASCII/dots tabs to this panel."
          - label: "Scores"
            name: scores
            widget: list
            hint: "One score shows a single player; two or more show tabs."
            fields:
              - { label: "Tab label", name: label, widget: string, required: false }
              - { label: "Notation (ABC)", name: notation, widget: text }
              - { label: "Fallback image", name: image, widget: image, required: false }
              - { label: "Tempo (BPM)", name: tempo, widget: number, required: false, value_type: int }
```

- [ ] **Step 2: Relabel the legacy notation fields**

Change the label on line 51 from `"ABC Notation (single score)"` to `"ABC Notation (legacy single block)"`. Change the hint at lines 60-65 (the `sanitized_abc` field) by prefixing its hint text with `Legacy single-block field. `. Change the `Multiple scores` label (line 77) to `Multiple scores (legacy single block)`.

- [ ] **Step 3: Validate YAML**

Run: `cd /Users/eric/meettheminmusic-blog && python3 -c "import yaml; yaml.safe_load(open('static/admin/config.yml')); print('valid YAML')"`
Expected: `valid YAML`.

- [ ] **Step 4: Commit**

```bash
git add static/admin/config.yml
git commit -m "Add Notation panels field to Sveltia config"
```

---

## Task 7: Migrate orff-homework.md to panels

**Files:**
- Modify: `content/songs/orff-homework.md`

- [ ] **Step 1: Replace the notation frontmatter**

In `content/songs/orff-homework.md`, remove the `abc_notation`, `sanitized_abc`, `abc_image`, `abc_tempo`, and `abc_scores` lines (lines 20-84), and in their place add a `panels` block. Keep all other frontmatter (title, date, draft, unlisted, taxonomies, source, etc.) unchanged. The new block:

```yaml
panels:
  - heading: Listen to the Mustn'ts
    scores:
      - notation: |-
          %%textfont arial italic 11
          X:1
          T:Listen to the Mustn'ts
          M:2/4
          L:1/8
          C:Shell Silverstein
          A: arr. P. Eric Bottorff
          Q:1/4
          %%printtempo 0
          %%gchordfont Arial 12
          %%vocalfont Arial 8
          %%staffsep 50
          %%stretchlast 1
          %%barsperstaff 4
          K:C cle clef=perc stafflines=0
          AA AA| AA A2| AA AA | A2 z2||
          w: List-en to the must-n'ts, child. List-en to the don'ts.
          M: 2/4
          AA AA | AA AA | AA AA | A2 z2||
          w: Lis-ten to the should-n'ts the im-poss-I-ble the won'ts
          M: 2/4
          AA AA | AA AA | AA AA | A2 z2||
          w: Lis-ten to the nev-er haves, then list-en close to me.
          M: 2/4
          AA AA | AA A2 | AA AA | A2 z2||
          w: a-ny-thing can hap-pen child. A-ny-thing can be.
          %%textfont arial 9
          %%center .
          %%center © 2026 All Rights Reserved.
        tempo: 100
  - heading: Peas and Honey
    scores:
      - notation: |-
          %%textfont arial italic 11
          X:1
          T:Peas and Honey
          M:6/8
          L:1/8
          C:Ogden Nash
          A: arr. P. Eric Bottorff
          Q:1/4
          %%printtempo 0
          %%gchordfont Arial 12
          %%vocalfont Arial 8
          %%staffsep 50
          %%stretchlast 1
          %%barsperstaff 5
          K:C cle clef=perc stafflines=0
          A| A2AA2A | A3 A2 A| A2AA2A | A3 z2 A||
          w: I eat my peas with hon-ey. I have done my whole life. It
          M: 6/8
          A2A A2A |A2A A2A |A2A A2A| A3 z3|]
          w: makes them taste real fun-ny but it keeps them on my knife!
          %%textfont arial 9
          %%center .
          %%center © 2026 All Rights Reserved.
        tempo: 180
```

- [ ] **Step 2: Build**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc --quiet; echo "exit: $?"`
Expected: `exit: 0`.

- [ ] **Step 3: Confirm two panels and two players render**

Run:
```bash
cd /Users/eric/meettheminmusic-blog && hugo --quiet -d /tmp/mtim-new
grep -c 'song-notation-panel' /tmp/mtim-new/songs/orff-homework/index.html
grep -c 'class="abc-player"' /tmp/mtim-new/songs/orff-homework/index.html
grep -c 'lyrics-panel-mount' /tmp/mtim-new/songs/orff-homework/index.html
```
Expected: `2`, `2`, `2` (two panels, two players, two lyrics mounts).

- [ ] **Step 4: Commit**

```bash
git add content/songs/orff-homework.md
git commit -m "Migrate orff-homework to multi-panel notation"
```

---

## Task 8: Final verification (build + browser preview)

**Files:** none modified (verification only).

- [ ] **Step 1: Clean full build**

Run: `cd /Users/eric/meettheminmusic-blog && hugo --gc; echo "exit: $?"`
Expected: `exit: 0`, no new ERROR/WARN lines beyond the pre-existing `languageCode`/`.Site.Data` deprecation warnings.

- [ ] **Step 2: Re-run the legacy fidelity gate** (same script as Task 3 Step 3) and confirm `GATE PASS`.

- [ ] **Step 3: Start the preview server**

Use the preview tooling (`preview_start`) against `hugo server --port 1313`, then load `/songs/orff-homework/`.

- [ ] **Step 4: Verify the Orff page**

- Two stacked panels, each with its heading ("Listen to the Mustn'ts", "Peas and Honey").
- Each panel renders a score and a working play control (check console for no errors via `preview_console_logs`).
- Each panel has its OWN lyrics panel with the correct verses (Listen verses under panel 1; Peas and Honey under panel 2).
- Take a `preview_screenshot` to confirm visually.

- [ ] **Step 5: Verify a legacy page unchanged**

Load `/songs/go-round-the-mountain/` (multi-score + braille) and `/songs/john-the-rabbit/` (has lyrics). Confirm tabs switch, players work, braille tabs render, lyrics show — identical to production. Screenshot.

- [ ] **Step 6: Responsive check**

`preview_resize` to mobile width on `/songs/orff-homework/`; confirm panels stack below the title and remain readable.

- [ ] **Step 7: No commit** (verification only). If any issue is found, return to the relevant task, fix, and re-verify.

---

## Self-review notes

- **Spec coverage:** data model (Task 7 + Task 6), unified partial (Task 2), single.html routing legacy + panels (Task 3), per-panel braille (Task 2 partial, Task 6 field), per-panel lyrics (Task 4), CMS config (Task 6), migration (Task 7), legacy fidelity gate (Tasks 1, 3, 8). All spec sections covered.
- **Naming consistency:** partial params `page`/`suffix`/`scores`/`sanitizedAbc`/`defaultTempo` used identically in Task 2 and Task 3; `notation-braille-render.html` takes the bare suffix string in both its definition and its three call sites.
- **Legacy normalization:** `abc_scores` (key `notation`) passes through unchanged; `abc_notation` is wrapped as `slice (dict "notation" $single "image" $.Params.abc_image)`, which the partial's B-single / A2 branches render with the same alt text and image as today.
```
