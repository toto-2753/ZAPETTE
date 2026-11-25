// Proxy HLS minimal pour Zapette — Cloudflare Workers (offre gratuite : 100 000 requêtes / jour).
//
// À quoi ça sert : sur PC et Android, un navigateur refuse de lire un flux dont le serveur
// n'envoie pas d'en-têtes CORS, ou qui est en http. Ce proxy récupère le flux pour toi,
// ajoute les en-têtes et réécrit les playlists pour que tout (variantes, segments, clés)
// passe par lui.
//
// Sécurité : définis la variable secrète TOKEN dans Cloudflare. Sans le bon jeton,
// le proxy refuse de servir (sinon n'importe qui pourrait s'en servir).

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Range',
  'access-control-expose-headers': 'Content-Length, Content-Range',
});

const text = (body, status) => new Response(body, { status, headers: { ...cors(), 'content-type': 'text/plain; charset=utf-8' } });

function proxify(origin, target, token) {
  const u = new URL(origin + '/');
  u.searchParams.set('url', target);
  if (token) u.searchParams.set('t', token);
  return u.href;
}

/** Réécrit chaque URI d'une playlist HLS (lignes et attributs URI="…") via `wrap`. */
export function rewritePlaylist(body, base, wrap) {
  const abs = (u) => {
    try {
      const full = new URL(u, base);
      return /^https?:$/.test(full.protocol) ? wrap(full.href) : u;
    } catch {
      return u;
    }
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`);
      return abs(t);
    })
    .join('\n');
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    const token = env.TOKEN || '';
    if (token && url.searchParams.get('t') !== token) return text('Jeton invalide', 403);
    if (url.pathname === '/health') return text('ok', 200);
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Méthode non autorisée', 405);

    const target = url.searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) return text('Paramètre « url » manquant', 400);

    const headers = new Headers({ 'User-Agent': UA, Accept: '*/*' });
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);

    let upstream;
    try {
      upstream = await fetch(target, { headers, redirect: 'follow' });
    } catch {
      return text('Source injoignable', 502);
    }

    const finalUrl = upstream.url || target;
    const type = upstream.headers.get('content-type') || '';
    let path = '';
    try {
      path = new URL(finalUrl).pathname;
    } catch {
      /* rien */
    }
    const out = new Headers(cors());

    if (upstream.ok && (/mpegurl/i.test(type) || /\.m3u8?$/i.test(path))) {
      const body = await upstream.text();
      if (body.replace(/^﻿/, '').trimStart().startsWith('#EXTM3U')) {
        out.set('content-type', 'application/vnd.apple.mpegurl');
        out.set('cache-control', 'no-cache');
        return new Response(rewritePlaylist(body, finalUrl, (u) => proxify(url.origin, u, token)), { status: 200, headers: out });
      }
      out.set('content-type', type || 'application/octet-stream');
      return new Response(body, { status: upstream.status, headers: out });
    }

    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
  },
};
