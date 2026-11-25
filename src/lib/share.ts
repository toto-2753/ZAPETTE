import type { LiveChannel, Stream } from '../data/types';
import { categoryLabel } from '../data/labels';
import { absoluteWatchUrl } from '../router';
import { isAndroid, isIOS } from './platform';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs sans API presse-papiers.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Partage natif (téléphone, tablette, Mac). Retourne false si indisponible. */
export async function nativeShare(data: { title: string; text?: string; url: string }): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export const channelShareData = (ch: LiveChannel) => ({
  title: `${ch.n} sur Zapette`,
  text: `Regarde ${ch.n} en direct`,
  url: absoluteWatchUrl(ch.id),
});

const esc = (v: string | undefined) => String(v ?? '').replace(/"/g, "'").replace(/[\r\n]/g, ' ');

export function toM3U(channels: { ch: LiveChannel; stream?: Stream }[]) {
  const lines = ['#EXTM3U'];
  for (const { ch, stream } of channels) {
    const s = stream ?? ch.s[0];
    if (!s) continue;
    const attrs = [
      ch.id.startsWith('x-') ? '' : `tvg-id="${esc(ch.id)}"`,
      `tvg-chno="${ch.num}"`,
      ch.l ? `tvg-logo="${esc(ch.l)}"` : '',
      `group-title="${esc(categoryLabel(ch.g[0] ?? '') || 'Autres')}"`,
    ].filter(Boolean);
    lines.push(`#EXTINF:-1 ${attrs.join(' ')},${esc(ch.n)}`, s.u);
  }
  return lines.join('\n') + '\n';
}

export function downloadText(filename: string, text: string, type = 'audio/x-mpegurl') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'chaine';

/**
 * Ouvre le flux dans VLC. iOS et Android : lien direct vers l'app.
 * Ordinateur : télécharge une mini-playlist .m3u qui s'ouvre dans VLC.
 */
export function openInVlc(ch: LiveChannel, stream: Stream) {
  if (isIOS) {
    location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(stream.u)}`;
    return 'app';
  }
  if (isAndroid) {
    const u = new URL(stream.u);
    location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=org.videolan.vlc;type=video/*;S.title=${encodeURIComponent(ch.n)};end`;
    return 'app';
  }
  downloadText(`${safeName(ch.n)}.m3u`, toM3U([{ ch, stream }]));
  return 'file';
}
