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
| `percussion-mp3`              | —         | percussion (`K:perc` + Orff `clef=perc` voices) |
| `celesta-mp3`                 | 8         | Orff bordun: Celesta            |
| `glockenspiel-mp3`            | 9         | Orff bordun: Glockenspiel       |
| `vibraphone-mp3`              | 11        | Orff bordun: Metallophone       |
| `marimba-mp3`                 | 12        | Orff bordun: Marimba            |
| `xylophone-mp3`               | 13        | Orff bordun: Xylophone          |

The Orff instruments back the bordun voice in combined arrangements (see the Ostinato Builder's
instrument list). Their GM program numbers must match the `%%MIDI program N` written into a song's
`abc_notation`; the folder name must match the GM instrument name abcjs requests for that program.

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

## Authoring a combined Orff arrangement

A song can play melody + Orff accompaniment from a single `abc_notation` (or one `abc_scores`
entry) as a multi-voice score. The song library player detects the `clef=perc` voice and **hides its
key/octave controls** (transposing would corrupt the drum voices, whose `%%MIDI transpose` is a drum
selector).

> **Voice order matters.** abcjs 6.4.4 only routes a `clef=perc` voice to the drum kit (MIDI channel
> 10) when **no pitched voice is defined before it**. So every percussion voice must come first in
> `%%score` and in the voice body, with the pitched voices (melody, bordun) after. This is why the
> percussion staff sits on top. Put a pitched voice first and the drums silently play as piano.

Fastest path: build the bordun + percussion in the **Ostinato Builder**, click **Copy ABC** (it
already emits percussion-first), then append the song's melody as a pitched voice after them. Keep
the frontmatter `sanitized_abc` field as the melody line only, so the Braille panel stays clean.

Template (see `content/songs/obwisana.md` for a live example):

```
X:1
T:Song title
M:4/4
L:1/8
Q:100
%%score [V1 V2 V3]
V:V1 clef=perc stafflines=1 stem=up name="Hand Drum" %% percussion FIRST (routes to drum kit)
V:V2 clef=treble name="Voice"                        %% melody
V:V3 clef=treble name="Marimba"                      %% pitched bordun
K:C
V:V1
%%MIDI transpose -8                                  %% (GM drum note − 71); e.g. hand drum 63 → -8
B2 B2 B2 B2|]                                         %% always write 'B'; transpose picks the sound
V:V2
%%MIDI program 0                                     %% melody on piano
<melody notes>|]
w: song-ly-rics here
V:V3
%%MIDI program 12                                    %% GM program from the table above
[C,G,]4 [C,G,]4|]                                    %% pentatonic bordun
```

Every voice must total the same number of beats per bar. GM drum notes for the percussion voices
are listed in the Ostinato Builder source (`PERC_SOUNDS`).

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
