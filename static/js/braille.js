/* ═══════════════════════════════════════════════════════
   MUSIC BRAILLE ASCII TRANSLATOR
   Extracted from the standalone authoring tool.
   Public API: window.MusicBraille.renderBraille(abcString)
     → { ascii: string, unicode: string }
   ═══════════════════════════════════════════════════════ */

(function (global) {

// ── Note tables ─────────────────────────────────────────
const NOTE_TABLE = {
  eighth:  { C:'d', D:'e', E:'f', F:'g', G:'h', A:'i', B:'j' },
  quarter: { C:'?', D:':', E:'$', F:']', G:'\\',A:'[', B:'w' },
  half:    { C:'N', D:'O', E:'P', F:'Q', G:'R', A:'S', B:'T' },
  whole:   { C:'Y', D:'Z', E:'&', F:'=', G:'(', A:'!', B:')' },
};

const REST_TABLE = {
  eighth: '0', quarter: 'V', half: 'U', whole: 'M',
};

// Music Braille octave markers for octaves 1–7
const OCTAVE_MARKS = ['@', '^', '_', '"', '.', ';', ','];

const ACCIDENTAL_MAP = {
  '^':  '%',   // sharp
  '^^': '%%',  // double sharp (two cells)
  '_':  '<',   // flat
  '__': '<<',  // double flat
  '=':  '*',   // natural
};

const PITCH_STEP = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };

// GCD helper
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ── Unicode Braille lookup ──────────────────────────────
// Maps every ASCII music-braille character to its 6-dot Unicode braille cell.
// U+2800 base; cell value = Σ 2^(dotN-1).  Dots: 1=bit0 2=bit1 3=bit2 4=bit3 5=bit4 6=bit5
const ASCII_TO_UNICODE = {
  // ── Eighth notes (literary braille letters d–j) ──
  'd': '\u2819', // dots 1,4,5   C eighth
  'e': '\u2811', // dots 1,5     D eighth
  'f': '\u280B', // dots 1,2,4   E eighth
  'g': '\u281B', // dots 1,2,4,5 F eighth
  'h': '\u2813', // dots 1,2,5   G eighth
  'i': '\u280A', // dots 2,4     A eighth
  'j': '\u281A', // dots 2,4,5   B eighth

  // ── Quarter notes (+dot 6) ──
  '?': '\u2839', // dots 1,4,5,6   C quarter
  ':': '\u2831', // dots 1,5,6     D quarter
  '$': '\u282B', // dots 1,2,4,6   E quarter
  ']': '\u283B', // dots 1,2,4,5,6 F quarter
  '\\':'\u2833', // dots 1,2,5,6   G quarter
  '[': '\u282A', // dots 2,4,6     A quarter
  'w': '\u283A', // dots 2,4,5,6   B quarter

  // ── Half notes (+dot 3) ──
  'N': '\u281D', // dots 1,3,4,5   C half
  'O': '\u2815', // dots 1,3,5     D half
  'P': '\u280F', // dots 1,2,3,4   E half
  'Q': '\u281F', // dots 1,2,3,4,5 F half
  'R': '\u2817', // dots 1,2,3,5   G half
  'S': '\u280E', // dots 2,3,4     A half
  'T': '\u281E', // dots 2,3,4,5   B half

  // ── Whole notes (+dots 3 & 6) ──
  'Y': '\u283D', // dots 1,3,4,5,6   C whole
  'Z': '\u2835', // dots 1,3,5,6     D whole
  '&': '\u282F', // dots 1,2,3,4,6   E whole
  '=': '\u283F', // dots 1,2,3,4,5,6 F whole
  '(': '\u2837', // dots 1,2,3,5,6   G whole
  '!': '\u282E', // dots 2,3,4,6     A whole
  ')': '\u283E', // dots 2,3,4,5,6   B whole

  // ── Octave markers ──
  '@': '\u2808', // dot 4       octave 1
  '^': '\u2818', // dots 4,5    octave 2
  '_': '\u2838', // dots 4,5,6  octave 3
  '"': '\u2810', // dot 5       octave 4
  // '.' is shared: octave 5 marker AND augmentation dot (both = dots 4,6)
  '.': '\u2828', // dots 4,6
  ';': '\u2830', // dots 5,6    octave 6
  ',': '\u2820', // dot 6       octave 7

  // ── Accidentals ──
  '%': '\u2829', // dots 1,4,6  sharp
  '<': '\u2823', // dots 1,2,6  flat
  '*': '\u2821', // dots 1,6    natural

  // ── Rests ──
  '0': '\u2834', // dots 3,5,6  eighth rest
  'V': '\u2827', // dots 1,2,3,6 quarter rest
  'U': '\u2825', // dots 1,3,6  half rest
  'M': '\u280D', // dots 1,3,4  whole rest

  // ── Blank / barline ──
  ' ': '\u2800', // no dots     blank braille cell
};

/**
 * Convert an ASCII music-braille string to its Unicode braille equivalent.
 * Each ASCII character maps 1-to-1 with a 6-dot Unicode braille cell.
 * Unknown characters are passed through unchanged.
 */
function toUnicodeBraille(asciiStr) {
  return [...asciiStr].map(ch => ASCII_TO_UNICODE[ch] ?? ch).join('');
}

// ── 1. sanitizeABC ───────────────────────────────────────
function sanitizeABC(raw) {
  const KEEP_HEADERS = /^[KML]:/i;
  const DROP_HEADERS = /^[A-Z]:/i;  // any other header field

  const lines = raw.split('\n');
  const kept = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // Strip %% directives
    if (trimmed.startsWith('%%')) continue;

    // Strip lyric lines W: or w:
    if (/^[Ww]:/.test(trimmed)) continue;

    // Strip X: and T: header lines (and any other non K/M/L header)
    if (DROP_HEADERS.test(trimmed) && !KEEP_HEADERS.test(trimmed)) continue;

    // Strip inline quoted strings "..."
    let cleaned = trimmed.replace(/"[^"]*"/g, '');

    // Strip inline !...! style decorations
    cleaned = cleaned.replace(/![^!]*!/g, '');

    // Strip +...+ decorations (older ABC style)
    cleaned = cleaned.replace(/\+[^+]*\+/g, '');

    if (cleaned.trim() === '') continue;

    kept.push(cleaned.trim());
  }

  return kept.join('\n');
}

