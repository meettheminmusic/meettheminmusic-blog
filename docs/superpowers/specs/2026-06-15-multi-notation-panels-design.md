# Multiple notation panels per song

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Problem

A song page renders exactly one notation block. The `abc_scores` frontmatter
array turns every entry into a *tab* inside that single block (e.g. the
`orff-homework` entry has "Listen" and "Peas and Honey" as two tabs). There is
no way to place a second, separate notation panel further down the page. As more
content ("homework") is added to an entry, the only option today is an
ever-growing tab strip.

The goal: let an entry contain multiple **panels** stacked vertically down the
page, each with its own heading, its own score(s) (tabs only when a panel holds
2+ scores), and its own optional Music Braille.

## Hard constraint

**Legacy entries must render exactly as they do today.** All existing song files
(~36) use `abc_notation` / `abc_scores` / `sanitized_abc`. Their rendered output
and behavior must not change. This is an acceptance gate, verified by diffing
generated HTML (see Verification).

## Data model

New optional top-level frontmatter field `panels` (array). Each panel:

```yaml
panels:
  - heading: "Listen to the Mustn'ts"   # optional; rendered as a section heading
    sanitized_abc: ""                     # optional; if set, this panel gets Braille tabs
    scores:                               # 1 entry = single player; 2+ = tabs in this panel
      - label: "Full score"               # optional tab label
        notation: |-
          X:1
          ...
        image: ""                         # optional fallback image
        tempo: 100                        # optional; falls back to abc_tempo / 120
```

Rules:
- A panel normally uses a `scores` list. One entry renders as a single player (no
  tab strip); two or more render as tabs, reusing the existing fused
  notation+braille tab UI. If `scores` is empty/omitted but `sanitized_abc` is
  set, the panel renders braille-only (current CASE C).
- Braille is per-panel: a panel renders Braille ASCII/dots tabs only when its
  own `sanitized_abc` is non-empty.
- `panels` is additive. If absent, the page falls back to the legacy fields.

## Architecture (Approach 1: unified partial)

### New partial: `layouts/partials/notation-panel.html`

Encapsulates today's CASE A/B/C logic from `single.html`:

- **Notation + braille** (panel has scores AND `sanitized_abc`): fused tab strip
  (score tabs + Braille ASCII + Braille dots), matching current CASE A1/A2.
- **Notation only** (scores, no `sanitized_abc`): tabbed if 2+ scores, plain
  single player otherwise — current CASE B.
- **Braille only** (`sanitized_abc`, no scores): standalone braille tabs —
  current CASE C.

Parameters (passed as a dict):
- `page` — the page context (for `.Store`, `.Title`, `.File.UniqueID`)
- `idsuffix` — unique string used in every element id (e.g. `<uid>` for legacy,
  `<uid>-p<i>` per panel)
- `heading` — optional; rendered as `<h2 class="song-panel-heading">` when set
- `scores` — list of `{label, notation, image, tempo}`
- `sanitizedAbc` — string (may be empty)
- `defaultTempo` — int

Each panel is wrapped in `<section class="song-notation-panel">`. The per-panel
lyrics mount lives inside this section.

The duplicated tab-switching JS and braille-render JS (currently copied ~5 times)
collapse into the single partial. The `.abc-tabs` switch JS is already scoped per
`.abc-tabs` container, so multiple panels coexist without change.

### `single.html` changes

- Keep page-level asset loading (CSS/JS loaded once via `.Store`). Compute
  "page has any notation" / "page has any braille" across both legacy fields and
  all panels so the right assets load exactly once.
- Routing:
  - If `.Params.panels` is non-empty: `range` panels, calling the partial per
    panel with `idsuffix = printf "%s-p%d" uid $i`, passing that panel's
    `heading`, `scores`, `sanitized_abc`.
  - Else: call the partial once with the legacy fields. For legacy, build the
    `scores` value from `abc_scores` when present, else from a single-element
    synthesis of `abc_notation` (+ `abc_image`), and pass `sanitized_abc`. Use
    `idsuffix = uid`, no heading.
- The braille source `<script type="text/abc-sanitized">` moves into the partial,
  keyed by `idsuffix`, so each panel has its own braille source.

### Lyrics (`static/js/lyrics.js`)

Current `init()` finds the first page-wide ABC script containing `w:` lines and
renders those same verses into every `.lyrics-panel-mount`. Change it so each
mount resolves its ABC from within its own `.song-notation-panel`
(`mount.closest('.song-notation-panel')`), falling back to page-global when no
such ancestor exists. Effect:
- Multi-panel pages: each panel shows its own lyrics.
- Legacy pages: the single block is also wrapped in `.song-notation-panel` by the
  partial, so the mount resolves to the same scripts it does today — identical
  result. (Side benefit: a legacy multi-tab block now scopes correctly, but its
  observed output is unchanged because there is only one block.)

### CMS (`static/admin/config.yml`)

Add a `panels` list widget to the `songs` collection:

```yaml
- label: "Notation panels"
  name: panels
  widget: list
  required: false
  hint: "Stack multiple notation sections down the page. Each panel can hold one score or several tabbed scores."
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
      fields:
        - { label: "Tab label", name: label, widget: string, required: false }
        - { label: "Notation (ABC)", name: notation, widget: text }
        - { label: "Fallback image", name: image, widget: image, required: false }
        - { label: "Tempo (BPM)", name: tempo, widget: number, required: false, value_type: int }
```

Keep the existing notation fields (`abc_notation`, `abc_scores`, `sanitized_abc`,
`abc_image`, `abc_tempo`), relabeled to indicate they are legacy/single-block, so
existing entries remain editable.

## Migration

Rewrite `content/songs/orff-homework.md` into two panels:
- Panel 1 — heading "Listen to the Mustn'ts", the "Listen" score (tempo 100).
- Panel 2 — heading "Peas and Honey", the "Peas and Honey" score (tempo 180).

Each panel then carries its own lyrics. No `sanitized_abc` (no braille for this
entry today).

## Verification

1. **Legacy fidelity (gate):**
   - Build baseline from current `main`: `hugo --gc -d public_baseline`.
   - Apply changes, build: `hugo --gc -d public_new`.
   - Diff generated HTML for legacy pages:
     `diff -r public_baseline/songs public_new/songs`.
   - Representative pages that MUST be identical (or any diff justified as purely
     cosmetic whitespace with no visual/behavioral change):
     - Multi-score + braille: `go-round-the-mountain`, `haul-away-joe`
     - Single notation + braille: `a-qua-qua-de-la-omar`
     - Notation only: `a-ram-sam-sam`, `ally-bally`
2. **Build:** `hugo --gc` exits 0 with no errors/warnings introduced.
3. **New feature (preview the Orff page):** two stacked panels, each with its
   heading, each independently playable, per-panel lyrics correct.
4. **Spot-check in browser:** one legacy multi-score page and one legacy
   single-notation page render and play identically to production.

## Out of scope

- No changes to the homepage song cards, song library list/filter, or JSON feed.
- No back-fill migration of other legacy entries to `panels`.
- Per-tab (within a single panel) separate lyrics — a panel's tabs are treated as
  variants sharing the panel's first lyrics, consistent with current behavior.
