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

- **Pick from library** — searchable dropdown populated from `/songs/list.json` fetched
  once at tool load. Selecting a song fills the ABC field. If the song has multiple
  scores, a second small selector lists the score labels.
- **ABC source** — editable `<textarea>`, the source of truth. Supports pick-then-tweak,
  paste, or hand-authored ABC for songs not in the library.
- **Tempo** — number field, pre-filled from the song's `abc_tempo` on pick (default 120).
- **Live mini-render** below the field, updates as the ABC is edited.

### 3. Storage

Notation is plain text, so it serializes as fields on the activity
(`abc`, `tempo`, optional `transpose` default) — no IndexedDB blob, no data-URL bloat.
Rides along in draft autosave and export like the existing title/notes fields.

### 4. Overlay (identical in-tool and in exported file)

Open popup → `ABCJS.renderAbc()` renders the score → `ABCJS.synth.SynthController`
widget (play/stop, progress, tempo warp, cursor) → two transpose buttons (♭ / ♯) that
re-render at a new `visualTranspose` and reload audio.

### 5. Export bundling

Inline `abcjs-6.4.4-min.js` (~230KB) into the standalone file **only when at least one
activity uses a notation action**, so image-only schedules stay lean. The overlay-render
helper is included on the same condition.

### 6. Upstream edit (only change outside the tool file)

Extend `layouts/songs/list.json` to also emit `abc` (from `abc_notation`), `abc_scores`,
and `abc_tempo`. Additive — the existing Fuse.js song-library search ignores unknown
fields.

## Accepted trade-offs

- **Offline picker does not populate.** The picker fetches `/songs/list.json` at runtime,
  so inside an exported file opened offline the *picker* is empty. Any notation already
  attached still plays fully — the ABC text is what's saved, the picker is only an
  authoring convenience. Acceptable: the sole user needing offline authoring has local
  song-library access anyway.

## Out of scope (YAGNI)

- Porting `abc-player-coordinator.js` (24-key transpose table, multi-player registry,
  cursor sync internals). ABCJS built-ins cover the needed player.
- Braille panel / lyrics panel inside the overlay.
- Editing/round-tripping notation back into the song library.
