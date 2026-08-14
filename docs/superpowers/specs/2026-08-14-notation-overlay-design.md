# Notation overlay for the Visual Schedule Builder

Date: 2026-08-14

## Goal

Let a schedule activity open an **interactive song-notation popup** instead of (or
alongside) a static image. The notation must play, transpose, and adjust tempo, and it
must keep working inside the standalone exported HTML file opened offline in class.

## Context

- Tool: `layouts/_default/visual-schedule-builder.html` (self-contained vanilla JS,
  scoped under `.vsb-tool`, `--vsb-` tokens). "Save schedule" exports a standalone HTML
  file with media inlined as data URLs; "Open saved" re-imports it.
- Activities currently support three click actions: **None / Link / Media popup**
  (image, video, audio, slideshow). Media blobs live in IndexedDB
  (`mtimVisualScheduleDB`); drafts autosave to `localStorage` (`mtim_visual_schedule_draft`).
- Notation engine: `ABCJS` (`static/js/abcjs-6.4.4-min.js`), the same engine the song
  pages use. The song pages hand-roll play/cursor/transpose across the 706-line
  `abc-player-coordinator.js` because they manage many players per page. **We do not port
  that.** ABCJS's built-in `synth.SynthController` gives play/stop + progress + tempo
  slider + note cursor in one call; transpose is `renderAbc(..., {visualTranspose: n})`
  plus a synth reload.
- Song frontmatter: 43 songs use `abc_notation` (single string); 32 use `abc_scores`
  (array of `{label, abc}`). Default BPM in `abc_tempo`. The picker must handle both.

## Design

### 1. New activity action: "Notation"

A fourth click action beside None / Link / Media popup. Selecting it reveals a notation
editor in the activity card. As with the media action, the activity's **tile picture is
unchanged** — notation is what opens in the popup on click, not a replacement for the
tile image.

### 2. Editor (in the activity card)

- **Pick from library** — dropdown populated from `window.SONG_INDEX`, embedded in the
  tool page at build time (see §6). Multi-score songs (`abc_scores`) appear as one flat
  entry each, labelled "Title · Score" — no second selector. Selecting fills the ABC
  field and tempo.
- **ABC source** — editable `<textarea>`, the source of truth. Supports pick-then-tweak,
  paste, or hand-authored ABC for songs not in the library.
- **Tempo** — number field, pre-filled from the song's `abc_tempo` on pick (default 120).
- **Live mini-render** below the field, updates as the ABC is edited.

### 3. Storage

Notation is plain text, so it serializes as `activity.notation = { abc, tempo, transpose }`
— no IndexedDB blob, no data-URL bloat. Rides along in draft autosave and export like the
existing title/notes fields.

### 4. Player — `vsbRenderNotation(root, notation, ABCJS, soundFontUrl)`

One self-contained function (params only, no closure) used identically in-tool and in the
export — the export gets its source via `.toString()`. Renders the score with
`ABCJS.renderAbc(..., {visualTranspose})`, builds an `ABCJS.synth.SynthController` widget
(play/stop, progress, tempo warp, note cursor), and two transpose buttons (♭ Down / ♯ Up)
that re-render and reload audio. Needs `abcjs-audio.css` (added at `static/css/`) for the
control widget.

### 5. Export bundling (chosen: full offline audio)

When any activity uses notation, the export inlines: `abcjs-6.4.4-min.js` (~230KB), the
`abcjs-audio.css`, `vsbRenderNotation`'s source, and **all 88 piano soundfont notes as
base64 data URLs** (`var SF`). A tiny `XMLHttpRequest.prototype.open` patch rewrites any
`…/<note>.mp3` request to the bundled data URL, so ABCJS plays with zero network. Cost:
~9 MB per notation export. Image-only schedules bundle none of this and stay ~20KB.

### 6. Song index — embedded at build time (no list.json change)

The tool page emits `window.SONG_INDEX` via Hugo at build (`.Site.RegularPages` "songs",
non-unlisted), one entry per `abc_notation` plus one per `abc_scores` entry (score field
key is `notation`, not `abc`). Kept out of the shared `list.json` so the song-library
search payload isn't bloated with ABC. `window.SF_NOTE_FILES` (from `os.ReadDir` of the
soundfont dir) is emitted the same way for the export bundler.

## Accepted trade-offs

- **Offline picker does not populate.** `SONG_INDEX` lives in the tool page, not in
  exports, so an exported file opened offline has no picker — but attached notation plays
  fully. The picker is an authoring convenience; the ABC text is what's saved.
- **~9 MB per notation export.** The deliberate cost of true-offline audio; accepted.
- **Piano only.** The bundle covers acoustic grand piano; percussion-clef scores render
  but play back on piano.

## Out of scope (YAGNI)

- Porting `abc-player-coordinator.js` (24-key transpose table, multi-player registry,
  cursor sync internals). ABCJS built-ins cover the needed player.
- Braille panel / lyrics panel inside the overlay.
- Editing/round-tripping notation back into the song library.
