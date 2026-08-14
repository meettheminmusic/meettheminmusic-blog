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
];

function emptyShape(instKey) {
  const s = INSTRUMENTS[instKey].strings;
  return { strings: s, frets: 5, baseFret: 1, fingers: [], barres: [], nut: Array(s).fill(''), name: '', labelPos: 'top', dotSize: 'md', dotColor: 'charcoal' };
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mtim_chord_library');
      if (raw) setLibrary(JSON.parse(raw));
    } catch (e) {}
  }, []);

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
    setShape(s => ({ ...emptyShape(k), name: s.name, frets: s.frets, baseFret: s.baseFret, labelPos: s.labelPos, dotSize: s.dotSize }));
    setBarreDraft(null);
  };

  const clearShape = () => {
    setShape(s => ({ ...emptyShape(instKey), name: s.name, frets: s.frets, baseFret: s.baseFret, labelPos: s.labelPos, dotSize: s.dotSize }));
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
    setShape(item.shape);
    setBarreDraft(null);
    setLiveMsg(`Loaded ${item.shape.name || 'chord'} from library`);
  };

  const deleteFromLibrary = (id) => saveLibrary(library.filter(x => x.id !== id));

  const exportSVG = () => {
    const svg = document.querySelector('.chord-tool-root .canvas-wrap svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('rect[fill="transparent"]').forEach(r => r.remove());
    clone.removeAttribute('tabindex');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bgFill = theme === 'dark' ? '#2C2C2A' : '#FFFFFF';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', bgFill);
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    triggerDownload(new Blob([xml], { type: 'image/svg+xml' }), `${(shape.name || 'chord').replace(/[^a-z0-9]+/gi, '_')}.svg`);
  };

  const exportPNG = (scale = 4) => {
    const svg = document.querySelector('.chord-tool-root .canvas-wrap svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('rect[fill="transparent"]').forEach(r => r.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 260 * scale;
      c.height = 380 * scale;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = theme === 'dark' ? '#2C2C2A' : '#FFFFFF';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => triggerDownload(b, `${(shape.name || 'chord').replace(/[^a-z0-9]+/gi, '_')}.png`));
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
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
        <p>Build chord diagrams for guitar or ukulele. Place multiple colored dots per string, draw barres, save your library, and export as SVG or PNG.</p>
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
        <strong>How to use.</strong> Select a <strong>Color</strong> and optionally a <strong>Finger #</strong>, then click between frets to place a dot. Multiple dots per string are allowed. Click an existing dot to remove it. Click above the top line to cycle a string between open (○), muted (×), and blank. Switch to <strong>Barre</strong> mode and click two strings on the same fret to draw a barre.
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
    </div>
  );
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.ChordTool = ChordTool;
