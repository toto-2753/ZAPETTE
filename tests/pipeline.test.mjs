import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { parseM3U, splitTitle, writeM3U } from '../scripts/lib/m3u.mjs';
import { checkStream, hostPool, interleaveByHost, parseMaster, pool } from '../scripts/lib/hls-check.mjs';
import { buildCandidates, finalize, pickLogo } from '../scripts/lib/catalog.mjs';

// ---------- Serveur HLS de test ----------
const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
high/index.m3u8
`;
const MEDIA = (prefix = '') => `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:100
#EXTINF:6.0,
${prefix}seg100.ts
#EXTINF:6.0,
${prefix}seg101.ts
`;

let server;
let base;
const routes = {
  '/ok/master.m3u8': { body: MASTER, cors: true },
  '/ok/low/index.m3u8': { body: MEDIA(), cors: true },
  '/ok/high/index.m3u8': { body: MEDIA(), cors: true },
  '/ok/low/seg101.ts': { body: 'TS', type: 'video/mp2t', cors: true },
  '/ok/low/seg100.ts': { body: 'TS', type: 'video/mp2t', cors: true },
  '/media.m3u8': { body: MEDIA('/seg/'), cors: true },
  '/seg/seg101.ts': { body: 'TS', type: 'video/mp2t', cors: true },
  '/nocors/index.m3u8': { body: MEDIA(), cors: false },
  '/nocors/seg101.ts': { body: 'TS', type: 'video/mp2t', cors: false },
  '/mixed/index.m3u8': { body: MEDIA(), cors: true },
  '/mixed/seg101.ts': { body: 'TS', type: 'video/mp2t', cors: false },
  '/forbidden.m3u8': { status: 403, body: 'no' },
  '/html.m3u8': { body: '<html>ad</html>', type: 'text/html' },
  '/deadseg/index.m3u8': { body: MEDIA(), cors: true },
  '/drm/index.m3u8': {
    body: '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:6,\na.ts\n',
    cors: true,
  },
  '/aes/index.m3u8': { body: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:6,\na.ts\n', cors: true },
  '/aes/a.ts': { body: 'TS', type: 'video/mp2t', cors: true },
  '/dash.mpd': { body: '<?xml version="1.0"?><MPD></MPD>', type: 'application/dash+xml' },
  '/redirect.m3u8': { status: 302, location: '/media.m3u8' },
  '/backup-variant/master.m3u8': { body: MASTER, cors: true },
  '/backup-variant/high/index.m3u8': { body: MEDIA(), cors: true },
  '/backup-variant/high/seg101.ts': { body: 'TS', type: 'video/mp2t', cors: true },
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (p === '/slow.m3u8') return; // ne répond jamais
    const r = routes[p];
    if (!r) {
      res.writeHead(404);
      return res.end('not found');
    }
    const headers = { 'content-type': r.type || 'application/vnd.apple.mpegurl' };
    if (r.cors) headers['access-control-allow-origin'] = '*';
    if (r.location) headers.location = r.location;
    res.writeHead(r.status || 200, headers);
    res.end(r.body || '');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

describe('checkStream', () => {
  it('suit maître → variante → segment et relève la résolution', async () => {
    const r = await checkStream(`${base}/ok/master.m3u8`);
    expect(r.ok).toBe(true);
    expect(r.cors).toBe(true);
    expect(r.height).toBe(1080);
    expect(r.https).toBe(false);
  });
  it('accepte une playlist média directe et les redirections', async () => {
    expect((await checkStream(`${base}/media.m3u8`)).ok).toBe(true);
    expect((await checkStream(`${base}/redirect.m3u8`)).ok).toBe(true);
  });
  it('écarte un manifeste 404', async () => {
    const r = await checkStream(`${base}/missing.m3u8`);
    expect(r.ok).toBe(false);
    expect(r.restricted).toBe(false);
    expect(r.reason).toMatch(/404/);
  });
  it('marque 403 comme restreint (géo-blocage probable)', async () => {
    const r = await checkStream(`${base}/forbidden.m3u8`);
    expect(r.ok).toBe(false);
    expect(r.restricted).toBe(true);
  });
  it('détecte le timeout', async () => {
    const r = await checkStream(`${base}/slow.m3u8`, { timeout: 300 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('timeout');
  });
  it('refuse une page HTML et le DASH', async () => {
    expect((await checkStream(`${base}/html.m3u8`)).reason).toMatch(/not-hls/);
    expect((await checkStream(`${base}/dash.mpd`)).reason).toBe('dash-unsupported');
  });
  it("écarte un flux dont les segments n'existent plus", async () => {
    const r = await checkStream(`${base}/deadseg/index.m3u8`);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/segment http 404/);
  });
  it('détecte l’absence de CORS, même sur le seul segment', async () => {
    const a = await checkStream(`${base}/nocors/index.m3u8`);
    expect(a.ok).toBe(true);
    expect(a.cors).toBe(false);
    const b = await checkStream(`${base}/mixed/index.m3u8`);
    expect(b.ok).toBe(true);
    expect(b.cors).toBe(false);
  });
  it('écarte les DRM mais garde l’AES-128', async () => {
    expect((await checkStream(`${base}/drm/index.m3u8`)).reason).toBe('drm');
    expect((await checkStream(`${base}/aes/index.m3u8`)).ok).toBe(true);
  });
  it('essaie une autre variante si la première est morte', async () => {
    const r = await checkStream(`${base}/backup-variant/master.m3u8`);
    expect(r.ok).toBe(true);
  });
});

describe('outils', () => {
  it('parseMaster résout les URL relatives', () => {
    const v = parseMaster(MASTER, 'https://cdn.example/live/master.m3u8');
    expect(v[1].uri).toBe('https://cdn.example/live/high/index.m3u8');
    expect(v[1].height).toBe(1080);
  });
  it('pool borne la concurrence', async () => {
    let running = 0;
    let peak = 0;
    const out = await pool([1, 2, 3, 4, 5, 6], 2, async (x) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return x * 2;
    });
    expect(peak).toBe(2);
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
  });
  it('hostPool : plafond par serveur et pas de blocage par un serveur lent', async () => {
    const urls = [
      ...Array.from({ length: 12 }, (_, i) => `https://lent.example/${i}`),
      ...Array.from({ length: 12 }, (_, i) => `https://rapide.example/${i}`),
    ];
    const running = new Map();
    let peakSlow = 0;
    const finished = [];
    await hostPool(urls, { concurrency: 6, perHost: 2 }, async (u) => {
      const h = new URL(u).host;
      running.set(h, (running.get(h) || 0) + 1);
      if (h === 'lent.example') peakSlow = Math.max(peakSlow, running.get(h));
      await new Promise((r) => setTimeout(r, h === 'lent.example' ? 60 : 2));
      running.set(h, running.get(h) - 1);
      finished.push(h);
    });
    expect(finished).toHaveLength(24);
    expect(peakSlow).toBe(2);
    // Tous les liens rapides finissent avant la moitié des liens lents.
    const lastFast = finished.lastIndexOf('rapide.example');
    expect(finished.slice(0, lastFast + 1).filter((h) => h === 'lent.example').length).toBeLessThan(6);
  });
  it('interleaveByHost étale les serveurs', () => {
    const out = interleaveByHost(['https://a/1', 'https://a/2', 'https://a/3', 'https://b/1']);
    expect(out[0]).toBe('https://a/1');
    expect(out[1]).toBe('https://b/1');
    expect(out).toHaveLength(4);
  });
});

