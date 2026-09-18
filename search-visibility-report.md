# Search visibility report

Branch: `search-visibility` (rebased onto `growth`, which already carried the tool-footer,
related-songs, and dead-file cleanup commits). Scope: Phase 2 (snippet rewrite) and Phase 3
(index acceptance) only, per your steer — the honeypot/subscribe-partial work from the
original brief was **not** redone here.

## 1. What changed on this branch

**Phase 2 — snippet rewrite** (`5cfe21f`... rebased, see `git log`):
- Added `seo_title` + `description` front matter to all 46 files under `content/songs/`
  (44 real song pages + 2 internal utility pages, `audition-music.md` and `orff-homework.md`,
  which are not song lessons and got honest non-templated copy instead of the song template).
- Title template `"{Song}: {modifiers} | K-2 Music"`, hard-capped at 60 chars. Modifiers
  (`Lyrics` / `Sheet Music` / `Lesson Plan`) only appear when the page actually delivers them —
  checked mechanically, not assumed:
  - `Sheet Music` requires `abc_notation` or `abc_scores` to be non-empty.
  - `Lyrics` requires an actual `w:` line in the notation (checked in both the legacy
    `abc_notation` field and nested `abc_scores` blocks).
  - `Lesson Plan` requires the page body (once shortcodes/images/headings are stripped) to
    carry more than ~100 characters of real activity text.
- **9 song pages turned out to have an empty or near-empty body** — just a notation shell with
  no pedagogical write-up at all (`blue-bird`, `cat-is-gone`, `alley-alley-oh`, `down-the-river`,
  `draw-a-bucket-of-water`, `peas-and-honey`, `rain-on-the-green-grass`,
  `zoom-zoom-zoom-we-re-going-to-the-moon`, and `clapping-land` at 64 chars). These lost the
  `Lesson Plan` claim; a couple of others lost a claim purely because the full title ran past
  60 characters even though the page does deliver it. Full reasoning per page is in
  `snippet-rewrite.csv`.
- Descriptions: 140–155 chars, open with the concrete deliverable, grounded in each page's real
  taxonomies/activity content (not a token-swapped template), verified unique across all 46.
  **Found 7 pages that already had a hand-written `description`** field I hadn't accounted for —
  all 7 were an identical boilerplate template (`"{Song} is a {mode} {meter} song. Includes
  pedagogical analysis, classroom activity ideas, and UDL adaptations for elementary music
  teachers."`), which is exactly the kind of duplicate-description problem this phase exists to
  fix. Replaced with page-specific text.
- The head partial (`baseof.html`) already preferred `seo_title` with fallback to
  `{{ .Title }} | {{ .Site.Title }}` — no template change was needed for that part.
- Added `BreadcrumbList` JSON-LD (Home › Song library/Blog › page) to the song and post single
  templates.
- CSV at repo root: `snippet-rewrite.csv` — old/new title, old/new description, and
  dropped-modifier reasoning for all 46 pages.

**Phase 3 — index acceptance** (diagnosis + the four listed remediations, plus one more I found):
- 148 thin taxonomy/tag/category term pages (fewer than 3 members) now get
  `<meta name="robots" content="noindex,follow">`, canonical left intact. **Zero song, post, or
  tool pages are ever touched by this** — the check only fires on `Kind == "term"` with
  `len .Pages < 3`, which no single-page content ever satisfies.
- `static/_redirects`: 301 from the bare (non-trailing-slash) form to the trailing-slash form
  for the 5 tool pages plus `/about`, `/contact`, `/license`, `/songs`, `/books`, `/posts`.
- `hugo.toml`: added `enableGitInfo = true` so `lastmod` in the sitemap reflects the real last
  commit to each file instead of being frozen to the front-matter `date:` field (see finding 15).
- `robots.txt`: `Disallow: /songs/?` — see finding 11, this is the big one.

Full `hugo --gc --minify` build is clean (503 pages, no errors) and was verified in a throwaway
`hugo server` on a separate port so as not to disturb your own dev server.

---

## Findings 11–15

### 11. Sitemap enumeration and the "alternate, canonicalized" bucket

126 URLs in `public/sitemap.xml`, classified:

| Class | Count |
|---|---|
| Songs (single) | 42 |
| Books (single) | 12 |
| Taxonomy term pages (≥3 members, all 10 dimensions combined) | 32 |
| Posts (root-permalink single) | 6 |
| Tool pages | 5 |
| Utility (about/contact/license/sitemap) | 4 |
| Taxonomy list pages (e.g. `/tonal_concepts/`) | 9 |
| Songs/Books/Posts index | 3 |
| Home | 1 |

