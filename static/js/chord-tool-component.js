/* global React, ChordDiagram, chordA11yLabel */
const { useState, useEffect, useRef, useCallback } = React;

const INSTRUMENTS = {
  guitar:  { strings: 6, label: 'Guitar (6 strings)' },
  ukulele: { strings: 4, label: 'Ukulele (4 strings)' },
};

const FINGER_OPTS = ['', '1', '2', '3', '4', 'T'];

const COLOR_OPTS = [
  { value: 'charcoal', fill: '#2C2C2A', label: 'Black'  },
  { value: 'teal',     fill: '#0F6E56', label: 'Teal'   },
  { value: 'red',      fill: '#8B3A2A', label: 'Red'    },
  { value: 'blue',     fill: '#1D5FA8', label: 'Blue'   },
  { value: 'orange',   fill: '#A04A00', label: 'Orange' },
  { value: 'purple',   fill: '#6B3FA0', label: 'Purple' },
  { value: 'green',    fill: '#2E6B1F', label: 'Green'  },
  { value: 'pink',     fill: '#A8326E', label: 'Pink'   },
];

/* q = Google Fonts css2 family param; the same list is loaded in the layout <head> */
const FONT_OPTS = [
  { value: 'Inter',                 label: 'Inter',                 q: 'Inter:wght@400;500' },
  { value: 'Atkinson Hyperlegible', label: 'Atkinson Hyperlegible', q: 'Atkinson+Hyperlegible' },
  { value: 'Andika',                label: 'Andika',                q: 'Andika' },
  { value: 'Patrick Hand',          label: 'Patrick Hand',          q: 'Patrick+Hand' },
  { value: 'Merriweather',          label: 'Merriweather',          q: 'Merriweather' },
];

const PROG_GAP = 48;

function emptyShape(instKey) {
  const s = INSTRUMENTS[instKey].strings;
  return { strings: s, frets: 5, baseFret: 1, fingers: [], barres: [], nut: Array(s).fill(''), name: '', labelPos: 'top', dotSize: 'lg', dotColor: 'charcoal', font: 'Inter' };
}