describe('M3U', () => {
  it('sépare nom, qualité et étiquettes', () => {
    expect(splitTitle('20 Minutes TV (1080p) [Not 24/7] [Geo-blocked]')).toEqual({
      name: '20 Minutes TV',
      quality: '1080p',
      labels: ['Not 24/7', 'Geo-blocked'],
    });
  });
  it('lit attributs, virgules entre guillemets et options VLC', () => {
    const list = parseM3U(`#EXTM3U
#EXTINF:-1 tvg-id="A.fr" tvg-logo="https://x/l,1.png" group-title="News",Chaîne A (720p)
https://a.example/a.m3u8
#EXTINF:-1 tvg-id="B.fr",Chaîne B
#EXTVLCOPT:http-referrer=https://site.example/
https://b.example/b.m3u8
`);
    expect(list).toHaveLength(2);
    expect(list[0].attrs['tvg-logo']).toBe('https://x/l,1.png');
    expect(list[0].name).toBe('Chaîne A');
    expect(list[0].quality).toBe('720p');
    expect(list[1].referrer).toBe('https://site.example/');
  });
  it('réécrit une playlist relisible', () => {
    const txt = writeM3U([{ tvgId: 'A.fr', name: 'A', logo: 'https://l', group: 'Info', quality: '720p', url: 'https://a/a.m3u8' }]);
    const back = parseM3U(txt);
    expect(back[0].url).toBe('https://a/a.m3u8');
    expect(back[0].attrs['group-title']).toBe('Info');
  });
});