// ── 2. parseHeaders ─────────────────────────────────────
function parseHeaders(sanitized) {
  const headers = { L: [1, 8], K: 'C', M: '4/4' };
  const lines   = sanitized.split('\n');
  const noteLines = [];

  for (const line of lines) {
    const lm = line.match(/^L:\s*(\d+)\/(\d+)/i);
    if (lm) { headers.L = [parseInt(lm[1]), parseInt(lm[2])]; continue; }

    const km = line.match(/^K:\s*(.+)/i);
    if (km) {
      const kVal = km[1].trim();
      // First whitespace-delimited token is the key; the rest are modifiers (clef=, octave=, …)
      headers.K = kVal.split(/\s+/)[0];
      if (/clef\s*=\s*perc/i.test(kVal)) headers.rhythmic = true;
      continue;
    }

    const mm = line.match(/^M:\s*(\S+)/i);
    if (mm) { headers.M = mm[1]; continue; }

    // Not a header line — treat as note body
    noteLines.push(line);
  }

  return { headers, noteBody: noteLines.join(' ') };
}

// ── 3. lexer ────────────────────────────────────────────
function lexer(noteBodyStr) {
  const tokens = [];
  const src    = noteBodyStr;
  let   i      = 0;

  while (i < src.length) {
    const ch = src[i];

    // Whitespace — ignore
    if (/\s/.test(ch)) { i++; continue; }

    // Barlines  | || |] [| |: :|
    if (ch === '|' || ch === ':') {
      // consume barline characters
      let bl = ch; i++;
      while (i < src.length && /[|\]:]/.test(src[i])) { bl += src[i]; i++; }
      tokens.push({ type: 'barline', raw: bl });
      continue;
    }
    if (ch === '[') {
      // [| barline
      if (i + 1 < src.length && src[i+1] === '|') {
        tokens.push({ type: 'barline', raw: '[|' }); i += 2; continue;
      }
      // Inline header [X:value] — check before treating as chord
      const inlineHdr = src.slice(i).match(/^\[([A-Za-z]):(.*?)\]/);
      if (inlineHdr) {
        const hType = inlineHdr[1].toUpperCase();
        const hVal  = inlineHdr[2];
        if (hType === 'K') {
          // Emit a clef_change token so translateABC can update rhythmic state mid-piece
          tokens.push({ type: 'clef_change', rhythmic: /clef\s*=\s*perc/i.test(hVal) });
        }
        i += inlineHdr[0].length;
        continue;
      }
      // Chord [CEG] — skip to closing ]
      i++;
      while (i < src.length && src[i] !== ']') i++;
      i++; // skip ]
      continue;
    }

    // Tuplet marker (3 or (3:2:3 etc — skip
    if (ch === '(') {
      i++;
      while (i < src.length && /[\d:]/.test(src[i])) i++;
      continue;
    }

    // Accidentals: ^ _ = (and doubles ^^ __)
    let accidental = '';
    if ('^_='.includes(ch)) {
      accidental = ch; i++;
      if (i < src.length && src[i] === accidental && accidental !== '=') {
        accidental += src[i]; i++;
      }
    }

    // Note or rest pitch
    if (/[A-Ga-gz]/.test(src[i])) {
      const pitchChar = src[i]; i++;
      const isRest    = pitchChar === 'z' || pitchChar === 'Z';
      const isUpper   = pitchChar === pitchChar.toUpperCase();
      const basePitch = pitchChar.toUpperCase();

      // Base octave: uppercase = 3, lowercase = 4
      let octave = isUpper ? 3 : 4;

      // Octave modifiers: , = down, ' = up
      while (i < src.length && (src[i] === ',' || src[i] === "'")) {
        octave += (src[i] === "'") ? 1 : -1;
        i++;
      }

      // Duration numerator
      let durNum = 1;
      if (i < src.length && /\d/.test(src[i])) {
        durNum = 0;
        while (i < src.length && /\d/.test(src[i])) {
          durNum = durNum * 10 + parseInt(src[i]); i++;
        }
      }

      // Duration denominator (slash)
      let durDen = 1;
      if (i < src.length && src[i] === '/') {
        i++;
        if (i < src.length && /\d/.test(src[i])) {
          durDen = 0;
          while (i < src.length && /\d/.test(src[i])) {
            durDen = durDen * 10 + parseInt(src[i]); i++;
          }
        } else {
          durDen = 2; // bare / = /2
        }
      }

      // Broken rhythm > < (skip the modifier, keep both notes at stated dur)
      if (i < src.length && (src[i] === '>' || src[i] === '<')) i++;

      tokens.push({
        type:       isRest ? 'rest' : 'note',
        pitch:      basePitch,
        octave,
        accidental,
        durNum,
        durDen,
      });
      continue;
    }

    // Anything else (grace note braces, etc.) — skip
    i++;
  }

  return tokens;
}

