# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development server
hugo server --port 1313

# Production build (with garbage collection)
hugo --gc --quiet
```

No npm or Node.js required — Hugo handles all asset processing via its built-in pipes.

## Architecture

Hugo static site with a fully custom theme (no external theme package). All templates live in `layouts/`.

- **Content types**: `content/songs/`, `content/posts/`, `content/books/`, plus static pages
- **Templates**: `layouts/_default/` (base, single, list, about, sitemap, sitemap.xml, taxonomy, term), `layouts/songs/`, `layouts/posts/`, `layouts/books/`
- **Shortcodes**: `layouts/shortcodes/` — abc-player, callout, book, books, slides, slideshow
- **Partials**: `layouts/partials/` — braille-panel, related-content, author-bio, signup-cta, sticky-email-bar, post-retention-cta, strategy-path, analytics, footer, hero-beams
- **Assets**: `assets/css/style.css` fingerprinted via Hugo pipes; brand SVG logos in `assets/`. Page-specific styles live in `static/css/` (abc-player.css, braille-panel.css, lyrics-panel.css) and are loaded conditionally on relevant pages.
- **CMS**: Netlify CMS config at `static/admin/config.yml` — GitHub-backed headless editor for posts, songs, and books. Not required for local dev.
- **Navigation**: driven by `data/navigation.yaml`; supports top-level links and dropdown groups (items with a `children` array); dropdown JS and CSS live in `baseof.html` and `style.css`
- **Tool pages**: page-specific CSS/JS injected via the `{{ block "extra_head" . }}` hook in `baseof.html`. Current tools: `content/rhythm-builder.md` + `layouts/_default/rhythm-builder.html`; `content/ostinato-builder.md` + `layouts/_default/ostinato-builder.html`; `content/chord-diagram-generator.md` + `layouts/_default/chord-diagram-generator.html`; `content/visual-schedule-builder.md` + `layouts/_default/visual-schedule-builder.html`
- **Archetypes**: `archetypes/songs.md` and `archetypes/books.md` define frontmatter templates for new content

Site config, brand colors, taxonomy definitions, and related-content index weights are all in `hugo.toml`.

## Song pages

Songs are the most complex content type. Key frontmatter fields:

| Field | Purpose |
|---|---|
| `abc_notation` | Single ABC score string; rendered client-side by ABCJS |
| `abc_scores` | Array of `{label, abc}` objects for songs with multiple scores |
| `sanitized_abc` | Cleaned ABC fed to the Music Braille engine |
| `abc_tempo` | Default BPM (default 120) |
| `abc_image` | Fallback image if ABCJS render fails |
| `card_image` | Image shown in the song grid on the homepage |
| `grade_level` | Array of grade levels; shown as badges on homepage song cards |
| `meter` | Single display string (e.g. "4/4") for homepage card; distinct from `meters` taxonomy |
| `tonality` | Tonal property shown on homepage song cards |
| `origin` | Geographic/cultural origin shown on homepage song cards |
| `activity_type` | Array of activity tags shown on homepage song cards |

**General content frontmatter** (posts and songs):
- `featured` (boolean) — marks a post as the homepage featured card (only one at a time)
- `unlisted` (boolean) — keeps the page accessible via URL but hides it from all lists, nav, and sitemaps

**ABC rendering pipeline**: `static/js/abc-player-coordinator.js` (706 lines) manages all players on a page — registration, lazy rendering, key transposition across 24 keys, and ABCJS cursor sync. The ABCJS library is at `static/js/abcjs-6.4.4-min.js`.

**Music Braille**: `static/js/braille.js` converts `sanitized_abc` to ASCII and Unicode Braille. The tab UI is rendered by `layouts/partials/braille-panel.html`.

**Lyrics**: `static/js/lyrics.js` parses ABC `w:` (syllable) lines and renders them into a collapsible panel at `.lyrics-panel-mount`. Panel styles live in `static/css/lyrics-panel.css`.

**Slideshow**: `static/js/slideshow.js` manages image galleries rendered by the `slideshow` shortcode — keyboard navigation (arrows, F for fullscreen, Esc), iOS fullscreen detection, and slide counter.

**Taxonomies** (10 dimensions used for filtering and related-content weighting):
`tonal_concepts`, `rhythmic_concepts`, `activity_types`, `movement_concepts`, `social_concepts`, `supports_adaptations`, `language_origins`, `modes`, `meters`, `keys`

## Song library

`layouts/songs/list.html` powers the song library page. Client-side search uses Fuse.js (loaded from CDN: `fuse.js@7.0.0`). Multi-dimension filtering maps to the 10 song taxonomies. Filter state persists in `localStorage` (keys prefixed `filter-fg-`). URL parameters support deep-linking to pre-filtered results.

`layouts/songs/list.json` outputs all non-unlisted songs as a JSON array (title, url, and all taxonomy fields) consumed by the client-side Fuse.js search.

## Books

`content/books/` + `layouts/books/`. The `audience` frontmatter field (`"kids"` or `"teachers"`) controls which display grid a book appears in on the list page. Archetype: `archetypes/books.md`.

## Rhythm Builder

`/rhythm-builder/` is a Hugo page (not a static file). Layout: `layouts/_default/rhythm-builder.html`, content stub: `content/rhythm-builder.md`. All tool CSS uses `--rb-` prefixed custom properties to avoid conflicts with global variables. The `extra_head` block injects the ABCJS CDN script and tool styles into `<head>`. Action buttons (Play/Stop/Save PNG/Save SVG/Copy ABC) live in `.action-toolbar` above the cards, not in a header.

## Ostinato Builder

`/ostinato-builder/` is a Hugo page. Layout: `layouts/_default/ostinato-builder.html`, content stub: `content/ostinato-builder.md`. Forked from Rhythm Builder (shares the lyric syllabifier, ABCJS render/synth, and PNG/SVG export pipeline) but extended to a multi-part grid: one pitched Orff bordun voice plus any number of unpitched percussion ostinato voices, rendered as a stacked multi-voice ABC score. Each part has its own bar count and loops under the longest. Percussion voices use a `clef=perc` staff and a `%%MIDI transpose` offset to map a single written note to a GM drum sound; the bordun uses pentatonic key tables (C/F/G/D/A) with explicit accidentals so the score needs no key signature (`K:C`). Per-part PNG/SVG export produces flashcards. Like Rhythm Builder, the `extra_head` block injects the ABCJS CDN script and tool styles, and action buttons live in `.action-toolbar` above the cards. Tool CSS uses `--ob-` prefixed custom properties; generic class names that would collide with global `style.css` (the `.btn` family) are prefixed `.ob-btn`, and bare `select`/`input` rules are scoped under `.main`.

## Chord Diagram Generator

`/chord-diagram-generator/` is a Hugo page. Layout: `layouts/_default/chord-diagram-generator.html`, content stub: `content/chord-diagram-generator.md`. Unlike Rhythm Builder, this tool is React-based: the layout loads React 18.3.1, ReactDOM, and Babel Standalone 7.29.0 from unpkg CDN, then mounts `ChordTool` into `#chord-root` via `<script type="text/babel">`.

