import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import worker, { rewritePlaylist } from './worker.js';

let server;
let base;
let lastRange = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastRange = req.headers.range ?? null;
    if (req.url === '/live/master.m3u8') {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      return res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n');
    }
    if (req.url === '/live/low/index.m3u8') {
      res.writeHead(200, { 'content-type': 'application/x-mpegURL' });
      return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg1.ts\n');
    }
    if (req.url === '/live/low/seg1.ts') {
      res.writeHead(lastRange ? 206 : 200, { 'content-type': 'video/mp2t', 'content-length': '4' });
      return res.end('TSTS');
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

const call = (path, env = { TOKEN: 'secret' }, init) => worker.fetch(new Request(`https://proxy.example${path}`, init), env);

describe('proxy Cloudflare', () => {
  it('refuse sans le bon jeton, répond à /health avec', async () => {
    expect((await call('/health')).status).toBe(403);
    expect((await call('/health?t=secret')).status).toBe(200);
  });

  it('réécrit le manifeste maître et ajoute CORS', async () => {
    const r = await call(`/?t=secret&url=${encodeURIComponent(base + '/live/master.m3u8')}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const body = await r.text();
    const line = body.split('\n').find((l) => l.startsWith('https://proxy.example/'));
    const u = new URL(line);
    expect(u.searchParams.get('url')).toBe(`${base}/live/low/index.m3u8`);
    expect(u.searchParams.get('t')).toBe('secret');
  });

  it('réécrit segments, clés et init', async () => {
    const r = await call(`/?t=secret&url=${encodeURIComponent(base + '/live/low/index.m3u8')}`);
    const body = await r.text();
    expect(body).toContain(`URI="https://proxy.example/?url=${encodeURIComponent(base + '/live/key.bin')}&t=secret"`);
    expect(body).toContain(encodeURIComponent(base + '/live/low/init.mp4'));
    expect(body).toContain(encodeURIComponent(base + '/live/low/seg1.ts'));
  });

  it('transmet les segments et l’en-tête Range', async () => {
    const r = await call(`/?t=secret&url=${encodeURIComponent(base + '/live/low/seg1.ts')}`, undefined, { headers: { Range: 'bytes=0-3' } });
    expect(r.status).toBe(206);
    expect(lastRange).toBe('bytes=0-3');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.text()).toBe('TSTS');
  });

  it('valide le paramètre url', async () => {
    expect((await call('/?t=secret&url=ftp://x')).status).toBe(400);
  });

  it('laisse intactes les URI non http (clés DRM, data:)', () => {
    const out = rewritePlaylist('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://abc"\n', 'https://a/b.m3u8', (u) => 'P' + u);
    expect(out).toContain('URI="skd://abc"');
  });
});
