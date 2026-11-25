#!/usr/bin/env node
// Tests de bout en bout dans un vrai Chrome, avec de vrais flux HLS servis en local.
// Usage : npm run build && node e2e/run.mjs [--hls-dir /tmp/hls] [--chrome /usr/bin/google-chrome]
//
// Prérequis : deux flux HLS de test (voir e2e/make-streams.sh) dans <hls-dir>/good et <hls-dir>/two.
import http from 'node:http';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { encryptCatalog, saltFor, ITERATIONS } from '../scripts/lib/vault.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    'hls-dir': { type: 'string', default: '/tmp/hls' },
    chrome: { type: 'string', default: process.env.CHROME_PATH || '/usr/bin/google-chrome' },
    headed: { type: 'boolean', default: false },
  },
});
const OUT = path.join(root, 'e2e/.out');
const SITE = path.join(OUT, 'site');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m3u': 'audio/x-mpegurl',
  '.ts': 'video/mp2t',
};

function staticServer(dir, { cors = () => false, hook } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (hook && (await hook(url, req, res))) return;
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('nope');
      const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' };
      if (cors(url)) headers['access-control-allow-origin'] = '*';
      res.writeHead(200, headers);
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, cors(url) ? { 'access-control-allow-origin': '*' } : {});
      res.end('not found');
    }
  });
}

const listen = (srv) => new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv.address().port)));

function logoSvg(text, color, bg = 'none') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200" fill="${bg}"/><text x="200" y="125" font-family="Arial, sans-serif" font-weight="700" font-size="${text.length > 9 ? 52 : 68}" text-anchor="middle" fill="${color}">${text}</text></svg>`;
}

