/**
 * abc-player-coordinator.js
 *
 * Global coordinator for one or more ABC notation players on a page.
 * Loaded once; individual shortcode instances call registerPlayer().
 *
 * Requires abcjs to be loaded before this script (synchronous <script> tags).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Key reference tables
     ------------------------------------------------------------------ */

  // Internal key name → semitone (0 = C, 1 = C#/Db, …, 11 = B)
  // Keys here match what abcjs getKeySignature() may return for root+acc.
  var KEY_SEMITONES = {
    'C':  0,  'B#': 0,
    'Db': 1,  'C#': 1,
    'D':  2,
    'Eb': 3,  'D#': 3,
    'E':  4,  'Fb': 4,
    'F':  5,  'E#': 5,
    'F#': 6,  'Gb': 6,
    'G':  7,
    'Ab': 8,  'G#': 8,
    'A':  9,
    'Bb': 10, 'A#': 10,
    'B':  11, 'Cb': 11
  };

  // Display order for the key dropdown — keeps enharmonic aliases together
  var KEY_OPTIONS = [
    { label: 'C',      value: 'C'  },
    { label: 'D\u266d', value: 'Db' },   // D♭
    { label: 'D',      value: 'D'  },
    { label: 'E\u266d', value: 'Eb' },   // E♭
    { label: 'E',      value: 'E'  },
    { label: 'F',      value: 'F'  },
    { label: 'F\u266f/G\u266d', value: 'F#' }, // F♯/G♭
    { label: 'G',      value: 'G'  },
    { label: 'A\u266d', value: 'Ab' },   // A♭
    { label: 'A',      value: 'A'  },
    { label: 'B\u266d', value: 'Bb' },   // B♭
    { label: 'B',      value: 'B'  }
  ];

  /* ------------------------------------------------------------------
     Coordinator state
     ------------------------------------------------------------------ */
  var _ready = false;
  var _queue = [];
  var _initialized = {};   // id → true

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */
  window.AbcPlayerCoordinator = {
    /**
     * Called by each player shortcode / demo inline script.
     * config: { id, abcElementId, controlsElementId, defaultTempo }
     */
    registerPlayer: function (config) {
      if (_initialized[config.id]) { return; }
      _initialized[config.id] = true;

      if (_ready) {
        _initPlayer(config);
      } else {
        _queue.push(config);
      }
    }
  };

  /* ------------------------------------------------------------------
     Coordinator boot — drain queue once ABCJS is confirmed available
     ------------------------------------------------------------------ */
  function _start() {
    if (typeof ABCJS === 'undefined') {
      console.error('AbcPlayerCoordinator: ABCJS not found. Load abcjs before abc-player-coordinator.js.');
      for (var e = 0; e < _queue.length; e++) {
        _showError(_queue[e].id, _queue[e].abcElementId, 'Score player could not be loaded.');
      }
      _queue = [];
      return;
    }
    _ready = true;
    for (var i = 0; i < _queue.length; i++) {
      _initPlayer(_queue[i]);
    }
    _queue = [];
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else {
    _start();
  }

  /* ==================================================================
     Per-player initialisation
     ================================================================== */
  function _initPlayer(config) {
    var player = {
      id:               config.id,
      abcElementId:     config.abcElementId,
      controlsElementId: config.controlsElementId,
      defaultTempo:     config.defaultTempo || 120,

      state:            'LOADING',
      abcText:          '',
      visualObj:        null,
      audioCtx:         null,
      synth:            null,
      timingCallbacks:  null,

      sourceKey:        'C',     // key name from K: field
      sourceKeySemitone: 0,
      currentKeyValue:  'C',    // currently selected key dropdown value
      octaveOffset:     0,      // semitone adjustment in multiples of 12
      currentBpm:       120,
      cursorEnabled:    true,
      cursorElems:      [],      // SVG elements highlighted as "current note"
      soundFontUrl:     config.soundFontUrl || '/soundfonts/'
    };

    // Grab DOM nodes
    var container    = document.getElementById(config.id);
    var scoreEl      = document.getElementById(config.abcElementId);
    var controlsEl   = document.getElementById(config.controlsElementId);

    if (!container || !scoreEl || !controlsEl) {
      console.error('AbcPlayerCoordinator: missing DOM elements for player', config.id);
      return;
    }

    // Cursor preference (data-cursor="false" disables highlighting)
    player.cursorEnabled = (container.dataset.cursor !== 'false');

    // Read ABC notation from the companion <script type="text/abc"> element
    var abcDataEl = document.getElementById('abc-data-' + config.id);
    if (!abcDataEl) {
      console.error('AbcPlayerCoordinator: no #abc-data-' + config.id + ' element found');
      return;
    }
    player.abcText = _decodeEntities(abcDataEl.textContent);

    // If this is a percussion staff (K:perc), inject drummap directives
    // that route every note letter to MIDI 38 (acoustic snare).
    // %%MIDI directives are audio-only — they have no effect on the
    // drawn score, so the notated rhythm pattern is preserved visually.
    if (/^K\s*:\s*perc/im.test(player.abcText)) {
      var snareMaps = ['A','B','C','D','E','F','G'].map(function (n) {
        return '%%MIDI drummap ' + n + ' 38';
      }).join('\n');
      player.abcText = player.abcText.replace(
        /^(X:\s*\d+[^\n]*\n)/m,
        '$1' + snareMaps + '\n'
      );
    }

    // ----------------------------------------------------------------
    // 1. Render score
    // ----------------------------------------------------------------
    _renderScore(player, scoreEl, 0);   // 0 = no transposition offset

    if (!player.visualObj) {
      _showError(player.id, player.abcElementId, 'Score could not be displayed.');
      return;
    }

    // ----------------------------------------------------------------
    // 2. Extract metadata
    // ----------------------------------------------------------------
    if (player.visualObj) {
      // Tempo — only trust getBpm() when the notation contains an explicit
      // Q: field. Without one, ABCJS returns 180 as a hardcoded default
      // which would override the per-score tempo set in frontmatter.
      var hasQField   = /^Q\s*:/im.test(player.abcText);
      var detectedBpm = (hasQField && player.visualObj.getBpm) ? player.visualObj.getBpm() : null;
      player.currentBpm = (detectedBpm && detectedBpm > 0)
        ? Math.round(detectedBpm)
        : player.defaultTempo;

      // Key
      try {
        var keySig = player.visualObj.getKeySignature();
        // keySig.root is e.g. "C", "D", "F"; keySig.acc is "" | "#" | "b"
        var root = keySig.root || 'C';
        var acc  = keySig.acc  || '';
        // Map abcjs acc format ('b' → 'b', '#' → '#') to our table ('Db', 'F#')
        var keyName = root + acc;
        if (KEY_SEMITONES.hasOwnProperty(keyName)) {
          player.sourceKey         = keyName;
          player.sourceKeySemitone = KEY_SEMITONES[keyName];
        }
        player.currentKeyValue = player.sourceKey;
      } catch (e) {
        console.warn('AbcPlayerCoordinator: could not extract key for', config.id, e);
      }
    }

    // ----------------------------------------------------------------
    // 3. Build controls HTML
    // ----------------------------------------------------------------
    _buildControls(player, controlsEl);

    // ----------------------------------------------------------------
    // 4. Ready
    // ----------------------------------------------------------------
    _setState(player, container, 'READY');
    // Persistent flag — never removed by _setState's state cycling.
    // Used by CSS to hide the fallback image for the lifetime of the page.
    container.classList.add('abc-player--initialized');
  }

  /* ------------------------------------------------------------------
     HTML entity decoder — undoes any escaping the template engine
     applied to the raw ABC text (e.g. &quot; → ", &amp; → &, etc.).
     Uses a textarea so no script execution or child DOM is involved.
     ------------------------------------------------------------------ */
  function _decodeEntities(str) {
    var el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  /* ------------------------------------------------------------------
     Error display — shown when ABCJS is missing or notation is invalid.
     Adds abc-player--error to the container and injects a message into
     the score element. The fallback image (if present) remains visible
     because abc-player--ready is never set.
     ------------------------------------------------------------------ */
  function _showError(playerId, scoreElId, message) {
    var container = document.getElementById(playerId);
    var scoreEl   = document.getElementById(scoreElId);
    if (container) { container.classList.add('abc-player--error'); }
    if (scoreEl) {
      var msg       = document.createElement('p');
      msg.className   = 'abc-player-error';
      msg.textContent = message;
      scoreEl.appendChild(msg);
    }
  }

  /* ------------------------------------------------------------------
     Score rendering (called on init and on each transposition)
     ------------------------------------------------------------------ */
  function _renderScore(player, scoreEl, semitoneOffset) {
    var opts = { add_classes: true };
    // visualTranspose shifts the SVG rendering.
    // %%MIDI transpose shifts the audio pitches (they are independent).
    var abcSource = player.abcText;
    if (semitoneOffset !== 0) {
      opts.visualTranspose = semitoneOffset;
      // Inject after the first X: line so abcjs picks it up for MIDI output.
      abcSource = abcSource.replace(
        /^(X:\s*\d+[^\n]*\n)/m,
        '$1%%MIDI transpose ' + semitoneOffset + '\n'
      );
    }
    var result = ABCJS.renderAbc(scoreEl.id, abcSource, opts);
    player.visualObj = result && result[0] ? result[0] : null;

    // Strip any abcjs selection classes so red highlights never appear
    // in the rendered score or in PNG exports.
    var selected = scoreEl.querySelectorAll('[class*="abcjs-note_selected"], [class*="abcjs-note-selected"]');
    for (var n = 0; n < selected.length; n++) {
      selected[n].classList.remove('abcjs-note_selected', 'abcjs-note-selected');
    }

    // Without a viewBox, max-width:100% in CSS scales the SVG's bounding
    // box but clips internal content on narrow screens. Adding viewBox lets
    // the SVG scale proportionally like an image.
    var svgs = scoreEl.querySelectorAll('svg');
    for (var s = 0; s < svgs.length; s++) {
      var svg = svgs[s];
      if (!svg.getAttribute('viewBox')) {
        var svgW = parseFloat(svg.getAttribute('width'));
        var svgH = parseFloat(svg.getAttribute('height'));
        if (svgW > 0 && svgH > 0) {
          svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
        }
      }
    }
  }

  /* ------------------------------------------------------------------
     Total semitone offset = key transposition + octave shift
     ------------------------------------------------------------------ */
  function _calcSemitoneOffset(player) {
    var keyOffset = (KEY_SEMITONES[player.currentKeyValue] !== undefined
      ? KEY_SEMITONES[player.currentKeyValue] : 0) - player.sourceKeySemitone;
    return keyOffset + (player.octaveOffset * 12);
  }

  /* ------------------------------------------------------------------
     Controls HTML injection
     ------------------------------------------------------------------ */
  function _buildControls(player, controlsEl) {
    var container = document.getElementById(player.id);

    // --- Play/Stop button ---
    var btn = document.createElement('button');
    btn.className   = 'abc-player-btn';
    btn.textContent = 'Play';
    btn.type        = 'button';

    // --- Audio hint (shown on WebAudio failure) ---
    var audioHint = document.createElement('span');
    audioHint.className = 'abc-player-audio-hint';
    audioHint.setAttribute('aria-live', 'polite');

    // --- Tempo ---
    var tempoWrap  = document.createElement('div');
    tempoWrap.className = 'abc-player-tempo';

    var tempoLabel = document.createElement('label');
    tempoLabel.textContent = 'Tempo';

    var tempoMinus = document.createElement('button');
    tempoMinus.type      = 'button';
    tempoMinus.className = 'abc-player-tempo-btn';
    tempoMinus.textContent = '−';
    tempoMinus.setAttribute('aria-label', 'Decrease tempo');

    var tempoDisplay = document.createElement('span');
    tempoDisplay.className   = 'abc-player-tempo-value';
    tempoDisplay.textContent = String(player.currentBpm);
    tempoDisplay.setAttribute('aria-live', 'polite');

    var tempoPlus = document.createElement('button');
    tempoPlus.type      = 'button';
    tempoPlus.className = 'abc-player-tempo-btn';
    tempoPlus.textContent = '+';
    tempoPlus.setAttribute('aria-label', 'Increase tempo');

    tempoWrap.appendChild(tempoLabel);
    tempoWrap.appendChild(tempoMinus);
    tempoWrap.appendChild(tempoDisplay);
    tempoWrap.appendChild(tempoPlus);

    // --- Key dropdown ---
    var keyWrap  = document.createElement('div');
    keyWrap.className = 'abc-player-key';

    var keyLabel = document.createElement('label');
    keyLabel.textContent = 'Key';
    keyLabel.setAttribute('for', 'key-' + player.id);

    var keySelect = document.createElement('select');
    keySelect.id  = 'key-' + player.id;

    for (var i = 0; i < KEY_OPTIONS.length; i++) {
      var opt = document.createElement('option');
      opt.value       = KEY_OPTIONS[i].value;
      opt.textContent = KEY_OPTIONS[i].label;
      if (KEY_OPTIONS[i].value === player.currentKeyValue) {
        opt.selected = true;
      }
      keySelect.appendChild(opt);
    }

    keyWrap.appendChild(keyLabel);
    keyWrap.appendChild(keySelect);

    // --- Octave selector ---
    var octaveWrap = document.createElement('div');
    octaveWrap.className = 'abc-player-octave';

    var octaveLabel = document.createElement('label');
    octaveLabel.textContent = 'Octave';
    octaveLabel.setAttribute('for', 'octave-' + player.id);

    var octaveSelect = document.createElement('select');
    octaveSelect.id = 'octave-' + player.id;

    var OCTAVE_OPTIONS = [
      { label: '\u22122', value: -2 },
      { label: '\u22121', value: -1 },
      { label: '0',       value:  0 },
      { label: '+1',      value:  1 },
      { label: '+2',      value:  2 }
    ];
    for (var j = 0; j < OCTAVE_OPTIONS.length; j++) {
      var octOpt = document.createElement('option');
      octOpt.value       = String(OCTAVE_OPTIONS[j].value);
      octOpt.textContent = OCTAVE_OPTIONS[j].label;
      if (OCTAVE_OPTIONS[j].value === 0) { octOpt.selected = true; }
      octaveSelect.appendChild(octOpt);
    }

    octaveWrap.appendChild(octaveLabel);
    octaveWrap.appendChild(octaveSelect);

    // --- Save score (PNG download) ---
    var dlBtn = document.createElement('button');
    dlBtn.className = 'abc-player-btn abc-player-btn--ghost';
    dlBtn.textContent = 'Save score';
    dlBtn.type = 'button';
    dlBtn.setAttribute('aria-label', 'Download score as PNG');
    dlBtn.addEventListener('click', function () {
      var scoreEl = document.getElementById(player.abcElementId);
      var svg = scoreEl.querySelector('svg');
      if (!svg) { return; }

      var clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      var svgW = parseFloat(svg.getAttribute('width'))  || svg.getBoundingClientRect().width;
      var svgH = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
      var scale = 2;

      var svgStr = new XMLSerializer().serializeToString(clone);
      var blob   = new Blob([svgStr], { type: 'image/svg+xml' });
      var url    = URL.createObjectURL(blob);

      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width  = svgW * scale;
        canvas.height = svgH * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FAFAF8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob(function (pngBlob) {
          var pngUrl = URL.createObjectURL(pngBlob);
          var a = document.createElement('a');
          a.href = pngUrl;
          var titleMatch = player.abcText.match(/^T:(.+)$/m);
          a.download = titleMatch
            ? titleMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'
            : 'score.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      };
      img.src = url;
    });

    // Assemble controls bar
    controlsEl.appendChild(btn);
    controlsEl.appendChild(audioHint);
    controlsEl.appendChild(tempoWrap);
    controlsEl.appendChild(keyWrap);
    controlsEl.appendChild(octaveWrap);

    // Save score lives outside controls so CSS can place it below the score
    dlBtn.className = 'abc-player-btn abc-player-btn--ghost abc-player-btn--save';
    container.appendChild(dlBtn);

    // ----------------------------------------------------------------
    // Event: Play / Stop
    // ----------------------------------------------------------------
    btn.addEventListener('click', function () {
      if (player.state === 'PLAYING') {
        _stopPlayback(player);
        _setState(player, container, 'READY');
      } else if (player.state === 'READY') {
        _startPlayback(player, container, btn);
      }
    });

    // ----------------------------------------------------------------
    // Event: Tempo +/- buttons
    // ----------------------------------------------------------------
    function _adjustTempo(delta) {
      var next = Math.min(200, Math.max(40, player.currentBpm + delta));
      if (next === player.currentBpm) { return; }
      player.currentBpm        = next;
      tempoDisplay.textContent = String(next);
      if (player.state === 'PLAYING') {
        _stopPlayback(player);
        _startPlayback(player, container, btn);
      }
    }

    tempoMinus.addEventListener('click', function () { _adjustTempo(-5); });
    tempoPlus.addEventListener('click',  function () { _adjustTempo(5);  });

    // ----------------------------------------------------------------
    // Event: Key selector
    // ----------------------------------------------------------------
    keySelect.addEventListener('change', function () {
      player.currentKeyValue = keySelect.value;
      _applyTransposition(player, container);
    });

    // ----------------------------------------------------------------
    // Event: Octave selector
    // ----------------------------------------------------------------
    octaveSelect.addEventListener('change', function () {
      player.octaveOffset = parseInt(octaveSelect.value, 10);
      _applyTransposition(player, container);
    });

    // Store references on the player object for use in playback functions
    player._btn           = btn;
    player._audioHint     = audioHint;
    player._tempoMinus    = tempoMinus;
    player._tempoPlus     = tempoPlus;
    player._tempoDisplay  = tempoDisplay;
    player._keySelect     = keySelect;
    player._octaveSelect  = octaveSelect;
    player._dlBtn         = dlBtn;
  }

  /* ------------------------------------------------------------------
     Apply key + octave transposition (shared by key and octave handlers)
     ------------------------------------------------------------------ */
  function _applyTransposition(player, container) {
    if (player.state === 'TRANSPOSING') { return; }
    _setState(player, container, 'TRANSPOSING');

    if (player.synth) {
      _stopPlayback(player);
    }

    var scoreEl = document.getElementById(player.abcElementId);
    _renderScore(player, scoreEl, _calcSemitoneOffset(player));

    _setState(player, container, 'READY');
  }

  /* ------------------------------------------------------------------
     State management
     ------------------------------------------------------------------ */
  function _setState(player, container, state) {
    player.state = state;

    // Replace state class
    var classes = container.className.split(' ').filter(function (c) {
      return !/^abc-player--/.test(c);
    });
    classes.push('abc-player--' + state.toLowerCase());
    container.className = classes.join(' ');

    var disabled = (state === 'LOADING' || state === 'TRANSPOSING');

    if (player._btn) {
      player._btn.disabled      = disabled;
      player._btn.textContent   = (state === 'PLAYING') ? 'Stop' : 'Play';
    }
    if (player._tempoMinus)   { player._tempoMinus.disabled   = disabled; }
    if (player._tempoPlus)    { player._tempoPlus.disabled    = disabled; }
    if (player._keySelect)    { player._keySelect.disabled    = disabled; }
    if (player._octaveSelect) { player._octaveSelect.disabled = disabled; }
    if (player._dlBtn)        { player._dlBtn.disabled        = disabled; }
  }

  /* ------------------------------------------------------------------
     Playback: start
     ------------------------------------------------------------------ */
  function _startPlayback(player, container, btn) {
    // AudioContext must be created inside a user-gesture handler
    if (!player.audioCtx) {
      try {
        player.audioCtx = new AudioContext();
      } catch (e) {
        console.error('AbcPlayerCoordinator: AudioContext unavailable for', player.id, e);
        _setAudioHint(player, 'Audio is not supported in this browser.');
        return;
      }
    }

    var resumePromise = (player.audioCtx.state === 'suspended')
      ? player.audioCtx.resume()
      : Promise.resolve();

    resumePromise.then(function () {
      if (!player.visualObj) { return; }

      var synth = new ABCJS.synth.CreateSynth();
      player.synth = synth;

      var msPerMeasure = _calcMsPerMeasure(player.visualObj, player.currentBpm);

      synth.init({
        visualObj:            player.visualObj,
        audioContext:         player.audioCtx,
        millisecondsPerMeasure: msPerMeasure,
        options: {
          soundFontUrl: player.soundFontUrl
        }
      }).then(function () {
        return synth.prime();
      }).then(function () {
        // Clear any previous audio hint on successful playback
        _setAudioHint(player, '');

        // Set state before starting so the button shows "Stop"
        _setState(player, container, 'PLAYING');

        // Always start timing callbacks so onFinished fires when playback
        // ends naturally — cursor highlighting is gated inside the callback.
        _startTimingCallbacks(player, container);

        synth.start();
      }).catch(function (err) {
        console.error('AbcPlayerCoordinator: synth error for', player.id, err);
        _setAudioHint(player, 'Audio could not be loaded. Check your connection.');
        _setState(player, container, 'READY');
      });
    }).catch(function (err) {
      console.error('AbcPlayerCoordinator: AudioContext resume error', err);
      _setAudioHint(player, 'Audio is blocked. Try interacting with the page first.');
    });
  }

  /* ------------------------------------------------------------------
     Audio hint — small inline message near the Play button
     ------------------------------------------------------------------ */
  function _setAudioHint(player, message) {
    if (!player._audioHint) { return; }
    player._audioHint.textContent = message;
  }

  /* ------------------------------------------------------------------
     Playback: stop
     ------------------------------------------------------------------ */
  function _stopPlayback(player) {
    if (player.timingCallbacks) {
      try { player.timingCallbacks.stop(); } catch (e) { /* ignore */ }
      player.timingCallbacks = null;
    }
    if (player.synth) {
      try { player.synth.stop(); } catch (e) { /* ignore */ }
      player.synth = null;
    }
    _clearCursor(player);
  }

  /* ------------------------------------------------------------------
     Timing callbacks for cursor highlighting
     ------------------------------------------------------------------ */
  function _startTimingCallbacks(player, container) {
    if (!ABCJS.TimingCallbacks) { return; }

    _clearCursor(player);
    // Standalone TimingCallbacks uses eventCallback — NOT the cursorControl
    // onEvent/onStart/onFinished names, which only apply when a SynthController
    // drives the callbacks. Passing the wrong keys silently disables highlighting.
    var callbacks = new ABCJS.TimingCallbacks(player.visualObj, {
      qpm:              player.currentBpm,
      beatSubdivisions: 2,
      eventCallback: function (ev) {
        if (ev === null) {
          // Null event signals the tune finished playing.
          _clearCursor(player);
          _stopPlayback(player);
          _setState(player, container, 'READY');
          return;
        }
        if (!player.cursorEnabled) { return; }
        _clearCursor(player);
        if (ev.elements) {
          // ev.elements is an array of arrays (one per staff/voice)
          for (var i = 0; i < ev.elements.length; i++) {
            var elems = ev.elements[i];
            if (!elems) { continue; }
            for (var j = 0; j < elems.length; j++) {
              if (elems[j]) {
                elems[j].classList.add('abcjs-highlight');
                player.cursorElems.push(elems[j]);
              }
            }
          }
        }
      }
    });

    player.timingCallbacks = callbacks;
    callbacks.start();
  }

  function _clearCursor(player) {
    for (var i = 0; i < player.cursorElems.length; i++) {
      if (player.cursorElems[i]) {
        player.cursorElems[i].classList.remove('abcjs-highlight');
      }
    }
    player.cursorElems = [];
  }

  /* ------------------------------------------------------------------
     Tempo → milliseconds per measure
     ------------------------------------------------------------------ */
  function _calcMsPerMeasure(visualObj, bpm) {
    // Q:1/4=bpm means quarter note = bpm beats per minute.
    // Duration of a whole note = 4 * (60000 / bpm) ms.
    // A measure of M:num/den lasts (num/den) whole notes.
    // So: msPerMeasure = 4 * (60000/bpm) * (num/den)
    var num = 4, den = 4;
    try {
      var meter = visualObj.getMeterFraction();
      if (meter && meter.num) { num = meter.num; }
      if (meter && meter.den) { den = meter.den; }
    } catch (e) { /* use 4/4 default */ }
    return 4 * (60000 / bpm) * (num / den);
  }

}());
