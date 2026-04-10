---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
unlisted: false
musical_concepts: []
social_concepts: []
movement_concepts: []
supports_adaptations: []
keys: []
modes: []
meters: []
source: ""
source_url: ""
card_image: ""
# ABC notation (optional). Paste multi-line ABC using YAML block scalar (|).
# abc_image: ""   # optional fallback image shown if the player fails to load
abc_notation: ""
abc_tempo: 120
# sanitized_abc: A clean copy of the ABC notation used for Music Braille translation.
# Remove before saving: %% directive lines, w:/W: lyric lines, all header lines except
# K: M: L:, inline "quoted" chord labels, and !style! or +decoration+ markers.
# Keep: K: (with clef=perc if present), M:, L:, and all note/rest/barline content.
# sanitized_abc: ""
# Multiple scores (optional). Each item needs a label and notation field.
# abc_scores:
#   - label: "Full score"
#     notation: |
#       X:1
#       ...
#     image: ""   # optional fallback image for this score
#   - label: "Rhythm only"
#     notation: |
#       X:1
#       ...
#     image: ""
---