JavaScript components (both in `static/js/`):
- `chord-diagram-component.js` — pure SVG renderer (`ChordDiagram`). Accepts a `shape` object (`strings`, `frets`, `fingers`, `barres`, `nut`, `baseFret`, `name`, `dotSize`, `lineWeight`, `dotColor`, `theme`, `labelPos`). Theme-aware with shared brand palette constants.
- `chord-tool-component.js` — full interactive UI (`ChordTool`). Supports Guitar (6 strings) and Ukulele (4 strings); finger placement and barre modes; color/size/weight customization. Chord library persists to `localStorage` key `mtim_chord_library`.

CSS uses `--mtim-*` prefixed custom properties (same namespace as global brand tokens, unlike Rhythm Builder's isolated `--rb-` prefix).

## Visual Schedule Builder

`/visual-schedule-builder/` is a Hugo page (public, in the Tools nav dropdown). Layout: `layouts/_default/visual-schedule-builder.html` (self-contained: CSS in `extra_head`, markup and ~2,300 lines of vanilla JS in `main`), content stub: `content/visual-schedule-builder.md`. Ported from the standalone Schedule Planner. Builds a single-lesson visual schedule: a two-panel editor (activity sequence left, live 16:9 preview right, drag-resizable via `#resizeHandle`) where each activity gets a picture, optional notes, and a click action (nothing, link with optional multi-link tabs, or a media popup with image/video, audio, and slideshow support). No external libraries.

Key mechanics:
- Media blobs persist in IndexedDB (`mtimVisualScheduleDB`); drafts autosave to `localStorage` key `mtim_visual_schedule_draft`
- "Save schedule" exports a fully standalone HTML file with media inlined as data URLs; "Open saved" re-imports it by parsing the exported DOM. Title and subtitle join with `" · "` (importer falls back to the legacy `" — "` separator from pre-port exports)
- All CSS is scoped under `.vsb-tool` with `--vsb-` prefixed tokens; buttons are `.vsb-btn` (JS-generated markup uses `vsb-btn small ghost`-style classes). A small alias block on `.vsb-tool` (`--text-secondary`, `--border-color`, `--space-4`, etc.) serves inline styles embedded in the JS template strings — keep it if renaming tokens

## Related content

`layouts/partials/related-content.html` uses Hugo's `.Related` API. Indices and weights are defined in `hugo.toml` — tonal and rhythmic concepts are weighted highest (90). Shows 4 from the same section + 2 cross-section.

## Deployment

Cloudflare Pages (free tier). No config file in the repo — deploys automatically on push to `main`. There is no CI/CD YAML.

## Brand and style rules

- **No em dashes** — use commas, colons, or rewrite
- **Sentence case** for all headings and UI labels
- **Typography**: Inter 400, 500, 600 only (loaded via Google Fonts)
- **WCAG contrast** required on all text/background combinations
- **Brand colors** (defined in `hugo.toml` params):
  - Charcoal: `#2C2C2A`
  - Warm Gray: `#5F5E5A`
  - Teal: `#0F6E56`
  - Dark Teal: `#085041`
  - Warm White: `#FAFAF8`
  - Teal Tint: `#E1F5EE`
