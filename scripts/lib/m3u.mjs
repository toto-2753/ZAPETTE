// Lecture / écriture de playlists M3U (format iptv-org et playlists classiques).

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

/** Sépare « Nom (1080p) [Not 24/7] » en nom, qualité et étiquettes. */
export function splitTitle(raw = '') {
  let title = raw.trim();
  const labels = [];
  title = title.replace(/\s*\[([^\]]+)\]/g, (_, l) => {
    labels.push(l.trim());
    return '';
  });
  let quality = null;
  title = title.replace(/\s*\((\d{3,4}[pi])\)/i, (_, q) => {
    quality = q.toLowerCase();
    return '';
  });
  return { name: title.trim(), quality, labels };
}

/**
 * Parse une playlist M3U étendue.
 * Retourne [{ url, title, name, quality, labels, attrs, referrer, userAgent }]
 */
export function parseM3U(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const comma = findTitleComma(line);
      const head = comma >= 0 ? line.slice(0, comma) : line;
      const title = comma >= 0 ? line.slice(comma + 1) : '';
      const attrs = {};
      for (const m of head.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = m[2];
      cur = {
        title: title.trim(),
        attrs,
        referrer: attrs['http-referrer'] || attrs['referrer'] || null,
        userAgent: attrs['http-user-agent'] || attrs['user-agent'] || null,
      };
      continue;
    }
    if (line.startsWith('#EXTVLCOPT:')) {
      if (!cur) continue;
      const opt = line.slice('#EXTVLCOPT:'.length);
      const eq = opt.indexOf('=');
      if (eq < 0) continue;
      const key = opt.slice(0, eq).trim().toLowerCase();
      const val = opt.slice(eq + 1).trim();
      if (key === 'http-referrer') cur.referrer = val;
      if (key === 'http-user-agent') cur.userAgent = val;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (cur) {
      const { name, quality, labels } = splitTitle(cur.title);
      out.push({ url: line, ...cur, name, quality, labels });
      cur = null;
    }
  }
  return out;
}

// La virgule qui sépare les attributs du titre est la première hors guillemets.
function findTitleComma(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) return i;
  }
  return -1;
}

const esc = (v) => String(v ?? '').replace(/"/g, "'");

/** Écrit une playlist M3U lisible par VLC, Kodi, TiviMate, IPTV Smarters… */
export function writeM3U(entries, { epgUrl } = {}) {
  const head = epgUrl ? `#EXTM3U url-tvg="${esc(epgUrl)}"` : '#EXTM3U';
  const body = entries.map((e) => {
    const attrs = [
      e.tvgId ? `tvg-id="${esc(e.tvgId)}"` : '',
      e.logo ? `tvg-logo="${esc(e.logo)}"` : '',
      e.group ? `group-title="${esc(e.group)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const title = e.quality ? `${e.name} (${e.quality})` : e.name;
    return `#EXTINF:-1${attrs ? ' ' + attrs : ''},${String(title).replace(/[\r\n]/g, ' ')}\n${e.url}`;
  });
  return [head, ...body].join('\n') + '\n';
}