function posterSvg(title, hue) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513" viewBox="0 0 342 513"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${hue + 40},60%,15%)"/></linearGradient></defs><rect width="342" height="513" fill="url(#g)"/><text x="24" y="440" font-family="Arial" font-weight="700" font-size="34" fill="#fff">${title}</text></svg>`;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('  ✓', name);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log('  ✗', name, '\n     ', e.message.split('\n')[0]);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(path.join(root, 'dist'), SITE, { recursive: true });

  // ---------- Serveur de flux (autre origine) ----------
  const hlsDir = path.resolve(args['hls-dir']);
  const logos = new Map();
  const streamSrv = staticServer(hlsDir, {
    cors: (u) => !u.pathname.startsWith('/nocors/'),
    hook: async (url, _req, res) => {
      const m = /^\/(cors|nocors)(\/.*)$/.exec(url.pathname);
      if (m) {
        // /cors/good/index.m3u8 → <hls>/good/index.m3u8
        const file = path.join(hlsDir, m[2]);
        try {
          const body = await readFile(file);
          const h = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
          if (m[1] === 'cors') h['access-control-allow-origin'] = '*';
          res.writeHead(200, h);
          res.end(body);
        } catch {
          res.writeHead(404, m[1] === 'cors' ? { 'access-control-allow-origin': '*' } : {});
          res.end();
        }
        return true;
      }
      if (url.pathname.startsWith('/logo/')) {
        const svg = logos.get(url.pathname.slice(6));
        res.writeHead(svg ? 200 : 404, { 'content-type': 'image/svg+xml' });
        res.end(svg || '');
        return true;
      }
      if (url.pathname.startsWith('/dead/')) {
        res.writeHead(404, { 'access-control-allow-origin': '*' });
        res.end('gone');
        return true;
      }
      return false;
    },
  });
  const sp = await listen(streamSrv);
  const S = `http://127.0.0.1:${sp}`;

  // ---------- Catalogue de test ----------
  const good = { u: `${S}/cors/good/index.m3u8`, q: '720p', x: 1, ms: 120 };
  const two = { u: `${S}/cors/two/index.m3u8`, q: '720p', x: 1, ms: 140 };
  const L = (id, text, color, bg) => {
    logos.set(id + '.svg', logoSvg(text, color, bg));
    return `${S}/logo/${id}.svg`;
  };
  const channels = [
    { id: 'France2.fr', n: 'France 2', l: L('f2', 'France 2', '#d61f26'), c: 'FR', g: ['general'], lg: ['fra'], s: [{ u: `${S}/dead/france2.m3u8`, q: '1080p', x: 1 }, good] },
    { id: 'arte.fr', n: 'Arte', l: L('arte', 'arte', '#f15a24'), c: 'FR', g: ['culture'], lg: ['fra'], s: [two] },
    { id: 'Franceinfo.fr', n: 'franceinfo', l: L('fi', 'info', '#ffd400', '#1f2f8f'), c: 'FR', g: ['news'], lg: ['fra'], s: [good] },
    { id: 'TestCine.fr', n: 'Test Ciné', l: L('cine', 'CINÉ', '#ffffff'), c: 'FR', g: ['movies'], lg: ['fra'], s: [two] },
    { id: 'TestSeries.fr', n: 'Test Séries', l: L('series', 'Séries+', '#7b2cbf'), c: 'FR', g: ['series'], lg: ['fra'], s: [good] },
    { id: 'Morte.fr', n: 'Chaîne Morte', l: L('morte', 'MORTE', '#333'), c: 'FR', g: ['general'], lg: ['fra'], s: [{ u: `${S}/dead/a.m3u8`, x: 1 }, { u: `${S}/dead/b.m3u8`, x: 1 }] },
    { id: 'NoCors.fr', n: 'Sans CORS', c: 'FR', g: ['general'], lg: ['fra'], s: [{ u: `${S}/nocors/good/index.m3u8` }] },
  ];
  const fillers = [
    ['Planète Doc', 'documentary', 'FR', '#0b6e4f'],
    ['Kids Club', 'kids', 'FR', '#ff6b00'],
    ['Sport Direct', 'sports', 'FR', '#00a3e0'],
    ['Musique Max', 'music', 'FR', '#e0007a'],
    ['Info Monde', 'news', 'FR', '#c1121f'],
    ['Cinéma Classique', 'movies', 'FR', '#222222'],
    ['Polar TV', 'series', 'FR', '#6a040f'],
    ['Lyon Local', 'general', 'FR', '#3a86ff'],
    ['Global News', 'news', 'US', '#14213d'],
    ['Action Movies', 'movies', 'US', '#d00000'],
    ['Comedy Nights', 'series', 'UK', '#ffbe0b'],
    ['Noticias 24', 'news', 'ES', '#e63946'],
    ['Deutsche Welle Test', 'news', 'DE', '#0077b6'],
    ['Cucina Italia', 'cooking', 'IT', '#2a9d8f'],
    ['Ocean Life', 'documentary', 'US', '#00b4d8'],
    ['Retro Hits', 'music', 'UK', '#9d4edd'],
    ['Cartoon Fun', 'animation', 'US', '#fb5607'],
    ['Racing Zone', 'sports', 'IT', '#ff006e'],
    ['Bollywood Box', 'movies', 'IN', '#f77f00'],
    ['Telenovela Plus', 'series', 'MX', '#ef476f'],
  ];
  fillers.forEach(([n, g, c, color], i) => {
    const id = n.replace(/\W+/g, '') + '.' + c.toLowerCase();
    channels.push({
      id,
      n,
      l: i % 5 === 3 ? undefined : L('filler' + i, n.split(' ')[0], i === 6 ? '#ffffff' : color),
      c,
      g: [g],
      lg: [c === 'FR' ? 'fra' : c === 'ES' || c === 'MX' ? 'spa' : c === 'DE' ? 'deu' : c === 'IT' ? 'ita' : c === 'IN' ? 'hin' : 'eng'],
      s: [i % 2 ? two : good],
    });
  });
  const catalog = {
    v: 1,
    generatedAt: new Date(Date.now() - 2 * 3600e3).toISOString(),
    checked: true,
    stats: { tested: 26556, alive: 14210, restricted: 1390, dead: 10956, cors: 9120, channels: channels.length, streams: 40, seconds: 610 },
    channels,
  };
  await mkdir(path.join(SITE, 'data'), { recursive: true });
  await writeFile(path.join(SITE, 'data/channels.json'), JSON.stringify(catalog));

  const siteSrv = staticServer(SITE);
  const port = await listen(siteSrv);
  const APP = `http://localhost:${port}/`;
  console.log(`Site ${APP} — flux ${S}`);

  const browser = await chromium.launch({
    executablePath: args.chrome,
    headless: !args.headed,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });

  // TMDB simulé (le bac à sable n'a pas accès à internet).
  const tmdbItems = ['Le Grand Large', 'Nuit Blanche', 'Les Phares', 'Mistral', 'Calanques', 'Dernier Train', 'Les Voisins', 'Hiver Rouge'].map((t, i) => ({
    id: 100 + i,
    title: t,
    name: t,
    poster_path: `/p${i}.svg`,
    backdrop_path: `/b${i}.svg`,
    release_date: `2026-11-${String(10 + i).padStart(2, '0')}`,
    first_air_date: `2026-0${(i % 8) + 1}-02`,
    vote_average: 6.2 + i * 0.3,
    overview: 'Un résumé de test pour vérifier la mise en page de la fiche.',
    media_type: i % 2 ? 'tv' : 'movie',
  }));
  async function mockExternal(context) {
    await context.route('https://www.gstatic.com/**', (r) => r.abort());
    await context.route('https://api.themoviedb.org/**', (route) => {
      const u = new URL(route.request().url());
      let body = { results: tmdbItems };
      if (/\/(movie|tv)\/\d+$/.test(u.pathname)) {
        const item = tmdbItems.find((x) => u.pathname.endsWith('/' + x.id)) ?? tmdbItems[0];
        body = {
          ...item,
          genres: [{ name: 'Drame' }, { name: 'Aventure' }],
          runtime: 118,
          tagline: 'La mer ne pardonne rien.',
          credits: { cast: [{ name: 'Actrice Une' }, { name: 'Acteur Deux' }] },
          videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc123', name: 'Bande-annonce', iso_639_1: 'fr', official: true }] },
          'watch/providers': {
            results: {
              FR: {
                link: 'https://www.themoviedb.org/movie/100/watch?locale=FR',
                free: [{ provider_id: 1, provider_name: 'Arte', logo_path: '/arte.svg', display_priority: 1 }],
                flatrate: [{ provider_id: 2, provider_name: 'Plateforme A', logo_path: '/pa.svg', display_priority: 2 }],
                rent: [{ provider_id: 3, provider_name: 'Location B', logo_path: '/lb.svg', display_priority: 3 }],
              },
            },
          },
        };
      }
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
    await context.route('https://image.tmdb.org/**', (route) => {
      const name = route.request().url().split('/').pop();
      const i = Number(/\d+/.exec(name)?.[0] ?? 0);
      route.fulfill({ status: 200, contentType: 'image/svg+xml', body: posterSvg(name.startsWith('b') ? '' : tmdbItems[i]?.title ?? '', i * 37) });
    });
  }

  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const videoTime = (page) => page.evaluate(() => document.querySelector('.player-video')?.currentTime ?? 0);

  // =================== Ordinateur ===================
  console.log('\nOrdinateur (1440×900)');
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mockExternal(desk);
  const page = await desk.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('zp.init')) {
      sessionStorage.setItem('zp.init', '1');
      localStorage.setItem('zp.settings', JSON.stringify({ probe: false, heroPreview: false }));
    }
  });
  await page.goto(APP);

  await check('accueil : bandeau et rangées', async () => {
    await page.waitForSelector('.hero-title', { timeout: 15000 });
    const rows = await page.$$eval('.row-head h2', (h) => h.map((x) => x.textContent));
    assert(rows.includes('La TNT'), `rangées: ${rows.join(', ')}`);
    assert(rows.includes('Info en continu'), 'rangée info absente');
  });
  await check('numérotation TNT (France 2 = 2, Arte = 7, franceinfo = 16)', async () => {
    const nums = await page.$$eval('.row:first-of-type .tile', (t) => t.map((x) => x.getAttribute('aria-label')));
    for (const want of ['France 2, chaîne 2', 'Arte, chaîne 7', 'franceinfo, chaîne 16']) assert(nums.includes(want), `${want} absent de ${nums.join(' | ')}`);
  });
  await page.waitForTimeout(800);
  await shot(page, 'desktop-home');

  await check('lecture : source 1 morte → bascule auto sur la source 2', async () => {
    await page.click('.tile[aria-label="France 2, chaîne 2"]');
    await page.waitForSelector('.player', { timeout: 5000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /Source 1 indisponible/.test(t.textContent)), null, { timeout: 20000 });
    await page.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1.5, null, { timeout: 20000 });
  });
  await check('le lien mort est mémorisé sur l’appareil', async () => {
    const dead = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('zp.dead') || '{}')));
    assert(dead.some((u) => u.endsWith('/dead/france2.m3u8')), `zp.dead = ${dead}`);
  });
  await page.mouse.move(700, 450);
  await page.waitForTimeout(400);
  await shot(page, 'desktop-player');

  await check('zapping ↑ vers la chaîne suivante', async () => {
    const before = await page.evaluate(() => location.hash);
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction((b) => location.hash !== b, before, { timeout: 5000 });
    await page.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1, null, { timeout: 20000 });
  });
  await check('taper « 7 » ouvre Arte', async () => {
    await page.keyboard.press('7');
    await page.waitForFunction(() => location.hash.includes('arte.fr'), null, { timeout: 5000 });
  });
  await check('panneau des sources et de la liste', async () => {
    await page.mouse.move(600, 400);
    await page.click('button[aria-label="Liste des chaînes"]');
    await page.waitForSelector('.zap-list button[aria-current="true"]', { timeout: 3000 });
    await shot(page, 'desktop-player-list');
    await page.keyboard.press('Escape');
  });
  await check('Échap revient à l’accueil sans recharger', async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.player'), null, { timeout: 5000 });
    assert(await page.$('.hero-title'), 'accueil absent');
  });
  await check('chaîne dont toutes les sources sont mortes : message puis masquée', async () => {
    await page.evaluate(() => (location.hash = '#/regarder/Morte.fr'));
    await page.waitForSelector('.player-card[role="alert"]', { timeout: 30000 });
    const txt = await page.textContent('.player-card h2');
    assert(/ne répond pas/.test(txt), txt);
    await shot(page, 'desktop-player-error');
    await page.click('button[aria-label="Retour"]');
    await page.waitForFunction(() => !document.querySelector('.player'), null, { timeout: 5000 });
    const names = await page.$$eval('.tile-name', (t) => t.map((x) => x.textContent));
    assert(!names.includes('Chaîne Morte'), 'la chaîne morte est encore affichée');
  });
  await check('chaîne sans CORS : lue nativement si le navigateur sait lire le HLS, sinon masquée', async () => {
    const native = await page.evaluate(() => !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
    const names = await page.$$eval('.tile-name', (t) => t.map((x) => x.textContent));
    if (!native) {
      assert(!names.includes('Sans CORS'), 'Sans CORS visible alors que le navigateur ne peut pas la lire');
      return;
    }
    assert(names.includes('Sans CORS'), 'Sans CORS masquée alors que le HLS natif est disponible');
    await page.evaluate(() => (location.hash = '#/regarder/NoCors.fr'));
    await page.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1, null, { timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.player'), null, { timeout: 5000 });
  });
  await check('recherche « ciné »', async () => {
    await page.evaluate(() => (location.hash = '#/recherche?q=cin%C3%A9'));
    await page.waitForSelector('.search-section .tile', { timeout: 5000 });
    const names = await page.$$eval('.search-section .tile-name', (t) => t.map((x) => x.textContent));
    assert(names.includes('Test Ciné') && names.includes('Cinéma Classique'), names.join(', '));
    await shot(page, 'desktop-search');
  });
  await check('Ma liste : ajout depuis le bandeau, conservé après rechargement', async () => {
    await page.evaluate(() => (location.hash = '#/'));
    await page.waitForSelector('.hero-title');
    const title = await page.textContent('.hero-title');
    await page.click('.hero-actions .btn-ghost');
    await page.reload();
    await page.evaluate(() => (location.hash = '#/ma-liste'));
    await page.waitForSelector('.grid .tile', { timeout: 5000 });
    const names = await page.$$eval('.grid .tile-name', (t) => t.map((x) => x.textContent));
    assert(names.includes(title), `${title} absent de ${names}`);
  });
  await check('page Chaînes filtrée sur Info', async () => {
    await page.evaluate(() => (location.hash = '#/chaines?pays=all&cat=news'));
    await page.waitForSelector('.grid .tile');
    const names = await page.$$eval('.grid .tile-name', (t) => t.map((x) => x.textContent));
    assert(names.includes('franceinfo') && names.includes('Global News') && !names.includes('Arte'), names.join(', '));
    await shot(page, 'desktop-channels');
  });
  await check('Nouveautés (TMDB simulé) : affiches et fiche « où regarder »', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('zp.settings') || '{}');
      localStorage.setItem('zp.settings', JSON.stringify({ ...s, tmdbKey: 'cle-de-test' }));
    });
    await page.reload();
    await page.evaluate(() => (location.hash = '#/nouveautes'));
    await page.waitForSelector('.poster img', { timeout: 8000 });
    await shot(page, 'desktop-news');
    await page.click('.poster');
    await page.waitForSelector('.prov-group', { timeout: 8000 });
    const groups = await page.$$eval('.prov-group h4', (h) => h.map((x) => x.textContent));
    assert(groups.includes('Gratuit') && groups.includes('Avec abonnement') && groups.includes('Location'), groups.join(', '));
    assert(await page.$('.media-trailer'), 'bouton bande-annonce absent');
    await page.waitForTimeout(500);
    await shot(page, 'desktop-media-sheet');
    await page.keyboard.press('Escape');
  });
  await check('réglages : état des chaînes', async () => {
    await page.evaluate(() => (location.hash = '#/reglages'));
    await page.waitForSelector('.big-stat');
    await shot(page, 'desktop-settings');
  });
  await check('PWA : manifeste + service worker actif', async () => {
    const manifest = await page.$eval('link[rel="manifest"]', (l) => l.getAttribute('href'));
    assert(manifest, 'pas de manifeste');
    const ok = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))]));
    assert(ok, 'service worker non actif');
  });
  await check('aucune erreur JavaScript', async () => {
    assert(!consoleErrors.length, consoleErrors.join(' | '));
  });

  // =================== Téléphone ===================
  console.log('\nTéléphone (390×844, tactile, vérification en arrière-plan active)');
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  await mockExternal(phone);
  const m = await phone.newPage();
  const mErrors = [];
  m.on('pageerror', (e) => mErrors.push(e.message));
  await m.goto(APP);
  await m.waitForSelector('.hero-title', { timeout: 15000 });
  await check('vérification en arrière-plan : chaîne morte masquée sans l’ouvrir', async () => {
    // Seules les rangées affichées sont vérifiées : on fait défiler la page.
    for (let y = 0; y < 6000; y += 500) {
      await m.evaluate((yy) => window.scrollTo(0, yy), y);
      await m.waitForTimeout(150);
    }
    await m.waitForFunction(
      () => {
        const dead = Object.keys(JSON.parse(localStorage.getItem('zp.dead') || '{}'));
        const names = [...document.querySelectorAll('.tile-name')].map((x) => x.textContent);
        return dead.length >= 2 && !names.includes('Chaîne Morte');
      },
      null,
      { timeout: 20000 },
    );
  });
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.waitForTimeout(300);
  await shot(m, 'mobile-home');
  await m.evaluate(() => window.scrollTo(0, 900));
  await m.waitForTimeout(300);
  await shot(m, 'mobile-home-rows');
  await check('mobile : lecture d’une chaîne', async () => {
    await m.evaluate(() => (location.hash = '#/regarder/TestCine.fr'));
    await m.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1, null, { timeout: 20000 });
    await m.tap('.player-video');
    await m.waitForTimeout(300);
    if (!(await m.$('.player.ui-on'))) await m.tap('.player-video');
    await m.waitForTimeout(300);
    await shot(m, 'mobile-player');
  });
  await check('mobile : feuille de partage avec QR code', async () => {
    await m.click('button[aria-label="Partager"]');
    await m.waitForSelector('.qr svg', { timeout: 3000 });
    await m.waitForTimeout(500);
    await shot(m, 'mobile-share');
    await m.keyboard.press('Escape');
  });
  await check('mobile : page Chaînes', async () => {
    await m.evaluate(() => (location.hash = '#/chaines'));
    await m.waitForSelector('.grid .tile');
    await shot(m, 'mobile-channels');
  });
  await check('mobile : Films', async () => {
    await m.evaluate(() => (location.hash = '#/films'));
    await m.waitForSelector('.hero-title');
    await shot(m, 'mobile-films');
  });
  await check('mobile : aucune erreur JavaScript', async () => {
    assert(!mErrors.length, mErrors.join(' | '));
  });

  // =================== Zapette privée ===================
  console.log('\nZapette privée (mot de passe)');
  const PRIV = path.join(OUT, 'site-prive');
  await cp(SITE, PRIV, { recursive: true });
  const salt = saltFor('e2e/zapette');
  await writeFile(path.join(PRIV, 'data/channels.enc'), await encryptCatalog(JSON.stringify(catalog), 'tartiflette', salt));
  await writeFile(
    path.join(PRIV, 'data/manifest.json'),
    JSON.stringify({ v: 1, locked: true, file: 'channels.enc', kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: salt.toString('base64') } }),
  );
  await rm(path.join(PRIV, 'data/channels.json'), { force: true });
  const privSrv = staticServer(PRIV);
  const privPort = await listen(privSrv);
  const PRIV_APP = `http://localhost:${privPort}/`;
  const priv = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mockExternal(priv);
  const pp = await priv.newPage();
  const pErrors = [];
  pp.on('pageerror', (e) => pErrors.push(e.message));
  await pp.goto(PRIV_APP);
  await check('privée : écran de mot de passe, aucune chaîne lisible sans lui', async () => {
    await pp.waitForSelector('.lock-card h1', { timeout: 15000 });
    assert(!(await pp.$('.tile')), 'des chaînes sont visibles');
    const plain = await pp.evaluate(async () => (await fetch('./data/channels.json')).status);
    assert(plain === 404, `channels.json accessible (${plain})`);
    await pp.waitForTimeout(300);
    await shot(pp, 'mobile-lock');
  });
  await check('privée : mauvais mot de passe refusé', async () => {
    await pp.fill('.lock-card input', 'raclette');
    await pp.click('.lock-card button[type="submit"]');
    await pp.waitForSelector('.lock-error', { timeout: 10000 });
    assert(/incorrect/.test(await pp.textContent('.lock-error')), 'message absent');
  });
  await check('privée : bon mot de passe → l’app s’ouvre', async () => {
    await pp.fill('.lock-card input', 'tartiflette');
    await pp.click('.lock-card button[type="submit"]');
    await pp.waitForSelector('.hero-title', { timeout: 15000 });
  });
  await check('privée : mot de passe mémorisé après rechargement', async () => {
    await pp.reload();
    await pp.waitForSelector('.hero-title', { timeout: 15000 });
    const stored = await pp.evaluate(() => localStorage.getItem('zp.vault') || '');
    assert(!stored.includes('tartiflette'), 'le mot de passe est stocké en clair');
  });
  await check('privée : lecture d’une chaîne', async () => {
    await pp.evaluate(() => (location.hash = '#/regarder/TestCine.fr'));
    await pp.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1, null, { timeout: 20000 });
    await pp.evaluate(() => history.back());
  });
  await check('privée : playlists TV dans un dossier secret', async () => {
    await pp.evaluate(() => (location.hash = '#/reglages'));
    await pp.waitForSelector('.copy-item small');
    const links = await pp.$$eval('.copy-item small', (s) => s.map((x) => x.textContent));
    assert(links.every((l) => /\/playlists\/[0-9a-f]{24}\/zapette/.test(l)), links.join(' | '));
  });
  await check('privée : « Verrouiller cet appareil » redemande le mot de passe', async () => {
    await pp.click('text=Verrouiller cet appareil');
    await pp.waitForSelector('.lock-card h1', { timeout: 5000 });
    await pp.reload();
    await pp.waitForSelector('.lock-card h1', { timeout: 15000 });
  });
  await check('privée : aucune erreur JavaScript', async () => {
    assert(!pErrors.length, pErrors.join(' | '));
  });
  privSrv.close();

  await browser.close();
  siteSrv.close();
  streamSrv.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies. Captures : ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
