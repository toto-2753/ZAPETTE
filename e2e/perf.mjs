#!/usr/bin/env node
// Mesure le temps d'affichage avec le catalogue complet (public/data/channels.json).
// Usage : npm run build && node e2e/perf.mjs [--chrome /usr/bin/google-chrome]
import http from 'node:http';
import { cp, mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({ options: { chrome: { type: 'string', default: process.env.CHROME_PATH || '/usr/bin/google-chrome' } } });
const site = await mkdtemp(path.join(os.tmpdir(), 'zapette-perf-'));
await cp(path.join(root, 'dist'), site, { recursive: true });
await cp(path.join(root, 'public/data'), path.join(site, 'data'), { recursive: true });

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const f = path.join(site, p);
    await stat(f);
    res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://localhost:${srv.address().port}/`;
const out = path.join(root, 'e2e/.out');
const b = await chromium.launch({ executablePath: args.chrome, args: ['--no-sandbox'] });
for (const [name, vp, mobile] of [
  ['bureau', { width: 1440, height: 900 }, false],
  ['mobile (CPU ÷4)', { width: 390, height: 844 }, true],
]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p = await ctx.newPage();
  if (mobile) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await p.addInitScript(() => localStorage.setItem('zp.settings', JSON.stringify({ probe: false, heroPreview: false })));
  const t0 = Date.now();
  await p.goto(url);
  await p.waitForSelector('.hero-title', { timeout: 60000 });
  const info = await p.evaluate(() => ({
    rangées: document.querySelectorAll('.row').length,
    tuiles: document.querySelectorAll('.tile').length,
    bandeau: document.querySelector('.hero-title').textContent,
  }));
  console.log(`${name} : accueil en ${Date.now() - t0} ms`, JSON.stringify(info));
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, `real-${mobile ? 'mobile' : 'desktop'}.png`) });
  let t = Date.now();
  await p.evaluate(() => (location.hash = '#/chaines?pays=all'));
  await p.waitForSelector('.grid .tile');
  console.log(`${name} : page Chaînes (tous pays) en ${Date.now() - t} ms`);
  t = Date.now();
  await p.evaluate(() => (location.hash = '#/recherche?q=france'));
  await p.waitForSelector('.search-section .tile');
  console.log(`${name} : recherche en ${Date.now() - t} ms`);
  await ctx.close();
}
await b.close();
srv.close();