describe('catalogue', () => {
  const api = {
    channels: [
      { id: 'A.fr', name: 'Alpha', alt_names: [], country: 'FR', categories: ['news'], is_nsfw: false, website: null },
      { id: 'N.us', name: 'Nope', alt_names: [], country: 'US', categories: ['xxx'], is_nsfw: true },
      { id: 'B.fr', name: 'Bloquée', alt_names: [], country: 'FR', categories: ['general'], is_nsfw: false },
    ],
    feeds: [{ channel: 'A.fr', id: 'French', name: 'French', is_main: true, languages: ['fra'] }],
    logos: [
      { channel: 'A.fr', feed: 'English', in_use: true, tags: [], width: 100, height: 100, format: 'JPEG', url: 'https://l/en.jpg' },
      { channel: 'A.fr', feed: null, in_use: true, tags: [], width: 512, height: 256, format: 'PNG', url: 'https://l/main.png' },
    ],
    blocklist: [{ channel: 'B.fr', reason: 'dmca' }],
    categories: [{ id: 'news' }, { id: 'general' }, { id: 'movies' }],
    streams: [
      { channel: 'A.fr', feed: 'French', title: 'Alpha', url: 'https://a/1.m3u8', quality: '720p', labels: [], user_agent: null, referrer: null },
      { channel: 'A.fr', feed: null, title: 'Alpha', url: 'https://a/2.m3u8', quality: '1080p', labels: ['Geo-blocked'], user_agent: null, referrer: null },
      { channel: 'A.fr', feed: null, title: 'Alpha', url: 'https://a/ref.m3u8', quality: null, labels: [], user_agent: null, referrer: 'https://x' },
      { channel: 'N.us', feed: null, title: 'Nope', url: 'https://n/1.m3u8', labels: [] },
      { channel: 'B.fr', feed: null, title: 'Bloquée', url: 'https://b/1.m3u8', labels: [] },
      { channel: null, feed: null, title: 'Sans fiche (480p)', url: 'http://c/1.m3u8', quality: '480p', labels: [] },
      { channel: 'A.fr', feed: null, title: 'Alpha', url: 'https://a/1.m3u8', labels: [] },
      { channel: 'A.fr', feed: null, title: 'Alpha', url: 'https://a/live.mpd', labels: [] },
    ],
  };
  const extra = parseM3U(`#EXTM3U
#EXTINF:-1 tvg-id="A.fr",Alpha (576p)
https://fork/a.m3u8
#EXTINF:-1 tvg-id="Old.fr" tvg-logo="https://l/old.png" group-title="Movies",Old Ciné
https://fork/old.m3u8
`);

  it('filtre NSFW, liste noire, Referer, DASH et doublons, fusionne le fork', () => {
    const { channels, skipped } = buildCandidates(api, extra);
    expect([...channels.keys()].sort()).toEqual(['A.fr', 'Old.fr', expect.stringMatching(/^x-/)].sort());
    expect(channels.get('A.fr').s.map((s) => s.u)).toEqual(['https://a/1.m3u8', 'https://a/2.m3u8', 'https://fork/a.m3u8']);
    expect(channels.get('A.fr').l).toBe('https://l/main.png');
    expect(channels.get('Old.fr')).toMatchObject({ c: 'FR', g: ['movies'], l: 'https://l/old.png' });
    expect(skipped).toMatchObject({ headers: 1, nsfw: 2, duplicate: 1, dash: 1 });
  });

  it('ne garde que les flux vivants ou restreints, triés', () => {
    const { channels } = buildCandidates(api, extra);
    const results = new Map([
      ['https://a/1.m3u8', { ok: true, https: true, cors: false, ms: 300 }],
      ['https://a/2.m3u8', { ok: true, https: true, cors: true, ms: 900 }],
      ['https://fork/a.m3u8', { ok: false, restricted: true, https: true }],
      ['https://fork/old.m3u8', { ok: false, restricted: false, reason: 'timeout' }],
      ['http://c/1.m3u8', { ok: true, https: false, cors: true, ms: 100 }],
    ]);
    const out = finalize(channels, results);
    expect(out.map((c) => c.id)).toEqual(['A.fr', expect.stringMatching(/^x-/)]);
    const a = out[0];
    expect(a.s.map((s) => s.u)).toEqual(['https://a/2.m3u8', 'https://a/1.m3u8', 'https://fork/a.m3u8']);
    expect(a.s[0]).toMatchObject({ h: 1, x: 1, q: '1080p', gb: 1 });
    expect(a.s[2]).toMatchObject({ r: 1 });
    expect(a.lg).toEqual(['fra']);
    expect(out[1].n).toBe('Sans fiche');
  });

  it('pickLogo préfère le logo principal en PNG', () => {
    expect(pickLogo(api.logos, 'French')).toBe('https://l/main.png');
    expect(pickLogo([], null)).toBe(null);
  });
});
