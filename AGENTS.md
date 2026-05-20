# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- **Partials**: `layouts/partials/` — braille-panel, related-content, author-bio, signup-cta, sticky-email-bar, analytics, footer, hero-beams
- **Assets**: `assets/css/style.css` fingerprinted via Hugo pipes; brand SVG logos in `assets/`. Page-specific styles live in `static/css/` (abc-player.css, braille-panel.css, lyrics-panel.css) and are loaded conditionally on relevant pages.
- **CMS**: Netlify CMS config at `static/admin/config.yml` — GitHub-backed headless editor for posts, songs, and books. Not required for local dev.
- **Navigation**: driven by `data/navigation.yaml`; supports top-level links and dropdown groups (items with a `children` array); dropdown JS and CSS live in `baseof.html` and `style.css`
- **Tool pages**: `content/rhythm-builder.md` + `layouts/_default/rhythm-builder.html`; page-specific CSS/JS injected via the `{{ block "extra_head" . }}` hook in `baseof.html`
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

## Books

`content/books/` + `layouts/books/`. The `audience` frontmatter field (`"kids"` or `"teachers"`) controls which display grid a book appears in on the list page. Archetype: `archetypes/books.md`.

## Rhythm Builder

`/rhythm-builder/` is a Hugo page (not a static file). Layout: `layouts/_default/rhythm-builder.html`, content stub: `content/rhythm-builder.md`. All tool CSS uses `--rb-` prefixed custom properties to avoid conflicts with global variables. The `extra_head` block injects the ABCJS CDN script and tool styles into `<head>`. Action buttons (Play/Stop/Save PNG/Save SVG/Copy ABC) live in `.action-toolbar` above the cards, not in a header.

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
