---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
unlisted: false
concepts: []
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