function ChordTool() {
  const [instKey,      setInstKey]      = useState('ukulele');
  const [shape,        setShape]        = useState(() => ({ ...emptyShape('ukulele'), name: 'G' }));
  const [mode,         setMode]         = useState('finger');
  const [activeFinger, setActiveFinger] = useState('');
  const [activeColor,  setActiveColor]  = useState('charcoal');
  const [barreDraft,   setBarreDraft]   = useState(null);
  const [theme,        setTheme]        = useState('light');
  const [lineWeight,   setLineWeight]   = useState('med');
  const [library,      setLibrary]      = useState([]);
  const [liveMsg,      setLiveMsg]      = useState('');
  const [progIds,      setProgIds]      = useState(['', '', '']);
  const progRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mtim_chord_library');
      if (raw) setLibrary(JSON.parse(raw));
      const prog = localStorage.getItem('mtim_chord_progression');
      if (prog) setProgIds(JSON.parse(prog));
    } catch (e) {}
  }, []);

  const saveProg = (next) => {
    setProgIds(next);
    try { localStorage.setItem('mtim_chord_progression', JSON.stringify(next)); } catch (e) {}
  };

  const saveLibrary = (next) => {
    setLibrary(next);
    try { localStorage.setItem('mtim_chord_library', JSON.stringify(next)); } catch (e) {}
  };

  const renderShape = { ...shape, theme, lineWeight };

  const onCellClick = useCallback((s, f) => {
    if (mode === 'finger') {
      setShape(prev => {
        const idx = prev.fingers.findIndex(x => x.string === s && x.fret === f);
        let fingers;
        if (idx > -1) {
          /* toggle off — clicking an existing dot removes it */
          fingers = prev.fingers.filter((_, i) => i !== idx);
        } else {
          /* allow multiple fingers on the same string */
          fingers = [...prev.fingers, { string: s, fret: f, finger: activeFinger || undefined, color: activeColor }];
        }
        const barres = prev.barres.filter(b => !(b.fret === f && s >= Math.min(b.from, b.to) && s <= Math.max(b.from, b.to)));
        const nut = [...prev.nut]; nut[s] = '';
        setLiveMsg(idx > -1 ? `Removed dot on string ${prev.strings - s}, fret ${f}` : `Placed ${activeColor} dot on string ${prev.strings - s}, fret ${f}`);
        return { ...prev, fingers, barres, nut };
      });
    } else {
      if (!barreDraft || barreDraft.fret !== f) {
        setBarreDraft({ fret: f, from: s });
        setLiveMsg(`Barre start at string ${shape.strings - s}, fret ${f}. Click another string at the same fret to complete.`);
      } else {
        const from = Math.min(barreDraft.from, s);
        const to   = Math.max(barreDraft.from, s);
        if (from === to) { setBarreDraft(null); return; }
        setShape(prev => {
          const fingers = prev.fingers.filter(x => !(x.fret === f && x.string >= from && x.string <= to));
          const barres  = [...prev.barres.filter(b => b.fret !== f), { fret: f, from, to, finger: activeFinger || undefined, color: activeColor }];
          return { ...prev, fingers, barres };
        });
        setBarreDraft(null);
        setLiveMsg(`Barre placed at fret ${f}, ${to - from + 1} strings`);
      }
    }
  }, [mode, activeFinger, activeColor, barreDraft, shape.strings]);

  const onNutClick = useCallback((s) => {
    setShape(prev => {
      const cur  = prev.nut[s];
      const next = cur === '' ? 'O' : cur === 'O' ? 'X' : '';
      const nut  = [...prev.nut]; nut[s] = next;
      let fingers = prev.fingers, barres = prev.barres;
      if (next) {
        fingers = prev.fingers.filter(x => x.string !== s);
        barres  = prev.barres.filter(b => !(s >= b.from && s <= b.to));
      }
      setLiveMsg(`String ${prev.strings - s} ${next === 'O' ? 'open' : next === 'X' ? 'muted' : 'cleared'}`);
      return { ...prev, fingers, barres, nut };
    });
  }, []);

  const changeInstrument = (k) => {
    setInstKey(k);
    setShape(s => ({ ...emptyShape(k), name: s.name, frets: s.frets, baseFret: s.baseFret, labelPos: s.labelPos, dotSize: s.dotSize, font: s.font }));
    setBarreDraft(null);
  };

  const clearShape = () => {
    setShape(s => ({ ...emptyShape(instKey), name: s.name, frets: s.frets, baseFret: s.baseFret, labelPos: s.labelPos, dotSize: s.dotSize, font: s.font }));
    setBarreDraft(null);
    setLiveMsg('Cleared fretboard');
  };

  const saveCurrent = () => {
    const item = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), instrument: instKey, shape: { ...shape } };
    saveLibrary([item, ...library]);
    setLiveMsg(`Saved ${shape.name || 'untitled chord'} to library`);
  };

  const loadFromLibrary = (item) => {
    setInstKey(item.instrument);
    setShape({ ...emptyShape(item.instrument), ...item.shape });
    setBarreDraft(null);
    setLiveMsg(`Loaded ${item.shape.name || 'chord'} from library`);
  };

  const deleteFromLibrary = (id) => {
    saveLibrary(library.filter(x => x.id !== id));
    if (progIds.includes(id)) saveProg(progIds.map(x => x === id ? '' : x));
  };

  const fileName = (s) => (s || 'chord').replace(/[^a-z0-9]+/gi, '_');

  const canvasSvg = () => document.querySelector('.chord-tool-root .canvas-wrap svg');
  const exportSVG = () => exportSvgEl(canvasSvg(), fileName(shape.name), theme, 'svg');
  const exportPNG = (scale) => exportSvgEl(canvasSvg(), fileName(shape.name), theme, 'png', scale);

  const progItems = progIds.map(id => library.find(x => x.id === id)).filter(Boolean);
  const progName  = progItems.map(x => x.shape.name || 'chord').join(' to ');
  const progW     = progItems.length * 260 + (progItems.length - 1) * PROG_GAP;
  const progArrow = theme === 'dark' ? '#888780' : '#5F5E5A';
  const progSvg   = () => progRef.current && progRef.current.querySelector('svg');
  const presentProg = () => {
    const el = progRef.current;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  };

  const stringRef = useRef(null);
  const fretRef   = useRef(null);
  const placeFromInputs = () => {
    const s = parseInt(stringRef.current.value, 10);
    const f = parseInt(fretRef.current.value,   10);
    if (Number.isNaN(s) || Number.isNaN(f)) return;
    const idx = shape.strings - s;
    if (idx < 0 || idx >= shape.strings) return;
    if (f < 0 || f > shape.frets) return;
    if (f === 0) onNutClick(idx);
    else onCellClick(idx, f);
  };

  const overlineStyle  = { color: 'var(--mtim-teal)', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' };
  const mlStyle        = { marginLeft: 8 };
  const mtStyle        = { marginTop: 16 };
  const fullWidthStyle = { width: '100%' };

  return (
    <div className="page">
      <header className="tool-header">
        <p style={overlineStyle}>Tools</p>
        <h1>Chord diagram generator</h1>
        <p>Build chord diagrams for guitar or ukulele. Place multiple colored dots per string, draw barres, save your library, line up a 2 or 3 chord progression, and export as SVG or PNG.</p>
      </header>

      <div className="controls" role="group" aria-label="Diagram settings">
        <div className="field">
          <label htmlFor="inst">Instrument</label>
          <select id="inst" value={instKey} onChange={(e) => changeInstrument(e.target.value)}>
            {Object.entries(INSTRUMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cname">Chord name</label>
          <input id="cname" type="text" placeholder="e.g. G Major" value={shape.name} onChange={(e) => setShape(s => ({ ...s, name: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="bf">Starting fret</label>
          <input id="bf" type="number" min="1" max="20" value={shape.baseFret} onChange={(e) => setShape(s => ({ ...s, baseFret: Math.max(1, parseInt(e.target.value) || 1) }))} />
        </div>
        <div className="field">
          <label htmlFor="nf">Frets shown</label>
          <input id="nf" type="number" min="3" max="7" value={shape.frets} onChange={(e) => setShape(s => ({ ...s, frets: Math.min(7, Math.max(3, parseInt(e.target.value) || 5)) }))} />
        </div>
        <div className="field">
          <label htmlFor="ds">Dot size</label>
          <select id="ds" value={shape.dotSize} onChange={(e) => setShape(s => ({ ...s, dotSize: e.target.value }))}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="lp">Label position</label>
          <select id="lp" value={shape.labelPos} onChange={(e) => setShape(s => ({ ...s, labelPos: e.target.value }))}>
            <option value="top">Above</option>
            <option value="bottom">Below</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ct">Canvas</label>
          <select id="ct" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="lw">Line weight</label>
          <select id="lw" value={lineWeight} onChange={(e) => setLineWeight(e.target.value)}>
            <option value="thin">Thin</option>
            <option value="med">Medium</option>
            <option value="thick">Thick</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="fnt">Font</label>
          <select id="fnt" value={shape.font} onChange={(e) => setShape(s => ({ ...s, font: e.target.value }))}>
            {FONT_OPTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: `'${f.value}'` }}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mode-row" role="group" aria-label="Placement options">
        <span className="mode-label">Placement</span>
        <div className="seg" role="radiogroup" aria-label="Placement mode">
          <button type="button" role="radio" aria-pressed={mode === 'finger'} aria-checked={mode === 'finger'} onClick={() => { setMode('finger'); setBarreDraft(null); }}>Finger</button>
          <button type="button" role="radio" aria-pressed={mode === 'barre'}  aria-checked={mode === 'barre'}  onClick={() => setMode('barre')}>Barre</button>
        </div>

        <span className="mode-label" style={mlStyle}>Finger #</span>
        <div className="seg finger-row" role="radiogroup" aria-label="Finger number">
          {FINGER_OPTS.map(n => (
            <button key={n || 'none'} type="button" role="radio" aria-pressed={activeFinger === n} aria-checked={activeFinger === n} onClick={() => setActiveFinger(n)}>{n || '–'}</button>
          ))}
        </div>

        <span className="mode-label" style={mlStyle}>Color</span>
        <div className="color-swatch-row" role="radiogroup" aria-label="Dot color">
          {COLOR_OPTS.map(c => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-pressed={activeColor === c.value}
              aria-checked={activeColor === c.value}
              aria-label={c.label}
              className={'color-btn' + (activeColor === c.value ? ' active' : '')}
              style={{ backgroundColor: c.fill }}
              onClick={() => setActiveColor(c.value)}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            title="Custom color"
            className={'color-custom' + (activeColor[0] === '#' ? ' active' : '')}
            value={activeColor[0] === '#' ? activeColor : '#8B3A2A'}
            onChange={(e) => setActiveColor(e.target.value)}
            onClick={(e) => setActiveColor(e.target.value)}
          />
        </div>
      </div>

      <div className={'canvas-wrap' + (theme === 'dark' ? ' dark' : '')}>
        <ChordDiagram shape={renderShape} onCellClick={onCellClick} onNutClick={onNutClick} />
      </div>

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={clearShape}>Clear fretboard</button>
        <button type="button" className="btn btn-secondary" onClick={saveCurrent}>Save to library</button>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={exportSVG}>Export SVG</button>
        <button type="button" className="btn btn-primary" onClick={() => exportPNG(4)}>Export PNG (4×)</button>
        <button type="button" className="btn btn-primary" onClick={() => exportPNG(8)}>Export PNG (8×)</button>
      </div>

      <div className="help" role="note">
        <strong>How to use.</strong> Select a <strong>Color</strong> and optionally a <strong>Finger #</strong>, then click between frets to place a dot. Multiple dots per string are allowed. Click an existing dot to remove it. Click above the top line to cycle a string between open (○), muted (×), and blank. Switch to <strong>Barre</strong> mode and click two strings on the same fret to draw a barre. To practice chord changes, save chords to the library and pick them in <strong>Progression</strong> below.
      </div>

      <div className="controls" style={mtStyle} aria-label="Keyboard input">
        <div className="field">
          <label htmlFor="ks">String (1 = highest)</label>
          <input id="ks" ref={stringRef} type="number" min="1" max={shape.strings} placeholder="1" />
        </div>
        <div className="field">
          <label htmlFor="kf">Fret (0 = open)</label>
          <input id="kf" ref={fretRef} type="number" min="0" max={shape.frets} placeholder="0" onKeyDown={(e) => { if (e.key === 'Enter') placeFromInputs(); }} />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button type="button" className="btn btn-secondary" onClick={placeFromInputs}>Place / toggle</button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="live">{liveMsg}</div>

      <div className="library">
        <div className="library-head">
          <h2>Saved chords</h2>
          <span className="library-count">{library.length} {library.length === 1 ? 'chord' : 'chords'}</span>
        </div>
        {library.length === 0 ? (
          <div className="library-empty">No saved chords yet. Click <em>Save to library</em> to start a collection. Saved chords stay in this browser.</div>
        ) : (
          <div className="library-grid">
            {library.map(item => (
              <div className="lib-card" key={item.id}>
                <button type="button" className="delete" aria-label={`Delete ${item.shape.name || 'chord'}`} onClick={(e) => { e.stopPropagation(); deleteFromLibrary(item.id); }}>×</button>
                <div
                  onClick={() => loadFromLibrary(item)}
                  role="button" tabIndex="0"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadFromLibrary(item); } }}
                  aria-label={`Load ${chordA11yLabel(item.shape)}`}
                  style={fullWidthStyle}
                >
                  <ChordDiagram shape={{ ...item.shape, theme: 'light', lineWeight: 'med', name: '' }} interactive={false} focusable={false} />
                  <div className="name">{item.shape.name || '—'}</div>
                  <div className="meta">{INSTRUMENTS[item.instrument]?.label.split(' ')[0]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="library">
        <div className="library-head">
          <h2>Progression</h2>
          <span className="library-count">Pick 2 or 3 saved chords to show side by side</span>
        </div>
        <div className="controls" role="group" aria-label="Progression chords">
          {progIds.map((id, i) => (
            <div className="field" key={i}>
              <label htmlFor={'prog' + i}>Chord {i + 1}</label>
              <select id={'prog' + i} value={library.some(x => x.id === id) ? id : ''} onChange={(e) => saveProg(progIds.map((x, j) => j === i ? e.target.value : x))}>
                <option value="">None</option>
                {library.map(item => (
                  <option key={item.id} value={item.id}>{(item.shape.name || 'Untitled') + ' (' + INSTRUMENTS[item.instrument]?.label.split(' ')[0] + ')'}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {progItems.length < 2 ? (
          <div className="library-empty">{library.length < 2 ? 'Save at least 2 chords to the library to build a progression.' : 'Pick at least 2 chords above.'}</div>
        ) : (
          <>
            <div className={'canvas-wrap prog-wrap' + (theme === 'dark' ? ' dark' : '')} ref={progRef}>
              <svg viewBox={`0 0 ${progW} 380`} width={progW} height={380} role="img" aria-label={'Progression: ' + progName}>
                {progItems.map((item, i) => (
                  <g key={i} transform={`translate(${i * (260 + PROG_GAP)},0)`}>
                    <ChordDiagram shape={{ ...item.shape, theme, lineWeight }} interactive={false} focusable={false} />
                  </g>
                ))}
                {progItems.slice(1).map((_, i) => {
                  const cx = i * (260 + PROG_GAP) + 260 + PROG_GAP / 2;
                  return (
                    <g key={'arrow' + i} stroke={progArrow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
                      <line x1={cx - 30} y1={200} x2={cx + 30} y2={200} />
                      <polyline points={`${cx + 18},188 ${cx + 30},200 ${cx + 18},212`} />
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="actions" style={mtStyle}>
              <button type="button" className="btn btn-secondary" onClick={presentProg}>Present</button>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => exportSvgEl(progSvg(), fileName(progName), theme, 'svg')}>Export SVG</button>
              <button type="button" className="btn btn-primary" onClick={() => exportSvgEl(progSvg(), fileName(progName), theme, 'png', 4)}>Export PNG (4×)</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SVGNS = 'http://www.w3.org/2000/svg';

/* Inline the web fonts an SVG uses as data URLs, so exports keep the chosen font.
   Google Fonts' text= param subsets each font to just the glyphs used. */
async function embedFonts(svg) {
  const families = new Set([svg, ...svg.querySelectorAll('svg')].map(el => (el.style.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim()));
  const qs = FONT_OPTS.filter(f => families.has(f.value)).map(f => 'family=' + f.q);
  if (!qs.length) return;
  try {
    let css = await (await fetch(`https://fonts.googleapis.com/css2?${qs.join('&')}&text=${encodeURIComponent(svg.textContent)}`)).text();
    const urls = [...new Set(css.match(/https:[^)'"]+/g) || [])];
    for (const u of urls) {
      const blob = await (await fetch(u)).blob();
      const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      css = css.split(u).join(dataUrl);
    }
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = css;
    svg.insertBefore(style, svg.firstChild);
  } catch (e) { /* offline: export falls back to a system font */ }
}

async function exportSvgEl(svg, name, theme, format, scale = 4) {
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('rect[fill="transparent"]').forEach(r => r.remove());
  clone.removeAttribute('tabindex');
  clone.setAttribute('xmlns', SVGNS);
  const [, , w, h] = clone.getAttribute('viewBox').split(' ').map(Number);
  const bg = document.createElementNS(SVGNS, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', theme === 'dark' ? '#2C2C2A' : '#FFFFFF');
  clone.insertBefore(bg, clone.firstChild);
  await embedFonts(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  if (format === 'svg') return triggerDownload(new Blob([xml], { type: 'image/svg+xml' }), name + '.svg');
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => triggerDownload(b, name + '.png'));
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.ChordTool = ChordTool;
