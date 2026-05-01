/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ── Color palette — shared with chord-tool-component ── */
const DOT_FILLS_LIGHT = { charcoal: '#2C2C2A', teal: '#0F6E56', red: '#8B3A2A', blue: '#1D5FA8' };
const DOT_FILLS_DARK  = { charcoal: '#FAFAF8', teal: '#5DCAA5', red: '#E8816E', blue: '#7EB0E8' };

/* ── ChordDiagram — pure SVG renderer ──
   shape: { strings, frets, fingers:[{string,fret,finger?,color?}],
            barres:[{fret,from,to,finger?,color?}], nut:['','O','X'],
            baseFret, name, dotSize:'sm'|'md'|'lg',
            lineWeight:'thin'|'med'|'thick',
            dotColor:'charcoal'|'teal'|'red'|'blue',   ← shape-level fallback
            theme:'light'|'dark', labelPos:'top'|'bottom' }
   ── */
function ChordDiagram({ shape, onCellClick, onNutClick, interactive = true, focusable = true }) {
  const W = 260, H = 380;
  const ml = 40, mr = 40;
  const mt = shape.labelPos === 'top' ? 70 : 56;
  const mb = shape.labelPos === 'bottom' ? 56 : 36;
  const gw = W - ml - mr;
  const gh = H - mt - mb;
  const ss = gw / (shape.strings - 1);
  const fs = gh / shape.frets;
  const dotR  = shape.dotSize === 'lg' ? 14 : shape.dotSize === 'sm' ? 9 : 11.5;
  const lineW = shape.lineWeight === 'thick' ? 2.4 : shape.lineWeight === 'thin' ? 1.2 : 1.6;
  const nutW  = shape.baseFret > 1 ? lineW : Math.max(lineW * 3, 5);

  const lineColor    = shape.theme === 'dark' ? '#888780' : '#2C2C2A';
  const labelColor   = shape.theme === 'dark' ? '#FAFAF8' : '#2C2C2A';
  const nutMarkColor = shape.theme === 'dark' ? '#FAFAF8' : '#2C2C2A';

  /* Per-dot color resolution — falls back to shape.dotColor, then charcoal */
  const fills = shape.theme === 'dark' ? DOT_FILLS_DARK : DOT_FILLS_LIGHT;
  const resolveFill = (colorKey) => fills[colorKey || shape.dotColor] || fills.charcoal;
  const resolveText = (colorKey) => {
    if (shape.theme !== 'dark') return '#FAFAF8';
    const k = colorKey || shape.dotColor;
    return k === 'teal' ? '#04342C' : '#2C2C2A';
  };

  const stringX = (i) => ml + i * ss;
  const fretY   = (f) => mt + f * fs;
  const dotY    = (f) => fretY(f) - fs / 2;
  const titleY  = shape.labelPos === 'top' ? mt - 36 : H - 28;

  const cells = [];
  if (interactive) {
    for (let s = 0; s < shape.strings; s++) {
      for (let f = 1; f <= shape.frets; f++) {
        cells.push({ s, f, x: stringX(s) - ss / 2 + 1, y: fretY(f - 1), w: ss - 2, h: fs });
      }
    }
  }

  const svgStyle = { background: 'transparent', fontFamily: 'Inter, sans-serif' };
  const ptrStyle = { cursor: 'pointer' };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role={interactive ? 'application' : 'img'}
      aria-label={chordA11yLabel(shape)}
      tabIndex={focusable ? 0 : -1}
      style={svgStyle}
    >
      {shape.name && (
        <text x={W / 2} y={titleY} textAnchor="middle" fontSize="22" fontWeight="500" fill={labelColor} letterSpacing="-0.01em">{shape.name}</text>
      )}

      {shape.nut && shape.nut.map((m, i) => {
        if (!m) return null;
        const x = stringX(i), y = mt - 14;
        if (m === 'O') return <circle key={'n'+i} cx={x} cy={y} r="5.5" fill="none" stroke={nutMarkColor} strokeWidth="1.5" />;
        return (
          <g key={'n'+i} stroke={nutMarkColor} strokeWidth="1.6" strokeLinecap="round">
            <line x1={x-4.5} y1={y-4.5} x2={x+4.5} y2={y+4.5} />
            <line x1={x-4.5} y1={y+4.5} x2={x+4.5} y2={y-4.5} />
          </g>
        );
      })}

      {shape.baseFret > 1 && (
        <text x={ml - 10} y={mt + fs / 2 + 4} textAnchor="end" fontSize="11" fontWeight="500" fill={labelColor}>{shape.baseFret}fr</text>
      )}

      {Array.from({ length: shape.frets + 1 }).map((_, i) => {
        const isNut = i === 0 && shape.baseFret === 1;
        return <line key={'fret'+i} x1={ml} y1={fretY(i)} x2={W - mr} y2={fretY(i)} stroke={lineColor} strokeWidth={isNut ? nutW : lineW} strokeLinecap="butt" />;
      })}
      {shape.baseFret > 1 && <line x1={ml} y1={mt} x2={W - mr} y2={mt} stroke={lineColor} strokeWidth={lineW} />}

      {Array.from({ length: shape.strings }).map((_, i) => (
        <line key={'str'+i} x1={stringX(i)} y1={mt} x2={stringX(i)} y2={mt + gh} stroke={lineColor} strokeWidth={lineW} />
      ))}

      {/* Barres — rendered below fingers so fingers draw on top */}
      {shape.barres && shape.barres.map((b, i) => {
        const fill = resolveFill(b.color);
        const text = resolveText(b.color);
        const x1 = stringX(b.from), x2 = stringX(b.to), y = dotY(b.fret);
        return (
          <g key={'b'+i}>
            <rect x={Math.min(x1,x2) - dotR} y={y - dotR} width={Math.abs(x2-x1) + dotR*2} height={dotR*2} rx={dotR} fill={fill} />
            {b.finger ? <text x={(x1+x2)/2} y={y+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={dotR + 1} fontWeight="500" fill={text}>{b.finger}</text> : null}
          </g>
        );
      })}

      {/* Fingers — each gets its own color */}
      {shape.fingers.map((f, i) => {
        const fill = resolveFill(f.color);
        const text = resolveText(f.color);
        return (
          <g key={'f'+i}>
            <circle cx={stringX(f.string)} cy={dotY(f.fret)} r={dotR} fill={fill} />
            {f.finger ? <text x={stringX(f.string)} y={dotY(f.fret)+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={dotR + 1} fontWeight="500" fill={text}>{f.finger}</text> : null}
          </g>
        );
      })}

      {interactive && cells.map(c => (
        <rect key={'c'+c.s+'-'+c.f} x={c.x} y={c.y} width={c.w} height={c.h} fill="transparent" style={ptrStyle} onClick={(e) => onCellClick && onCellClick(c.s, c.f, e)} />
      ))}
      {interactive && Array.from({ length: shape.strings }).map((_, i) => (
        <rect key={'nz'+i} x={stringX(i) - ss/2 + 1} y={mt - 28} width={ss - 2} height={28} fill="transparent" style={ptrStyle} onClick={(e) => onNutClick && onNutClick(i, e)} />
      ))}

      <text x={W / 2} y={H - 5} textAnchor="middle" fontSize="8" fontWeight="400" fill={labelColor} opacity="0.3" letterSpacing="0.02em">MeetThemInMusic.com</text>
    </svg>
  );
}

function chordA11yLabel(shape) {
  const inst = { 4: 'ukulele', 6: 'guitar' }[shape.strings] || `${shape.strings}-string instrument`;
  const parts = [`${shape.name || 'Untitled'} chord on ${inst}`];
  if (shape.baseFret > 1) parts.push(`starting at fret ${shape.baseFret}`);
  shape.nut.forEach((m, i) => {
    if (m === 'O') parts.push(`string ${shape.strings - i} open`);
    if (m === 'X') parts.push(`string ${shape.strings - i} muted`);
  });
  shape.fingers.forEach(f => {
    parts.push(`string ${shape.strings - f.string} fret ${f.fret}${f.finger ? ' finger ' + f.finger : ''}${f.color && f.color !== 'charcoal' ? ' (' + f.color + ')' : ''}`);
  });
  shape.barres.forEach(b => {
    parts.push(`barre at fret ${b.fret} from string ${shape.strings - b.from} to string ${shape.strings - b.to}`);
  });
  return parts.join(', ');
}

window.ChordDiagram   = ChordDiagram;
window.chordA11yLabel = chordA11yLabel;
window.DOT_FILLS_LIGHT = DOT_FILLS_LIGHT;
window.DOT_FILLS_DARK  = DOT_FILLS_DARK;