I can't pull your live GSC numbers (no API access, and I didn't try), so I can't match "147"
literally. But I found strong, directly-measured evidence for what's almost certainly the
dominant contributor: **every song page links out to its curriculum-concept tags as real
`<a href="/songs/?tonal_concepts=...">` anchors** (client-side filter deep-links, per the song
library's design). I counted **171 distinct such query-string URLs** crawlable via real anchor
tags across the 42 song pages alone. None of them is a real Hugo page — `.Permalink` for all of
them is just `/songs/`, so every one carries a canonical tag pointing back to plain `/songs/`.
That's exactly the profile of "alternate page with proper canonical tag": crawlable, distinct
URL, self-consistent canonical elsewhere, zero unique content of its own. This is very likely
where most of the 147 came from, or at least a large chunk of it, and it was actively growing on
every new song page.

Fix applied: `Disallow: /songs/?` in `robots.txt`. This doesn't touch `/songs/` itself or any
individual song page — only the query-string variants.

### 12. Unique body-content distribution (excluding subscribe CTAs, related-songs, nav, footer,
front-matter chrome)

Measured from the actual rendered HTML (BeautifulSoup, stripping `header.site-header`, `footer`,
`.song-details`, `.song-concepts-details`, `.related-songs`, `.related-content`,
`.song-inline-cta`, `#sticky-email-bar`, `.song-back`, and the `<h1>`), across the 44 song pages
that are listed or unlisted-but-real (excluding the 2 utility pages):

- Median: 935 characters. Mean: 809. Range: 0–1846.
- **Bottom quartile (12 pages, ≤380 chars):**

| Chars | URL |
|---:|---|
| 0 | `/songs/blue-bird/` |
| 0 | `/songs/draw-a-bucket-of-water/` |
| 0 | `/songs/rain-on-the-green-grass/` |
| 15 | `/songs/down-the-river/` |
| 25 | `/songs/alley-alley-oh/` |
| 26 | `/songs/cat-is-gone/` |
| 44 | `/songs/peas-and-honey/` |
| 44 | `/songs/zoom-zoom-zoom-we-re-going-to-the-moon/` |
| 110 | `/songs/clapping-land/` |
| 234 | `/songs/jjak-jjak-ggung/` |
| 346 | `/songs/frog-in-the-meadow/` |
| 380 | `/songs/roller-coaster/` |

### 13. Duplicate-text ratio and the 40% flag

For the fullest page on the site (`old-raggy`, 3407 total rendered chars), the boilerplate
blocks alone account for **37.5%** of the page:

| Block | Chars |
|---:|---|
| `related-content` (4 same-section + 2 cross-section, bottom of page) | 245 |
| `.song-concepts-details` (curriculum concept tags, front-matter derived) | 238 |
| `.song-inline-cta` (subscribe form + copy) | 192 |
| `header.site-header` (nav) | 210 |
| `footer` | 173 |
| `.related-songs` block (4 same-activity songs) | 99 |
| `#sticky-email-bar` (subscribe form + copy) | 94 |
| `.song-details` (key/mode/meter) | 26 |
| **Sum** | **1277 / 3407 = 37.5%** |

That's the *best* page on the site. Using the fuller exclusion list from finding 12 (which also
drops the `<h1>` and the back-link), **28 of the 44 song pages have under 40% unique content**,
and the median page (`lucy-locket`) sits at 35%. Full per-page numbers are in the table above and
in the underlying data — happy to hand over the CSV if useful.

### 14. Internal link graph

Built from every rendered `<a href>` on all 289 built HTML pages (BFS from `/`, correcting for
the fact that `hugo --minify` drops attribute quotes, which silently broke a naive `href="..."`
regex on the first pass).

**Good news: the related-songs block is working.** All 42 listed song pages sit at click-depth
1–2 from the homepage, and **every single one has at least 3 inbound internal links** — most have
10–36. I don't have a "before" snapshot to compute exactly how many pages it moved *above* 3
(that work predates this session and was already merged on `growth`), but given the uniformly
healthy inbound counts across the whole listed set, it's clearly doing its job.

**What it structurally cannot reach:** `related-songs.html` explicitly filters out
`Params.unlisted`. Four song pages are `unlisted: true` — two are genuinely internal utility
pages (`audition-music`, `orff-homework`, not real lessons, correctly excluded) but **two are
real songs with real content that are completely orphaned**: `rain-on-the-green-grass` and
`roller-coaster` have zero inbound internal links and are unreachable by BFS from the homepage.
They're invisible to both users and crawlers. I don't know why they're marked unlisted — could be
intentional (incomplete/low-confidence entries) or a leftover flag. Flagging rather than
guessing; happy to un-list them if you confirm they're ready.

No page at depth > 2 among listed content; no orphans among listed content.

### 15. Sitemap submission, canonical/noindex hygiene, lastmod accuracy

