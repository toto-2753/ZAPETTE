// Chromecast via le SDK Google Cast (Chrome / Edge, sur ordinateur et Android).
import { isChromium } from '../lib/platform';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __onGCastApiAvailable?: (ok: boolean) => void;
    cast?: any;
    chrome?: any;
  }
}

export type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

let ready: Promise<boolean> | null = null;

export function loadCast(): Promise<boolean> {
  if (ready) return ready;
  if (!isChromium || !window.isSecureContext) return (ready = Promise.resolve(false));
  ready = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 10_000);
    window.__onGCastApiAvailable = (ok) => {
      clearTimeout(timer);
      if (!ok || !window.cast?.framework) return resolve(false);
      try {
        window.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return ready;
}

const mapState = (s: string): CastState =>
  s === 'NO_DEVICES_AVAILABLE' ? 'unavailable' : s === 'NOT_CONNECTED' ? 'available' : s === 'CONNECTING' ? 'connecting' : 'connected';

export function watchCastState(cb: (s: CastState) => void): () => void {
  const fw = window.cast?.framework;
  if (!fw) return () => {};
  const ctx = fw.CastContext.getInstance();
  const handler = (e: any) => cb(mapState(e.castState));
  ctx.addEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, handler);
  cb(mapState(ctx.getCastState()));
  return () => ctx.removeEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, handler);
}

export interface CastMedia {
  url: string;
  title: string;
  subtitle?: string;
  image?: string;
}

/** Ouvre le choix de l'appareil si besoin, puis lance le flux sur la télé. Retourne le nom de l'appareil. */
export async function castMedia(m: CastMedia): Promise<string> {
  const ctx = window.cast.framework.CastContext.getInstance();
  if (!ctx.getCurrentSession()) {
    const err = await ctx.requestSession();
    if (err) throw new Error(String(err));
  }
  const session = ctx.getCurrentSession();
  if (!session) throw new Error('cancel');
  const media = window.chrome.cast.media;
  const info = new media.MediaInfo(m.url, 'application/x-mpegurl');
  info.streamType = media.StreamType.LIVE;
  const md = new media.GenericMediaMetadata();
  md.title = m.title;
  if (m.subtitle) md.subtitle = m.subtitle;
  if (m.image) md.images = [new window.chrome.cast.Image(m.image)];
  info.metadata = md;
  const req = new media.LoadRequest(info);
  req.autoplay = true;
  await session.loadMedia(req);
  return session.getCastDevice?.()?.friendlyName || 'la télé';
}

export function stopCasting() {
  try {
    window.cast?.framework.CastContext.getInstance().endCurrentSession(true);
  } catch {
    /* rien */
  }
}

export function castDeviceName(): string | null {
  try {
    return window.cast?.framework.CastContext.getInstance().getCurrentSession()?.getCastDevice()?.friendlyName ?? null;
  } catch {
    return null;
  }
}
