/* ── Song Lyrics Extractor ──────────────────────────────────
   Parses ABC `w:` syllable lines from an embedded notation
   script tag and renders them into a collapsible panel.

   Runtime-only mockup. If adopted, this logic will move to a
   build-time script that writes a `lyrics` frontmatter field.
   ────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function cleanSyllableLine(raw) {
    var s = raw.replace(/\\-/g, '\u0000');        // protect literal hyphens
    s = s.replace(/~/g, ' ');                      // hard space
    s = s.replace(/(\w)-(\w)/g, '$1$2');           // syllable join
    s = s.replace(/(^|\W)-(?=\W|$)/g, '$1 ');      // stray dashes
    s = s.replace(/(^|\W)_(?=\W|$)/g, '$1 ');      // standalone hold
    s = s.replace(/_/g, '');                       // hold touching a word
    s = s.replace(/(^|\W)\*(?=\W|$)/g, '$1 ');     // skip marker
    s = s.replace(/\s*\|\s*/g, ' ');               // barline align
    s = s.replace(/\u0000/g, '-');                 // restore literal hyphens
    return s.replace(/\s+/g, ' ').trim();
  }

  function parseVerses(abc) {
    var groups = [];
    var current = [];
    var inBody = false;
    var lines = abc.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var stripped = line.trim();
      if (!stripped) continue;
      if (stripped.indexOf('K:') === 0) {
        inBody = true;
        if (current.length) { groups.push(current); current = []; }
        continue;
      }
      if (!inBody) continue;
      var m = line.match(/^\s*w:\s?(.*)$/);
      if (m) { current.push(cleanSyllableLine(m[1])); continue; }
      if (/^(%%|M:|L:|T:|C:|A:|X:|W:)/.test(stripped)) continue;
      if (current.length) { groups.push(current); current = []; }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  function assemble(groups) {
    if (!groups.length) return [];
    var n = 0;
    groups.forEach(function (g) { if (g.length > n) n = g.length; });
    var verses = [];
    for (var i = 0; i < n; i++) {
      var parts = [];
      for (var j = 0; j < groups.length; j++) {
        if (groups[j][i]) parts.push(groups[j][i]);
      }
      verses.push(parts.join('\n'));
    }
    return verses;
  }

  function stripVerseNumbers(verses) {
    return verses.map(function (verse, idx) {
      var prefix = new RegExp('^' + (idx + 1) + '\\.\\s*');
      return verse.split('\n').map(function (line) {
        return line.replace(prefix, '');
      }).join('\n');
    });
  }

  function findAbcWithLyrics(root) {
    var scripts = (root || document).querySelectorAll('script[type="text/abc"]');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent;
      if (text && /(^|\n)\s*w:/.test(text)) return text;
    }
    return null;
  }

  function render(mount, verses) {
    if (!verses.length) return;

    var details = document.createElement('details');
    details.className = 'lyrics-panel';

    var summary = document.createElement('summary');
    summary.className = 'lyrics-summary';
    var label = document.createElement('span');
    label.className = 'lyrics-summary-label';
    label.textContent = 'Lyrics';
    var count = document.createElement('span');
    count.className = 'lyrics-count';
    count.textContent = verses.length === 1
      ? '1 verse'
      : verses.length + ' verses';
    summary.appendChild(label);
    summary.appendChild(count);
    details.appendChild(summary);

    var body = document.createElement('div');
    body.className = 'lyrics-body';

    if (verses.length === 1) {
      var single = document.createElement('div');
      single.className = 'lyrics-verse';
      single.textContent = verses[0];
      body.appendChild(single);
    } else {
      var ol = document.createElement('ol');
      ol.className = 'lyrics-verses';
      verses.forEach(function (v) {
        var li = document.createElement('li');
        li.className = 'lyrics-verse';
        li.textContent = v;
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'lyrics-copy';
    copy.textContent = 'Copy lyrics';
    copy.addEventListener('click', function () {
      var text = verses.map(function (v, i) {
        return verses.length > 1 ? (i + 1) + '. ' + v : v;
      }).join('\n\n');
      navigator.clipboard.writeText(text).then(function () {
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy lyrics'; }, 1500);
      });
    });
    body.appendChild(copy);

    details.appendChild(body);
    mount.appendChild(details);
  }

  function init() {
    var mounts = document.querySelectorAll('.lyrics-panel-mount');
    if (!mounts.length) return;
    mounts.forEach(function (m) {
      var scope = m.closest('.song-notation-panel');
      var abc = findAbcWithLyrics(scope || document);
      if (!abc) return;
      var verses = stripVerseNumbers(assemble(parseVerses(abc)));
      render(m, verses);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
