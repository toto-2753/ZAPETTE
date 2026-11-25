import { describe, expect, it } from 'vitest';
import { buildLive, isWatchable, orderStreams, playMode, searchChannels, type Env } from './scoring';
import type { Catalog, Channel } from './types';

const chrome: Env = { preferNative: false, nativeHls: false, mse: true, pageHttp: false, proxy: false, checked: true };
const safari: Env = { ...chrome, preferNative: true, nativeHls: true };

describe('playMode', () => {
  it('hls.js seulement si CORS, sinon VLC sur un Chrome sans HLS natif', () => {
    expect(playMode({ u: 'https://a', h: 1, x: 1 }, chrome)).toBe('hls');
    expect(playMode({ u: 'https://a', h: 1 }, chrome)).toBe('external');
  });
  it('Safari lit tout en natif, sauf le http sur une page https', () => {
    expect(playMode({ u: 'https://a', h: 1 }, safari)).toBe('native');
    expect(playMode({ u: 'http://a' }, safari)).toBe('external');
  });
  it('HLS natif (Chrome récent, Android) : pas besoin de CORS', () => {
    expect(playMode({ u: 'https://a', h: 1 }, { ...chrome, nativeHls: true })).toBe('native');
  });
  it('le proxy rend lisibles http et sans-CORS', () => {
    expect(playMode({ u: 'http://a' }, { ...chrome, proxy: true })).toBe('proxy');
    expect(playMode({ u: 'https://a', h: 1 }, { ...chrome, proxy: true })).toBe('proxy');
  });
  it('catalogue non vérifié : on tente hls.js', () => {
    expect(playMode({ u: 'https://a', h: 1 }, { ...chrome, checked: false })).toBe('hls');
  });
});

const ch = (over: Partial<Channel>): Channel => ({ id: 'X.fr', n: 'X', g: ['general'], c: 'FR', s: [], ...over });

describe('orderStreams', () => {
  it('jouables d’abord, puis bonne langue, mortes à la fin', () => {
    const c = ch({
      lg: ['fra', 'eng'],
      s: [
        { u: 'https://dead', h: 1, x: 1, lg: ['fra'] },
        { u: 'https://en', h: 1, x: 1, lg: ['eng'] },
        { u: 'https://ext', h: 1, lg: ['fra'] },
        { u: 'https://fr-restricted', h: 1, x: 1, r: 1, lg: ['fra'] },
      ],
    });
    const order = orderStreams(c, chrome, 'fra', { 'https://dead': Date.now() }).map((s) => s.u);
    expect(order).toEqual(['https://fr-restricted', 'https://en', 'https://ext', 'https://dead']);
  });
});

describe('buildLive', () => {
  const catalog: Catalog = {
    v: 1,
    generatedAt: '2026-11-25T10:00:00Z',
    checked: true,
    stats: { tested: 0, alive: 0, restricted: 0, dead: 0, cors: 0, channels: 0, streams: 0, seconds: 0 },
    channels: [
      ch({ id: 'arte.fr', n: 'Arte', l: 'x', s: [{ u: 'https://arte', h: 1, x: 1 }] }),
      ch({ id: 'France2.fr', n: 'France 2', l: 'x', s: [{ u: 'https://f2', h: 1, x: 1 }] }),
      ch({ id: 'Local.fr', n: 'Télé Locale', s: [{ u: 'https://loc', h: 1, x: 1 }] }),
      ch({ id: 'News.us', n: 'News USA', c: 'US', g: ['news'], lg: ['eng'], s: [{ u: 'https://us', h: 1 }] }),
    ],
  };
  it('numérote la TNT puis le reste à partir de 30', () => {
    const live = buildLive(catalog, chrome, 'FR', 'fra', {});
    expect(live.map((c) => [c.id, c.num])).toEqual([
      ['France2.fr', 2],
      ['arte.fr', 7],
      ['Local.fr', 30],
      ['News.us', 31],
    ]);
  });
  it('pays autre que la France : numérotation par pertinence', () => {
    const live = buildLive(catalog, chrome, 'US', 'eng', {});
    expect(live[0].id).toBe('News.us');
    expect(live[0].num).toBe(1);
  });
  it('masque les chaînes illisibles ici ou mortes', () => {
    const live = buildLive(catalog, chrome, 'FR', 'fra', { 'https://loc': Date.now() });
    const visible = live.filter((c) => isWatchable(c, { 'https://loc': Date.now() }, false)).map((c) => c.id);
    expect(visible).toEqual(['France2.fr', 'arte.fr']);
  });
  it('recherche sans accents, par numéro ou par catégorie', () => {
    const live = buildLive(catalog, chrome, 'FR', 'fra', {});
    expect(searchChannels(live, 'tele locale')[0].id).toBe('Local.fr');
    expect(searchChannels(live, '7')[0].id).toBe('arte.fr');
    expect(searchChannels(live, 'info').map((c) => c.id)).toEqual(['News.us']);
  });
});