// ── 4. OctaveStateMachine ───────────────────────────────
function createOctaveSM() {
  let prevPitch  = null;
  let prevOctave = null;

  return {
    reset() { prevPitch = null; prevOctave = null; },

    check(newPitch, newOctave) {
      // First note always gets a marker
      if (prevPitch === null) {
        prevPitch = newPitch; prevOctave = newOctave;
        return true;
      }

      const pos1 = prevOctave * 7 + PITCH_STEP[prevPitch];
      const pos2 = newOctave  * 7 + PITCH_STEP[newPitch];
      const interval = Math.abs(pos2 - pos1) + 1; // diatonic interval

      let needsMark;
      if (interval <= 3) {
        needsMark = false;                         // unison / 2nd / 3rd
      } else if (interval <= 5) {
        needsMark = (prevOctave !== newOctave);    // 4th / 5th: only if crosses boundary
      } else {
        needsMark = true;                          // 6th or wider: always
      }

      prevPitch  = newPitch;
      prevOctave = newOctave;
      return needsMark;
    },
  };
}

// ── 5. resolveDuration ──────────────────────────────────
function resolveDuration(token, baseL) {
  // Total duration as simplified fraction
  const totalNum = token.durNum * baseL[0];
  const totalDen = token.durDen * baseL[1];
  const g        = gcd(totalNum, totalDen);
  const n        = totalNum / g;
  const d        = totalDen / g;

  // Map fraction → { type, dots }
  const key = `${n}/${d}`;
  const map = {
    '1/1':  { type: 'whole',   dots: 0 },
    '3/2':  { type: 'whole',   dots: 1 }, // dotted whole
    '1/2':  { type: 'half',    dots: 0 },
    '3/4':  { type: 'half',    dots: 1 }, // dotted half
    '1/4':  { type: 'quarter', dots: 0 },
    '3/8':  { type: 'quarter', dots: 1 }, // dotted quarter
    '1/8':  { type: 'eighth',  dots: 0 },
    '3/16': { type: 'eighth',  dots: 1 }, // dotted eighth
    '1/16': { type: 'whole',   dots: 0 }, // 16th shares cell with whole (Music Braille Code)
    '3/32': { type: 'whole',   dots: 1 }, // dotted 16th
    '1/32': { type: 'half',    dots: 0 }, // 32nd shares cell with half
    '3/64': { type: 'half',    dots: 1 }, // dotted 32nd
    '1/64': { type: 'quarter', dots: 0 }, // 64th shares cell with quarter
  };
  if (!map[key]) {
    throw new Error(
      `Cannot translate duration ${n}/${d} to a Music Braille cell. ` +
      `Tuplets and irregular note lengths are not supported. ` +
      `Simplify the rhythm or check the ABC input.`
    );
  }
  return map[key];
}

