---
title: "Slides shortcode reference"
date: 2026-04-15
draft: false
unlisted: true
---

The `slides` shortcode creates a text-based slideshow inside any song library entry or page. Slides are separated by `---` on its own line. Navigation works by clicking the prev/next buttons, pressing the arrow keys (when the slideshow has focus), or using the fullscreen button for projection.

---

## Basic syntax

```
{{</* slides */>}}
# First slide heading

Any supporting text goes here.

---

# Second slide heading

More text, a list, whatever you need.

---

# Third slide
{{</* /slides */>}}
```

---

## Typography

Headings and text follow the site's color rules inside a slide:

| Element | Appearance |
|---|---|
| `# H1` | Teal, 1.75rem — use for the main point of a slide |
| `## H2` | Charcoal, 1.375rem — use for subheadings |
| `### H3` | Charcoal, slightly smaller |
| Plain paragraph | Charcoal body text |
| `**bold**` | Works normally |
| Bullet list | Left-aligned, centered in the frame |

---

## Live examples

### A few-words-per-slide set

{{< slides >}}
# Pass the Beat

A passing game for the whole class

---

# Setup

Sit in a circle\
left hand out, palm up

---

# To pass the beat

Move your **right hand**\
over to your left neighbor's hand

---

# When you hear "Five"

Pull your hand back\
before it's clapped!
{{< /slides >}}

---

### Using H2 for secondary detail

{{< slides >}}
# Tonic

## The home base of a key

The note everything wants to return to.

---

# So-Mi

## A falling minor third

The most natural interval for young voices.

---

# Pentatonic scale

## Five notes, no half steps

Easy to sing, hard to get wrong.
{{< /slides >}}

---

### A bullet list slide

{{< slides >}}
# Adaptations

- Slow the tempo for K–1
- Use hand signs instead of passing
- Shorten the song to one phrase

---

# Materials needed

- No instruments required
- Optional: steady beat props (beanbags, claves)
{{< /slides >}}

---

## Keyboard shortcuts

Once you click into the slideshow, these keys work:

| Key | Action |
|---|---|
| `→` or `↓` | Next slide |
| `←` or `↑` | Previous slide |
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen |

---

## Fullscreen / projection mode

Click the expand icon in the controls bar. In fullscreen, font sizes scale up substantially (H1 → 3.5rem, paragraphs → 1.625rem) so the slide reads clearly from the back of a room. Press `Escape` or `F` to exit.

---

## Tips

- A line break inside a slide without starting a new paragraph: end the line with `\` (backslash). Hugo renders this as `<br>`.
- Keep each slide to one idea. The centered layout works best with short, punchy text.
- The `---` separator must be on its own line with blank lines above and below it, just like a standard markdown horizontal rule.
- H1 is teal — use it for the concept or keyword. H2 is charcoal — use it for the definition or context. This two-level hierarchy reads well at a glance.