- **Submission status**: can't check — no GSC API access, and I didn't try to use one.
- **Non-canonical or noindexed URLs in the sitemap**: checked all 126 sitemap URLs against their
  own rendered canonical tag — **all 126 are self-canonical**, and after adding the noindex
  mechanism, **zero overlap** between sitemap URLs and noindexed URLs. Clean.
- **Lastmod accuracy**: this was broken. `.Lastmod` was resolving to the front-matter `date:`
  field (effectively "publish date," frozen at authoring time), not anything that reflects real
  edits — I confirmed this directly: after editing `old-raggy.md`'s SEO fields today, the sitemap
  still reported its original April date until I fixed this. **Fixed** by adding
  `enableGitInfo = true`, which switches `.Lastmod` to the real last-commit timestamp per file
  (verified: an untouched page correctly still shows its old date, a page I touched shows
  today). One caveat: this requires full git history at build time. If Cloudflare Pages does a
  shallow clone, `lastmod` could be inaccurate for pages whose real last change falls outside the
  clone depth — worth a quick check in the Cloudflare Pages build settings.

---

## Song pages most likely to be "Crawled – currently not indexed"

Google's own definition for this status is a crawled-but-quality-rejected page, which tracks
directly with low unique-content ratio (finding 13) more than with links or metadata. Ranked by
unique content, weakest first — these are the strongest candidates:

1. **`/songs/blue-bird/`** — 0% unique. Root cause isn't just a thin body: it has *no*
   `sanitized_abc`, and with only one score the notation-panel partial's "single score, no
   braille" branch renders **zero static text** (just empty divs for client-side ABCJS to fill
   in later — see the template-gap note below). Body prose is also empty. After stripping
   boilerplate, literally nothing page-specific survives server-side.
2. **`/songs/draw-a-bucket-of-water/`** — same pattern: empty body, no braille, single score →
   zero static notation text.
3. **`/songs/rain-on-the-green-grass/`** — same pattern, *and* `unlisted: true` (see finding 14),
   so it may not even reach "crawled" — more likely stuck at "discovered" or dropping out
   entirely for lack of any inbound signal.
4. **`/songs/alley-alley-oh/`** (1.4% unique), **`/songs/cat-is-gone/`** (1.6%) — empty body
   prose; these do have real lyrics/notation data (confirmed by reading the raw ABC), but it's
   nested in `abc_scores` in a way that also doesn't render braille, so almost nothing textual
   survives.
5. **`/songs/peas-and-honey/`** and **`/songs/zoom-zoom-zoom-we-re-going-to-the-moon/`**
   (2.7–2.8%) — empty body prose, same no-braille template gap.
6. **`/songs/clapping-land/`** (6.6%) — body is a five-item bullet list of movement ideas and
   nothing else.
7. **`/songs/jjak-jjak-ggung/`** (12.5%), **`/songs/frog-in-the-meadow/`** (16.9%) — thin but not
   empty; a couple sentences of real prose.
8. **`/songs/roller-coaster/`** (28.3%, and also `unlisted: true` — same caveat as #3).

**A distinct, structural root cause worth flagging on its own**: the notation-panel partial
(`layouts/partials/notation-panel.html`) has a branch — "single score, no braille" — that
produces **no server-rendered text at all**, only empty containers ABCJS fills in client-side at
runtime. Every page above that has no `sanitized_abc` field and only one score hits this branch.
That's a real code gap, not just thin authoring, and it compounds the content-quality problem for
exactly the pages already weakest on prose. I didn't touch this template — it's a design
decision (should the tab label render even without braille? should braille become mandatory?)
that's outside an SEO-snippet task's scope, but it's worth knowing about before you decide how to
prioritize the bottom-quartile list above.

---

## What I did *not* do (explicitly out of scope this session)

- Steps 18's "propose contextual link placements" has nothing to propose — every listed song
  already clears 3 inbound links (finding 14). The two real orphans (`rain-on-the-green-grass`,
  `roller-coaster`) are orphaned by the `unlisted` flag, not by a link-placement gap; fixing that
  is a listing decision, not a link-insertion one.
- No pagination exists anywhere on the site (verified: zero `/page/N/` output, no template
  references `.Paginator`). I initially added a `.Paginator.PageNumber > 1` check to the noindex
  logic per the brief, but merely *referencing* `.Paginator` turned out to make Hugo generate a
  full `/page/N/` tree as a side effect — 248 new pages, the opposite of the goal. Reverted; left
  a comment explaining why, in case pagination gets added later.
- Did not rebuild the subscribe partial, honeypot, or `/subscribe/` page — per your steer, out of
  scope this round.
- Did not request indexing through any API, and did not add or expand content on any thin page.