// ── 6. brailleMapper ────────────────────────────────────
function brailleMapper(token, baseL, octaveSM, isRhythmic = false) {
  if (token.type === 'barline') return ' ';

  // Percussion / rhythmic notation: per Music Braille Code, all rhythmic events
  // are represented as 4th-octave C at the appropriate note value.
  // Accidentals are meaningless for unpitched content and are dropped.
  if (isRhythmic && token.type === 'note') {
    token = { ...token, pitch: 'C', octave: 4, accidental: '' };
  }

  if (token.type === 'rest') {
    const { type } = resolveDuration(token, baseL);
    const restChar = REST_TABLE[type];
    if (!restChar) throw new Error(`No braille rest character for duration type "${type}".`);
    return restChar;
  }

  // Note
  const { type, dots } = resolveDuration(token, baseL);
  const group = NOTE_TABLE[type];
  if (!group) {
    throw new Error(`Internal error: no braille note table for duration type "${type}".`);
  }

  const noteChar = group[token.pitch];
  if (!noteChar) {
    throw new Error(
      `Cannot map pitch "${token.pitch}" to a braille character. ` +
      `Expected one of: C D E F G A B.`
    );
  }

  // Octave marker
  let octaveMark = '';
  if (octaveSM.check(token.pitch, token.octave)) {
    const idx = token.octave - 1; // octaves 1–7 → index 0–6
    if (idx < 0 || idx > 6) {
      throw new Error(
        `Octave ${token.octave} (note ${token.pitch}${token.octave}) is outside the ` +
        `Music Braille range of octaves 1–7.`
      );
    }
    octaveMark = OCTAVE_MARKS[idx];
  }

  // Accidental (placed BEFORE the note in Music Braille)
  let accChar = '';
  if (token.accidental) {
    accChar = ACCIDENTAL_MAP[token.accidental];
    if (accChar === undefined) {
      throw new Error(
        `Unrecognized accidental "${token.accidental}" on note ${token.pitch}. ` +
        `Expected: ^ (sharp), _ (flat), = (natural), ^^ or __.`
      );
    }
  }

  // Augmentation dot (dots 4,6)
  const augDot = dots > 0 ? '.'.repeat(dots) : '';

  return octaveMark + accChar + noteChar + augDot;
}

// ── 7. translateABC ─────────────────────────────────────
function translateABC(raw) {
  // Step 1: Sanitize
  const sanitized = sanitizeABC(raw);

  // Step 2: Parse headers + note body
  const { headers, noteBody } = parseHeaders(sanitized);

  if (!noteBody.trim()) {
    throw new Error('No note content found after sanitization. Check your ABC input.');
  }

  // Step 3: Lex
  const tokens = lexer(noteBody);

  if (tokens.length === 0) {
    throw new Error('No notes or rests were found in the note body.');
  }

  // Step 4: Map tokens → braille characters
  const octaveSM = createOctaveSM();
  let isRhythmic = headers.rhythmic || false;
  let output = '';

  for (const token of tokens) {
    if (token.type === 'clef_change') {
      isRhythmic = token.rhythmic;
      octaveSM.reset(); // octave context is invalid across a clef change
      continue;
    }
    output += brailleMapper(token, headers.L, octaveSM, isRhythmic);
  }

  // Collapse runs of multiple spaces (consecutive barlines) into one
  output = output.replace(/ {2,}/g, ' ').trim();

  return { sanitized, headers, output };
}

// ── Public API ───────────────────────────────────────────
/**
 * Translate a sanitized ABC string to Music Braille.
 * @param {string} abcString — the sanitized_abc field value from the song record
 * @returns {{ ascii: string, unicode: string }}
 * @throws {Error} with a descriptive message if the notation cannot be processed
 */
function renderBraille(abcString) {
  const { output } = translateABC(abcString);
  return {
    ascii:   output,
    unicode: toUnicodeBraille(output),
  };
}

global.MusicBraille = { renderBraille };

}(window));
