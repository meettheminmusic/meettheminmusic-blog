# Soundfonts

abcjs uses soundfonts in the [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) format.
The player is configured to load them from `/soundfonts/` (i.e., `static/soundfonts/` in Hugo).

## What to download

Use the **abcjs branch** of midi-js-soundfonts, which ships pre-compressed files optimised for abcjs:

```
https://github.com/paulrosen/midi-js-soundfonts/tree/gh-pages/abcjs
```

You can clone just the required instrument(s) with a sparse checkout, or download individual folders
from the GitHub UI.

## Installed instruments

| Folder name                   | GM number | Used for                        |
|-------------------------------|-----------|----------------------------------|
| `acoustic_grand_piano-mp3`    | 0         | default pitched playback        |
| `percussion-mp3`              | —         | `K:perc` rhythmic notation      |

abcjs constructs soundfont URLs as `soundFontUrl + instrumentName + '-mp3/' + note + '.mp3'`,
so the folder name must include the `-mp3` suffix.

### Percussion behaviour

`K:perc` scores use MIDI channel 10. The coordinator automatically maps every
note letter (A–G) to MIDI note 38 (acoustic snare, `D2.mp3`) so rhythmic
notation plays consistently regardless of which note is written on the staff.
This is done via injected `%%MIDI drummap` directives and does not affect the
visual score.

Additional pitched instruments are only needed if your ABC tunes specify
`%%MIDI program N` with a non-zero program number.

## How to place them

After downloading, the directory tree should look like this:

```
static/
  soundfonts/
    README.md                             ← this file
    acoustic_grand_piano-mp3/
      A0.mp3                              ← one file per note
      A1.mp3
      ...
```

The Hugo static folder maps directly to the site root, so
`static/soundfonts/acoustic_grand_piano-mp3/A4.mp3` is served as
`/soundfonts/acoustic_grand_piano-mp3/A4.mp3` — which matches the
`soundFontUrl: '/soundfonts/'` setting in `abc-player-coordinator.js`.

## Quick download (sparse checkout)

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/paulrosen/midi-js-soundfonts.git
cd midi-js-soundfonts
git sparse-checkout set abcjs/acoustic_grand_piano-mp3
cp -r abcjs/acoustic_grand_piano-mp3 ../static/soundfonts/
```
