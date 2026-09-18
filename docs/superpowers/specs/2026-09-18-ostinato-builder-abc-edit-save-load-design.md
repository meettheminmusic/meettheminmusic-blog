# Ostinato Builder: octave editing, raw ABC override, save/load

## Context

`layouts/_default/ostinato-builder.html` builds a multi-part bordun/percussion
ostinato from a cell-grid model (`project.parts[].cells`), rendered to a
multi-voice ABC score. Two gaps:

1. Bordun cells pick a pitch from a per-key palette (`KEYS[key].palette`), but
   only the "so" and "do" scale degrees have a low/high octave choice — "re",
   "mi", "la" have one octave only. There's no way to hand-edit ABC directly.
2. There's no way to save a built ostinato and reload it later. Every session
   starts from a blank grid.

This spec covers three additions, independent of each other but shipped
together: (1) fill out the octave palette, (2) a per-part raw-ABC override,
(3) autosave + named save/load + file export/import.

## 1. Octave palette

Extend `KEYS[key].palette` for all 5 keys (C, F, G, D, A) so every scale
degree (do, re, mi, so, la) has both a low and a high option, matching the
octave span "so" and "do" already have. No new UI or state — `buildBordunCell`
already renders whatever is in `palette` as dropdown options. Purely a data
table change in the `KEYS` constant.

Today's 7-entry palette, ascending: `so,  do  re  mi  so  la  do'` — so and do
already have 2 positions each (so, / so and do / do'); re, mi, la have 1
each, all sitting in the do→do' register.

Add one low-octave option each for re, mi, la — each an octave below its
current position. Since re/mi/la currently sit *above* do (between do and
do'), their low-octave twins land *below* so, (an octave-plus below the
current so,/do register), giving this ascending order:
`re,  mi,  so,  la,  do  re  mi  so  la  do'`.

This widens the total span from a 12th to about a 13th (re, up to do'),
wider than a single barred instrument's typical range. That's an accepted
trade-off of extending every degree symmetrically like so/do — the low
options exist for parts that need them, nothing forces using the extremes.
(Exact ABC pitch tokens per key follow each key's existing letter/accidental
conventions in `KEYS`, same as the current entries — this is a data-table
edit, not a new convention.)

## 2. Per-part raw ABC override

**State**: each part gains a `rawAbc` field, `null` by default. Non-null means
the part is in raw mode.

**UI**: each part card gets an "Edit as ABC" toggle button near the existing
per-part controls (instrument select, preset select, bars stepper, lyrics
checkbox).

- Turning it on: if `rawAbc` is `null`, prefill it with the ABC this part
  *currently* generates — `buildVoiceMusic(flattenPart(part, part.bars), beatsPerBar())`
  — so the user edits a working pattern rather than a blank textarea. Show a
  `<textarea>` in place of the cell grid. Hide the bars stepper and (for
  bordun) the preset dropdown, since bar count is now inferred from the text.
  Hide the lyrics checkbox for this part.
- Turning it off: hide the textarea, show the grid again. `rawAbc` is left
  as-is (not cleared), so toggling back on restores the last raw edit instead
  of re-prefilling.
- Instrument select keeps working normally in both modes — it only affects
  `voiceMidi()`/`voiceHeader()`, not pitch/rhythm content.

**Bar count inference**: when a part is in raw mode, its effective bar count
is the number of bar-lines in `rawAbc` (split on `|`, trailing `]` stripped,
empty trailing segment ignored) instead of `part.bars`. This number feeds the
existing "shorter parts loop under the longest" logic the same way
`part.bars` does today.

**Score generation**: `flattenPart`/`flattenBar` are cell-based and don't
apply to raw parts. Add a raw-mode path used by both `generateScoreABC` and
`generatePartABC`:

- Split `rawAbc` into per-bar text chunks the same way bar count is inferred.
- Tile those chunks to the target bar count using the same `b % barCount`
  wraparound `flattenPart` uses for cells, then join with the target's
  existing bar-joining logic (reuse, don't reimplement, the barline handling
  already in `buildVoiceMusic`/`flattenPart`'s tiling loop — the raw path
  only replaces where the per-bar *tokens* come from, not the tiling or
  join logic).
- No lyrics line (`w:`) is generated for a raw part, even if
  `vis-lyrics` is on — lyrics stay tied to cell data, which raw parts don't
  have. A user who wants words under a raw part types their own `w:` line
  directly into the textarea; it passes through untouched.

**Malformed ABC**: no new validation. `renderScore()` already wraps
`ABCJS.renderAbc` in try/catch and logs a console warning on failure —
unchanged behavior, same as any other hand-typed ABC error today.

## 3. Save / load

Three independent mechanisms, following the existing `mtim_*` localStorage
naming convention used by the Chord Diagram Generator
(`mtim_chord_library`) and the draft pattern used by Visual Schedule Builder
(`mtim_visual_schedule_draft`).

### Autosave draft

- Key: `mtim_ostinato_draft`. Value: JSON-serialized `project` (meter, subdiv,
  tempo, key, and `parts[]` including `cells`, `rawAbc`, `instrumentId`,
  `bars`, `lyricsOn`).
- Saved on every project mutation, debounced (reuse the existing
  `scheduleRender`-style debounce pattern, e.g. 500ms) — write-through, not
  tied to any explicit save action.
- On page load, if `mtim_ostinato_draft` exists and parses, prompt with
  `confirm('Restore your last unsaved ostinato?')` before applying it — same
  UX as Visual Schedule Builder's `restoreDraftIfAvailable()`. Declining
  leaves the draft in storage (not destructive) and starts from the default
  empty project.

### Named library

- Key: `mtim_ostinato_library`. Value: JSON array of
  `{ id, name, savedAt, project }`.
- "Save ostinato" button (action toolbar) prompts for a name via `prompt()`.
  If the name matches an existing saved entry, `confirm()` before
  overwriting; otherwise appends a new entry.
- "Load ▾" `<select>` (action toolbar) lists saved names. Selecting one loads
  that entry's `project` in place of the current one — no unsaved-changes
  warning (the autosave draft already covers recovering prior work if it
  mattered).
- A small delete control (button next to the Load dropdown) removes whichever
  entry is currently selected, after a `confirm()`.

### File export/import

- "Export file" button serializes `{ name, savedAt, project }` to a `.json`
  file and triggers a download (same `URL.createObjectURL` +
  `a.click()` pattern already used for PNG/SVG export in this file).
- "Import file" button opens a hidden `<input type="file" accept=".json">`,
  reads the selected file, parses it, and loads its `project` — same
  no-warning replace behavior as loading from the library.
- This is the only way to move an ostinato between computers/browsers or
  hand one to another teacher; the library and draft are both
  browser-local only.

### UI placement

All five controls (Save ostinato, Load ▾, Delete, Export file, Import file)
go in the existing top `.action-toolbar`, alongside Play/Stop/Save score
(PNG)/Save SVG/Copy ABC. The toolbar already wraps on narrow screens
(existing responsive behavior), so no new layout mechanism is needed.

## Out of scope

- No cloud sync or cross-teacher sharing beyond manual file export/import.
- No versioning/undo history for saved ostinatos — saving under an existing
  name overwrites it.
- No third octave in the palette (low+high per degree only, matching
  so/do's existing span).
- No lyric support for raw-ABC parts beyond passthrough of a hand-typed `w:`
  line.
